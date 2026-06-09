import { describe, expect, test } from "vitest";
import { createServerHealthSnapshot } from "./health.js";

describe("server health", () => {
  test("combines service health with server metadata", async () => {
    const snapshot = await createServerHealthSnapshot({
      url: "http://127.0.0.1:3847",
      serviceHealth: async () => ({ ok: true, records: 3 }),
    });

    expect(snapshot).toMatchObject({
      ok: true,
      url: "http://127.0.0.1:3847",
      service: { ok: true, records: 3 },
    });
    expect(typeof snapshot.uptimeMs).toBe("number");
  });
});
