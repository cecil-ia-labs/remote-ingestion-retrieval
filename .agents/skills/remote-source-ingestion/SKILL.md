---
name: remote-source-ingestion
description: Orient and implement cross-cutting work in the remote-source-ingestion library, especially changes spanning source contracts, normalized Markdown, its public facade, and downstream processing. Use for broad project tasks; use a focused skill for an isolated pipeline stage.
---

# Remote Source Ingestion

## Project goal

Turn remote URLs and websites into normalized Markdown, then pass that content through the host-provided splitter, embedding provider, and vector store. A website is a collection of documents; acquisition and processing should remain separable.

## Start from maintained project sources

From the project root, use `README.md` for the current documented API and state, `Roadmap — URL Sources & Website Ingestion.md` for the intended architecture and phased scope, and `package.json` for runtime, exports, and commands. Then inspect only the source modules and contracts relevant to the requested change. Code and types are the implementation truth when they differ from documentation.

The README currently presents Phase 27 as closing the original roadmap and describes a stable application facade. Treat that as the documented baseline, not proof that every behavior is currently implemented or operational. Confirm the relevant code before changing it. `data/visual-validation/` contains generated validation artifacts; it is not a source of API contracts.

## Architecture map

```text
Source (url | website)
  → resolve and fetch
  → discover pages when source is a website
  → extract and normalize to NormalizedDocument (Markdown + metadata)
  → WebDocument and chunking
  → host-injected embeddings and vector store
  → incremental reconciliation and sync-state commit
```

Useful module boundaries under `src/`:

- `domain/`: source types and guards.
- `remote/`: URL safety, resource resolution, HTTP fetching, resource metadata.
- `rendering/`, `extraction/`, `normalization/`: browser rendering, content extraction, Markdown conversion.
- `discovery/`, `url/`, `filtering/`, `scheduling/`: website URL discovery and crawl control.
- `chunking/`, `hashing/`, `vector/`, `sync/`: document chunks, fingerprints, host adapters, and reconciliation.
- `limits/`, `errors/`, `observability/`, `pipeline/`, `public-api/`: execution controls and application-facing orchestration.

Follow existing dependency direction. Keep provider-specific embedding/vector behavior behind the injected interfaces; keep acquisition independent from indexing.

## Public API boundary

The documented stable package entry point exports `RemoteSourceIngestion`, `SourceInsertionPipeline`, and `summarizeSourceInsertion`. The `remote-source-ingestion/advanced` subpath exposes lower-level implementation pieces. Preserve the distinction: use the facade for application integration and lower-level services for targeted orchestration or extension work.

The README documents `insertSource()` as the throwing/strict path and `runSourceInsertion()` as the uniform outcome path. It also retains targeted methods such as `ingestWebsite()`, `ingestUrl()`, `discoverWebsite()`, `materializeUrl()`, `chunkDocument()`, and `close()`. Check current signatures before relying on this documented snapshot.

## Working approach

1. Identify the requested behavior and the narrowest owning module/type.
2. Trace its direct caller and public export only when the change crosses that boundary.
3. Preserve existing contracts and injectables; make the smallest coherent change.
4. Update `README.md` only when public behavior, setup, or usage changes.
5. Use the package's `typecheck` or `build` command for requested or necessary validation; do not treat generated artifacts as runtime proof.

For isolated acquisition, website discovery, or sync work, use the corresponding focused skill when available.
