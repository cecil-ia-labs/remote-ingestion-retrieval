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

export interface RemotePayloadDocument {
  requestedUrl:
    string;

  resolvedUrl:
    string;

  body:
    Buffer;

  contentType?:
    string;

  etag?:
    string;

  lastModified?:
    string;
}

export interface RemotePayloadLoadOptions {
  maxBytes?:
    number;

  timeoutMs?:
    number;

  signal?:
    AbortSignal;
}

export interface RemotePayloadLoader {
  load(
    url:
      string,

    options?:
      RemotePayloadLoadOptions,
  ): Promise<RemotePayloadDocument>;

  loadOptional(
    url:
      string,

    options?:
      RemotePayloadLoadOptions,
  ): Promise<RemotePayloadDocument | null>;
}

export interface HttpRemotePayloadLoaderOptions {
  resolver?:
    RemoteResourceResolver;

  fetcher?:
    RemoteFetcher;

  maxBytes?:
    number;

  timeoutMs?:
    number;
}

export class HttpRemotePayloadLoader
  implements RemotePayloadLoader {
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
      HttpRemotePayloadLoaderOptions = {},
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
    url:
      string,

    options:
      RemotePayloadLoadOptions = {},
  ): Promise<RemotePayloadDocument> {
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

      body:
        fetched.body,

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
    url:
      string,

    options:
      RemotePayloadLoadOptions = {},
  ): Promise<RemotePayloadDocument | null> {
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
