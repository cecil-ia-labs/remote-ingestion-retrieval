import type {
  ObservabilitySink,
} from "./observability-sink.js";

import type {
  ObservabilityEvent,
} from "./observability.types.js";

export class InMemoryObservabilitySink
  implements ObservabilitySink {
  private readonly collected:
    ObservabilityEvent[] = [];

  emit(
    event:
      ObservabilityEvent,
  ): void {
    this.collected.push(
      event,
    );
  }

  get events():
    readonly ObservabilityEvent[] {
    return Object.freeze([
      ...this.collected,
    ]);
  }

  clear(): void {
    this.collected.length =
      0;
  }
}
