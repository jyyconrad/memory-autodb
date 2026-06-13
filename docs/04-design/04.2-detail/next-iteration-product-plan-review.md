# 多维度评审：产品定位与下一迭代产品方案

> 日期：2026-06-10
> 状态：已应用（评审意见已落入两份文档，2026-06-10）
> 评审对象：
> - [docs/03-architecture/product-positioning.md](../../03-architecture/product-positioning.md)（产品定位真源）
> - [docs/04-design/04.2-detail/next-iteration-product-plan.md](next-iteration-product-plan.md)（下一迭代方案）
> 评审基线：当前代码 v2.1/v3.0，含 `core/memory-service.ts`、`core/types.ts`、`core/scope.ts`、`api/agent-fast-path.ts`、`adapters/openclaw/*`、`console/api.ts`、`ingest/*`、`lifecycle/*` 等模块。
> 评审维度：定位清晰度 / 范围与优先级 / 与代码基线对齐 / 架构一致性 / 用户场景与价值主张 / 验收与评测 / 风险与未识别问题 / 文档结构与可追踪性。

---

## 0. 代码核对修正（2026-06-10）

评审初稿后做了实际代码核对，以下评审假设被**证伪或修正**，相关建议已据实调整，两份文档已按修正后的结论更新：

| 评审初稿假设 | 代码核对结论 | 处理 |
|--------------|--------------|------|
| `workspaceId` 不存在，需 schema 迁移（M-3/M-4） | **已存在**（`core/types.ts:66-79`，v3.0 含 workspaceId/sessionId/visibility） | 不再迁移，只补复用策略层；M-3 改为基目录保持兼容 |
| SlotSnapshot 双角色混淆（ARCH-3） | SlotSnapshot 是**纯缓存**，运行视图在 `SlotContextBuilder` | ARCH-3 降级为澄清说明 |
| 去重/降级/过期完全缺失（M-0 五项空白） | **代码部分已实现**：`ingest/pipeline.ts` contentHash 去重、`lifecycle/retention.ts` TTL、`MemoryLifecycleStatus` 状态机、候选 30 天淘汰 | M-0 改为"补设计文档 + 对齐代码 + 打通 Console"，工作量下调 |
| `MemoryService` 方法是 storeMemory/getMemory/searchMemories | 实际是 `storeMemory/recall/buildContext/delete/health` | 文档术语校正 |
| Agent context 缺 telemetry | **已有** warnings/telemetry/freshness，仅缺 filtered | 快路径增强范围缩小到补 filtered + 枚举化 |
| 默认库路径 `~/.openclaw/memory/autodb` | 实际 `~/.openclaw/memory/lancedb` | 基目录决策修正，不引入新基目录 |
| extractor 可能是 LLM-based | 是**确定性启发式**（`HeuristicTypeExtractor`），LLM 仅接口 | 明确 v0.x 启发式优先 |
| tree/graph 需判断是否持久化 | 均为 **in-memory baseline，无持久化** | v0.x 明确保持 in-memory + export |

结论：方案的核心抽象比评审初稿预估的更完整，**真正缺的是文档（how）、策略层（scope policy）和闭环打通（Console/extractor/filtered），而不是底层能力**。这反而提高了下一迭代的可落地性。

---

## 1. 总览结论

| 维度 | 评分 | 关键判断 |
|------|------|----------|
| 产品定位清晰度 | A- | "本地优先用户工作上下文中间件"定位明确，与 cloud SaaS、coding-agent 工具的边界清晰；缺一份和 mem0/Zep/Letta 的差异化矩阵。 |
| 用户与场景覆盖 | B+ | "切换 Agent 产品保留上下文"场景具体，但目标用户群体定义偏窄，缺少"非开发者用户"和"团队场景延后做"的明确证据。 |
| 范围与优先级 | B | P0 项数量多（7 项）且都强耦合 Project Workspace；建议把 Project Workspace 单独切出一个先导阶段，否则 Milestone A 易膨胀。 |
| 与代码基线对齐 | B+ | 表格对齐了已有模块，但 Project Workspace、source root registry、manifest diff 在当前代码中**完全不存在**，未在表内显式标注"新建"。 |
| 架构一致性 | C+ | **存储视图的"记忆提取管线"、"树构建"、"去重/降级/过期"核心流程完全缺失**，导致 Milestone A 工作量无法正确估算。5type 运行视图分层逻辑清晰，但与提取管线未打通。 |
| 验收与评测 | B | quick eval 套件粒度合理，缺少**P95 延迟数值**、**召回率门槛**、**上下文 token 预算**等可度量门限。 |
| 风险识别 | B- | 风险表偏战术（功能层），缺战略风险：local 库丢失/损坏、跨产品复用的法律/隐私边界、scope 推导错误的 blast radius。 |
| 文档结构与可追踪性 | A- | 章节组织清晰，可作为里程碑账本使用；个别表格存在术语冲突（见 §6）。 |

