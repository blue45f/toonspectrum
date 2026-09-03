// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioFloatingSurfaceRegistry,
  STUDIO_FLOATING_SURFACE_Z_INDEX_BASE,
} from "./studio-floating-surface-registry";

afterEach(() => {
  document.body.replaceChildren();
});

function surface(
  left: number,
  top: number,
  width = 300,
  height = 400,
): HTMLDivElement {
  const node = document.createElement("div");
  document.body.append(node);
  vi.spyOn(node, "getBoundingClientRect").mockReturnValue({
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({}),
  });
  return node;
}

describe("studio floating surface registry", () => {
  it("assigns focus order and brings only the activated panel forward", () => {
    const registry = createStudioFloatingSurfaceRegistry();
    const firstZ = vi.fn();
    const secondZ = vi.fn();
    const first = surface(10, 10);
    const second = surface(320, 10);

    const unregisterFirst = registry.register({
      id: "first",
      node: first,
      onZIndexChange: firstZ,
    });
    registry.register({
      id: "second",
      node: second,
      onZIndexChange: secondZ,
    });

    expect(firstZ.mock.calls[0]?.[0]).toBeGreaterThan(
      STUDIO_FLOATING_SURFACE_Z_INDEX_BASE,
    );
    expect(secondZ.mock.calls[0]?.[0]).toBeGreaterThan(
      firstZ.mock.calls[0]?.[0],
    );
    const activated = registry.activate("first");
    expect(firstZ).toHaveBeenLastCalledWith(activated);
    expect(activated).toBeGreaterThan(secondZ.mock.calls[0]?.[0]);
    expect(registry.size()).toBe(2);

    unregisterFirst();
    expect(registry.size()).toBe(1);
  });

  it("returns only mounted visible peer rectangles", () => {
    const registry = createStudioFloatingSurfaceRegistry();
    const source = surface(10, 20, 200, 300);
    const peer = surface(240, 20, 280, 300);
    const hidden = surface(540, 20, 200, 300);
    hidden.hidden = true;

    registry.register({
      id: "source",
      node: source,
      onZIndexChange: () => undefined,
    });
    registry.register({
      id: "peer",
      node: peer,
      onZIndexChange: () => undefined,
    });
    registry.register({
      id: "hidden",
      node: hidden,
      onZIndexChange: () => undefined,
    });

    expect(registry.peerRects("source")).toEqual([
      { x: 240, y: 20, width: 280, height: 300 },
    ]);
  });

  it("broadcasts reset only to currently registered surfaces", () => {
    const registry = createStudioFloatingSurfaceRegistry();
    const resetFirst = vi.fn();
    const resetSecond = vi.fn();
    const unregister = registry.register({
      id: "first",
      node: surface(0, 0),
      onZIndexChange: () => undefined,
      onReset: resetFirst,
    });
    registry.register({
      id: "second",
      node: surface(300, 0),
      onZIndexChange: () => undefined,
      onReset: resetSecond,
    });

    unregister();
    registry.resetAll();
    expect(resetFirst).not.toHaveBeenCalled();
    expect(resetSecond).toHaveBeenCalledOnce();
  });
});
