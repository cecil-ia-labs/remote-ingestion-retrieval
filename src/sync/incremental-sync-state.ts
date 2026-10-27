import type {
  SourceId,
} from "../domain/source.types.js";

import type {
  ContentHashTrace,
} from "../hashing/content-hash.js";

import type {
  DocumentChunkId,
} from "../chunking/document-chunk.js";

import type {
  WebDocumentId,
} from "../website/web-document.js";

export const INCREMENTAL_SYNC_STATE_SCHEMA_VERSION =
  1 as const;

export interface IncrementalChunkState {
  readonly id:
    DocumentChunkId;

  readonly contentHash:
    string;

  /**
   * Stable fingerprint covering vector-relevant chunk metadata while ignoring
   * ephemeral acquisition timestamps.
   */
  readonly syncFingerprint:
    string;
}

export interface IncrementalDocumentState {
  readonly documentId:
    WebDocumentId;

  readonly canonicalUrl:
    string;

  readonly contentHash:
    string;

  /**
   * Stable semantic/document metadata fingerprint used by the pre-chunk gate.
   */
  readonly syncFingerprint:
    string;

  /** Optional stage-by-stage integrity trace retained for website reconciliation. */
  readonly hashes?:
    ContentHashTrace;

  readonly chunks:
    readonly IncrementalChunkState[];
}

export interface IncrementalSyncState {
  readonly schemaVersion:
    typeof INCREMENTAL_SYNC_STATE_SCHEMA_VERSION;

  readonly sourceId:
    SourceId;

  readonly namespace?:
    string;

  /**
   * Caller-controlled revision for splitter / embedding / metadata-projection
   * semantics. Changing it invalidates reuse from the previous snapshot.
   */
  readonly pipelineRevision:
    string;

  readonly documents:
    readonly IncrementalDocumentState[];

  readonly updatedAt:
    string;
}

export interface IncrementalSyncStateKey {
  readonly sourceId:
    SourceId;

  readonly namespace?:
    string;
}
