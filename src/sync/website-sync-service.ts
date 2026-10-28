import type {
  DiscoveredUrl,
} from "../discovery/discovered-url.js";

import type {
  WebsiteDiscovery,
} from "../discovery/website-discovery.js";

import {
  CrawlScheduler,
} from "../scheduling/crawl-scheduler.js";

import type {
  WebDocument,
} from "../website/web-document.js";

import {
  defaultObservabilityHub,
  observabilityAttributes,
} from "../observability/index.js";

import type {
  ObservabilityHub,
} from "../observability/index.js";

import {
  describeSourceError,
} from "../errors/source-error-classifier.js";

import {
  consumeExecutionBudget,
  ExecutionBudgetTracker,
  isExecutionBudgetError,
  runWithExecutionBudget,
} from "../limits/index.js";

import type {
  IncrementalSyncStateStore,
} from "./incremental-sync-state-store.js";

import type {
  IncrementalVectorSyncService,
} from "./incremental-vector-sync-service.js";

import {
  InvalidPipelineRevisionError,
} from "./incremental-sync.errors.js";

import type {
  WebsiteDocumentMaterializer,
} from "./website-document-materializer.js";

import {
  WebsiteSyncAbortedError,
  WebsiteSyncDocumentCollisionError,
  WebsiteSyncMaterializationError,
  WebsiteSyncSourceMismatchError,
} from "./website-sync.errors.js";

import {
  WebsiteSyncPlanner,
} from "./website-sync-planner.js";

import type {
  WebsiteSyncMaterializationFailure,
  WebsiteSyncRequest,
  WebsiteSyncResult,
} from "./website-sync.types.js";

export interface WebsiteSyncServiceOptions {
  readonly discovery:
    WebsiteDiscovery;

  readonly materializer:
    WebsiteDocumentMaterializer;

  readonly stateStore:
    IncrementalSyncStateStore;

  readonly vectorSync:
    IncrementalVectorSyncService;

  readonly planner?:
    WebsiteSyncPlanner;

  readonly scheduler?:
    CrawlScheduler;

  readonly observability?:
    ObservabilityHub;
}

function assertNotAborted(
  signal:
    AbortSignal | undefined,
): void {
  if (
    signal?.aborted
  ) {
    if (
      signal.reason
      instanceof Error
    ) {
      throw signal.reason;
    }

    throw new WebsiteSyncAbortedError();
  }
}

function toFailure(
  discovered:
    DiscoveredUrl,

  reason:
    unknown,
): WebsiteSyncMaterializationFailure {
  const error =
    describeSourceError(
      reason,
      {
        includeStack:
          false,
      },
    );

  return {
    discoveredUrl:
      discovered.url,
    discoveredBy:
      discovered.discoveredBy,
    errorName:
      error.name,
    message:
      error.message,
    error,
  };
}

export class WebsiteSyncService {
  private readonly discovery:
    WebsiteDiscovery;

  private readonly materializer:
    WebsiteDocumentMaterializer;

  private readonly stateStore:
    IncrementalSyncStateStore;

  private readonly vectorSync:
    IncrementalVectorSyncService;

  private readonly planner:
    WebsiteSyncPlanner;

  private readonly scheduler:
    CrawlScheduler;

  private readonly observability:
    ObservabilityHub;

  constructor(
    options:
      WebsiteSyncServiceOptions,
  ) {
    this.discovery =
      options.discovery;

    this.materializer =
      options.materializer;

    this.stateStore =
      options.stateStore;

    this.vectorSync =
      options.vectorSync;

    this.planner =
      options.planner
      ?? new WebsiteSyncPlanner();

    this.scheduler =
      options.scheduler
      ?? new CrawlScheduler();

    this.observability =
      options.observability
      ?? defaultObservabilityHub;
  }

