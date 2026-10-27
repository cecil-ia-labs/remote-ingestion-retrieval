import type {
  RemotePayloadLoader,
} from "./remote-payload-loader.js";

import {
  HttpRemotePayloadLoader,
} from "./remote-payload-loader.js";

import {
  SitemapDocumentDecoder,
} from "./sitemap-document-decoder.js";

import {
  SitemapParser,
} from "./sitemap-parser.js";

import type {
  ParsedSitemap,
} from "./sitemap.types.js";

export interface ResolvedSitemap {
  sitemapUrl:
    string;

  parsed:
    ParsedSitemap;

  compressed:
    boolean;

  compressedBytes:
    number;

  uncompressedBytes:
    number;
}

export interface SitemapResolverOptions {
  loader?:
    RemotePayloadLoader;

  parser?:
    SitemapParser;

  decoder?:
    SitemapDocumentDecoder;

  /**
   * Transfer/body limit before raw .gz sitemap decompression.
   */
  maxCompressedBytes?:
    number;
}

export class SitemapResolver {
  private readonly loader:
    RemotePayloadLoader;

  private readonly parser:
    SitemapParser;

  private readonly decoder:
    SitemapDocumentDecoder;

  private readonly maxCompressedBytes:
    number;

  constructor(
    options:
      SitemapResolverOptions = {},
  ) {
    this.loader =
      options.loader
      ?? new HttpRemotePayloadLoader();

    this.parser =
      options.parser
      ?? new SitemapParser();

    this.decoder =
      options.decoder
      ?? new SitemapDocumentDecoder();

    this.maxCompressedBytes =
      options.maxCompressedBytes
      ?? 10 * 1024 * 1024;
  }

  async resolve(
    sitemapUrl:
      string,

    signal?:
      AbortSignal,
  ): Promise<ResolvedSitemap | null> {
    const document =
      await this.loader
        .loadOptional(
          sitemapUrl,
          {
            maxBytes:
              this.maxCompressedBytes,

            signal,
          },
        );

    if (!document) {
      return null;
    }

    const decoded =
      await this.decoder.decode(
        document.body,
        document.resolvedUrl,
      );

    return {
      sitemapUrl:
        document.resolvedUrl,

      parsed:
        this.parser.parse(
          decoded.xml,
          document.resolvedUrl,
        ),

      compressed:
        decoded.compressed,

      compressedBytes:
        decoded.compressedBytes,

      uncompressedBytes:
        decoded.uncompressedBytes,
    };
  }
}
