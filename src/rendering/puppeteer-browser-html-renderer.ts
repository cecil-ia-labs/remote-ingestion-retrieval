import {
  TimeoutError,
} from "puppeteer";

import type {
  HTTPRequest,
  HTTPResponse,
  PuppeteerLifeCycleEvent,
} from "puppeteer";

import {
  throwIfExecutionBudgetAborted,
} from "../limits/execution-budget-context.js";

import type {
  FetchedResource,
  RemoteResource,
  SafeRemoteTarget,
  UrlSafetyPolicy,
} from "../remote/index.js";

import {
  DefaultUrlSafetyPolicy,
} from "../remote/index.js";

import type {
  BrowserHtmlRenderer,
  BrowserHtmlRendererContext,
} from "./browser-html-renderer.js";

import {
  HtmlRenderingAbortedError,
} from "./html-rendering.errors.js";

import {
  PuppeteerBrowserManager,
} from "./puppeteer-browser-manager.js";

import type {
  PuppeteerPageSessionFactory,
} from "./puppeteer-page-session.js";

import {
  PuppeteerNavigationError,
  PuppeteerNavigationHttpStatusError,
  PuppeteerRenderedResourceTooLargeError,
  PuppeteerUnsafeNavigationError,
} from "./puppeteer-renderer.errors.js";

import {
  PuppeteerRequestPolicy,
} from "./puppeteer-request-policy.js";

export interface PuppeteerBrowserHtmlRendererOptions {
  sessionFactory?:
    PuppeteerPageSessionFactory;

  requestPolicy?:
    PuppeteerRequestPolicy;

  safetyPolicy?:
    UrlSafetyPolicy;

  navigationTimeoutMs?:
    number;

  operationTimeoutMs?:
    number;

  navigationWaitUntil?:
    PuppeteerLifeCycleEvent;

  waitForNetworkIdle?:
    boolean;

  networkIdleTimeoutMs?:
    number;

  networkIdleIdleTimeMs?:
    number;

  networkIdleConcurrency?:
    number;

  /**
   * A network-idle timeout is usually caused by analytics, polling or
   * long-lived application traffic. By default it is non-fatal.
   */
  networkIdleTimeoutIsFatal?:
    boolean;

  /**
   * Optional selector that must exist before the HTML snapshot is taken.
   */
  readySelector?:
    string;

  readySelectorTimeoutMs?:
    number;

  maxRenderedBytes?:
    number;

  viewport?: {
    width: number;
    height: number;
  };
}

const DEFAULT_MAX_RENDERED_BYTES =
  50 * 1024 * 1024;

function normalizeHeaders(
  response:
    HTTPResponse | null,
): Record<string, string> {
  return response
    ?.headers()
    ?? {};
}

function parseContentLength(
  headers:
    Record<string, string>,
): number | undefined {
  const raw =
    headers[
      "content-length"
    ];

  if (!raw) {
    return undefined;
  }

  const value =
    Number(
      raw,
    );

  return (
    Number.isSafeInteger(
      value,
    )
    && value >= 0
  )
    ? value
    : undefined;
}

function normalizeContentType(
  headers:
    Record<string, string>,
): string {
  return (
    headers[
      "content-type"
    ]
      ?.split(
        ";",
        1,
      )[0]
      ?.trim()
      .toLowerCase()
    || "text/html"
  );
}

function mergeRedirectChain(
  original:
    readonly string[],

  browser:
    readonly string[],
): string[] {
  const result:
    string[] = [];

  for (
    const url
    of [
      ...original,
      ...browser,
    ]
  ) {
    if (
      result[
        result.length - 1
      ] !== url
    ) {
      result.push(
        url,
      );
    }
  }

  return result;
}

function isTimeoutError(
  cause: unknown,
): boolean {
  return (
    cause
    instanceof TimeoutError
    || (
      cause
      instanceof Error
      && cause.name
        === "TimeoutError"
    )
  );
}

