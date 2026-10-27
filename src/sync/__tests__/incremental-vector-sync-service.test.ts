import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DocumentChunk,
  WebDocumentChunkingResult,
} from "../../chunking/document-chunk.js";

import type {
  IncrementalSyncState,
  IncrementalSyncStateKey,
} from "../incremental-sync-state.js";

import type {
  IncrementalSyncStateStore,
} from "../incremental-sync-state-store.js";

import {
  IncrementalVectorSyncService,
} from "../incremental-vector-sync-service.js";

import type {
  EmbeddingProvider,
} from "../../vector/embedding-provider.js";

import {
  DocumentChunkVectorIndexer,
} from "../../vector/document-chunk-vector-indexer.js";

import type {
  VectorRecord,
  VectorRecordId,
} from "../../vector/vector-record.js";

import type {
  VectorStore,
} from "../../vector/vector-store.js";

import type {
  WebDocument,
} from "../../website/web-document.js";

class MemoryStateStore
  implements IncrementalSyncStateStore {
  state:
    IncrementalSyncState | null = null;

  saves =
    0;

  async load(
    _key:
      IncrementalSyncStateKey,
  ): Promise<IncrementalSyncState | null> {
    return this.state;
  }

  async save(
    state:
      IncrementalSyncState,
  ): Promise<void> {
    this.state =
      state;

    this.saves +=
      1;
  }

  async remove():
    Promise<boolean> {
    const existed =
      this.state !== null;

    this.state =
      null;

    return existed;
  }
}

class CountingEmbeddingProvider
  implements EmbeddingProvider {
  readonly name =
    "counting-embedding";

  readonly dimensions =
    2;

  calls =
    0;

  texts =
    0;

  async embed(
    texts:
      readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    this.calls +=
      1;

    this.texts +=
      texts.length;

    return texts.map(
      (text) => [
        text.length,
        1,
      ],
    );
  }
}

