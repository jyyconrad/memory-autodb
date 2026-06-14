# 可落地性与计划可行性全面评审（v2）

> 日期：2026-06-10
> 状态：评审稿 v2（基于用户新增行为理论和可评测目标后的版本）
> 评审对象：
> - [docs/03-architecture/product-positioning.md](../../03-architecture/product-positioning.md)（最新版，+226 行，含行为理论 §2.2 和 Owner/Working Context Scope §4.1）
> - [docs/04-design/04.2-detail/next-iteration-product-plan.md](next-iteration-product-plan.md)（最新版，+652 行，含越用越懂量化指标和必要支撑项 §4.1.1）
> 评审基线：当前代码 v3.0（2026-06-10 核对）
> 评审维度：可落地性 / 计划可行性 / 能否实现产品目标 / 工程量盲点 / 风险与缺口

---

## 0. TL;DR

**核心判断**：方向正确、理论清晰，但**计划不可行**——6 周完成 A0+A1+A2 三个里程碑的承诺严重低估工程量。

**三个重大缺口**：
1. **数据层 scope 隔离缺口**：LanceDB 查询不过滤 scope 字段（当前全量向量搜索），Owner/Working Context Scope 分离方案需要改仓储查询接口 + 数据模型 + cache 策略，工程量**大**。
2. **可评测指标无数据基础**：成功标准 #6"重复解释减少率 ≥ 30% + 采纳率 ≥ 70%"无任何采集 pipeline，无对应 Milestone 交付项，6 周内**无法证伪**。
3. **跨产品 demo 零起步**：`ms project`、`.mengshu.json` 解析器、第二 appId adapter 全不存在，Milestone A2 承诺的"两个 appId 复用 demo"需从零实现 6 个新模块。

**推荐**：里程碑重排为 **A0（文档+黄金集）→ A1-lite（单 appId Working Context，去掉跨 appId）→ B（接入体验）→ A2-deferred（跨 appId 作为独立迭代）**，把 6 周承诺缩小到单 appId 可验证闭环，跨产品能力延后。

---

## 1. 新增内容概览

用户在两份文档中新增 750+ 行，关键改动：

### 1.1 positioning.md 新增

| 章节 | 核心内容 | 行数 |
|------|---------|------|
| §2.1 开源专项边界 | 明确两个主轴（Working Context 语义层 + Project Memory Workspace）+ 6 项不做 | ~18 |
| §2.2 行为理论支撑 | 7 个理论（可管理性/选择支持/自我决定/工具记忆/可用性/减少重复/提醒提示）→ 5 slot | ~49 |
| §4.1 Owner/Working Context Scope 分离 | 写入归属 vs 语义复用分开；解决跨 appId 召回 | ~64 |
| §7 成功标准 #6 | 越用越懂量化为"重复解释减少率 ≥ 30% + 采纳率 ≥ 70%" | +1 |

### 1.2 next-iteration-product-plan.md 新增

| 章节 | 核心内容 | 行数 |
|------|---------|------|
| §4.1.1 必要支撑项 | 明确 demo/connect/Console/黄金集只服务两个主轴，不独立扩张 | ~10 |
| §4.2 暂不做 | 新增"上下文路由 DSL/OpenMemory 互操作/企业后端"三项 | ~8 |
| §5.1.1 Owner/Working Context Scope | 写入流程 + 读取流程 + 代码落点（WorkingContextResolver/ScopePolicy 模块）| ~42 |
| §5.1.2 Project Workspace 作为跨产品入口 | Workspace = 多 project + 持续记忆层 + manifest 解析 | ~30 |
| §5.1.3 行为理论支撑（实现层）| 7 理论 → 实现约束 + 评测 case | ~50 |

---

## 2. 可落地性评审：Owner/Working Context Scope 分离方案

### 2.1 方案核心

文档提出把 scope 拆成两层：
- **Owner Scope** = `tenantId/appId/agentId/sessionId/namespace`（写入归属、provenance）
- **Working Context Scope** = `tenantId/userId/workspaceId/projectId/visibility`（跨 appId 复用召回）

承诺：保留 `scopeToKey()`，新增 `workingContextKey()` 或 `deriveWorkingContextScope()`，repository/service 查询支持 working context filter。

### 2.2 代码核对结论

**状态：部分可实现，但工程量被严重低估（大改动）。**

