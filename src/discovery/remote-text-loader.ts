import {
  HttpRemoteFetcher,
  HttpRemoteResourceResolver,
  RemoteFetchHttpStatusError,
  RemoteHttpStatusError,
} from "../remote/index.js";

import type {
  RemoteFetcher,
  RemoteResourceResolver,
} from "../remote/index.js";

export interface RemoteTextDocument {
  requestedUrl: string;

  resolvedUrl: string;

  text: string;

  contentType?: string;

  etag?: string;

  lastModified?: string;
}

export interface RemoteTextLoadOptions {
  maxBytes?: number;

  timeoutMs?: number;

  signal?: AbortSignal;
}

export interface RemoteTextLoader {
  load(
    url: string,
    options?: RemoteTextLoadOptions,
  ): Promise<RemoteTextDocument>;

  loadOptional(
    url: string,
    options?: RemoteTextLoadOptions,
  ): Promise<RemoteTextDocument | null>;
}

export interface HttpRemoteTextLoaderOptions {
  resolver?: RemoteResourceResolver;

  fetcher?: RemoteFetcher;

  maxBytes?: number;

  timeoutMs?: number;
}

function decodeUtf8(
  body: Buffer,
): string {
  const text =
    body.toString(
      "utf8",
    );

  return text.charCodeAt(0)
    === 0xfeff
      ? text.slice(1)
      : text;
}

export class HttpRemoteTextLoader
  implements RemoteTextLoader {
  private readonly resolver:
    RemoteResourceResolver;

  private readonly fetcher:
    RemoteFetcher;

  private readonly maxBytes:
    number;

  private readonly timeoutMs:
    number;

  constructor(
    options:
      HttpRemoteTextLoaderOptions = {},
  ) {
    this.resolver =
      options.resolver
      ?? new HttpRemoteResourceResolver();

    this.fetcher =
      options.fetcher
      ?? new HttpRemoteFetcher();

    this.maxBytes =
      options.maxBytes
      ?? 10 * 1024 * 1024;

    this.timeoutMs =
      options.timeoutMs
      ?? 15_000;
  }

  async load(
    url: string,
    options:
      RemoteTextLoadOptions = {},
  ): Promise<RemoteTextDocument> {
    const timeoutMs =
      options.timeoutMs
      ?? this.timeoutMs;

    const resource =
      await this.resolver.resolve(
        url,
        {
          timeoutMs,
        },
      );

    const fetched =
      await this.fetcher.fetch(
        resource,
        {
          maxBytes:
            options.maxBytes
            ?? this.maxBytes,

          timeoutMs,

          signal:
            options.signal,
        },
      );

    return {
      requestedUrl:
        fetched.resource
          .requestedUrl,

      resolvedUrl:
        fetched.resource
          .resolvedUrl,

      text:
        decodeUtf8(
          fetched.body,
        ),

      contentType:
        fetched.resource
          .contentType,

      etag:
        fetched.resource
          .etag,

      lastModified:
        fetched.resource
          .lastModified,
    };
  }

  async loadOptional(
    url: string,
    options:
      RemoteTextLoadOptions = {},
  ): Promise<RemoteTextDocument | null> {
    try {
      return await this.load(
        url,
        options,
      );
    } catch (cause) {
      if (
        (
          cause
          instanceof RemoteHttpStatusError
          || cause
            instanceof RemoteFetchHttpStatusError
        )
        && cause.statusCode === 404
      ) {
        return null;
      }

      throw cause;
    }
  }
}
