import type {
  ContentHashTrace,
} from "../hashing/content-hash.js";

import type {
  SourceId,
} from "../domain/source.types.js";

import type {
  DocumentMetadata,
} from "../extraction/document-metadata.js";

import type {
  MarkdownArtifact,
} from "../persistence/markdown-artifact.js";

import type {
  RemoteResourceNetworkSafety,
  RemoteResourceTransport,
} from "../remote/remote-resource.js";

import type {
  UrlCanonicalizationRule,
} from "../url/url-canonicalization.js";

export type WebDocumentId =
  string;

export interface WebDocumentUrlIdentity {
  inputUrl:
    string;

  canonicalUrl:
    string;

  aliases:
    readonly string[];

  canonicalization: {
    changed:
      boolean;

    appliedRules:
      readonly UrlCanonicalizationRule[];

    removedQueryParameters:
      readonly string[];
  };
}

export interface WebDocumentDiscoveryProvenance {
  method:
    "root"
    | "robots"
    | "sitemap"
    | "crawl";

  url:
    string;

  originalUrl?:
    string;

  sitemapUrl?:
    string;

  discoveredFrom?:
    string;

  depth?:
    number;

  anchorText?:
    string;

  lastModified?:
    Date;

  changeFrequency?:
    string;

  priority?:
    number;
}

export interface WebDocumentAcquisitionProvenance {
  requestedUrl:
    string;

  resolvedUrl:
    string;

  redirectChain:
    readonly string[];

  statusCode?:
    number;

  contentType?:
    string;

  contentLength?:
    number;

  fetchedByteLength:
    number;

  etag?:
    string;

  lastModified?:
    string;

  fetchedAt:
    Date;

  extractedAt:
    Date;

  transport?:
    RemoteResourceTransport;

  networkSafety?:
    RemoteResourceNetworkSafety;

  resolvedAddress?:
    string;

  resolvedAddressFamily?:
    4 | 6;
}

export interface WebDocumentContentDescriptor {
  format:
    "markdown";

  hashAlgorithm:
    "sha256";

  hash:
    string;

  byteLength:
    number;

  characterLength:
    number;

  lineCount:
    number;

  nonEmptyLineCount:
    number;
}

export interface WebDocument {
  readonly id:
    WebDocumentId;

  readonly sourceId:
    SourceId;

  readonly url:
    string;

  readonly canonicalUrl:
    string;

  title?:
    string;

  markdown:
    string;

  contentHash:
    string;

  /** Stage-by-stage content integrity trace. Populated by WebDocumentFactory. */
  hashes?:
    ContentHashTrace;

  content:
    WebDocumentContentDescriptor;

  identity:
    WebDocumentUrlIdentity;

  discovery?:
    WebDocumentDiscoveryProvenance;

  acquisition:
    WebDocumentAcquisitionProvenance;

  metadata:
    DocumentMetadata;

  processedAt:
    Date;

  artifact?:
    MarkdownArtifact;
}
