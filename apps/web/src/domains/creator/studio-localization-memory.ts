export interface StudioLocalizationTerm {
  readonly id: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly source: string;
  readonly target: string;
  readonly caseSensitive: boolean;
  readonly speakerIds: readonly string[];
  readonly forbiddenAlternatives: readonly string[];
}

export interface StudioTranslationMemoryEntry {
  readonly id: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly source: string;
  readonly target: string;
  readonly speakerId: string | null;
  readonly contextTags: readonly string[];
  readonly approved: boolean;
  readonly updatedAt: string;
}

export interface StudioLocalizationSegment {
  readonly id: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly source: string;
  readonly speakerId: string | null;
  readonly contextTags: readonly string[];
}

export interface StudioLocalizationSuggestion {
  readonly status: "exact" | "fuzzy" | "none" | "blocked";
  readonly targetText: string | null;
  readonly sourceEntryId: string | null;
  readonly confidence: number;
  readonly satisfiedTermIds: readonly string[];
  readonly warnings: readonly string[];
}

function normalized(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
}

function tokens(value: string): ReadonlySet<string> {
  return new Set(
    normalized(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean),
  );
}

function jaccard(first: ReadonlySet<string>, second: ReadonlySet<string>): number {
  if (first.size === 0 || second.size === 0) return 0;
  let intersection = 0;
  for (const token of first) {
    if (second.has(token)) intersection += 1;
  }
  return intersection / (first.size + second.size - intersection);
}

function includesTerm(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (caseSensitive) return haystack.includes(needle);
  return normalized(haystack).includes(normalized(needle));
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0)
    && new Set(values).size === values.length;
}

export function validateStudioLocalizationMemory(input: {
  readonly terms: readonly StudioLocalizationTerm[];
  readonly entries: readonly StudioTranslationMemoryEntry[];
}): readonly string[] {
  const issues: string[] = [];
  const termIds = input.terms.map((term) => term.id);
  const entryIds = input.entries.map((entry) => entry.id);
  if (!uniqueNonEmpty(termIds)) issues.push("term-id");
  if (!uniqueNonEmpty(entryIds)) issues.push("entry-id");

  for (const term of input.terms) {
    if (
      !term.sourceLocale.trim()
      || !term.targetLocale.trim()
      || !term.source.trim()
      || !term.target.trim()
      || !uniqueNonEmpty(term.speakerIds)
      || !uniqueNonEmpty(term.forbiddenAlternatives)
    ) {
      issues.push("term-required");
    }
    if (term.sourceLocale === term.targetLocale) issues.push("term-locale-pair");
  }
  for (const entry of input.entries) {
    if (
      !entry.sourceLocale.trim()
      || !entry.targetLocale.trim()
      || !entry.source.trim()
      || !entry.target.trim()
      || !uniqueNonEmpty(entry.contextTags)
      || !Number.isFinite(Date.parse(entry.updatedAt))
    ) {
      issues.push("entry-required");
    }
    if (entry.sourceLocale === entry.targetLocale) issues.push("entry-locale-pair");
    if (entry.speakerId !== null && !entry.speakerId.trim()) issues.push("entry-speaker");
  }
  return Object.freeze([...new Set(issues)]);
}

function localeMatches(first: string, second: string): boolean {
  return first.toLocaleLowerCase() === second.toLocaleLowerCase();
}

function contextSimilarity(first: readonly string[], second: readonly string[]): number {
  return jaccard(new Set(first.map(normalized)), new Set(second.map(normalized)));
}

function candidateScore(
  segment: StudioLocalizationSegment,
  entry: StudioTranslationMemoryEntry,
): number {
  if (normalized(segment.source) === normalized(entry.source)) return 1;
  const sourceScore = jaccard(tokens(segment.source), tokens(entry.source));
  const speakerBonus = segment.speakerId !== null && segment.speakerId === entry.speakerId ? 0.08 : 0;
  const contextBonus = contextSimilarity(segment.contextTags, entry.contextTags) * 0.12;
  return Math.min(0.99, sourceScore * 0.8 + speakerBonus + contextBonus);
}

export function suggestStudioLocalization(input: {
  readonly segment: StudioLocalizationSegment;
  readonly terms: readonly StudioLocalizationTerm[];
  readonly entries: readonly StudioTranslationMemoryEntry[];
  readonly minimumFuzzyConfidence?: number;
}): StudioLocalizationSuggestion {
  const { segment, terms, entries } = input;
  const minimumFuzzyConfidence = input.minimumFuzzyConfidence ?? 0.55;
  if (
    !segment.id.trim()
    || !segment.sourceLocale.trim()
    || !segment.targetLocale.trim()
    || !segment.source.trim()
    || segment.sourceLocale === segment.targetLocale
    || !uniqueNonEmpty(segment.contextTags)
    || !Number.isFinite(minimumFuzzyConfidence)
    || minimumFuzzyConfidence < 0
    || minimumFuzzyConfidence > 1
  ) {
    throw new Error("A valid localization segment and confidence threshold are required.");
  }
  const validation = validateStudioLocalizationMemory({ terms, entries });
  if (validation.length > 0) {
    throw new Error(`Localization memory is invalid: ${validation.join(", ")}`);
  }

  const candidates = entries
    .filter((entry) => entry.approved)
    .filter((entry) => localeMatches(entry.sourceLocale, segment.sourceLocale))
    .filter((entry) => localeMatches(entry.targetLocale, segment.targetLocale))
    .map((entry) => ({ entry, score: candidateScore(segment, entry) }))
    .sort((left, right) => right.score - left.score
      || Date.parse(right.entry.updatedAt) - Date.parse(left.entry.updatedAt)
      || left.entry.id.localeCompare(right.entry.id));
  const best = candidates[0];
  if (!best || best.score < minimumFuzzyConfidence) {
    return Object.freeze({
      status: "none",
      targetText: null,
      sourceEntryId: null,
      confidence: 0,
      satisfiedTermIds: Object.freeze([]),
      warnings: Object.freeze([]),
    });
  }

  const applicableTerms = terms.filter((term) => {
    if (!localeMatches(term.sourceLocale, segment.sourceLocale)
      || !localeMatches(term.targetLocale, segment.targetLocale)) return false;
    if (term.speakerIds.length > 0
      && (segment.speakerId === null || !term.speakerIds.includes(segment.speakerId))) return false;
    return includesTerm(segment.source, term.source, term.caseSensitive);
  });
  const warnings: string[] = [];
  const satisfiedTermIds: string[] = [];
  for (const term of applicableTerms) {
    if (includesTerm(best.entry.target, term.target, term.caseSensitive)) {
      satisfiedTermIds.push(term.id);
    } else {
      warnings.push(`glossary-mismatch:${term.id}`);
    }
    for (const alternative of term.forbiddenAlternatives) {
      if (includesTerm(best.entry.target, alternative, term.caseSensitive)) {
        warnings.push(`forbidden-alternative:${term.id}:${alternative}`);
      }
    }
  }

  const exact = normalized(segment.source) === normalized(best.entry.source);
  return Object.freeze({
    status: warnings.length > 0 ? "blocked" : exact ? "exact" : "fuzzy",
    targetText: best.entry.target,
    sourceEntryId: best.entry.id,
    confidence: best.score,
    satisfiedTermIds: Object.freeze(satisfiedTermIds),
    warnings: Object.freeze(warnings),
  });
}