| 核对项 | 文档假设 | 代码现状 | 差距 |
|--------|---------|---------|------|
| `scopeToKey()` 语义 | 精确匹配 key | 是，且在 graph/tree 中用 `===` 硬编码 | 无差距 |
| 仓储查询 scope filter | 支持 partial filter | **LanceDB 不过滤 scope 字段**，全量向量搜索 | **重大缺口** |
| `loadRecordsForScope` 接口 | 单 scope 加载 | 是，无 partial/聚合支持 | 需改公共接口 |
| Working Context Scope 新模块 | "新增" | `WorkingContextResolver`/`ScopePolicy` **完全不存在** | 需从零实现 |
| `.mengshu.json` 解析 | "新建" | 无文件格式、无解析器、无 lookup 链路 | 需从零实现 |
| `adapters/openclaw/scope.ts` | 推导 workspaceId | 硬编码 `appId: "openclaw"`，不读 manifest | 需改造 |
| SlotSnapshot cache key | "小改动" | 以完整 scope 为 key，跨 appId 聚合后语义变 | 需改 cache 策略 |

**关键发现（重大缺口）**：

> `db/providers/lancedb.ts` L231-339：`queryFromTable()` 接受 `MemoryRepositoryQuery`，但**不读取 `scope` 字段做任何过滤**——只处理 `filter`/`dataTypes`/`vector`。当前查询实际上是**全量向量搜索，没有 scope 隔离**。scope 隔离依赖写入时 metadata 是否带 scope，而查询时不过滤 `metadata.appId` 等字段（除非调用方显式放入 `filter: { appId: 'xxx' }`）。

这意味着当前系统所有记忆在同一 LanceDB table 里全量搜索，只有向量相似度，没有 scope 硬隔离。这是 A1 跨 appId 复用逻辑的根基，却是现状最大的基础设施缺口。

### 2.3 工程量评估

要实现文档承诺的"保留 scopeToKey + 新增 workingContextKey 跨 appId 召回"：

| 改动项 | 量级 | 原因 |
|--------|------|------|
| 新建 `WorkingContextResolver` 模块 | 大 | 从零实现，包含 manifest 解析 + workspaceId/projectId 推导 |
| 新建 `ScopePolicy` 模块 | 大 | 复用规则引擎 + Filter 模式 + opt-in 逻辑 |
| LanceDB 查询增加 scope filter | 大 | 改 `queryFromTable()` 签名 + 数据模型（metadata 序列化 workspaceId/projectId）+ 索引 |
| `AgentFastPathDeps.loadRecordsForScope` 改造 | 大 | 拆分或重载接口，支持跨 appId 聚合 |
| `.mengshu.json` 文件格式 + 解析器 | 中 | 新增 schema + 解析逻辑 + lookup 链路 |
| `adapters/openclaw/scope.ts` 改造 | 中 | 新增 manifest 读取 + workspaceId 推导 |
| SlotSnapshot cache key 策略改动 | 中 | 跨 appId 聚合后 cache key 语义变，需重新设计 |

**总计：5 大 + 2 中 = 重度改造，绝非"小改动"。**

文档 Milestone A1 交付承诺（§6）："scope policy + Agent context 输出增强（scope 字段已存在，重点是策略层）"——这段描述**严重低估工程量**，把数据层查询改造掩盖在"策略层"一词下。


---

## 3. 可落地性评审："越用越懂用户"量化指标

### 3.1 新增成功标准

positioning.md §7 成功标准 #6 从定性改为量化：

> Agent 越用越懂用户、越理解用户工作、运行越流畅 → **重复解释减少率 ≥ 30%；偏好/规则命中后采纳率 ≥ 70%；cross-product suite 不退化**

plan.md §5.1.3 列出评测 case：
- preference reuse hit rate
- 用户重复说明减少率
- task_context freshness
- resource lookup success
- 人格标签不自动生成（safety）
- 敏感属性不写入

### 3.2 代码核对结论

**状态：不可实现（6 周内无数据基础）。**

| 指标 | 需要采集的数据 | 代码现状 | 缺口 |
|------|----------------|---------|------|
| 重复解释减少率 | 跨会话追踪同一偏好被多次说明 | 无 | 需新建：重复检测模块 + cross-session linkage |
| 采纳率 | agent 是否在后续行为中遵守注入的 rule/preference | 无 | 需新建：采纳信号采集 + feedback loop |
| preference reuse hit rate | 跨 appId 召回命中率 | 无 | 需 cross-appId telemetry（依赖 A1 跨 appId 完成） |
| task freshness | task_context 过期判定 | `lifecycle/retention.ts` TTL 仅保留 30 天淘汰，无"时效性"度量 | 需增强 |
| 人格标签不生成 | extractor 黑名单 | `HeuristicTypeExtractor` **无黑名单** | 需补充 |

