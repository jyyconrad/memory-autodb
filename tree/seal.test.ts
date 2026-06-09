import { describe, expect, test } from "vitest";
import { appendLeafToBuffer, InMemoryTreeRepository } from "./buffer.js";
import { sealBuffer } from "./seal.js";
import type { TreeLeaf } from "./types.js";

const scope = {
  tenantId: "local",
  appId: "openclaw",
  userId: "user-1",
  projectId: "project-1",
  agentId: "agent-1",
  namespace: "knowledge",
};

function leaf(id: string, text: string, importance: number, eventAt: number): TreeLeaf {
  return {
    id,
    scope,
    chunkId: `chunk-${id}`,
    sourceId: "file:/docs/guide.md",
    entityIds: [`entity-${id}`],
    importance,
    eventAt,
    createdAt: eventAt,
    text,
    tokenCount: 5,
  };
}

describe("sealBuffer", () => {
  test("creates extractive summary node and removes sealed buffer", async () => {
    const repository = new InMemoryTreeRepository();
    const first = await appendLeafToBuffer(repository, {
      scope,
      treeType: "source",
      treeKey: "file:/docs/guide.md",
      leaf: leaf("1", "lower priority event", 0.3, 1710000000000),
      now: 1710000000000,
    });
    const second = await appendLeafToBuffer(repository, {
      scope,
      treeType: "source",
      treeKey: "file:/docs/guide.md",
      leaf: leaf("2", "important memory tree event", 0.9, 1710000001000),
      now: 1710000001000,
    });

    const node = await sealBuffer(repository, {
      buffer: second.buffer,
      now: 1710000010000,
      title: "Guide Summary",
      relationIds: ["rel-1"],
    });

    expect(node).toMatchObject({
      treeType: "source",
      treeKey: "file:/docs/guide.md",
      level: 1,
      title: "Guide Summary",
      status: "sealed",
      evidenceChunkIds: ["chunk-1", "chunk-2"],
      relationIds: ["rel-1"],
      metadata: { summaryMode: "extractive" },
    });
    expect(node.summary.indexOf("important memory tree event")).toBeLessThan(
      node.summary.indexOf("lower priority event"),
    );
    await expect(repository.getBuffer(first.buffer.id)).resolves.toBeUndefined();
    await expect(repository.getSummary(node.id)).resolves.toEqual(node);
  });
});
