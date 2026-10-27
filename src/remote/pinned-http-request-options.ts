import {
  isIP,
} from "node:net";

import type {
  RequestOptions as HttpRequestOptions,
} from "node:http";

import type {
  RequestOptions as HttpsRequestOptions,
} from "node:https";

import type {
  SafeRemoteTarget,
} from "./url-safety-policy.js";

export type PinnedRequestOptions =
  HttpRequestOptions
  & HttpsRequestOptions;

export function createPinnedRequestOptions(
  target: SafeRemoteTarget,
  options: {
    method: string;
    headers: Record<string, string>;
  },
): PinnedRequestOptions {
  const url = target.url;

  const requestOptions: PinnedRequestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,

    port:
      url.port
        ? Number(url.port)
        : undefined,

    path:
      `${url.pathname}${url.search}`,

    method:
      options.method,

    headers:
      options.headers,

    /**
     * Pin the DNS answer validated by UrlSafetyPolicy to the socket.
     *
     * This prevents a second DNS lookup from connecting to an address
     * different from the one that passed SSRF validation.
     */
    lookup: (
      _hostname,
      lookupOptions,
      callback,
    ) => {
      if (
        typeof lookupOptions === "object"
        && lookupOptions.all
      ) {
        callback(null, [{
          address: target.address,
          family: target.family,
        }]);

        return;
      }

      callback(
        null,
        target.address,
        target.family,
      );
    },
  };

  if (
    url.protocol === "https:"
    && isIP(
      url.hostname.replace(
        /^\[(.*)\]$/,
        "$1",
      ),
    ) === 0
  ) {
    requestOptions.servername =
      url.hostname;
  }

  return requestOptions;
}
