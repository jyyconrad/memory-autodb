import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runMengshuCli } from "../../packages/api/src/cli/ms.js";

let homeDir: string | undefined;

afterEach(() => {
  if (homeDir) {
    rmSync(homeDir, { recursive: true, force: true });
    homeDir = undefined;
  }
  delete process.env.MENGSHU_HOME;
  process.exitCode = undefined;
});

describe("ms CLI entry", () => {
  test("prints help through the packages/api CLI entry without requiring config", async () => {
    homeDir = mkdtempSync(join(tmpdir(), "mengshu-cli-home-"));
    process.env.MENGSHU_HOME = homeDir;

    await expect(runMengshuCli(["node", "ms", "--help"])).resolves.toBeUndefined();
    expect(process.exitCode).toBeUndefined();
  });
});
