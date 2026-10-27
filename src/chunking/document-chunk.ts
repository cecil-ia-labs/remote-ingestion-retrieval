import type {
  ContentHash,
} from "../hashing/content-hash.js";

import type {
  SourceId,
} from "../domain/source.types.js";

import type {
  WebDocumentId,
} from "../website/web-document.js";

import type {
  DocumentChunkMetadata,
} from "./document-chunk-metadata.js";

export type DocumentChunkId =
  string;

export interface DocumentChunk {
  readonly id:
    DocumentChunkId;

  readonly sourceId:
    SourceId;

  readonly documentId:
    WebDocumentId;

  readonly ordinal:
    number;

  readonly markdown:
    string;

  readonly contentHash:
    string;

  /** Structured descriptor for the canonical chunk Markdown hash. */
  readonly hash?:
    ContentHash;

  readonly byteLength:
    number;

  readonly characterLength:
    number;

  /**
   * Canonical JSON-safe metadata assembled from the parent WebDocument,
   * source location and optional metadata emitted by the host splitter.
   */
  readonly metadata:
    DocumentChunkMetadata;
}

export interface WebDocumentChunkingStats {
  splitterSegments:
    number;

  emittedChunks:
    number;

  emptySegmentsDropped:
    number;

  sourceRangesResolved:
    number;

  sourceRangesUnresolved:
    number;
}

export interface WebDocumentChunkingResult {
  readonly sourceId:
    SourceId;

  readonly documentId:
    WebDocumentId;

  readonly canonicalUrl:
    string;

  readonly documentContentHash:
    string;

  readonly splitterName:
    string;

  readonly chunks:
    readonly DocumentChunk[];

  readonly stats:
    WebDocumentChunkingStats;
}
