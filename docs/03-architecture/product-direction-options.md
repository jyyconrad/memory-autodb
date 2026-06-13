# memory-autodb 产品方向决策对比

> 日期：2026-06-10
> 状态：已收敛决策稿
> 目的：列出所有可能的产品方向，给出红蓝海判断、MVP 形态、6 周交付边界、与竞品最终竞争位、与现有代码复用度，让产品决策可拍板。
> 基线：[open-source-memory-competitor-research.md](./open-source-memory-competitor-research.md)（2026-06-09 基础版）+ 2026 H1 增量调研（见 §1）。
> 关联：[product-positioning.md](./product-positioning.md)、[next-iteration-product-plan.md](../04-design/04.2-detail/next-iteration-product-plan.md)、[next-iteration-product-plan-review.md](../04-design/04.2-detail/next-iteration-product-plan-review.md)

---

## 0. TL;DR

**问题诊断**：作为开源项目，memory-autodb 不能同时追求 Agent 启动上下文、目录知识索引、治理 Console、上下文路由、互操作协议和企业 Memory Lake。短期必须只选择一个专项领域做到清楚、可用、可验证。

**2026 H1 关键信号**：
1. Mem0 通过 **OpenMemory MCP** 已占据"跨 MCP 客户端共享私有记忆"心智（事实先发）
2. **Walrus Memory**（Mysten Labs，2026-06）+ **ZetaChain Private Memory Layer**（2026-06）+ **Letta Agent File** 联合圈占"可携带 + 可验证 + 跨 agent"叙事
3. **VS Code 1.123**（2026-06）官方下场做 Project Memory（Copilot Session Sync 内置）
4. **claude-mem 65k-75k stars**——coding agent 记忆赛道已重红海
5. 真正适合开源专项切入的是：**用户工作上下文模型 + 本地项目工作空间入口**

**结论**：不做大而全 Memory API，不做 coding agent 专用记忆，不做企业 Memory Lake，也不把 proactive 路由作为 v0.x 主线。memory-autodb 的开源专项应收敛为：

> **Working Context 语义层 + Project Memory Workspace 本地入口。**

**最终推荐**（详见 §6）：只做两个主轴：

1. **Working Context 语义层**：用 5 slot 把长期记忆整理成 Agent Runtime 可用的用户工作上下文。
2. **Project Memory Workspace**：用 `ltm init` 把本地目录变成工作上下文容器，支持 project identity、manifest、source roots、增量 evidence 和 context/lookup。

治理 Console、MCP 互操作、路由 DSL、图谱、procedural memory、企业后端都不作为 v0.x 主轴，只保留必要接口和后续扩展余地。

---

## 1. 2026 H1 增量调研

只列 2026-06-09 基础调研未覆盖的新动态。

### 1.1 新出现 / 快速崛起的开源项目

| 项目 | 定位 | 量级（2026 H1） |
|------|------|------------------|
| **claude-mem** | Claude Code/Codex/Cursor session 持久化 | 65k-75k stars |
| **MemPalace** | 记忆宫殿隐喻 + ChromaDB | 43k / 8 天 |
| **OpenViking** (ByteDance) | Agent 上下文 = 文件系统（L0/L1/L2 分层） | 21.8k / 96 天 |
| **memU** (NevaMind-AI) | 文件系统式记忆 + 双模检索 | 中量级活跃 |
| **memvid** | 单文件可移植记忆胶囊（约 50KB） | 中量级 |
| **MemOS** (MemTensor) | 跨任务**技能复用**记忆 OS | 中量级 |
| **engram** | Go 单二进制 + MCP/CLI/HTTP/TUI | 2.4k / 53 天 |
| **agentic-memory** | Rust + 16 种认知图谱查询 + sub-ms | 早期 |
| **code-review-graph** | tree-sitter + GraphRAG，code review 省 6.8x token | 7.3k / 43 天 |

### 1.2 非开源但 2026 H1 入场（需重点关注）

- **Walrus Memory** (Mysten Labs, 2026-06-03)：portable + verifiable + 区块链
- **ZetaChain Private Memory Layer** (2026-06-01)：链上私密记忆
- **Cloudflare Agent Memory**：边缘记忆服务
- **AWS S3 Vectors**：多 agent 记忆官方博客
- **VS Code 1.123 Project Memory** (2026-06)：Copilot Session Sync 内置，绑定 GitHub 账号

