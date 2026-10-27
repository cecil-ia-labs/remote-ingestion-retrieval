import type {
  WebsiteSource,
} from "../domain/index.js";

import {
  throwIfExecutionBudgetAborted,
} from "../limits/execution-budget-context.js";

import {
  SourceCrawlFilter,
} from "../filtering/index.js";

import type {
  CrawlFilterDecision,
} from "../filtering/index.js";

import {
  CrawlScheduler,
} from "../scheduling/index.js";

import type {
  CrawlScheduledTaskResult,
  CrawlSchedulerStats,
} from "../scheduling/index.js";

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
  CrawlLinkExtractor,
} from "./crawl-link-extractor.js";

import type {
  CrawlPageAcquirer,
} from "./crawl-page-acquirer.js";

import {
  DefaultCrawlPageAcquirer,
} from "./crawl-page-acquirer.js";

import {
  LinkCrawlAbortedError,
  LinkCrawlPageError,
} from "./link-crawler.errors.js";

import {
  createEmptyLinkCrawlerStats,
} from "./link-crawler.types.js";

import type {
  LinkCrawlerOptions,
  LinkCrawlerStats,
} from "./link-crawler.types.js";

import {
  WebsiteUrlScope,
} from "./website-url-scope.js";

interface CrawlQueueEntry {
  url: string;
  depth: number;
}

export interface LinkCrawlerConstructorOptions {
  acquirer?: CrawlPageAcquirer;
  linkExtractor?: CrawlLinkExtractor;
  scheduler?: CrawlScheduler;
  defaultMaxDepth?: number;
  defaultMaxPages?: number;
}

export class LinkCrawler {
  private readonly acquirer:
    CrawlPageAcquirer;

  private readonly linkExtractor:
    CrawlLinkExtractor;

  private readonly scheduler:
    CrawlScheduler;

  private readonly defaultMaxDepth:
    number;

  private readonly defaultMaxPages:
    number;

  private lastStats:
    LinkCrawlerStats =
      createEmptyLinkCrawlerStats();

  constructor(
    options: LinkCrawlerConstructorOptions = {},
  ) {
    this.acquirer =
      options.acquirer
      ?? new DefaultCrawlPageAcquirer();

    this.linkExtractor =
      options.linkExtractor
      ?? new CrawlLinkExtractor();

    this.scheduler =
      options.scheduler
      ?? new CrawlScheduler();

    this.defaultMaxDepth =
      options.defaultMaxDepth
      ?? 3;

    this.defaultMaxPages =
      options.defaultMaxPages
      ?? 100;
  }

  get crawlStats():
    LinkCrawlerStats {
    return {
      ...this.lastStats,
    };
  }

  async *crawl(
    source: WebsiteSource,
    options: LinkCrawlerOptions = {},
  ): AsyncIterable<DiscoveredUrl> {
    const stats =
      createEmptyLinkCrawlerStats();

    this.lastStats =
      stats;

    try {
      yield* this.crawlInternal(
        source,
        options,
        stats,
      );
    } finally {
      this.lastStats = {
        ...stats,
      };
    }
  }

