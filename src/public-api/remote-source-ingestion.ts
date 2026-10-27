import {
  join,
} from "node:path";

import {
  WebDocumentChunker,
} from "../chunking/web-document-chunker.js";
import { StructuralMarkdownSplitter } from "../chunking/structural-markdown-splitter.js";

import {
  WebsiteDiscoveryService,
} from "../discovery/website-discovery-service.js";

import type {
  DiscoveredUrl,
} from "../discovery/discovered-url.js";

import type {
  UrlSource,
  WebsiteSource,
} from "../domain/index.js";

import {
  defaultObservabilityHub,
} from "../observability/observability-hub.js";

import {
  SourceInsertionPipeline,
} from "../pipeline/index.js";

import type {
  SourceInsertionOutcome,
  SourceInsertionRequest,
  SourceInsertionResult,
} from "../pipeline/index.js";

import {
  HtmlRenderingOrchestrator,
  PuppeteerBrowserHtmlRenderer,
  PuppeteerBrowserManager,
} from "../rendering/index.js";

import {
  DefaultWebsiteDocumentMaterializer,
} from "../sync/default-website-document-materializer.js";

import {
  IncrementalVectorSyncService,
} from "../sync/incremental-vector-sync-service.js";

import {
  InvalidPipelineRevisionError,
} from "../sync/incremental-sync.errors.js";

import {
  LocalJsonIncrementalSyncStateStore,
} from "../sync/local-json-incremental-sync-state-store.js";

import {
  WebsiteSyncService,
} from "../sync/website-sync-service.js";

import {
  DocumentChunkVectorIndexer,
} from "../vector/document-chunk-vector-indexer.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  RemoteSourceIngestionConfigurationError,
} from "./public-api.errors.js";

import type {
  ChunkDocumentRequest,
  ChunkDocumentResult,
  DiscoverWebsiteRequest,
  DiscoverWebsiteResult,
  IngestUrlRequest,
  IngestUrlResult,
  IngestWebsiteRequest,
  IngestWebsiteResult,
  MaterializeUrlRequest,
  RemoteSourceIngestionOptions,
  RemoteSourceIngestionServices,
} from "./remote-source-ingestion.types.js";

function normalizePipelineRevision(
  value:
    unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    throw new InvalidPipelineRevisionError();
  }

  const normalized =
    value.trim();

  if (
    normalized.length === 0
  ) {
    throw new InvalidPipelineRevisionError();
  }

  return normalized;
}


function assertHostContract(
  name:
    string,

  value:
    unknown,

  method:
    string,
): void {
  if (
    !value
    || typeof value !== "object"
    || !(method in value)
    || typeof (
      value as Record<string, unknown>
    )[method] !== "function"
  ) {
    throw new RemoteSourceIngestionConfigurationError(
      `${name} must implement ${method}().`,
    );
  }
}

function singleUrlWebsiteSource(
  source:
    UrlSource,
): WebsiteSource {
  return {
    ...source,

    type:
      "website",

    options: {
      ...source.options,

      crawl: {
        maxPages:
          1,

        maxDepth:
          0,

        concurrency:
          1,

        sameOriginOnly:
          true,

        includeSubdomains:
          false,

        discoveryStrategy:
          "crawl",

        respectRobotsTxt:
          false,
      },
    },
  };
}

function rootDiscovery(
  source:
    UrlSource,
): DiscoveredUrl {
  const url =
    new URL(
      source.url,
    );

  url.hash =
    "";

  return {
    url:
      url.toString(),

    discoveredBy:
      "root",

    depth:
      0,
  };
}

/**
 * Stable facade over the complete remote-source ingestion stack.
 *
 * Embeddings and vector storage are injected; local Markdown chunking is
 * supplied by default and may be replaced by the host's semantic splitter.
 */
export class RemoteSourceIngestion {
  readonly services:
    RemoteSourceIngestionServices;

  private readonly pipelineRevision:
    string;

  private readonly ownedBrowserManager?:
    PuppeteerBrowserManager;

