import { describe, expect, test } from "vitest";
import { normalizeScope, scopeToKey } from "./scope.js";

describe("memory scope", () => {
  test("builds a stable scope key with defaults", () => {
    expect(scopeToKey({ appId: "openclaw", namespace: "memories" })).toBe(
      "local:openclaw:default:default:default:memories",
    );
  });

  test("normalizes missing fields and trims scope dimensions", () => {
    expect(
      normalizeScope({
        tenantId: " acme ",
        appId: " openclaw ",
        userId: " user-1 ",
        projectId: " project-a ",
        agentId: " agent-main ",
        namespace: " knowledge ",
      }),
    ).toEqual({
      tenantId: "acme",
      appId: "openclaw",
      userId: "user-1",
      projectId: "project-a",
      agentId: "agent-main",
      namespace: "knowledge",
    });
  });

  test("normalizes empty values to default dimensions", () => {
    expect(
      normalizeScope({
        tenantId: "",
        appId: " ",
        userId: undefined,
        projectId: null,
        agentId: "agent-main",
        namespace: "memories",
      }),
    ).toEqual({
      tenantId: "local",
      appId: "default",
      userId: "default",
      projectId: "default",
      agentId: "agent-main",
      namespace: "memories",
    });
  });

  test("escapes separators so different dimensions do not collapse to the same key", () => {
    const key = scopeToKey({
      tenantId: "local",
      appId: "open:claw",
      userId: "user/1",
      projectId: "project a",
      agentId: "agent:main",
      namespace: "knowledge:docs",
    });

    expect(key).toBe("local:open%3Aclaw:user%2F1:project%20a:agent%3Amain:knowledge%3Adocs");
  });
});
