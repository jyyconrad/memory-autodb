export interface TextSplitOptions {
  /** 每个分片的最大字符数 */
  chunkSize?: number;
  /** 分片之间的重叠字符数 */
  chunkOverlap?: number;
  /** 分隔符优先级，默认按Markdown分隔符 */
  separators?: string[];
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_SEPARATORS = [
  "\n## ", // Markdown 二级标题
  "\n### ", // Markdown 三级标题
  "\n#### ", // Markdown 四级标题
  "\n##### ", // Markdown 五级标题
  "\n###### ", // Markdown 六级标题
  "\n\n", // 段落
  "\n", // 换行
  ". ", // 句子
  "! ",
  "? ",
  " ", // 空格
  "", // 字符
];

/**
 * 智能文本切片器
 * 按 Markdown 结构递归切分文本，避免为一个小功能引入重量级运行时依赖。
 */
export class TextSplitter {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;
  private readonly separators: string[];

  constructor(options: TextSplitOptions = {}) {
    this.chunkSize = normalizePositiveInt(options.chunkSize, DEFAULT_CHUNK_SIZE);
    this.chunkOverlap = Math.min(
      normalizeNonNegativeInt(options.chunkOverlap, DEFAULT_CHUNK_OVERLAP),
      Math.max(0, this.chunkSize - 1),
    );
    this.separators = options.separators ?? DEFAULT_SEPARATORS;
  }

  /**
   * 切分单个文本
   * @param text 要切分的文本
   * @returns 切分后的文本片段数组
   */
  async splitText(text: string): Promise<string[]> {
    return splitRecursively(text, this.separators, this.chunkSize, this.chunkOverlap)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);
  }

  /**
   * 批量切分文本
   * @param texts 文本数组
   * @returns 切分后的所有文本片段
   */
  async splitTexts(texts: string[]): Promise<string[]> {
    const results = await Promise.all(texts.map(text => this.splitText(text)));
    return results.flat();
  }
}

function normalizePositiveInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.floor(value);
}

function normalizeNonNegativeInt(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return Math.floor(value);
}

function splitRecursively(
  text: string,
  separators: string[],
  chunkSize: number,
  chunkOverlap: number,
): string[] {
  if (text.length <= chunkSize) {
    return [text];
  }

  const [separator, ...rest] = separators;
  if (separator === undefined) {
    return splitByLength(text, chunkSize, chunkOverlap);
  }

  if (separator === "") {
    return splitByLength(text, chunkSize, chunkOverlap);
  }

  const pieces = splitKeepingSeparator(text, separator)
    .flatMap((piece) =>
      piece.length > chunkSize
        ? splitRecursively(piece, rest, chunkSize, chunkOverlap)
        : [piece],
    );

  return mergePieces(pieces, chunkSize, chunkOverlap);
}

function splitKeepingSeparator(text: string, separator: string): string[] {
  const raw = text.split(separator);
  if (raw.length === 1) {
    return [text];
  }

  const pieces: string[] = [];
  const separatorBelongsToNext = separator.startsWith("\n");

  for (let index = 0; index < raw.length; index += 1) {
    const part = raw[index];
    if (part === "" && index === 0) {
      continue;
    }

    if (separatorBelongsToNext) {
      pieces.push(index === 0 ? part : `${separator}${part}`);
    } else if (index < raw.length - 1) {
      pieces.push(`${part}${separator}`);
    } else {
      pieces.push(part);
    }
  }

  return pieces.filter((piece) => piece.length > 0);
}

function mergePieces(pieces: string[], chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const piece of pieces) {
    if (piece.length > chunkSize) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...splitByLength(piece, chunkSize, chunkOverlap));
      continue;
    }

    if (!current) {
      current = piece;
      continue;
    }

    if (current.length + piece.length <= chunkSize) {
      current += piece;
      continue;
    }

    chunks.push(current);
    const overlap = takeOverlap(current, chunkOverlap);
    current = overlap.length + piece.length <= chunkSize ? `${overlap}${piece}` : piece;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitByLength(text: string, chunkSize: number, chunkOverlap: number): string[] {
  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - chunkOverlap);

  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + chunkSize));
  }

  return chunks;
}

function takeOverlap(text: string, chunkOverlap: number): string {
  if (chunkOverlap <= 0) {
    return "";
  }
  return text.slice(Math.max(0, text.length - chunkOverlap));
}
