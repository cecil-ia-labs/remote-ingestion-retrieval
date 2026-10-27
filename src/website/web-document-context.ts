import type {
  DiscoveredUrl,
} from "../discovery/discovered-url.js";

import type {
  FetchedResource,
} from "../remote/fetched-resource.js";

import type {
  ExtractedDocument,
} from "../extraction/extracted-document.js";

export interface WebDocumentBuildContext {
  discoveredUrl?:
    DiscoveredUrl;

  fetchedResource?:
    FetchedResource;

  extractedDocument?:
    ExtractedDocument;
}

export type WebDocumentMaterializationContext =
  WebDocumentBuildContext;
