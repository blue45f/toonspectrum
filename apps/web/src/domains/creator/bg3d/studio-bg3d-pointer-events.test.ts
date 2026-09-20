// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWithEqualityFn } from "zustand/traditional";
import type { RootState } from "@react-three/fiber";
import { createStudioBg3dPointerEvents } from "./studio-bg3d-pointer-events";

function setup() {
  const store = createWithEqualityFn<RootState>(() => ({}) as RootState);
  const events = createStudioBg3dPointerEvents(store);
  store.setState({ set: store.setState, events });
  const target = document.createElement("div");
  document.body.append(target);
  return { store, events, target, handlerCount: Object.keys(events.handlers ?? {}).length };
}

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });

describe("BG3D pointer event source lifetime", () => {
  it("ignores the null event source observed after applying a background and closing its editor", () => {
    const { store, events } = setup();
    expect(() => events.connect(null)).not.toThrow();
    expect(store.getState().events.connected).toBeUndefined();
  });

  it("does not connect a detached viewport or the detached Canvas fallback", () => {
    const { events, store, target } = setup();
    target.remove();
    const add = vi.spyOn(target, "addEventListener");
    events.connect(target);
    expect(add).not.toHaveBeenCalled();
    expect(store.getState().events.connected).toBeUndefined();
  });

  it("keeps every standard pointer handler on a connected viewport", () => {
    const { events, store, target, handlerCount } = setup();
    const add = vi.spyOn(target, "addEventListener");
    events.connect(target);
    expect(handlerCount).toBeGreaterThan(0);
    expect(add).toHaveBeenCalledTimes(handlerCount);
    expect(store.getState().events.connected).toBe(target);
    expect(events.compute).toBeTypeOf("function");
    expect(events.update).toBeTypeOf("function");
    events.disconnect?.();
  });

  it("releases the previous listeners when the event source disappears", () => {
    const { events, store, target, handlerCount } = setup();
    const remove = vi.spyOn(target, "removeEventListener");
    events.connect(target);
    target.remove();
    expect(() => events.connect(null)).not.toThrow();
    expect(remove).toHaveBeenCalledTimes(handlerCount);
    expect(store.getState().events.connected).toBeUndefined();
    events.disconnect?.();
    expect(remove).toHaveBeenCalledTimes(handlerCount);
  });

  it("reconnects after the viewport is attached again without duplicate listeners", () => {
    const { events, store, target, handlerCount } = setup();
    const add = vi.spyOn(target, "addEventListener");
    const remove = vi.spyOn(target, "removeEventListener");
    events.connect(target);
    target.remove();
    events.connect(target);
    expect(remove).toHaveBeenCalledTimes(handlerCount);
    document.body.append(target);
    events.connect(target);
    expect(add).toHaveBeenCalledTimes(handlerCount * 2);
    expect(store.getState().events.connected).toBe(target);
    events.disconnect?.();
    expect(remove).toHaveBeenCalledTimes(handlerCount * 2);
  });

  it("does not hide real errors while connecting a valid viewport", () => {
    const { events, target } = setup();
    vi.spyOn(target, "addEventListener").mockImplementation(() => { throw new Error("listener failure"); });
    expect(() => events.connect(target)).toThrow("listener failure");
    events.disconnect?.();
  });

  it("is the event factory of the production BG3D Canvas", () => {
    const source = readFileSync("apps/web/src/domains/creator/bg3d/StudioBg3dEditorViewport.tsx", "utf8");
    expect(source).toContain("events={createStudioBg3dPointerEvents}");
  });
});
