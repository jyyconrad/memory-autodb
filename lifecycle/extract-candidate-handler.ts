/**
 * extract_candidate job handler。
 *
 * 本文件做什么：消费 observe_light 入队的 extract_candidate job，把 observation
 * 文本经 extractor 抽取为候选，按 decideAdmission 准入策略写入候选区。
 *
 * 核心流程：
 * 1. 解析 payload { scope, text, traceId, intent }，缺 text/scope 安全返回。
 * 2. extractor.extract()（敏感内容在 extractor 源头已过滤，返回 []）。
 * 3. 每个抽取结果走 decideAdmission：route=drop 跳过；其余进候选区 pending。
 * 4. 同 scope 同文本去重：已存在 pending 候选则跳过，避免重复。
 *
 * 关键边界（Milestone C 验收 1）：
 * - 自动抽取（intent=auto）一律进 candidate（pending），绝不直配 active 主库；
 *   主库直配只走 explicit save（memory_store 工具），不经本 handler。
 * - route=memory 的高置信结果在 v0.1 也降级为 pending（保守，等审核），
 *   避免自动链路污染主库。
 */

import { decideAdmission } from "./candidate-types.js";
import type { CandidateRepository } from "./candidate-types.js";
import type { TypeExtractor } from "./type-extractor.js";
import type { MemoryScope } from "../core/types.js";
import type { JobRecord } from "../storage/repositories/types.js";
import type { JobHandler } from "../server/workers.js";

export interface ExtractCandidateHandlerDeps {
  extractor: TypeExtractor;
  candidates: CandidateRepository;
  /** 审计日志（可选）。写入候选时记 candidate.extract。 */
  audit?(input: {
    scope: MemoryScope;
    action: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}

interface ExtractPayload {
  scope?: MemoryScope;
  text?: string;
  traceId?: string;
  intent?: string;
}

function readPayload(job: JobRecord): ExtractPayload {
  const payload = job.payload as ExtractPayload;
  return {
    scope: payload.scope,
    text: typeof payload.text === "string" ? payload.text : undefined,
    traceId: typeof payload.traceId === "string" ? payload.traceId : undefined,
    intent: typeof payload.intent === "string" ? payload.intent : undefined,
  };
}

/** 构造 extract_candidate job handler。 */
export function createExtractCandidateHandler(
  deps: ExtractCandidateHandlerDeps,
): JobHandler {
  return async (job: JobRecord): Promise<{ created: number }> => {
    const { scope, text, traceId, intent } = readPayload(job);
    if (!scope || !text || text.trim().length === 0) {
      return { created: 0 };
    }

    const extracted = await deps.extractor.extract({
      text,
      context: {
        sessionId: scope.sessionId,
        projectId: scope.projectId,
        userId: scope.userId,
      },
      hints: { explicitSave: intent === "remember" },
    });

    // 同 scope 已有 pending 候选文本集合，用于去重。
    const existing = await deps.candidates.list({ scope, status: "pending" });
    const existingTexts = new Set(existing.map((c) => c.text));

    let created = 0;
    for (const candidate of extracted) {
      const decision = decideAdmission(candidate.semanticType, candidate.confidence, candidate.text, {
        hasWhy: candidate.hasWhy,
        hasOutcome: candidate.hasOutcome,
      });
      // route=drop 不入候选；其余（memory/candidate）v0.1 统一进 pending。
      if (decision.route === "drop") {
        continue;
      }
      if (existingTexts.has(candidate.text)) {
        continue;
      }

      const record = await deps.candidates.enqueue({
        scope,
        text: candidate.text,
        semanticType: candidate.semanticType,
        kind: candidate.kind,
        confidence: candidate.confidence,
        reason: candidate.reason,
        evidenceIds: traceId ? [traceId] : [],
        extractor: deps.extractor.name,
        metadata: { ...(candidate.metadata ?? {}), intent: intent ?? "auto", admission: decision.reason },
      });
      existingTexts.add(candidate.text);
      created += 1;

      if (deps.audit) {
        await deps.audit({
          scope,
          action: "candidate.extract",
          targetId: record.id,
          metadata: { semanticType: candidate.semanticType, admission: decision.reason, traceId },
        });
      }
    }

    return { created };
  };
}
