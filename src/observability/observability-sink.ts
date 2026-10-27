import type {
  ObservabilityEvent,
} from "./observability.types.js";

export interface ObservabilitySink {
  emit(
    event:
      ObservabilityEvent,
  ): void | Promise<void>;
}
