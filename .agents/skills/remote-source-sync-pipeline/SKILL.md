---
name: remote-source-sync-pipeline
description: Change the SourceInsertionPipeline, website synchronization, document chunking, content hashing, execution budgets, observability, or vector reconciliation in the remote-source-ingestion library. Use for end-to-end source ingestion and indexing behavior.
---

# Source Insertion and Incremental Sync

## Pipeline contract

The documented end-to-end path is source dispatch (`url` or `website`), discovery/acquisition, extraction and Markdown normalization, `WebDocument` materialization and chunking, incremental reconciliation, host-provided embeddings/vector operations, sync-state commit, then a `SourceInsertionOutcome`.

Relevant areas include `src/pipeline/`, `src/sync/`, `src/chunking/`, `src/hashing/`, `src/vector/`, `src/limits/`, `src/errors/`, `src/observability/`, and `src/public-api/`. Follow the current types and wiring; the README is a baseline, not a substitute for source inspection.

## Preserve outcome and state semantics

- Keep `insertSource()` exception behavior distinct from `runSourceInsertion()`'s documented uniform `completed`, `partial`, `failed`, or `aborted` outcome. Do not silently swallow failures on the strict path.
- Preserve or generate a run ID before work starts and pass it through downstream observability. Keep source identity, namespace, pipeline revision, downstream mode, and budget summary consistent in outcomes.
- Map network, input, extraction, limit, and abort failures through the project's structured error model. Deadline or explicit cancellation should remain distinguishable from ordinary failure.
- Preserve execution limits for elapsed time, fetched bytes, chunks, and embedding inputs; ensure limit accounting is attached to the actual work boundary.
- Keep embedding and vector operations behind injected `EmbeddingProvider` and `VectorStore` contracts.

## Incremental reconciliation

Use the existing content fingerprint and sync planner to avoid reprocessing unchanged content. Reuse chunks/vectors only when the current fingerprint and pipeline revision make reuse valid. Apply additions, changes, and deletions through the existing reconciliation boundary, and commit sync state only after the corresponding downstream work succeeds according to the established failure policy.

Treat website completeness as a correctness condition for deletion. A partial/failed/aborted discovery snapshot must not cause unseen documents or vectors to be deleted as though the crawl were complete. Preserve page-level failures and partial outcomes where the current policy allows continuation.

## Change workflow

Trace a single request from the public facade through pipeline dispatch, sync planning, chunk/vector operations, and state commit. Confirm the smallest owning boundary and existing failure policy before editing. Keep adapters and public exports stable unless the requested behavior explicitly changes them. Update README examples only for public contract changes. Use `npm run typecheck` or `npm run build` when requested or necessary; do not infer real vector or provider execution from compilation or generated validation artifacts.
