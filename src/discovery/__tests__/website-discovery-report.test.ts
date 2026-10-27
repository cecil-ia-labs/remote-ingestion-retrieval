import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  WebsiteSource,
} from "../../domain/index.js";

import type {
  RemoteTextDocument,
  RemoteTextLoader,
} from "../remote-text-loader.js";

import type {
  RemotePayloadDocument,
  RemotePayloadLoader,
} from "../remote-payload-loader.js";

import {
  RobotsResolver,
} from "../robots-resolver.js";

import {
  SitemapResolver,
} from "../sitemap-resolver.js";

import {
  WebsiteDiscoveryService,
} from "../website-discovery-service.js";

class RobotsFixtureLoader
  implements RemoteTextLoader {
  async load(
    url:
      string,
  ): Promise<RemoteTextDocument> {
    return {
      requestedUrl:
        url,

      resolvedUrl:
        url,

      text:
        "Sitemap: https://example.com/index.xml",
    };
  }

  async loadOptional(
    url:
      string,
  ): Promise<RemoteTextDocument | null> {
    return this.load(
      url,
    );
  }
}

class PayloadFixtureLoader
  implements RemotePayloadLoader {
  private readonly fixtures =
    new Map<string, string>([
      [
        "https://example.com/index.xml",
        `
        <sitemapindex>
          <sitemap><loc>https://example.com/a.xml</loc></sitemap>
          <sitemap><loc>https://example.com/a.xml</loc></sitemap>
          <sitemap><loc>https://example.com/b.xml</loc></sitemap>
        </sitemapindex>
        `,
      ],
      [
        "https://example.com/a.xml",
        `
        <urlset>
          <url><loc>https://example.com/docs/a</loc></url>
          <url><loc>https://example.com/docs/a#fragment</loc></url>
          <url><loc>https://other.example/docs/out</loc></url>
        </urlset>
        `,
      ],
      [
        "https://example.com/b.xml",
        `
        <urlset>
          <url><loc>https://example.com/docs/b</loc></url>
          <url><loc>file:///etc/passwd</loc></url>
        </urlset>
        `,
      ],
    ]);

  async load(
    url:
      string,
  ): Promise<RemotePayloadDocument> {
    const xml =
      this.fixtures.get(
        url,
      );

    if (
      xml === undefined
    ) {
      throw new Error(
        `Missing fixture: ${url}`,
      );
    }

    return {
      requestedUrl:
        url,

      resolvedUrl:
        url,

      body:
        Buffer.from(
          xml,
        ),
    };
  }

  async loadOptional(
    url:
      string,
  ): Promise<RemotePayloadDocument | null> {
    const xml =
      this.fixtures.get(
        url,
      );

    return xml === undefined
      ? null
      : {
          requestedUrl:
            url,

          resolvedUrl:
            url,

          body:
            Buffer.from(
              xml,
            ),
        };
  }
}

function source():
  WebsiteSource {
  return {
    id:
      "site",

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

test(
  "collectReport exposes duplicate, invalid and out-of-scope discovery stats",
  async () => {
    const service =
      new WebsiteDiscoveryService({
        robotsResolver:
          new RobotsResolver({
            loader:
              new RobotsFixtureLoader(),
          }),

        sitemapResolver:
          new SitemapResolver({
            loader:
              new PayloadFixtureLoader(),
          }),
      });

    const report =
      await service.collectReport(
        source(),
      );

    assert.deepEqual(
      report.urls.map(
        (entry) =>
          entry.url,
      ),
      [
        "https://example.com/docs",
        "https://example.com/docs/a",
        "https://example.com/docs/b",
      ],
    );

    assert.equal(
      report.stats
        .sitemapIndexesProcessed,
      1,
    );

    assert.equal(
      report.stats
        .urlSetsProcessed,
      2,
    );

    assert.ok(
      report.stats
        .duplicateSitemapUrls
      >= 1,
    );

    assert.ok(
      report.stats
        .duplicateDocumentUrls
      >= 1,
    );

    assert.ok(
      report.stats
        .outOfScopeDocumentUrls
      >= 1,
    );

    assert.ok(
      report.stats
        .invalidSitemapEntries
      >= 1,
    );
  },
);
