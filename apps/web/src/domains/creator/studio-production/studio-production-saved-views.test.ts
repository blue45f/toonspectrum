import { describe, expect, it, vi } from "vitest";
import { createProductionViewsRepository, parseProductionViews, productionViewScope, type ProductionSavedFilter } from "./studio-production-saved-views";

const filter: ProductionSavedFilter = { view: "due", query: "원고", stage: "all", layout: "calendar", sort: "due" };
function harness() {
  const rows = new Map<string, string>();
  const store = { get: vi.fn(async (key: string) => rows.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { rows.set(key, value); }), delete: vi.fn(async (key: string) => { rows.delete(key); }) };
  let tail: Promise<unknown> = Promise.resolve();
  const lock = <T,>(_key: string, action: () => Promise<T>) => { const result = tail.then(action); tail = result.catch(() => {}); return result; };
  return { rows, store, repository: createProductionViewsRepository(store, lock) };
}
describe("bounded personal production views", () => {
  it("saves only explicit filters under actor/work scope and reopens them", async () => {
    const h = harness(), key = productionViewScope("alice", "work:a");
    const saved = await h.repository.save(key, "마감 원고", filter);
    expect(saved).toHaveLength(1);
    expect(await h.repository.load(key)).toEqual(saved);
    expect(saved[0]?.filter).toEqual(filter);
    expect(await h.repository.load(productionViewScope("bob", "work:a"))).toEqual([]);
    expect(await h.repository.load(productionViewScope("alice", "work:b"))).toEqual([]);
    expect(productionViewScope(null, "work:a")).not.toBe(productionViewScope("null", "work:a"));
    expect(Object.keys(JSON.parse(h.rows.get(key)!))).toEqual(["version", "views"]);
  });
  it("serializes simultaneous saves and removes only the selected view", async () => {
    const h = harness(), key = productionViewScope(null, "draft:a");
    await Promise.all([h.repository.save(key, "first", filter), h.repository.save(key, "second", filter)]);
    const views = await h.repository.load(key); expect(views).toHaveLength(2);
    const next = await h.repository.remove(key, views[0]!.id);
    expect(next.map((v) => v.name)).toEqual(["second"]);
    expect(h.store.delete).not.toHaveBeenCalled();
  });
  it("rejects duplicate normalized names and the seventeenth view without overwriting", async () => {
    const h = harness();
    await h.repository.save("scope", "ABC", filter);
    await expect(h.repository.save("scope", "ＡＢＣ", filter)).rejects.toThrow();
    for (let i = 1; i < 16; i++) await h.repository.save("scope", `view-${i}`, filter);
    const before = h.rows.get("scope");
    await expect(h.repository.save("scope", "overflow", filter)).rejects.toThrow();
    expect(h.rows.get("scope")).toBe(before);
  });
  it("does not replace corrupt storage or succeed when persistence rejects", async () => {
    const h = harness(); h.rows.set("scope", "broken");
    await expect(h.repository.save("scope", "new", filter)).rejects.toThrow();
    expect(h.store.set).not.toHaveBeenCalled(); expect(h.rows.get("scope")).toBe("broken");
    h.rows.delete("scope"); h.store.set.mockRejectedValueOnce(new Error("quota"));
    await expect(h.repository.save("scope", "new", filter)).rejects.toThrow("quota");
    expect(await h.repository.load("scope")).toEqual([]);
  });
  it("rejects unexpected payload fields, invalid filters, huge values and duplicate IDs", () => {
    expect(parseProductionViews(null)).toEqual([]);
    const view = { id: crypto.randomUUID(), name: "v", filter };
    for (const raw of ["x".repeat(16001), JSON.stringify({version: 2, views: []}),
      JSON.stringify({version: 1, views: [{...view, document: "must not persist"}]}),
      JSON.stringify({version: 1, views: [{...view, filter: {...filter, view: "admin"}}]}),
      JSON.stringify({version: 1, views: [view, {...view, name: "other"}]}),
    ]) expect(() => parseProductionViews(raw)).toThrow();
  });
});
