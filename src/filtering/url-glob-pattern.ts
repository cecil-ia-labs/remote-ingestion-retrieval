function escapeRegex(value: string): string {
  return value.replace(/[\\^$+?.()|{}[\]]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  let source = "";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];

    if (char === "*" && pattern[index + 1] === "*") {
      source += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      source += "[^/]*";
      continue;
    }

    source += escapeRegex(char ?? "");
  }

  return new RegExp(`^${source}$`);
}

function normalizeAbsolutePattern(pattern: string): string {
  const match = pattern.match(/^(https?):\/\/([^/]+)(.*)$/i);

  if (!match) {
    return pattern;
  }

  const scheme = match[1]?.toLowerCase() ?? "https";
  let authority = match[2]?.toLowerCase() ?? "";
  const remainder = match[3] || "/";

  if (scheme === "http" && authority.endsWith(":80")) {
    authority = authority.slice(0, -3);
  }

  if (scheme === "https" && authority.endsWith(":443")) {
    authority = authority.slice(0, -4);
  }

  return `${scheme}://${authority}${remainder}`;
}

function normalizePathPattern(pattern: string): string {
  return pattern.startsWith("/")
    ? pattern
    : `/${pattern}`;
}

function pathnameOnly(value: string): string {
  const queryIndex = value.indexOf("?");

  return queryIndex >= 0
    ? value.slice(0, queryIndex)
    : value;
}

function normalizePathForAncestor(pathname: string): string {
  if (pathname === "/") {
    return "/";
  }

  return pathname.endsWith("/")
    ? pathname
    : `${pathname}/`;
}

export class UrlGlobPattern {
  readonly pattern: string;

  private readonly absolute: boolean;
  private readonly includesQuery: boolean;
  private readonly matcher: RegExp;
  private readonly traversalOrigin?: string;
  private readonly traversalPathPattern: string;
  private readonly hasWildcard: boolean;

  constructor(pattern: string) {
    const trimmed = pattern.trim();

    if (!trimmed) {
      throw new TypeError("Crawl filter pattern must not be empty.");
    }

    this.absolute = /^https?:\/\//i.test(trimmed);
    this.pattern = this.absolute
      ? normalizeAbsolutePattern(trimmed)
      : normalizePathPattern(trimmed);

    this.includesQuery = this.pattern.includes("?");
    this.matcher = globToRegex(this.pattern);
    this.hasWildcard = this.pattern.includes("*");

    if (this.absolute) {
      const match = this.pattern.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
      const originPattern = match?.[1];

      if (originPattern && !originPattern.includes("*")) {
        this.traversalOrigin = originPattern.toLowerCase();
      }

      this.traversalPathPattern = pathnameOnly(match?.[2] || "/");
    } else {
      this.traversalPathPattern = pathnameOnly(this.pattern);
    }
  }

  matches(urlValue: string): boolean {
    const url = new URL(urlValue);

    const target = this.absolute
      ? url.toString()
      : this.includesQuery
        ? `${url.pathname}${url.search}`
        : url.pathname;

    return this.matcher.test(target);
  }

  /**
   * Conservative traversal pruning for include rules.
   *
   * It allows ancestors of an include prefix and, for wildcard rules, URLs
   * already inside the static directory prefix. This keeps `/` -> `/docs` ->
   * `/docs/api/...` reachable while pruning unrelated branches such as
   * `/blog` for an include rule `/docs/**`.
   */
  mayMatchDescendant(urlValue: string): boolean {
    const url = new URL(urlValue);

    if (
      this.traversalOrigin
      && url.origin.toLowerCase() !== this.traversalOrigin
    ) {
      return false;
    }

    const candidate = url.pathname;
    const wildcardIndex = this.traversalPathPattern.indexOf("*");
    const staticPrefix = wildcardIndex >= 0
      ? this.traversalPathPattern.slice(0, wildcardIndex)
      : this.traversalPathPattern;

    if (!staticPrefix || staticPrefix === "/") {
      return true;
    }

    const candidateAsParent = normalizePathForAncestor(candidate);

    if (
      staticPrefix === candidate
      || staticPrefix.startsWith(candidateAsParent)
    ) {
      return true;
    }

    if (!this.hasWildcard) {
      return false;
    }

    const lastSlash = staticPrefix.lastIndexOf("/");
    const staticDirectory = lastSlash >= 0
      ? staticPrefix.slice(0, lastSlash + 1)
      : "/";

    return candidate.startsWith(staticDirectory);
  }
}
