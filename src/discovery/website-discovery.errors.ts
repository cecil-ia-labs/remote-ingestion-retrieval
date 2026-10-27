export class WebsiteDiscoveryError
  extends Error {
  constructor(
    message:
      string,

    options?:
      ErrorOptions,
  ) {
    super(
      message,
      options,
    );

    this.name =
      new.target.name;
  }
}

export class InvalidSitemapError
  extends WebsiteDiscoveryError {
  constructor(
    public readonly sitemapUrl:
      string,

    detail:
      string,

    options?:
      ErrorOptions,
  ) {
    super(
      `Invalid sitemap "${sitemapUrl}": ${detail}`,
      options,
    );
  }
}

export class SitemapLimitError
  extends WebsiteDiscoveryError {}

export class SitemapEntryLimitError
  extends SitemapLimitError {
  constructor(
    public readonly sitemapUrl:
      string,

    public readonly entryType:
      "url" | "sitemap",

    public readonly limit:
      number,
  ) {
    super(
      `Sitemap "${sitemapUrl}" exceeds the maximum `
      + `${entryType} entry count (${limit}).`,
    );
  }
}

export class SitemapPayloadTooLargeError
  extends SitemapLimitError {
  constructor(
    public readonly sitemapUrl:
      string,

    public readonly maxBytes:
      number,

    public readonly observedBytes:
      number,
  ) {
    super(
      `Sitemap "${sitemapUrl}" exceeds the maximum uncompressed size `
      + `${maxBytes} bytes (observed ${observedBytes}).`,
    );
  }
}

export class SitemapDecompressionError
  extends WebsiteDiscoveryError {
  constructor(
    public readonly sitemapUrl:
      string,

    options?:
      ErrorOptions,
  ) {
    super(
      `Unable to decompress sitemap "${sitemapUrl}".`,
      options,
    );
  }
}

export class WebsiteDiscoveryAbortedError
  extends WebsiteDiscoveryError {
  constructor(
    public readonly rootUrl:
      string,
  ) {
    super(
      `Website discovery aborted: ${rootUrl}`,
    );
  }
}
