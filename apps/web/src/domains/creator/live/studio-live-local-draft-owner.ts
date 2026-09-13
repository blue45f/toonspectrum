/** Browser-local origin receipt, not a server role, credential or manuscript snapshot. */
export const STUDIO_LOCAL_DRAFT_OWNER_PREFIX = "toonstudio:local-draft-origin:v1:";
interface OriginStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
interface OwnerLocks {
  request(name: string, options: { ifAvailable: true }, callback: (lock: unknown | null) => Promise<void>): Promise<void>;
}
export function studioLocalDraftOwnerScope(input: {
  ownerId: string | null; projectId: string | null; documentId: string | null; draftId: string | null;
}): string {
  return JSON.stringify([input.ownerId, input.projectId, input.documentId, input.draftId]);
}
function valid(scope: string, room: string): boolean {
  return scope.length > 0 && scope.length <= 4096
    && /^work-instant-[a-z0-9]+-[a-z0-9]{4}$/u.test(room) && room.length <= 160;
}
export function hasStudioLocalDraftOrigin(storage: OriginStorage, scope: string, room: string): boolean {
  if (!valid(scope, room)) return false;
  try {
    const raw = storage.getItem(STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope));
    if (!raw || raw.length > 12288) return false;
    const value = JSON.parse(raw) as { v?: unknown; scope?: unknown; room?: unknown };
    return value?.v === 1 && value.scope === scope && value.room === room
      && Object.keys(value).sort().join() === "room,scope,v";
  } catch { return false; }
}
/**
 * A restarted local origin may reclaim only its own exact browser/account/document room after
 * acquiring a non-stealing Web Lock. Active companions remain joiners. No saved-work or remix
 * caller is admitted; a query string alone never establishes ownership. Unsupported locks and
 * denied/corrupt storage do not promote a joiner. The browser releases the lease on process exit.
 */
export function holdStudioLocalDraftOwnership(input: {
  scope: string; room: string; knownTabOwner: boolean; workId: string | null; remixId: string | null;
  storage: OriginStorage | null; locks: OwnerLocks | null; onRecovered: () => void;
}): () => void {
  let active = true;
  let release = () => {};
  const dispose = () => { active = false; release(); };
  const { storage, locks, scope, room } = input;
  if (input.workId || input.remixId || !storage || !locks || !valid(scope, room)) return dispose;
  if (!input.knownTabOwner && !hasStudioLocalDraftOrigin(storage, scope, room)) return dispose;
  const held = new Promise<void>((resolve) => { release = resolve; });
  void Promise.resolve().then(() => locks.request(
    STUDIO_LOCAL_DRAFT_OWNER_PREFIX + JSON.stringify([scope, room]), { ifAvailable: true },
    async (lock) => {
      if (!active || !lock) return;
      if (input.knownTabOwner) {
        try {
          storage.setItem(STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope),
            JSON.stringify({ v: 1, scope, room }));
        } catch { /* Existing tab ownership remains unchanged; no restart guarantee. */ }
      } else {
        // Recheck after acquiring the lease: another local document may have replaced the pointer.
        if (!hasStudioLocalDraftOrigin(storage, scope, room)) return;
        input.onRecovered();
      }
      await held;
    },
  )).catch(() => { /* Never turn unsupported/denied ownership coordination into an edit grant. */ });
  return dispose;
}
