# Mengshu OpenClaw Plugin

OpenClaw 插件 id 为 `mengshu-openclaw`，旧 id `memory-autodb` 和 `mengshu` 通过 `legacyPluginIds` 兼容。

推荐配置（PostgreSQL 与 Codex / Claude Code / CLI 共享同一个库）：

```json
{
  "plugins": {
    "slots": {
      "memory": "mengshu-openclaw"
    },
    "entries": {
      "mengshu-openclaw": {
        "enabled": true,
        "config": {
          "embedding": {
            "apiKey": "${OPENAI_API_KEY}",
            "baseURL": "https://api.openai.com/v1",
            "model": "text-embedding-3-small"
          },
          "dbType": "postgres",
          "postgres": {
            "host": "${PG_HOST}",
            "port": 5432,
            "database": "${PG_DATABASE}",
            "user": "${PG_USER}",
            "password": "${PG_PASSWORD}",
            "ssl": false
          },
          "autoCapture": true,
          "autoRecall": true
        }
      }
    }
  }
}
```

`~/.mengshu/config.json` 是跨产品共享配置；记忆数据写入 OpenClaw 配置中的 PostgreSQL 库。`dbPath` 仅在显式选择 `dbType=lancedb` 时使用。

LanceDB 本地单机配置：

```json
{
  "dbType": "lancedb",
  "dbPath": "~/.mengshu/memory/lancedb"
}
```

Supabase 配置使用 service role key：

```json
{
  "dbType": "supabase",
  "supabase": {
    "url": "https://xxx.supabase.co",
    "serviceKey": "${SUPABASE_SERVICE_KEY}"
  }
}
```

旧配置迁移：

```bash
ms migrate-openclaw-plugin-id
ms migrate-openclaw-plugin-id --execute
```
