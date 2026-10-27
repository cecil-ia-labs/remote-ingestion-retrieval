import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  DocumentChunk,
} from "../../chunking/document-chunk.js";

import {
  DefaultVectorMetadataProjector,
} from "../vector-metadata-projector.js";

function fixture(): DocumentChunk {
  return {
    id: "chunk_1",
    sourceId: "source_1",
    documentId: "document_1",
    ordinal: 0,
    markdown: "# Hello",
    contentHash: "hash",
    byteLength: 7,
    characterLength: 7,
    metadata: {
      schemaVersion: 1,
      document: {
        id: "document_1",
        sourceId: "source_1",
        url: "https://example.com/hello",
        canonicalUrl: "https://example.com/hello",
        title: "Hello",
        language: "en",
        resourceType: "html",
        contentHash: "doc_hash",
        processedAt: "2026-09-16T12:00:00.000Z",
      },
      acquisition: {
        requestedUrl: "https://example.com/hello",
        resolvedUrl: "https://example.com/hello",
        fetchedByteLength: 100,
        fetchedAt: "2026-09-16T11:59:00.000Z",
        extractedAt: "2026-09-16T12:00:00.000Z",
      },
      chunk: {
        ordinal: 0,
        total: 1,
        contentHash: "hash",
        byteLength: 7,
        characterLength: 7,
        lineCount: 1,
        nonEmptyLineCount: 1,
        headingPath: ["Hello"],
        headingLevels: [1],
        sourceRange: {
          resolved: true,
          startOffset: 0,
          endOffset: 7,
          startLine: 1,
          endLine: 1,
        },
      },
      splitter: {
        name: "fixture",
        attributes: {
          quality: 1,
        },
      },
    },
  };
}

test(
  "projects rich JSON-safe metadata with top-level filter keys",
  () => {
    const metadata =
      new DefaultVectorMetadataProjector()
        .project(
          fixture(),
        );

    assert.equal(
      metadata.chunkId,
      "chunk_1",
    );

    assert.equal(
      metadata.documentId,
      "document_1",
    );

    assert.deepEqual(
      metadata.headingPath,
      ["Hello"],
    );

    assert.doesNotThrow(
      () =>
        JSON.stringify(
          metadata,
        ),
    );
  },
);
