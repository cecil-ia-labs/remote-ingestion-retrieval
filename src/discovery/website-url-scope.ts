import type {
  WebsiteSource,
} from "../domain/index.js";

import {
  createSourceUrlCanonicalizer,
} from "../url/index.js";

import type {
  UrlCanonicalizer,
} from "../url/index.js";

function isSubdomainOf(
  hostname:
    string,

  rootHostname:
    string,
): boolean {
  return (
    hostname
      === rootHostname
    || hostname.endsWith(
      `.${rootHostname}`,
    )
  );
}

export class WebsiteUrlScope {
  private readonly root:
    URL;

  private readonly canonicalizer:
    UrlCanonicalizer;

  private readonly sameOriginOnly:
    boolean;

  private readonly includeSubdomains:
    boolean;

  constructor(
    source:
      WebsiteSource,
  ) {
    this.canonicalizer =
      createSourceUrlCanonicalizer(
        source,
      );

    this.root =
      new URL(
        this.canonicalizer
          .canonicalize(
            source.url,
          ).url,
      );

    this.sameOriginOnly =
      source.options
        ?.crawl
        ?.sameOriginOnly
      ?? true;

    this.includeSubdomains =
      source.options
        ?.crawl
        ?.includeSubdomains
      ?? false;
  }

  contains(
    candidateUrl:
      string,
  ): boolean {
    let candidate:
      URL;

    try {
      candidate =
        new URL(
          this.canonicalizer
            .canonicalize(
              candidateUrl,
            ).url,
        );
    } catch {
      return false;
    }

    if (
      !this.sameOriginOnly
    ) {
      return true;
    }

    if (
      candidate.origin
      === this.root.origin
    ) {
      return true;
    }

    if (
      !this.includeSubdomains
    ) {
      return false;
    }

    return (
      candidate.protocol
      === this.root.protocol
      && (
        candidate.port
        || ""
      )
        === (
          this.root.port
          || ""
        )
      && isSubdomainOf(
        candidate.hostname
          .toLowerCase()
          .replace(
            /\.$/,
            "",
          ),
        this.root.hostname
          .toLowerCase()
          .replace(
            /\.$/,
            "",
          ),
      )
    );
  }
}
