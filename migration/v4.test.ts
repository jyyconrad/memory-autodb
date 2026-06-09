import { describe, expect, test } from "vitest";
import type { MemoryRecord } from "../core/types.js";
import { planV4Migration, runV4Migration } from "./v4.js";

const scope = {
  tenantId: "local",
  appId: "openclaw",
  userId: "user-1",
  projectId: "project-1",
  agentId: "agent-1",
  namespace: "knowledge",
};

function record(id: string, dataType: MemoryRecord["dataType"]): MemoryRecord {
  return {
    id,
    scope,
    kind: dataType === "memory" ? "fact" : "knowledge",
    text: id,
    contentHash: `hash-${id}`,
    importance: 0.5,
    category: "other",
    dataType,
    tableName: dataType === "memory" ? "memories" : "knowledge",
    metadata: {},
    provenance: {},
    createdAt: 1710000000000,
  };
}

describe("v4 migration", () => {
  test("plans dry-run counts from legacy records", () => {
    const plan = planV4Migration([
      record("mem-1", "memory"),
      record("doc-1", "document"),
      record("know-1", "knowledge"),
    ]);

    expect(plan).toMatchObject({
      sourceRecords: 3,
      memoryRecords: 1,
      documentRecords: 2,
      chunksEstimated: 2,
      jobsEstimated: 4,
      dryRun: true,
    });
  });

  test("skips existing ids and marks apply mode", () => {
    const result = runV4Migration([
      record("mem-1", "memory"),
      record("doc-1", "document"),
    ], {
      dryRun: false,
      existingIds: new Set(["mem-1"]),
    });

    expect(result).toMatchObject({
      sourceRecords: 1,
      skippedExisting: 1,
      applied: true,
      dryRun: false,
    });
  });
});