**关键发现（无数据基础）**：

> `core/semantic-types.ts` L22-45：`ContextFastResponse.telemetry` 只记录 `latencyMs/tokenEstimate/cacheHit/scopeKey/nodesUsed`，**不记录**"哪些 slot block 被注入"、"哪些记忆被采纳"、"用户是否重复说明同一偏好"。当前 telemetry 是**性能监控**而非**行为监控**。

> `api/agent-fast-path.ts` L235-301：`context()` 返回 `ContextFastResponse` 后无 feedback loop，agent 是否采纳规则无法追踪。`sessionCommit()` L356-430 只写入新观察，不采集"采纳信号"。

**结论**：要让这两个指标可测，需要：
1. 新建 `FeedbackCollector` 模块（采集 agent 采纳信号，可能需要 agent 显式上报或 LLM judge）
2. 新建 `RepetitionDetector` 模块（跨会话检测同一偏好被重复说明）
3. `ContextFastResponse.telemetry` 增加 `injectedSlotBlocks: Array<{slotType, memoryId, content}>`
4. 评测 golden 每条附 `expected_adoption: boolean` + `is_repetition: boolean` 标注

### 3.3 工程量与风险

| 改动项 | 量级 | 风险 |
|--------|------|------|
| FeedbackCollector 模块 | 大 | 需要 agent 协议变更（上报采纳信号）或 LLM judge（成本高） |
| RepetitionDetector 模块 | 大 | 跨会话语义相似度 + embedding 匹配，冷启动窗口至少 5 个 session |
| telemetry 增强 | 中 | 增加字段，但不影响核心逻辑 |
| 黄金集标注"采纳"和"重复" | 大 | 每条需专家标注，标注一致性难保证 |

**致命问题**：**文档 §6 里程碑没有一个 Milestone 包含"建立采纳信号采集"或"重复检测"**。这两个指标在 Milestone D quick eval 时无法证伪，因为数据采集 pipeline 根本不存在。

**推荐**：把成功标准 #6 降级为"定性观察"，或者拆出独立 Milestone E（行为监控 pipeline），6 周内不承诺量化。

---

## 4. 可落地性评审：跨产品 demo 可行性

### 4.1 Milestone A1/A2 验收承诺

plan.md §6 Milestone A1 验收第 5 条 + A2 验收第 8 条：

> 两个 `appId` 在同一 `userId/workspaceId` 下复用 profile/rules。

> 跨 appId demo：OpenClaw + 1 个其他 appId（Claw Research 或 Claw Project）。

### 4.2 代码核对结论

**状态：零起步，工程量大。**

| 所需组件 | 代码现状 | 缺口 |
|----------|---------|------|
| `ms project` 命令族 | CLI 无 `project` 子命令 | 需新增：init/index/status/refresh/context/lookup 6 个子命令 |
| `.mengshu.json` 解析器 | 无 | 需新建：schema + 解析 + lookup 链路 |
| Project manifest 全局库 | `~/.openclaw/memory/projects/<project-id>/manifest.json` 不存在 | 需新建：路径约定 + manifest 写入/读取 |
| 第二个 appId adapter | 只有 `adapters/openclaw/` | 需新建：`adapters/claw-research/` 或简化为 config 文件 |
| WorkspaceId 推导逻辑 | `adapters/openclaw/scope.ts` 硬编码 `appId: "openclaw"` | 需改造：从 manifest 读取或从 CLI 参数传入 |
| 跨 appId 召回（依赖 §2）| 依赖 Working Context Scope 分离完成 | 依赖链：A2 依赖 A1，A1 是重度改造 |

**工程量详细**：

```
ms project init (新建)
  -> 创建 .mengshu.json + 生成 projectId + 推导 workspaceId
  -> 写入全局 manifest ~/.openclaw/memory/projects/<project-id>/manifest.json
  -> 注册 source roots

ms project context --app-id claw-research (新建)
  -> 读取 .mengshu.json
  -> 查找 manifest
  -> 推导 workspaceId/projectId
  -> 调用 AgentFastPathService.context({ appId: 'claw-research', workspaceId, projectId })
  -> 此时触发跨 appId 召回（需 A1 完成）
```

