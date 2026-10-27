import {
  hashBytes,
} from "../hashing/content-hasher.js";

import {
  request as httpRequest,
} from "node:http";

import {
  request as httpsRequest,
} from "node:https";

import {
  createBrotliDecompress,
  createGunzip,
  createInflate,
} from "node:zlib";

import type {
  IncomingHttpHeaders,
  IncomingMessage,
} from "node:http";

import type {
  Readable,
} from "node:stream";

import type {
  RemoteResourceType,
} from "../domain/index.js";

import {
  ContentTypeDetector,
} from "./content-type-detector.js";

import {
  DefaultUrlSafetyPolicy,
} from "./default-url-safety-policy.js";

import {
  extractHttpContentLength,
  getHttpHeader,
  normalizeHttpHeaders,
} from "./http-header-utils.js";

import {
  createPinnedRequestOptions,
} from "./pinned-http-request-options.js";

import {
  RemoteFetchAbortedError,
  RemoteFetchHttpStatusError,
  RemoteFetchRequestError,
  RemoteFetchTimeoutError,
  RemoteFetchTooLargeError,
  RemoteFetchTooManyRedirectsError,
  UnsupportedContentEncodingError,
} from "./remote-fetcher.errors.js";

import type {
  FetchRemoteResourceOptions,
  RemoteFetcher,
} from "./remote-fetcher.js";


import {
  isExecutionBudgetError,
  throwIfExecutionBudgetAborted,
} from "../limits/index.js";
import type {
  FetchedResource,
} from "./fetched-resource.js";

import type {
  RemoteResource,
} from "./remote-resource.js";

import type {
  RemoteResourceTypeHint,
} from "./remote-resource-resolver.js";

import type {
  SafeRemoteTarget,
  UrlSafetyPolicy,
} from "./url-safety-policy.js";

const REDIRECT_STATUS_CODES =
  new Set([
    301,
    302,
    303,
    307,
    308,
  ]);

const DEFAULT_MAX_BYTES =
  50 * 1024 * 1024;

interface DownloadResponse {
  statusCode: number;

  headers: IncomingHttpHeaders;

  body: Buffer;
}

interface RedirectResponse {
  statusCode: number;

  headers: IncomingHttpHeaders;

  location: string;
}

type FetchResponse =
  | {
      kind: "download";
      response: DownloadResponse;
    }
  | {
      kind: "redirect";
      response: RedirectResponse;
    };

export interface HttpRemoteFetcherOptions {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;

  safetyPolicy?: UrlSafetyPolicy;

  contentTypeDetector?: ContentTypeDetector;
}

