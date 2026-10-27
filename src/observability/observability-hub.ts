import {
  AsyncLocalStorage,
} from "node:async_hooks";

import {
  randomUUID,
} from "node:crypto";

import {
  performance,
} from "node:perf_hooks";

import {
  isAbortError,
  observabilityError,
} from "./observability-attributes.js";

import {
  NoopObservabilitySink,
} from "./noop-observability-sink.js";

import type {
  ObservabilitySink,
} from "./observability-sink.js";

import {
  OBSERVABILITY_EVENT_SCHEMA_VERSION,
} from "./observability.types.js";

import type {
  ObservabilityAttributes,
  ObservabilityContextSnapshot,
  ObservabilityEvent,
  ObservabilityFailureMode,
  ObservabilityMetricOptions,
  ObservabilityRunOptions,
  ObservabilityStageOptions,
  ObservabilityStatus,
} from "./observability.types.js";

interface ObservabilityRuntimeContext {
  readonly runId:
    string;

  readonly runName:
    string;

  readonly spanId:
    string;

  readonly stage?:
    string;

  readonly sink:
    ObservabilitySink;

  readonly failureMode:
    ObservabilityFailureMode;

  readonly inheritedAttributes:
    ObservabilityAttributes;
}

export interface ObservabilityHubOptions {
  readonly sink?:
    ObservabilitySink;

  readonly failureMode?:
    ObservabilityFailureMode;

  readonly now?:
    () => Date;

  readonly monotonicNow?:
    () => number;

  readonly idFactory?:
    () => string;
}

const runtime =
  new AsyncLocalStorage<ObservabilityRuntimeContext>();

function mergeAttributes(
  inherited:
    ObservabilityAttributes,

  current:
    ObservabilityAttributes | undefined,
): ObservabilityAttributes | undefined {
  const keys = [
    ...Object.keys(
      inherited,
    ),
    ...Object.keys(
      current
      ?? {},
    ),
  ];

  if (
    keys.length === 0
  ) {
    return undefined;
  }

  return Object.freeze({
    ...inherited,
    ...current,
  });
}

export class ObservabilityHub {
  private readonly sink:
    ObservabilitySink;

  private readonly failureMode:
    ObservabilityFailureMode;

  private readonly now:
    () => Date;

  private readonly monotonicNow:
    () => number;

  private readonly idFactory:
    () => string;

  constructor(
    options:
      ObservabilityHubOptions = {},
  ) {
    this.sink =
      options.sink
      ?? new NoopObservabilitySink();

    this.failureMode =
      options.failureMode
      ?? "ignore";

    this.now =
      options.now
      ?? (() => new Date());

    this.monotonicNow =
      options.monotonicNow
      ?? (() => performance.now());

    this.idFactory =
      options.idFactory
      ?? (() => randomUUID());
  }

  createRunId():
    string {
    return this.idFactory();
  }

  currentContext():
    ObservabilityContextSnapshot | undefined {
    const context =
      runtime.getStore();

    if (!context) {
      return undefined;
    }

    return {
      runId:
        context.runId,
      runName:
        context.runName,
      spanId:
        context.spanId,
      stage:
        context.stage,
    };
  }

  async run<T>(
    runName:
      string,

    options:
      ObservabilityRunOptions,

    operation:
      () => Promise<T>,
  ): Promise<T> {
    const runId =
      options.runId
      ?? this.idFactory();

    const spanId =
      this.idFactory();

    const context:
      ObservabilityRuntimeContext = {
      runId,
      runName,
      spanId,
      sink:
        this.sink,
      failureMode:
        this.failureMode,
      inheritedAttributes:
        options.attributes
        ?? {},
    };

    const started =
      this.monotonicNow();

    await this.emit(
      context,
      {
        kind:
          "run.start",
        spanId,
        attributes:
          options.attributes,
      },
    );

    return runtime.run(
      context,
      async () => {
        try {
          const result =
            await operation();

          await this.emit(
            context,
            {
              kind:
                "run.end",
              spanId,
              status:
                "ok",
              durationMs:
                this.durationSince(
                  started,
                ),
            },
          );

          return result;
        } catch (cause) {
          const status:
            ObservabilityStatus =
            isAbortError(
              cause,
            )
              ? "aborted"
              : "error";

          await this.emit(
            context,
            {
              kind:
                "run.error",
              spanId,
              status,
              durationMs:
                this.durationSince(
                  started,
                ),
              error:
                observabilityError(
                  cause,
                ),
            },
          );

          throw cause;
        }
      },
    );
  }

