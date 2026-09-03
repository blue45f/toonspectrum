import { describe, expect, it } from "vitest";

import {
  analyzeStudioBrushScenarioDiscrepancy,
  analyzeStudioBrushScenarioFlicker,
  analyzeStudioBrushScenarioInStroke,
  judgeStudioBrushScenarioInStroke,
  judgeStudioBrushScenarioBuildupLadder,
  judgeStudioBrushScenarioDiscrepancy,
  judgeStudioBrushScenarioFlicker,
  judgeStudioBrushScenarioPerf,
  studioBrushScenarioPointRegion,
} from "./studio-brush-scenario-quality";

const WIDTH = 96;
const HEIGHT = 48;

function frame(painter?: (x: number, y: number) => number) {
  const data = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const value = 255 - (painter?.(x, y) ?? 0);
      const offset = (y * WIDTH + x) * 3;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
    }
  }
  return { width: WIDTH, height: HEIGHT, channels: 3, data };
}

const baseline = frame();
const band = (dark: number) => frame((_, y) => (Math.abs(y - HEIGHT / 2) <= 4 ? dark : 0));

describe("scenario flicker", () => {
  it("reads a steady post-release series as stable", () => {
    const flicker = analyzeStudioBrushScenarioFlicker(baseline, [band(200), band(200), band(198)]);
    expect(flicker.verdict).toBe("stable");
    expect(judgeStudioBrushScenarioFlicker(flicker, { softWet: false, transparent: false })).toEqual([]);
  });

  it("flags a frame where the stroke disappears and comes back", () => {
    const flicker = analyzeStudioBrushScenarioFlicker(baseline, [band(200), baseline, band(200), band(200)]);
    expect(flicker.verdict).toBe("flicker");
    expect(flicker.dipFrame).toBe(1);
    expect(judgeStudioBrushScenarioFlicker(flicker, { softWet: true, transparent: false })).toEqual([
      expect.objectContaining({ level: "error", code: "post-release-flicker" }),
    ]);
  });

  it("flags a stroke that never returns as vanished, and records a transparent wash silently", () => {
    const flicker = analyzeStudioBrushScenarioFlicker(baseline, [band(200), band(60), baseline, baseline]);
    expect(flicker.verdict).toBe("vanish");
    expect(judgeStudioBrushScenarioFlicker(flicker, { softWet: false, transparent: false })).toEqual([
      expect.objectContaining({ level: "error", code: "post-release-vanish" }),
    ]);
    expect(judgeStudioBrushScenarioFlicker(flicker, { softWet: false, transparent: true })).toEqual([]);
  });
});

describe("scenario discrepancy", () => {
  it("measures live-only and committed-only silhouettes inside a region", () => {
    const live = frame((x, y) => (Math.abs(y - HEIGHT / 2) <= 4 && x < 60 ? 200 : 0));
    const released = frame((x, y) => (Math.abs(y - HEIGHT / 2) <= 4 && x >= 20 ? 200 : 0));
    const full = { x: 0, y: 0, width: WIDTH, height: HEIGHT };
    const discrepancy = analyzeStudioBrushScenarioDiscrepancy(baseline, live, released, full);
    expect(discrepancy.liveOnly).toBe(20 * 9);
    expect(discrepancy.releasedOnly).toBe(36 * 9);
    expect(discrepancy.shared).toBe(40 * 9);
    expect(discrepancy.shapeDifferenceRatio).toBeCloseTo(56 / 96, 6);
    expect(judgeStudioBrushScenarioDiscrepancy(discrepancy, "crossing-live-commit-drift", {
      softWet: false,
      transparent: false,
    })).toEqual([expect.objectContaining({ level: "error", code: "crossing-live-commit-drift" })]);
    // The same drift is only a warning for a soft/wet carrier whose edges settle after release.
    expect(judgeStudioBrushScenarioDiscrepancy(discrepancy, "crossing-live-commit-drift", {
      softWet: true,
      transparent: false,
    })).toEqual([expect.objectContaining({ level: "warning" })]);
  });

  it("stays quiet when the silhouettes agree and only tone moved a little", () => {
    const live = band(200);
    const released = band(190);
    const region = studioBrushScenarioPointRegion({ x: 48, y: 24 }, 12, baseline);
    const discrepancy = analyzeStudioBrushScenarioDiscrepancy(baseline, live, released, region);
    expect(discrepancy.shapeDifferenceRatio).toBe(0);
    expect(discrepancy.sharedMeanDelta).toBeCloseTo(10, 6);
    expect(judgeStudioBrushScenarioDiscrepancy(discrepancy, "end-cap-live-commit-drift", {
      softWet: false,
      transparent: false,
    })).toEqual([]);
  });
});

