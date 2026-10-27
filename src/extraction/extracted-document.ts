import type {
  ContentHash,
} from "../hashing/content-hash.js";

import type {
  JsonValue,
} from "../domain/index.js";

import type {
  DocumentMetadata,
} from "./document-metadata.js";

export type TextualContentFormat =
  | "markdown"
  | "html"
  | "text";

export type ExtractedContentFormat =
  | TextualContentFormat
  | "structured";

export interface TextualExtractedDocument {
  content: string;

  contentFormat: TextualContentFormat;

  metadata: DocumentMetadata;

  /** SHA-256 of the extracted semantic content representation. */
  contentHash?:
    ContentHash;
}

export interface StructuredExtractedDocument {
  /**
   * Structured representation for formats such as JSON or CSV.
   *
   * The content remains JSON serializable and can later be converted into
   * canonical Markdown by the normalization layer.
   */
  content: JsonValue;

  contentFormat: "structured";

  metadata: DocumentMetadata;

  /** SHA-256 of canonical JSON for structured extracted content. */
  contentHash?:
    ContentHash;
}

export type ExtractedDocument =
  | TextualExtractedDocument
  | StructuredExtractedDocument;