### 1.3 MCP 记忆生态现状

- **Anthropic 官方** `modelcontextprotocol/memory` 仍是最小参考实现，无重型升级
- **Mem0 OpenMemory MCP** 已占据事实标准候选位置
- 生态主力：doobidoo/mcp-memory-service、alioshr/memory-bank-mcp、agentic-memory、engram
- **MCP 已成事实接口标准**，新进入者很难再靠协议立项


---

## 2. 方向全景图

下表列 9 个候选方向。每个方向都对应"如果我们只做这一件事会怎样"。**不要把它当 P0 清单**——我们最多选 1-2 个主轴。

| # | 方向（一句话） | 像谁 | 红蓝海 | 复用现有代码 | 6 周可交付 |
|---|----------------|------|--------|--------------|-----------|
| 1 | **Working Context 语义层**：Agent 在任何接入产品里都拿到用户偏好、规则、项目背景和资源线索 | 无人正面（语义层） | 早期红海（记忆叙事拥挤，但工作上下文模型未定） | 90% | scope policy + 5 slot + 2 个 appId demo + 三套黄金集 |
| 2 | **本地 Agent 记忆 API**：Mem0 的本地版 | Mem0、Supermemory、memvid、memU、engram | **重红海** | 60%（要砍很多） | 极简 API + MCP server + benchmark |
| 3 | **Project Memory Workspace**：把本地目录变成用户工作上下文容器 | LightRAG、Cognee、code-review-graph 只在知识索引侧相似 | **可做专项**（若不滑向通用 RAG） | 70% | `ltm init` + manifest + source roots + 增量 evidence + context/lookup |
| 4 | **跨 agent 上下文路由层**：根据任务自动决定哪些记忆以何粒度注入哪个 agent | 无人正面 | 有差异但抽象 | 60%（需新建路由引擎） | v0.x 不做，只保留评分和预算接口 |
| 5 | **Self-improving Agent Memory**：Agent 通过反思自动改进记忆/技能 | 学术：Voyager/Reflexion/FORGE；工程：稀缺 | **工程蓝海**（学术红） | 50% | reflection pipeline + skill candidate + approval |
| 6 | **Coding agent 专用记忆**：Claude Code/Codex/Cursor session 持久化 | claude-mem(65k+)、VS Code 1.123、engram、cortex-ai-memory | **极重红海** | 30%（偏离现有方向） | session sync + project memory |
| 7 | **多 agent 共享记忆**：多 agent 之间共享工作记忆 | Mem0 multica、Synapse.md、Neo4j shared graph | **快速变红**（窗口将关） | 50% | shared scope + agent identity + conflict resolution |
| 8 | **记忆治理 Console**：审核 + 解释 + 撤销 + audit | 没人独立做（都是附属） | **不能独立**（必须依附主轴） | 80% | Overview + Candidates + Audit + Explain |
| 9 | **Procedural / Skill 记忆**：把成功经验沉淀为可复用 skill | Mengram、Letta skills、MemOS | 早期红海 | 40% | experience -> skill candidate -> promote |

下面对每个方向做深度展开。

---

## 3. 各方向深度分析

每个方向回答 4 个问题：MVP 是什么 / 6 周能交付什么 / 与竞品的最终竞争位置 / 复用现有代码的程度。


### 3.1 方向 1：Working Context 语义层（主轴之一）

**一句话**：让 Agent 在任何接入产品里都记得用户是谁、偏好、规则、项目背景。

**MVP**：`memory_context_fast` 5 slot 输出 + 跨 appId 复用 + `memory_save_explicit` + `memory_lookup`。Project Workspace 是它的本地入口和 project scope 容器，不再被视为独立 RAG 产品。

**6 周可交付**：
1. scope policy（workspaceId 复用规则 + Filter 模式 + opt-in）
2. `context_fast` 输出对齐（filtered 字段 + warning 枚举 + telemetry 必填）
3. OpenClaw + 1 个其他 appId 的 demo（核心证明：A 写偏好，B 自动用）
4. 三套黄金集（v0.1 / cross-product / safety）+ Vitest runner
5. README 一句话定位 + 5 分钟接入 quickstart

