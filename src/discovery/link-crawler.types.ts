export interface LinkCrawlerStats {
  pagesAttempted: number;
  pagesFetched: number;
  pagesFailed: number;
  pagesSkippedNonHtml: number;
  linksExtracted: number;
  duplicateLinks: number;
  outOfScopeLinks: number;
  nofollowLinksSkipped: number;
  invalidLinks: number;
  unsupportedProtocolLinks: number;
  maxDepthLinksSkipped: number;

  canonicalizedUrls: number;
  canonicalAliasesCollapsed: number;
  trackingParametersRemoved: number;

  includeFilteredLinks: number;
  excludeFilteredLinks: number;
  traversalOnlyLinks: number;

  schedulerBatches: number;
  schedulerTasksStarted: number;
  schedulerTasksFulfilled: number;
  schedulerTasksRejected: number;
  schedulerMaxConcurrencyObserved: number;
  schedulerConcurrencyLimit: number;
}

export interface LinkCrawlerOptions {
  seedUrls?: readonly string[];
  knownUrls?: Iterable<string>;
  maxNewUrls?: number;
  signal?: AbortSignal;
  failFast?: boolean;
}

export function createEmptyLinkCrawlerStats():
  LinkCrawlerStats {
  return {
    pagesAttempted: 0,
    pagesFetched: 0,
    pagesFailed: 0,
    pagesSkippedNonHtml: 0,
    linksExtracted: 0,
    duplicateLinks: 0,
    outOfScopeLinks: 0,
    nofollowLinksSkipped: 0,
    invalidLinks: 0,
    unsupportedProtocolLinks: 0,
    maxDepthLinksSkipped: 0,

    canonicalizedUrls: 0,
    canonicalAliasesCollapsed: 0,
    trackingParametersRemoved: 0,

    includeFilteredLinks: 0,
    excludeFilteredLinks: 0,
    traversalOnlyLinks: 0,

    schedulerBatches: 0,
    schedulerTasksStarted: 0,
    schedulerTasksFulfilled: 0,
    schedulerTasksRejected: 0,
    schedulerMaxConcurrencyObserved: 0,
    schedulerConcurrencyLimit: 0,
  };
}
