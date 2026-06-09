# memory-autodb Agent Runtime Context 产品方案与路线图

> 日期：2026-06-09
> 状态：设计规格，等待评审
> 读者：memory-autodb 内部研发与产品团队
> 产品定位真源：`docs/03-architecture/product-positioning.md`
> 关联文档：
> - `docs/04-design/04.2-detail/next-iteration-product-plan.md`
> - `docs/07-test/memory-evaluation-plan.md`
> - `docs/03-architecture/open-source-memory-competitor-research.md`
> - `docs/03-architecture/memory-autodb-deep-optimization-architecture.md`

---

## 1. 决策记录

本节记录本轮已经确认的方向。后续架构、API、评测和迭代计划都以这些决策为约束。

| 编号 | 决策 | 影响 |
|------|------|------|
| D1 | 产品概念不是“让 OpenClaw 类产品共享记忆”，而是“面向用户的工作上下文持续存在” | OpenClaw 类产品是首批接入方和验证场景，不是产品概念的主体 |
| D2 | memory-autodb 的核心价值是让 Agent 越用越懂用户、越理解用户的工作 | 路线图必须覆盖用户偏好、工作模式、项目背景、历史经验的持续沉淀 |
| D3 | Agent 运行越来越流畅是明确产品目标 | 低延迟快路径、稳定 slot snapshot、减少重复解释、减少错误召回必须进入验收 |
| D4 | 长记忆必须可找、可追溯 | `lookup`、evidence、source、audit、Console 解释能力是核心能力，不是附属功能 |
| D5 | 5 type / 5 slot 是 Runtime 上下文交付协议，不是主库强制 ontology | 主库允许 `kind` 必填、`semanticType?` 可选；无法稳定归类的记忆不能被丢弃 |
| D6 | Agent 只能使用任务时点接口，不直接治理 durable 主库 | 候选区、冲突处理、retention、slot snapshot、graph/tree、budget、eval 都属于内部或治理面 |
| D7 | Console 的产品定位是信任与治理入口 | Console 要回答“为什么这段记忆被注入、来源是什么、如何撤销”，不是普通数据库浏览器 |
| D8 | Knowledge 是 evidence/source/resource 辅助层 | 不把 knowledge scan 扩张成通用 RAG 平台 |
| D9 | 证明架构提升必须依赖自动化评测 | 内置黄金集、开源 benchmark、延迟/成本、安全误注入和接口一致性必须进入 release gate |

---

## 2. 产品主线

memory-autodb 是面向 Agent 应用的本地优先记忆中间件，核心服务对象是 **用户持续存在的工作上下文**。

它要解决的问题是：

> 用户在不同 Agent 产品、不同任务和不同工作场景之间切换时，偏好、规则、项目背景、历史经验、资源线索和工作状态仍然持续存在，并能被当前 Agent Runtime 快速、安全、可解释地使用。

因此，产品主线定义为：

> memory-autodb 提供面向用户工作上下文的 Agent Runtime Context Layer，用 5 type / 5 slot 将长期记忆整理成可注入、可查找、可追溯、可治理、可评测的任务上下文。

### 2.1 产品目标

| 目标 | 说明 | 直接能力 |
|------|------|----------|
| 越用越懂用户 | 持续沉淀用户偏好、协作方式、长期规则和禁忌 | profile、rules、candidate、explicit save |
| 越理解用户的工作 | 持续维护项目背景、任务状态、资源线索和历史决策 | task_context、experience、resource、session commit |
| Agent 运行越来越流畅 | 减少重复解释，启动时快速获得上下文，运行中可速查 | context_fast、slot snapshot、lookup fast |
| 长记忆可找可追溯 | 每条关键记忆能找到来源、evidence、scope、生命周期和注入原因 | lookup、evidence、audit、Console explain |
| 跨接入方持续存在 | 同一用户的工作上下文被多个授权 Agent 产品复用 | local server、scope policy、REST/MCP/SDK |

### 2.2 角色边界

| 层级 | 定位 |
|------|------|
| 用户工作上下文 | 产品核心对象 |
| Agent Runtime | 使用记忆上下文的执行方 |
| OpenClaw 类产品 | 首批接入方、验证场景和主要分发入口 |
| REST / MCP / SDK / Adapter | 中间件能力出口 |
| Console | 速查、解释、候选审核、撤销和诊断入口 |
| Knowledge / Graph / Tree | 提供 evidence、关联、压缩和导航的内部增强层 |

