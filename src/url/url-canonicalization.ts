import type {
  TrailingSlashPolicy,
  UrlCanonicalizationOptions,
} from "../domain/index.js";

export type UrlCanonicalizationRule =
  | "lowercase-protocol"
  | "lowercase-hostname"
  | "remove-default-port"
  | "remove-fragment"
  | "remove-tracking-parameter"
  | "sort-query-parameters"
  | "trailing-slash"
  | "host-alias"
  | "index-document";

export interface CanonicalUrlResult {
  readonly input:
    string;

  readonly url:
    string;

  readonly changed:
    boolean;

  readonly appliedRules:
    readonly UrlCanonicalizationRule[];

  readonly removedQueryParameters:
    readonly string[];
}

export interface UrlCanonicalizer {
  canonicalize(
    value:
      string | URL,

    baseUrl?:
      string | URL,
  ): CanonicalUrlResult;
}

export interface ResolvedUrlCanonicalizationOptions {
  removeFragment:
    boolean;

  sortQueryParameters:
    boolean;

  removeTrackingParameters:
    boolean;

  trackingParameterNames:
    ReadonlySet<string>;

  trackingParameterPrefixes:
    readonly string[];

  trackingParameterCaseInsensitive:
    boolean;

  trailingSlash:
    TrailingSlashPolicy;

  hostAliases:
    ReadonlyMap<string, string>;

  indexDocumentNames:
    readonly string[];
}

export function resolveUrlCanonicalizationOptions(
  options:
    UrlCanonicalizationOptions = {},
): ResolvedUrlCanonicalizationOptions {
  const caseInsensitive =
    options.trackingParameterCaseInsensitive
    ?? true;

  const normalize =
    (value: string): string =>
      caseInsensitive
        ? value.toLowerCase()
        : value;

  const trackingParameterNames =
    new Set(
      (
        options.trackingParameterNames
        ?? [
          "gclid",
          "dclid",
          "fbclid",
          "msclkid",
          "mc_cid",
          "mc_eid",
          "_ga",
          "_gl",
        ]
      ).map(
        normalize,
      ),
    );

  const trackingParameterPrefixes =
    (
      options.trackingParameterPrefixes
      ?? [
        "utm_",
      ]
    ).map(
      normalize,
    );

  const hostAliases =
    new Map<string, string>();

  for (
    const [
      from,
      to,
    ]
    of Object.entries(
      options.hostAliases
      ?? {},
    )
  ) {
    hostAliases.set(
      from
        .toLowerCase()
        .replace(
          /\.$/,
          "",
        ),
      to
        .toLowerCase()
        .replace(
          /\.$/,
          "",
        ),
    );
  }

  return {
    removeFragment:
      options.removeFragment
      ?? true,

    sortQueryParameters:
      options.sortQueryParameters
      ?? true,

    removeTrackingParameters:
      options.removeTrackingParameters
      ?? true,

    trackingParameterNames,

    trackingParameterPrefixes,

    trackingParameterCaseInsensitive:
      caseInsensitive,

    trailingSlash:
      options.trailingSlash
      ?? "preserve",

    hostAliases,

    indexDocumentNames:
      (
        options.indexDocumentNames
        ?? []
      ).map(
        (name) =>
          name.toLowerCase(),
      ),
  };
}
