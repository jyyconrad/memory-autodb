/**
 * Topic tree hotness and routing.
 *
 * 参考 OpenHuman 的确定性 hotness 思路：mention、source 多样性、recency、
 * centrality、query hits 共同决定是否为实体建立 topic tree。
 */

import type { GraphEntityRecord } from "../graph/types.js";
import type { TreeLeaf } from "./types.js";
import { appendLeafToBuffer, type SealPolicy } from "./buffer.js";
import type { TreeRepository } from "./types.js";

export const TOPIC_CREATION_THRESHOLD = 6.0;
export const TOPIC_ARCHIVE_THRESHOLD = 2.0;

export function recencyDecay(now: number, lastSeenAt?: number): number {
  if (!lastSeenAt) {
    return 0;
  }
  const ageDays = Math.max(0, (now - lastSeenAt) / (24 * 60 * 60 * 1000));
  if (ageDays <= 1) {
    return 1;
  }
  if (ageDays <= 7) {
    return 1 - ((ageDays - 1) / 6) * 0.5;
  }
  if (ageDays <= 30) {
    return 0.5 - ((ageDays - 7) / 23) * 0.5;
  }
  return 0;
}

export function computeHotness(entity: GraphEntityRecord, now: number): number {
  return Math.log(entity.mentionCount30d + 1) +
    0.5 * entity.distinctSourceCount +
    recencyDecay(now, entity.lastSeenAt) +
    (entity.graphCentrality ?? 0) +
    2.0 * entity.queryHits30d;
}

export function shouldCreateTopicTree(entity: GraphEntityRecord, now: number): boolean {
  return computeHotness(entity, now) >= TOPIC_CREATION_THRESHOLD;
}

export async function routeLeafToTopicTree(
  repository: TreeRepository,
  leaf: TreeLeaf,
  entities: GraphEntityRecord[],
  now: number,
  policy?: SealPolicy,
) {
  const routed = [];
  for (const entity of entities) {
    if (!leaf.entityIds.includes(entity.id) || !shouldCreateTopicTree(entity, now)) {
      continue;
    }
    routed.push(await appendLeafToBuffer(repository, {
      scope: leaf.scope,
      treeType: "topic",
      treeKey: entity.id,
      leaf,
      now,
    }, policy));
  }
  return routed;
}
