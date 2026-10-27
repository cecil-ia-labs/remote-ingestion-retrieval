import {
  createHash,
} from "node:crypto";

import type {
  WebsiteSource,
} from "../domain/website-source.js";

import {
  createContentHashTrace,
  hashText,
  hashWebDocumentSnapshot,
} from "../hashing/content-hasher.js";

import type {
  NormalizedDocument,
} from "../normalization/normalized-document.js";

import {
  createSourceUrlCanonicalizer,
} from "../url/source-url-canonicalizer.js";

import type {
  WebDocumentBuildContext,
} from "./web-document-context.js";

import type {
  WebDocument,
  WebDocumentAcquisitionProvenance,
  WebDocumentContentDescriptor,
  WebDocumentDiscoveryProvenance,
  WebDocumentId,
} from "./web-document.js";

function sha256(
  value:
    string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest(
      "hex",
    );
}

function absoluteUrl(
  value:
    string | undefined,

  baseUrl:
    string,
): string | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(
      value,
      baseUrl,
    ).toString();
  } catch {
    return undefined;
  }
}

function collectObservedAliases(
  source:
    WebsiteSource,

  normalized:
    NormalizedDocument,

  context:
    WebDocumentBuildContext,

  canonicalUrl:
    string,
): readonly string[] {
  const fetched =
    context.fetchedResource;

  const discovered =
    context.discoveredUrl;

  const values = [
    discovered?.originalUrl,
    discovered?.url,
    normalized.metadata
      .requestedUrl,
    normalized.metadata
      .resolvedUrl,
    normalized.metadata
      .canonicalUrl,
    fetched?.resource
      .requestedUrl,
    ...(
      fetched?.resource
        .redirectChain
      ?? []
    ),
    fetched?.resource
      .resolvedUrl,
  ];

  const aliases =
    new Set<string>();

  for (
    const value
    of values
  ) {
    const absolute =
      absoluteUrl(
        value,
        source.url,
      );

    if (
      !absolute
      || absolute
        === canonicalUrl
    ) {
      continue;
    }

    aliases.add(
      absolute,
    );
  }

  return Object.freeze([
    ...aliases,
  ]);
}

function createContentDescriptor(
  markdown:
    string,

  hash:
    string,
): WebDocumentContentDescriptor {
  const lines =
    markdown.length === 0
      ? []
      : markdown.split(
          "\n",
        );

  return {
    format:
      "markdown",

    hashAlgorithm:
      "sha256",

    hash,

    byteLength:
      Buffer.byteLength(
        markdown,
        "utf8",
      ),

    characterLength:
      markdown.length,

    lineCount:
      lines.length,

    nonEmptyLineCount:
      lines.filter(
        (line) =>
          line.trim()
            .length > 0,
      ).length,
  };
}

function createDiscoveryProvenance(
  context:
    WebDocumentBuildContext,
): WebDocumentDiscoveryProvenance | undefined {
  const discovered =
    context.discoveredUrl;

  if (!discovered) {
    return undefined;
  }

  return {
    method:
      discovered.discoveredBy,

    url:
      discovered.url,

    originalUrl:
      discovered.originalUrl,

    sitemapUrl:
      discovered.sitemapUrl,

    discoveredFrom:
      discovered.discoveredFrom,

    depth:
      discovered.depth,

    anchorText:
      discovered.anchorText,

    lastModified:
      discovered.lastModified,

    changeFrequency:
      discovered.changeFrequency,

    priority:
      discovered.priority,
  };
}

function createAcquisitionProvenance(
  normalized:
    NormalizedDocument,

  context:
    WebDocumentBuildContext,
): WebDocumentAcquisitionProvenance {
  const metadata =
    normalized.metadata;

  const fetched =
    context.fetchedResource;

  const resource =
    fetched?.resource;

  return {
    requestedUrl:
      resource?.requestedUrl
      ?? metadata.requestedUrl,

    resolvedUrl:
      resource?.resolvedUrl
      ?? metadata.resolvedUrl,

    redirectChain:
      Object.freeze([
        ...(
          resource?.redirectChain
          ?? []
        ),
      ]),

    statusCode:
      resource?.statusCode,

    contentType:
      resource?.contentType
      ?? metadata.contentType,

    contentLength:
      resource?.contentLength,

    fetchedByteLength:
      fetched?.byteLength
      ?? metadata.byteLength,

    etag:
      resource?.etag
      ?? metadata.etag,

    lastModified:
      resource?.lastModified
      ?? metadata.lastModified,

    fetchedAt:
      fetched?.fetchedAt
      ?? metadata.fetchedAt,

    extractedAt:
      metadata.extractedAt,

    transport:
      resource?.transport,

    networkSafety:
      resource?.networkSafety,

    resolvedAddress:
      resource?.resolvedAddress,

    resolvedAddressFamily:
      resource?.resolvedAddressFamily,
  };
}

export function createWebDocumentId(
  sourceId:
    string,

  canonicalUrl:
    string,
): WebDocumentId {
  return (
    "webdoc_"
    + sha256(
      `${sourceId}\n${canonicalUrl}`,
    ).slice(
      0,
      32,
    )
  );
}

export function createMarkdownContentHash(
  markdown:
    string,
): string {
  return hashText(
    "normalized",
    markdown,
    "markdown",
  ).value;
}

export class WebDocumentFactory {
  create(
    source:
      WebsiteSource,

    normalized:
      NormalizedDocument,

    context:
      WebDocumentBuildContext = {},
  ): WebDocument {
    const rawCanonicalUrl =
      normalized.metadata
        .canonicalUrl
      ?? normalized.metadata
        .resolvedUrl;

    const identityResult =
      createSourceUrlCanonicalizer(
        source,
      )
        .canonicalize(
          rawCanonicalUrl,
        );

    const canonicalUrl =
      identityResult.url;

    const url =
      normalized.metadata
        .resolvedUrl;

    const contentHash =
      createMarkdownContentHash(
        normalized.markdown,
      );

    const document: WebDocument = {
      id:
        createWebDocumentId(
          source.id,
          canonicalUrl,
        ),

      sourceId:
        source.id,

      url,

      canonicalUrl,

      title:
        normalized.metadata
          .title,

      markdown:
        normalized.markdown,

      contentHash,

      content:
        createContentDescriptor(
          normalized.markdown,
          contentHash,
        ),

      identity: {
        inputUrl:
          rawCanonicalUrl,

        canonicalUrl,

        aliases:
          collectObservedAliases(
            source,
            normalized,
            context,
            canonicalUrl,
          ),

        canonicalization: {
          changed:
            identityResult.changed,

          appliedRules:
            Object.freeze([
              ...identityResult
                .appliedRules,
            ]),

          removedQueryParameters:
            Object.freeze([
              ...identityResult
                .removedQueryParameters,
            ]),
        },
      },

      discovery:
        createDiscoveryProvenance(
          context,
        ),

      acquisition:
        createAcquisitionProvenance(
          normalized,
          context,
        ),

      metadata:
        normalized.metadata,

      processedAt:
        normalized.metadata
          .extractedAt,
    };

    const hashes =
      createContentHashTrace({
        fetchedResource:
          context.fetchedResource,
        extractedDocument:
          context.extractedDocument,
        normalizedDocument:
          normalized,
        webDocument:
          document,
      });

    return {
      ...document,
      hashes: {
        ...hashes,
        document:
          hashWebDocumentSnapshot(
            document,
          ),
      },
    };
  }
}
