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

  it("claim: 엔진 생성에 한 번 넘긴 캔버스는 다시 넘기지 않고 renewer가 마운트한 새 캔버스를 돌려준다(컨텍스트 종류는 캔버스에 잠긴다)", () => {
    const registry = createViewportRegistry();
    expect(registry.claim()).toBeNull();
    const first = document.createElement("canvas");
    registry.register(first);
    // 첫 엔진 생성 시도는 마운트된 캔버스 그대로
    expect(registry.claim()).toBe(first);
    // renewer가 없으면 교체할 수 없어 같은 캔버스(호출부는 이미 이전 동작과 같다)
    expect(registry.claim()).toBe(first);

    const created: HTMLCanvasElement[] = [];
    const unsetRenewer = registry.setRenewer(() => {
      const next = document.createElement("canvas");
      created.push(next);
      registry.register(next);
    });
    const second = registry.claim();
    expect(second).toBe(created[0]);
    expect(second).not.toBe(first);
    expect(registry.current()).toBe(second);
    // 새 캔버스도 한 번 넘기고 나면 다음 선택은 또 새 캔버스
    const third = registry.claim();
    expect(third).toBe(created[1]);
    expect(created).toHaveLength(2);
    unsetRenewer();
    expect(registry.claim()).toBe(third);
  });

  it("claim: 등록한 캔버스가 바뀌면(언마운트 후 재마운트) 새 캔버스는 처음 한 번은 그대로 넘긴다", () => {
    const registry = createViewportRegistry();
    const first = document.createElement("canvas");
    const release = registry.register(first);
    expect(registry.claim()).toBe(first);
    release();
    const remounted = document.createElement("canvas");
    registry.register(remounted);
    expect(registry.claim()).toBe(remounted);
  });
});
