import type {
  ExtractedDocument,
} from "../extraction/extracted-document.js";

import type {
  NormalizedDocument,
} from "./normalized-document.js";

export interface MarkdownConversionContext {
  /**
   * Optional cancellation signal for converters that perform expensive work.
   */
  signal?: AbortSignal;
}

export interface MarkdownConverter {
  readonly name: string;

  /**
   * Returns whether this converter accepts the supplied extracted document.
   */
  supports(
    document: ExtractedDocument,
  ): boolean;

  convert(
    document: ExtractedDocument,
    context?: MarkdownConversionContext,
  ): Promise<NormalizedDocument>;
}
