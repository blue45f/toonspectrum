export interface StudioProjectCenterSearchRecord {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly sectionLabel: string;
  readonly keywords?: readonly string[];
  readonly order: number;
}

const PROJECT_CENTER_SYNONYM_GROUPS = Object.freeze([
  Object.freeze(["archive", "backup", "백업", "보관", "사본"]),
  Object.freeze(["restore", "recovery", "복구", "복원", "되돌리기"]),
  Object.freeze(["publish", "release", "게시", "출고", "배포"]),
  Object.freeze(["review", "qa", "검수", "검사", "품질"]),
  Object.freeze(["version", "history", "checkpoint", "버전", "이력", "복구지점"]),
  Object.freeze(["import", "open", "가져오기", "불러오기"]),
  Object.freeze(["export", "download", "내보내기", "다운로드", "출력"]),
  Object.freeze(["share", "collaboration", "협업", "공유", "팀"]),
  Object.freeze(["story", "storyboard", "기획", "스토리", "콘티"]),
  Object.freeze(["character", "캐릭터", "인물"]),
  Object.freeze(["scene", "장면", "연출"]),
  Object.freeze(["file", "document", "project", "파일", "문서", "프로젝트"]),
  Object.freeze(["save", "저장", "초안"]),
  Object.freeze(["automation", "action", "자동화", "액션"]),
  Object.freeze(["three dimensional", "3d", "dcc", "입체"]),
] satisfies readonly (readonly string[])[]);

const PROJECT_CENTER_SYNONYMS = (() => {
  const index = new Map<string, readonly string[]>();
  for (const group of PROJECT_CENTER_SYNONYM_GROUPS) {
    for (const token of group) index.set(token, group);
  }
  return index;
})();

export function normalizeStudioProjectCenterText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}_]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(value: string): readonly string[] {
  return normalizeStudioProjectCenterText(value)
    .split(" ")
    .filter(Boolean);
}

function alternativesFor(token: string): readonly string[] {
  return PROJECT_CENTER_SYNONYMS.get(token) ?? [token];
}

function fieldMatchScore(
  field: string,
  term: string,
  exact: number,
  prefix: number,
  wordPrefix: number,
  contains: number,
): number {
  if (!field || !term) return 0;
  if (field === term) return exact;
  if (field.startsWith(term)) return prefix;
  const words = field.split(" ");
  if (words.some((word) => word.startsWith(term))) return wordPrefix;
  const position = field.indexOf(term);
  if (position < 0) return 0;
  return Math.max(1, contains - Math.min(contains - 1, position));
}

function tokenScore(
  record: StudioProjectCenterSearchRecord,
  token: string,
): number {
  const label = normalizeStudioProjectCenterText(record.label);
  const description = normalizeStudioProjectCenterText(record.description);
  const section = normalizeStudioProjectCenterText(record.sectionLabel);
  const keywords = normalizeStudioProjectCenterText(
    (record.keywords ?? []).join(" "),
  );
  let best = 0;
  for (const alternative of alternativesFor(token)) {
    const synonymPenalty = alternative === token ? 0 : 4;
    best = Math.max(
      best,
      fieldMatchScore(label, alternative, 150, 126, 112, 96) - synonymPenalty,
      fieldMatchScore(description, alternative, 82, 72, 64, 52) - synonymPenalty,
      fieldMatchScore(section, alternative, 68, 58, 50, 42) - synonymPenalty,
      fieldMatchScore(keywords, alternative, 54, 48, 42, 34) - synonymPenalty,
    );
  }
  return Math.max(0, best);
}

function recordScore(
  record: StudioProjectCenterSearchRecord,
  normalizedQuery: string,
  tokens: readonly string[],
): number | null {
  let score = 0;
  for (const token of tokens) {
    const matched = tokenScore(record, token);
    if (matched <= 0) return null;
    score += matched;
  }

  const label = normalizeStudioProjectCenterText(record.label);
  if (label === normalizedQuery) score += 420;
  else if (label.startsWith(normalizedQuery)) score += 260;
  else if (label.includes(normalizedQuery)) score += 170;

  return score;
}

export function rankStudioProjectCenterActions<
  T extends StudioProjectCenterSearchRecord,
>(records: readonly T[], query: string): readonly T[] {
  const normalizedQuery = normalizeStudioProjectCenterText(query);
  const tokens = queryTokens(query);
  if (tokens.length === 0) {
    return [...records].sort((left, right) => left.order - right.order);
  }

  return records
    .map((record) => ({
      record,
      score: recordScore(record, normalizedQuery, tokens),
    }))
    .filter(
      (entry): entry is { readonly record: T; readonly score: number } =>
        entry.score !== null,
    )
    .sort((left, right) =>
      right.score - left.score || left.record.order - right.record.order,
    )
    .map((entry) => entry.record);
}

export function createStudioProjectCenterActionKey(
  sectionLabel: string,
  label: string,
): string {
  const source = `${normalizeStudioProjectCenterText(sectionLabel)}|${normalizeStudioProjectCenterText(label)}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `project-action-${(hash >>> 0).toString(36)}`;
}

export function parseStudioProjectCenterKeys(
  value: string | null,
  limit = 12,
): readonly string[] {
  if (!value || limit <= 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const unique = new Set<string>();
    for (const item of parsed) {
      if (typeof item !== "string") continue;
      const key = item.trim();
      if (!key || unique.has(key)) continue;
      unique.add(key);
      if (unique.size >= limit) break;
    }
    return [...unique];
  } catch {
    return [];
  }
}

export function prependStudioProjectCenterKey(
  current: readonly string[],
  key: string,
  limit = 8,
): readonly string[] {
  const normalizedKey = key.trim();
  if (!normalizedKey || limit <= 0) return [];
  return [
    normalizedKey,
    ...current.filter((candidate) => candidate !== normalizedKey),
  ].slice(0, limit);
}
