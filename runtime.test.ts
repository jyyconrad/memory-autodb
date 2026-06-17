import { describe, expect, test, vi } from "vitest";
import type { DatabaseProvider, MemoryEntry, MemoryQueryOptions } from "./db/types.js";
import { createMengshuRuntime, toFriendlyMengshuError } from "./runtime.js";
import type { MemoryConfig } from "./config.js";

class FakeDb implements DatabaseProvider {
  initialize = vi.fn(async () => {});
  close = vi.fn(async () => {});
  store = vi.fn(async (_entries: MemoryEntry[]) => {});
  query = vi.fn(async (_options: MemoryQueryOptions) => []);
  delete = vi.fn(async (_ids: string[]) => {});
  deleteByFilter = vi.fn(async (_filter: Record<string, unknown>) => 0);
  existsByContentHash = vi.fn(async (_contentHashes: string[]) => []);
  count = vi.fn(async (_filter?: Record<string, unknown>) => 0);
  getTableStats = vi.fn(async () => [{ name: "memories" as const, count: 0 }]);
}

const config: MemoryConfig = {
  embedding: {
    provider: "openai",
    apiKey: "test-key",
    baseURL: "http://localhost:9999/v1",
    model: "text-embedding-3-small",
  },
  dbType: "lancedb",
  dbPath: "/tmp/mengshu-test",
};

describe("createMengshuRuntime", () => {
  test("constructs shared runtime and delegates lifecycle to db", async () => {
    const db = new FakeDb();
    const runtime = createMengshuRuntime({
      config,
      resolvedDbPath: "/tmp/mengshu-test",
      appId: "test-app",
      db,
    });

    expect(runtime.memoryService).toBeDefined();
    expect(runtime.ingestionPipeline).toBeDefined();
    expect(runtime.consoleApi).toBeDefined();
    expect(runtime.agentFastPath).toBeDefined();
    expect(Object.keys(runtime.handlers).sort()).toEqual([
      "build_tree",
      "extract_candidate",
      "extract_graph",
    ]);

    await runtime.start();
    await runtime.stop();
    expect(db.initialize).toHaveBeenCalledTimes(1);
    expect(db.close).toHaveBeenCalledTimes(1);
  });

  test("keeps friendly config errors", () => {
    expect(() =>
      createMengshuRuntime({
        config: {
          ...config,
          embedding: { ...config.embedding, apiKey: "" },
        },
        resolvedDbPath: "/tmp/mengshu-test",
        db: new FakeDb(),
      })
    ).toThrow("[Mengshu 配置错误] embedding.apiKey 未设置");
  });

  test("maps common provider errors to friendly errors", () => {
    expect(toFriendlyMengshuError(new Error("403 balance is insufficient")).message).toContain("余额不足");
    expect(toFriendlyMengshuError(new Error("401 unauthorized")).message).toContain("API 认证失败");
    expect(toFriendlyMengshuError(new Error("ECONNREFUSED")).message).toContain("无法连接到 Embedding API");
  });
});