**与竞品最终竞争位**：
- 不与 Mem0 OpenMemory MCP 正面竞争（它是事实标准），而是**做它上一层的语义层**：把工作上下文建模为 profile/rules/task_context/experience/resource 五类，每类有自己的复用策略和 TTL；OpenMemory MCP 是扁平 memory，缺这层结构。
- 与 Letta Agent File **互操作**：导出/导入 .af 格式，让用户可以从 Letta runtime 迁入或迁出。
- 与 Walrus/ZetaChain 区分：他们走链上"可验证可携带"，我们走**纯本地 + 强工作上下文语义**。
- 与 VS Code Project Memory 区分：VS Code 绑定 GitHub 账号 + 单 IDE，我们跨产品。

**红蓝海**：早期红海（叙事被分走但语义层未定）。窗口 6-12 个月。

**复用现有代码**：90%+。`MemoryService`、scope（含 workspaceId）、`AgentFastPathService`、`SlotContextBuilder`、`SemanticTypeMapper`、`HeuristicTypeExtractor` 全部直接用。主要新建：scope policy 模块、filtered 字段、跨 appId demo。

**风险**：
- 不要把 5 slot 做成主库强制 ontology；无法映射的合规记忆必须保留为 lookup-only。
- 不要把跨 appId 复用写成“产品之间共享数据”；主语始终是用户授权下的 Working Context。
- 不要为了对标 Mem0/OpenMemory 提前做完整协议互操作；开源专项先把自身上下文模型跑通。

---

### 3.2 方向 2：本地 Agent 记忆 API（不推荐）

**一句话**：极简 `save/recall/context` API，本地优先。

**MVP**：API 三件套 + LanceDB + MCP server。

**6 周可交付**：API 收缩 + MCP 适配 + `ltm benchmark` + Mem0 风格 dashboard。

**与竞品最终竞争位**：
- 正面 Mem0 / Supermemory / memvid / memU / engram。
- Mem0 已有 OpenMemory MCP 占据"私有跨客户端记忆"心智，我们没有差异化武器。
- engram（Go 单二进制 + MCP/CLI/HTTP/TUI）已经把"轻量本地优先"做到极致，比我们 TS 实现更轻。

**红蓝海**：**重红海**。Mem0 头部、Supermemory 23.5k stars、新涌入 5+ 个本地优先项目。

**复用现有代码**：60%。需要砍掉候选区、scope 多维度、5 slot 等"重"特性，反而增加重构成本。

**风险**：差异化几乎为零。如果选这个方向，6 个月后会被新出现的 Rust/Go 实现碾压。

**结论**：**不推荐**。除非有强烈的"别人没做但我们能做"的差异点，否则进入红海等死。

---

### 3.3 方向 3：Project Memory Workspace（主轴之二，但必须收窄）

**一句话**：把本地项目目录变成用户工作上下文的长期容器，而不是通用知识库或 RAG 平台。

**MVP**：`ltm init` + `.memory-autodb.json` + project manifest + source roots + 增量 evidence + `ltm project context/lookup`。

**6 周可交付**：
1. `ltm init` 创建 project identity 和本地 manifest。
2. `sourceRoots[]` 支持多目录、role、include/exclude、contentHash。
3. `ltm project refresh` 用 manifest diff 做文件新增/修改/删除/移动增量更新。
4. `ltm project context` 预览当前 project scope 的 5 slot。
5. `ltm project lookup` 速查资源、偏好、规则、项目背景和 evidence。

**与竞品最终竞争位**：
- 如果做成“目录到知识图谱”，会正面撞 LightRAG/Cognee/code-review-graph，不推荐。
- 如果做成“Working Context 的本地 project 容器”，竞争位不同：重点不是问答效果，而是 project identity、scope、evidence、session commit、5 slot context。
- VS Code Project Memory、coding agent 记忆都偏 IDE 或 coding 场景；memory-autodb 的边界是本地优先 Agent 应用工作上下文。

**红蓝海**：如果按 RAG 做是重红海；按 Working Context 容器做，是可做的开源专项。

