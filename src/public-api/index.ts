export * from "./public-api.errors.js";
export * from "./remote-source-ingestion.types.js";
export * from "./remote-source-ingestion.js";

// Essential host contracts and request/result types intentionally re-exported
// from the stable root API. The complete implementation surface remains
// available through the package's /advanced export.
export type {
  UrlSource,
  WebsiteSource,
} from "../domain/index.js";

export type {
  MarkdownSplitter,
  MarkdownSplitterContext,
  MarkdownSplitSegment,
  MarkdownSplitSegmentMetadata,
  DocumentChunk,
  WebDocumentChunkingResult,
} from "../chunking/index.js";

export type {
  PdfMarkdownProcessor,
  PdfMarkdownProcessorContext,
  PdfMarkdownProcessorResult,
} from "../extraction/extractors/pdf-extractor.js";

export type {
  ExecutionLimits,
  ExecutionBudgetSnapshot,
} from "../limits/index.js";

export type {
  ObservabilitySink,
  ObservabilityEvent,
  ObservabilityAttributes,
} from "../observability/index.js";

export {
  ObservabilityHub,
  ConsoleObservabilitySink,
  JsonlFileObservabilitySink,
  CompositeObservabilitySink,
  InMemoryObservabilitySink,
} from "../observability/index.js";

export type {
  EmbeddingProvider,
  EmbeddingRequestContext,
  VectorStore,
  VectorStoreOperationContext,
  VectorMetadataProjector,
  VectorMetadata,
} from "../vector/index.js";

export type {
  WebsiteSyncResult,
  WebsiteSyncPlan,
  WebsiteSyncStats,
  WebsiteSyncFailurePolicy,
} from "../sync/index.js";

export type {
  WebDocument,
} from "../website/index.js";

export {
  SourceInsertionPipeline,
  summarizeSourceInsertion,
} from "../pipeline/index.js";

export type {
  SourceInsertionRequest,
  SourceInsertionResult,
  SourceInsertionOutcome,
  SourceInsertionStatus,
  SourceInsertionSummary,
  SourceInsertionCompletedOutcome,
  SourceInsertionFailedOutcome,
} from "../pipeline/index.js";
