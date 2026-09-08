import { describe, expect, it } from "vitest";

import {
  clearStudioDraftSaveOutbox,
  createStudioDraftSaveOutboxEntry,
  isStudioDraftSaveOutboxSatisfied,
  readStudioDraftSaveOutbox,
  STUDIO_DRAFT_SAVE_OUTBOX_TTL_MS,
  studioDraftSaveOutboxKey,
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

const NOW = Date.parse("2026-09-09T05:00:00.000Z");

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
});
