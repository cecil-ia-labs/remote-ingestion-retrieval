import type {
  DocumentChunk,
} from "../chunking/document-chunk.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  createDocumentChunkSyncFingerprint,
  createWebDocumentSyncFingerprint,
} from "./sync-fingerprint.js";

import type {
  IncrementalChunkState,
  IncrementalDocumentState,
} from "./incremental-sync-state.js";

export interface IncrementalDocumentGateResult {
  readonly reusable:
    boolean;

  readonly currentFingerprint:
    string;
}

export interface IncrementalChunkPlan {
  readonly upsertChunks:
    readonly DocumentChunk[];

  readonly unchangedChunkIds:
    readonly string[];

  readonly deleteChunkIds:
    readonly string[];

  readonly currentState:
    IncrementalDocumentState;
}

export class IncrementalSyncPlanner {
  assessDocument(
    document:
      WebDocument,

    previous:
      IncrementalDocumentState | undefined,

    pipelineCompatible:
      boolean,
  ): IncrementalDocumentGateResult {
    const currentFingerprint =
      createWebDocumentSyncFingerprint(
        document,
      );

    return {
      reusable:
        pipelineCompatible
        && previous !== undefined
        && previous.contentHash
          === document.contentHash
        && previous.syncFingerprint
          === currentFingerprint,
      currentFingerprint,
    };
  }

  planChunks(
    document:
      WebDocument,

    chunks:
      readonly DocumentChunk[],

    previous:
      IncrementalDocumentState | undefined,

    pipelineCompatible:
      boolean,
  ): IncrementalChunkPlan {
    const previousChunks =
      new Map(
        (
          previous?.chunks
          ?? []
        ).map(
          (chunk) => [
            chunk.id,
            chunk,
          ],
        ),
      );

    const currentStates:
      IncrementalChunkState[] = [];

    const upsertChunks:
      DocumentChunk[] = [];

    const unchangedChunkIds:
      string[] = [];

    const currentIds =
      new Set<string>();

    for (
      const chunk
      of chunks
    ) {
      const syncFingerprint =
        createDocumentChunkSyncFingerprint(
          chunk,
        );

      currentIds.add(
        chunk.id,
      );

      currentStates.push({
        id:
          chunk.id,
        contentHash:
          chunk.contentHash,
        syncFingerprint,
      });

      const previousChunk =
        previousChunks.get(
          chunk.id,
        );

      if (
        pipelineCompatible
        && previousChunk
        && previousChunk.contentHash
          === chunk.contentHash
        && previousChunk.syncFingerprint
          === syncFingerprint
      ) {
        unchangedChunkIds.push(
          chunk.id,
        );
      } else {
        upsertChunks.push(
          chunk,
        );
      }
    }

    const deleteChunkIds =
      (
        previous?.chunks
        ?? []
      )
        .filter(
          (chunk) =>
            !currentIds.has(
              chunk.id,
            ),
        )
        .map(
          (chunk) =>
            chunk.id,
        );

    return {
      upsertChunks:
        Object.freeze(
          upsertChunks,
        ),
      unchangedChunkIds:
        Object.freeze(
          unchangedChunkIds,
        ),
      deleteChunkIds:
        Object.freeze(
          deleteChunkIds,
        ),
      currentState: {
        documentId:
          document.id,
        canonicalUrl:
          document.canonicalUrl,
        contentHash:
          document.contentHash,
        syncFingerprint:
          createWebDocumentSyncFingerprint(
            document,
          ),
        hashes:
          document.hashes,
        chunks:
          Object.freeze(
            currentStates,
          ),
      },
    };
  }
}
