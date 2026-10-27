import type {
  MarkdownArtifact,
  SaveMarkdownArtifactInput,
} from "./markdown-artifact.js";

export interface MarkdownArtifactStore {
  save(
    input:
      SaveMarkdownArtifactInput,
  ): Promise<MarkdownArtifact>;

  read(
    artifact:
      MarkdownArtifact,
  ): Promise<string>;

  exists(
    artifact:
      MarkdownArtifact,
  ): Promise<boolean>;

  remove(
    artifact:
      MarkdownArtifact,
  ): Promise<void>;
}
