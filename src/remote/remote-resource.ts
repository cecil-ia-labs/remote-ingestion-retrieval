import type {
  RemoteResourceType,
} from "../domain/source.types.js";

export type ResourceTypeDetectionSource =
  | "content-type"
  | "url-extension"
  | "hint"
  | "unknown";


export type RemoteResourceTransport =
  | "http"
  | "browser";

export type RemoteResourceNetworkSafety =
  | "dns-pinned"
  | "dns-validated";

export interface RemoteResource {
  /**
   * URL originally requested by the caller.
   */
  requestedUrl: string;

  /**
   * Final URL after following validated redirects.
   */
  resolvedUrl: string;

  /**
   * Every redirect URL traversed between requestedUrl and resolvedUrl.
   */
  redirectChain: string[];

  /**
   * Final HTTP status returned by the remote endpoint.
   */
  statusCode: number;

  /**
   * Normalized response headers.
   */
  headers: Record<string, string>;

  /**
   * Content-Type without parameters such as charset.
   */
  contentType?: string;

  /**
   * Total resource size when the remote server exposes it.
   */
  contentLength?: number;

  etag?: string;
  lastModified?: string;

  /**
   * Best resource classification available during resolution.
   *
   * "auto" means the resolver could not safely determine the type yet.
   */
  resourceType: RemoteResourceType;

  resourceTypeDetectedBy: ResourceTypeDetectionSource;

  /**
   * Public IP address validated for the resource target.
   *
   * When networkSafety is "dns-pinned", the HTTP transport connected to this
   * exact address. Browser rendering can only guarantee DNS validation here;
   * Chrome owns the final socket connection.
   */
  resolvedAddress: string;

  resolvedAddressFamily: 4 | 6;

  /**
   * Transport that produced the current resource representation.
   *
   * HTTP fetches can pin the validated DNS address to the socket.
   * Browser rendering validates targets but Chrome owns the final DNS/socket
   * connection, so it cannot provide the same pinning guarantee here.
   */
  transport?: RemoteResourceTransport;

  networkSafety?: RemoteResourceNetworkSafety;
}
