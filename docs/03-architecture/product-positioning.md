# memory-autodb 产品定位

> 日期：2026-06-09
> 状态：当前产品方向真源
> 适用范围：约束 memory-autodb 的架构设计、API 命名、评测口径、竞品分析和后续开发计划。

---

## 1. 一句话定位

memory-autodb 是面向 **Agent 应用** 的本地优先记忆中间件，核心服务对象是用户持续存在的工作上下文。

它要解决的问题是：

> 当同一个用户在不同 Agent 产品、不同任务和不同工作场景之间切换时，工作记忆、协作偏好、长期约束、项目背景、历史经验、可用资源和工作状态仍然持续存在，并能被当前 Agent Runtime 快速、安全、可解释地使用。

---

## 2. 产品方向

memory-autodb 的主方向不是 coding-agent 记忆工具，也不是云端 Memory SaaS，而是：

1. 为用户提供本地优先、可控、可追溯的长期工作上下文层。
2. 让授权的 Agent Runtime 用少量稳定接口获得可直接注入 prompt 的上下文。
3. 让用户的偏好、规则、项目背景、历史经验、资源线索和工作状态持续保留。
4. 让 Agent 越用越懂用户、越理解用户的工作，运行过程越来越流畅。
5. 让长期记忆具备 lookup、evidence、scope、lifecycle、audit 和可解释治理。

---

## 3. 典型使用场景

| 场景 | 说明 |
|------|------|
| 工作场景切换 | 用户在不同 Agent 产品、任务或工作场景之间切换时，仍保留工作偏好和当前项目背景 |
| Agent Runtime 启动 | Runtime 启动任务前通过一次 `context_fast` 获取 5 槽位上下文 |
| 运行中观察 | Runtime 在会话中提交轻量 observation，memory-autodb 异步提炼候选记忆 |
| 用户显式记住 | 用户要求“记住这点”时，系统保存到主库或候选区，并保留 evidence |
| 工作记忆速查 | 产品 UI 或 Agent 通过 `memory_lookup` 快速查找事实、规则、资源和历史经验 |
| Console 治理 | 用户或产品管理员在 Console 中查看、审核、归档、撤销和解释记忆 |

---

## 4. 当前不做什么

这些不是当前主方向：

1. 不进入 coding-agent 细分赛道，不把 Codex、Cursor、Claude Code、OpenCode 作为主要产品目标。
2. 不做完整 Agent Runtime，不接管 planner、tool loop、执行器或任务调度。
3. 不做大而全的云端 Memory SaaS，不把远程同步、团队云记忆作为 v0.x 默认交付。
4. 不把图谱、记忆树或 Dashboard 做成优先于 Agent Runtime 快路径的核心目标。
5. 不让 Agent 直接编辑 durable 主库，所有写入必须经过服务层、scope、evidence 和治理规则。

coding-agent、IDE agent 和通用开发工具可以作为未来适配对象或竞品参考，但不能牵引当前架构优先级。

---

## 5. 和 OpenClaw 的关系

OpenClaw 类产品是 memory-autodb 的首批接入方、验证场景和主要分发入口，但不是产品概念的主体。产品主体是用户持续存在的工作上下文；OpenClaw adapter 只是让这些上下文被当前 Runtime 使用的一种接入方式。

边界如下：

| 层 | 定位 |
|----|------|
| OpenClaw adapter | 当前主要接入层，负责工具、hooks、CLI 兼容 |
| MemoryService | 共享核心，REST/MCP/SDK/OpenClaw adapter 都必须走同一服务边界 |
| Local server | 多个授权 Agent 产品复用同一用户本地工作上下文的默认演进形态 |
| Console | 用户速查、预览、追溯和治理入口 |

---

## 6. 成功标准

memory-autodb 的成功不以“支持多少工具”衡量，而以以下结果衡量：

1. 同一用户在不同 Agent 产品、任务和工作场景之间切换时，核心工作上下文不丢失。
2. Agent Runtime 能在低延迟下获取准确、可解释、prompt-safe 的上下文。
3. 用户偏好、长期规则、项目背景、历史经验和资源指针能持续影响后续任务。
4. Agent 越用越懂用户，越理解用户工作，运行过程越来越流畅。
5. 长记忆可找、可追溯、可撤销，private、revoked、stale、conflict 记忆不会误注入。
6. 记忆系统的收益能通过 `memory-eval` 的本地黄金集和开源 benchmark 对照证明。
