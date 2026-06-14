# mengshu 产品定位

> 日期：2026-06-10
> 状态：当前产品方向真源
> 适用范围：约束 mengshu 的架构设计、API 命名、评测口径、竞品分析和后续开发计划。
> 修订记录：2026-06-10 基于代码基线核对和竞品研究，补充术语表、竞品差异化矩阵、量化成功标准、project identity 规则和入门场景。

---

## 0. 术语表

为消除"工作上下文 / 用户工作上下文 / 工作记忆"等说法混用，统一术语口径。所有架构、API、文档和测试必须使用左列规范名。

| 规范名 | 等价说法 | 定义 |
|--------|----------|------|
| Working Context | 用户工作上下文、工作记忆 | 用户在 Agent 工作中持续存在的偏好、规则、项目背景、历史经验、资源线索和工作状态的总称 |
| Project Memory Workspace | project workspace、工作空间 | 用户在本地某目录执行 `ms init` 后建立的长期工作上下文容器，含 project identity、scope、manifest、source roots、ingest policy |
| Working Context Slot（5 slot） | 5 槽位、5type 运行视图 | Agent 启动时注入的 5 个结构化上下文槽：`profile`、`task_context`、`rules`、`experience`、`resource`，分别回答"为谁工作 / 在做什么 / 不能做什么 / 之前怎么做 / 有什么资源" |
| Durable Memory | 主库、长期记忆 | `MemoryRecord` 持久化记录，含 `kind`、可选 `semanticType`、scope、lifecycle、evidence；是 5 slot 的主候选池 |
| lookup-only memory | fallback memory、兜底记忆 | 无法映射到 5 slot 的合规记忆，不进入 `context_fast`，但可被 `memory_lookup` 命中 |
| Candidate | 候选记忆 | 自动抽取产物，必须经审核才能进入 Durable Memory |
| Evidence | 证据、provenance | observation / document / chunk / tool result 等可追溯来源，支撑追溯但不直接注入 |
| SlotSnapshot | 槽位快照 | `context_fast` 的短 TTL 缓存（非长期记忆真源），由 SlotContextBuilder 组装 |
| Owner Scope | 写入归属范围 | 记录某条记忆由哪个 `appId/agentId/sessionId` 写入，用于 provenance、audit 和冲突解释 |
| Working Context Scope | 语义复用范围 | 记录某条记忆可在什么 `userId/workspaceId/projectId/visibility` 下被其他授权 Agent 产品复用 |

层级关系（重要）：`tenantId ⊇ userId ⊇ workspaceId ⊇ projectId`。`profile`/`rules` 复用在 workspace 层，`task_context` 隔离在 project 层。

---

## 1. 一句话定位

mengshu 是面向 **Agent 应用** 的本地优先记忆中间件，核心服务对象是用户持续存在的工作上下文。

它要解决的问题是：

> 当同一个用户在不同 Agent 产品、不同任务和不同工作场景之间切换时，工作记忆、协作偏好、长期约束、项目背景、历史经验、可用资源和工作状态仍然持续存在，并能被当前 Agent Runtime 快速、安全、可解释地使用。

---

## 2. 产品方向

mengshu 的主方向不是 coding-agent 记忆工具，也不是云端 Memory SaaS，而是：

1. 为用户提供本地优先、可控、可追溯的长期工作上下文层。
2. 让授权的 Agent Runtime 用少量稳定接口获得可直接注入 prompt 的上下文。
3. 让用户的偏好、规则、项目背景、历史经验、资源线索和工作状态持续保留。
4. 让 Agent 越用越懂用户、越理解用户的工作，运行过程越来越流畅。
5. 让长期记忆具备 lookup、evidence、scope、lifecycle、audit 和可解释治理。

### 2.1 开源专项边界

为了保持开源项目聚焦，v0.x 只做两个产品主轴：

| 主轴 | 说明 |
|------|------|
| Working Context 语义层 | 用 5 slot 把长期记忆交付为 Agent Runtime 可用的上下文 |
| Project Memory Workspace | 用 `ms init` 把本地目录变成 Working Context 的 project 容器 |

以下能力只保留必要接口或作为支撑项，不作为 v0.x 产品主线：

