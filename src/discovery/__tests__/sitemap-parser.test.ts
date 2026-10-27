import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import {
  SitemapParser,
} from "../sitemap-parser.js";

test(
  "parses sitemap urlset entries and metadata",
  () => {
    const result =
      new SitemapParser()
        .parse(
          `
          <?xml version="1.0" encoding="UTF-8"?>
          <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
              <loc>https://example.com/docs/auth</loc>
              <lastmod>2026-09-14</lastmod>
              <changefreq>weekly</changefreq>
              <priority>0.8</priority>
            </url>
            <url>
              <loc>/docs/api</loc>
            </url>
          </urlset>
          `,
          "https://example.com/sitemap.xml",
        );

    assert.equal(
      result.kind,
      "urlset",
    );

    if (
      result.kind
      !== "urlset"
    ) {
      return;
    }

    assert.equal(
      result.urls.length,
      2,
    );

    assert.equal(
      result.urls[0]
        ?.loc,
      "https://example.com/docs/auth",
    );

    assert.equal(
      result.urls[0]
        ?.changeFrequency,
      "weekly",
    );

    assert.equal(
      result.urls[0]
        ?.priority,
      0.8,
    );

    assert.equal(
      result.urls[1]
        ?.loc,
      "https://example.com/docs/api",
    );
  },
);

test(
  "parses sitemap indexes",
  () => {
    const result =
      new SitemapParser()
        .parse(
          `
          <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <sitemap>
              <loc>https://example.com/sitemap-docs.xml</loc>
            </sitemap>
            <sitemap>
              <loc>/sitemap-blog.xml</loc>
            </sitemap>
          </sitemapindex>
          `,
          "https://example.com/sitemap-index.xml",
        );

    assert.equal(
      result.kind,
      "sitemapindex",
    );

    if (
      result.kind
      !== "sitemapindex"
    ) {
      return;
    }

    assert.deepEqual(
      result.sitemaps.map(
        (entry) =>
          entry.loc,
      ),
      [
        "https://example.com/sitemap-docs.xml",
        "https://example.com/sitemap-blog.xml",
      ],
    );
  },
);
