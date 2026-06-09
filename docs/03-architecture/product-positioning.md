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
| 本地项目初始化 | 用户在某个本地工作目录执行 `ltm init`，该目录成为 Project Memory Workspace，后续 Agent 任务默认围绕这个 project scope 使用和沉淀上下文 |
| 多目录工作空间 | 一个 project workspace 可以绑定多个 source root，例如项目主目录、资料目录、会议纪要目录和外部参考目录 |
| 工作场景切换 | 用户在不同 Agent 产品、任务或工作场景之间切换时，仍保留工作偏好和当前项目背景 |
| Agent Runtime 启动 | Runtime 启动任务前通过一次 `context_fast` 获取 5 槽位上下文 |
| 运行中观察 | Runtime 在会话中提交轻量 observation，memory-autodb 异步提炼候选记忆 |
| 会话提交 | Runtime 在任务结束时通过 `memory_session_commit` 写回决策、状态、经验和资源线索 |
| 项目增量更新 | 用户执行 `ltm project refresh` 或 watch 后，系统根据本地目录层级、contentHash 和 manifest diff 增量更新 evidence、索引和记忆树 |
| 用户显式记住 | 用户要求“记住这点”时，系统保存到主库或候选区，并保留 evidence |
| 工作记忆速查 | 产品 UI 或 Agent 通过 `memory_lookup` 快速查找事实、规则、资源和历史经验 |
| Console 治理 | 用户或产品管理员在 Console 中查看、审核、归档、撤销和解释记忆 |

---

## 4. Project Memory Workspace

Project Memory Workspace 是产品从“插件记忆能力”升级为“用户工作上下文中间件”的关键产品概念。

定义：

> 用户在本地某个目录执行 `ltm init` 后，该目录成为一个 project root。memory-autodb 为它建立 project identity、scope、manifest、source roots、ingest policy 和增量更新链路。Agent Runtime 后续在这个 project scope 下获得上下文、提交会话结果、速查资源和追溯 evidence。

设计原则：

1. 本地目录是工作上下文入口，不是单次扫描任务。
2. 项目目录只保存轻量 `.memory-autodb.json` 指针；记忆数据默认保存在用户本地全局库。
3. 一个 project workspace 可以包含多个 source root，每个 root 有独立 role、include/exclude、lastIndexedAt 和 contentHash。
4. `ltm project refresh` 负责文件系统增量更新；`memory_session_commit` 负责 Agent 运行时增量更新。
5. 目录层级变化通过 manifest diff、contentHash 和 source root registry 局部更新 Source Tree、Topic Tree、Global Tree、向量索引和 BM25 索引。
6. 进入向量库的是可重建的检索单元，不是权限、审计、候选状态或原始大文件真源。

最小产品流：

```bash
cd /path/to/project
ltm init
ltm project index
ltm project context
ltm project lookup "关键约束"
```

这个模型让不同 Agent 产品复用的不是彼此的数据，而是同一用户授权范围内的本地工作上下文。

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

## 6. 和 OpenClaw 的关系

OpenClaw 类产品是 memory-autodb 的首批接入方、验证场景和主要分发入口，但不是产品概念的主体。产品主体是用户持续存在的工作上下文；OpenClaw adapter 只是让这些上下文被当前 Runtime 使用的一种接入方式。

边界如下：

| 层 | 定位 |
|----|------|
| OpenClaw adapter | 当前主要接入层，负责工具、hooks、CLI 兼容 |
| MemoryService | 共享核心，REST/MCP/SDK/OpenClaw adapter 都必须走同一服务边界 |
| Local server | 多个授权 Agent 产品复用同一用户本地工作上下文的默认演进形态 |
| Console | 用户速查、预览、追溯和治理入口 |

---

## 7. 成功标准

memory-autodb 的成功不以“支持多少工具”衡量，而以以下结果衡量：

1. 同一用户在不同 Agent 产品、任务和工作场景之间切换时，核心工作上下文不丢失。
2. 本地项目目录可以通过 `ltm init` 建立长期 project workspace，并通过增量更新持续维护。
3. 多个 source root 的目录层级、资源和 evidence 能在同一 project scope 下被正确索引、召回和追溯。
4. Agent Runtime 能在低延迟下获取准确、可解释、prompt-safe 的上下文。
5. 用户偏好、长期规则、项目背景、历史经验和资源指针能持续影响后续任务。
6. Agent 越用越懂用户，越理解用户工作，运行过程越来越流畅。
7. 长记忆可找、可追溯、可撤销，private、revoked、stale、conflict 记忆不会误注入。
8. 记忆系统的收益能通过 `memory-eval` 的本地黄金集和开源 benchmark 对照证明。
