# Remote Ingestion Retrieval

[Português](README.pt.md) | **English** | [Italiano](README.it.md)

A TypeScript library that turns URLs and websites into Markdown, splits the content, and inserts it into a knowledge base. It includes HTTP and browser acquisition, page discovery, metadata, execution limits, and incremental vector synchronization.

The package provides two storage paths:

- **Precomputed vectors:** `RemoteSourceIngestion` receives an `EmbeddingProvider` and a `VectorStore`. `WeaviateVectorStore` and `QdrantVectorStore` write and delete vectors, including on self-hosted installations.
- **Markdown files:** `KnowledgeBaseVectorStoreAdapter` receives files and metadata. The Weaviate/Qdrant adapters split text and use native cluster vectorization; Qdrant also accepts embeddings supplied by the host.

These contracts have different responsibilities. A file-upload API does not have to implement the precomputed-vector contract.

## Common provider configuration

`AUTO_VECTOR_STORE_BASE_URL` is the primary URL of the selected storage provider. `resolveVectorStoreProviderConfiguration()` resolves the shared configuration consumed by `createKnowledgeBaseVectorStoreAdapter()` and `createPrecomputedVectorStore()`.

| Variable | Purpose |
| --- | --- |
| `AUTO_VECTOR_STORE_PROVIDER` | `weaviate`, `qdrant`, `openai-compatible`, or `custom`. |
| `AUTO_VECTOR_STORE_BASE_URL` | HTTP(S) endpoint of the storage API. |
| `AUTO_VECTOR_STORE_API_KEY` | Key for the selected storage provider. |
| `AUTO_VECTOR_STORE_COLLECTION` | Weaviate/Qdrant collection. |
| `AUTO_VECTOR_STORE_TIMEOUT_MS` | Request timeout; default 30000. |
| `AUTO_VECTOR_STORE_BATCH_SIZE` | Batch size; default 100, between 1 and 200 in shared configuration. |
| `AUTO_VECTOR_STORE_MAX_CHUNKS` | Limit before embedding requests; default 10000. |
| `AUTO_VECTOR_STORE_MAX_CHUNK_CHARACTERS` | Local splitting limit; default 6400 characters. |
| `AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS` | Verification attempts; default 3. |
| `AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS` | Delay between attempts; default 250, accepts zero. |
| `AUTO_EMBEDDING_MODE` | `native` or `provided`; defaults to `provided` when an embedding module is selected and the mode is absent. |
| `AUTO_EMBEDDING_MODEL` / `AUTO_EMBEDDING_DIMENSIONS` | Embedding model and dimensions. |
| `AUTO_EMBEDDING_BASE_URL` / `AUTO_EMBEDDING_API_KEY` | External embedding-service connection, supplied to the host module. |
| `AUTO_EMBEDDING_PROVIDER_MODULE` | Module exporting `embeddingProvider` or `createEmbeddingProvider(configuration)`. |

Use the shared `AUTO_*` configuration for every provider; older aliases remain supported in code but are omitted from the environment reference. A key belonging to another provider is never reused. `QDRANT_DISTANCE` remains provider-specific because it selects a Qdrant collection metric.

When migrating an older `.env`, remove generic values pointing to another service: they now take precedence for Weaviate too. The implementation does not modify `.env` or migrate credentials automatically.

An external embedding endpoint is independent of storage: `AUTO_EMBEDDING_BASE_URL` does not replace `AUTO_VECTOR_STORE_BASE_URL`. Native Weaviate/Qdrant embeddings use the cluster key. Weaviate also supports a native vectorizer URL through `AUTO_EMBEDDING_BASE_URL`; native Qdrant uses its own Cloud Inference and rejects an external endpoint in that mode.

```ts
import {
  resolveVectorStoreProviderConfiguration,
  createKnowledgeBaseVectorStoreAdapter,
} from "remote-ingestion-retrieval";

const configuration = resolveVectorStoreProviderConfiguration(process.env);
const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration);
const result = await adapter.ingest({ name: "Support", namespace: "support", files });
```

Custom Vector Store modules receive this configuration in `createVectorStoreAdapter(configuration)`; older factories without arguments remain compatible. Without an explicit provider, selecting a module defaults to `custom`; otherwise the default is `openai-compatible`.

