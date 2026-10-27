export class HtmlRenderingError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      new.target.name;
  }
}

export class UnsupportedHtmlRenderingResourceError
  extends HtmlRenderingError {}

export class BrowserRendererUnavailableError
  extends HtmlRenderingError {}

export class InvalidBrowserRenderedResourceError
  extends HtmlRenderingError {}

export class HtmlRenderingAbortedError
  extends HtmlRenderingError {
  constructor(
    public readonly url: string,
  ) {
    super(
      `HTML rendering aborted: ${url}`,
    );
  }
}