  async stage<T>(
    stage:
      string,

    options:
      ObservabilityStageOptions,

    operation:
      () => Promise<T>,
  ): Promise<T> {
    const current =
      runtime.getStore();

    if (!current) {
      return this.run(
        `standalone:${stage}`,
        {
          attributes:
            options.attributes,
        },
        () => this.stage(
          stage,
          options,
          operation,
        ),
      );
    }

    const spanId =
      this.idFactory();

    const context:
      ObservabilityRuntimeContext = {
      ...current,
      spanId,
      stage,
      inheritedAttributes:
        mergeAttributes(
          current.inheritedAttributes,
          options.attributes,
        )
        ?? current.inheritedAttributes,
    };

    const started =
      this.monotonicNow();

    await this.emit(
      context,
      {
        kind:
          "stage.start",
        spanId,
        parentSpanId:
          current.spanId,
        stage,
        attributes:
          options.attributes,
      },
    );

    return runtime.run(
      context,
      async () => {
        try {
          const result =
            await operation();

          await this.emit(
            context,
            {
              kind:
                "stage.end",
              spanId,
              parentSpanId:
                current.spanId,
              stage,
              status:
                "ok",
              durationMs:
                this.durationSince(
                  started,
                ),
              attributes:
                options.attributes,
            },
          );

          return result;
        } catch (cause) {
          const status:
            ObservabilityStatus =
            isAbortError(
              cause,
            )
              ? "aborted"
              : "error";

          await this.emit(
            context,
            {
              kind:
                "stage.error",
              spanId,
              parentSpanId:
                current.spanId,
              stage,
              status,
              durationMs:
                this.durationSince(
                  started,
                ),
              attributes:
                options.attributes,
              error:
                observabilityError(
                  cause,
                ),
            },
          );

          throw cause;
        }
      },
    );
  }

  async metric(
    name:
      string,

    value:
      number,

    options:
      ObservabilityMetricOptions = {},
  ): Promise<void> {
    if (
      !Number.isFinite(
        value,
      )
    ) {
      return;
    }

    const context =
      runtime.getStore();

    if (!context) {
      return;
    }

    await this.emit(
      context,
      {
        kind:
          "metric",
        spanId:
          context.spanId,
        stage:
          context.stage,
        attributes:
          options.attributes,
        metric: {
          name,
          value,
          unit:
            options.unit,
        },
      },
    );
  }

  async event(
    name:
      string,

    attributes?:
      ObservabilityAttributes,
  ): Promise<void> {
    const context =
      runtime.getStore();

    if (!context) {
      return;
    }

    await this.emit(
      context,
      {
        kind:
          "event",
        spanId:
          context.spanId,
        stage:
          context.stage,
        name,
        attributes,
      },
    );
  }

  private durationSince(
    started:
      number,
  ): number {
    return Math.max(
      0,
      this.monotonicNow()
      - started,
    );
  }

  private async emit(
    context:
      ObservabilityRuntimeContext,

    event:
      Omit<
        ObservabilityEvent,
        | "schemaVersion"
        | "eventId"
        | "timestamp"
        | "runId"
        | "runName"
      >,
  ): Promise<void> {
    const output:
      ObservabilityEvent = {
      schemaVersion:
        OBSERVABILITY_EVENT_SCHEMA_VERSION,
      eventId:
        this.idFactory(),
      timestamp:
        this.now()
          .toISOString(),
      runId:
        context.runId,
      runName:
        context.runName,
      ...event,
      attributes:
        mergeAttributes(
          context.inheritedAttributes,
          event.attributes,
        ),
    };

    try {
      await context.sink.emit(
        output,
      );
    } catch (cause) {
      if (
        context.failureMode
        === "throw"
      ) {
        throw cause;
      }
    }
  }
}

export const defaultObservabilityHub =
  new ObservabilityHub();
