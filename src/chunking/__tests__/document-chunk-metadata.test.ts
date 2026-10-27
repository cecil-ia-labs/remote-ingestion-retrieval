import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  WebDocument,
} from "../../website/web-document.js";

import {
  ExistingMarkdownSplitterAdapter,
} from "../existing-markdown-splitter-adapter.js";

import {
  WebDocumentChunker,
} from "../web-document-chunker.js";

function document(): WebDocument {
  const markdown = [
    "# Realtime Agent",
    "",
    "Overview.",
    "",
    "## Authentication",
    "",
    "Use a short-lived token.",
    "",
    "### Refresh",
    "",
    "Rotate refresh tokens.",
    "",
    "## Tools",
    "",
    "Expose required tools.",
  ].join("\n");

  return {
    id: "webdoc_metadata_fixture",
    sourceId: "source_metadata_fixture",
    url: "https://example.com/docs/realtime-agent",
    canonicalUrl: "https://example.com/docs/realtime-agent",
    title: "Realtime Agent",
    markdown,
    contentHash: "document_hash_fixture",
    content: {
      format: "markdown",
      hashAlgorithm: "sha256",
      hash: "document_hash_fixture",
      byteLength: Buffer.byteLength(markdown),
      characterLength: markdown.length,
      lineCount: markdown.split("\n").length,
      nonEmptyLineCount: 8,
    },
    identity: {
      inputUrl: "https://example.com/docs/realtime-agent?utm_source=nav",
      canonicalUrl: "https://example.com/docs/realtime-agent",
      aliases: [
        "https://example.com/docs/realtime-agent?utm_source=nav",
      ],
      canonicalization: {
        changed: true,
        appliedRules: [
          "remove-tracking-parameter",
        ],
        removedQueryParameters: [
          "utm_source",
        ],
      },
    },
    discovery: {
      method: "crawl",
      url: "https://example.com/docs/realtime-agent",
      discoveredFrom: "https://example.com/docs",
      depth: 1,
      anchorText: "Realtime Agent",
      lastModified: new Date("2026-09-15T18:00:00.000Z"),
    },
    acquisition: {
      requestedUrl: "https://example.com/docs/realtime-agent",
      resolvedUrl: "https://example.com/docs/realtime-agent",
      redirectChain: [],
      statusCode: 200,
      contentType: "text/html",
      fetchedByteLength: 1000,
      etag: '"etag-fixture"',
      fetchedAt: new Date("2026-09-16T12:00:00.000Z"),
      extractedAt: new Date("2026-09-16T12:00:01.000Z"),
      transport: "http",
      networkSafety: "dns-pinned",
    },
    metadata: {
      requestedUrl: "https://example.com/docs/realtime-agent",
      resolvedUrl: "https://example.com/docs/realtime-agent",
      canonicalUrl: "https://example.com/docs/realtime-agent",
      title: "Realtime Agent",
      description: "Realtime agent documentation",
      language: "en",
      contentType: "text/html",
      resourceType: "html",
      etag: '"etag-fixture"',
      fetchedAt: new Date("2026-09-16T12:00:00.000Z"),
      extractedAt: new Date("2026-09-16T12:00:01.000Z"),
      byteLength: 1000,
      attributes: {
        siteName: "Docs",
      },
    },
    processedAt: new Date("2026-09-16T12:00:01.000Z"),
  };
}

function headingSplitter(markdown: string): readonly string[] {
  const parts = markdown.split(/(?=^##\s+)/m);
  return parts.map((part) => part.trim()).filter(Boolean);
}

test(
  "inherits JSON-safe WebDocument metadata and derives heading/source ranges",
  async () => {
    const result = await new WebDocumentChunker({
      splitter: new ExistingMarkdownSplitterAdapter({
        name: "heading-fixture",
        split: headingSplitter,
      }),
    }).chunk(document());

    assert.equal(result.chunks.length, 3);
    assert.equal(result.stats.sourceRangesResolved, 3);
    assert.equal(result.stats.sourceRangesUnresolved, 0);

    const authentication = result.chunks[1];
    assert.ok(authentication);

    assert.deepEqual(
      authentication.metadata.chunk.headingPath,
      [
        "Realtime Agent",
        "Authentication",
      ],
    );

    assert.deepEqual(
      authentication.metadata.chunk.headingLevels,
      [1, 2],
    );

    assert.equal(
      authentication.metadata.chunk.sourceRange.resolved,
      true,
    );

    assert.equal(
      authentication.metadata.document.language,
      "en",
    );

    assert.equal(
      authentication.metadata.discovery?.method,
      "crawl",
    );

    assert.equal(
      authentication.metadata.acquisition.networkSafety,
      "dns-pinned",
    );

    assert.equal(
      authentication.metadata.chunk.total,
      3,
    );

    assert.doesNotThrow(() => JSON.stringify(authentication.metadata));
    assert.equal(
      authentication.metadata.document.processedAt,
      "2026-09-16T12:00:01.000Z",
    );
    assert.equal(
      authentication.metadata.discovery?.lastModified,
      "2026-09-15T18:00:00.000Z",
    );
  },
);

test(
  "preserves splitter-provided metadata and source offsets",
  async () => {
    const doc = document();
    const exact = "## Tools\n\nExpose required tools.";
    const startOffset = doc.markdown.indexOf(exact);

    const result = await new WebDocumentChunker({
      splitter: new ExistingMarkdownSplitterAdapter<{
        markdown: string;
        start: number;
        end: number;
      }>({
        name: "offset-aware-fixture",
        split: () => [
          {
            markdown: exact,
            start: startOffset,
            end: startOffset + exact.length,
          },
        ],
        toMarkdown: (chunk) => chunk.markdown,
        toMetadata: (chunk) => ({
          startOffset: chunk.start,
          endOffset: chunk.end,
          headingPath: [
            "Realtime Agent",
            "Tools",
          ],
          headingLevels: [1, 2],
          attributes: {
            splitterChunkType: "section",
          },
        }),
      }),
    }).chunk(doc);

    const chunk = result.chunks[0];
    assert.ok(chunk);
    assert.equal(chunk.metadata.chunk.sourceRange.startOffset, startOffset);
    assert.deepEqual(
      chunk.metadata.chunk.headingPath,
      ["Realtime Agent", "Tools"],
    );
    assert.equal(
      chunk.metadata.splitter.attributes?.splitterChunkType,
      "section",
    );
  },
);

test(
  "marks transformed splitter content as unresolved when no offsets are supplied",
  async () => {
    const result = await new WebDocumentChunker({
      splitter: new ExistingMarkdownSplitterAdapter({
        name: "transforming-fixture",
        split: () => [
          "CONTENT THAT DOES NOT EXIST VERBATIM IN THE SOURCE",
        ],
      }),
    }).chunk(document());

    const chunk = result.chunks[0];
    assert.ok(chunk);
    assert.equal(chunk.metadata.chunk.sourceRange.resolved, false);
    assert.equal(result.stats.sourceRangesUnresolved, 1);
  },
);
