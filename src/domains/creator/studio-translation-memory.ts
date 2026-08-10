/**
 * Studio Translation Memory — engine-neutral, deterministic dialogue translation memory.
 *
 * This module deliberately has no network, React or StudioPage dependency. Exact reuse is scoped
 * by work + speaker + source/target locale + NFKC/whitespace-normalized source. Fuzzy matches are
 * suggestions only: the `autoApply` field is a literal false and callers must require an explicit
 * author action before reuse.
 */

export const STUDIO_TRANSLATION_MEMORY_VERSION = 1;
export const STUDIO_TRANSLATION_MEMORY_KIND =
  "toonspectrum.translation-memory";
export const STUDIO_TRANSLATION_MEMORY_STORAGE_KEY =
  "toonspectrum-studio-translation-memory:v1";

export const STUDIO_TRANSLATION_MEMORY_MAX_ENTRIES = 2_000;
export const STUDIO_TRANSLATION_MEMORY_MAX_TOTAL_CHARS = 1_000_000;
export const STUDIO_TRANSLATION_MEMORY_MAX_SOURCE_CHARS = 4_000;
export const STUDIO_TRANSLATION_MEMORY_MAX_TRANSLATION_CHARS = 8_000;
export const STUDIO_TRANSLATION_MEMORY_MAX_SPEAKER_CHARS = 160;
export const STUDIO_TRANSLATION_MEMORY_MAX_SCOPE_CHARS = 200;
export const STUDIO_TRANSLATION_MEMORY_MAX_LOCALE_CHARS = 48;
export const STUDIO_TRANSLATION_MEMORY_MAX_REVISION_CHARS = 160;
export const STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_RULES = 160;
export const STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_TERM_CHARS = 240;
export const STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_BYTES = 2_000_000;
export const STUDIO_TRANSLATION_MEMORY_MAX_EXPORT_BYTES = 1_500_000;
export const STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES =
  STUDIO_TRANSLATION_MEMORY_MAX_ENTRIES * 4;
export const STUDIO_TRANSLATION_MEMORY_FUZZY_THRESHOLD = 0.86;
export const STUDIO_TRANSLATION_MEMORY_MAX_FUZZY_SUGGESTIONS = 3;

export type StudioTranslationMemoryStatus =
  | "draft"
  | "reviewed"
  | "approved";

export type StudioTranslationMemoryConflictKind =
  | "ambiguous-rule"
  | "missing-target";

export interface StudioTranslationMemoryGlossaryRule {
  readonly sourceTerm: string;
  readonly targetTerm: string;
  readonly sourceLocale?: string;
  readonly targetLocale?: string;
  readonly caseSensitive?: boolean;
}

export interface StudioTranslationMemoryGlossaryConflict {
  readonly kind: StudioTranslationMemoryConflictKind;
  readonly sourceTerm: string;
  readonly expectedTargets: readonly string[];
  readonly message: string;
}