export class PuppeteerBrowserHtmlRenderer
  implements BrowserHtmlRenderer {
  private readonly sessionFactory:
    PuppeteerPageSessionFactory;

  private readonly requestPolicy:
    PuppeteerRequestPolicy;

  private readonly safetyPolicy:
    UrlSafetyPolicy;

  private readonly navigationTimeoutMs:
    number;

  private readonly operationTimeoutMs:
    number;

  private readonly navigationWaitUntil:
    PuppeteerLifeCycleEvent;

  private readonly waitForNetworkIdle:
    boolean;

  private readonly networkIdleTimeoutMs:
    number;

  private readonly networkIdleIdleTimeMs:
    number;

  private readonly networkIdleConcurrency:
    number;

  private readonly networkIdleTimeoutIsFatal:
    boolean;

  private readonly readySelector?:
    string;

  private readonly readySelectorTimeoutMs:
    number;

  private readonly maxRenderedBytes:
    number;

  private readonly viewport: {
    width: number;
    height: number;
  };

  constructor(
    options:
      PuppeteerBrowserHtmlRendererOptions = {},
  ) {
    this.sessionFactory =
      options.sessionFactory
      ?? new PuppeteerBrowserManager();

    this.safetyPolicy =
      options.safetyPolicy
      ?? new DefaultUrlSafetyPolicy();

    this.requestPolicy =
      options.requestPolicy
      ?? new PuppeteerRequestPolicy({
        safetyPolicy:
          this.safetyPolicy,
      });

    this.navigationTimeoutMs =
      options.navigationTimeoutMs
      ?? 30_000;

    this.operationTimeoutMs =
      options.operationTimeoutMs
      ?? 30_000;

    this.navigationWaitUntil =
      options.navigationWaitUntil
      ?? "domcontentloaded";

    this.waitForNetworkIdle =
      options.waitForNetworkIdle
      ?? true;

    this.networkIdleTimeoutMs =
      options.networkIdleTimeoutMs
      ?? 5_000;

    this.networkIdleIdleTimeMs =
      options.networkIdleIdleTimeMs
      ?? 500;

    this.networkIdleConcurrency =
      options.networkIdleConcurrency
      ?? 0;

    this.networkIdleTimeoutIsFatal =
      options.networkIdleTimeoutIsFatal
      ?? false;

    this.readySelector =
      options.readySelector;

    this.readySelectorTimeoutMs =
      options.readySelectorTimeoutMs
      ?? 10_000;

    this.maxRenderedBytes =
      options.maxRenderedBytes
      ?? DEFAULT_MAX_RENDERED_BYTES;

    this.viewport =
      options.viewport
      ?? {
        width:
          1365,

        height:
          768,
      };
  }

  async render(
    resource:
      RemoteResource,

    context:
      BrowserHtmlRendererContext = {},
  ): Promise<FetchedResource> {
    this.assertNotAborted(
      context.signal,
      resource.resolvedUrl,
    );

    /**
     * Revalidate the entry target before handing the URL to Chrome.
     */
    await this.safetyPolicy
      .validateAndResolve(
        resource.resolvedUrl,
      );

    const session =
      await this.sessionFactory
        .create(
          context.signal,
        );

    const page =
      session.page;

    let unsafeMainNavigationUrl:
      string | undefined;

    const requestHandler =
      (
        request:
          HTTPRequest,
      ): void => {
        const mainFrame =
          page.mainFrame();

        void this.handleRequest(
          request,
          mainFrame,
        ).then(
          (
            result,
          ) => {
            if (
              result.unsafeMainNavigation
            ) {
              unsafeMainNavigationUrl =
                request.url();
            }
          },
        ).catch(
          async () => {
            if (
              request.isNavigationRequest()
              && request.frame()
                === mainFrame
            ) {
              unsafeMainNavigationUrl =
                request.url();
            }

            await request
              .abort(
                "blockedbyclient",
              )
              .catch(
                () => undefined,
              );
          },
        );
      };

    try {
      page.setDefaultNavigationTimeout(
        this.navigationTimeoutMs,
      );

      page.setDefaultTimeout(
        this.operationTimeoutMs,
      );

      await page.setViewport(
        this.viewport,
      );

      await page
        .setRequestInterception(
          true,
        );

      page.on(
        "request",
        requestHandler,
      );

      let response:
        HTTPResponse | null;

      try {
        response =
          await page.goto(
            resource.resolvedUrl,
            {
              waitUntil:
                this.navigationWaitUntil,

              timeout:
                this.navigationTimeoutMs,

              signal:
                context.signal,
            },
          );
      } catch (cause) {
        if (
          unsafeMainNavigationUrl
        ) {
          throw new PuppeteerUnsafeNavigationError(
            unsafeMainNavigationUrl,
          );
        }

        if (
          context.signal
            ?.aborted
        ) {
          throw new HtmlRenderingAbortedError(
            resource.resolvedUrl,
          );
        }

        throw new PuppeteerNavigationError(
          `Browser navigation failed: ${resource.resolvedUrl}`,
          { cause },
        );
      }

      if (
        unsafeMainNavigationUrl
      ) {
        throw new PuppeteerUnsafeNavigationError(
          unsafeMainNavigationUrl,
        );
      }

      const statusCode =
        response
          ?.status()
        ?? resource.statusCode;

      if (
        statusCode < 200
        || statusCode >= 400
      ) {
        throw new PuppeteerNavigationHttpStatusError(
          statusCode,
          page.url(),
        );
      }

      if (
        this.readySelector
      ) {
        await page
          .waitForSelector(
            this.readySelector,
            {
              timeout:
                this.readySelectorTimeoutMs,

              signal:
                context.signal,
            },
          );
      }

      if (
        this.waitForNetworkIdle
      ) {
        try {
          await page
            .waitForNetworkIdle({
              timeout:
                this.networkIdleTimeoutMs,

              idleTime:
                this.networkIdleIdleTimeMs,

              concurrency:
                this.networkIdleConcurrency,

              signal:
                context.signal,
            });
        } catch (cause) {
          if (
            context.signal
              ?.aborted
          ) {
            throw new HtmlRenderingAbortedError(
              resource.resolvedUrl,
            );
          }

          if (
            this.networkIdleTimeoutIsFatal
            || !isTimeoutError(
              cause,
            )
          ) {
            throw cause;
          }

          /**
           * Soft timeout: continue with the DOM currently rendered.
           *
           * Analytics, polling and long-lived traffic frequently prevent
           * perfect network idleness even when the useful content is ready.
           */
        }
      }

      this.assertNotAborted(
        context.signal,
        page.url(),
      );

      const html =
        await page.content();

      const body =
        Buffer.from(
          html,
          "utf8",
        );

      if (
        body.byteLength
        > this.maxRenderedBytes
      ) {
        throw new PuppeteerRenderedResourceTooLargeError(
          this.maxRenderedBytes,
          body.byteLength,
          page.url(),
        );
      }

      const finalTarget:
        SafeRemoteTarget =
          await this.safetyPolicy
            .validateAndResolve(
              page.url(),
            );

      const headers =
        normalizeHeaders(
          response,
        );

      const browserRedirects =
        response
          ?.request()
          .redirectChain()
          .map(
            (request) =>
              request.url(),
          )
        ?? [];

      const finalResource:
        RemoteResource = {
        ...resource,

        resolvedUrl:
          finalTarget.url
            .toString(),

        redirectChain:
          mergeRedirectChain(
            resource.redirectChain,
            browserRedirects,
          ),

        statusCode,

        headers,

        contentType:
          normalizeContentType(
            headers,
          ),

        contentLength:
          parseContentLength(
            headers,
          ),

        etag:
          headers.etag,

        lastModified:
          headers[
            "last-modified"
          ],

        resourceType:
          "html",

        resourceTypeDetectedBy:
          "content-type",

        /**
         * This address was validated immediately after browser rendering.
         * Unlike HttpRemoteFetcher, Puppeteer cannot pin this DNS result to
         * Chrome's already-established socket.
         */
        resolvedAddress:
          finalTarget.address,

        resolvedAddressFamily:
          finalTarget.family,

        transport:
          "browser",

        networkSafety:
          "dns-validated",
      };

      return {
        resource:
          finalResource,

        body,

        byteLength:
          body.byteLength,

        headers,

        fetchedAt:
          new Date(),
      };
    } finally {
      page.off(
        "request",
        requestHandler,
      );

      await session
        .close();
    }
  }

  private async handleRequest(
    request:
      HTTPRequest,

    mainFrame:
      ReturnType<
        HTTPRequest["frame"]
      >,
  ): Promise<{
    unsafeMainNavigation:
      boolean;
  }> {
    const decision =
      await this.requestPolicy
        .evaluate(
          request.url(),
          request.resourceType(),
        );

    const unsafeMainNavigation =
      request.isNavigationRequest()
      && request.frame()
        === mainFrame
      && decision.reason
        === "unsafe-network-target";

    try {
      if (
        decision.action
        === "abort"
      ) {
        await request.abort(
          "blockedbyclient",
        );
      } else {
        await request.continue();
      }
    } catch {
      /**
       * A request can finish/cancel while an asynchronous DNS policy check is
       * running. Interception resolution errors are therefore non-fatal here;
       * the navigation itself will report failure if the main request did not
       * complete.
       */
    }

    return {
      unsafeMainNavigation,
    };
  }

  private assertNotAborted(
    signal:
      AbortSignal | undefined,

    url:
      string,
  ): void {
    throwIfExecutionBudgetAborted(
      signal,
    );

    if (
      signal?.aborted
    ) {
      throw new HtmlRenderingAbortedError(
        url,
      );
    }
  }
}
