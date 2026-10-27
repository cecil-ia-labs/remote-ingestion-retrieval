import type {
  SourceId,
} from "../domain/index.js";

export interface MarkdownArtifact {
  readonly storage:
    "local";

  readonly sourceId:
    SourceId;

  readonly documentId:
    string;

  readonly canonicalUrl:
    string;

  /**
   * Path relative to the configured artifact root.
   */
  readonly relativePath:
    string;

  /**
   * Absolute filesystem path available to the application/server.
   */
  readonly absolutePath:
    string;

  readonly filename:
    string;

  readonly byteLength:
    number;

  readonly contentHash:
    string;

  readonly persistedAt:
    Date;
}

export interface SaveMarkdownArtifactInput {
  sourceId:
    SourceId;

  documentId:
    string;

  canonicalUrl:
    string;

  markdown:
    string;

  /**
   * Optional precomputed SHA-256. Implementations should verify it when
   * supplied rather than silently trusting it.
   */
  contentHash?:
    string;
}
