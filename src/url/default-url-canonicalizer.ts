import type {
  UrlCanonicalizationOptions,
} from "../domain/index.js";

import type {
  CanonicalUrlResult,
  ResolvedUrlCanonicalizationOptions,
  UrlCanonicalizationRule,
  UrlCanonicalizer,
} from "./url-canonicalization.js";

import {
  resolveUrlCanonicalizationOptions,
} from "./url-canonicalization.js";

import {
  UnsupportedCanonicalUrlProtocolError,
} from "./url-canonicalizer.errors.js";

function addRule(
  rules:
    UrlCanonicalizationRule[],

  rule:
    UrlCanonicalizationRule,
): void {
  if (
    !rules.includes(
      rule,
    )
  ) {
    rules.push(
      rule,
    );
  }
}

function normalizeTrackingName(
  name:
    string,

  options:
    ResolvedUrlCanonicalizationOptions,
): string {
  return options
    .trackingParameterCaseInsensitive
      ? name.toLowerCase()
      : name;
}

function isTrackingParameter(
  name:
    string,

  options:
    ResolvedUrlCanonicalizationOptions,
): boolean {
  const normalized =
    normalizeTrackingName(
      name,
      options,
    );

  if (
    options
      .trackingParameterNames
      .has(
        normalized,
      )
  ) {
    return true;
  }

  return options
    .trackingParameterPrefixes
    .some(
      (prefix) =>
        normalized.startsWith(
          prefix,
        ),
    );
}

function removeIndexDocument(
  url:
    URL,

  names:
    readonly string[],
): boolean {
  if (
    names.length
    === 0
  ) {
    return false;
  }

  const segments =
    url.pathname
      .split(
        "/",
      );

  const last =
    segments[
      segments.length - 1
    ]?.toLowerCase();

  if (
    !last
    || !names.includes(
      last,
    )
  ) {
    return false;
  }

  segments.pop();

  const parent =
    segments.join(
      "/",
    )
    || "/";

  url.pathname =
    parent.endsWith(
      "/",
    )
      ? parent
      : `${parent}/`;

  return true;
}

function applyTrailingSlashPolicy(
  url:
    URL,

  policy:
    ResolvedUrlCanonicalizationOptions[
      "trailingSlash"
    ],
): boolean {
  if (
    url.pathname
    === "/"
  ) {
    return false;
  }

  if (
    policy
    === "remove"
  ) {
    const updated =
      url.pathname.replace(
        /\/+$/,
        "",
      );

    if (
      updated
      !== url.pathname
    ) {
      url.pathname =
        updated || "/";

      return true;
    }

    return false;
  }

  if (
    policy
    === "add"
    && !url.pathname.endsWith(
      "/",
    )
  ) {
    url.pathname +=
      "/";

    return true;
  }

  return false;
}