  constructor(
    options:
      RemoteSourceIngestionOptions,
  ) {
    if (
      !options
      || typeof options !== "object"
    ) {
      throw new RemoteSourceIngestionConfigurationError(
        "RemoteSourceIngestion options are required.",
      );
    }

    this.pipelineRevision =
      normalizePipelineRevision(
        options.pipelineRevision,
      );

    const markdownSplitter = options.markdownSplitter ?? new StructuralMarkdownSplitter();

    assertHostContract(
      "markdownSplitter",
      markdownSplitter,
      "split",
    );

    assertHostContract(
      "embeddingProvider",
      options.embeddingProvider,
      "embed",
    );

    assertHostContract(
      "vectorStore",
      options.vectorStore,
      "upsert",
    );

    assertHostContract(
      "vectorStore",
      options.vectorStore,
      "delete",
    );

    const observability =
      options.observability
      ?? defaultObservabilityHub;

    const discovery =
      options.discovery
      ?? new WebsiteDiscoveryService();

    const stateStore =
      options.stateStore
      ?? new LocalJsonIncrementalSyncStateStore({
        rootDirectory:
          options.stateRootDirectory
          ?? join(
            process.cwd(),
            "data",
            "websource-sync",
          ),
      });

    let ownedBrowserManager:
      PuppeteerBrowserManager | undefined;

    const materializer =
      options.materializer
      ?? (() => {
        ownedBrowserManager =
          new PuppeteerBrowserManager();

        const renderer =
          new HtmlRenderingOrchestrator({
            browserRenderer:
              new PuppeteerBrowserHtmlRenderer({
                sessionFactory:
                  ownedBrowserManager,
              }),
          });

        return new DefaultWebsiteDocumentMaterializer({
          renderer,

          pdfProcessor:
            options.pdfProcessor,

          artifactRootDirectory:
            options.artifactRootDirectory
            ?? join(
              process.cwd(),
              "data",
              "websources",
            ),

          observability,
        });
      })();

    this.ownedBrowserManager =
      ownedBrowserManager;

    const chunker =
      options.chunker
      ?? new WebDocumentChunker({
        splitter:
          markdownSplitter,
      });

    const vectorIndexer =
      options.vectorIndexer
      ?? new DocumentChunkVectorIndexer({
        embeddingProvider:
          options.embeddingProvider,

        vectorStore:
          options.vectorStore,

        metadataProjector:
          options.vectorMetadataProjector,

        embeddingBatchSize:
          options.embeddingBatchSize,

        upsertBatchSize:
          options.upsertBatchSize,

        deleteBatchSize:
          options.deleteBatchSize,

        observability,
      });

    const vectorSync =
      options.vectorSync
      ?? new IncrementalVectorSyncService({
        stateStore,

        vectorIndexer,

        chunkDocument:
          async (
            document,
            signal,
          ) => {
            signal?.throwIfAborted();

            const result =
              await chunker.chunk(
                document,
                signal,
              );

            signal?.throwIfAborted();

            return result;
          },

        observability,
      });

    const websiteSync =
      options.websiteSync
      ?? new WebsiteSyncService({
        discovery,
        materializer,
        stateStore,
        vectorSync,
        observability,
      });

    const sourceInsertion =
      new SourceInsertionPipeline({
        ingestWebsite:
          async (request) => websiteSync.sync({
            ...request,
            pipelineRevision:
              this.resolvePipelineRevision(
                request.pipelineRevision,
              ),
          }),

        ingestUrl:
          async (request) => websiteSync.sync({
            ...request,
            source:
              singleUrlWebsiteSource(
                request.source,
              ),
            pipelineRevision:
              this.resolvePipelineRevision(
                request.pipelineRevision,
              ),
          }),

        observability,
      });

    this.services =
      Object.freeze({
        discovery,
        materializer,
        stateStore,
        chunker,
        vectorIndexer,
        vectorSync,
        websiteSync,
        sourceInsertion,
        observability,
      });
  }

  async ingestWebsite(
    request:
      IngestWebsiteRequest,
  ): Promise<IngestWebsiteResult> {
    return this.services
      .websiteSync
      .sync({
        ...request,

        pipelineRevision:
          this.resolvePipelineRevision(
            request.pipelineRevision,
          ),
      });
  }

  async ingestUrl(
    request:
      IngestUrlRequest,
  ): Promise<IngestUrlResult> {
    const source =
      singleUrlWebsiteSource(
        request.source,
      );

    return this.ingestWebsite({
      ...request,
      source,
    });
  }

  /**
   * Strict application-level source insertion. Failures are preserved as
   * exceptions so callers can use ordinary try/catch control flow.
   */
  async insertSource(
    request:
      SourceInsertionRequest,
  ): Promise<SourceInsertionResult> {
    return this.services
      .sourceInsertion
      .insert(
        request,
      );
  }

  /**
   * UI/job-friendly source insertion. This method never throws for pipeline
   * failures; it resolves to completed | partial | failed | aborted.
   */
  async runSourceInsertion(
    request:
      SourceInsertionRequest,
  ): Promise<SourceInsertionOutcome> {
    return this.services
      .sourceInsertion
      .run(
        request,
      );
  }

  async discoverWebsite(
    request:
      DiscoverWebsiteRequest,
  ): Promise<DiscoverWebsiteResult> {
    const urls:
      DiscoveredUrl[] = [];

    for await (
      const discovered
      of this.services.discovery
        .discover(
          request.source,
          request.signal,
        )
    ) {
      urls.push(
        discovered,
      );
    }

    return {
      sourceId:
        request.source.id,

      urls:
        Object.freeze(
          urls,
        ),
    };
  }

  async materializeUrl(
    request:
      MaterializeUrlRequest,
  ): Promise<WebDocument> {
    const source =
      singleUrlWebsiteSource(
        request.source,
      );

    return this.services
      .materializer
      .materialize(
        source,
        rootDiscovery(
          request.source,
        ),
        request.signal,
      );
  }

  async chunkDocument(
    request:
      ChunkDocumentRequest,
  ): Promise<ChunkDocumentResult> {
    request.signal
      ?.throwIfAborted();

    const result =
      await this.services
        .chunker
        .chunk(
          request.document,
          request.signal,
        );

    request.signal
      ?.throwIfAborted();

    return result;
  }

  /**
   * Releases resources owned by the facade. Currently this closes the shared
   * Puppeteer browser manager created by the default materializer. Injected
   * services remain owned by their caller.
   */
  async close(): Promise<void> {
    await this.ownedBrowserManager
      ?.close();
  }

  private resolvePipelineRevision(
    override:
      string | undefined,
  ): string {
    if (
      override === undefined
    ) {
      return this.pipelineRevision;
    }

    return normalizePipelineRevision(
      override,
    );
  }
}

export function createRemoteSourceIngestion(
  options:
    RemoteSourceIngestionOptions,
): RemoteSourceIngestion {
  return new RemoteSourceIngestion(
    options,
  );
}
