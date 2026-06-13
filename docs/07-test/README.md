# 测试文档

本目录记录测试范围、稳定验证命令和已知环境依赖。

## 当前文档

| 文档 | 状态 | 说明 |
|------|------|------|
| [plugin-test.md](./plugin-test.md) | 当前 | OpenClaw 插件、中间件、REST、MCP、SDK、ingestion、retrieval、graph、tree、console、migration、lifecycle 的验证命令 |
| [memory-evaluation-plan.md](./memory-evaluation-plan.md) | 设计中 | 记忆架构效果评测方案，覆盖开源 benchmark、内置黄金集、AI 自动准备和自动执行 |

## 推荐验证

```bash
npx tsc --noEmit
npx vitest run config.middleware.test.ts api/rest/auth.test.ts api/rest/router.test.ts server/daemon.test.ts server/health.test.ts sdk/js/client.test.ts adapters/mcp/tools.test.ts adapters/mcp/server.test.ts adapters/openclaw/cli.test.ts index.test.ts adapters/openclaw/tools.test.ts adapters/openclaw/hooks.test.ts adapters/openclaw/scope.test.ts core/memory-service.test.ts storage/legacy-database-adapter.test.ts storage/repositories/in-memory.test.ts storage/indexes/in-memory-bm25.test.ts core/scope.test.ts core/legacy-mapping.test.ts retrieval/prompt-safety.test.ts retrieval/fusion.test.ts retrieval/orchestrator.test.ts retrieval/context-packer.test.ts ingest/canonicalize.test.ts ingest/chunker.test.ts ingest/pipeline.test.ts ingest/jobs.test.ts ingest/adapters/file-system.test.ts server/workers.test.ts graph/extractor.test.ts graph/repository.test.ts graph/query.test.ts tree/buffer.test.ts tree/seal.test.ts tree/topic.test.ts tree/global.test.ts console/api.test.ts console/web-smoke.test.ts migration/v4.test.ts lifecycle/audit.test.ts lifecycle/retention.test.ts
```

`npm test` 会运行更广的测试集，其中部分测试依赖本机 embedding 服务。

## 维护规则

- 新模块必须有相邻测试或明确的集成测试覆盖。
- 如果验证失败来自环境依赖，需要记录具体依赖和失败现象。
- 测试文档只记录可复现命令，不写无法核验的覆盖率数字。

## v0.1 评测基础设施落地（2026-06-10）

新增 `eval/` 目录，承载 v0.1 的黄金集与 quick-eval runner，是 release gate 的代码侧依据。

- 入口与使用说明：[../../eval/README.md](../../eval/README.md)
- 黄金集：
  - `eval/goldens/memory-autodb-v0.1.jsonl`（30 条，覆盖 profile / rules / experience 跨 project 复用，task_context / resource project 隔离，lookup-only）
  - `eval/goldens/memory-autodb-safety.jsonl`（40 条，覆盖 private 隔离、revoked / archived 拦截、5 类敏感属性、prompt 注入转义、forbidden ids）
  - `eval/goldens/manifest.json`（size + sha256 + 覆盖摘要）
- runner：
  - 命令行：`npm run eval:quick -- <suite>`，输出 `eval/results/<timestamp>/report.md`
  - vitest：`npx vitest run eval/runners/quick-eval.test.ts`，每条 case 一条测试条目
- release gate（由 `runners/quick-eval.ts::buildReport` 实现）：
  - safety 套件 `wrongInjectionRate` 必须为 0；
  - v0.1 套件 `passRate >= 80%`。
- 开源数据集：`eval/adapters/longmemeval.ts` 提供 LongMemEval 转换 adapter（默认不真跑，作为 v0.2 接入起点）。详见 `eval/README.md` 的"接入开源测试集"章节。
- 公共测试工具：`testing/fake-embeddings.ts` 提供可重现的 EmbeddingPort 假实现（默认 1536 维，与生产一致）。
- vitest 配置：根目录 `vitest.config.ts`（v8 coverage、80% 阈值、`eval/results/**` 排除）。

