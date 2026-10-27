import type {
  JsonValue,
  RemoteResourceType,
  SourceId,
} from "../domain/source.types.js";

import type {
  RemoteResourceNetworkSafety,
  RemoteResourceTransport,
} from "../remote/remote-resource.js";

import type {
  WebDocumentId,
} from "../website/web-document.js";

export const DOCUMENT_CHUNK_METADATA_SCHEMA_VERSION =
  1 as const;

export interface DocumentChunkSourceRange {
  /**
   * True only when the exact chunk Markdown was found in the source
   * WebDocument Markdown or explicit splitter offsets were supplied.
   */
  readonly resolved:
    boolean;

  /**
   * Zero-based UTF-16 offsets using JavaScript string indexing semantics.
   * endOffset is exclusive.
   */
  readonly startOffset?:
    number;

  readonly endOffset?:
    number;

  /**
   * One-based inclusive source line numbers.
   */
  readonly startLine?:
    number;

  readonly endLine?:
    number;
}

export interface DocumentChunkDocumentMetadata {
  readonly id:
    WebDocumentId;

  readonly sourceId:
    SourceId;

  readonly url:
    string;

  readonly canonicalUrl:
    string;

  readonly title?:
    string;

  readonly description?:
    string;

  readonly language?:
    string;

  readonly resourceType:
    RemoteResourceType;

  readonly contentType?:
    string;

  readonly contentHash:
    string;

  readonly processedAt:
    string;

  readonly etag?:
    string;

  readonly lastModified?:
    string;

  readonly attributes?:
    Readonly<Record<string, JsonValue>>;
}

export interface DocumentChunkDiscoveryMetadata {
  readonly method:
    "root"
    | "robots"
    | "sitemap"
    | "crawl";

  readonly url:
    string;

  readonly originalUrl?:
    string;

  readonly sitemapUrl?:
    string;

  readonly discoveredFrom?:
    string;

  readonly depth?:
    number;

  readonly anchorText?:
    string;

  readonly lastModified?:
    string;

  readonly changeFrequency?:
    string;

  readonly priority?:
    number;
}

export interface DocumentChunkAcquisitionMetadata {
  readonly requestedUrl:
    string;

  readonly resolvedUrl:
    string;

  readonly statusCode?:
    number;

  readonly contentType?:
    string;

  readonly fetchedByteLength:
    number;

  readonly etag?:
    string;

  readonly lastModified?:
    string;

  readonly fetchedAt:
    string;

  readonly extractedAt:
    string;

  readonly transport?:
    RemoteResourceTransport;

  readonly networkSafety?:
    RemoteResourceNetworkSafety;
}

export interface DocumentChunkPositionMetadata {
  readonly ordinal:
    number;

  readonly total:
    number;

  readonly contentHash:
    string;

  readonly byteLength:
    number;

  readonly characterLength:
    number;

  readonly lineCount:
    number;

  readonly nonEmptyLineCount:
    number;

  /**
   * Heading hierarchy active at the chunk start. Values contain heading text
   * only; levels are exposed separately so vector-store consumers may choose
   * either representation.
   */
  readonly headingPath:
    readonly string[];

  readonly headingLevels:
    readonly number[];

  readonly sourceRange:
    DocumentChunkSourceRange;
}

export interface DocumentChunkSplitterMetadata {
  readonly name:
    string;

  /**
   * Optional metadata returned by the host application's existing splitter.
   */
  readonly attributes?:
    Readonly<Record<string, JsonValue>>;
}

/**
 * JSON-safe metadata attached to every DocumentChunk.
 *
 * Dates are represented as ISO-8601 strings so this object can be serialized
 * directly and can later be projected into a vector-store metadata payload.
 */
export interface DocumentChunkMetadata {
  readonly schemaVersion:
    typeof DOCUMENT_CHUNK_METADATA_SCHEMA_VERSION;

  readonly document:
    DocumentChunkDocumentMetadata;

  readonly discovery?:
    DocumentChunkDiscoveryMetadata;

  readonly acquisition:
    DocumentChunkAcquisitionMetadata;

  readonly chunk:
    DocumentChunkPositionMetadata;

  readonly splitter:
    DocumentChunkSplitterMetadata;
}
