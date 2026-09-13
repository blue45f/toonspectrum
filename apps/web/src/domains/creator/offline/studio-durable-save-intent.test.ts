import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  acknowledgeStudioDurableSaveIntent, boundStudioSaveIntentOperation,
  studioDurableSaveIntentRepository,
  studioSaveAcknowledgementVersion, studioSaveIntentScopeKey,
  STUDIO_DURABLE_SAVE_INTENT_NAMESPACE, subscribeStudioDurableSaveIntent,
} from "../studio-durable-save-intent";

import { createStudioDurableSaveIntentRepository, decodeStudioDurableSaveIntent } from "../studio-durable-save-intent-sqlite";

const storage = vi.hoisted(() => new Map<string, string>());
const database = vi.hoisted(() => ({
  kvGet: vi.fn(async (_namespace: string, key: string) => storage.get(key) ?? null),
  kvSet: vi.fn(async (_namespace: string, key: string, value: string) => { storage.set(key, value); }),
  kvDelete: vi.fn(async (_namespace: string, key: string) => { storage.delete(key); }),
}));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => database }));
const scope = { ownerId: "owner-a", documentKey: "local-untitled-1" };
let sequence = 0;
const repository = () => createStudioDurableSaveIntentRepository({
  acquireDatabase: async () => database, now: () => 1700000000000, createId: () => `intent-${++sequence}`,
});
beforeEach(() => { storage.clear(); vi.clearAllMocks(); });

describe("durable save intent: shared SQLite authority, no automatic replay", () => {
  it("persists a serverless local document across repository instances", async () => {
    const entry = await repository().remember(scope, null);
    expect(await repository().load(scope)).toEqual(entry);
    expect(database.kvSet).toHaveBeenCalledWith(STUDIO_DURABLE_SAVE_INTENT_NAMESPACE,
      studioSaveIntentScopeKey(scope), JSON.stringify(entry));
  });
  it("isolates owners, anonymous sessions and individual documents", async () => {
    await repository().remember(scope, 7);
    for (const other of [{ ...scope, ownerId: "owner-b" }, { ...scope, ownerId: null },
      { ...scope, documentKey: "local-untitled-2" }]) expect(await repository().load(other)).toBeNull();
  });
  it("does not treat another server revision or elapsed days as acknowledgement", async () => {
    const entry = await repository().remember(scope, 7);
    expect((await repository().load(scope))?.serverRevision).toBe(7);
    expect(studioSaveAcknowledgementVersion(scope)).toBe(0);
    expect(await repository().load(scope)).toEqual(entry);
  });
  it("does not erase a newly queued intent when an older save finishes", async () => {
    const repo = repository();
    const old = await repo.remember(scope, 7);
    const current = await repo.remember(scope, 8);
    expect(await repo.clear(scope, old.id)).toBe(false);
    expect(await repo.load(scope)).toEqual(current);
  });
  it("serializes overlapping writes, reads and cancellation", async () => {
    const repo = repository();
    const first = repo.remember(scope, 1);
    const next = repo.remember(scope, 2);
    const latest = await next;
    expect(await repo.clear(scope, (await first).id)).toBe(false);
    expect(await repo.load(scope)).toEqual(latest);
    expect(await repo.clear(scope, latest.id)).toBe(true);
    expect(await repo.load(scope)).toBeNull();
  });
  it("fails readback rather than claiming a receipt was stored", async () => {
    const repo = createStudioDurableSaveIntentRepository({ acquireDatabase: async () => ({
      ...database, kvSet: async () => undefined,
    }) });
    await expect(repo.remember(scope, 1)).rejects.toThrow("다시 읽지 못했습니다");
  });
  it("does not discard existing data when quota rejects the next write", async () => {
    const previous = await repository().remember(scope, 1);
    const repo = createStudioDurableSaveIntentRepository({ acquireDatabase: async () => ({
      ...database, kvSet: async () => { throw new Error("quota"); },
    }) });
    await expect(repo.remember(scope, 2)).rejects.toThrow("quota");
    expect(await repository().load(scope)).toEqual(previous);
  });
  it("detects failed deletion without reporting cancellation success", async () => {
    const entry = await repository().remember(scope, null);
    const repo = createStudioDurableSaveIntentRepository({ acquireDatabase: async () => ({
      ...database, kvDelete: async () => undefined,
    }) });
    await expect(repo.clear(scope, entry.id)).rejects.toThrow("지우지 못했습니다");
    expect(await repository().load(scope)).toEqual(entry);
  });
  it("preserves corrupt rows and does not fall back to sessionStorage or IndexedDB", async () => {
    const key = studioSaveIntentScopeKey(scope);
    storage.set(key, "corrupt");
    await expect(repository().load(scope)).rejects.toThrow();
    await expect(repository().clear(scope, "intent-1")).rejects.toThrow();
    expect(storage.get(key)).toBe("corrupt");
    expect(database.kvDelete).not.toHaveBeenCalled();
  });
  it("ignores throwing observers after a successful commit", async () => {
    const unsubscribe = subscribeStudioDurableSaveIntent(() => { throw new Error("observer"); });
    try { expect(await repository().remember(scope, 3)).toBeTruthy(); } finally { unsubscribe(); }
  });
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid revision %s", (revision) => {
    expect(() => repository().remember(scope, revision)).toThrow();
  });
  it.each(["", " ", "x".repeat(2049)])("rejects invalid document keys", (documentKey) => {
    expect(() => repository().load({ ...scope, documentKey })).toThrow();
  });
  it("rejects unknown fields, owner mismatch, invalid ids and oversized rows", async () => {
    const entry = await repository().remember(scope, 1);
    for (const value of [{ ...entry, content: "must-not-be-stored" },
      { ...entry, scope: { ...scope, ownerId: "wrong" } }, { ...entry, id: "../bad" },
      { ...entry, queuedAt: -1 }]) expect(() => decodeStudioDurableSaveIntent(JSON.stringify(value), scope)).toThrow();
    expect(() => decodeStudioDurableSaveIntent("x".repeat(8193), scope)).toThrow();
  });
  it("only publishes success through the explicit pipeline acknowledgement", async () => {
    const entry = await studioDurableSaveIntentRepository.remember(scope, 7);
    const before = studioSaveAcknowledgementVersion(scope);
    expect(studioSaveAcknowledgementVersion(scope)).toBe(before);
    await acknowledgeStudioDurableSaveIntent(scope, entry);
    expect(studioSaveAcknowledgementVersion(scope)).toBeGreaterThan(before);
    expect(await studioDurableSaveIntentRepository.load(scope)).toBeNull();
  });
  it("bounds stalled metadata IO without reporting success", async () => {
    vi.useFakeTimers();
    try {
      const bounded = boundStudioSaveIntentOperation(new Promise<void>(() => undefined));
      const failure = expect(bounded).rejects.toThrow("지연");
      await vi.advanceTimersByTimeAsync(2001);
      await failure;
    } finally { vi.useRealTimers(); }
  });
  it("clears the timer when IO completes", async () => {
    vi.useFakeTimers();
    try {
      expect(await boundStudioSaveIntentOperation(Promise.resolve(42))).toBe(42);
      await expect(boundStudioSaveIntentOperation(Promise.reject(new Error("blocked")))).rejects.toThrow("blocked");
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

});