## Installation

Requires Node.js 22 or later.

```bash
npm ci
npm run build
```

For JavaScript-dependent pages, install the Chrome build matching Puppeteer:

```bash
npx puppeteer browsers install chrome
```

Install this directory as a dependency in another local project:

```bash
npm install /path/to/remote-ingestion-retrieval
```

The package name is `remote-ingestion-retrieval`; its compiled entry point is `dist/index.js`. Importing it does not start a crawl, launch a browser, or call providers. Do not run `node src/index.ts`; use the library or the manual runner below.

## Manual ingestion with Weaviate Cloud

Copy `.env.example` to `.env` and configure a source and collection:

```dotenv
SOURCE_ID=product-docs
SOURCE_TITLE=Product documentation
SOURCE_URL=https://docs.example.com/
AUTO_KB_NAMESPACE=product_docs
AUTO_VECTOR_STORE_PROVIDER=weaviate
AUTO_VECTOR_STORE_BASE_URL=https://your-cluster.weaviate.cloud
AUTO_VECTOR_STORE_API_KEY=your-cluster-api-key
AUTO_VECTOR_STORE_COLLECTION=ProductDocs
AUTO_EMBEDDING_MODEL=Snowflake/snowflake-arctic-embed-l-v2.0
```

```bash
npm run ingest
```

The runner discovers pages, materializes Markdown, enriches metadata, applies the splitter, and uploads the result automatically. The `weaviate` provider uses modules included in this repository.

A collection is created if missing. An existing collection must match the vectorizer, model, embedding configuration, and required properties. Incompatible schemas are rejected rather than changed. Use a dedicated collection with one unnamed vector. Weaviate collection names must start with an uppercase letter and contain only letters, numbers, and `_`.

