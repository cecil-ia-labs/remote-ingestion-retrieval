import {
  compareContentHashTraces,
} from "../hashing/content-hash-comparison.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  createWebDocumentSyncFingerprint,
} from "./sync-fingerprint.js";

import type {
  IncrementalSyncState,
} from "./incremental-sync-state.js";

import type {
  WebsiteSyncDocumentChange,
  WebsiteSyncPlan,
} from "./website-sync.types.js";

export interface WebsiteSyncPlannerInput {
  readonly documents:
    readonly WebDocument[];

  readonly previous:
    IncrementalSyncState | null;

  readonly pipelineRevision:
    string;

  readonly snapshotComplete:
    boolean;
}

export class WebsiteSyncPlanner {
  plan(
    input:
      WebsiteSyncPlannerInput,
  ): WebsiteSyncPlan {
    const previousDocuments =
      new Map(
        (
          input.previous
            ?.documents
          ?? []
        ).map(
          (document) => [
            document.documentId,
            document,
          ],
        ),
      );

    const pipelineChanged =
      input.previous !== null
      && input.previous.pipelineRevision
        !== input.pipelineRevision;

    const added:
      WebsiteSyncDocumentChange[] = [];

    const changed:
      WebsiteSyncDocumentChange[] = [];

    const unchanged:
      WebsiteSyncDocumentChange[] = [];

    const removed:
      WebsiteSyncDocumentChange[] = [];

    const currentIds =
      new Set<string>();

    for (
      const document
      of input.documents
    ) {
      currentIds.add(
        document.id,
      );

      const previous =
        previousDocuments.get(
          document.id,
        );

      if (!previous) {
        added.push({
          status:
            "added",
          reason:
            "new-document",
          documentId:
            document.id,
          canonicalUrl:
            document.canonicalUrl,
          currentContentHash:
            document.contentHash,
        });

        continue;
      }

      const currentFingerprint =
        createWebDocumentSyncFingerprint(
          document,
        );

      const sameContent =
        previous.contentHash
        === document.contentHash;

      const sameFingerprint =
        previous.syncFingerprint
        === currentFingerprint;

      if (
        !pipelineChanged
        && sameContent
        && sameFingerprint
      ) {
        unchanged.push({
          status:
            "unchanged",
          reason:
            "unchanged",
          documentId:
            document.id,
          canonicalUrl:
            document.canonicalUrl,
          previousContentHash:
            previous.contentHash,
          currentContentHash:
            document.contentHash,
          hashComparison:
            previous.hashes
            && document.hashes
              ? compareContentHashTraces(
                  previous.hashes,
                  document.hashes,
                )
              : undefined,
        });

        continue;
      }

      const reason =
        pipelineChanged
          ? "pipeline-revision"
          : !sameContent
            ? "content"
            : "metadata";

      changed.push({
        status:
          "changed",
        reason,
        documentId:
          document.id,
        canonicalUrl:
          document.canonicalUrl,
        previousContentHash:
          previous.contentHash,
        currentContentHash:
          document.contentHash,
        hashComparison:
          previous.hashes
          && document.hashes
            ? compareContentHashTraces(
                previous.hashes,
                document.hashes,
              )
            : undefined,
      });
    }

    if (
      input.snapshotComplete
    ) {
      for (
        const previous
        of input.previous
          ?.documents
        ?? []
      ) {
        if (
          currentIds.has(
            previous.documentId,
          )
        ) {
          continue;
        }

        removed.push({
          status:
            "removed",
          reason:
            "removed",
          documentId:
            previous.documentId,
          canonicalUrl:
            previous.canonicalUrl,
          previousContentHash:
            previous.contentHash,
        });
      }
    }

    return {
      snapshotComplete:
        input.snapshotComplete,
      pipelineChanged,
      added:
        Object.freeze(added),
      changed:
        Object.freeze(changed),
      unchanged:
        Object.freeze(unchanged),
      removed:
        Object.freeze(removed),
      stats: {
        added:
          added.length,
        changed:
          changed.length,
        unchanged:
          unchanged.length,
        removed:
          removed.length,
      },
    };
  }
}
