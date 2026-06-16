# 故障排除指南

本目录包含 mengshu 常见问题的诊断和解决方案。

## 可用指南

### [环境变量配置指南](./env-setup.md)

**适用场景**：
- `401 Invalid token` 错误
- `环境变量 XXX 未设置` 错误
- API 连接失败
- `${VAR}` 占位符未解析

**内容**：
- 环境变量配置方法（Shell 配置文件、.env 文件）
- 自动诊断脚本使用
- 常见错误及解决方案
- 支持的 API 服务商列表

**快速诊断**：
```bash
tsx bin/validate-config.ts
```

---

## 通用调试流程

1. **运行诊断脚本**
   ```bash
   tsx bin/validate-config.ts
   ```

2. **检查基础配置**
   ```bash
   # 查看配置文件位置
   echo ~/.mengshu/config.json
   
   # 查看环境变量
   echo $SILICONFLOW_API_KEY
   echo $DEEPSEEK_API_KEY
   ```

3. **测试基础功能**
   ```bash
   ms stats           # 查看统计信息
   ms search "测试"   # 测试搜索功能
   ```

4. **查看详细日志**
   - 在命令前添加 `DEBUG=*` 环境变量（如适用）
   - 检查 `~/.mengshu/` 目录权限

---

## 常见问题速查

| 错误信息 | 可能原因 | 解决方案 |
|---------|---------|---------|
| `环境变量 XXX 未设置` | Shell 配置未加载 | 运行 `source ~/.zshrc` |
| `401 Invalid token` | API key 无效或过期 | 检查 API key 是否正确 |
| `403 Forbidden` | API key 与 baseURL 不匹配 | 确认服务商与配置对应 |
| `404 Not Found` | baseURL 或 model 名称错误 | 检查 baseURL 是否包含 `/v1` |
| `ECONNREFUSED` | 服务不可达 | 检查网络连接或 baseURL |
| `配置文件不存在` | 未初始化 | 运行 `ms` 或 `ms init` |

---

## 获取帮助

如果问题未解决：

1. 收集诊断信息：
   ```bash
   tsx bin/validate-config.ts > diagnostic.log 2>&1
   ms stats >> diagnostic.log 2>&1
   ```

2. 记录以下信息：
   - mengshu 版本：`ms --version`
   - 操作系统：`uname -a`（Linux/macOS）
   - Shell：`echo $SHELL`
   - 配置文件位置：`echo ~/.mengshu/config.json`

3. 提交 issue 时附上 diagnostic.log（**移除真实 API key**）

---

**安全提示**：分享日志或配置文件前，务必移除所有真实的 API key。
