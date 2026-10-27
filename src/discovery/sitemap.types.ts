export interface SitemapUrlEntry {
  loc:
    string;

  lastModified?:
    Date;

  changeFrequency?:
    string;

  priority?:
    number;
}

export interface SitemapIndexEntry {
  loc:
    string;

  lastModified?:
    Date;
}

export interface ParsedUrlSet {
  kind:
    "urlset";

  urls:
    readonly SitemapUrlEntry[];

  invalidEntryCount:
    number;
}

export interface ParsedSitemapIndex {
  kind:
    "sitemapindex";

  sitemaps:
    readonly SitemapIndexEntry[];

  invalidEntryCount:
    number;
}

export type ParsedSitemap =
  | ParsedUrlSet
  | ParsedSitemapIndex;
