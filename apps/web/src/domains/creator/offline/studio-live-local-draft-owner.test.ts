import { describe, expect, it, vi } from "vitest";

import { hasStudioLocalDraftOrigin, holdStudioLocalDraftOwnership, studioLocalDraftOwnerScope, STUDIO_LOCAL_DRAFT_OWNER_PREFIX } from "../live/studio-live-local-draft-owner";

const room = "work-instant-abc-1234";
const scope = studioLocalDraftOwnerScope({ ownerId: "a", projectId: "p", documentId: "d", draftId: null });
function fixture() {
  const rows = new Map<string, string>();
  const held = new Set<string>();
  const storage = { getItem: (key: string) => rows.get(key) ?? null, setItem: (key: string, value: string) => { rows.set(key, value); } };
  const locks = { request: vi.fn(async (name: string, _options: { ifAvailable: true }, callback: (lock: unknown | null) => Promise<void>) => {
    if (held.has(name)) { await callback(null); return; }
    held.add(name);
    try { await callback({ name }); } finally { held.delete(name); }
  }) };
  return { rows, storage, locks, held };
}
const settle = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
function options(f: ReturnType<typeof fixture>) {
  return { scope, room, knownTabOwner: true, workId: null, remixId: null, storage: f.storage, locks: f.locks, onRecovered: vi.fn() };
}
describe("browser-local origin reclaim (not server authority)", () => {
  it("remembers only the current local owner and holds a non-stealing lease", async () => {
    const f = fixture(); const input = options(f); const close = holdStudioLocalDraftOwnership(input);
    await settle();
    expect(hasStudioLocalDraftOrigin(f.storage, scope, room)).toBe(true);
    expect(f.held.size).toBe(1);
    expect(input.onRecovered).not.toHaveBeenCalled();
    expect(f.locks.request.mock.calls[0]?.[1]).toEqual({ ifAvailable: true });
    close(); await settle(); expect(f.held.size).toBe(0);
  });
  it("does not promote a companion while the origin tab still exists", async () => {
    const f = fixture(); const close = holdStudioLocalDraftOwnership(options(f)); await settle();
    const join = { ...options(f), knownTabOwner: false };
    const closeJoin = holdStudioLocalDraftOwnership(join); await settle();
    expect(join.onRecovered).not.toHaveBeenCalled();
    closeJoin(); close(); await settle();
  });
  it("reclaims the same local origin after the browser releases its old lease", async () => {
    const f = fixture(); const close = holdStudioLocalDraftOwnership(options(f)); await settle(); close(); await settle();
    const restarted = { ...options(f), knownTabOwner: false };
    const closeRestart = holdStudioLocalDraftOwnership(restarted); await settle();
    expect(restarted.onRecovered).toHaveBeenCalledTimes(1);
    expect(f.held.size).toBe(1);
    closeRestart(); await settle();
  });
  it.each([{ workId: "server-work", remixId: null }, { workId: null, remixId: "source" }])("never admits saved or remix sources %j", async (source) => {
    const f = fixture(); const input = { ...options(f), ...source };
    holdStudioLocalDraftOwnership(input); await settle();
    expect(f.rows.size).toBe(0); expect(f.locks.request).not.toHaveBeenCalled();
  });
  it("rejects foreign rooms, different owners and different local documents", async () => {
    const f = fixture(); const close = holdStudioLocalDraftOwnership(options(f)); await settle(); close(); await settle();
    for (const changed of [{ room: "work-instant-other-1234" },
      { scope: studioLocalDraftOwnerScope({ ownerId: "b", projectId: "p", documentId: "d", draftId: null }) },
      { scope: studioLocalDraftOwnerScope({ ownerId: "a", projectId: "p", documentId: "other", draftId: null }) }]) {
      const input = { ...options(f), knownTabOwner: false, ...changed };
      holdStudioLocalDraftOwnership(input); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
    }
  });
  it("never treats an unknown URL as proof of ownership", async () => {
    const f = fixture(); const input = { ...options(f), knownTabOwner: false };
    holdStudioLocalDraftOwnership(input); await settle();
    expect(f.rows.size).toBe(0); expect(f.locks.request).not.toHaveBeenCalled(); expect(input.onRecovered).not.toHaveBeenCalled();
  });
  it("fails closed for missing locks, denied storage and corrupt origins", async () => {
    const f = fixture(); const key = STUDIO_LOCAL_DRAFT_OWNER_PREFIX + encodeURIComponent(scope);
    for (const raw of ["corrupt", "null", JSON.stringify({ v: 1, scope, room, extra: true }), "x".repeat(12289)]) {
      f.rows.set(key, raw); expect(hasStudioLocalDraftOrigin(f.storage, scope, room)).toBe(false);
    }
    const noLocks = { ...options(f), knownTabOwner: false, locks: null };
    holdStudioLocalDraftOwnership(noLocks); await settle(); expect(noLocks.onRecovered).not.toHaveBeenCalled();
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    const input = { ...options(f), knownTabOwner: false, storage: denied };
    holdStudioLocalDraftOwnership(input); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
  });
  it("does not recover after unmount or if the pointer changes before the lock callback", async () => {
    const f = fixture(); const owner = holdStudioLocalDraftOwnership(options(f)); await settle(); owner(); await settle();
    const input = { ...options(f), knownTabOwner: false };
    const close = holdStudioLocalDraftOwnership(input); close(); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
    holdStudioLocalDraftOwnership(input); f.rows.clear(); await settle(); expect(input.onRecovered).not.toHaveBeenCalled();
  });
});
