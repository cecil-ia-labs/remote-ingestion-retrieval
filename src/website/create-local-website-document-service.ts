import {
  LocalMarkdownArtifactStore,
} from "../persistence/index.js";

import type {
  LocalMarkdownArtifactStoreOptions,
} from "../persistence/index.js";

import {
  WebsiteDocumentService,
} from "./website-document-service.js";

export interface CreateLocalWebsiteDocumentServiceOptions
  extends LocalMarkdownArtifactStoreOptions {}

export function createLocalWebsiteDocumentService(
  options:
    CreateLocalWebsiteDocumentServiceOptions,
): WebsiteDocumentService {
  return new WebsiteDocumentService({
    artifactStore:
      new LocalMarkdownArtifactStore(
        options,
      ),
  });
}
