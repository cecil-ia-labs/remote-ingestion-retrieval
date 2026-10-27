import type {
  WebsiteSource,
} from "../domain/index.js";

import type {
  DiscoveredUrl,
} from "./discovered-url.js";

export interface WebsiteDiscovery {
  discover(
    source:
      WebsiteSource,

    signal?:
      AbortSignal,
  ): AsyncIterable<DiscoveredUrl>;
}
