/**
 * manifest.ts 单元测试。
 *
 * 覆盖 A2-lite 验收核心：
 * 1. createManifest 幂等（同一目录两次创建得到相同 workspaceId/projectId）。
 * 2. readManifest 不存在返回 null、解析失败抛带路径错误。
 * 3. writeManifest + readManifest 往返一致。
 * 4. manifestToScope 映射正确（appId/tenantId 固定，visibility/workspace/project 来自 manifest）。
 * 5. 目录移动 identity 不变（manifest 内记录的 id 随指针文件保留，readManifest 不重算）。
 *
 * 使用 os.tmpdir 下的临时目录，测试后清理，保持纯单元风格。
 */

import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MANIFEST_FILENAME,
  createManifest,
  readManifest,
  writeManifest,
  manifestToScope,
} from "./manifest.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "memory-autodb-manifest-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("createManifest", () => {
  test("同一目录两次创建得到相同 workspaceId/projectId（幂等）", () => {
    const first = createManifest({ dir: workDir });
    const second = createManifest({ dir: workDir });

    expect(first.workspaceId).toBe(second.workspaceId);
    expect(first.projectId).toBe(second.projectId);
    expect(first.projectId).toMatch(/^proj-/);
    expect(first.workspaceId).toMatch(/^ws-/);
  });

  test("不同目录得到不同 projectId", () => {
    const other = mkdtempSync(join(tmpdir(), "memory-autodb-other-"));
    try {
      expect(createManifest({ dir: workDir }).projectId).not.toBe(
        createManifest({ dir: other }).projectId,
      );
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  test("显式传入覆盖自动生成的 id 与可见性", () => {
    const manifest = createManifest({
      dir: workDir,
      workspaceId: "ws-acme",
      projectId: "proj-acme",
      userId: "user-1",
      defaultVisibility: "private",
    });

    expect(manifest.workspaceId).toBe("ws-acme");
    expect(manifest.projectId).toBe("proj-acme");
    expect(manifest.userId).toBe("user-1");
    expect(manifest.defaultVisibility).toBe("private");
  });

  test("默认 visibility 为 workspace 且带默认复用策略与空 sourceRoots", () => {
    const manifest = createManifest({ dir: workDir });
    expect(manifest.defaultVisibility).toBe("workspace");
    expect(manifest.sourceRoots).toEqual([]);
    expect(manifest.slotReusePolicy?.profile).toBe("workspace");
    expect(manifest.slotReusePolicy?.task_context).toBe("project");
    expect(typeof manifest.createdAt).toBe("number");
    expect(manifest.version).toBe("0.1");
  });
});

describe("readManifest", () => {
  test("文件不存在返回 null", () => {
    expect(readManifest(workDir)).toBeNull();
  });

  test("JSON 解析失败抛出带文件路径的错误", () => {
    writeFileSync(join(workDir, MANIFEST_FILENAME), "{ not json", "utf8");
    expect(() => readManifest(workDir)).toThrow(MANIFEST_FILENAME);
  });
});

describe("writeManifest + readManifest 往返", () => {
  test("写入后可读回相同内容", () => {
    const manifest = createManifest({ dir: workDir, userId: "user-1" });
    writeManifest(workDir, manifest);

    expect(existsSync(join(workDir, MANIFEST_FILENAME))).toBe(true);
    const loaded = readManifest(workDir);
    expect(loaded).toEqual(manifest);
  });
});

describe("manifestToScope", () => {
  test("映射 appId=openclaw、tenantId=local，workspace/project/userId/visibility 来自 manifest", () => {
    const manifest = createManifest({
      dir: workDir,
      workspaceId: "ws-acme",
      projectId: "proj-acme",
      userId: "user-1",
      defaultVisibility: "workspace",
    });
    const scope = manifestToScope(manifest);

    expect(scope.appId).toBe("openclaw");
    expect(scope.tenantId).toBe("local");
    expect(scope.workspaceId).toBe("ws-acme");
    expect(scope.projectId).toBe("proj-acme");
    expect(scope.userId).toBe("user-1");
    expect(scope.namespace).toBe("memories");
    expect(scope.visibility).toBe("workspace");
  });

  test("overrides 覆盖 manifest 推导的 scope 字段", () => {
    const manifest = createManifest({ dir: workDir, projectId: "proj-acme" });
    const scope = manifestToScope(manifest, { agentId: "agent-x", namespace: "knowledge" });
    expect(scope.agentId).toBe("agent-x");
    expect(scope.namespace).toBe("knowledge");
    expect(scope.projectId).toBe("proj-acme");
  });
});

describe("目录移动 identity 不变", () => {
  test("manifest 指针随文件移动后 readManifest 仍返回原 id（不重算）", () => {
    const original = createManifest({ dir: workDir, userId: "user-1" });
    writeManifest(workDir, original);

    // 模拟移动：把 manifest 文件内容原样写到新目录（路径不同）
    const movedDir = mkdtempSync(join(tmpdir(), "memory-autodb-moved-"));
    try {
      writeFileSync(
        join(movedDir, MANIFEST_FILENAME),
        JSON.stringify(original, null, 2),
        "utf8",
      );
      const movedManifest = readManifest(movedDir);
      expect(movedManifest?.projectId).toBe(original.projectId);
      expect(movedManifest?.workspaceId).toBe(original.workspaceId);

      // 新目录直接 createManifest 会因路径不同得到不同 id，证明 identity 靠指针保留
      expect(createManifest({ dir: movedDir }).projectId).not.toBe(original.projectId);
    } finally {
      rmSync(movedDir, { recursive: true, force: true });
    }
  });
});
