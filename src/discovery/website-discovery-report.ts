import type {
  DiscoveredUrl,
} from "./discovered-url.js";

export interface WebsiteDiscoveryStats {
  sitemapDocumentsProcessed:
    number;

  sitemapIndexesProcessed:
    number;

  urlSetsProcessed:
    number;

  compressedSitemapsProcessed:
    number;

  invalidSitemapEntries:
    number;

  duplicateDocumentUrls:
    number;

  outOfScopeDocumentUrls:
    number;

  duplicateSitemapUrls:
    number;

  crawlPagesAttempted: number;
  crawlPagesFetched: number;
  crawlPagesFailed: number;
  crawlPagesSkippedNonHtml: number;
  crawlLinksExtracted: number;
  crawlDuplicateLinks: number;
  crawlOutOfScopeLinks: number;
  crawlNofollowLinksSkipped: number;
  crawlInvalidLinks: number;
  crawlUnsupportedProtocolLinks: number;
  crawlMaxDepthLinksSkipped: number;

  canonicalizedUrls: number;
  canonicalAliasesCollapsed: number;
  trackingParametersRemoved: number;

  sitemapFilteredByInclude: number;
  sitemapFilteredByExclude: number;
  crawlFilteredByInclude: number;
  crawlFilteredByExclude: number;
  crawlTraversalOnlyLinks: number;

  crawlSchedulerBatches: number;
  crawlSchedulerTasksStarted: number;
  crawlSchedulerTasksFulfilled: number;
  crawlSchedulerTasksRejected: number;
  crawlSchedulerMaxConcurrencyObserved: number;
  crawlSchedulerConcurrencyLimit: number;
}

export interface WebsiteDiscoveryReport {
  urls:
    readonly DiscoveredUrl[];

  stats:
    WebsiteDiscoveryStats;
}

export function createEmptyWebsiteDiscoveryStats():
  WebsiteDiscoveryStats {
  return {
    sitemapDocumentsProcessed:
      0,

    sitemapIndexesProcessed:
      0,

    urlSetsProcessed:
      0,

    compressedSitemapsProcessed:
      0,

    invalidSitemapEntries:
      0,

    duplicateDocumentUrls:
      0,

    outOfScopeDocumentUrls:
      0,

    duplicateSitemapUrls:
      0,

    crawlPagesAttempted: 0,
    crawlPagesFetched: 0,
    crawlPagesFailed: 0,
    crawlPagesSkippedNonHtml: 0,
    crawlLinksExtracted: 0,
    crawlDuplicateLinks: 0,
    crawlOutOfScopeLinks: 0,
    crawlNofollowLinksSkipped: 0,
    crawlInvalidLinks: 0,
    crawlUnsupportedProtocolLinks: 0,
    crawlMaxDepthLinksSkipped: 0,

    canonicalizedUrls: 0,
    canonicalAliasesCollapsed: 0,
    trackingParametersRemoved: 0,

    sitemapFilteredByInclude: 0,
    sitemapFilteredByExclude: 0,
    crawlFilteredByInclude: 0,
    crawlFilteredByExclude: 0,
    crawlTraversalOnlyLinks: 0,

    crawlSchedulerBatches: 0,
    crawlSchedulerTasksStarted: 0,
    crawlSchedulerTasksFulfilled: 0,
    crawlSchedulerTasksRejected: 0,
    crawlSchedulerMaxConcurrencyObserved: 0,
    crawlSchedulerConcurrencyLimit: 0,
  };
}
