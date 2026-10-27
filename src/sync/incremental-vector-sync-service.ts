import type {
  WebDocumentChunkingResult,
} from "../chunking/document-chunk.js";

import type {
  DocumentChunk,
} from "../chunking/document-chunk.js";

import type {
  SourceId,
} from "../domain/source.types.js";

import {
  consumeExecutionBudget,
  throwIfExecutionBudgetAborted,
} from "../limits/index.js";

import {
  defaultObservabilityHub,
  observabilityAttributes,
} from "../observability/index.js";

import type {
  ObservabilityHub,
} from "../observability/index.js";


import type {
  DocumentChunkVectorIndexer,
  VectorDeletionResult,
  VectorIndexingResult,
} from "../vector/document-chunk-vector-indexer.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  DuplicateIncrementalDocumentIdError,
  IncrementalChunkingResultMismatchError,
  IncrementalSyncAbortedError,
  InvalidPipelineRevisionError,
} from "./incremental-sync.errors.js";

import {
  IncrementalSyncPlanner,
} from "./incremental-sync-planner.js";

import type {
  IncrementalDocumentState,
  IncrementalSyncState,
} from "./incremental-sync-state.js";

import {
  INCREMENTAL_SYNC_STATE_SCHEMA_VERSION,
} from "./incremental-sync-state.js";

import type {
  IncrementalSyncStateStore,
} from "./incremental-sync-state-store.js";

export interface IncrementalVectorSyncServiceOptions {
  readonly stateStore:
    IncrementalSyncStateStore;

  readonly vectorIndexer:
    DocumentChunkVectorIndexer;

  readonly chunkDocument: (
    document:
      WebDocument,

    signal?:
      AbortSignal,
  ) => Promise<WebDocumentChunkingResult>;

  readonly planner?:
    IncrementalSyncPlanner;

  readonly now?:
    () => Date;

  readonly observability?:
    ObservabilityHub;
}

export type IncrementalSyncMode =
  | "full"
  | "partial";

export interface IncrementalVectorSyncRequest {
  readonly sourceId:
    SourceId;

  readonly documents:
    readonly WebDocument[];

  readonly pipelineRevision:
    string;

  /**
   * full: request.documents is the complete current source snapshot; omitted
   * previous documents are deleted.
   *
   * partial: only supplied documents are reconciled; omitted previous
   * documents are carried forward untouched.
   */
  readonly mode:
    IncrementalSyncMode;

  readonly namespace?:
    string;

  readonly signal?:
    AbortSignal;
}

export interface IncrementalVectorSyncStats {
  readonly previousStateFound:
    boolean;

  readonly pipelineChanged:
    boolean;

  readonly documentsReceived:
    number;

  readonly documentsNew:
    number;

  readonly documentsChanged:
    number;

  readonly documentsReusedWithoutChunking:
    number;

  readonly documentsDeleted:
    number;

  readonly documentsChunked:
    number;

  readonly chunksProduced:
    number;

  readonly chunksReused:
    number;

  readonly chunksUpserted:
    number;

  readonly chunksDeleted:
    number;

  readonly embeddingsAvoided:
    number;
}

export interface IncrementalVectorSyncResult {
  readonly sourceId:
    SourceId;

  readonly namespace?:
    string;

  readonly pipelineRevision:
    string;

  readonly mode:
    IncrementalSyncMode;

  readonly stats:
    IncrementalVectorSyncStats;

  readonly upsertedChunkIds:
    readonly string[];

  readonly deletedChunkIds:
    readonly string[];

  readonly reusedChunkIds:
    readonly string[];

  readonly indexing?:
    VectorIndexingResult;

  readonly deletion?:
    VectorDeletionResult;

  readonly state:
    IncrementalSyncState;
}

function assertNotAborted(
  signal:
    AbortSignal | undefined,
): void {
  throwIfExecutionBudgetAborted(
    signal,
  );

  if (
    signal?.aborted
  ) {
    throw new IncrementalSyncAbortedError();
  }
}

export class IncrementalVectorSyncService {
  private readonly stateStore:
    IncrementalSyncStateStore;

  private readonly vectorIndexer:
    DocumentChunkVectorIndexer;

  private readonly chunkDocument:
    IncrementalVectorSyncServiceOptions["chunkDocument"];

  private readonly planner:
    IncrementalSyncPlanner;

  private readonly now:
    () => Date;

  private readonly observability:
    ObservabilityHub;

