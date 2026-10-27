---
name: remote-source-acquisition
description: Change remote URL resolution, HTTP or browser acquisition, content extraction, or normalization into Markdown in the remote-source-ingestion library. Use for one-document ingestion stages; website enumeration belongs to the discovery skill.
---

# Remote Acquisition and Extraction

## Goal and boundary

Convert a remote resource into a `NormalizedDocument` containing canonical Markdown and source metadata. Keep URL resolution, fetching, rendering, extraction, and normalization as distinct responsibilities. Downstream chunking, embeddings, and vector storage should consume normalized output without needing to know how it was acquired.

Relevant areas are `src/remote/`, `src/rendering/`, `src/extraction/`, and `src/normalization/`, with source contracts in `src/domain/`. Read the relevant interfaces and nearby implementation before changing behavior; use the current extractor registry to establish which formats are supported.

## Preserve the security and resource boundary

- Accept only supported web schemes and use the existing URL safety policy.
- Preserve validation across DNS resolution and every redirect; do not allow a redirect to bypass private-network or metadata-address protections.
- Keep redirect count, timeout, abort, and response-size handling consistent with the existing fetch contract. Prefer streaming limits where the implementation supports them.
- Keep browser rendering behind the rendering strategy and browser manager. Use it only when the selected strategy calls for rendered DOM; do not duplicate HTTP fetching or browser lifecycle ownership in an extractor.
- Preserve structured errors and stage context so callers can distinguish invalid input, network failures, unsupported content, extraction failures, limits, and aborts.

## Normalize without losing useful structure

Prefer the current static HTML extraction path when it yields usable content; follow the existing automatic-rendering decision for JavaScript-heavy pages. Convert through the existing Markdown converter and preserve headings, links, lists, tables, quotes, and code where supported. Carry forward title, resolved/canonical URL, content type, language, validators, and fetch time when available.

Use existing parsers and host adapters for formats such as PDF or structured text. Confirm the supported format in current code rather than inferring support solely from the roadmap. Avoid adding a format-specific dependency unless the task requires it and the project boundary supports it.

## Change workflow

Trace the contract from `RemoteResource` and `FetchedResource` through the selected extractor to `NormalizedDocument`. Keep format detection and extraction selection in existing registries/strategies. Add or update only directly relevant behavior and its directly related regression coverage when validation is requested. Run `npm run typecheck` or `npm run build` at the narrowest meaningful project scope when requested or necessary.
