import assert from "node:assert/strict";
import { test } from "node:test";

import type { WebsiteSource } from "../../domain/website-source.js";
import type { DiscoveredUrl } from "../../discovery/discovered-url.js";
import type { NormalizedDocument } from "../../normalization/normalized-document.js";
import type { FetchedResource } from "../../remote/fetched-resource.js";

import {
  WebDocumentFactory,
  WebsiteDocumentCollection,
  validateWebDocument,
} from "../index.js";

function source(): WebsiteSource {
  return {
    id: "phase-16-site",
    type: "website",
    url: "https://example.com/docs",
    options: {
      crawl: {
        canonicalization: {
          trailingSlash: "remove",
          hostAliases: {
            "www.example.com": "example.com",
          },
        },
      },
    },
    createdAt: new Date("2026-09-16T10:00:00.000Z"),
    updatedAt: new Date("2026-09-16T10:00:00.000Z"),
  };
}

function normalized(): NormalizedDocument {
  return {
    markdown: "# Authentication\n\nUse OAuth.",
    metadata: {
      requestedUrl:
        "https://www.example.com/docs/auth/?utm_source=nav#token",
      resolvedUrl:
        "https://example.com/docs/auth/",
      canonicalUrl:
        "https://example.com/docs/auth/?b=2&a=1&utm_campaign=test",
      title: "Authentication",
      resourceType: "html",
      contentType: "text/html",
      etag: "\"abc123\"",
      lastModified:
        "Tue, 15 Sep 2026 18:00:00 GMT",
      fetchedAt:
        new Date("2026-09-16T10:01:00.000Z"),
      extractedAt:
        new Date("2026-09-16T10:01:01.000Z"),
      byteLength: 100,
    },
  };
}

function discovered(): DiscoveredUrl {
  return {
    url:
      "https://example.com/docs/auth?a=1&b=2",
    originalUrl:
      "https://www.example.com/docs/auth/?utm_source=nav#token",
    discoveredBy: "crawl",
    discoveredFrom:
      "https://example.com/docs",
    depth: 1,
    anchorText: "Authentication",
  };
}

function fetched(): FetchedResource {
  const body =
    Buffer.from("<html></html>");

  return {
    resource: {
      requestedUrl:
        "https://www.example.com/docs/auth/?utm_source=nav#token",
      resolvedUrl:
        "https://example.com/docs/auth/",
      redirectChain: [
        "https://www.example.com/docs/auth/?utm_source=nav#token",
      ],
      statusCode: 200,
      headers: {
        "content-type": "text/html",
      },
      contentType: "text/html",
      contentLength: body.byteLength,
      etag: "\"abc123\"",
      lastModified:
        "Tue, 15 Sep 2026 18:00:00 GMT",
      resourceType: "html",
      resourceTypeDetectedBy:
        "content-type",
      resolvedAddress:
        "93.184.216.34",
      resolvedAddressFamily: 4,
      transport: "http",
      networkSafety:
        "dns-pinned",
    },
    body,
    byteLength:
      body.byteLength,
    headers: {
      "content-type": "text/html",
    },
    fetchedAt:
      new Date("2026-09-16T10:01:00.000Z"),
  };
}

test(
  "captures identity, discovery, acquisition and content provenance",
  () => {
    const document =
      new WebDocumentFactory()
        .create(
          source(),
          normalized(),
          {
            discoveredUrl:
              discovered(),
            fetchedResource:
              fetched(),
          },
        );

    assert.equal(
      document.canonicalUrl,
      "https://example.com/docs/auth?a=1&b=2",
    );

    assert.equal(
      document.discovery?.method,
      "crawl",
    );

    assert.equal(
      document.acquisition.transport,
      "http",
    );

    assert.equal(
      document.acquisition.networkSafety,
      "dns-pinned",
    );

    assert.equal(
      document.content.hash,
      document.contentHash,
    );

    assert.ok(
      document.identity.aliases.includes(
        "https://www.example.com/docs/auth/?utm_source=nav#token",
      ),
    );

    assert.doesNotThrow(
      () =>
        validateWebDocument(
          document,
        ),
    );
  },
);

test(
  "source-aware collection resolves canonical-equivalent aliases",
  () => {
    const site =
      source();

    const document =
      new WebDocumentFactory()
        .create(
          site,
          normalized(),
          {
            discoveredUrl:
              discovered(),
            fetchedResource:
              fetched(),
          },
        );

    const collection =
      WebsiteDocumentCollection
        .forSource(
          site,
          [document],
        );

    assert.equal(
      collection.getByUrl(
        "HTTPS://WWW.EXAMPLE.COM:443/docs/auth/?b=2&a=1&utm_source=test#x",
      )?.id,
      document.id,
    );
  },
);
