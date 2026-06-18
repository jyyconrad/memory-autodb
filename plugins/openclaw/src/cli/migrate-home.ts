/**
 * OpenClaw `ms migrate-home` 命令：一键迁移 ~/.openclaw/ → ~/.mengshu/。
 *
 * 本文件做什么：实现全局配置目录的自动化迁移，将旧的 OpenClaw 插件路径迁移到独立的
 * mengshu 全局目录，确保配置、密钥、数据库文件的完整性和可追溯性。
 *
 * 核心流程：
 * 1. **默认 dry-run 模式**：不带 `--execute` 时只打印迁移计划，不执行实际文件操作。
 * 2. **迁移清单**（按顺序执行）：
 *    - `~/.openclaw/.env` → `~/.mengshu/.env`（如果源存在）
 *    - `~/.openclaw/mengshu-mcp.json` → `~/.mengshu/config.json`（如果源存在）
 *    - `~/.openclaw/memory/` → `~/.mengshu/memory/`（递归复制整个目录）
 *    - `~/.openclaw/conf/plugins.json` 中的 `entries["mengshu"].config` → 提示用户手工迁移
 * 3. **备份机制**：`--backup` 选项时，迁移前先将 `~/.openclaw/` 复制到 `~/.openclaw.backup-<timestamp>/`。
 * 4. **冲突检测**：目标文件已存在时询问是否覆盖（默认跳过）；`--force` 时直接覆盖。
 * 5. **迁移后验证**：校验关键文件存在性（.env、config.json、memory/lancedb/）。
 * 6. **registry 更新提示**：扫描 `~/.openclaw/` 下的 `.mengshu.json` 项目指针，提示用户可能需要重新 `ms init`。
 *
 * 关键边界（v0.1.2）：
 * - 不自动修改 `~/.openclaw/conf/plugins.json`，只输出迁移指引。
 * - 不删除源目录，由用户确认迁移成功后手动清理。
 * - 项目指针 `.mengshu.json` 不迁移（属于项目目录，不属于全局目录）。
 * - 迁移失败时输出明确错误，不做部分回滚（用户可用备份恢复）。
 */

import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import type { CommanderLike } from "./index.js";
import {
  resolveHomeDir,
  resolveLegacyHomeDir,
  resolveConfigPath,
  resolveEnvPath,
  type HomePathOptions,
  CONFIG_FILENAME,
  ENV_FILENAME,
  MEMORY_DIRNAME,
  LANCEDB_DIRNAME,
} from "../../../../core/paths.js";
import {
  isOpenClawMemoryPluginId,
  OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS,
  OPENCLAW_MEMORY_PLUGIN_ID,
} from "../plugin-id.js";

/** 迁移选项 */
export interface MigrateHomeOptions {
  /** 是否为 dry-run 模式（默认 true） */
  dryRun?: boolean;
  /** 是否备份旧目录（默认 false） */
  backup?: boolean;
  /** 是否强制覆盖已存在的目标文件（默认 false） */
  force?: boolean;
  /** 全局 home 路径选项 */
  homePathOptions?: HomePathOptions;
}

export interface MigrateOpenClawPluginIdOptions {
  dryRun?: boolean;
  configPath?: string;
  backup?: boolean;
  keepLegacyEntry?: boolean;
}

export interface OpenClawPluginIdMigrationPlan {
  configPath: string;
  fromSlot?: string;
  toSlot: typeof OPENCLAW_MEMORY_PLUGIN_ID;
  movedEntryFrom?: string;
  createdEntry: boolean;
  disabledLegacyEntries: string[];
  changed: boolean;
}

/** 迁移任务项 */
interface MigrationTask {
  /** 源路径 */
  source: string;
  /** 目标路径 */
  target: string;
  /** 任务类型 */
  type: "file" | "directory";
  /** 是否必需（源不存在时是否报错） */
  required: boolean;
}

/** 迁移结果 */
interface MigrationResult {
  /** 成功复制的文件/目录数 */
  copied: number;
  /** 跳过的文件数 */
  skipped: number;
  /** 失败的文件数 */
  failed: number;
  /** 错误信息 */
  errors: string[];
}

/**
 * 生成迁移任务清单
 */