  constructor(
    options:
      IncrementalVectorSyncServiceOptions,
  ) {
    this.stateStore =
      options.stateStore;

    this.vectorIndexer =
      options.vectorIndexer;

    this.chunkDocument =
      options.chunkDocument;

    this.planner =
      options.planner
      ?? new IncrementalSyncPlanner();

    this.now =
      options.now
      ?? (() => new Date());

    this.observability =
      options.observability
      ?? defaultObservabilityHub;
  }

  async sync(
    request:
      IncrementalVectorSyncRequest,
  ): Promise<IncrementalVectorSyncResult> {
    return this.observability.stage(
      "incremental.sync",
      {
        attributes:
          observabilityAttributes({
            sourceId:
              request.sourceId,
            namespace:
              request.namespace,
            mode:
              request.mode,
            documents:
              request.documents.length,
            pipelineRevision:
              request.pipelineRevision,
          }),
      },
      () => this.syncObserved(
        request,
      ),
    );
  }

  private async syncObserved(
    request:
      IncrementalVectorSyncRequest,
  ): Promise<IncrementalVectorSyncResult> {
    assertNotAborted(
      request.signal,
    );

    if (
      request.pipelineRevision.trim()
        .length === 0
    ) {
      throw new InvalidPipelineRevisionError();
    }

    const documentIds =
      new Set<string>();

    for (
      const document
      of request.documents
    ) {
      if (
        documentIds.has(
          document.id,
        )
      ) {
        throw new DuplicateIncrementalDocumentIdError(
          document.id,
        );
      }

      documentIds.add(
        document.id,
      );
    }

    const key = {
      sourceId:
        request.sourceId,
      namespace:
        request.namespace,
    };

    const mode =
      request.mode;

    const previous =
      await this.observability.stage(
        "sync.state.load",
        {},
        () => this.stateStore.load(
          key,
          request.signal,
        ),
      );

    assertNotAborted(
      request.signal,
    );

    const pipelineCompatible =
      previous?.pipelineRevision
      === request.pipelineRevision;

    const previousDocuments =
      new Map(
        (
          previous?.documents
          ?? []
        ).map(
          (document) => [
            document.documentId,
            document,
          ],
        ),
      );

    const nextDocuments:
      IncrementalDocumentState[] = [];

    const upsertChunks:
      DocumentChunk[] = [];

    const deleteIds =
      new Set<string>();

    const reusedChunkIds:
      string[] = [];

    let documentsNew = 0;
    let documentsChanged = 0;
    let documentsReusedWithoutChunking = 0;
    let documentsChunked = 0;
    let chunksProduced = 0;

    for (
      const document
      of request.documents
    ) {
      assertNotAborted(
        request.signal,
      );

      if (
        document.sourceId
        !== request.sourceId
      ) {
        throw new IncrementalChunkingResultMismatchError(
          `WebDocument ${document.id} belongs to source ${document.sourceId}, expected ${request.sourceId}.`,
        );
      }

      const previousDocument =
        previousDocuments.get(
          document.id,
        );

      const gate =
        this.planner.assessDocument(
          document,
          previousDocument,
          pipelineCompatible,
        );

      if (
        gate.reusable
        && previousDocument
      ) {
        documentsReusedWithoutChunking +=
          1;

        nextDocuments.push(
          previousDocument,
        );

        for (
          const chunk
          of previousDocument.chunks
        ) {
          reusedChunkIds.push(
            chunk.id,
          );
        }

        continue;
      }

      if (
        previousDocument
      ) {
        documentsChanged +=
          1;
      } else {
        documentsNew +=
          1;
      }

      const chunking =
        await this.observability.stage(
          "chunking.document",
          {
            attributes:
              observabilityAttributes({
                documentId:
                  document.id,
                canonicalUrl:
                  document.canonicalUrl,
                markdownBytes:
                  document.content.byteLength,
              }),
          },
          async () => {
            const value =
              await this.chunkDocument(
                document,
                request.signal,
              );

            await this.observability.metric(
              "chunking.chunks_produced",
              value.chunks.length,
              { unit: "count" },
            );

            return value;
          },
        );

      assertNotAborted(
        request.signal,
      );

      if (
        chunking.documentId
        !== document.id
        || chunking.sourceId
          !== request.sourceId
      ) {
        throw new IncrementalChunkingResultMismatchError(
          `Chunking result does not match WebDocument ${document.id}.`,
        );
      }

      consumeExecutionBudget(
        "chunks",
        chunking.chunks.length,
        {
          stage:
            "chunk",
          url:
            document.canonicalUrl,
        },
      );

      documentsChunked +=
        1;

      chunksProduced +=
        chunking.chunks.length;

      const plan =
        this.planner.planChunks(
          document,
          chunking.chunks,
          previousDocument,
          pipelineCompatible,
        );

      nextDocuments.push(
        plan.currentState,
      );

      upsertChunks.push(
        ...plan.upsertChunks,
      );

      reusedChunkIds.push(
        ...plan.unchangedChunkIds,
      );

      for (
        const id
        of plan.deleteChunkIds
      ) {
        deleteIds.add(
          id,
        );
      }
    }

    let documentsDeleted =
      0;

    for (
      const previousDocument
      of previous?.documents
      ?? []
    ) {
      if (
        documentIds.has(
          previousDocument.documentId,
        )
      ) {
        continue;
      }

      if (
        mode === "partial"
      ) {
        nextDocuments.push(
          previousDocument,
        );

        continue;
      }

      documentsDeleted +=
        1;

      for (
        const chunk
        of previousDocument.chunks
      ) {
        deleteIds.add(
          chunk.id,
        );
      }
    }

    const currentChunkIds =
      new Set(
        nextDocuments.flatMap(
          (document) =>
            document.chunks.map(
              (chunk) =>
                chunk.id,
            ),
        ),
      );

    for (
      const id
      of currentChunkIds
    ) {
      deleteIds.delete(
        id,
      );
    }

    let indexing:
      VectorIndexingResult | undefined;

    if (
      upsertChunks.length > 0
    ) {
      indexing =
        await this.observability.stage(
          "vector.index",
          {
            attributes:
              observabilityAttributes({
                chunks:
                  upsertChunks.length,
              }),
          },
          () => this.vectorIndexer.index(
            upsertChunks,
            {
              namespace:
                request.namespace,
              signal:
                request.signal,
            },
          ),
        );
    }

    assertNotAborted(
      request.signal,
    );

    let deletion:
      VectorDeletionResult | undefined;

    const deletedChunkIds =
      Object.freeze([
        ...deleteIds,
      ]);

    if (
      deletedChunkIds.length > 0
    ) {
      deletion =
        await this.observability.stage(
          "vector.delete",
          {
            attributes:
              observabilityAttributes({
                ids:
                  deletedChunkIds.length,
              }),
          },
          () => this.vectorIndexer.deleteIds(
            deletedChunkIds,
            {
              namespace:
                request.namespace,
              signal:
                request.signal,
            },
          ),
        );
    }

    assertNotAborted(
      request.signal,
    );

    const state:
      IncrementalSyncState = {
      schemaVersion:
        INCREMENTAL_SYNC_STATE_SCHEMA_VERSION,
      sourceId:
        request.sourceId,
      namespace:
        request.namespace,
      pipelineRevision:
        request.pipelineRevision,
      documents:
        Object.freeze(
          nextDocuments,
        ),
      updatedAt:
        this.now()
          .toISOString(),
    };

    await this.observability.stage(
      "sync.state.save",
      {
        attributes:
          observabilityAttributes({
            documents:
              state.documents.length,
          }),
      },
      () => this.stateStore.save(
        state,
        request.signal,
      ),
    );

    const upsertedChunkIds =
      Object.freeze(
        upsertChunks.map(
          (chunk) =>
            chunk.id,
        ),
      );

    const reused =
      Object.freeze([
        ...new Set(
          reusedChunkIds,
        ),
      ]);

    await this.observability.metric(
      "incremental.documents_reused",
      documentsReusedWithoutChunking,
      { unit: "count" },
    );

    await this.observability.metric(
      "incremental.chunks_upserted",
      upsertedChunkIds.length,
      { unit: "count" },
    );

    await this.observability.metric(
      "incremental.chunks_deleted",
      deletedChunkIds.length,
      { unit: "count" },
    );

    await this.observability.metric(
      "incremental.embeddings_avoided",
      reused.length,
      { unit: "count" },
    );

    return {
      sourceId:
        request.sourceId,
      namespace:
        request.namespace,
      pipelineRevision:
        request.pipelineRevision,
      mode,
      stats: {
        previousStateFound:
          previous !== null,
        pipelineChanged:
          previous !== null
          && !pipelineCompatible,
        documentsReceived:
          request.documents.length,
        documentsNew,
        documentsChanged,
        documentsReusedWithoutChunking,
        documentsDeleted,
        documentsChunked,
        chunksProduced,
        chunksReused:
          reused.length,
        chunksUpserted:
          upsertedChunkIds.length,
        chunksDeleted:
          deletedChunkIds.length,
        embeddingsAvoided:
          reused.length,
      },
      upsertedChunkIds,
      deletedChunkIds,
      reusedChunkIds:
        reused,
      indexing,
      deletion,
      state,
    };
  }
}
