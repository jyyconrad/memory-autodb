# memory-autodb 下一步迭代产品方案

> 日期：2026-06-10
> 状态：下一迭代方案
> 基线：基于当前代码实现，而不是只基于长期架构设计。
> 产品定位真源：[product-positioning.md](../../03-architecture/product-positioning.md)
> 评审记录：[next-iteration-product-plan-review.md](next-iteration-product-plan-review.md)、[next-iteration-product-plan-review-v2.md](next-iteration-product-plan-review-v2.md)
> 修订记录：
> - 2026-06-10 基于代码基线核对修正。关键修正：`workspaceId/sessionId/visibility` scope 字段已存在（v3.0），无需迁移；去重/TTL/lifecycle 状态机代码已部分实现但文档缺失，本迭代补文档并对齐；SlotSnapshot 是纯缓存（运行视图在 SlotContextBuilder）；默认库路径实际是 `~/.openclaw/memory/lancedb`。
> - 2026-06-10（v2 评审后）根据可落地性核对重排里程碑。关键修正：跨 appId 复用工程量大（5 大改动，需 4-5 周），从 v0.1 拆出延后到 v0.2；"越用越懂"量化指标无数据采集 pipeline，降级为定性观察；v0.1 聚焦**单 appId 的 Working Context 闭环**，6 周可交付。

---

## 1. 一句话目标

下一步迭代的目标不是继续扩展图谱、树或远程平台，而是把当前已经实现的中间件基线打通成一个可被 Agent Runtime 使用的 **用户工作上下文闭环**。

分两期推进（v2 评审后重排，避免单期工程量爆炸）：

> **v0.1（本迭代，6 周）**：单 appId（OpenClaw）内的 Working Context 闭环。用户在一个工作空间/项目里沉淀的偏好、规则、项目背景、经验和资源线索，能被 `memory_context_fast`、`memory_lookup` 和 Console 快速、安全、可解释地使用。
>
> **v0.2（独立迭代，8-10 周）**：跨 appId 复用。同一用户在产品 A 沉淀的上下文，切换到授权产品 B 后仍可用。这依赖 Owner/Working Context Scope 分离（5 大改动，见 §5.1.1），作为独立迭代推进。

本迭代的产品目标是：Agent 在单 appId 内越用越懂用户、越理解用户的工作；长期记忆可找、可追溯、可撤销。

可度量的核心提升点：

| 期 | 提升点 | 目标 |
|----|--------|------|
| v0.1 | 结构化 5 slot 启动上下文 | `context_fast` 本地 P95 < 250ms |
| v0.1 | 注入安全 + 可解释治理 | private/revoked/stale 误注入率 = 0（硬门槛） |
| v0.1 | 单 appId workspace/project 复用 | 同 workspace 召回率 ≥ 80% |
| v0.2 | 跨 appId 上下文连续性 | cross-app 关键记忆召回率 ≥ 80% |
| v0.3（研究分支）| 越用越懂（行为监控）| 重复解释减少 / 采纳率（需先建采集 pipeline） |

---

## 2. 当前代码基线

下表区分"已实现"和"本迭代新建/扩展"，避免把目标当成现状。已通过代码核对（2026-06-10）。

| 能力 | 当前实现文件 | 已实现 | 本迭代新建/扩展 |
|------|--------------|--------|-----------------|
| 共享核心 | `core/memory-service.ts`、`core/service-types.ts` | `MemoryService` 合同（`storeMemory`/`recall`/`buildContext`/`delete`/`health`）+ default service | 无（保持稳定） |
| Scope | `core/types.ts`、`core/scope.ts`、`adapters/openclaw/scope.ts` | 多维 scope，**已含 `workspaceId`/`sessionId`/`visibility`（v3.0）** | scope policy 复用规则 + 测试（字段已有，补策略层） |
| OpenClaw adapter | `index.ts`、`adapters/openclaw/*` | 旧工具和 hooks 兼容，`memory_context_fast` 已接入 | `appId/workspaceId/projectId` 推导或传入 |
| REST server | `api/rest/router.ts`、`server/daemon.ts` | `/v1/*`、`/v1/agent/*`、`/v1/console/*` | `/v1/agent/context` 增加 `filtered` 字段 |
| MCP facade | `adapters/mcp/*` | transport-agnostic 工具注册表 | 未绑定实际 transport（本迭代不强求） |
| JS SDK | `sdk/js/client.ts` | REST client baseline | context 输出对齐 |
| Agent 快路径 | `api/agent-fast-path.ts`、`core/semantic-types.ts` | context/observe/lookup/sessionCommit 四类接口；context 返回**已含 warnings/telemetry/freshness** | 增加 `filtered`、`taskHints.evidenceIds` 约束 |
| 5 槽位 | `core/semantic-type-mapper.ts`、`core/slot-context-builder.ts`、`core/slot-snapshot.ts` | `kind -> semanticType` 映射、SlotContextBuilder（运行视图）、SlotSnapshot（纯缓存，含 TTL） | 召回评分权重显式化 |
| 候选区 | `lifecycle/candidate-*`、`lifecycle/type-extractor.ts` | 类型、`InMemoryCandidateRepository`、`CandidateReviewService`、`HeuristicTypeExtractor`（确定性启发式，LLM extractor 仅接口） | Console 审核闭环；LLM extractor 暂不做 |
| 去重 / 降级 / 过期 | `ingest/pipeline.ts`、`lifecycle/retention.ts`、`core/types.ts` | contentHash 去重、`retentionSweep` TTL、`MemoryLifecycleStatus`（active/archived/revoked/superseded/promoted）状态机、候选 30 天淘汰 | **补完整设计文档并对齐代码**（M-0，详见 §5.2.0） |
| Console | `console/api.ts`、`console/web/` | Overview / Lookup / Graph / Jobs baseline | Candidates 页面 + API |
| Ingestion | `ingest/*` | document/chunk/job/audit + contentHash 去重基线 | 与 source root 模型打通 |
| Graph/Tree | `graph/*`（`InMemoryGraphRepository`）、`tree/*`（`TreeRepository` 仅接口） | in-memory baseline，**无持久化** | v0.x 保持 in-memory + export，不持久化 |
| CLI | `adapters/openclaw/cli.ts`（serve/status/health/migrate）+ `index.ts`（list/tables/stats/search/query/scan/cleanup/export/kb/rules） | 上述命令 | **新增 init/project/doctor/demo/connect（均不存在）** |
| 评测方案 | `docs/07-test/memory-evaluation-plan.md` | 有方案，无实现 harness 和黄金集 | 黄金集 + Vitest runner |

结论：当前不是“从零实现”。下一迭代要做的是产品化闭环和稳定接入，而不是重新设计核心抽象。**特别注意**：scope 字段、去重、TTL、lifecycle 状态机代码已存在，本迭代主要工作是补策略层、补设计文档、对齐代码，而非新建底层能力。

---

## 3. 目标用户与场景

### 3.1 目标用户

| 用户 | 需求 |
|------|------|
| 用户 | 在不同 Agent 产品、任务和工作场景之间切换时，偏好、规则、项目背景和历史经验仍然可用 |
| Agent 产品开发者 | 用 REST/MCP/SDK 快速接入用户工作上下文，不重写记忆系统 |
| Agent Runtime | 启动任务时一次拿到 prompt-safe 的 5 槽位上下文 |
| 运维/产品管理员 | 通过 Console 速查、预览、审核和诊断记忆状态 |

### 3.2 首批场景

1. **用户偏好持续存在**
   - 用户在一个 Agent 产品中表达“复杂方案先给短结论，再给计划”。
   - 切到另一个授权 Agent 产品后，`memory_context_fast` 仍把这个偏好放入 rules/profile。

2. **工作背景持续存在**
   - 用户在 Claw Research 中沉淀项目背景。
   - 切到另一个任务场景后，任务上下文仍能召回项目目标、边界和资源。

3. **显式记住与速查**
   - 用户要求“记住这个约束”。
   - 后续可通过 `memory_lookup` 或 Console Quick Lookup 找到原文、来源和 evidence。

4. **运行中 observation 进入候选区**
   - Runtime 提交 `observe_light`。
   - 系统 ack 立即返回，后台生成 candidate，Console 可审核。

