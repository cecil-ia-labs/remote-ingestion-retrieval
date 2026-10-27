import type {
  ObservabilitySink,
} from "./observability-sink.js";

export class NoopObservabilitySink
  implements ObservabilitySink {
  emit(): void {
    // Deliberately empty.
  }
}
