import { afterEach, describe, expect, it, vi } from "vitest";

import { arrangeStudioWorkspaceRegions, readStudioWorkspaceRegionDetached, registerStudioWorkspaceRegion, restoreStudioWorkspaceArrangement, saveStudioWorkspaceArrangement, setStudioWorkspaceArranging, STUDIO_WORKSPACE_ARRANGEMENT_KEY, studioWorkspaceArrangingSnapshot, subscribeStudioWorkspaceArranging, writeStudioWorkspaceRegionDetached } from "./studio-workspace-arrangement";

const layout = { version: 2 as const, xRatio: 0.2, yRatio: 0.3, width: 360, height: 500, dock: "free" as const, positionLocked: false, sizeLocked: false };
const cleanups: (() => void)[] = [];
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function controller() { return { capture: () => ({ detached: true, layout }), restore: vi.fn(), attach: vi.fn(), detach: vi.fn() }; }
afterEach(() => { cleanups.splice(0).forEach((cleanup) => cleanup()); setStudioWorkspaceArranging(false); });

describe("studio workspace arrangement", () => {
  it("publishes only actual edit-mode changes and supports unsubscribe", () => {
    const changed = vi.fn(); const stop = subscribeStudioWorkspaceArranging(changed);
    setStudioWorkspaceArranging(true); setStudioWorkspaceArranging(true);
    expect(studioWorkspaceArrangingSnapshot()).toBe(true); expect(changed).toHaveBeenCalledTimes(1);
    stop(); setStudioWorkspaceArranging(false); expect(changed).toHaveBeenCalledTimes(1);
  });
  it("remembers a region's detach state without requiring storage", () => {
    const target = storage();
    expect(readStudioWorkspaceRegionDetached("tools", target)).toBe(false);
    expect(writeStudioWorkspaceRegionDetached("tools", true, target)).toBe(true);
    expect(readStudioWorkspaceRegionDetached("tools", target)).toBe(true);
    expect(writeStudioWorkspaceRegionDetached("tools", false, target)).toBe(true);
    expect(readStudioWorkspaceRegionDetached("tools", target)).toBe(false);
    expect(writeStudioWorkspaceRegionDetached("tools", true, null)).toBe(false);
  });
  it("handles denied storage without breaking the editor", () => {
    const denied = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(readStudioWorkspaceRegionDetached("tools", denied)).toBe(false);
    expect(writeStudioWorkspaceRegionDetached("tools", true, denied)).toBe(false);
    expect(saveStudioWorkspaceArrangement(denied)).toBe(false);
    expect(restoreStudioWorkspaceArrangement(denied)).toBe(false);
  });
  it("saves and restores UI geometry for mounted regions", () => {
    const target = storage(); const region = controller();
    cleanups.push(registerStudioWorkspaceRegion("tools", region));
    expect(saveStudioWorkspaceArrangement(target)).toBe(true);
    expect(restoreStudioWorkspaceArrangement(target)).toBe(true);
    expect(region.restore).toHaveBeenCalledWith({ id: "tools", detached: true, layout });
    arrangeStudioWorkspaceRegions("detach"); arrangeStudioWorkspaceRegions("attach");
    expect(region.detach).toHaveBeenCalledTimes(1); expect(region.attach).toHaveBeenCalledTimes(1);
  });
  it("does not unregister a replacement controller during stale cleanup", () => {
    const old = controller(); const current = controller();
    const stop = registerStudioWorkspaceRegion("tools", old);
    cleanups.push(registerStudioWorkspaceRegion("tools", current)); stop();
    arrangeStudioWorkspaceRegions("attach");
    expect(current.attach).toHaveBeenCalledTimes(1); expect(old.attach).not.toHaveBeenCalled();
  });
  it.each(["invalid", "null", '{"version":2,"entries":[]}', '{"version":1,"entries":{}}', '{"version":1,"entries":[{"id":"tools","detached":"yes","layout":{}}]}'])("rejects malformed snapshots %s", (raw) => {
    const target = storage(); const region = controller();
    cleanups.push(registerStudioWorkspaceRegion("tools", region));
    target.setItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY, raw);
    expect(restoreStudioWorkspaceArrangement(target)).toBe(false); expect(region.restore).not.toHaveBeenCalled();
  });
  it("validates the entire snapshot before changing any region", () => {
    const target = storage(); const region = controller(); cleanups.push(registerStudioWorkspaceRegion("tools", region));
    target.setItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY, JSON.stringify({ version: 1, entries: [{ id: "tools", detached: true, layout }, null] }));
    expect(restoreStudioWorkspaceArrangement(target)).toBe(false); expect(region.restore).not.toHaveBeenCalled();
  });
  it("ignores unknown regions and rejects oversized payloads", () => {
    const target = storage(); target.setItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY, JSON.stringify({ version: 1, entries: [{ id: "missing", detached: true, layout }] }));
    expect(restoreStudioWorkspaceArrangement(target)).toBe(false);
    target.setItem(STUDIO_WORKSPACE_ARRANGEMENT_KEY, " ".repeat(100_001)); expect(restoreStudioWorkspaceArrangement(target)).toBe(false);
  });
});
