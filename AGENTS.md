# Agent Instructions — Remote Ingestion Retrieval

## Objective and project state

This package turns remote URLs and websites into normalized Markdown, then sends documents through chunking, host-provided embeddings, and vector storage. A website is a collection of documents, not one document.

The README describes Phase 27 as the completion of the original roadmap and documents a stable source-insertion facade. Treat that as the documented baseline. Verify current contracts in `src/` before relying on a behavior or changing it; generated files under `data/visual-validation/` are artifacts, not API specifications.

## Architecture boundaries

- `src/domain/`: source types and guards.
- `src/remote/`: URL policy, resource resolution, HTTP fetching, and fetched-resource contracts.
- `src/rendering/`, `src/extraction/`, `src/normalization/`: browser rendering, extraction, and conversion into normalized Markdown.
- `src/discovery/`, `src/url/`, `src/filtering/`, `src/scheduling/`: website enumeration and crawl controls.
- `src/chunking/`, `src/hashing/`, `src/vector/`, `src/sync/`: chunks, fingerprints, vector interfaces, and incremental reconciliation.
- `src/knowledge/`: provider-neutral file-based knowledge-base store contract; keep it distinct from precomputed-vector writes in `src/vector/`.
- `src/cli/`: explicit manual runners; importing the package entry point must remain side-effect free.
- `src/limits/`, `src/errors/`, `src/observability/`, `src/pipeline/`, `src/public-api/`: execution controls and application-facing flow.

Keep acquisition separate from downstream processing. Preserve Markdown plus metadata as the normalization boundary, and use injected splitter, embedding, and vector-store contracts rather than coupling the library to a specific provider.

Do not force file-upload/vector-store APIs into the precomputed-vector `VectorStore` contract; use the generic file-oriented adapter in `src/knowledge/`.

## Project-specific invariants

- Keep the documented stable facade separate from lower-level/advanced services. Preserve the strict exception path and the uniform UI/job outcome path as distinct contracts.
- Apply the existing URL safety policy through DNS resolution and redirects; a redirect must not bypass private-network protections.
- Keep time, byte, page, chunk, and embedding-input limits attached to the work they govern, and preserve structured failures and aborts.
- Do not treat an incomplete website snapshot as authoritative evidence that undiscovered documents or vectors should be deleted.
- Keep run correlation and source identity consistent through materialization, vector reconciliation, observability, and sync-state commit.

## Development workflow

Start from the narrowest owning module and inspect only its relevant interfaces, implementation, and direct callers. Preserve nearby contracts and make the smallest coherent change. Update `README.md` when public behavior, setup, or usage changes.

Use `npm run typecheck` or `npm run build` when requested or necessary. Run tests only when the user asks for testing/verification or the active task instructions require them. Avoid broad test, lint, formatting, or artifact-directory sweeps.

## Project Skills

For nontrivial work, apply the matching project skill before implementation:

- [Project orientation](.agents/skills/remote-source-ingestion/SKILL.md)
- [Remote acquisition and extraction](.agents/skills/remote-source-acquisition/SKILL.md)
- [Website discovery and crawling](.agents/skills/remote-website-discovery/SKILL.md)
- [Source insertion and incremental sync](.agents/skills/remote-source-sync-pipeline/SKILL.md)
