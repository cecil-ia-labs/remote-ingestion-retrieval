import type {
  JsonValue,
} from "../domain/source.types.js";

import {
  SOURCE_ERROR_CATALOG,
} from "./error-model-catalog.js";

import {
  sanitizeErrorText,
  sanitizeErrorUrl,
} from "./error-model-sanitizer.js";

import {
  SOURCE_ERROR_SCHEMA_VERSION,
} from "./error-model.types.js";

import type {
  DescribeSourceErrorOptions,
  SourceErrorCode,
  SourceErrorDescriptor,
  SourceErrorDetails,
  SourceErrorRetryability,
  SourceErrorStage,
} from "./error-model.types.js";

import {
  SourceIngestionError,
} from "./source-ingestion-error.js";

interface ErrorLike {
  readonly name?:
    unknown;

  readonly message?:
    unknown;

  readonly stack?:
    unknown;

  readonly cause?:
    unknown;

  readonly [key: string]:
    unknown;
}

const NAME_TO_CODE =
  Object.freeze({
    InvalidRemoteUrlError: "REMOTE_INVALID_URL",
    UnsafeRemoteUrlError: "REMOTE_UNSAFE_URL",
    RemoteDnsResolutionError: "REMOTE_DNS_RESOLUTION_FAILED",
    RemoteRequestError: "REMOTE_REQUEST_FAILED",
    RemoteFetchRequestError: "REMOTE_REQUEST_FAILED",
    RemoteRequestTimeoutError: "REMOTE_TIMEOUT",
    RemoteFetchTimeoutError: "REMOTE_TIMEOUT",
    RemoteHttpStatusError: "REMOTE_HTTP_STATUS",
    RemoteFetchHttpStatusError: "REMOTE_HTTP_STATUS",
    RemoteFetchTooManyRedirectsError: "REMOTE_TOO_MANY_REDIRECTS",
    TooManyRedirectsError: "REMOTE_TOO_MANY_REDIRECTS",
    RemoteFetchTooLargeError: "REMOTE_TOO_LARGE",
    UnsupportedContentEncodingError: "REMOTE_UNSUPPORTED_ENCODING",
    BrowserRendererUnavailableError: "RENDERER_UNAVAILABLE",
    UnsupportedHtmlRenderingResourceError: "RENDER_UNSUPPORTED_RESOURCE",
    InvalidBrowserRenderedResourceError: "RENDER_INVALID_OUTPUT",
    PuppeteerNavigationError: "RENDER_NAVIGATION_FAILED",
    PuppeteerNavigationHttpStatusError: "RENDER_HTTP_STATUS",
    PuppeteerUnsafeNavigationError: "RENDER_UNSAFE_NAVIGATION",
    PuppeteerRenderedResourceTooLargeError: "RENDER_TOO_LARGE",
    DuplicateContentExtractorError: "EXTRACTOR_DUPLICATE",
    NoContentExtractorError: "EXTRACTOR_NOT_FOUND",
    ContentExtractionError: "EXTRACTION_FAILED",
    InvalidExtractedDocumentError: "EXTRACTION_INVALID_OUTPUT",
    UnsupportedExtractedDocumentError: "NORMALIZATION_UNSUPPORTED",
    MarkdownConversionError: "NORMALIZATION_FAILED",
    InvalidSitemapError: "DISCOVERY_INVALID_SITEMAP",
    SitemapLimitError: "DISCOVERY_LIMIT",
    SitemapEntryLimitError: "DISCOVERY_LIMIT",
    SitemapPayloadTooLargeError: "DISCOVERY_LIMIT",
    SitemapDecompressionError: "DISCOVERY_DECOMPRESSION_FAILED",
    LinkCrawlPageError: "DISCOVERY_CRAWL_PAGE_FAILED",
    MarkdownArtifactHashMismatchError: "PERSISTENCE_HASH_MISMATCH",
    MarkdownArtifactPathError: "PERSISTENCE_PATH_INVALID",
    MarkdownArtifactStoreError: "PERSISTENCE_FAILED",
    UnsupportedCanonicalUrlProtocolError: "CANONICALIZATION_UNSUPPORTED_PROTOCOL",
    InvalidCrawlConcurrencyError: "SCHEDULER_INVALID_CONCURRENCY",
    MarkdownSplitterExecutionError: "CHUNKING_SPLITTER_FAILED",
    EmptyMarkdownSplitResultError: "CHUNKING_EMPTY_RESULT",
    InvalidVectorBatchSizeError: "VECTOR_INVALID_BATCH_SIZE",
    DuplicateDocumentChunkIdError: "VECTOR_DUPLICATE_CHUNK_ID",
    EmbeddingCountMismatchError: "EMBEDDING_COUNT_MISMATCH",
    InvalidEmbeddingVectorError: "EMBEDDING_INVALID_VECTOR",
    EmbeddingDimensionMismatchError: "EMBEDDING_DIMENSION_MISMATCH",
    VectorIndexingBatchError: "VECTOR_BATCH_FAILED",
    InvalidIncrementalSyncStateError: "SYNC_INVALID_STATE",
    InvalidPipelineRevisionError: "SYNC_INVALID_PIPELINE_REVISION",
    DuplicateIncrementalDocumentIdError: "SYNC_DUPLICATE_DOCUMENT",
    IncrementalChunkingResultMismatchError: "SYNC_CHUNK_MISMATCH",
    WebsiteSyncMaterializationError: "WEBSITE_SYNC_MATERIALIZATION_FAILED",
    WebsiteSyncDocumentCollisionError: "WEBSITE_SYNC_DOCUMENT_COLLISION",
    WebsiteSyncSourceMismatchError: "WEBSITE_SYNC_SOURCE_MISMATCH",
    InvalidWebDocumentError: "WEB_DOCUMENT_INVALID",
    WebsiteDocumentSourceMismatchError: "WEB_DOCUMENT_SOURCE_MISMATCH",
    InvalidExecutionLimitError: "EXECUTION_LIMIT_INVALID_CONFIG",
    ExecutionLimitExceededError: "EXECUTION_LIMIT_EXCEEDED",
    ExecutionDeadlineExceededError: "EXECUTION_DEADLINE_EXCEEDED",
  } satisfies Record<string, SourceErrorCode>);

