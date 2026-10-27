# Remote Ingestion Retrieval

## Local runtime and manual website runs

The package's `src/index.ts` is an importable library entry point, not an
executable. Its `.js` import specifiers target the compiled output. Running
`node ./src/index.ts` therefore fails to resolve source modules. Build the
package and load the compiled entry point instead:

```bash
npm run build
node --input-type=module -e "import('./dist/index.js').then(({ RemoteSourceIngestion }) => console.log(typeof RemoteSourceIngestion))"
```

Loading the compiled entry point only verifies the library export; it does not
contact a website. The standard `RemoteSourceIngestion` facade uses the
`MarkdownSplitter`, `EmbeddingProvider`, and precomputed-vector `VectorStore`
contracts. File-oriented providers such as OpenAI Vector Stores use the
separate, provider-neutral `KnowledgeBaseVectorStoreAdapter` contract; the AAC
Auto manual runner below uses that path.

For callers using the precomputed-vector pipeline, `runSourceInsertion()`
supports a bounded crawl and execution budget. Inspect its
`completed`/`partial` result and summary:

```ts
const outcome = await ingestion.runSourceInsertion({
  source: {
    id: "manual-site-check",
    type: "website",
    url: "https://replace-with-the-site.example/",
    createdAt: new Date(),
    updatedAt: new Date(),
    options: {
      crawl: {
        discoveryStrategy: "sitemap-and-crawl",
        maxPages: 100,
        maxDepth: 3,
        concurrency: 3,
        sameOriginOnly: true,
      },
    },
  },
  namespace: "manual-site-check",
  materializationConcurrency: 3,
  failurePolicy: "continue-partial",
  limits: {
    maxElapsedMs: 300_000,
    maxFetchedBytes: 100 * 1024 * 1024,
    maxChunks: 10_000,
    maxEmbeddingInputs: 5_000,
  },
});
```

This is a caller-side example only; the library does not execute it on import.

### Manual website runner

`npm run ingest` loads `.env` and runs `src/cli/ingest.ts` through `tsx`,
currently configured for `https://academy.weaviate.io`. It materializes complete page Markdown files and
sends them with generic per-file metadata to a file-oriented vector-store
adapter. The adapter interface is in
`src/knowledge/knowledge-base-vector-store.ts`; it is separate from the
precomputed-vector `VectorStore` API.

The default OpenAI adapter is
`../3_benchmarks/realtime-compare-mcp-x-function/MarkdownSplitter/openai-vector-store.adapter.ts`.
It exports `createVectorStoreAdapter()` and uses `OPENAI_API_KEY` from `.env`.
Once the user starts a run, the command is:

```bash
npm run ingest
```

For a provider with an OpenAI-compatible Files and Vector Stores API, set
`AUTO_VECTOR_STORE_BASE_URL` to its HTTPS API base URL and
`AUTO_VECTOR_STORE_API_KEY` to that provider's key in `.env`. The adapter
uses this dedicated key for the compatible endpoint. Set
`AUTO_VECTOR_STORE_PROVIDER_NAME` to label its report. A provider with a
different API can be selected with `AUTO_VECTOR_STORE_ADAPTER_MODULE`
pointing to a module that implements the same generic interface.

The runner saves each normalized page as a Markdown file under `kb/weaviate/`
and writes a per-run JSON report under `data/ingestion-results/weaviate/`.
The OpenAI adapter uploads each Markdown file with its own source, URL, title,
language, content hash, and discovery metadata, then creates a new Vector Store
and attaches the files with static chunking (default 1,600 tokens with 200
tokens of overlap). Each file's attributes and persisted chunking strategy are
read back before the adapter returns success. The report includes the created store ID and uploaded file
IDs. Each run creates a new store, matching the supplied OpenAI module's
behavior.

The default crawl is capped at 100 pages, depth 4, and concurrency 4. Tune the
manual run with `AUTO_KB_NAMESPACE`, `AUTO_VECTOR_STORE_NAME`,
`AUTO_MAX_PAGES`, `AUTO_MAX_DEPTH`,
`AUTO_CRAWL_CONCURRENCY`,
`AUTO_MATERIALIZATION_CONCURRENCY`, `AUTO_MAX_FAILURES`,
`AUTO_MAX_ELAPSED_MS`, `AUTO_PAGE_TIMEOUT_MS`,
`AUTO_MAX_BYTES_PER_DOCUMENT`, `AUTO_MAX_KB_FILES`, `AUTO_MAX_KB_BYTES`,
`AUTO_UPLOAD_CONCURRENCY`,
`AUTO_MAX_CHUNK_SIZE_TOKENS`, and `AUTO_CHUNK_OVERLAP_TOKENS`.
The adapter module and configuration are validated before website discovery.

