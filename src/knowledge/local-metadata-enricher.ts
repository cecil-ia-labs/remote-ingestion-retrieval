import type {
  KnowledgeBaseMetadataEnricher,
  KnowledgeBaseMetadataRequest,
} from "./knowledge-base-metadata-enricher.js";

import {
  validateKnowledgeBaseSemanticMetadata,
} from "./knowledge-base-metadata-enricher.js";

const STOPWORDS = new Set([
  "about", "after", "also", "and", "are", "been", "being", "between",
  "can", "com", "como", "comum", "comuns", "das", "del", "des", "dos",
  "each", "example", "examples", "for", "from", "have", "here", "how",
  "into", "its", "learn", "lesson", "mais", "more", "most", "not",
  "our", "para", "part", "page", "pela", "pelo", "por", "que",
  "section", "some", "such", "than", "that", "the", "their", "them",
  "there", "these", "this", "those", "through", "uma", "using", "with",
  "your",
  // Italian function words and common instructional filler.
  "agli", "alla", "alle", "allo", "anche", "avere", "come", "con",
  "dai", "dal", "dalla", "dalle", "degli", "dei", "della", "delle",
  "dello", "di", "ed", "essere", "gli", "il", "in", "la", "le", "lo",
  "ma", "nei", "nel", "nella", "nelle", "non", "per", "piu", "puo",
  "quale", "quali", "questa", "queste", "questi", "questo", "senza",
  "sono", "sua", "sue", "sui", "sul", "sulla", "sulle", "tra", "una",
  "uno",
]);

const GENERIC_HEADINGS = new Set([
  "back_to_lesson_overview", "course_content", "examples", "implementation",
  "implementations", "introduction", "overview", "prerequisites",
  "resources", "summary",
  // Labels produced by label() for common Italian navigation headings.
  "argomenti_corso", "conclusione", "conclusioni", "contenuto_corso",
  "cosa_imparerai", "esempi", "esempio", "implementazione",
  "implementazioni", "indice", "introduzione", "panoramica",
  "panoramica_lezione", "prerequisiti", "riepilogo", "risorse",
  "riassunto", "torna_panoramica", "torna_panoramica_lezione",
]);

function textWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z][a-z0-9]*/g) ?? [];
}

function isMeaningfulWord(value: string): boolean {
  return value.length >= 4 && !STOPWORDS.has(value);
}

function label(value: string): string {
  return textWords(value)
    .filter((word) => !STOPWORDS.has(word))
    .join("_")
    .slice(0, 64)
    .replace(/_+$/g, "");
}

function cleanMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");
}

function headings(markdown: string): string[] {
  const result: string[] = [];

  for (const line of cleanMarkdown(markdown).split(/\r?\n/)) {
    const heading = line.match(/^#{1,3}\s+(.+)$/)?.[1];

    if (!heading) {
      continue;
    }

    const candidate = label(heading);

    if (
      candidate
      && !GENERIC_HEADINGS.has(candidate)
      && !candidate.startsWith("back_to_")
      && !result.includes(candidate)
    ) {
      result.push(candidate);
    }
  }

  return result;
}

function rankedTerms(markdown: string): string[] {
  const words = textWords(cleanMarkdown(markdown.slice(0, 100_000)));
  const counts = new Map<string, number>();

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];

    if (!word || !isMeaningfulWord(word)) {
      continue;
    }

    counts.set(word, (counts.get(word) ?? 0) + 1);

    const next = words[index + 1];

    if (next && isMeaningfulWord(next)) {
      const phrase = `${word}_${next}`;
      counts.set(phrase, (counts.get(phrase) ?? 0) + 2);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([term]) => term)
    .filter((term) => term.length <= 64);
}

function uniqueLabels(values: readonly string[], limit: number): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  let characterCount = 0;

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    const nextCount = characterCount + value.length + (result.length > 0 ? 1 : 0);

    if (nextCount > 512) {
      continue;
    }

    result.push(value);
    seen.add(value);
    characterCount = nextCount;

    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

export class LocalMetadataEnricher
  implements KnowledgeBaseMetadataEnricher {
  readonly name = "local-markdown-keywords-v1";

  async enrich(request: KnowledgeBaseMetadataRequest) {
    request.signal?.throwIfAborted();

    const headingLabels = headings(request.markdown);

    if (headingLabels.length === 0 && request.title) {
      const titleLabel = label(request.title);

      if (titleLabel && !GENERIC_HEADINGS.has(titleLabel)) {
        headingLabels.push(titleLabel);
      }
    }

    const terms = rankedTerms(request.markdown);
    const tags = uniqueLabels([
      request.domain,
      ...headingLabels,
      ...terms.filter((term) => term.includes("_")),
    ], 8);
    const keywords = uniqueLabels([
      ...headingLabels,
      ...terms,
      request.domain,
    ], 10);

    return validateKnowledgeBaseSemanticMetadata({
      domain: request.domain,
      tags,
      keywords,
    }, request.domain);
  }
}
