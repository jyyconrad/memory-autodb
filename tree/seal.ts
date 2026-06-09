/**
 * Memory Tree sealing.
 *
 * 第一阶段提供 extractive summary fallback：按 importance/eventAt 选择 leaf 文本，
 * 生成 sealed SummaryNode，并保留 evidence chunk ids。
 */

import { createHash } from "node:crypto";
import { scopeToKey } from "../core/scope.js";
import type { TreeBuffer, TreeLeaf, TreeRepository, TreeSummaryNode } from "./types.js";

export interface SealBufferInput {
  buffer: TreeBuffer;
  now?: number;
  title?: string;
  relationIds?: string[];
}

function summaryId(buffer: TreeBuffer, sealedAt: number): string {
  return `sum_${createHash("sha256")
    .update([scopeToKey(buffer.scope), buffer.treeType, buffer.treeKey, buffer.level, sealedAt].join(":"))
    .digest("hex")
    .slice(0, 24)}`;
}

function summarizeLeaves(leaves: TreeLeaf[]): string {
  return leaves
    .slice()
    .sort((left, right) => right.importance - left.importance || right.eventAt - left.eventAt)
    .slice(0, 5)
    .map((leaf) => leaf.text?.trim())
    .filter((text): text is string => Boolean(text))
    .join("\n\n");
}

export async function sealBuffer(
  repository: TreeRepository,
  input: SealBufferInput,
): Promise<TreeSummaryNode> {
  const sealedAt = input.now ?? Date.now();
  const leaves = await repository.listLeaves(input.buffer.leafIds);
  const evidenceChunkIds = leaves.map((leaf) => leaf.chunkId);
  const entityIds = Array.from(new Set(leaves.flatMap((leaf) => leaf.entityIds)));
  const eventTimes = leaves.map((leaf) => leaf.eventAt);
  const node: TreeSummaryNode = {
    id: summaryId(input.buffer, sealedAt),
    scope: input.buffer.scope,
    treeType: input.buffer.treeType,
    treeKey: input.buffer.treeKey,
    level: input.buffer.level + 1,
    title: input.title ?? `${input.buffer.treeType}:${input.buffer.treeKey}`,
    summary: summarizeLeaves(leaves) || `${leaves.length} events sealed.`,
    childNodeIds: input.buffer.childNodeIds,
    leafIds: input.buffer.leafIds,
    evidenceChunkIds,
    entityIds,
    relationIds: input.relationIds ?? [],
    tokenCount: input.buffer.tokenCount,
    timeRange: {
      startAt: eventTimes.length > 0 ? Math.min(...eventTimes) : sealedAt,
      endAt: eventTimes.length > 0 ? Math.max(...eventTimes) : sealedAt,
    },
    status: "sealed",
    createdAt: sealedAt,
    sealedAt,
    metadata: { summaryMode: "extractive" },
  };
  await repository.upsertSummary(node);
  await repository.deleteBuffer(input.buffer.id);
  return node;
}