**整体结论**：方向正确、边界清晰。**核心缺陷**：存储视图只列出了"what"（四层、五介质、三树），但**没有说明"how"**（记忆怎么提取、树怎么构建、去重/降级/过期怎么做），导致 Milestone A 内塞入的"scope policy + 存储视图 + Project Workspace + 多 source root + 快路径增强"五件大事中，**存储视图的工程量被严重低估**。建议先补全核心流程文档（M-0），再拆分 Milestone（M-1）。

---

## 2. 产品定位文档评审（product-positioning.md）

### 2.1 强项

1. **一句话定位精炼**：第 1 节"面向 Agent 应用的本地优先记忆中间件"配合"持续存在的工作上下文"明确了产品轴向，避免了和 RAG 工具、知识库、coding 助手混淆。
2. **不做什么列得明确**：第 5 节用四条排除规则（不进入 coding-agent 赛道 / 不做 Runtime / 不做云端 SaaS / 不做图谱优先），把竞品边界划清，对后续技术决策有约束力。
3. **Project Memory Workspace 概念有产品力**：把"目录"提升为一等输入，比同类竞品（mem0、Zep、Letta）的 SDK-only 模式有差异化。

### 2.2 需要补强

| 编号 | 问题 | 影响 | 建议 |
|------|------|------|------|
| POS-1 | 第 3 节"典型使用场景"列出 10 个，但**所有场景**都假设用户已经熟悉 `ltm init` / `memory_session_commit` 等命令。缺一条"用户第一次接触产品"的入门场景。 | 新接入产品的开发者难以判断"我应该先从哪一条接入"。 | 在第 3 节顶部加一句"v0.x 默认入口场景：开发者通过 `ltm init` + OpenClaw adapter 接入"。 |
| POS-2 | 第 6 节"和 OpenClaw 的关系"只声明 OpenClaw 是首批接入方，但没说明**是否唯一接入方**、其他接入方何时考虑、Local server 是否必须？ | 给"Console / Local server / SDK"三条线的优先级留下歧义。 | 增加一段"v0.x 默认主接入：OpenClaw adapter；Local server 在 Milestone B 后启用；SDK/MCP/REST 已并行支持但不作为单独发布渠道"。 |
| POS-3 | 第 7 节"成功标准"8 条，**全部为定性描述**，无一可测。 | 后续 quick eval 无法直接对应到这些标准，导致成功标准只能在事后解释。 | 至少为 1/4/6/7/8 条配上量化指标：例如"context_fast P95 < 200ms / 跨 appId 召回成功率 ≥ 80% / private 误注入率 = 0"。 |
| POS-4 | 缺竞品差异化矩阵。文档已经在 `docs/03-architecture/open-source-memory-competitor-research.md` 存在，但定位文档没有引用。 | 读者无法在一份文档内理解"为什么不直接用 mem0/Zep"。 | 在第 5 节后增加"差异化要点"小节，引用竞品研究文档，列出 3-5 行核心差异。 |
| POS-5 | 第 4 节 Project Memory Workspace **没有定义 project identity 的来源**：是 contentHash(目录路径)、还是用户输入的项目名、还是 git remote URL？ | 直接影响"目录移动后能否保留 project identity"这一关键诉求。 | 明确 identity 优先级：用户显式名 > git remote > contentHash(absolute path)，并落到 `.memory-autodb.json` schema。 |

---

## 3. 下一迭代方案评审（next-iteration-product-plan.md）

### 3.1 一句话目标（第 1 节）

**评审**：目标句"在切换到另一个授权 Agent 产品或任务场景后，仍能被 `memory_context_fast`、`memory_lookup` 和 Console 快速、安全、可解释地使用"非常清晰，**这是本迭代最强的一句话**。建议把这句话作为 quick eval cross-product suite 的验证主张。

### 3.2 当前代码基线（第 2 节）

**强项**：表格对齐当前模块，省去了重复评估。

**问题**：
- 表中"Project Memory Workspace"、`sourceRoots[]`、`manifest.json`、`ltm init` 等**当前代码不存在**，但表格是"当前代码基线"，应明确把"新建"项分离为"目标新建"列，否则会让读者误以为已经实现。
- `core/scope.ts` 标"已有多维 scope，但产品级 app/workspace 语义需要强化"——这里"workspaceId"在当前代码中**实际不存在**（已有 `tenantId/appId/userId/projectId/agentId/namespace`，无 `workspaceId`），应明确"workspaceId 为新增字段"。

