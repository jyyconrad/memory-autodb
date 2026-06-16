# 错误提示优化 - 实施总结

**日期**: 2026-06-15  
**版本**: 2026.3.9  
**状态**: ✅ 已完成

---

## 问题背景

### 原始问题
用户在配置 mengshu 时，当环境变量未设置时会遇到以下问题：

1. **通用错误信息**：`Environment variable X is not set`
2. **技术性 API 错误**：`403 status code (no body)` 或 `401 Invalid token`
3. **无法快速定位问题**：用户不知道如何修复配置

### 用户体验差距
- 错误信息不够明确
- 缺少可操作的解决方案
- 没有指向配置文档的链接

---

## 解决方案

### 1. 改进 `config.ts` 中的 `resolveEnvVars` 函数

#### 改进前
```typescript
function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}
```

#### 改进后
```typescript
/**
 * 解析配置中的环境变量占位符
 * @param value 配置值，如 "${OPENAI_API_KEY}"
 * @param fieldName 字段名，用于生成友好的错误信息
 * @returns 解析后的实际值
 * @throws 当环境变量未设置时抛出友好的配置错误
 */
function resolveEnvVars(value: string, fieldName?: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      const field = fieldName ? ` (${fieldName})` : "";
      const shellConfig = getShellConfigFile();
      throw new Error(
        `环境变量 ${envVar} 未设置${field}\n\n` +
        `请按以下步骤配置：\n` +
        `1. 编辑 Shell 配置文件：${shellConfig}\n` +
        `2. 添加环境变量：export ${envVar}="your-actual-value"\n` +
        `3. 重新加载配置：source ${shellConfig}\n` +
        `4. 或者在配置文件中直接填写实际值（不推荐用于敏感信息）\n\n` +
        `详细文档：https://github.com/openclaw/memory-autodb#configuration`
      );
    }
    return envValue;
  });
}

/**
 * 获取当前 Shell 的配置文件路径
 */
function getShellConfigFile(): string {
  const shell = process.env.SHELL || "";
  if (shell.includes("zsh")) {
    return "~/.zshrc";
  }
  if (shell.includes("bash")) {
    return "~/.bashrc 或 ~/.bash_profile";
  }
  return "~/.profile";
}
```

#### 关键改进
- ✅ 添加 `fieldName` 参数，明确指出是哪个配置字段出错
- ✅ 自动检测 Shell 类型，提供正确的配置文件路径
- ✅ 提供分步操作指南
- ✅ 提供文档链接

#### 使用示例
```typescript
// 所有调用都传入 fieldName
apiKey: resolveEnvVars(String(embedding.apiKey), "embedding.apiKey"),
baseURL: resolveEnvVars(String(embedding.baseURL), "embedding.baseURL"),
```

---

### 2. 在 `processing/embeddings.ts` 中添加配置验证

#### 新增 `validateConfig` 方法

```typescript
/**
 * 验证 embedding 配置
 * 提供友好的错误提示，帮助用户快速定位配置问题
 */