  async sync(
    request:
      WebsiteSyncRequest,
  ): Promise<WebsiteSyncResult> {
    const runId =
      request.observability
        ?.runId
      ?? this.observability
        .createRunId();

    const budget =
      new ExecutionBudgetTracker({
        limits:
          request.limits,
      });

    const effectiveRequest:
      WebsiteSyncRequest = {
      ...request,
      signal:
        budget.signalWith(
          request.signal,
        ),
    };

    try {
      return await runWithExecutionBudget(
        budget,
        () => this.observability.run(
          "website.sync",
          {
            runId,
            attributes:
              observabilityAttributes({
                ...request.observability
                  ?.attributes,
                sourceId:
                  request.source.id,
                sourceType:
                  request.source.type,
                sourceUrl:
                  request.source.url,
                namespace:
                  request.namespace,
                pipelineRevision:
                  request.pipelineRevision,
                failurePolicy:
                  request.failurePolicy
                  ?? "abort",
                executionLimitsConfigured:
                  Object.keys(
                    request.limits
                    ?? {},
                  ).length,
              }),
          },
          async () => {
            const result =
              await this.syncWithinRun(
                effectiveRequest,
              );

            const snapshot =
              budget.snapshot();

            await this.observability.metric(
              "execution.elapsed_ms",
              snapshot.elapsedMs,
              { unit: "ms" },
            );

            for (
              const [
                name,
                value,
              ]
              of Object.entries(
                snapshot.consumed,
              )
            ) {
              await this.observability.metric(
                `execution.${name}`,
                value,
                {
                  unit:
                    name.toLowerCase()
                      .includes(
                        "bytes",
                      )
                      ? "bytes"
                      : "count",
                },
              );
            }

            await this.observability.event(
              "execution.budget.summary",
              observabilityAttributes({
                elapsedMs:
                  snapshot.elapsedMs,
                limitsConfigured:
                  Object.keys(
                    snapshot.limits,
                  ).length,
              }),
            );

            return {
              ...result,
              observabilityRunId:
                runId,
              budget:
                snapshot,
            };
          },
        ),
      );
    } finally {
      budget.close();
    }
  }

