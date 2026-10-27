export class VectorIndexingError
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

export class InvalidVectorBatchSizeError
  extends VectorIndexingError {
  constructor(
    public readonly optionName:
      "embeddingBatchSize"
      | "upsertBatchSize"
      | "deleteBatchSize",

    public readonly value:
      number,
  ) {
    super(
      `${optionName} must be a positive integer; received ${value}.`,
    );
  }
}

export class DuplicateDocumentChunkIdError
  extends VectorIndexingError {
  constructor(
    public readonly chunkId:
      string,
  ) {
    super(
      `Duplicate DocumentChunk id in vector-indexing input: ${chunkId}`,
    );
  }
}

export class EmbeddingCountMismatchError
  extends VectorIndexingError {
  constructor(
    public readonly expected:
      number,

    public readonly actual:
      number,

    public readonly providerName:
      string,
  ) {
    super(
      `Embedding provider "${providerName}" returned ${actual} vectors for ${expected} inputs.`,
    );
  }
}

export class InvalidEmbeddingVectorError
  extends VectorIndexingError {
  constructor(
    public readonly providerName:
      string,

    public readonly inputIndex:
      number,

    detail:
      string,
  ) {
    super(
      `Invalid embedding vector from "${providerName}" at input ${inputIndex}: ${detail}`,
    );
  }
}

export class EmbeddingDimensionMismatchError
  extends VectorIndexingError {
  constructor(
    public readonly expected:
      number,

    public readonly actual:
      number,

    public readonly providerName:
      string,
  ) {
    super(
      `Embedding dimension mismatch for "${providerName}": expected ${expected}, received ${actual}.`,
    );
  }
}

export type VectorIndexingStage =
  | "embedding"
  | "upsert"
  | "delete";

export class VectorIndexingBatchError
  extends VectorIndexingError {
  constructor(
    public readonly stage:
      VectorIndexingStage,

    public readonly batchIndex:
      number,

    public readonly completedItems:
      number,

    options?:
      ErrorOptions,
  ) {
    super(
      `Vector indexing failed during ${stage} batch ${batchIndex} after ${completedItems} completed items.`,
      options,
    );
  }
}

export class VectorIndexingAbortedError
  extends VectorIndexingError {
  constructor() {
    super(
      "Vector indexing was aborted.",
    );
  }
}
