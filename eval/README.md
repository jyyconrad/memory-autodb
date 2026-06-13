# memory-autodb 评测基础设施

本目录提供 memory-autodb 的评测黄金集、runner 与开源数据集 adapter。

设计依据：[docs/07-test/memory-evaluation-plan.md](../docs/07-test/memory-evaluation-plan.md)。

## 目录结构

```
eval/
├── goldens/                  # 黄金集 jsonl 与 manifest
│   ├── memory-autodb-v0.1.jsonl
│   ├── memory-autodb-safety.jsonl
│   └── manifest.json
├── runners/                  # 评测 runner 与 vitest 集成
│   ├── types.ts
│   ├── load-jsonl.ts
│   ├── judge.ts
│   ├── quick-eval.ts
│   └── quick-eval.test.ts
├── adapters/                 # 开源数据集 adapter（占位实现）
│   ├── longmemeval.ts
│   └── longmemeval.test.ts
├── fixtures/                 # adapter 测试用最小样例
│   └── longmemeval-mini.json
└── results/                  # runner 输出（gitignore）
```

## 黄金集 schema

每行一条 JSON，严格按 `runners/types.ts::GoldenCase`：

```json
{
  "id": "v01-rules-001",
  "suite": "memory-autodb-v0.1",
  "task": "...",
  "scope": { "tenantId": "...", "appId": "...", "userId": "...", "workspaceId": "...", "projectId": "...", "namespace": "..." },
  "seedMemories": [
    { "id": "m1", "kind": "decision", "semanticType": "rules", "body": "..." }
  ],
  "query": "...",
  "expected": {
    "requiredMemoryIds": ["m1"],
    "forbiddenMemoryIds": [],
    "requiredSlots": ["rules"],
    "answerMustContain": ["..."],
    "mustEscapeMaxCount": [{ "tag": "</relevant-memories>", "max": 1 }],
    "expectSensitiveBlocked": false
  },
  "metrics": ["slot_recall", "wrong_injection", "latency"]
}
```

注释行：以 `#` 或 `//` 开头的行会被 loader 跳过，方便人工标注。

## 当前规模

| 套件 | 条数 | 覆盖 |
|------|------|------|
| `memory-autodb-v0.1` | 30 | profile / rules / experience workspace 复用，task_context / resource project 隔离，lookup-only 无 semanticType |
| `memory-autodb-safety` | 40 | private 跨用户隔离、revoked / archived 不进 fast、5 类敏感属性拦截、prompt 注入转义、forbidden ids |

详见 `goldens/manifest.json`。

## 怎么跑

### 一次性评测（命令行）

```bash
# 默认跑 v0.1
npm run eval:quick

# 指定 suite
npm run eval:quick -- memory-autodb-safety

# 跑全部 suite
npm run eval:quick -- all

# 自定义输出目录
npm run eval:quick -- memory-autodb-v0.1 --out eval/results/manual-run
```

输出：`eval/results/<timestamp>/report.md` + `report.json`。

### 通过 vitest 跑（CI / 回归）

```bash
npx vitest run eval/runners/quick-eval.test.ts
```

每条 case 都会变成一个 vitest test 条目，套件级断言会校验 release gate。

## release gate（v0.1）

由 `runners/quick-eval.ts::buildReport` 实现：

1. `memory-autodb-safety.wrongInjectionRate === 0`
2. 其他套件 `passRate >= 0.8`

任意一项失败，CLI 进程 exit code 设为 1，便于 CI 拒绝合并。

## 接入开源测试集

适配优先级（详见 `docs/07-test/memory-evaluation-plan.md` §4）：

| 数据集 | License | 用途 | 是否进 v0.1 必跑 |
|--------|---------|------|------------------|
| [LongMemEval](https://github.com/xiaowu0162/LongMemEval) | MIT | 跨会话推理、abstention、知识更新 | 否（v0.2 接入） |
| [LoCoMo](https://github.com/snap-research/locomo) | Apache 2.0 | 长对话记忆 | 否（v0.2 接入） |
| [PerLTQA](https://github.com/Elvin-Yiming-Du/PerLTQA) | 见仓库 | 个人偏好长期 QA | 否（v0.3 参考） |
| BEIR 子集（scifact 等） | 各子集独立 | 通用检索能力 | 否（仅作 retrieval baseline） |

接入流程：

1. 下载数据集到本机（不入仓）。例如 LongMemEval：
   ```bash
   git clone https://github.com/xiaowu0162/LongMemEval ~/datasets/longmemeval
   ```
2. 用 adapter 转换：
   ```typescript
   import { loadLongMemEval } from "./adapters/longmemeval.js";
   const cases = loadLongMemEval("~/datasets/longmemeval/data/longmemeval_s.json", {
     suite: "longmemeval-s",
     limit: 50,
   });
   ```
3. 把转换结果写到 `eval/goldens/longmemeval-s.jsonl`，再用 `quick-eval` 跑。

注意：

- 默认 v0.1 release gate 不要求开源 benchmark。LongMemEval / LoCoMo 的接入是为
  v0.2+ 做准备。
- `eval/fixtures/longmemeval-mini.json` 仅用于 adapter 单元测试，**不**是真实数据集。

## 开发指引

### 新增黄金集 case

1. 复制现有 jsonl 行为模板修改字段；
2. 跑一遍 `npm run eval:quick -- <suite>` 确认通过；
3. 重新计算 sha256：`shasum -a 256 eval/goldens/*.jsonl`；
4. 更新 `eval/goldens/manifest.json` 的 size 与 sha256；
5. 提交。

### 新增指标

在 `runners/types.ts` 加 `GoldenMetric` 枚举，并在 `runners/judge.ts::defaultJudge` 中加判定分支。
