/**
 * recall-scoring 单元测试。
 *
 * 覆盖：显式评分权重常量、computeNodeScore 的 6 因子加权、缺失字段默认值、
 * 归一化（importance/confidence clamp、evidence/recency 饱和），以及默认权重下
 * 与原 importance 主导排序的一致性。
 */

import { describe, expect, test } from "vitest";
import type { MemoryRecord, MemoryScope } from "./types.js";
import {
  DEFAULT_RECALL_WEIGHTS,
  computeNodeScore,
  sortByNodeScore,
} from "./recall-scoring.js";

const scope: MemoryScope = {
  tenantId: "t",
  appId: "a",
  userId: "u",
  projectId: "p",
  agentId: "ag",
  namespace: "memories",
};

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: overrides.id ?? "rec",
    scope,
    kind: overrides.kind ?? "goal",
    text: overrides.text ?? "demo",
    contentHash: "hash",
    importance: overrides.importance ?? 0.5,
    category: "core",
    dataType: "memory",
    metadata: {},
    provenance: { source: "user" },
    createdAt: 0,
    ...overrides,
  };
}

describe("DEFAULT_RECALL_WEIGHTS", () => {
  test("six factors sum to 1.0", () => {
    const w = DEFAULT_RECALL_WEIGHTS;
    const sum =
      w.relevance + w.scopeFit + w.importance + w.confidence + w.evidenceWeight + w.recency;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  test("relevance is the dominant factor", () => {
    const w = DEFAULT_RECALL_WEIGHTS;
    expect(w.relevance).toBeGreaterThan(w.scopeFit);
    expect(w.scopeFit).toBeGreaterThan(w.importance);
  });
});

describe("computeNodeScore", () => {
  test("higher importance yields higher score when other factors equal", () => {
    const high = makeRecord({ id: "h", importance: 0.9 });
    const low = makeRecord({ id: "l", importance: 0.3 });
    expect(computeNodeScore(high)).toBeGreaterThan(computeNodeScore(low));
  });

  test("missing confidence defaults to 1 (full)", () => {
    const withConf = makeRecord({ confidence: 1 });
    const noConf = makeRecord({ confidence: undefined });
    expect(computeNodeScore(noConf)).toBeCloseTo(computeNodeScore(withConf), 6);
  });

  test("more evidence raises the score", () => {
    const rich = makeRecord({ id: "r", sourceNodeIds: ["e1", "e2", "e3"] });
    const poor = makeRecord({ id: "p", sourceNodeIds: [] });
    expect(computeNodeScore(rich)).toBeGreaterThan(computeNodeScore(poor));
  });

  test("higher hotness raises recency factor", () => {
    const hot = makeRecord({ id: "hot", hotness: 10 });
    const cold = makeRecord({ id: "cold", hotness: 0 });
    expect(computeNodeScore(hot)).toBeGreaterThan(computeNodeScore(cold));
  });

  test("optional relevance signal overrides neutral default", () => {
    const record = makeRecord();
    const relevant = computeNodeScore(record, DEFAULT_RECALL_WEIGHTS, { relevance: 1 });
    const irrelevant = computeNodeScore(record, DEFAULT_RECALL_WEIGHTS, { relevance: 0 });
    expect(relevant).toBeGreaterThan(irrelevant);
  });

  test("clamps out-of-range importance to [0,1]", () => {
    const over = makeRecord({ importance: 5 });
    const at1 = makeRecord({ importance: 1 });
    expect(computeNodeScore(over)).toBeCloseTo(computeNodeScore(at1), 6);
  });

  test("score stays within [0,1]", () => {
    const max = makeRecord({
      importance: 1,
      confidence: 1,
      hotness: 999,
      sourceNodeIds: ["a", "b", "c", "d", "e"],
    });
    const score = computeNodeScore(max, DEFAULT_RECALL_WEIGHTS, { relevance: 1, scopeFit: 1 });
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

describe("sortByNodeScore", () => {
  test("sorts descending by score, importance-dominant when other factors equal", () => {
    const records = [
      makeRecord({ id: "low", importance: 0.3 }),
      makeRecord({ id: "high", importance: 0.9 }),
      makeRecord({ id: "mid", importance: 0.6 }),
    ];
    const sorted = sortByNodeScore(records);
    expect(sorted.map((r) => r.id)).toEqual(["high", "mid", "low"]);
  });

  test("does not mutate the input array", () => {
    const records = [makeRecord({ id: "a", importance: 0.1 }), makeRecord({ id: "b", importance: 0.9 })];
    const snapshot = [...records];
    sortByNodeScore(records);
    expect(records).toEqual(snapshot);
  });
});
