/**
 * extract-candidate-handler.ts 单元测试。
 *
 * 验证 extract_candidate job handler 把 observation 文本经 extractor 抽取后
 * 按 decideAdmission 准入策略写入候选区（pending），并保证：
 * 1. 抽到的候选默认进 candidate（pending），不直配主库（自动抽取不污染主库）。
 * 2. decideAdmission route=drop 的不入候选。
 * 3. 敏感文本（extractor 返回 []）不产生候选。
 * 4. payload 缺失 text/scope 时安全返回，不抛未捕获异常。
 * 5. 同 scope 同文本的重复 observation 不产生重复 pending 候选。
 */

import { describe, expect, test } from "vitest";
import { createExtractCandidateHandler } from "./extract-candidate-handler.js";
import { InMemoryCandidateRepository } from "./candidate-repository.js";
import { HeuristicTypeExtractor } from "./type-extractor.js";
import type { JobRecord } from "../storage/repositories/types.js";

const scope = {
  tenantId: "local",
  appId: "openclaw",
  userId: "u1",
  projectId: "p1",
  agentId: "default",
  namespace: "memories",
};

function job(payload: Record<string, unknown>): JobRecord {
  return {
    id: "job-1",
    type: "extract_candidate",
    payload,
    dedupeKey: "extract_candidate:job-1",
    status: "running",
    attempts: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("createExtractCandidateHandler", () => {
  test("rules 类文本抽取后进入候选区 pending", async () => {
    const candidates = new InMemoryCandidateRepository();
    const handler = createExtractCandidateHandler({
      extractor: new HeuristicTypeExtractor(),
      candidates,
    });

    await handler(job({ scope, text: "禁止在未确认前删除生产数据。", intent: "auto" }));

    const pending = await candidates.list({ scope, status: "pending" });
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0].semanticType).toBe("rules");
    expect(pending[0].status).toBe("pending");
  });

  test("敏感文本不产生候选（extractor 源头过滤）", async () => {
    const candidates = new InMemoryCandidateRepository();
    const handler = createExtractCandidateHandler({
      extractor: new HeuristicTypeExtractor(),
      candidates,
    });

    await handler(job({ scope, text: "我有抑郁症，正在服用药物。", intent: "auto" }));

    const pending = await candidates.list({ scope, status: "pending" });
    expect(pending).toHaveLength(0);
  });

  test("无法抽取语义的普通文本不产生候选", async () => {
    const candidates = new InMemoryCandidateRepository();
    const handler = createExtractCandidateHandler({
      extractor: new HeuristicTypeExtractor(),
      candidates,
    });

    await handler(job({ scope, text: "今天天气不错。", intent: "auto" }));

    const pending = await candidates.list({ scope, status: "pending" });
    expect(pending).toHaveLength(0);
  });

  test("payload 缺 text 时安全返回不抛异常", async () => {
    const candidates = new InMemoryCandidateRepository();
    const handler = createExtractCandidateHandler({
      extractor: new HeuristicTypeExtractor(),
      candidates,
    });

    await expect(handler(job({ scope, intent: "auto" }))).resolves.not.toThrow();
    expect(await candidates.count({ scope })).toBe(0);
  });

  test("同 scope 同文本重复 observation 不产生重复 pending 候选", async () => {
    const candidates = new InMemoryCandidateRepository();
    const handler = createExtractCandidateHandler({
      extractor: new HeuristicTypeExtractor(),
      candidates,
    });

    const text = "禁止在未确认前删除生产数据。";
    await handler(job({ scope, text, intent: "auto" }));
    await handler(job({ scope, text, intent: "auto" }));

    const pending = await candidates.list({ scope, status: "pending" });
    expect(pending).toHaveLength(1);
  });

  test("写入候选时记录 audit（注入时）", async () => {
    const candidates = new InMemoryCandidateRepository();
    const audited: string[] = [];
    const handler = createExtractCandidateHandler({
      extractor: new HeuristicTypeExtractor(),
      candidates,
      audit: async ({ action }) => {
        audited.push(action);
      },
    });

    await handler(job({ scope, text: "禁止在未确认前删除生产数据。", intent: "auto" }));
    expect(audited).toContain("candidate.extract");
  });
});
