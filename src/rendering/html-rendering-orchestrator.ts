import type {
  RenderingStrategy,
} from "../domain/index.js";


import {
  throwIfExecutionBudgetAborted,
} from "../limits/execution-budget-context.js";
import type {
  FetchedResource,
} from "../remote/index.js";

import type {
  BrowserHtmlRenderer,
} from "./browser-html-renderer.js";

import {
  BrowserRendererUnavailableError,
  HtmlRenderingAbortedError,
  InvalidBrowserRenderedResourceError,
  UnsupportedHtmlRenderingResourceError,
} from "./html-rendering.errors.js";

import {
  HtmlRenderingStrategyResolver,
} from "./html-rendering-strategy-resolver.js";

import type {
  HtmlRenderingContext,
  HtmlRenderingResult,
} from "./html-rendering.types.js";

function isHtmlResource(
  resource:
    FetchedResource,
): boolean {
  const resourceType =
    resource.resource
      .resourceType;

  if (
    resourceType === "html"
  ) {
    return true;
  }

  const contentType =
    resource.resource
      .contentType
      ?.toLowerCase();

  return (
    contentType
      === "text/html"
    || contentType
      === "application/xhtml+xml"
  );
}

export interface HtmlRenderingOrchestratorOptions {
  strategyResolver?:
    HtmlRenderingStrategyResolver;

  browserRenderer?:
    BrowserHtmlRenderer;
}

export class HtmlRenderingOrchestrator {
  private readonly strategyResolver:
    HtmlRenderingStrategyResolver;

  private readonly browserRenderer?:
    BrowserHtmlRenderer;

  constructor(
    options:
      HtmlRenderingOrchestratorOptions = {},
  ) {
    this.strategyResolver =
      options.strategyResolver
      ?? new HtmlRenderingStrategyResolver();

    this.browserRenderer =
      options.browserRenderer;
  }

  async render(
    httpResource:
      FetchedResource,

    strategy:
      RenderingStrategy = "auto",

    context:
      HtmlRenderingContext = {},
  ): Promise<HtmlRenderingResult> {
    this.assertHtmlResource(
      httpResource,
    );

    this.assertNotAborted(
      context.signal,
      httpResource.resource
        .resolvedUrl,
    );

    const decision =
      this.strategyResolver.decide(
        httpResource,
        strategy,
      );

    if (
      decision.resolvedStrategy
      === "http"
    ) {
      return {
        resource:
          httpResource,

        decision,
      };
    }

    const renderer =
      this.browserRenderer;

    if (!renderer) {
      throw new BrowserRendererUnavailableError(
        `Rendering strategy "${strategy}" selected browser rendering for `
        + `${httpResource.resource.resolvedUrl}, but no BrowserHtmlRenderer `
        + "is configured.",
      );
    }

    this.assertNotAborted(
      context.signal,
      httpResource.resource
        .resolvedUrl,
    );

    const rendered =
      await renderer.render(
        httpResource.resource,
        {
          signal:
            context.signal,
        },
      );

    this.assertNotAborted(
      context.signal,
      rendered.resource
        .resolvedUrl,
    );

    if (
      !isHtmlResource(
        rendered,
      )
    ) {
      throw new InvalidBrowserRenderedResourceError(
        `BrowserHtmlRenderer returned a non-HTML resource for `
        + `${httpResource.resource.resolvedUrl}.`,
      );
    }

    return {
      resource:
        rendered,

      decision,
    };
  }

  private assertHtmlResource(
    resource:
      FetchedResource,
  ): void {
    if (
      isHtmlResource(
        resource,
      )
    ) {
      return;
    }

    throw new UnsupportedHtmlRenderingResourceError(
      `HTML rendering accepts only HTML resources: `
      + resource.resource
        .resolvedUrl,
    );
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
      !signal?.aborted
    ) {
      return;
    }

    throw new HtmlRenderingAbortedError(
      url,
    );
  }
}
