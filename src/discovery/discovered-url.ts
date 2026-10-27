export type DiscoveryMethod =
  | "root"
  | "robots"
  | "sitemap"
  | "crawl";

export interface DiscoveredUrl {
  url: string;

  /**
   * Original discovered representation when URL canonicalization changed it.
   */
  originalUrl?: string;

  discoveredBy:
    DiscoveryMethod;

  /**
   * Sitemap that declared this URL, when applicable.
   */
  sitemapUrl?: string;

  lastModified?: Date;

  changeFrequency?: string;

  priority?: number;

  /** Page that contained this URL when discovered through crawling. */
  discoveredFrom?: string;

  /** BFS depth. Root/seed pages are depth 0. */
  depth?: number;

  /** Anchor text captured during crawl discovery. */
  anchorText?: string;
}
