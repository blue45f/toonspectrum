import {
  normalizeStudioAiProvenanceDocument,
  type StudioAiProvenanceDocument,
} from "./studio-ai-provenance";

export const LEGACY_STUDIO_AUTOSAVE_KEY = "toonspectrum-studio-autosave";
const STUDIO_AUTOSAVE_PREFIX = "toonspectrum-studio-autosave:v2";

export interface StudioAutosaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StudioAutosavePayload = {
  version: 2;
  savedAt: string;
  pagesList: Array<{ id?: unknown; elements?: unknown[] }>;
  master?: { elements?: unknown[] } | unknown;
  characterBible?: unknown;
  /** Private story planning/review state. Never projected into public creator documents. */
  writerRoom?: unknown;
  comments?: unknown;
  releaseSchedule?: unknown;
  publicationAnalytics?: unknown;
  /** Private, document-scoped AI operation history. Prompt text is redacted during hydration. */
  aiProvenance?: StudioAiProvenanceDocument;
  title?: string;
  description?: string;
  tagsText?: string;
  webtoonTheme?: unknown;
  panelGutter?: unknown;
  currentPageId?: string;
  publishPack?: unknown;
};

export function studioAutosaveKey(input: {
  userId?: string | null;
  workId?: string | null;
  remixId?: string | null;
}): string {
  const owner = encodeURIComponent(input.userId?.trim() || "guest");
  const documentId = input.workId
    ? `work:${encodeURIComponent(input.workId)}`
    : input.remixId
      ? `remix:${encodeURIComponent(input.remixId)}`
      : "new";
  return `${STUDIO_AUTOSAVE_PREFIX}:${owner}:${documentId}`;
}

export function parseStudioAutosave(raw: string | null): StudioAutosavePayload | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.pagesList) || record.pagesList.length === 0) return null;
    return {
      version: 2,
      savedAt: typeof record.savedAt === "string" ? record.savedAt : new Date(0).toISOString(),
      pagesList: record.pagesList as StudioAutosavePayload["pagesList"],
      master: record.master,
      characterBible: record.characterBible,
      writerRoom: record.writerRoom,
      comments: record.comments,
      releaseSchedule: record.releaseSchedule,
      publicationAnalytics: record.publicationAnalytics,
      aiProvenance: Object.hasOwn(record, "aiProvenance")
        ? normalizeStudioAiProvenanceDocument(record.aiProvenance)
        : undefined,
      title: typeof record.title === "string" ? record.title : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
      tagsText: typeof record.tagsText === "string" ? record.tagsText : undefined,
      webtoonTheme: record.webtoonTheme,
      panelGutter: record.panelGutter,
      currentPageId: typeof record.currentPageId === "string" ? record.currentPageId : undefined,
      publishPack: record.publishPack,
    };
  } catch {
    return null;
  }
}

/**
 * Serializes a private autosave while enforcing the same privacy boundary as hydration. Even if
 * a caller passes an explicitly raw-retaining provenance document, browser storage receives only
 * its canonical hash-only representation.
 */
export function serializeStudioAutosave(payload: StudioAutosavePayload): string {
  return JSON.stringify({
    ...payload,
    ...(payload.aiProvenance === undefined
      ? {}
      : { aiProvenance: normalizeStudioAiProvenanceDocument(payload.aiProvenance) }),
  });
}

function studioWriterRoomHasContent(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.suggestions) && record.suggestions.length > 0) return true;
  const completion = record.completion;
  if (
    completion &&
    typeof completion === "object" &&
    !Array.isArray(completion) &&
    Object.values(completion).some((item) => item === true)
  ) return true;
  const stages = record.stages;
  if (!stages || typeof stages !== "object" || Array.isArray(stages)) return false;
  for (const stage of Object.values(stages)) {
    if (!stage || typeof stage !== "object" || Array.isArray(stage)) continue;
    const stageRecord = stage as Record<string, unknown>;
    if (["text", "title", "summary"].some(
      (key) => typeof stageRecord[key] === "string" && stageRecord[key].trim().length > 0
    )) return true;
    if (["items", "dialogue", "sfx"].some(
      (key) => Array.isArray(stageRecord[key]) && stageRecord[key].length > 0
    )) return true;
  }
  return false;
}

export function studioAutosaveHasContent(payload: StudioAutosavePayload): boolean {
  return (
    payload.pagesList.some((page) => Array.isArray(page?.elements) && page.elements.length > 0) ||
    (typeof payload.master === "object" &&
      payload.master !== null &&
      Array.isArray((payload.master as { elements?: unknown[] }).elements) &&
      ((payload.master as { elements: unknown[] }).elements.length > 0)) ||
    (typeof payload.characterBible === "object" &&
      payload.characterBible !== null &&
      Array.isArray((payload.characterBible as { characters?: unknown[] }).characters) &&
      ((payload.characterBible as { characters: unknown[] }).characters.length > 0)) ||
    studioWriterRoomHasContent(payload.writerRoom) ||
    (typeof payload.comments === "object" &&
      payload.comments !== null &&
      Array.isArray((payload.comments as { threads?: unknown[] }).threads) &&
      ((payload.comments as { threads: unknown[] }).threads.length > 0)) ||
    (typeof payload.releaseSchedule === "object" &&
      payload.releaseSchedule !== null &&
      Array.isArray((payload.releaseSchedule as { items?: unknown[] }).items) &&
      ((payload.releaseSchedule as { items: unknown[] }).items.length > 0)) ||
    (typeof payload.publicationAnalytics === "object" &&
      payload.publicationAnalytics !== null &&
      Array.isArray((payload.publicationAnalytics as { records?: unknown[] }).records) &&
      ((payload.publicationAnalytics as { records: unknown[] }).records.length > 0)) ||
    (payload.aiProvenance?.operations.length ?? 0) > 0 ||
    (payload.title ?? "").trim().length > 0 ||
    (payload.description ?? "").trim().length > 0 ||
    (payload.tagsText ?? "").trim().length > 0
  );
}

export function readStudioAutosave(
  storage: Pick<StudioAutosaveStorage, "getItem">,
  key: string,
  allowLegacy = false
): { key: string; payload: StudioAutosavePayload } | null {
  const current = parseStudioAutosave(storage.getItem(key));
  if (current && studioAutosaveHasContent(current)) return { key, payload: current };
  if (!allowLegacy) return null;
  const legacy = parseStudioAutosave(storage.getItem(LEGACY_STUDIO_AUTOSAVE_KEY));
  return legacy && studioAutosaveHasContent(legacy)
    ? { key: LEGACY_STUDIO_AUTOSAVE_KEY, payload: legacy }
    : null;
}
