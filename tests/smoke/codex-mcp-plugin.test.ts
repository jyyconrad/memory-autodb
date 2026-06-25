import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { afterEach, describe, expect, test } from "vitest";

const rootDir = process.cwd();
const children: ChildProcessWithoutNullStreams[] = [];

function makeMsShim(dir: string): void {
  const shim = join(dir, "ms");
  writeFileSync(
    shim,
    [
      "#!/bin/sh",
      `exec "${join(rootDir, "node_modules/.bin/tsx")}" "${join(rootDir, "bin/ms.ts")}" "$@"`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
}

function readJsonResponse(child: ChildProcessWithoutNullStreams, id: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for MCP response ${id}. stderr: ${stderr}`));
    }, 10_000);

    const onStdout = (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) {
          continue;
        }
        try {
          const message = JSON.parse(line) as { id?: number };
          if (message.id === id) {
            cleanup();
            resolve(message as unknown as Record<string, unknown>);
            return;
          }
        } catch {
          // Wait for a complete JSON line.
        }
      }
    };
    const onStderr = (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`MCP child exited before response ${id} with code ${code}. stderr: ${stderr}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.stdout.off("data", onStdout);
      child.stderr.off("data", onStderr);
      child.off("exit", onExit);
    };

    child.stdout.on("data", onStdout);
    child.stderr.on("data", onStderr);
    child.on("exit", onExit);
  });
}

function send(child: ChildProcessWithoutNullStreams, message: Record<string, unknown>): void {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

afterEach(() => {
  for (const child of children.splice(0)) {
    child.kill("SIGTERM");
  }
});

describe("Codex MCP plugin smoke", () => {
  test("starts through plugins/codex/mcp/server.mjs and lists mengshu tools", async () => {
    const temp = mkdtempSync(join(tmpdir(), "mengshu-codex-mcp-"));
    try {
      const binDir = join(temp, "bin");
      const homeDir = join(temp, "home");
      mkdirSync(binDir, { recursive: true });
      mkdirSync(homeDir, { recursive: true });
      makeMsShim(binDir);
      writeFileSync(
        join(homeDir, "config.json"),
        JSON.stringify({
          embedding: {
            apiKey: "test-key",
            baseURL: "http://127.0.0.1:9/v1",
            model: "text-embedding-3-small",
          },
          dbType: "lancedb",
          dbPath: join(temp, "lancedb"),
        }),
      );

      const child = spawn("node", ["mcp/server.mjs"], {
        cwd: join(rootDir, "plugins/codex"),
        env: {
          ...process.env,
          MENGSHU_HOME: homeDir,
          PATH: `${binDir}${delimiter}${process.env.PATH ?? ""}`,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      children.push(child);

      send(child, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "codex-plugin-smoke", version: "1.0.0" },
        },
      });
      const initialized = await readJsonResponse(child, 1);
      expect(initialized.result).toBeDefined();

      send(child, { jsonrpc: "2.0", method: "notifications/initialized" });
      send(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      const listed = await readJsonResponse(child, 2);
      const result = listed.result as { tools?: Array<{ name: string }> };
      const toolNames = result.tools?.map((tool) => tool.name) ?? [];

      expect(toolNames).toContain("memory_recall");
      expect(toolNames).toContain("memory_save");
      expect(toolNames).toContain("memory_health");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
