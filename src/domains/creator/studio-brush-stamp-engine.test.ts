import { describe, expect, it } from "vitest";

import {
  beginStampWalker,
  drawStampStroke,
  planStudioStampBrushDabs,
  STUDIO_STAMP_BRUSH_DEFAULTS,
  stampJitter,
  stampStrokeDot,
  walkStampSegment,
  type StudioStampBrushKind,
  type StudioStampBrushStyle,
} from "./studio-brush-stamp-engine";

/** canvas2d 호출을 기록하는 가짜 컨텍스트 — 픽셀 대신 dab 시퀀스로 검증한다. */
interface RecordedDab {
  x: number;
  y: number;
  r: number;
  alpha: number;
}
function recordingContext() {
  const dabs: RecordedDab[] = [];
  const strokes: RecordedDab[] = [];
  let alpha = 1;
  let pathArc: { x: number; y: number; r: number } | null = null;
  const context = {
    set globalAlpha(value: number) {
      alpha = value;
    },
    get globalAlpha() {
      return alpha;
    },
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    beginPath: () => {
      pathArc = null;
    },
    arc: (x: number, y: number, r: number) => {
      pathArc = { x, y, r };
    },
    fill: () => {
      if (pathArc) dabs.push({ ...pathArc, alpha });
    },
    stroke: () => {
      if (pathArc) strokes.push({ ...pathArc, alpha });
    },
  } as unknown as CanvasRenderingContext2D;
  return { context, dabs, strokes };
}

function style(kind: StudioStampBrushKind, overrides?: Partial<StudioStampBrushStyle>): StudioStampBrushStyle {
  return {
    kind,
    color: "#223344",
    size: 12,
    opacity: 1,
    ...STUDIO_STAMP_BRUSH_DEFAULTS[kind],
    ...overrides,
  };
}

const LINE: number[] = [];
const LINE_PRESSURES: number[] = [];
for (let i = 0; i <= 20; i += 1) {
  LINE.push(i * 6, 0);
  LINE_PRESSURES.push(0.3 + 0.6 * (i / 20));
}

