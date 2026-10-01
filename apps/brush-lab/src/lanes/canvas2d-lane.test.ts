import { describe, expect, it } from "vitest";

import { buildFixture } from "../bench/fixtures/stroke-fixtures";
import { runFixture } from "../bench/runner/run-fixture";
import { fakeEnv } from "../bench/testing/synthetic-images";
import { InvalidStateError, LaneUnavailableError } from "../engine/core/errors";
import { presetById } from "../engine/presets/catalog";

import { acquire2dContext, CANVAS2D_LANE, createCanvas2dLane, dabCssColor, stampDab } from "./canvas2d-lane";

import type { Canvas2dContextLike } from "./canvas2d-lane";
import type { LaneEnvironment } from "./lane";
import type { DabInstance } from "../engine/core/types";

/**
 * canvas2d 레인 Node 계약 테스트. 실제 캔버스가 없으므로 호출을 기록하는 모의 2D 컨텍스트로
 * "dab당 setTransform·createRadialGradient·arc 1회, globalAlpha = flow·a, endStroke에서 drawImage 1회(opacity·블렌드)"와
 * dom-unavailable 경로만 검증한다. 실제 픽셀은 브라우저 검증 항목이다.
 */
interface RecordingContext extends Canvas2dContextLike {
  calls: string[];
  alphas: number[];
  composites: string[];
  stops: [number, string][];
  transforms: number[][];
}

function recordingContext(): RecordingContext {
  const ctx: RecordingContext = {
    calls: [],
    alphas: [],
    composites: [],
    stops: [],
    transforms: [],
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    save: () => {
      ctx.calls.push("save");
    },
    restore: () => {
      ctx.calls.push("restore");
    },
    setTransform: (a, b, c, d, e, f) => {
      ctx.calls.push("setTransform");
      ctx.transforms.push([a, b, c, d, e, f]);
    },
    beginPath: () => {
      ctx.calls.push("beginPath");
    },
    arc: () => {
      ctx.calls.push("arc");
    },
    fill: () => {
      ctx.calls.push("fill");
      ctx.alphas.push(ctx.globalAlpha);
      ctx.composites.push(ctx.globalCompositeOperation);
    },
    createRadialGradient: () => {
      ctx.calls.push("createRadialGradient");
      const gradient = {
        addColorStop: (offset: number, color: string): void => {
          ctx.stops.push([offset, color]);
        },
      };
      return gradient as unknown as CanvasGradient;
    },
    clearRect: () => {
      ctx.calls.push("clearRect");
    },
    drawImage: () => {
      ctx.calls.push("drawImage");
      ctx.alphas.push(ctx.globalAlpha);
      ctx.composites.push(ctx.globalCompositeOperation);
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      ctx.calls.push("getImageData");
      const data = new Uint8ClampedArray(w * h * 4);
      for (let i = 3; i < data.length; i += 4) data[i] = 255;
      return { width: w, height: h, data, colorSpace: "srgb" } as unknown as ImageData;
    },
  };
  return ctx;
}

function mockCanvasEnv(contexts: RecordingContext[]): LaneEnvironment {
  const env = fakeEnv();
  env.createCanvas = (w, h) => {
    const ctx = recordingContext();
    contexts.push(ctx);
    return { width: w, height: h, getContext: () => ctx } as unknown as HTMLCanvasElement;
  };
  return env;
}

function dab(partial: Partial<DabInstance> = {}): DabInstance {
  return {
    x: 4,
    y: 4,
    rx: 2,
    ry: 1,
    angle: 0.3,
    hardness: 0.5,
    flow: 0.7,
    shapeExp: 2,
    r: 0,
    g: 0,
    b: 0,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 0,
    pigmentMass: 0,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "dry-stamp",
    ...partial,
  };
}

