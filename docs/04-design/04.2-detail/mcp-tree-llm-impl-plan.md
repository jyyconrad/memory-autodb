# memory-autodb v0.1+ 增强实施计划：MCP 接入 / 记忆树自动构建 / LLM 客户端

> 日期：2026-06-12
> 状态：已完成（452 测试通过 / tsc 干净 / eval gate PASS）
> 产品定位真源：[product-positioning.md](../../03-architecture/product-positioning.md)
> 上游计划：[next-iteration-product-plan.md](next-iteration-product-plan.md)
> 分支：feature/v0.1-working-context
> 基线：412 测试通过 / branch 覆盖 70.6% / eval gate PASS

---

## 1. 目标

在 v0.1 单 appId Working Context 闭环基础上，补齐三项让产品"配置好模型即可用"的能力：

| 编号 | 能力 | 价值 |
|------|------|------|
| F1 | MCP 真实接入（stdio transport） | 让 Claude Desktop / Cursor 等 MCP 客户端能连上现有召回能力 |
| F2 | LLM 配置 + 客户端 | 让记忆树摘要、候选抽取可用 LLM 增强（非启发式） |
| F3 | 记忆树自动构建 + 实时召回 | observe/ingest 自动沉淀 source/topic/global 树，lookup_deep 可召回 |

实现"基础上下文处理、记忆树构建、上下文实时召回"完整链路。

---

## 2. 代码基线核对（2026-06-12 实测）

### F1 MCP 现状
- `adapters/mcp/server.ts` + `tools.ts`：transport-agnostic facade，已注册 8 工具（save/recall/context/observe/ingest/namespaces/forget/health）
- **缺**：无 `@modelcontextprotocol/sdk` 依赖；不绑定 stdio/http；无 CLI 启动命令；未暴露 agent fast-path（context_fast/observe_light/lookup）

### F2 LLM 现状
- `config.ts` MemoryConfig 只有 `embedding` 块（provider/model/baseURL/apiKey）
- `processing/embeddings.ts` 已用 openai SDK（`openai@^6.22.0` 已装）
- **缺**：无 `llm` 配置块；无 chat completion 客户端；`LLMTypeExtractor` 仅接口未实现

### F3 记忆树现状
- `tree/types.ts`：完整类型（TreeLeaf/TreeBuffer/TreeSummaryNode/TreeRepository）
- `tree/buffer.ts`：`InMemoryTreeRepository` + `appendLeafToBuffer`（返回 shouldSeal）
- `tree/seal.ts`：`sealBuffer`（extractive 摘要，无 LLM）
- `tree/topic.ts` + `global.ts`：recencyDecay/computeHotness/shouldCreateTopicTree/dayKey 辅助
- **缺**：无 job handler；未接到 worker；observe/ingest 不触发；lookup_deep 不查树
- `embed_chunk` job 由 ingest pipeline 入队（pipeline.ts:89），但**也无 handler 接线**（embedding 实际在写入时同步算，job 是占位）

### 既有可复用
- worker loop：`server/workers.ts` `startJobWorkerLoop`（v0.1 收尾已建，daemon 已支持注入）
- daemon：`StartMemoryServerOptions` 已支持 `worker` / `agentFastPath`
- AgentFastPathService：context/observeLight/lookup/sessionCommit 四接口，lookup 已有 mode "fast"|"deep" 字段（deep 未实现差异）

---

## 3. 架构设计

### 3.1 依赖关系
```
F2 (LLM 客户端) ──> F3 (树摘要可选用 LLM，无则 extractive fallback)
F1 (MCP transport) 独立
F3 (树构建) ──> 实时召回 lookup_deep 查树
```

### 3.2 F1：MCP stdio transport
- 新增依赖 `@modelcontextprotocol/sdk`
- 新建 `adapters/mcp/stdio-server.ts`：用 `Server` + `StdioServerTransport` 包装现有 `createMcpMemoryServer`，把工具注册表转为 MCP `ListToolsRequestSchema` / `CallToolRequestSchema` handler
- 扩展 `tools.ts`：增加 agent fast-path 工具（`memory_context_fast` / `memory_observe_light` / `memory_lookup`），注入 AgentFastPathService
- 每个工具补 JSON Schema `inputSchema`（MCP 协议要求）
- 新增 CLI `ltm mcp`（adapters/openclaw/cli-mcp.ts）：启动 stdio MCP server
- 安全：MCP 工具只读 + 受控写，scope 由调用方传入；不暴露内部治理工具

