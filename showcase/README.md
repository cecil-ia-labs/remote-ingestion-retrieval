# Knowledge Pipeline Explorer — research-backed teaching showroom

A standalone browser-only SPA for **Remote Ingestion Retrieval**. Its purpose is to explain the established application pipeline and separate two storage contracts without asking visitors for URLs, tokens, cloud accounts or source files.

## What is real, and what is illustrative?

| Area | Evidence from the repository | What the showroom does |
| --- | --- | --- |
| Discovery and GitHub profiles | `src/discovery/`, `src/github/`, `docs/ingestion-strategies.md` | Shows authored candidate URL/file lists |
| Acquisition and URL policy | `src/remote/`, `src/rendering/` | Displays fictional acquired HTML |
| Markdown normalization | `src/extraction/`, `src/normalization/` | Uses authored Markdown representations |
| Chunking | `src/chunking/` | Splits the authored fixture by section heading |
| Embeddings, vectors and sync | `src/vector/`, `src/sync/`, `src/knowledge/` | Displays **planned** records and deterministic demo fingerprints; generates **no embeddings** |
| Retrieval | `src/knowledge/qdrant-search-adapter.ts`, `weaviate-search-adapter.ts` | Performs local *lexical word-overlap*, not vector similarity |

The viewer does **not** fetch pages or repositories, read private sources, call endpoints, index actual vectors, measure retrieval quality, or execute the Node.js package. Example hosts and repository paths are fictional. The eight-character display fingerprint is not a SHA-256 document/content hash.

## Demonstrations

1. **Support website:** three small fictional pages covering accounts, authentication and billing.
2. **GitHub repository:** fictional README/documentation files, explaining a repository-specific acquisition profile instead of a global sitemap crawl.
3. **Incomplete snapshot toggle:** makes one source unavailable. The interface explicitly explains that such a snapshot cannot authorize deleting unseen documents or vector records.
4. **Query panel:** lets visitors search the fixture chunks using heading-weighted word overlap. No embedding API is contacted.

## Build and inspect locally

From the repository root:

```sh
python3 -m http.server 8000 --directory showcase --bind 127.0.0.1
# Open http://127.0.0.1:8000/
```

Run the standalone checks (no dependencies or API calls):

```sh
node --check showcase/studio.mjs
node --check showcase/pipeline-model.mjs
node --check showcase/demo-data.mjs
node --test showcase/tests/*.test.mjs
```

The production library uses Node.js 22+ and has distinct `npm run build` / `npm run test` gates. Showroom work should not trigger the full package tests unless needed by an actual runtime change.

## Publish by explicit choice only

`.github/workflows/publish-showcase.yml` runs only on `workflow_dispatch`. It validates the static files and stages `showcase/` for project-scoped GitHub Pages. It never deploys automatically, publishes to npm, or calls vector providers.

Intended URL: `https://cecil-ia-labs.github.io/remote-ingestion-retrieval/`. Do not claim the site is live until the maintainer runs the workflow and checks the URL.

## Maintenance rules

- Keep `src/` contracts authoritative; this SPA is educational, not a substitute for production extraction, splitting or provider behavior.
- Never accept visitor-owned URLs, keys or credentials as input to a demo that cannot safely access the real sources.
- Use DOM `textContent` for fixture markup and search results; do not execute snippets from demo records.
- Preserve the distinction between a complete and a partial discovery snapshot, and the two distinct provider storage paths.
- Avoid making vector quality, precision, throughput, deletion or security guarantees from the static fixture.
- The repository is publicly visible, but its current root lacks a `LICENSE` file. Confirm license terms with the maintainer rather than assuming that public visibility grants reuse permissions.
