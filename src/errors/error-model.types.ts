import type {
  JsonValue,
} from "../domain/source.types.js";

export const SOURCE_ERROR_SCHEMA_VERSION =
  1 as const;

export type SourceErrorCategory =
  | "validation"
  | "security"
  | "network"
  | "http"
  | "limit"
  | "rendering"
  | "extraction"
  | "normalization"
  | "discovery"
  | "persistence"
  | "canonicalization"
  | "scheduling"
  | "chunking"
  | "embedding"
  | "vector-store"
  | "sync"
  | "observability"
  | "internal";

export type SourceErrorStage =
  | "resolve"
  | "fetch"
  | "render"
  | "extract"
  | "normalize"
  | "discover"
  | "persist"
  | "canonicalize"
  | "schedule"
  | "chunk"
  | "embed"
  | "vector-upsert"
  | "vector-delete"
  | "sync-state"
  | "website-sync"
  | "observability"
  | "unknown";

export type SourceErrorRetryability =
  | "yes"
  | "no"
  | "unknown";

export type SourceErrorCode =
  | "OPERATION_ABORTED"
  | "INVALID_INPUT"
  | "REMOTE_INVALID_URL"
  | "REMOTE_UNSAFE_URL"
  | "REMOTE_DNS_RESOLUTION_FAILED"
  | "REMOTE_REQUEST_FAILED"
  | "REMOTE_TIMEOUT"
  | "REMOTE_HTTP_STATUS"
  | "REMOTE_TOO_MANY_REDIRECTS"
  | "REMOTE_TOO_LARGE"
  | "REMOTE_UNSUPPORTED_ENCODING"
  | "RENDERER_UNAVAILABLE"
  | "RENDER_UNSUPPORTED_RESOURCE"
  | "RENDER_INVALID_OUTPUT"
  | "RENDER_NAVIGATION_FAILED"
  | "RENDER_HTTP_STATUS"
  | "RENDER_UNSAFE_NAVIGATION"
  | "RENDER_TOO_LARGE"
  | "EXTRACTOR_DUPLICATE"
  | "EXTRACTOR_NOT_FOUND"
  | "EXTRACTION_FAILED"
  | "EXTRACTION_INVALID_OUTPUT"
  | "NORMALIZATION_UNSUPPORTED"
  | "NORMALIZATION_FAILED"
  | "DISCOVERY_INVALID_SITEMAP"
  | "DISCOVERY_LIMIT"
  | "DISCOVERY_DECOMPRESSION_FAILED"
  | "DISCOVERY_CRAWL_PAGE_FAILED"
  | "PERSISTENCE_HASH_MISMATCH"
  | "PERSISTENCE_PATH_INVALID"
  | "PERSISTENCE_FAILED"
  | "CANONICALIZATION_UNSUPPORTED_PROTOCOL"
  | "SCHEDULER_INVALID_CONCURRENCY"
  | "CHUNKING_SPLITTER_FAILED"
  | "CHUNKING_EMPTY_RESULT"
  | "VECTOR_INVALID_BATCH_SIZE"
  | "VECTOR_DUPLICATE_CHUNK_ID"
  | "EMBEDDING_COUNT_MISMATCH"
  | "EMBEDDING_INVALID_VECTOR"
  | "EMBEDDING_DIMENSION_MISMATCH"
  | "VECTOR_BATCH_FAILED"
  | "SYNC_INVALID_STATE"
  | "SYNC_INVALID_PIPELINE_REVISION"
  | "SYNC_DUPLICATE_DOCUMENT"
  | "SYNC_CHUNK_MISMATCH"
  | "WEBSITE_SYNC_MATERIALIZATION_FAILED"
  | "WEBSITE_SYNC_DOCUMENT_COLLISION"
  | "WEBSITE_SYNC_SOURCE_MISMATCH"
  | "WEB_DOCUMENT_INVALID"
  | "WEB_DOCUMENT_SOURCE_MISMATCH"
  | "EXECUTION_LIMIT_INVALID_CONFIG"
  | "EXECUTION_LIMIT_EXCEEDED"
  | "EXECUTION_DEADLINE_EXCEEDED"
  | "UNKNOWN_ERROR";

export type SourceErrorDetails =
  Readonly<Record<string, JsonValue>>;

export interface SourceErrorDescriptor {
  readonly schemaVersion:
    typeof SOURCE_ERROR_SCHEMA_VERSION;

  readonly code:
    SourceErrorCode;

  readonly category:
    SourceErrorCategory;

  readonly stage:
    SourceErrorStage;

  readonly retryability:
    SourceErrorRetryability;

  readonly aborted:
    boolean;

  readonly name:
    string;

  readonly message:
    string;

  readonly stack?:
    string;

  readonly statusCode?:
    number;

  readonly url?:
    string;

  readonly details?:
    SourceErrorDetails;

  readonly cause?:
    SourceErrorDescriptor;
}

export interface DescribeSourceErrorOptions {
  readonly includeStack?:
    boolean;

  readonly maxCauseDepth?:
    number;
}
