import type {
  DiscoveredUrl,
} from "../discovery/discovered-url.js";

import type {
  WebsiteSource,
} from "../domain/website-source.js";

import type {
  WebDocument,
} from "../website/web-document.js";

/**
 * Loads one discovered website URL through the acquisition/extraction/
 * normalization pipeline and returns its canonical WebDocument snapshot.
 */
export interface WebsiteDocumentMaterializer {
  materialize(
    source:
      WebsiteSource,

    discoveredUrl:
      DiscoveredUrl,

    signal?:
      AbortSignal,
  ): Promise<WebDocument>;
}