5. **本机诊断**
   - 产品接入失败时，开发者能用 `ltm doctor` 快速检查 server、配置、scope、数据库和接口健康。

---

## 4. 本迭代产品边界

### 4.1 必做主轴

作为开源项目，v0.x 只做两个产品主轴，不把治理平台、企业后端、路由 DSL、完整 MCP 互操作或通用 RAG 做成近期目标。两个主轴分期推进：

| 编号 | 主轴 | v0.1 范围（本迭代） | v0.2 范围（延后） |
|------|------|---------------------|-------------------|
| P0-1 | Working Context 语义层：scope policy + 5 slot + `context_fast` / `lookup` | **单 appId** 的 workspace/project scope 复用 + 5 slot 输出 + filtered/warning | **跨 appId** 复用（Owner/Working Context Scope 分离，5 大改动，见 §5.1.1） |
| P0-2 | Project Memory Workspace：`ltm init` / project manifest / 多 source root | `ltm init` 只创建 scope identity 和 manifest（**不强制目录索引**） | 完整 `ltm project` 命令族 + 多 source root + scanner 改造 + 增量 evidence |

> v2 评审修正：跨 appId 复用工程量大（实际 4-5 周），从 v0.1 拆出延后 v0.2，避免 6 周里程碑塞入 5 大改动 + 6 个新模块。v0.1 聚焦单 appId 可验证闭环。

### 4.1.1 必要支撑项

支撑项只服务 P0-1/P0-2，不独立扩张为产品线。

| 支撑项 | 范围 |
|--------|------|
| `ltm demo/connect/status` | 只用于验证单 appId 的 Working Context 接入闭环；`doctor` 保持最小诊断 |
| 最小 Console | 只做 Quick Lookup、context preview、candidate 列表；Overview 只显示 scope/记录数/slot freshness/candidate backlog，不做图谱可视化；audit 仅作"最近治理操作"子标签，不独立建页 |
| 候选区最小闭环 | 只保证自动抽取不会直接污染 Durable Memory |
| 黄金集 + quick eval | 只评测单 appId 的 context/lookup/safety，**不含 cross-product suite**（延后 v0.2）；不做通用 benchmark 平台 |

### 4.2 暂不做

| 不做 | 原因 |
|------|------|
| **跨 appId 上下文复用（v0.1）** | **Owner/Working Context Scope 分离工程量大（5 大改动，10 周），延后 v0.2 独立迭代** |
| **行为监控 pipeline（FeedbackCollector / RepetitionDetector）** | **"越用越懂"量化指标降级为定性观察；行为采集 pipeline 延后 v0.3 研究分支** |
| 远程团队同步 | 当前主线是本地优先和用户工作上下文持续存在 |
| 完整 Graphiti/Zep 式 temporal graph | 当前已有 graph in-memory baseline，下一迭代不以图谱为主收益 |
| 记忆树持久化（Source/Topic/Global Tree） | 树保持 in-memory baseline + export，SlotSnapshot 已足够支撑 v0.x 快路径；持久化放 v1.x |
| 上下文路由 DSL / proactive routing | 容易把开源专项变成抽象平台；v0.x 只做简单 slot priority / budget |
| OpenMemory / Letta Agent File 完整互操作 | 保留 REST/MCP/SDK adapter 边界；v0.x 不做 import/export。但 §5.1.1 的 Owner/Working Context Scope 分离架构为 v0.2 互操作预留了 provenance 字段（owner appId/session 可映射到外部格式的来源标记） |
| 企业 Memory Lake / 云端后端 | 当前主线是本地优先开源项目，不做企业基础设施 |
| coding-agent 专用接入 | 当前产品方向不进入 coding-agent 细分赛道 |
| LLM-based extractor | v0.x 用启发式 extractor；LLM 增强在 Milestone D-lite 后按 eval 结果决定 |
| 大而全 SaaS Memory API | 不符合本地优先和用户工作上下文主线 |

---

## 5. 产品功能设计

### 5.1 用户工作上下文 Scope Contract

`MemoryScope`（`core/types.ts`）当前已有 `tenantId/appId/userId/projectId/agentId/namespace`，并**已含 v3.0 新增的 `workspaceId/sessionId/visibility`**（代码核对确认）。因此本迭代不需要新增 scope 字段或做 schema 迁移，只需补**复用策略层**和测试。

关键实现约束：

> 当前 `scopeToKey()` 使用 `tenantId/appId/userId/projectId/agentId/namespace` 生成稳定 key。这个 key 适合底层写入隔离，但如果直接作为 `context_fast` 的唯一召回 key，会导致不同 `appId` 天然隔离，无法实现跨产品 Working Context。因此本迭代必须引入 **Working Context Scope** 查询策略，而不是把完整 owner scope 当成语义复用边界。

层级关系（消除 workspaceId 与 projectId 的歧义）：

> `tenantId ⊇ userId ⊇ workspaceId ⊇ projectId ⊇ sessionId`。一个 workspace 可包含多个 project。`profile`/`rules` 复用在 workspace 层，`task_context` 隔离在 project 层。

| 字段 | 下一迭代约定 |
|------|--------------|
| `tenantId` | 本机默认 `local` |
| `userId` | 用户工作上下文主键 |
| `appId` | 具体接入产品，例如 `claw-research`、`claw-project` |
| `workspaceId` | 同一工作空间内的工作上下文复用边界（包含多个 project） |
| `projectId` | 当前项目或任务域（隶属某 workspace） |
| `agentId` | 当前 runtime 实例名称（与 appId 区分：appId=产品，agentId=实例） |
| `sessionId` | 当前会话，最细粒度 |
| `namespace` | `memories`、`knowledge`、`candidates` 等逻辑空间 |
| `visibility` | `private`、`workspace`、`team`，v0.x 先本地解释 |

#### 5.1.1 Owner Scope 与 Working Context Scope

> **范围标注（v2 评审）**：本节是 **v0.2 跨 appId 复用** 的核心设计，**不在 v0.1 交付范围**。代码核对确认这是 5 大改动（见下方"工程量"），实际 4-5 周。v0.1 只做单 appId 的 workspace/project 复用（同一 `appId=openclaw` 下按 workspaceId/projectId 隔离和复用），不做跨 appId 召回。本节保留作为 v0.2 设计蓝图。

跨产品 Working Context 需要两层 scope：

| Scope | 字段 | 用途 | 是否进入底层 `scopeToKey` |
|-------|------|------|--------------------------|
| Owner Scope | `tenantId/appId/agentId/sessionId/namespace` | provenance、audit、写入归属、冲突解释 | 是，保持现有隔离语义 |
| Working Context Scope | `tenantId/userId/workspaceId/projectId/visibility` | 跨 appId 语义复用、5 slot 召回、project workspace 归属 | 新增查询 key 或 filter 策略 |

写入时：

```text
normalize request scope
  -> resolve Project Workspace manifest
  -> ownerScope = 保留 appId/agentId/sessionId/namespace
  -> workingContextScope = userId/workspaceId/projectId/visibility
  -> store MemoryRecord + provenance.ownerScope + metadata.workingContextScope
```

读取时：

```text
context_fast(requestScope)
  -> resolve Project Workspace manifest
  -> derive workingContextScope
  -> expand candidates by slot policy
       profile/rules: userId + workspaceId
       task_context:  userId + workspaceId + projectId
       experience:    projectId first, workspace promoted only
       resource:      workspaceId + projectId + sourceRootId
  -> filter visibility/lifecycle/conflict
  -> build 5 slot
  -> return owner provenance for every injected block
```

这意味着本迭代不是改掉 `scopeToKey()`，而是在服务层增加一个 `WorkingContextResolver` / `ScopePolicy`：

```typescript
interface WorkingContextScope {
  tenantId: string;
  userId: string;
  workspaceId: string;
  projectId?: string;
  visibility: "private" | "workspace" | "team" | "public";
}

interface OwnerScope {
  tenantId: string;
  appId: string;
  agentId: string;
  sessionId?: string;
  namespace: string;
}

interface ScopeResolution {
  ownerScope: OwnerScope;
  workingContextScope: WorkingContextScope;
  projectId: string;
  workspaceId: string;
  source: "project_manifest" | "request_scope" | "adapter_fallback";
  warnings: string[];
}
```