export interface StudioTranslationMemoryEntry {
  readonly version: typeof STUDIO_TRANSLATION_MEMORY_VERSION;
  readonly id: string;
  readonly workScope: string;
  readonly sourceText: string;
  readonly speaker: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly translation: string;
  readonly status: StudioTranslationMemoryStatus;
  readonly sourceHash: string;
  readonly sourceRevision: string;
  readonly stale: boolean;
  readonly glossaryConflicts: readonly StudioTranslationMemoryGlossaryConflict[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StudioTranslationMemoryQuery {
  readonly workScope: string;
  readonly sourceText: string;
  readonly speaker?: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly sourceRevision: string | number;
}

export interface CreateStudioTranslationMemoryEntryInput
  extends StudioTranslationMemoryQuery {
  readonly translation: string;
  readonly status?: StudioTranslationMemoryStatus;
  readonly glossaryRules?: readonly StudioTranslationMemoryGlossaryRule[];
  readonly now?: number;
}

export interface StudioTranslationMemoryExactMatch {
  readonly kind: "exact";
  readonly entry: StudioTranslationMemoryEntry;
  readonly stale: boolean;
  readonly glossaryConflicts: readonly StudioTranslationMemoryGlossaryConflict[];
  readonly reusable: boolean;
}

export interface StudioTranslationMemoryFuzzySuggestion {
  readonly kind: "fuzzy";
  readonly entry: StudioTranslationMemoryEntry;
  readonly score: number;
  readonly autoApply: false;
  readonly glossaryConflicts: readonly StudioTranslationMemoryGlossaryConflict[];
  readonly reusable: boolean;
}

export interface StudioTranslationMemoryQueryResult {
  readonly exact: StudioTranslationMemoryExactMatch | null;
  readonly fuzzy: readonly StudioTranslationMemoryFuzzySuggestion[];
}

export type StudioTranslationMemoryStorage = Pick<
  Storage,
  "getItem" | "setItem"
>;

export interface StudioTranslationMemoryLoadResult {
  readonly entries: readonly StudioTranslationMemoryEntry[];
  readonly status: "ok" | "empty" | "unavailable" | "invalid";
  readonly error?: string;
}

export interface StudioTranslationMemorySaveResult {
  readonly ok: boolean;
  readonly error?: string;
}

export interface StudioTranslationMemoryImportResult {
  readonly ok: true;
  readonly entries: readonly StudioTranslationMemoryEntry[];
  readonly accepted: number;
  readonly rejected: number;
  readonly duplicates: number;
  readonly truncated: number;
}

export interface StudioTranslationMemoryImportFailure {
  readonly ok: false;
  readonly error: string;
}

export interface StudioTranslationMemoryExportResult {
  readonly ok: true;
  readonly json: string;
  readonly bytes: number;
}

export interface StudioTranslationMemoryExportFailure {
  readonly ok: false;
  readonly error: string;
}

interface MergeStudioTranslationMemoryResult {
  readonly entries: readonly StudioTranslationMemoryEntry[];
  readonly invalid: number;
  readonly duplicates: number;
  readonly truncated: number;
}

interface StoredStudioTranslationMemoryDocument {
  readonly kind: typeof STUDIO_TRANSLATION_MEMORY_KIND;
  readonly version: typeof STUDIO_TRANSLATION_MEMORY_VERSION;
  readonly entries: readonly StudioTranslationMemoryEntry[];
}

const STATUS_PRIORITY: Record<StudioTranslationMemoryStatus, number> = {
  draft: 0,
  reviewed: 1,
  approved: 2,
};

function normalizeNfkc(value: string): string {
  try {
    return value.normalize("NFKC");
  } catch {
    return value;
  }
}

/** Compatibility-normalizes and collapses every whitespace run to one ASCII space. */
export function normalizeStudioTranslationMemoryText(value: string): string {
  return normalizeNfkc(value).replace(/\s+/gu, " ").trim();
}

function normalizeCaseInsensitive(value: string): string {
  return normalizeStudioTranslationMemoryText(value).toLowerCase();
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizeStoredText(value: string): string {
  return normalizeNfkc(value).trim();
}

function normalizeLocale(value: string): string {
  return normalizeStudioTranslationMemoryText(value);
}

function normalizeLocaleKey(value: string): string {
  return normalizeLocale(value).toLowerCase();
}

function normalizeRevision(value: string | number): string {
  return normalizeStudioTranslationMemoryText(String(value));
}

function utf8Bytes(value: string): number {
  if (typeof TextEncoder === "function") {
    return new TextEncoder().encode(value).byteLength;
  }
  return value.length * 3;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(7, "0");
}

export function studioTranslationMemorySourceHash(sourceText: string): string {
  return `fnv1a32:${stableHash(normalizeStudioTranslationMemoryText(sourceText))}`;
}

function isValidStatus(value: unknown): value is StudioTranslationMemoryStatus {
  return value === "draft" || value === "reviewed" || value === "approved";
}

function identityParts(input: {
  readonly workScope: string;
  readonly sourceText: string;
  readonly speaker?: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
}): readonly string[] {
  return [
    normalizeStudioTranslationMemoryText(input.workScope),
    normalizeStudioTranslationMemoryText(input.sourceText),
    normalizeCaseInsensitive(input.speaker ?? ""),
    normalizeLocaleKey(input.sourceLocale),
    normalizeLocaleKey(input.targetLocale),
  ];
}

/** Full, collision-free identity used for matching and duplicate grouping. */
export function studioTranslationMemoryIdentity(input: {
  readonly workScope: string;
  readonly sourceText: string;
  readonly speaker?: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
}): string {
  return JSON.stringify(identityParts(input));
}

function entryCharacterCost(entry: StudioTranslationMemoryEntry): number {
  return (
    entry.workScope.length
    + entry.sourceText.length
    + entry.speaker.length
    + entry.sourceLocale.length
    + entry.targetLocale.length
    + entry.translation.length
    + entry.sourceRevision.length
  );
}

function validateInputField(
  value: string,
  label: string,
  maxChars: number,
  allowEmpty = false
): { ok: true; value: string } | { ok: false; error: string } {
  const normalized = normalizeStoredText(value);
  if (!allowEmpty && normalized.length === 0) {
    return { ok: false, error: `${label}이(가) 비어 있습니다.` };
  }
  if (normalized.length > maxChars) {
    return {
      ok: false,
      error: `${label}은(는) ${maxChars.toLocaleString("ko-KR")}자 이하여야 합니다.`,
    };
  }
  return { ok: true, value: normalized };
}

function localeMatches(ruleLocale: string | undefined, actualLocale: string): boolean {
  return (
    !ruleLocale
    || normalizeLocaleKey(ruleLocale) === normalizeLocaleKey(actualLocale)
  );
}

function normalizeGlossaryRule(
  rule: StudioTranslationMemoryGlossaryRule
): StudioTranslationMemoryGlossaryRule | null {
  const sourceTerm = normalizeStoredText(rule.sourceTerm);
  const targetTerm = normalizeStoredText(rule.targetTerm);
  if (
    sourceTerm.length === 0
    || targetTerm.length === 0
    || sourceTerm.length > STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_TERM_CHARS
    || targetTerm.length > STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_TERM_CHARS
  ) {
    return null;
  }
  const sourceLocale = rule.sourceLocale
    ? normalizeLocale(rule.sourceLocale).slice(
        0,
        STUDIO_TRANSLATION_MEMORY_MAX_LOCALE_CHARS
      )
    : undefined;
  const targetLocale = rule.targetLocale
    ? normalizeLocale(rule.targetLocale).slice(
        0,
        STUDIO_TRANSLATION_MEMORY_MAX_LOCALE_CHARS
      )
    : undefined;
  return {
    sourceTerm,
    targetTerm,
    sourceLocale: sourceLocale || undefined,
    targetLocale: targetLocale || undefined,
    caseSensitive: rule.caseSensitive === true,
  };
}

/** Parses bounded `source: target`, `source = target` or `source => target` glossary lines. */
export function parseStudioTranslationMemoryGlossaryText(
  glossary: string
): StudioTranslationMemoryGlossaryRule[] {
  const rules: StudioTranslationMemoryGlossaryRule[] = [];
  const seen = new Set<string>();
  for (const line of normalizeNfkc(glossary).split(/\r?\n/u)) {
    if (rules.length >= STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_RULES) break;
    const match = line.match(/^\s*(.+?)\s*(?:=>|:|=)\s*(.+?)\s*$/u);
    if (!match) continue;
    const rule = normalizeGlossaryRule({
      sourceTerm: match[1],
      targetTerm: match[2],
    });
    if (!rule) continue;
    const key = JSON.stringify([
      normalizeCaseInsensitive(rule.sourceTerm),
      normalizeCaseInsensitive(rule.targetTerm),
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(rule);
  }
  return rules;
}

export function findStudioTranslationMemoryGlossaryConflicts(input: {
  readonly sourceText: string;
  readonly translation: string;
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly rules: readonly StudioTranslationMemoryGlossaryRule[];
}): StudioTranslationMemoryGlossaryConflict[] {
  const applicable = input.rules
    .slice(0, STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_RULES)
    .map(normalizeGlossaryRule)
    .filter((rule): rule is StudioTranslationMemoryGlossaryRule => rule !== null)
    .filter(
      (rule) =>
        localeMatches(rule.sourceLocale, input.sourceLocale)
        && localeMatches(rule.targetLocale, input.targetLocale)
    )
    .filter((rule) => {
      const source = rule.caseSensitive
        ? normalizeStudioTranslationMemoryText(input.sourceText)
        : normalizeCaseInsensitive(input.sourceText);
      const term = rule.caseSensitive
        ? normalizeStudioTranslationMemoryText(rule.sourceTerm)
        : normalizeCaseInsensitive(rule.sourceTerm);
      return source.includes(term);
    });

  const bySource = new Map<
    string,
    {
      readonly displaySource: string;
      readonly rules: StudioTranslationMemoryGlossaryRule[];
    }
  >();
  for (const rule of applicable) {
    const key = rule.caseSensitive
      ? normalizeStudioTranslationMemoryText(rule.sourceTerm)
      : normalizeCaseInsensitive(rule.sourceTerm);
    const existing = bySource.get(key);
    if (existing) existing.rules.push(rule);
    else bySource.set(key, { displaySource: rule.sourceTerm, rules: [rule] });
  }

  const conflicts: StudioTranslationMemoryGlossaryConflict[] = [];
  for (const [, group] of [...bySource].sort(([left], [right]) =>
    compareCodeUnits(left, right)
  )) {
    const expectedTargets = [
      ...new Map(
        group.rules.map((rule) => [
          normalizeCaseInsensitive(rule.targetTerm),
          rule.targetTerm,
        ])
      ).values(),
    ].sort(compareCodeUnits);
    if (expectedTargets.length > 1) {
      conflicts.push({
        kind: "ambiguous-rule",
        sourceTerm: group.displaySource,
        expectedTargets,
        message: `“${group.displaySource}”에 서로 다른 용어집 번역이 지정되어 있습니다.`,
      });
      continue;
    }
    const firstRule = group.rules[0];
    const translation = firstRule.caseSensitive
      ? normalizeStudioTranslationMemoryText(input.translation)
      : normalizeCaseInsensitive(input.translation);
    const expected = firstRule.caseSensitive
      ? normalizeStudioTranslationMemoryText(expectedTargets[0])
      : normalizeCaseInsensitive(expectedTargets[0]);
    if (!translation.includes(expected)) {
      conflicts.push({
        kind: "missing-target",
        sourceTerm: group.displaySource,
        expectedTargets,
        message: `“${group.displaySource}”은(는) “${expectedTargets[0]}” 규칙과 일치하지 않습니다.`,
      });
    }
  }
  return conflicts;
}

function validNow(value: number | undefined): number {
  return Number.isFinite(value) && (value ?? -1) >= 0
    ? Math.floor(value as number)
    : Date.now();
}

export function createStudioTranslationMemoryEntry(
  input: CreateStudioTranslationMemoryEntryInput
):
  | { readonly ok: true; readonly entry: StudioTranslationMemoryEntry }
  | { readonly ok: false; readonly error: string } {
  const workScope = validateInputField(
    input.workScope,
    "작품 범위",
    STUDIO_TRANSLATION_MEMORY_MAX_SCOPE_CHARS
  );
  if (!workScope.ok) return workScope;
  const sourceText = validateInputField(
    input.sourceText,
    "원문",
    STUDIO_TRANSLATION_MEMORY_MAX_SOURCE_CHARS
  );
  if (!sourceText.ok) return sourceText;
  const speaker = validateInputField(
    input.speaker ?? "",
    "화자",
    STUDIO_TRANSLATION_MEMORY_MAX_SPEAKER_CHARS,
    true
  );
  if (!speaker.ok) return speaker;
  const sourceLocale = validateInputField(
    input.sourceLocale,
    "원문 언어",
    STUDIO_TRANSLATION_MEMORY_MAX_LOCALE_CHARS
  );
  if (!sourceLocale.ok) return sourceLocale;
  const targetLocale = validateInputField(
    input.targetLocale,
    "대상 언어",
    STUDIO_TRANSLATION_MEMORY_MAX_LOCALE_CHARS
  );
  if (!targetLocale.ok) return targetLocale;
  const translation = validateInputField(
    input.translation,
    "번역문",
    STUDIO_TRANSLATION_MEMORY_MAX_TRANSLATION_CHARS
  );
  if (!translation.ok) return translation;
  const sourceRevision = validateInputField(
    normalizeRevision(input.sourceRevision),
    "원문 리비전",
    STUDIO_TRANSLATION_MEMORY_MAX_REVISION_CHARS
  );
  if (!sourceRevision.ok) return sourceRevision;
  const status = input.status ?? "draft";
  if (!isValidStatus(status)) {
    return { ok: false, error: "지원하지 않는 번역 메모리 상태입니다." };
  }

  const now = validNow(input.now);
  const identity = studioTranslationMemoryIdentity({
    workScope: workScope.value,
    sourceText: sourceText.value,
    speaker: speaker.value,
    sourceLocale: sourceLocale.value,
    targetLocale: targetLocale.value,
  });
  const glossaryConflicts = findStudioTranslationMemoryGlossaryConflicts({
    sourceText: sourceText.value,
    translation: translation.value,
    sourceLocale: sourceLocale.value,
    targetLocale: targetLocale.value,
    rules: input.glossaryRules ?? [],
  });
  if (status === "approved" && glossaryConflicts.length > 0) {
    return {
      ok: false,
      error: "용어집 충돌이 있는 번역은 충돌을 해소한 뒤 승인할 수 있습니다.",
    };
  }

  return {
    ok: true,
    entry: {
      version: STUDIO_TRANSLATION_MEMORY_VERSION,
      id: `tm_${stableHash(identity)}`,
      workScope: workScope.value,
      sourceText: sourceText.value,
      speaker: speaker.value,
      sourceLocale: sourceLocale.value,
      targetLocale: targetLocale.value,
      translation: translation.value,
      status,
      sourceHash: studioTranslationMemorySourceHash(sourceText.value),
      sourceRevision: sourceRevision.value,
      stale: false,
      glossaryConflicts,
      createdAt: now,
      updatedAt: now,
    },
  };
}

function sanitizeGlossaryConflicts(
  value: unknown
): StudioTranslationMemoryGlossaryConflict[] {
  if (!Array.isArray(value)) return [];
  const conflicts: StudioTranslationMemoryGlossaryConflict[] = [];
  for (const raw of value.slice(0, STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_RULES)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    if (
      record.kind !== "ambiguous-rule"
      && record.kind !== "missing-target"
    ) {
      continue;
    }
    if (
      typeof record.sourceTerm !== "string"
      || typeof record.message !== "string"
      || !Array.isArray(record.expectedTargets)
    ) {
      continue;
    }
    const sourceTerm = normalizeStoredText(record.sourceTerm).slice(
      0,
      STUDIO_TRANSLATION_MEMORY_MAX_GLOSSARY_TERM_CHARS
    );
    const expectedTargets = record.expectedTargets
      .filter((target): target is string => typeof target === "string")
      .map(normalizeStoredText)
      .filter(Boolean)
      .slice(0, 8);
    const message = normalizeStoredText(record.message).slice(0, 500);
    if (!sourceTerm || expectedTargets.length === 0 || !message) continue;
    conflicts.push({
      kind: record.kind,
      sourceTerm,
      expectedTargets,
      message,
    });
  }
  return conflicts;
}

function sanitizeEntry(value: unknown): StudioTranslationMemoryEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    raw.version !== STUDIO_TRANSLATION_MEMORY_VERSION
    || typeof raw.workScope !== "string"
    || typeof raw.sourceText !== "string"
    || typeof raw.speaker !== "string"
    || typeof raw.sourceLocale !== "string"
    || typeof raw.targetLocale !== "string"
    || typeof raw.translation !== "string"
    || !isValidStatus(raw.status)
    || typeof raw.sourceHash !== "string"
    || (typeof raw.sourceRevision !== "string"
      && typeof raw.sourceRevision !== "number")
  ) {
    return null;
  }
  const created = createStudioTranslationMemoryEntry({
    workScope: raw.workScope,
    sourceText: raw.sourceText,
    speaker: raw.speaker,
    sourceLocale: raw.sourceLocale,
    targetLocale: raw.targetLocale,
    translation: raw.translation,
    sourceRevision: raw.sourceRevision,
    status: raw.status === "approved" ? "reviewed" : raw.status,
    now:
      typeof raw.createdAt === "number"
      && Number.isFinite(raw.createdAt)
      && raw.createdAt >= 0
        ? Math.floor(raw.createdAt)
        : 0,
  });
  if (!created.ok) return null;
  const expectedHash = studioTranslationMemorySourceHash(
    created.entry.sourceText
  );
  const glossaryConflicts = sanitizeGlossaryConflicts(raw.glossaryConflicts);
  const stale =
    raw.stale === true
    || raw.sourceHash !== expectedHash;
  const status =
    raw.status === "approved"
    && !stale
    && glossaryConflicts.length === 0
      ? "approved"
      : created.entry.status;
  const updatedAt =
    typeof raw.updatedAt === "number"
    && Number.isFinite(raw.updatedAt)
    && raw.updatedAt >= 0
      ? Math.floor(raw.updatedAt)
      : created.entry.createdAt;

  return {
    ...created.entry,
    id: created.entry.id,
    status,
    sourceHash: raw.sourceHash,
    stale,
    glossaryConflicts,
    updatedAt,
  };
}

function preferEntry(
  left: StudioTranslationMemoryEntry,
  right: StudioTranslationMemoryEntry
): StudioTranslationMemoryEntry {
  const comparisons: readonly [number | string, number | string][] = [
    [left.stale ? 0 : 1, right.stale ? 0 : 1],
    [STATUS_PRIORITY[left.status], STATUS_PRIORITY[right.status]],
    [left.updatedAt, right.updatedAt],
    [left.createdAt, right.createdAt],
    [left.translation, right.translation],
    [left.id, right.id],
  ];
  for (const [leftValue, rightValue] of comparisons) {
    if (leftValue === rightValue) continue;
    return leftValue > rightValue ? left : right;
  }
  return left;
}

function compareEntryPriority(
  left: StudioTranslationMemoryEntry,
  right: StudioTranslationMemoryEntry
): number {
  if (left.stale !== right.stale) return left.stale ? 1 : -1;
  const status = STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status];
  if (status !== 0) return status;
  if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
  return compareCodeUnits(
    studioTranslationMemoryIdentity(left),
    studioTranslationMemoryIdentity(right)
  );
}

function mergeEntriesBounded(
  values: readonly unknown[]
): MergeStudioTranslationMemoryResult {
  const byIdentity = new Map<string, StudioTranslationMemoryEntry>();
  let invalid = 0;
  let duplicates = 0;
  for (const value of values) {
    const entry = sanitizeEntry(value);
    if (!entry) {
      invalid += 1;
      continue;
    }
    const identity = studioTranslationMemoryIdentity(entry);
    const existing = byIdentity.get(identity);
    if (existing) {
      duplicates += 1;
      byIdentity.set(identity, preferEntry(existing, entry));
    } else {
      byIdentity.set(identity, entry);
    }
  }

  const prioritized = [...byIdentity.values()].sort(compareEntryPriority);
  const kept: StudioTranslationMemoryEntry[] = [];
  let totalChars = 0;
  let truncated = 0;
  for (const entry of prioritized) {
    const cost = entryCharacterCost(entry);
    if (
      kept.length >= STUDIO_TRANSLATION_MEMORY_MAX_ENTRIES
      || totalChars + cost > STUDIO_TRANSLATION_MEMORY_MAX_TOTAL_CHARS
    ) {
      truncated += 1;
      continue;
    }
    kept.push(entry);
    totalChars += cost;
  }
  kept.sort((left, right) =>
    compareCodeUnits(
      studioTranslationMemoryIdentity(left),
      studioTranslationMemoryIdentity(right)
    )
  );
  return { entries: kept, invalid, duplicates, truncated };
}

/** Order-independent duplicate merge. Approved/non-stale/newer entries win deterministically. */
export function mergeStudioTranslationMemoryEntries(
  entries: readonly StudioTranslationMemoryEntry[]
): readonly StudioTranslationMemoryEntry[] {
  return mergeEntriesBounded(entries).entries;
}

/** Explicit local author write: replace the same identity instead of import-style status ranking. */
export function upsertStudioTranslationMemoryEntry(
  entries: readonly StudioTranslationMemoryEntry[],
  entry: StudioTranslationMemoryEntry
): readonly StudioTranslationMemoryEntry[] {
  const identity = studioTranslationMemoryIdentity(entry);
  return mergeEntriesBounded([
    ...entries.filter(
      (candidate) => studioTranslationMemoryIdentity(candidate) !== identity
    ),
    entry,
  ]).entries;
}

export function setStudioTranslationMemoryEntryStatus(
  entries: readonly StudioTranslationMemoryEntry[],
  id: string,
  status: StudioTranslationMemoryStatus,
  now = Date.now()
): readonly StudioTranslationMemoryEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.id !== id || entry.status === status) return entry;
    if (
      status === "approved"
      && (entry.stale || entry.glossaryConflicts.length > 0)
    ) {
      return entry;
    }
    changed = true;
    return { ...entry, status, updatedAt: validNow(now) };
  });
  return changed ? next : entries;
}

