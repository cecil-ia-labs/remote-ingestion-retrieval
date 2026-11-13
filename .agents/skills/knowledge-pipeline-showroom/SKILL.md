---
name: knowledge-pipeline-showroom
description: Maintain the Remote Ingestion Retrieval educational showroom with scientifically honest stage fixtures, provenance, safe sync semantics and manual Pages deployment.
---

# Knowledge Pipeline Explorer — project-local agent skill

Use this skill when changing `showcase/`, related README presentations, visual teaching content, or the manual Pages publishing workflow.

## Source-of-truth boundaries

1. Read `AGENTS.md`, `README.en.md`, `src/pipeline/source-insertion.types.ts`, `src/public-api/remote-source-ingestion.types.ts`, `src/chunking/`, `src/knowledge/` and `docs/ingestion-strategies.md` before claiming a package behavior.
2. **Never** describe the static fixtures as output from real crawls, live provider calls, trained embedding models or Qdrant/Weaviate search. `showcase/demo-data.mjs` is synthetic. `showcase/pipeline-model.mjs` is a pedagogical projection, not an implementation of the production pipeline.
3. Search inside the showroom is local lexical overlap. The reported overlap points are not cosine similarity, retrieval recall or provider-native scores.
4. Preserve the real distinction between `EmbeddingProvider` + `VectorStore` precomputed writes and file-oriented `KnowledgeBaseVectorStoreAdapter` with optional native vectorization.
5. A partial discovery snapshot must never be shown as authorization to delete unseen documents or vectors. Status `completed` / `partial` / `failed` / `aborted` belongs to the actual `SourceInsertionOutcome` contract.
6. The browser site must not fetch URLs, collect credentials, upload data, request API access, or execute arbitrary HTML/JavaScript from a fixture. Keep output safely rendered as text.

## Tests

For each change, run or prepare:

```sh
node --check showcase/studio.mjs
node --check showcase/pipeline-model.mjs
node --check showcase/demo-data.mjs
node --test showcase/tests/*.test.mjs
```

Review the actual page on desktop/mobile with keyboard navigation. Only claim browser validation when it was actually performed. Changes to `src/` require their own targeted package checks.

## Deployment and authorship

The Pages workflow is **manual-only**, uses full commit SHAs for official GitHub Actions, and stages static files only. Do not run, merge, publish, or add any automatic trigger without maintainer approval. Preserve existing project documentation and do not imply a public npm release while `package.json` declares `private: true`. The repository has no root `LICENSE` file at the time of writing; do not fabricate licensing terms.
