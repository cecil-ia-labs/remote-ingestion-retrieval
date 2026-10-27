export type SourceId = string;

export type SourceType =
  | "file"
  | "url"
  | "website";

export type RemoteSourceType =
  | "url"
  | "website";

export type RemoteResourceType =
  | "auto"
  | "html"
  | "website"
  | "pdf"
  | "text"
  | "markdown"
  | "csv"
  | "json";

export type RenderingStrategy =
  | "auto"
  | "http"
  | "browser";

export type WebsiteDiscoveryStrategy =
  | "auto"
  | "sitemap"
  | "crawl"
  | "sitemap-and-crawl";

export type JsonPrimitive =
  | string
  | number
  | boolean
  | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export type SourceMetadata = Record<string, JsonValue>;


export type TrailingSlashPolicy =
  | "preserve"
  | "remove"
  | "add";

export interface UrlCanonicalizationOptions {
  /**
   * Fragments never participate in HTTP resource identity and are removed by
   * default.
   */
  removeFragment?: boolean;

  /**
   * Sort query parameter names while preserving the relative order of
   * repeated values.
   */
  sortQueryParameters?: boolean;

  /**
   * Remove common analytics/campaign query parameters.
   */
  removeTrackingParameters?: boolean;

  trackingParameterNames?: readonly string[];

  trackingParameterPrefixes?: readonly string[];

  trackingParameterCaseInsensitive?: boolean;

  /**
   * Conservative default: preserve path trailing slash semantics.
   */
  trailingSlash?: TrailingSlashPolicy;

  /**
   * Explicit host equivalence only. No www/non-www assumption is made unless
   * configured here.
   */
  hostAliases?: Readonly<Record<string, string>>;

  /**
   * Optional aliases such as index.html -> directory URL.
   *
   * Empty by default because servers may treat index documents differently.
   */
  indexDocumentNames?: readonly string[];
}
