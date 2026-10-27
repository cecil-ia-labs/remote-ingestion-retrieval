import {
  BlockList,
  isIP,
} from "node:net";

import {
  lookup,
} from "node:dns/promises";

import {
  InvalidRemoteUrlError,
  RemoteDnsResolutionError,
  UnsafeRemoteUrlError,
} from "./remote-resource-resolver.errors.js";

import type {
  SafeRemoteTarget,
  UrlSafetyPolicy,
} from "./url-safety-policy.js";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
]);

const BLOCKED_HOSTNAME_SUFFIXES = [
  ".localhost",
  ".local",
  ".lan",
  ".internal",
  ".home.arpa",
];

function createBlockedAddressLists(): {
  ipv4: BlockList;
  ipv6: BlockList;
} {
  // Node matches IPv4 checks against IPv4-mapped IPv6 subnets too. Keep the
  // families separate so ::ffff:0:0/96 does not block every public IPv4.
  const ipv4 = new BlockList();
  const ipv6 = new BlockList();

  // IPv4: non-public, private, loopback, link-local,
  // documentation, benchmarking, multicast and reserved ranges.
  ipv4.addSubnet("0.0.0.0", 8, "ipv4");
  ipv4.addSubnet("10.0.0.0", 8, "ipv4");
  ipv4.addSubnet("100.64.0.0", 10, "ipv4");
  ipv4.addSubnet("127.0.0.0", 8, "ipv4");
  ipv4.addSubnet("169.254.0.0", 16, "ipv4");
  ipv4.addSubnet("172.16.0.0", 12, "ipv4");
  ipv4.addSubnet("192.0.0.0", 24, "ipv4");
  ipv4.addSubnet("192.0.2.0", 24, "ipv4");
  ipv4.addSubnet("192.168.0.0", 16, "ipv4");
  ipv4.addSubnet("198.18.0.0", 15, "ipv4");
  ipv4.addSubnet("198.51.100.0", 24, "ipv4");
  ipv4.addSubnet("203.0.113.0", 24, "ipv4");
  ipv4.addSubnet("224.0.0.0", 4, "ipv4");
  ipv4.addSubnet("240.0.0.0", 4, "ipv4");

  // IPv6: unspecified, loopback, IPv4-mapped, unique-local,
  // link-local, documentation and multicast.
  ipv6.addAddress("::", "ipv6");
  ipv6.addAddress("::1", "ipv6");
  ipv6.addSubnet("::ffff:0:0", 96, "ipv6");
  ipv6.addSubnet("fc00::", 7, "ipv6");
  ipv6.addSubnet("fe80::", 10, "ipv6");
  ipv6.addSubnet("2001:db8::", 32, "ipv6");
  ipv6.addSubnet("ff00::", 8, "ipv6");

  return { ipv4, ipv6 };
}

function normalizeHostname(
  hostname: string,
): string {
  return hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[(.*)\]$/, "$1");
}

function isBlockedHostname(
  hostname: string,
): boolean {
  const normalized = normalizeHostname(hostname);

  if (BLOCKED_HOSTNAMES.has(normalized)) {
    return true;
  }

  return BLOCKED_HOSTNAME_SUFFIXES.some(
    (suffix) => normalized.endsWith(suffix),
  );
}

export class DefaultUrlSafetyPolicy
  implements UrlSafetyPolicy {
  private readonly blockedAddresses =
    createBlockedAddressLists();

  async validateAndResolve(
    value: string | URL,
  ): Promise<SafeRemoteTarget> {
    const url = this.parseUrl(value);

    this.validateUrlShape(url);

    const hostname = normalizeHostname(url.hostname);

    if (isBlockedHostname(hostname)) {
      throw new UnsafeRemoteUrlError(
        `Blocked remote hostname: ${hostname}`,
      );
    }

    const literalFamily = isIP(hostname);

    const addresses = literalFamily
      ? [{
          address: hostname,
          family: literalFamily as 4 | 6,
        }]
      : await this.resolveHostname(hostname);

    if (addresses.length === 0) {
      throw new RemoteDnsResolutionError(
        `No IP addresses resolved for ${hostname}`,
      );
    }

    for (const entry of addresses) {
      if (
        this.blockedAddresses[
          entry.family === 4 ? "ipv4" : "ipv6"
        ].check(
          entry.address,
          entry.family === 4 ? "ipv4" : "ipv6",
        )
      ) {
        throw new UnsafeRemoteUrlError(
          `Hostname ${hostname} resolves to a non-public address: ${entry.address}`,
        );
      }
    }

    const selected = addresses[0];

    return {
      url,
      address: selected.address,
      family: selected.family,
      addresses,
    };
  }

  private parseUrl(
    value: string | URL,
  ): URL {
    try {
      return value instanceof URL
        ? new URL(value.toString())
        : new URL(value);
    } catch (cause) {
      throw new InvalidRemoteUrlError(
        `Invalid remote URL: ${String(value)}`,
        { cause },
      );
    }
  }

  private validateUrlShape(
    url: URL,
  ): void {
    if (
      url.protocol !== "http:"
      && url.protocol !== "https:"
    ) {
      throw new InvalidRemoteUrlError(
        `Unsupported URL protocol: ${url.protocol}`,
      );
    }

    if (!url.hostname) {
      throw new InvalidRemoteUrlError(
        "Remote URL must contain a hostname.",
      );
    }

    if (url.username || url.password) {
      throw new InvalidRemoteUrlError(
        "Credentials embedded in remote URLs are not allowed.",
      );
    }
  }

  private async resolveHostname(
    hostname: string,
  ): Promise<Array<{
    address: string;
    family: 4 | 6;
  }>> {
    try {
      const result = await lookup(
        hostname,
        {
          all: true,
          verbatim: true,
        },
      );

      return result.map((entry) => ({
        address: entry.address,
        family: entry.family as 4 | 6,
      }));
    } catch (cause) {
      throw new RemoteDnsResolutionError(
        `Unable to resolve remote hostname: ${hostname}`,
        { cause },
      );
    }
  }
}
