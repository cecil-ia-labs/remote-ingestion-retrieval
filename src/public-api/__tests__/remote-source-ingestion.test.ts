import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  test,
} from "node:test";

import type {
  MarkdownSplitter,
} from "../../chunking/index.js";
import type {
  DiscoveredUrl,
  WebsiteDiscovery,
} from "../../discovery/index.js";
import type {
  UrlSource,
  WebsiteSource,
} from "../../domain/index.js";
import type {
  IncrementalSyncState,
  IncrementalSyncStateKey,
  IncrementalSyncStateStore,
  WebsiteDocumentMaterializer,
} from "../../sync/index.js";
import type {
  EmbeddingProvider,
  VectorRecord,
  VectorStore,
} from "../../vector/index.js";
import type {
  WebDocument,
} from "../../website/index.js";
import {
  RemoteSourceIngestion,
} from "../remote-source-ingestion.js";

function sha256(
  value:
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function websiteSource(): WebsiteSource {
  return {
    id:
      "site-1",
    type:
      "website",
    url:
      "https://example.com/docs",
    createdAt:
      new Date("2026-09-16T12:00:00.000Z"),
    updatedAt:
      new Date("2026-09-16T12:00:00.000Z"),
  };
}

function urlSource(): UrlSource {
  return {
    id:
      "url-1",
    type:
      "url",
    url:
      "https://example.com/file.pdf#page=2",
    options: {
      resourceType:
        "pdf",
    },
    createdAt:
      new Date("2026-09-16T12:00:00.000Z"),
    updatedAt:
      new Date("2026-09-16T12:00:00.000Z"),
  };
}

function documentFor(
  sourceId:
    string,
  url:
    string,
  markdown =
    "# Documentation\n\nStable content.",
): WebDocument {
  const contentHash =
    sha256(
      markdown,
    );
  const now =
    new Date("2026-09-16T12:00:01.000Z");

  return {
    id:
      `webdoc_${sha256(`${sourceId}\n${url}`).slice(0, 32)}`,
    sourceId,
    url,
    canonicalUrl:
      url,
    title:
      "Documentation",
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
        Buffer.byteLength(markdown, "utf8"),
      characterLength:
        markdown.length,
      lineCount:
        markdown.split("\n").length,
      nonEmptyLineCount:
        markdown.split("\n").filter((line) => line.trim()).length,
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
        "root",
      url,
      depth:
        0,
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
      contentLength:
        markdown.length,
      fetchedByteLength:
        markdown.length,
      fetchedAt:
        now,
      extractedAt:
        now,
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
      title:
        "Documentation",
      resourceType:
        "html",
      contentType:
        "text/html",
      fetchedAt:
        now,
      extractedAt:
        now,
      byteLength:
        markdown.length,
    },
    processedAt:
      now,
  };
}

class CapturingDiscovery
  implements WebsiteDiscovery {
  lastSource?:
    WebsiteSource;

  async *discover(
    source:
      WebsiteSource,
  ): AsyncIterable<DiscoveredUrl> {
    this.lastSource =
      source;

    yield {
      url:
        source.url,
      discoveredBy:
        "root",
      depth:
        0,
    };
  }
}

class FixtureMaterializer
  implements WebsiteDocumentMaterializer {
  calls =
    0;

  async materialize(
    source:
      WebsiteSource,
    discovered:
      DiscoveredUrl,
  ): Promise<WebDocument> {
    this.calls +=
      1;

    return documentFor(
      source.id,
      discovered.url,
    );
  }
}

class MemoryStateStore
  implements IncrementalSyncStateStore {
  private readonly states =
    new Map<string, IncrementalSyncState>();

  async load(
    key:
      IncrementalSyncStateKey,
  ): Promise<IncrementalSyncState | null> {
    return this.states.get(
      this.key(key),
    )
      ?? null;
  }

  async save(
    state:
      IncrementalSyncState,
  ): Promise<void> {
    this.states.set(
      this.key(state),
      state,
    );
  }

  async remove(
    key:
      IncrementalSyncStateKey,
  ): Promise<boolean> {
    return this.states.delete(
      this.key(key),
    );
  }

  private key(
    key:
      IncrementalSyncStateKey,
  ): string {
    return `${key.sourceId}\n${key.namespace ?? ""}`;
  }
}

class CountingEmbeddingProvider
  implements EmbeddingProvider {
  readonly name =
    "fixture-embedding";
  readonly dimensions =
    3;

  calls =
    0;

  async embed(
    texts:
      readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    this.calls +=
      1;

    return texts.map(
      (text) => [
        text.length,
        1,
        0.5,
      ],
    );
  }
}

class MemoryVectorStore
  implements VectorStore {
  readonly name =
    "memory-vector-store";

  readonly records =
    new Map<string, VectorRecord>();

  async upsert(
    records:
      readonly VectorRecord[],
  ): Promise<void> {
    for (
      const record
      of records
    ) {
      this.records.set(
        record.id,
        record,
      );
    }
  }

  async delete(
    ids:
      readonly string[],
  ): Promise<void> {
    for (
      const id
      of ids
    ) {
      this.records.delete(
        id,
      );
    }
  }
}

