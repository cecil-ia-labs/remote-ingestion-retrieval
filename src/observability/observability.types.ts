import type {
  JsonValue,
} from "../domain/source.types.js";

import type {
  SourceErrorDescriptor,
} from "../errors/error-model.types.js";

export const OBSERVABILITY_EVENT_SCHEMA_VERSION =
  1 as const;

export type ObservabilityEventKind =
  | "run.start"
  | "run.end"
  | "run.error"
  | "stage.start"
  | "stage.end"
  | "stage.error"
  | "metric"
  | "event";

export type ObservabilityStatus =
  | "ok"
  | "error"
  | "aborted";

export type ObservabilityFailureMode =
  | "ignore"
  | "throw";

export type ObservabilityAttributes =
  Readonly<Record<string, JsonValue>>;

export type ObservabilityErrorInfo =
  SourceErrorDescriptor;

export interface ObservabilityMetricValue {
  readonly name:
    string;

  readonly value:
    number;

  readonly unit?:
    string;
}

export interface ObservabilityEvent {
  readonly schemaVersion:
    typeof OBSERVABILITY_EVENT_SCHEMA_VERSION;

  readonly eventId:
    string;

  readonly kind:
    ObservabilityEventKind;

  readonly timestamp:
    string;

  readonly runId:
    string;

  readonly runName:
    string;

  readonly spanId:
    string;

  readonly parentSpanId?:
    string;

  readonly stage?:
    string;

  readonly name?:
    string;

  readonly status?:
    ObservabilityStatus;

  readonly durationMs?:
    number;

  readonly attributes?:
    ObservabilityAttributes;

  readonly metric?:
    ObservabilityMetricValue;

  readonly error?:
    ObservabilityErrorInfo;
}

export interface ObservabilityRunOptions {
  readonly runId?:
    string;

  readonly attributes?:
    ObservabilityAttributes;
}

export interface ObservabilityStageOptions {
  readonly attributes?:
    ObservabilityAttributes;
}

export interface ObservabilityMetricOptions {
  readonly unit?:
    string;

  readonly attributes?:
    ObservabilityAttributes;
}

export interface ObservabilityContextSnapshot {
  readonly runId:
    string;

  readonly runName:
    string;

  readonly spanId:
    string;

  readonly stage?:
    string;
}
