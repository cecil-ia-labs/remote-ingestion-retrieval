export class RemoteFetcherError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class RemoteFetchRequestError
  extends RemoteFetcherError {}

export class RemoteFetchTimeoutError
  extends RemoteFetcherError {}

export class RemoteFetchAbortedError
  extends RemoteFetcherError {}

export class RemoteFetchHttpStatusError
  extends RemoteFetcherError {
  constructor(
    public readonly statusCode: number,
    public readonly url: string,
  ) {
    super(
      `Remote fetch returned HTTP ${statusCode}: ${url}`,
    );
  }
}

export class RemoteFetchTooLargeError
  extends RemoteFetcherError {
  constructor(
    public readonly maxBytes: number,
    public readonly observedBytes: number,
    public readonly url: string,
  ) {
    super(
      `Remote resource exceeds the maximum allowed size of `
      + `${maxBytes} bytes: ${url} (observed ${observedBytes} bytes)`,
    );
  }
}

export class RemoteFetchTooManyRedirectsError
  extends RemoteFetcherError {}

export class UnsupportedContentEncodingError
  extends RemoteFetcherError {}