describe("studio stamp brush engine", () => {
  it("stampJitter is deterministic and in [0,1)", () => {
    for (let i = 0; i < 50; i += 1) {
      const a = stampJitter(i, 7);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
      expect(stampJitter(i, 7)).toBe(a);
    }
    expect(stampJitter(1, 7)).not.toBe(stampJitter(2, 7));
  });

  it("incremental walking equals whole-stroke replay (pixel-convention contract)", () => {
    for (const kind of ["airbrush", "pencil", "ink", "watercolor"] as const) {
      const whole = recordingContext();
      drawStampStroke(whole.context, style(kind), LINE, LINE_PRESSURES);

      const incremental = recordingContext();
      stampStrokeDot(incremental.context, style(kind), LINE[0]!, LINE[1]!, LINE_PRESSURES[0]!);
      const state = beginStampWalker(LINE[0]!, LINE[1]!, LINE_PRESSURES[0]!);
      state.stampIndex = 1;
      for (let i = 1; i * 2 < LINE.length; i += 1) {
        walkStampSegment(
          incremental.context,
          style(kind),
          state,
          LINE[i * 2]!,
          LINE[i * 2 + 1]!,
          LINE_PRESSURES[i]!
        );
      }
      expect(incremental.dabs).toEqual(whole.dabs);
      expect(incremental.strokes).toEqual(whole.strokes);
    }
  });

  // 의도적 변경(2026-07-23 스트로크 렌더 품질 감사): 시작 도트 위에 t=0 중복 dab을 얹지 않는다.
  it("does not double-stamp the stroke head: exactly one dab sits on the start point", () => {
    for (const kind of ["airbrush", "pencil", "ink", "watercolor"] as const) {
      const planned = planStudioStampBrushDabs(style(kind), [5, 5, 65, 5], [0.6, 0.6]);
      const headDabs = planned.filter((dab) => dab.x === 5 && dab.y === 5);
      expect(headDabs).toHaveLength(1);
      expect(headDabs[0]!.index).toBe(0);
      // 첫 워커 dab은 시작 도트에서 최소 한 간격만큼 떨어져 있고, 이후 간격과 동일한 리듬이다.
      const first = planned[1]!;
      const second = planned[2]!;
      expect(first.x - 5).toBeGreaterThan(0);
      expect(second.x - first.x).toBeCloseTo(first.x - 5, 10);
    }
  });

  it("keeps the t=0 dab for a dot-less walker (stampIndex 0) exactly as before", () => {
    const rec = recordingContext();
    const state = beginStampWalker(0, 0, 0.8);
    walkStampSegment(rec.context, style("ink"), state, 40, 0, 0.8);
    expect(rec.dabs[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("pure dab planner preserves tap, short-stroke and long-stroke ordering deterministically", () => {
    const ink = style("ink", { size: 16, minSizeRatio: 0.2 });
    const tap = planStudioStampBrushDabs(ink, [7, 9], [0.25]);
    const short = planStudioStampBrushDabs(ink, [7, 9, 17, 9], [0.25, 0.7]);
    const long = planStudioStampBrushDabs(ink, [7, 9, 117, 9], [0.25, 0.7]);

    expect(tap).toHaveLength(1);
    expect(tap[0]).toMatchObject({ x: 7, y: 9, index: 0, alpha: 1 });
    expect(short.length).toBeGreaterThan(tap.length);
    expect(long.length).toBeGreaterThan(short.length);
    expect(long.map((dab) => dab.index)).toEqual(
      Array.from({ length: long.length }, (_, index) => index)
    );
    expect(planStudioStampBrushDabs(ink, [7, 9, 117, 9], [0.25, 0.7])).toEqual(long);
  });

  it("pure planner and Canvas primary dabs share the same footprint", () => {
    for (const kind of ["airbrush", "ink", "watercolor"] as const) {
      const brushStyle = style(kind, { opacity: 0.65 });
      const planned = planStudioStampBrushDabs(brushStyle, LINE, LINE_PRESSURES);
      const rendered = recordingContext();
      drawStampStroke(rendered.context, brushStyle, LINE, LINE_PRESSURES);
      expect(rendered.dabs).toEqual(planned.map(({ x, y, radius, alpha }) => ({
        x,
        y,
        r: radius,
        alpha,
      })));
    }
  });

  it("bounds huge finite segments identically in the planner, replay, and incremental walker", () => {
    const brushStyle = style("ink", { size: 1, minSizeRatio: 1 });
    const points = [0, 0, 1_000_000_000, 0];
    const planned = planStudioStampBrushDabs(brushStyle, points, [0.5, 0.5], 7);
    expect(planned).toHaveLength(7);

    const replay = recordingContext();
    drawStampStroke(replay.context, brushStyle, points, [0.5, 0.5], 7);
    expect(replay.dabs).toHaveLength(7);

    const incremental = recordingContext();
    stampStrokeDot(incremental.context, brushStyle, 0, 0, 0.5);
    const state = beginStampWalker(0, 0, 0.5);
    state.stampIndex = 1;
    walkStampSegment(incremental.context, brushStyle, state, 1_000_000_000, 0, 0.5, 7);
    expect(incremental.dabs).toHaveLength(7);
    expect(incremental.dabs).toEqual(replay.dabs);
    expect(state.stampIndex).toBe(7);
    walkStampSegment(incremental.context, brushStyle, state, 2_000_000_000, 0, 0.5, 7);
    expect(incremental.dabs).toHaveLength(7);
  });

  it("stops at the first non-finite coordinate pair and falls back corrupt pressure to 0.5", () => {
    const brushStyle = style("ink", { size: 10, minSizeRatio: 0 });
    const points = [2, 3, 8, 3, Number.NaN, 4, 100, 100];
    const corrupt = planStudioStampBrushDabs(
      brushStyle,
      points,
      [Number.NaN, Number.POSITIVE_INFINITY, 1, 1],
      100,
    );
    const canonical = planStudioStampBrushDabs(
      brushStyle,
      [2, 3, 8, 3],
      [0.5, 0.5],
      100,
    );

    expect(corrupt).toEqual(canonical);
    expect(corrupt.every((dab) =>
      [dab.x, dab.y, dab.radius, dab.alpha].every(Number.isFinite)
    )).toBe(true);
  });

  it("pressure grows dab radius between min-size and full size", () => {
    const soft = recordingContext();
    drawStampStroke(soft.context, style("ink"), [0, 0, 40, 0], [0.05, 0.05]);
    const hard = recordingContext();
    drawStampStroke(hard.context, style("ink"), [0, 0, 40, 0], [1, 1]);
    const softMax = Math.max(...soft.dabs.map((d) => d.r));
    const hardMax = Math.max(...hard.dabs.map((d) => d.r));
    expect(hardMax).toBeGreaterThan(softMax * 2);
  });

  it("ink thins with speed (velocity-reactive dip pen)", () => {
    const slow = recordingContext();
    {
      const state = beginStampWalker(0, 0, 0.8);
      walkStampSegment(slow.context, style("ink"), state, 4, 0, 0.8);
    }
    const fast = recordingContext();
    {
      const state = beginStampWalker(0, 0, 0.8);
      walkStampSegment(fast.context, style("ink"), state, 90, 0, 0.8);
    }
    expect(Math.max(...fast.dabs.map((d) => d.r))).toBeLessThan(
      Math.max(...slow.dabs.map((d) => d.r))
    );
  });

  it("flow builds up: airbrush dab alpha stays below stroke opacity", () => {
    const rec = recordingContext();
    drawStampStroke(rec.context, style("airbrush"), [0, 0, 30, 0], [0.7, 0.7]);
    expect(rec.dabs.length).toBeGreaterThan(3);
    for (const dab of rec.dabs) {
      expect(dab.alpha).toBeLessThanOrEqual(STUDIO_STAMP_BRUSH_DEFAULTS.airbrush.flow + 1e-9);
    }
  });

  it("watercolor adds a wet-edge ring per dab", () => {
    const rec = recordingContext();
    drawStampStroke(rec.context, style("watercolor"), [0, 0, 24, 0], [0.6, 0.6]);
    expect(rec.strokes.length).toBe(rec.dabs.length);
    expect(rec.strokes[0]!.r).toBeLessThan(rec.dabs[0]!.r);
  });

  it("pencil grain jitters deterministically (two runs identical)", () => {
    const a = recordingContext();
    drawStampStroke(a.context, style("pencil"), LINE, LINE_PRESSURES);
    const b = recordingContext();
    drawStampStroke(b.context, style("pencil"), LINE, LINE_PRESSURES);
    expect(a.dabs).toEqual(b.dabs);
    // 그레인 보조 점이 본 dab 보다 많다(도장당 2개).
    expect(a.dabs.length).toBeGreaterThan(LINE.length / 2);
  });
});
