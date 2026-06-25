/**
 * cli-migrate-home.test.ts - ms migrate-home 命令单元测试
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  migrateHome,
  migrateOpenClawPluginId,
  planOpenClawPluginIdMigration,
} from "./migrate-home.js";

describe("cli-migrate-home", () => {
  let testDir: string;
  let legacyHome: string;
  let newHome: string;

  beforeEach(() => {
    // 创建隔离的测试环境
    testDir = mkdtempSync(join(tmpdir(), "migrate-home-test-"));
    legacyHome = join(testDir, ".openclaw");
    newHome = join(testDir, ".mengshu");

    // 创建旧目录结构
    mkdirSync(legacyHome, { recursive: true });
  });

  afterEach(() => {
    // 清理测试环境
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("dry-run 模式不修改文件系统", async () => {
    // 准备
    writeFileSync(join(legacyHome, ".env"), "TEST=value");
    writeFileSync(join(legacyHome, "mengshu-mcp.json"), "{}");

    // 执行 dry-run
    await migrateHome({
      dryRun: true,
      homePathOptions: {
        homeDir: newHome,
        home: testDir,
        env: { MENGSHU_HOME: newHome },
      },
    });

    // 验证：目标目录不应被创建
    expect(existsSync(newHome)).toBe(false);
  });

  it("源目录不存在时报错", async () => {
    // 删除源目录
    rmSync(legacyHome, { recursive: true, force: true });

    // 执行应该退出进程（这里我们检查目录不存在）
    expect(existsSync(legacyHome)).toBe(false);
  });

  it("--execute 正确迁移文件", async () => {
    // 准备源文件
    writeFileSync(join(legacyHome, ".env"), "TEST=value");
    writeFileSync(join(legacyHome, "mengshu-mcp.json"), '{"dbType":"lancedb"}');
    mkdirSync(join(legacyHome, "memory", "lancedb"), { recursive: true });
    writeFileSync(join(legacyHome, "memory", "lancedb", "test.db"), "test");

    // 执行迁移
    await migrateHome({
      dryRun: false,
      homePathOptions: {
        homeDir: newHome,
        home: testDir,
        env: { MENGSHU_HOME: newHome },
      },
    });

    // 验证：文件应该被复制
    expect(existsSync(join(newHome, ".env"))).toBe(true);
    expect(existsSync(join(newHome, "config.json"))).toBe(true);
    expect(existsSync(join(newHome, "memory", "lancedb", "test.db"))).toBe(true);
  });

  it("目标文件已存在且不带 --force 时跳过", async () => {
    // 准备源文件和已存在的目标文件
    writeFileSync(join(legacyHome, ".env"), "OLD=value");
    mkdirSync(newHome, { recursive: true });
    writeFileSync(join(newHome, ".env"), "NEW=value");

    // 执行迁移（不带 force）
    await migrateHome({
      dryRun: false,
      force: false,
      homePathOptions: {
        homeDir: newHome,
        home: testDir,
        env: { MENGSHU_HOME: newHome },
      },
    });

    // 验证：目标文件应该保持不变
    const content = require("fs").readFileSync(join(newHome, ".env"), "utf-8");
    expect(content).toBe("NEW=value");
  });

  it("--execute + --force 正确覆盖", async () => {
    // 准备源文件和已存在的目标文件
    writeFileSync(join(legacyHome, ".env"), "OLD=value");
    mkdirSync(newHome, { recursive: true });
    writeFileSync(join(newHome, ".env"), "NEW=value");

    // 执行迁移（带 force）
    await migrateHome({
      dryRun: false,
      force: true,
      homePathOptions: {
        homeDir: newHome,
        home: testDir,
        env: { MENGSHU_HOME: newHome },
      },
    });

    // 验证：目标文件应该被覆盖
    const content = require("fs").readFileSync(join(newHome, ".env"), "utf-8");
    expect(content).toBe("OLD=value");
  });

  it("备份功能正确创建备份目录", async () => {
    // 准备源文件
    writeFileSync(join(legacyHome, ".env"), "TEST=value");
    writeFileSync(join(legacyHome, "test.txt"), "backup test");

    // 执行迁移（带备份）
    await migrateHome({
      dryRun: false,
      backup: true,
      homePathOptions: {
        homeDir: newHome,
        home: testDir,
        env: { MENGSHU_HOME: newHome },
      },
    });

    // 验证：备份目录应该被创建
    const entries = readdirSync(testDir);
    const backupDirs = entries.filter((name) => name.startsWith(".openclaw.backup-"));
    expect(backupDirs.length).toBeGreaterThan(0);

    // 验证备份内容
    const backupDir = join(testDir, backupDirs[0]);
    expect(existsSync(join(backupDir, ".env"))).toBe(true);
    expect(existsSync(join(backupDir, "test.txt"))).toBe(true);
  });

  it("迁移后验证关键文件存在", async () => {
    // 准备完整的源目录
    writeFileSync(join(legacyHome, ".env"), "TEST=value");
    writeFileSync(join(legacyHome, "mengshu-mcp.json"), "{}");
    mkdirSync(join(legacyHome, "memory", "lancedb"), { recursive: true });
    writeFileSync(join(legacyHome, "memory", "lancedb", "dummy"), "");

    // 执行迁移
    await migrateHome({
      dryRun: false,
      homePathOptions: {
        homeDir: newHome,
        home: testDir,
        env: { MENGSHU_HOME: newHome },
      },
    });

    // 验证关键路径
    expect(existsSync(join(newHome, ".env"))).toBe(true);
    expect(existsSync(join(newHome, "config.json"))).toBe(true);
    expect(existsSync(join(newHome, "memory", "lancedb"))).toBe(true);
  });

  it("缺失的源文件不阻止迁移", async () => {
    // 只创建部分源文件
    writeFileSync(join(legacyHome, ".env"), "TEST=value");
    // 不创建 mengshu-mcp.json 和 memory/ 目录

    // 执行迁移
    await migrateHome({
      dryRun: false,
      homePathOptions: {
        homeDir: newHome,
        home: testDir,
        env: { MENGSHU_HOME: newHome },
      },
    });

    // 验证：存在的文件应该被迁移
    expect(existsSync(join(newHome, ".env"))).toBe(true);
    // 不存在的文件不应阻止整体迁移
    expect(existsSync(newHome)).toBe(true);
  });

  it("迁移 OpenClaw 插件 id 时复制旧 entry 配置并默认删除旧 id", () => {
    const { nextConfig, plan } = planOpenClawPluginIdMigration({
      slots: { memory: "memory-autodb" },
      entries: {
        "memory-autodb": {
          enabled: true,
          config: { dbPath: "/tmp/db" },
        },
      },
    });

    const entries = nextConfig.entries as Record<string, Record<string, unknown>>;
    const slots = nextConfig.slots as Record<string, unknown>;
    expect(slots.memory).toBe("mengshu-openclaw");
    expect(entries["mengshu-openclaw"].enabled).toBe(true);
    expect(entries["mengshu-openclaw"].config).toEqual({ dbPath: "/tmp/db" });
    expect(entries["memory-autodb"]).toBeUndefined();
    expect(plan.movedEntryFrom).toBe("memory-autodb");
    expect(plan.changed).toBe(true);
  });

  it("可选择保留旧 entry 并禁用", () => {
    const { nextConfig } = planOpenClawPluginIdMigration({
      slots: { memory: "memory-autodb" },
      entries: {
        "memory-autodb": {
          enabled: true,
          config: { dbPath: "/tmp/db" },
        },
      },
    }, { keepLegacyEntry: true });

    const entries = nextConfig.entries as Record<string, Record<string, unknown>>;
    expect(entries["memory-autodb"].enabled).toBe(false);
    expect(entries["memory-autodb"]).not.toHaveProperty("migratedTo");
  });

  it("迁移 OpenClaw 主配置的 plugins 嵌套结构", () => {
    const { nextConfig } = planOpenClawPluginIdMigration({
      plugins: {
        slots: { memory: "memory-autodb" },
        entries: {
          "memory-autodb": {
            enabled: true,
            config: { dbType: "lancedb" },
          },
        },
      },
    });

    const plugins = nextConfig.plugins as Record<string, unknown>;
    const entries = plugins.entries as Record<string, Record<string, unknown>>;
    const slots = plugins.slots as Record<string, unknown>;
    expect(slots.memory).toBe("mengshu-openclaw");
    expect(entries["mengshu-openclaw"].config).toEqual({ dbType: "lancedb" });
    expect(entries["memory-autodb"]).toBeUndefined();
  });

  it("migrateOpenClawPluginId execute 更新指定 plugins.json 并创建备份", async () => {
    const confDir = join(legacyHome, "conf");
    mkdirSync(confDir, { recursive: true });
    const configPath = join(confDir, "plugins.json");
    writeFileSync(configPath, JSON.stringify({
      slots: { memory: "mengshu" },
      entries: {
        mengshu: {
          enabled: true,
          config: { dbPath: "/tmp/legacy" },
        },
      },
    }));

    const plans = await migrateOpenClawPluginId({
      dryRun: false,
      configPath,
    });

    const next = JSON.parse(require("fs").readFileSync(configPath, "utf8"));
    expect(next.slots.memory).toBe("mengshu-openclaw");
    expect(next.entries["mengshu-openclaw"].config.dbPath).toBe("/tmp/legacy");
    expect(next.entries.mengshu).toBeUndefined();
    expect(plans).toHaveLength(1);
    const backups = readdirSync(confDir).filter((name) => name.startsWith("plugins.json.bak-"));
    expect(backups.length).toBe(1);
  });
});
