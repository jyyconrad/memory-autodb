/**
 * 记忆 scope 归一化与稳定 key 生成。
 *
 * scope 是中间件隔离多产品、多用户、多项目和多命名空间的基础边界；
 * key 使用固定字段顺序和 URL 编码，避免空值、分隔符或字段顺序导致串库。
 */

import type { MemoryScope, MemoryScopeInput } from "./types.js";

const DEFAULT_SCOPE: MemoryScope = {
  tenantId: "local",
  appId: "default",
  userId: "default",
  projectId: "default",
  agentId: "default",
  namespace: "default",
};

function normalizeDimension(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeScope(
  input: MemoryScopeInput = {},
  defaults: MemoryScope = DEFAULT_SCOPE,
): MemoryScope {
  return {
    tenantId: normalizeDimension(input.tenantId, defaults.tenantId),
    appId: normalizeDimension(input.appId, defaults.appId),
    userId: normalizeDimension(input.userId, defaults.userId),
    projectId: normalizeDimension(input.projectId, defaults.projectId),
    agentId: normalizeDimension(input.agentId, defaults.agentId),
    namespace: normalizeDimension(input.namespace, defaults.namespace),
    workspaceId:
      typeof input.workspaceId === "string" && input.workspaceId.trim().length > 0
        ? input.workspaceId
        : defaults.workspaceId,
    sessionId:
      typeof input.sessionId === "string" && input.sessionId.trim().length > 0
        ? input.sessionId
        : defaults.sessionId,
    visibility: input.visibility ?? defaults.visibility,
  };
}

export function scopeToKey(scope: MemoryScopeInput): string {
  const normalized = normalizeScope(scope);
  return [
    normalized.tenantId,
    normalized.appId,
    normalized.userId,
    normalized.projectId,
    normalized.agentId,
    normalized.namespace,
  ].map(encodeURIComponent).join(":");
}
