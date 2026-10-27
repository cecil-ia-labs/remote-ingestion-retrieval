export interface KnowledgeBaseMetadataRequest {
  readonly filename: string;
  readonly sourceUrl: string;
  readonly title?: string;
  readonly markdown: string;
  readonly domain: string;
  readonly signal?: AbortSignal;
}

export interface KnowledgeBaseSemanticMetadata {
  readonly domain: string;
  readonly tags: readonly string[];
  readonly keywords: readonly string[];
}

export interface KnowledgeBaseMetadataEnricher {
  readonly name: string;

  enrich(
    request: KnowledgeBaseMetadataRequest,
  ): Promise<KnowledgeBaseSemanticMetadata>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isKnowledgeBaseMetadataEnricher(
  value: unknown,
): value is KnowledgeBaseMetadataEnricher {
  return isRecord(value)
    && typeof value.name === "string"
    && typeof value.enrich === "function";
}

function validatedLabels(
  value: unknown,
  field: "tags" | "keywords",
  maximum: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    throw new Error(`${field} must contain 1-${maximum} labels.`);
  }

  const candidates: readonly unknown[] = value;
  const labels: string[] = [];

  for (const candidate of candidates) {
    if (
      typeof candidate !== "string"
      || candidate.length > 64
      || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(candidate)
    ) {
      throw new Error(`${field} must contain concise lowercase snake_case labels.`);
    }

    if (!labels.includes(candidate)) {
      labels.push(candidate);
    }
  }

  if (labels.join(",").length > 512) {
    throw new Error(`${field} exceeds the Vector Store attribute limit.`);
  }

  return Object.freeze(labels);
}

export function validateKnowledgeBaseSemanticMetadata(
  value: unknown,
  expectedDomain: string,
): KnowledgeBaseSemanticMetadata {
  if (!isRecord(value) || value.domain !== expectedDomain) {
    throw new Error(`Semantic metadata must retain domain "${expectedDomain}".`);
  }

  return {
    domain: expectedDomain,
    tags: validatedLabels(value.tags, "tags", 8),
    keywords: validatedLabels(value.keywords, "keywords", 10),
  };
}
