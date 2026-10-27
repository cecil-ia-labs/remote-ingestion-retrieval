export class RemoteResourceResolverError extends Error {
  constructor(
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class InvalidRemoteUrlError
  extends RemoteResourceResolverError {}

export class UnsafeRemoteUrlError
  extends RemoteResourceResolverError {}

export class RemoteDnsResolutionError
  extends RemoteResourceResolverError {}

export class RemoteRequestError
  extends RemoteResourceResolverError {}

export class RemoteRequestTimeoutError
  extends RemoteResourceResolverError {}

export class RemoteHttpStatusError
  extends RemoteResourceResolverError {
  constructor(
    public readonly statusCode: number,
    public readonly url: string,
  ) {
    super(
      `Remote resource returned HTTP ${statusCode}: ${url}`,
    );
  }
}

export class TooManyRedirectsError
  extends RemoteResourceResolverError {}
