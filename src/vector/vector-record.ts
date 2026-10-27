import type {
  JsonValue,
} from "../domain/source.types.js";

export type VectorRecordId =
  string;

export type VectorMetadata =
  Readonly<Record<string, JsonValue>>;

export interface VectorRecord {
  readonly id:
    VectorRecordId;

  readonly values:
    readonly number[];

  /**
   * Original chunk text. Some vector stores persist this in a payload field;
   * others may ignore it and keep only metadata + vector values.
   */
  readonly text:
    string;

  readonly metadata:
    VectorMetadata;
}