**建议**：把第 2 节表格分两栏：`已实现` / `本迭代新建/扩展`，避免基线和目标混淆。

### 3.3 目标用户与场景（第 3 节）

**评审**：3.1 节用户分类合理。3.2 节 5 个场景具体可测。

**遗漏**：
- 没有"已有 v2.1 用户的迁移场景"。当前 v2.1 已对外发布，下一迭代必须考虑：旧 `dbPath` 数据如何升级到 Project Workspace 模型？
- 第 5 个场景"本机诊断"用户是开发者，但**没有"用户/产品管理员的诊断场景"**，例如 Console 中的"为什么这条记忆没被注入"。

**建议**：在 3.2 增加"场景 6：用户在 Console 中追溯一条预期被注入但未出现的记忆，能看到 `filtered.reason` 和 evidence id"。

### 3.4 P0 列表（第 4.1 节）

| P0 编号 | 评审 |
|---------|------|
| P0-1 scope 复用规则 | 必做，但**应优先于 P0-3**。Project Workspace 依赖 scope 已就绪。 |
| P0-2 快路径增强 | 必做，且范围已较成熟（接口已存在），是低风险快赢。 |
| P0-3 Project Memory Workspace | **工程量最大、依赖最多**，建议单独切一个先导 milestone，不要塞进 Milestone A。 |
| P0-4 doctor/demo/connect | 价值高，但应在 P0-3 落地后才能给出有意义的 doctor 输出。 |
| P0-5 Console Overview + Quick Lookup 强化 | 必做，依赖 P0-2 的 telemetry 和 filtered 字段。 |
| P0-6 候选区闭环 | 必做，但**与 P0-3 解耦**，可并行推进。 |
| P0-7 内置黄金集和 quick eval | 必做，但**应作为 P0-1/P0-2 的入口验收**，而不是放在最后做。 |

**核心建议**：P0-7（quick eval 黄金集）应当作为**前置基础**，先落 30 条黄金集再做后续开发，避免迭代后期才发现验收门槛过高。

### 3.5 Scope Contract（第 5.1 节）

**强项**：复用策略 1-5 条规则清楚，private/revoked/stale 强过滤明确。

**风险**：
- 第 4 条"`resource` 默认按 `workspaceId/projectId` 复用"——`workspaceId` 和 `projectId` 是**包含关系还是平级关系**？文档中两者都用"复用边界"描述但语义不同。建议明确：`workspaceId ⊇ projectId`，一个 workspace 可包含多个 project，profile/rules 在 workspace 层，task_context 在 project 层。
- 第 5 条"private/revoked/stale 永远不因产品接入而放宽"——但**没有定义"放宽"的反面是"拒绝读取"还是"拒绝注入但允许 lookup_deep 显式查询"**。这两种语义对 Console 治理影响很大。

**建议**：
1. 增加 `workspaceId` 与 `projectId` 的层级图。
2. 新增"Filter 模式"小节：明确每种过滤是 `block_read` / `block_inject` / `block_recall_but_allow_lookup` 三选一。

### 3.6 存储视图与 5type 运行视图（第 5.2 节）

**强项**：
- 七类输入、四层存储视图、五种介质边界、三类树是**全文档最有架构价值的部分**，把"5type 是运行视图"和"durable memory 是存储视图"分开了，避免了之前"semantic type 既是字段又是抽象"的混淆。
- "无法映射到 5type 的合规记忆保留为 lookup-only"是对长期可用性的保护，避免 type 系统僵化导致信息丢失。

