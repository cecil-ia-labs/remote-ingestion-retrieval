export type CrawlFilterReason =
  | "accepted"
  | "include-miss"
  | "excluded";

export interface CrawlFilterDecision {
  /** Whether the URL belongs in the discovered/indexable document set. */
  accepted: boolean;

  /**
   * Whether the crawler may fetch this URL to discover descendants.
   *
   * Excluded URLs are never traversed. An include-miss may still be traversed
   * when it can lead to an included descendant.
   */
  traversalAllowed: boolean;

  reason: CrawlFilterReason;

  matchedPattern?: string;
}

export interface CrawlUrlFilter {
  evaluate(url: string): CrawlFilterDecision;
}