**复用现有代码**：70%。`ingest/*`、`scanner/*`、`tree/*`、`graph/*` 都能用。

**风险**：
- 首次 index 很容易滑向“扫描所有文件 + 建知识库”的重工程，必须用 include/exclude、role、maxFileSize 和 background job 控制。
- tree/graph 只能作为可重建增强层，不作为 v0.x 购买理由。
- `ltm init` 必须先建立 project identity 和 scope，不能先做全量向量化。

**结论**：**保留为主轴之二**。它不是独立知识库方向，而是 Working Context 在本地落地的默认入口。

---

### 3.4 方向 4：跨 agent 上下文路由层（后续观察，不进 v0.x）

**一句话**：给定任务上下文，自动决定哪些记忆以什么粒度、什么时机注入哪个 agent。

**MVP**：路由策略 DSL（`if task.type == "coding" then inject(rules + recent_experience)`） + 注入预算 + 每条注入的 explain。

**6 周可交付**：
1. 策略 DSL（YAML 或 TypeScript）
2. `RouteContext(task, agent, scope) -> SlotPlan` 引擎
3. Console explain 页（"为什么这条记忆被/未被注入"）
4. 默认策略包（coding agent / chatbot / research）

**与竞品最终竞争位**：
- **无人正面做**。所有竞品都把"注入什么"留给 agent 自己决定（pull-based），没人做"系统主动决定注入什么"（push-based / proactive）。
- 这正是调研结论里"真正未定的"：proactive 上下文路由。
- 与所有存储层（Mem0、Letta、Walrus、OpenMemory MCP）**兼容**——我们是上一层。

**红蓝海**：**真蓝海**。学术冷（无热门论文）、工程冷（无热门项目）。

**复用现有代码**：60%。`SlotContextBuilder` 已有评分逻辑，需要新建 RouteContext 层。

**风险**：
- 概念抽象，用户可能不理解"路由"是什么。需要强 demo 证明价值。
- 没有竞品意味着没有市场教育，要自己定义需求。

**结论**：有潜力，但不进 v0.x。当前开源专项只做 Working Context 和 Project Memory Workspace；路由层会引入策略 DSL、默认策略包和解释系统，容易把项目做成抽象平台。v0.x 只保留简单 slot priority、budget 和 filtered reason，为后续判断是否需要路由层留接口。

---

### 3.5 方向 5：Self-improving Agent Memory（可选研究分支）

**一句话**：Agent 通过反思自动改进记忆和技能。

**MVP**：experience -> reflection -> skill candidate -> approval pipeline。

**6 周可交付**：reflection job + skill candidate + Console approval + 1 个完整闭环 demo。

**与竞品最终竞争位**：
- 学术（Voyager/Reflexion/FORGE/MindForge）非常活跃，但**工程化开源稀缺**。
- 与 Mengram（procedural memory + workflow feedback）有重叠，但 Mengram 项目规模小。

**红蓝海**：**工程化蓝海**（学术红海）。

**复用现有代码**：50%。需要新建 reflection 引擎和 skill repository。

**风险**：
- 没有审核会"学坏"——错误经验固化是最大风险。
- 6 周做不完整，只能做 demo。

**结论**：**作为研究分支可探索**，不作为主轴。如果方向 1 验证成功，方向 5 是天然的下一步（因为方向 1 的 experience slot 正好是 reflection 的输入）。


### 3.6 方向 6：Coding agent 专用记忆（强烈不推荐）

**一句话**：Claude Code/Codex/Cursor session 持久化 + project memory。

**MVP**：session sync + project memory + tool call 记忆。

**6 周可交付**：与 claude-mem 类似的 session 持久化插件。

**与竞品最终竞争位**：
- **claude-mem 65k-75k stars**（2026 年单点炸裂）
- **VS Code 1.123 官方 Project Memory**（绑定 GitHub）
- engram、cortex-ai-memory（VS Code 插件）、claude-code-memory、opencode-mem、memory-agent (Rust)、claude-mem-lite

**红蓝海**：**极重红海**。窗口已基本关闭。

**复用现有代码**：30%。和现有方向偏离最大。

**风险**：进入即死。

