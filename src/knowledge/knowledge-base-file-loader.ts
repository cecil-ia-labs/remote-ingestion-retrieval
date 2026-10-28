import { open } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { KnowledgeBaseFile, KnowledgeBaseFileMetadata } from "./knowledge-base-vector-store.js";

export interface LocalKnowledgeBaseFile {
  readonly path: string;
  readonly filename?: string;
  readonly metadata?: KnowledgeBaseFileMetadata;
}

export interface KnowledgeBaseFileLoadOptions {
  readonly maxFiles?: number;
  readonly maxFileBytes?: number;
  readonly maxTotalBytes?: number;
  readonly signal?: AbortSignal;
}

function positive(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive safe integer.`);
  return value;
}

/** Read bounded UTF-8 Markdown/text files. Binary document conversion belongs to acquisition. */
export async function loadKnowledgeBaseFiles(
  inputs: readonly LocalKnowledgeBaseFile[],
  options: KnowledgeBaseFileLoadOptions = {},
): Promise<readonly KnowledgeBaseFile[]> {
  const maxFiles = positive(options.maxFiles ?? 100, "maxFiles");
  const maxFileBytes = positive(options.maxFileBytes ?? 5 * 1024 * 1024, "maxFileBytes");
  const maxTotalBytes = positive(options.maxTotalBytes ?? 50 * 1024 * 1024, "maxTotalBytes");
  if (!inputs.length || inputs.length > maxFiles) throw new RangeError("Local knowledge files must be nonempty and within maxFiles.");
  const files: KnowledgeBaseFile[] = [];
  const names = new Set<string>();
  let totalBytes = 0;
  for (const input of inputs) {
    options.signal?.throwIfAborted();
    const filename = input.filename ?? basename(input.path);
    if (!filename || filename === "." || filename === ".." || /[/\\\0]/.test(filename) || names.has(filename)) {
      throw new TypeError("Local knowledge filenames must be safe and unique.");
    }
    if (![".md", ".markdown", ".txt"].includes(extname(input.path).toLowerCase())) {
      throw new TypeError("Local upload accepts UTF-8 .md, .markdown and .txt files only.");
    }
    names.add(filename);
    const handle = await open(input.path, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > maxFileBytes || totalBytes + stat.size > maxTotalBytes) {
        throw new RangeError("Local knowledge file exceeds byte limits or is not a regular file.");
      }
      const parts: Buffer[] = [];
      let byteLength = 0;
      for (;;) {
        options.signal?.throwIfAborted();
        const buffer = Buffer.alloc(Math.min(64 * 1024, maxFileBytes - byteLength + 1, maxTotalBytes - totalBytes - byteLength + 1));
        const { bytesRead } = await handle.read(buffer);
        if (bytesRead === 0) break;
        byteLength += bytesRead;
        if (byteLength > maxFileBytes || totalBytes + byteLength > maxTotalBytes) throw new RangeError("Local knowledge file grew beyond byte limits.");
        parts.push(buffer.subarray(0, bytesRead));
      }
      const markdown = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
      if (!markdown.trim() || markdown.includes("\0")) throw new TypeError("Local knowledge file is empty or contains binary content.");
      totalBytes += byteLength;
      files.push({ filename, markdown, metadata: { ...input.metadata } });
    } finally {
      await handle.close();
    }
  }
  return files;
}
