import type {
  JsonValue,
  SourceId,
} from "../domain/source.types.js";

import type {
  WebDocumentId,
} from "../website/web-document.js";

export interface MarkdownSplitterContext {
  sourceId:
    SourceId;

  documentId:
    WebDocumentId;

  canonicalUrl:
    string;

  title?:
    string;

  documentContentHash:
    string;
}

export interface MarkdownSplitSegmentMetadata {
  /**
   * Optional explicit source range from a splitter that already tracks
   * positions. Offsets use JavaScript UTF-16 string indexing and endOffset is
   * exclusive.
   */
  startOffset?:
    number;

  endOffset?:
    number;

  /**
   * Optional splitter-provided section hierarchy. When omitted, Phase 18
   * derives it from the source Markdown when an exact source match is found.
   */
  headingPath?:
    readonly string[];

  headingLevels?:
    readonly number[];

  /**
   * Arbitrary JSON-safe metadata from the existing host splitter.
   */
  attributes?:
    Readonly<Record<string, JsonValue>>;
}

export interface MarkdownSplitSegment {
  markdown:
    string;

  metadata?:
    MarkdownSplitSegmentMetadata;
}

export interface MarkdownSplitter {
  readonly name:
    string;

  split(
    markdown:
      string,

    context:
      MarkdownSplitterContext,
  ):
    Promise<readonly MarkdownSplitSegment[]>;
}
