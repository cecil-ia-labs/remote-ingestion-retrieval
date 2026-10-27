export class CrawlSchedulerError
  extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidCrawlConcurrencyError
  extends CrawlSchedulerError {
  constructor(
    public readonly concurrency: number,
    public readonly maxConcurrency: number,
  ) {
    super(
      `Crawl concurrency must be an integer between 1 and ${maxConcurrency}; `
      + `received ${concurrency}.`,
    );
  }
}

export class CrawlSchedulingAbortedError
  extends CrawlSchedulerError {
  constructor() {
    super("Crawl scheduling aborted.");
  }
}