最小代码落点：

| 模块 | 改动 |
|------|------|
| `core/scope.ts` | 保留 `scopeToKey()`；新增 `workingContextKey()` 或 `deriveWorkingContextScope()` |
| `api/agent-fast-path.ts` | `context()` 不再只调用 `loadRecordsForScope(scope)`；改为通过 scope policy 加载跨 appId 候选 |
| `core/service-types.ts` | repository query 增加 working context filter，或增加服务层组合查询 |
| `adapters/openclaw/scope.ts` | 从 project path / workspace path 推导 project workspace，而不只写 `appId=openclaw` |
| `core/slot-context-builder.ts` | 继续接收已过滤记录；不负责跨产品 scope 展开 |

工程量量级（v2 代码核对，**这是 5 大改动，非"小改动"**）：

| 改动 | 量级 | 核对发现 |
|------|------|----------|
| 新建 `WorkingContextResolver` + `ScopePolicy` 模块 | 大 | 当前完全不存在 |
| LanceDB 查询增加 scope filter | 大 | **`db/providers/lancedb.ts` 当前不过滤 scope 字段，全量向量搜索**；需改查询接口 + 数据模型（metadata 序列化 workspaceId/projectId）+ 索引 |
| `loadRecordsForScope` 接口改造 | 大 | 当前是单 scope 加载约定，跨 appId 聚合需改公共接口（破坏式变更） |
| `.memory-autodb.json` 解析器 | 中 | 文件格式 + 解析 + lookup 链路均不存在 |
| SlotSnapshot cache key 策略 | 中 | 当前以完整 scope 为 key，跨 appId 聚合后语义变 |

> **存储抽象优先（用户决策）**：scope filter 逻辑不绑定 LanceDB 特性，统一走 `DatabaseProvider` 接口（`db/types.ts`）。v0.2 在服务层/provider 接口上实现 working context filter，LanceDB 作为默认 provider 实现；如果 LanceDB 的 metadata filter 性能不达标，可替换为 postgres/supabase（pgvector）或其他 provider 而不改服务层。因此 scope 方案的可行性不赌单一数据库——**A0 spike 只是为了选定 v0.2 默认 provider，不是方案成立的前提**。

复用策略：

1. `profile` 和稳定 `rules` 默认按 `userId + workspaceId` 复用。
2. `task_context` 默认按 `userId + workspaceId + projectId` 复用。
3. `experience` 默认按 `projectId` 复用，可由用户或治理规则提升到 workspace。
4. `resource` 默认按 `workspaceId/projectId` 复用。
5. private/revoked/stale 永远不因产品接入而放宽。

Filter 模式（明确"不放宽"的语义，三选一）：

| 模式 | 含义 | 适用 |
|------|------|------|
| `block_inject` | 不进入 `context_fast`，但 `lookup` 可显式查询 | stale、no_semantic_type、budget_exceeded |
| `block_recall` | 不进入 context 也不进入普通 lookup，仅 `lookup_deep` 显式追溯 | archived |
| `block_read` | 完全不可读，仅审计可见 | revoked、其他用户的 private |

复用边界默认 opt-in（隐私要求，见风险表 RISK-2）：

> 跨 appId 复用 profile/rules 默认开启（同一用户授权范围内），但用户可在 `ltm init` 或 Console 中关闭。task_context/experience 默认不跨 project 复用，需用户显式提升。

交付物：

- `scope policy` 文档和测试（字段已有，补策略层）。
- OpenClaw adapter 支持传入或推导 `appId/workspaceId/projectId`。
- REST/SDK 示例覆盖两个不同 `appId` 复用同一用户工作上下文。
- scope 推导校验：错误的 userId 推导必须拒写并写 audit（见 RISK-3）。

### 5.1.2 Project Workspace 作为跨产品上下文入口

Project Workspace 是 Working Context Scope 的本地真源之一。它负责把“当前目录”解析成稳定的 `workspaceId/projectId`，并让不同 Agent 产品在同一个 project root 下得到一致上下文。

解析顺序：

```text
request.scope.workspaceId/projectId
  -> .memory-autodb.json in cwd or ancestor
  -> ~/.openclaw/memory/projects/<project-id>/manifest.json
  -> adapter metadata projectPath/workspacePath
  -> fallback default scope + warning
```

跨产品示例：

| 动作 | appId | 输入来源 | 解析结果 |
|------|-------|----------|----------|
| `ltm init` | cli | 当前目录 | 创建 `workspaceId=ws-acme`、`projectId=proj-acme` |
| OpenClaw 保存偏好 | `openclaw` | adapter scope + manifest | ownerScope 记 `openclaw`，workingContextScope 记 `ws-acme/proj-acme` |
| Claw Research 启动 | `claw-research` | request scope + manifest | 召回 `ws-acme/proj-acme` 下可复用 profile/rules/task_context |
| Console lookup | `console` | project selector | 展示命中和 owner provenance |

成功标准：

1. 同一 `.memory-autodb.json` 下，不同 `appId` 对同一 `userId/workspaceId/projectId` 的 `profile/rules` 可复用。
2. `task_context` 只在同一 `projectId` 下复用，不跨 project。
3. 每条注入内容能说明 `ownerScope.appId` 和 source/evidence。
4. 删除或关闭 Project Workspace 后，跨产品召回停止，但历史 audit 保留。

### 5.1.3 Working Context 的行为理论支撑

本迭代需要把“越用越懂用户”拆成可实现的行为上下文能力，而不是做不可解释的用户画像。LightRAG 对本项目的价值主要是记忆树和 `lookup_deep` 的技术参考；Working Context 的产品理论则来自社会行为心理学、工作心理学、组织行为学和人机交互。

核心判断：

> Agent 不应该推断用户“是什么人格”，而应该持续学习用户在具体工作中的偏好、目标、约束、资源位置和历史反馈，并在合适 scope 下低成本复用。

理论到实现的映射：

| 理论 | 产品含义 | 数据/实现落点 | 评测口径 |
|------|----------|---------------|----------|
| Big Five / 工作风格 | 用户有稳定的沟通、计划、风险和信息偏好，但系统不能给人格贴标签 | `profile` 只保存行为偏好，例如“先给结论再给方案”；`rules` 保存稳定约束；禁止保存“用户是 X 型人格” | preference reuse hit rate、用户重复说明减少率 |
| Person-environment fit | 好的协作取决于用户偏好、任务环境、工具和约束是否匹配 | Working Context Scope 同时包含 `userId/workspaceId/projectId`；Project Workspace 保存项目环境和 source roots | 同一用户不同 project 的 task_context 不串扰 |
| Goal-setting theory | 当前目标、进度、反馈和承诺会影响任务表现 | `task_context` 保存目标、阶段、未完成项；`memory_session_commit` 写入进展、决策、next actions | task_context freshness、过期任务不误注入 |
| Situated action | 工作行为发生在具体目录、文件、工具和会话情境中 | `ltm init` 建立 Project Workspace；Evidence 绑定文件、会话、tool result 和 source root | project context 召回可追溯到本地 evidence |
| Transactive memory | 长期协作依赖“知道信息在哪里、谁写的、哪个资源可信” | `resource` 保存文件/链接/工具/数据源；owner provenance 记录 appId/session/source | resource lookup success、source/evidence 引用完整率 |
| Common ground / cognitive load | 共享背景减少重复解释和沟通负担，但上下文不能过量注入 | `context_fast` 输出 5 slot 压缩上下文；详细内容走 `lookup`/Console；slot budget 控制 token | context token budget、重复解释减少率、用户纠错率 |

对数据模型的约束：

1. `profile` 必须存“可观察工作偏好”，不得存敏感身份、心理诊断或人格标签。
2. `task_context` 必须带 project/workspace scope、freshness 和 evidence，避免陈旧目标长期污染。
3. `experience` 默认 project 层复用，只有被确认有效或用户提升后才进入 workspace 层。
4. `resource` 必须是指针和摘要，不把大文件全文直接注入 5 slot。
5. 每条可注入记忆必须保留 `ownerScope` 和 `workingContextScope`，用于解释来源与复用边界。

对召回策略的约束：