每一步都是新代码，依赖链长，A2 验收"两个 appId 复用 demo"实际上要求 A0+A1+A2 全部就绪。

**推荐**：A2 验收改为"单 appId 的 project context 可用"，跨 appId demo 延后到独立迭代。

---

## 5. 行为理论可落地性

### 5.1 理论 → 实现映射

positioning §2.2 提出 7 个理论支撑 5 slot，plan §5.1.3 给出实现约束。评审每个理论的可测性：

| 理论 | 对应 slot | 实现约束 | 可测性 | 评审 |
|------|----------|---------|--------|------|
| 任务可管理性 | task_context | 相关项目进展 + 当前目标 + 历史决策 | **可测**（freshness / 过期不注入） | OK，已有 TTL |
| 选择支持理论 | rules | 偏好/约束/禁止项 | **可测**（safety suite：不误注入 revoked） | OK，已有 lifecycle |
| 自我决定理论 | profile | 工作方式 + 专业背景 + 长期目标 | **部分可测**（hit rate），难测"是否准确" | 需人工 review |
| 工具记忆 | experience | 成功经验 + 技能沉淀 | **难测**（需验证 agent 是否采纳） | 依赖 FeedbackCollector（缺） |
| 降低认知负荷 | resource | 可用资源 + 速查 | **可测**（lookup success） | OK，已有 lookup API |
| 减少重复 | 全部 | 用户不重复说明偏好 | **难测**（需跨会话重复检测） | 依赖 RepetitionDetector（缺） |
| 提醒与提示 | 全部 | 正确时机注入 | **部分可测**（stale 不注入） | OK，已有 Filter 模式 |

**结论**：7 个理论中，3 个完全可测（任务可管理、选择支持、降低认知负荷），2 个部分可测（自我决定、提醒提示），2 个难测（工具记忆、减少重复）——后两者依赖缺失的 FeedbackCollector 和 RepetitionDetector。

### 5.2 评测 case 机械化程度

plan §5.1.3 列出新增 case，评审哪些可纯机械化：

| Case | 判定方式 | 机械化程度 | 盲点 |
|------|---------|-----------|------|
| preference reuse hit rate | 跨 appId telemetry | **可机械化** | 需 A1 完成 |
| 重复说明减少率 | 跨会话语义相似度 | **需 LLM judge** | 成本高 + 标注难 |
| task_context freshness | 过期任务不注入 | **可机械化** | 已有 TTL |
| resource lookup success | lookup 命中 | **可机械化** | 已有 API |
| 人格标签不生成 | extractor 输出不含黑名单词 | **可机械化** | `HeuristicTypeExtractor` **无黑名单**（需补） |
| 敏感属性不写入 | 不推断健康/政治/宗教 | **可机械化** | 需 extractor 规则显式排除 |
| 采纳率 ≥ 70% | agent 后续行为遵守 rule | **需 LLM judge** | 无采集 pipeline |

**结论**：7 个新 case 中，4 个可机械化（但其中 1 个需补黑名单），3 个需 LLM judge 或人工标注。Milestone D quick eval 如果只做机械化 case，新增理论的 50% 无法验证。

---

## 6. 计划可行性：6 周里程碑工程量核算

### 6.1 当前计划

plan §6 承诺 6 周完成 A0+A1+A2 三个里程碑。

| Milestone | 交付 | 验收 | 预计周 |
|-----------|------|------|--------|
| A0 | 五流程文档 + 黄金集（30+30+40） + ADR | 文档完整 + 黄金集可跑 | 1 周 |
| A1 | scope policy + filtered 字段 + warning 枚举 + 跨 appId demo | 两 appId 复用 + P95 < 250ms + 召回 ≥ 80% | 2-3 周 |
| A2 | Project Workspace + 多 source root + scanner 改造 | ms init 可用 + 文件移动记忆不重建 | 2-3 周 |

合计：1 + 3 + 3 = 7 周（已超 6 周承诺），且假设无阻塞、无返工。

### 6.2 工程量重估（基于代码核对）