**结论**：**强烈不推荐**。即使想做 coding agent，也应通过方向 1 的"通用工作上下文"间接服务（claude-mem 是 coding agent 的事实标准，跟它合作而非竞争）。

---

### 3.7 方向 7：多 agent 共享记忆（不推荐为短期主轴）

**一句话**：多个 agent 之间共享工作记忆，支持冲突解决和身份隔离。

**MVP**：shared scope + agent identity + conflict resolution。

**6 周可交付**：跨 agentId 共享 scope + 冲突 candidate + 简单决议规则。

**与竞品最终竞争位**：
- Mem0 multica（multi-agent memory，案例已发）
- Synapse.md（slogan 直接是 multi-agent shared memory）
- Neo4j NODES AI 2026（推图谱方案）
- AWS S3 Vectors（multi-agent memory 官方博客）
- arxiv 2603.10062 把它定义为"computer architecture problem"

**红蓝海**：**快速变红，窗口将关**。研究和产品同时发力。

**复用现有代码**：50%。scope 已支持多 agentId，需要新建 conflict resolution。

**风险**：
- 巨头（AWS、Mem0、Neo4j）入场太快，单独做容易被压。
- 多 agent 共享是"多用户共享"的扩展，本质需要分布式一致性，工程复杂度高。

**结论**：**不推荐为短期主轴**。可作为方向 1 成熟后（v0.5+）的扩展。

---

### 3.8 方向 8：记忆治理 Console（依附型，不能独立）

**一句话**：让用户审核、解释、撤销记忆，给 admin 看 audit。

**MVP**：Overview + Candidates + Audit + Explain。

**6 周可交付**：3 页 + audit 流。

**与竞品最终竞争位**：
- **没人独立做治理 Console**——都是某个记忆产品的附属页面（Mem0 dashboard、Zep observability、Cognee UI）。
- 作为独立产品没有市场。

**红蓝海**：**N/A**——必须依附主轴。

**复用现有代码**：80%。

**结论**：**作为方向 1 的子模块**保留，而不是独立方向。本迭代 Milestone C 已经规划了 Candidates 页面，足够。

---

### 3.9 方向 9：Procedural / Skill 记忆（不推荐为主轴）

**一句话**：把 agent 的成功经验沉淀为可复用 skill。

**MVP**：experience -> skill candidate -> promote -> 跨 session 复用。

**6 周可交付**：skill repo + promote pipeline + Console 审核。

**与竞品最终竞争位**：
- Mengram（procedural memory + workflow feedback）项目规模小
- Letta skills（兼容 Claude Code/Codex CLI 的共享 skills 仓库）
- MemOS（MemTensor，把 skill 复用作为一等公民）

**红蓝海**：早期红海。Letta 的 skill 仓库是事实标准候选。

**复用现有代码**：40%。需要新建 skill 抽取和 promote 逻辑。

**风险**：与 Letta skills 直接竞争，对方有 runtime 加持。

**结论**：**不推荐为主轴**。如果做，应通过方向 1 的 experience slot + 方向 5 的 reflection 间接做，不直接进入这个赛道。

---

## 4. 红海 / 蓝海决策矩阵

把 9 个方向按"竞争密度"和"对我们的战略价值"二维定位：

```
战略价值 高
    ↑
    │  方向4 (路由层)              方向1 (工作上下文层)
    │  有潜力但后置                 早期红海·高价值
    │                              [主轴之一]
    │
    │  方向5 (self-improve)        方向7 (多agent共享)
    │  工程蓝海·中长期              快速变红·中价值
    │  [可选研究分支]
    │
    │  方向3 (Project Workspace)   方向9 (procedural)
    │  可做专项·需防 RAG 化          方向8 (Console)   方向2 (本地API)
    │                              依附型             重红海·低差异
    │                                                方向6 (coding)
    │                                                极重红海·禁区
    │
    └────────────────────────────────────────→ 竞争密度 高
```

**决策原则**：
- **左上区域是首选**：高价值 + 低竞争。方向 1 + 方向 4 落在这里。
- **右下区域是禁区**：高竞争 + 低差异。方向 2/3/6 在这里。
- **中间区域要慎选**：方向 5/7/9 都是"等主轴稳定后再考虑"。