1. `context_fast` 先满足共同背景和当前目标，再考虑历史经验；不能因为相似度高就注入跨 project 经验。
2. `profile/rules` 可以跨同一 workspace 的授权 app 复用，但必须支持 opt-out。
3. `task_context` 默认只在同一 project 复用；过期或 stale 时只允许 `lookup` 可见，不注入。
4. `resource` 召回优先返回位置、摘要、证据和使用建议，不直接塞入长文本。
5. 冲突偏好进入 candidate/conflict 治理，不自动覆盖旧记忆。

对安全和治理的约束：

1. 禁止 inferred personality label：系统不得自动写入“用户高开放性/低尽责性/内向”等心理判断。
2. 禁止 sensitive trait inference：不得从行为记录推断健康、政治、宗教、性取向等敏感属性。
3. 重要偏好、长期规则和跨 workspace 提升必须有 evidence 或用户确认。
4. Console 需要能展示“为什么这条记忆被用于当前 Agent”，包括 slot、scope、owner、evidence 和过滤原因。

对评测的新增要求：

| 套件 | 新增 case | 判定方式 | 期次 |
|------|-----------|----------|------|
| `memory-autodb-v0.1` | 偏好复用（单 appId）、目标更新、资源速查 | 机械化（sourceId 命中 / lookup 命中） | v0.1 |
| `memory-autodb-v0.1` | 重复说明减少 | **需 LLM judge / 人工标注**（跨会话语义相似度） | **v0.3 行为监控** |
| `memory-autodb-cross-product` | 产品 A 写入偏好，产品 B 可用；A 的 project task 不泄漏到 B 的另一 project | 机械化（依赖跨 appId 召回） | **v0.2** |
| `memory-autodb-safety` | 人格标签不自动生成；敏感属性不写入；stale task 不注入；冲突偏好不自动覆盖 | 机械化（黑名单字符串检测 + lifecycle 断言） | v0.1 |
| `memory-autodb-behavior` | 采纳率（注入 rule 后 agent 是否遵守） | **需 LLM judge + 行为轨迹**，无采集 pipeline | **v0.3 行为监控** |

> v2 评审修正：7 个新 case 中 4 个可机械化（v0.1/v0.2 内），3 个需 LLM judge 或人工标注。"重复说明减少"和"采纳率"依赖 FeedbackCollector / RepetitionDetector（当前不存在，无 Milestone 覆盖），降级为 **v0.3 行为监控研究分支**，不进入 v0.1 验收。

这些理论约束应在 Milestone A0 形成 ADR，后续实现 `HeuristicTypeExtractor`、`ScopePolicy`、`SlotContextBuilder` 和 Console 时作为验收标准。其中"人格标签不生成 / 敏感属性不写入"必须在 A1-lite 通过 extractor 黑名单显式保证（不能靠"碰巧不匹配规则"，见 §11 风险）。

### 5.2 存储视图与 5type 运行视图

5type 是 Runtime 运行视图，不是长期记忆主库的全量存储模型。下一迭代需要明确输入、落盘、存储介质、记忆树和从存储视图到 5 slot 的召回管线。

产品输入分七类：

| 输入 | 入口 | 默认落盘路由 |
|------|------|--------------|
| Runtime observation | `memory_observe_light` | evidence + candidate job |
| Explicit save | `memory_save_explicit` | evidence + MemoryRecord 或 candidate |
| Session commit | `memory_session_commit` | session evidence + task/experience candidate |
| Document ingest | scan / ingest API | local file + Document/Chunk + index/tree jobs |
| Project workspace lifecycle | `ltm init` / `ltm project refresh` | project manifest + source root delta + index/tree jobs |
| Console governance | Console API | candidate/audit/lifecycle + snapshot invalidation |
| Import / migration | import API / CLI | staged import + validation + durable memory |

存储视图分四层：

| 层 | 保存什么 | 和 5type 的关系 |
|----|----------|-----------------|
| Source / Evidence | observation、document、chunk、tool result、provenance | 支撑追溯，不直接注入 |
| Durable Memory | `MemoryRecord`，包含 `kind`、`semanticType?`、scope、lifecycle、evidence | 5 slot 的主候选池 |
| Enrichment / Structure | entity、relation、summary、index、SlotSnapshot | 提供检索、解释和快路径 |
| Candidate / Governance | pending/approved/rejected/archived/expired candidate 和 audit | 审核后才能进入 durable memory |

存储介质边界：

| 介质 | 放什么 | 不放什么 |
|------|--------|----------|
| Structured store | MemoryRecord、Candidate、Document/Chunk metadata、Job、Audit、Lifecycle | 原始大文件 |
| Vector store | active memory、chunk、summary node、可选 entity/relation descriptor | audit、job、权限状态、pending candidate 默认不放 |
| Local files | raw/canonical document、transcript、tree export、eval source、backup package | lifecycle 真源 |
| Tree/graph store | entity、relation、TreeLeaf、TreeBuffer、TreeSummaryNode | 原始全文和权限真源 |
| Text/BM25 index | memory/chunk/summary text | 审计和 job 状态 |

记忆树保留三类：

| Tree | 用途 |
|------|------|
| Source Tree | 来源追溯、文档/会话摘要、evidence drill-down |
| Topic Tree | 围绕实体/项目/工具/文件的主题召回 |
| Global Tree | 工作区、项目、日期维度的整体预览 |

### 5.2.0 核心流程：提取、树构建、去重、降级、过期

本节补齐"how"（评审 M-0）。这些流程部分已有代码（`ingest/pipeline.ts`、`lifecycle/retention.ts`、`lifecycle/candidate-repository.ts`、`core/types.ts`），本迭代主要是补文档、对齐和打通到 Console/Runtime，而不是从零实现。

#### A. 记忆提取管线（input → Durable Memory）

七类输入最终通过下面统一管线落到 Durable Memory，区别只在入口和 extractor 策略：

```text
input (observation / explicit save / session commit / document / project lifecycle / console / import)
  -> 写 Evidence（observation/chunk/tool result，不可变，append-only）
  -> enqueue job: extract_candidate（observe/session）或 ingest（document/project）
  -> extractor:
       · HeuristicTypeExtractor（默认，确定性正则规则，已实现 lifecycle/type-extractor.ts）
       · LLMTypeExtractor（可选增强，本迭代不实现，仅保留接口）
  -> 产出 CandidateRecord { kind, semanticType?, preview, evidenceIds, confidence }
  -> 去重检查（见 C）
  -> 路由：
       · explicit save / 高置信度 → 可直配 MemoryRecord（仍写 audit）
       · 其余 → pending candidate，等待审核
  -> 审核 approve → MemoryService.storeMemory() → active MemoryRecord
```

关键规则：
1. 任何输入都先落 Evidence，再抽取；保证可追溯、可重放。
2. extractor 只产出 candidate，不直接写 active 主库（explicit save 例外，但仍写 audit）。
3. v0.x 默认启发式 extractor；LLM extractor 在 Milestone D-lite 后按 eval 结果决定是否引入。
4. document/project 输入走 `IngestionPipeline`（canonicalize → chunk → dedup → embedding job），chunk 是 Evidence，不是 Durable Memory。

#### B. 记忆树构建（如何从记录/文档生成三类树）

树不是 UI 目录，参与召回。构建链路：

```text
TreeLeaf（来自 MemoryRecord / Chunk / session digest）
  -> TreeBuffer（按维度聚合：Source 按文件/会话，Topic 按 entity/project/tool，Global 按 workspace/project/date）
  -> seal 触发（buffer 大小或时间阈值）
  -> TreeSummaryNode（摘要节点，v0.x 用启发式拼接，可选 LLM 摘要）
  -> 索引到对应 tree
```

| Tree | Leaf 来源 | 聚合维度 | 召回用途 |
|------|-----------|----------|----------|
| Source Tree | Chunk、document、observation | 文件 / 会话 / source root | `lookup_deep` 来源追溯、evidence drill-down |
| Topic Tree | MemoryRecord、entity | entity / project / tool / file | `lookup_deep` 主题/实体召回（对应 LightRAG local） |
| Global Tree | session digest、project digest | workspace / project / date | Console 整体预览、宏观摘要（对应 LightRAG global） |

