export interface EmbeddingRequestContext {
  readonly sourceId?:
    string;

  readonly documentId?:
    string;

  readonly signal?:
    AbortSignal;
}

/**
 * Provider-neutral embedding contract.
 *
 * A provider receives an ordered batch of texts and must return one vector per
 * input in exactly the same order.
 */
export interface EmbeddingProvider {
  readonly name:
    string;

  /**
   * Expected vector dimensions when the provider knows them in advance.
   */
  readonly dimensions?:
    number;

  /**
   * Optional provider-side hard batch limit.
   */
  readonly maxBatchSize?:
    number;

  embed(
    texts:
      readonly string[],

    context?:
      EmbeddingRequestContext,
  ): Promise<readonly (readonly number[])[]>;
}
