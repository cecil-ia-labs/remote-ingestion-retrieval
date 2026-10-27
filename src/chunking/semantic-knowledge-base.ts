import type { JsonValue } from "../domain/source.types.js";
import type { KnowledgeBaseFile } from "../knowledge/knowledge-base-vector-store.js";

/** Compatible with the MarkdownSplitter task consumed by inx-nlp. */
export interface SemanticKnowledgeFileAttributes {
  readonly organization: string;
  readonly language: string;
  readonly document_type: string;
  readonly domain: string;
  readonly audience: string;
  readonly kb_namespace: string;
  readonly source_file: string;
  readonly source_pages: string;
  readonly temporal_sensitivity: "low" | "medium" | "high";
  readonly review_required: boolean;
  readonly source_effective_date: string;
  readonly normalized_from: "pdf_text" | "pdf_mixed" | "pdf_scan" | "markdown" | "html";
  readonly normalized_on: string;
  readonly tags: string;
}

export interface NormalizedKnowledgeBase {
  readonly files: readonly { readonly filename: string; readonly markdown: string }[];
  readonly metadata: readonly { readonly filename: string; readonly attributes: SemanticKnowledgeFileAttributes }[];
}

const strings = ["organization", "language", "document_type", "domain", "audience", "kb_namespace", "source_file", "source_pages", "source_effective_date", "normalized_on", "tags"] as const;
const attributes = {
  ...Object.fromEntries(strings.map((key) => [key, { type: "string" }])),
  temporal_sensitivity: { type: "string", enum: ["low", "medium", "high"] },
  review_required: { type: "boolean" },
  normalized_from: { type: "string", enum: ["pdf_text", "pdf_mixed", "pdf_scan", "markdown", "html"] },
};

/** JSON schema suitable for structured-output executors, without a provider dependency. */
export const SEMANTIC_KNOWLEDGE_BASE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["files", "metadata"],
  properties: {
    files: { type: "array", items: { type: "object", additionalProperties: false, required: ["filename", "markdown"], properties: { filename: { type: "string" }, markdown: { type: "string" } } } },
    metadata: { type: "array", items: { type: "object", additionalProperties: false, required: ["filename", "attributes"], properties: { filename: { type: "string" }, attributes: { type: "object", additionalProperties: false, required: Object.keys(attributes), properties: attributes } } } },
  },
} as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate unknown model/task output before persisting or indexing anything. */
export function validateNormalizedKnowledgeBase(value: unknown): NormalizedKnowledgeBase {
  if (typeof value === "string") value = JSON.parse(value) as unknown;
  if (!record(value) || !Array.isArray(value.files) || !Array.isArray(value.metadata) || value.files.length < 1) {
    throw new TypeError("MarkdownSplitter must return nonempty files and a metadata manifest.");
  }
  const names = new Set<string>();
  const files = (value.files as unknown[]).map((file, index) => {
    if (!record(file) || typeof file.filename !== "string" || !/^\d{2,}_[a-z0-9]+(?:_[a-z0-9]+)*\.md$/.test(file.filename)
      || names.has(file.filename) || typeof file.markdown !== "string" || !file.markdown.trim()
      || /^\s*(?:---\s*\n|```)/.test(file.markdown)) {
      throw new TypeError("Invalid or duplicate semantic Markdown file (expected NN_semantic_domain.md, no front matter or outer fences).");
    }
    if (!file.filename.startsWith(`${String(index + 1).padStart(2, "0")}_`)) throw new TypeError("Semantic filenames must be ordered sequentially from 01.");
    names.add(file.filename);
    return { filename: file.filename, markdown: file.markdown };
  });
  const manifests = new Set<string>();
  const metadata = (value.metadata as unknown[]).map((entry) => {
    if (!record(entry) || typeof entry.filename !== "string" || !names.has(entry.filename) || manifests.has(entry.filename) || !record(entry.attributes)) {
      throw new TypeError("Metadata must have exactly one entry per generated filename.");
    }
    const a = entry.attributes;
    for (const key of strings) if (typeof a[key] !== "string" || !(a[key] as string).trim()) throw new TypeError(`Invalid semantic attribute: ${key}.`);
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(String(a.domain))
      || !["low", "medium", "high"].includes(String(a.temporal_sensitivity))
      || typeof a.review_required !== "boolean"
      || !/^[a-z0-9]+(?:_[a-z0-9]+)*(?:,[a-z0-9]+(?:_[a-z0-9]+)*)*$/.test(String(a.tags))
      || !["pdf_text", "pdf_mixed", "pdf_scan", "markdown", "html"].includes(String(a.normalized_from))) {
      throw new TypeError("Invalid semantic classification attributes.");
    }
    manifests.add(entry.filename);
    // Select validated keys, discarding neither required metadata nor introducing unknown values.
    const normalized = Object.fromEntries(Object.keys(attributes).map((key) => [key, a[key]])) as unknown as SemanticKnowledgeFileAttributes;
    return { filename: entry.filename, attributes: normalized };
  });
  if (names.size !== manifests.size) throw new TypeError("Missing semantic file metadata.");
  return { files, metadata };
}

export function semanticKnowledgeBaseFiles(base: NormalizedKnowledgeBase): readonly KnowledgeBaseFile[] {
  const validated = validateNormalizedKnowledgeBase(base);
  const manifest = new Map(validated.metadata.map((entry) => [entry.filename, entry.attributes]));
  return validated.files.map((file) => ({ ...file, metadata: { ...manifest.get(file.filename)! } as Readonly<Record<string, JsonValue>> }));
}
