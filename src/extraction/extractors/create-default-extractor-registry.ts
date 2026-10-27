import {
  ContentExtractorRegistry,
} from "../content-extractor-registry.js";

import type {
  HtmlExtractionOptions,
} from "./html-extraction.types.js";

import {
  CsvExtractor,
} from "./csv-extractor.js";

import {
  HtmlExtractor,
} from "./html-extractor.js";

import {
  JsonExtractor,
} from "./json-extractor.js";

import {
  MarkdownExtractor,
} from "./markdown-extractor.js";

import {
  PdfExtractor,
} from "./pdf-extractor.js";

import type {
  PdfMarkdownProcessor,
} from "./pdf-extractor.js";

import {
  TextExtractor,
} from "./text-extractor.js";

export interface DefaultExtractorRegistryOptions {
  pdfProcessor?:
    PdfMarkdownProcessor;

  html?:
    HtmlExtractionOptions;
}

export function createDefaultExtractorRegistry(
  options:
    DefaultExtractorRegistryOptions = {},
): ContentExtractorRegistry {
  return new ContentExtractorRegistry(
    [
      ...(options.pdfProcessor
        ? [
            new PdfExtractor(
              options.pdfProcessor,
            ),
          ]
        : []),

      new MarkdownExtractor(),
      new JsonExtractor(),
      new CsvExtractor(),
      new HtmlExtractor(
        options.html,
      ),
      new TextExtractor(),
    ],
  );
}