**严重遗漏**：
| 编号 | 遗漏 | 影响 | 建议 |
|------|------|------|------|
| ARCH-0-1 | **记忆如何从输入提取到 MemoryRecord** 的流程完全未说明。七类输入只列"落盘路由"，但没有说明：observation 如何变成 candidate？document chunk 怎么提取 entity？什么触发 extractor？ | 核心管线缺失，Milestone A 无法验收"extractor 正常工作"。 | 增加 §5.2.X "记忆提取管线"：`input -> extract_candidate job -> type extractor (heuristic/LLM) -> CandidateRecord{kind, preview, evidence} -> review -> MemoryRecord`；说明启发式规则 + LLM extractor 分工。 |
| ARCH-0-2 | **记忆树如何构建** 完全未说明。第 5.2 节列出"记忆树保留三类（Source / Topic / Global Tree）"，但**树节点怎么来？从 MemoryRecord 聚合？从 Document 聚合？从 entity graph 生成？** | 树构建逻辑空白，Console Overview "整体预览"无法实现。 | 增加 §5.2.Y "记忆树构建"：`TreeLeaf: MemoryRecord/Chunk → TreeBuffer: 按 evidenceId/topic/date 聚合 → TreeSummaryNode: LLM 生成 summary → 三类树索引`；明确 Source Tree 按文件，Topic Tree 按 entity/project，Global Tree 按日期/workspace。 |
| ARCH-0-3 | **去重逻辑** 完全未说明。Project Workspace §5.2.1 提到"contentHash 不变不重复生成长期记忆"，但**不同 input 来源的重复怎么处理？同一事实多次 observe 怎么去重？跨 appId 的偏好冲突怎么处理？** | 大量冗余记忆污染主库，影响召回质量。 | 增加 §5.2.Z "去重与冲突处理"：1. Document 去重：contentHash + fuzzy match；2. 观察去重：embedding 相似度 > 0.95 + scope 匹配；3. 跨 appId 偏好冲突：标记 conflict，进入 candidate 治理；4. 去重 audit 日志保留。 |
| ARCH-0-4 | **降级策略** 完全未说明。文档多次提到 stale（文件删除、tree summary stale、warnings.stale），但**stale 后怎么办？隐藏？降权？移除 vector？保留 lookup-only？** | stale 记忆处理不一致，Console 和 Runtime 预期不同。 | 增加"Lifecycle 状态机"：`active -> stale(ttl 7d) -> archived(lookup-only) -> expired(deleted)`；stale 不进 context_fast，但 lookup_deep 可见；Console 显示 stale badge。 |
| ARCH-0-5 | **过期策略** 完全未说明。第 5.6 节提到"30 天清理"，§5.1 提到"expire"，但**哪些 kind 有 TTL？TTL 从何时开始计？过期后物理删除还是软删除？evidence 关联怎么处理？** | 用户无法预期记忆生命周期；过期清理可能误删关键记忆。 | 增加"TTL 策略表"：candidate(30d)、task_context(90d)、experience(1y)、profile(永久)、resource(视 source root 删除)；计时从 lastAccessedAt；过期走 soft delete + 保留 audit；evidence 孤儿保留 30d 后清理。 |

**问题**：
| 编号 | 问题 | 建议 |
|------|------|------|
| ARCH-1 | "记忆树保留三类"在第 5.2 节，但 Milestone A 验收标准里**没有树相关的验收项**。是树在本迭代不交付？还是已交付但未列出？ | 明确 Source Tree / Topic Tree / Global Tree 在 v0.x 是"in-memory baseline 即可"还是"必须持久化"。当前代码 `tree/*` 是 in-memory，建议显式声明本迭代不持久化。 |
| ARCH-2 | "召回到 5type 的流程"伪代码 9 步，但**评分函数权重未给**：relevance / scopeFit / importance / confidence / evidence / recency 怎么加权？ | 给一个 v0.x 默认权重，例如 `0.4r + 0.2s + 0.15i + 0.1c + 0.1e + 0.05R`，并允许后续 ADR 调整。 |
| ARCH-3 | "SlotSnapshot 是快路径缓存，不是长期记忆真源"——但当前代码 `core/slot-snapshot.ts` 中 SlotSnapshot 既参与了 builder，又被 fast path 缓存，**两种角色边界在代码里不明显**。 | 文档中加一段"SlotSnapshot 双角色澄清"：构建期是**视图组装结果**，缓存期是**短 TTL 缓存**，invalidate 触发条件需要列出。 |
| ARCH-4 | "pending candidate、raw observation、raw chunk 不进入 `context_fast`"——这条规则**与 P0-2 的 `filtered` 字段没有打通**。filtered 应当区分"被规则过滤"和"被预算过滤"。 | 把"不进入 context_fast 的合规规则"列成一份清单，并在 `filtered.reason` 中固定枚举值。 |

### 3.7 Project Memory Workspace（第 5.2.1 节）

**强项**：多 source root + role + ingest policy 设计深思熟虑；目录变化处理表（新增/删除/移动/root 增删/include 变更）覆盖完整。

