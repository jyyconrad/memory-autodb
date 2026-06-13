/**
 * 召回评分权重与节点打分。
 *
 * 本文件做什么：把 slot-context-builder 中原先硬编码的 importance*10+hotness
 * 排序公式，提取为显式的 6 因子权重常量 + 可解释打分函数，支持注入自定义权重。
 *
 * 核心设计（plan 评分权重）：
 * - 6 因子：relevance / scopeFit / importance / confidence / evidenceWeight / recency。
 * - 权重之和为 1，分数归一化到 [0,1]，便于跨槽位比较与 eval。
 *
 * v0.1 现实边界：
 * - builder 拿到的是"已召回"记忆，relevance/scopeFit 是召回阶段算的，记录本身不带。
 *   因此这两个因子默认取中性值（0.5），可由调用方通过 signals 注入覆盖。
 * - 实际可得字段近似其余 4 因子：
 *   importance → importance（clamp 到 [0,1]）
 *   confidence → confidence（缺省 1，表示用户显式保存）
 *   evidenceWeight → sourceNodeIds.length（按 EVIDENCE_SATURATION 饱和归一）
 *   recency → hotness（被召回热度，按 RECENCY_SATURATION 饱和归一）
 * - 缺失字段一律用默认值，保证默认权重下排序与原 importance 主导一致。
 * - 纯函数，不修改入参。
 */

import type { MemoryRecord } from "./types.js";

/** 召回评分 6 因子权重。 */
export interface RecallWeights {
  /** 与任务的相关性（召回阶段算，builder 内默认中性） */
  relevance: number;
  /** scope 契合度（召回阶段算，builder 内默认中性） */
  scopeFit: number;
  /** 重要性 */
  importance: number;
  /** 置信度 */
  confidence: number;
  /** 证据充分度 */
  evidenceWeight: number;
  /** 新近/热度 */
  recency: number;
}

/**
 * v0.1 默认权重（plan 评分权重），相加为 1.0。
 */
export const DEFAULT_RECALL_WEIGHTS: RecallWeights = {
  relevance: 0.4,
  scopeFit: 0.2,
  importance: 0.15,
  confidence: 0.1,
  evidenceWeight: 0.1,
  recency: 0.05,
};

/** 证据数量饱和阈值：达到该条数即视为证据充分（归一化分母）。 */
const EVIDENCE_SATURATION = 3;

/** 热度饱和阈值：达到该热度即视为最新近（归一化分母）。 */
const RECENCY_SATURATION = 10;

/** 召回阶段可注入的外部信号（覆盖中性默认）。 */
export interface NodeScoreSignals {
  /** 0-1 相关性（如向量相似度） */
  relevance?: number;
  /** 0-1 scope 契合度 */
  scopeFit?: number;
}

/** 将值约束到 [0,1]。 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** 按饱和阈值把非负计数归一化到 [0,1]。 */
function saturate(value: number, saturation: number): number {
  if (saturation <= 0) return 0;
  return clamp01(value / saturation);
}

/**
 * 计算单条记忆的归一化综合分（[0,1]）。
 *
 * relevance/scopeFit 默认中性 0.5（builder 缺这两个信号），可由 signals 覆盖。
 * 其余因子用记录可得字段近似，缺失字段取默认值。
 */
export function computeNodeScore(
  record: MemoryRecord,
  weights: RecallWeights = DEFAULT_RECALL_WEIGHTS,
  signals: NodeScoreSignals = {},
): number {
  const relevance = clamp01(signals.relevance ?? 0.5);
  const scopeFit = clamp01(signals.scopeFit ?? 0.5);
  const importance = clamp01(record.importance ?? 0.5);
  const confidence = clamp01(record.confidence ?? 1);
  const evidenceWeight = saturate(record.sourceNodeIds?.length ?? 0, EVIDENCE_SATURATION);
  const recency = saturate(record.hotness ?? 0, RECENCY_SATURATION);

  const score =
    weights.relevance * relevance +
    weights.scopeFit * scopeFit +
    weights.importance * importance +
    weights.confidence * confidence +
    weights.evidenceWeight * evidenceWeight +
    weights.recency * recency;

  return clamp01(score);
}

/**
 * 按综合分降序排序（稳定，不修改入参）。
 */
export function sortByNodeScore(
  records: readonly MemoryRecord[],
  weights: RecallWeights = DEFAULT_RECALL_WEIGHTS,
): MemoryRecord[] {
  return [...records].sort(
    (a, b) => computeNodeScore(b, weights) - computeNodeScore(a, weights),
  );
}
