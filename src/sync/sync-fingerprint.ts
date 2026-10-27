import {
  hashDocumentChunkSnapshot,
  hashWebDocumentSnapshot,
} from "../hashing/content-hasher.js";

import type {
  DocumentChunk,
} from "../chunking/document-chunk.js";

import type {
  WebDocument,
} from "../website/web-document.js";

/**
 * Stable document fingerprint for incremental synchronization.
 *
 * Phase 21 delegates its canonical snapshot serialization to the hashing
 * layer so sync and integrity diagnostics cannot silently drift apart.
 */
export function createWebDocumentSyncFingerprint(
  document:
    WebDocument,
): string {
  return hashWebDocumentSnapshot(
    document,
  ).value;
}

/**
 * Stable vector-relevant chunk fingerprint.
 */
export function createDocumentChunkSyncFingerprint(
  chunk:
    DocumentChunk,
): string {
  return hashDocumentChunkSnapshot(
    chunk,
  ).value;
}