**问题**：
| 编号 | 问题 | 建议 |
|------|------|------|
| PMW-1 | "在用户本地全局库创建 `~/.memory-autodb/projects/<project-id>/manifest.json`"——和当前代码 `dbPath` 默认 `~/.openclaw/memory/autodb` **路径不一致**。 | 统一基目录：建议 `~/.memory-autodb/`（产品名）作为新基目录，`~/.openclaw/memory/` 保留 legacy 兼容；同时在 `ltm migrate` 中提供迁移路径。 |
| PMW-2 | `.memory-autodb.json` schema **未定义**。文档说"轻量指针"，但是否包含 projectId / sourceRoots / ingestPolicy 不清楚。 | 在 §5.2.1 末尾给出 minimum schema： `{projectId, projectName?, createdAt, sourceRoots: [{path, role, include, exclude}], ingestPolicy?}`。 |
| PMW-3 | "文件移动但 contentHash 不变时不重复生成长期记忆"是 Milestone A 验收第 3 条，但**未说明 path provenance 如何更新**。 | 明确 Document 表保留 `pathHistory: [{path, observedAt}]`，evidence 引用最新 path。 |
| PMW-4 | watch 命令未指定**触发频率**和**批量大小**。本地大目录（>10k 文件）的初次扫描可能阻塞 server。 | 明确 v0.x 限制："首次 index 单次最多处理 5000 文件，超出走 background job 分批"。 |
| PMW-5 | source root role 列出 6 种（project_root/docs/notes/assets/external_reference/generated_output），但**没说明 generated_output 的默认是排除还是包含**。后者会污染长期记忆。 | 明确默认 `generated_output` 在 ingest 中**排除**，需用户显式 opt-in。 |

### 3.8 Agent Runtime 快路径增强（第 5.3 节）

**强项**：`AgentContextFastResult` schema 设计清楚，增加 `warnings` / `filtered` / `telemetry` 三个字段对调试和评测都有价值。

**问题**：
| 编号 | 问题 | 建议 |
|------|------|------|
| API-1 | `taskHints[i].evidenceIds` 是数组，但**没有上限**。如果每个 hint 列 50 个 evidence，token 会爆。 | 限定 v0.x 每 hint 最多 5 个 evidenceId，更多放在 lookup 中。 |
| API-2 | `warnings` 列出 4 类（stale / budget_exceeded / private_filtered / fallback_lookup），但**枚举不闭合**。 | 改为 `warning.code: enum` + `warning.message: string`，并在文档中列出 v0.x 完整枚举表。 |
| API-3 | `telemetry.tokenEstimate?` 可选——但**评测必需**。 | 改为必填，无法估算时返回 `-1` 表示"未估算"。 |
| API-4 | "`memory_context_fast` 的 OpenClaw 工具、REST `/v1/agent/context` 和 SDK 输出保持一致"是非常重要的约束，但**没有列入验收项**。 | 在 Milestone A 验收增加："三处接入点输出 schema diff = 0（用 contract test 校验）"。 |

### 3.9 接入体验（第 5.4 节）

**强项**：12 个新增 CLI 命令覆盖完整。

**问题**：
- `ltm doctor` 输出示例只 5 行，**实际 doctor 应该覆盖 10+ 检查项**：embedding API key 可达性、Supabase 连接（如启用）、磁盘空间、scope policy 加载、最近一次 refresh 时间、failed job 数量、candidate backlog 大小、Console 静态资源完整性、tsc 类型一致性、迁移状态。
- `ltm connect openclaw` 未说明**如何处理已有 OpenClaw 配置**：覆盖、合并、提示？
- 缺一个 `ltm uninstall` / `ltm reset` 命令——用户体验关键，本地数据销毁是隐私要求。

**建议**：
1. doctor 输出按 `[ok|warn|fatal]` 分级，至少 10 项。
2. connect 命令默认**不覆盖**，使用 `--force` 显式覆盖。
3. 增加 `ltm reset --project <id>` 用于销毁 project workspace 数据。

### 3.10 Console 最小可用治理闭环（第 5.5 节）

**评审**：聚焦 Overview / Quick Lookup / Candidates 三页是合理收缩。Graph 保留 baseline 不阻塞验收，正确判断。

**遗漏**：
- 没有"审计日志"页面。candidate approve/reject 写 audit，但**用户在哪里看 audit**？
- Quick Lookup 的"score breakdown"是亮点，但**评分细节是否会暴露内部权重**？需要决定是否对用户可见。

**建议**：把 audit 看作 Overview 的子标签页（"最近治理操作"），不单独建页面，控制范围。

### 3.11 候选区闭环（第 5.6 节）

**强项**：6 步流程清晰，"pending candidate 默认不进入 Agent context"是关键安全约束。

**风险**：
- 当前代码 `lifecycle/type-extractor.ts` 是**启发式 extractor**，没说明**LLM-based extractor 何时引入**。如果 v0.x 全靠启发式，召回率会显著低于 mem0/Zep。
- 第 6 条"`memory_lookup` 可命中已入主库的 fallback 记忆"——**fallback 记忆**未在术语表中定义，且与第 5.2 节"无法映射到 5type 的合规记忆"是同一个概念吗？

**建议**：
1. 明确 v0.x 启发式优先，LLM extractor 在 Milestone D 之后评估。
2. 统一术语：`fallback memory` = `lookup-only memory`，并在产品定位文档术语表中固定。

### 3.12 评测和验收（第 5.7 节）

**强项**：三套黄金集分工明确（功能 / 跨产品 / 安全）。

