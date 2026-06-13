/**
 * cli-project.ts 命令注册单元测试。
 *
 * 用 fake CommanderLike 捕获注册的命令名与 action，验证：
 * 1. 注册 init 与 project（status/context/lookup）命令。
 * 2. init action 能在临时目录创建 .memory-autodb.json，并打印 workspace/project id。
 * 3. init 幂等：已存在且无 --force 时不覆盖，保留原 id；--force 时覆盖。
 * 4. project status 读 manifest 打印 identity / scope / 复用策略；无 manifest 时提示 init。
 * 5. project lookup 基于 manifest scope 调 service.recall 并打印命中。
 * 6. project context 在 recall 失败（embedding 不可用）时降级提示而非 crash。
 *
 * 使用 os.tmpdir 临时目录，测试后清理。
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerProjectCliCommands } from "./cli-project.js";
import { MANIFEST_FILENAME, readManifest } from "./manifest.js";

/** 鸭子类型 fake：支持 command 字符串含位置参数（init [dir] / lookup <query>）。 */
class FakeCommand {
  subcommands: FakeCommand[] = [];
  options: Array<[string, string, unknown?]> = [];
  actionHandler?: (...args: unknown[]) => unknown;

  constructor(public readonly name: string) {}

  command(name: string) {
    const child = new FakeCommand(name);
    this.subcommands.push(child);
    return child;
  }

  description() {
    return this;
  }

  option(flag: string, description: string, defaultValue?: unknown) {
    this.options.push([flag, description, defaultValue]);
    return this;
  }

  action(handler: (...args: unknown[]) => unknown) {
    this.actionHandler = handler;
    return this;
  }

  /** 测试辅助：按命令名前缀（忽略位置参数）查找子命令。 */
  find(name: string): FakeCommand | undefined {
    return this.subcommands.find((c) => c.name === name || c.name.startsWith(`${name} `));
  }
}

let workDir: string;
let logs: string[];
let originalLog: typeof console.log;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "memory-autodb-cli-"));
  logs = [];
  originalLog = console.log;
  console.log = (message?: unknown) => {
    logs.push(String(message));
  };
});

afterEach(() => {
  console.log = originalLog;
  rmSync(workDir, { recursive: true, force: true });
});

describe("registerProjectCliCommands 注册", () => {
  test("注册 init 与 project 子命令族", () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {});

    expect(ltm.find("init")).toBeDefined();
    const project = ltm.find("project");
    expect(project).toBeDefined();
    expect(project?.subcommands.map((c) => c.name.split(" ")[0])).toEqual([
      "status",
      "context",
      "lookup",
    ]);
  });
});

describe("ltm init", () => {
  test("创建 manifest 文件并打印 workspace/project id", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {});

    await ltm.find("init")?.actionHandler?.(workDir, { userId: "user-1" });

    expect(existsSync(join(workDir, MANIFEST_FILENAME))).toBe(true);
    const manifest = readManifest(workDir);
    expect(manifest?.userId).toBe("user-1");
    expect(logs.join("\n")).toContain(manifest!.workspaceId);
    expect(logs.join("\n")).toContain(manifest!.projectId);
  });

  test("已存在且无 --force 时不覆盖，保留原 id", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {});

    await ltm.find("init")?.actionHandler?.(workDir, { projectId: "proj-keep" });
    const before = readManifest(workDir);
    logs.length = 0;

    await ltm.find("init")?.actionHandler?.(workDir, { projectId: "proj-other" });
    const after = readManifest(workDir);

    expect(after?.projectId).toBe("proj-keep");
    expect(after?.createdAt).toBe(before?.createdAt);
    expect(logs.join("\n")).toMatch(/已存在|--force/);
  });

  test("--force 覆盖既有 manifest", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {});

    await ltm.find("init")?.actionHandler?.(workDir, { projectId: "proj-keep" });
    await ltm.find("init")?.actionHandler?.(workDir, { projectId: "proj-new", force: true });

    expect(readManifest(workDir)?.projectId).toBe("proj-new");
  });

  test("显式 --visibility 写入 manifest", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {});

    await ltm.find("init")?.actionHandler?.(workDir, { visibility: "private" });
    expect(readManifest(workDir)?.defaultVisibility).toBe("private");
  });
});

describe("ltm project status", () => {
  test("读 manifest 打印 identity / scope / 复用策略", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {
      getRecordCount: async () => 7,
    });

    await ltm.find("init")?.actionHandler?.(workDir, { workspaceId: "ws-acme", projectId: "proj-acme" });
    logs.length = 0;

    await ltm.find("project")?.find("status")?.actionHandler?.(workDir, {});

    const text = logs.join("\n");
    expect(text).toContain("ws-acme");
    expect(text).toContain("proj-acme");
    expect(text).toContain("profile");
    expect(text).toContain("7");
  });

  test("无 manifest 时提示先运行 init", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {});

    await ltm.find("project")?.find("status")?.actionHandler?.(workDir, {});
    expect(logs.join("\n")).toMatch(/init/);
  });
});

describe("ltm project lookup", () => {
  test("基于 manifest scope 调 service.recall 并打印命中", async () => {
    const ltm = new FakeCommand("ltm");
    const recall = vi.fn(async (_input: { query: string; scope: { projectId: string } }) => ({
      scope: {} as never,
      query: "q",
      hits: [
        {
          record: { id: "m1", text: "记住要先给结论", category: "preference" },
          score: 0.91,
          source: "vector" as const,
        },
      ],
    }));
    registerProjectCliCommands(ltm as never, {
      service: { recall } as never,
    });

    await ltm.find("init")?.actionHandler?.(workDir, { projectId: "proj-acme" });
    logs.length = 0;

    await ltm.find("project")?.find("lookup")?.actionHandler?.("结论", { dir: workDir });

    expect(recall).toHaveBeenCalledTimes(1);
    const callArg = recall.mock.calls[0][0];
    expect(callArg.query).toBe("结论");
    expect(callArg.scope.projectId).toBe("proj-acme");
    expect(logs.join("\n")).toContain("记住要先给结论");
  });

  test("无 manifest 时提示先运行 init", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, { service: { recall: vi.fn() } as never });

    await ltm.find("project")?.find("lookup")?.actionHandler?.("q", { dir: workDir });
    expect(logs.join("\n")).toMatch(/init/);
  });
});

describe("ltm project context", () => {
  test("recall 失败（embedding 不可用）时降级提示而非抛错", async () => {
    const ltm = new FakeCommand("ltm");
    const recall = vi.fn(async () => {
      throw new Error("embedding api key missing");
    });
    registerProjectCliCommands(ltm as never, {
      service: { recall } as never,
    });

    await ltm.find("init")?.actionHandler?.(workDir, { projectId: "proj-acme" });
    logs.length = 0;

    await expect(
      ltm.find("project")?.find("context")?.actionHandler?.(workDir, {}),
    ).resolves.not.toThrow();
    expect(logs.join("\n")).toMatch(/降级|embedding|无法/);
  });

  test("无 service 时打印 scope 但提示无法构建上下文", async () => {
    const ltm = new FakeCommand("ltm");
    registerProjectCliCommands(ltm as never, {});

    await ltm.find("init")?.actionHandler?.(workDir, { projectId: "proj-acme" });
    logs.length = 0;

    await ltm.find("project")?.find("context")?.actionHandler?.(workDir, {});
    expect(logs.join("\n")).toContain("proj-acme");
  });
});