> 最终决策修正（2026-06-10 拍板）：虽然方向 4（路由层）在矩阵上是蓝海高价值，但作为开源 v0.x 容易抽象过度、稀释专项，因此**不纳入 v0.x**，只保留简单 slot priority / budget。最终只做**方向 1 + 方向 3**（Working Context 语义层 + Project Memory Workspace），方向 3 虽在矩阵右下（RAG 红海），但**只取其"本地 project 容器"形态服务 Working Context，不做通用 RAG**，因此避开了正面竞争。方向 4 留待 v0.3+ 按使用数据评估。


---

## 5. 与现有代码复用度详细对比

按代码核对（2026-06-10）确认每个方向能复用多少现有模块：

| 模块 | 方向1 | 方向2 | 方向3 | 方向4 | 方向5 | 方向6 | 方向7 | 方向8 | 方向9 |
|------|------|------|------|------|------|------|------|------|------|
| `core/memory-service.ts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `core/types.ts` (含 workspaceId) | ✓ | 部分 | ✓ | ✓ | ✓ | 部分 | ✓ | ✓ | ✓ |
| `core/scope.ts` | ✓ | 部分 | ✓ | ✓ | ✓ | 部分 | ✓ | ✓ | ✓ |
| `api/agent-fast-path.ts` | ✓ | 部分 | 部分 | ✓ | ✓ | ✗ | ✓ | ✓ | 部分 |
| `core/slot-context-builder.ts` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | 部分 |
| `core/slot-snapshot.ts` | ✓ | ✗ | ✗ | ✓ | ✓ | ✗ | ✓ | ✓ | ✗ |
| `lifecycle/candidate-*` | ✓ | ✗ | 部分 | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| `lifecycle/type-extractor.ts` | ✓ | 部分 | 部分 | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ |
| `lifecycle/retention.ts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `ingest/pipeline.ts` | 部分 | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `scanner/*` | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `tree/*` (in-memory) | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | 部分 | ✗ | ✗ |
| `graph/*` (in-memory) | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | 部分 | ✗ | ✗ |
| `console/api.ts` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `adapters/openclaw/*` | ✓ | 部分 | 部分 | ✓ | ✓ | ✗ | ✓ | ✓ | 部分 |
| `db/providers/*` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**关键观察**：
- **方向 1 复用度 90%+**：所有核心模块都直接用上，主要新建 scope policy 模块和 filtered 字段。
- **方向 2 复用度 60%**：要砍掉 5 slot、scope 多维度、候选区——反而是重构成本。
- **方向 3 复用度 70%**：tree/graph/scanner/ingest 全部用上，但不用 5 slot 和快路径。
- **方向 4 复用度 60%**：基础架构都能用，主要新建 RouteContext 引擎和策略 DSL。
- **方向 6 复用度 30%**：与现有方向偏离最大，相当于重做。

**结论**：从复用度看，方向 1 + 方向 3 是最自然的延续——现有代码（含 `tree/graph/scanner/ingest`）基本都用得上，新增的部分都是"语义层"和"本地 project 容器"，而不是"重做存储"。方向 4（路由层）复用度虽也不低，但因抽象过度风险不纳入 v0.x。

---

## 6. 推荐组合

### 6.1 推荐专项：只做两个主轴

> 分期说明（v2 评审后）：跨 appId 复用工程量大（Owner/Working Context Scope 分离 5 大改动），从 v0.1 拆出延后 v0.2。v0.1 聚焦**单 appId 内**的 Working Context 闭环。详见 [next-iteration-product-plan.md](../04-design/04.2-detail/next-iteration-product-plan.md) §6。

**主轴 1：Working Context 语义层**
- 一句话定位：**让 Agent 在任何接入产品里都记得用户是谁、偏好、规则、项目背景。**
- v0.1（6 周）：`context_fast` 5 slot + 单 appId 的 workspace/project 复用 + filtered/warning + v0.1/safety 黄金集。
- v0.2（8-10 周）：跨 appId 复用（Owner/Working Context Scope 分离）+ cross-product 黄金集。
- 价值主张：不是通用 memory API，而是把长期记忆整理成 Agent Runtime 可直接使用的 Working Context。

