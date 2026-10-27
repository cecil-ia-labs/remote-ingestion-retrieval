import {
  DefaultUrlSafetyPolicy,
} from "../remote/index.js";

import type {
  UrlSafetyPolicy,
} from "../remote/index.js";

export type PuppeteerRequestAction =
  | "continue"
  | "abort";

export type PuppeteerRequestDecisionReason =
  | "allowed-network"
  | "allowed-local-scheme"
  | "blocked-resource-type"
  | "blocked-protocol"
  | "unsafe-network-target";

export interface PuppeteerRequestDecision {
  action:
    PuppeteerRequestAction;

  reason:
    PuppeteerRequestDecisionReason;
}

export interface PuppeteerRequestPolicyOptions {
  safetyPolicy?:
    UrlSafetyPolicy;

  /**
   * Resource types that do not contribute to textual extraction.
   *
   * Images, media and fonts are blocked by default.
   */
  blockedResourceTypes?:
    readonly string[];

  /**
   * Schemes generated locally by the page and allowed without DNS checks.
   */
  allowedLocalSchemes?:
    readonly string[];
}

export class PuppeteerRequestPolicy {
  private readonly safetyPolicy:
    UrlSafetyPolicy;

  private readonly blockedResourceTypes:
    ReadonlySet<string>;

  private readonly allowedLocalSchemes:
    ReadonlySet<string>;

  constructor(
    options:
      PuppeteerRequestPolicyOptions = {},
  ) {
    this.safetyPolicy =
      options.safetyPolicy
      ?? new DefaultUrlSafetyPolicy();

    this.blockedResourceTypes =
      new Set(
        options.blockedResourceTypes
        ?? [
          "image",
          "media",
          "font",
        ],
      );

    this.allowedLocalSchemes =
      new Set(
        options.allowedLocalSchemes
        ?? [
          "data:",
          "blob:",
          "about:",
        ],
      );
  }

  async evaluate(
    urlValue: string,
    resourceType: string,
  ): Promise<PuppeteerRequestDecision> {
    if (
      this.blockedResourceTypes
        .has(
          resourceType,
        )
    ) {
      return {
        action:
          "abort",

        reason:
          "blocked-resource-type",
      };
    }

    let url:
      URL;

    try {
      url =
        new URL(
          urlValue,
        );
    } catch {
      return {
        action:
          "abort",

        reason:
          "blocked-protocol",
      };
    }

    if (
      this.allowedLocalSchemes
        .has(
          url.protocol,
        )
    ) {
      return {
        action:
          "continue",

        reason:
          "allowed-local-scheme",
      };
    }

    if (
      url.protocol !== "http:"
      && url.protocol !== "https:"
    ) {
      return {
        action:
          "abort",

        reason:
          "blocked-protocol",
      };
    }

    try {
      await this.safetyPolicy
        .validateAndResolve(
          url,
        );

      return {
        action:
          "continue",

        reason:
          "allowed-network",
      };
    } catch {
      return {
        action:
          "abort",

        reason:
          "unsafe-network-target",
      };
    }
  }
}
