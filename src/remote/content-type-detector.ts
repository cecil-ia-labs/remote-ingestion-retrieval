import {
  extname,
} from "node:path";

import type {
  RemoteResourceType,
} from "../domain/index.js";

import type {
  RemoteResourceTypeHint,
} from "./remote-resource-resolver.js";

import type {
  ResourceTypeDetectionSource,
} from "./remote-resource.js";

export interface ResourceTypeDetectionResult {
  resourceType: RemoteResourceType;

  detectedBy: ResourceTypeDetectionSource;

  contentType?: string;
}

const EXTENSION_MAP: Record<
  string,
  RemoteResourceType
> = {
  ".html": "html",
  ".htm": "html",
  ".xhtml": "html",

  ".pdf": "pdf",

  ".txt": "text",
  ".text": "text",
  ".log": "text",

  ".md": "markdown",
  ".markdown": "markdown",
  ".mdown": "markdown",

  ".csv": "csv",

  ".json": "json",
  ".jsonl": "json",
  ".ndjson": "json",
};

export function normalizeContentType(
  contentType?: string,
): string | undefined {
  const value = contentType
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  return value || undefined;
}

function detectFromContentType(
  contentType?: string,
): RemoteResourceType | undefined {
  if (!contentType) {
    return undefined;
  }

  if (
    contentType === "text/html"
    || contentType === "application/xhtml+xml"
  ) {
    return "html";
  }

  if (contentType === "application/pdf") {
    return "pdf";
  }

  if (
    contentType === "text/markdown"
    || contentType === "text/x-markdown"
  ) {
    return "markdown";
  }

  if (
    contentType === "text/csv"
    || contentType === "application/csv"
  ) {
    return "csv";
  }

  if (
    contentType === "application/json"
    || contentType === "text/json"
    || contentType.endsWith("+json")
    || contentType === "application/x-ndjson"
  ) {
    return "json";
  }

  if (contentType === "text/plain") {
    return "text";
  }

  return undefined;
}

function detectFromUrl(
  url: URL,
): RemoteResourceType | undefined {
  const extension = extname(
    url.pathname.toLowerCase(),
  );

  return EXTENSION_MAP[extension];
}

export class ContentTypeDetector {
  detect(
    url: URL,
    rawContentType?: string,
    hint?: RemoteResourceTypeHint,
  ): ResourceTypeDetectionResult {
    const contentType =
      normalizeContentType(rawContentType);

    if (hint) {
      return {
        resourceType: hint,
        detectedBy: "hint",
        contentType,
      };
    }

    const fromContentType =
      detectFromContentType(contentType);

    if (fromContentType) {
      return {
        resourceType: fromContentType,
        detectedBy: "content-type",
        contentType,
      };
    }

    const fromUrl = detectFromUrl(url);

    if (fromUrl) {
      return {
        resourceType: fromUrl,
        detectedBy: "url-extension",
        contentType,
      };
    }

    return {
      resourceType: "auto",
      detectedBy: "unknown",
      contentType,
    };
  }
}
