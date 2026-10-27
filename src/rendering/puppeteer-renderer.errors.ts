import {
  HtmlRenderingError,
} from "./html-rendering.errors.js";

export class PuppeteerRendererError
  extends HtmlRenderingError {}

export class PuppeteerNavigationError
  extends PuppeteerRendererError {}

export class PuppeteerNavigationHttpStatusError
  extends PuppeteerRendererError {
  constructor(
    public readonly statusCode: number,
    public readonly url: string,
  ) {
    super(
      `Browser navigation returned HTTP ${statusCode}: ${url}`,
    );
  }
}

export class PuppeteerUnsafeNavigationError
  extends PuppeteerRendererError {
  constructor(
    public readonly url: string,
  ) {
    super(
      `Browser navigation was blocked by the network safety policy: ${url}`,
    );
  }
}

export class PuppeteerRenderedResourceTooLargeError
  extends PuppeteerRendererError {
  constructor(
    public readonly maxBytes: number,
    public readonly observedBytes: number,
    public readonly url: string,
  ) {
    super(
      `Rendered HTML exceeds the maximum allowed size of `
      + `${maxBytes} bytes: ${url} (observed ${observedBytes} bytes)`,
    );
  }
}
