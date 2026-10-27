import type {
  ContentHash,
} from "../hashing/content-hash.js";

import type {
  DocumentMetadata,
} from "../extraction/document-metadata.js";

export interface NormalizedDocument {
  /**
   * Canonical Markdown representation consumed by later chunking phases.
   */
  markdown: string;

  metadata: DocumentMetadata;

  /** SHA-256 of canonical normalized Markdown. */
  contentHash?:
    ContentHash;
}