export function invalidateStudioTranslationMemoryEntry(
  entries: readonly StudioTranslationMemoryEntry[],
  id: string,
  now = Date.now()
): readonly StudioTranslationMemoryEntry[] {
  let changed = false;
  const next = entries.map((entry) => {
    if (entry.id !== id || (entry.stale && entry.status === "draft")) {
      return entry;
    }
    changed = true;
    return {
      ...entry,
      stale: true,
      status: "draft" as const,
      updatedAt: validNow(now),
    };
  });
  return changed ? next : entries;
}

export function assessStudioTranslationMemoryEntry(
  entry: StudioTranslationMemoryEntry,
  query: StudioTranslationMemoryQuery,
  glossaryRules: readonly StudioTranslationMemoryGlossaryRule[] = []
): {
  readonly stale: boolean;
  readonly glossaryConflicts: readonly StudioTranslationMemoryGlossaryConflict[];
} {
  const stale =
    entry.stale
    || entry.sourceHash !== studioTranslationMemorySourceHash(query.sourceText)
    || entry.sourceRevision !== normalizeRevision(query.sourceRevision);
  return {
    stale,
    glossaryConflicts: findStudioTranslationMemoryGlossaryConflicts({
      sourceText: query.sourceText,
      translation: entry.translation,
      sourceLocale: query.sourceLocale,
      targetLocale: query.targetLocale,
      rules: glossaryRules,
    }),
  };
}

