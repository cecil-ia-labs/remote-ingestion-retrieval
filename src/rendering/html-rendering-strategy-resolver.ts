import type {
  RenderingStrategy,
} from "../domain/index.js";

import type {
  FetchedResource,
} from "../remote/index.js";

import type {
  HtmlSufficiencyAnalyzer,
} from "./html-sufficiency.types.js";

import {
  StaticHtmlSufficiencyAnalyzer,
} from "./static-html-sufficiency-analyzer.js";

import type {
  HtmlRenderingDecision,
} from "./html-rendering.types.js";

export class HtmlRenderingStrategyResolver {
  constructor(
    private readonly analyzer:
      HtmlSufficiencyAnalyzer =
        new StaticHtmlSufficiencyAnalyzer(),
  ) {}

  decide(
    resource:
      FetchedResource,

    strategy:
      RenderingStrategy = "auto",
  ): HtmlRenderingDecision {
    if (
      strategy === "http"
    ) {
      return {
        requestedStrategy:
          strategy,

        resolvedStrategy:
          "http",

        reason:
          "forced-http",
      };
    }

    if (
      strategy === "browser"
    ) {
      return {
        requestedStrategy:
          strategy,

        resolvedStrategy:
          "browser",

        reason:
          "forced-browser",
      };
    }

    const analysis =
      this.analyzer.analyze(
        resource.body,

        resource.resource
          .resolvedUrl,
      );

    return {
      requestedStrategy:
        "auto",

      resolvedStrategy:
        analysis.sufficient
          ? "http"
          : "browser",

      reason:
        analysis.sufficient
          ? "static-html-sufficient"
          : "static-html-insufficient",

      analysis,
    };
  }
}
