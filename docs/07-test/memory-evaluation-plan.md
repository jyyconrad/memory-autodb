# memory-autodb 记忆架构评测方案

> 日期：2026-06-09  
> 状态：设计方案  
> 适用范围：验证 `memory-autodb` 从 OpenClaw 记忆插件升级为多产品 Agent Runtime 记忆中间件后，是否在跨产品工作记忆连续性、Agent 上下文、安全治理、实时性和成本性能上真实提升。  
> 关联文档：
> - [product-positioning.md](../03-architecture/product-positioning.md)
> - [memory-autodb-deep-optimization-architecture.md](../03-architecture/memory-autodb-deep-optimization-architecture.md)
> - [architecture-review-v2.md](../03-architecture/architecture-review-v2.md)
> - [plugin-test.md](./plugin-test.md)

---

## 1. 一句话结论

新架构是否有效，不能用“功能更多、schema 更完整、页面更丰富”证明。必须建立一套可自动执行的 `memory-eval` 评测系统，用同一批输入数据分别运行：

1. `baseline-v4`：当前向量检索、RRF、Context Packer 和基础 memory API。
2. `vnext-v0.1`：Agent 快路径、`kind + semanticType?`、SlotSnapshot、lookup fallback。
3. `vnext-v0.2+`：候选区、自动淘汰、治理审计、Console 解释能力。

只有当 vNext 在固定评测集和开源通用评测集上同时表现更好，且没有引入明显延迟、成本和安全退化，才可以说架构能力有提升。

---

## 2. 评测目标

评测目标分成五类：

| 目标 | 要证明什么 | 反例 |
|------|------------|------|
| Agent Runtime 上下文更准 | `memory_context_fast` 能把任务前必须知道的信息放进 prompt | 召回一堆相似但无用片段 |
| 速查更可靠 | `memory_lookup` 能快速命中正确事实、证据和来源 | 只命中相关会话，答不出具体事实 |
| 5 槽位有价值 | profile/task/rules/experience/resource 能稳定回答 Q1-Q5 | 强行分类导致事实丢失 |
| 跨产品连续性 | 用户切换不同 OpenClaw 类产品后，偏好、规则和工作背景仍可用 | 每个产品都从空记忆开始 |
| 治理更安全 | private/revoked/stale/conflict 不误注入 | 过期规则覆盖当前规则 |
| 成本性能可控 | 延迟、token、LLM/embedding 调用次数符合预算 | 质量提升靠无限上下文和无限 LLM 调用 |

核心原则：**外部 benchmark 证明通用能力，内置黄金集证明 memory-autodb 自己的产品语义和中间件契约。**

---

## 3. 评测体系总览

```text
open-source benchmarks
  -> dataset adapter
  -> canonical eval case
  -> run baseline-v4
  -> run vnext
  -> score with open metrics
  -> compare report

local product data
  -> AI generate draft cases
  -> evidence validation
  -> golden freeze
  -> regression eval
  -> release gate
```

### 3.1 分层评测

| 层 | 数据来源 | 目的 | 是否必须 |
|----|----------|------|----------|
| L1 通用检索 | BEIR 子集 | 验证基础 retrieval 不退化 | 必须 |
| L2 RAG 问答 | RAGAS/DeepEval 格式数据 | 验证 context precision、faithfulness、answer quality | 必须 |
| L3 长期记忆 | LoCoMo、LongMemEval | 验证跨会话、时间、更新和 abstention | 必须 |
| L4 本仓黄金集 | `eval/goldens/*.jsonl` | 验证 5 type、SlotSnapshot、candidate、MCP/API 契约 | 必须 |
| L5 产品场景 | 多个 OpenClaw 类产品接入样例 | 验证跨产品 Agent Runtime 记忆连续性 | v0.2+ |

---

## 4. 通用开源评测集与工具

这些数据集和工具用于建立行业可比性。它们不是 memory-autodb 的全部成功标准，但必须进入自动化评测矩阵。

### 4.1 推荐开源数据集

