import { buildStudioLiveShareHref } from "./creator-studio-links";

export const STUDIO_LIVE_ROOM_SEARCH_PARAM = "room";

export function readStudioLiveRoomQuery(
  search: string | URLSearchParams | null | undefined
): string | null {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  const room = params?.get(STUDIO_LIVE_ROOM_SEARCH_PARAM)?.trim() ?? "";
  return room.length > 0 ? room : null;
}

export function createStudioLiveInstantWorkId(
  now: () => number = Date.now,
  random: () => number = Math.random
): string {
  return `work-instant-${now().toString(36)}-${random().toString(36).slice(2, 6)}`;
}

export function resolveStudioLiveSessionWorkId(input: {
  workId: string | null;
  roomId: string | null;
  draftWorkId?: string | null;
  instantWorkId: string;
}): string {
  return input.workId
    ?? input.roomId
    ?? input.draftWorkId
    ?? input.instantWorkId;
}

/** Server ACL document. A Magma-style `?room=` jam is not a shared work document. */
export function shouldExpectStudioSharedDocument(input: {
  workAuthScopeKey: string | null;
  workId: string | null;
  remixId: string | null;
}): boolean {
  return Boolean(input.workAuthScopeKey && input.workId && !input.remixId);
}

/** Socket.IO is required only for authenticated team/draft rooms, not same-origin tab jams. */
export function shouldRequireStudioLiveServer(input: {
  expectsSharedDocument: boolean;
  draftCollaborationReady: boolean;
}): boolean {
  return input.expectsSharedDocument || input.draftCollaborationReady;
}

export function shouldPublishStudioLiveJamRoom(input: {
  workId: string | null;
  remixId: string | null;
  roomId: string | null;
}): boolean {
  return !input.workId && !input.remixId && !input.roomId;
}

export function withStudioLiveJamRoom(
  search: string | URLSearchParams,
  roomId: string
): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set(STUDIO_LIVE_ROOM_SEARCH_PARAM, roomId);
  return next;
}

export function openStudioLiveCompanionTab(
  roomId: string,
  openWindow: (
    url: string,
    target: string,
    features: string
  ) => Window | null = (url, target, features) => window.open(url, target, features)
): boolean {
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const opened = openWindow(
    buildStudioLiveShareHref(roomId, origin),
    "_blank",
    "noopener,noreferrer"
  );
  return opened !== null;
}
