export class UrlCanonicalizationError
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

export class UnsupportedCanonicalUrlProtocolError
  extends UrlCanonicalizationError {
  constructor(
    public readonly protocol:
      string,

    public readonly value:
      string,
  ) {
    super(
      `Unsupported canonical URL protocol "${protocol}" for "${value}".`,
    );
  }
}
