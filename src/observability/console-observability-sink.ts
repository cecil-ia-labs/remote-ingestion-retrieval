import type {
  ObservabilitySink,
} from "./observability-sink.js";

import type {
  ObservabilityEvent,
} from "./observability.types.js";

export interface ConsoleObservabilitySinkOptions {
  readonly pretty?:
    boolean;
}

export class ConsoleObservabilitySink
  implements ObservabilitySink {
  private readonly pretty:
    boolean;

  constructor(
    options:
      ConsoleObservabilitySinkOptions = {},
  ) {
    this.pretty =
      options.pretty
      ?? false;
  }

  emit(
    event:
      ObservabilityEvent,
  ): void {
    console.log(
      JSON.stringify(
        event,
        null,
        this.pretty
          ? 2
          : undefined,
      ),
    );
  }
}
