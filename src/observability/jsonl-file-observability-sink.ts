import {
  appendFile,
  mkdir,
} from "node:fs/promises";

import {
  dirname,
} from "node:path";

import type {
  ObservabilitySink,
} from "./observability-sink.js";

import type {
  ObservabilityEvent,
} from "./observability.types.js";

export interface JsonlFileObservabilitySinkOptions {
  readonly filePath:
    string;

  readonly createDirectory?:
    boolean;
}

export class JsonlFileObservabilitySink
  implements ObservabilitySink {
  readonly filePath:
    string;

  private readonly createDirectory:
    boolean;

  private directoryReady =
    false;

  private writeChain:
    Promise<void> = Promise.resolve();

  constructor(
    options:
      JsonlFileObservabilitySinkOptions,
  ) {
    this.filePath =
      options.filePath;

    this.createDirectory =
      options.createDirectory
      ?? true;
  }

  emit(
    event:
      ObservabilityEvent,
  ): Promise<void> {
    const line =
      JSON.stringify(
        event,
      )
      + "\n";

    this.writeChain =
      this.writeChain.then(
        async () => {
          if (
            this.createDirectory
            && !this.directoryReady
          ) {
            await mkdir(
              dirname(
                this.filePath,
              ),
              {
                recursive:
                  true,
              },
            );

            this.directoryReady =
              true;
          }

          await appendFile(
            this.filePath,
            line,
            "utf8",
          );
        },
      );

    return this.writeChain;
  }
}
