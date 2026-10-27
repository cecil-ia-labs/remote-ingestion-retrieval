import {
  INCREMENTAL_SYNC_STATE_SCHEMA_VERSION,
} from "./incremental-sync-state.js";

import type {
  IncrementalSyncState,
} from "./incremental-sync-state.js";

import {
  InvalidIncrementalSyncStateError,
} from "./incremental-sync.errors.js";

export function validateIncrementalSyncState(
  state:
    IncrementalSyncState,
): void {
  if (
    state.schemaVersion
    !== INCREMENTAL_SYNC_STATE_SCHEMA_VERSION
  ) {
    throw new InvalidIncrementalSyncStateError(
      `Unsupported incremental sync state schema version: ${String(state.schemaVersion)}`,
    );
  }

  if (
    !state.sourceId
    || !state.pipelineRevision
  ) {
    throw new InvalidIncrementalSyncStateError(
      "Incremental sync state requires sourceId and pipelineRevision.",
    );
  }

  const documentIds =
    new Set<string>();

  const chunkIds =
    new Set<string>();

  for (
    const document
    of state.documents
  ) {
    if (
      documentIds.has(
        document.documentId,
      )
    ) {
      throw new InvalidIncrementalSyncStateError(
        `Duplicate document state: ${document.documentId}`,
      );
    }

    documentIds.add(
      document.documentId,
    );

    for (
      const chunk
      of document.chunks
    ) {
      if (
        chunkIds.has(
          chunk.id,
        )
      ) {
        throw new InvalidIncrementalSyncStateError(
          `Duplicate chunk state: ${chunk.id}`,
        );
      }

      chunkIds.add(
        chunk.id,
      );
    }
  }

  const updatedAt =
    Date.parse(
      state.updatedAt,
    );

  if (
    Number.isNaN(
      updatedAt,
    )
  ) {
    throw new InvalidIncrementalSyncStateError(
      "Incremental sync state updatedAt must be a valid ISO date.",
    );
  }
}
