# 环境变量配置指南

> **适用场景**：解决配置文件中使用 `${VAR}` 环境变量占位符导致的 API 连接失败问题。  
> **典型错误**：`401 Invalid token`、`environment variable not set`  
> **最后更新**：2026-06-15

---

## 问题诊断

在运行 mengshu 工具（`ms search`、`ms scan` 等）时，如果遇到以下错误：

```
Error: 环境变量 SILICONFLOW_API_KEY 未设置 (embedding.apiKey)
```

或

```
HTTP 401 Invalid token
```

说明配置文件中的 `${VAR}` 占位符未被正确解析，或 API key 无效。

### 快速诊断脚本

运行内置诊断脚本，自动检查所有配置问题：

```bash
# 完整检查（含联网测试）
tsx bin/validate-config.ts

# 仅离线检查（不测试 API 连接）
tsx bin/validate-config.ts --offline

# JSON 格式输出（便于脚本消费）
tsx bin/validate-config.ts --json
```

诊断内容：
- ✅ 配置文件 JSON 格式是否正确
- ✅ 所有 `${VAR}` 引用的环境变量是否已设置
- ✅ API key 格式是否符合服务商规范（如 `sk-` 开头）
- ✅ API 端点是否可达（embedding / llm）

---

## 环境变量配置方法

### 方法 1：Shell 配置文件（推荐）

根据你使用的 Shell，编辑对应的配置文件：

#### Zsh（macOS 默认）

```bash
# 1. 编辑配置文件
nano ~/.zshrc

# 2. 在文件末尾添加以下行（替换为你的真实密钥）
export SILICONFLOW_API_KEY="sk-your-siliconflow-key-here"
export DEEPSEEK_API_KEY="sk-your-deepseek-key-here"

# 3. 保存并退出（Ctrl+X, 然后按 Y）

# 4. 重新加载配置
source ~/.zshrc

# 5. 验证环境变量已设置
echo $SILICONFLOW_API_KEY
```

#### Bash（Linux 常用）

```bash
# 1. 编辑配置文件（macOS 使用 ~/.bash_profile，Linux 使用 ~/.bashrc）
nano ~/.bashrc

# 2. 添加环境变量
export SILICONFLOW_API_KEY="sk-your-siliconflow-key-here"
export DEEPSEEK_API_KEY="sk-your-deepseek-key-here"

# 3. 重新加载配置
source ~/.bashrc

# 4. 验证
echo $SILICONFLOW_API_KEY
```

### 方法 2：项目级 .env 文件

在 `~/.mengshu/.env` 文件中设置（适合单项目使用）：

```bash
# 创建 .env 文件
nano ~/.mengshu/.env

# 添加内容（每行一个变量，不需要 export）
SILICONFLOW_API_KEY=sk-your-siliconflow-key-here
DEEPSEEK_API_KEY=sk-your-deepseek-key-here

# 保存后无需 source，mengshu 会自动加载
```

### 方法 3：直接填写密钥（不推荐）

修改 `~/.mengshu/config.json`，直接填写密钥字面值：

```json
{
  "embedding": {
    "apiKey": "sk-your-siliconflow-key-here",
    "baseURL": "https://api.siliconflow.cn/v1"
  },
  "llm": {
    "apiKey": "sk-your-deepseek-key-here",
    "baseURL": "https://api.deepseek.com/v1"
  }
}
```

**注意**：此方法会将密钥明文存储在配置文件中，存在泄露风险。仅适用于本地开发环境。

---

## 配置示例

### 完整 config.json 示例

```json
{
  "embedding": {
    "provider": "openai",
    "model": "BAAI/bge-m3",
    "apiKey": "${SILICONFLOW_API_KEY}",
    "baseURL": "https://api.siliconflow.cn/v1"
  },
  "llm": {
    "provider": "openai",
    "model": "deepseek-v4-flash",
    "apiKey": "${DEEPSEEK_API_KEY}",
    "baseURL": "https://api.deepseek.com/v1",
    "maxTokens": 2000,
    "temperature": 0.7
  },
  "dbType": "lancedb",
  "dbPath": "~/.mengshu/memory/lancedb",
  "autoCapture": true,
  "autoRecall": true
}
```

### 对应的环境变量设置

在 `~/.zshrc` 或 `~/.mengshu/.env` 中添加：

```bash
export SILICONFLOW_API_KEY="sk-jkdghsjfhgkdjfhgkdjshfgkjsd"
export DEEPSEEK_API_KEY="sk-abcdefghijklmnopqrstuvwxyz123456"
```

---

## 常见错误及解决方案

### 1. 环境变量未设置

**错误信息**：
```
Error: 环境变量 SILICONFLOW_API_KEY 未设置 (embedding.apiKey)
```

**原因**：Shell 配置文件未正确加载，或忘记运行 `source`。

**解决方法**：
```bash
# 检查环境变量是否存在
echo $SILICONFLOW_API_KEY

# 如果为空，重新加载配置
source ~/.zshrc

# 或者重启终端
```

### 2. API Key 格式错误

**错误信息**：
```
[!!] key-format:embedding: embedding 的 apiKey 不符合 SiliconFlow（应以 sk- 开头）
```

