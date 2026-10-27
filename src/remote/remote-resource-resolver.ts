import type {
  RemoteResourceType,
} from "../domain/index.js";

import type {
  RemoteResource,
} from "./remote-resource.js";

export type RemoteResourceTypeHint =
  Exclude<
    RemoteResourceType,
    "auto" | "website"
  >;

export interface ResolveRemoteResourceOptions {
  /**
   * Optional caller hint.
   *
   * When provided it wins over automatic type detection.
   */
  resourceTypeHint?: RemoteResourceTypeHint;

  /**
   * Maximum number of HTTP redirects.
   *
   * Recommended default: 5.
   */
  maxRedirects?: number;

  /**
   * Timeout applied independently to each HTTP request.
   */
  timeoutMs?: number;

  /**
   * User-Agent sent by the resolver probe.
   */
  userAgent?: string;
}

export interface RemoteResourceResolver {
  resolve(
    url: string,
    options?: ResolveRemoteResourceOptions,
  ): Promise<RemoteResource>;
}