| Milestone | 低估项 | 实际工程量 | 重估周数 |
|-----------|---------|-----------|---------|
| A0 | 黄金集标注（100 条，每条含 adoption/repetition） | 黄金集 3-5 天/人（需专家） | 1-1.5 周 |
| A1 | WorkingContextResolver + ScopePolicy + LanceDB scope filter + loadRecordsForScope 接口改造 + cache 策略 | **5 大改动**（见 §2.3） | **4-5 周**（重度改造） |
| A2 | ms project 命令族 + .mengshu.json 解析 + manifest 全局库 + 第二 appId adapter + scanner 改造 | **6 个新模块**（见 §4.2） | **3-4 周** |

合计：1.5 + 5 + 4 = **10.5 周**（最乐观），实际可能 12-14 周（含测试 + 返工）。

**结论**：6 周承诺**不可行**，实际需要 10-14 周，是当前承诺的 **1.7-2.3 倍**。

### 6.3 依赖链风险

```
A0（文档） -> A1-WorkingContextResolver（大）
                   -> A1-ScopePolicy（大）
                       -> A1-LanceDB filter（大）
                           -> A1-loadRecordsForScope 改造（大，公共接口）
                               -> A1-跨 appId demo（依赖前 4 项全完成）
                                   -> A2-ms project（6 个新模块）
                                       -> A2-第二 appId adapter
                                           -> A2-跨 appId 验收
```

**关键路径长达 9 步**，任何一步阻塞或返工都会导致整体延期。A1 的 4 个大改动是串行依赖（LanceDB filter 必须先于 ScopePolicy 才能测），无法并行。

**推荐**：拆分里程碑，缩小范围。


---

## 7. 能否实现产品目标：三个核心提升点

positioning §5.1 定义三个可证明的效果提升点（相对竞品）：

### 7.1 跨 appId 上下文连续性（目标：召回率 ≥ 80%）

**依赖**：Working Context Scope 分离（A1）+ 跨 appId demo（A2）。

**评审**：
- 技术可行：是（基于代码核对，改造量大但方向正确）
- 6 周可交付：**否**（A1+A2 实际需 8-9 周）
- 80% 召回门槛现实性：**待验证**（依赖黄金集质量，cross-product suite 30 条能否代表真实场景）

**风险**：cross-product suite 如果只测"产品 A 写偏好，产品 B 读到"这种简单 case，80% 容易达到；但如果测"产品 A 的 project task 不泄漏到产品 B 的另一 project"这种复杂隔离，当前 scope filter 设计可能不足。

### 7.2 结构化 5 slot（目标：P95 < 250ms）

**依赖**：已有 SlotContextBuilder + SlotSnapshot 缓存。

**评审**：
- 技术可行：是（核心代码已存在）
- 6 周可交付：是（A1 只需补 filtered 字段 + warning 枚举）
- P95 < 250ms 现实性：**可能**（本地 LanceDB + 缓存命中应能满足，但跨 appId 聚合后查询复杂度上升，需实测）

**风险**：跨 appId 召回如果需要聚合多个 scope 的 SlotSnapshot，cache key 语义变化，可能导致 cache miss 率上升，P95 劣化。

### 7.3 注入安全 + 可解释治理（目标：误注入率 = 0）

**依赖**：Filter 模式（A1）+ Console explain（C）。

**评审**：
- 技术可行：是（lifecycle 状态机 + visibility 已有）
- 6 周可交付：**部分**（Filter 模式可在 A1 完成，Console explain 在 C，但 C 不在 6 周范围）
- 误注入率 = 0 现实性：**高**（硬约束，safety suite 可机械化验证）

**结论**：三个提升点中，只有 7.3 在 6 周内可交付且可验证；7.1 需 10+ 周；7.2 可交付但性能目标有风险。

---

## 8. 文档内部一致性与冲突

### 8.1 §4.2 暂不做 vs §5.1 Owner/Working Context Scope

**冲突**：§4.2 列"OpenMemory / Letta Agent File 完整互操作"为暂不做，但 §5.1.1 Owner/Working Context Scope 分离方案的核心价值主张是"与 OpenMemory MCP 互操作而非替代"（positioning §6.1）。如果不做互操作，分离 scope 的外部可见价值何在？

**修正建议**：要么把"互操作"从暂不做中移除（至少做 export），要么修改价值主张为"为未来互操作做架构准备"。

### 8.2 §4.1.1 必要支撑项 vs §6 里程碑交付

