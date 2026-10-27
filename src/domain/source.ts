import type {
  SourceId,
  SourceMetadata,
  SourceType,
} from "./source.types.js";

export interface Source {
  readonly id: SourceId;
  readonly type: SourceType;

  name?: string;
  metadata?: SourceMetadata;

  createdAt: Date;
  updatedAt: Date;
}
