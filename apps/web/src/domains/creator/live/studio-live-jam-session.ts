import { STUDIO_LIVE_JAM_WORK_ID_PREFIX } from "../../../shared/lib/studio-live-jam-scope";
import { buildStudioLiveShareHref } from "../creator-studio-links";

export {
  isStudioLiveJamScope,
  isStudioLiveJamWorkId,
  STUDIO_LIVE_JAM_WORK_ID_PREFIX,
} from "../../../shared/lib/studio-live-jam-scope";

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
  const salt = random().toString(36).slice(2, 6).padEnd(4, "0");
  return `${STUDIO_LIVE_JAM_WORK_ID_PREFIX}${now().toString(36)}-${salt}`;
}

const STUDIO_LIVE_OWNER_ROOM_SESSION_KEY = "toonspectrum:studio-live-owner-room:v1";

export interface StudioLiveOwnerRoomSessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function readStudioLiveOwnedRoomId(
  storage: StudioLiveOwnerRoomSessionStorage | null | undefined,
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(STUDIO_LIVE_OWNER_ROOM_SESSION_KEY)?.trim() ?? "";
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberStudioLiveOwnedRoomId(
  storage: StudioLiveOwnerRoomSessionStorage | null | undefined,
  roomId: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(STUDIO_LIVE_OWNER_ROOM_SESSION_KEY, roomId);
  } catch {
    // Storage can be unavailable in hardened/private WebViews. The fresh id still works for this mount.
  }
}

/**
 * Keeps the auto-published local room identity stable across reloads and document-boundary remounts.
 *
 * `sessionStorage` is intentionally tab-scoped: the owner tab remembers the room it published, while
 * a companion tab opened with `noopener` receives only the shared URL and therefore generates its own
 * instant id. That preserves the owner-vs-joiner lock boundary after a reload instead of turning the
 * owner into a false remote participant merely because React created a new layout instance.
 */
export function resolveStudioLiveInstantWorkIdForTab(input: {
  workId: string | null;
  remixId: string | null;
  roomId: string | null;
  storage?: StudioLiveOwnerRoomSessionStorage | null;
  now?: () => number;
  random?: () => number;
}): string {
  const fresh = () => createStudioLiveInstantWorkId(input.now, input.random);

  if (input.workId || input.remixId) return fresh();

  const roomId = input.roomId?.trim() ?? "";
  if (roomId) {
    return readStudioLiveOwnedRoomId(input.storage) === roomId ? roomId : fresh();
  }

  const instantWorkId = fresh();
  rememberStudioLiveOwnedRoomId(input.storage, instantWorkId);
  return instantWorkId;
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

/**
 * Distinguishes the tab that owns an auto-published instant room from a tab that joined it.
 *
 * A new Studio document publishes its own `instantWorkId` into `?room=` after mount. Treating that
 * owner as a remote join makes the whole editor fail-closed while the live transport/CRDT bridge is
 * still booting (or unavailable), which can disable Pen/Eraser on an otherwise local draft. A real
 * joining tab has a different per-tab `instantWorkId`, so the room mismatch is a stable boundary:
 * owners keep editing locally while the realtime lane warms up; joiners still wait for convergence.
 */
export function isStudioJoinedLiveJamRoom(input: {
  roomId: string | null;
  instantWorkId: string;
}): boolean {
  const roomId = input.roomId?.trim() ?? "";
  return roomId.length > 0 && roomId !== input.instantWorkId;
}

const STUDIO_LIVE_SHARED_PAGE_ID_MAX = 160;

/**
 * Instant jam rooms have no saved page list. A random first-page UUID made
 * "follow this tab" fail because the follower never had that id.
 */
export function studioLiveSharedBootstrapPageId(workId: string): string {
  const trimmed = workId.trim();
  if (!trimmed) return "";
  const id = `jam-page-${trimmed}`;
  return id.length <= STUDIO_LIVE_SHARED_PAGE_ID_MAX
    ? id
    : id.slice(0, STUDIO_LIVE_SHARED_PAGE_ID_MAX);
}

export function shouldSeedStudioLiveSharedBootstrapPage(savedWorkId: string | null): boolean {
  return savedWorkId == null;
}

/** Server ACL document. A Magma-style `?room=` jam is not a shared work document. */
export function shouldExpectStudioSharedDocument(input: {
  workAuthScopeKey: string | null;
  workId: string | null;
  remixId: string | null;
}): boolean {
  return Boolean(input.workAuthScopeKey && input.workId && !input.remixId);
}

/** Socket.IO is required for saved team/draft rooms and Magma-style public jam rooms. */
export function shouldRequireStudioLiveServer(input: {
  expectsSharedDocument: boolean;
  draftCollaborationReady: boolean;
  /** Instant / `?room=` jam. Two browsers cannot share BroadcastChannel. */
  liveJam?: boolean;
}): boolean {
  return input.expectsSharedDocument
    || input.draftCollaborationReady
    || input.liveJam === true;
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
