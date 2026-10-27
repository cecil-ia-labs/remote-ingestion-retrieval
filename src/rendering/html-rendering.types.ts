import type {
  RenderingStrategy,
} from "../domain/index.js";

import type {
  FetchedResource,
} from "../remote/index.js";

import type {
  HtmlSufficiencyReport,
} from "./html-sufficiency.types.js";

export type ResolvedRenderingStrategy =
  | "http"
  | "browser";

export type HtmlRenderingDecisionReason =
  | "forced-http"
  | "forced-browser"
  | "static-html-sufficient"
  | "static-html-insufficient";

export interface HtmlRenderingDecision {
  requestedStrategy:
    RenderingStrategy;

  resolvedStrategy:
    ResolvedRenderingStrategy;

  reason:
    HtmlRenderingDecisionReason;

  analysis?:
    HtmlSufficiencyReport;
}

export interface HtmlRenderingResult {
  resource:
    FetchedResource;

  decision:
    HtmlRenderingDecision;
}

export interface HtmlRenderingContext {
  signal?:
    AbortSignal;
}