private validateConfig(config: MemoryConfig["embedding"]): void {
  // 检查 apiKey 是否为空或仅包含空格
  if (!config.apiKey || config.apiKey.trim().length === 0) {
    throw new Error(
      `embedding.apiKey 配置错误：API Key 为空\n\n` +
      `请按以下步骤配置：\n` +
      `1. 获取 API Key（如 OpenAI: https://platform.openai.com/api-keys）\n` +
      `2. 在配置文件中设置：\n` +
      `   方式 A（推荐）：使用环境变量 "apiKey": "\${OPENAI_API_KEY}"\n` +
      `   方式 B：直接填写实际值 "apiKey": "sk-proj-..."\n` +
      `3. 如使用环境变量，需在 Shell 配置文件中设置并重新加载\n\n` +
      `详细文档：https://github.com/openclaw/memory-autodb#configuration`
    );
  }

  // 检查是否仍是占位符格式（未解析的环境变量）
  if (config.apiKey.includes("${") || config.apiKey.includes("}")) {
    throw new Error(
      `embedding.apiKey 配置错误：环境变量未正确解析\n\n` +
      `当前值：${config.apiKey}\n\n` +
      `这通常意味着环境变量未设置。请检查：\n` +
      `1. 环境变量是否已在 Shell 配置文件中设置\n` +
      `2. 是否已重新加载配置（source ~/.zshrc 或重启终端）\n` +
      `3. 环境变量名是否拼写正确\n\n` +
      `详细文档：https://github.com/openclaw/memory-autodb#configuration`
    );
  }

  // 检查 baseURL 并验证 URL 格式
  // ... (完整代码见实现)
}
```

#### 构造函数调用
```typescript
constructor(
  private readonly embeddingConfig: MemoryConfig["embedding"],
  private readonly batchConfig?: MemoryConfig["batchProcessing"],
  options: EmbeddingsOptions = {},
) {
  // 验证配置（在创建 OpenAI 客户端之前）
  this.validateConfig(embeddingConfig);

  this.client = new OpenAI({
    apiKey: embeddingConfig.apiKey,
    baseURL: embeddingConfig.baseURL,
  });
  // ...
}
```

#### 验证内容
- ✅ apiKey 是否为空或仅包含空格
- ✅ apiKey 是否仍包含未解析的环境变量占位符
- ✅ baseURL 是否为空
- ✅ baseURL 是否仍包含未解析的环境变量占位符
- ✅ baseURL 是否为有效的 URL 格式（HTTP/HTTPS）

---

### 3. 在 `index.ts` 插件注册中添加早期验证和错误转换

#### 早期验证函数

```typescript
/**
 * 验证 embedding 配置完整性
 * 在初始化 Embeddings 实例前进行早期验证，提供友好的错误提示
 */
