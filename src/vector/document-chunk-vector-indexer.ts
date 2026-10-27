import type {
  DocumentChunk,
} from "../chunking/document-chunk.js";

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
  EmbeddingProvider,
} from "./embedding-provider.js";

import {
  DefaultVectorMetadataProjector,
} from "./vector-metadata-projector.js";

import type {
  VectorMetadataProjector,
} from "./vector-metadata-projector.js";

import type {
  VectorRecord,
  VectorRecordId,
} from "./vector-record.js";

import type {
  VectorStore,
} from "./vector-store.js";

import {
  DuplicateDocumentChunkIdError,
  EmbeddingCountMismatchError,
  EmbeddingDimensionMismatchError,
  InvalidEmbeddingVectorError,
  InvalidVectorBatchSizeError,
  VectorIndexingAbortedError,
  VectorIndexingBatchError,
} from "./vector-indexing.errors.js";

export interface DocumentChunkVectorIndexerOptions {
  embeddingProvider:
    EmbeddingProvider;

  vectorStore:
    VectorStore;

  metadataProjector?:
    VectorMetadataProjector;

  embeddingBatchSize?:
    number;

  upsertBatchSize?:
    number;

  deleteBatchSize?:
    number;

  observability?:
    ObservabilityHub;
}

export interface VectorIndexingRequestOptions {
  readonly namespace?:
    string;

  readonly signal?:
    AbortSignal;
}

export interface VectorIndexingStats {
  readonly chunksReceived:
    number;

  readonly embeddingBatches:
    number;

  readonly vectorsCreated:
    number;

  readonly upsertBatches:
    number;

  readonly recordsUpserted:
    number;

  readonly dimensions:
    number;
}

export interface VectorIndexingResult {
  readonly embeddingProvider:
    string;

  readonly vectorStore:
    string;

  readonly namespace?:
    string;

  readonly recordIds:
    readonly VectorRecordId[];

  readonly stats:
    VectorIndexingStats;
}

export interface VectorDeletionStats {
  readonly idsReceived:
    number;

  readonly uniqueIds:
    number;

  readonly deleteBatches:
    number;

  readonly idsDeleted:
    number;
}

export interface VectorDeletionResult {
  readonly vectorStore:
    string;

  readonly namespace?:
    string;

  readonly stats:
    VectorDeletionStats;
}

function assertBatchSize(
  optionName:
    "embeddingBatchSize"
    | "upsertBatchSize"
    | "deleteBatchSize",

  value:
    number,
): number {
  if (
    !Number.isInteger(
      value,
    )
    || value <= 0
  ) {
    throw new InvalidVectorBatchSizeError(
      optionName,
      value,
    );
  }

  return value;
}

function effectiveBatchSize(
  configured:
    number,

  providerLimit:
    number | undefined,
): number {
  if (
    providerLimit === undefined
  ) {
    return configured;
  }

  if (
    !Number.isInteger(
      providerLimit,
    )
    || providerLimit <= 0
  ) {
    return configured;
  }

  return Math.min(
    configured,
    providerLimit,
  );
}

function batches<T>(
  items:
    readonly T[],

  batchSize:
    number,
): readonly (readonly T[])[] {
  const result:
    T[][] = [];

  for (
    let offset = 0;
    offset < items.length;
    offset += batchSize
  ) {
    result.push(
      items.slice(
        offset,
        offset + batchSize,
      ),
    );
  }

  return result;
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
    throw new VectorIndexingAbortedError();
  }
}

function validateVector(
  vector:
    readonly number[],

  inputIndex:
    number,

  provider:
    EmbeddingProvider,

  expectedDimensions:
    number | undefined,
): number {
  if (
    vector.length === 0
  ) {
    throw new InvalidEmbeddingVectorError(
      provider.name,
      inputIndex,
      "vector is empty",
    );
  }

  for (
    const value
    of vector
  ) {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      throw new InvalidEmbeddingVectorError(
        provider.name,
        inputIndex,
        "all values must be finite numbers",
      );
    }
  }

  if (
    expectedDimensions !== undefined
    && vector.length
      !== expectedDimensions
  ) {
    throw new EmbeddingDimensionMismatchError(
      expectedDimensions,
      vector.length,
      provider.name,
    );
  }

  return vector.length;
}

export class DocumentChunkVectorIndexer {
  private readonly embeddingProvider:
    EmbeddingProvider;

  private readonly vectorStore:
    VectorStore;

  private readonly metadataProjector:
    VectorMetadataProjector;

  private readonly embeddingBatchSize:
    number;

  private readonly upsertBatchSize:
    number;

  private readonly deleteBatchSize:
    number;

  private readonly observability:
    ObservabilityHub;

