export interface SafeRemoteTarget {
  url: URL;

  /**
   * Public IP selected and later pinned to the socket lookup.
   */
  address: string;

  family: 4 | 6;

  /**
   * All addresses returned by DNS.
   *
   * The default policy rejects the hostname if any resolved address is
   * non-public, preventing mixed public/private DNS answers.
   */
  addresses: Array<{
    address: string;
    family: 4 | 6;
  }>;
}

export interface UrlSafetyPolicy {
  validateAndResolve(
    value: string | URL,
  ): Promise<SafeRemoteTarget>;
}
