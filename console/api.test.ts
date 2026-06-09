import { describe, expect, test } from "vitest";
import type { MemoryService, StoreMemoryInput, RecallInput, DeleteMemoryInput } from "../core/service-types.js";
import type { ContextBlock, MemoryRecord, RecallResult } from "../core/types.js";
import { InMemoryGraphRepository } from "../graph/repository.js";
import { GraphQueryService } from "../graph/query.js";
import { InMemoryMemoryStore } from "../storage/repositories/in-memory.js";
import { InMemoryTreeRepository } from "../tree/buffer.js";
import { buildDailyDigest } from "../tree/global.js";
import { createConsoleApi } from "./api.js";

const scope = {
  tenantId: "local",
  appId: "openclaw",
  userId: "user-1",
  projectId: "project-1",
  agentId: "agent-1",
  namespace: "knowledge",
};

function record(id: string, text: string, metadata: Record<string, unknown> = {}): MemoryRecord {
  return {
    id,
    scope,
    kind: "knowledge",
    text,
    contentHash: `hash-${id}`,
    importance: 0.5,
    category: "other",
    dataType: "knowledge",
    tableName: "knowledge",
    metadata,
    provenance: { source: "scan", sourceId: `source-${id}` },
    createdAt: 1710000000000,
  };
}

class FakeMemoryService implements MemoryService {
  constructor(private readonly hits: Array<MemoryRecord & { score: number }> = []) {}

  async storeMemory(_input: StoreMemoryInput) {
    return { id: "mem-1", stored: true };
  }

  async recall(input: RecallInput): Promise<RecallResult> {
    return {
      scope,
      query: input.query,
      hits: this.hits.map((hit) => ({
        record: hit,
        score: hit.score,
        source: "vector",
        scoreBreakdown: { vector: hit.score },
        provenance: hit.provenance,
      })),
    };
  }

  async buildContext(): Promise<ContextBlock> {
    return { scope, content: "", hits: [], tokenEstimate: 0 };
  }

  async delete(_input: DeleteMemoryInput) {
    return { deleted: 0 };
  }

  async health() {
    return { ok: true, records: this.hits.length };
  }
}

describe("console API", () => {
  test("builds overview from service, graph, tree and jobs", async () => {
    const graphRepository = new InMemoryGraphRepository();
    await graphRepository.upsertEntities([
      {
        id: "entity-1",
        scope,
        canonicalName: "memory-autodb",
        displayName: "memory-autodb",
        type: "project",
        aliases: ["memory-autodb"],
        mentionCount: 1,
        mentionCount30d: 1,
        distinctSourceCount: 1,
        lastSeenAt: 1710000000000,
        hotness: 7,
        queryHits30d: 0,
        status: "active",
        createdAt: 1710000000000,
        updatedAt: 1710000000000,
        metadata: {},
      },
    ]);
    const store = new InMemoryMemoryStore();
    await store.jobs.enqueue({ type: "embed_chunk", payload: {}, dedupeKey: "embed_chunk:1" });
    const tree = new InMemoryTreeRepository();
    await buildDailyDigest(tree, scope, "2026-06-06", [], 1710000000000);
    const api = createConsoleApi({
      service: new FakeMemoryService([{ ...record("mem-1", "memory"), score: 0.9 }]),
      graph: new GraphQueryService(graphRepository),
      jobs: store.jobs,
      tree,
      chunks: store.chunks,
    });

    const overview = await api.overview(scope);

    expect(overview.metrics).toMatchObject({
      memories: 1,
      queuedJobs: 1,
      summaries: 1,
      entities: 1,
    });
    expect(overview.hotTopics).toEqual([{ id: "entity-1", label: "memory-autodb", hotness: 7 }]);
    expect(overview.dailyDigest?.title).toBe("Daily Digest 2026-06-06");
  });

  test("lookup hides private raw content and keeps provenance fields", async () => {
    const api = createConsoleApi({
      service: new FakeMemoryService([
        { ...record("public", "public memory"), score: 0.9 },
        { ...record("private", "secret memory", { private: true }), score: 0.8 },
      ]),
    });

    const result = await api.lookup({ scope, query: "memory" });

    expect(result.results).toEqual([
      expect.objectContaining({ id: "public", preview: "public memory", raw: "public memory", sourceLabel: "source-public" }),
      expect.objectContaining({ id: "private", preview: "[private]", raw: undefined, sourceLabel: "source-private" }),
    ]);
  });
});
