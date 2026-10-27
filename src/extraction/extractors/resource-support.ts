import type {
  RemoteResourceType,
} from "../../domain/index.js";

import type {
  FetchedResource,
} from "../../remote/index.js";

export function supportsResourceType(
  resource: FetchedResource,
  type: RemoteResourceType,
  contentTypes:
    readonly string[] = [],
): boolean {
  if (
    resource.resource.resourceType
    === type
  ) {
    return true;
  }

  const contentType =
    resource.resource.contentType
    ?.toLowerCase();

  if (!contentType) {
    return false;
  }

  return contentTypes.some(
    (candidate) => {
      const normalized =
        candidate.toLowerCase();

      if (
        normalized.endsWith(
          "/*",
        )
      ) {
        return contentType.startsWith(
          normalized.slice(
            0,
            -1,
          ),
        );
      }

      if (
        normalized.startsWith(
          "*+",
        )
      ) {
        return contentType.endsWith(
          normalized.slice(1),
        );
      }

      return (
        contentType
        === normalized
      );
    },
  );
}
