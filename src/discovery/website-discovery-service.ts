import type {
  WebsiteDiscoveryStrategy,
  WebsiteSource,
} from "../domain/index.js";

import {
  throwIfExecutionBudgetAborted,
} from "../limits/execution-budget-context.js";

import {
  SourceCrawlFilter,
} from "../filtering/index.js";

import {
  createSourceUrlCanonicalizer,
} from "../url/index.js";

import type {
  CanonicalUrlResult,
  UrlCanonicalizer,
} from "../url/index.js";

import type {
  DiscoveredUrl,
} from "./discovered-url.js";

import {
  LinkCrawler,
} from "./link-crawler.js";

import type {
  LinkCrawlerStats,
} from "./link-crawler.types.js";

import {
  RobotsResolver,
} from "./robots-resolver.js";

import {
  SitemapResolver,
} from "./sitemap-resolver.js";

import {
  SitemapLimitError,
  WebsiteDiscoveryAbortedError,
} from "./website-discovery.errors.js";

import type {
  WebsiteDiscovery,
} from "./website-discovery.js";

import {
  createEmptyWebsiteDiscoveryStats,
} from "./website-discovery-report.js";

import type {
  WebsiteDiscoveryReport,
  WebsiteDiscoveryStats,
} from "./website-discovery-report.js";

import {
  WebsiteUrlScope,
} from "./website-url-scope.js";
import { GitHubRepositoryDiscoveryService } from "../github/github-repository-discovery.js";

export interface WebsiteDiscoveryServiceOptions {
  githubToken?: string;
  githubDiscovery?: GitHubRepositoryDiscoveryService;
  robotsResolver?:
    RobotsResolver;

  sitemapResolver?:
    SitemapResolver;

  linkCrawler?:
    LinkCrawler;

  maxSitemaps?:
    number;

  maxSitemapDepth?:
    number;

  maxUrls?:
    number;

  includeRootUrl?:
    boolean;

  fallbackSitemapPaths?:
    readonly string[];
}

interface SitemapQueueEntry {
  url:
    string;

  depth:
    number;
}

function getDiscoveryStrategy(
  source:
    WebsiteSource,
): WebsiteDiscoveryStrategy {
  return (
    source.options
      ?.crawl
      ?.discoveryStrategy
    ?? "auto"
  );
}

function usesSitemaps(
  strategy:
    WebsiteDiscoveryStrategy,
): boolean {
  return (
    strategy
    === "auto"
    || strategy
      === "sitemap"
    || strategy
      === "sitemap-and-crawl"
  );
}

function alwaysUsesCrawler(
  strategy:
    WebsiteDiscoveryStrategy,
): boolean {
  return (
    strategy
    === "crawl"
    || strategy
      === "sitemap-and-crawl"
  );
}

