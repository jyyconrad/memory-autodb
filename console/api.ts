/**
 * Console aggregation API.
 *
 * 聚合 MemoryService、graph、tree、jobs 和 chunks 的只读视图；所有入口都要求
 * 显式 scope，private raw content 不返回。
 */

import type { MemoryService } from "../core/service-types.js";
import type { MemoryScope, RecallHit } from "../core/types.js";
import type { GraphQueryService } from "../graph/query.js";
import type { ChunkRepository, JobRepository } from "../storage/repositories/types.js";
import type { TreeRepository } from "../tree/types.js";
import type {
  ConsoleApi,
  ConsoleGraphResponse,
  ConsoleJobsResponse,
  ConsoleLookupRequest,
  ConsoleLookupResponse,
  ConsoleLookupResult,
  ConsoleOverview,
} from "./types.js";

export interface CreateConsoleApiOptions {
  service: MemoryService;
  graph?: GraphQueryService;
  chunks?: ChunkRepository;
  jobs?: JobRepository;
  tree?: TreeRepository;
}

function hitText(hit: RecallHit): string {
  if ("text" in hit.record) {
    return hit.record.text;
  }
  return hit.record.summary;
}

function hitKind(hit: RecallHit): string {
  if ("kind" in hit.record) {
    return hit.record.kind;
  }
  if ("treeType" in hit.record) {
    return "summary";
  }
  return hit.source;
}

function sourceLabel(hit: RecallHit): string {
  return hit.provenance?.sourceId ??
    hit.provenance?.filePath ??
    ("provenance" in hit.record ? hit.record.provenance?.sourceId : undefined) ??
    ("provenance" in hit.record ? hit.record.provenance?.filePath : undefined) ??
    hit.record.id;
}

function isPrivate(hit: RecallHit): boolean {
  const metadata = "metadata" in hit.record ? hit.record.metadata : undefined;
  return Boolean(metadata?.private || metadata?.visibility === "private");
}

function toLookupResult(hit: RecallHit): ConsoleLookupResult {
  const text = hitText(hit);
  const privateContent = isPrivate(hit);
  return {
    id: hit.record.id,
    kind: hitKind(hit),
    title: text.split("\n")[0]?.slice(0, 80) || hit.record.id,
    preview: privateContent ? "[private]" : text.slice(0, 240),
    raw: privateContent ? undefined : text,
    score: hit.score,
    scoreBreakdown: hit.scoreBreakdown ?? {},
    sourceLabel: sourceLabel(hit),
    namespace: hit.record.scope.namespace,
    provenanceCount: hit.provenance ? 1 : 0,
  };
}

export function createConsoleApi(options: CreateConsoleApiOptions): ConsoleApi {
  return {
    async overview(scope: MemoryScope): Promise<ConsoleOverview> {
      const [health, chunks, queuedJobs, failedJobs, summaries] = await Promise.all([
        options.service.health(),
        options.chunks?.list({ scope }) ?? Promise.resolve([]),
        options.jobs?.list("queued") ?? Promise.resolve([]),
        options.jobs?.list("failed") ?? Promise.resolve([]),
        options.tree?.listSummaries({ scope }) ?? Promise.resolve([]),
      ]);
      const graph = options.graph
        ? await options.graph.query({ scope, depth: 1, limit: 10 })
        : { entities: [], relations: [], evidenceChunkIds: [] };
      return {
        scope,
        health,
        metrics: {
          memories: health.records ?? 0,
          chunks: chunks.length,
          entities: graph.entities.length,
          relations: graph.relations.length,
          summaries: summaries.length,
          queuedJobs: queuedJobs.length,
          failedJobs: failedJobs.length,
        },
        hotTopics: graph.entities
          .map((entity) => ({ id: entity.id, label: entity.displayName, hotness: entity.hotness }))
          .sort((left, right) => right.hotness - left.hotness)
          .slice(0, 10),
        dailyDigest: summaries.find((summary) => summary.treeType === "global")
          ? (() => {
            const digest = summaries.find((summary) => summary.treeType === "global")!;
            return {
              id: digest.id,
              title: digest.title,
              summary: digest.summary,
              sealedAt: digest.sealedAt,
            };
          })()
          : undefined,
      };
    },

    async lookup(input: ConsoleLookupRequest): Promise<ConsoleLookupResponse> {
      const recalled = await options.service.recall({
        query: input.query,
        scope: input.scope,
        limit: input.limit,
      });
      return {
        scope: recalled.scope,
        query: recalled.query,
        results: recalled.hits.map(toLookupResult),
      };
    },

    async graph(input): Promise<ConsoleGraphResponse> {
      if (!options.graph) {
        return { entities: [], relations: [], evidenceChunkIds: [] };
      }
      return options.graph.query(input);
    },

    async jobs(): Promise<ConsoleJobsResponse> {
      const jobs = await (options.jobs?.list() ?? Promise.resolve([]));
      const counts: Record<string, number> = {};
      for (const job of jobs) {
        counts[job.status] = (counts[job.status] ?? 0) + 1;
      }
      return { jobs, counts };
    },
  };
}
