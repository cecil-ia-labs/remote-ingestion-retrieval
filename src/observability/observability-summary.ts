import type {
  ObservabilityEvent,
} from "./observability.types.js";

export interface ObservabilityMetricSummary {
  readonly unit?:
    string;

  readonly samples:
    number;

  readonly sum:
    number;

  readonly min:
    number;

  readonly max:
    number;

  readonly last:
    number;
}

export interface ObservabilityStageSummary {
  readonly stage:
    string;

  readonly completed:
    number;

  readonly failed:
    number;

  readonly totalDurationMs:
    number;

  readonly maxDurationMs:
    number;
}

export interface ObservabilityRunSummary {
  readonly runId:
    string;

  readonly runName:
    string;

  readonly status?:
    "ok"
    | "error"
    | "aborted";

  readonly durationMs?:
    number;

  readonly events:
    number;

  readonly stages:
    Readonly<Record<string, ObservabilityStageSummary>>;

  readonly metrics:
    Readonly<Record<string, ObservabilityMetricSummary>>;
}

export function summarizeObservabilityEvents(
  events:
    readonly ObservabilityEvent[],
): ObservabilityRunSummary | undefined {
  const first =
    events[0];

  if (!first) {
    return undefined;
  }

  const stages:
    Record<string, {
      stage:
        string;
      completed:
        number;
      failed:
        number;
      totalDurationMs:
        number;
      maxDurationMs:
        number;
    }> = {};

  const metrics:
    Record<string, {
      unit?:
        string;
      samples:
        number;
      sum:
        number;
      min:
        number;
      max:
        number;
      last:
        number;
    }> = {};

  let status:
    ObservabilityRunSummary["status"];

  let durationMs:
    number | undefined;

  for (
    const event
    of events
  ) {
    if (
      event.runId
      !== first.runId
    ) {
      continue;
    }

    if (
      event.kind
      === "run.end"
      || event.kind
        === "run.error"
    ) {
      status =
        event.status;
      durationMs =
        event.durationMs;
    }

    if (
      (
        event.kind
        === "stage.end"
        || event.kind
          === "stage.error"
      )
      && event.stage
    ) {
      const existing =
        stages[event.stage]
        ?? {
          stage:
            event.stage,
          completed:
            0,
          failed:
            0,
          totalDurationMs:
            0,
          maxDurationMs:
            0,
        };

      if (
        event.kind
        === "stage.end"
      ) {
        existing.completed +=
          1;
      } else {
        existing.failed +=
          1;
      }

      const duration =
        event.durationMs
        ?? 0;

      existing.totalDurationMs +=
        duration;

      existing.maxDurationMs =
        Math.max(
          existing.maxDurationMs,
          duration,
        );

      stages[event.stage] =
        existing;
    }

    if (
      event.kind
      === "metric"
      && event.metric
    ) {
      const existing =
        metrics[event.metric.name];

      if (!existing) {
        metrics[event.metric.name] = {
          unit:
            event.metric.unit,
          samples:
            1,
          sum:
            event.metric.value,
          min:
            event.metric.value,
          max:
            event.metric.value,
          last:
            event.metric.value,
        };

        continue;
      }

      existing.samples +=
        1;
      existing.sum +=
        event.metric.value;
      existing.min =
        Math.min(
          existing.min,
          event.metric.value,
        );
      existing.max =
        Math.max(
          existing.max,
          event.metric.value,
        );
      existing.last =
        event.metric.value;
    }
  }

  return {
    runId:
      first.runId,
    runName:
      first.runName,
    status,
    durationMs,
    events:
      events.filter(
        (event) =>
          event.runId
          === first.runId,
      ).length,
    stages:
      Object.freeze(
        stages,
      ),
    metrics:
      Object.freeze(
        metrics,
      ),
  };
}