The runner derives a stable `domain` from the nearest materialized parent page.
`AUTO_METADATA_MODE=local` is the default: it extracts `tags` and `keywords`
from Markdown headings and repeated terms without model calls. Set
`AUTO_METADATA_MODE=model` to use a hosted semantic enricher; the default is
OpenAI Responses with `gpt-6-luna` and `OPENAI_API_KEY`:

```bash
AUTO_METADATA_MODE=model npm run ingest
```

Model mode first checks the number of uncached files (default maximum 100) and
estimated input characters (default maximum 3,000,000). It stops before model
requests when either cap is exceeded. Valid results are cached by provider,
domain, URL, and content hash in `data/metadata-cache/`, so unchanged files do
not require another model call. These limits bound requests and input size;
they are not a monetary price cap. Configure `AUTO_METADATA_MAX_REQUESTS`,
`AUTO_METADATA_MAX_INPUT_CHARS`, `AUTO_METADATA_MAX_CHARS` (per file),
`AUTO_METADATA_MODEL`, `AUTO_METADATA_CONCURRENCY`, or
`AUTO_METADATA_ENRICHER_MODULE` to control this stage.

Before either metadata mode, the runner caps the knowledge base at 100 files
and 50 MiB of normalized Markdown by default. It stops before model and
Vector Store requests when `AUTO_MAX_KB_FILES` or `AUTO_MAX_KB_BYTES` is
exceeded. The report records the observed file count and bytes.

Both modes validate the semantic metadata before upload. The run report
includes the mode, cache and model-request counts, domain catalog, and per-file
metadata manifest. The Vector Store upload is skipped if any file lacks valid
semantic metadata.
Consumers that filter on `attributes.domain` should use the exact domain list
from the report's `metadataEnrichment.domains` field.

Browser rendering requires the Puppeteer Chrome build matching the installed
package. If it is missing, install it before a manual run with
`npx puppeteer browsers install chrome`.

The complete flow is now available behind one source-oriented entry point:

```text
SourceInsertionPipeline
        ↓
source dispatch
        ↓
URL / Website
        ↓
RemoteSourceIngestion
        ↓
discovery → acquisition → extraction → normalization
        ↓
hashing → WebDocument → chunking
        ↓
incremental reconciliation
        ↓
embeddings → vector upsert/delete
        ↓
sync-state commit
        ↓
observability + execution budget + structured errors
        ↓
SourceInsertionOutcome
```

## Stable application API

The facade now exposes two final orchestration methods.

### Strict path

Use `insertSource()` when the caller wants ordinary exception control flow:

```ts
const result =
  await ingestion.insertSource({
    source,
    namespace: "product-docs",
  });
```

This is equivalent to selecting `ingestWebsite()` or `ingestUrl()` according to
`source.type`, while keeping a single application entry point.

Errors are not swallowed.

### UI / job path

Use `runSourceInsertion()` when the caller needs one uniform result regardless
of success or failure:

```ts
const outcome =
  await ingestion.runSourceInsertion({
    source,
    namespace: "product-docs",

    observability: {
      runId: "source-job-123",
      attributes: {
        trigger: "manual"
      }
    },

    limits: {
      maxElapsedMs: 300_000,
      maxFetchedBytes: 500 * 1024 * 1024,
      maxChunks: 100_000,
      maxEmbeddingInputs: 25_000
    }
  });
```

`runSourceInsertion()` converts the complete operation into exactly one of:

```text
completed
partial
failed
aborted
```

It does not throw for pipeline execution failures.

## Outcome contract

Successful outcomes contain the original `WebsiteSyncResult` plus a compact
application summary:

```ts
if (outcome.ok) {
  console.log(outcome.status);
  console.log(outcome.runId);

  console.log(
    outcome.summary.documents
  );

  console.log(
    outcome.summary.vectors
  );
}
```

The summary contains:

```text
documents
├── discovered
├── materialized
├── failures
├── added
├── changed
├── unchanged
├── removed
└── snapshotComplete

vectors
├── chunksProduced
├── chunksReused
├── chunksUpserted
├── chunksDeleted
└── embeddingsAvoided
```

It also includes the final execution-budget snapshot, namespace, pipeline
revision and downstream mode.

A successful run is reported as `partial` when the website snapshot is not
complete, downstream reconciliation ran in partial mode, or page-level
materialization failures were retained under `continue-partial`.