### 2.3 当前不做

| 不做 | 原因 |
|------|------|
| 不把产品概念写成“产品之间共享数据” | 核心是用户工作上下文持续存在，产品只是被授权的使用方 |
| 不进入 coding-agent 细分赛道作为近期主线 | 会把路线拉向 hooks/tooling 军备竞赛，偏离用户工作上下文 |
| 不做大而全 Memory SaaS | 本地优先、私有化和低接入成本是当前优势 |
| 不把图谱和记忆树作为当前购买理由 | v0.x 的核心收益是上下文质量、低延迟和可追溯 |
| 不让 Agent 直接审批 candidate 或编辑 durable 主库 | 防止错误记忆被静默固化，保持治理链路 |
| 不把 knowledge scan 做成通用 RAG 平台 | Knowledge 服务 evidence/resource/context，不成为第二主线 |

---

## 3. 5 Type / 5 Slot 产品协议

5 type 的价值不是“给所有记忆分类”，而是把长期记忆组织成 Agent Runtime 在任务时点最需要的 5 个答案。

| Slot | 问题 | 解决的 Runtime 问题 | 典型内容 |
|------|------|--------------------|----------|
| profile | 我为谁工作？ | Agent 不懂用户是谁、偏好什么 | 用户画像、协作偏好、表达风格 |
| task_context | 我在做什么？ | Agent 不知道当前工作背景和任务状态 | 项目目标、当前阶段、关键约束 |
| rules | 什么不能做？ | Agent 重复踩禁忌或违反长期约束 | 禁止事项、安全边界、流程规则 |
| experience | 之前怎么做过？ | Agent 忘记历史经验和有效做法 | 复盘结论、成功路径、失败教训 |
| resource | 有什么可用资源？ | Agent 找不到文件、链接、工具和知识源 | 文档、代码库、工具、数据源 |

### 3.1 对 Agent 暴露什么

Agent 应看到任务时点接口，而不是内部记忆模型。

| 能力 | 对 Agent 的暴露方式 |
|------|---------------------|
| `memory_context_fast` | 获取 prompt-safe 的 5 槽位上下文、warnings、evidence、telemetry |
| `memory_lookup` | 任务中按需速查，返回命中、来源、score breakdown 和可追溯引用 |
| `memory_observe_light` | 运行中提交轻量 observation，快速 ack，后台进入候选抽取 |
| `memory_save_explicit` | 用户明确“记住”时保存或进入候选区 |
| `memory_session_commit` | 会话结束提交摘要和任务状态，异步更新工作上下文 |

### 3.2 不对 Agent 暴露什么

| 内部能力 | 原因 |
|----------|------|
| candidate approve / reject / archive | 需要用户或产品治理面审核 |
| `semanticType` 映射规则 | 避免 Agent 自行改分类导致系统漂移 |
| conflict resolution | 需要 evidence、时间、scope 和用户意图判断 |
| slot snapshot rebuild | 属于性能和一致性内部机制 |
| graph/tree seal | 属于后台压缩、索引和导航机制 |
| budget / retention / migration | 属于运维和治理策略 |

### 3.3 主库分类原则

主库记录应坚持：

1. `kind` 是必填的基础分类，用于存储和治理。
2. `semanticType?` 是可选语义视图，用于进入 5 slot。
3. 无法稳定映射到 5 type 的记忆不丢弃，仍可通过 `memory_lookup` 查找。
4. 进入 `context_fast` 的记忆必须满足 lifecycle、visibility、scope 和 safety 过滤。
5. candidate 默认不进入 5 slot，只有 approve/promote 后才可能被注入。

---

## 4. 架构边界

### 4.1 总体边界

```text
User Work Context
  -> MemoryService
  -> Agent Runtime Context APIs
  -> OpenClaw-like products / MCP / REST / SDK

Internal engines
  -> scope policy
  -> slot snapshot
  -> retrieval fusion
  -> candidate zone
  -> lifecycle / audit
  -> graph / tree / knowledge evidence
  -> eval harness
```

关键原则：

1. 所有 adapter 必须经过 `MemoryService` 或 `AgentFastPathService`，不能绕开服务层写 durable 主库。
2. 本地 server 是多个授权 Agent 产品复用同一用户工作上下文的默认形态。
3. embedded 模式继续兼容 OpenClaw 插件，但行为必须和 server 模式同构。
4. MCP/REST/SDK 的工具面保持少而强，不暴露内部复杂度。

### 4.2 Scope Policy

