export class LinkCrawlerError
  extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class LinkCrawlAbortedError
  extends LinkCrawlerError {
  constructor(
    public readonly rootUrl: string,
  ) {
    super(
      `Link crawl aborted: ${rootUrl}`,
    );
  }
}

export class LinkCrawlPageError
  extends LinkCrawlerError {
  constructor(
    public readonly url: string,
    options?: ErrorOptions,
  ) {
    super(
      `Unable to crawl page: ${url}`,
      options,
    );
  }
}
