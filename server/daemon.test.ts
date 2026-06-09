import { afterEach, describe, expect, test } from "vitest";
import type { MemoryService } from "../core/service-types.js";
import type { ContextBlock, MemoryRecord, RecallResult } from "../core/types.js";
import { startMemoryServer, type RunningMemoryServer } from "./daemon.js";

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
  async storeMemory() {
    return { id: "mem-1", stored: true };
  }

  async recall(): Promise<RecallResult> {
    return { scope, query: "concise", hits: [{ record, score: 0.9, source: "vector" }] };
  }

  async buildContext(): Promise<ContextBlock> {
    return { scope, content: "safe", hits: [], tokenEstimate: 1 };
  }

  async delete() {
    return { deleted: 0 };
  }

  async health() {
    return { ok: true, records: 1 };
  }
}

describe("memory server daemon", () => {
  let running: RunningMemoryServer | undefined;

  afterEach(async () => {
    await running?.stop();
    running = undefined;
  });

  test("serves REST responses over node:http", async () => {
    running = await startMemoryServer({
      service: new FakeMemoryService(),
      host: "127.0.0.1",
      port: 0,
    });

    const health = await fetch(`${running.url}/v1/health`);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toEqual({ ok: true, records: 1 });

    const recall = await fetch(`${running.url}/v1/recall`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "concise" }),
    });
    expect(recall.status).toBe(200);
    expect(await recall.json()).toMatchObject({ query: "concise" });
  });

  test("returns JSON bad request for malformed JSON", async () => {
    running = await startMemoryServer({
      service: new FakeMemoryService(),
      host: "127.0.0.1",
      port: 0,
    });

    const response = await fetch(`${running.url}/v1/recall`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
  });
});
