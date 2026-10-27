import assert from "node:assert/strict";
import {
  test,
} from "node:test";

import {
  RemoteSourceIngestion,
  createRemoteSourceIngestion,
  ObservabilityHub,
  SourceInsertionPipeline,
  summarizeSourceInsertion,
} from "../../../index.js";

import type {
  EmbeddingProvider,
  MarkdownSplitter,
  VectorStore,
  WebsiteSource,
} from "../../../index.js";

void (null as unknown as EmbeddingProvider);
void (null as unknown as MarkdownSplitter);
void (null as unknown as VectorStore);
void (null as unknown as WebsiteSource);

test(
  "stable package root exposes the facade and host contracts",
  () => {
    assert.equal(
      typeof RemoteSourceIngestion,
      "function",
    );
    assert.equal(
      typeof createRemoteSourceIngestion,
      "function",
    );
    assert.equal(
      typeof ObservabilityHub,
      "function",
    );
    assert.equal(
      typeof SourceInsertionPipeline,
      "function",
    );
    assert.equal(
      typeof summarizeSourceInsertion,
      "function",
    );
  },
);
