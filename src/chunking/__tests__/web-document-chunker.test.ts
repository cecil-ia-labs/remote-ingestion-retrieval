import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  WebDocument,
} from "../../website/web-document.js";

import {
  ExistingMarkdownSplitterAdapter,
} from "../existing-markdown-splitter-adapter.js";

import {
  EmptyMarkdownSplitResultError,
} from "../chunking.errors.js";

import {
  WebDocumentChunker,
} from "../web-document-chunker.js";

function document(): WebDocument {
  const markdown =
    "# Docs\n\nIntro\n\n## API\n\nReference";

  return {
    id:
      "webdoc_fixture",

    sourceId:
      "source_fixture",

    url:
      "https://example.com/docs",

    canonicalUrl:
      "https://example.com/docs",

    title:
      "Docs",

    markdown,

    contentHash:
      "8f87ebfd3a06f38f37d89aaf86b741b0803f9433d31393535ffbc26f023c8e41",

    content: {
      format:
        "markdown",

      hashAlgorithm:
        "sha256",

      hash:
        "8f87ebfd3a06f38f37d89aaf86b741b0803f9433d31393535ffbc26f023c8e41",

      byteLength:
        Buffer.byteLength(
          markdown,
        ),

      characterLength:
        markdown.length,

      lineCount:
        7,

      nonEmptyLineCount:
        4,
    },

    identity: {
      inputUrl:
        "https://example.com/docs",

      canonicalUrl:
        "https://example.com/docs",

      aliases:
        [],

      canonicalization: {
        changed:
          false,

        appliedRules:
          [],

        removedQueryParameters:
          [],
      },
    },

    acquisition: {
      requestedUrl:
        "https://example.com/docs",

      resolvedUrl:
        "https://example.com/docs",

      redirectChain:
        [],

      fetchedByteLength:
        100,

      fetchedAt:
        new Date(
          "2026-09-16T12:00:00.000Z",
        ),

      extractedAt:
        new Date(
          "2026-09-16T12:00:01.000Z",
        ),
    },

    metadata: {
      requestedUrl:
        "https://example.com/docs",

      resolvedUrl:
        "https://example.com/docs",

      resourceType:
        "html",

      fetchedAt:
        new Date(
          "2026-09-16T12:00:00.000Z",
        ),

      extractedAt:
        new Date(
          "2026-09-16T12:00:01.000Z",
        ),

      byteLength:
        100,
    },

    processedAt:
      new Date(
        "2026-09-16T12:00:01.000Z",
      ),
  };
}

test(
  "creates deterministic chunks linked to the WebDocument",
  async () => {
    const splitter =
      new ExistingMarkdownSplitterAdapter({
        name:
          "paragraph-fixture",

        split:
          (markdown) =>
            markdown.split(
              /\n\n+/,
            ),
      });

    const chunker =
      new WebDocumentChunker({
        splitter,
      });

    const first =
      await chunker.chunk(
        document(),
      );

    const second =
      await chunker.chunk(
        document(),
      );

    assert.equal(
      first.splitterName,
      "paragraph-fixture",
    );

    assert.equal(
      first.chunks.length,
      4,
    );

    assert.deepEqual(
      first.chunks.map(
        (chunk) =>
          chunk.id,
      ),
      second.chunks.map(
        (chunk) =>
          chunk.id,
      ),
    );

    assert.ok(
      first.chunks.every(
        (chunk) =>
          chunk.documentId
          === "webdoc_fixture",
      ),
    );

    assert.deepEqual(
      first.chunks.map(
        (chunk) =>
          chunk.ordinal,
      ),
      [
        0,
        1,
        2,
        3,
      ],
    );
  },
);

test(
  "drops whitespace-only segments by default",
  async () => {
    const splitter =
      new ExistingMarkdownSplitterAdapter({
        split:
          () => [
            "first",
            "   ",
            "second",
          ],
      });

    const result =
      await new WebDocumentChunker({
        splitter,
      }).chunk(
        document(),
      );

    assert.equal(
      result.chunks.length,
      2,
    );

    assert.equal(
      result.stats
        .emptySegmentsDropped,
      1,
    );
  },
);

test(
  "rejects a non-empty document when the splitter yields no usable chunks",
  async () => {
    const splitter =
      new ExistingMarkdownSplitterAdapter({
        split:
          () => [
            "  ",
            "\n",
          ],
      });

    await assert.rejects(
      () =>
        new WebDocumentChunker({
          splitter,
        }).chunk(
          document(),
        ),
      EmptyMarkdownSplitResultError,
    );
  },
);