多接入方复用不是“所有产品直接共享”，而是 **同一用户工作上下文在授权 scope 下被复用**。

建议冻结 scope key：

```typescript
interface MemoryScope {
  tenantId: string;       // v0.x 默认 local
  userId: string;         // 用户工作上下文主键
  workspaceId?: string;   // 工作空间
  projectId?: string;     // 项目或任务域
  appId: string;          // 接入产品
  agentId?: string;       // runtime/agent
  namespace: string;      // memories / knowledge / candidates
  visibility?: "private" | "workspace" | "team" | "public";
}
```

共享策略：

| 内容 | 默认共享范围 |
|------|--------------|
| profile | `userId + workspaceId` |
| rules | `userId + workspaceId`，private/revoked 永远过滤 |
| task_context | `userId + workspaceId + projectId` |
| experience | 默认 project 级，可由用户或治理规则提升 |
| resource | workspace/project 级，仅注入指针和边界 |
| candidate | session/workspace 隔离，不默认进入 context |

必须补强的工程点：

1. `scopeToKey` 和 slot snapshot cache key 必须纳入 `workspaceId`、`visibility` 等关键维度。
2. session candidate 不能和 durable memory 共用宽 scope。
3. 所有 context/lookup/save/observe/session_commit 返回 telemetry 时必须包含规范化 `scopeKey`。
4. scope 过宽、缺失 userId、缺失 namespace 时应返回 warning 或拒绝，而不是静默扩大共享。

### 4.3 快路径

`context_fast` 的目标是快而准。

推荐读取顺序：

```text
1. SlotSnapshot / cache
2. active memory lightweight selection
3. text/BM25 or existing local index fallback
4. explicit lookup deep only when requested
5. async refresh snapshot / candidate / graph / tree
```

不能在快路径中阻塞：

1. LLM 抽取。
2. embedding 大批量重算。
3. 完整 graph traversal。
4. tree seal / summary rebuild。
5. candidate 审核或冲突仲裁。

快路径准确性来自：

1. lifecycle 过滤：revoked、superseded、expired、private 不注入。
2. scope 过滤：task_context 不跨 project 泄漏。
3. slot 优先级：rules 和 task_context 优先于泛化经验。
4. evidence 输出：每个关键 slot block 应可追踪到 source/evidence。
5. warnings/filtered：被过滤或降级的原因必须结构化返回。

### 4.4 成本和性能控制

| 控制点 | 策略 |
|--------|------|
| token budget | 按 slot 加权，不平均五等分；rules/task_context 优先 |
| latency budget | `context_fast` 本地 P95 目标 < 80ms，超预算必须 warning |
| LLM 调用 | 只在后台抽取、摘要、评测准备中使用；快路径不依赖 |
| embedding 调用 | contentHash 去重、批量限制、schemaVersion 重算闸门 |
| lookup mode | 默认 fast，deep 必须显式触发 |
| candidate | 默认 pending，不污染 active memory |
| eval | 报告必须归一化 token、调用次数和 P95 延迟 |

---

## 5. Console 产品定位

Console 的核心不是“看表”，而是建立用户和研发对长期记忆的信任。

### 5.1 首批页面

| 页面 | 目标 | 关键字段 |
|------|------|----------|
| Overview | 看到当前工作上下文健康状况 | scope、记录数、slot freshness、candidate backlog、failed jobs、cache hit |
| Quick Lookup | 找到长记忆并追溯来源 | hit、kind、semanticType、score breakdown、source/evidence、copy reference |
| 5 Slot Preview | 查看 Agent 启动会拿到什么 | slot content、sourceIds、token estimate、warnings、filtered |
| Candidates | 审核自动抽取结果 | pending/approved/rejected/archived、confidence、reason、evidence |
| Explain | 解释为什么注入或过滤 | memory id、scope match、lifecycle、visibility、score、filter reason |

### 5.2 Console 不做

1. 不优先做复杂 graph UI。
2. 不把所有内部表裸露给用户。
3. 不允许无 evidence 的批量自动升格。
4. 不把 Console 做成通用知识库管理平台。

---

## 6. 路线图

路线图采用三阶段。阶段目标不是“模块越多越好”，而是逐步证明工作上下文层可用、可信、可扩展。

### 6.1 阶段一：上下文产品化

目标：把 memory-autodb 从“记忆存储模块”收敛成稳定的 Agent Runtime Context API。

交付：