function generateMigrationTasks(
  legacyHome: string,
  newHome: string,
): MigrationTask[] {
  return [
    // 1. 环境变量文件
    {
      source: join(legacyHome, ENV_FILENAME),
      target: join(newHome, ENV_FILENAME),
      type: "file",
      required: false,
    },
    // 2. 配置文件（旧名称 mengshu-mcp.json → 新名称 config.json）
    {
      source: join(legacyHome, "mengshu-mcp.json"),
      target: join(newHome, CONFIG_FILENAME),
      type: "file",
      required: false,
    },
    // 3. 数据库目录
    {
      source: join(legacyHome, MEMORY_DIRNAME),
      target: join(newHome, MEMORY_DIRNAME),
      type: "directory",
      required: false,
    },
  ];
}

/**
 * 创建备份目录
 */
function createBackup(legacyHome: string, dryRun: boolean): string | null {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
  const backupDir = `${legacyHome}.backup-${timestamp}`;

  if (dryRun) {
    console.log(`[DRY-RUN] 将创建备份: ${backupDir}`);
    return backupDir;
  }

  try {
    cpSync(legacyHome, backupDir, { recursive: true });
    console.log(`✓ 备份完成: ${backupDir}`);
    return backupDir;
  } catch (error) {
    console.error(`✗ 备份失败: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * 执行单个迁移任务
 */
function executeMigrationTask(
  task: MigrationTask,
  force: boolean,
  dryRun: boolean,
): { success: boolean; skipped: boolean; error?: string } {
  // 检查源是否存在
  if (!existsSync(task.source)) {
    if (task.required) {
      return { success: false, skipped: false, error: `源路径不存在: ${task.source}` };
    }
    return { success: true, skipped: true };
  }

  // 检查目标是否已存在
  if (existsSync(task.target) && !force) {
    console.log(`⊘ 跳过（目标已存在）: ${task.target}`);
    return { success: true, skipped: true };
  }

  if (dryRun) {
    console.log(`[DRY-RUN] ${task.source} → ${task.target}`);
    return { success: true, skipped: false };
  }

  try {
    // 确保目标目录存在
    const targetDir = task.type === "directory" ? task.target : join(task.target, "..");
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // 执行复制
    if (task.type === "file") {
      copyFileSync(task.source, task.target);
      console.log(`✓ ${basename(task.source)} → ${task.target}`);
    } else {
      cpSync(task.source, task.target, { recursive: true });
      console.log(`✓ ${basename(task.source)}/ → ${task.target}/`);
    }

    return { success: true, skipped: false };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`✗ 迁移失败: ${task.source} - ${errorMsg}`);
    return { success: false, skipped: false, error: errorMsg };
  }
}

/**
 * 验证迁移结果
 */
function verifyMigration(newHome: string, dryRun: boolean): boolean {
  const criticalPaths = [
    join(newHome, ENV_FILENAME),
    join(newHome, CONFIG_FILENAME),
    join(newHome, MEMORY_DIRNAME, LANCEDB_DIRNAME),
  ];

  if (dryRun) {
    console.log("\n[DRY-RUN] 迁移后将验证以下关键路径:");
    for (const path of criticalPaths) {
      console.log(`  - ${path}`);
    }
    return true;
  }

  console.log("\n验证迁移结果...");
  let allValid = true;

  for (const path of criticalPaths) {
    const exists = existsSync(path);
    const status = exists ? "✓" : "⊘";
    console.log(`  ${status} ${path}`);
    if (!exists) {
      allValid = false;
    }
  }

  return allValid;
}

/**
 * 扫描旧目录下的项目指针
 */
function scanProjectPointers(legacyHome: string, maxDepth: number = 3): string[] {
  const pointers: string[] = [];

  function scan(dir: string, depth: number): void {
    if (depth > maxDepth || !existsSync(dir)) {
      return;
    }

    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);

        // 跳过隐藏目录和常见大目录
        if (entry.startsWith(".") || ["node_modules", "dist", "build"].includes(entry)) {
          continue;
        }

        const stat = statSync(fullPath);
        if (stat.isFile() && entry === ".mengshu.json") {
          pointers.push(fullPath);
        } else if (stat.isDirectory()) {
          scan(fullPath, depth + 1);
        }
      }
    } catch (error) {
      // 忽略权限错误等
    }
  }

  scan(legacyHome, 0);
  return pointers;
}

function readJsonObject(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function disabledLegacyEntry(entry: unknown): Record<string, unknown> {
  const cloned = cloneJson(objectRecord(entry));
  return {
    ...cloned,
    enabled: false,
  };
}

export function planOpenClawPluginIdMigration(
  rawConfig: Record<string, unknown>,
  options: Pick<MigrateOpenClawPluginIdOptions, "configPath" | "keepLegacyEntry"> = {},
): { nextConfig: Record<string, unknown>; plan: OpenClawPluginIdMigrationPlan } {
  const nextConfig = cloneJson(rawConfig);
  const pluginRoot = nextConfig.plugins && typeof nextConfig.plugins === "object" && !Array.isArray(nextConfig.plugins)
    ? objectRecord(nextConfig.plugins)
    : nextConfig;
  const slots = objectRecord(pluginRoot.slots);
  pluginRoot.slots = slots;
  const entries = objectRecord(pluginRoot.entries);
  pluginRoot.entries = entries;
  const keepLegacyEntry = options.keepLegacyEntry ?? false;

  const legacyIds = [...OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS];
  const currentSlot = typeof slots.memory === "string" ? slots.memory : undefined;
  const candidateIds = [
    currentSlot,
    OPENCLAW_MEMORY_PLUGIN_ID,
    ...legacyIds,
  ].filter((id): id is string => typeof id === "string");
  const sourceEntryId = candidateIds.find((id) => entries[id] !== undefined);
  const sourceEntry = sourceEntryId ? entries[sourceEntryId] : undefined;
  const hadCanonicalEntry = entries[OPENCLAW_MEMORY_PLUGIN_ID] !== undefined;
  const disabledLegacyEntries: string[] = [];

  if (sourceEntry !== undefined && !hadCanonicalEntry) {
    entries[OPENCLAW_MEMORY_PLUGIN_ID] = cloneJson(sourceEntry);
  }

  for (const legacyId of legacyIds) {
    if (entries[legacyId] !== undefined && keepLegacyEntry) {
      entries[legacyId] = disabledLegacyEntry(entries[legacyId]);
      disabledLegacyEntries.push(legacyId);
    } else if (entries[legacyId] !== undefined) {
      delete entries[legacyId];
    }
  }

  const knownMemorySlot = currentSlot === undefined || isOpenClawMemoryPluginId(currentSlot);
  if (knownMemorySlot) {
    slots.memory = OPENCLAW_MEMORY_PLUGIN_ID;
  }

  const changed = JSON.stringify(rawConfig) !== JSON.stringify(nextConfig);
  return {
    nextConfig,
    plan: {
      configPath: options.configPath ?? "~/.openclaw/conf/plugins.json",
      fromSlot: currentSlot,
      toSlot: OPENCLAW_MEMORY_PLUGIN_ID,
      movedEntryFrom: sourceEntryId && sourceEntryId !== OPENCLAW_MEMORY_PLUGIN_ID ? sourceEntryId : undefined,
      createdEntry: sourceEntry !== undefined && !hadCanonicalEntry,
      disabledLegacyEntries,
      changed,
    },
  };
}

function printOpenClawPluginIdMigrationPlan(plan: OpenClawPluginIdMigrationPlan): void {
  console.log("=".repeat(60));
  console.log("OpenClaw 插件 ID 迁移");
  console.log("=".repeat(60));
  console.log(`配置文件: ${plan.configPath}`);
  console.log(`memory slot: ${plan.fromSlot ?? "<未设置>"} → ${plan.toSlot}`);
  if (plan.movedEntryFrom) {
    console.log(`entry: ${plan.movedEntryFrom} → ${OPENCLAW_MEMORY_PLUGIN_ID}`);
  } else {
    console.log(`entry: ${OPENCLAW_MEMORY_PLUGIN_ID}`);
  }
  if (plan.disabledLegacyEntries.length > 0) {
    console.log(`legacy entries disabled: ${plan.disabledLegacyEntries.join(", ")}`);
  } else {
    console.log(`legacy entries removed: ${OPENCLAW_LEGACY_MEMORY_PLUGIN_IDS.join(", ")}`);
  }
  console.log(`需要写入: ${plan.changed ? "是" : "否"}`);
  console.log("=".repeat(60));
}

function defaultOpenClawPluginConfigPaths(): string[] {
  const legacyHome = resolveLegacyHomeDir();
  return [
    join(legacyHome, "openclaw.json"),
    join(legacyHome, "conf", "plugins.json"),
  ].filter((path, index, paths) => paths.indexOf(path) === index && existsSync(path));
}

async function migrateOpenClawPluginIdFile(
  configPath: string,
  options: Omit<MigrateOpenClawPluginIdOptions, "configPath"> = {},
): Promise<OpenClawPluginIdMigrationPlan> {
  const dryRun = options.dryRun ?? true;
  if (!existsSync(configPath)) {
    throw new Error(`OpenClaw 插件配置不存在: ${configPath}`);
  }

  const rawConfig = readJsonObject(configPath);
  const { nextConfig, plan } = planOpenClawPluginIdMigration(rawConfig, {
    configPath,
    keepLegacyEntry: options.keepLegacyEntry,
  });
  printOpenClawPluginIdMigrationPlan(plan);

  if (dryRun) {
    console.log("\n这是预览模式，未写入配置。执行迁移请运行：");
    console.log("  ms migrate-openclaw-plugin-id --execute");
    return plan;
  }

  if (!plan.changed) {
    console.log("\n无需迁移。");
    return plan;
  }

  if (options.backup ?? true) {
    const backupPath = `${configPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(configPath, backupPath);
    console.log(`\n已备份: ${backupPath}`);
  }
  writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  console.log(`已写入: ${configPath}`);
  return plan;
}

export async function migrateOpenClawPluginId(options: MigrateOpenClawPluginIdOptions = {}): Promise<OpenClawPluginIdMigrationPlan[]> {
  const configPaths = options.configPath ? [options.configPath] : defaultOpenClawPluginConfigPaths();
  if (configPaths.length === 0) {
    throw new Error("未找到 OpenClaw 插件配置文件：~/.openclaw/openclaw.json 或 ~/.openclaw/conf/plugins.json");
  }
  const plans: OpenClawPluginIdMigrationPlan[] = [];
  for (const configPath of configPaths) {
    plans.push(await migrateOpenClawPluginIdFile(configPath, {
      dryRun: options.dryRun,
      backup: options.backup,
      keepLegacyEntry: options.keepLegacyEntry,
    }));
  }
  return plans;
}

/**
 * 执行迁移
 */
export async function migrateHome(options: MigrateHomeOptions = {}): Promise<void> {
  const dryRun = options.dryRun ?? true;
  const backup = options.backup ?? false;
  const force = options.force ?? false;
  const homePathOptions = options.homePathOptions ?? {};

  const legacyHome = resolveLegacyHomeDir(homePathOptions);
  const newHome = resolveHomeDir(homePathOptions);

  console.log("=".repeat(60));
  console.log("mengshu 全局配置目录迁移");
  console.log("=".repeat(60));
  console.log(`源目录: ${legacyHome}`);
  console.log(`目标目录: ${newHome}`);
  console.log(`模式: ${dryRun ? "DRY-RUN（预览）" : "执行"}`);
  console.log(`备份: ${backup ? "是" : "否"}`);
  console.log(`强制覆盖: ${force ? "是" : "否"}`);
  console.log("=".repeat(60));
  console.log();

  // 1. 检查源目录是否存在
  if (!existsSync(legacyHome)) {
    console.error(`✗ 错误: 源目录不存在: ${legacyHome}`);
    console.log("\n提示: 如果您是新安装用户，无需迁移，直接使用新路径即可。");
    process.exit(1);
  }

  // 2. 检查目标目录是否部分存在
  if (existsSync(newHome)) {
    console.log(`⚠ 警告: 检测到已有目标目录 ${newHome}`);
    console.log("  部分文件可能冲突。使用 --force 可强制覆盖。\n");
  }

  // 3. 备份（如果启用）
  if (backup) {
    const backupDir = createBackup(legacyHome, dryRun);
    if (!backupDir && !dryRun) {
      console.error("✗ 备份失败，迁移中止。");
      process.exit(1);
    }
    console.log();
  }

  // 4. 生成迁移任务
  const tasks = generateMigrationTasks(legacyHome, newHome);

  console.log("迁移清单:");
  for (const task of tasks) {
    const exists = existsSync(task.source);
    const status = exists ? "✓" : "⊘";
    console.log(`  ${status} ${task.source} → ${task.target}`);
  }
  console.log();

  // 5. 执行迁移
  const result: MigrationResult = {
    copied: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  console.log("开始迁移...\n");
  for (const task of tasks) {
    const taskResult = executeMigrationTask(task, force, dryRun);
    if (taskResult.success) {
      if (taskResult.skipped) {
        result.skipped++;
      } else {
        result.copied++;
      }
    } else {
      result.failed++;
      if (taskResult.error) {
        result.errors.push(taskResult.error);
      }
    }
  }

  // 6. 验证迁移结果
  const verified = verifyMigration(newHome, dryRun);

  // 7. 扫描项目指针
  const projectPointers = scanProjectPointers(legacyHome);
  if (projectPointers.length > 0) {
    console.log(`\n⚠ 检测到 ${projectPointers.length} 个项目指针（.mengshu.json）:`);
    for (const pointer of projectPointers) {
      console.log(`  - ${pointer}`);
    }
    console.log("\n建议: 迁移完成后，对这些项目重新运行 `ms init` 以更新 registry。");
  }

  // 8. 检查 plugins.json
  const pluginsJsonPath = join(legacyHome, "conf", "plugins.json");
  if (existsSync(pluginsJsonPath)) {
    console.log("\n⚠ 检测到 OpenClaw 插件配置: ~/.openclaw/conf/plugins.json");
    console.log("  如果其中包含 mengshu 内联配置，请手动迁移到 ~/.mengshu/config.json");
    console.log("  或更新插件配置使用 configPath/envPath 指向新路径。");
  }

  // 9. 输出摘要
  console.log("\n" + "=".repeat(60));
  console.log("迁移摘要");
  console.log("=".repeat(60));
  console.log(`✓ 成功: ${result.copied}`);
  console.log(`⊘ 跳过: ${result.skipped}`);
  console.log(`✗ 失败: ${result.failed}`);

  if (result.errors.length > 0) {
    console.log("\n错误详情:");
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (dryRun) {
    console.log("\n这是预览模式，未执行实际迁移。");
    console.log("使用 --execute 参数执行迁移:");
    console.log("  ms migrate-home --execute");
    if (!backup) {
      console.log("\n建议添加 --backup 参数以自动备份旧目录:");
      console.log("  ms migrate-home --execute --backup");
    }
  } else {
    if (verified && result.failed === 0) {
      console.log("\n✓ 迁移成功！");
      console.log("\n后续步骤:");
      console.log("  1. 验证配置: ms stats");
      console.log("  2. 测试功能: ms search \"test\"");
      console.log("  3. 更新客户端配置（Codex/Claude Desktop/OpenClaw）指向新路径");
      console.log(`  4. 确认无问题后可删除旧目录: rm -rf ${legacyHome}`);
    } else {
      console.log("\n⚠ 迁移完成，但存在错误或验证失败。");
      console.log("  请检查上述错误详情，可能需要手动处理部分文件。");
    }
  }

  console.log("=".repeat(60));
}

/**
 * 注册 `ms migrate-home` 命令
 */
export function registerMigrateHomeCommand(
  memory: CommanderLike,
  options?: { homePathOptions?: HomePathOptions },
): void {
  memory
    .command("migrate-home")
    .description("迁移 ~/.openclaw/ 到 ~/.mengshu/（默认预览模式）")
    .option("--execute", "执行迁移（不带此参数只打印计划）")
    .option("--backup", "迁移前备份 ~/.openclaw")
    .option("--force", "覆盖已存在的目标文件")
    .action(async (...args: unknown[]) => {
      const cmdOptions = args[0] as { execute?: boolean; backup?: boolean; force?: boolean };
      await migrateHome({
        dryRun: !cmdOptions.execute,
        backup: cmdOptions.backup ?? false,
        force: cmdOptions.force ?? false,
        homePathOptions: options?.homePathOptions,
      });
    });

  memory
    .command("migrate-openclaw-plugin-id")
    .description("迁移 OpenClaw memory 插件 id：memory-autodb/mengshu → mengshu-openclaw（默认预览模式）")
    .option("--execute", "执行迁移（不带此参数只打印计划）")
    .option("--config <path>", "OpenClaw 配置文件路径（默认同时处理 ~/.openclaw/openclaw.json 与 ~/.openclaw/conf/plugins.json）")
    .option("--no-backup", "执行时不备份配置文件")
    .option("--keep-legacy-entry", "迁移后保留旧 entry 并置为 disabled（可能触发 OpenClaw stale config warning）")
    .action(async (...args: unknown[]) => {
      const cmdOptions = args[0] as {
        execute?: boolean;
        config?: string;
        backup?: boolean;
        keepLegacyEntry?: boolean;
      };
      await migrateOpenClawPluginId({
        dryRun: !cmdOptions.execute,
        configPath: cmdOptions.config,
        backup: cmdOptions.backup ?? true,
        keepLegacyEntry: cmdOptions.keepLegacyEntry ?? false,
      });
    });
}
