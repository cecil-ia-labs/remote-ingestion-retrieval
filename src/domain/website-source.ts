import type {
  RemoteSource,
  RemoteSourceOptions,
} from "./remote-source.js";

import type {
  UrlCanonicalizationOptions,
  WebsiteDiscoveryStrategy,
} from "./source.types.js";

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  concurrency?: number;

  sameOriginOnly?: boolean;
  includeSubdomains?: boolean;

  discoveryStrategy?: WebsiteDiscoveryStrategy;

  /**
   * URL globs evaluated after Phase 13 canonicalization.
   *
   * Path examples: /docs/**, /blog/*
   * Absolute URL examples: https://docs.example.com/**
   *
   * When present, a discovered child URL must match at least one include
   * pattern to be emitted. Ancestor pages may still be traversed when they
   * can lead to an included descendant.
   */
  include?: string[];

  /**
   * URL globs with precedence over include rules. Excluded URLs are neither
   * emitted nor fetched for descendant discovery.
   */
  exclude?: string[];

  respectRobotsTxt?: boolean;

  /**
   * URL identity policy used by sitemap discovery, crawling and WebDocument
   * identity.
   */
  canonicalization?: UrlCanonicalizationOptions;
}

export interface WebsiteSourceOptions
  extends RemoteSourceOptions {
  crawl?: CrawlOptions;
}

export interface WebsiteSource
  extends RemoteSource {
  readonly type: "website";

  options?: WebsiteSourceOptions;
}