| 数据集 | 用途 | 接入方式 | 说明 |
|--------|------|----------|------|
| [BEIR](https://github.com/beir-cellar/beir) | 通用检索能力 | 选 `scifact`、`nfcorpus`、`fiqa` 等小型子集 | 用 nDCG@10、Recall@K、MRR 验证 retrieval baseline |
| [LoCoMo](https://github.com/snap-research/locomo) | 长期对话记忆 | 导入 `data/locomo10.json` | 覆盖长对话、多 session、QA 和事件摘要 |
| [LongMemEval](https://github.com/xiaowu0162/LongMemEval) | 长期交互记忆 | 导入官方 500 问题集 | 覆盖信息抽取、多会话推理、时间推理、知识更新、abstention |
| [LongMemEval-V2](https://huggingface.co/datasets/xiaowu0162/longmemeval-v2) | Agent/企业任务记忆 | v0.3+ 选 small tier | 数据较大，适合验证企业 agent 轨迹记忆，不进入 v0.1 必跑 |
| [MemoryCraft](https://huggingface.co/datasets/daven3/MemoryCraft) | 统一 memory benchmark schema | 可作为后续 adapter 参考 | 汇总多个 memory benchmark，适合减少格式适配成本 |

### 4.2 推荐开源评测工具

| 工具 | 用途 | 在 memory-autodb 中的角色 |
|------|------|--------------------------|
| [RAGAS](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/) | RAG 指标和 synthetic testset generation | 评测 context precision/recall、faithfulness，也用于从本仓文档生成候选评测集 |
| [DeepEval](https://deepeval.com/docs/getting-started-rag) | RAG 和 multi-turn 评测框架 | 可作为 Python runner，评测 contextual precision/recall、answer relevancy、turn faithfulness |
| [BEIR framework](https://github.com/beir-cellar/beir) | 标准 IR 评测 | 对 `memory_lookup` 的纯检索能力做 nDCG/MRR/Recall 对比 |

### 4.3 不把开源 benchmark 当唯一标准

LoCoMo 和 LongMemEval 能证明长期记忆能力，但它们不能完全证明 memory-autodb 的中间件价值。原因：

1. 它们主要评测问答，不直接评测 MCP/REST/SDK 接口契约。
2. 它们不能覆盖 `private/revoked`、candidate gate、SlotSnapshot freshness、scope 隔离等工程约束。
3. 它们容易被超长上下文、答案专用 prompt 或 benchmark-specific router 优化。
4. 它们不能判断 `semanticType` 可选、`kind=other` fallback 是否符合本项目目标。

因此最终报告必须同时给出：

```text
open-source benchmark score
+ local golden regression score
+ latency/cost/safety score
+ failed cases
```

---

## 5. 内置固定黄金集

内置黄金集是本项目最重要的回归基准。它不追求规模最大，而追求稳定、可解释、能防止架构偏航。

### 5.1 存放位置

建议新增目录：

```text
eval/
├── goldens/
│   ├── memory-autodb-v0.1.jsonl
│   ├── memory-autodb-safety.jsonl
│   ├── memory-autodb-cross-product.jsonl
│   └── manifest.json
├── adapters/
│   ├── beir.ts
│   ├── locomo.ts
│   ├── longmemeval.ts
│   └── ragas.ts
├── runners/
│   ├── baseline-v4.ts
│   ├── vnext.ts
│   └── judge.ts
└── results/
```

### 5.2 Golden case schema

```json
{
  "id": "golden-cross-product-rules-001",
  "suite": "memory-autodb-v0.1",
  "task": "用户从 Claw 研究助手切换到 Claw 项目助手后，继续整理同一项目的交付计划",
  "scope": {
    "tenantId": "local",
    "appId": "claw-project",
    "userId": "default",
    "projectId": "memory-autodb",
    "namespace": "memories"
  },
  "seedMemories": [
    {
      "id": "m1",
      "kind": "preference",
      "semanticType": "rules",
      "body": "用户要求复杂方案先给短结论，再给可执行计划；跨产品切换时仍要沿用这个协作偏好。",
      "evidence": ["docs/03-architecture/product-positioning.md"]
    }
  ],
  "query": "现在要继续整理 memory-autodb 的交付计划，输出风格需要注意什么？",
  "expected": {
    "requiredMemoryIds": ["m1"],
    "forbiddenMemoryIds": [],
    "requiredSlots": ["rules"],
    "answerMustContain": ["先给短结论", "可执行计划"],
    "warnings": []
  },
  "metrics": ["slot_recall", "context_precision", "evidence_grounding", "latency"]
}
```

### 5.3 首批黄金集规模

v0.1 不需要一开始做大。建议首批固定 80-120 条：

| 套件 | 数量 | 覆盖 |
|------|------|------|
| `memory-autodb-v0.1` | 40 | Agent context、lookup、SlotSnapshot、fallback |
| `memory-autodb-safety` | 25 | private、revoked、stale、conflict、prompt injection |
| `memory-autodb-cross-product` | 25 | 多 Claw 产品切换、偏好持续、工作背景持续、scope、MCP/REST |
| `memory-autodb-negative` | 10 | 不该记、不该答、应 abstain 的场景 |

v0.2 后扩展到 200-300 条，并加入 candidate gate、批量审核、自动淘汰和 Console explainability。

---

## 6. AI 自动化准备评测集

评测集准备可以由 AI 自动化执行，但不能让 AI 直接决定最终真值。正确流程是：**AI 生成候选，程序校验 evidence，人类或高置信规则冻结黄金集。**

### 6.1 自动准备流水线

```text
memory-eval prepare
  -> scan repo docs / examples / tests / changelog
  -> extract source chunks with stable ids
  -> generate candidate QA / task cases
  -> map required memory ids and evidence
  -> self-check answerability and leakage
  -> dedupe and balance suites
  -> write draft JSONL
  -> freeze approved goldens with manifest hash
```

### 6.2 AI 负责什么

| 步骤 | AI 可自动做 | 必须校验 |
|------|-------------|----------|
| 从文档生成问题 | 是 | 问题必须能由 evidence 回答 |
| 生成 expected answer | 是 | 必须引用原始 source id |
| 标注 semanticType | 是 | 低置信时允许为空 |
| 生成负向样例 | 是 | 不得伪造敏感数据 |
| 生成多跳样例 | 是 | 每一跳必须有 evidence |
| 冻结黄金集 | 否 | 需要规则校验和抽样人工确认 |

### 6.3 自动质量检查

每条候选 case 冻结前必须通过：

1. `evidence_exists`：所有 evidence id 能在 source corpus 中找到。
2. `answer_grounded`：expected answer 中的关键事实来自 evidence。
3. `no_answer_leakage`：问题文本不能直接包含答案。
4. `scope_valid`：case 必须有完整 scope。
5. `semantic_optional`：缺少 `semanticType` 不算失败，但必须有 `kind`。
6. `negative_valid`：负向样例的正确行为是 abstain、filter 或 warning，而不是强答。
7. `dedupe`：相似问题和相同 requiredMemoryIds 去重。

### 6.4 RAGAS 生成本地评测候选

RAGAS 可用于从本仓文档和示例数据生成初始 QA 候选：

```text
repo docs / API docs / architecture docs
  -> RAGAS KnowledgeGraph
  -> single-hop and multi-hop query synthesizers
  -> candidate QA with reference contexts
  -> convert to memory-eval schema
```

生成后的 case 只能进入 `draft`，不能直接进入 `golden`。原因是 RAGAS 生成的是 RAG 问答样例，不天然理解 memory-autodb 的 `scope`、`kind`、`semanticType`、candidate gate 和安全过滤规则。

---

## 7. 自动执行方案

### 7.1 CLI 形态

建议新增命令：

```bash
ltm eval prepare --source docs --out eval/goldens/draft.jsonl
ltm eval run --suite eval/goldens/memory-autodb-v0.1.jsonl --target baseline-v4
ltm eval run --suite eval/goldens/memory-autodb-v0.1.jsonl --target vnext
ltm eval compare --base results/baseline-v4.json --candidate results/vnext.json
ltm eval report --run results/2026-06-09-vnext --format markdown,json,html
```

也可以先以独立脚本落地：

```bash
npx tsx eval/cli.ts prepare --config eval/eval.config.json
npx tsx eval/cli.ts run --target baseline-v4 --suite local-v0.1
npx tsx eval/cli.ts run --target vnext --suite local-v0.1
npx tsx eval/cli.ts compare --base baseline-v4 --candidate vnext
```

### 7.2 Runner contract

每个被评测目标必须实现同一接口：

```typescript
interface MemoryEvalRunner {
  name: "baseline-v4" | "vnext";
  ingest(caseInput: EvalCase): Promise<void>;
  context(caseInput: EvalCase): Promise<EvalContextResult>;
  lookup(caseInput: EvalCase): Promise<EvalLookupResult>;
  answer?(caseInput: EvalCase): Promise<EvalAnswerResult>;
  cleanup(caseInput: EvalCase): Promise<void>;
}
```

这样可以确保 baseline 和 vNext 比较的是同一批数据、同一类输入、同一套输出字段。

### 7.3 输出结果

每次运行必须落盘：

```text
eval/results/2026-06-09T120000-vnext/
├── run.json
├── metrics.json
├── cases.jsonl
├── failures.jsonl
├── cost.json
├── latency.json
└── report.md
```

`report.md` 必须包含：

1. baseline vs vNext 总表。
2. 每个 suite 的指标。
3. 每个 category 的指标。
4. 成本和延迟。
5. 安全失败清单。
6. Top failed cases。
7. 是否达到 release gate。

---

## 8. 指标设计

### 8.1 通用检索指标

| 指标 | 说明 | 来源 |
|------|------|------|
| Hit@K | 前 K 条是否命中 required evidence | 本地实现 |
| Recall@K | required memory/evidence 被召回比例 | BEIR / 本地实现 |
| MRR | 第一个正确命中的排序质量 | BEIR / 本地实现 |
| nDCG@10 | 排序质量，支持分级 relevance | BEIR |
| Context Precision | 注入 context 中有用信息比例 | RAGAS / DeepEval |
| Context Recall | required evidence 是否进入 context | RAGAS / DeepEval |

### 8.2 RAG/答案指标

| 指标 | 说明 |
|------|------|
| Faithfulness | 回答是否被检索上下文支持 |
| Answer Correctness | 回答是否符合 expected answer |
| Answer Relevancy | 回答是否针对问题 |
| Abstention Accuracy | 应拒答时是否拒答 |

### 8.3 记忆中间件专用指标

| 指标 | 说明 | v0.1 门槛 |
|------|------|-----------|
| Slot Recall | required memory 是否进入正确槽位 | 高于 baseline context recall |
| Slot Precision | 5 槽位中无关记忆比例 | 不低于 baseline precision |
| Rule Priority | rules 是否优先于 experience/profile | 安全集必须通过 |
| Fallback Lookup Hit@K | 无 `semanticType` 节点是否仍可 lookup | 不低于 baseline |
| Wrong Injection Rate | private/revoked/stale/conflict 误注入 | 必须为 0 |
| Evidence Coverage | 注入记忆是否有 source/evidence | v0.1 接近 100% |
| Time To Index | observation 到可 lookup 的时间 | 符合 hot/warm path 目标 |
| Candidate Precision | 自动候选被接受比例 | v0.2 开始统计 |
| Token Budget Fit | context 是否超过预算 | 必须不超过 |
| P95 Latency | context/lookup/observe 延迟 | 符合架构 SLO |

---

## 9. 对照实验和消融实验

### 9.1 Baseline 对照

必须至少比较：

| Target | 说明 |
|--------|------|
| `baseline-v4` | 当前 memory-autodb 能力 |
| `vnext-fast` | 只启用 Agent fast path 和 SlotSnapshot |
| `vnext-full` | 启用候选区、治理、graph/tree 可用部分 |

### 9.2 消融实验

为了证明具体模块确实有用，必须支持关闭模块：

| Ablation | 目的 |
|----------|------|
| `--disable-slot-snapshot` | 验证 5 槽位组织是否提升 context recall |
| `--disable-lifecycle-filter` | 验证 revoked/stale 过滤价值 |
| `--disable-candidate-gate` | 验证候选门控是否减少错误记忆 |
| `--disable-rules-boost` | 验证 rules 优先级是否必要 |
| `--vector-only` | 对照纯向量检索 |
| `--text-only` | 对照 BM25/text fallback |

如果 vNext 总分提高，但消融实验显示 SlotSnapshot、candidate gate、lifecycle filter 没有贡献，就说明架构设计需要收缩，而不是继续堆复杂度。

---

## 10. 发布门槛

### 10.1 v0.1 release gate

v0.1 必须满足：

1. 本地黄金集 `memory-autodb-v0.1` 的 required memory recall 高于 `baseline-v4`。
2. `memory-autodb-safety` 中 private/revoked 误注入为 0。
3. 无 `semanticType` 的 fallback 记忆仍可通过 `memory_lookup` 命中。
4. `memory_context_fast` 本地 P95 小于 80ms。
5. `memory_lookup` 本地 P95 小于 100ms。
6. 平均 prompt context token 不高于 baseline 110%。
7. 每条进入 5 槽位的记忆都有 evidence/source。
8. LoCoMo 或 LongMemEval small run 至少不低于 baseline。

### 10.2 v0.2 release gate

v0.2 增加：

1. candidate 自动抽取有可解释接受率和拒绝率。
2. 30 天无命中候选自动清理逻辑有回放测试。
3. Console 可以解释某条记忆为什么被注入、过滤、降级或归档。
4. safety suite 覆盖 prompt injection、冲突 rules 和 stale task_context。

### 10.3 不通过时的处理

| 失败 | 处理 |
|------|------|
| 通用开源 benchmark 下降 | 检查 retrieval/index/rerank，不能只调 prompt |
| 本地黄金集下降 | 检查 5 type、scope、lifecycle、SlotSnapshot |
| 安全集失败 | 阻断发布 |
| 延迟超标 | 降级 deep path，优先保证 hot path |
| token 超标 | 调整 slot budget 和 evidence preview |
| 只有开源 benchmark 提升、本地黄金集不提升 | 说明架构对产品目标无效，不能视为成功 |

---

## 11. 分阶段开发计划

### Phase 1：评测规格落地

交付：

1. `eval/goldens/` 目录和 JSONL schema。
2. `memory-autodb-v0.1` 首批 80-120 条黄金集。
3. `baseline-v4` 和 `vnext` runner contract。
4. `compare` 报告生成器。

验收：

1. 可以在无外部 benchmark 下载的情况下跑完整本地黄金集。
2. 报告能输出 baseline vs vNext 差异。

### Phase 2：接入开源 benchmark

交付：

1. BEIR adapter，先接 1-3 个小型子集。
2. LoCoMo adapter。
3. LongMemEval adapter，先支持 small/sample 配置。
4. RAGAS/DeepEval bridge。

验收：

1. 可以自动下载或读取本地缓存数据。
2. 可以转换成统一 EvalCase schema。
3. 可以输出标准 retrieval/RAG 指标。

### Phase 3：AI 自动生成评测集

交付：

1. `ltm eval prepare`。
2. 从 docs/API/changelog 生成 draft cases。
3. evidence 校验、去重、难度分层、suite balancing。
4. `manifest.json` 记录生成模型、prompt、source hash、审批状态。

验收：

1. AI 可生成 draft，不直接覆盖 golden。
2. 每条 frozen golden 都有 source hash 和 evidence id。

### Phase 4：CI 和发布门槛

交付：

1. `ltm eval run --quick`：本地开发快速评测。
2. `ltm eval run --full`：发布前完整评测。
3. GitHub Actions 或本地 CI 配置。
4. 失败样例自动汇总。

验收：

1. PR 能看到 quick eval 结果。
2. release 前必须通过 safety suite 和 v0.1 gate。

---

## 12. 参考来源

| 来源 | 用途 |
|------|------|
| [RAGAS metrics](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/) | RAG context precision/recall、faithfulness、answer relevancy 等指标 |
| [RAGAS testset generation](https://docs.ragas.io/en/latest/getstarted/rag_testset_generation/) | 使用 KnowledgeGraph 和 query synthesizer 生成 RAG 测试集候选 |
| [DeepEval RAG evaluation](https://deepeval.com/docs/getting-started-rag) | RAG 与 multi-turn RAG 自动评测 runner 参考 |
| [BEIR GitHub](https://github.com/beir-cellar/beir) | 通用信息检索 benchmark 和 nDCG/MRR/Recall 指标 |
| [LoCoMo GitHub](https://github.com/snap-research/locomo) | 长期对话记忆 benchmark |
| [LongMemEval GitHub](https://github.com/xiaowu0162/LongMemEval) | 长期交互记忆 benchmark |
| [LongMemEval-V2 Hugging Face](https://huggingface.co/datasets/xiaowu0162/longmemeval-v2) | Agent/企业轨迹长期记忆 benchmark，v0.3+ 参考 |
