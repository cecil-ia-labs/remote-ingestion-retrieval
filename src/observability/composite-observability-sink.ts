import type {
  ObservabilitySink,
} from "./observability-sink.js";

import type {
  ObservabilityEvent,
} from "./observability.types.js";

export class CompositeObservabilitySink
  implements ObservabilitySink {
  constructor(
    private readonly sinks:
      readonly ObservabilitySink[],
  ) {}

  async emit(
    event:
      ObservabilityEvent,
  ): Promise<void> {
    for (
      const sink
      of this.sinks
    ) {
      await sink.emit(
        event,
      );
    }
  }
}