**冲突**：§4.1.1 说"最小 Console 只做 Quick Lookup + context preview + candidate 列表"，但 §6 Milestone C 交付"Overview + Candidates 页面 + audit 子标签"——Overview 是否属于"必要"？audit 是否超出"最小"？

**修正建议**：明确 Overview 只显示 scope/记录数/slot freshness/candidate backlog，不做复杂图谱可视化；audit 只保留"最近治理操作"子标签，不独立建页。

### 8.3 成功标准 #6 vs 里程碑验收

**冲突**：positioning §7 成功标准 #6"重复解释减少率 ≥ 30% + 采纳率 ≥ 70%"是量化硬指标，但 plan §6 所有里程碑验收都不包含"建立采纳信号采集"或"重复检测 pipeline"。

**修正建议**：要么把成功标准 #6 降级为"定性观察"，要么增加 Milestone E（行为监控 pipeline，6 周后）。

---

## 9. 推荐修正方案

基于 §2-§8 的评审，给出可落地的修正建议。

### 9.1 里程碑重排（现实版）

| 原计划 | 问题 | 修正后 | 预计周数 |
|--------|------|--------|---------|
| A0+A1+A2（6 周） | 工程量 10-14 周 | **A0+A1-lite+B**（6 周） | 6 周 |
| A1（跨 appId） | 5 大改动，4-5 周 | **A1-lite**（单 appId Working Context，去掉跨 appId） | 2-3 周 |
| A2（Project Workspace） | 6 个新模块，3-4 周 | **延后到 v0.2**（跨产品能力作为独立迭代） | - |

**A1-lite 范围**（6 周可交付）：
- scope policy（只做单 appId 的 workspace/project 复用规则）
- filtered 字段 + warning 枚举
- `context_fast` 输出对齐（三处 schema diff = 0）
- 黄金集 v0.1（30 条，去掉 cross-product）+ safety（40 条）
- 单 appId 的 context/lookup demo（OpenClaw 内部验证）

**延后到 v0.2**（8-10 周独立迭代）：
- Working Context Scope 分离（WorkingContextResolver + ScopePolicy + LanceDB filter）
- 跨 appId demo（第二 appId adapter + 跨产品黄金集 30 条）
- Project Memory Workspace 完整版（ms project 命令族 + manifest 全局库）

### 9.2 成功标准修正

| 原标准 | 问题 | 修正 |
|--------|------|------|
| #6 重复解释减少率 ≥ 30% | 无数据采集 pipeline | 改为"**定性观察**：用户在跨会话中不需要重复说明主要偏好" |
| #6 采纳率 ≥ 70% | 无 feedback loop | 改为"**定性观察**：注入的 rules 在 agent 行为中可见效果" |
| #1 cross-app 召回 ≥ 80% | 依赖跨 appId 完成 | v0.1 改为"**单 appId 召回 ≥ 80%**"；跨 appId 延后到 v0.2 |

### 9.3 §4.2 暂不做清单补充

新增两项（明确边界）：

| 暂不做 | 原因 |
|--------|------|
| 跨 appId 上下文复用（v0.1） | Working Context Scope 分离工程量大（10 周），延后到 v0.2 独立迭代 |
| 行为监控 pipeline（FeedbackCollector / RepetitionDetector） | 成功标准 #6 量化指标降级为定性观察，行为监控延后到 v0.3 研究分支 |

### 9.4 新版 P0 对比

| 原 P0 | 修正后（v0.1 范围） |
|-------|---------------------|
| P0-1 Working Context 语义层 + 跨 appId 复用 | **保留前半**：单 appId 的 workspace/project scope；**延后后半**：跨 appId 复用到 v0.2 |
| P0-2 Project Memory Workspace | **简化**：ms init 只创建 scope，不强制目录索引；完整版延后到 v0.2 |
| P0-3~P0-7（doctor/Console/黄金集） | **保留**但范围缩小：去掉跨 appId 相关验收项 |

**新版 6 周交付承诺**（可落地）：
1. 单 appId 的 Working Context（scope policy + 5 slot + filtered/warning）
2. 黄金集 v0.1（30 条）+ safety（40 条）
3. `context_fast` 输出对齐（OpenClaw + REST + SDK）
4. Console 最小可用（Quick Lookup + candidate 列表）
5. ms demo/connect/status（单 appId 验证）

---

## 10. 风险与未解决问题

### 10.1 高风险项（即使按修正方案）

