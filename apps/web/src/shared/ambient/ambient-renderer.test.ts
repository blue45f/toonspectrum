// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AmbientFlashLayerSpec, AmbientLayerSpec, AmbientParticleLayerSpec } from "./ambient-layers";
import { AmbientRenderer } from "./ambient-renderer";

interface FakeContext {
  readonly context: CanvasRenderingContext2D;
  readonly calls: string[];
}

/** 호출만 기록하는 가짜 2D 컨텍스트. */
function fakeContext(): FakeContext {
  const calls: string[] = [];
  const state: Record<string | symbol, unknown> = { globalAlpha: 1, globalCompositeOperation: "source-over" };
  const gradient = { addColorStop: () => undefined };
  const context = new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property];
      if (property === "createRadialGradient" || property === "createLinearGradient") {
        return () => gradient;
      }
      return () => {
        calls.push(String(property));
      };
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { context, calls };
}

const RAIN: AmbientParticleLayerSpec = {
  type: "particles",
  style: "streak",
  count: 12,
  fall: { min: 600, max: 800 },
  drift: { min: 60, max: 100 },
  size: { min: 14, max: 26 },
  opacity: { min: 0.3, max: 0.5 },
  sway: { min: 0, max: 0 },
  colors: ["#a9c3e8"],
  twinkle: null,
  region: "full",
  additive: false,
  shootingStars: null,
};

const FLASH: AmbientFlashLayerSpec = {
  type: "flash",
  minIntervalSeconds: 8,
  maxIntervalSeconds: 8,
  peakOpacity: 0.1,
  rgb: "206, 220, 255",
};

let frames: Array<(now: number) => void>;
let fake: FakeContext;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

function createRenderer(layers: readonly AmbientLayerSpec[] = [RAIN]) {
  const canvas = document.createElement("canvas");
  const renderer = AmbientRenderer.create(canvas, {
    measure: () => ({ width: 800, height: 600 }),
    random: () => 0.5,
  });
  if (!renderer) throw new Error("renderer not created");
  renderer.setLayerSource(() => layers);
  return renderer;
}

/** 예약된 프레임 하나를 실행한다. */
function runFrame(now: number) {
  const frame = frames.shift();
  frame?.(now);
}

beforeEach(() => {
  frames = [];
  fake = fakeContext();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => fake.context as unknown as ReturnType<HTMLCanvasElement["getContext"]>,
  );
  vi.stubGlobal("requestAnimationFrame", (callback: (now: number) => void) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    frames = [];
  });
  setHidden(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AmbientRenderer", () => {
  it("2D 컨텍스트를 만들 수 없으면 null을 돌려준다", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const renderer = AmbientRenderer.create(document.createElement("canvas"), {
      measure: () => ({ width: 10, height: 10 }),
    });
    expect(renderer).toBeNull();
  });

  it("DPR 상한을 지켜 캔버스 크기를 맞춘다", () => {
    const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 3 });
    try {
      const canvas = document.createElement("canvas");
      const renderer = AmbientRenderer.create(canvas, {
        measure: () => ({ width: 400, height: 300 }),
        maxDpr: 2,
      });
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
      renderer?.dispose();
    } finally {
      if (original) Object.defineProperty(window, "devicePixelRatio", original);
      else Reflect.deleteProperty(window, "devicePixelRatio");
    }
  });

  it("requestAnimationFrame 루프 하나로 그리고, 60fps를 넘기지 않는다", () => {
    const renderer = createRenderer();
    renderer.start();
    expect(frames).toHaveLength(1);
    runFrame(1000);
    const strokesAfterFirst = fake.calls.filter((call) => call === "stroke").length;
    expect(strokesAfterFirst).toBeGreaterThan(0);
    expect(frames).toHaveLength(1);
    // 5ms 뒤(120Hz 화면의 중간 프레임)에는 그리지 않고 다음 프레임만 예약한다.
    runFrame(1005);
    expect(fake.calls.filter((call) => call === "stroke")).toHaveLength(strokesAfterFirst);
    expect(frames).toHaveLength(1);
    runFrame(1017);
    expect(fake.calls.filter((call) => call === "stroke").length).toBeGreaterThan(strokesAfterFirst);
    renderer.dispose();
  });

  it("탭이 숨겨지면 멈추고 다시 보이면 이어서 그린다", () => {
    const renderer = createRenderer();
    renderer.start();
    runFrame(1000);
    setHidden(true);
    expect(frames).toHaveLength(0);
    expect(renderer.animating).toBe(false);
    setHidden(false);
    expect(frames).toHaveLength(1);
    renderer.dispose();
  });

  it("clear하면 서서히 사라진 뒤 루프를 멈춘다", () => {
    const renderer = createRenderer();
    renderer.start();
    let now = 1000;
    runFrame(now);
    renderer.clear();
    for (let index = 0; index < 120 && frames.length > 0; index += 1) {
      now += 1000 / 60;
      runFrame(now);
    }
    expect(renderer.layerCount).toBe(0);
    expect(frames).toHaveLength(0);
    renderer.dispose();
  });

  it("dispose 뒤에는 보이기 이벤트에도 다시 그리지 않는다", () => {
    const renderer = createRenderer();
    renderer.start();
    renderer.dispose();
    setHidden(true);
    setHidden(false);
    expect(frames).toHaveLength(0);
  });

  it("번쩍임은 8초 간격보다 자주 오지 않는다(첫 번쩍임도 8초 뒤)", () => {
    const renderer = createRenderer([FLASH]);
    renderer.start();
    const flashStarts: number[] = [];
    let now = 0;
    let wasFlashing = false;
    for (let index = 0; index < 60 * 30; index += 1) {
      now += 1000 / 60;
      const before = fake.calls.length;
      runFrame(now);
      const flashing = fake.calls.slice(before).includes("fillRect");
      if (flashing && !wasFlashing) flashStarts.push(now / 1000);
      wasFlashing = flashing;
    }
    expect(flashStarts.length).toBeGreaterThanOrEqual(2);
    expect(flashStarts[0]).toBeGreaterThanOrEqual(8);
    for (let index = 1; index < flashStarts.length; index += 1) {
      expect((flashStarts[index] ?? 0) - (flashStarts[index - 1] ?? 0)).toBeGreaterThanOrEqual(8);
    }
    renderer.dispose();
  });

  it("정지 장면은 루프 없이 한 번만 그린다", () => {
    const renderer = createRenderer();
    renderer.renderStill();
    expect(fake.calls).toContain("stroke");
    expect(frames).toHaveLength(0);
    renderer.dispose();
  });
});
