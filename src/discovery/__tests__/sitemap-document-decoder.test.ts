import assert from "node:assert/strict";

import {
  gzipSync,
} from "node:zlib";

import {
  test,
} from "node:test";

import {
  SitemapDocumentDecoder,
} from "../sitemap-document-decoder.js";

import {
  SitemapPayloadTooLargeError,
} from "../website-discovery.errors.js";

test(
  "decodes raw gzip sitemap payloads",
  async () => {
    const xml =
      "<urlset><url><loc>https://example.com/</loc></url></urlset>";

    const compressed =
      gzipSync(
        Buffer.from(
          xml,
          "utf8",
        ),
      );

    const result =
      await new SitemapDocumentDecoder()
        .decode(
          compressed,
          "https://example.com/sitemap.xml.gz",
        );

    assert.equal(
      result.compressed,
      true,
    );

    assert.equal(
      result.xml,
      xml,
    );

    assert.equal(
      result.compressedBytes,
      compressed.byteLength,
    );
  },
);

test(
  "accepts already-uncompressed XML",
  async () => {
    const xml =
      "\uFEFF<urlset></urlset>";

    const result =
      await new SitemapDocumentDecoder()
        .decode(
          Buffer.from(
            xml,
          ),
          "https://example.com/sitemap.xml",
        );

    assert.equal(
      result.compressed,
      false,
    );

    assert.equal(
      result.xml,
      "<urlset></urlset>",
    );
  },
);

test(
  "enforces the post-decompression byte limit",
  async () => {
    const compressed =
      gzipSync(
        Buffer.from(
          "x".repeat(
            4096,
          ),
        ),
      );

    await assert.rejects(
      () =>
        new SitemapDocumentDecoder({
          maxUncompressedBytes:
            100,
        }).decode(
          compressed,
          "https://example.com/sitemap.xml.gz",
        ),
      SitemapPayloadTooLargeError,
    );
  },
);