export class WebsiteDiscoveryService
  implements WebsiteDiscovery {
  private readonly githubDiscovery: GitHubRepositoryDiscoveryService;
  private readonly robotsResolver:
    RobotsResolver;

  private readonly sitemapResolver:
    SitemapResolver;

  private readonly linkCrawler:
    LinkCrawler;

  private readonly maxSitemaps:
    number;

  private readonly maxSitemapDepth:
    number;

  private readonly maxUrls:
    number;

  private readonly includeRootUrl:
    boolean;

  private readonly fallbackSitemapPaths:
    readonly string[];

  private lastStats:
    WebsiteDiscoveryStats =
      createEmptyWebsiteDiscoveryStats();

  constructor(
    options:
      WebsiteDiscoveryServiceOptions = {},
  ) {
    this.githubDiscovery = options.githubDiscovery ?? new GitHubRepositoryDiscoveryService({ token: options.githubToken });
    this.robotsResolver =
      options.robotsResolver
      ?? new RobotsResolver();

    this.sitemapResolver =
      options.sitemapResolver
      ?? new SitemapResolver();

    this.linkCrawler =
      options.linkCrawler
      ?? new LinkCrawler();

    this.maxSitemaps =
      options.maxSitemaps
      ?? 100;

    this.maxSitemapDepth =
      options.maxSitemapDepth
      ?? 5;

    this.maxUrls =
      options.maxUrls
      ?? 10_000;

    this.includeRootUrl =
      options.includeRootUrl
      ?? true;

    this.fallbackSitemapPaths =
      options.fallbackSitemapPaths
      ?? [
        "/sitemap.xml",
        "/sitemap.xml.gz",
        "/sitemap_index.xml",
        "/sitemap-index.xml",
      ];
  }

  get discoveryStats():
    WebsiteDiscoveryStats {
    return {
      ...this.lastStats,
    };
  }

  async *discover(
    source:
      WebsiteSource,

    signal?:
      AbortSignal,
  ): AsyncIterable<DiscoveredUrl> {
    const stats =
      createEmptyWebsiteDiscoveryStats();

    this.lastStats =
      stats;

    try {
      if (source.options?.profile === "github-repository") {
        try { yield* this.githubDiscovery.discover(source, signal); }
        finally { stats.github = this.githubDiscovery.discoverySummary; }
        return;
      }
      yield* this.discoverInternal(
        source,
        stats,
        signal,
      );
    } finally {
      this.lastStats = {
        ...stats,
      };
    }
  }

  private async *discoverInternal(
    source:
      WebsiteSource,

    stats:
      WebsiteDiscoveryStats,

    signal?:
      AbortSignal,
  ): AsyncIterable<DiscoveredUrl> {
    this.assertNotAborted(
      signal,
      source.url,
    );

    const canonicalizer =
      createSourceUrlCanonicalizer(
        source,
      );

    const scope =
      new WebsiteUrlScope(
        source,
      );

    const maxUrls =
      source.options
        ?.crawl
        ?.maxPages
      ?? this.maxUrls;

    const yielded =
      new Set<string>();

    const root =
      this.canonicalize(
        canonicalizer,
        source.url,
        stats,
      );

    const rootUrl =
      root.url;

    if (
      this.includeRootUrl
      && scope.contains(
        rootUrl,
      )
    ) {
      yielded.add(
        rootUrl,
      );

      yield {
        url:
          rootUrl,

        originalUrl:
          root.changed
            ? source.url
            : undefined,

        discoveredBy:
          "root",

        depth:
          0,
      };
    }

    if (
      yielded.size
      >= maxUrls
    ) {
      return;
    }

    const strategy =
      getDiscoveryStrategy(
        source,
      );

    const beforeSitemapCount =
      yielded.size;

    if (
      usesSitemaps(
        strategy,
      )
    ) {
      yield* this.discoverFromSitemaps(
        source,
        canonicalizer,
        yielded,
        stats,
        maxUrls,
        rootUrl,
        signal,
      );
    }

    if (
      yielded.size
      >= maxUrls
    ) {
      return;
    }

    const sitemapAddedUrls =
      yielded.size
      > beforeSitemapCount;

    const shouldCrawl =
      alwaysUsesCrawler(
        strategy,
      )
      || (
        strategy
        === "auto"
        && !sitemapAddedUrls
      );

    if (!shouldCrawl) {
      return;
    }

    const seeds =
      strategy
      === "sitemap-and-crawl"
        ? [
            ...yielded,
          ]
        : [
            rootUrl,
          ];

    const remaining =
      maxUrls
      - yielded.size;

    try {
      for await (
        const discovered
        of this.linkCrawler.crawl(
          source,
          {
            seedUrls:
              seeds,

            knownUrls:
              yielded,

            maxNewUrls:
              remaining,

            signal,
          },
        )
      ) {
        if (
          yielded.has(
            discovered.url,
          )
        ) {
          continue;
        }

        yielded.add(
          discovered.url,
        );

        yield discovered;

        if (
          yielded.size
          >= maxUrls
        ) {
          break;
        }
      }
    } finally {
      this.mergeCrawlerStats(
        stats,
        this.linkCrawler
          .crawlStats,
      );
    }
  }

  private async *discoverFromSitemaps(
    source:
      WebsiteSource,

    canonicalizer:
      UrlCanonicalizer,

    yielded:
      Set<string>,

    stats:
      WebsiteDiscoveryStats,

    maxUrls:
      number,

    rootUrl:
      string,

    signal?:
      AbortSignal,
  ): AsyncIterable<DiscoveredUrl> {
    this.assertNotAborted(
      signal,
      source.url,
    );

    const scope =
      new WebsiteUrlScope(
        source,
      );

    const filter =
      SourceCrawlFilter.fromSource(
        source,
      );

    const robots =
      await this.robotsResolver
        .resolve(
          rootUrl,
          signal,
        );

    const origin =
      new URL(
        rootUrl,
      ).origin;

    const initialSitemaps =
      robots.sitemapUrls.length
      > 0
        ? robots.sitemapUrls
        : this.fallbackSitemapPaths
            .map(
              (path) =>
                new URL(
                  path,
                  origin,
                ).toString(),
            );

    const queue:
      SitemapQueueEntry[] = [];

    for (
      const candidate
      of initialSitemaps
    ) {
      try {
        queue.push({
          url:
            this.canonicalize(
              canonicalizer,
              candidate,
              stats,
            ).url,

          depth:
            0,
        });
      } catch {
        stats.invalidSitemapEntries +=
          1;
      }
    }

    let queueIndex =
      0;

    const visitedSitemaps =
      new Set<string>();

    while (
      queueIndex
      < queue.length
      && yielded.size
        < maxUrls
    ) {
      this.assertNotAborted(
        signal,
        source.url,
      );

      const current =
        queue[
          queueIndex
        ];

      queueIndex +=
        1;

      if (!current) {
        continue;
      }

      const sitemapUrl =
        current.url;

      if (
        visitedSitemaps.has(
          sitemapUrl,
        )
      ) {
        stats.duplicateSitemapUrls +=
          1;

        continue;
      }

      if (
        visitedSitemaps.size
        >= this.maxSitemaps
      ) {
        throw new SitemapLimitError(
          `Maximum sitemap count exceeded (${this.maxSitemaps}) `
          + `while discovering ${source.url}.`,
        );
      }

      if (
        current.depth
        > this.maxSitemapDepth
      ) {
        throw new SitemapLimitError(
          `Maximum sitemap depth exceeded (${this.maxSitemapDepth}) `
          + `while discovering ${source.url}.`,
        );
      }

      visitedSitemaps.add(
        sitemapUrl,
      );

      const resolved =
        await this.sitemapResolver
          .resolve(
            sitemapUrl,
            signal,
          );

      if (!resolved) {
        continue;
      }

      stats.sitemapDocumentsProcessed +=
        1;

      if (
        resolved.compressed
      ) {
        stats.compressedSitemapsProcessed +=
          1;
      }

      stats.invalidSitemapEntries +=
        resolved.parsed
          .invalidEntryCount;

      let resolvedSitemapUrl =
        sitemapUrl;

      try {
        resolvedSitemapUrl =
          this.canonicalize(
            canonicalizer,
            resolved.sitemapUrl,
            stats,
          ).url;
      } catch {
        // Keep the requested canonical sitemap URL.
      }

      if (
        resolved.parsed.kind
        === "sitemapindex"
      ) {
        stats.sitemapIndexesProcessed +=
          1;

        for (
          const child
          of resolved.parsed
            .sitemaps
        ) {
          let canonical:
            CanonicalUrlResult;

          try {
            canonical =
              this.canonicalize(
                canonicalizer,
                child.loc,
                stats,
              );
          } catch {
            stats.invalidSitemapEntries +=
              1;

            continue;
          }

          if (
            visitedSitemaps.has(
              canonical.url,
            )
          ) {
            stats.duplicateSitemapUrls +=
              1;

            if (
              canonical.url
              !== child.loc
            ) {
              stats.canonicalAliasesCollapsed +=
                1;
            }

            continue;
          }

          queue.push({
            url:
              canonical.url,

            depth:
              current.depth
              + 1,
          });
        }

        continue;
      }

      stats.urlSetsProcessed +=
        1;

      for (
        const entry
        of resolved.parsed.urls
      ) {
        if (
          yielded.size
          >= maxUrls
        ) {
          break;
        }

        let canonical:
          CanonicalUrlResult;

        try {
          canonical =
            this.canonicalize(
              canonicalizer,
              entry.loc,
              stats,
            );
        } catch {
          stats.invalidSitemapEntries +=
            1;

          continue;
        }

        if (
          yielded.has(
            canonical.url,
          )
        ) {
          stats.duplicateDocumentUrls +=
            1;

          if (
            canonical.url
            !== entry.loc
          ) {
            stats.canonicalAliasesCollapsed +=
              1;
          }

          continue;
        }

        if (
          !scope.contains(
            canonical.url,
          )
        ) {
          stats.outOfScopeDocumentUrls +=
            1;

          continue;
        }

        const filterDecision =
          filter.evaluate(
            canonical.url,
          );

        if (
          !filterDecision.accepted
        ) {
          if (
            filterDecision.reason
            === "excluded"
          ) {
            stats.sitemapFilteredByExclude +=
              1;
          } else {
            stats.sitemapFilteredByInclude +=
              1;
          }

          continue;
        }

        yielded.add(
          canonical.url,
        );

        yield {
          url:
            canonical.url,

          originalUrl:
            canonical.changed
              ? entry.loc
              : undefined,

          discoveredBy:
            "sitemap",

          sitemapUrl:
            resolvedSitemapUrl,

          lastModified:
            entry.lastModified,

          changeFrequency:
            entry.changeFrequency,

          priority:
            entry.priority,
        };
      }
    }
  }

  async collect(
    source:
      WebsiteSource,

    signal?:
      AbortSignal,
  ): Promise<
    readonly DiscoveredUrl[]
  > {
    const result:
      DiscoveredUrl[] = [];

    for await (
      const url
      of this.discover(
        source,
        signal,
      )
    ) {
      result.push(
        url,
      );
    }

    return result;
  }

  async collectReport(
    source:
      WebsiteSource,

    signal?:
      AbortSignal,
  ): Promise<WebsiteDiscoveryReport> {
    const urls =
      await this.collect(
        source,
        signal,
      );

    return {
      urls,

      stats:
        this.discoveryStats,
    };
  }

  private canonicalize(
    canonicalizer:
      UrlCanonicalizer,

    value:
      string,

    stats:
      WebsiteDiscoveryStats,
  ): CanonicalUrlResult {
    const result =
      canonicalizer.canonicalize(
        value,
      );

    if (
      result.changed
    ) {
      stats.canonicalizedUrls +=
        1;
    }

    stats.trackingParametersRemoved +=
      result.removedQueryParameters
        .length;

    return result;
  }

  private mergeCrawlerStats(
    target:
      WebsiteDiscoveryStats,

    crawler:
      LinkCrawlerStats,
  ): void {
    target.crawlPagesAttempted =
      crawler.pagesAttempted;

    target.crawlPagesFetched =
      crawler.pagesFetched;

    target.crawlPagesFailed =
      crawler.pagesFailed;

    target.crawlPagesSkippedNonHtml =
      crawler.pagesSkippedNonHtml;

    target.crawlLinksExtracted =
      crawler.linksExtracted;

    target.crawlDuplicateLinks =
      crawler.duplicateLinks;

    target.crawlOutOfScopeLinks =
      crawler.outOfScopeLinks;

    target.crawlNofollowLinksSkipped =
      crawler.nofollowLinksSkipped;

    target.crawlInvalidLinks =
      crawler.invalidLinks;

    target.crawlUnsupportedProtocolLinks =
      crawler.unsupportedProtocolLinks;

    target.crawlMaxDepthLinksSkipped =
      crawler.maxDepthLinksSkipped;

    target.canonicalizedUrls +=
      crawler.canonicalizedUrls;

    target.canonicalAliasesCollapsed +=
      crawler.canonicalAliasesCollapsed;

    target.trackingParametersRemoved +=
      crawler.trackingParametersRemoved;

    target.crawlFilteredByInclude +=
      crawler.includeFilteredLinks;

    target.crawlFilteredByExclude +=
      crawler.excludeFilteredLinks;

    target.crawlTraversalOnlyLinks +=
      crawler.traversalOnlyLinks;

    target.crawlSchedulerBatches +=
      crawler.schedulerBatches;

    target.crawlSchedulerTasksStarted +=
      crawler.schedulerTasksStarted;

    target.crawlSchedulerTasksFulfilled +=
      crawler.schedulerTasksFulfilled;

    target.crawlSchedulerTasksRejected +=
      crawler.schedulerTasksRejected;

    target.crawlSchedulerMaxConcurrencyObserved =
      Math.max(
        target.crawlSchedulerMaxConcurrencyObserved,
        crawler.schedulerMaxConcurrencyObserved,
      );

    target.crawlSchedulerConcurrencyLimit =
      Math.max(
        target.crawlSchedulerConcurrencyLimit,
        crawler.schedulerConcurrencyLimit,
      );
  }

  private assertNotAborted(
    signal:
      AbortSignal | undefined,

    rootUrl:
      string,
  ): void {
    throwIfExecutionBudgetAborted(
      signal,
    );

    if (
      signal?.aborted
    ) {
      throw new WebsiteDiscoveryAbortedError(
        rootUrl,
      );
    }
  }
}
