import type {
  JsonValue,
  RemoteResourceType,
} from "../domain/source.types.js";

import type {
  FetchedResource,
} from "../remote/fetched-resource.js";

export interface DocumentMetadata {
  /**
   * URL originally submitted by the caller.
   */
  requestedUrl: string;

  /**
   * Final URL after redirects during the actual download.
   */
  resolvedUrl: string;

  /**
   * Canonical document URL when discovered by a format-specific extractor.
   *
   * HTML extractors may populate this later from <link rel="canonical">.
   */
  canonicalUrl?: string;

  title?: string;

  description?: string;

  language?: string;

  /**
   * Normalized MIME type without parameters such as charset.
   */
  contentType?: string;

  /**
   * Character encoding when known by the extractor.
   */
  charset?: string;

  /**
   * Resource classification inherited from the remote layer.
   */
  resourceType: RemoteResourceType;

  etag?: string;

  lastModified?: string;

  /**
   * Time at which the remote body was fully fetched.
   */
  fetchedAt: Date;

  /**
   * Time at which extraction completed.
   */
  extractedAt: Date;

  /**
   * Size in bytes of the decoded fetched body.
   */
  byteLength: number;

  /**
   * Format-specific metadata that remains JSON serializable.
   */
  attributes?: Record<string, JsonValue>;
}

export type DocumentMetadataOverrides =
  Partial<DocumentMetadata>;

export function createDocumentMetadata(
  fetched: FetchedResource,
  overrides: DocumentMetadataOverrides = {},
): DocumentMetadata {
  return {
    requestedUrl:
      fetched.resource.requestedUrl,

    resolvedUrl:
      fetched.resource.resolvedUrl,

    contentType:
      fetched.resource.contentType,

    resourceType:
      fetched.resource.resourceType,

    etag:
      fetched.resource.etag,

    lastModified:
      fetched.resource.lastModified,

    fetchedAt:
      fetched.fetchedAt,

    extractedAt:
      new Date(),

    byteLength:
      fetched.byteLength,

    ...overrides,
  };
}
