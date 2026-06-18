import { describe, expect, test } from "vitest";
import rootPlugin from "../../../index.js";
import memoryPlugin from "./index.js";

describe("OpenClaw plugin package entry", () => {
  test("uses mengshu-openclaw as canonical memory plugin id with legacy aliases", () => {
    expect(memoryPlugin.id).toBe("mengshu-openclaw");
    expect(memoryPlugin.legacyPluginIds).toContain("memory-autodb");
    expect(memoryPlugin.legacyPluginIds).toContain("mengshu");
    expect(memoryPlugin.kind).toBe("memory");
    expect(memoryPlugin.configSchema).toBeDefined();
    expect(memoryPlugin.register).toBeInstanceOf(Function);
  });

  test("root entry remains a compatibility re-export", () => {
    expect(rootPlugin).toBe(memoryPlugin);
  });
});
