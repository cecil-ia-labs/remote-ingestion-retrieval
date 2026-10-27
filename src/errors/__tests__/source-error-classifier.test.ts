import assert from "node:assert/strict";
import { test } from "node:test";

import {
  InMemoryObservabilitySink,
  ObservabilityHub,
} from "../../observability/index.js";

import {
  RemoteFetchAbortedError,
  RemoteFetchHttpStatusError,
} from "../../remote/remote-fetcher.errors.js";

import {
  UnsafeRemoteUrlError,
} from "../../remote/remote-resource-resolver.errors.js";

import {
  EmbeddingDimensionMismatchError,
  VectorIndexingBatchError,
} from "../../vector/vector-indexing.errors.js";

import {
  describeSourceError,
  isAbortedSourceError,
  isRetryableSourceError,
} from "../source-error-classifier.js";

import {
  SourceIngestionError,
} from "../source-ingestion-error.js";

test(
  "classifies blocked URLs as non-retryable security failures",
  () => {
    const descriptor =
      describeSourceError(
        new UnsafeRemoteUrlError(
          "Blocked private address",
        ),
        {
          includeStack: false,
        },
      );

    assert.equal(
      descriptor.code,
      "REMOTE_UNSAFE_URL",
    );

    assert.equal(
      descriptor.category,
      "security",
    );

    assert.equal(
      descriptor.stage,
      "resolve",
    );

    assert.equal(
      descriptor.retryability,
      "no",
    );
  },
);

test(
  "classifies HTTP status retryability",
  () => {
    const unavailable =
      describeSourceError(
        new RemoteFetchHttpStatusError(
          503,
          "https://example.com/docs",
        ),
        {
          includeStack: false,
        },
      );

    const missing =
      describeSourceError(
        new RemoteFetchHttpStatusError(
          404,
          "https://example.com/docs",
        ),
        {
          includeStack: false,
        },
      );

    assert.equal(
      unavailable.retryability,
      "yes",
    );

    assert.equal(
      missing.retryability,
      "no",
    );

    assert.equal(
      isRetryableSourceError(
        new RemoteFetchHttpStatusError(
          429,
          "https://example.com",
        ),
      ),
      true,
    );
  },
);

test(
  "redacts credentials and sensitive query values from URLs, messages and stacks",
  () => {
    const secretUrl =
      "https://alice:password@example.com/api?access_token=super-secret&key=abc&view=full";

    const descriptor =
      describeSourceError(
        new RemoteFetchHttpStatusError(
          503,
          secretUrl,
        ),
      );

    const serialized =
      JSON.stringify(
        descriptor,
      );

    assert.doesNotMatch(
      serialized,
      /super-secret|password|key=abc/,
    );

    assert.match(
      descriptor.url ?? "",
      /access_token=%5BREDACTED%5D/,
    );

    assert.match(
      descriptor.url ?? "",
      /view=full/,
    );
  },
);

test(
  "inherits retryability from a structured cause for vector batch failures",
  () => {
    const cause =
      new EmbeddingDimensionMismatchError(
        1536,
        1024,
        "test-embedding-provider",
      );

    const error =
      new VectorIndexingBatchError(
        "upsert",
        2,
        100,
        {
          cause,
        },
      );

    const descriptor =
      describeSourceError(
        error,
        {
          includeStack: false,
        },
      );

    assert.equal(
      descriptor.code,
      "VECTOR_BATCH_FAILED",
    );

    assert.equal(
      descriptor.stage,
      "vector-upsert",
    );

    assert.equal(
      descriptor.retryability,
      "no",
    );

    assert.equal(
      descriptor.cause?.code,
      "EMBEDDING_DIMENSION_MISMATCH",
    );
  },
);

test(
  "normalizes abort errors to one code",
  () => {
    const error =
      new RemoteFetchAbortedError(
        "Aborted by caller",
      );

    const descriptor =
      describeSourceError(
        error,
        {
          includeStack: false,
        },
      );

    assert.equal(
      descriptor.code,
      "OPERATION_ABORTED",
    );

    assert.equal(
      descriptor.aborted,
      true,
    );

    assert.equal(
      isAbortedSourceError(
        error,
      ),
      true,
    );
  },
);

test(
  "preserves explicitly structured SourceIngestionError fields",
  () => {
    const error =
      new SourceIngestionError(
        "Custom provider quota reached",
        {
          code:
            "REMOTE_REQUEST_FAILED",
          category:
            "network",
          stage:
            "fetch",
          retryability:
            "yes",
          statusCode:
            429,
          url:
            "https://example.com/data?token=hidden",
          details: {
            provider:
              "example",
          },
        },
      );

    const descriptor =
      describeSourceError(
        error,
        {
          includeStack: false,
        },
      );

    assert.equal(
      descriptor.retryability,
      "yes",
    );

    assert.equal(
      descriptor.details?.provider,
      "example",
    );

    assert.doesNotMatch(
      descriptor.url ?? "",
      /hidden/,
    );
  },
);

test(
  "observability error events use the structured error model",
  async () => {
    const sink =
      new InMemoryObservabilitySink();

    const hub =
      new ObservabilityHub({
        sink,
        idFactory:
          (() => {
            let id = 0;

            return () =>
              `id-${++id}`;
          })(),
      });

    await assert.rejects(
      () =>
        hub.run(
          "error-model-test",
          {},
          () =>
            hub.stage(
              "remote.fetch",
              {},
              async () => {
                throw new RemoteFetchHttpStatusError(
                  503,
                  "https://example.com/private?access_token=hidden",
                );
              },
            ),
        ),
      RemoteFetchHttpStatusError,
    );

    const errorEvents =
      sink.events.filter(
        (event) =>
          event.error !== undefined,
      );

    assert.equal(
      errorEvents.length,
      2,
    );

    assert.equal(
      errorEvents[0]?.error?.code,
      "REMOTE_HTTP_STATUS",
    );

    assert.equal(
      errorEvents[0]?.error?.retryability,
      "yes",
    );

    assert.doesNotMatch(
      JSON.stringify(
        errorEvents,
      ),
      /hidden/,
    );
  },
);
