---
name: remote-website-discovery
description: Implement or diagnose website URL discovery, robots and sitemap handling, link crawling, canonicalization, filtering, and crawl scheduling in the remote-source-ingestion library. Use when one website source expands into multiple documents.
---

# Website Discovery and Crawling

## Domain model

A `WebsiteSource` represents a collection of remote documents, not a single document. Discovery returns candidate URLs; acquisition/materialization handles each URL later. Keep those stages separate and preserve discovery provenance and completeness information.

Relevant modules are `src/discovery/`, `src/url/`, `src/filtering/`, `src/scheduling/`, and the website source contract under `src/domain/`. Read the current option types and service interfaces before changing defaults or behavior.

## Discovery behavior

The project roadmap describes discovery through robots declarations, sitemap URLs and indexes, then link crawling where required by strategy or coverage. Confirm the current `WebsiteDiscoveryService` implementation and strategy before changing that order. Support existing sitemap forms and limits through the current decoder/parser/resolver boundaries rather than adding a parallel parser.

For crawl expansion:

- Keep breadth-first depth behavior, page limits, concurrency, same-origin/subdomain rules, include/exclude matching, and robots policy governed by the existing options.
- Canonicalize and deduplicate URLs consistently before materialization; preserve the discovered URL and canonical identity where the model requires both.
- Keep queues and worker execution inside the scheduler/crawler abstractions instead of coupling discovery to vector indexing.
- Report partial discovery, skipped URLs, and failures honestly. Do not label a snapshot complete when limits, aborts, or discovery errors prevented full enumeration.

The README's Phase 27 example shows `sitemap-and-crawl`, `maxPages`, `maxDepth`, `concurrency`, and `sameOriginOnly`; treat those as documented examples and check current types before using them.

## Change workflow

Trace one path from a `WebsiteSource` through discovery strategy, resolvers/crawler, canonicalization/filtering, and the discovery report. Preserve existing contracts and injectables. When discovery completeness feeds synchronization, ensure its status reaches the sync planner; incomplete snapshots must not be interpreted as authoritative evidence that unseen documents were removed.

Limit reading to directly related code and contracts. Use `npm run typecheck` or `npm run build` only when requested or necessary; run relevant tests only when requested by the task or needed to establish a directly affected contract.