export class HttpRemoteFetcher
  implements RemoteFetcher {
  private readonly maxBytes: number;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly userAgent: string;

  private readonly safetyPolicy: UrlSafetyPolicy;
  private readonly contentTypeDetector: ContentTypeDetector;

  constructor(
    options: HttpRemoteFetcherOptions = {},
  ) {
    this.maxBytes =
      options.maxBytes
      ?? DEFAULT_MAX_BYTES;

    this.timeoutMs =
      options.timeoutMs
      ?? 30_000;

    this.maxRedirects =
      options.maxRedirects
      ?? 5;

    this.userAgent =
      options.userAgent
      ?? "RemoteSourceFetcher/1.0";

    this.safetyPolicy =
      options.safetyPolicy
      ?? new DefaultUrlSafetyPolicy();

    this.contentTypeDetector =
      options.contentTypeDetector
      ?? new ContentTypeDetector();
  }

  async fetch(
    resource: RemoteResource,
    options: FetchRemoteResourceOptions = {},
  ): Promise<FetchedResource> {
    const maxBytes =
      options.maxBytes
      ?? this.maxBytes;

    const timeoutMs =
      options.timeoutMs
      ?? this.timeoutMs;

    const maxRedirects =
      options.maxRedirects
      ?? this.maxRedirects;

    const userAgent =
      options.userAgent
      ?? this.userAgent;

    this.assertNotAborted(
      options.signal,
      resource.resolvedUrl,
    );

    const newRedirects: string[] = [];

    let currentUrl =
      resource.resolvedUrl;

    for (
      let redirectCount = 0;
      redirectCount <= maxRedirects;
      redirectCount += 1
    ) {
      this.assertNotAborted(
        options.signal,
        currentUrl,
      );

      const target =
        await this.safetyPolicy.validateAndResolve(
          currentUrl,
        );

      const result =
        await this.fetchOnce(
          target,
          {
            maxBytes,
            timeoutMs,
            userAgent,
            signal: options.signal,
          },
        );

      if (result.kind === "redirect") {
        if (
          redirectCount >= maxRedirects
        ) {
          throw new RemoteFetchTooManyRedirectsError(
            `Maximum redirects exceeded (${maxRedirects}) while fetching `
            + `${resource.requestedUrl}`,
          );
        }

        newRedirects.push(
          target.url.toString(),
        );

        currentUrl =
          new URL(
            result.response.location,
            target.url,
          ).toString();

        continue;
      }

      const response =
        result.response;

      if (
        response.statusCode < 200
        || response.statusCode >= 300
      ) {
        throw new RemoteFetchHttpStatusError(
          response.statusCode,
          target.url.toString(),
        );
      }

      const headers =
        normalizeHttpHeaders(
          response.headers,
        );

      const preservedHint =
        this.getPreservedTypeHint(
          resource,
        );

      const detection =
        this.contentTypeDetector.detect(
          target.url,
          headers["content-type"],
          preservedHint,
        );

      const finalResource: RemoteResource = {
        ...resource,

        resolvedUrl:
          target.url.toString(),

        redirectChain: [
          ...resource.redirectChain,
          ...newRedirects,
        ],

        statusCode:
          response.statusCode,

        headers,

        contentType:
          detection.contentType,

        contentLength:
          extractHttpContentLength(
            response.headers,
          ),

        etag:
          headers.etag,

        lastModified:
          headers["last-modified"],

        resourceType:
          detection.resourceType,

        resourceTypeDetectedBy:
          detection.detectedBy,

        resolvedAddress:
          target.address,

        resolvedAddressFamily:
          target.family,

        transport:
          "http",

        networkSafety:
          "dns-pinned",
      };

      return {
        resource:
          finalResource,

        body:
          response.body,

        byteLength:
          response.body.byteLength,

        headers,

        contentEncoding:
          this.normalizeContentEncoding(
            headers["content-encoding"],
          ),

        fetchedAt:
          new Date(),

        contentHash:
          hashBytes(
            "raw",
            response.body,
          ),
      };
    }

    throw new RemoteFetchTooManyRedirectsError(
      `Maximum redirects exceeded while fetching ${resource.requestedUrl}`,
    );
  }

  private fetchOnce(
    target: SafeRemoteTarget,
    options: {
      maxBytes: number;
      timeoutMs: number;
      userAgent: string;
      signal?: AbortSignal;
    },
  ): Promise<FetchResponse> {
    return new Promise(
      (resolve, reject) => {
        const url =
          target.url;

        const requestOptions =
          createPinnedRequestOptions(
            target,
            {
              method: "GET",

              headers: {
                "User-Agent":
                  options.userAgent,

                Accept:
                  "text/html,application/xhtml+xml,application/pdf,"
                  + "text/plain,text/markdown,text/csv,application/json,"
                  + "*/*;q=0.1",

                "Accept-Encoding":
                  "gzip, deflate, br",

                Connection:
                  "close",
              },
            },
          );

        const requestFn =
          url.protocol === "https:"
            ? httpsRequest
            : httpRequest;

        let settled = false;

        const complete = (
          callback: () => void,
        ): void => {
          if (settled) {
            return;
          }

          settled = true;

          if (
            options.signal
            && onAbort
          ) {
            options.signal.removeEventListener(
              "abort",
              onAbort,
            );
          }

          callback();
        };

        const request =
          requestFn(
            requestOptions,
            (response) => {
              void this.handleResponse(
                response,
                target,
                options.maxBytes,
              ).then(
                (value) => {
                  complete(
                    () => resolve(value),
                  );
                },
                (error: unknown) => {
                  complete(
                    () => reject(error),
                  );
                },
              );
            },
          );

        const onAbort =
          options.signal
            ? () => {
                const error =
                  isExecutionBudgetError(
                    options.signal?.reason,
                  )
                    ? options.signal.reason
                    : new RemoteFetchAbortedError(
                        `Remote fetch aborted: ${url}`,
                      );

                request.destroy(error);

                complete(
                  () => reject(error),
                );
              }
            : undefined;

        if (options.signal) {
          options.signal.addEventListener(
            "abort",
            onAbort!,
            { once: true },
          );
        }

        request.setTimeout(
          options.timeoutMs,
          () => {
            const error =
              new RemoteFetchTimeoutError(
                `Timed out after ${options.timeoutMs}ms while fetching ${url}`,
              );

            request.destroy(error);

            complete(
              () => reject(error),
            );
          },
        );

        request.on(
          "error",
          (cause) => {
            if (
              cause
              instanceof RemoteFetchTimeoutError
              || cause
                instanceof RemoteFetchAbortedError
            ) {
              complete(
                () => reject(cause),
              );

              return;
            }

            complete(
              () => reject(
                new RemoteFetchRequestError(
                  `Unable to fetch remote resource: ${url}`,
                  { cause },
                ),
              ),
            );
          },
        );

        request.end();
      },
    );
  }

  private async handleResponse(
    response: IncomingMessage,
    target: SafeRemoteTarget,
    maxBytes: number,
  ): Promise<FetchResponse> {
    const statusCode =
      response.statusCode ?? 0;

    if (
      REDIRECT_STATUS_CODES.has(
        statusCode,
      )
    ) {
      const location =
        getHttpHeader(
          response.headers,
          "location",
        );

      response.destroy();

      if (!location) {
        throw new RemoteFetchRequestError(
          `Redirect response did not provide Location: ${target.url}`,
        );
      }

      return {
        kind: "redirect",
        response: {
          statusCode,
          headers:
            response.headers,
          location,
        },
      };
    }

    if (
      statusCode < 200
      || statusCode >= 300
    ) {
      response.destroy();

      return {
        kind: "download",
        response: {
          statusCode,
          headers:
            response.headers,
          body:
            Buffer.alloc(0),
        },
      };
    }

    const declaredLength =
      extractHttpContentLength(
        response.headers,
      );

    if (
      declaredLength !== undefined
      && declaredLength > maxBytes
    ) {
      response.destroy();

      throw new RemoteFetchTooLargeError(
        maxBytes,
        declaredLength,
        target.url.toString(),
      );
    }

    const body =
      await this.readDecodedBody(
        response,
        maxBytes,
        target.url.toString(),
      );

    return {
      kind: "download",
      response: {
        statusCode,
        headers:
          response.headers,
        body,
      },
    };
  }

  private async readDecodedBody(
    response: IncomingMessage,
    maxBytes: number,
    url: string,
  ): Promise<Buffer> {
    const contentEncoding =
      this.normalizeContentEncoding(
        getHttpHeader(
          response.headers,
          "content-encoding",
        ),
      );

    const stream =
      this.createDecodedStream(
        response,
        contentEncoding,
      );

    const chunks: Buffer[] = [];

    let totalBytes = 0;

    try {
      for await (
        const rawChunk
        of stream
      ) {
        const chunk =
          Buffer.isBuffer(rawChunk)
            ? rawChunk
            : Buffer.from(rawChunk);

        totalBytes +=
          chunk.byteLength;

        if (
          totalBytes > maxBytes
        ) {
          const error =
            new RemoteFetchTooLargeError(
              maxBytes,
              totalBytes,
              url,
            );

          response.destroy(error);

          if (stream !== response) {
            stream.destroy(error);
          }

          throw error;
        }

        chunks.push(chunk);
      }
    } catch (cause) {
      if (
        cause
        instanceof RemoteFetchTooLargeError
        || cause
          instanceof UnsupportedContentEncodingError
      ) {
        throw cause;
      }

      throw new RemoteFetchRequestError(
        `Failed while reading remote response body: ${url}`,
        { cause },
      );
    }

    return Buffer.concat(
      chunks,
      totalBytes,
    );
  }

  private createDecodedStream(
    response: IncomingMessage,
    contentEncoding?: string,
  ): Readable {
    if (
      !contentEncoding
      || contentEncoding === "identity"
    ) {
      return response;
    }

    if (
      contentEncoding === "gzip"
      || contentEncoding === "x-gzip"
    ) {
      return response.pipe(
        createGunzip(),
      );
    }

    if (
      contentEncoding === "deflate"
    ) {
      return response.pipe(
        createInflate(),
      );
    }

    if (
      contentEncoding === "br"
    ) {
      return response.pipe(
        createBrotliDecompress(),
      );
    }

    throw new UnsupportedContentEncodingError(
      `Unsupported Content-Encoding "${contentEncoding}".`,
    );
  }

  private normalizeContentEncoding(
    value?: string,
  ): string | undefined {
    const encoding =
      value
        ?.trim()
        .toLowerCase();

    if (!encoding) {
      return undefined;
    }

    if (encoding.includes(",")) {
      throw new UnsupportedContentEncodingError(
        `Multiple Content-Encoding values are not supported: ${value}`,
      );
    }

    return encoding;
  }

  private getPreservedTypeHint(
    resource: RemoteResource,
  ): RemoteResourceTypeHint | undefined {
    if (
      resource.resourceTypeDetectedBy
      !== "hint"
    ) {
      return undefined;
    }

    return this.asTypeHint(
      resource.resourceType,
    );
  }

  private asTypeHint(
    value: RemoteResourceType,
  ): RemoteResourceTypeHint | undefined {
    if (
      value === "auto"
      || value === "website"
    ) {
      return undefined;
    }

    return value;
  }

  private assertNotAborted(
    signal: AbortSignal | undefined,
    url: string,
  ): void {
    throwIfExecutionBudgetAborted(
      signal,
    );

    if (!signal?.aborted) {
      return;
    }

    throw new RemoteFetchAbortedError(
      `Remote fetch aborted: ${url}`,
    );
  }
}