**问题**：
- 数量（20-40 / 20-30 / 15-25）**总和约 75 条**，对统计置信度偏低；安全类应优先扩到 40+。
- 缺"baseline-v4 是什么"的定义。**baseline 必须是当前 v2.1 代码 freeze 版本**，否则比较没有意义。
- `compare` 命令的**判定门槛**未定义：差几个百分点算"通过"？

**建议**：
| 套件 | 建议数量 | 通过门槛 |
|------|----------|----------|
| memory-autodb-v0.1 | 30+ | recall@5 ≥ baseline + 5pt |
| memory-autodb-cross-product | 30+ | cross-app recall ≥ 80%，无 P1 case 退化 |
| memory-autodb-safety | 40+ | private/revoked 误注入 = 0（硬门槛） |

---

## 4. 跨文档一致性

| 编号 | 一致性问题 | 修复建议 |
|------|------------|----------|
| CONS-1 | 定位文档第 4 节"项目目录只保存轻量 `.memory-autodb.json` 指针"与规划文档第 5.2.1"在用户本地全局库创建 `~/.memory-autodb/projects/<project-id>/manifest.json`"职责划分一致，但**两处对 schema 的描述不同**。 | 把 schema 写在规划文档（实现层），定位文档只引用。 |
| CONS-2 | 定位文档第 6 节列出 OpenClaw adapter / MemoryService / Local server / Console 四层，但**规划文档的 Milestone B "本机接入体验"涉及 Local server 启动，定位文档却把 Local server 标为"演进形态"**。 | 统一表述：v0.x 的 Local server 等同于 daemon（已有 `server/daemon.ts`），不是新增 SaaS。 |
| CONS-3 | 定位文档第 7 节成功标准第 7 条"private、revoked、stale、conflict 记忆不会误注入"，与规划文档 §5.7 安全 suite 名称对齐良好；但**conflict 在规划文档中无任何处理流程定义**。 | 规划文档 §5.6 增加"conflict candidate 的处理：默认进入 candidate 区，需用户决议"。 |
| CONS-4 | 两份文档都使用"工作上下文"、"用户工作上下文"、"工作记忆"三种说法。 | 在产品定位文档新增术语表："Working Context = 用户工作上下文 = 工作记忆（统一名）"。 |
| CONS-5 | 规划文档 §7"API 和文档同步清单"列了 7 处文档同步，但**没有把本评审文档列入**。 | 评审通过后，把本文件添加到清单第 8 行。 |

---

## 5. 与代码基线对齐

通读规划文档第 2 节并交叉核对当前代码：

| 模块 | 文档声称 | 代码现状 | 风险 |
|------|----------|----------|------|
| `core/memory-service.ts` | 已有 `MemoryService` 合同 | 一致，包含 storeMemory/getMemory/searchMemories 等核心方法 | 低 |
| `core/scope.ts` | 已有多维 scope，需强化 | 已有 tenantId/appId/userId/projectId/agentId/namespace；**workspaceId 字段需新增** | 中：scope 字段新增意味着 schema 迁移，需要 migrate 命令支持 |
| `api/agent-fast-path.ts` | 有 context/observe/lookup/sessionCommit | 一致 | 低 |
| `core/slot-context-builder.ts` | 有 builder | 一致 | 低 |
| `lifecycle/candidate-*` | 已有 type/repository/review service | 一致 | 低 |
| `console/api.ts` | Overview / Lookup / Graph / Jobs baseline | 一致；Candidates API 缺失 | 中：本迭代新增 |
| `scanner/*` | 文件扫描器、markdown processor | 一致；但**与 Project Workspace 的 source root 模型未打通** | 高：需要 scanner 改造支持 sourceRoots 概念，工作量被低估 |
| `ingest/*` | document/chunk/job/audit baseline | 一致 | 低 |
| `tree/*`、`graph/*` | in-memory baseline | 一致 | 低（本迭代不持久化） |
| `ltm` CLI | serve/status/health/migrate + legacy | 一致 | 中：新增 12 个命令是大量工作 |

**核心结论**：
1. **Scope 增加 `workspaceId` 字段**需要数据迁移路径，规划文档未提及。
2. **Scanner 改造支持 source root**是 Milestone A 中被低估的工作量，建议单独估时。
3. **CLI 新增 12 个命令**与 Milestone B 的"10 分钟接入"承诺存在工作量冲突。

---

## 6. 术语与命名冲突