describe("canvas2d 레인(Node 계약)", () => {
  it("디스크립터·probe: createCanvas 없음/컨텍스트 없음/예외는 모두 dom-unavailable, init은 LaneUnavailableError", async () => {
    expect(CANVAS2D_LANE.id).toBe("canvas2d");
    expect(CANVAS2D_LANE.status).toBe("browser-verification-required");
    const lane = createCanvas2dLane();
    expect((await lane.probe({ clock: { now: () => 0 } })).reasons).toEqual(["dom-unavailable"]);
    const noCtx: LaneEnvironment = {
      clock: { now: () => 0 },
      createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
    };
    expect((await lane.probe(noCtx)).reasons).toEqual(["dom-unavailable"]);
    const throwing: LaneEnvironment = {
      clock: { now: () => 0 },
      createCanvas: () => {
        throw new Error("no DOM");
      },
    };
    expect((await lane.probe(throwing)).reasons).toEqual(["dom-unavailable"]);
    await expect(lane.init(noCtx, { width: 8, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toBeInstanceOf(LaneUnavailableError);
    await expect(lane.init({ clock: { now: () => 0 } }, { width: 8, height: 8, dpr: 1, tileSize: 16, seed: 1 })).rejects.toMatchObject({
      code: "dom-unavailable",
    });
  });

  it("acquire2dContext는 필요한 메서드가 하나라도 없으면 null(무음 대체 없음)", () => {
    const full = recordingContext();
    expect(acquire2dContext({ getContext: () => full } as unknown as HTMLCanvasElement)).toBe(full);
    const partial = { ...recordingContext(), arc: undefined };
    expect(acquire2dContext({ getContext: () => partial } as unknown as HTMLCanvasElement)).toBeNull();
    expect(acquire2dContext({} as unknown as HTMLCanvasElement)).toBeNull();
    expect(acquire2dContext({ getContext: () => "2d" } as unknown as HTMLCanvasElement)).toBeNull();
  });

  it("모의 컨텍스트: dab당 arc·createRadialGradient 1회, 0 < globalAlpha ≤ 1, endStroke에서 drawImage 1회(opacity·블렌드)", async () => {
    const contexts: RecordingContext[] = [];
    const env = mockCanvasEnv(contexts);
    const lane = createCanvas2dLane();
    const program = presetById("pencil-hb");
    const fixture = buildFixture("line", { width: 64, height: 64 });
    const run = await runFixture({ lane, env, fixture, program, seed: 1, disposeLane: false });
    // runFixture probe(1) + init의 문서·획 캔버스(2) = 3. 마지막 둘이 문서·획.
    expect(contexts.length).toBe(3);
    const stroke = contexts[contexts.length - 1];
    const doc = contexts[contexts.length - 2];
    if (!doc || !stroke) throw new Error("contexts");
    const arcs = stroke.calls.filter((c) => c === "arc").length;
    expect(arcs).toBe(run.receipt.dabCount);
    expect(arcs).toBeGreaterThan(0);
    expect(stroke.calls.filter((c) => c === "createRadialGradient").length).toBe(arcs);
    expect(stroke.calls.filter((c) => c === "setTransform").length).toBe(arcs);
    for (const a of stroke.alphas) {
      expect(a).toBeGreaterThan(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(stroke.composites.every((c) => c === "source-over")).toBe(true);
    // endStroke: 문서에 drawImage 1회(opacity·블렌드), 획 캔버스 clearRect 1회.
    expect(doc.calls.filter((c) => c === "drawImage").length).toBe(1);
    expect(doc.alphas).toEqual([program.deposition.opacity]);
    expect(doc.composites).toEqual(["source-over"]);
    expect(stroke.calls.filter((c) => c === "clearRect").length).toBe(1);
    expect(run.image.data.length).toBe(64 * 64 * 4);
    expect(run.linear).toBeNull();
    expect(run.receipt.timingSource).toBe("unavailable");
    expect(run.receipt.gpuTimeMs).toBeNull();
    expect(run.receipt.submitCount).toBe(run.frames.length + 1);
    // 프레임 dispatch 합 = 프레임에 찍은 dab 수(꼬리 dab는 up 프레임 또는 endStroke에서).
    const frameDabs = run.frames.reduce((s, f) => s + f.dabCount, 0);
    expect(run.frames.reduce((s, f) => s + f.dispatchCount, 0)).toBe(frameDabs);
    expect(frameDabs).toBeLessThanOrEqual(run.receipt.dabCount);
    expect(lane.stats()).toMatchObject({ strokes: 1, dabs: run.receipt.dabCount, submits: run.receipt.submitCount });
    lane.dispose();
    await expect(lane.readback()).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("stampDab·dabCssColor: 단위 원 변환·경도 스톱·지우개 destination-out·sRGB 색, 호출 순서 위반은 InvalidStateError", async () => {
    const ctx = recordingContext();
    stampDab(ctx, dab());
    expect(ctx.calls).toEqual(["save", "setTransform", "createRadialGradient", "beginPath", "arc", "fill", "restore"]);
    expect(ctx.alphas).toEqual([0.7]);
    expect(ctx.stops.map(([o]) => o)).toEqual([0, 0.5, 1]);
    expect(ctx.stops.map(([, c]) => c)).toEqual(["rgba(0,0,0,1)", "rgba(0,0,0,1)", "rgba(0,0,0,0)"]);
    // [a c e; b d f] = translate · rotate(0.3) · scale(2, 1)
    const t = ctx.transforms[0];
    if (!t) throw new Error("transform");
    expect(t[0]).toBeCloseTo(2 * Math.cos(0.3), 6);
    expect(t[1]).toBeCloseTo(2 * Math.sin(0.3), 6);
    expect(t[2]).toBeCloseTo(-Math.sin(0.3), 6);
    expect(t[3]).toBeCloseTo(Math.cos(0.3), 6);
    expect(t[4]).toBe(4);
    expect(t[5]).toBe(4);
    stampDab(ctx, dab({ erase: true }));
    expect(ctx.composites).toEqual(["source-over", "destination-out"]);
    // 반경 하한 0.25(0 반경 dab도 특이 변환 없이 찍힌다).
    stampDab(ctx, dab({ rx: 0, ry: 0 }));
    expect(ctx.transforms[2]?.[0]).toBeCloseTo(0.25 * Math.cos(0.3), 6);
    // airbrush는 flow를 절반으로.
    stampDab(ctx, dab({ deposition: "airbrush", flow: 0.5 }));
    expect(ctx.alphas[3]).toBeCloseTo(0.25, 6);
    expect(dabCssColor(dab())).toEqual({ css: "rgb(0,0,0)", alpha: 1 });
    expect(dabCssColor(dab({ r: 0.5, g: 0.5, b: 0.5, a: 0.5 }))).toEqual({ css: "rgb(255,255,255)", alpha: 0.5 });
    expect(dabCssColor(dab({ r: 0.2, g: 0, b: 0, a: 0 }))).toEqual({ css: "rgb(0,0,0)", alpha: 0 });
    const lane = createCanvas2dLane();
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(InvalidStateError);
    expect(() => lane.addSamples([])).toThrow(InvalidStateError);
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    await expect(lane.readbackLinear()).rejects.toBeInstanceOf(InvalidStateError);
  });

  it("beginStroke 중복·up 뒤 addSamples는 InvalidStateError", async () => {
    const contexts: RecordingContext[] = [];
    const env = mockCanvasEnv(contexts);
    const lane = createCanvas2dLane();
    await lane.init(env, { width: 32, height: 32, dpr: 1, tileSize: 16, seed: 1 });
    const program = presetById("ink-g-pen");
    lane.beginStroke(program, 1);
    expect(() => lane.beginStroke(program, 1)).toThrow(InvalidStateError);
    const fixture = buildFixture("line", { width: 32, height: 32 });
    lane.addSamples(fixture.samples);
    expect(() => lane.addSamples([])).toThrow(InvalidStateError);
    const receipt = await lane.endStroke();
    expect(receipt.dabCount).toBeGreaterThan(0);
    expect(receipt.frameTimesMs.length).toBe(2);
    lane.beginStroke(program, 2);
    await lane.endStroke();
    expect(lane.stats().strokes).toBe(2);
  });
});