v0.x 范围：树保持 `InMemoryGraphRepository`/in-memory `TreeRepository`（当前代码状态），**不持久化**，支持 export/import；持久化 provider 放 v1.x。`context_fast` 不依赖树，避免延迟。

#### C. 去重与冲突处理

| 层级 | 去重/冲突判定 | 处理 | 代码现状 |
|------|---------------|------|----------|
| Document/Chunk | `contentHash` 完全相同 | 跳过，计 `chunksDropped` | 已实现 `ingest/pipeline.ts` |
| Observation/Candidate | embedding 相似度 > 0.95 且 scope 匹配 | 合并到已有 candidate，刷新 evidence | 本迭代补 |
| 跨 appId 偏好冲突 | 同 kind/同 scope 但内容矛盾 | 标记 `conflict`，进入 candidate 治理，不自动覆盖 | 本迭代补 |
| 文件移动/重命名 | `contentHash` 不变 | 保留 document identity，只更新 path provenance（`pathHistory[]`） | 本迭代补 |

所有去重/冲突决策写 audit，可在 Console 追溯。

#### D. 降级（lifecycle 状态机）

`MemoryLifecycleStatus`（已在 `core/types.ts`）状态流转：

```text
active ──(ttl 到期/source 删除/被新事实取代)──> stale*
active ──(用户/治理撤销)──> revoked
active ──(被更优记忆取代)──> superseded
active ──(candidate 提升为长期技能)──> promoted
stale/archived ──(retention sweep)──> 物理清理
```

> *注：当前代码 lifecycle 枚举为 `active/archived/revoked/superseded/promoted`，stale 目前通过 SlotSnapshot freshness 和 source 删除标记体现。本迭代明确：stale 作为 `active` 的一个 freshness 子状态或 `archived` 的入口，统一到上述状态机。

各状态的可见性边界：

| 状态 | `context_fast` | `lookup` | Console |
|------|----------------|----------|---------|
| active | 可注入 | 可见 | 可见 |
| stale | **不注入** | 可见（带 stale badge） | 可见 + 告警 |
| archived | 不注入 | 仅 `lookup_deep` 可见 | 可见 |
| revoked | 不注入 | 不可见 | 仅审计可见 |
| superseded | 不注入 | 指向后继记忆 | 可见 + 链接 |
| promoted | 按新形态 | 按新形态 | 可见 |

#### E. 过期（TTL / retention）

`retentionSweep`（已在 `lifecycle/retention.ts`）按 kind 应用 TTL：

| kind | 默认 TTL | 计时起点 | 过期处理 |
|------|----------|----------|----------|
| candidate（pending） | 30 天未命中 | lastAccessedAt | 自动淘汰（已实现 `runEvictionScan`） |
| task_context | 90 天 | lastAccessedAt | soft delete → archived |
| experience | 1 年 | lastAccessedAt | archived（可被用户提升续期） |
| profile | 永久 | — | 不过期 |
| rules | 永久（除非显式撤销） | — | 不过期 |
| resource | 跟随 source root | source 删除时 | 标记 stale → archived |

过期规则：
1. 一律 soft delete（标记 + 保留 audit），物理删除单独由 retention sweep 执行。
2. evidence 在关联记忆全部清理后保留 30 天，再清理孤儿。
3. SlotSnapshot 缓存独立 TTL（profile 30min / task_context 5min / rules 60min / experience 15min / resource 10min，已在 `core/slot-snapshot.ts`），与记忆 TTL 无关。


召回到 5type 的流程：

```text
normalize scope
  -> load fresh SlotSnapshot
  -> retrieve active MemoryRecord
  -> map kind / semanticType / metadata to slot candidates
  -> filter lifecycle / visibility / safety / conflict
  -> score by relevance, scopeFit, importance, confidence, evidence, recency
  -> allocate slot budget
  -> pack prompt-safe 5 slot context with evidence and telemetry
```

关键规则：

1. `semanticType?` 是运行视图字段，不能作为主库强制要求。
2. 无法映射到 5type 的合规记忆保留为 lookup-only。
3. pending candidate、raw observation、raw chunk 不进入 `context_fast`。
4. 每个 slot block 必须能回指 source/evidence。
5. SlotSnapshot 是快路径缓存，不是长期记忆真源；运行视图组装在 `SlotContextBuilder`，SlotSnapshot 只是其短 TTL 缓存结果。

召回评分权重（v0.x 默认，可由 ADR 调整）：

```text
score = 0.40 * relevance      // 向量/BM25 相似度
      + 0.20 * scopeFit       // scope 匹配度（workspace/project 命中越精确越高）
      + 0.15 * importance     // 记忆重要性（profile/rules 偏高）
      + 0.10 * confidence     // extractor/审核置信度
      + 0.10 * evidenceWeight // evidence 数量与质量
      + 0.05 * recency        // 时间衰减
```

被过滤记忆统一通过 `filtered[]` 解释，`filtered.reason` 固定枚举：`pending_candidate`、`raw_evidence`、`lifecycle_stale`、`lifecycle_revoked`、`visibility_private`、`scope_mismatch`、`conflict_unresolved`、`budget_exceeded`、`no_semantic_type`（后者仅说明降级为 lookup-only，不代表错误）。

召回模式：

| 模式 | 用途 | 主要数据 |
|------|------|----------|
| `context_fast` | Agent 启动 5 slot | SlotSnapshot、active MemoryRecord、轻量 text/BM25 |
| `lookup_fast` | 速查具体记忆和证据 | MemoryRecord、chunk index、source/evidence |
| `lookup_deep` | 复杂追溯和整体理解 | vector、BM25、source/topic/global tree、graph relation |

LightRAG 的 `naive/local/global/mix` 可作为 `lookup_deep` 的理论参考：chunk/vector 对应 naive，Topic Tree 对应 local，Global/Source Tree 对应 global，tree + graph + vector 融合对应 mix。`context_fast` 不走 mix，避免延迟和成本失控。

### 5.2.1 Project Memory Workspace

下一迭代需要把“本地目录”提升为一等输入，而不是只把目录扫描当成一次性 knowledge ingest。

产品定义：

> Project Memory Workspace 是用户工作上下文的本地 project root。用户在某个目录执行 `ltm init` 后，memory-autodb 为该目录建立 project identity、scope、manifest、source roots 和增量更新链路。

推荐默认流程：

```bash
cd /path/to/project
ltm init
ltm project index
ltm project context
```

初始化不应把所有文件直接塞进向量库。它应做四件事：

1. 在项目目录生成轻量 `.memory-autodb.json` 指针。
2. 在用户本地全局库创建 `~/.memory-autodb/projects/<project-id>/manifest.json`。
3. 建立默认 source root：当前目录为 `role=project_root`，并应用 include/exclude。
4. 创建初始 indexing job，后续由 `ltm project refresh` 或 watch 增量更新。

它还必须建立跨产品 Working Context 所需的 scope policy：

| Manifest 字段 | 用途 |
|---------------|------|
| `workspaceId` | 跨产品复用边界；多个 project 可以共享 profile/rules |
| `projectId` | task_context/resource 默认隔离边界 |
| `authorizedApps[]` | 哪些 `appId` 可以读写此 workspace，v0.x 可先本地配置 |
| `defaultVisibility` | 新记忆默认 `private` 或 `workspace` |
| `slotReusePolicy` | profile/rules/task_context/experience/resource 的默认复用范围 |
| `sourceRoots[]` | resource/evidence 的本地来源 |

推荐 `.memory-autodb.json` 最小字段：

```json
{
  "projectId": "proj-acme",
  "workspaceId": "ws-acme",
  "projectName": "Acme Research",
  "schemaVersion": "1",
  "defaultVisibility": "workspace",
  "authorizedApps": ["openclaw", "claw-research", "claw-project"],
  "sourceRoots": [
    {
      "rootId": "root-project",
      "path": ".",
      "role": "project_root",
      "include": ["**/*.md", "**/*.txt"],
      "exclude": [".git/**", "node_modules/**", "dist/**"]
    }
  ],
  "slotReusePolicy": {
    "profile": "workspace",
    "rules": "workspace",
    "task_context": "project",
    "experience": "project",
    "resource": "project"
  }
}
```

多目录模型：