const splitter:
  MarkdownSplitter = {
  name:
    "fixture-splitter",

  async split(
    markdown,
  ) {
    return [
      {
        markdown,
      },
    ];
  },
};

function clientFixture() {
  const discovery =
    new CapturingDiscovery();
  const materializer =
    new FixtureMaterializer();
  const embeddingProvider =
    new CountingEmbeddingProvider();
  const vectorStore =
    new MemoryVectorStore();

  const client =
    new RemoteSourceIngestion({
      pipelineRevision:
        "splitter-fixture+embedding-fixture-v1",
      markdownSplitter:
        splitter,
      embeddingProvider,
      vectorStore,
      discovery,
      materializer,
      stateStore:
        new MemoryStateStore(),
    });

  return {
    client,
    discovery,
    materializer,
    embeddingProvider,
    vectorStore,
  };
}

test(
  "ingestWebsite performs complete sync and reuses unchanged state on the next run",
  async () => {
    const fixture =
      clientFixture();

    const first =
      await fixture.client.ingestWebsite({
        source:
          websiteSource(),
      });

    const second =
      await fixture.client.ingestWebsite({
        source:
          websiteSource(),
      });

    assert.equal(
      first.stats.added,
      1,
    );
    assert.equal(
      second.stats.unchanged,
      1,
    );
    assert.equal(
      fixture.embeddingProvider.calls,
      1,
    );
    assert.equal(
      fixture.vectorStore.records.size,
      1,
    );
  },
);

test(
  "ingestUrl converts UrlSource into a one-page WebsiteSource without sitemap/crawl expansion",
  async () => {
    const fixture =
      clientFixture();

    await fixture.client.ingestUrl({
      source:
        urlSource(),
    });

    assert.equal(
      fixture.discovery.lastSource?.type,
      "website",
    );
    assert.equal(
      fixture.discovery.lastSource
        ?.options?.crawl?.maxPages,
      1,
    );
    assert.equal(
      fixture.discovery.lastSource
        ?.options?.crawl?.maxDepth,
      0,
    );
    assert.equal(
      fixture.discovery.lastSource
        ?.options?.crawl?.discoveryStrategy,
      "crawl",
    );
  },
);

test(
  "materializeUrl bypasses website discovery and strips URL fragments from root provenance",
  async () => {
    const fixture =
      clientFixture();

    const document =
      await fixture.client.materializeUrl({
        source:
          urlSource(),
      });

    assert.equal(
      fixture.materializer.calls,
      1,
    );
    assert.equal(
      document.canonicalUrl,
      "https://example.com/file.pdf",
    );
  },
);

test(
  "discoverWebsite exposes discovery without running downstream ingestion",
  async () => {
    const fixture =
      clientFixture();

    const result =
      await fixture.client.discoverWebsite({
        source:
          websiteSource(),
      });

    assert.equal(
      result.urls.length,
      1,
    );
    assert.equal(
      fixture.materializer.calls,
      0,
    );
    assert.equal(
      fixture.embeddingProvider.calls,
      0,
    );
  },
);


test(
  "close is safe when all lifecycle-owning services are injected",
  async () => {
    const fixture =
      clientFixture();

    await assert.doesNotReject(
      fixture.client.close(),
    );
  },
);

test(
  "rejects an empty default pipeline revision",
  () => {
    assert.throws(
      () => new RemoteSourceIngestion({
        pipelineRevision:
          "   ",
        markdownSplitter:
          splitter,
        embeddingProvider:
          new CountingEmbeddingProvider(),
        vectorStore:
          new MemoryVectorStore(),
      }),
      /pipelineRevision must be a non-empty string/,
    );
  },
);

test(
  "insertSource dispatches through the application-level source insertion pipeline",
  async () => {
    const fixture =
      clientFixture();

    const result =
      await fixture.client.insertSource({
        source:
          websiteSource(),
      });

    assert.equal(
      result.stats.added,
      1,
    );
    assert.equal(
      fixture.embeddingProvider.calls,
      1,
    );
    assert.equal(
      typeof fixture.client.services.sourceInsertion.insert,
      "function",
    );
  },
);

test(
  "runSourceInsertion returns a uniform completed outcome",
  async () => {
    const fixture =
      clientFixture();

    const outcome =
      await fixture.client.runSourceInsertion({
        source:
          urlSource(),
        observability: {
          runId:
            "phase-27-job",
        },
      });

    assert.equal(
      outcome.ok,
      true,
    );
    assert.equal(
      outcome.status,
      "completed",
    );
    assert.equal(
      outcome.runId,
      "phase-27-job",
    );

    if (!outcome.ok) {
      assert.fail(
        "expected completed source insertion",
      );
    }

    assert.equal(
      outcome.summary.documents.added,
      1,
    );
    assert.equal(
      outcome.summary.vectors.chunksUpserted,
      1,
    );
  },
);
