import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DocumentChunk,
} from "../../chunking/document-chunk.js";

import type {
  EmbeddingProvider,
} from "../embedding-provider.js";

import {
  DocumentChunkVectorIndexer,
} from "../document-chunk-vector-indexer.js";

import {
  DuplicateDocumentChunkIdError,
  EmbeddingDimensionMismatchError,
} from "../vector-indexing.errors.js";

import type {
  VectorRecord,
  VectorRecordId,
} from "../vector-record.js";

import type {
  VectorStore,
  VectorStoreOperationContext,
} from "../vector-store.js";

function chunk(
  ordinal:
    number,
): DocumentChunk {
  const markdown =
    `# Section ${ordinal}\n\nContent ${ordinal}.`;

  return {
    id:
      `webchunk_${ordinal}`,
    sourceId:
      "source_fixture",
    documentId:
      "webdoc_fixture",
    ordinal,
    markdown,
    contentHash:
      `hash_${ordinal}`,
    byteLength:
      Buffer.byteLength(
        markdown,
      ),
    characterLength:
      markdown.length,
    metadata: {
      schemaVersion:
        1,
      document: {
        id:
          "webdoc_fixture",
        sourceId:
          "source_fixture",
        url:
          "https://example.com/docs",
        canonicalUrl:
          "https://example.com/docs",
        title:
          "Docs",
        resourceType:
          "html",
        contentHash:
          "document_hash",
        processedAt:
          "2026-09-16T12:00:00.000Z",
      },
      acquisition: {
        requestedUrl:
          "https://example.com/docs",
        resolvedUrl:
          "https://example.com/docs",
        fetchedByteLength:
          100,
        fetchedAt:
          "2026-09-16T11:59:59.000Z",
        extractedAt:
          "2026-09-16T12:00:00.000Z",
      },
      chunk: {
        ordinal,
        total:
          5,
        contentHash:
          `hash_${ordinal}`,
        byteLength:
          Buffer.byteLength(
            markdown,
          ),
        characterLength:
          markdown.length,
        lineCount:
          3,
        nonEmptyLineCount:
          2,
        headingPath: [
          `Section ${ordinal}`,
        ],
        headingLevels: [
          1,
        ],
        sourceRange: {
          resolved:
            true,
          startOffset:
            ordinal * 10,
          endOffset:
            ordinal * 10
            + markdown.length,
          startLine:
            ordinal * 3
            + 1,
          endLine:
            ordinal * 3
            + 3,
        },
      },
      splitter: {
        name:
          "fixture",
      },
    },
  };
}

class FixtureEmbeddingProvider
  implements EmbeddingProvider {
  readonly name =
    "fixture-embedding";

  readonly dimensions =
    3;

  readonly maxBatchSize =
    2;

  readonly batchSizes:
    number[] = [];

  async embed(
    texts:
      readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    this.batchSizes.push(
      texts.length,
    );

    return texts.map(
      (text, index) => [
        text.length,
        index,
        1,
      ],
    );
  }
}

class MemoryVectorStore
  implements VectorStore {
  readonly name =
    "memory-store";

  readonly maxUpsertBatchSize =
    2;

  readonly maxDeleteBatchSize =
    2;

  readonly records =
    new Map<string, VectorRecord>();

  readonly upsertBatchSizes:
    number[] = [];

  readonly deleteBatchSizes:
    number[] = [];

  async upsert(
    records:
      readonly VectorRecord[],

    _context?:
      VectorStoreOperationContext,
  ): Promise<{ readonly accepted: number }> {
    this.upsertBatchSizes.push(
      records.length,
    );

    for (
      const record
      of records
    ) {
      this.records.set(
        record.id,
        record,
      );
    }

    return {
      accepted:
        records.length,
    };
  }

  async delete(
    ids:
      readonly VectorRecordId[],
  ): Promise<{ readonly deleted: number }> {
    this.deleteBatchSizes.push(
      ids.length,
    );

    let deleted =
      0;

    for (
      const id
      of ids
    ) {
      if (
        this.records.delete(
          id,
        )
      ) {
        deleted +=
          1;
      }
    }

    return {
      deleted,
    };
  }
}

