/**
 * Parse a small, stable subset of YAML front matter used by mengshu docs.
 *
 * Supported values: strings, quoted strings, numbers, booleans, and simple
 * `- item` arrays. Unsupported or malformed lines are ignored.
 */

export interface ParsedFrontMatter {
  attributes: Record<string, unknown>;
  body: string;
}

export function parseFrontMatter(content: string): ParsedFrontMatter {
  if (!content.startsWith("---\n")) {
    return { attributes: {}, body: content };
  }
  const end = content.indexOf("\n---", 4);
  if (end === -1) {
    return { attributes: {}, body: content };
  }

  const raw = content.slice(4, end).split("\n");
  const attributes: Record<string, unknown> = {};
  for (let index = 0; index < raw.length; index += 1) {
    const line = raw[index];
    const match = /^([^:#]+):\s*(.*)$/.exec(line);
    if (!match) {
      continue;
    }

    const key = match[1].trim();
    const value = match[2].trim();
    if (value) {
      attributes[key] = parseScalar(value);
      continue;
    }

    const list: string[] = [];
    while (raw[index + 1]?.trim().startsWith("- ")) {
      index += 1;
      list.push(raw[index].trim().slice(2).trim());
    }
    attributes[key] = list;
  }

  return { attributes, body: content.slice(end + 4) };
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^["']|["']$/g, "");
}