| 概念 | 说明 |
|------|------|
| project root | 当前工作上下文的主目录和默认 `projectId` 来源 |
| source root | 参与同一 project workspace 的一个本地目录，可有多个 |
| root role | `project_root`、`docs`、`notes`、`assets`、`external_reference`、`generated_output` |
| tree routing | source root 可决定是否进入 Source Tree、Topic Tree、Global Tree |
| ingest policy | 每个 root 的 include/exclude、敏感文件排除、chunk/index 策略 |

目录层级更新：

| 变化 | 处理 |
|------|------|
| 文件新增/修改 | 更新 Document/Chunk，触发 vector/BM25 和 Source Tree delta |
| 文件删除 | 标记 deleted/stale，tombstone 索引，相关 tree summary stale |
| 文件移动/重命名 | contentHash 相同则保留 document identity，只更新 path provenance |
| source root 增删 | 更新 manifest，按 rootId 局部创建或失效 tree/index |
| include/exclude 改动 | 通过 manifest diff 只处理策略影响到的文件 |

Session commit 和 project refresh 的边界必须清楚：

| 机制 | 输入 | 主要产物 |
|------|------|----------|
| `memory_session_commit` | Agent 运行摘要、决策、任务状态、资源线索 | task_context / experience candidate、global digest |
| `ltm project refresh` | 本地文件系统变化、目录层级变化 | Document/Chunk delta、source/topic/global tree stale/seal、resource candidate |

验收重点不是“扫描了多少文件”，而是当前 project scope 下能不能快速得到准确的 `context_fast`、可追溯的 `lookup`、以及 Console 中可理解的整体预览。

### 5.3 Agent Runtime 快路径增强

当前 `AgentFastPathService`（`api/agent-fast-path.ts`）已有 `context / observeLight / lookup / sessionCommit`，且 `context` 返回（`ContextFastResponse`，`core/semantic-types.ts`）**已含 `warnings`、`telemetry`（latencyMs/nodesUsed/cacheHit/tokenEstimate）、`freshness`**。本迭代主要补 `filtered` 字段并加约束，而非重建结构：

```typescript
interface AgentContextFastResult {
  contextBlock: string;
  slots: Record<string, SlotContextBlock>;
  taskHints: Array<{
    id: string;
    kind: string;
    semanticType?: string;
    preview: string;
    evidenceIds: string[]; // 上限 5；更多在 lookup 中获取
  }>;
  warnings: Array<{ code: WarningCode; message: string }>; // 枚举化，不再用裸 string
  filtered: Array<{ id: string; reason: FilterReason }>;    // 新增；reason 用 §5.2 固定枚举
  freshness: { slotSnapshotAt: string; staleSlots: string[] }; // 已有
  telemetry: {
    latencyMs: number;
    tokenEstimate: number; // 改为必填；无法估算返回 -1
    cacheHit: boolean;
    scopeKey: string;
    nodesUsed: number;
  };
}

type WarningCode = "stale" | "budget_exceeded" | "private_filtered" | "fallback_lookup" | "embedding_unavailable";
type FilterReason = "pending_candidate" | "raw_evidence" | "lifecycle_stale" | "lifecycle_revoked"
  | "visibility_private" | "scope_mismatch" | "conflict_unresolved" | "budget_exceeded" | "no_semantic_type";
```

增强点：

1. `warnings` 枚举化为 `{ code, message }`，v0.x 枚举见上。
2. `filtered` 解释哪些记忆被过滤，`reason` 用 §5.2 固定枚举（区分"规则过滤"和"预算过滤"）。
3. `taskHints` 必须携带 evidence id，每 hint 上限 5 个。
4. `telemetry.tokenEstimate` 改为必填（评测必需），无法估算返回 `-1`。
5. `memory_context_fast` 的 OpenClaw 工具、REST `/v1/agent/context` 和 SDK 输出**三处 schema diff = 0**，用 contract test 校验（列入 Milestone A 验收）。
6. embedding 不可用时降级：BM25 + 缓存 SlotSnapshot 兜底，并发 `embedding_unavailable` warning（见 RISK-4）。

### 5.4 接入体验：connect / doctor / demo

当前已有 `ltm serve/status/health/migrate`（`adapters/openclaw/cli.ts`）和 `list/tables/stats/search/query/scan/cleanup/export/kb/rules`（`index.ts`）。下一迭代补 project workspace 命令、产品化接入命令和数据销毁命令（init/project/doctor/demo/connect/reset 当前均不存在）：

| 命令 | 作用 |
|------|------|
| `ltm init` | 在当前目录初始化 Project Memory Workspace |
| `ltm project status` | 查看 project scope、source roots、索引新鲜度、candidate backlog 和失败 job |
| `ltm project add-root <path>` | 增加一个本地 source root，并声明 role/include/exclude |
| `ltm project index` | 首次索引当前 project workspace |
| `ltm project refresh` | 基于 manifest diff 和 contentHash 做增量更新 |
| `ltm project watch` | 监听目录变化，批量触发 refresh job |
| `ltm project commit` | 把当前 session 摘要、决策和资源变化写回 project memory |
| `ltm project lookup <query>` | 在当前 project scope 下速查记忆、资源和 evidence |
| `ltm project context` | 预览当前 5 slot context |
| `ltm doctor` | 分级检查配置、server、DB、embedding、scope、REST、Console、磁盘、job、candidate backlog、迁移状态 |
| `ltm demo` | 写入一组用户工作上下文 demo 记忆，并演示不同 `appId` 下的 context/lookup |
| `ltm connect openclaw` | 输出 OpenClaw adapter 接入配置、server URL、secret、scope 示例（默认不覆盖已有配置，`--force` 显式覆盖） |
| `ltm reset --project <id>` | 销毁指定 project workspace 的本地数据（隐私要求，需二次确认） |

`ltm doctor` 至少覆盖 10 项，按 `[ok|warn|fatal]` 分级，输出面向产品开发者：

```text
Memory AutoDB Doctor
- server:         ok    http://127.0.0.1:3847
- database:       ok    lancedb ~/.openclaw/memory/lancedb
- disk space:     ok    12.3 GB free
- embedding:      warn  not configured (BM25 fallback active)
- scope policy:   ok    loaded, 5 reuse rules
- last refresh:   ok    2026-06-10T08:12:00Z
- failed jobs:    ok    0
- candidate backlog: warn  142 pending (> 100 threshold)
- console assets: ok    /console
- migration:      ok    schema v3.0
- scope sample:   ok    local:claw-project:user-1:ws-1:proj-1
```

> 基目录说明：当前默认库路径是 `~/.openclaw/memory/lancedb`。v0.x 保持此默认以兼容已发布版本；project manifest 放在 `~/.openclaw/memory/projects/<project-id>/manifest.json`，与库同基目录，不单独引入 `~/.memory-autodb/`，避免迁移成本。如未来需要产品中性基目录，再通过 `ltm migrate` 提供迁移。

### 5.5 Console 最小可用治理闭环

当前 Console API 有 Overview / Lookup / Graph / Jobs。下一迭代聚焦三个页面：

| 页面 | 下一迭代要求 |
|------|--------------|
| Overview | 显示当前 scope、记录数、slot freshness、queued/failed jobs、candidate backlog（含阈值告警）、最近治理操作（audit 子标签） |
| Quick Lookup | 返回 kind、semanticType、preview、evidence/source、score breakdown、copy reference |
| Candidates | pending/archived/rejected 过滤，批量 approve/reject/archive，30 天清理入口，conflict 决议入口 |

audit 不单独建页面，作为 Overview 的"最近治理操作"子标签，控制范围。score breakdown 对用户展示分项得分（relevance/scopeFit 等），但不暴露内部绝对权重数值。不要求做复杂图谱可视化。Graph 页面保留为 baseline，不是验收主线。

### 5.6 候选区闭环

当前已有 `CandidateRecord`、`InMemoryCandidateRepository`、`CandidateReviewService` 和 `HeuristicTypeExtractor`（确定性启发式，无 LLM 依赖）。下一迭代要打通到 Runtime 和 Console：

