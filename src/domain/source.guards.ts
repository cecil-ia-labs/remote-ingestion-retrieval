import type { Source } from "./source.js";
import type { RemoteSource } from "./remote-source.js";
import type { UrlSource } from "./url-source.js";
import type { WebsiteSource } from "./website-source.js";

export function isUrlSource(
  source: Source,
): source is UrlSource {
  return source.type === "url";
}

export function isWebsiteSource(
  source: Source,
): source is WebsiteSource {
  return source.type === "website";
}

export function isRemoteSource(
  source: Source,
): source is RemoteSource {
  return (
    source.type === "url"
    || source.type === "website"
  );
}
