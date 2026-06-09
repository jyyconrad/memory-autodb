/**
 * Web Console API view types.
 *
 * Console 不直接暴露底层表，而是按 overview、lookup、graph、jobs 四类
 * 操作台视图返回数据，并保留 scope/provenance 以支持追溯。
 */

import type { MemoryScope, RecallHit } from "../core/types.js";
import type { GraphQueryResult } from "../graph/query.js";
import type { JobRecord } from "../storage/repositories/types.js";

export interface ConsoleOverview {
  scope: MemoryScope;
  health: { ok: boolean; records?: number; error?: string };
  metrics: {
    memories: number;
    chunks: number;
    entities: number;
    relations: number;
    summaries: number;
    queuedJobs: number;
    failedJobs: number;
  };
  hotTopics: Array<{ id: string; label: string; hotness: number }>;
  dailyDigest?: { id: string; title: string; summary: string; sealedAt?: number };
}

export interface ConsoleLookupRequest {
  scope: MemoryScope;
  query: string;
  limit?: number;
}

export interface ConsoleLookupResult {
  id: string;
  kind: string;
  title: string;
  preview: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  sourceLabel: string;
  namespace: string;
  provenanceCount: number;
  raw?: string;
}

export interface ConsoleLookupResponse {
  scope: MemoryScope;
  query: string;
  results: ConsoleLookupResult[];
}

export interface ConsoleGraphResponse extends GraphQueryResult {}

export interface ConsoleJobsResponse {
  jobs: JobRecord[];
  counts: Record<string, number>;
}

export interface ConsoleApi {
  overview(scope: MemoryScope): Promise<ConsoleOverview>;
  lookup(input: ConsoleLookupRequest): Promise<ConsoleLookupResponse>;
  graph(input: { scope: MemoryScope; query?: string; entityId?: string; depth?: number; limit?: number }): Promise<ConsoleGraphResponse>;
  jobs(): Promise<ConsoleJobsResponse>;
}

export type ConsoleRecallHit = RecallHit;
