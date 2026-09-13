import { describe, expect, it } from "vitest";

import { clearPromotionDraft, initialPromotionDraft, readPromotionDraft, savePromotionDraft } from "./promotion-draft";

function memoryStorage() {
  const entries = new Map<string, string>();
  return { entries, getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); }, removeItem: (key: string) => { entries.delete(key); } };
}
const snapshot = () => ({ draft: { ...initialPromotionDraft(), title: "작성 중", videoUrl: "https://", rightsConfirmed: true }, tags: "첫연재, " });
const NOW = Date.parse("2026-09-14T00:00:00Z");
describe("promotion tab drafts", () => {
  it("recovers incomplete text but never restores rights confirmation", () => {
    const storage = memoryStorage();
    expect(savePromotionDraft("artist", snapshot(), storage, NOW)).toBe("saved");
    const loaded = readPromotionDraft("artist", storage, NOW);
    expect(loaded).toMatchObject({ status: "restored", value: { draft: { title: "작성 중", videoUrl: "https://", rightsConfirmed: false }, tags: "첫연재, " } });
    expect([...storage.entries.values()][0]).not.toContain('"rightsConfirmed":true');
  });
  it("keeps accounts isolated", () => {
    const storage = memoryStorage(); savePromotionDraft("artist", snapshot(), storage, NOW);
    expect(readPromotionDraft("other", storage, NOW)).toEqual({ status: "empty" });
    clearPromotionDraft("other", storage);
    expect(readPromotionDraft("artist", storage, NOW).status).toBe("restored");
  });
  it("removes only the current account after publishing", () => {
    const storage = memoryStorage();
    savePromotionDraft("a", snapshot(), storage, NOW); savePromotionDraft("b", snapshot(), storage, NOW);
    expect(clearPromotionDraft("a", storage)).toBe(true);
    expect(readPromotionDraft("a", storage, NOW).status).toBe("empty");
    expect(readPromotionDraft("b", storage, NOW).status).toBe("restored");
  });
  it.each(["owner", "version", "oversized", "bad-fields"])("rejects tampered %s without overwriting stored content", (mode) => {
    const storage = memoryStorage(); savePromotionDraft("a", snapshot(), storage, NOW);
    const key = [...storage.entries.keys()][0], raw = storage.getItem(key)!;
    const envelope = JSON.parse(raw);
    if (mode === "owner") envelope.ownerId = "other";
    if (mode === "version") envelope.version = 2;
    if (mode === "bad-fields") envelope.value.draft.cover = "data:image/svg+xml,<svg/>";
    const changed = mode === "oversized" ? "x".repeat(300_000) : JSON.stringify(envelope);
    storage.setItem(key, changed);
    expect(readPromotionDraft("a", storage, NOW).status).toBe("invalid");
    expect(storage.getItem(key)).toBe(changed);
  });
  it("expires a week-old draft and rejects a future clock", () => {
    const storage = memoryStorage(); savePromotionDraft("a", snapshot(), storage, NOW);
    expect(readPromotionDraft("a", storage, NOW + 8 * 86400000).status).toBe("invalid");
    expect(readPromotionDraft("a", storage, NOW - 120000).status).toBe("invalid");
  });
  it("does not keep an empty form or accept a missing account", () => {
    const storage = memoryStorage();
    expect(savePromotionDraft("a", { draft: initialPromotionDraft(), tags: "" }, storage)).toBe("empty");
    expect(savePromotionDraft("", snapshot(), storage)).toBe("unavailable");
    expect(storage.entries.size).toBe(0);
  });
  it("reports blocked storage rather than claiming a saved draft", () => {
    const blocked = () => { throw new Error("Storage disabled"); };
    const storage = { getItem: blocked, setItem: blocked, removeItem: blocked };
    expect(savePromotionDraft("a", snapshot(), storage)).toBe("unavailable");
    expect(readPromotionDraft("a", storage).status).toBe("unavailable");
    expect(clearPromotionDraft("a", storage)).toBe(false);
  });
});
