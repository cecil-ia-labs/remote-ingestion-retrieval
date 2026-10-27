export type ContentHashAlgorithm =
  "sha256";

export type ContentHashEncoding =
  "hex";

export type ContentHashStage =
  | "raw"
  | "extracted"
  | "normalized"
  | "document"
  | "chunk";

export type ContentHashRepresentation =
  | "bytes"
  | "utf8"
  | "canonical-json"
  | "markdown"
  | "web-document-snapshot"
  | "document-chunk-snapshot";

export interface ContentHash {
  readonly stage:
    ContentHashStage;

  readonly algorithm:
    ContentHashAlgorithm;

  readonly encoding:
    ContentHashEncoding;

  readonly representation:
    ContentHashRepresentation;

  readonly value:
    string;

  /**
   * Number of bytes actually supplied to the digest function after any
   * canonical serialization required by the stage.
   */
  readonly byteLength:
    number;
}

export interface ContentHashTrace {
  readonly schemaVersion:
    1;

  readonly algorithm:
    ContentHashAlgorithm;

  readonly raw?:
    ContentHash;

  readonly extracted?:
    ContentHash;

  readonly normalized?:
    ContentHash;

  readonly document?:
    ContentHash;
}

export interface ContentHashComparison {
  readonly equal:
    boolean;

  readonly firstChangedStage?:
    Exclude<
      ContentHashStage,
      "chunk"
    >;

  readonly equalStages:
    readonly Exclude<
      ContentHashStage,
      "chunk"
    >[];

  readonly changedStages:
    readonly Exclude<
      ContentHashStage,
      "chunk"
    >[];

  readonly unavailableStages:
    readonly Exclude<
      ContentHashStage,
      "chunk"
    >[];
}
