import { describe, expect, it } from "vitest";

import {
  clearStudioDraftSaveOutbox,
  consumeRecentlyClearedStudioDraftSaveOutbox,
  createStudioDraftSaveOutboxEntry,
  isStudioDraftSaveOutboxSatisfied,
  readStudioDraftSaveOutbox,
  STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS,
  studioDraftSaveOutboxKey,
  subscribeStudioDraftSaveOutbox,
  writeStudioDraftSaveOutbox,
  type StudioDraftSaveOutboxStorage,
} from "./studio-draft-save-outbox";

function memoryStorage(): StudioDraftSaveOutboxStorage & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

const NOW = Date.now();

describe("studio draft save outbox", () => {
  it("persists only bounded intent metadata and restores it after reload", () => {
    const storage = memoryStorage();
    const entry = createStudioDraftSaveOutboxEntry({
      workId: "work/1",
      serverRevision: 7,
      hasServerDocument: true,
      now: NOW,
    });

    expect(entry).not.toBeNull();
    expect(writeStudioDraftSaveOutbox({ storage, entry: entry! })).toBe(true);
    expect(readStudioDraftSaveOutbox({ storage, workId: "work/1", now: NOW + 1 })).toEqual(entry);
    expect([...storage.values.values()][0]).not.toContain("pages");
    expect([...storage.values.values()][0]).not.toContain("content");
  });

  it("isolates documents even when ids contain URL-significant characters", () => {
    expect(studioDraftSaveOutboxKey("work/1")).not.toBe(studioDraftSaveOutboxKey("work?1"));
  });

  it("fails closed and removes corrupt, mismatched and expired records", () => {
    const storage = memoryStorage();
    const key = studioDraftSaveOutboxKey("work-1")!;
    storage.setItem(key, "{broken");
    expect(readStudioDraftSaveOutbox({ storage, workId: "work-1", now: NOW })).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    storage.setItem(key, JSON.stringify({
      schema: 1,
      workId: "work-2",
      queuedAt: NOW,
      expiresAt: NOW + STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS,
      serverRevisionAtQueue: 1,
      hadServerDocumentAtQueue: true,
    }));
    expect(readStudioDraftSaveOutbox({ storage, workId: "work-1", now: NOW })).toBeNull();
    expect(storage.getItem(key)).toBeNull();

    const expired = createStudioDraftSaveOutboxEntry({ workId: "work-1", now: NOW })!;
    storage.setItem(key, JSON.stringify(expired));
    expect(readStudioDraftSaveOutbox({
      storage,
      workId: "work-1",
      now: NOW + STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS,
    })).toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });

  it("does not claim persistence when storage writes or verification fail", () => {
    const entry = createStudioDraftSaveOutboxEntry({ workId: "work-1", now: NOW })!;
    const throwing: StudioDraftSaveOutboxStorage = {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
      removeItem: () => undefined,
    };
    expect(writeStudioDraftSaveOutbox({ storage: throwing, entry })).toBe(false);
    expect(clearStudioDraftSaveOutbox({ storage: throwing, workId: "work-1" })).toBe(true);
  });

  it("invalidates a receipt when removal is denied but overwrite is still available", () => {
    const backing = memoryStorage();
    const entry = createStudioDraftSaveOutboxEntry({ workId: "work-1", now: NOW })!;
    expect(writeStudioDraftSaveOutbox({ storage: backing, entry })).toBe(true);
    const constrained: StudioDraftSaveOutboxStorage = {
      getItem: backing.getItem,
      setItem: backing.setItem,
      removeItem: () => { throw new Error("removal denied"); },
    };

    expect(clearStudioDraftSaveOutbox({ storage: constrained, workId: "work-1" })).toBe(true);
    expect(readStudioDraftSaveOutbox({
      storage: constrained,
      workId: "work-1",
      now: NOW + 1,
    })).toBeNull();
  });

  it("reports cleanup failure when neither removal nor invalidation is available", () => {
    const backing = memoryStorage();
    const entry = createStudioDraftSaveOutboxEntry({ workId: "work-1", now: NOW })!;
    expect(writeStudioDraftSaveOutbox({ storage: backing, entry })).toBe(true);
    const locked: StudioDraftSaveOutboxStorage = {
      getItem: backing.getItem,
      setItem: () => { throw new Error("overwrite denied"); },
      removeItem: () => { throw new Error("removal denied"); },
    };

    expect(clearStudioDraftSaveOutbox({ storage: locked, workId: "work-1" })).toBe(false);
  });

  it("treats a newer server revision as satisfying the queued intent", () => {
    const entry = createStudioDraftSaveOutboxEntry({
      workId: "work-1",
      serverRevision: 7,
      hasServerDocument: true,
      now: NOW,
    })!;
    expect(isStudioDraftSaveOutboxSatisfied(entry, 7)).toBe(false);
    expect(isStudioDraftSaveOutboxSatisfied(entry, 8)).toBe(true);
  });

  it("treats the first observed server revision as satisfying a first-save intent", () => {
    const firstSave = createStudioDraftSaveOutboxEntry({
      workId: "work-1",
      hasServerDocument: false,
      now: NOW,
    })!;
    const unknownRevision = createStudioDraftSaveOutboxEntry({
      workId: "work-1",
      hasServerDocument: true,
      now: NOW,
    })!;
    expect(isStudioDraftSaveOutboxSatisfied(firstSave, null)).toBe(false);
    expect(isStudioDraftSaveOutboxSatisfied(firstSave, 1)).toBe(true);
    expect(isStudioDraftSaveOutboxSatisfied(unknownRevision, 1)).toBe(false);
  });

  it("hands a cleared receipt to the save wrapper only in the same turn", async () => {
    const storage = memoryStorage();
    const entry = createStudioDraftSaveOutboxEntry({
      workId: "work-1",
      serverRevision: 7,
      hasServerDocument: true,
      now: NOW,
    })!;
    const changes: Array<boolean> = [];
    const unsubscribe = subscribeStudioDraftSaveOutbox(({ entry: changedEntry }) => {
      changes.push(changedEntry !== null);
    });

    expect(writeStudioDraftSaveOutbox({ storage, entry })).toBe(true);
    expect(clearStudioDraftSaveOutbox({ storage, workId: "work-1" })).toBe(true);
    expect(consumeRecentlyClearedStudioDraftSaveOutbox("work-1")).toEqual(entry);
    expect(consumeRecentlyClearedStudioDraftSaveOutbox("work-1")).toBeNull();
    expect(changes).toEqual([true, false]);

    expect(writeStudioDraftSaveOutbox({ storage, entry })).toBe(true);
    expect(clearStudioDraftSaveOutbox({ storage, workId: "work-1" })).toBe(true);
    await Promise.resolve();
    expect(consumeRecentlyClearedStudioDraftSaveOutbox("work-1")).toBeNull();
    unsubscribe();
  });
});
