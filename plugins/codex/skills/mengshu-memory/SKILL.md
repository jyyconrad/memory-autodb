---
name: mengshu-memory
description: Use mengshu memory from Codex when a task may benefit from stable project context, user preferences, architecture decisions, or reusable lessons.
---

# Mengshu Memory

Use this skill when working in a project where long-term memory can improve correctness or continuity.

## Recall First

Before changing code or writing plans, call `memory_context_fast` or `memory_recall` for:

- Stable user preferences and constraints.
- Project architecture decisions.
- Historical pitfalls, migration decisions, or validation notes.
- Shared context that should apply across Codex, OpenClaw, and other agents.

## Save Carefully

Save memory with `memory_save` or `memory_observe_light` only when the information is:

- Durable beyond the current task.
- Verified or explicitly stated by the user.
- Useful for future agents or future sessions.

Do not save secrets, one-off logs, temporary tool output, or unverified guesses.

## Shared Store

The Codex plugin uses the same global config as the CLI and OpenClaw plugin:

```text
~/.mengshu
```

`~/.mengshu/config.json` points to the same PostgreSQL backend configured by OpenClaw, so Codex and OpenClaw share memory data through the MCP server exposed by `ms mcp`. Do not create a separate local LanceDB store unless the user explicitly switches `dbType` to `lancedb`.
