import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { MarkdownSplitter } from "../chunking/markdown-splitter.js";
import { StructuralMarkdownSplitter } from "../chunking/structural-markdown-splitter.js";
import type { KnowledgeBaseFile } from "./knowledge-base-vector-store.js";

export async function loadKnowledgeBaseMarkdownSplitter(options: { readonly modulePath?: string; readonly maxCharacters?: number } = {}): Promise<MarkdownSplitter> {
  if (!options.modulePath) return new StructuralMarkdownSplitter({ maxCharacters: options.maxCharacters ?? 6400 });
  const module: unknown = await import(pathToFileURL(resolve(options.modulePath)).href);
  if (typeof module !== "object" || module === null) throw new TypeError("Invalid MarkdownSplitter module.");
  const exports = module as Record<string, unknown>;
  const created: unknown = typeof exports.createMarkdownSplitter === "function" ? await exports.createMarkdownSplitter() : exports.markdownSplitter;
  if (typeof created !== "object" || created === null || !("name" in created) || typeof created.name !== "string" || !("split" in created) || typeof created.split !== "function") {
    throw new TypeError("Splitter module must export markdownSplitter or createMarkdownSplitter() implementing name and split().");
  }
  return created as MarkdownSplitter;
}

export interface SplitKnowledgeBaseFilesOptions {
  readonly splitter: MarkdownSplitter;
  readonly namespace: string;
  /** Limit on generated files, independent of the source-document limit. */
  readonly maxFiles?: number;
  readonly maxBytes?: number;
  readonly maxInputCharacters?: number;
  readonly fallbackSourceUrl?: string;
  readonly signal?: AbortSignal;
}

export async function splitKnowledgeBaseFiles(inputs: readonly KnowledgeBaseFile[], options: SplitKnowledgeBaseFilesOptions): Promise<readonly KnowledgeBaseFile[]> {
  const maxFiles = options.maxFiles ?? 10_000;
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024;
  const maxInput = options.maxInputCharacters ?? 3_000_000;
  for (const [name, value] of Object.entries({ maxFiles, maxBytes, maxInput })) if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${name} must be a positive safe integer.`);
  if (inputs.reduce((total, file) => total + file.markdown.length, 0) > maxInput) throw new RangeError("Splitter input exceeds AUTO_SPLITTER_MAX_INPUT_CHARACTERS.");
  const files: KnowledgeBaseFile[] = [];
  let bytes = 0;
  for (const file of inputs) {
    options.signal?.throwIfAborted();
    const canonicalUrl = String(file.metadata.canonical_url ?? file.metadata.source_url ?? options.fallbackSourceUrl ?? "");
    const segments = await options.splitter.split(file.markdown, {
      sourceId: String(file.metadata.source_id ?? options.namespace),
      documentId: String(file.metadata.document_id ?? file.filename), canonicalUrl,
      title: typeof file.metadata.title === "string" ? file.metadata.title : undefined,
      documentContentHash: String(file.metadata.content_hash ?? ""), signal: options.signal,
    });
    if (!segments.length) throw new Error(`Splitter produced no files for ${file.filename}.`);
    for (const [ordinal, segment] of segments.entries()) {
      if (!segment.markdown.trim()) throw new Error(`Splitter produced empty Markdown for ${file.filename}.`);
      bytes += Buffer.byteLength(segment.markdown, "utf8");
      if (files.length >= maxFiles) throw new RangeError(`Split file limit exceeded: at least ${files.length + 1} files from ${inputs.length} documents; AUTO_MAX_SPLIT_FILES=${maxFiles}. Source documents remain saved.`);
      if (bytes > maxBytes) throw new RangeError(`Split byte limit exceeded: ${bytes} bytes; AUTO_MAX_KB_BYTES=${maxBytes}. Source documents remain saved.`);
      files.push({
        filename: `${file.filename.replace(/\.md$/i, "")}--${String(ordinal + 1).padStart(4, "0")}.md`, markdown: segment.markdown,
        metadata: {
          ...file.metadata, ...segment.metadata?.attributes,
          source_id: file.metadata.source_id ?? options.namespace,
          document_id: file.metadata.document_id ?? file.filename, canonical_url: canonicalUrl,
          content_hash: createHash("sha256").update(segment.markdown).digest("hex"),
          parent_content_hash: file.metadata.content_hash ?? null,
          splitter: options.splitter.name, parent_filename: file.filename,
        },
      });
    }
  }
  return files;
}
