import assert from "node:assert/strict";

import {
  gzipSync,
} from "node:zlib";

import {
  test,
} from "node:test";

import type {
  RemotePayloadDocument,
  RemotePayloadLoader,
} from "../remote-payload-loader.js";

import {
  SitemapResolver,
} from "../sitemap-resolver.js";

class FixturePayloadLoader
  implements RemotePayloadLoader {
  constructor(
    private readonly fixtures:
      ReadonlyMap<
        string,
        Buffer
      >,
  ) {}

  async load(
    url:
      string,
  ): Promise<RemotePayloadDocument> {
    const body =
      this.fixtures.get(
        url,
      );

    if (!body) {
      throw new Error(
        `Missing fixture: ${url}`,
      );
    }

    return {
      requestedUrl:
        url,

      resolvedUrl:
        url,

      body,
    };
  }

  async loadOptional(
    url:
      string,
  ): Promise<RemotePayloadDocument | null> {
    const body =
      this.fixtures.get(
        url,
      );

    return body
      ? {
          requestedUrl:
            url,

          resolvedUrl:
            url,

          body,
        }
      : null;
  }
}

test(
  "SitemapResolver transparently parses .xml.gz payloads",
  async () => {
    const url =
      "https://example.com/sitemap.xml.gz";

    const xml =
      `
      <urlset>
        <url>
          <loc>https://example.com/docs/a</loc>
        </url>
      </urlset>
      `;

    const resolver =
      new SitemapResolver({
        loader:
          new FixturePayloadLoader(
            new Map([
              [
                url,
                gzipSync(
                  Buffer.from(
                    xml,
                  ),
                ),
              ],
            ]),
          ),
      });

    const result =
      await resolver.resolve(
        url,
      );

    assert.ok(
      result,
    );

    assert.equal(
      result?.compressed,
      true,
    );

    assert.equal(
      result?.parsed.kind,
      "urlset",
    );
  },
);
