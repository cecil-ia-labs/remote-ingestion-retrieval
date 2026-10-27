import {
  promisify,
} from "node:util";

import {
  gunzip,
} from "node:zlib";

import {
  SitemapDecompressionError,
  SitemapPayloadTooLargeError,
} from "./website-discovery.errors.js";

const gunzipAsync =
  promisify(
    gunzip,
  );

const GZIP_MAGIC_0 =
  0x1f;

const GZIP_MAGIC_1 =
  0x8b;

function hasGzipMagic(
  body:
    Buffer,
): boolean {
  return (
    body.byteLength >= 2
    && body[0]
      === GZIP_MAGIC_0
    && body[1]
      === GZIP_MAGIC_1
  );
}

function stripUtf8Bom(
  text:
    string,
): string {
  return text.charCodeAt(0)
    === 0xfeff
      ? text.slice(1)
      : text;
}

export interface DecodedSitemapDocument {
  xml:
    string;

  compressed:
    boolean;

  compressedBytes:
    number;

  uncompressedBytes:
    number;
}

export interface SitemapDocumentDecoderOptions {
  maxUncompressedBytes?:
    number;
}

export class SitemapDocumentDecoder {
  private readonly maxUncompressedBytes:
    number;

  constructor(
    options:
      SitemapDocumentDecoderOptions = {},
  ) {
    this.maxUncompressedBytes =
      options.maxUncompressedBytes
      ?? 50 * 1024 * 1024;
  }

  async decode(
    body:
      Buffer,

    sitemapUrl:
      string,
  ): Promise<DecodedSitemapDocument> {
    const compressed =
      hasGzipMagic(
        body,
      );

    let decoded =
      body;

    if (compressed) {
      try {
        decoded =
          await gunzipAsync(
            body,
          );
      } catch (cause) {
        throw new SitemapDecompressionError(
          sitemapUrl,
          {
            cause,
          },
        );
      }
    }

    if (
      decoded.byteLength
      > this.maxUncompressedBytes
    ) {
      throw new SitemapPayloadTooLargeError(
        sitemapUrl,
        this.maxUncompressedBytes,
        decoded.byteLength,
      );
    }

    return {
      xml:
        stripUtf8Bom(
          decoded.toString(
            "utf8",
          ),
        ),

      compressed,

      compressedBytes:
        body.byteLength,

      uncompressedBytes:
        decoded.byteLength,
    };
  }
}
