import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const rootDir = process.cwd();

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Codex plugin package", () => {
  test("declares plugin manifest, MCP server, and skills directory", () => {
    const manifest = readJson(join(rootDir, "plugins/codex/.codex-plugin/plugin.json"));

    expect(manifest.name).toBe("mengshu-memory");
    expect(manifest.skills).toBe("./skills");
    expect(manifest.mcpServers).toBe("./.mcp.json");
  });

  test("uses the shared mengshu MCP server name", () => {
    const mcp = readJson(join(rootDir, "plugins/codex/.mcp.json"));
    const servers = mcp.mcpServers as Record<string, { command: string; args: string[] }>;

    expect(servers.mengshu.command).toBe("node");
    expect(servers.mengshu.args).toEqual(["./mcp/server.mjs"]);
  });

  test("is exposed by the repository-local Codex marketplace", () => {
    const marketplace = readJson(join(rootDir, ".agents/plugins/marketplace.json"));
    const plugins = marketplace.plugins as Array<{
      name: string;
      source: { source: string; path: string };
      policy: { installation: string; authentication: string };
      category: string;
    }>;
    const entry = plugins.find((plugin) => plugin.name === "mengshu-memory");

    expect(marketplace.name).toBe("mengshu-local");
    expect(entry).toBeDefined();
    expect(entry?.source).toEqual({ source: "local", path: "./plugins/codex" });
    expect(entry?.policy).toEqual({ installation: "AVAILABLE", authentication: "ON_INSTALL" });
    expect(entry?.category).toBe("Developer Tools");
  });
});
