import {
  createHash,
} from "node:crypto";

import type {
  WebDocument,
} from "../website/web-document.js";

export interface DomainCatalog {
  readonly domains: readonly string[];
  readonly byDocumentId: ReadonlyMap<string, string>;
}

function urlKey(value: string): string {
  const url = new URL(value);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${path}`;
}

function topic(document: WebDocument): string {
  const heading = document.markdown.match(/^#\s+(.+)$/m)?.[1];
  const label = heading || document.title || new URL(document.canonicalUrl).pathname;
  return label.split(/\s+[|–—]\s+/, 1)[0]?.trim() || "website content";
}

function domainSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64)
    .replace(/_+$/g, "") || "website_content";
}

function nearestTopicDocument(
  document: WebDocument,
  byUrl: ReadonlyMap<string, WebDocument>,
): WebDocument {
  const url = new URL(document.canonicalUrl);
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length <= 2) {
    return document;
  }

  for (let depth = segments.length - 1; depth >= 2; depth -= 1) {
    const parentKey = `${url.origin}/${segments.slice(0, depth).join("/")}`;
    const parent = byUrl.get(parentKey);

    if (parent) {
      return parent;
    }
  }

  return document;
}

export function buildDomainCatalog(
  documents: readonly WebDocument[],
): DomainCatalog {
  const byUrl = new Map<string, WebDocument>(
    documents.map(
      (document): [string, WebDocument] => [
        urlKey(document.canonicalUrl),
        document,
      ],
    ),
  );
  const byScopeId = new Map<string, string>();
  const scopeByDomain = new Map<string, string>();
  const byDocumentId = new Map<string, string>();

  for (const document of documents) {
    const scope = nearestTopicDocument(document, byUrl);
    let domain = byScopeId.get(scope.id);

    if (!domain) {
      domain = domainSlug(topic(scope));

      if (scopeByDomain.has(domain) && scopeByDomain.get(domain) !== scope.id) {
        const suffix = createHash("sha256")
          .update(scope.canonicalUrl)
          .digest("hex")
          .slice(0, 8);
        domain = `${domain.slice(0, 55).replace(/_+$/g, "")}_${suffix}`;
      }

      byScopeId.set(scope.id, domain);
      scopeByDomain.set(domain, scope.id);
    }

    byDocumentId.set(document.id, domain);
  }

  return {
    domains: Object.freeze([...new Set(byDocumentId.values())].sort()),
    byDocumentId,
  };
}