function normalizeForFuzzy(value: string): string {
  return normalizeCaseInsensitive(value)
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function ngramCounts(value: string): Map<string, number> {
  const normalized = normalizeForFuzzy(value);
  const width = normalized.length < 8 ? 2 : 3;
  const counts = new Map<string, number>();
  if (normalized.length < width) return counts;
  for (let index = 0; index <= normalized.length - width; index += 1) {
    const gram = normalized.slice(index, index + width);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

function conservativeSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeForFuzzy(left);
  const normalizedRight = normalizeForFuzzy(right);
  if (
    normalizedLeft.length < 4
    || normalizedRight.length < 4
    || normalizedLeft === normalizedRight
  ) {
    return normalizedLeft === normalizedRight ? 1 : 0;
  }
  const lengthRatio =
    Math.min(normalizedLeft.length, normalizedRight.length)
    / Math.max(normalizedLeft.length, normalizedRight.length);
  if (lengthRatio < 0.75) return 0;
  const leftCounts = ngramCounts(normalizedLeft);
  const rightCounts = ngramCounts(normalizedRight);
  let intersection = 0;
  let leftTotal = 0;
  let rightTotal = 0;
  for (const count of leftCounts.values()) leftTotal += count;
  for (const count of rightCounts.values()) rightTotal += count;
  for (const [gram, count] of leftCounts) {
    intersection += Math.min(count, rightCounts.get(gram) ?? 0);
  }
  if (leftTotal + rightTotal === 0) return 0;
  const dice = (2 * intersection) / (leftTotal + rightTotal);
  return dice * 0.85 + lengthRatio * 0.15;
}

export function queryStudioTranslationMemory(
  entries: readonly StudioTranslationMemoryEntry[],
  query: StudioTranslationMemoryQuery,
  glossaryRules: readonly StudioTranslationMemoryGlossaryRule[] = []
): StudioTranslationMemoryQueryResult {
  const queryIdentity = studioTranslationMemoryIdentity(query);
  const merged = mergeStudioTranslationMemoryEntries(entries);
  const exactEntry =
    merged.find(
      (entry) => studioTranslationMemoryIdentity(entry) === queryIdentity
    ) ?? null;
  let exact: StudioTranslationMemoryExactMatch | null = null;
  if (exactEntry) {
    const assessment = assessStudioTranslationMemoryEntry(
      exactEntry,
      query,
      glossaryRules
    );
    exact = {
      kind: "exact",
      entry: exactEntry,
      stale: assessment.stale,
      glossaryConflicts: assessment.glossaryConflicts,
      reusable:
        !assessment.stale && assessment.glossaryConflicts.length === 0,
    };
  }

  const [scope, , speaker, sourceLocale, targetLocale] = identityParts(query);
  const fuzzyCandidates: StudioTranslationMemoryFuzzySuggestion[] = [];
  for (const entry of merged) {
    if (
      studioTranslationMemoryIdentity(entry) === queryIdentity
      || entry.status === "draft"
      || entry.stale
    ) {
      continue;
    }
    const entryParts = identityParts(entry);
    if (
      entryParts[0] !== scope
      || entryParts[2] !== speaker
      || entryParts[3] !== sourceLocale
      || entryParts[4] !== targetLocale
    ) {
      continue;
    }
    const score = conservativeSimilarity(entry.sourceText, query.sourceText);
    if (score < STUDIO_TRANSLATION_MEMORY_FUZZY_THRESHOLD) continue;
    const conflicts = findStudioTranslationMemoryGlossaryConflicts({
      sourceText: query.sourceText,
      translation: entry.translation,
      sourceLocale: query.sourceLocale,
      targetLocale: query.targetLocale,
      rules: glossaryRules,
    });
    fuzzyCandidates.push({
      kind: "fuzzy",
      entry,
      score: Math.round(score * 1_000) / 1_000,
      autoApply: false,
      glossaryConflicts: conflicts,
      reusable: conflicts.length === 0,
    });
  }
  const fuzzy = fuzzyCandidates
    .sort(
      (left, right) =>
        right.score - left.score
        || STATUS_PRIORITY[right.entry.status]
          - STATUS_PRIORITY[left.entry.status]
        || right.entry.updatedAt - left.entry.updatedAt
        || compareCodeUnits(
          studioTranslationMemoryIdentity(left.entry),
          studioTranslationMemoryIdentity(right.entry)
        )
    )
    .slice(0, STUDIO_TRANSLATION_MEMORY_MAX_FUZZY_SUGGESTIONS);

  return { exact, fuzzy };
}

export function importStudioTranslationMemory(
  raw: string,
  currentEntries: readonly StudioTranslationMemoryEntry[] = []
):
  | StudioTranslationMemoryImportResult
  | StudioTranslationMemoryImportFailure {
  if (utf8Bytes(raw) > STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_BYTES) {
    return {
      ok: false,
      error: `가져오기 파일은 ${(STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_BYTES / 1_000_000).toFixed(1)}MB 이하여야 합니다.`,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "번역 메모리 JSON을 해석하지 못했습니다." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "번역 메모리 문서 형식이 아닙니다." };
  }
  const document = parsed as Record<string, unknown>;
  if (
    document.kind !== STUDIO_TRANSLATION_MEMORY_KIND
    || document.version !== STUDIO_TRANSLATION_MEMORY_VERSION
    || !Array.isArray(document.entries)
  ) {
    return {
      ok: false,
      error: "지원하는 ToonSpectrum 번역 메모리 v1 문서가 아닙니다.",
    };
  }
  if (
    document.entries.length
    > STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES
  ) {
    return {
      ok: false,
      error: `한 번에 최대 ${STUDIO_TRANSLATION_MEMORY_MAX_IMPORT_CANDIDATES.toLocaleString("ko-KR")}개 후보만 가져올 수 있습니다.`,
    };
  }
  const imported = mergeEntriesBounded(document.entries);
  const combined = mergeEntriesBounded([
    ...currentEntries,
    ...imported.entries,
  ]);
  return {
    ok: true,
    entries: combined.entries,
    accepted: imported.entries.length,
    rejected: imported.invalid,
    duplicates: imported.duplicates + combined.duplicates,
    truncated: imported.truncated + combined.truncated,
  };
}

export function exportStudioTranslationMemory(
  entries: readonly StudioTranslationMemoryEntry[]
):
  | StudioTranslationMemoryExportResult
  | StudioTranslationMemoryExportFailure {
  const merged = mergeEntriesBounded(entries);
  if (merged.invalid > 0 || merged.truncated > 0) {
    return {
      ok: false,
      error:
        "유효하지 않거나 저장 한도를 넘는 항목이 있어 내보내기를 중단했습니다.",
    };
  }
  const document: StoredStudioTranslationMemoryDocument = {
    kind: STUDIO_TRANSLATION_MEMORY_KIND,
    version: STUDIO_TRANSLATION_MEMORY_VERSION,
    entries: merged.entries,
  };
  const json = JSON.stringify(document, null, 2);
  const bytes = utf8Bytes(json);
  if (bytes > STUDIO_TRANSLATION_MEMORY_MAX_EXPORT_BYTES) {
    return {
      ok: false,
      error: `내보내기 결과가 ${(STUDIO_TRANSLATION_MEMORY_MAX_EXPORT_BYTES / 1_000_000).toFixed(1)}MB 제한을 넘습니다.`,
    };
  }
  return { ok: true, json, bytes };
}

export function loadStudioTranslationMemory(
  storage: StudioTranslationMemoryStorage | null,
  key = STUDIO_TRANSLATION_MEMORY_STORAGE_KEY
): StudioTranslationMemoryLoadResult {
  if (!storage) {
    return {
      entries: [],
      status: "unavailable",
      error: "브라우저 로컬 저장소를 사용할 수 없습니다.",
    };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return {
      entries: [],
      status: "unavailable",
      error: "브라우저 로컬 저장소를 읽을 수 없습니다.",
    };
  }
  if (!raw) return { entries: [], status: "empty" };
  const imported = importStudioTranslationMemory(raw);
  if (!imported.ok) {
    return { entries: [], status: "invalid", error: imported.error };
  }
  return { entries: imported.entries, status: "ok" };
}

export function saveStudioTranslationMemory(
  storage: StudioTranslationMemoryStorage | null,
  entries: readonly StudioTranslationMemoryEntry[],
  key = STUDIO_TRANSLATION_MEMORY_STORAGE_KEY
): StudioTranslationMemorySaveResult {
  if (!storage) {
    return {
      ok: false,
      error: "로컬 저장소가 없어 현재 탭에서만 유지됩니다.",
    };
  }
  const exported = exportStudioTranslationMemory(entries);
  if (!exported.ok) return exported;
  try {
    storage.setItem(key, exported.json);
    return { ok: true };
  } catch {
    return {
      ok: false,
      error: "브라우저 저장 공간이 부족하거나 로컬 저장이 차단되었습니다.",
    };
  }
}

/** Explicit test/embed compatibility helper; the V12 product default must not call this. */
export function studioTranslationMemoryBrowserStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}