  constructor(
    options:
      DocumentChunkVectorIndexerOptions,
  ) {
    this.embeddingProvider =
      options.embeddingProvider;

    this.vectorStore =
      options.vectorStore;

    this.metadataProjector =
      options.metadataProjector
      ?? new DefaultVectorMetadataProjector();

    this.embeddingBatchSize =
      assertBatchSize(
        "embeddingBatchSize",
        options.embeddingBatchSize
        ?? 32,
      );

    this.upsertBatchSize =
      assertBatchSize(
        "upsertBatchSize",
        options.upsertBatchSize
        ?? 100,
      );

    this.deleteBatchSize =
      assertBatchSize(
        "deleteBatchSize",
        options.deleteBatchSize
        ?? 100,
      );

    this.observability =
      options.observability
      ?? defaultObservabilityHub;
  }

  async index(
    chunks:
      readonly DocumentChunk[],

    options:
      VectorIndexingRequestOptions = {},
  ): Promise<VectorIndexingResult> {
    return this.observability.stage(
      "vector.indexer",
      {
        attributes:
          observabilityAttributes({
            chunks:
              chunks.length,
            namespace:
              options.namespace,
            embeddingProvider:
              this.embeddingProvider.name,
            vectorStore:
              this.vectorStore.name,
          }),
      },
      () => this.indexObserved(
        chunks,
        options,
      ),
    );
  }

  private async indexObserved(
    chunks:
      readonly DocumentChunk[],

    options:
      VectorIndexingRequestOptions = {},
  ): Promise<VectorIndexingResult> {
    assertNotAborted(
      options.signal,
    );

    const seen =
      new Set<string>();

    for (
      const chunk
      of chunks
    ) {
      if (
        seen.has(
          chunk.id,
        )
      ) {
        throw new DuplicateDocumentChunkIdError(
          chunk.id,
        );
      }

      seen.add(
        chunk.id,
      );
    }

    if (
      chunks.length === 0
    ) {
      return {
        embeddingProvider:
          this.embeddingProvider.name,
        vectorStore:
          this.vectorStore.name,
        namespace:
          options.namespace,
        recordIds:
          Object.freeze([]),
        stats: {
          chunksReceived:
            0,
          embeddingBatches:
            0,
          vectorsCreated:
            0,
          upsertBatches:
            0,
          recordsUpserted:
            0,
          dimensions:
            this.embeddingProvider
              .dimensions
            ?? 0,
        },
      };
    }

    const embeddingBatchSize =
      effectiveBatchSize(
        this.embeddingBatchSize,
        this.embeddingProvider
          .maxBatchSize,
      );

    const embeddingBatches =
      batches(
        chunks,
        embeddingBatchSize,
      );

    const records:
      VectorRecord[] = [];

    let dimensions =
      this.embeddingProvider
        .dimensions;

    let embeddedCount =
      0;

    for (
      let batchIndex = 0;
      batchIndex < embeddingBatches.length;
      batchIndex += 1
    ) {
      assertNotAborted(
        options.signal,
      );

      const batch =
        embeddingBatches[
          batchIndex
        ];

      if (!batch) {
        continue;
      }

      consumeExecutionBudget(
        "embeddingInputs",
        batch.length,
        {
          stage:
            "embed",
        },
      );

      let vectors:
        readonly (readonly number[])[];

      try {
        vectors =
          await this.observability.stage(
            "embedding.batch",
            {
              attributes:
                observabilityAttributes({
                  batchIndex,
                  batchSize:
                    batch.length,
                  provider:
                    this.embeddingProvider.name,
                }),
            },
            () => this.embeddingProvider.embed(
              batch.map(
                (chunk) =>
                  chunk.markdown,
              ),
              {
                sourceId:
                  batch[0]
                    ?.sourceId,
                documentId:
                  batch[0]
                    ?.documentId,
                signal:
                  options.signal,
              },
            ),
          );
      } catch (cause) {
        assertNotAborted(
          options.signal,
        );

        throw new VectorIndexingBatchError(
          "embedding",
          batchIndex,
          embeddedCount,
          {
            cause,
          },
        );
      }

      if (
        vectors.length
        !== batch.length
      ) {
        throw new EmbeddingCountMismatchError(
          batch.length,
          vectors.length,
          this.embeddingProvider.name,
        );
      }

      for (
        let index = 0;
        index < batch.length;
        index += 1
      ) {
        const chunk =
          batch[index];

        const vector =
          vectors[index];

        if (
          !chunk
          || !vector
        ) {
          continue;
        }

        const actualDimensions =
          validateVector(
            vector,
            embeddedCount + index,
            this.embeddingProvider,
            dimensions,
          );

        dimensions ??=
          actualDimensions;

        records.push({
          id:
            chunk.id,
          values:
            Object.freeze([
              ...vector,
            ]),
          text:
            chunk.markdown,
          metadata:
            this.metadataProjector
              .project(
                chunk,
              ),
        });
      }

      embeddedCount +=
        batch.length;
    }

    const upsertBatchSize =
      effectiveBatchSize(
        this.upsertBatchSize,
        this.vectorStore
          .maxUpsertBatchSize,
      );

    const upsertBatches =
      batches(
        records,
        upsertBatchSize,
      );

    let recordsUpserted =
      0;

    for (
      let batchIndex = 0;
      batchIndex < upsertBatches.length;
      batchIndex += 1
    ) {
      assertNotAborted(
        options.signal,
      );

      const batch =
        upsertBatches[
          batchIndex
        ];

      if (!batch) {
        continue;
      }

      consumeExecutionBudget(
        "vectorUpserts",
        batch.length,
        {
          stage:
            "vector-upsert",
        },
      );

      try {
        const result =
          await this.observability.stage(
            "vector.upsert.batch",
            {
              attributes:
                observabilityAttributes({
                  batchIndex,
                  batchSize:
                    batch.length,
                  vectorStore:
                    this.vectorStore.name,
                }),
            },
            () => this.vectorStore.upsert(
              batch,
              {
                namespace:
                  options.namespace,
                signal:
                  options.signal,
              },
            ),
          );

        recordsUpserted +=
          result?.accepted
          ?? batch.length;
      } catch (cause) {
        assertNotAborted(
          options.signal,
        );

        throw new VectorIndexingBatchError(
          "upsert",
          batchIndex,
          recordsUpserted,
          {
            cause,
          },
        );
      }
    }

    await this.observability.metric(
      "embedding.vectors_created",
      records.length,
      { unit: "count" },
    );

    await this.observability.metric(
      "embedding.dimensions",
      dimensions
      ?? 0,
      { unit: "dimensions" },
    );

    await this.observability.metric(
      "vector.records_upserted",
      recordsUpserted,
      { unit: "count" },
    );

    return {
      embeddingProvider:
        this.embeddingProvider.name,
      vectorStore:
        this.vectorStore.name,
      namespace:
        options.namespace,
      recordIds:
        Object.freeze(
          records.map(
            (record) =>
              record.id,
          ),
        ),
      stats: {
        chunksReceived:
          chunks.length,
        embeddingBatches:
          embeddingBatches.length,
        vectorsCreated:
          records.length,
        upsertBatches:
          upsertBatches.length,
        recordsUpserted,
        dimensions:
          dimensions
          ?? 0,
      },
    };
  }

