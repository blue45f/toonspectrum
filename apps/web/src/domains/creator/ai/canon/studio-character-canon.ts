// 캐릭터 "캐논" 시트 — AI 만화 생성에서 매 패널마다 얼굴·의상이 바뀌는 문제를
// 막기 위해 캐릭터의 외모·의상·특징을 한 장의 시트로 고정해 두는 모델.
// 게스트는 localStorage에만 저장하고, 로그인 상태에서는 apiPost로 서버에
// write-through 한다(기존 useApp 스토어의 평점/읽기 상태와 같은 패턴).
import { apiPost } from "@/shared/lib/store-api-post";
import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

export const CHARACTER_CANON_STORAGE_KEY =
  "toonspectrum:studio-character-canon:v1";
export const CHARACTER_CANON_DOCUMENT_VERSION = 1;

/** 서버 write-through에 쓰는 사용자 데이터 경로(게스트는 호출하지 않는다). */
export const CHARACTER_CANON_SERVER_PATH = "/api/me/canon-characters";

/** 레퍼런스 이미지를 어디서 가져왔는지. */
export type CanonReferenceSource = "upload" | "avatar" | "shaper" | "url";

/** 캐릭터 한 명을 고정하는 시트. */
export interface CharacterCanonSheet {
  readonly id: string;
  readonly name: string;
  /** 외모 설명 — 얼굴, 머리, 체형 등. */
  readonly appearance: string;
  /** 의상 설명. */
  readonly outfit: string;
  /** 특징 태그 — "안경", "왼쪽 눈 밑 점" 같은 짧은 식별자. */
  readonly tags: readonly string[];
  /** 레퍼런스 이미지 — data URL 또는 에셋/원격 URL. */
  readonly referenceImage: string | null;
  readonly referenceSource: CanonReferenceSource | null;
  /** 레퍼런스 출처 표시용 짧은 이름 — 예: "기본 아바타 · 하린". */
  readonly referenceLabel: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** 이 캐릭터 시트로 프롬프트를 만든 패널 기록 — 갤러리용. */
export interface CanonPanelUsage {
  readonly id: string;
  readonly characterId: string;
  readonly sessionId: string;
  readonly sessionLabel: string;
  readonly panelIndex: number;
  readonly panelSummary: string;
  readonly injectedAt: string;
}

export interface CharacterCanonDocument {
  readonly version: number;
  readonly sheets: readonly CharacterCanonSheet[];
  readonly usage: readonly CanonPanelUsage[];
}

export interface CanonSheetDraft {
  readonly name: string;
  readonly appearance: string;
  readonly outfit: string;
  readonly tags: readonly string[];
  readonly referenceImage: string | null;
  readonly referenceSource: CanonReferenceSource | null;
  readonly referenceLabel: string | null;
}

export interface CanonStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const CANON_NAME_MAX = 40;
export const CANON_APPEARANCE_MAX = 800;
export const CANON_OUTFIT_MAX = 400;
export const CANON_TAGS_MAX = 12;
export const CANON_TAG_MAX = 24;
/** localStorage 폭주를 막기 위한 사용 기록 상한. */
export const CANON_USAGE_MAX = 200;

function normalizeText(value: string, max: number): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max);
}

function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const tag of tags) {
    const normalized = normalizeText(tag, CANON_TAG_MAX).replace(/^#+/u, "");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
    if (result.length >= CANON_TAGS_MAX) break;
  }
  return result;
}

function normalizeReferenceImage(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }
  return null;
}

function isReferenceSource(value: unknown): value is CanonReferenceSource {
  return (
    value === "upload" ||
    value === "avatar" ||
    value === "shaper" ||
    value === "url"
  );
}

