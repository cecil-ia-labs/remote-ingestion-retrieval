import type {
  MarkdownSplitter,
  WebDocumentChunkingResult,
  WebDocumentChunker,
} from "../chunking/index.js";

import type {
  DiscoveredUrl,
  WebsiteDiscovery,
} from "../discovery/index.js";

import type {
  UrlSource,
  WebsiteSource,
} from "../domain/index.js";

import type {
  PdfMarkdownProcessor,
} from "../extraction/extractors/pdf-extractor.js";

import type {
  ExecutionLimits,
} from "../limits/index.js";

import type {
  ObservabilityAttributes,
  ObservabilityHub,
} from "../observability/index.js";

import type {
  SourceInsertionPipeline,
} from "../pipeline/index.js";

import type {
  IncrementalSyncStateStore,
  IncrementalVectorSyncService,
  WebsiteDocumentMaterializer,
  WebsiteSyncFailurePolicy,
  WebsiteSyncResult,
  WebsiteSyncService,
} from "../sync/index.js";

import type {
  DocumentChunkVectorIndexer,
  EmbeddingProvider,
  VectorMetadataProjector,
  VectorStore,
} from "../vector/index.js";

import type {
  WebDocument,
} from "../website/index.js";

export interface RemoteSourceIngestionOptions {
  /**
   * Explicit revision for every downstream-affecting part of the pipeline.
   * Change this when splitter, embedding model, dimensions or vector payload
   * semantics change.
   */
  readonly pipelineRevision:
    string;

  /** Defaults to StructuralMarkdownSplitter; semantic splitting is opt-in. */
  readonly markdownSplitter?:
    MarkdownSplitter;

  readonly embeddingProvider:
    EmbeddingProvider;

  readonly vectorStore:
    VectorStore;

  readonly pdfProcessor?:
    PdfMarkdownProcessor;

  readonly observability?:
    ObservabilityHub;

  readonly artifactRootDirectory?:
    string;

  readonly stateRootDirectory?:
    string;

  readonly embeddingBatchSize?:
    number;

  readonly upsertBatchSize?:
    number;

  readonly deleteBatchSize?:
    number;

  readonly vectorMetadataProjector?:
    VectorMetadataProjector;

  /** Advanced override points. */
  readonly discovery?:
    WebsiteDiscovery;

  readonly materializer?:
    WebsiteDocumentMaterializer;

  readonly stateStore?:
    IncrementalSyncStateStore;

  readonly chunker?:
    WebDocumentChunker;

  readonly vectorIndexer?:
    DocumentChunkVectorIndexer;

  readonly vectorSync?:
    IncrementalVectorSyncService;

  readonly websiteSync?:
    WebsiteSyncService;
}

export interface PublicIngestionRunOptions {
  readonly pipelineRevision?:
    string;

  readonly namespace?:
    string;

  readonly materializationConcurrency?:
    number;

  readonly failurePolicy?:
    WebsiteSyncFailurePolicy;

  readonly limits?:
    ExecutionLimits;

  readonly observability?: {
    readonly runId?:
      string;

    readonly attributes?:
      ObservabilityAttributes;
  };

  readonly signal?:
    AbortSignal;
}

export interface IngestWebsiteRequest
  extends PublicIngestionRunOptions {
  readonly source:
    WebsiteSource;
}

export interface IngestUrlRequest
  extends PublicIngestionRunOptions {
  readonly source:
    UrlSource;
}

export interface DiscoverWebsiteRequest {
  readonly source:
    WebsiteSource;

  readonly signal?:
    AbortSignal;
}

export interface DiscoverWebsiteResult {
  readonly sourceId:
    string;

  readonly urls:
    readonly DiscoveredUrl[];
}

export interface MaterializeUrlRequest {
  readonly source:
    UrlSource;

  readonly signal?:
    AbortSignal;
}

export interface ChunkDocumentRequest {
  readonly document:
    WebDocument;

  readonly signal?:
    AbortSignal;
}

export interface RemoteSourceIngestionServices {
  readonly discovery:
    WebsiteDiscovery;

  readonly materializer:
    WebsiteDocumentMaterializer;

  readonly stateStore:
    IncrementalSyncStateStore;

  readonly chunker:
    WebDocumentChunker;

  readonly vectorIndexer:
    DocumentChunkVectorIndexer;

  readonly vectorSync:
    IncrementalVectorSyncService;

  readonly websiteSync:
    WebsiteSyncService;

  readonly sourceInsertion:
    SourceInsertionPipeline;

  readonly observability:
    ObservabilityHub;
}

export type IngestWebsiteResult =
  WebsiteSyncResult;

export type IngestUrlResult =
  WebsiteSyncResult;

export type ChunkDocumentResult =
  WebDocumentChunkingResult;
