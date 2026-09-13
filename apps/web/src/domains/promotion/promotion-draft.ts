import { PROMOTION_GENRES, PROMOTION_KINDS, PROMOTION_STAGES, promotionKey, promotionRecord, validPromotionCover } from "../../../../../packages/core/src/promotion";

import type { PromotionInput } from "../../../../../packages/core/src/promotion";

export type PromotionDraft = Omit<PromotionInput, "rightsConfirmed"> & { rightsConfirmed: boolean };
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PromotionDraftSnapshot = { draft: PromotionDraft; tags: string };
export type PromotionDraftLoad = { status: "empty" | "invalid" | "unavailable" } | { status: "restored"; value: PromotionDraftSnapshot };
const MAX_STORED_CHARS = 256 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const draftKey = (ownerId: string) => `toonstudio:promotion-draft:v1:${encodeURIComponent(ownerId)}`;
export function initialPromotionDraft(): PromotionDraft {
  return { kind: "series", stage: "amateur", genre: "판타지", title: "", seriesTitle: "", description: "", readingUrl: "", videoUrl: "", cover: "", tags: [], contentWarning: "", rightsConfirmed: false };
}
function snapshotOf(value: unknown): PromotionDraftSnapshot | null {
  const snapshot = promotionRecord(value), body = promotionRecord(snapshot.draft);
  if (!promotionKey(PROMOTION_KINDS, body.kind) || !promotionKey(PROMOTION_STAGES, body.stage)
    || !PROMOTION_GENRES.includes(body.genre as PromotionInput["genre"]) || !validPromotionCover(body.cover)) return null;
  const limits = { title: 100, seriesTitle: 100, description: 4000, readingUrl: 1000, videoUrl: 1000, contentWarning: 150 } as const;
  for (const [key, limit] of Object.entries(limits)) if (typeof body[key] !== "string" || (body[key] as string).length > limit) return null;
  if (typeof snapshot.tags !== "string" || snapshot.tags.length > 200) return null;
  // Preserve incomplete text/URLs as plain input, not as trusted published content.
  // Whitelist every field and never restore a previous publishing consent.
  return { draft: { kind: body.kind, stage: body.stage, genre: body.genre as PromotionInput["genre"],
    title: body.title as string, seriesTitle: body.seriesTitle as string, description: body.description as string,
    readingUrl: body.readingUrl as string, videoUrl: body.videoUrl as string, contentWarning: body.contentWarning as string,
    cover: body.cover, tags: [], rightsConfirmed: false }, tags: snapshot.tags };
}
/** sessionStorage survives refresh, but does not share writes between tabs. */
export function readPromotionDraft(ownerId: string, storage?: DraftStorage, now = Date.now()): PromotionDraftLoad {
  if (!ownerId) return { status: "empty" };
  try {
    const raw = (storage ?? globalThis.sessionStorage).getItem(draftKey(ownerId));
    if (!raw) return { status: "empty" };
    if (raw.length > MAX_STORED_CHARS) return { status: "invalid" };
    const envelope = promotionRecord(JSON.parse(raw));
    if (envelope.version !== 1 || envelope.ownerId !== ownerId || typeof envelope.savedAt !== "number"
      || !Number.isFinite(envelope.savedAt) || envelope.savedAt > now + 60_000 || now - envelope.savedAt > MAX_AGE_MS) return { status: "invalid" };
    const value = snapshotOf(envelope.value);
    return value ? { status: "restored", value } : { status: "invalid" };
  } catch { return { status: "unavailable" }; }
}
export function clearPromotionDraft(ownerId: string, storage?: DraftStorage): boolean {
  if (!ownerId) return false;
  try { (storage ?? globalThis.sessionStorage).removeItem(draftKey(ownerId)); return true; }
  catch { return false; }
}
export function savePromotionDraft(ownerId: string, snapshot: PromotionDraftSnapshot, storage?: DraftStorage, now = Date.now()): "saved" | "empty" | "unavailable" {
  if (!ownerId) return "unavailable";
  const value = snapshotOf(snapshot);
  if (!value) return "unavailable";
  const { draft, tags } = value;
  if (![draft.title, draft.seriesTitle, draft.description, draft.readingUrl, draft.videoUrl, draft.cover, draft.contentWarning, tags].some((text) => text.trim())) return clearPromotionDraft(ownerId, storage) ? "empty" : "unavailable";
  try {
    const raw = JSON.stringify({ version: 1, ownerId, savedAt: now, value });
    if (raw.length > MAX_STORED_CHARS) return "unavailable";
    (storage ?? globalThis.sessionStorage).setItem(draftKey(ownerId), raw); return "saved";
  } catch { return "unavailable"; }
}
