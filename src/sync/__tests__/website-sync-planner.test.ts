import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";

import type {
  WebDocument,
} from "../../website/web-document.js";

import type {
  IncrementalSyncState,
} from "../incremental-sync-state.js";

import {
  WebsiteSyncPlanner,
} from "../website-sync-planner.js";

function sha256(
  value:
    string,
): string {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}

function document(
  id:
    string,

  body:
    string,
): WebDocument {
  const url =
    `https://example.com/${id}`;

  const markdown =
    `# ${id}\n\n${body}`;

  const contentHash =
    sha256(markdown);

  const now =
    new Date("2026-09-16T13:00:00.000Z");

  return {
    id,
    sourceId:
      "site-1",
    url,
    canonicalUrl:
      url,
    title:
      id,
    markdown,
    contentHash,
    content: {
      format:
        "markdown",
      hashAlgorithm:
        "sha256",
      hash:
        contentHash,
      byteLength:
        Buffer.byteLength(markdown),
      characterLength:
        markdown.length,
      lineCount:
        3,
      nonEmptyLineCount:
        2,
    },
    identity: {
      inputUrl:
        url,
      canonicalUrl:
        url,
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
    discovery: {
      method:
        "sitemap",
      url,
    },
    acquisition: {
      requestedUrl:
        url,
      resolvedUrl:
        url,
      redirectChain:
        [],
      statusCode:
        200,
      contentType:
        "text/html",
      fetchedByteLength:
        Buffer.byteLength(markdown),
      fetchedAt:
        now,
      extractedAt:
        now,
    },
    metadata: {
      requestedUrl:
        url,
      resolvedUrl:
        url,
      canonicalUrl:
        url,
      title:
        id,
      resourceType:
        "html",
      contentType:
        "text/html",
      fetchedAt:
        now,
      extractedAt:
        now,
      byteLength:
        Buffer.byteLength(markdown),
    },
    processedAt:
      now,
  };
}

function stateFrom(
  documents:
    readonly WebDocument[],

  pipelineRevision =
    "pipeline-v1",
): IncrementalSyncState {
  return {
    schemaVersion:
      1,
    sourceId:
      "site-1",
    pipelineRevision,
    documents:
      documents.map(
        (item) => ({
          documentId:
            item.id,
          canonicalUrl:
            item.canonicalUrl,
          contentHash:
            item.contentHash,
          // For this planner test we deliberately set a stable stand-in
          // fingerprint and patch the unchanged document below.
          syncFingerprint:
            "placeholder",
          chunks:
            [],
        }),
      ),
    updatedAt:
      "2026-09-16T13:00:00.000Z",
  };
}

test(
  "classifies added, changed and removed documents",
  () => {
    const planner =
      new WebsiteSyncPlanner();

    const oldA =
      document("a", "old");

    const oldB =
      document("b", "removed");

    const currentA =
      document("a", "new");

    const currentC =
      document("c", "added");

    const previous =
      stateFrom([
        oldA,
        oldB,
      ]);

    const result =
      planner.plan({
        documents: [
          currentA,
          currentC,
        ],
        previous,
        pipelineRevision:
          "pipeline-v1",
        snapshotComplete:
          true,
      });

    assert.equal(
      result.stats.added,
      1,
    );

    assert.equal(
      result.stats.changed,
      1,
    );

    assert.equal(
      result.stats.removed,
      1,
    );

    assert.equal(
      result.added[0]?.documentId,
      "c",
    );

    assert.equal(
      result.changed[0]?.documentId,
      "a",
    );

    assert.equal(
      result.removed[0]?.documentId,
      "b",
    );
  },
);

test(
  "does not infer removals from an incomplete website snapshot",
  () => {
    const planner =
      new WebsiteSyncPlanner();

    const previous =
      stateFrom([
        document("a", "one"),
        document("b", "two"),
      ]);

    const result =
      planner.plan({
        documents: [
          document("a", "one"),
        ],
        previous,
        pipelineRevision:
          "pipeline-v1",
        snapshotComplete:
          false,
      });

    assert.equal(
      result.removed.length,
      0,
    );
  },
);