  private async *crawlInternal(
    source: WebsiteSource,
    options: LinkCrawlerOptions,
    stats: LinkCrawlerStats,
  ): AsyncIterable<DiscoveredUrl> {
    const signal =
      options.signal;

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

    const filter =
      SourceCrawlFilter.fromSource(
        source,
      );

    const rootCanonicalUrl =
      canonicalizer.canonicalize(
        source.url,
      ).url;

    const maxDepth =
      source.options
        ?.crawl
        ?.maxDepth
      ?? this.defaultMaxDepth;

    const maxNewUrls =
      Math.max(
        0,
        options.maxNewUrls
        ?? source.options
          ?.crawl
          ?.maxPages
        ?? this.defaultMaxPages,
      );

    const concurrency =
      this.scheduler.resolveConcurrency(
        source.options
          ?.crawl
          ?.concurrency,
      );

    stats.schedulerConcurrencyLimit =
      concurrency;

    if (
      maxNewUrls === 0
    ) {
      return;
    }

    const known =
      new Set<string>();

    for (
      const value
      of options.knownUrls
      ?? []
    ) {
      try {
        known.add(
          this.canonicalize(
            canonicalizer,
            value,
            stats,
          ).url,
        );
      } catch {
        // Ignore malformed externally supplied known URLs.
      }
    }

    const seeds =
      options.seedUrls
      ?? [
        source.url,
      ];

    let currentLayer:
      CrawlQueueEntry[] = [];

    const scheduled =
      new Set<string>();

    for (
      const seed
      of seeds
    ) {
      let canonical:
        CanonicalUrlResult;

      try {
        canonical =
          this.canonicalize(
            canonicalizer,
            seed,
            stats,
          );
      } catch {
        continue;
      }

      if (
        !scope.contains(
          canonical.url,
        )
        || scheduled.has(
          canonical.url,
        )
      ) {
        continue;
      }

      if (
        canonical.url
        !== rootCanonicalUrl
      ) {
        const decision =
          filter.evaluate(
            canonical.url,
          );

        if (
          !decision.accepted
        ) {
          this.recordFilterDecision(
            decision,
            stats,
          );

          if (
            !decision.traversalAllowed
          ) {
            continue;
          }

          stats.traversalOnlyLinks +=
            1;
        }
      }

      scheduled.add(
        canonical.url,
      );

      currentLayer.push({
        url:
          canonical.url,

        depth:
          0,
      });
    }

    let emitted =
      0;

    while (
      currentLayer.length > 0
      && emitted
        < maxNewUrls
    ) {
      this.assertNotAborted(
        signal,
        source.url,
      );

      const layer =
        currentLayer.filter(
          (entry) =>
            entry.depth
            <= maxDepth,
        );

      if (
        layer.length === 0
      ) {
        break;
      }

      let results:
        readonly CrawlScheduledTaskResult<
          Awaited<
            ReturnType<
              CrawlPageAcquirer["acquire"]
            >
          >
        >[];

      try {
        results =
          await this.scheduler.runOrdered(
            layer.map(
              (entry) =>
                async () =>
                  this.acquirer.acquire(
                    source,
                    entry.url,
                    signal,
                  ),
            ),
            {
              concurrency,
              signal,
            },
          );
      } catch (cause) {
        this.mergeSchedulerStats(
          stats,
          this.scheduler.stats,
        );

        this.assertNotAborted(
          signal,
          source.url,
        );

        throw cause;
      }

      this.mergeSchedulerStats(
        stats,
        this.scheduler.stats,
      );

      stats.pagesAttempted +=
        this.scheduler.stats
          .tasksStarted;

      const nextLayer:
        CrawlQueueEntry[] = [];

      for (
        let index = 0;
        index < layer.length;
        index += 1
      ) {
        if (
          emitted
          >= maxNewUrls
        ) {
          break;
        }

        const current =
          layer[index];

        const result =
          results[index];

        if (
          !current
          || !result
        ) {
          continue;
        }

        if (
          result.status
          === "rejected"
        ) {
          this.assertNotAborted(
            signal,
            source.url,
          );

          stats.pagesFailed +=
            1;

          if (
            options.failFast
          ) {
            throw new LinkCrawlPageError(
              current.url,
              {
                cause:
                  result.reason,
              },
            );
          }

          continue;
        }

        const page =
          result.value;

        if (!page) {
          stats.pagesSkippedNonHtml +=
            1;

          continue;
        }

        stats.pagesFetched +=
          1;

        let resolvedPageUrl =
          current.url;

        try {
          resolvedPageUrl =
            this.canonicalize(
              canonicalizer,
              page.resource
                .resolvedUrl,
              stats,
            ).url;
        } catch {
          // Keep the canonical queue URL if final redirect metadata is invalid.
        }

        const extraction =
          this.linkExtractor.extract(
            page.body,
            page.resource
              .resolvedUrl,
          );

        stats.linksExtracted +=
          extraction.links.length;

        stats.nofollowLinksSkipped +=
          extraction.stats
            .nofollowLinks;

        stats.invalidLinks +=
          extraction.stats
            .invalidLinks;

        stats.unsupportedProtocolLinks +=
          extraction.stats
            .unsupportedProtocolLinks;

        stats.duplicateLinks +=
          extraction.stats
            .duplicateLinks;

        for (
          const link
          of extraction.links
        ) {
          if (
            emitted
            >= maxNewUrls
          ) {
            break;
          }

          const nextDepth =
            current.depth
            + 1;

          if (
            nextDepth
            > maxDepth
          ) {
            stats.maxDepthLinksSkipped +=
              1;

            continue;
          }

          let canonical:
            CanonicalUrlResult;

          try {
            canonical =
              this.canonicalize(
                canonicalizer,
                link.url,
                stats,
              );
          } catch {
            stats.invalidLinks +=
              1;

            continue;
          }

          if (
            !scope.contains(
              canonical.url,
            )
          ) {
            stats.outOfScopeLinks +=
              1;

            continue;
          }

          if (
            known.has(
              canonical.url,
            )
          ) {
            stats.duplicateLinks +=
              1;

            if (
              canonical.url
              !== link.url
            ) {
              stats.canonicalAliasesCollapsed +=
                1;
            }

            continue;
          }

          if (
            scheduled.has(
              canonical.url,
            )
          ) {
            stats.duplicateLinks +=
              1;

            continue;
          }

          const decision =
            filter.evaluate(
              canonical.url,
            );

          if (
            !decision.accepted
          ) {
            this.recordFilterDecision(
              decision,
              stats,
            );

            if (
              decision.traversalAllowed
            ) {
              stats.traversalOnlyLinks +=
                1;

              scheduled.add(
                canonical.url,
              );

              nextLayer.push({
                url:
                  canonical.url,

                depth:
                  nextDepth,
              });
            }

            continue;
          }

          known.add(
            canonical.url,
          );

          emitted +=
            1;

          yield {
            url:
              canonical.url,

            originalUrl:
              canonical.changed
                ? link.url
                : undefined,

            discoveredBy:
              "crawl",

            discoveredFrom:
              resolvedPageUrl,

            depth:
              nextDepth,

            anchorText:
              link.text,
          };

          scheduled.add(
            canonical.url,
          );

          nextLayer.push({
            url:
              canonical.url,

            depth:
              nextDepth,
          });
        }
      }

      currentLayer =
        nextLayer;
    }
  }

