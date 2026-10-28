import type {
  RemoteResource,
} from "./remote-resource.js";

import type {
  FetchedResource,
} from "./fetched-resource.js";

export interface FetchRemoteResourceOptions {
  /** Extra request headers; only sent to the initial origin, never across origin redirects. */
  headers?: Readonly<Record<string, string>>;
  /**
   * Maximum decoded body size in bytes.
   *
   * The limit is enforced both from Content-Length when available and
   * while streaming the actual response.
   */
  maxBytes?: number;

  /**
   * Socket inactivity timeout applied to each HTTP request.
   */
  timeoutMs?: number;

  /**
   * Maximum redirects followed during the actual download.
   */
  maxRedirects?: number;

  /**
   * User-Agent sent during the download.
   */
  userAgent?: string;

  /**
   * Optional cancellation signal.
   */
  signal?: AbortSignal;
}

export interface RemoteFetcher {
  fetch(
    resource: RemoteResource,
    options?: FetchRemoteResourceOptions,
  ): Promise<FetchedResource>;
}
