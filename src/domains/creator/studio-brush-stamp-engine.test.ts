import { describe, expect, it } from "vitest";

import {
  beginStampWalker,
  drawStampStroke,
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