1. 冻结 agent-facing API：
   - `memory_context_fast`
   - `memory_lookup`
   - `memory_observe_light`
   - `memory_save_explicit`
   - `memory_session_commit`
2. 冻结 `/v1/agent/context` 输出：
   - `content`
   - `slots`
   - `taskHints`
   - `warnings`
   - `filtered`
   - `evidence`
   - `telemetry`
3. 冻结 scope policy 和 `scopeKey`。
4. `context_fast` 优先使用 slot snapshot/cache，不退化成每次全量 recall。
5. lookup 返回 evidence/source 和 score breakdown。
6. OpenClaw tool、REST、SDK 输出字段保持一致。

验收：

| 指标 | 目标 |
|------|------|
| cross-product requiredMemoryIds 命中率 | >= 95% |
| forbiddenMemoryIds 误注入 | 0 |
| private/revoked/stale 误注入 | 0 |
| warnings/filtered 解释覆盖率 | 100% |
| `/v1/agent/context`、OpenClaw tool、SDK 字段一致性 | 100% |
| context_fast P95 | 不比 baseline 差超过 10%，本地目标 < 80ms |

### 6.2 阶段二：接入与治理产品化

目标：让内部研发和产品接入方能快速接入、诊断、解释和治理记忆。

交付：

1. `ltm doctor`：检查 server、DB、embedding、scope、REST、Console、静态资源。
2. `ltm demo`：演示同一用户工作上下文在两个 appId 间复用。
3. `ltm connect openclaw`：输出 server URL、secret、scope 示例和 adapter 配置。
4. Console Overview / Quick Lookup / 5 Slot Preview / Candidates / Explain。
5. candidate approve / reject / archive / expire 闭环。
6. audit 记录候选升格、撤销、过滤、冲突处理。

验收：

| 指标 | 目标 |
|------|------|
| 新环境从零跑通 context+lookup | <= 10 分钟 |
| doctor 正常/缺 embedding/DB 异常判定 | 100% |
| demo 在不同 `appId` 下复用同一用户工作上下文 | 100% |
| pending candidate 进入 Agent context | 0 |
| approve 后 context/lookup 可使用 | 100% |
| reject/archive/expire 后误召回 | 0 |
| Console 展示 candidate backlog、slot freshness、failed jobs | 100% |

### 6.3 阶段三：评测与互操作产品化

目标：证明新架构相比 baseline 更好，并为长期开放生态保留迁移能力。

交付：

1. `eval/goldens/memory-autodb-v0.1.jsonl`
2. `eval/goldens/memory-autodb-cross-product.jsonl`
3. `eval/goldens/memory-autodb-safety.jsonl`
4. quick eval runner。
5. baseline-v4 vs vnext compare report。
6. BEIR 小子集 adapter。
7. LongMemEval 或 LoCoMo small adapter。
8. portable import/export schema 草案。

验收：

| 指标 | 目标 |
|------|------|
| 本地黄金集按 suite 出报告 | 100% |
| safety suite 误注入 | 0 |
| cross-product 关键 case | 100% 必过 |
| fallback 无 semanticType lookup | 必过 |
| BEIR / LongMemEval small | 不低于 baseline |
| P95 延迟 | 不比 baseline 差超过 10% |
| token / LLM / embedding 调用次数 | 不明显放大，报告中单列 |

---

## 7. 评测与 Release Gate

### 7.1 最小评测组合

| 类型 | 套件 | 目的 |
|------|------|------|
| 内置黄金集 | `memory-autodb-v0.1` | 验证 context、lookup、slot、fallback |
| 内置黄金集 | `memory-autodb-cross-product` | 验证用户工作上下文跨接入方持续存在 |
| 内置黄金集 | `memory-autodb-safety` | 验证 private/revoked/stale/conflict 不误注入 |
| 开源 benchmark | BEIR 小子集 | 验证基础检索不退化 |
| 开源 benchmark | LongMemEval small 或 LoCoMo small | 验证长期记忆和跨会话能力 |

### 7.2 AI 自动准备评测集

AI 可以参与生成候选评测集，但不能直接冻结 golden。

流程：

```text
scan docs / examples / tests / changelog
  -> chunk with stable ids and hash
  -> AI generate draft cases
  -> programmatic validation
  -> dedupe and balance suites
  -> human/rule approval
  -> freeze golden with manifest hash
```

程序校验必须包括：

1. `evidence_exists`
2. `answer_grounded`
3. `no_answer_leakage`
4. `scope_valid`
5. `semantic_optional`
6. `negative_valid`
7. `dedupe`

