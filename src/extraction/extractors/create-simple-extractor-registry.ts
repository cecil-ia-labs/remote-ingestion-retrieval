import {
  ContentExtractorRegistry,
} from "../content-extractor-registry.js";

import {
  CsvExtractor,
} from "./csv-extractor.js";

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

export interface SimpleExtractorRegistryOptions {
  pdfProcessor?:
    PdfMarkdownProcessor;
}

export function createSimpleExtractorRegistry(
  options:
    SimpleExtractorRegistryOptions = {},
): ContentExtractorRegistry {
  const extractors = [
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
    new TextExtractor(),
  ];

  return new ContentExtractorRegistry(
    extractors,
  );
}
