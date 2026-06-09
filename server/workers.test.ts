import { describe, expect, test } from "vitest";
import { InMemoryMemoryStore } from "../storage/repositories/in-memory.js";
import { runNextJob } from "./workers.js";

describe("server workers", () => {
  test("leases and completes a job when handler succeeds", async () => {
    const store = new InMemoryMemoryStore();
    await store.jobs.enqueue({ type: "embed_chunk", payload: { chunkId: "chunk-1" }, dedupeKey: "embed_chunk:chunk-1" });

    const result = await runNextJob(store.jobs, {
      workerId: "worker-1",
      leaseMs: 1000,
      handlers: {
        embed_chunk: async () => ({ ok: true }),
      },
    });

    expect(result).toMatchObject({ status: "completed", type: "embed_chunk" });
    await expect(store.jobs.list("completed")).resolves.toHaveLength(1);
  });

  test("marks job failed when handler throws", async () => {
    const store = new InMemoryMemoryStore();
    await store.jobs.enqueue({ type: "embed_chunk", payload: { chunkId: "chunk-1" }, dedupeKey: "embed_chunk:chunk-1" });

    const result = await runNextJob(store.jobs, {
      workerId: "worker-1",
      leaseMs: 1000,
      handlers: {
        embed_chunk: async () => {
          throw new Error("boom");
        },
      },
    });

    expect(result).toMatchObject({ status: "failed", error: "boom" });
    await expect(store.jobs.list("failed")).resolves.toHaveLength(1);
  });

  test("returns idle when no job is available", async () => {
    const store = new InMemoryMemoryStore();

    await expect(
      runNextJob(store.jobs, {
        workerId: "worker-1",
        leaseMs: 1000,
        handlers: {},
      }),
    ).resolves.toEqual({ status: "idle" });
  });
});
