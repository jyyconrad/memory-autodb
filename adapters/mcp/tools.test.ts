import { describe, expect, test } from "vitest";
import type { MemoryService } from "../../core/service-types.js";
import type { ContextBlock, MemoryRecord, RecallResult } from "../../core/types.js";
import { createMcpMemoryTools } from "./tools.js";

const scope = {
  tenantId: "local",
  appId: "openclaw",
  userId: "user-1",
  projectId: "project-1",
  agentId: "agent-1",
  namespace: "memories",
};

const record: MemoryRecord = {
  id: "mem-1",
  scope,
  kind: "preference",
  text: "User prefers concise replies",
  contentHash: "hash-1",
  importance: 0.8,
  category: "preference",
  dataType: "memory",
  tableName: "memories",
  metadata: {},
  provenance: {},
  createdAt: 1710000000000,
};

class FakeMemoryService implements MemoryService {
  calls: string[] = [];

  async storeMemory() {
    this.calls.push("storeMemory");
    return { id: "mem-1", stored: true };
  }

  async recall(): Promise<RecallResult> {
    this.calls.push("recall");
    return { scope, query: "concise", hits: [{ record, score: 0.9, source: "vector" }] };
  }

  async buildContext(): Promise<ContextBlock> {
    this.calls.push("buildContext");
    return { scope, content: "safe", hits: [], tokenEstimate: 1 };
  }

  async delete() {
    this.calls.push("delete");
    return { deleted: 1 };
  }

  async health() {
    this.calls.push("health");
    return { ok: true, records: 1 };
  }
}

describe("MCP memory tools", () => {
  test("exposes the planned core tool names", () => {
    const tools = createMcpMemoryTools({ service: new FakeMemoryService() });

    expect(tools.map((tool) => tool.name)).toEqual([
      "memory_save",
      "memory_recall",
      "memory_context",
      "memory_observe",
      "memory_ingest",
      "memory_namespaces",
      "memory_forget",
      "memory_health",
    ]);
  });

  test("maps core tools to MemoryService calls", async () => {
    const service = new FakeMemoryService();
    const tools = createMcpMemoryTools({ service });
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));

    await expect(byName.memory_save.execute({ record })).resolves.toEqual({ id: "mem-1", stored: true });
    await expect(byName.memory_observe.execute({ record })).resolves.toEqual({ id: "mem-1", stored: true });
    await expect(byName.memory_recall.execute({ query: "concise" })).resolves.toMatchObject({ query: "concise" });
    await expect(byName.memory_context.execute({ query: "concise" })).resolves.toMatchObject({ content: "safe" });
    await expect(byName.memory_forget.execute({ ids: ["mem-1"] })).resolves.toEqual({ deleted: 1 });
    await expect(byName.memory_health.execute({})).resolves.toEqual({ ok: true, records: 1 });

    expect(service.calls).toEqual([
      "storeMemory",
      "storeMemory",
      "recall",
      "buildContext",
      "delete",
      "health",
    ]);
  });

  test("reports namespaces from configured defaults", async () => {
    const tools = createMcpMemoryTools({
      service: new FakeMemoryService(),
      namespaces: ["memories", "knowledge"],
    });
    const namespaces = tools.find((tool) => tool.name === "memory_namespaces");

    await expect(namespaces?.execute({})).resolves.toEqual({ namespaces: ["memories", "knowledge"] });
  });

  test("keeps ingest as an explicit unimplemented placeholder until M4", async () => {
    const tools = createMcpMemoryTools({ service: new FakeMemoryService() });
    const ingest = tools.find((tool) => tool.name === "memory_ingest");

    await expect(ingest?.execute({ source: "file-system" })).resolves.toEqual({
      error: "memory_ingest is not implemented until ingestion pipeline is available",
    });
  });
});