### 7.3 Release Gate

PR gate：

1. quick eval 跑核心本地 golden。
2. safety case 出现一次误注入即失败。
3. context/lookup 关键召回不能低于 baseline。
4. 输出 report 文件，不能只看控制台日志。

Pre-release gate：

1. 跑完整本地 golden。
2. 跑 BEIR 小子集和 LongMemEval/LoCoMo small。
3. 生成 baseline vs vnext 报告。
4. 所有失败 case 必须有归因。

阻断条件：

1. 只有功能字段更多，但 recall/safety/latency 没改善。
2. 只在开源 benchmark 提升，本地 golden 不提升。
3. 提升依赖更长上下文或更多 LLM 调用。
4. safety 平均分好看但存在单条误注入。

---

## 8. 当前代码基线对应关系

| 能力 | 当前代码 | 判断 |
|------|----------|------|
| MemoryService | `core/memory-service.ts`、`core/service-types.ts` | 已有服务边界，需继续作为所有 adapter 共同入口 |
| Agent 快路径 | `api/agent-fast-path.ts` | 已有 context/observe/lookup/session_commit，需增强 evidence、filtered、telemetry |
| 5 slot | `core/semantic-types.ts`、`core/slot-context-builder.ts` | 已有基础协议，需修正预算策略和 evidence 输出 |
| Scope | `core/scope.ts`、`adapters/openclaw/scope.ts` | 已有 normalize，但 scope key 需纳入更多维度并冻结协议 |
| Candidate | `lifecycle/candidate-*` | 已有状态机和 review service，需打通 Console 和 audit |
| OpenClaw adapter | `adapters/openclaw/*` | 已有工具映射，需和 REST/SDK 字段一致 |
| MCP facade | `adapters/mcp/*` | 已有 transport-agnostic facade，需压窄 agent-facing tools |
| REST / server | `api/rest/*`、`server/*` | 已有基础，需补齐 agent context 输出和 connect/doctor/demo |
| Console | `console/*` | 已有 Overview/Lookup/Graph/Jobs baseline，需补 5 Slot Preview、Candidates、Explain |
| Eval | `docs/07-test/memory-evaluation-plan.md` | 有方案，无 `eval/` harness 和 goldens |

---

## 9. 主要风险

| 风险 | 影响 | 处理 |
|------|------|------|
| 产品概念退回“产品之间共享记忆” | 用户价值被弱化，隐私和授权叙事变差 | 坚持“用户工作上下文持续存在” |
| 5 type 被做成主库强制 ontology | 错误分类导致记忆丢失或不可用 | 坚持 `kind` 必填、`semanticType?` 可选 |
| scope/cache key 串库 | 多产品、多 workspace 记忆泄漏 | 冻结 scope key，补测试和 eval |
| 快路径退化成全量召回 | 延迟和成本目标失效 | slot snapshot/cache 作为主路径 |
| candidate 变成第二数据库 | 自动抽取污染长期记忆 | 默认 pending，审核、淘汰和 audit 必须闭环 |
| Console 变成 DB viewer | 无法建立用户信任 | 聚焦 explain、lookup、slot preview、candidate |
| 评测只证明功能完成 | 无法证明架构提升 | release gate 强制 baseline 对比和 safety 指标 |

---

## 10. 推荐下一步

1. 将 `product-positioning.md` 同步为“用户工作上下文”口径。
2. 将下一迭代产品方案从四个 milestone 收敛为三阶段路线图，或保留四个 milestone 但用三阶段作为主叙事。
3. 优先实现阶段一：
   - 冻结 scope key。
   - 增强 `/v1/agent/context` 输出。
   - 补 evidence/filtered/telemetry。
   - 修正 `context_fast` 快路径不要每次全量 recall。
   - 建立最小 cross-product/safety golden。
4. 之后再推进 Console candidates 和 `ltm doctor/demo/connect`。

---

## 11. 开放问题

这些问题不阻塞本方案，但进入实现计划前需要明确：

1. v0.x 默认 identity bootstrap 如何确定 `userId`，是否允许匿名默认用户。
2. 不同接入产品是否需要显式授权才能复用同一 workspace context。
3. `visibility=team/public` 在本地优先版本中是否只保留 schema，不启用跨用户共享。
4. slot snapshot 是否需要在阶段一持久化，还是先内存缓存加可重建。
5. `save_explicit` 在高置信时是否可直接入主库，还是一律进入 candidate 后提示用户。
