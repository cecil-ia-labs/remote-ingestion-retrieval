import assert from "node:assert/strict";

import {
  test,
} from "node:test";

import {
  RobotsTxtParser,
} from "../robots-txt-parser.js";

test(
  "extracts and deduplicates Sitemap directives",
  () => {
    const parsed =
      new RobotsTxtParser()
        .parse(
          `
          User-agent: *
          Disallow: /private

          Sitemap: https://example.com/sitemap.xml
          sitemap: /sitemap-pages.xml
          Sitemap: https://example.com/sitemap.xml # duplicate
          `,
          "https://example.com/robots.txt",
        );

    assert.deepEqual(
      parsed.sitemapUrls,
      [
        "https://example.com/sitemap.xml",
        "https://example.com/sitemap-pages.xml",
      ],
    );
  },
);
