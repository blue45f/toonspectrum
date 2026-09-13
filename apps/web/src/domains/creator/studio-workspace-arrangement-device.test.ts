import { describe, expect, it, vi } from "vitest";
import { createStudioWorkspaceArrangementDevice } from "./studio-workspace-arrangement-device";
import { decodeStudioWorkspaceArrangement } from "./studio-workspace-arrangement";
import type { StudioAsyncKeyValueStore } from "./studio-local-database";

const entry = { id: "tool-rail", detached: true, collapsed: true, layout: { version: 2, xRatio: 0.2, yRatio: 0.2, width: 120, height: 600, dock: "free", positionLocked: false, sizeLocked: false } };
const raw = JSON.stringify({ version: 1, entries: [entry] });
function memoryStore() {
  const data = new Map<string, string>();
  return { get: vi.fn(async (key: string) => data.get(key) ?? null), set: vi.fn(async (key: string, value: string) => { data.set(key, value); }) } as unknown as StudioAsyncKeyValueStore;
}
describe("workspace device snapshots", () => {
  it("persists the entire snapshot and reads it from another repository instance", async () => {
    const store = memoryStore();
    expect(await createStudioWorkspaceArrangementDevice(store).save(raw)).toBe(true);
    expect(await createStudioWorkspaceArrangementDevice(store).load()).toBe(raw);
  });
  it("never acknowledges a silent dropped write", async () => {
    const store = memoryStore(); store.set = vi.fn(async () => undefined);
    expect(await createStudioWorkspaceArrangementDevice(store).save(raw)).toBe(false);
  });
  it("keeps write and read errors contained", async () => {
    const store = memoryStore(); store.get = vi.fn(async () => { throw new Error("blocked"); });
    store.set = vi.fn(async () => { throw new Error("quota"); });
    const device = createStudioWorkspaceArrangementDevice(store);
    expect(await device.save(raw)).toBe(false); expect(await device.load()).toBeNull();
  });
  it("serializes writes so the last successful request wins", async () => {
    const device = createStudioWorkspaceArrangementDevice(memoryStore());
    const next = raw.replace('"collapsed":true', '"collapsed":false');
    expect(await Promise.all([device.save(raw), device.save(next)])).toEqual([true, true]);
    expect(await device.load()).toBe(next);
  });
  it.each([
    "{", "x".repeat(100_001),
    JSON.stringify({ version: 1, entries: [entry, entry] }),
    JSON.stringify({ version: 1, entries: [{ ...entry, id: "../document" }] }),
    JSON.stringify({ version: 1, entries: [{ ...entry, collapsed: "yes" }] }),
    ...[{ width: -1 }, { width: null }, { height: 10001 }, { xRatio: 2 }, { version: 7 }, { dock: "unknown" }, { sizeLocked: "no" }]
      .map(value => JSON.stringify({ version: 1, entries: [{ ...entry, layout: { ...entry.layout, ...value } }] })),
  ])("rejects a malformed snapshot before any storage mutation (%#)", async value => {
    const store = memoryStore();
    expect(decodeStudioWorkspaceArrangement(value)).toBeNull();
    expect(await createStudioWorkspaceArrangementDevice(store).save(value)).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
  });
  it("accepts older snapshots with no collapse preference", () => {
    const { collapsed: _collapsed, ...legacy } = entry;
    expect(decodeStudioWorkspaceArrangement(JSON.stringify({ version: 1, entries: [legacy] }))).toHaveLength(1);
  });
});
