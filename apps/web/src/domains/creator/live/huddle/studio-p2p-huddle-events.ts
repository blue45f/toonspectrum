export const STUDIO_P2P_HUDDLE_OPEN_EVENT = "toonspectrum:studio-p2p-huddle:open";
export const STUDIO_P2P_HUDDLE_CLOSE_EVENT = "toonspectrum:studio-p2p-huddle:close";
export const STUDIO_P2P_HUDDLE_CLOSED_EVENT = "toonspectrum:studio-p2p-huddle:closed";

export interface StudioP2pHuddleOpenDetail {
  readonly peerIds?: readonly string[];
  readonly source?: "virtual-space" | "toolbar" | "unknown";
  readonly conversationId?: string;
}

export interface StudioP2pHuddleCloseDetail { readonly conversationId?: string }
export interface StudioP2pHuddleClosedDetail { readonly conversationId: string }

const validConversationId = (value: unknown): value is string =>
  typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/u.test(value);

function normalizePeerIds(peerIds: readonly string[] | undefined): readonly string[] | undefined {
  if (!Array.isArray(peerIds)) return undefined;
  const normalized = [...new Set(
    peerIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => /^[A-Za-z0-9._:-]{1,200}$/u.test(value)),
  )].slice(0, 3);
  return Object.freeze(normalized);
}

export function normalizeStudioP2pHuddleOpenDetail(detail: StudioP2pHuddleOpenDetail): StudioP2pHuddleOpenDetail | null {
  if (!detail || typeof detail !== "object") return null;
  const peerIds = normalizePeerIds(detail.peerIds);
  if (detail.conversationId !== undefined && (
    !validConversationId(detail.conversationId) || !peerIds?.length
    || peerIds.length !== detail.peerIds?.length
  )) return null;
  return { peerIds, conversationId: detail.conversationId, source: detail.source ?? "unknown" };
}

export function openStudioP2pHuddle(detail: StudioP2pHuddleOpenDetail = {}): void {
  if (typeof globalThis.dispatchEvent !== "function") return;
  const normalized = normalizeStudioP2pHuddleOpenDetail(detail);
  if (!normalized) return;
  globalThis.dispatchEvent(new CustomEvent<StudioP2pHuddleOpenDetail>(
    STUDIO_P2P_HUDDLE_OPEN_EVENT,
    {
      detail: normalized,
    },
  ));
}

/** Only the matching conversation is closed; a stale virtual-space cleanup cannot end another call. */
export function closeStudioP2pHuddle(detail: StudioP2pHuddleCloseDetail = {}): void {
  if (typeof globalThis.dispatchEvent !== "function") return;
  if (detail.conversationId !== undefined && !validConversationId(detail.conversationId)) return;
  globalThis.dispatchEvent(new CustomEvent<StudioP2pHuddleCloseDetail>(STUDIO_P2P_HUDDLE_CLOSE_EVENT, { detail }));
}

/** Lifecycle notification after the launcher has cleared its scope and released media. */
export function notifyStudioP2pHuddleClosed(detail: StudioP2pHuddleClosedDetail): void {
  if (typeof globalThis.dispatchEvent !== "function" || !validConversationId(detail.conversationId)) return;
  globalThis.dispatchEvent(new CustomEvent<StudioP2pHuddleClosedDetail>(STUDIO_P2P_HUDDLE_CLOSED_EVENT, { detail }));
}
