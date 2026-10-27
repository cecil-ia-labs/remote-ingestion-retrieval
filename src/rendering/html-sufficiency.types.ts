export type HtmlSufficiencyReason =
  | "semantic-content"
  | "body-text"
  | "content-structure"
  | "empty-body"
  | "low-text"
  | "app-shell"
  | "javascript-required-hint"
  | "script-heavy-low-text";

export interface HtmlSufficiencyMetrics {
  bodyTextLength: number;

  semanticTextLength: number;

  headingCount: number;

  paragraphCount: number;

  listItemCount: number;

  codeBlockCount: number;

  tableCount: number;

  contentElementCount: number;

  scriptCount: number;

  shellRootCount: number;

  shellRootTextLength: number;
}

export interface HtmlSufficiencyReport {
  sufficient: boolean;

  /**
   * Diagnostic score from 0 to 100.
   *
   * It is deliberately heuristic and should not be persisted as a semantic
   * property of the source.
   */
  score: number;

  reasons:
    readonly HtmlSufficiencyReason[];

  metrics:
    HtmlSufficiencyMetrics;
}

export interface HtmlSufficiencyAnalyzer {
  analyze(
    html: string | Buffer,
    baseUrl?: string,
  ): HtmlSufficiencyReport;
}

export interface StaticHtmlSufficiencyAnalyzerOptions {
  /**
   * A semantic container with at least this much visible text is considered
   * strong evidence that HTTP HTML is already useful.
   */
  minSemanticTextLength?: number;

  /**
   * Visible body text threshold for pages without semantic containers.
   */
  minBodyTextLength?: number;

  /**
   * Below this threshold the page is considered text-poor.
   */
  lowTextThreshold?: number;

  /**
   * Minimum number of content-bearing elements used as structural evidence.
   */
  minContentElementCount?: number;

  /**
   * Script count that becomes suspicious when visible text is also low.
   */
  scriptHeavyThreshold?: number;

  /**
   * Score required to keep the HTTP response in auto mode.
   */
  sufficientScore?: number;
}
