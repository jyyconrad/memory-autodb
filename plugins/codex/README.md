# Mengshu Memory Codex Plugin

Codex 插件名为 `mengshu-memory`，通过 MCP 使用 `ms mcp` 暴露的记忆工具。

首期插件包是开发期启动器：

- `.codex-plugin/plugin.json` 声明 Codex 插件元数据。
- `.mcp.json` 注册 `mengshu` MCP server。
- `mcp/server.mjs` 调用全局 `ms mcp`。
- `skills/mengshu-memory/SKILL.md` 定义 Codex 侧记忆使用策略。

项目级 Codex 技能放在 `.agents/skills/`：

- `.agents/skills/update-doc/SKILL.md` 复用项目 `.claude` 的文档路由入口，供 Codex 更新内部/对外文档。

运行前需要确保当前项目的 `ms` CLI 已全局安装，并且 `ms doctor` 通过。Codex 通过 `~/.mengshu/config.json` 复用 OpenClaw 配置的 PostgreSQL 后端；`~/.mengshu` 只保存全局配置和运行时元数据：

```text
~/.mengshu
```

后续发布期可把 `mcp/server.mjs` 改为直接 import `@mengshu/core` 的 MCP 启动器，减少对全局 CLI 的依赖。
