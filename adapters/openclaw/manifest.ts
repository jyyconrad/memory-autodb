/**
 * Project Memory Workspace manifest（.memory-autodb.json）的 schema 与读写。
 *
 * 本文件做什么：把"当前目录"解析成稳定的 workspaceId/projectId，并以轻量 JSON 指针
 * 文件落地，支撑 `ltm init` / `ltm project` 子命令的 project scope identity。
 *
 * 核心流程：
 * 1. createManifest：缺省 id 时由目录路径派生稳定 hash（同目录幂等）。
 * 2. read/writeManifest：以 2 空格缩进 JSON 落地，缺失返回 null，损坏抛带路径错误。
 * 3. manifestToScope：把 manifest 映射为 MemoryScope（appId/tenantId 固定，其余来自 manifest）。
 *
 * 关键边界（A2-lite）：
 * - identity 稳定性靠两层保证：同目录 createManifest 幂等（路径 hash）；
 *   目录移动时靠 .memory-autodb.json 指针保留原 id（read 不重算）。因此 init 默认幂等不覆盖。
 * - v0.1 不强制目录索引，sourceRoots 默认空数组。
 * - 所有函数不修改入参，返回新对象。
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { normalizeScope } from "../../core/scope.js";
import { DEFAULT_SLOT_REUSE_POLICY, type ReuseLevel } from "../../core/scope-policy.js";
import type { MemoryScope, MemoryScopeInput, MemorySemanticType, MemoryVisibility } from "../../core/types.js";

/** manifest 指针文件名，放在 project 目录根部。 */
export const MANIFEST_FILENAME = ".memory-autodb.json";

/** 当前 manifest schema 版本。 */
export const MANIFEST_VERSION = "0.1";

/**
 * .memory-autodb.json 的最小 schema（A2-lite）。
 * sourceRoots 字段保留但 v0.1 通常为空（不强制目录索引）。
 */
export interface MemoryAutodbManifest {
  /** manifest schema 版本，如 "0.1" */
  version: string;
  /** 跨 project 复用边界 id */
  workspaceId: string;
  /** task_context/resource 默认隔离边界 id */
  projectId: string;
  /** 可选用户 id（缺省走 scope 默认值） */
  userId?: string;
  /** 新记忆默认可见性，默认 workspace */
  defaultVisibility: MemoryVisibility;
  /** 复用策略覆盖；缺省用 DEFAULT_SLOT_REUSE_POLICY */
  slotReusePolicy?: Partial<Record<MemorySemanticType, ReuseLevel>>;
  /** 本地来源目录；v0.1 可为空数组 */
  sourceRoots: string[];
  /** 创建时间戳（ms） */
  createdAt: number;
  /** 最近更新时间戳（ms），可选 */
  updatedAt?: number;
}

/** createManifest 入参。 */
export interface CreateManifestOptions {
  dir: string;
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  defaultVisibility?: MemoryVisibility;
}

function shortHash(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length);
}

function trimmed(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const next = value.trim();
  return next.length > 0 ? next : undefined;
}

/**
 * 由目录路径派生稳定 projectId：基于绝对路径 hash，保证同目录多次调用一致。
 * 前缀 proj- 便于人读，hash 取 12 位避免碰撞。
 */
function deriveProjectId(dir: string): string {
  const absolute = resolve(dir);
  return `proj-${shortHash(absolute, 12)}`;
}

/**
 * 由目录的父目录路径派生稳定 workspaceId：同一父目录下的多个 project 默认共享 workspace。
 * 前缀 ws- 便于人读，hash 取 8 位（workspace 粒度更粗）。
 */
function deriveWorkspaceId(dir: string): string {
  const absolute = resolve(dir);
  const parent = dirname(absolute);
  return `ws-${shortHash(parent, 8)}`;
}

/**
 * 创建 manifest 对象（纯函数，不落盘）。
 * 缺省 id 由路径派生，保证同目录幂等；显式传入则优先采用。
 */
export function createManifest(options: CreateManifestOptions): MemoryAutodbManifest {
  const dir = resolve(options.dir);
  return {
    version: MANIFEST_VERSION,
    workspaceId: trimmed(options.workspaceId) ?? deriveWorkspaceId(dir),
    projectId: trimmed(options.projectId) ?? deriveProjectId(dir),
    userId: trimmed(options.userId),
    defaultVisibility: options.defaultVisibility ?? "workspace",
    slotReusePolicy: { ...DEFAULT_SLOT_REUSE_POLICY },
    sourceRoots: [],
    createdAt: Date.now(),
  };
}

/** manifest 指针文件完整路径。 */
export function manifestPath(dir: string): string {
  return join(resolve(dir), MANIFEST_FILENAME);
}

/**
 * 读取 dir 下的 .memory-autodb.json。
 * 不存在返回 null；JSON 解析失败抛带文件路径的错误（便于排查）。
 */
export function readManifest(dir: string): MemoryAutodbManifest | null {
  const filePath = manifestPath(dir);
  if (!existsSync(filePath)) {
    return null;
  }
  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw) as MemoryAutodbManifest;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`解析 manifest 失败（${filePath}）：${reason}`);
  }
}

/** 写入 manifest（2 空格缩进，末尾换行）。 */
export function writeManifest(dir: string, manifest: MemoryAutodbManifest): void {
  writeFileSync(manifestPath(dir), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/**
 * manifest 映射为 MemoryScope。
 * appId 固定 openclaw、tenantId 固定 local、namespace 默认 memories；
 * workspaceId/projectId/userId/visibility 来自 manifest；overrides 优先覆盖。
 */
export function manifestToScope(
  manifest: MemoryAutodbManifest,
  overrides: MemoryScopeInput = {},
): MemoryScope {
  return normalizeScope({
    tenantId: "local",
    appId: "openclaw",
    userId: manifest.userId,
    projectId: manifest.projectId,
    workspaceId: manifest.workspaceId,
    namespace: "memories",
    visibility: manifest.defaultVisibility,
    ...overrides,
  });
}