class MemoryVectorStore
  implements VectorStore {
  readonly name =
    "memory-vector";

  records =
    new Map<string, VectorRecord>();

  deletes:
    string[] = [];

  async upsert(
    records:
      readonly VectorRecord[],
  ): Promise<{ readonly accepted: number }> {
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
    let deleted =
      0;

    for (
      const id
      of ids
    ) {
      this.deletes.push(
        id,
      );

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

function document(
  id:
    string,

  contentHash:
    string,

  title =
    id,
): WebDocument {
  const url =
    `https://example.com/${id}`;

  const markdown =
    `# ${title}\n\n${contentHash}`;

  return {
    id,
    sourceId:
      "source-1",
    url,
    canonicalUrl:
      url,
    title,
    markdown,
    contentHash,
    content: {
      format:
        "markdown",
      hashAlgorithm:
        "sha256",
      hash:
        contentHash,
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
    },
    identity: {
      inputUrl:
        url,
      canonicalUrl:
        url,
      aliases:
        [],
      canonicalization: {
        changed:
          false,
        appliedRules:
          [],
        removedQueryParameters:
          [],
      },
    },
    discovery: {
      method:
        "crawl",
      url,
      depth:
        1,
    },
    acquisition: {
      requestedUrl:
        url,
      resolvedUrl:
        url,
      redirectChain:
        [],
      statusCode:
        200,
      contentType:
        "text/html",
      fetchedByteLength:
        markdown.length,
      fetchedAt:
        new Date(
          "2026-09-16T12:00:00.000Z",
        ),
      extractedAt:
        new Date(
          "2026-09-16T12:00:01.000Z",
        ),
      transport:
        "http",
      networkSafety:
        "dns-pinned",
    },
    metadata: {
      requestedUrl:
        url,
      resolvedUrl:
        url,
      canonicalUrl:
        url,
      title,
      resourceType:
        "html",
      contentType:
        "text/html",
      fetchedAt:
        new Date(
          "2026-09-16T12:00:00.000Z",
        ),
      extractedAt:
        new Date(
          "2026-09-16T12:00:01.000Z",
        ),
      byteLength:
        markdown.length,
    },
    processedAt:
      new Date(
        "2026-09-16T12:00:01.000Z",
      ),
  };
}

function chunk(
  documentId:
    string,

  id:
    string,

  contentHash:
    string,

  ordinal:
    number,

  documentContentHash =
    `document-${documentId}`,
): DocumentChunk {
  const markdown =
    `chunk:${contentHash}`;

  const url =
    `https://example.com/${documentId}`;

  return {
    id,
    sourceId:
      "source-1",
    documentId,
    ordinal,
    markdown,
    contentHash,
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
          documentId,
        sourceId:
          "source-1",
        url,
        canonicalUrl:
          url,
        title:
          documentId,
        resourceType:
          "html",
        contentHash:
          documentContentHash,
        processedAt:
          "2026-09-16T12:00:01.000Z",
      },
      discovery: {
        method:
          "crawl",
        url,
        depth:
          1,
      },
      acquisition: {
        requestedUrl:
          url,
        resolvedUrl:
          url,
        fetchedByteLength:
          100,
        fetchedAt:
          "2026-09-16T12:00:00.000Z",
        extractedAt:
          "2026-09-16T12:00:01.000Z",
      },
      chunk: {
        ordinal,
        total:
          2,
        contentHash,
        byteLength:
          Buffer.byteLength(
            markdown,
          ),
        characterLength:
          markdown.length,
        lineCount:
          1,
        nonEmptyLineCount:
          1,
        headingPath: [
          documentId,
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
            ordinal + 1,
          endLine:
            ordinal + 1,
        },
      },
      splitter: {
        name:
          "fixture",
      },
    },
  };
}

function chunkingResult(
  documentId:
    string,

  chunks:
    readonly DocumentChunk[],
): WebDocumentChunkingResult {
  return {
    sourceId:
      "source-1",
    documentId,
    canonicalUrl:
      `https://example.com/${documentId}`,
    documentContentHash:
      `document-${documentId}`,
    splitterName:
      "fixture",
    chunks,
    stats: {
      splitterSegments:
        chunks.length,
      emittedChunks:
        chunks.length,
      emptySegmentsDropped:
        0,
      sourceRangesResolved:
        chunks.length,
      sourceRangesUnresolved:
        0,
    },
  };
}

function fixture() {
  const stateStore =
    new MemoryStateStore();

  const embeddingProvider =
    new CountingEmbeddingProvider();

  const vectorStore =
    new MemoryVectorStore();

  const indexer =
    new DocumentChunkVectorIndexer({
      embeddingProvider,
      vectorStore,
    });

  const chunksByDocument =
    new Map<string, readonly DocumentChunk[]>();

  let chunkCalls =
    0;

  const service =
    new IncrementalVectorSyncService({
      stateStore,
      vectorIndexer:
        indexer,
      chunkDocument:
        async (doc) => {
          chunkCalls +=
            1;

          return chunkingResult(
            doc.id,
            chunksByDocument.get(
              doc.id,
            )
            ?? [],
          );
        },
      now:
        () =>
          new Date(
            "2026-09-16T13:00:00.000Z",
          ),
    });

  return {
    stateStore,
    embeddingProvider,
    vectorStore,
    chunksByDocument,
    service,
    getChunkCalls: () =>
      chunkCalls,
  };
}

test(
  "first sync chunks and indexes all documents; identical second sync skips chunking and embeddings",
  async () => {
    const fx =
      fixture();

    const a =
      document(
        "doc-a",
        "hash-a",
      );

    fx.chunksByDocument.set(
      a.id,
      [
        chunk(
          a.id,
          "chunk-a-0",
          "chunk-hash-a0",
          0,
        ),
        chunk(
          a.id,
          "chunk-a-1",
          "chunk-hash-a1",
          1,
        ),
      ],
    );

    const first =
      await fx.service.sync({
        sourceId:
          "source-1",
        documents: [
          a,
        ],
        pipelineRevision:
          "split-v1+embed-v1",
        mode:
          "full",
      });

    assert.equal(
      first.stats.chunksUpserted,
      2,
    );

    assert.equal(
      fx.getChunkCalls(),
      1,
    );

    assert.equal(
      fx.embeddingProvider.texts,
      2,
    );

    const second =
      await fx.service.sync({
        sourceId:
          "source-1",
        documents: [
          a,
        ],
        pipelineRevision:
          "split-v1+embed-v1",
        mode:
          "full",
      });

    assert.equal(
      second.stats.documentsReusedWithoutChunking,
      1,
    );

    assert.equal(
      second.stats.embeddingsAvoided,
      2,
    );

    assert.equal(
      second.stats.chunksUpserted,
      0,
    );

    assert.equal(
      fx.getChunkCalls(),
      1,
    );

    assert.equal(
      fx.embeddingProvider.texts,
      2,
    );
  },
);

test(
  "changed document refreshes current chunk records and deletes stale ids",
  async () => {
    const fx =
      fixture();

    const before =
      document(
        "doc-b",
        "document-before",
      );

    fx.chunksByDocument.set(
      before.id,
      [
        chunk(
          before.id,
          "chunk-b-stable",
          "same",
          0,
          "document-before",
        ),
        chunk(
          before.id,
          "chunk-b-old",
          "old",
          1,
          "document-before",
        ),
      ],
    );

    await fx.service.sync({
      sourceId:
        "source-1",
      documents: [
        before,
      ],
      pipelineRevision:
        "pipeline-v1",
      mode:
        "full",
    });

    const after =
      document(
        "doc-b",
        "document-after",
      );

    fx.chunksByDocument.set(
      after.id,
      [
        chunk(
          after.id,
          "chunk-b-stable",
          "same",
          0,
          "document-after",
        ),
        chunk(
          after.id,
          "chunk-b-new",
          "new",
          1,
          "document-after",
        ),
      ],
    );

    const result =
      await fx.service.sync({
        sourceId:
          "source-1",
      documents: [
          after,
        ],
        pipelineRevision:
          "pipeline-v1",
        mode:
          "full",
      });

    assert.deepEqual(
      result.reusedChunkIds,
      [],
    );

    assert.deepEqual(
      result.upsertedChunkIds,
      [
        "chunk-b-stable",
        "chunk-b-new",
      ],
    );

    assert.deepEqual(
      result.deletedChunkIds,
      [
        "chunk-b-old",
      ],
    );

    assert.equal(
      result.stats.embeddingsAvoided,
      0,
    );
  },
);

test(
  "removed documents delete all of their vector ids",
  async () => {
    const fx =
      fixture();

    const a =
      document(
        "doc-delete",
        "hash-delete",
      );

    fx.chunksByDocument.set(
      a.id,
      [
        chunk(
          a.id,
          "delete-0",
          "d0",
          0,
        ),
        chunk(
          a.id,
          "delete-1",
          "d1",
          1,
        ),
      ],
    );

    await fx.service.sync({
      sourceId:
        "source-1",
      documents: [
        a,
      ],
      pipelineRevision:
        "pipeline-v1",
      mode:
        "full",
    });

    const result =
      await fx.service.sync({
        sourceId:
          "source-1",
      documents:
        [],
      pipelineRevision:
        "pipeline-v1",
      mode:
        "full",
    });

    assert.equal(
      result.stats.documentsDeleted,
      1,
    );

    assert.deepEqual(
      new Set(
        result.deletedChunkIds,
      ),
      new Set([
        "delete-0",
        "delete-1",
      ]),
    );

    assert.equal(
      result.state.documents.length,
      0,
    );
  },
);

test(
  "pipeline revision change invalidates reuse and re-embeds stable chunks",
  async () => {
    const fx =
      fixture();

    const a =
      document(
        "doc-pipeline",
        "same-document",
      );

    fx.chunksByDocument.set(
      a.id,
      [
        chunk(
          a.id,
          "pipeline-0",
          "same-chunk",
          0,
        ),
      ],
    );

    await fx.service.sync({
      sourceId:
        "source-1",
      documents: [a],
      pipelineRevision:
        "embedding-v1",
      mode:
        "full",
    });

    const before =
      fx.embeddingProvider.texts;

    const result =
      await fx.service.sync({
        sourceId:
          "source-1",
      documents: [a],
      pipelineRevision:
        "embedding-v2",
      mode:
        "full",
    });

    assert.equal(
      result.stats.pipelineChanged,
      true,
    );

    assert.deepEqual(
      result.upsertedChunkIds,
      [
        "pipeline-0",
      ],
    );

    assert.equal(
      fx.embeddingProvider.texts,
      before + 1,
    );
  },
);


test(
  "partial sync preserves previous documents omitted from the request",
  async () => {
    const fx =
      fixture();

    const a =
      document(
        "doc-partial-a",
        "a1",
      );

    const b =
      document(
        "doc-partial-b",
        "b1",
      );

    fx.chunksByDocument.set(
      a.id,
      [
        chunk(
          a.id,
          "partial-a-0",
          "a0",
          0,
        ),
      ],
    );

    fx.chunksByDocument.set(
      b.id,
      [
        chunk(
          b.id,
          "partial-b-0",
          "b0",
          0,
        ),
      ],
    );

    await fx.service.sync({
      sourceId:
        "source-1",
      documents: [
        a,
        b,
      ],
      pipelineRevision:
        "pipeline-v1",
      mode:
        "full",
    });

    const a2 =
      document(
        "doc-partial-a",
        "a2",
      );

    fx.chunksByDocument.set(
      a2.id,
      [
        chunk(
          a2.id,
          "partial-a-1",
          "a1",
          0,
        ),
      ],
    );

    const result =
      await fx.service.sync({
        sourceId:
          "source-1",
      documents: [
          a2,
        ],
      pipelineRevision:
        "pipeline-v1",
      mode:
        "partial",
    });

    assert.equal(
      result.stats.documentsDeleted,
      0,
    );

    assert.equal(
      result.state.documents.length,
      2,
    );

    assert.ok(
      result.state.documents.some(
        (entry) =>
          entry.documentId
          === "doc-partial-b",
      ),
    );

    assert.equal(
      fx.vectorStore.records.has(
        "partial-b-0",
      ),
      true,
    );
  },
);


test(
  "does not advance persisted state when vector indexing fails",
  async () => {
    const stateStore =
      new MemoryStateStore();

    const provider =
      new CountingEmbeddingProvider();

    const failingStore:
      VectorStore = {
      name:
        "failing-store",
      async upsert() {
        throw new Error(
          "simulated vector-store failure",
        );
      },
      async delete() {
        return {
          deleted:
            0,
        };
      },
    };

    const indexer =
      new DocumentChunkVectorIndexer({
        embeddingProvider:
          provider,
        vectorStore:
          failingStore,
      });

    const doc =
      document(
        "doc-failure",
        "failure-hash",
      );

    const service =
      new IncrementalVectorSyncService({
        stateStore,
        vectorIndexer:
          indexer,
        chunkDocument:
          async () =>
            chunkingResult(
              doc.id,
              [
                chunk(
                  doc.id,
                  "failure-0",
                  "failure-chunk",
                  0,
                  doc.contentHash,
                ),
              ],
            ),
      });

    await assert.rejects(
      () =>
        service.sync({
          sourceId:
            "source-1",
          documents: [
            doc,
          ],
          pipelineRevision:
            "pipeline-v1",
          mode:
            "full",
        }),
    );

    assert.equal(
      stateStore.saves,
      0,
    );

    assert.equal(
      stateStore.state,
      null,
    );
  },
);