  async deleteIds(
    ids:
      readonly VectorRecordId[],

    options:
      VectorIndexingRequestOptions = {},
  ): Promise<VectorDeletionResult> {
    return this.observability.stage(
      "vector.deletion",
      {
        attributes:
          observabilityAttributes({
            ids:
              ids.length,
            namespace:
              options.namespace,
            vectorStore:
              this.vectorStore.name,
          }),
      },
      () => this.deleteIdsObserved(
        ids,
        options,
      ),
    );
  }

  private async deleteIdsObserved(
    ids:
      readonly VectorRecordId[],

    options:
      VectorIndexingRequestOptions = {},
  ): Promise<VectorDeletionResult> {
    assertNotAborted(
      options.signal,
    );

    const uniqueIds =
      [
        ...new Set(
          ids,
        ),
      ];

    const deleteBatchSize =
      effectiveBatchSize(
        this.deleteBatchSize,
        this.vectorStore
          .maxDeleteBatchSize,
      );

    const deleteBatches =
      batches(
        uniqueIds,
        deleteBatchSize,
      );

    let idsDeleted =
      0;

    for (
      let batchIndex = 0;
      batchIndex < deleteBatches.length;
      batchIndex += 1
    ) {
      assertNotAborted(
        options.signal,
      );

      const batch =
        deleteBatches[
          batchIndex
        ];

      if (!batch) {
        continue;
      }

      consumeExecutionBudget(
        "vectorDeletes",
        batch.length,
        {
          stage:
            "vector-delete",
        },
      );

      try {
        const result =
          await this.observability.stage(
            "vector.delete.batch",
            {
              attributes:
                observabilityAttributes({
                  batchIndex,
                  batchSize:
                    batch.length,
                  vectorStore:
                    this.vectorStore.name,
                }),
            },
            () => this.vectorStore.delete(
              batch,
              {
                namespace:
                  options.namespace,
                signal:
                  options.signal,
              },
            ),
          );

        idsDeleted +=
          result?.deleted
          ?? batch.length;
      } catch (cause) {
        assertNotAborted(
          options.signal,
        );

        throw new VectorIndexingBatchError(
          "delete",
          batchIndex,
          idsDeleted,
          {
            cause,
          },
        );
      }
    }

    await this.observability.metric(
      "vector.ids_deleted",
      idsDeleted,
      { unit: "count" },
    );

    return {
      vectorStore:
        this.vectorStore.name,
      namespace:
        options.namespace,
      stats: {
        idsReceived:
          ids.length,
        uniqueIds:
          uniqueIds.length,
        deleteBatches:
          deleteBatches.length,
        idsDeleted,
      },
    };
  }

  async deleteChunks(
    chunks:
      readonly DocumentChunk[],

    options:
      VectorIndexingRequestOptions = {},
  ): Promise<VectorDeletionResult> {
    return this.deleteIds(
      chunks.map(
        (chunk) =>
          chunk.id,
      ),
      options,
    );
  }
}
