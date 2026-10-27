import {
  request as httpRequest,
} from "node:http";

import {
  request as httpsRequest,
} from "node:https";

import type {
  IncomingHttpHeaders,
  IncomingMessage,
} from "node:http";

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
  RemoteHttpStatusError,
  RemoteRequestError,
  RemoteRequestTimeoutError,
  TooManyRedirectsError,
} from "./remote-resource-resolver.errors.js";

import type {
  RemoteResourceResolver,
  ResolveRemoteResourceOptions,
} from "./remote-resource-resolver.js";

import type {
  RemoteResource,
} from "./remote-resource.js";

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

export interface HttpRemoteResourceResolverOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  userAgent?: string;

  safetyPolicy?: UrlSafetyPolicy;

  contentTypeDetector?: ContentTypeDetector;
}

interface ProbeResponse {
  statusCode: number;

  headers: IncomingHttpHeaders;
}

export class HttpRemoteResourceResolver
  implements RemoteResourceResolver {
  private readonly maxRedirects: number;
  private readonly timeoutMs: number;
  private readonly userAgent: string;

  private readonly safetyPolicy: UrlSafetyPolicy;
  private readonly contentTypeDetector: ContentTypeDetector;

  constructor(
    options: HttpRemoteResourceResolverOptions = {},
  ) {
    this.maxRedirects =
      options.maxRedirects ?? 5;

    this.timeoutMs =
      options.timeoutMs ?? 10_000;

    this.userAgent =
      options.userAgent
      ?? "RemoteSourceResolver/1.0";

    this.safetyPolicy =
      options.safetyPolicy
      ?? new DefaultUrlSafetyPolicy();

    this.contentTypeDetector =
      options.contentTypeDetector
      ?? new ContentTypeDetector();
  }

  async resolve(
    requestedUrl: string,
    options: ResolveRemoteResourceOptions = {},
  ): Promise<RemoteResource> {
    const maxRedirects =
      options.maxRedirects
      ?? this.maxRedirects;

    const timeoutMs =
      options.timeoutMs
      ?? this.timeoutMs;

    const userAgent =
      options.userAgent
      ?? this.userAgent;

    const redirectChain: string[] = [];

    let currentUrl = requestedUrl;

    for (
      let redirectCount = 0;
      redirectCount <= maxRedirects;
      redirectCount += 1
    ) {
      const target =
        await this.safetyPolicy.validateAndResolve(
          currentUrl,
        );

      let response =
        await this.probe(
          target,
          timeoutMs,
          userAgent,
          true,
        );

      if (
        response.statusCode === 416
      ) {
        response =
          await this.probe(
            target,
            timeoutMs,
            userAgent,
            false,
          );
      }

      if (
        REDIRECT_STATUS_CODES.has(
          response.statusCode,
        )
      ) {
        const location =
          getHttpHeader(
            response.headers,
            "location",
          );

        if (!location) {
          throw new RemoteRequestError(
            `Redirect response did not provide Location: ${target.url}`,
          );
        }

        if (
          redirectCount
          >= maxRedirects
        ) {
          throw new TooManyRedirectsError(
            `Maximum redirects exceeded (${maxRedirects}) while resolving `
            + `${requestedUrl}`,
          );
        }

        redirectChain.push(
          target.url.toString(),
        );

        currentUrl =
          new URL(
            location,
            target.url,
          ).toString();

        continue;
      }

      if (
        response.statusCode < 200
        || response.statusCode >= 300
      ) {
        throw new RemoteHttpStatusError(
          response.statusCode,
          target.url.toString(),
        );
      }

      const headers =
        normalizeHttpHeaders(
          response.headers,
        );

      const detection =
        this.contentTypeDetector.detect(
          target.url,
          headers["content-type"],
          options.resourceTypeHint,
        );

      return {
        requestedUrl,

        resolvedUrl:
          target.url.toString(),

        redirectChain,

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
    }

    throw new TooManyRedirectsError(
      `Maximum redirects exceeded while resolving ${requestedUrl}`,
    );
  }

  private probe(
    target: SafeRemoteTarget,
    timeoutMs: number,
    userAgent: string,
    useRange: boolean,
  ): Promise<ProbeResponse> {
    return new Promise(
      (resolve, reject) => {
        const url =
          target.url;

        const headers: Record<string, string> = {
          "User-Agent":
            userAgent,

          Accept:
            "text/html,application/xhtml+xml,application/pdf,"
            + "text/plain,text/markdown,text/csv,application/json,"
            + "*/*;q=0.1",

          Connection:
            "close",
        };

        if (useRange) {
          headers.Range =
            "bytes=0-0";
        }

        const requestOptions =
          createPinnedRequestOptions(
            target,
            {
              method:
                "GET",

              headers,
            },
          );

        const requestFn =
          url.protocol === "https:"
            ? httpsRequest
            : httpRequest;

        const request =
          requestFn(
            requestOptions,
            (
              response:
                IncomingMessage,
            ) => {
              const result = {
                statusCode:
                  response.statusCode ?? 0,

                headers:
                  response.headers,
              };

              response.destroy();

              resolve(result);
            },
          );

        request.setTimeout(
          timeoutMs,
          () => {
            request.destroy(
              new RemoteRequestTimeoutError(
                `Timed out after ${timeoutMs}ms while resolving ${url}`,
              ),
            );
          },
        );

        request.on(
          "error",
          (cause) => {
            if (
              cause
              instanceof RemoteRequestTimeoutError
            ) {
              reject(cause);

              return;
            }

            reject(
              new RemoteRequestError(
                `Unable to resolve remote resource: ${url}`,
                { cause },
              ),
            );
          },
        );

        request.end();
      },
    );
  }
}
