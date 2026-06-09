import { describe, expect, test } from "vitest";
import { buildOpenClawScope, metadataToOpenClawScope } from "./scope.js";

describe("OpenClaw scope adapter", () => {
  test("builds scope from OpenClaw event fields", () => {
    expect(
      buildOpenClawScope({
        userId: "user-1",
        projectPath: "/workspace/app",
        agentName: "main-agent",
      }),
    ).toEqual({
      tenantId: "local",
      appId: "openclaw",
      userId: "user-1",
      projectId: "/workspace/app",
      agentId: "main-agent",
      namespace: "memories",
    });
  });

  test("uses workspacePath and agentId fallbacks", () => {
    expect(
      buildOpenClawScope({
        workspacePath: "/workspace/fallback",
        agentId: "agent-id",
        tableName: "knowledge",
      }),
    ).toEqual({
      tenantId: "local",
      appId: "openclaw",
      userId: "default",
      projectId: "/workspace/fallback",
      agentId: "agent-id",
      namespace: "knowledge",
    });
  });

  test("maps legacy metadata to scope", () => {
    expect(
      metadataToOpenClawScope({
        userId: "user-1",
        projectPath: "/workspace/app",
        agentName: "agent",
      }, "knowledge_work"),
    ).toEqual({
      tenantId: "local",
      appId: "openclaw",
      userId: "user-1",
      projectId: "/workspace/app",
      agentId: "agent",
      namespace: "knowledge_work",
    });
  });
});