const ABORT_ERROR_NAMES =
  new Set([
    "RemoteFetchAbortedError",
    "HtmlRenderingAbortedError",
    "ContentExtractionAbortedError",
    "MarkdownConversionAbortedError",
    "WebsiteDiscoveryAbortedError",
    "LinkCrawlAbortedError",
    "CrawlSchedulingAbortedError",
    "VectorIndexingAbortedError",
    "IncrementalSyncAbortedError",
    "WebsiteSyncAbortedError",
    "AbortError",
  ]);

function objectLike(
  value:
    unknown,
): ErrorLike | undefined {
  return (
    typeof value === "object"
    && value !== null
  )
    ? value as ErrorLike
    : undefined;
}

function readString(
  value:
    ErrorLike | undefined,

  key:
    string,
): string | undefined {
  const item =
    value?.[key];

  return typeof item === "string"
    ? item
    : undefined;
}

function readNumber(
  value:
    ErrorLike | undefined,

  key:
    string,
): number | undefined {
  const item =
    value?.[key];

  return (
    typeof item === "number"
    && Number.isFinite(
      item,
    )
  )
    ? item
    : undefined;
}

function isAbortLike(
  name:
    string,

  message:
    string,
): boolean {
  return (
    ABORT_ERROR_NAMES.has(
      name,
    )
    || name.toLowerCase()
      .includes(
        "abort",
      )
    || message.toLowerCase()
      .includes(
        "aborted",
      )
  );
}

function httpRetryability(
  statusCode:
    number | undefined,
): SourceErrorRetryability {
  if (
    statusCode === undefined
  ) {
    return "unknown";
  }

  if (
    statusCode === 408
    || statusCode === 425
    || statusCode === 429
    || statusCode >= 500
  ) {
    return "yes";
  }

  return "no";
}

function vectorBatchStage(
  value:
    ErrorLike | undefined,
): SourceErrorStage {
  switch (
    readString(
      value,
      "stage",
    )
  ) {
    case "embedding":
      return "embed";

    case "delete":
      return "vector-delete";

    case "upsert":
      return "vector-upsert";

    default:
      return "vector-upsert";
  }
}

function firstUrl(
  value:
    ErrorLike | undefined,
): string | undefined {
  for (
    const key
    of [
      "url",
      "rootUrl",
      "sitemapUrl",
      "canonicalUrl",
      "discoveredUrl",
    ]
  ) {
    const item =
      readString(
        value,
        key,
      );

    if (item) {
      return sanitizeErrorUrl(
        item,
      );
    }
  }

  return undefined;
}

function safeDetails(
  value:
    ErrorLike | undefined,
): SourceErrorDetails | undefined {
  if (!value) {
    return undefined;
  }

  const result:
    Record<string, JsonValue> = {};

  for (
    const key
    of [
      "maxBytes",
      "observedBytes",
      "limit",
      "batchIndex",
      "completedItems",
      "expected",
      "actual",
      "inputIndex",
      "concurrency",
      "maxConcurrency",
    ]
  ) {
    const item =
      readNumber(
        value,
        key,
      );

    if (
      item !== undefined
    ) {
      result[key] =
        item;
    }
  }

  for (
    const key
    of [
      "entryType",
      "extractorName",
      "converterName",
      "splitterName",
      "documentId",
      "chunkId",
      "providerName",
      "optionName",
      "expectedSourceId",
      "actualSourceId",
      "firstCanonicalUrl",
      "secondCanonicalUrl",
    ]
  ) {
    const item =
      readString(
        value,
        key,
      );

    if (
      item !== undefined
    ) {
      result[key] =
        key.toLowerCase()
          .includes(
            "url",
          )
          ? sanitizeErrorUrl(
              item,
            )
          : item;
    }
  }

  const stage =
    readString(
      value,
      "stage",
    );

  if (stage) {
    result.operationStage =
      stage;
  }

  const failures =
    value.failures;

  if (
    Array.isArray(
      failures,
    )
  ) {
    result.failureCount =
      failures.length;
  }

  return Object.keys(
    result,
  ).length > 0
    ? Object.freeze(
        result,
      )
    : undefined;
}