The `text2vec-weaviate` vectorizer generates embeddings during object import and is available on Weaviate Cloud. This integration does not make a separate `/embeddings` call. See the [official Weaviate embeddings documentation](https://docs.weaviate.io/weaviate/model-providers/weaviate/embeddings).

Original Markdown is stored under `kb/<SOURCE_ID>/`. Split files actually submitted, with `manifest.json`, are stored under `kb/<SOURCE_ID>/split/<id>/`. Run reports are stored under `data/ingestion-results/<SOURCE_ID>/`. Weaviate results identify the collection and objects `{ filename, id, chunkId }`, not OpenAI Files API uploads.

File ingestion imports/upserts snapshots and does not delete old chunks of changed files. Use a new collection for isolated snapshots or the incremental precomputed-vector pipeline for reconciliation. A failed batch may leave objects persisted; success requires all batches and verification to finish. IDs are deterministic for the collection, namespace, and chunk identity.

### Runner limits and metadata

| Variable | Default / purpose |
| --- | --- |
| `AUTO_MAX_PAGES` | 100 discovered pages. |
| `AUTO_MAX_DEPTH` | Depth 4. |
| `AUTO_CRAWL_CONCURRENCY` | 4 discovery operations. |
| `AUTO_MATERIALIZATION_CONCURRENCY` | 4 document materializations. |
| `AUTO_MAX_KB_FILES` | 100 source documents, before splitting. |
| `AUTO_MAX_SPLIT_FILES` | 10000 generated files, independent of source-document count. |
| `AUTO_MAX_KB_BYTES` | 50 MiB of Markdown; checked after splitting too. |
| `AUTO_SPLITTER_MAX_CHARS` | Structural splitter: 6400 characters per segment. |
| `AUTO_SPLITTER_MAX_INPUT_CHARACTERS` | 3000000 characters before splitting the collection. |
| `AUTO_METADATA_MODE` | `local`, without model calls; `model` uses the selected enricher. |
| `AUTO_MARKDOWN_SPLITTER_MODULE` | Optional splitter instance/factory module. |
| `AUTO_VECTOR_STORE_ADAPTER_MODULE` | Optional adapter instance/factory module. |
| `AUTO_METADATA_ENRICHER_MODULE` | Optional metadata enricher instance/factory module. |

Acquisition limits include `AUTO_MAX_ELAPSED_MS`, `AUTO_PAGE_TIMEOUT_MS`, `AUTO_MAX_BYTES_PER_DOCUMENT`, and `AUTO_MAX_FAILURES`. Consult reports to distinguish a partial run from a complete source snapshot. `.env.example` documents all variables, defaults, ranges, and aliases.

Local metadata derives `domain`, `tags`, and `keywords` from content and page hierarchy. Model mode caches results by provider, domain, URL, and content hash. Its settings include `AUTO_METADATA_MAX_REQUESTS` (100), `AUTO_METADATA_MAX_INPUT_CHARS` (3000000), `AUTO_METADATA_MAX_CHARS` (30000), `AUTO_METADATA_MODEL`, and `AUTO_METADATA_CONCURRENCY`. Request and character limits are not a monetary spending cap.

Built-in Weaviate/Qdrant providers take precedence over an adapter module. Without an explicit module, `openai-compatible` uses the bundled OpenAI adapter; `custom` uses a host module. Only the legacy model enricher still defaults to the sibling benchmark project; select `AUTO_METADATA_ENRICHER_MODULE` in other checkouts. Local metadata does not need that external module.

Weaviate/Qdrant local splitting counts characters, not exact tokens or overlap. Their file adapters reject token-based `request.chunking`; the runner omits that field for adapters declaring `supportsTokenChunking = false`.

## MarkdownSplitter

### Local splitting

`StructuralMarkdownSplitter` is the default for the facade and runner. It preserves text and UTF-16 offsets, prefers paragraph boundaries, and does not call models. Long code blocks or tables may be split; inject another splitter to preserve such blocks as units.

```ts
import { StructuralMarkdownSplitter } from "remote-ingestion-retrieval";

const splitter = new StructuralMarkdownSplitter({ maxCharacters: 6400 });
const segments = await splitter.split(markdown, {
  sourceId: "docs",
  documentId: "installation",
  canonicalUrl: "https://docs.example.com/install",
  documentContentHash: "document-hash",
});
```

Use `ExistingMarkdownSplitterAdapter` to reuse a host splitter through `split`, `toMarkdown`, and optional `toMetadata` functions.

### Semantic splitting compatible with inx-nlp

`SemanticMarkdownSplitter` incorporates the `files + metadata` contract and rules used by MarkdownSplitter and the inx-nlp task. The application injects its model/task executor; no SDK or model is mandatory.

The executor receives instructions, JSON Schema, and source context. Output must use sequential `NN_semantic_domain.md` names, Markdown without front matter or outer fences, complete attributes, and a one-to-one file/manifest mapping. Validation happens before indexing.

```ts
import {
  SemanticMarkdownSplitter,
  type SemanticMarkdownExecutionRequest,
} from "remote-ingestion-retrieval";

// Implement/import the authenticated structured-task executor in the host.
export function createMarkdownSplitter() {
  return new SemanticMarkdownSplitter({
    execute: (request: SemanticMarkdownExecutionRequest) => runStructuredTask(request),
    namespace: "product_docs",
    normalizedFrom: "markdown",
    normalizedOn: "2026-10-27",
    maxInputCharacters: 200_000,
    maxOutputCharacters: 400_000,
    maxFiles: 100,
  });
}
```

Select this module with `AUTO_MARKDOWN_SPLITTER_MODULE=./path/splitter.ts`. The runner loads TypeScript through `tsx`. `runStructuredTask` must respect `request.signal` and return parsed `files + metadata` or its JSON string; it is a host dependency, not a library export.

`split(markdown, context)` produces chunk segments; `files(markdown, context)` returns `KnowledgeBaseFile[]`; `normalize(markdown, context)` returns the original normalized contract:

```ts
const knowledgeBase = await splitter.normalize(markdown, context);
// { files: [{ filename, markdown }], metadata: [{ filename, attributes }] }
```

Attributes include `organization`, `language`, `document_type`, `domain`, `audience`, `kb_namespace`, `source_file`, `source_pages`, `temporal_sensitivity`, `review_required`, `source_effective_date`, `normalized_from`, `normalized_on`, and `tags`. Supplied provenance, namespace, and date must remain unchanged. `normalized_from` supports `markdown` and `html` in addition to the original PDF values.

Instructions preserve source language, facts, numbers, conditions, exceptions, and ambiguity. Structural validation cannot prove model factual fidelity; `review_required` remains relevant. Rewritten content does not receive invented offsets: source positions are resolved only by text matches or explicit offsets. Semantic attributes are retained in `chunk.metadata.splitter.attributes` and projected to vector metadata; pipeline-generated identifiers and hashes take precedence.

## Incremental precomputed-vector pipeline

Use this path when the host already supplies embeddings or needs incremental reconciliation, including removal of old chunks. Weaviate uses `vectorizer: none`.

```ts
import {
  RemoteSourceIngestion,
  StructuralMarkdownSplitter,
  WeaviateVectorStore,
} from "remote-ingestion-retrieval";

// embeddingProvider belongs to the host and implements EmbeddingProvider.
const vectorStore = new WeaviateVectorStore({
  url: process.env.AUTO_VECTOR_STORE_BASE_URL!,
  apiKey: process.env.AUTO_VECTOR_STORE_API_KEY,
  collection: "ProductDocsVectors",
});
await vectorStore.ensureCollection();
const ingestion = new RemoteSourceIngestion({
  pipelineRevision: "structural-v1:embedding-model-and-dimensions-v1:metadata-v1",
  markdownSplitter: new StructuralMarkdownSplitter({ maxCharacters: 6400 }),
  embeddingProvider,
  vectorStore,
  stateRootDirectory: "./data/sync",
});
try {
  const now = new Date();
  const outcome = await ingestion.runSourceInsertion({
    source: {
      id: "product-docs", type: "website", url: "https://docs.example.com/",
      createdAt: now, updatedAt: now,
      options: { crawl: {
        discoveryStrategy: "sitemap-and-crawl", sameOriginOnly: true,
        maxPages: 100, maxDepth: 3, concurrency: 3,
      } },
    },
    namespace: "product_docs",
    failurePolicy: "continue-partial",
    materializationConcurrency: 3,
    limits: {
      maxElapsedMs: 300_000, maxFetchedBytes: 100 * 1024 * 1024,
      maxChunks: 10_000, maxEmbeddingInputs: 5_000,
    },
  });
  if (outcome.ok) console.log(outcome.status, outcome.summary);
  else console.error(outcome.status, outcome.error);
} finally {
  await ingestion.close();
}
```

For a single URL, set `source.type: "url"`. Change `pipelineRevision` whenever splitting, model, dimensions, preprocessing, or metadata projection changes. Preserve the state directory to recognize unchanged content.

`insertSource(request)` throws on failure. `runSourceInsertion(request)` returns `completed`, `partial`, `failed`, or `aborted`, with `runId`, summary, and structured error where applicable. An incomplete snapshot does not authorize deleting unseen documents. Namespace participates in object IDs and filtering, but cluster authorization remains the host's responsibility.

## Direct file adapter

```ts
import { WeaviateKnowledgeBaseAdapter } from "remote-ingestion-retrieval";

const adapter = new WeaviateKnowledgeBaseAdapter({
  url: process.env.AUTO_VECTOR_STORE_BASE_URL!,
  apiKey: process.env.AUTO_VECTOR_STORE_API_KEY,
  collection: "SupportKnowledge",
  model: "Snowflake/snowflake-arctic-embed-l-v2.0",
  maxChunkCharacters: 6400,
});
const result = await adapter.ingest({
  name: "Support knowledge", namespace: "support",
  files: [{
    filename: "01_billing.md",
    markdown: "# Billing\n\nPayment instructions from the source.",
    metadata: { domain: "billing", tags: "billing,payments", source_url: "https://example.com/billing" },
  }],
});
console.log(result.storeId, result.objects);
```

Weaviate `domain` uses `field` tokenization for exact matching. `tags` and `keywords` accept arrays or comma-separated strings and are persisted as arrays. Full provenance is retained in `metadataJson`.

The referenced inx voice service uses the OpenAI `/vector_stores/{id}/search` API. A Weaviate collection is not a drop-in replacement for that ID. The included `WeaviateSearchAdapter` provides scoped results; the host must route its search through that adapter. This library does not modify inx services.

## Upload existing files

To upload saved Markdown/text without crawling again:

```bash
npm run upload:vector-store -- --namespace support --domain billing ./file.md
npm run upload:vector-store -- --namespace support --manifest ./kb/source/split/run/manifest.json
```

`upload:weaviate` remains a legacy command that explicitly selects Weaviate. Its reports retain the `data/weaviate-uploads/<id>.json` directory. Generic upload reports use `data/vector-store-uploads/<provider>/`.

A manifest contains `files: [{ filename, metadata }]`; each file is next to it. Supported local formats are UTF-8 `.md`, `.markdown`, and `.txt`. Defaults are 100 input documents, 5 MiB per file for standalone upload when no override is set, and 50 MiB total. Configure `AUTO_MAX_KB_FILES`, `AUTO_MAX_BYTES_PER_DOCUMENT`, and `AUTO_MAX_KB_BYTES`; `--report` selects the report path. The adapter additionally limits chunks to 10000 through `AUTO_VECTOR_STORE_MAX_CHUNKS` or `maxChunks`.

Use `adapter.ingestFiles({ name, namespace, files: [{ path, filename?, metadata? }], signal? })` or `loadKnowledgeBaseFiles()` in the API. Convert PDFs and other binary formats before upload.

After import, Weaviate reads every object and vector, checks text/provenance, and requires nonempty finite vectors with consistent dimensions. Results include real chunk IDs, hashes, bytes, and `verification`. Attempts and delay are controlled by `AUTO_VECTOR_STORE_VERIFICATION_ATTEMPTS` and `AUTO_VECTOR_STORE_VERIFICATION_DELAY_MS`.

Runner reports retain original documents in `files`; actual split files and objects are in `splitFiles`, `objects`, and `splitManifestPath`.

## Weaviate search for inx consumers

`WeaviateSearchAdapter` uses the official SDK/gRPC and returns `{ data, has_more: false }`. Results contain `file_id`, `filename`, `score`, `distance`, `attributes`, and `content: [{ type: "text", text }]`.

```ts
import weaviate from "weaviate-client";
import { connectWeaviateSearch } from "remote-ingestion-retrieval";

const search = await connectWeaviateSearch({
  collection: "SupportKnowledge",
  connection: {
    mode: "cloud", url: process.env.AUTO_VECTOR_STORE_BASE_URL!,
    options: { authCredentials: new weaviate.ApiKey(process.env.AUTO_VECTOR_STORE_API_KEY!) },
  },
});
try {
  const results = await search.search({
    query: "How can I pay the invoice?", namespace: "support", domain: "billing", limit: 5,
  });
  console.log(results.data);
} finally {
  await search.close();
}
```

Namespace is required; domain is an optional exact filter. Native collections use `nearText`; inject the ingestion `EmbeddingProvider` for BYOV collections and `nearVector`. Custom HTTP/gRPC connections use `connection: { mode: "custom", options }`; an existing client can also be injected.

The score is negative vector distance: larger is better, but it is not a probability or an OpenAI-calibrated score. Adjust consumer thresholds. The host still needs to select this adapter. SDK/gRPC avoids [deprecated GraphQL and preview REST Search](https://docs.weaviate.io/weaviate/api/graphql/migration).

## GitHub repository acquisition

The runner automatically recognizes repository, `/tree/`, and `/blob/` URLs. `SOURCE_PROFILE=github-repository` selects the profile explicitly; `SOURCE_PROFILE=website` forces ordinary website crawling.

```dotenv
SOURCE_URL=https://github.com/qdrant/qdrant
SOURCE_ID=githubqdrant
SOURCE_PROFILE=github-repository
GITHUB_TOKEN=
GITHUB_INCLUDE_CODE=false
GITHUB_MAX_FILES=100
GITHUB_MAX_API_REQUESTS=200
```

Run `npm run ingest` with the destination adapter configured. No sitemap or social pages are consulted. A reference is pinned to a commit at the start, and its tree supplies candidates. Raw blobs are fetched by SHA and verified against Git hash and size. Priority goes to the root README, documentation, API references, and examples. Repository code is never executed; external/interface links are not followed.

Library selection is explicit:

```ts
const source = {
  id: "qdrant-docs", type: "website" as const,
  url: "https://github.com/qdrant/qdrant",
  createdAt: new Date(), updatedAt: new Date(),
  options: {
    profile: "github-repository" as const,
    github: { ref: "master", path: "docs", includeCode: false, maxFiles: 100 },
    crawl: { maxPages: 100, concurrency: 3 },
  },
};
// Pass githubToken to RemoteSourceIngestion options, outside source metadata.
```

Choose a reference/path that exists. Runner equivalents are `GITHUB_REF` and `GITHUB_PATH`. Without a reference, the default branch is used. References containing slashes are resolved through the API.

`GITHUB_INCLUDE` and `GITHUB_EXCLUDE` are comma-separated repository-relative globs, such as `docs/**,README.md`. Source code requires `GITHUB_INCLUDE_CODE=true`. Binaries, lockfiles, generated files, dependencies, submodules, and symlinks are excluded. Unexpected binary content and Git LFS pointers fail materialization rather than being indexed as content.

Defaults are 100 files, 5 MiB per file, 200 API requests including reserved downloads, 16 MiB per enumeration response, and 100000 tree entries. They are configurable through `GITHUB_MAX_*`; the source page cap also limits files. A token with Contents read permission is required for private repositories, optional for public ones. It is sent only to `api.github.com`, without redirects, and is not persisted in metadata.

Truncated recursive trees trigger subtree enumeration. Remaining truncation or exhausted budgets produce a partial snapshot. Reports record commit, scope, eligible/selected/pending files, requests, and ignored-path samples with reasons. Documents retain `{ owner, repo, ref, commitSha, path, blobSha }`. Identity uses a stable reference/path between commits; acquisition uses the pinned blob. DNS, byte, time, and cancellation controls remain active. Partial snapshots never authorize deleting unseen documents.

## Qdrant

`npm run ingest` uploads automatically after discovery, materialization, metadata, and splitting. No second upload command is needed after successful ingestion. Check reports for failures or budget limits that prevented upload.

Qdrant support includes `QdrantVectorStore`, `QdrantKnowledgeBaseAdapter`, and `QdrantSearchAdapter`. REST requests use `api-key`, timeout/cancellation, namespace-scoped deterministic UUIDs, and `wait=true` writes. Files become points containing text, payload, and vectors, rather than fictitious Files API uploads.

Enable Cloud Inference and copy the exact model/dimensions from the cluster's Inference tab. The adapter does not guess them. See [official Qdrant Cloud Inference documentation](https://qdrant.tech/documentation/inference/cloud-inference/).

```dotenv
AUTO_VECTOR_STORE_PROVIDER=qdrant
AUTO_VECTOR_STORE_BASE_URL=https://your-cluster.qdrant.io:6333
AUTO_VECTOR_STORE_API_KEY=your-cluster-api-key
AUTO_VECTOR_STORE_COLLECTION=knowledge_chunks
AUTO_EMBEDDING_MODE=native
AUTO_EMBEDDING_MODEL=your-enabled-model
AUTO_EMBEDDING_DIMENSIONS=384
QDRANT_DISTANCE=Cosine
```

Replace the example `384` with the selected model's dimensions. Use the same ingestion/upload commands shown above.

Provisioning requires one unnamed dense vector with matching dimensions/distance and creates keyword indexes for namespace/domain where missing. Readback verifies payload, text, IDs, and vectors before success. Search requires namespace and supports domain, limit, and `scoreThreshold`; native scores depend on the collection metric.

```ts
import { QdrantSearchAdapter, resolveVectorStoreProviderConfiguration } from "remote-ingestion-retrieval";

const configuration = resolveVectorStoreProviderConfiguration();
const search = new QdrantSearchAdapter({
  url: configuration.baseUrl!, apiKey: configuration.apiKey,
  collection: configuration.collection!,
  model: configuration.embedding.model, dimensions: configuration.embedding.dimensions!,
});
const results = await search.search({ query: "How can I pay?", namespace: "support", domain: "billing", limit: 5 });
```

For self-hosted Qdrant or host-executed models, select `AUTO_EMBEDDING_MODE=provided` and `AUTO_EMBEDDING_PROVIDER_MODULE=./embedding-provider.ts`. The module implements `EmbeddingProvider` and receives embedding configuration without the database key. Direct injection is also supported:

```ts
const adapter = await createKnowledgeBaseVectorStoreAdapter(configuration, { embeddingProvider });
```

The mode must be `provided`; dimensions come from configuration or `embeddingProvider.dimensions` and must match the collection. Use the same provider for search. Host-provided Weaviate embeddings use the incremental facade with `WeaviateVectorStore`, rather than its native file adapter.

`createPrecomputedVectorStore(configuration)` constructs Weaviate/Qdrant storage for incremental ingestion. Call `ensureCollection()` before first use. File imports upsert snapshots without removing stale chunks; incremental reconciliation handles deletion. Model/dimension changes require a compatible collection and updated `pipelineRevision`.

Character limits are not token guarantees. Adjust splitting to the model window: Cloud Inference may truncate oversized text. Named vectors, sparse/multivectors, and hybrid search are outside this dense-vector adapter.

## Resume only the upload after failure

`AUTO_MAX_KB_FILES` limits source documents; `AUTO_MAX_SPLIT_FILES` limits generated files. Defaults are 100 and 10000. For example, 97 pages can produce more than 100 segments without exceeding the source-document limit. `AUTO_MAX_KB_BYTES` is independent and checked after splitting too.

When documents and metadata are already saved:

```bash
npm run upload:vector-store -- --ingestion-report ./data/ingestion-results/source/run.json
```

This does not repeat discovery, materialization, or enrichment. It verifies saved hashes, reapplies the configured splitter, and uploads to the currently selected provider. Original materialization failures remain in the original report; only successfully saved documents are uploaded.

Reports already containing a Vector Store result or remote-resource progress are rejected to prevent automatic duplicate uploads. Inspect existing resources/checkpoints before retrying. The new report references the original and prepared-file manifest. With `--manifest`, files with a declared `splitter` are not split again and are bounded by `AUTO_MAX_SPLIT_FILES`. Original documents/reports remain intact.

## APIs and extension

Additional facade methods include `discoverWebsite()`, `materializeUrl()`, `chunkDocument()`, `ingestWebsite()`, `ingestUrl()`, and `close()`. Advanced services are available through `remote-ingestion-retrieval/advanced`.

Acquisition retains URL, DNS, redirect, byte/time, and cancellation protections. PDF requires a host-supplied `PdfMarkdownProcessor`. Markdown plus metadata remains the acquisition/downstream boundary.

See [Discovery and deduplication strategies](docs/ingestion-strategies.md) for the `githubqdrant` and `giassi` evidence, available controls, and deduplication proposals. That strategy document is in Portuguese.

## Local validation

The OpenAI adapter attaches files through individual requests with concurrency bounded by `AUTO_UPLOAD_CONCURRENCY` (default 4), sending `attributes` and `chunking_strategy` together, then reads every file to verify persisted values. `0/0` is not accepted as success. Both runners forward token/concurrency options. Remote IDs are checkpointed during ingestion in `<report>.progress.json` and `providerProgress`, even if later verification fails. Inspect checkpoints before resending; another attempt can create another OpenAI store.

```bash
npm run typecheck
npm run build
```

These commands check types and compilation. They do not execute ingestion, generate embeddings, write collections, or perform live provider searches.


## Resume an upload that already created remote resources

If an upload stopped after creating a Vector Store or uploading files, use `--resume-upload-report` with the upload report. This flow reuses the same store and all 195 files already uploaded in the example run, validates attached files first, and attaches only pending files. It does not repeat file uploads, crawling, metadata enrichment, or splitting.

```bash
AUTO_UPLOAD_MAX_ELAPSED_MS=3600000 AUTO_UPLOAD_CONCURRENCY=4 npm run upload:vector-store -- --resume-upload-report ./data/vector-store-uploads/openai-compatible/6dbbd497-6cf8-426a-90a2-c301305aad6f.json
```

`AUTO_UPLOAD_CONCURRENCY` (default 4) bounds both Files API uploads and individual file-attachment requests; it does not use the batch endpoint. Strict per-file metadata and static chunking readback remains enabled.

`AUTO_UPLOAD_MAX_ELAPSED_MS` sets the standalone upload/resume deadline. Precedence is: the upload-specific value, then `AUTO_MAX_ELAPSED_MS` when defined, then 3600000 ms when both are absent. The default global deadline for `npm run ingest` remains 600000 ms. Setting only `AUTO_MAX_ELAPSED_MS=600000` also limits standalone upload to ten minutes; the command above explicitly allows one hour.

Resume is an implemented capability; this documentation does not claim that a new remote run has been validated.