**原因**：
- API key 复制时包含了多余的空格或引号
- API key 来源不匹配（如把 OpenAI 的 key 用于 SiliconFlow）

**解决方法**：
1. 检查 API key 格式：
   ```bash
   echo "$SILICONFLOW_API_KEY" | cat -A  # 查看隐藏字符
   ```
2. 重新从服务商平台复制 API key，确保无多余字符
3. 确认 API key 对应的 baseURL 正确

### 3. API 连接失败（401 / 403）

**错误信息**：
```
[XX] embedding-connection: embedding 鉴权失败（HTTP 401 Invalid token）
```

**原因**：
- API key 无效或已过期
- API key 与 baseURL 不匹配（如 SiliconFlow 的 key 用于 DeepSeek 的 baseURL）

**解决方法**：
1. 登录服务商平台，检查 API key 是否有效：
   - SiliconFlow: https://cloud.siliconflow.cn/account/ak
   - DeepSeek: https://platform.deepseek.com/api_keys
   - OpenAI: https://platform.openai.com/api-keys
2. 确认 baseURL 正确：
   ```json
   // SiliconFlow
   "baseURL": "https://api.siliconflow.cn/v1"
   
   // DeepSeek
   "baseURL": "https://api.deepseek.com/v1"
   
   // OpenAI
   "baseURL": "https://api.openai.com/v1"
   ```
3. 如果 key 已过期，重新生成并更新环境变量

### 4. API 连接失败（404）

**错误信息**：
```
[!!] embedding-connection: embedding 端点 404，可能是 baseURL 或 model 名不正确
```

**原因**：
- baseURL 不正确（多余或缺少 `/v1`）
- model 名称拼写错误

**解决方法**：
1. 检查 baseURL 格式（必须包含 `/v1`）
2. 确认 model 名称正确：
   - SiliconFlow: `BAAI/bge-m3`、`Qwen/Qwen3-Embedding-0.6B`
   - DeepSeek: `deepseek-v4-flash`
   - OpenAI: `text-embedding-3-small`

### 5. API 连接超时

**错误信息**：
```
[XX] embedding-connection: embedding 连接失败: fetch failed
```

**原因**：网络问题或服务商 API 不可达。

**解决方法**：
1. 检查网络连接
2. 测试 API 端点可达性：
   ```bash
   curl -I https://api.siliconflow.cn/v1/embeddings
   ```
3. 如果使用代理，确保代理配置正确
4. 使用 `--offline` 模式跳过联网检查：
   ```bash
   tsx bin/validate-config.ts --offline
   ```

### 6. 占位符未解析

**错误信息**：
```
[XX] key-format:embedding: embedding 的 apiKey 仍含未解析的占位符: ${SILICONFLOW_API_KEY}
```

**原因**：环境变量未设置，但被当作字面值传递给 API。

**解决方法**：
1. 确认环境变量已设置（见方法 1 或 2）
2. 重启终端或重新加载 Shell 配置
3. 运行 `ms` 命令时检查是否从正确的 Shell 启动

---

## 验证配置

完成配置后，按以下步骤验证：

```bash
# 1. 检查环境变量
echo $SILICONFLOW_API_KEY
echo $DEEPSEEK_API_KEY

# 2. 运行诊断脚本
tsx bin/validate-config.ts

# 3. 测试实际功能
ms search "测试查询"

# 4. 查看统计信息
ms stats
```

如果诊断脚本输出：

```
诊断全部通过，配置可用。
```

则说明配置正确，可以正常使用 mengshu 工具。

---

## 支持的服务商

| 服务商 | baseURL | API Key 前缀 | 模型示例 |
|-------|---------|-------------|---------|
| SiliconFlow | `https://api.siliconflow.cn/v1` | `sk-` | `BAAI/bge-m3` |
| DeepSeek | `https://api.deepseek.com/v1` | `sk-` | `deepseek-v4-flash` |
| OpenAI | `https://api.openai.com/v1` | `sk-` | `text-embedding-3-small` |
| 通义千问 | `https://dashscope.aliyuncs.com/api/v1` | `sk-` | `text-embedding-v3` |
| Ollama | `http://localhost:11434/v1` | 无需 | `nomic-embed-text` |

---

## 相关命令

```bash
# 初始化配置（交互式向导）
ms

# 查看统计信息
ms stats

# 搜索记忆
ms search "查询内容"

# 扫描目录
ms scan /path/to/docs

# 迁移旧配置到新目录
ms migrate-home

# 诊断配置问题
tsx bin/validate-config.ts
```

---

## 进一步帮助

如果仍然遇到问题，请：

1. 运行诊断脚本并保存输出：
   ```bash
   tsx bin/validate-config.ts > diagnostic.log 2>&1
   ```
2. 检查 mengshu 版本：
   ```bash
   ms --version
   ```
3. 查看详细日志（在项目 CLAUDE.md 中查找调试方法）
4. 提交 issue 并附上 diagnostic.log

---

**记住**：永远不要在公开的地方（如 GitHub issue、论坛）分享真实的 API key。分享日志前先用 `****` 替换敏感信息。
