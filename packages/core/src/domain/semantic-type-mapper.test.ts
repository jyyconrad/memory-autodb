/**
 * semantic-type-mapper.test.ts
 *
 * 测试 kind → semanticType 映射规则
 */

import { describe, it, expect } from "vitest";
import {
  kindToSemanticType,
  batchMapSemanticType,
  computeMappingCoverage,
} from "./semantic-type-mapper.js";
import type { MemoryRecord } from "../../../../core/types.js";

describe("kindToSemanticType", () => {
  describe("v1.1 高置信度映射", () => {
    it("goal → task_context", () => {
      const result = kindToSemanticType("goal");
      expect(result.semanticType).toBe("task_context");
      expect(result.confidence).toBe("high");
    });

    it("document → resource", () => {
      const result = kindToSemanticType("document");
      expect(result.semanticType).toBe("resource");
      expect(result.confidence).toBe("high");
    });

    it("knowledge → resource", () => {
      const result = kindToSemanticType("knowledge");
      expect(result.semanticType).toBe("resource");
      expect(result.confidence).toBe("high");
    });

    it("preference → profile", () => {
      const result = kindToSemanticType("preference");
      expect(result.semanticType).toBe("profile");
      expect(result.confidence).toBe("high");
    });

    it("decision → rules", () => {
      const result = kindToSemanticType("decision");
      expect(result.semanticType).toBe("rules");
      expect(result.confidence).toBe("high");
    });

    it("task → task_context", () => {
      const result = kindToSemanticType("task");
      expect(result.semanticType).toBe("task_context");
      expect(result.confidence).toBe("high");
    });

    it("plan → task_context", () => {
      const result = kindToSemanticType("plan");
      expect(result.semanticType).toBe("task_context");
      expect(result.confidence).toBe("high");
    });
  });

  describe("无法归类", () => {
    it("fact → null (unmappable)", () => {
      const result = kindToSemanticType("fact");
      expect(result.semanticType).toBeNull();
      expect(result.confidence).toBe("unmappable");
    });

    it("entity → null (unmappable)", () => {
      const result = kindToSemanticType("entity");
      expect(result.semanticType).toBeNull();
      expect(result.confidence).toBe("unmappable");
    });

    it("observation → null (unmappable)", () => {
      const result = kindToSemanticType("observation");
      expect(result.semanticType).toBeNull();
      expect(result.confidence).toBe("unmappable");
    });

    it("other → null (unmappable)", () => {
      const result = kindToSemanticType("other");
      expect(result.semanticType).toBeNull();
      expect(result.confidence).toBe("unmappable");
    });
  });
});

describe("batchMapSemanticType", () => {
  it("批量映射高置信度记忆", () => {
    const records: Partial<MemoryRecord>[] = [
      { id: "1", kind: "goal" },
      { id: "2", kind: "document" },
      { id: "3", kind: "preference" },
      { id: "4", kind: "decision" },
      { id: "5", kind: "fact" },
    ];

    const results = batchMapSemanticType(records as MemoryRecord[]);

    expect(results[0].semanticType).toBe("task_context");
    expect(results[1].semanticType).toBe("resource");
    expect(results[2].semanticType).toBe("profile");
    expect(results[3].semanticType).toBe("rules");
    expect(results[4].semanticType).toBeUndefined();
  });

  it("保留原 kind 字段", () => {
    const records: Partial<MemoryRecord>[] = [
      { id: "1", kind: "goal" },
    ];

    const results = batchMapSemanticType(records as MemoryRecord[]);

    expect(results[0].kind).toBe("goal");
    expect(results[0].semanticType).toBe("task_context");
  });
});

describe("computeMappingCoverage", () => {
  it("计算映射覆盖率", () => {
    const records: Partial<MemoryRecord>[] = [
      { id: "1", kind: "goal" },         // mapped
      { id: "2", kind: "document" },     // mapped
      { id: "3", kind: "knowledge" },    // mapped
      { id: "4", kind: "preference" },   // mapped
      { id: "5", kind: "decision" },     // mapped
      { id: "6", kind: "task" },         // mapped
      { id: "7", kind: "plan" },         // mapped
      { id: "8", kind: "fact" },         // unmapped
      { id: "9", kind: "observation" },  // unmapped
    ];

    const coverage = computeMappingCoverage(records as MemoryRecord[]);

    expect(coverage.total).toBe(9);
    expect(coverage.mapped).toBe(7);
    expect(coverage.unmapped).toBe(2);
    expect(coverage.coverageRate).toBeCloseTo(0.778, 2); // ~77.8%
    expect(coverage.byConfidence.high).toBe(7);
    expect(coverage.byConfidence.unmappable).toBe(2);
  });

  it("空列表返回 0", () => {
    const coverage = computeMappingCoverage([]);
    expect(coverage.coverageRate).toBe(0);
  });
});