/** 폼 입력 검증 — 실패 사유를 사람이 읽을 수 있는 문장으로 돌려준다. */
export function validateCanonSheetDraft(
  draft: CanonSheetDraft,
): readonly string[] {
  const errors: string[] = [];
  if (!normalizeText(draft.name, CANON_NAME_MAX)) {
    errors.push("캐릭터 이름을 입력해 주세요.");
  }
  if (!normalizeText(draft.appearance, CANON_APPEARANCE_MAX)) {
    errors.push("외모 설명을 입력해 주세요. 얼굴·머리·체형이 드러나면 좋아요.");
  }
  return errors;
}

export function buildCharacterCanonSheet(
  draft: CanonSheetDraft,
  options: { readonly id?: string; readonly now?: string } = {},
): CharacterCanonSheet {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.id ?? createSecureRandomUuid(),
    name: normalizeText(draft.name, CANON_NAME_MAX),
    appearance: normalizeText(draft.appearance, CANON_APPEARANCE_MAX),
    outfit: normalizeText(draft.outfit, CANON_OUTFIT_MAX),
    tags: normalizeTags(draft.tags),
    referenceImage: normalizeReferenceImage(draft.referenceImage),
    referenceSource: isReferenceSource(draft.referenceSource)
      ? draft.referenceSource
      : null,
    referenceLabel: draft.referenceLabel
      ? normalizeText(draft.referenceLabel, 60)
      : null,
    createdAt: now,
    updatedAt: now,
  };
}

export function touchCharacterCanonSheet(
  sheet: CharacterCanonSheet,
  draft: CanonSheetDraft,
  now: string = new Date().toISOString(),
): CharacterCanonSheet {
  return {
    ...buildCharacterCanonSheet(draft, { id: sheet.id, now }),
    createdAt: sheet.createdAt,
    updatedAt: now,
  };
}

function normalizeSheet(value: unknown): CharacterCanonSheet | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  return {
    id: record.id,
    name: normalizeText(String(record.name ?? ""), CANON_NAME_MAX),
    appearance: normalizeText(
      String(record.appearance ?? ""),
      CANON_APPEARANCE_MAX,
    ),
    outfit: normalizeText(String(record.outfit ?? ""), CANON_OUTFIT_MAX),
    tags: normalizeTags(
      Array.isArray(record.tags) ? record.tags.map(String) : [],
    ),
    referenceImage: normalizeReferenceImage(
      typeof record.referenceImage === "string" ? record.referenceImage : null,
    ),
    referenceSource: isReferenceSource(record.referenceSource)
      ? record.referenceSource
      : null,
    referenceLabel:
      typeof record.referenceLabel === "string" && record.referenceLabel
        ? normalizeText(record.referenceLabel, 60)
        : null,
    createdAt:
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof record.updatedAt === "string"
        ? record.updatedAt
        : new Date().toISOString(),
  };
}

function normalizeUsage(value: unknown): CanonPanelUsage | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !record.id) return null;
  if (typeof record.characterId !== "string" || !record.characterId) return null;
  return {
    id: record.id,
    characterId: record.characterId,
    sessionId: typeof record.sessionId === "string" ? record.sessionId : "",
    sessionLabel:
      typeof record.sessionLabel === "string" ? record.sessionLabel : "",
    panelIndex:
      Number.isInteger(record.panelIndex) && Number(record.panelIndex) >= 0
        ? Number(record.panelIndex)
        : 0,
    panelSummary:
      typeof record.panelSummary === "string" ? record.panelSummary : "",
    injectedAt:
      typeof record.injectedAt === "string"
        ? record.injectedAt
        : new Date().toISOString(),
  };
}

export function emptyCharacterCanonDocument(): CharacterCanonDocument {
  return {
    version: CHARACTER_CANON_DOCUMENT_VERSION,
    sheets: [],
    usage: [],
  };
}

