import type {
  FetchedResource,
} from "../remote/index.js";

import type {
  ExtractedDocument,
} from "./extracted-document.js";

export interface ContentExtractionContext {
  /**
   * Optional cancellation signal for extractors that perform asynchronous
   * or computationally expensive work.
   */
  signal?: AbortSignal;
}

export interface ContentExtractor {
  /**
   * Stable, human-readable identifier used in logs and diagnostics.
   *
   * Examples:
   * - "pdf"
   * - "markdown"
   * - "html"
   */
  readonly name: string;

  /**
   * Returns whether this extractor can process the fetched resource.
   *
   * Selection must be side-effect free and synchronous.
   */
  supports(
    resource: FetchedResource,
  ): boolean;

  /**
   * Extracts semantic content without performing network acquisition.
   */
  extract(
    resource: FetchedResource,
    context?: ContentExtractionContext,
  ): Promise<ExtractedDocument>;
}