1. `observe_light` 入队 `extract_candidate`。
2. extractor（v0.x 启发式优先；LLM extractor 仅保留接口，Milestone D-lite 后按 eval 决定）输出 candidate，不直接污染 5 槽位。
3. Console Candidates 可批量审核。
4. approve 后写入 `MemoryService.storeMemory()`。
5. reject/archive/expire 写 audit。
6. conflict candidate（跨 appId 矛盾偏好，见 §5.2.0 C）默认进入 candidate 区，需用户决议，不自动覆盖。
7. `memory_lookup` 可命中已入主库的 lookup-only memory（即无 semanticType 的合规记忆，与 §5.2"fallback"统一为同一概念）；pending candidate 默认不进入 Agent context。

### 5.7 评测和验收

基于 [memory-evaluation-plan.md](../../07-test/memory-evaluation-plan.md)，分期做 quick eval：

| 套件 | 数量 | 目的 | 通过门槛 | 期次 |
|------|------|------|----------|------|
| `memory-autodb-v0.1` | ≥ 30 | 单 appId 的 Agent context、lookup、SlotSnapshot、lookup-only | recall@5 ≥ baseline + 5pt | **v0.1** |
| `memory-autodb-safety` | ≥ 40 | private/revoked/stale/conflict 不误注入 + 人格标签/敏感属性不写入 | 误注入率 = 0（硬门槛） | **v0.1** |
| `memory-autodb-cross-product` | ≥ 30 | 同一用户工作上下文在不同 `appId` 下的连续性 | cross-app recall ≥ 80%，无 P1 case 退化 | **v0.2** |
| `memory-autodb-behavior` | ≥ 20 | 重复解释减少、采纳率 | 需 LLM judge，先定性 | **v0.3 研究分支** |

baseline 定义：`baseline-v4` 必须是**当前 v2.1 代码 freeze 版本**，否则对比无意义。黄金集每条带 `annotator/reviewedAt/version` 元数据保证可审计。

最低可用命令：

```bash
npx tsx eval/cli.ts run --target baseline-v4 --suite local-quick
npx tsx eval/cli.ts run --target vnext --suite local-quick
npx tsx eval/cli.ts compare --base baseline-v4 --candidate vnext
```

如果暂时不实现完整 eval CLI，也必须先落 `eval/goldens/*.jsonl` 和一个 Vitest runner，保证方案可回归。**v0.1 黄金集（≥ 30 v0.1 + ≥ 40 safety）应作为 Milestone A1-lite 的前置验收门槛**；cross-product 和 behavior 套件延后对应期次，不阻塞 v0.1 发布。

---

## 6. 里程碑拆分

> v2 评审修正：里程碑重排为两期。**v0.1（6 周，本迭代）= A0 + A1-lite + A2-lite + B + C + D-lite**，聚焦单 appId 闭环。**v0.2（8-10 周，独立迭代）= A2-v0.2**，做跨 appId 复用 + 完整 Project Workspace。原"6 周完成 A0+A1+A2（含跨 appId）"经代码核对工程量实为 10-14 周，不可行。

### Milestone A0：核心流程文档与黄金集前置（先导）

目标：在写代码前补齐 §5.2.0 五个核心流程的设计落地，并落黄金集，作为后续验收门槛。

交付：

1. §5.2.0 提取/树构建/去重/降级/过期五流程的实现点 checklist 和与现有代码（`ingest/pipeline.ts`、`lifecycle/retention.ts`、`lifecycle/candidate-repository.ts`）的对齐说明。
2. `eval/goldens/memory-autodb-v0.1.jsonl`（≥ 30，**单 appId**）和 `memory-autodb-safety.jsonl`（≥ 40）。**cross-product 黄金集延后 v0.2**。
3. baseline-v4 freeze（当前 v2.1）。
4. ADR：scope 复用 opt-in/opt-out 策略；5type 召回评分权重；越用越懂指标降级为定性观察的决策。
5. **`DatabaseProvider` scope filter spike**（为 v0.2 探路）：在 provider 接口层验证 metadata/scope filter，对比 LanceDB 与 postgres/supabase（pgvector）的过滤性能，选定 v0.2 默认 provider，结论写入 ADR。

验收：

1. 五个核心流程都能定位到现有代码或明确标注"本迭代新建"。
2. 黄金集可被一个 Vitest runner 加载并跑通（哪怕断言先宽松）。
3. spike 结论明确：v0.2 scope filter 走哪个 provider（scope filter 逻辑在服务层/接口层，provider 可替换）。

### Milestone A1-lite：scope policy（单 appId）+ 快路径增强

目标：**单 appId（OpenClaw）内** 的 scope 复用策略层和 `context_fast` 产品化输出可用。**不做跨 appId 召回**（延后 v0.2，见 Milestone A2-v0.2）。

> v2 评审修正：原 Milestone A1 含 `WorkingContextResolver` + 跨 appId 召回 + LanceDB scope filter 改造（5 大改动，4-5 周），从 v0.1 拆出。A1-lite 只在单 appId 下按 workspaceId/projectId 隔离和复用，工程量可控（2-3 周）。

交付：

1. `scope policy` 实现和测试（复用规则 1-5 + Filter 模式 + opt-in），**单 appId 范围**：同一 `appId=openclaw` 下按 workspaceId/projectId 隔离和复用。
2. `/v1/agent/context` 增加 `filtered`，warnings 枚举化，telemetry.tokenEstimate 必填。
3. `memory_context_fast` 工具、REST、SDK 三处 contract test schema diff = 0。
4. scope 推导校验：错误 userId 拒写 + audit。
5. HeuristicTypeExtractor 补人格标签/敏感属性黑名单（保证 safety case 可测，见 §5.1.3）。

验收：

1. 同 appId 下 task_context 不跨 project 泄漏。
2. 同 appId 下 profile/rules 可按 workspaceId 复用。
3. private/revoked 不进入 context；filtered 给出正确 reason。
4. response 中每个注入 slot block 可追溯到 owner appId/session/source。
5. `context_fast` 本地 P95 < 250ms。
6. v0.1 黄金集（单 appId）关键记忆召回 ≥ 80%。
7. safety suite 误注入率 = 0；人格标签/敏感属性不写入。

### Milestone A2-lite：Project Workspace identity（不强制索引）

目标：`ltm init` 可创建稳定 project scope identity 和 manifest，**不强制目录索引**。完整 Project Workspace（多 source root + scanner 改造 + 增量 evidence）延后 v0.2。

> v2 评审修正：原 Milestone A2 含 6 个新模块（ltm project 命令族 + manifest 解析 + scanner 改造 + 第二 appId adapter），3-4 周。A2-lite 只做 identity 和 scope 入口（1 周内），目录索引延后。

交付：

1. `ltm init` 创建 `.memory-autodb.json`（§schema）和本地 project manifest。
2. manifest 包含 `workspaceId/projectId/defaultVisibility/slotReusePolicy`（sourceRoots 字段保留但 v0.1 可为空）。
3. `ltm project status/context/lookup` 最小可用（基于 scope，不依赖目录索引）。

验收：

1. 任意本地目录 `ltm init` 后可看到稳定 project identity 和 manifest。
2. 文件移动但 contentHash 不变时 identity 不变（manifest 随 `.memory-autodb.json` 指针保留）。
3. `ltm project context` 能输出当前 workspace/project 的 5 slot。
4. `npx tsc --noEmit` 和相关 Vitest 通过。

### Milestone A2-v0.2：跨 appId 复用 + 完整 Project Workspace（延后）

> **不在 v0.1 范围**。这是 §5.1.1 Owner/Working Context Scope 分离的落地，作为独立 v0.2 迭代（8-10 周）。

启动前置：LanceDB metadata filter 性能 spike 通过（见 §5.1.1 工程量注）。

交付（v0.2）：

1. `WorkingContextResolver` + `ScopePolicy` 模块。
2. LanceDB 查询支持 scope filter（数据模型 + 查询接口改造）。
3. `loadRecordsForScope` 改造支持跨 appId 聚合。
4. 完整 `ltm project index/refresh/watch/add-root` + 多 source root + scanner 改造。
5. 第二 appId adapter（claw-research 或 claw-project）。
6. cross-product 黄金集（30 条）。

验收（v0.2）：

1. `ltm project context --app-id openclaw` 与 `--app-id claw-research` 在同一 workspace 下复用 profile/rules。
2. cross-product suite 关键记忆召回 ≥ 80%。
3. 一个 workspace 可配置至少两个 source roots，增量 refresh 只处理变化文件。
4. 每个 slot block 有 source/evidence 和 owner provenance 引用。

