import type {
  RemoteTextLoader,
} from "./remote-text-loader.js";

import {
  HttpRemoteTextLoader,
} from "./remote-text-loader.js";

import {
  RobotsTxtParser,
} from "./robots-txt-parser.js";

export interface RobotsDiscovery {
  robotsUrl:
    string;

  exists:
    boolean;

  sitemapUrls:
    readonly string[];
}

export interface RobotsResolverOptions {
  loader?:
    RemoteTextLoader;

  parser?:
    RobotsTxtParser;

  maxBytes?:
    number;
}

export class RobotsResolver {
  private readonly loader:
    RemoteTextLoader;

  private readonly parser:
    RobotsTxtParser;

  private readonly maxBytes:
    number;

  constructor(
    options:
      RobotsResolverOptions = {},
  ) {
    this.loader =
      options.loader
      ?? new HttpRemoteTextLoader();

    this.parser =
      options.parser
      ?? new RobotsTxtParser();

    this.maxBytes =
      options.maxBytes
      ?? 512 * 1024;
  }

  async resolve(
    rootUrl: string,
    signal?: AbortSignal,
  ): Promise<RobotsDiscovery> {
    const root =
      new URL(
        rootUrl,
      );

    const robotsUrl =
      new URL(
        "/robots.txt",
        root.origin,
      ).toString();

    const document =
      await this.loader
        .loadOptional(
          robotsUrl,
          {
            maxBytes:
              this.maxBytes,

            signal,
          },
        );

    if (!document) {
      return {
        robotsUrl,

        exists:
          false,

        sitemapUrls:
          [],
      };
    }

    const parsed =
      this.parser.parse(
        document.text,
        document.resolvedUrl,
      );

    return {
      robotsUrl:
        document.resolvedUrl,

      exists:
        true,

      sitemapUrls:
        parsed.sitemapUrls,
    };
  }
}
