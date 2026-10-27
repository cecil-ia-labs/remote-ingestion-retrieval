import type {
  RemoteSource,
  RenderingStrategy,
} from "../domain/index.js";

/**
 * Reads the user/source rendering preference while keeping the runtime
 * orchestrator independent from the source persistence model.
 */
export function getSourceRenderingStrategy(
  source:
    RemoteSource,
): RenderingStrategy {
  return (
    source.options
      ?.rendering
      ?.strategy
    ?? "auto"
  );
}