**主轴 2：Project Memory Workspace**
- 一句话定位：**在本地目录执行 `ltm init`，把目录变成 Working Context 的 project 容器。**
- v0.1（6 周）：`ltm init` 创建 project identity + manifest（不强制目录索引）+ project context/lookup。
- v0.2（8-10 周）：完整 source roots + 增量 evidence + scanner 改造 + `ltm project refresh/watch`。
- 价值主张：不是通用 RAG，而是给用户工作上下文一个本地、可追溯、可增量维护的落点。

**存储层策略（用户决策）**：scope filter 和召回逻辑统一走 `DatabaseProvider` 接口，不绑定 LanceDB 特性。LanceDB 是 v0.1 默认 provider；如果跨 appId scope filter 性能不达标，可替换为 postgres/supabase（pgvector）而不改服务层。保证存储可替换。

**两个主轴一句话合并**：

> memory-autodb 是面向 Agent 应用的本地优先 Working Context 中间件：用 5 slot 交付运行上下文，用 Project Memory Workspace 承载本地项目工作记忆。

### 6.2 暂不做（要敢砍）

| 砍 | 原因 |
|----|------|
| 方向 2（本地 Memory API） | Mem0 + 5 个新涌入项目的红海 |
| 方向 3 的通用 RAG 形态 | LightRAG/Cognee/VS Code 红海；只保留 Project Memory Workspace 的 Working Context 容器形态 |
| 方向 4（跨 agent 上下文路由层） | 有潜力但抽象，作为开源 v0.x 会稀释专项；先用简单 slot priority / budget，不做 DSL |
| 方向 6（coding agent 记忆） | claude-mem 65k+ stars + VS Code 官方下场，禁区 |
| 方向 7（多 agent 共享） | AWS/Mem0/Neo4j 入场太快，等方向 1 稳定后再说 |
| 方向 9（procedural memory） | Letta skills 已是事实标准，红海 |
| OpenMemory MCP 完整互操作 | 不是 v0.x 专项目标；先保持 MCP/REST/SDK adapter 边界，不做 import/export 兼容项目 |

### 6.3 降级（依附主轴或后置）

| 降级项 | 处理 |
|--------|------|
| 方向 8（治理 Console） | 只保留最小 Quick Lookup / context preview / candidate 列表；不做独立治理产品 |
| 方向 5（self-improving） | 作为研究分支，方向 1 验证成功后启动 |
| 当前规划中的 tree/graph 持久化 | 保持 in-memory baseline，v0.x 不做 |

### 6.4 一份"新版 P0"对比

为了让取舍可视化，把现在的 P0-1~P0-7 和聚焦后的 P0 对比：

| 当前 P0 | 聚焦后 |
|--------|--------|
| P0-1 scope 复用规则 | **保留**（方向 1 核心）；v0.1 单 appId，v0.2 跨 appId |
| P0-2 Agent 快路径增强 | **保留**（方向 1 核心，v0.1） |
| P0-3 Project Memory Workspace | **保留**（方向 1 的本地 project 容器，不做通用 RAG）；v0.1 只建 identity，完整索引 v0.2 |
| P0-4 doctor/demo/connect | **保留最小版**：demo + connect + project status；doctor 简化（v0.1） |
| P0-5 Console Overview + Quick Lookup | **保留最小版**：Quick Lookup / context preview / candidate 列表（v0.1） |
| P0-6 候选区闭环 | **保留**（方向 1 核心，candidate 是工作上下文沉淀的源头，v0.1） |
| P0-7 黄金集 + quick eval | **保留**（差异化证明的唯一手段）；v0.1 用 v0.1+safety 套件 |
| **延后 v0.2** P0-8 跨 appId 复用 demo | 方向 1 的"啊哈时刻"证明；依赖 Owner/Working Context Scope 分离（5 大改动） |
| **不新增** 路由 DSL | v0.x 只做 slot priority / budget，不做独立方向 |
| **不新增** OpenMemory 互操作 | v0.x 不做 import/export 兼容项目 |

新版 P0 的焦点从"功能堆叠"变成两个开源专项：**Working Context 输出质量** 和 **Project Workspace 本地入口**。v0.1 先在单 appId 内打通闭环，跨 appId 连续性（核心差异化）在 v0.2 兑现。


---

## 7. 决策清单（已拍板）

