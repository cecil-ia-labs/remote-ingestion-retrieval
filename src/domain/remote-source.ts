import type { Source } from "./source.js";

import type {
  RemoteResourceType,
  RemoteSourceType,
  RenderingStrategy,
} from "./source.types.js";

export interface RenderingOptions {
  strategy?: RenderingStrategy;
}

export interface RemoteSourceOptions {
  resourceType?: RemoteResourceType;
  rendering?: RenderingOptions;
}

export interface RemoteSource extends Source {
  readonly type: RemoteSourceType;

  url: string;

  options?: RemoteSourceOptions;
}