test(
  "embeds and upserts chunks in provider/store-aware batches",
  async () => {
    const provider =
      new FixtureEmbeddingProvider();

    const store =
      new MemoryVectorStore();

    const indexer =
      new DocumentChunkVectorIndexer({
        embeddingProvider:
          provider,
        vectorStore:
          store,
        embeddingBatchSize:
          10,
        upsertBatchSize:
          10,
      });

    const chunks = [
      chunk(0),
      chunk(1),
      chunk(2),
      chunk(3),
      chunk(4),
    ];

    const result =
      await indexer.index(
        chunks,
        {
          namespace:
            "docs",
        },
      );

    assert.deepEqual(
      provider.batchSizes,
      [2, 2, 1],
    );

    assert.deepEqual(
      store.upsertBatchSizes,
      [2, 2, 1],
    );

    assert.equal(
      result.stats.dimensions,
      3,
    );

    assert.equal(
      result.stats.recordsUpserted,
      5,
    );

    assert.equal(
      store.records.size,
      5,
    );

    const record =
      store.records.get(
        "webchunk_2",
      );

    if (!record) {
      throw new Error(
        "Expected indexed vector record.",
      );
    }

    assert.equal(
      record.metadata.chunkId,
      "webchunk_2",
    );

    assert.equal(
      record.metadata.canonicalUrl,
      "https://example.com/docs",
    );

    assert.equal(
      record.text,
      chunks[2]?.markdown,
    );
  },
);

test(
  "upsert is idempotent by stable chunk id",
  async () => {
    const provider =
      new FixtureEmbeddingProvider();

    const store =
      new MemoryVectorStore();

    const indexer =
      new DocumentChunkVectorIndexer({
        embeddingProvider:
          provider,
        vectorStore:
          store,
      });

    const chunks = [
      chunk(0),
      chunk(1),
    ];

    await indexer.index(
      chunks,
    );

    await indexer.index(
      chunks,
    );

    assert.equal(
      store.records.size,
      2,
    );
  },
);

test(
  "rejects duplicate ids before calling embeddings",
  async () => {
    const provider =
      new FixtureEmbeddingProvider();

    const store =
      new MemoryVectorStore();

    const indexer =
      new DocumentChunkVectorIndexer({
        embeddingProvider:
          provider,
        vectorStore:
          store,
      });

    await assert.rejects(
      () =>
        indexer.index([
          chunk(0),
          chunk(0),
        ]),
      DuplicateDocumentChunkIdError,
    );

    assert.deepEqual(
      provider.batchSizes,
      [],
    );
  },
);

test(
  "validates embedding dimensions",
  async () => {
    const provider:
      EmbeddingProvider = {
      name:
        "bad-dimensions",
      dimensions:
        3,
      async embed() {
        return [
          [1, 2],
        ];
      },
    };

    const indexer =
      new DocumentChunkVectorIndexer({
        embeddingProvider:
          provider,
        vectorStore:
          new MemoryVectorStore(),
      });

    await assert.rejects(
      () =>
        indexer.index([
          chunk(0),
        ]),
      EmbeddingDimensionMismatchError,
    );
  },
);

test(
  "deletes explicit chunk ids in batches and deduplicates the request",
  async () => {
    const provider =
      new FixtureEmbeddingProvider();

    const store =
      new MemoryVectorStore();

    const indexer =
      new DocumentChunkVectorIndexer({
        embeddingProvider:
          provider,
        vectorStore:
          store,
        deleteBatchSize:
          10,
      });

    const chunks = [
      chunk(0),
      chunk(1),
      chunk(2),
    ];

    await indexer.index(
      chunks,
    );

    const deletion =
      await indexer.deleteIds([
        "webchunk_0",
        "webchunk_1",
        "webchunk_1",
      ]);

    assert.deepEqual(
      store.deleteBatchSizes,
      [2],
    );

    assert.equal(
      deletion.stats.uniqueIds,
      2,
    );

    assert.equal(
      store.records.size,
      1,
    );
  },
);
