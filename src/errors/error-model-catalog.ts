import type {
  SourceErrorCategory,
  SourceErrorCode,
  SourceErrorRetryability,
  SourceErrorStage,
} from "./error-model.types.js";

export interface SourceErrorCatalogEntry {
  readonly code:
    SourceErrorCode;

  readonly category:
    SourceErrorCategory;

  readonly stage:
    SourceErrorStage;

  readonly retryability:
    SourceErrorRetryability;

  readonly description:
    string;
}

function entry(
  code:
    SourceErrorCode,
  category:
    SourceErrorCategory,
  stage:
    SourceErrorStage,
  retryability:
    SourceErrorRetryability,
  description:
    string,
): SourceErrorCatalogEntry {
  return Object.freeze({
    code,
    category,
    stage,
    retryability,
    description,
  });
}

export const SOURCE_ERROR_CATALOG =
  Object.freeze({
    OPERATION_ABORTED: entry("OPERATION_ABORTED", "internal", "unknown", "no", "Operation was explicitly aborted."),
    INVALID_INPUT: entry("INVALID_INPUT", "validation", "unknown", "no", "Input or configuration is invalid."),
    REMOTE_INVALID_URL: entry("REMOTE_INVALID_URL", "validation", "resolve", "no", "Remote URL is syntactically invalid."),
    REMOTE_UNSAFE_URL: entry("REMOTE_UNSAFE_URL", "security", "resolve", "no", "Remote URL is blocked by the network safety policy."),
    REMOTE_DNS_RESOLUTION_FAILED: entry("REMOTE_DNS_RESOLUTION_FAILED", "network", "resolve", "yes", "DNS resolution failed."),
    REMOTE_REQUEST_FAILED: entry("REMOTE_REQUEST_FAILED", "network", "fetch", "yes", "Remote network request failed."),
    REMOTE_TIMEOUT: entry("REMOTE_TIMEOUT", "network", "fetch", "yes", "Remote request timed out."),
    REMOTE_HTTP_STATUS: entry("REMOTE_HTTP_STATUS", "http", "fetch", "unknown", "Remote endpoint returned an unsuccessful HTTP status."),
    REMOTE_TOO_MANY_REDIRECTS: entry("REMOTE_TOO_MANY_REDIRECTS", "limit", "fetch", "no", "Redirect limit was exceeded."),
    REMOTE_TOO_LARGE: entry("REMOTE_TOO_LARGE", "limit", "fetch", "no", "Remote payload exceeded the configured byte limit."),
    REMOTE_UNSUPPORTED_ENCODING: entry("REMOTE_UNSUPPORTED_ENCODING", "validation", "fetch", "no", "HTTP content encoding is unsupported."),
    RENDERER_UNAVAILABLE: entry("RENDERER_UNAVAILABLE", "rendering", "render", "no", "Browser renderer is unavailable."),
    RENDER_UNSUPPORTED_RESOURCE: entry("RENDER_UNSUPPORTED_RESOURCE", "rendering", "render", "no", "Resource cannot be browser-rendered."),
    RENDER_INVALID_OUTPUT: entry("RENDER_INVALID_OUTPUT", "rendering", "render", "no", "Browser renderer produced an invalid resource."),
    RENDER_NAVIGATION_FAILED: entry("RENDER_NAVIGATION_FAILED", "network", "render", "yes", "Browser navigation failed."),
    RENDER_HTTP_STATUS: entry("RENDER_HTTP_STATUS", "http", "render", "unknown", "Browser navigation returned an unsuccessful HTTP status."),
    RENDER_UNSAFE_NAVIGATION: entry("RENDER_UNSAFE_NAVIGATION", "security", "render", "no", "Browser navigation was blocked by network safety policy."),
    RENDER_TOO_LARGE: entry("RENDER_TOO_LARGE", "limit", "render", "no", "Rendered HTML exceeded the configured size limit."),
    EXTRACTOR_DUPLICATE: entry("EXTRACTOR_DUPLICATE", "validation", "extract", "no", "Extractor registry contains a duplicate name."),
    EXTRACTOR_NOT_FOUND: entry("EXTRACTOR_NOT_FOUND", "extraction", "extract", "no", "No extractor supports the fetched resource."),
    EXTRACTION_FAILED: entry("EXTRACTION_FAILED", "extraction", "extract", "no", "Content extraction failed."),
    EXTRACTION_INVALID_OUTPUT: entry("EXTRACTION_INVALID_OUTPUT", "extraction", "extract", "no", "Extractor returned an invalid document."),
    NORMALIZATION_UNSUPPORTED: entry("NORMALIZATION_UNSUPPORTED", "normalization", "normalize", "no", "Extracted document cannot be normalized by this converter."),
    NORMALIZATION_FAILED: entry("NORMALIZATION_FAILED", "normalization", "normalize", "no", "Markdown normalization/conversion failed."),
    DISCOVERY_INVALID_SITEMAP: entry("DISCOVERY_INVALID_SITEMAP", "discovery", "discover", "no", "Sitemap is malformed or invalid."),
    DISCOVERY_LIMIT: entry("DISCOVERY_LIMIT", "limit", "discover", "no", "Website discovery exceeded a configured limit."),
    DISCOVERY_DECOMPRESSION_FAILED: entry("DISCOVERY_DECOMPRESSION_FAILED", "discovery", "discover", "no", "Sitemap decompression failed."),
    DISCOVERY_CRAWL_PAGE_FAILED: entry("DISCOVERY_CRAWL_PAGE_FAILED", "discovery", "discover", "unknown", "An individual page failed during link crawling."),
    PERSISTENCE_HASH_MISMATCH: entry("PERSISTENCE_HASH_MISMATCH", "persistence", "persist", "no", "Persisted Markdown content hash does not match."),
    PERSISTENCE_PATH_INVALID: entry("PERSISTENCE_PATH_INVALID", "security", "persist", "no", "Persistence path is invalid or escapes the configured root."),
    PERSISTENCE_FAILED: entry("PERSISTENCE_FAILED", "persistence", "persist", "unknown", "Artifact persistence failed."),
    CANONICALIZATION_UNSUPPORTED_PROTOCOL: entry("CANONICALIZATION_UNSUPPORTED_PROTOCOL", "canonicalization", "canonicalize", "no", "URL protocol cannot participate in canonicalization."),
    SCHEDULER_INVALID_CONCURRENCY: entry("SCHEDULER_INVALID_CONCURRENCY", "validation", "schedule", "no", "Crawler concurrency configuration is invalid."),
    CHUNKING_SPLITTER_FAILED: entry("CHUNKING_SPLITTER_FAILED", "chunking", "chunk", "no", "Markdown splitter failed."),
    CHUNKING_EMPTY_RESULT: entry("CHUNKING_EMPTY_RESULT", "chunking", "chunk", "no", "Splitter produced no useful chunks for non-empty input."),
    VECTOR_INVALID_BATCH_SIZE: entry("VECTOR_INVALID_BATCH_SIZE", "validation", "unknown", "no", "Vector batch size configuration is invalid."),
    VECTOR_DUPLICATE_CHUNK_ID: entry("VECTOR_DUPLICATE_CHUNK_ID", "validation", "vector-upsert", "no", "Vector input contains duplicate chunk IDs."),
    EMBEDDING_COUNT_MISMATCH: entry("EMBEDDING_COUNT_MISMATCH", "embedding", "embed", "no", "Embedding provider returned an unexpected vector count."),
    EMBEDDING_INVALID_VECTOR: entry("EMBEDDING_INVALID_VECTOR", "embedding", "embed", "no", "Embedding provider returned an invalid vector."),
    EMBEDDING_DIMENSION_MISMATCH: entry("EMBEDDING_DIMENSION_MISMATCH", "embedding", "embed", "no", "Embedding dimensions differ from the configured model dimensions."),
    VECTOR_BATCH_FAILED: entry("VECTOR_BATCH_FAILED", "vector-store", "vector-upsert", "unknown", "Embedding/vector-store batch operation failed."),
    SYNC_INVALID_STATE: entry("SYNC_INVALID_STATE", "sync", "sync-state", "no", "Persisted incremental sync state is invalid."),
    SYNC_INVALID_PIPELINE_REVISION: entry("SYNC_INVALID_PIPELINE_REVISION", "validation", "sync-state", "no", "Pipeline revision is invalid."),
    SYNC_DUPLICATE_DOCUMENT: entry("SYNC_DUPLICATE_DOCUMENT", "validation", "sync-state", "no", "Incremental sync input contains duplicate document IDs."),
    SYNC_CHUNK_MISMATCH: entry("SYNC_CHUNK_MISMATCH", "sync", "sync-state", "no", "Chunking output cannot be reconciled with the document input."),
    WEBSITE_SYNC_MATERIALIZATION_FAILED: entry("WEBSITE_SYNC_MATERIALIZATION_FAILED", "sync", "website-sync", "unknown", "One or more discovered pages failed to materialize."),
    WEBSITE_SYNC_DOCUMENT_COLLISION: entry("WEBSITE_SYNC_DOCUMENT_COLLISION", "sync", "website-sync", "no", "Two pages collapsed to the same document identity with incompatible content."),
    WEBSITE_SYNC_SOURCE_MISMATCH: entry("WEBSITE_SYNC_SOURCE_MISMATCH", "validation", "website-sync", "no", "Materialized document belongs to another source."),
    WEB_DOCUMENT_INVALID: entry("WEB_DOCUMENT_INVALID", "validation", "persist", "no", "WebDocument aggregate is invalid."),
    WEB_DOCUMENT_SOURCE_MISMATCH: entry("WEB_DOCUMENT_SOURCE_MISMATCH", "validation", "persist", "no", "WebDocument belongs to another source collection."),
    EXECUTION_LIMIT_INVALID_CONFIG: entry("EXECUTION_LIMIT_INVALID_CONFIG", "validation", "website-sync", "no", "Execution budget configuration is invalid."),
    EXECUTION_LIMIT_EXCEEDED: entry("EXECUTION_LIMIT_EXCEEDED", "limit", "website-sync", "no", "A cumulative execution budget limit was exceeded."),
    EXECUTION_DEADLINE_EXCEEDED: entry("EXECUTION_DEADLINE_EXCEEDED", "limit", "website-sync", "no", "The ingestion execution deadline was exceeded."),
    UNKNOWN_ERROR: entry("UNKNOWN_ERROR", "internal", "unknown", "unknown", "Unclassified error."),
  } satisfies Record<SourceErrorCode, SourceErrorCatalogEntry>);
