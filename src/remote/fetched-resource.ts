import type {
  ContentHash,
} from "../hashing/content-hash.js";

import type {
  RemoteResource,
} from "./remote-resource.js";

export interface FetchedResource {
  /**
   * Final resource metadata as observed during the actual download.
   *
   * It may differ from the Phase 1 result if the remote endpoint changed
   * redirects or response headers between resolution and fetch.
   */
  resource: RemoteResource;

  /**
   * Fully downloaded and decoded body.
   *
   * gzip, deflate and Brotli responses are transparently decompressed.
   */
  body: Buffer;

  /**
   * Size of `body` in bytes after content decoding.
   */
  byteLength: number;

  /**
   * Response headers returned by the final endpoint.
   */
  headers: Record<string, string>;

  /**
   * Original Content-Encoding header, when present.
   */
  contentEncoding?: string;

  fetchedAt: Date;

  /** SHA-256 of the decoded response body bytes. */
  contentHash?:
    ContentHash;
}
