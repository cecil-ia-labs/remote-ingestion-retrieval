import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  join,
} from "node:path";
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

const visualRoot =
  join(
    process.cwd(),
    "data",
    "visual-validation",
  );
const phaseRoot =
  join(
    visualRoot,
    "phase-27",
  );

function hash(
  value:
    string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function documentFor(
  sourceId:
    string,
  url:
    string,
): WebDocument {
  const markdown = [
    "# Realtime Agents",
    "",
    "## Authentication",
    "",
    "Use short-lived access tokens.",
    "",
    "## Sessions",
    "",
    "Create one session per conversation.",
  ].join("\n");
  const contentHash =
    hash(markdown);
  const now =
    new Date("2026-09-16T18:00:00.000Z");

  return {
    id:
      `webdoc_${hash(`${sourceId}\n${url}`).slice(0, 32)}`,
    sourceId,
    url,
    canonicalUrl:
      url,
    title:
      "Realtime Agents",
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
        "Realtime Agents",
      language:
        "en",
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

class Discovery
  implements WebsiteDiscovery {
  async *discover(
    source:
      WebsiteSource,
  ): AsyncIterable<DiscoveredUrl> {
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

class Materializer
  implements WebsiteDocumentMaterializer {
  async materialize(
    source:
      WebsiteSource,
    discovered:
      DiscoveredUrl,
  ): Promise<WebDocument> {
    return documentFor(
      source.id,
      discovered.url,
    );
  }
}

class StateStore
  implements IncrementalSyncStateStore {
  state:
    IncrementalSyncState | null =
      null;

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

  async remove(
    _key:
      IncrementalSyncStateKey,
  ): Promise<boolean> {
    const existed =
      this.state !== null;
    this.state =
      null;
    return existed;
  }
}

class Embeddings
  implements EmbeddingProvider {
  readonly name =
    "phase-27-deterministic";
  readonly dimensions =
    4;

  async embed(
    texts:
      readonly string[],
  ): Promise<readonly (readonly number[])[]> {
    return texts.map(
      (text) => [
        text.length,
        text.split("\n").length,
        text.includes("Authentication") ? 1 : 0,
        0.27,
      ],
    );
  }
}

class Store
  implements VectorStore {
  readonly name =
    "phase-27-memory-store";
  readonly records =
    new Map<string, VectorRecord>();

  async upsert(
    records:
      readonly VectorRecord[],
  ): Promise<void> {
    for (const record of records) {
      this.records.set(record.id, record);
    }
  }

  async delete(
    ids:
      readonly string[],
  ): Promise<void> {
    for (const id of ids) {
      this.records.delete(id);
    }
  }
}

const splitter:
  MarkdownSplitter = {
  name:
    "phase-27-heading-splitter",
  async split(
    markdown,
  ) {
    const marker =
      "\n## Sessions";
    const index =
      markdown.indexOf(marker);

    if (index < 0) {
      return [{ markdown }];
    }

    return [
      {
        markdown:
          markdown.slice(0, index),
      },
      {
        markdown:
          markdown.slice(index + 1),
      },
    ];
  },
};

test(
  "writes Phase 27 source insertion outcomes and service graph",
  async () => {
    await rm(
      visualRoot,
      {
        recursive: true,
        force: true,
      },
    );
    await mkdir(
      phaseRoot,
      {
        recursive: true,
      },
    );

    const vectorStore =
      new Store();

    const client =
      new RemoteSourceIngestion({
        pipelineRevision:
          "phase27:splitter-v1:embedding-v1:metadata-v1",
        markdownSplitter:
          splitter,
        embeddingProvider:
          new Embeddings(),
        vectorStore,
        discovery:
          new Discovery(),
        materializer:
          new Materializer(),
        stateStore:
          new StateStore(),
      });

    const source:
      WebsiteSource = {
      id:
        "phase-27-docs",
      type:
        "website",
      name:
        "Phase 27 Public API",
      url:
        "https://example.com/realtime",
      createdAt:
        new Date(),
      updatedAt:
        new Date(),
    };

    const first =
      await client.runSourceInsertion({
        source,
        namespace:
          "phase-27",
        limits: {
          maxDiscoveredUrls:
            10,
          maxChunks:
            10,
          maxEmbeddingInputs:
            10,
          maxVectorUpserts:
            10,
        },
      });

    const second =
      await client.runSourceInsertion({
        source,
        namespace:
          "phase-27",
      });

    assert.equal(
      first.status,
      "completed",
    );
    assert.equal(
      second.status,
      "completed",
    );

    if (!first.ok || !second.ok) {
      assert.fail(
        "expected completed source insertion outcomes",
      );
    }

    assert.equal(
      first.summary.documents.added,
      1,
    );
    assert.equal(
      second.summary.documents.unchanged,
      1,
    );

    await writeFile(
      join(
        phaseRoot,
        "source-insertion-outcomes.json",
      ),
      JSON.stringify(
        {
          firstRun: {
            status:
              first.status,
            runId:
              first.runId,
            summary:
              first.summary,
          },
          secondRun: {
            status:
              second.status,
            runId:
              second.runId,
            summary:
              second.summary,
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    await writeFile(
      join(
        phaseRoot,
        "service-graph.json",
      ),
      JSON.stringify(
        {
          facade:
            "RemoteSourceIngestion",
          methods: [
            "insertSource",
            "runSourceInsertion",
            "ingestWebsite",
            "ingestUrl",
            "discoverWebsite",
            "materializeUrl",
            "chunkDocument",
            "close",
          ],
          services:
            Object.keys(
              client.services,
            ),
          packageExports: {
            root:
              "stable facade",
            advanced:
              "complete internal graph",
          },
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    await writeFile(
      join(
        phaseRoot,
        "vector-records.json",
      ),
      JSON.stringify(
        [...vectorStore.records.values()],
        null,
        2,
      ) + "\n",
      "utf8",
    );

    console.log(
      "\n[visual-validation:phase-27]",
      phaseRoot,
    );
  },
);
