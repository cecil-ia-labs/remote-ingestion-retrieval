import type {
  FetchedResource,
  RemoteResource,
} from "../remote/index.js";

export interface BrowserHtmlRendererContext {
  /**
   * Optional cancellation signal propagated to the browser implementation.
   */
  signal?: AbortSignal;
}

/**
 * Browser rendering abstraction.
 *
 * Phase 7 defines the contract only.
 * Phase 8 will provide the Puppeteer implementation.
 */
export interface BrowserHtmlRenderer {
  render(
    resource: RemoteResource,
    context?: BrowserHtmlRendererContext,
  ): Promise<FetchedResource>;
}
