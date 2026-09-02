import { describe, expect, it } from "vitest";

import {
  analyzeStudioBrushScenarioDiscrepancy,
  analyzeStudioBrushScenarioFlicker,
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