/** 깨진 localStorage 값에서도 최대한 복구하는 관대한 파서. */
export function parseCharacterCanonDocument(
  raw: string | null,
): CharacterCanonDocument {
  if (!raw) return emptyCharacterCanonDocument();
  try {
    const value = JSON.parse(raw) as {
      readonly sheets?: unknown;
      readonly usage?: unknown;
    };
    const sheets = Array.isArray(value.sheets)
      ? value.sheets
          .map(normalizeSheet)
          .filter((sheet): sheet is CharacterCanonSheet => sheet !== null)
      : [];
    const usage = Array.isArray(value.usage)
      ? value.usage
          .map(normalizeUsage)
          .filter((entry): entry is CanonPanelUsage => entry !== null)
          .slice(-CANON_USAGE_MAX)
      : [];
    return { version: CHARACTER_CANON_DOCUMENT_VERSION, sheets, usage };
  } catch {
    return emptyCharacterCanonDocument();
  }
}

export function loadCharacterCanonDocument(
  storage: CanonStorage,
): CharacterCanonDocument {
  try {
    return parseCharacterCanonDocument(
      storage.getItem(CHARACTER_CANON_STORAGE_KEY),
    );
  } catch {
    return emptyCharacterCanonDocument();
  }
}

export function saveCharacterCanonDocument(
  storage: CanonStorage,
  document: CharacterCanonDocument,
): void {
  try {
    storage.setItem(CHARACTER_CANON_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // 용량 초과 같은 쓰기 실패는 조용히 무시 — 메모리 상태는 유지된다.
  }
}

export function upsertCharacterCanonSheet(
  document: CharacterCanonDocument,
  sheet: CharacterCanonSheet,
): CharacterCanonDocument {
  const sheets = document.sheets.some((entry) => entry.id === sheet.id)
    ? document.sheets.map((entry) => (entry.id === sheet.id ? sheet : entry))
    : [...document.sheets, sheet];
  return { ...document, sheets };
}

export function removeCharacterCanonSheet(
  document: CharacterCanonDocument,
  sheetId: string,
): CharacterCanonDocument {
  return {
    ...document,
    sheets: document.sheets.filter((sheet) => sheet.id !== sheetId),
    usage: document.usage.filter((entry) => entry.characterId !== sheetId),
  };
}

export function characterCanonSheetById(
  document: CharacterCanonDocument,
  sheetId: string,
): CharacterCanonSheet | null {
  return document.sheets.find((sheet) => sheet.id === sheetId) ?? null;
}

/**
 * 패널에 캐논을 주입했다는 기록을 남긴다.
 * 같은 캐릭터·세션·패널의 중복 기록은 최신 것으로 교체하고, 전체 상한을 유지한다.
 */
export function recordCanonPanelUsage(
  document: CharacterCanonDocument,
  record: Omit<CanonPanelUsage, "id"> & { readonly id?: string },
): CharacterCanonDocument {
  const entry: CanonPanelUsage = {
    id: record.id ?? createSecureRandomUuid(),
    ...record,
  };
  const usage = document.usage
    .filter(
      (existing) =>
        !(
          existing.characterId === entry.characterId &&
          existing.sessionId === entry.sessionId &&
          existing.panelIndex === entry.panelIndex
        ),
    )
    .concat(entry)
    .slice(-CANON_USAGE_MAX);
  return { ...document, usage };
}

export function canonPanelUsageForCharacter(
  document: CharacterCanonDocument,
  characterId: string,
): CanonPanelUsage[] {
  return document.usage
    .filter((entry) => entry.characterId === characterId)
    .sort((left, right) => right.injectedAt.localeCompare(left.injectedAt));
}

/**
 * 로그인 상태의 서버 write-through — 게스트는 호출하지 않는다.
 * store-api-post의 apiPost와 같은 best-effort 패턴이라 실패해도 로컬 상태는 유지된다.
 */
export function syncCharacterCanonToServer(
  document: CharacterCanonDocument,
  userId: string | null,
): void {
  if (!userId) return;
  apiPost(CHARACTER_CANON_SERVER_PATH, {
    version: document.version,
    sheets: document.sheets,
    usage: document.usage,
  });
}
