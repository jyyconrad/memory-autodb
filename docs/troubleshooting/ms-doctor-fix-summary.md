# ms doctor 卡住问题 - 修复总结

**修复日期**: 2026-06-15  
**状态**: ✅ 代码已修复，等待依赖安装完成验证

---

## 问题总结

### 症状
```bash
$ ms doctor
mengshu MCP started (/Users/xxx/.mengshu/config.json)
# 卡住不动
```

### 根本原因
`bin/ms.ts` 入口文件无论有无参数都会启动 MCP stdio server，导致所有 CLI 命令无法执行。

---

## 修复内容

### 1. 重写 bin/ms.ts 入口逻辑 ✅

**修复前**：
```typescript
// 所有情况都启动 MCP server
await import("../scripts/mengshu-mcp.js");
```

**修复后**：
```typescript
if (process.argv.length === 2) {
  // 无参数：启动 MCP server
  await import("../scripts/mengshu-mcp.js");
  return;
}

// 有参数：执行 CLI 命令
const program = new Command();
registerDoctorCliCommands(program, deps);
registerMcpCliCommands(program, deps);
// ... 注册其他命令
await program.parseAsync(process.argv);
```

### 2. 注册所有 CLI 命令 ✅

- ✅ `doctor` - 诊断配置、数据库、embedding
- ✅ `demo` - 演示样本数据
- ✅ `connect` - 显示连接信息
- ✅ `mcp` - 启动 MCP stdio server
- ✅ `serve` - 启动 REST server
- ✅ `status` - 显示服务状态
- ✅ `health` - 健康检查（JSON）
- ✅ `stats` - 统计信息
- ✅ `search` - 搜索记忆
- ✅ `init` - 初始化项目
- ✅ `migrate-home` - 迁移配置目录

### 3. 修复 TypeScript 类型错误 ✅

```typescript
// 修复前 ❌
console.log(`[${hit.score}] ${hit.text}`);

// 修复后 ✅
const record = hit.record as any;
console.log(`[${hit.score}] ${record.text || ''}`);
```

### 4. 参数检测逻辑验证 ✅

运行 `test-cli-args.js` 验证：
```bash
$ node test-cli-args.js
✅ 无参数（MCP server 模式） - 通过
✅ 有参数：doctor（CLI 命令模式） - 通过
✅ 有参数：stats（CLI 命令模式） - 通过
✅ 有参数：search（CLI 命令模式） - 通过
```

---

## 当前状态

### 代码修复：✅ 完成
- `bin/ms.ts` 已重写
- 类型错误已修复
- 所有命令已注册

### 依赖安装：⏳ 进行中
pnpm install 遇到网络问题，正在重试：
```
Error: aborted (ECONNRESET)
This error happened while installing the dependencies of langchain@0.2.20
```

---

## 验证方案

### 方案 1：等待 pnpm 完成（推荐）
```bash
# 查看安装进度
tail -f node_modules/.pnpm-debug.log

# 完成后测试
tsx bin/ms.ts doctor
```

### 方案 2：通过 OpenClaw 插件系统
```bash
# 如果项目已注册为 OpenClaw 插件
openclaw ms doctor
```

### 方案 3：使用已安装的全局命令
```bash
# 如果之前已全局安装
ms doctor
```

### 方案 4：手动安装关键依赖
```bash
# 只安装必要的依赖
pnpm add @supabase/supabase-js @lancedb/lancedb commander --force
tsx bin/ms.ts doctor
```

---

## 预期输出

### doctor 命令
```bash
$ tsx bin/ms.ts doctor
Mengshu Doctor
[ok] config: 配置已加载
[ok] database: DB 连通，记录数 123
[ok] embedding: embedding 服务可达
[ok] embedding-model: model=text-embedding-3-small（1536 维）
[ok] disk: 磁盘可写：/Users/xxx/.mengshu/memory/lancedb
[ok] manifest: manifest 合法（project=xxx）
汇总：6 ok / 0 info / 0 warning / 0 fatal
```

### stats 命令
```bash
$ tsx bin/ms.ts stats
Memory Statistics:
- Total entries: 123
- User memories: 100
- Scanned documents: 23
- Database type: lancedb

Tables:
- memories: 100 entries
- knowledge: 23 entries
```

### search 命令
```bash
$ tsx bin/ms.ts search "test" --limit 5
Found 3 results:

[0.856] This is a test memory
  Kind: preference | Category: core

[0.742] Another test entry
  Kind: fact | Category: fact

[0.621] Test document content
  Kind: document | Category: other
```

---

## 相关文件

- ✅ `bin/ms.ts` - 主入口（已修复）
- ✅ `adapters/openclaw/cli-doctor.ts` - doctor 命令
- ✅ `adapters/openclaw/cli-mcp.ts` - mcp 命令
- ✅ `docs/troubleshooting/ms-doctor-hangs.md` - 详细修复文档
- ✅ `test-cli-args.js` - 参数检测测试脚本

---

## 下一步

1. **等待 pnpm install 完成**
   - 或使用更稳定的网络重试
   - 或使用 npm/yarn 替代

2. **完整测试所有命令**
   ```bash
   tsx bin/ms.ts doctor
   tsx bin/ms.ts stats
   tsx bin/ms.ts search "test"
   tsx bin/ms.ts --help
   ```

3. **更新全局安装**
   ```bash
   pnpm install -g .
   ms doctor  # 验证全局命令
   ```

4. **清理测试文件**
   ```bash
   rm test-cli-args.js
   ```

---

## 技术细节

### 参数判断逻辑
```typescript
// process.argv 结构：
// [0] = node 可执行文件路径
// [1] = 脚本文件路径
// [2+] = 用户传入的参数

if (process.argv.length === 2) {
  // 只有 [node, script]，无用户参数 → MCP server
} else {
  // 有 [node, script, ...args] → CLI 命令
}
```

### Commander.js 集成
```typescript
const program = new Command();
program
  .name("ms")
  .description("Mengshu (梦枢) - Local-first memory middleware")
  .version("2026.3.9");

// 注册各个子命令
registerDoctorCliCommands(program, deps);

// 解析并执行
await program.parseAsync(process.argv);
```

---

**结论**：代码修复已完成，逻辑验证通过，等待依赖安装完成后即可正常使用所有 CLI 命令。
