import { describe, expect, test } from "vitest";
import type { GraphEntityRecord } from "../graph/types.js";
import { InMemoryTreeRepository } from "./buffer.js";
import { computeHotness, recencyDecay, routeLeafToTopicTree, shouldCreateTopicTree } from "./topic.js";
import type { TreeLeaf } from "./types.js";

const scope = {
  tenantId: "local",
  appId: "openclaw",
  userId: "user-1",
  projectId: "project-1",
  agentId: "agent-1",
  namespace: "knowledge",
};

function entity(overrides: Partial<GraphEntityRecord> = {}): GraphEntityRecord {
  return {
    id: "entity-hot",
    scope,
    canonicalName: "mengshu",
    displayName: "mengshu",
    type: "project",
    aliases: ["mengshu"],
    mentionCount: 10,
    mentionCount30d: 10,
    distinctSourceCount: 4,
    lastSeenAt: 1710000000000,
    hotness: 0,
    graphCentrality: 0.5,
    queryHits30d: 1,
    status: "active",
    createdAt: 1710000000000,
    updatedAt: 1710000000000,
    metadata: {},
    ...overrides,
  };
}

const leaf: TreeLeaf = {
  id: "leaf-1",
  scope,
  chunkId: "chunk-1",
  sourceId: "file:/docs/guide.md",
  entityIds: ["entity-hot"],
  importance: 0.8,
  eventAt: 1710000000000,
  createdAt: 1710000000000,
  text: "topic event",
  tokenCount: 3,
};

describe("topic tree policy", () => {
  test("computes deterministic hotness with recency decay", () => {
    expect(recencyDecay(1710000000000, 1710000000000)).toBe(1);
    expect(computeHotness(entity(), 1710000000000)).toBeGreaterThan(6);
    expect(shouldCreateTopicTree(entity(), 1710000000000)).toBe(true);
    expect(shouldCreateTopicTree(entity({ mentionCount30d: 0, distinctSourceCount: 0, queryHits30d: 0, graphCentrality: 0 }), 1710000000000)).toBe(false);
  });

  test("routes hot entity leaves into topic buffers only", async () => {
    const repository = new InMemoryTreeRepository();
    const routed = await routeLeafToTopicTree(
      repository,
      leaf,
      [entity(), entity({ id: "cold", mentionCount30d: 0, distinctSourceCount: 0, queryHits30d: 0, graphCentrality: 0 })],
      1710000000000,
      { maxLeafCount: 1 },
    );

    expect(routed).toHaveLength(1);
    expect(routed[0].buffer.treeType).toBe("topic");
    expect(routed[0].buffer.treeKey).toBe("entity-hot");
    expect(routed[0].shouldSeal).toBe(true);
  });
});
