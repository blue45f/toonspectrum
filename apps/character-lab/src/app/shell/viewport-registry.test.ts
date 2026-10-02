// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createViewportRegistry } from "./viewport-registry";

describe("app/shell/viewport-registry", () => {
  it("등록한 캔버스를 돌려주고 해제하면 null이 된다", () => {
    const registry = createViewportRegistry();
    const seen: Array<HTMLCanvasElement | null> = [];
    registry.subscribe((canvas) => seen.push(canvas));
    expect(registry.current()).toBeNull();
    const canvas = document.createElement("canvas");
    const release = registry.register(canvas);
    expect(registry.current()).toBe(canvas);
    release();
    expect(registry.current()).toBeNull();
    expect(seen).toEqual([canvas, null]);
  });

  it("호스트 안의 첫 canvas를 탐색하되 등록 캔버스가 우선이다", () => {
    const registry = createViewportRegistry();
    const host = document.createElement("main");
    const inner = document.createElement("canvas");
    host.append(inner);
    const detach = registry.attachHost(host);
    expect(registry.current()).toBe(inner);
    const registered = document.createElement("canvas");
    const release = registry.register(registered);
    expect(registry.current()).toBe(registered);
    release();
    expect(registry.current()).toBe(inner);
    detach();
    expect(registry.current()).toBeNull();
  });
});
