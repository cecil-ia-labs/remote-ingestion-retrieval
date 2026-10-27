import type { RemoteSource } from "./remote-source.js";

export interface UrlSource extends RemoteSource {
  readonly type: "url";
}