  private mergeSchedulerStats(
    target: LinkCrawlerStats,
    scheduler: CrawlSchedulerStats,
  ): void {
    target.schedulerBatches +=
      scheduler.batches;

    target.schedulerTasksStarted +=
      scheduler.tasksStarted;

    target.schedulerTasksFulfilled +=
      scheduler.tasksFulfilled;

    target.schedulerTasksRejected +=
      scheduler.tasksRejected;

    target.schedulerMaxConcurrencyObserved =
      Math.max(
        target.schedulerMaxConcurrencyObserved,
        scheduler.maxConcurrencyObserved,
      );

    target.schedulerConcurrencyLimit =
      Math.max(
        target.schedulerConcurrencyLimit,
        scheduler.concurrencyLimit,
      );
  }

  private recordFilterDecision(
    decision: CrawlFilterDecision,
    stats: LinkCrawlerStats,
  ): void {
    if (
      decision.reason
      === "excluded"
    ) {
      stats.excludeFilteredLinks +=
        1;

      return;
    }

    if (
      decision.reason
      === "include-miss"
    ) {
      stats.includeFilteredLinks +=
        1;
    }
  }

  private canonicalize(
    canonicalizer: UrlCanonicalizer,
    value: string,
    stats: LinkCrawlerStats,
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

  private assertNotAborted(
    signal: AbortSignal | undefined,
    rootUrl: string,
  ): void {
    throwIfExecutionBudgetAborted(
      signal,
    );

    if (
      signal?.aborted
    ) {
      throw new LinkCrawlAbortedError(
        rootUrl,
      );
    }
  }
}