function validateEmbeddingConfig(config: { apiKey: string; baseURL?: string; model?: string }): void {
  if (!config.apiKey || config.apiKey.trim().length === 0) {
    throw new Error(
      `[Mengshu 配置错误] embedding.apiKey 未设置\n\n` +
      `请在 openclaw.plugin.json 中配置 Embedding API Key：\n` +
      `{\n` +
      `  "embedding": {\n` +
      `    "apiKey": "\${OPENAI_API_KEY}",  // 推荐：使用环境变量\n` +
      `    "baseURL": "https://api.openai.com/v1",\n` +
      `    "model": "text-embedding-3-small"\n` +
      `  }\n` +
      `}\n\n` +
      `如需帮助，运行：ms doctor\n` +
      `详细文档：https://github.com/openclaw/memory-autodb#configuration`
    );
  }

  if (config.apiKey.includes("${") || config.apiKey.includes("}")) {
    throw new Error(
      `[Mengshu 配置错误] 环境变量未正确解析\n\n` +
      `当前配置：embedding.apiKey = "${config.apiKey}"\n\n` +
      `这通常是因为环境变量未设置。请按以下步骤检查：\n` +
      `1. 检查 Shell 配置文件（~/.zshrc 或 ~/.bashrc）中是否已设置环境变量\n` +
      `2. 运行 'source ~/.zshrc' 重新加载配置（或重启终端）\n` +
      `3. 运行 'echo $OPENAI_API_KEY' 验证环境变量是否已生效\n` +
      `4. 或者直接在配置文件中填写实际 API Key（不推荐用于敏感信息）\n\n` +
      `如需帮助，运行：ms doctor\n` +
      `详细文档：https://github.com/openclaw/memory-autodb#configuration`
    );
  }
}
```

#### register 函数错误处理

```typescript
register(api: OpenClawPluginApi) {
  try {
    const cfg = memoryConfigSchema.parse(api.pluginConfig);

    // 早期验证：在初始化 Embeddings 前检查配置完整性
    validateEmbeddingConfig(cfg.embedding);

    const embeddings = new Embeddings(cfg.embedding, cfg.batchProcessing);
    // ... 其余初始化代码
  } catch (error) {
    // 捕获并转换技术性错误为用户友好的提示
    if (error instanceof Error) {
      // 如果错误已经包含友好提示，直接抛出
      if (error.message.includes("[Mengshu 配置错误]") || error.message.includes("环境变量")) {
        throw error;
      }

      // 转换常见的 API 错误
      if (error.message.includes("403") || error.message.includes("401")) {
        throw new Error(
          `[Mengshu 配置错误] API 认证失败（${error.message}）\n\n` +
          `这通常是因为：\n` +
          `1. API Key 无效或已过期\n` +
          `2. API Key 没有访问 Embedding API 的权限\n` +
          `3. 环境变量未正确设置\n\n` +
          `请检查配置：\n` +
          `- 确认 API Key 是否有效（可在提供商控制台验证）\n` +
          `- 确认 baseURL 是否正确（如 https://api.openai.com/v1）\n` +
          `- 运行 'ms doctor' 诊断配置问题\n\n` +
          `详细文档：https://github.com/openclaw/memory-autodb#configuration\n\n` +
          `原始错误：${error.message}`
        );
      }

      if (error.message.includes("ECONNREFUSED") || error.message.includes("ENOTFOUND")) {
        throw new Error(
          `[Mengshu 配置错误] 无法连接到 Embedding API（${error.message}）\n\n` +
          `这通常是因为：\n` +
          `1. baseURL 配置错误（请检查拼写和协议 http/https）\n` +
          `2. 网络连接问题（防火墙、代理设置）\n` +
          `3. API 服务不可用\n\n` +
          `请检查配置：\n` +
          `- 确认 baseURL 是否正确（如 https://api.openai.com/v1）\n` +
          `- 如使用本地服务（如 Ollama），确认服务是否已启动\n` +
          `- 运行 'ms doctor' 诊断连接问题\n\n` +
          `详细文档：https://github.com/openclaw/memory-autodb#configuration\n\n` +
          `原始错误：${error.message}`
        );
      }
    }

    // 未识别的错误，附加通用帮助信息
    throw new Error(
      `[Mengshu 初始化失败] ${error instanceof Error ? error.message : String(error)}\n\n` +
      `如需帮助：\n` +
      `- 运行 'ms doctor' 诊断问题\n` +
      `- 查看配置文档：https://github.com/openclaw/memory-autodb#configuration\n` +
      `- 查看故障排查：https://github.com/openclaw/memory-autodb/blob/main/docs/troubleshooting/`
    );
  }
},
```

#### 错误转换逻辑
- ✅ 识别并保留已优化的错误信息
- ✅ 转换 HTTP 401/403 错误为 API Key 配置问题
- ✅ 转换 ECONNREFUSED/ENOTFOUND 错误为连接配置问题
- ✅ 为未识别的错误添加通用帮助信息

---

## 测试验证

### 新增测试文件

#### 1. `config-validation.test.ts` - 配置解析测试
- 11 个测试用例
- 覆盖环境变量解析、配置缺失、Supabase/PostgreSQL 配置等场景

#### 2. `processing/embeddings-validation.test.ts` - Embeddings 验证测试
- 12 个测试用例
- 覆盖 apiKey/baseURL 验证、占位符检测、URL 格式验证等场景

### 测试结果
```
Test Files  1 failed | 67 passed (68)
Tests       3 failed | 529 passed | 1 skipped (533)
```

- ✅ **529 个测试通过**（新增 23 个验证测试）
- ❌ **3 个测试失败**（集成测试，Ollama 服务未运行，与改动无关）
- ✅ 所有单元测试通过
- ✅ TypeScript 编译无错误

---

## 错误提示对比

### 场景 1：环境变量未设置

**改进前**：
```
Error: Environment variable OPENAI_API_KEY is not set
```

**改进后**：
```
环境变量 OPENAI_API_KEY 未设置 (embedding.apiKey)

请按以下步骤配置：
1. 编辑 Shell 配置文件：~/.zshrc
2. 添加环境变量：export OPENAI_API_KEY="your-actual-value"
3. 重新加载配置：source ~/.zshrc
4. 或者在配置文件中直接填写实际值（不推荐用于敏感信息）

详细文档：https://github.com/openclaw/memory-autodb#configuration
```

### 场景 2：API Key 为空

**改进前**：
```
Error: 403 status code (no body)
```

**改进后**：
```
embedding.apiKey 配置错误：API Key 为空

请按以下步骤配置：
1. 获取 API Key（如 OpenAI: https://platform.openai.com/api-keys）
2. 在配置文件中设置：
   方式 A（推荐）：使用环境变量 "apiKey": "${OPENAI_API_KEY}"
   方式 B：直接填写实际值 "apiKey": "sk-proj-..."
