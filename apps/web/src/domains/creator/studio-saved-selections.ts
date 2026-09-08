/** Versioned, bounded, local-device storage for named pixel selections. */
import {
  normalizePixelSelection,
} from "./studio-pixel-selection-history";
import {
  isSelectionUsable,
  type PixelSelection,
} from "./studio-selection-tools";

export const STUDIO_SAVED_SELECTION_LIBRARY_VERSION = 1;
export const STUDIO_SAVED_SELECTION_MAX_ITEMS = 16;
export const STUDIO_SAVED_SELECTION_NAME_MAX_LENGTH = 48;
export const STUDIO_SAVED_SELECTION_MAX_SERIALIZED_LENGTH = 512_000;
const STORAGE_PREFIX = "toonstudio:pixel-selection-library:v1:";

export interface StudioSavedSelectionRecord {
  readonly id: string;
  readonly name: string;
  readonly selection: PixelSelection;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StudioSavedSelectionLibrary {
  readonly version: typeof STUDIO_SAVED_SELECTION_LIBRARY_VERSION;
  readonly items: readonly StudioSavedSelectionRecord[];
}

export interface StudioSelectionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface UpsertStudioSavedSelectionInput {
  readonly id: string;
  readonly name: string;
  readonly selection: PixelSelection;
  readonly now?: number;
}

export const EMPTY_STUDIO_SAVED_SELECTION_LIBRARY: StudioSavedSelectionLibrary = Object.freeze({
  version: STUDIO_SAVED_SELECTION_LIBRARY_VERSION,
  items: Object.freeze([]),
});

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
  }).join("");
}

function sanitizeText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return replaceControlCharacters(value).trim().slice(0, maxLength);
}

function sanitizeId(value: unknown): string {
  return sanitizeText(value, 96).replace(/[^a-zA-Z0-9:_-]/gu, "-");
}

function sanitizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback;
}

function cloneSelection(value: unknown): PixelSelection | null {
  const normalized = normalizePixelSelection(value);
  if (!normalized || !isSelectionUsable(normalized)) return null;
  return {
    featherPx: normalized.featherPx,
    invert: normalized.invert,
    subpaths: normalized.subpaths.map((subpath) => (
      subpath.kind === "brush"
        ? {
            mode: subpath.mode,
            kind: "brush" as const,
            radius: subpath.radius,
            points: subpath.points.map((point) => ({ x: point.x, y: point.y })),
          }
        : {
            mode: subpath.mode,
            points: subpath.points.map((point) => ({ x: point.x, y: point.y })),
          }
    )),
  };
}

function normalizeRecord(value: unknown, index: number): StudioSavedSelectionRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const selection = cloneSelection(record.selection);
  if (!selection) return null;
  const name = sanitizeText(record.name, STUDIO_SAVED_SELECTION_NAME_MAX_LENGTH);
  if (!name) return null;
  const updatedAt = sanitizeTimestamp(record.updatedAt, index);
  const createdAt = sanitizeTimestamp(record.createdAt, updatedAt);
  const id = sanitizeId(record.id) || `recovered-${index}`;
  return { id, name, selection, createdAt, updatedAt };
}

export function studioSavedSelectionStorageKey(scopeKey: string): string {
  const normalized = sanitizeText(scopeKey, 180) || "unscoped";
  return `${STORAGE_PREFIX}${encodeURIComponent(normalized)}`;
}

export function decodeStudioSavedSelectionLibrary(
  raw: string | null | undefined,
): StudioSavedSelectionLibrary {
  if (!raw || raw.length > STUDIO_SAVED_SELECTION_MAX_SERIALIZED_LENGTH) {
    return EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
  }
  const object = parsed as Record<string, unknown>;
  if (object.version !== STUDIO_SAVED_SELECTION_LIBRARY_VERSION || !Array.isArray(object.items)) {
    return EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
  }
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const items: StudioSavedSelectionRecord[] = [];
  for (let index = 0; index < object.items.length; index += 1) {
    const record = normalizeRecord(object.items[index], index);
    if (!record) continue;
    const foldedName = record.name.toLocaleLowerCase("ko-KR");
    if (seenIds.has(record.id) || seenNames.has(foldedName)) continue;
    seenIds.add(record.id);
    seenNames.add(foldedName);
    items.push(record);
    if (items.length >= STUDIO_SAVED_SELECTION_MAX_ITEMS) break;
  }
  items.sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name, "ko-KR"));
  return { version: STUDIO_SAVED_SELECTION_LIBRARY_VERSION, items };
}

export function encodeStudioSavedSelectionLibrary(library: StudioSavedSelectionLibrary): string {
  return JSON.stringify({
    version: STUDIO_SAVED_SELECTION_LIBRARY_VERSION,
    items: library.items.slice(0, STUDIO_SAVED_SELECTION_MAX_ITEMS),
  });
}

export function upsertStudioSavedSelection(
  library: StudioSavedSelectionLibrary,
  input: UpsertStudioSavedSelectionInput,
): StudioSavedSelectionLibrary {
  const selection = cloneSelection(input.selection);
  if (!selection) throw new TypeError("저장할 수 있는 픽셀 선택 영역이 없습니다.");
  const name = sanitizeText(input.name, STUDIO_SAVED_SELECTION_NAME_MAX_LENGTH);
  if (!name) throw new TypeError("저장할 선택 이름을 입력하세요.");
  const now = sanitizeTimestamp(input.now, Date.now());
  const foldedName = name.toLocaleLowerCase("ko-KR");
  const requestedId = sanitizeId(input.id);
  const existing = library.items.find((item) => (
    (requestedId && item.id === requestedId)
    || item.name.toLocaleLowerCase("ko-KR") === foldedName
  ));
  const id = existing?.id || requestedId;
  if (!id) throw new TypeError("저장할 선택 식별자를 만들 수 없습니다.");
  const record: StudioSavedSelectionRecord = {
    id,
    name,
    selection,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  const items = [
    record,
    ...library.items.filter((item) => item.id !== id),
  ]
    .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name, "ko-KR"))
    .slice(0, STUDIO_SAVED_SELECTION_MAX_ITEMS);
  return { version: STUDIO_SAVED_SELECTION_LIBRARY_VERSION, items };
}

export function removeStudioSavedSelection(
  library: StudioSavedSelectionLibrary,
  id: string,
): StudioSavedSelectionLibrary {
  const admittedId = sanitizeId(id);
  return {
    version: STUDIO_SAVED_SELECTION_LIBRARY_VERSION,
    items: library.items.filter((item) => item.id !== admittedId),
  };
}

export function readStudioSavedSelectionLibrary(
  storage: StudioSelectionStorage | null | undefined,
  scopeKey: string,
): StudioSavedSelectionLibrary {
  if (!storage) return EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
  try {
    return decodeStudioSavedSelectionLibrary(
      storage.getItem(studioSavedSelectionStorageKey(scopeKey)),
    );
  } catch {
    return EMPTY_STUDIO_SAVED_SELECTION_LIBRARY;
  }
}

export function writeStudioSavedSelectionLibrary(
  storage: StudioSelectionStorage | null | undefined,
  scopeKey: string,
  library: StudioSavedSelectionLibrary,
): boolean {
  if (!storage) return false;
  try {
    const encoded = encodeStudioSavedSelectionLibrary(library);
    if (encoded.length > STUDIO_SAVED_SELECTION_MAX_SERIALIZED_LENGTH) return false;
    storage.setItem(studioSavedSelectionStorageKey(scopeKey), encoded);
    return true;
  } catch {
    return false;
  }
}