  private async syncWithinRun(
    request:
      WebsiteSyncRequest,
  ): Promise<
    Omit<
      WebsiteSyncResult,
      "observabilityRunId" | "budget"
    >
  > {
    assertNotAborted(
      request.signal,
    );

    if (
      request.pipelineRevision.trim()
        .length === 0
    ) {
      throw new InvalidPipelineRevisionError();
    }

    const discovered =
      await this.observability.stage(
        "website.discovery",
        {},
        async () => {
          const items:
            DiscoveredUrl[] = [];

          for await (
            const item
            of this.discovery.discover(
              request.source,
              request.signal,
            )
          ) {
            assertNotAborted(
              request.signal,
            );

            consumeExecutionBudget(
              "discoveredUrls",
              1,
              {
                stage:
                  "discover",
                url:
                  item.url,
              },
            );

            items.push(
              item,
            );
          }

          await this.observability.metric(
            "website.discovered_urls",
            items.length,
            {
              unit:
                "count",
            },
          );

          return items;
        },
      );

    const tasks =
      discovered.map(
        (item) =>
          async (
            signal?:
              AbortSignal,
          ) => {
            consumeExecutionBudget(
              "materializationAttempts",
              1,
              {
                stage:
                  "website-sync",
                url:
                  item.url,
              },
            );

            return this.materializer.materialize(
              request.source,
              item,
              signal,
            );
          },
      );

    const results =
      await this.observability.stage(
        "website.materialization",
        {
          attributes:
            observabilityAttributes({
              documents:
                discovered.length,
              concurrency:
                request.materializationConcurrency
                ?? request.source.options
                  ?.crawl
                  ?.concurrency,
            }),
        },
        () => this.scheduler.runOrdered(
          tasks,
          {
            concurrency:
              request.materializationConcurrency
              ?? request.source.options
                ?.crawl
                ?.concurrency,
            signal:
              request.signal,
          },
        ),
      );

    assertNotAborted(
      request.signal,
    );

    const failures:
      WebsiteSyncMaterializationFailure[] = [];

    const documents:
      WebDocument[] = [];

    let duplicateDocumentsCollapsed =
      0;

    const byId =
      new Map<
        string,
        WebDocument
      >();

    for (
      let index = 0;
      index < results.length;
      index += 1
    ) {
      const result =
        results[index];

      const discoveredUrl =
        discovered[index];

      if (
        !result
        || !discoveredUrl
      ) {
        continue;
      }

      if (
        result.status
        === "rejected"
      ) {
        if (
          isExecutionBudgetError(
            result.reason,
          )
        ) {
          throw result.reason;
        }

        consumeExecutionBudget(
          "failures",
          1,
          {
            stage:
              "website-sync",
            url:
              discoveredUrl.url,
          },
        );

        failures.push(
          toFailure(
            discoveredUrl,
            result.reason,
          ),
        );

        continue;
      }

      consumeExecutionBudget(
        "materializedDocuments",
        1,
        {
          stage:
            "website-sync",
          url:
            discoveredUrl.url,
        },
      );

      if (
        result.value.sourceId
        !== request.source.id
      ) {
        throw new WebsiteSyncSourceMismatchError(
          result.value.id,
          request.source.id,
          result.value.sourceId,
        );
      }

      const existing =
        byId.get(
          result.value.id,
        );

      if (existing) {
        if (
          existing.contentHash
          !== result.value.contentHash
        ) {
          throw new WebsiteSyncDocumentCollisionError(
            result.value.id,
            existing.canonicalUrl,
            result.value.canonicalUrl,
          );
        }

        duplicateDocumentsCollapsed +=
          1;

        continue;
      }

      byId.set(
        result.value.id,
        result.value,
      );

      documents.push(
        result.value,
      );
    }

    await this.observability.metric(
      "website.materialization_attempts",
      results.length,
      { unit: "count" },
    );

    const failurePolicy =
      request.failurePolicy
      ?? "abort";

    if (
      failures.length > 0
      && failurePolicy
        === "abort"
    ) {
      throw new WebsiteSyncMaterializationError(
        Object.freeze([
          ...failures,
        ]),
      );
    }

    const snapshotComplete =
      failures.length === 0
      && (request.source.options?.profile === "github-repository"
        ? discovered.every((item) => item.github?.snapshotComplete === true)
        : discovered.length < (request.source.options?.crawl?.maxPages ?? 10_000));

    const previous =
      await this.observability.stage(
        "sync.state.load",
        {},
        () => this.stateStore.load(
          {
            sourceId:
              request.source.id,
            namespace:
              request.namespace,
          },
          request.signal,
        ),
      );

    assertNotAborted(
      request.signal,
    );

    const plan =
      await this.observability.stage(
        "website.reconciliation",
        {},
        async () => {
          const value =
            this.planner.plan({
              documents,
              previous,
              pipelineRevision:
                request.pipelineRevision,
              snapshotComplete,
            });

          await this.observability.metric(
            "website.documents.added",
            value.stats.added,
            { unit: "count" },
          );

          await this.observability.metric(
            "website.documents.changed",
            value.stats.changed,
            { unit: "count" },
          );

          await this.observability.metric(
            "website.documents.unchanged",
            value.stats.unchanged,
            { unit: "count" },
          );

          await this.observability.metric(
            "website.documents.removed",
            value.stats.removed,
            { unit: "count" },
          );

          return value;
        },
      );

    const downstreamMode =
      snapshotComplete
        ? "full"
        : "partial";

    const vectorSync =
      await this.observability.stage(
        "sync.vector",
        {
          attributes:
            observabilityAttributes({
              mode:
                downstreamMode,
              documents:
                documents.length,
            }),
        },
        () => this.vectorSync.sync({
          sourceId:
            request.source.id,
          documents,
          pipelineRevision:
            request.pipelineRevision,
          mode:
            downstreamMode,
          namespace:
            request.namespace,
          signal:
            request.signal,
        }),
      );

    const schedulerStats =
      this.scheduler.stats;

    await this.observability.metric(
      "website.materialized_documents",
      documents.length,
      { unit: "count" },
    );

    await this.observability.metric(
      "website.materialization_failures",
      failures.length,
      { unit: "count" },
    );

    await this.observability.metric(
      "website.duplicate_documents_collapsed",
      duplicateDocumentsCollapsed,
      { unit: "count" },
    );

    await this.observability.metric(
      "website.materialization_max_concurrency",
      schedulerStats.maxConcurrencyObserved,
      { unit: "count" },
    );

    await this.observability.event(
      "website.sync.summary",
      observabilityAttributes({
        snapshotComplete,
        downstreamMode,
        added:
          plan.stats.added,
        changed:
          plan.stats.changed,
        unchanged:
          plan.stats.unchanged,
        removed:
          plan.stats.removed,
      }),
    );

    return {
      sourceId:
        request.source.id,
      namespace:
        request.namespace,
      pipelineRevision:
        request.pipelineRevision,
      discovered:
        Object.freeze([
          ...discovered,
        ]),
      failures:
        Object.freeze([
          ...failures,
        ]),
      plan,
      vectorSync,
      stats: {
        discoveredUrls:
          discovered.length,
        materializationAttempts:
          results.length,
        materializedDocuments:
          documents.length,
        materializationFailures:
          failures.length,
        duplicateDocumentsCollapsed,
        schedulerMaxConcurrencyObserved:
          schedulerStats.maxConcurrencyObserved,
        snapshotComplete,
        downstreamMode,
        added:
          plan.stats.added,
        changed:
          plan.stats.changed,
        unchanged:
          plan.stats.unchanged,
        removed:
          plan.stats.removed,
      },
    };
  }
}
