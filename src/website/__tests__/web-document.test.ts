import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  WebsiteSource,
} from "../../domain/index.js";

import type {
  NormalizedDocument,
} from "../../normalization/index.js";

import {
  WebDocumentFactory,
  WebsiteDocumentCollection,
  WebsiteDocumentSourceMismatchError,
} from "../index.js";

function createWebsiteSource(
  id =
    "site-1",
): WebsiteSource {
  return {
    id,

    type:
      "website",

    url:
      "https://example.com/docs",

    createdAt:
      new Date(),

    updatedAt:
      new Date(),
  };
}

function createNormalized(
  canonicalUrl =
    "https://example.com/docs/auth",
): NormalizedDocument {
  return {
    markdown:
      "# Authentication\n\nOAuth tokens.",

    metadata: {
      requestedUrl:
        canonicalUrl,

      resolvedUrl:
        canonicalUrl,

      canonicalUrl,

      title:
        "Authentication",

      resourceType:
        "html",

      contentType:
        "text/html",

      fetchedAt:
        new Date(
          "2026-09-15T21:00:00.000Z",
        ),

      extractedAt:
        new Date(
          "2026-09-15T21:00:01.000Z",
        ),

      byteLength:
        100,
    },
  };
}

test(
  "WebDocumentFactory creates deterministic identity and content hash",
  () => {
    const factory =
      new WebDocumentFactory();

    const source =
      createWebsiteSource();

    const normalized =
      createNormalized();

    const first =
      factory.create(
        source,
        normalized,
      );

    const second =
      factory.create(
        source,
        normalized,
      );

    assert.equal(
      first.id,
      second.id,
    );

    assert.equal(
      first.contentHash,
      second.contentHash,
    );

    assert.equal(
      first.canonicalUrl,
      normalized.metadata
        .canonicalUrl,
    );

    assert.equal(
      first.sourceId,
      source.id,
    );
  },
);

test(
  "document identity changes across different WebsiteSource objects",
  () => {
    const factory =
      new WebDocumentFactory();

    const normalized =
      createNormalized();

    const first =
      factory.create(
        createWebsiteSource(
          "site-a",
        ),
        normalized,
      );

    const second =
      factory.create(
        createWebsiteSource(
          "site-b",
        ),
        normalized,
      );

    assert.notEqual(
      first.id,
      second.id,
    );
  },
);

test(
  "collection upserts documents belonging to its source",
  () => {
    const source =
      createWebsiteSource();

    const document =
      new WebDocumentFactory()
        .create(
          source,
          createNormalized(),
        );

    const collection =
      new WebsiteDocumentCollection(
        source.id,
      );

    collection.upsert(
      document,
    );

    assert.equal(
      collection.size,
      1,
    );

    assert.equal(
      collection.get(
        document.id,
      ),
      document,
    );
  },
);

test(
  "collection rejects a document from another WebsiteSource",
  () => {
    const document =
      new WebDocumentFactory()
        .create(
          createWebsiteSource(
            "other-site",
          ),
          createNormalized(),
        );

    const collection =
      new WebsiteDocumentCollection(
        "site-1",
      );

    assert.throws(
      () =>
        collection.upsert(
          document,
        ),
      WebsiteDocumentSourceMismatchError,
    );
  },
);


test(
  "WebDocument identity uses the WebsiteSource canonicalization policy",
  () => {
    const factory =
      new WebDocumentFactory();

    const source:
      WebsiteSource = {
      ...createWebsiteSource(
        "canonical-site",
      ),

      options: {
        crawl: {
          canonicalization: {
            trailingSlash:
              "remove",
          },
        },
      },
    };

    const first =
      factory.create(
        source,
        createNormalized(
          "https://example.com/docs/api/?utm_source=one&b=2&a=1#methods",
        ),
      );

    const second =
      factory.create(
        source,
        createNormalized(
          "HTTPS://EXAMPLE.COM:443/docs/api?a=1&b=2#other",
        ),
      );

    assert.equal(
      first.canonicalUrl,
      "https://example.com/docs/api?a=1&b=2",
    );

    assert.equal(
      first.id,
      second.id,
    );
  },
);
