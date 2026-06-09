import { describe, expect, test } from "vitest";
import { InMemoryMemoryStore } from "../storage/repositories/in-memory.js";
import { enqueueUniqueJob } from "./jobs.js";

describe("ingest jobs", () => {
  test("enqueues jobs with deterministic dedupe key", async () => {
    const store = new InMemoryMemoryStore({ idFactory: () => "job-1" });

    const first = await enqueueUniqueJob(store.jobs, {
      type: "embed_chunk",
      targetId: "chunk-1",
      payload: { chunkId: "chunk-1" },
    });
    const second = await enqueueUniqueJob(store.jobs, {
      type: "embed_chunk",
      targetId: "chunk-1",
      payload: { chunkId: "chunk-1" },
    });

    expect(first.id).toBe("job-1");
    expect(second.id).toBe("job-1");
    expect(first.dedupeKey).toBe("embed_chunk:chunk-1");
  });
});