## Failure outcome

Failures are projected through the Phase 24 Error Model:

```ts
if (!outcome.ok) {
  console.log(outcome.status);
  console.log(outcome.error.code);
  console.log(outcome.error.retryability);
}
```

Example shape:

```json
{
  "ok": false,
  "status": "failed",
  "runId": "source-job-123",
  "sourceId": "docs",
  "sourceType": "website",
  "error": {
    "code": "REMOTE_TIMEOUT",
    "category": "network",
    "stage": "fetch",
    "retryability": "yes",
    "aborted": false
  }
}
```

Abort/deadline failures become:

```text
status: aborted
```

rather than generic failures.

## Run correlation

When the caller supplies a run ID, the same ID is passed through to the
existing `WebsiteSyncService` observability run:

```text
Source Insertion UI/job
        │ runId=job-123
        ↓
runSourceInsertion()
        ↓
WebsiteSyncService
        ↓
materialization / chunking / embeddings / vector store
        ↓
observability events with the same runId
```

If no run ID is supplied, the pipeline creates one before execution and returns
it in the outcome.

## Source dispatch

Phase 27 currently supports the remote source kinds already implemented by the
library:

```text
url
website
```

The dispatcher is isolated in `SourceInsertionPipeline`, so additional source
families can later be added without changing the UI/job outcome contract.

Unsupported runtime source types fail with a structured `INVALID_INPUT` error.

## Complete facade example

```ts
import {
  RemoteSourceIngestion,
} from "remote-source-ingestion";

const ingestion =
  new RemoteSourceIngestion({
    pipelineRevision:
      "splitter-v4:embedding-v3:metadata-v1",

    markdownSplitter,
    embeddingProvider,
    vectorStore,
  });

try {
  const outcome =
    await ingestion.runSourceInsertion({
      source: {
        id: "docs",
        type: "website",
        url: "https://docs.example.com/",
        createdAt: new Date(),
        updatedAt: new Date(),

        options: {
          crawl: {
            discoveryStrategy:
              "sitemap-and-crawl",
            maxPages: 10_000,
            maxDepth: 5,
            concurrency: 6,
            sameOriginOnly: true,
          }
        }
      },

      namespace:
        "knowledge-base",

      failurePolicy:
        "continue-partial",
    });

  if (!outcome.ok) {
    // Map the structured error to the application UI/job state.
    console.error(
      outcome.error
    );
  }
} finally {
  await ingestion.close();
}
```

## Existing lower-level public methods

Phase 27 keeps all Phase 26 APIs intact:

```text
ingestWebsite()
ingestUrl()
discoverWebsite()
materializeUrl()
chunkDocument()
close()
```

`insertSource()` and `runSourceInsertion()` are orchestration layers, not
replacements for those targeted operations.

## Public vs advanced exports

Stable application APIs are available from:

```ts
import {
  RemoteSourceIngestion,
  SourceInsertionPipeline,
  summarizeSourceInsertion,
} from "remote-source-ingestion";
```

The entire implementation graph remains available through:

```ts
import {
  WebsiteDiscoveryService,
  IncrementalVectorSyncService,
  HttpRemoteFetcher,
} from "remote-source-ingestion/advanced";
```

## Final roadmap architecture

The completed Phases 0–27 now form:

```text
Domain model
  ↓
secure remote resolution/fetch
  ↓
content extraction
  ↓
HTML/remote document normalization
  ↓
rendering strategy + Puppeteer
  ↓
website discovery / sitemap / crawler
  ↓
URL canonicalization / filters / scheduler
  ↓
WebDocument
  ↓
Markdown splitter + chunk metadata
  ↓
embeddings / vector store
  ↓
incremental sync
  ↓
content-hash trace
  ↓
website reconciliation
  ↓
observability
  ↓
structured error model
  ↓
execution limits
  ↓
stable public facade
  ↓
Source Insertion Pipeline
```

## Visual validation

After the compiled tests run, Phase 27 writes only its current visual artifacts
under:

```text
data/visual-validation/phase-27/
├── source-insertion-outcomes.json
├── service-graph.json
└── vector-records.json
```

Inspect the main outcome with:

```bash
npm run pipeline:show
```

## Requirements

```text
Node.js >= 22
TypeScript >= 5.8
FF-independent; provider-specific embedding/vector services are injected
```

The required host contracts remain:

```text
MarkdownSplitter
EmbeddingProvider
VectorStore
```

PDF support additionally accepts the existing `PdfMarkdownProcessor` adapter.
