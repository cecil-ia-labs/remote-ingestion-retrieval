import {
  createHash,
  randomUUID,
} from "node:crypto";

import { StructuralMarkdownSplitter } from "../chunking/structural-markdown-splitter.js";
import type { MarkdownSplitter } from "../chunking/markdown-splitter.js";

import {
  mkdir,
  writeFile,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

import {
  pathToFileURL,
} from "node:url";

import {
  CrawlScheduler,
} from "../scheduling/crawl-scheduler.js";

import {
  WebsiteDiscoveryService,
} from "../discovery/website-discovery-service.js";

import type {
  WebsiteDiscoveryStats,
} from "../discovery/website-discovery-report.js";

import type {
  DiscoveredUrl,
} from "../discovery/discovered-url.js";

import type {
  WebsiteSource,
} from "../domain/website-source.js";

import {
  DefaultWebsiteDocumentMaterializer,
} from "../sync/default-website-document-materializer.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  HtmlRenderingOrchestrator,
  PuppeteerBrowserHtmlRenderer,
  PuppeteerBrowserManager,
} from "../rendering/index.js";

import type {
  KnowledgeBaseFile,
  KnowledgeBaseFileMetadata,
  KnowledgeBaseVectorStoreAdapter,
  KnowledgeBaseVectorStoreIngestResult,
} from "../knowledge/knowledge-base-vector-store.js";

import {
  isKnowledgeBaseVectorStoreAdapter,
  isKnowledgeBaseVectorStoreIngestResult,
} from "../knowledge/knowledge-base-vector-store.js";

import {
  buildDomainCatalog,
} from "../knowledge/domain-catalog.js";

import type {
  KnowledgeBaseMetadataEnricher,
  KnowledgeBaseSemanticMetadata,
} from "../knowledge/knowledge-base-metadata-enricher.js";

import {
  isKnowledgeBaseMetadataEnricher,
  validateKnowledgeBaseSemanticMetadata,
} from "../knowledge/knowledge-base-metadata-enricher.js";

import {
  LocalMetadataEnricher,
} from "../knowledge/local-metadata-enricher.js";

import {
  MetadataCache,
  metadataCacheKey,
} from "../knowledge/metadata-cache.js";

const SOURCE_ID = process.env.SOURCE_ID || '';
const SOURCE_URL = process.env.SOURCE_URL || '';
const SOURCE_TITLE = process.env.SOURCE_TITLE || '';
// const SOURCE_URL = "https://aacauto.com.br";
const PROJECT_ROOT = process.cwd();
const MARKDOWN_ROOT = resolve(PROJECT_ROOT, "kb", SOURCE_ID);
const REPORT_ROOT = resolve(
  PROJECT_ROOT,
  "data",
  "ingestion-results",
  SOURCE_ID,
);
const DEFAULT_ADAPTER_MODULE = resolve(
  PROJECT_ROOT,
  "..",
  "3_benchmarks",
  "realtime-compare-mcp-x-function",
  "MarkdownSplitter",
  "openai-vector-store.adapter.ts",
);
const DEFAULT_METADATA_ENRICHER_MODULE = resolve(
  PROJECT_ROOT,
  "..",
  "3_benchmarks",
  "realtime-compare-mcp-x-function",
  "MarkdownSplitter",
  "openai-metadata-enricher.ts",
);
const METADATA_CACHE_PATH = resolve(
  PROJECT_ROOT,
  "data",
  "metadata-cache",
  `${SOURCE_ID}.json`,
);

type AdapterFactory = () => unknown | Promise<unknown>;
type MetadataMode = "local" | "model";