### Milestone B：本机接入体验

目标：产品开发者能在 10 分钟内启动、诊断并接入一个 OpenClaw adapter。

交付：

1. `ltm doctor`。
2. `ltm demo`。
3. `ltm connect openclaw`。
4. project workspace CLI 示例。
5. README 和 CLI 文档更新。

验收：

1. 没有 embedding 服务时，doctor 能区分 warning 和 fatal。
2. demo 能写入单 appId 的用户工作上下文样例，并输出 context/lookup 结果。
3. connect 输出可复制的 server URL、secret、scope 示例。
4. `ltm init -> ltm project context` 能在 10 分钟内跑通（单 appId，不依赖目录索引）。

### Milestone C：Console 和候选区闭环

目标：自动抽取不直接污染主库，用户能在 Console 审核和解释。

交付：

1. Console Candidates API。
2. Console Candidates 页面。
3. candidate approve/reject/archive/expire 写 audit。
4. Overview 增加 candidate backlog 和 slot freshness。
5. Quick Lookup 增加 evidence/source 和 copy reference。

验收：

1. pending candidate 不进入 5 槽位。
2. approve 后可被 context/lookup 使用。
3. reject/archive 后不会被注入。
4. 批量操作有测试覆盖。

### Milestone D-lite：quick eval 和发布门槛（v0.1）

目标：能用固定黄金集证明这次迭代比 baseline 更好（**单 appId 范围**）。

交付：

1. `eval/goldens/memory-autodb-v0.1.jsonl`（单 appId）。
2. `eval/goldens/memory-autodb-safety.jsonl`。
3. quick eval runner。
4. `eval/results/*/report.md`。

> cross-product suite 延后 v0.2（Milestone A2-v0.2 交付）。

验收：

1. v0.1 suite 显示单 appId 内 workspace/project 关键记忆召回 ≥ 80%。
2. safety suite private/revoked 误注入为 0；人格标签/敏感属性不写入。
3. lookup-only memory（无 `semanticType` 的合规记忆）仍可 lookup。
4. context 快路径本地 P95 < 250ms 或输出性能缺口。

---

## 7. API 和文档同步清单

本迭代涉及以下文档同步：

| 改动 | 同步文档 |
|------|----------|
| scope policy + 复用规则 + Filter 模式 | `docs/03-architecture/product-positioning.md`、`docs/06-database/schema.md` |
| Project Memory Workspace + `.memory-autodb.json` schema | `docs/03-architecture/product-positioning.md`、`docs/05-api/cli-commands.md` |
| §5.2.0 核心流程（提取/树/去重/降级/过期） | `docs/04-design/04.1-overview/`（新增 memory-pipeline-design.md）、`docs/06-database/schema.md` |
| `/v1/agent/context` 输出增强（filtered/warning 枚举） | `docs/05-api/memory-api.md` |
| `ltm init/project/doctor/demo/connect/reset` | `docs/05-api/cli-commands.md` |
| Console Candidates + audit 子标签 | `docs/04-design/04.1-overview/web-console-design.md` |
| eval quick runner + 通过门槛 | `docs/07-test/memory-evaluation-plan.md`、`docs/07-test/README.md` |
| 本评审与修订 | `docs/04-design/04.2-detail/next-iteration-product-plan-review.md` |
| 竞品差异化矩阵 | `docs/03-architecture/open-source-memory-competitor-research.md`（引用） |
| 版本发布 | `docs/09-changelog/` |

---

## 8. 风险和处理

| 编号 | 风险 | 严重性 | 处理 |
|------|------|--------|------|
| RISK-1 | 本地数据库损坏（LanceDB 断电/磁盘满） | 高 | `ltm doctor` 检查磁盘 + `ltm backup`/`ltm restore`；evidence append-only |
| RISK-2 | 跨 appId 复用的隐私边界（产品 A 偏好被 B 用，是否符合预期） | 高 | 复用默认 opt-in，`ltm init`/Console 可关闭；只默认共享 profile/rules；ADR 记录策略 |
| RISK-3 | scope 推导错误（adapter 把不同用户错认为同一 userId） | 高 | `MemoryService` 强制 scope 校验，错误拒写 + 写 audit |
| RISK-4 | embedding 不可用时 `context_fast` 失败 | 中 | 降级 BM25 + 缓存 SlotSnapshot，发 `embedding_unavailable` warning |
| RISK-5 | source root 失效（外部目录被删除） | 中 | refresh 时发"orphan source root"告警，标记 stale |
| RISK-6 | candidate backlog 爆炸（用户不审核） | 中 | 批量 approve/reject/archive + 30 天自动淘汰（已实现）+ Overview 阈值告警 |
| RISK-7 | OpenClaw adapter 接口稳定性（host 升级） | 中 | adapter 增加版本协议 + 兼容矩阵 |
| RISK-8 | `ltm watch` 在 inotify limit / Spotlight 下表现 | 中 | doctor 检查 inotify limit，超限提示用户 |
| RISK-9 | 黄金集标注质量与一致性 | 中 | 每条带 annotator/reviewedAt/version 元数据 |
| RISK-10 | 5type 与现实记忆不匹配（边缘记忆过多） | 低 | lookup-only 兜底；telemetry 监控 lookup-only 占比，超 30% 告警 |
| RISK-11 | Console 扩展过快 | 低 | 本迭代只做 Overview/Lookup/Candidates，graph/tree UI 延后 |
| RISK-12 | OpenClaw adapter 继续膨胀 | 低 | 新能力进 `MemoryService`/`AgentFastPathService`/Console API，adapter 只做映射 |
| RISK-13 | **LanceDB 不过滤 scope 字段（当前全量向量搜索）**，跨 appId scope filter 性能未知 | 中 | **走 `DatabaseProvider` 接口实现 scope filter，不绑定 LanceDB**；A0 spike 选定 v0.2 默认 provider；性能不达标可替换 postgres/supabase 而不改服务层；v0.1 单 appId 不受影响 |
| RISK-14 | **越用越懂量化指标无采集 pipeline**，"重复解释减少率/采纳率"6 周内无法证伪 | 高 | 成功标准降级为定性观察；FeedbackCollector/RepetitionDetector 延后 v0.3 研究分支，不进 v0.1 验收 |
| RISK-15 | HeuristicTypeExtractor 无黑名单，靠"碰巧不匹配"避免人格标签 | 中 | A1-lite 补显式黑名单（人格/健康/政治/宗教/性取向），safety case 机械化验证 |

---

## 9. 推荐实施顺序

### v0.1（6 周，本迭代）

1. **Milestone A0**：核心流程文档对齐 + v0.1/safety 黄金集 + baseline freeze + ADR + **provider scope filter spike**。
2. **Milestone A1-lite**：单 appId scope policy + Agent context 输出增强 + extractor 黑名单。
3. **Milestone A2-lite**：`ltm init` 创建 project scope identity 和 manifest（不强制目录索引）。
4. **Milestone B**：`ltm doctor/demo/connect/status`（单 appId 验证）。
5. **Milestone C**：Console Candidates + candidate 审核闭环。
6. **Milestone D-lite**：v0.1 + safety quick eval + release gate。

v0.1 完成后，memory-autodb 在**单 appId 内**实现可验证的 Working Context 闭环：5 slot 低延迟注入、注入安全可解释、scope 隔离正确、记忆可治理。

### v0.2（8-10 周，独立迭代，spike 通过后启动）

7. **Milestone A2-v0.2**：Owner/Working Context Scope 分离 + 跨 appId 复用 + 完整 Project Workspace + 第二 appId adapter + cross-product 黄金集。

v0.2 完成后才实现"跨产品上下文连续性"这一核心差异化。

### v0.3（研究分支，非承诺）

8. 行为监控 pipeline（FeedbackCollector + RepetitionDetector），把"越用越懂"从定性观察升级为可量化指标。

> 三个核心提升点的兑现节奏：注入安全（v0.1 可证明）、结构化 5 slot 延迟（v0.1 可证明）、跨 appId 连续性（v0.2）、越用越懂量化（v0.3）。不再承诺 6 周内全部达成。
