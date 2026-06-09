/**
 * 本机 memory server 健康快照。
 *
 * server 层只聚合运行时元信息和 `MemoryService.health()`，不重新探测底层数据库。
 */

import type { HealthSnapshot } from "../core/service-types.js";

const startedAt = Date.now();

export interface ServerHealthSnapshot {
  ok: boolean;
  url: string;
  uptimeMs: number;
  service: HealthSnapshot;
}

export async function createServerHealthSnapshot(input: {
  url: string;
  serviceHealth: () => Promise<HealthSnapshot>;
}): Promise<ServerHealthSnapshot> {
  const service = await input.serviceHealth();
  return {
    ok: service.ok,
    url: input.url,
    uptimeMs: Math.max(0, Date.now() - startedAt),
    service,
  };
}
