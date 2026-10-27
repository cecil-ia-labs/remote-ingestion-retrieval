import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  ExistingMarkdownSplitterAdapter,
  WebDocumentChunker,
} from "../../chunking/index.js";

import type {
  DiscoveredUrl,
} from "../../discovery/discovered-url.js";

import type {
  WebsiteDiscovery,
} from "../../discovery/website-discovery.js";

import type {
  WebsiteSource,
} from "../../domain/website-source.js";

import type {
  WebDocument,
} from "../../website/web-document.js";

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
  WebsiteDocumentMaterializer,
} from "../website-document-materializer.js";

import {
  WebsiteSyncMaterializationError,
} from "../website-sync.errors.js";

import {
  WebsiteSyncService,
} from "../website-sync-service.js";

class MutableDiscovery
  implements WebsiteDiscovery {
  urls:
    string[] = [];

  async *discover():
    AsyncIterable<DiscoveredUrl> {
    for (
      const url
      of this.urls
    ) {
      yield {
        url,
        discoveredBy:
          "sitemap",
      };
    }
  }
}

class MemoryStateStore
  implements IncrementalSyncStateStore {
  state:
    IncrementalSyncState | null = null;

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

class DeterministicEmbeddingProvider
  implements EmbeddingProvider {
  readonly name =
    "deterministic";

  readonly dimensions =
    2;

  async embed(
    texts:
      readonly string[],
  ): Promise<readonly (readonly number[])[]> {
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
    "memory";

  readonly records =
    new Map<string, VectorRecord>();

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

class FixtureMaterializer
  implements WebsiteDocumentMaterializer {
  documents =
    new Map<string, WebDocument>();

  failures =
    new Set<string>();

  async materialize(
    _source:
      WebsiteSource,

    discovered:
      DiscoveredUrl,
  ): Promise<WebDocument> {
    if (
      this.failures.has(
        discovered.url,
      )
    ) {
      throw new Error(
        `fixture failure: ${discovered.url}`,
      );
    }

    const document =
      this.documents.get(
        discovered.url,
      );

    if (!document) {
      throw new Error(
        `missing fixture: ${discovered.url}`,
      );
    }

    return document;
  }
}

function sha256(
  value:
    string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function makeDocument(
  slug:
    string,

  body:
    string,
): WebDocument {
  const url =
    slug === "root"
      ? "https://example.com/"
      : `https://example.com/${slug}`;

  const markdown =
    `# ${slug}\n\n${body}`;

  const contentHash =
    sha256(markdown);

  const now =
    new Date("2026-09-16T14:00:00.000Z");

  return {
    id:
      `doc-${slug}`,
    sourceId:
      "site-1",
    url,
    canonicalUrl:
      url,
    title:
      slug,
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
        Buffer.byteLength(markdown),
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
        "sitemap",
      url,
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
        Buffer.byteLength(markdown),
      fetchedAt:
        now,
      extractedAt:
        now,
    },
    metadata: {
      requestedUrl:
        url,
      resolvedUrl:
        url,
      canonicalUrl:
        url,
      title:
        slug,
      resourceType:
        "html",
      contentType:
        "text/html",
      fetchedAt:
        now,
      extractedAt:
        now,
      byteLength:
        Buffer.byteLength(markdown),
    },
    processedAt:
      now,
  };
}

function source():
  WebsiteSource {
  return {
    id:
      "site-1",
    type:
      "website",
    url:
      "https://example.com/",
    options: {
      crawl: {
        concurrency:
          3,
      },
    },
    createdAt:
      new Date("2026-09-16T14:00:00.000Z"),
    updatedAt:
      new Date("2026-09-16T14:00:00.000Z"),
  };
}

function createHarness() {
  const discovery =
    new MutableDiscovery();

  const materializer =
    new FixtureMaterializer();

  const stateStore =
    new MemoryStateStore();

  const vectorStore =
    new MemoryVectorStore();

  const indexer =
    new DocumentChunkVectorIndexer({
      embeddingProvider:
        new DeterministicEmbeddingProvider(),
      vectorStore,
    });

  const splitter =
    new ExistingMarkdownSplitterAdapter({
      name:
        "whole-document",
      split:
        async (markdown: string) => [
          markdown,
        ],
    });

  const chunker =
    new WebDocumentChunker({
      splitter,
    });

  const vectorSync =
    new IncrementalVectorSyncService({
      stateStore,
      vectorIndexer:
        indexer,
      chunkDocument:
        async (document) =>
          chunker.chunk(
            document,
          ),
      now:
        () =>
          new Date("2026-09-16T14:30:00.000Z"),
    });

  const service =
    new WebsiteSyncService({
      discovery,
      materializer,
      stateStore,
      vectorSync,
    });

  return {
    discovery,
    materializer,
    stateStore,
    vectorStore,
    service,
  };
}

test(
  "reconciles a complete website snapshot as added/changed/unchanged/removed",
  async () => {
    const harness =
      createHarness();

    const rootUrl =
      "https://example.com/";

    const aUrl =
      "https://example.com/a";

    const bUrl =
      "https://example.com/b";

    const cUrl =
      "https://example.com/c";

    harness.discovery.urls = [
      rootUrl,
      aUrl,
      bUrl,
    ];

    harness.materializer.documents =
      new Map([
        [rootUrl, makeDocument("root", "stable")],
        [aUrl, makeDocument("a", "version 1")],
        [bUrl, makeDocument("b", "legacy")],
      ]);

    const first =
      await harness.service.sync({
        source:
          source(),
        pipelineRevision:
          "pipeline-v1",
      });

    assert.equal(
      first.plan.stats.added,
      3,
    );

    harness.discovery.urls = [
      rootUrl,
      aUrl,
      cUrl,
    ];

    harness.materializer.documents =
      new Map([
        [rootUrl, makeDocument("root", "stable")],
        [aUrl, makeDocument("a", "version 2")],
        [cUrl, makeDocument("c", "new")],
      ]);

    const second =
      await harness.service.sync({
        source:
          source(),
        pipelineRevision:
          "pipeline-v1",
      });

    assert.deepEqual(
      second.plan.stats,
      {
        added: 1,
        changed: 1,
        unchanged: 1,
        removed: 1,
      },
    );

    assert.equal(
      second.stats.downstreamMode,
      "full",
    );

    assert.equal(
      harness.stateStore.state
        ?.documents.length,
      3,
    );
  },
);

test(
  "aborts before downstream sync when materialization fails by default",
  async () => {
    const harness =
      createHarness();

    const rootUrl =
      "https://example.com/";

    const badUrl =
      "https://example.com/bad";

    harness.discovery.urls = [
      rootUrl,
      badUrl,
    ];

    harness.materializer.documents.set(
      rootUrl,
      makeDocument("root", "stable"),
    );

    harness.materializer.failures.add(
      badUrl,
    );

    await assert.rejects(
      () =>
        harness.service.sync({
          source:
            source(),
          pipelineRevision:
            "pipeline-v1",
        }),
      WebsiteSyncMaterializationError,
    );

    assert.equal(
      harness.stateStore.state,
      null,
    );

    assert.equal(
      harness.vectorStore.records.size,
      0,
    );
  },
);

test(
  "continue-partial preserves previous documents and suppresses removals",
  async () => {
    const harness =
      createHarness();

    const rootUrl =
      "https://example.com/";

    const aUrl =
      "https://example.com/a";

    harness.discovery.urls = [
      rootUrl,
      aUrl,
    ];

    harness.materializer.documents =
      new Map([
        [rootUrl, makeDocument("root", "stable")],
        [aUrl, makeDocument("a", "stable")],
      ]);

    await harness.service.sync({
      source:
        source(),
      pipelineRevision:
        "pipeline-v1",
    });

    harness.materializer.failures.add(
      aUrl,
    );

    const result =
      await harness.service.sync({
        source:
          source(),
        pipelineRevision:
          "pipeline-v1",
        failurePolicy:
          "continue-partial",
      });

    assert.equal(
      result.stats.snapshotComplete,
      false,
    );

    assert.equal(
      result.stats.downstreamMode,
      "partial",
    );

    assert.equal(
      result.plan.removed.length,
      0,
    );

    assert.equal(
      harness.stateStore.state
        ?.documents.length,
      2,
    );
  },
);

test(
  "returns an aggregate execution-budget snapshot for a successful website sync",
  async () => {
    const harness =
      createHarness();

    const rootUrl =
      "https://example.com/";

    const aUrl =
      "https://example.com/a";

    harness.discovery.urls = [
      rootUrl,
      aUrl,
    ];

    harness.materializer.documents =
      new Map([
        [rootUrl, makeDocument("root", "stable")],
        [aUrl, makeDocument("a", "stable")],
      ]);

    const result =
      await harness.service.sync({
        source:
          source(),
        pipelineRevision:
          "pipeline-budget-v1",
        limits: {
          maxDiscoveredUrls:
            10,
          maxMaterializationAttempts:
            10,
          maxMaterializedDocuments:
            10,
          maxChunks:
            10,
          maxEmbeddingInputs:
            10,
          maxVectorUpserts:
            10,
        },
      });

    assert.equal(
      result.budget.consumed
        .discoveredUrls,
      2,
    );

    assert.equal(
      result.budget.consumed
        .materializationAttempts,
      2,
    );

    assert.equal(
      result.budget.consumed
        .materializedDocuments,
      2,
    );

    assert.equal(
      result.budget.consumed
        .chunks,
      2,
    );

    assert.equal(
      result.budget.consumed
        .embeddingInputs,
      2,
    );

    assert.equal(
      result.budget.consumed
        .vectorUpserts,
      2,
    );
  },
);

test(
  "stops discovery when the aggregate URL budget is exceeded and does not commit sync state",
  async () => {
    const harness =
      createHarness();

    const rootUrl =
      "https://example.com/";

    const aUrl =
      "https://example.com/a";

    harness.discovery.urls = [
      rootUrl,
      aUrl,
    ];

    harness.materializer.documents =
      new Map([
        [rootUrl, makeDocument("root", "stable")],
        [aUrl, makeDocument("a", "stable")],
      ]);

    await assert.rejects(
      harness.service.sync({
        source:
          source(),
        pipelineRevision:
          "pipeline-budget-v1",
        limits: {
          maxDiscoveredUrls:
            1,
        },
      }),
      (error: unknown) => {
        assert.equal(
          (
            error as {
              code?: string;
            }
          ).code,
          "EXECUTION_LIMIT_EXCEEDED",
        );

        return true;
      },
    );

    assert.equal(
      harness.stateStore.state,
      null,
    );

    assert.equal(
      harness.vectorStore.records.size,
      0,
    );
  },
);

test(
  "continue-partial never converts a global execution-budget failure into a page failure",
  async () => {
    const harness =
      createHarness();

    const rootUrl =
      "https://example.com/";

    const aUrl =
      "https://example.com/a";

    harness.discovery.urls = [
      rootUrl,
      aUrl,
    ];

    harness.materializer.documents =
      new Map([
        [rootUrl, makeDocument("root", "stable")],
        [aUrl, makeDocument("a", "stable")],
      ]);

    await assert.rejects(
      harness.service.sync({
        source:
          source(),
        pipelineRevision:
          "pipeline-budget-v1",
        failurePolicy:
          "continue-partial",
        limits: {
          maxMaterializationAttempts:
            1,
        },
      }),
      (error: unknown) => {
        assert.equal(
          (
            error as {
              code?: string;
            }
          ).code,
          "EXECUTION_LIMIT_EXCEEDED",
        );

        return true;
      },
    );

    assert.equal(
      harness.stateStore.state,
      null,
    );
  },
);
