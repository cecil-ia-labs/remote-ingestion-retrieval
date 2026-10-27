import type {
  WebsiteSource,
} from "../domain/index.js";

import {
  DefaultUrlCanonicalizer,
} from "./default-url-canonicalizer.js";

export function createSourceUrlCanonicalizer(
  source:
    WebsiteSource,
): DefaultUrlCanonicalizer {
  return new DefaultUrlCanonicalizer(
    source.options
      ?.crawl
      ?.canonicalization,
  );
}
