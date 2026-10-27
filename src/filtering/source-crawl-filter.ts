import type {
  WebsiteSource,
} from "../domain/index.js";

import type {
  CrawlFilterDecision,
  CrawlUrlFilter,
} from "./crawl-filter.types.js";

import {
  UrlGlobPattern,
} from "./url-glob-pattern.js";

export class SourceCrawlFilter
  implements CrawlUrlFilter {
  private readonly includes:
    readonly UrlGlobPattern[];

  private readonly excludes:
    readonly UrlGlobPattern[];

  constructor(
    includePatterns:
      readonly string[] = [],

    excludePatterns:
      readonly string[] = [],
  ) {
    this.includes = includePatterns.map(
      (pattern) => new UrlGlobPattern(pattern),
    );

    this.excludes = excludePatterns.map(
      (pattern) => new UrlGlobPattern(pattern),
    );
  }

  static fromSource(
    source:
      WebsiteSource,
  ): SourceCrawlFilter {
    return new SourceCrawlFilter(
      source.options?.crawl?.include,
      source.options?.crawl?.exclude,
    );
  }

  evaluate(
    url:
      string,
  ): CrawlFilterDecision {
    const excluded = this.excludes.find(
      (pattern) => pattern.matches(url),
    );

    if (excluded) {
      return {
        accepted:
          false,

        traversalAllowed:
          false,

        reason:
          "excluded",

        matchedPattern:
          excluded.pattern,
      };
    }

    if (this.includes.length === 0) {
      return {
        accepted:
          true,

        traversalAllowed:
          true,

        reason:
          "accepted",
      };
    }

    const included = this.includes.find(
      (pattern) => pattern.matches(url),
    );

    if (included) {
      return {
        accepted:
          true,

        traversalAllowed:
          true,

        reason:
          "accepted",

        matchedPattern:
          included.pattern,
      };
    }

    return {
      accepted:
        false,

      traversalAllowed:
        this.includes.some(
          (pattern) => pattern.mayMatchDescendant(url),
        ),

      reason:
        "include-miss",
    };
  }
}