export class DefaultUrlCanonicalizer
  implements UrlCanonicalizer {
  private readonly options:
    ResolvedUrlCanonicalizationOptions;

  constructor(
    options:
      UrlCanonicalizationOptions = {},
  ) {
    this.options =
      resolveUrlCanonicalizationOptions(
        options,
      );
  }

  canonicalize(
    value:
      string | URL,

    baseUrl?:
      string | URL,
  ): CanonicalUrlResult {
    const input =
      value instanceof URL
        ? value.toString()
        : value;

    const rules:
      UrlCanonicalizationRule[] = [];

    let url:
      URL;

    try {
      url =
        new URL(
          value instanceof URL
            ? value.toString()
            : value,
          baseUrl instanceof URL
            ? baseUrl.toString()
            : baseUrl,
        );
    } catch (cause) {
      throw new TypeError(
        `Invalid URL: ${input}`,
        {
          cause,
        },
      );
    }

    if (
      url.protocol !== "http:"
      && url.protocol !== "https:"
    ) {
      throw new UnsupportedCanonicalUrlProtocolError(
        url.protocol,
        input,
      );
    }

    /**
     * WHATWG URL already normalizes protocol/hostname casing and removes
     * default :80/:443 ports. Track those changes explicitly for diagnostics.
     */
    const rawProtocol =
      input.match(
        /^([A-Za-z][A-Za-z0-9+.-]*):/,
      )?.[1];

    if (
      rawProtocol
      && rawProtocol
        !== rawProtocol
          .toLowerCase()
    ) {
      addRule(
        rules,
        "lowercase-protocol",
      );
    }

    try {
      const parsedInput =
        new URL(
          input,
          baseUrl instanceof URL
            ? baseUrl.toString()
            : baseUrl,
        );

      const rawAuthority =
        input.match(
          /^[A-Za-z][A-Za-z0-9+.-]*:\/\/([^/?#]+)/,
        )?.[1];

      if (
        rawAuthority
        && rawAuthority
          !== rawAuthority
            .toLowerCase()
      ) {
        addRule(
          rules,
          "lowercase-hostname",
        );
      }

      if (
        (
          parsedInput.protocol
          === "http:"
          && /:80(?:$|[/?#])/.test(
            input,
          )
        )
        || (
          parsedInput.protocol
          === "https:"
          && /:443(?:$|[/?#])/.test(
            input,
          )
        )
      ) {
        addRule(
          rules,
          "remove-default-port",
        );
      }
    } catch {
      // The canonical URL construction above already validates the value.
    }

    const normalizedHostname =
      url.hostname
        .toLowerCase()
        .replace(
          /\.$/,
          "",
        );

    const alias =
      this.options
        .hostAliases
        .get(
          normalizedHostname,
        );

    if (
      alias
      && alias
        !== normalizedHostname
    ) {
      url.hostname =
        alias;

      addRule(
        rules,
        "host-alias",
      );
    } else if (
      url.hostname
      !== normalizedHostname
    ) {
      url.hostname =
        normalizedHostname;

      addRule(
        rules,
        "lowercase-hostname",
      );
    }

    if (
      this.options
        .removeFragment
      && url.hash
    ) {
      url.hash =
        "";

      addRule(
        rules,
        "remove-fragment",
      );
    }

    const removedQueryParameters:
      string[] = [];

    if (
      this.options
        .removeTrackingParameters
    ) {
      const entries =
        [
          ...url.searchParams
            .entries(),
        ];

      for (
        const [
          name,
        ]
        of entries
      ) {
        if (
          !isTrackingParameter(
            name,
            this.options,
          )
        ) {
          continue;
        }

        if (
          !removedQueryParameters
            .includes(
              name,
            )
        ) {
          removedQueryParameters.push(
            name,
          );
        }

        url.searchParams.delete(
          name,
        );
      }

      if (
        removedQueryParameters.length
        > 0
      ) {
        addRule(
          rules,
          "remove-tracking-parameter",
        );
      }
    }

    if (
      this.options
        .sortQueryParameters
      && url.search
    ) {
      const before =
        url.search;

      /**
       * URLSearchParams.sort() sorts by parameter name while preserving the
       * relative order of repeated values. This is less aggressive than
       * sorting name/value pairs and avoids changing ordered repeated params.
       */
      url.searchParams.sort();

      if (
        url.search
        !== before
      ) {
        addRule(
          rules,
          "sort-query-parameters",
        );
      }
    }

    if (
      removeIndexDocument(
        url,
        this.options
          .indexDocumentNames,
      )
    ) {
      addRule(
        rules,
        "index-document",
      );
    }

    if (
      applyTrailingSlashPolicy(
        url,
        this.options
          .trailingSlash,
      )
    ) {
      addRule(
        rules,
        "trailing-slash",
      );
    }

    const canonical =
      url.toString();

    return {
      input,

      url:
        canonical,

      changed:
        canonical
        !== input,

      appliedRules:
        Object.freeze(
          rules,
        ),

      removedQueryParameters:
        Object.freeze(
          removedQueryParameters,
        ),
    };
  }
}
