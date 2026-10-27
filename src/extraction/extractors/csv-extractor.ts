import type {
  JsonValue,
} from "../../domain/index.js";

import type {
  FetchedResource,
} from "../../remote/index.js";

import type {
  ContentExtractionContext,
  ContentExtractor,
} from "../content-extractor.js";

import {
  createDocumentMetadata,
} from "../document-metadata.js";

import type {
  StructuredExtractedDocument,
} from "../extracted-document.js";

import {
  supportsResourceType,
} from "./resource-support.js";

import {
  RemoteTextDecoder,
} from "./text-decoder.js";

export interface CsvExtractorOptions {
  delimiter?: string;
  columns?: boolean;
  trim?: boolean;
  skipEmptyLines?: boolean;
}

function countUnquotedDelimiter(
  line: string,
  delimiter: string,
): number {
  let quoted = false;
  let count = 0;

  for (
    let index = 0;
    index < line.length;
    index += 1
  ) {
    const character = line[index];

    if (character === '"') {
      if (
        quoted
        && line[index + 1] === '"'
      ) {
        index += 1;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (
      !quoted
      && character === delimiter
    ) {
      count += 1;
    }
  }

  return count;
}

function firstLogicalRecord(
  text: string,
): string {
  let quoted = false;

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character = text[index];

    if (character === '"') {
      if (
        quoted
        && text[index + 1] === '"'
      ) {
        index += 1;
        continue;
      }

      quoted = !quoted;
      continue;
    }

    if (
      !quoted
      && (
        character === "\n"
        || character === "\r"
      )
    ) {
      return text.slice(0, index);
    }
  }

  return text;
}

function detectDelimiter(
  text: string,
): string {
  const line = firstLogicalRecord(text).trim();

  if (!line) {
    return ",";
  }

  const candidates = [
    ",",
    ";",
    "\t",
    "|",
  ];

  let best = ",";
  let bestCount = -1;

  for (const candidate of candidates) {
    const count = countUnquotedDelimiter(
      line,
      candidate,
    );

    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }

  return best;
}

function parseCsvRows(
  text: string,
  delimiter: string,
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const commitField = (): void => {
    row.push(field);
    field = "";
  };

  const commitRow = (): void => {
    commitField();
    rows.push(row);
    row = [];
  };

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === '"' && field.length === 0) {
      quoted = true;
      continue;
    }

    if (character === delimiter) {
      commitField();
      continue;
    }

    if (character === "\n") {
      commitRow();
      continue;
    }

    if (character === "\r") {
      if (text[index + 1] === "\n") {
        index += 1;
      }

      commitRow();
      continue;
    }

    field += character;
  }

  if (
    field.length > 0
    || row.length > 0
  ) {
    commitRow();
  }

  if (quoted) {
    throw new SyntaxError(
      "Invalid CSV document: unterminated quoted field",
    );
  }

  return rows;
}

function createUniqueColumns(
  rawHeaders: string[],
  trim: boolean,
): string[] {
  const counts = new Map<string, number>();

  return rawHeaders.map(
    (header, index) => {
      const normalized = trim
        ? header.trim()
        : header;

      const base = normalized
        || `column_${index + 1}`;

      const current = counts.get(base) ?? 0;
      counts.set(base, current + 1);

      return current === 0
        ? base
        : `${base}_${current + 1}`;
    },
  );
}

function normalizeRows(
  rows: string[][],
  trim: boolean,
  skipEmptyLines: boolean,
): string[][] {
  return rows
    .map(
      (row) => trim
        ? row.map((value) => value.trim())
        : row,
    )
    .filter(
      (row) => !skipEmptyLines
        || row.some((value) => value.length > 0),
    );
}

export class CsvExtractor
  implements ContentExtractor {
  readonly name = "csv";

  private readonly options: Required<
    Pick<
      CsvExtractorOptions,
      "columns" | "trim" | "skipEmptyLines"
    >
  > & Pick<CsvExtractorOptions, "delimiter">;

  constructor(
    options: CsvExtractorOptions = {},
    private readonly decoder = new RemoteTextDecoder(),
  ) {
    this.options = {
      delimiter: options.delimiter,
      columns: options.columns ?? true,
      trim: options.trim ?? true,
      skipEmptyLines: options.skipEmptyLines ?? true,
    };
  }

  supports(
    resource: FetchedResource,
  ): boolean {
    return supportsResourceType(
      resource,
      "csv",
      [
        "text/csv",
        "application/csv",
      ],
    );
  }

  async extract(
    resource: FetchedResource,
    _context?: ContentExtractionContext,
  ): Promise<StructuredExtractedDocument> {
    const decoded = this.decoder.decode(resource);

    const delimiter = this.options.delimiter
      ?? detectDelimiter(decoded.text);

    const rows = normalizeRows(
      parseCsvRows(decoded.text, delimiter),
      this.options.trim,
      this.options.skipEmptyLines,
    );

    let content: JsonValue;

    if (this.options.columns) {
      const headerRow = rows.shift() ?? [];
      const columns = createUniqueColumns(
        headerRow,
        false,
      );

      content = rows.map(
        (row) => Object.fromEntries(
          columns.map(
            (column, index) => [
              column,
              row[index] ?? "",
            ],
          ),
        ),
      );
    } else {
      content = rows;
    }

    const rowCount = Array.isArray(content)
      ? content.length
      : 0;

    return {
      content,
      contentFormat: "structured",
      metadata: createDocumentMetadata(
        resource,
        {
          charset: decoded.charset,
          attributes: {
            delimiter,
            columns: this.options.columns,
            rowCount,
            hadBom: decoded.hadBom,
          },
        },
      ),
    };
  }
}