| 冲突 | 出现位置 | 建议 |
|------|----------|------|
| `workspaceId` vs `projectId` 的层级关系不明 | §5.1 表格 | 加一句"`workspaceId ⊇ projectId`，profile/rules 在 workspace，task_context 在 project" |
| `appId` 既指"接入产品"又指"Agent Runtime 实例" | §5.1 / §3.2 场景 1 | 统一为 "appId = 接入产品标识；agentId = 具体 Runtime 实例" |
| `kind` vs `semanticType` | §5.2 召回流程"map kind / semanticType" | 加一句"`kind` 是必填的存储字段；`semanticType?` 是运行视图字段" |
| `fallback memory` vs `lookup-only memory` | §5.2 / §5.6 | 统一为 `lookup-only memory` |
| `visibility` vs `scope` | §5.1 表格 | 明确 visibility 是 scope 的一个维度（不是替代） |

---

## 7. 风险与未识别问题

| 风险编号 | 风险 | 严重性 | 文档是否覆盖 | 处理建议 |
|----------|------|--------|--------------|----------|
| RISK-1 | 本地数据库损坏（LanceDB 文件断电、磁盘满） | 高 | 否 | 增加 `ltm doctor` 检查 + `ltm backup`/`ltm restore` 命令；evidence 写入采用 append-only |
| RISK-2 | 跨 `appId` 复用的隐私边界——产品 A 收集的偏好被产品 B 直接用，是否符合用户预期？ | 高 | 部分（仅提到"private 不放宽"） | 加 ADR 记录"复用是默认 opt-in 还是 opt-out"，并在 `ltm init` 时让用户选择 |
| RISK-3 | scope 推导错误（如 OpenClaw adapter 把不同用户错认为同一 userId） | 高 | 否 | 在 `MemoryService` 增加 scope 强制校验，错误时拒写并写 audit |
| RISK-4 | embedding API 不可用时 `context_fast` 是否降级？ | 中 | 否 | 明确降级策略：BM25 优先 + 缓存 SlotSnapshot 兜底 |
| RISK-5 | Project Workspace 中 source root 失效（外部参考目录被删除） | 中 | 部分（提到 deleted/stale） | refresh 时增加"orphan source root"告警 |
| RISK-6 | candidate 自动审核长期未处理导致 backlog 爆炸 | 中 | 部分（提到 30 天清理） | Console Overview 增加 backlog 阈值告警 |
| RISK-7 | OpenClaw adapter 接口稳定性（OpenClaw 主版本升级时） | 中 | 否 | adapter 层增加版本协议 + 兼容矩阵 |
| RISK-8 | `ltm watch` 在 macOS Spotlight 索引或 Linux inotify limit 下表现 | 中 | 否 | doctor 检查 inotify limit；超限提示用户 |
| RISK-9 | 评测黄金集本身的质量——`memory-autodb-v0.1` 由谁标注，标注一致性如何？ | 中 | 否 | 黄金集增加 `annotator/reviewedAt/version` 元数据 |
| RISK-10 | 5type 与现实记忆类型的不匹配（用户产生大量"既非 profile 也非 rule"的边缘记忆） | 低 | 部分（已有 lookup-only 兜底） | 加 telemetry：lookup-only 占比超过 30% 时告警 |

---

## 8. 验收门槛建议

把规划文档 §6 各 Milestone 验收项与 quick eval 联动，给出可度量门槛：

| Milestone | 当前验收 | 建议追加量化门槛 |
|-----------|----------|------------------|
| A | 10 条定性 | • `context_fast` P95 < 250ms（本地）<br>• cross-app profile 召回率 ≥ 80%<br>• scope 推导错误率 = 0（contract test） |
| B | 4 条定性 | • `ltm init -> context` 端到端 < 5 分钟（中等目录）<br>• doctor 误报率 < 10%（人工 review 30 个样本） |
| C | 4 条定性 | • candidate approve 后 ≤ 1 个 context_fast 周期内可用<br>• 批量 approve 100 条耗时 < 3 秒 |
| D | 4 条定性 | • cross-product suite recall@5 ≥ 75%<br>• safety suite 误注入率 = 0<br>• `memory_lookup` P95 < 500ms |

---

## 9. 文档结构与可追踪性

**强项**：
- 章节编号与目录规范一致。
- 表格 / 代码块 / 流程图（伪代码）使用克制，不堆砌。
- Milestone 拆分清晰，验收项与交付物对应。

**改进建议**：
1. 在文档最前面（§1 之前）增加"TL;DR"卡片：用 5 行总结目标、范围、Milestone、风险、不做什么。
2. §5.1 / §5.2 / §5.2.1 / §5.3 各小节末尾增加"实现点 checklist"，方便 tasks 拆分。
3. 文档末尾增加"评审记录"小节，留位记录本次评审及后续 ADR。

---

## 10. 优先级改进建议（Top 15，按影响 × 紧迫度排序）

