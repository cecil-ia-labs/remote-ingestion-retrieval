import type {
  ContentHashComparison,
  ContentHashStage,
  ContentHashTrace,
} from "./content-hash.js";

const stages = [
  "raw",
  "extracted",
  "normalized",
  "document",
] as const satisfies readonly Exclude<
  ContentHashStage,
  "chunk"
>[];

export function compareContentHashTraces(
  previous:
    ContentHashTrace,

  current:
    ContentHashTrace,
): ContentHashComparison {
  const equalStages:
    Exclude<
      ContentHashStage,
      "chunk"
    >[] = [];

  const changedStages:
    Exclude<
      ContentHashStage,
      "chunk"
    >[] = [];

  const unavailableStages:
    Exclude<
      ContentHashStage,
      "chunk"
    >[] = [];

  for (
    const stage
    of stages
  ) {
    const before =
      previous[stage];

    const after =
      current[stage];

    if (
      !before
      || !after
    ) {
      unavailableStages.push(
        stage,
      );

      continue;
    }

    if (
      before.algorithm
        === after.algorithm
      && before.value
        === after.value
    ) {
      equalStages.push(
        stage,
      );
    } else {
      changedStages.push(
        stage,
      );
    }
  }

  return Object.freeze({
    equal:
      changedStages.length
      === 0,
    firstChangedStage:
      stages.find(
        (stage) =>
          changedStages.includes(
            stage,
          ),
      ),
    equalStages:
      Object.freeze(
        equalStages,
      ),
    changedStages:
      Object.freeze(
        changedStages,
      ),
    unavailableStages:
      Object.freeze(
        unavailableStages,
      ),
  });
}