| 风险 | 严重性 | 缓解 |
|------|--------|------|
| LanceDB scope filter 改造失败 | 高 | 即使 v0.1 不做跨 appId，单 appId 的 workspace/project 复用也依赖 scope filter；如果 LanceDB 查询接口无法高效过滤 metadata，整个方案失效 | 在 A0 做 spike：验证 LanceDB metadata filter 性能 |
| 黄金集标注质量 | 中 | 100 条（30+40+30）全靠专家标注，标注一致性难保证；如果 safety suite 误判，误注入率 = 0 门槛失效 | 黄金集每条附 annotator/reviewedAt/version，至少 2 人 review |
| P95 < 250ms 在跨 workspace 查询下劣化 | 中 | 单 appId 也有多 workspace，聚合查询可能超时 | A1 验收前做性能 baseline：单 workspace 100 记忆 P95 < 150ms，多 workspace 聚合 P95 < 300ms |
| SlotSnapshot cache key 语义变化 | 中 | 当前 cache key 是完整 scope，workspace 复用后语义变；cache miss 率上升 | 改为 `workspaceId:projectId:slotType` 作为 cache key |

### 10.2 未解决的架构问题

| 问题 | 现状 | 影响 |
|------|------|------|
| Owner Scope provenance 如何持久化 | 文档说"保留 appId/agentId/sessionId"，但 MemoryRecord schema 未扩展 | audit/冲突解释/evidence drill-down 无法追溯到写入方 |
| workspaceId 如何推导（无 manifest 时） | 文档说"从 manifest 读取或 CLI 参数"，但冷启动场景未定义 | 用户首次 `ms init` 前的记忆归属哪个 workspace？ |
| 跨 workspace 的 profile/rules 冲突 | 文档说"conflict candidate 进治理"，但冲突判定逻辑未定义 | 两个 workspace 的 profile 矛盾时如何决议？ |
| HeuristicTypeExtractor 人格标签黑名单 | 当前无，safety case "人格标签不生成"靠"碰巧不匹配" | 无法保证不误写入敏感属性 |

---

## 11. 评审决议

| 项 | 状态 |
|----|------|
| 产品方向（两个主轴 + 行为理论） | **批准**：方向正确、理论清晰 |
| 6 周完成 A0+A1+A2 的计划 | **拒绝**：工程量被低估 1.7-2.3 倍，不可行 |
| 推荐修正方案（A0+A1-lite+B，去掉跨 appId） | **推荐采纳**：6 周可交付，单 appId 可验证闭环 |
| 成功标准 #6 量化指标（重复解释/采纳率） | **建议降级**：改为定性观察，或延后到 v0.3 行为监控 pipeline |
| Owner/Working Context Scope 分离 | **建议延后到 v0.2**：工程量大（5 大改动），作为独立迭代 |

### 后续动作

1. **立即**：决定是否采纳修正方案（A1-lite 去掉跨 appId）
2. 如采纳：修订 plan.md §6 里程碑，把 A1 拆成 A1-lite（单 appId）+ A2-deferred（跨 appId，v0.2）
3. 如采纳：修订 positioning.md §7 成功标准 #1（单 appId 召回）和 #6（降级为定性）
4. **在 A0 启动前**：做 LanceDB metadata filter 性能 spike，验证 scope filter 方案可行性
5. **A0 期间**：补充 HeuristicTypeExtractor 人格标签黑名单，保证 safety case 可测

---

## 12. 评审记录

| 日期 | 评审人 | 维度 | 结论 |
|------|--------|------|------|
| 2026-06-10 | Claude (orchestrate custom) | 可落地性 / 计划可行性 / 产品目标 / 工程量 / 风险 | 方向正确但计划不可行；推荐缩小 v0.1 范围到单 appId，跨产品能力延后 v0.2 |

---

## 13. 关联文档

- 产品定位（最新版）：[product-positioning.md](../../03-architecture/product-positioning.md)
- 下一迭代规划（最新版）：[next-iteration-product-plan.md](next-iteration-product-plan.md)
- 上一版评审：[next-iteration-product-plan-review.md](next-iteration-product-plan-review.md)
- 方向决策对比：[product-direction-options.md](../../03-architecture/product-direction-options.md)
- 竞品研究：[open-source-memory-competitor-research.md](../../03-architecture/open-source-memory-competitor-research.md)
- 代码核对 agent 报告：见本文档 §1-§4 引用