| Pri | 编号 | 改进项 | 关联章节 |
|-----|------|--------|----------|
| **P0** | **M-0** | **补充"记忆提取管线"、"记忆树构建"、"去重与冲突"、"降级策略"、"过期策略"五个核心流程的完整文档** | §3.6、ARCH-0-1~5 |
| P0 | M-1 | 把 Milestone A 拆成 A1（scope policy + workspaceId 迁移）、A2（Project Workspace + source roots）、A3（快路径增强）三段串行，避免单 milestone 工程量爆炸 | §6 |
| P0 | M-2 | 提前落 quick eval 黄金集（30 条 v0.1 + 30 条 cross-product），作为 A1 验收门槛 | §5.7、§6 |
| P0 | M-3 | 统一基目录到 `~/.memory-autodb/`，并在 `ltm migrate` 中提供 v2.1 → v0.x 的数据迁移 | §5.2.1、PMW-1 |
| P0 | M-4 | 明确 `workspaceId ⊇ projectId` 层级关系并写入 scope policy 文档 | §5.1、§6 |
| P1 | M-5 | 给 §5.2 召回评分函数一个 v0.x 默认权重（ADR） | §5.2、ARCH-2 |
| P1 | M-6 | `AgentContextFastResult` schema 强约束：枚举化 warning code、必填 telemetry.tokenEstimate、限定 evidenceIds 上限 | §5.3、API-1/2/3 |
| P1 | M-7 | 在产品定位文档增加术语表 + 竞品差异化矩阵 + 量化成功指标 | §2、POS-3/4 |
| P1 | M-8 | 增加 RISK-1（备份）、RISK-2（复用边界 opt-in）、RISK-3（scope 校验）三项处理流程 | §7 |
| P1 | M-9 | 增加 Lifecycle 状态机图：active → stale → archived → expired，并定义每个状态的可见性边界 | §3.6、ARCH-0-4 |
| P1 | M-10 | 增加 TTL 策略表：不同 kind 的默认 TTL、计时起点、过期后处理 | §3.6、ARCH-0-5 |
| P2 | M-11 | `.memory-autodb.json` schema 显式定义并写入 §5.2.1 | §5.2.1、PMW-2 |
| P2 | M-12 | 给每个 Milestone 验收追加量化门槛（P95、召回率、误注入率） | §6 |
| P2 | M-13 | 明确启发式 extractor 规则集 + LLM extractor 引入时机 | §3.11 |
| P2 | M-14 | 增加 Console "去重冲突治理"页面设计草案（或合并到 Candidates 页） | §3.6、ARCH-0-3 |
| P2 | M-15 | 补充 tree 持久化策略：v0.x in-memory + export/import，v1.x 持久化 | §3.6、ARCH-1 |

---

## 11. 评审决议

| 项 | 状态 |
|----|------|
| 产品定位文档 | **批准**，需补充 POS-1~POS-5 修订（不阻塞下一迭代启动） |
| 下一迭代规划文档 | **暂缓批准**：必须先完成 **M-0（补全记忆提取/树构建/去重/降级/过期五个核心流程文档）**，然后完成 M-1（Milestone A 拆分）、M-2（黄金集前置)、M-3（基目录统一+迁移）、M-4（scope 层级）后再启动 Milestone A1 |
| 后续动作 | 1. **立即启动 M-0**：补充"记忆提取管线"、"记忆树构建"、"去重与冲突"、"降级策略"、"过期策略"五个核心流程的完整设计文档<br>2. 创建 ADR：scope 复用 opt-in / opt-out 策略<br>3. 创建 ADR：5type 召回评分权重<br>4. 在 §7 文档同步清单增加本评审文档<br>5. 黄金集前置任务交由 eval/ 模块负责人启动 |

---

## 12. 评审记录

| 日期 | 评审人 | 维度 | 结论 |
|------|--------|------|------|
| 2026-06-10 | Claude (orchestrate review) | 定位 / 范围 / 代码对齐 / 架构 / 验收 / 风险 / 一致性 / 文档结构 | 有条件批准；产出本文档 |

---

## 13. 关联文档

- 产品定位真源：[product-positioning.md](../../03-architecture/product-positioning.md)
- 下一迭代规划：[next-iteration-product-plan.md](next-iteration-product-plan.md)
- 评测方案：[memory-evaluation-plan.md](../../07-test/memory-evaluation-plan.md)
- 竞品研究：[open-source-memory-competitor-research.md](../../03-architecture/open-source-memory-competitor-research.md)
- 中间件架构：[memory-middleware-architecture.md](../../03-architecture/memory-middleware-architecture.md)
- 深度优化架构：[memory-autodb-deep-optimization-architecture.md](../../03-architecture/memory-autodb-deep-optimization-architecture.md)
