# ms doctor 卡住问题修复记录

**日期**: 2026-06-15  
**版本**: v2026.3.9  
**状态**: ✅ 已修复

---

## 问题描述

执行 `ms doctor` 命令后，终端显示 "mengshu MCP started" 并卡住，无法继续执行诊断命令。

```bash
$ ms doctor
mengshu MCP started (/Users/xxx/.mengshu/config.json)
# 卡住，无任何输出
```

---

## 根本原因

`bin/ms.ts` 入口文件设计问题：

### 旧版实现
```typescript
// bin/ms.ts (旧版)
const configPath = resolveConfigPath();

if (!fs.existsSync(configPath)) {
  const result = await runInteractiveSetup();
  if (!result.configWritten) {
    process.exit(0);
  }
  console.log("\n配置完成，启动 MCP server...\n");
}

// 无论有无参数，都直接启动 MCP server
await import("../scripts/mengshu-mcp.js");
```

**问题**：
1. 没有检查命令行参数
2. 所有情况都启动 MCP stdio server
3. CLI 命令（doctor/stats/search）无法执行

---

## 修复方案

### 新版实现

```typescript
// bin/ms.ts (新版)
async function main(): Promise<void> {
  const configPath = resolveConfigPath();

  // 1. 无参数：启动 MCP server
  if (process.argv.length === 2) {
    if (!fs.existsSync(configPath)) {
      const result = await runInteractiveSetup();
      if (!result.configWritten) {
        process.exit(0);
      }
      console.log("\n配置完成，启动 MCP server...\n");
    }
    await import("../scripts/mengshu-mcp.js");
    return;
  }

  // 2. 有参数：执行 CLI 命令
  // 加载配置和初始化服务
  const cfg = memoryConfigSchema.parse(rawConfig);
  const db = DatabaseFactory.createProvider(cfg, resolvedDbPath);
  const embeddings = new Embeddings(cfg.embedding, cfg.batchProcessing);
  const memoryService = new DefaultMemoryService({ repository, embeddings });

  // 创建 Commander 实例并注册命令
  const program = new Command();
  registerDoctorCliCommands(program, { config: cfg, service: memoryService, embeddings });
  registerMcpCliCommands(program, { service: memoryService, agentFastPath, namespaces });
  // ... 其他命令

  await program.parseAsync(process.argv);
}
```

---

## 修复内容

### 1. 参数检测逻辑
```typescript
// 检查命令行参数数量
if (process.argv.length === 2) {
  // 无参数：MCP server 模式
} else {
  // 有参数：CLI 命令模式
}
```

### 2. CLI 命令注册
- `registerDoctorCliCommands()` - doctor/demo/connect
- `registerMcpCliCommands()` - mcp
- `registerMemoryServerCliCommands()` - serve/status/health
- `registerProjectCliCommands()` - init/list
- `registerMigrateHomeCommand()` - migrate-home
- 内置命令 - stats/search

### 3. TypeScript 类型修复
```typescript
// 修复前
console.log(`[${hit.score}] ${hit.text}`);  // ❌ hit.text 不存在

// 修复后
const record = hit.record as any;
console.log(`[${hit.score}] ${record.text || ''}`);  // ✅ 通过 hit.record 访问
```

---

## 验证步骤

### 1. 测试 doctor 命令
```bash
tsx bin/ms.ts doctor
# 预期输出：
# Mengshu Doctor
# [ok] config: 配置已加载
# [ok] database: DB 连通，记录数 X
# [ok] embedding: embedding 服务可达
# [ok] embedding-model: model=text-embedding-3-small（1536 维）
# [ok] disk: 磁盘可写：/Users/xxx/.mengshu/memory/lancedb
# [ok] manifest: manifest 合法（project=xxx）
```

### 2. 测试其他命令
```bash
# 统计
tsx bin/ms.ts stats

# 搜索
tsx bin/ms.ts search "test query" --limit 5

# 帮助
tsx bin/ms.ts --help
tsx bin/ms.ts doctor --help
```

### 3. 测试 MCP server 模式
```bash
# 无参数：启动 MCP server
tsx bin/ms.ts
# 预期输出：mengshu MCP started (/path/to/config.json)
```

---

## 相关文件

- `bin/ms.ts` - 主入口文件（已修复）
- `adapters/openclaw/cli-doctor.ts` - doctor 命令实现
- `adapters/openclaw/cli-mcp.ts` - mcp 命令实现
- `scripts/mengshu-mcp.ts` - MCP stdio server 入口

---

## 未来改进

### 1. 优化错误提示
当配置不存在时，给出更友好的错误信息：
```typescript
if (!fs.existsSync(configPath)) {
  console.error(`❌ 配置文件不存在: ${configPath}`);
  console.error("请运行以下命令之一初始化配置：");
  console.error("  - ms (无参数，启动交互式设置)");
  console.error("  - ms init (OpenClaw 插件模式)");
  process.exit(1);
}
```

### 2. 添加全局选项
```typescript
program
  .option('--config <path>', '指定配置文件路径')
  .option('--env <path>', '指定环境变量文件路径')
  .option('--debug', '启用调试模式');
```

### 3. 统一命令注册
考虑将所有 CLI 命令注册逻辑提取到单独的 `cli/index.ts`：
```typescript
export function registerAllCommands(program: Command, deps: CliDeps) {
  registerDoctorCliCommands(program, deps);
  registerMcpCliCommands(program, deps);
  registerMemoryServerCliCommands(program, deps);
  // ...
}
```

---

## 参考资料

- [Commander.js 文档](https://github.com/tj/commander.js)
- [Node.js process.argv](https://nodejs.org/api/process.html#processargv)
- OpenClaw Plugin SDK CLI 接口规范
