export class MarkdownArtifactStoreError
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

export class MarkdownArtifactHashMismatchError
  extends MarkdownArtifactStoreError {}

export class MarkdownArtifactPathError
  extends MarkdownArtifactStoreError {}
