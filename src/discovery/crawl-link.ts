export interface CrawlLink {
  url: string;
  text?: string;
  nofollow: boolean;
}

export interface CrawlLinkExtractionStats {
  anchorsInspected: number;
  invalidLinks: number;
  unsupportedProtocolLinks: number;
  nofollowLinks: number;
  duplicateLinks: number;
}

export interface CrawlLinkExtractionResult {
  links: readonly CrawlLink[];
  stats: CrawlLinkExtractionStats;
}