3. 如使用环境变量，需在 Shell 配置文件中设置并重新加载

详细文档：https://github.com/openclaw/memory-autodb#configuration
```

### 场景 3：API 连接失败

**改进前**：
```
Error: 401 Invalid token
```

**改进后**：
```
[Mengshu 配置错误] API 认证失败（401 Invalid token）

这通常是因为：
1. API Key 无效或已过期
2. API Key 没有访问 Embedding API 的权限
3. 环境变量未正确设置

请检查配置：
- 确认 API Key 是否有效（可在提供商控制台验证）
- 确认 baseURL 是否正确（如 https://api.openai.com/v1）
- 运行 'ms doctor' 诊断配置问题

详细文档：https://github.com/openclaw/memory-autodb#configuration

原始错误：401 Invalid token
```

### 场景 4：无法连接 API

**改进前**：
```
Error: Connection error. ECONNREFUSED
```

**改进后**：
```
[Mengshu 配置错误] 无法连接到 Embedding API（ECONNREFUSED）

这通常是因为：
1. baseURL 配置错误（请检查拼写和协议 http/https）
2. 网络连接问题（防火墙、代理设置）
3. API 服务不可用

请检查配置：
- 确认 baseURL 是否正确（如 https://api.openai.com/v1）
- 如使用本地服务（如 Ollama），确认服务是否已启动
- 运行 'ms doctor' 诊断连接问题

详细文档：https://github.com/openclaw/memory-autodb#configuration

原始错误：ECONNREFUSED
```

---

## 关键改进点

### 1. 多层防护
- **配置解析层**：`resolveEnvVars` 检测环境变量问题
- **实例化层**：`Embeddings.validateConfig` 检测配置完整性
- **插件注册层**：早期验证 + 错误转换

### 2. 用户友好
- ✅ 使用中文错误信息
- ✅ 提供分步操作指南
- ✅ 自动检测 Shell 类型
- ✅ 提供文档链接
- ✅ 建议运行 `ms doctor` 诊断

### 3. 可操作性
- ✅ 明确指出哪个配置字段出错
- ✅ 显示当前配置值（帮助调试）
- ✅ 提供多种解决方案
- ✅ 区分开发环境和生产环境的配置方式

### 4. 类型安全
- ✅ 保持现有 TypeScript 类型
- ✅ 添加 JSDoc 注释
- ✅ 无类型错误

---

## 影响范围

### 修改的文件
1. ✅ `config.ts` - 改进 `resolveEnvVars` 函数
2. ✅ `processing/embeddings.ts` - 添加 `validateConfig` 方法
3. ✅ `index.ts` - 添加早期验证和错误转换

### 新增的文件
1. ✅ `config-validation.test.ts` - 配置验证测试
2. ✅ `processing/embeddings-validation.test.ts` - Embeddings 验证测试
3. ✅ `docs/troubleshooting/error-handling-improvement.md` - 本文档

### 不影响的部分
- ✅ 现有业务逻辑不变
- ✅ API 接口不变
- ✅ 数据库操作不变
- ✅ 向后兼容

---

## 后续建议

### 1. 文档更新
- [ ] 在 README.md 中添加"常见配置问题"章节
- [ ] 在 docs/troubleshooting/ 中添加更多故障排查案例
- [ ] 更新 `ms doctor` 命令的输出，包含更详细的诊断信息

### 2. 进一步优化
- [ ] 考虑在 `ms init` 向导中添加配置验证
- [ ] 考虑添加配置文件模板生成功能
- [ ] 考虑添加 `ms config validate` 命令

### 3. 用户教育
- [ ] 提供视频教程演示配置步骤
- [ ] 在官网添加 FAQ 章节
- [ ] 提供配置示例仓库

---

## 结论

✅ **任务完成**

本次改进显著提升了 mengshu 的用户体验：
- 错误提示从技术性转变为用户友好
- 提供可操作的解决方案
- 多层防护确保早期发现问题
- 完整的测试覆盖确保稳定性

用户现在能够快速定位并解决配置问题，无需查阅技术文档或寻求支持。