function baseCode(
  name:
    string,

  aborted:
    boolean,
): SourceErrorCode {
  if (aborted) {
    return "OPERATION_ABORTED";
  }

  return NAME_TO_CODE[
    name as keyof typeof NAME_TO_CODE
  ]
  ?? "UNKNOWN_ERROR";
}

function causeValue(
  value:
    ErrorLike | undefined,
): unknown {
  return value?.cause;
}

function descriptorInternal(
  input:
    unknown,

  options:
    Required<DescribeSourceErrorOptions>,

  depth:
    number,
): SourceErrorDescriptor {
  if (
    input instanceof SourceIngestionError
  ) {
    const cause =
      depth < options.maxCauseDepth
      && input.cause !== undefined
        ? descriptorInternal(
            input.cause,
            options,
            depth + 1,
          )
        : undefined;

    return {
      schemaVersion:
        SOURCE_ERROR_SCHEMA_VERSION,
      code:
        input.code,
      category:
        input.category,
      stage:
        input.stage,
      retryability:
        input.retryability,
      aborted:
        input.aborted,
      name:
        input.name,
      message:
        sanitizeErrorText(
          input.message,
        ),
      stack:
        options.includeStack
          ? sanitizeErrorText(
              input.stack
              ?? "",
            ) || undefined
          : undefined,
      statusCode:
        input.statusCode,
      url:
        input.url
          ? sanitizeErrorUrl(
              input.url,
            )
          : undefined,
      details:
        input.details,
      cause,
    };
  }

  const object =
    objectLike(
      input,
    );

  const rawName =
    typeof object?.name
      === "string"
      ? object.name
      : input instanceof Error
        ? input.name
        : "Error";

  const rawMessage =
    typeof object?.message
      === "string"
      ? object.message
      : input instanceof Error
        ? input.message
        : String(
            input,
          );

  const aborted =
    isAbortLike(
      rawName,
      rawMessage,
    );

  const code =
    baseCode(
      rawName,
      aborted,
    );

  const catalog =
    SOURCE_ERROR_CATALOG[
      code
    ];

  const statusCode =
    readNumber(
      object,
      "statusCode",
    );

  const nestedCause =
    depth < options.maxCauseDepth
      ? causeValue(
          object,
        )
      : undefined;

  const cause =
    nestedCause !== undefined
      ? descriptorInternal(
          nestedCause,
          options,
          depth + 1,
        )
      : undefined;

  let retryability =
    catalog.retryability;

  if (
    code === "REMOTE_HTTP_STATUS"
    || code === "RENDER_HTTP_STATUS"
  ) {
    retryability =
      httpRetryability(
        statusCode,
      );
  }

  if (
    code === "VECTOR_BATCH_FAILED"
    && cause
    && cause.retryability
      !== "unknown"
  ) {
    retryability =
      cause.retryability;
  }

  return {
    schemaVersion:
      SOURCE_ERROR_SCHEMA_VERSION,
    code,
    category:
      catalog.category,
    stage:
      code === "VECTOR_BATCH_FAILED"
        ? vectorBatchStage(
            object,
          )
        : catalog.stage,
    retryability,
    aborted,
    name:
      rawName,
    message:
      sanitizeErrorText(
        rawMessage,
      ),
    stack:
      options.includeStack
        && typeof object?.stack
          === "string"
        ? sanitizeErrorText(
            object.stack,
          )
        : undefined,
    statusCode,
    url:
      firstUrl(
        object,
      ),
    details:
      safeDetails(
        object,
      ),
    cause,
  };
}

export function describeSourceError(
  input:
    unknown,

  options:
    DescribeSourceErrorOptions = {},
): SourceErrorDescriptor {
  return descriptorInternal(
    input,
    {
      includeStack:
        options.includeStack
        ?? true,
      maxCauseDepth:
        Math.max(
          0,
          options.maxCauseDepth
          ?? 4,
        ),
    },
    0,
  );
}

export function isRetryableSourceError(
  input:
    unknown,
): boolean {
  return describeSourceError(
    input,
    {
      includeStack:
        false,
      maxCauseDepth:
        1,
    },
  ).retryability === "yes";
}

export function isAbortedSourceError(
  input:
    unknown,
): boolean {
  return describeSourceError(
    input,
    {
      includeStack:
        false,
      maxCauseDepth:
        0,
    },
  ).aborted;
}