> 状态：2026-06-10 已确认。下方记录最终决策。

| 问题 | 决策 |
|------|------|
| Q1 主轴选哪个 | **方向 1（Working Context 语义层）+ 方向 3（Project Memory Workspace）**，只做这两个，保持产品简单。不做方向 4 路由层（避免抽象过度）。 |
| Q2 Project Memory Workspace 怎么做 | **作为 Working Context 本地入口**：v0.1 先建 project identity / manifest，v0.2 补 source roots / 增量 evidence。不做通用 RAG。 |
| Q3 OpenMemory MCP 互操作 | **v0.x 不做** import/export，保留 MCP/REST/SDK adapter 边界。scope 分离架构为未来互操作预留 provenance 字段。 |
| Q4 路由层何时做 | **v0.x 不做**，只保留简单 slot priority / budget。v0.3+ 视使用数据评估。 |
| Q5 发布节奏 | **分两期**：v0.1（6 周，单 appId 闭环）→ v0.2（8-10 周，跨 appId 复用 + 完整 Project Workspace）。 |
| 存储层 | scope filter 走 `DatabaseProvider` 接口，**LanceDB 可替换**；A0 spike 选定 v0.2 默认 provider。 |
| 越用越懂量化 | 降级为 v0.1 定性观察；量化指标（重复解释减少率 / 采纳率）延后 v0.3 行为监控研究分支（需先建采集 pipeline）。 |

---

## 8. 下一步动作（已确认方案）

按已确认方向：只做 Working Context 语义层 + Project Memory Workspace，分两期。

### v0.1（6 周，单 appId 闭环）

**第 1 周（Milestone A0）**：
- 核心流程文档对齐（提取/树/去重/降级/过期）+ v0.1/safety 黄金集 + baseline-v4 freeze
- ADR：方向选择 + 不做清单 + Project Workspace 边界 + 越用越懂降级为定性 + 存储 provider 选型
- `DatabaseProvider` scope filter spike（选定 v0.2 默认 provider，LanceDB 可替换）

**第 2-3 周（Milestone A1-lite + A2-lite）**：
- 单 appId scope policy + filtered 字段 + warning 枚举 + extractor 人格/敏感黑名单
- `ltm init` 创建 project identity + manifest（不强制目录索引）

**第 4-5 周（Milestone B + C）**：
- `ltm demo/connect/status`（单 appId 验证）
- 最小 Console：Quick Lookup / context preview / candidates

**第 6 周（Milestone D-lite）**：
- quick eval（baseline-v4 vs vnext，单 appId + safety）
- README 一句话定位 + 5 分钟 quickstart
- v0.1 发布

### v0.2（8-10 周，跨 appId 复用，spike 通过后启动）

- Owner/Working Context Scope 分离（`WorkingContextResolver` + `ScopePolicy` + provider scope filter）
- 跨 appId 复用 + 第二 appId adapter + cross-product 黄金集
- 完整 Project Workspace（source roots + 增量 evidence + scanner 改造）

### v0.3（研究分支，非承诺）

- 行为监控 pipeline（FeedbackCollector + RepetitionDetector），把"越用越懂"从定性升级为量化指标

---

## 9. 评审记录

| 日期 | 评审人 | 决策 |
|------|--------|------|
| 2026-06-10 | Claude (orchestrate research) | 产出本文档；初版推荐方向 1 + 方向 4 双主轴 |
| 2026-06-10 | 用户拍板 | **方向 1 + 方向 3**（不做路由层）；分期 v0.1（单 appId）/ v0.2（跨 appId）；存储走 provider 接口可替换；越用越懂降级为定性 + v0.3 量化 |

---

## 10. 关联文档

- 产品定位真源：[product-positioning.md](./product-positioning.md)
- 下一迭代规划：[next-iteration-product-plan.md](../04-design/04.2-detail/next-iteration-product-plan.md)
- 上次评审：[next-iteration-product-plan-review.md](../04-design/04.2-detail/next-iteration-product-plan-review.md)
- 基础竞品研究：[open-source-memory-competitor-research.md](./open-source-memory-competitor-research.md)
- 评测方案：[memory-evaluation-plan.md](../07-test/memory-evaluation-plan.md)


