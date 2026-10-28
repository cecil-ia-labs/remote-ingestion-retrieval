# Discovery and deduplication strategies

The `github-repository` profile is implemented in both the facade and the runner; see the [README](../README.md#aquisição-de-repositórios-github) for configuration. It enumerates trees at a pinned commit, prioritizes documentation, downloads raw blobs with integrity checks, and preserves limits and partial snapshots. The cross-URL deduplication described in this document remains a proposal. The containment examples below also remain available in the conventional crawler.

## Evidence from local cases

| Case | Evidence | Consequence |
| --- | --- | --- |
| `githubqdrant` | The report `data/ingestion-results/githubqdrant/48751cae-aa62-4328-8e2c-8b08f1e2595e.json` records 100 URLs, a limit of 100, one processed sitemap, and **zero pages attempted by the link crawler**. Materialized pages include the repository root, `github.com/`, `/about`, `/about/diversity`, and `/customer-stories/...`. | In this run, the global sitemap exhausted the budget before the repository could be crawled. Restricting the origin alone does not restrict the scope to `github.com/qdrant/qdrant`. |
| `githubqdrant` | There are 100 local Markdown files totaling 1,020,619 bytes. `qdrant--0fd5c6f21c9f.md` is 22,142 bytes and starts with repository navigation, notifications, forks, and stars. | GitHub's HTML page mixes useful content with interface elements; file contents must also be obtained directly. |
| `giassi` | There are 100 files totaling 54,909 bytes; 65 are smaller than 500 bytes. The samples `activia--e043c3d216b7.md`, `alicanto--c3499339b693.md`, and `always--bd254ee2b500.md` contain an image, a product name, and the `Quantidade` (Quantity) label. Their hashes differ. | A repeated layout does not prove duplicate content. Aggressive deduplication could remove distinct products; product identity, content, and repeated interface elements must be handled separately. |

File and byte counts were obtained from each case's document directory; the Markdown inspection was sample-based. No overall Giassi duplication rate is inferred from these three samples.

The GitHub report also ended with a Vector Store chunking verification failure: `1600/200` was requested, but `0/0` was returned for one file. This upload failure is independent of the discovery coverage issue and should remain recorded when the run is recovered.

## GitHub: constrain the crawl immediately and acquire files as a repository

### Containment with the current API

For a repository, selecting `crawl` avoids starting with the global sitemap. The inclusion list restricts indexable URLs to the repository path; exclusions also prevent traversal of those routes:

```ts
options: {
  crawl: {
    discoveryStrategy: "crawl",
    sameOriginOnly: true,
    include: ["/qdrant/qdrant", "/qdrant/qdrant/**"],
    exclude: [
      "/qdrant/qdrant/issues", "/qdrant/qdrant/issues/**",
      "/qdrant/qdrant/pulls", "/qdrant/qdrant/pulls/**",
      "/qdrant/qdrant/actions", "/qdrant/qdrant/actions/**",
      "/qdrant/qdrant/discussions", "/qdrant/qdrant/discussions/**",
      "/qdrant/qdrant/stargazers", "/qdrant/qdrant/forks",
    ],
    maxPages: 100,
    maxDepth: 4,
    concurrency: 3,
  },
}
```

The filters already apply to both sitemap candidates and links. However, inclusion rules may allow traversal of ancestor paths; the root URL is emitted separately by discovery. This example contains the expansion but does not guarantee complete file retrieval or removal of the HTML interface. Increasing `maxPages` alone only increases the observed waste.

### Implemented profile: `github-repository`

1. Recognize only valid GitHub repository, file, or tree URLs; retain `owner`, `repo`, the reference, and an optional prefix. Do not automatically change the semantics of every `website` source. A reference containing slashes must be resolved against existing branches/tags rather than naively splitting the URL.
2. Resolve the reference to a commit SHA at the start of the run. Enumerate that commit's tree, preserving the same snapshot for every download. The [official Git Trees API](https://docs.github.com/en/rest/git/trees) provides paths, types, sizes, and blob hashes. When `truncated` is true, traverse subtrees without recursion or declare a partial result; do not treat a truncated listing as complete.
3. Build candidates from files, without using the `github.com` sitemap or following social navigation. Default priority: root README, `docs/**`, API documentation, examples, and explanatory configuration files. Include source code only by explicit option, with allowed extensions and language metadata. Exclude binaries, dependencies, generated and vendored files, and lockfiles; never execute code. Submodules, symlinks, and Git LFS require dedicated policies and are excluded by default.
4. Acquire the raw blob associated with its SHA, retaining the human-facing URL in `canonicalUrl` and the transport URL in acquisition metadata. For downloads through the [Repository Contents API](https://docs.github.com/en/rest/repos/contents), obtain a fresh download URL when necessary because it may expire. Never reconstruct content from the `/blob/` interface when the raw file is available.
5. Pass Markdown directly to the existing normalization pipeline; convert text/code according to the appropriate type. Preserve `{owner, repo, commitSha, path, blobSha}` in provenance. Relative links between files may inform priority within the tree; external links are included only as separately authorized sources.
6. Apply existing time, byte, document, and chunk limits to downloads; add an API request budget and an enumeration byte budget. Respect rate limits and cancellation. DNS, protocol, and redirect policies must also apply to `api.github.com` and `raw.githubusercontent.com`; credentials must not cross redirects to a different origin.
7. Record eligible, acquired, skipped, failed, and pending files, with reasons. The complete list of eligible files within the configured scope is the coverage baseline. Exhausted budgets, denied authentication, or incomplete enumeration produce a partial snapshot and prevent deletion of unseen documents.

The integration uses dedicated services in `src/github/`, producing the same metadata-enriched Markdown consumed by the current pipeline. The profile is set in `WebsiteSource.options.profile`, configuration in `options.github`, provenance in `DiscoveredUrl.github` and document attributes, and summary information in `WebsiteDiscoveryStats.github`. In the runner, automatic selection recognizes repository/tree/blob URLs; in the library, selection is explicit.

Future acceptance criteria: no institutional or social URLs are acquired during the Qdrant run; the README and eligible documents from the pinned commit appear before lower-priority code; cancellation and truncated trees preserve the previous state; switching branches during a run does not mix versions.

## Giassi: deduplicate without losing products or provenance

### Three distinct identities

- **URL/document:** retains address, title, origin, dates, and synchronization state. Aliases remain retrievable for citations.
- **Content:** represents useful Markdown or a content block, identified by hash and normalization version.
- **Embedding:** represents content plus the exact model configuration, dimensions, and preprocessing version. The same text may require a different vector when this configuration changes.

The library already computes SHA-256 hashes of normalized Markdown and chunks in `src/hashing/content-hasher.ts`. Snapshot hashes that include identity and metadata are also available: these are useful for synchronization but unsuitable for detecting the same text across different URLs. Existing canonicalization and hashing must be retained; an index of aliases and shared content is an additional layer.

### Proposed sequence

1. **Before acquisition:** canonicalize URLs, remove only parameters known to be used for tracking, and apply site-specific pagination/facet rules. Do not indiscriminately remove SKU, store, language, or variant parameters. Product sitemaps and institutional pages should have separate quotas/priorities according to the knowledge base's purpose.
2. **After normalization, before enrichment and embeddings:** generate a versioned comparison representation: Unicode NFC, consistent line endings, and trimmed trailing whitespace. Preserve numbers, negations, units, tables, relevant links, and code. Generate `contentKey = hash(normalizationRevision, comparisonMarkdown)` within the authorized namespace/tenant. Exact duplicates reuse compatible content and enrichment; each URL retains its provenance.
3. **Filter repeated interface elements:** detect structural blocks that recur across pages, such as navigation and `Quantidade` (Quantity). Remove only blocks confirmed to be interface elements; frequency alone is insufficient because legal notices and product terms may carry relevant information. Retain the original Markdown for auditing. In the Giassi samples, product name, volume/weight, brand, and product identity must remain even when the template is identical.
4. **Exact chunks:** hash the content actually sent to the model, including heading context when present. Check a persistent cache before generating embeddings. The key includes provider/model/revision/dimensions. A conservative first stage can reuse embeddings while still storing vectors per document, preserving the current upsert/delete contract; this already reduces cost without introducing shared deletion semantics.
5. **Approximate similarity:** use token shingles with MinHash/SimHash to select candidates within the same language, document type, and tenant. A conservative initial threshold, such as Jaccard ≥ 0.95, is for review and calibration, not automatic deletion. Compare useful text and product attributes before merging. Different SKUs/EANs, sizes, flavors, prices, availability, code, negations, or dates may represent distinct information despite substantial overlap.
6. **Short or incomplete content:** mark it as `lowInformation` or `needsRendering` and route it for review/re-extraction; do not discard it solely because of its size. The 65 Giassi files smaller than 500 bytes motivate this classification but do not establish extraction failure or duplication.

### Persistence, updates, and deletion

If a single vector is eventually shared across multiple URLs, persist the `document → content → chunk → vector` relationships, with reference sets and concurrency control. Updating content means switching references only after successful writes. Deleting a document removes its reference; shared content/vectors may be deleted only when no live references remain and reconciliation authorizes deletion. The operation must be idempotent and recoverable after failure.

Do not share vectors across tenants without explicit authorization. A partial Giassi or GitHub crawl does not authorize deleting aliases or vectors for pages that were not revisited. Changes to normalization, splitter, model, or metadata projection must update the pipeline revision; incompatible caches must not be reused.

### Proposed deliverables and metrics

1. Add a diagnostic report without discarding content: URL aliases, exact groups, approximate candidates, low-information pages, and reasons.
2. Enable content-based embedding caching while vectors remain associated with each document.
3. Enable aliases for exact duplicate documents and, only after validating references/deletions, shared vectors.
4. Initially treat approximate similarity as a recommendation; promote site-specific rules after reviewing differences.

Measure documents before/after, exact groups, preserved unique content, avoided enrichment/embedding calls, useful bytes, and references per vector. For Giassi, distinct products must remain retrievable; two URLs for the same product should share content processing while retaining both citations. The analysis and proposals in this document did not modify files under `kb/` or re-upload data to providers.