interface MaterializationFailure {
  readonly url: string;
  readonly error: string;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAdapterFactory(
  value: unknown,
): value is AdapterFactory {
  return typeof value === "function";
}

function integerEnvironmentVariable(
  name: string,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const rawValue = process.env[name]?.trim();

  if (!rawValue) {
    return fallback;
  }

  if (!/^\d+$/.test(rawValue)) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  const value = Number(rawValue);

  if (
    !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }

  return value;
}

function errorMessage(
  cause: unknown,
): string {
  return cause instanceof Error
    ? cause.message
    : String(cause);
}

function metadataMode(): MetadataMode {
  const value = process.env.AUTO_METADATA_MODE?.trim().toLowerCase() || "local";

  if (value !== "local" && value !== "model") {
    throw new Error("AUTO_METADATA_MODE must be local or model.");
  }

  return value;
}

async function loadVectorStoreAdapter(): Promise<KnowledgeBaseVectorStoreAdapter> {
  if (process.env.AUTO_VECTOR_STORE_PROVIDER === "weaviate") {
    const { createVectorStoreAdapter } = await import("../knowledge/weaviate-knowledge-base-adapter.js");
    return withMarkdownSplitter(createVectorStoreAdapter());
  }
  const modulePath = process.env.AUTO_VECTOR_STORE_ADAPTER_MODULE?.trim()
    || DEFAULT_ADAPTER_MODULE;
  const moduleUrl = pathToFileURL(
    resolve(PROJECT_ROOT, modulePath),
  ).href;
  const loadedModule: unknown = await import(moduleUrl);

  if (!isRecord(loadedModule)) {
    throw new Error("The adapter module must export an adapter or factory.");
  }

  const exportedAdapter = loadedModule.vectorStoreAdapter;

  if (isKnowledgeBaseVectorStoreAdapter(exportedAdapter)) {
    return withMarkdownSplitter(exportedAdapter);
  }

  const factory = loadedModule.createVectorStoreAdapter;

  if (isAdapterFactory(factory)) {
    const createdAdapter: unknown = await factory();

    if (isKnowledgeBaseVectorStoreAdapter(createdAdapter)) {
      return withMarkdownSplitter(createdAdapter);
    }
  }

  throw new Error(
    "The adapter module must export vectorStoreAdapter or createVectorStoreAdapter() implementing name and ingest().",
  );
}

async function withMarkdownSplitter(adapter: KnowledgeBaseVectorStoreAdapter): Promise<KnowledgeBaseVectorStoreAdapter> {
  let splitter: MarkdownSplitter = new StructuralMarkdownSplitter({
    maxCharacters: integerEnvironmentVariable("AUTO_SPLITTER_MAX_CHARS", 6400, 1),
  });
  const modulePath = process.env.AUTO_MARKDOWN_SPLITTER_MODULE?.trim();
  if (modulePath) {
    const loaded: unknown = await import(pathToFileURL(resolve(PROJECT_ROOT, modulePath)).href);
    if (!isRecord(loaded)) throw new TypeError("Invalid MarkdownSplitter module.");
    const created: unknown = isAdapterFactory(loaded.createMarkdownSplitter)
      ? await loaded.createMarkdownSplitter()
      : loaded.markdownSplitter;
    if (!isRecord(created) || typeof created.name !== "string" || typeof created.split !== "function") {
      throw new TypeError("Splitter module must export markdownSplitter or createMarkdownSplitter() implementing name and split().");
    }
    splitter = created as unknown as MarkdownSplitter;
  }
  return {
    name: `${adapter.name}:${splitter.name}`,
    async ingest(request) {
      const maxFiles = integerEnvironmentVariable("AUTO_MAX_KB_FILES", 100, 1);
      const maxBytes = integerEnvironmentVariable("AUTO_MAX_KB_BYTES", 50 * 1024 * 1024, 1);
      const maxInput = integerEnvironmentVariable("AUTO_SPLITTER_MAX_INPUT_CHARACTERS", 3_000_000, 1);
      if (request.files.reduce((total, file) => total + file.markdown.length, 0) > maxInput) {
        throw new RangeError("Splitter input exceeds AUTO_SPLITTER_MAX_INPUT_CHARACTERS.");
      }
      const files: KnowledgeBaseFile[] = [];
      let bytes = 0;
      for (const file of request.files) {
        request.signal?.throwIfAborted();
        const segments = await splitter.split(file.markdown, {
          sourceId: String(file.metadata.source_id ?? request.namespace),
          documentId: String(file.metadata.document_id ?? file.filename),
          canonicalUrl: String(file.metadata.canonical_url ?? file.metadata.source_url ?? SOURCE_URL),
          title: typeof file.metadata.title === "string" ? file.metadata.title : undefined,
          documentContentHash: String(file.metadata.content_hash ?? ""),
          signal: request.signal,
        });
        if (!segments.length) throw new Error(`Splitter produced no files for ${file.filename}.`);
        for (const [ordinal, segment] of segments.entries()) {
          if (!segment.markdown.trim()) throw new Error(`Splitter produced empty Markdown for ${file.filename}.`);
          bytes += Buffer.byteLength(segment.markdown, "utf8");
          if (files.length >= maxFiles || bytes > maxBytes) throw new RangeError("Split knowledge base exceeds AUTO_MAX_KB_FILES or AUTO_MAX_KB_BYTES.");
          files.push({
            filename: `${file.filename.replace(/\.md$/i, "")}--${String(ordinal + 1).padStart(4, "0")}.md`,
            markdown: segment.markdown,
            metadata: {
              ...file.metadata, ...segment.metadata?.attributes,
              source_id: file.metadata.source_id ?? request.namespace,
              document_id: file.metadata.document_id ?? file.filename,
              canonical_url: file.metadata.canonical_url ?? file.metadata.source_url ?? SOURCE_URL,
              content_hash: createHash("sha256").update(segment.markdown).digest("hex"),
              parent_content_hash: file.metadata.content_hash ?? null,
              splitter: splitter.name, parent_filename: file.filename,
            },
          });
        }
      }
      const directory = resolve(MARKDOWN_ROOT, "split", randomUUID());
      await mkdir(directory, { recursive: true });
      for (const file of files) {
        if (file.filename.includes("/") || file.filename.includes("\\") || file.filename === "..") throw new TypeError("Unsafe generated filename.");
        await writeFile(resolve(directory, file.filename), file.markdown, "utf8");
      }
      await writeFile(resolve(directory, "manifest.json"), JSON.stringify({ splitter: splitter.name, files: files.map(({ filename, metadata }) => ({ filename, metadata })) }, null, 2), "utf8");
      console.log(`Split knowledge files: ${files.length}; manifest: ${directory}/manifest.json`);
      return adapter.ingest({ ...request, files, ...(process.env.AUTO_VECTOR_STORE_PROVIDER === "weaviate" ? { chunking: undefined } : {}) });
    },
  };
}

async function loadMetadataEnricher(): Promise<KnowledgeBaseMetadataEnricher> {
  const modulePath = process.env.AUTO_METADATA_ENRICHER_MODULE?.trim()
    || DEFAULT_METADATA_ENRICHER_MODULE;
  const moduleUrl = pathToFileURL(resolve(PROJECT_ROOT, modulePath)).href;
  const loadedModule: unknown = await import(moduleUrl);

  if (!isRecord(loadedModule)) {
    throw new Error("The metadata module must export an enricher or factory.");
  }

  if (isKnowledgeBaseMetadataEnricher(loadedModule.metadataEnricher)) {
    return loadedModule.metadataEnricher;
  }

  const factory = loadedModule.createMetadataEnricher;

  if (isAdapterFactory(factory)) {
    const created: unknown = await factory();

    if (isKnowledgeBaseMetadataEnricher(created)) {
      return created;
    }
  }

  throw new Error(
    "The metadata module must export metadataEnricher or createMetadataEnricher() implementing name and enrich().",
  );
}

function createSource(
  maxPages: number,
  maxDepth: number,
  crawlConcurrency: number,
): WebsiteSource {
  const now = new Date();

  return {
    id: SOURCE_ID,
    type: "website",
    name: SOURCE_ID,
    url: SOURCE_URL,
    createdAt: now,
    updatedAt: now,
    options: {
      crawl: {
        discoveryStrategy: "sitemap-and-crawl",
        maxPages,
        maxDepth,
        concurrency: crawlConcurrency,
        sameOriginOnly: true,
        respectRobotsTxt: true,
      },
    },
  };
}

function toKnowledgeFile(
  document: WebDocument,
  semantic: KnowledgeBaseSemanticMetadata,
): KnowledgeBaseFile {
  const filename = document.artifact?.filename;

  if (!filename) {
    throw new Error(
      `Materialized document ${document.id} has no persisted Markdown artifact.`,
    );
  }

  return {
    filename,
    markdown: document.markdown,
    metadata: {
      source_id: document.sourceId,
      document_id: document.id,
      source_url: document.url,
      canonical_url: document.canonicalUrl,
      content_hash: document.contentHash,
      fetched_at: document.acquisition.fetchedAt.toISOString(),
      domain: semantic.domain,
      tags: semantic.tags.join(","),
      keywords: semantic.keywords.join(","),
      ...(document.title
        ? { title: document.title }
        : {}),
      ...(document.metadata.language
        ? { language: document.metadata.language }
        : {}),
      ...(document.metadata.contentType
        ? { content_type: document.metadata.contentType }
        : {}),
      ...(document.acquisition.lastModified
        ? { last_modified: document.acquisition.lastModified }
        : {}),
    },
  };
}

function printHelp(): void {
  console.info(`Auto website-to-knowledge-base runner

Default adapter:
  OpenAI module at ../3_benchmarks/realtime-compare-mcp-x-function/MarkdownSplitter/
  openai-vector-store.adapter.ts (uses OPENAI_API_KEY from .env)

Optional provider override:
  AUTO_VECTOR_STORE_ADAPTER_MODULE  .mjs/.ts module exporting vectorStoreAdapter
                                       or createVectorStoreAdapter()

Semantic metadata:
  AUTO_METADATA_MODE=local (default, no model requests) or model.
  Model mode uses OpenAI Responses with AUTO_METADATA_MODEL (default gpt-6-luna).
  AUTO_METADATA_ENRICHER_MODULE selects another model provider implementation.
  AUTO_METADATA_MAX_REQUESTS and AUTO_METADATA_MAX_INPUT_CHARS cap model work.
  Model results are cached by content hash, domain, URL, and provider.

The adapter implements KnowledgeBaseVectorStoreAdapter:
  name: string
  ingest({ name, namespace, files, chunking?, metadata? })

Defaults: max pages 100, crawl depth 4, crawl/materialization concurrency 4.
Markdown files are written to kb/{SOURCE_ID}/; run reports go to
 data/ingestion-results/{SOURCE_ID}/.
AUTO_MAX_KB_FILES and AUTO_MAX_KB_BYTES cap the upload before model or
Vector Store requests.

No website requests are made by --help.
`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const namespace = process.env.AUTO_KB_NAMESPACE?.trim()
    || SOURCE_ID;
  const vectorStoreName = process.env.AUTO_VECTOR_STORE_NAME?.trim()
    || SOURCE_TITLE;
  const reportPath = resolve(REPORT_ROOT, `${runId}.json`);
  const mode = metadataMode();

  const maxPages = integerEnvironmentVariable(
    "AUTO_MAX_PAGES",
    100,
    1,
    100,
  );
  const maxDepth = integerEnvironmentVariable(
    "AUTO_MAX_DEPTH",
    4,
    0,
    8
  );
  const crawlConcurrency = integerEnvironmentVariable(
    "AUTO_CRAWL_CONCURRENCY",
    4,
    1,
    32,
  );
  const materializationConcurrency = integerEnvironmentVariable(
    "AUTO_MATERIALIZATION_CONCURRENCY",
    4,
    1,
    32,
  );
  const maxFailures = integerEnvironmentVariable(
    "AUTO_MAX_FAILURES",
    10,
    0,
  );
  const maxElapsedMs = integerEnvironmentVariable(
    "AUTO_MAX_ELAPSED_MS",
    600_000,
    1,
  );
  const timeoutMs = integerEnvironmentVariable(
    "AUTO_PAGE_TIMEOUT_MS",
    30_000,
    1,
  );
  const maxBytesPerDocument = integerEnvironmentVariable(
    "AUTO_MAX_BYTES_PER_DOCUMENT",
    10 * 1024 * 1024,
    1,
  );
  const maxKbFiles = integerEnvironmentVariable(
    "AUTO_MAX_KB_FILES",
    100,
    1,
  );
  const maxKbBytes = integerEnvironmentVariable(
    "AUTO_MAX_KB_BYTES",
    50 * 1024 * 1024,
    1,
  );
  const uploadConcurrency = integerEnvironmentVariable(
    "AUTO_UPLOAD_CONCURRENCY",
    4,
    1,
    32,
  );
  const metadataConcurrency = integerEnvironmentVariable(
    "AUTO_METADATA_CONCURRENCY",
    2,
    1,
    16,
  );
  const maxMetadataRequests = mode === "model"
    ? integerEnvironmentVariable("AUTO_METADATA_MAX_REQUESTS", 100, 0)
    : undefined;
  const maxMetadataInputChars = mode === "model"
    ? integerEnvironmentVariable("AUTO_METADATA_MAX_INPUT_CHARS", 3_000_000, 0)
    : undefined;
  const maxMetadataCharsPerFile = mode === "model"
    ? integerEnvironmentVariable("AUTO_METADATA_MAX_CHARS", 30_000, 1_000)
    : undefined;
  const maxChunkSizeTokens = integerEnvironmentVariable(
    "AUTO_MAX_CHUNK_SIZE_TOKENS",
    1_600,
    1,
  );
  const chunkOverlapTokens = integerEnvironmentVariable(
    "AUTO_CHUNK_OVERLAP_TOKENS",
    200,
    0,
  );

  const source = createSource(
    maxPages,
    maxDepth,
    crawlConcurrency,
  );

  let adapterName: string | undefined;
  let metadataEnricherName: string | undefined;
  let metadataCacheHits = 0;
  let metadataGenerated = 0;
  let metadataRequests = 0;
  let estimatedMetadataInputChars = 0;
  let markdownBytes = 0;
  let domainNames: readonly string[] = [];
  let discoveryStats: WebsiteDiscoveryStats | undefined;
  let discoveredUrls: readonly DiscoveredUrl[] = [];
  let documents: WebDocument[] = [];
  let materializationFailures: MaterializationFailure[] = [];
  let metadataFailures: Array<{
    filename: string;
    error: string;
  }> = [];
  let fileManifest: Array<{
    filename: string;
    metadata: KnowledgeBaseFileMetadata;
  }> = [];
  let vectorStoreResult: KnowledgeBaseVectorStoreIngestResult | undefined;
  let failure: string | undefined;
  let skipVectorUploadReason: string | undefined;
  let browserManager: PuppeteerBrowserManager | undefined;

  try {
    const adapter = await loadVectorStoreAdapter();
    adapterName = adapter.name;
    const metadataEnricher = mode === "local"
      ? new LocalMetadataEnricher()
      : await loadMetadataEnricher();
    metadataEnricherName = metadataEnricher.name;
    const metadataCache = mode === "model"
      ? await MetadataCache.open(METADATA_CACHE_PATH)
      : undefined;

    const runSignal = AbortSignal.timeout(maxElapsedMs);
    const discovery = await new WebsiteDiscoveryService({
      maxUrls: maxPages,
    }).collectReport(source, runSignal);

    discoveredUrls = discovery.urls;
    discoveryStats = discovery.stats;

    browserManager = new PuppeteerBrowserManager();

    const materializer = new DefaultWebsiteDocumentMaterializer({
      artifactRootDirectory: MARKDOWN_ROOT,
      maxBytes: maxBytesPerDocument,
      timeoutMs,
      renderer: new HtmlRenderingOrchestrator({
        browserRenderer: new PuppeteerBrowserHtmlRenderer({
          sessionFactory: browserManager,
          operationTimeoutMs: timeoutMs,
          navigationTimeoutMs: timeoutMs,
          maxRenderedBytes: maxBytesPerDocument,
        }),
      }),
    });

    const tasks = discoveredUrls.map(
      (discoveredUrl) => (signal?: AbortSignal) =>
        materializer.materialize(
          source,
          discoveredUrl,
          signal,
        ),
    );

    const results = await new CrawlScheduler({
      defaultConcurrency: materializationConcurrency,
      maxConcurrency: 32,
    }).runOrdered(tasks, {
      concurrency: materializationConcurrency,
      signal: runSignal,
    });

    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const discoveredUrl = discoveredUrls[index];

      if (!result || !discoveredUrl) {
        continue;
      }

      if (result.status === "fulfilled") {
        documents.push(result.value);
      } else {
        materializationFailures.push({
          url: discoveredUrl.url,
          error: errorMessage(result.reason),
        });
      }
    }

    if (documents.length === 0) {
      throw new Error("No website pages were materialized; vector-store upload was skipped.");
    }

    markdownBytes = documents.reduce(
      (total, document) => total + Buffer.byteLength(document.markdown, "utf8"),
      0,
    );

    if (documents.length > maxKbFiles || markdownBytes > maxKbBytes) {
      throw new Error(
        `Knowledge-base upload budget exceeded before metadata or Vector Store calls: `
        + `files=${documents.length}/${maxKbFiles}, bytes=${markdownBytes}/${maxKbBytes}.`,
      );
    }

    const catalog = buildDomainCatalog(documents);
    domainNames = catalog.domains;

    const semanticMetadata: Array<KnowledgeBaseSemanticMetadata | undefined> =
      new Array(documents.length);
    const pending: Array<{
      index: number;
      document: WebDocument;
      domain: string;
      filename: string;
      cacheKey?: string;
    }> = [];

    for (let index = 0; index < documents.length; index += 1) {
      const document = documents[index];

      if (!document) {
        continue;
      }

      const domain = catalog.byDocumentId.get(document.id);
      const filename = document.artifact?.filename;

      if (!domain || !filename) {
        throw new Error(`Missing domain or Markdown artifact for ${document.id}.`);
      }

      const cacheKey = metadataCache
        ? metadataCacheKey({
          provider: metadataEnricher.name,
          domain,
          canonicalUrl: document.canonicalUrl,
          contentHash: document.contentHash,
        })
        : undefined;
      const cached = cacheKey && metadataCache
        ? metadataCache.get(cacheKey, domain)
        : undefined;

      if (cached) {
        semanticMetadata[index] = cached;
        metadataCacheHits += 1;
      } else {
        pending.push({ index, document, domain, filename, cacheKey });
      }
    }

    if (mode === "model") {
      metadataRequests = pending.length;
      estimatedMetadataInputChars = pending.reduce(
        (total, item) => total
          + Math.min(item.document.markdown.length, maxMetadataCharsPerFile ?? 30_000)
          + 2_000,
        0,
      );

      if (
        metadataRequests > (maxMetadataRequests ?? 0)
        || estimatedMetadataInputChars > (maxMetadataInputChars ?? 0)
      ) {
        throw new Error(
          `Semantic metadata budget exceeded before model calls: `
          + `requests=${metadataRequests}/${maxMetadataRequests}, `
          + `estimatedInputChars=${estimatedMetadataInputChars}/${maxMetadataInputChars}.`,
        );
      }
    }

    const enrichmentTasks = pending.map(
      ({ document, domain, filename }) => (signal?: AbortSignal) =>
        metadataEnricher.enrich({
          filename,
          sourceUrl: document.canonicalUrl,
          title: document.title,
          markdown: document.markdown,
          domain,
          signal,
        }),
    );

    const enrichmentResults = await new CrawlScheduler({
      defaultConcurrency: metadataConcurrency,
      maxConcurrency: 16,
    }).runOrdered(enrichmentTasks, {
      concurrency: metadataConcurrency,
      signal: runSignal,
    });

    for (let index = 0; index < enrichmentResults.length; index += 1) {
      const result = enrichmentResults[index];
      const item = pending[index];

      if (!result || !item) {
        continue;
      }

      try {
        if (result.status === "rejected") {
          throw result.reason;
        }

        const validated = validateKnowledgeBaseSemanticMetadata(
          result.value,
          item.domain,
        );
        semanticMetadata[item.index] = validated;
        metadataGenerated += 1;

        if (item.cacheKey && metadataCache) {
          metadataCache.set(item.cacheKey, validated);
        }
      } catch (cause) {
        metadataFailures.push({
          filename: item.filename,
          error: errorMessage(cause),
        });
      }
    }

    if (metadataCache && metadataGenerated > 0) {
      await metadataCache.save();
    }

    if (metadataFailures.length > 0) {
      throw new Error(
        `${metadataFailures.length} file(s) lacked valid semantic metadata; Vector Store upload was skipped.`,
      );
    }

    const files = documents.map((document, index) => {
      const semantic = semanticMetadata[index];

      if (!semantic) {
        throw new Error(`Missing semantic metadata for ${document.id}.`);
      }

      return toKnowledgeFile(document, semantic);
    });
    fileManifest = files.map((file) => ({
      filename: file.filename,
      metadata: file.metadata,
    }));

    if (materializationFailures.length > maxFailures) {
      skipVectorUploadReason =
        `materialization failures (${materializationFailures.length}) exceeded AUTO_MAX_FAILURES (${maxFailures})`;
    } else {
      const request = {
        name: vectorStoreName,
        description: `Markdown knowledge base generated from ${SOURCE_URL}`,
        namespace,
        files,
        chunking: {
          maxChunkSizeTokens,
          chunkOverlapTokens,
        },
        uploadConcurrency,
        signal: runSignal,
        metadata: {
          source_id: SOURCE_ID,
          source_url: SOURCE_URL,
        },
      };

      const rawResult: unknown = await adapter.ingest(request);

      const expectedFilenames = new Set(
        files.map((file) => file.filename),
      );
      const reportedFilenames = isKnowledgeBaseVectorStoreIngestResult(rawResult)
        ? new Set(rawResult.files.map((file) => file.filename))
        : new Set<string>();

      if (
        !isKnowledgeBaseVectorStoreIngestResult(rawResult)
        || rawResult.files.length !== files.length
        || reportedFilenames.size !== expectedFilenames.size
        || [...expectedFilenames].some(
          (filename) => !reportedFilenames.has(filename),
        )
      ) {
        throw new Error(
          `Vector store adapter "${adapter.name}" returned an invalid or incomplete ingest result.`,
        );
      }

      vectorStoreResult = rawResult;
    }
  } catch (cause) {
    failure = errorMessage(cause);
  } finally {
    if (browserManager) {
      try {
        await browserManager.close();
      } catch (cause) {
        failure = failure
          ? `${failure}; browser shutdown failed: ${errorMessage(cause)}`
          : `browser shutdown failed: ${errorMessage(cause)}`;
      }
    }
  }

  const partial = discoveredUrls.length >= maxPages
    || (discoveryStats?.crawlPagesFailed ?? 0) > 0
    || materializationFailures.length > 0
    || Boolean(skipVectorUploadReason);
  const status = failure
    ? "failed"
    : partial
      ? "partial"
      : "completed";

  const report = {
    schemaVersion: 1,
    runId,
    source: {
      id: SOURCE_ID,
      url: SOURCE_URL,
    },
    namespace,
    vectorStoreName,
    vectorStoreAdapter: adapterName,
    status,
    startedAt,
    finishedAt: new Date().toISOString(),
    markdownDirectory: MARKDOWN_ROOT,
    discovery: {
      count: discoveredUrls.length,
      pageCap: maxPages,
      stats: discoveryStats,
    },
    materialization: {
      succeeded: documents.map((document) => ({
        documentId: document.id,
        canonicalUrl: document.canonicalUrl,
        filename: document.artifact?.filename,
        relativePath: document.artifact?.relativePath,
        contentHash: document.contentHash,
      })),
      failures: materializationFailures,
    },
    knowledgeBaseBudget: {
      files: documents.length,
      markdownBytes,
      maxFiles: maxKbFiles,
      maxBytes: maxKbBytes,
    },
    metadataEnrichment: {
      mode,
      provider: metadataEnricherName,
      domains: domainNames,
      cacheHits: metadataCacheHits,
      generated: metadataGenerated,
      modelRequests: metadataRequests,
      estimatedInputCharacters: estimatedMetadataInputChars,
      ...(mode === "model"
        ? {
          cachePath: METADATA_CACHE_PATH,
          limits: {
            maxRequests: maxMetadataRequests,
            maxInputCharacters: maxMetadataInputChars,
            maxCharactersPerFile: maxMetadataCharsPerFile,
          },
        }
        : {}),
      failures: metadataFailures,
    },
    knowledgeBaseManifest: fileManifest,
    vectorStore: vectorStoreResult,
    vectorUploadSkippedBecause: skipVectorUploadReason,
    failure,
  };

  await mkdir(dirname(reportPath), {
    recursive: true,
  });
  await writeFile(
    reportPath,
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );

  console.info(`Auto ingestion report: ${reportPath}`);
  console.info(`Markdown knowledge base: ${MARKDOWN_ROOT}`);
  console.info(JSON.stringify({
    status,
    discovered: discoveredUrls.length,
    materialized: documents.length,
    markdownBytes,
    materializationFailures: materializationFailures.length,
    metadataMode: mode,
    metadataFailures: metadataFailures.length,
    metadataCacheHits,
    metadataModelRequests: metadataRequests,
    domains: domainNames,
    vectorStoreId: vectorStoreResult?.storeId,
    vectorStoreAdapter: adapterName,
    vectorUploadSkippedBecause: skipVectorUploadReason,
  }, null, 2));

  if (failure) {
    console.error(failure);
    process.exitCode = 1;
  } else if (partial || !vectorStoreResult) {
    process.exitCode = 2;
  }
}

main().catch((cause: unknown) => {
  console.error(errorMessage(cause));
  process.exitCode = 1;
});