### 3.3 F2：LLM 配置 + 客户端
- `config.ts`：MemoryConfig 加 `llm?` 块（provider/model/baseURL/apiKey/maxTokens/temperature），schema parse 加校验 + allowedKeys
- 新建 `processing/llm-client.ts`：`LlmClient` 类，封装 openai chat.completions，提供 `complete(messages)` / `summarize(text, instruction)`；带并发/重试（复用 p-limit/p-retry 模式）
- 提供 `NullLlmClient`（未配置时的空实现，调用方降级到 extractive）
- 边界：LLM 失败不阻塞主链路，降级 + warning

### 3.4 F3：记忆树自动构建 + 实时召回
- 新建 `tree/build-tree-handler.ts`：`build_tree` job handler
  - payload：{ scope, treeType, treeKey, leaf }
  - 调用 `appendLeafToBuffer` → shouldSeal 时 `sealBuffer`（注入 LlmClient：有则 abstractive，无则 extractive）
- 触发点：
  - observe/session_commit：AgentFastPathService 已入队 extract_candidate，**新增**入队 build_tree（source tree，按 sessionId）
  - ingest pipeline：每个 chunk 入队 build_tree（source tree，按 documentId）
- worker 注册：index.ts handlers 加 `build_tree`
- 实时召回：AgentFastPathService.lookup `mode=deep` 时，除向量召回外，查 TreeRepository.listSummaries 融合返回（source/topic/global）
- 树仍 in-memory（v0.x 不持久化，与 plan §4.2 一致）

---

## 4. 任务账本

| id | 描述 | 状态 | 依赖 | 主要文件 | 写入范围 |
|----|------|------|------|----------|----------|
| F2-1 | LLM config 块 + schema 校验 | pending | - | config.ts, config.middleware.test.ts | config |
| F2-2 | LlmClient + NullLlmClient + 测试 | pending | F2-1 | processing/llm-client.ts(新) | processing |
| F1-1 | 安装 MCP SDK + stdio-server + inputSchema | pending | - | adapters/mcp/stdio-server.ts(新), tools.ts, package.json | adapters/mcp |
| F1-2 | ltm mcp CLI 命令 + index 接线 | pending | F1-1 | adapters/openclaw/cli-mcp.ts(新), index.ts | adapters/openclaw, index |
| F3-1 | build_tree handler + 测试 | pending | F2-2 | tree/build-tree-handler.ts(新) | tree |
| F3-2 | observe/ingest 触发 build_tree + worker 注册 | pending | F3-1 | index.ts, api/agent-fast-path.ts, ingest/pipeline.ts | index, api, ingest |
| F3-3 | lookup_deep 查树融合 + 测试 | pending | F3-1 | api/agent-fast-path.ts | api |

### 并行批次（写入范围不冲突）
- **批次 A（并行）**：F2-1+F2-2（processing/config）、F1-1（adapters/mcp + package.json）、F3-1（tree）—— 三个 agent，文件无重叠
- **批次 B（串行集成，主线程）**：F1-2 + F3-2 + F3-3（都改 index.ts/api，主线程做避免冲突）

---

## 5. 验证门槛

- `npx tsc --noEmit` 通过
- `npx vitest run` 全绿（不破坏 412）
- F1：`ltm mcp` 能启动 stdio server，MCP inspector / 手动 JSON-RPC 能 listTools + callTool
- F2：LlmClient 有 fake 测试；未配置时 NullLlmClient 降级
- F3：build_tree handler 单测；observe→树 seal 端到端；lookup_deep 返回树摘要
- eval 两套仍 PASS

---

## 6. 风险

| 风险 | 处理 |
|------|------|
| MCP SDK 版本/API 变动 | 锁定版本；stdio-server 隔离 SDK 依赖，facade 不变 |
| LLM 调用延迟/失败阻塞链路 | 树构建异步（job）；LLM 失败降级 extractive + warning |
| 树 in-memory 重启丢失 | v0.x 接受（与 plan 一致）；持久化留 v1.x |
| observe 高频触发 build_tree 过载 | dedupeKey 去重；buffer 批量 seal；worker 限流 |
| lookup_deep 延迟超 SLO | deep 模式独立预算，不影响 context_fast 快路径 |

---

## 7. 文档同步

- `docs/05-api/` MCP 工具清单 + ltm mcp 用法
- `docs/06-database/` 树 schema（in-memory 说明）
- `config.example.json` 加 llm 块示例
- `docs/09-changelog/` 版本记录
