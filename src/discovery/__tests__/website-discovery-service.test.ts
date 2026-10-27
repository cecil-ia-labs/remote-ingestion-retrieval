import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import type {
  WebsiteSource,
} from "../../domain/index.js";

import type {
  RemotePayloadDocument,
  RemotePayloadLoader,
} from "../remote-payload-loader.js";

import type {
  RemoteTextDocument,
  RemoteTextLoader,
} from "../remote-text-loader.js";

import {
  RobotsResolver,
} from "../robots-resolver.js";

import {
  SitemapResolver,
} from "../sitemap-resolver.js";

import {
  WebsiteDiscoveryService,
} from "../website-discovery-service.js";

class FixtureTextLoader
  implements RemoteTextLoader {
  constructor(
    private readonly fixtures:
      ReadonlyMap<
        string,
        string
      >,
  ) {}

  async load(
    url:
      string,
  ): Promise<RemoteTextDocument> {
    const text =
      this.fixtures.get(
        url,
      );

    if (
      text === undefined
    ) {
      throw new Error(
        `Missing text fixture: ${url}`,
      );
    }

    return {
      requestedUrl:
        url,

      resolvedUrl:
        url,

      text,
    };
  }

  async loadOptional(
    url:
      string,
  ): Promise<RemoteTextDocument | null> {
    const text =
      this.fixtures.get(
        url,
      );

    return text === undefined
      ? null
      : {
          requestedUrl:
            url,

          resolvedUrl:
            url,

          text,
        };
  }
}

class FixturePayloadLoader
  implements RemotePayloadLoader {
  constructor(
    private readonly fixtures:
      ReadonlyMap<
        string,
        string
      >,
  ) {}

  async load(
    url:
      string,
  ): Promise<RemotePayloadDocument> {
    const text =
      this.fixtures.get(
        url,
      );

    if (
      text === undefined
    ) {
      throw new Error(
        `Missing payload fixture: ${url}`,
      );
    }

    return {
      requestedUrl:
        url,

      resolvedUrl:
        url,

      body:
        Buffer.from(
          text,
          "utf8",
        ),
    };
  }

  async loadOptional(
    url:
      string,
  ): Promise<RemotePayloadDocument | null> {
    const text =
      this.fixtures.get(
        url,
      );

    return text === undefined
      ? null
      : {
          requestedUrl:
            url,

          resolvedUrl:
            url,

          body:
            Buffer.from(
              text,
              "utf8",
            ),
        };
  }
}

function createSource(
  options: Partial<WebsiteSource> = {},
): WebsiteSource {
  return {
    id:
      "docs",

    type:
      "website",

    url:
      "https://example.com/docs",

    createdAt:
      new Date(),

    updatedAt:
      new Date(),

    ...options,
  };
}

function createDiscovery(
  fixtures:
    ReadonlyMap<string, string>,
): WebsiteDiscoveryService {
  const textLoader =
    new FixtureTextLoader(
      fixtures,
    );

  const payloadLoader =
    new FixturePayloadLoader(
      fixtures,
    );

  return new WebsiteDiscoveryService({
    robotsResolver:
      new RobotsResolver({
        loader:
          textLoader,
      }),

    sitemapResolver:
      new SitemapResolver({
        loader:
          payloadLoader,
      }),
  });
}

test(
  "discovers root plus URLs from a robots-declared sitemap index",
  async () => {
    const fixtures =
      new Map<string, string>([
        [
          "https://example.com/robots.txt",
          "Sitemap: https://example.com/sitemap-index.xml",
        ],
        [
          "https://example.com/sitemap-index.xml",
          `
          <sitemapindex>
            <sitemap>
              <loc>https://example.com/sitemap-docs.xml</loc>
            </sitemap>
            <sitemap>
              <loc>https://example.com/sitemap-more.xml</loc>
            </sitemap>
          </sitemapindex>
          `,
        ],
        [
          "https://example.com/sitemap-docs.xml",
          `
          <urlset>
            <url>
              <loc>https://example.com/docs</loc>
            </url>
            <url>
              <loc>https://example.com/docs/auth</loc>
              <lastmod>2026-09-14</lastmod>
            </url>
          </urlset>
          `,
        ],
        [
          "https://example.com/sitemap-more.xml",
          `
          <urlset>
            <url>
              <loc>https://example.com/docs/api</loc>
            </url>
          </urlset>
          `,
        ],
      ]);

    const result =
      await createDiscovery(
        fixtures,
      ).collect(
        createSource(),
      );

    assert.deepEqual(
      result.map(
        (entry) =>
          entry.url,
      ),
      [
        "https://example.com/docs",
        "https://example.com/docs/auth",
        "https://example.com/docs/api",
      ],
    );

    assert.equal(
      result[1]
        ?.discoveredBy,
      "sitemap",
    );

    assert.equal(
      result[1]
        ?.sitemapUrl,
      "https://example.com/sitemap-docs.xml",
    );
  },
);

test(
  "falls back to /sitemap.xml when robots.txt is missing",
  async () => {
    const fixtures =
      new Map<string, string>([
        [
          "https://example.com/sitemap.xml",
          `
          <urlset>
            <url>
              <loc>https://example.com/docs/start</loc>
            </url>
          </urlset>
          `,
        ],
      ]);

    const result =
      await createDiscovery(
        fixtures,
      ).collect(
        createSource(),
      );

    assert.deepEqual(
      result.map(
        (entry) =>
          entry.url,
      ),
      [
        "https://example.com/docs",
        "https://example.com/docs/start",
      ],
    );
  },
);

test(
  "filters out cross-origin sitemap document URLs by default",
  async () => {
    const fixtures =
      new Map<string, string>([
        [
          "https://example.com/robots.txt",
          "Sitemap: https://example.com/sitemap.xml",
        ],
        [
          "https://example.com/sitemap.xml",
          `
          <urlset>
            <url>
              <loc>https://example.com/docs/auth</loc>
            </url>
            <url>
              <loc>https://other.example.net/docs/leak</loc>
            </url>
          </urlset>
          `,
        ],
      ]);

    const result =
      await createDiscovery(
        fixtures,
      ).collect(
        createSource(),
      );

    assert.deepEqual(
      result.map(
        (entry) =>
          entry.url,
      ),
      [
        "https://example.com/docs",
        "https://example.com/docs/auth",
      ],
    );
  },
);

test(
  "respects WebsiteSource maxPages as the discovery URL limit",
  async () => {
    const fixtures =
      new Map<string, string>([
        [
          "https://example.com/sitemap.xml",
          `
          <urlset>
            <url><loc>https://example.com/a</loc></url>
            <url><loc>https://example.com/b</loc></url>
            <url><loc>https://example.com/c</loc></url>
          </urlset>
          `,
        ],
      ]);

    const source =
      createSource({
        options: {
          crawl: {
            maxPages:
              2,
          },
        },
      });

    const result =
      await createDiscovery(
        fixtures,
      ).collect(
        source,
      );

    assert.equal(
      result.length,
      2,
    );

    assert.deepEqual(
      result.map(
        (entry) =>
          entry.url,
      ),
      [
        "https://example.com/docs",
        "https://example.com/a",
      ],
    );
  },
);

test(
  "sitemap strategy yields only the root when no sitemap exists",
  async () => {
    const result =
      await createDiscovery(
        new Map(),
      ).collect(
        createSource({
          options: {
            crawl: {
              discoveryStrategy:
                "sitemap",
            },
          },
        }),
      );

    assert.deepEqual(
      result.map(
        (entry) =>
          entry.url,
      ),
      [
        "https://example.com/docs",
      ],
    );
  },
);