1. 不做完整 Memory API 平台，不对标 Mem0/Supermemory 的全量能力。
2. 不做通用 RAG/知识库平台，Project Workspace 只服务 Working Context。
3. 不做上下文路由 DSL 或 proactive routing 平台，v0.x 只保留简单 slot priority 和 budget。
4. 不做 OpenMemory / Letta Agent File 完整 import/export 互操作，先保持 REST/MCP/SDK adapter 边界。
5. 不做企业 Memory Lake、云端后端和团队同步。
6. 不做 coding-agent 专用记忆。

### 2.2 理论支撑：从“存记忆”到“理解用户如何工作”

mengshu 的理论假设不是“长期保存更多文本就会更懂用户”，而是：

> 人的工作表现来自稳定个人倾向、当前目标、情境资源、历史经验和协作记忆的共同作用。Agent 如果能持续维护这些上下文，并在任务时点低成本调用，就会更懂用户、更懂用户的工作。

LightRAG 给的是“复杂知识如何组织和检索”的技术支撑：用图结构和双层检索弥补平铺向量检索的上下文割裂。mengshu 需要的另一层支撑是“人如何在长期工作中形成稳定协作方式”的行为理论：它解释为什么要持续保存用户偏好、目标、情境、资源和经验，而不是只保存问答片段。

这层理论支撑来自社会行为心理学、工作心理学、组织行为学和人机交互研究。它不要求系统给用户做心理诊断；系统只保存用户明确表达或可追溯观察到的工作偏好、目标、规则、资源和经验。

| 理论来源 | 对 Working Context 的启发 | 产品落点 |
|----------|---------------------------|----------|
| Big Five / 工作风格研究 | 人有相对稳定的协作偏好、风险偏好、计划性和信息处理偏好；这些会影响“怎么一起工作” | `profile` 保存用户偏好和协作方式；`rules` 保存稳定约束。只记录行为偏好，不推断敏感人格标签 |
| Person-environment fit / 人-环境匹配 | 工作效果取决于人的偏好、任务要求、协作对象和工具环境是否匹配 | Working Context 不只存用户资料，也存当前 workspace/project 的任务环境、约束和默认协作方式 |
| Goal-setting theory | 明确目标、反馈和承诺会影响任务表现；上下文必须知道当前目标、进度和约束 | `task_context` 保存项目目标、当前阶段、未完成项；`memory_session_commit` 更新进度和决策 |
| Situated action / 情境行动 | 人的行动不是只按抽象计划执行，而是在具体情境、工具、材料和约束中展开 | Project Memory Workspace 保存本地目录、source roots、文件、会话和工具结果，作为任务情境真源 |
| Transactive memory systems | 团队和长期协作依赖“知道知识在哪里、谁知道、哪个资源可信” | `resource` 保存文件、链接、工具、source root 和 evidence；owner provenance 说明来源产品/会话 |
| Common ground / grounding | 长期协作需要持续维护共同背景，否则每次都要重新对齐语境 | 5 slot 在 Agent 启动时提供压缩过的共同背景，减少用户重复说明和澄清成本 |
| Cognitive load | 重复解释背景、规则和资源位置会增加额外认知负荷 | `context_fast` 只注入少量高价值上下文，把详细证据留给 `lookup` 和 Console |

因此，Working Context 的 5 slot 不是任意分类，而是对应五类工作问题：

| Slot | 理论角色 | 系统要长期学习什么 |
|------|----------|--------------------|
| `profile` | 稳定个人倾向和协作偏好 | 用户喜欢怎样沟通、怎样评审、怎样接收计划和结果 |
| `rules` | 长期约束和行为边界 | 什么不能做、什么必须遵守、哪些风险要避免 |
| `task_context` | 当前目标和情境状态 | 正在做什么、目标是什么、当前阶段和边界是什么 |
| `experience` | 历史反馈和可复用经验 | 之前怎么成功/失败、哪些做法对这个用户有效 |
| `resource` | 分布式知识和情境材料 | 文件、工具、数据源、链接、会议纪要、项目目录在哪里 |

设计约束：

