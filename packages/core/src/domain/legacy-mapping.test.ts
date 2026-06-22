import { describe, expect, test } from "vitest";
import type { MemoryEntry } from "../db/types.js";
import {
  categoryToKind,
  memoryEntryToRecord,
  recordToMemoryEntry,
  tableNameToNamespace,
} from "./legacy-mapping.js";
import { scopeToKey } from "../../../../core/scope.js";

const baseEntry: MemoryEntry = {
  id: "mem-1",
  text: "User prefers concise answers",
  contentHash: "hash-1",
  vector: [0.1, 0.2],
  importance: 0.82,
  category: "preference",
  dataType: "memory",
  tableName: "memories",
  metadata: {
    userId: "user-1",
    sessionId: "session-1",
    conversationId: "conversation-1",
    messageId: "message-1",
    projectPath: "/workspace/app",
    agentName: "openclaw-agent",
    source: "user",
    custom: "kept",
    updatedAt: 1710000001000,
  },
  createdAt: 1710000000000,
};

describe("legacy memory mapping", () => {
  test("maps table names to namespaces", () => {
    expect(tableNameToNamespace("memories")).toBe("memories");
    expect(tableNameToNamespace("knowledge")).toBe("knowledge");
    expect(tableNameToNamespace("documents")).toBe("documents");
    expect(tableNameToNamespace("knowledge_work")).toBe("knowledge_work");
    expect(tableNameToNamespace(undefined)).toBe("memories");
  });

  test("maps memory categories to core kinds", () => {
    expect(categoryToKind("preference")).toBe("preference");
    expect(categoryToKind("decision")).toBe("decision");
    expect(categoryToKind("entity")).toBe("entity");
    expect(categoryToKind("fact")).toBe("fact");
    expect(categoryToKind("task")).toBe("task");
    expect(categoryToKind("plan")).toBe("plan");
    expect(categoryToKind("goal")).toBe("goal");
    expect(categoryToKind("core")).toBe("other");
    expect(categoryToKind("other")).toBe("other");
  });

  test("promotes legacy metadata into scope and provenance", () => {
    const record = memoryEntryToRecord(baseEntry, {
      tenantId: "tenant-a",
      appId: "openclaw",
    });

    expect(record.scope).toEqual({
      tenantId: "tenant-a",
      appId: "openclaw",
      userId: "user-1",
      projectId: "/workspace/app",
      agentId: "openclaw-agent",
      namespace: "memories",
    });
    expect(scopeToKey(record.scope)).toBe(
      "tenant-a:openclaw:user-1:%2Fworkspace%2Fapp:openclaw-agent:memories",
    );
    expect(record.kind).toBe("preference");
    expect(record.provenance).toMatchObject({
      source: "user",
      sessionId: "session-1",
      conversationId: "conversation-1",
      messageId: "message-1",
      createdAt: 1710000000000,
    });
    expect(record.metadata.custom).toBe("kept");
    expect(record.updatedAt).toBe(1710000001000);
  });

  test("maps knowledge entries into knowledge namespace and kind", () => {
    const record = memoryEntryToRecord({
      ...baseEntry,
      dataType: "knowledge",
      tableName: "knowledge",
      category: "other",
      metadata: {
        ...baseEntry.metadata,
        filePath: "/docs/guide.md",
        source: "scan",
      },
    });

    expect(record.scope.namespace).toBe("knowledge");
    expect(record.kind).toBe("knowledge");
    expect(record.provenance.filePath).toBe("/docs/guide.md");
    expect(record.provenance.source).toBe("scan");
  });

  test("round-trips a core record back to a legacy MemoryEntry without losing fields", () => {
    const record = memoryEntryToRecord(baseEntry, { appId: "openclaw" });
    const entry = recordToMemoryEntry(record);

    // baseEntry.category=preference -> kind=preference -> semanticType=profile（边界统一推导），
    // 该推导值会回写进 metadata.semanticType，因此 round-trip 后多出该字段。
    expect(entry).toEqual({
      ...baseEntry,
      metadata: { ...baseEntry.metadata, semanticType: "profile" },
    });
  });

  test("uses an explicit vector when converting back to legacy entry", () => {
    const record = memoryEntryToRecord(baseEntry);
    const entry = recordToMemoryEntry({ ...record, vector: undefined }, [0.9, 0.8]);

    expect(entry.vector).toEqual([0.9, 0.8]);
  });

  test("preserves v3.0 fields across a record -> entry -> record round-trip", () => {
    const record = memoryEntryToRecord(baseEntry, { appId: "openclaw" });
    const enriched = {
      ...record,
      hotness: 7,
      sourceNodeIds: ["node-a", "node-b", "node-c"],
      confidence: 0.91,
      semanticType: "experience" as const,
    };

    const entry = recordToMemoryEntry(enriched);
    expect(entry.metadata.hotness).toBe(7);
    expect(entry.metadata.sourceNodeIds).toEqual(["node-a", "node-b", "node-c"]);
    expect(entry.metadata.confidence).toBe(0.91);
    expect(entry.metadata.semanticType).toBe("experience");

    const restored = memoryEntryToRecord(entry, { appId: "openclaw" });
    expect(restored.hotness).toBe(7);
    expect(restored.sourceNodeIds).toEqual(["node-a", "node-b", "node-c"]);
    expect(restored.confidence).toBe(0.91);
    expect(restored.semanticType).toBe("experience");
    expect(restored.updatedAt).toBe(1710000001000);
  });

  test("falls back to undefined for v3.0 fields missing from legacy metadata", () => {
    const record = memoryEntryToRecord(baseEntry, { appId: "openclaw" });

    expect(record.hotness).toBeUndefined();
    expect(record.sourceNodeIds).toBeUndefined();
    expect(record.confidence).toBeUndefined();
    // semanticType 缺失时从 kind 高置信度推导（preference -> profile），不再是 undefined
    expect(record.semanticType).toBe("profile");
  });

  test("derives semanticType from kind when legacy metadata lacks it", () => {
    // 迁移数据普遍只有 kind/category，缺 metadata.semanticType。
    // 边界应统一从 kind 高置信度映射，让 5 槽位/importance 明细等消费方受益。
    const decision = memoryEntryToRecord(
      { ...baseEntry, category: "decision" },
      { appId: "openclaw" },
    );
    expect(decision.semanticType).toBe("rules");

    const goal = memoryEntryToRecord(
      { ...baseEntry, category: "goal" },
      { appId: "openclaw" },
    );
    expect(goal.semanticType).toBe("task_context");

    // 无法稳定归类的 kind（entity/fact/other）保持 undefined（kind-only 记忆）
    const entity = memoryEntryToRecord(
      { ...baseEntry, category: "entity" },
      { appId: "openclaw" },
    );
    expect(entity.semanticType).toBeUndefined();
  });

  test("coerces string importance to a clamped number at the boundary", () => {
    // 迁移数据 importance 可能存为字符串 "0.9"，违反 MemoryRecord.importance: number 契约
    const fromString = memoryEntryToRecord(
      { ...baseEntry, importance: "0.9" as unknown as number },
      { appId: "openclaw" },
    );
    expect(fromString.importance).toBe(0.9);
    expect(typeof fromString.importance).toBe("number");

    // 超界值 clamp 到 [0,1]
    const tooHigh = memoryEntryToRecord(
      { ...baseEntry, importance: "1.5" as unknown as number },
      { appId: "openclaw" },
    );
    expect(tooHigh.importance).toBe(1);

    // 非法值回退中性默认 0.5
    const invalid = memoryEntryToRecord(
      { ...baseEntry, importance: "abc" as unknown as number },
      { appId: "openclaw" },
    );
    expect(invalid.importance).toBe(0.5);
  });

  test("ignores invalid v3.0 field types when restoring a record", () => {
    const entry: MemoryEntry = {
      ...baseEntry,
      metadata: {
        ...baseEntry.metadata,
        hotness: "hot",
        confidence: "high",
        sourceNodeIds: ["valid", 42, null],
        semanticType: "not-a-real-type",
      },
    };

    const record = memoryEntryToRecord(entry, { appId: "openclaw" });
    expect(record.hotness).toBeUndefined();
    expect(record.confidence).toBeUndefined();
    expect(record.sourceNodeIds).toEqual(["valid"]);
    // 非法 metadata.semanticType 被忽略后，回退到 kind 推导（preference -> profile）
    expect(record.semanticType).toBe("profile");
  });

  test("does not emit undefined v3.0 fields into legacy metadata", () => {
    // category=other -> kind=other（unmappable），semanticType 保持 undefined，
    // 因此不会回写进 metadata，可验证"undefined 字段不外溢"。
    const record = memoryEntryToRecord(
      { ...baseEntry, category: "other", metadata: { custom: "kept" } },
      { appId: "openclaw" },
    );
    const entry = recordToMemoryEntry(record);

    expect(entry.metadata).not.toHaveProperty("hotness");
    expect(entry.metadata).not.toHaveProperty("sourceNodeIds");
    expect(entry.metadata).not.toHaveProperty("confidence");
    expect(entry.metadata).not.toHaveProperty("semanticType");
    expect(entry.metadata.custom).toBe("kept");
  });
});
