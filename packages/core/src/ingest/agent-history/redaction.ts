/**
 * secret redaction —— 历史日志写入前的密钥脱敏（方案 §11.3-11.4）。
 *
 * 本文件做什么：在任何历史文本进入 chunk / embedding / LLM 之前，把 API key、
 * token、私钥、env 形式的密钥赋值、Bearer 授权头等替换为 `[REDACTED:<category>]`
 * 占位符，避免敏感凭据被写入长期记忆或发往远端 provider。
 *
 * 与 lifecycle/sensitive-filter.ts 的分工：
 * - sensitive-filter 拦截"个人敏感属性"（人格/健康/政治/宗教/性取向），命中即丢弃整段。
 * - 本文件处理"机器凭据/密钥"，命中只替换片段、保留其余文本，因为日志仍有工作价值。
 *
 * 关键边界：
 * - 设计取向：宁可漏脱敏一些低风险值，也尽量不误伤普通工作文本和常见枚举（NODE_ENV 等）。
 *   因此 env 赋值只在 key 名含 secret/token/key/password 等强信号、且值足够长时才脱敏。
 * - 纯函数、无 I/O、无第三方依赖，确保 adapter 热路径可高频调用。
 */

/** 脱敏命中的类别。完整 15 类覆盖（评估计划 §数据治理/脱敏规则）。 */
export type RedactionCategory =
  | "api_key"
  | "token"
  | "jwt"
  | "private_key"
  | "auth_header"
  | "env_secret"
  | "email"
  | "matrix_user"
  | "matrix_room"
  | "ip_v4"
  | "ip_v6"
  | "phone"
  | "home_path"
  | "git_remote"
  | "ssh_fp";

export interface RedactionReplacement {
  /** 原始文本中的起始偏移（0-based）。 */
  start: number;
  /** 原始文本中的结束偏移（不含）。 */
  end: number;
  /** 原始片段长度。 */
  originalLength: number;
  /** 替换后片段长度。 */
  replacementLength: number;
  /** 脱敏类别。 */
  category: RedactionCategory;
}

export interface RedactionResult {
  /** 脱敏后的文本。 */
  text: string;
  /** 命中并替换的片段总数。 */
  redactedCount: number;
  /** 命中的类别（去重，保持首次出现顺序）。 */
  categories: RedactionCategory[];
  /** 替换记录，用于偏移回算（评估计划 §Evidence span 偏移基准）。 */
  replacements: RedactionReplacement[];
}

/**
 * 脱敏规则版本（语义化，2026.MM.DD-N 格式）。
 * 任何新增/删除/修改 PII 类正则即 minor 版本号 +1。
 * fixture 入仓后 version-frozen，不得重跑替换（评估计划 §脱敏版本治理）。
 */
export const REDACTION_MAP_VERSION = "2026.06.19-2";

interface RedactionRule {
  category: RedactionCategory;
  pattern: RegExp;
  /**
   * 替换函数：返回脱敏后的字符串。默认整段替换为占位符；
   * 对 env / auth_header 这类"前缀=值"结构，只替换值部分以保留可读性。
   */
  replace?: (match: string, ...groups: string[]) => string;
}

const PLACEHOLDER = (category: RedactionCategory): string => {
  // 评估计划 §脱敏规则：密钥类用 [REDACTED:xxx]，PII 类用 <XXX_REDACTED>
  switch (category) {
    case "email":
      return "<EMAIL_REDACTED>";
    case "matrix_user":
      return "<MATRIX_USER_REDACTED>";
    case "matrix_room":
      return "<MATRIX_ROOM_REDACTED>";
    case "ip_v4":
    case "ip_v6":
      return "<IP_REDACTED>";
    case "phone":
      return "<PHONE_REDACTED>";
    case "git_remote":
      return "<GIT_REMOTE_REDACTED>";
    case "ssh_fp":
      return "<SSH_FP_REDACTED>";
    case "home_path":
      return "<USER_HOME>"; // 内联替换用户名段
    default:
      // 密钥类（api_key/token/jwt/private_key/auth_header/env_secret）
      return `[REDACTED:${category}]`;
  }
};