1. **不做心理诊断**：不写“用户是某种人格类型”，只写“用户在工作中明确偏好先给结论再给计划”。
2. **不把观察当事实**：自动抽取先进入 candidate，重要记忆需要 evidence 或用户确认。
3. **不全局泛化**：某个 project 的偏好/经验默认只在对应 workspace/project 生效，除非用户提升。
4. **可撤销、可解释**：任何被注入的上下文都能说明来源、scope、证据和过滤原因。
5. **越用越懂的定义可评测**：不是主观感觉，而是重复解释减少、偏好命中率提升、错误注入为 0、lookup 可追溯。

参考理论：

- Guo et al., 2024, LightRAG 双层图检索：[arXiv](https://arxiv.org/abs/2410.05779)
- Barrick & Mount, 1991, Big Five 与工作绩效元分析：[DOI](https://doi.org/10.1111/j.1744-6570.1991.tb00688.x)
- Kristof-Brown, Zimmerman & Johnson, 2005, 人-环境匹配元分析：[DOI](https://doi.org/10.1111/j.1744-6570.2005.00672.x)
- Locke & Latham, 2002, Goal-setting theory：[DOI](https://doi.org/10.1037/0003-066X.57.9.705)
- Suchman, 1987, Plans and Situated Actions：[ACM](https://dl.acm.org/doi/abs/10.5555/38407)
- Wegner, 1987, Transactive Memory：[Springer](https://link.springer.com/chapter/10.1007/978-1-4612-4634-3_9)
- Clark & Brennan, 1991, Grounding in Communication：[Stanford bibliography](https://web.stanford.edu/~clark/pubs.html)
- Sweller, 1988, Cognitive load：[DOI](https://doi.org/10.1207/s15516709cog1202_4)

---

## 3. 典型使用场景

> v0.x 默认入口场景：开发者在本地项目目录执行 `ms init`，通过 OpenClaw adapter 接入，先用 `memory_save_explicit` 写入一两条偏好，再用 `memory_context_fast` 验证注入。其余场景都建立在这个入口之上。

| 场景 | 说明 |
|------|------|
| 本地项目初始化 | 用户在某个本地工作目录执行 `ms init`，该目录成为 Project Memory Workspace，后续 Agent 任务默认围绕这个 project scope 使用和沉淀上下文 |
| 多目录工作空间 | 一个 project workspace 可以绑定多个 source root，例如项目主目录、资料目录、会议纪要目录和外部参考目录 |
| 工作场景切换 | 用户在不同 Agent 产品、任务或工作场景之间切换时，仍保留工作偏好和当前项目背景 |
| Agent Runtime 启动 | Runtime 启动任务前通过一次 `context_fast` 获取 5 槽位上下文 |
| 运行中观察 | Runtime 在会话中提交轻量 observation，mengshu 异步提炼候选记忆 |
| 会话提交 | Runtime 在任务结束时通过 `memory_session_commit` 写回决策、状态、经验和资源线索 |
| 项目增量更新 | 用户执行 `ms project refresh` 或 watch 后，系统根据本地目录层级、contentHash 和 manifest diff 增量更新 evidence、索引和记忆树 |
| 用户显式记住 | 用户要求“记住这点”时，系统保存到主库或候选区，并保留 evidence |
| 工作记忆速查 | 产品 UI 或 Agent 通过 `memory_lookup` 快速查找事实、规则、资源和历史经验 |
| Console 治理 | 用户或产品管理员在 Console 中查看、审核、归档、撤销和解释记忆 |

---

## 4. Project Memory Workspace

Project Memory Workspace 是产品从“插件记忆能力”升级为“用户工作上下文中间件”的关键产品概念。

定义：

> 用户在本地某个目录执行 `ms init` 后，该目录成为一个 project root。mengshu 为它建立 project identity、scope、manifest、source roots、ingest policy 和增量更新链路。Agent Runtime 后续在这个 project scope 下获得上下文、提交会话结果、速查资源和追溯 evidence。

设计原则：

1. 本地目录是工作上下文入口，不是单次扫描任务。
2. 项目目录只保存轻量 `.mengshu.json` 指针；记忆数据默认保存在用户本地全局库。
3. 一个 project workspace 可以包含多个 source root，每个 root 有独立 role、include/exclude、lastIndexedAt 和 contentHash。
4. `ms project refresh` 负责文件系统增量更新；`memory_session_commit` 负责 Agent 运行时增量更新。
5. 目录层级变化通过 manifest diff、contentHash 和 source root registry 局部更新 Source Tree、Topic Tree、Global Tree、向量索引和 BM25 索引。
6. 进入向量库的是可重建的检索单元，不是权限、审计、候选状态或原始大文件真源。

Project identity 规则（决定目录移动后能否保留长期记忆）：

> identity 来源优先级：用户显式名（`ms init --name`）> git remote URL > `contentHash(目录绝对路径)`。一旦确定，identity 固化在本地全局库 `manifest.json`，与 `.mengshu.json` 指针中的 `projectId` 对应。目录移动或重命名后，只要 `.mengshu.json` 指针随目录保留，identity 不变，长期记忆不重建。

`.mengshu.json` 最小 schema：

```json
{
  "projectId": "string (固化 identity)",
  "projectName": "string (可选，用户显式名)",
  "createdAt": "ISO-8601",
  "sourceRoots": [
    { "path": "相对或绝对路径", "role": "project_root|docs|notes|assets|external_reference|generated_output", "include": ["**/*.md"], "exclude": ["node_modules/**"] }
  ],
  "ingestPolicy": { "maxFileSizeKb": 512, "excludeGenerated": true }
}
```

最小产品流：

```bash
cd /path/to/project
ms init
ms project index
ms project context
ms project lookup "关键约束"
```

这个模型让不同 Agent 产品复用的不是彼此的数据，而是同一用户授权范围内的本地工作上下文。

### 4.1 Project Workspace 如何承载跨产品 Working Context

Project Memory Workspace 不是“某个 Agent 产品的项目目录”，而是用户在本机声明的 **Working Context 容器**。OpenClaw、Claw Research、Claw Project 或其他接入方只是这个容器的授权读写方。

核心机制是把“写入归属”和“语义复用”分开：

| 层 | 字段 | 作用 |
|----|------|------|
| Owner Scope | `tenantId/appId/agentId/sessionId/namespace` | 记录来源产品、运行实例、会话和命名空间，回答“谁写入的” |
| Working Context Scope | `userId/workspaceId/projectId/visibility` | 决定哪些授权产品可以复用，回答“这段上下文属于谁、属于哪个工作空间/项目” |

这解决两个问题：

1. 底层记录仍保留 `appId/agentId/sessionId`，方便追溯、审计和冲突解释。
2. `context_fast` 召回时不直接使用完整 owner scope key，否则不同 `appId` 会天然隔离；它应通过 Working Context Scope 找到同一用户同一 workspace/project 下可复用的记忆。

默认复用规则：

| Slot | 复用范围 | 说明 |
|------|----------|------|
| `profile` | `userId + workspaceId` | 跨 appId 默认可用，除非 visibility/private 限制 |
| `rules` | `userId + workspaceId` | 跨 appId 默认可用；冲突规则进入 candidate，不自动覆盖 |
| `task_context` | `userId + workspaceId + projectId` | 不跨 project；同 project 下可跨 appId |
| `experience` | 默认 `projectId`，可提升到 `workspaceId` | 成功经验先局部复用，避免错误经验全局扩散 |
| `resource` | `workspaceId + projectId + sourceRootId` | 资源指针和 evidence 可跨 appId 速查，不直接注入全文 |

典型链路：

```text
cd /work/acme
ms init
  -> 创建 Project Memory Workspace
  -> 生成 projectId/workspaceId
  -> 写入 .mengshu.json
  -> 注册 sourceRoots 和 scope policy

OpenClaw 写入偏好
  ownerScope: appId=openclaw, agentId=research-agent, sessionId=s1
  workingContextScope: userId=jiang, workspaceId=acme, projectId=acme-main
  semanticType: rules/profile

Claw Project 启动任务
  request scope: appId=claw-project, userId=jiang, projectId=acme-main
  workspace resolver 读取 .mengshu.json 或 registry
  context_fast 按 Working Context Scope 召回 profile/rules/task_context/resource
  返回 5 slot + evidence + owner provenance
```

因此，Project Workspace 对跨产品语义层的价值不是“扫描目录”，而是：

1. 给跨产品上下文一个稳定 `workspaceId/projectId`。
2. 给本地文件、会话、用户显式记忆和 source roots 一个共同 evidence 容器。
3. 给 `context_fast` 一个可以跨 `appId` 召回的 Working Context Scope。
4. 给 `memory_lookup` 和 Console 一个可解释入口：这条记忆来自哪个产品、哪个会话、哪个文件、为什么能在当前产品里使用。

v0.x 的关键实现原则：

1. `ms init` 必须先建立 Project Workspace identity 和 scope policy，再做任何索引。
2. `memory_save_explicit`、`memory_observe_light`、`memory_session_commit` 写入时必须同时记录 owner scope 和 working context scope。
3. `context_fast` 的候选加载必须按 Working Context Scope 扩展，而不是只按完整 `scopeToKey` 精确匹配。
4. `scopeToKey` 可继续用于底层隔离和索引，但需要新增 `workingContextKey` 或等价查询策略来支持跨 appId 复用。
5. 所有跨 appId 注入都要返回 owner provenance，让用户知道这条上下文最初由哪个产品写入。

---

## 5. 当前不做什么

这些不是当前主方向：

1. 不进入 coding-agent 细分赛道，不把 Codex、Cursor、Claude Code、OpenCode 作为主要产品目标。
2. 不做完整 Agent Runtime，不接管 planner、tool loop、执行器或任务调度。
3. 不做大而全的云端 Memory SaaS，不把远程同步、团队云记忆作为 v0.x 默认交付。
4. 不把图谱、记忆树或 Dashboard 做成优先于 Agent Runtime 快路径的核心目标。
5. 不让 Agent 直接编辑 durable 主库，所有写入必须经过服务层、scope、evidence 和治理规则。

coding-agent、IDE agent 和通用开发工具可以作为未来适配对象或竞品参考，但不能牵引当前架构优先级。

---

## 5.1 竞品差异化与效果提升点

详细竞品分析见 [open-source-memory-competitor-research.md](./open-source-memory-competitor-research.md)。这里固化 mengshu 的差异化主张和可度量的提升点，作为产品决策真源。

### 差异化矩阵

| 维度 | Mem0 / Supermemory | Zep / Graphiti | agentmemory | Letta | **mengshu** |
|------|--------------------|----------------|-------------|-------|-------------------|
| 形态 | Memory API + 云平台 | 企业图谱记忆服务 | 开发工具 agent 记忆 | stateful runtime | **本地优先用户工作上下文中间件** |
| 核心输出 | search / profile | temporal graph context | search hits | runtime memory | **5 slot 结构化启动上下文** |
| 本地目录作为一等输入 | 否（SDK/API） | 否 | 部分 | git-backed file | **是（Project Memory Workspace）** |
| 跨产品上下文复用 | 同账号 | 同租户 | 弱 | runtime 内 | **同用户授权下跨 appId 复用** |
| 候选治理（gate+audit+explain） | 弱 | 企业级但闭源 | 治理工具 | agent 自编辑 | **第一等能力，开源** |
| 注入安全（private/revoked/stale 不误注入） | 不透明 | 商业 | 一般 | 一般 | **强过滤 + 可解释 filtered** |
| 评测闭环 | 有 paper | 有 paper | 有 harness | 弱 | **随仓库的本地黄金集 + 可离线复现** |

### 三个核心效果提升点（相对竞品的可证明优势）

1. **跨 appId 上下文连续性**：同一用户在产品 A 沉淀的偏好/规则，在产品 B 启动时通过 `context_fast` 自动可用。竞品要么绑定单账号云服务，要么绑定单 runtime。目标指标：cross-app 关键记忆召回率 ≥ 80%。
2. **结构化 5 slot 而非裸 search**：Agent 一次调用拿到"为谁工作/做什么/不能做/怎么做过/有什么资源"五槽 + evidence + warnings，而不是自己拼 retrieval。目标指标：`context_fast` 本地 P95 < 250ms。
3. **注入安全 + 可解释治理**：private/revoked/stale 误注入为 0，且每个被过滤的记忆能在 Console 解释原因。竞品多为黑盒。目标指标：safety suite 误注入率 = 0（硬门槛）。

---

## 6. 和 OpenClaw 的关系

OpenClaw 类产品是 mengshu 的首批接入方、验证场景和主要分发入口，但不是产品概念的主体。产品主体是用户持续存在的工作上下文；OpenClaw adapter 只是让这些上下文被当前 Runtime 使用的一种接入方式。

v0.x 接入优先级（消除"Console / Local server / SDK 谁先"的歧义）：

> v0.x 默认主接入是 OpenClaw adapter；Local server 即当前已有的 `server/daemon.ts`（不是新增 SaaS），在 Milestone B 后作为多产品复用入口启用；REST/MCP/SDK 已并行支持，但 v0.x 不作为单独发布渠道对外主推。

边界如下：

| 层 | 定位 |
|----|------|
| OpenClaw adapter | 当前主要接入层，负责工具、hooks、CLI 兼容 |
| MemoryService | 共享核心，REST/MCP/SDK/OpenClaw adapter 都必须走同一服务边界 |
| Local server | 已有 daemon 形态，Milestone B 后启用为多产品复用入口（非云端 SaaS） |
| Console | 用户速查、预览、追溯和治理入口 |

---

## 7. 成功标准

mengshu 的成功不以“支持多少工具”衡量，而以以下结果衡量。可量化项给出目标值和兑现期次（v2 评审后分期，见 [next-iteration-product-plan.md](../04-design/04.2-detail/next-iteration-product-plan.md) §6）。

| 编号 | 成功标准 | 目标值 | 兑现期次 |
|------|----------|-------------|----------|
| 1 | 同一用户在不同 Agent 产品/任务/场景切换时核心工作上下文不丢失 | cross-app 关键记忆召回率 ≥ 80% | **v0.2**（跨 appId 复用） |
| 1-lite | 同一用户在同一 appId 内不同 workspace/project 切换时上下文不丢失 | 同 workspace 召回率 ≥ 80% | **v0.1** |
| 2 | 本地目录可通过 `ms init` 建立长期 project workspace 并增量维护 | `ms init → project context` 端到端 < 5 分钟 | v0.1 建 identity；完整索引 v0.2 |
| 3 | 多 source root 的目录层级、资源、evidence 能被正确索引、召回、追溯 | 文件移动且 contentHash 不变时记忆重建数 = 0 | **v0.2** |
| 4 | Agent Runtime 低延迟获取准确、可解释、prompt-safe 上下文 | `context_fast` 本地 P95 < 250ms；`lookup` P95 < 500ms | **v0.1** |
| 5 | 用户偏好、规则、项目背景、历史经验、资源指针持续影响后续任务 | 偏好在跨会话注入命中率 ≥ 80% | **v0.1**（单 appId） |
| 6 | Agent 越用越懂用户、越理解用户工作、运行越流畅 | 定性观察：跨会话不需重复说明主要偏好；注入 rules 在 agent 行为中可见效果 | **v0.1 定性**；量化（重复解释减少率 ≥ 30% / 采纳率 ≥ 70%）需行为采集 pipeline，延后 **v0.3** |
| 7 | 长记忆可找、可追溯、可撤销；private/revoked/stale/conflict 不误注入；不写入人格标签/敏感属性 | safety suite 误注入率 = 0（硬门槛） | **v0.1** |
| 8 | 记忆系统收益可通过 `memory-eval` 本地黄金集和开源 benchmark 对照证明 | quick eval vnext recall@5 ≥ baseline + 5pt | **v0.1** |

> v2 评审修正：标准 #6 原为量化指标（重复解释减少率 ≥ 30%、采纳率 ≥ 70%），但代码核对确认无行为采集 pipeline（telemetry 只记性能不记行为），6 周内无法证伪，降级为 v0.1 定性观察 + v0.3 量化。标准 #1 跨 appId 依赖 Owner/Working Context Scope 分离（5 大改动），延后 v0.2；v0.1 先验证单 appId 内复用（#1-lite）。
