import type { MarkdownSplitter, MarkdownSplitterContext, MarkdownSplitSegment } from "./markdown-splitter.js";

export interface StructuralMarkdownSplitterOptions {
  /** Character limit, deliberately not advertised as an exact token count. */
  readonly maxCharacters?: number;
}

/** Lossless local chunking. Prefers paragraph boundaries and retains exact offsets. */
export class StructuralMarkdownSplitter implements MarkdownSplitter {
  readonly name = "structural-markdown-v1";
  private readonly maxCharacters: number;

  constructor(options: StructuralMarkdownSplitterOptions = {}) {
    this.maxCharacters = options.maxCharacters ?? 6400;
    if (!Number.isSafeInteger(this.maxCharacters) || this.maxCharacters < 1) {
      throw new TypeError("maxCharacters must be a positive safe integer.");
    }
  }

  async split(markdown: string, _context: MarkdownSplitterContext): Promise<readonly MarkdownSplitSegment[]> {
    const segments: MarkdownSplitSegment[] = [];
    for (let start = 0; start < markdown.length;) {
      let end = Math.min(start + this.maxCharacters, markdown.length);
      if (end < markdown.length) {
        const paragraph = markdown.lastIndexOf("\n\n", end - 2);
        if (paragraph > start) end = paragraph + 2;
        // Never split a UTF-16 surrogate pair.
        if (end > start && /[\uD800-\uDBFF]/.test(markdown[end - 1]!) && /[\uDC00-\uDFFF]/.test(markdown[end]!)) end += end - start === 1 ? 1 : -1;
      }
      const text = markdown.slice(start, end);
      if (text.trim()) segments.push({ markdown: text, metadata: { startOffset: start, endOffset: end } });
      start = end;
    }
    return segments;
  }
}