/**
 * 规则顺序很重要：私钥块、授权头等"结构化强信号"优先于宽泛的 token 规则，
 * 避免被后者切碎。所有 pattern 使用全局标志以统计多次命中。
 *
 * 评估计划 §数据治理/脱敏规则 要求 15 类覆盖。
 */
const RULES: ReadonlyArray<RedactionRule> = [
  // PEM 私钥块（含 RSA/EC/OPENSSH/PGP 等）。
  {
    category: "private_key",
    pattern: /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g,
  },
  // Authorization: Bearer <token> 或 Cookie: ... 请求头（只替换值部分）。
  {
    category: "auth_header",
    pattern: /((?:Authorization:\s*Bearer|Cookie:)\s+)([A-Za-z0-9._\-]{16,})/gi,
    replace: (_m, prefix) => `${prefix}${PLACEHOLDER("auth_header")}`,
  },
  // JWT（独立规则，优先于宽泛 token）：裸 JWT 不依赖 Authorization 前缀。
  {
    category: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  },
  // OpenAI / Anthropic 风格 key：sk-... / sk-ant-...
  {
    category: "api_key",
    pattern: /\bsk-(?:ant-)?[A-Za-z0-9_\-]{20,}\b/g,
  },
  // GitHub token：ghp_/gho_/ghu_/ghs_/ghr_ + 36 位（早期固定 36，新版可能更长）。
  {
    category: "token",
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  },
  // Slack token：xox[baprs]-...
  {
    category: "token",
    pattern: /\bxox[baprs]-[A-Za-z0-9\-]{10,}\b/g,
  },
  // AWS Access Key Id：AKIA + 16 位大写字母数字。
  {
    category: "token",
    pattern: /\bAKIA[0-9A-Z]{16}\b/g,
  },
  // SSH key fingerprint：SHA256:base64 或 MD5:hex。
  {
    category: "ssh_fp",
    pattern: /\b(?:SHA256:[A-Za-z0-9+/]{43}=?|MD5:([0-9a-f]{2}:){15}[0-9a-f]{2})\b/gi,
  },
  // Git remote：git@host:org/repo.git 或 https://host/org/repo（保留协议+主机，脱敏组织/仓库）。
  {
    category: "git_remote",
    pattern: /\b(?:git@|https?:\/\/)[\w.-]+[:/][\w-]+\/[\w.-]+(?:\.git)?\b/g,
  },
  // 用户主目录路径：/Users/<username> 或 /home/<username>（只脱敏用户名段，保留路径结构）。
  {
    category: "home_path",
    pattern: /(\/(?:Users|home)\/)([^\/\s]+)(\/[^\s]*)?/g,
    replace: (_m, prefix, _username, suffix = "") => `${prefix}<USER_HOME>${suffix}`,
  },
  // Matrix MXID user：@user:server.org。
  {
    category: "matrix_user",
    pattern: /\B@[a-z0-9._=-]+:[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  },
  // Matrix room ID 或 alias：!roomid:server.org 或 #alias:server.org。
  {
    category: "matrix_room",
    pattern: /\B[!#][a-z0-9._=-]+:[a-z0-9.-]+\.[a-z]{2,}\b/gi,
  },
  // Email：RFC 5322 简化（[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}）。
  {
    category: "email",
    pattern: /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g,
    replace: () => "<EMAIL_REDACTED>",
  },
  // 电话号码：仅匹配中国 11 位手机号（1[3-9]\d{9}），且前后须为空白或行首/尾。
  // 设计取向（R4 P0-1 修复）：删除宽松的美国/E.164 格式，避免误伤 token 数（1000000）、
  // UUID 段（0033-4652-8e7e）等普通数字。用边界约束 + lookahead 杜绝词内/连号串误命中。
  {
    category: "phone",
    pattern: /(^|[\s])(1[3-9]\d{9})(?=[\s]|$)/g,
    replace: (_m, prefix) => `${prefix}<PHONE_REDACTED>`,
  },
  // IPv4：点分十进制（排除私网 10.0.0.0/8 / 172.16.0.0/12 / 192.168.0.0/16 / 127.0.0.0/8 / 169.254.0.0/16）。
  {
    category: "ip_v4",
    pattern: /\b(?!(?:10|127|169\.254|172\.(?:1[6-9]|2\d|3[01])|192\.168)\.)(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\b/g,
    replace: () => "<IP_REDACTED>",
  },
  // IPv6：完整或压缩格式（排除 ::1 / fe80:: 链路本地）。
  {
    category: "ip_v6",
    pattern: /\b(?!(?:::1|fe80::))[0-9a-f]{0,4}:(?:[0-9a-f]{0,4}:){1,6}[0-9a-f]{0,4}\b/gi,
    replace: () => "<IP_REDACTED>",
  },
  // env / 配置赋值：仅当 key 名含强密钥信号且值足够长时脱敏（避免误伤 NODE_ENV=production）。
  {
    category: "env_secret",
    pattern:
      /\b([A-Z0-9_]*(?:SECRET|TOKEN|API[_]?KEY|PASSWORD|PASSWD|PRIVATE[_]?KEY|ACCESS[_]?KEY|CLIENT[_]?SECRET)[A-Z0-9_]*)\s*[=:]\s*["']?([^\s"']{8,})["']?/gi,
    replace: (_m, key) => `${key}=${PLACEHOLDER("env_secret")}`,
  },
];

/**
 * 对路径字段应用 home_path 单点脱敏（评估计划 §脱敏规则）。
 * `/Users/<username>/...` 或 `/home/<username>/...` 中的用户名段替换为 `<USER_HOME>`。
 *
 * 此函数仅用于 cwd / workdir / sourcePath 这类**纯路径字段**；正文 redaction 走 redactSecrets。
 * 单一事实来源：home_path 正则与 RULES 中保持一致。
 */
export function redactHomePath(path: string): string;
export function redactHomePath(path: undefined): undefined;
export function redactHomePath(path: string | undefined): string | undefined;
export function redactHomePath(path: string | undefined): string | undefined {
  if (!path) return path;
  return path.replace(
    /(\/(?:Users|home)\/)([^/\s]+)(\/[^\s]*)?/g,
    (_m, prefix, _username, suffix = "") => `${prefix}<USER_HOME>${suffix}`,
  );
}

/**
 * 对文本做 secret 脱敏。
 * 多条规则依次套用；每条规则的全局匹配次数累加进 redactedCount。
 * 追踪 replacements 数组用于偏移回算（评估计划 §Evidence span 偏移基准）。
 */
export function redactSecrets(input: string): RedactionResult {
  if (!input) {
    return { text: "", redactedCount: 0, categories: [], replacements: [] };
  }

  let text = input;
  let redactedCount = 0;
  const categories: RedactionCategory[] = [];
  const replacements: RedactionReplacement[] = [];
  let offsetAdjustment = 0; // 累积偏移调整量

  for (const rule of RULES) {
    // 先收集所有匹配位置（在当前 text 上重新匹配）
    const counter = new RegExp(rule.pattern.source, rule.pattern.flags);
    const matches: Array<{ match: string; index: number; groups: string[] }> = [];
    let match: RegExpExecArray | null;
    while ((match = counter.exec(text)) !== null) {
      matches.push({
        match: match[0],
        index: match.index,
        groups: match.slice(1),
      });
    }
    if (matches.length === 0) {
      continue;
    }

    redactedCount += matches.length;
    if (!categories.includes(rule.category)) {
      categories.push(rule.category);
    }

    const replacer = rule.replace;
    const placeholder = PLACEHOLDER(rule.category);

    // 从后往前替换，避免前面替换影响后面的 index
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      const originalText = m.match;
      const originalStart = m.index;
      const originalEnd = originalStart + originalText.length;

      const replacementText = replacer
        ? replacer(originalText, ...m.groups)
        : placeholder;

      text = text.slice(0, originalStart) + replacementText + text.slice(originalEnd);

      // 记录 replacement（在原始输入的坐标系，需回退 offsetAdjustment）
      const originalStartInInput = originalStart + offsetAdjustment;
      const originalEndInInput = originalEnd + offsetAdjustment;
      replacements.push({
        start: originalStartInInput,
        end: originalEndInInput,
        originalLength: originalText.length,
        replacementLength: replacementText.length,
        category: rule.category,
      });

      // 更新累积偏移调整量
      offsetAdjustment += originalText.length - replacementText.length;
    }
  }

  // 按 start 升序排序 replacements（方便下游处理）
  replacements.sort((a, b) => a.start - b.start);

  return { text, redactedCount, categories, replacements };
}
