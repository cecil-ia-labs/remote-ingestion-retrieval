import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import {
  SitemapParser,
} from "../sitemap-parser.js";

import {
  SitemapEntryLimitError,
} from "../website-discovery.errors.js";

test(
  "supports namespace-prefixed sitemap elements",
  () => {
    const result =
      new SitemapParser()
        .parse(
          `
          <sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
            <sm:url>
              <sm:loc>https://example.com/a</sm:loc>
            </sm:url>
          </sm:urlset>
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
      result.urls[0]
        ?.loc,
      "https://example.com/a",
    );
  },
);

test(
  "counts malformed URL entries instead of crashing the whole sitemap",
  () => {
    const result =
      new SitemapParser()
        .parse(
          `
          <urlset>
            <url><loc>https://example.com/good</loc></url>
            <url><loc>file:///etc/passwd</loc></url>
            <url><loc></loc></url>
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
      1,
    );

    assert.equal(
      result.invalidEntryCount,
      2,
    );
  },
);

test(
  "enforces URL entry count limits",
  () => {
    assert.throws(
      () =>
        new SitemapParser({
          maxUrlEntries:
            1,
        }).parse(
          `
          <urlset>
            <url><loc>https://example.com/a</loc></url>
            <url><loc>https://example.com/b</loc></url>
          </urlset>
          `,
          "https://example.com/sitemap.xml",
        ),
      SitemapEntryLimitError,
    );
  },
);

test(
  "enforces sitemap-index entry count limits",
  () => {
    assert.throws(
      () =>
        new SitemapParser({
          maxSitemapEntries:
            1,
        }).parse(
          `
          <sitemapindex>
            <sitemap><loc>https://example.com/a.xml</loc></sitemap>
            <sitemap><loc>https://example.com/b.xml</loc></sitemap>
          </sitemapindex>
          `,
          "https://example.com/index.xml",
        ),
      SitemapEntryLimitError,
    );
  },
);