describe("scenario perf", () => {
  it("escalates long tasks by duration and reports stalled frames", () => {
    expect(judgeStudioBrushScenarioPerf({ longTasks: [60], frameGapsMs: [16, 33] })).toEqual([]);
    expect(judgeStudioBrushScenarioPerf({ longTasks: [120], frameGapsMs: [] })).toEqual([
      expect.objectContaining({ level: "warning", code: "long-task" }),
    ]);
    expect(judgeStudioBrushScenarioPerf({ longTasks: [80, 260], frameGapsMs: [300] })).toEqual([
      expect.objectContaining({ level: "error", code: "long-task" }),
      expect.objectContaining({ level: "warning", code: "frame-stall" }),
    ]);
  });
});

describe("scenario buildup ladder", () => {
  const OPAQUE = { softWet: false, transparent: false };

  it("flags the pencil ladder that the first/last ratio gate let through", () => {
    // 실측(defaultOpacity 0.85, 같은 자리 20회): 전체로는 1.19배라 비율 게이트를 통과했지만
    // 5회차가 더한 것은 0.9 코드값 — 3회차부터 같은 픽셀이다.
    expect(judgeStudioBrushScenarioBuildupLadder(
      [82.9, 91.1, 95.0, 97.0, 97.9, 98.4],
      OPAQUE,
    )).toEqual([
      expect.objectContaining({ level: "error", code: "buildup-lost" }),
    ]);
  });

  it("accepts a ladder still climbing by a code value at pass 5", () => {
    expect(judgeStudioBrushScenarioBuildupLadder(
      [60.0, 78.0, 88.0, 93.0, 95.5, 96.8],
      OPAQUE,
    )).toEqual([]);
  });

  it("stands down for a brush that is opaque by material, whatever its edge does", () => {
    // The pen, measured: its second pass adds anti-aliased edge coverage (89.8 -> 92.1 over 20
    // passes), which the gain rule reads as a ladder that then died. Opaque means no headroom.
    const penLike = [89.8, 91.2, 91.8, 92.0, 92.1, 92.1];
    expect(judgeStudioBrushScenarioBuildupLadder(penLike, { ...OPAQUE, opaque: true })).toEqual([]);
    expect(judgeStudioBrushScenarioBuildupLadder(penLike, OPAQUE)).toHaveLength(1);
  });

  it("leaves a one-stroke-opaque brush alone — it never started a ladder to lose", () => {
    expect(judgeStudioBrushScenarioBuildupLadder(
      [231.4, 231.6, 231.6, 231.7, 231.7],
      OPAQUE,
    )).toEqual([]);
    expect(judgeStudioBrushScenarioBuildupLadder(
      [82.9, 91.1, 95.0, 97.0, 97.9],
      { softWet: false, transparent: true },
    )).toEqual([]);
  });
});

describe("analyzeStudioBrushScenarioInStroke", () => {
  const frames = (inks: readonly number[]) => inks.map((ink, index) => ({ tMs: index * 16, ink }));

  it("accepts a stroke that only ever grows", () => {
    const analysis = analyzeStudioBrushScenarioInStroke(frames([0, 400, 900, 1400, 2000, 2600]));
    expect(analysis.verdict).toBe("stable");
    expect(analysis.blinkCount).toBe(0);
    expect(analysis.peakInk).toBe(2600);
  });

  it("accepts the small dips lossy capture puts on a growing stroke", () => {
    // A few per cent of the edge moving between frames is the codec, not the renderer.
    expect(analyzeStudioBrushScenarioInStroke(
      frames([0, 400, 980, 960, 1500, 1470, 2100]),
    ).verdict).toBe("stable");
  });

  it("reports ink that vanished and was painted again", () => {
    // The shape measured on the shipped build: the pen's overlay goes fully empty every other
    // frame while the pointer is still down.
    const analysis = analyzeStudioBrushScenarioInStroke(
      frames([0, 500, 1200, 0, 1900, 0, 2400, 0, 3000]),
    );
    expect(analysis.verdict).toBe("blink");
    expect(analysis.blinkCount).toBe(3);
    expect(analysis.worstDropRatio).toBe(1);
    expect(judgeStudioBrushScenarioInStroke(analysis, { softWet: false, transparent: false }))
      .toHaveLength(1);
  });

  it("does not call the final fall a blink — nothing repainted it", () => {
    // A stroke that drops at the very end and stays down is a vanish, which the post-release
    // series owns; calling it a blink here would report the same defect twice under two names.
    expect(analyzeStudioBrushScenarioInStroke(frames([0, 800, 1600, 2400, 0])).verdict)
      .toBe("stable");
  });

  it("says so rather than guessing when the cast caught almost nothing", () => {
    expect(analyzeStudioBrushScenarioInStroke(frames([0, 900])).verdict).toBe("too-few-frames");
    expect(judgeStudioBrushScenarioInStroke(
      analyzeStudioBrushScenarioInStroke(frames([0, 900])),
      { softWet: false, transparent: false },
    )).toEqual([]);
  });

  it("records a transparent wash instead of judging it", () => {
    const analysis = analyzeStudioBrushScenarioInStroke(frames([0, 500, 1200, 0, 1900, 0, 2400]));
    expect(analysis.verdict).toBe("blink");
    expect(judgeStudioBrushScenarioInStroke(analysis, { softWet: false, transparent: true }))
      .toEqual([]);
  });
});
