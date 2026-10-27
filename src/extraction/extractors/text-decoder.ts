import type {
  FetchedResource,
} from "../../remote/index.js";

export interface DecodedText {
  text: string;
  charset: string;
  hadBom: boolean;
}

export interface TextDecoderOptions {
  defaultCharset?: string;
}

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const UTF16_LE_BOM = Buffer.from([0xff, 0xfe]);
const UTF16_BE_BOM = Buffer.from([0xfe, 0xff]);

const WINDOWS_1252_SPECIAL: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

function extractCharsetFromContentType(
  contentType?: string,
): string | undefined {
  if (!contentType) {
    return undefined;
  }

  const match = contentType.match(
    /(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/i,
  );

  return match?.[1]?.trim().toLowerCase();
}

function detectBom(
  body: Buffer,
): {
  charset?: string;
  offset: number;
  hadBom: boolean;
} {
  if (
    body.length >= UTF8_BOM.length
    && body.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)
  ) {
    return {
      charset: "utf-8",
      offset: UTF8_BOM.length,
      hadBom: true,
    };
  }

  if (
    body.length >= UTF16_LE_BOM.length
    && body.subarray(0, UTF16_LE_BOM.length).equals(UTF16_LE_BOM)
  ) {
    return {
      charset: "utf-16le",
      offset: UTF16_LE_BOM.length,
      hadBom: true,
    };
  }

  if (
    body.length >= UTF16_BE_BOM.length
    && body.subarray(0, UTF16_BE_BOM.length).equals(UTF16_BE_BOM)
  ) {
    return {
      charset: "utf-16be",
      offset: UTF16_BE_BOM.length,
      hadBom: true,
    };
  }

  return {
    offset: 0,
    hadBom: false,
  };
}

function normalizeCharset(
  value: string,
): string {
  const normalized = value.trim().toLowerCase();

  const aliases: Record<string, string> = {
    utf8: "utf-8",
    utf16: "utf-16le",
    utf16le: "utf-16le",
    utf16be: "utf-16be",
    "iso-8859-1": "latin1",
    "iso8859-1": "latin1",
    "windows1252": "windows-1252",
    cp1252: "windows-1252",
    ascii: "utf-8",
    "us-ascii": "utf-8",
  };

  return aliases[normalized] ?? normalized;
}

function decodeUtf16Be(
  body: Buffer,
): string {
  const swapped = Buffer.allocUnsafe(body.length);

  for (
    let index = 0;
    index < body.length;
    index += 2
  ) {
    swapped[index] = body[index + 1] ?? 0;
    swapped[index + 1] = body[index] ?? 0;
  }

  return swapped.toString("utf16le");
}

function decodeWindows1252(
  body: Buffer,
): string {
  let result = "";

  for (const byte of body) {
    if (
      byte >= 0x80
      && byte <= 0x9f
      && WINDOWS_1252_SPECIAL[byte]
    ) {
      result += WINDOWS_1252_SPECIAL[byte];
      continue;
    }

    result += String.fromCodePoint(byte);
  }

  return result;
}

function decodeBuffer(
  body: Buffer,
  charset: string,
): string {
  switch (charset) {
    case "utf-8":
      return body.toString("utf8");

    case "utf-16le":
      return body.toString("utf16le");

    case "utf-16be":
      return decodeUtf16Be(body);

    case "latin1":
      return body.toString("latin1");

    case "windows-1252":
      return decodeWindows1252(body);

    default:
      throw new Error(
        `Unsupported character encoding: ${charset}`,
      );
  }
}

export class RemoteTextDecoder {
  private readonly defaultCharset: string;

  constructor(
    options: TextDecoderOptions = {},
  ) {
    this.defaultCharset = normalizeCharset(
      options.defaultCharset ?? "utf-8",
    );
  }

  decode(
    resource: FetchedResource,
  ): DecodedText {
    const bom = detectBom(resource.body);

    const headerCharset = extractCharsetFromContentType(
      resource.headers["content-type"],
    );

    const charset = normalizeCharset(
      bom.charset
      ?? headerCharset
      ?? this.defaultCharset,
    );

    const body = resource.body.subarray(bom.offset);

    return {
      text: decodeBuffer(body, charset),
      charset,
      hadBom: bom.hadBom,
    };
  }
}
