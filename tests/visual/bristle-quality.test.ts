import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform } from "node:os";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

import { afterAll, describe, expect, it } from "vitest";

import {
  BRISTLE_PRESETS,
  bristleFootprint,
  bristleStrokeTracks,
  createBristleBrush,
  createBristleBrushFromPreset,
  rasterizeBristleStamps,
  rasterizeBristleStroke,
  runBristleStroke,
  stepBristles,
} from "../../packages/studio-brush-platform/src/bristle-model";

import type {
  BristleBrushConfig,
  BristleFootprint,
  BristlePresetId,
  BristleSample,
} from "../../packages/studio-brush-platform/src/bristle-model";

/**
 * Bristle model quality gate (손맛·질감 최우선 웨이브).
 *
 * Every claim below is measured on a REAL render: the footprints a stroke
 * produces are composited through the model's own pure alpha rasterizer (no
 * engine, no GPU, fully deterministic) and the gate reads pixels, not state.
 *
 * Gated properties:
 *  1. pressure→spread response is monotone on the way up and carries a
 *     measurable hysteresis loop on the way down (the 손맛 signal), which
 *     collapses when the asymmetry is switched off;
 *  2. a drying tuft opens alpha-0 streaks (갈필) whose count is bounded by and
 *     positioned inside the bristle layout, while a fully loaded one lays a
 *     solid band — and a uniform control tuft barely frays at all;
 *  3. tilt moves the contact centroid along the lean;
 *  4. same seed + same input → identical sha256;
 *  5. per-bristle simulation cost stays far inside a frame budget.
 *
 * Measurements are published to tests/benchmarks/results/bristle-model.json.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const RESULTS_PATH = join(
  REPO_ROOT,
  "tests",
  "benchmarks",
  "results",
  "bristle-model.json",
);

/** Alpha at or below this counts as bare canvas — a true hole, not a light pass. */
const EMPTY_ALPHA = 0;
/** A streak narrower than this is tip antialiasing, not a 갈필 gap. */
const MIN_GAP_PX = 2;
const STROKE_SAMPLES = 240;
const STROKE_STEP_PX = 2;
const STROKE_DT_MS = 8;
const FRAME_BUDGET_MS = 1000 / 60;

const STROKE_CANVAS = { width: 560, height: 140 } as const;
const STROKE_Y = 70;
const STROKE_X0 = 20;

const FOOTPRINT_CANVAS = { width: 256, height: 96 } as const;

interface Measurements {
  pressureSpread?: unknown;
  dryBrush?: unknown;
  tiltAsymmetry?: unknown;
  determinism?: unknown;
  performance?: unknown;
  stampJoin?: unknown;
}

const measurements: Measurements = {};

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Horizontal stroke; the tuft cross-section therefore lies along y. */
function horizontalStroke(
  count: number,
  options: {
    pressure?: number | ((t: number) => number);
    tiltX?: number;
    tiltY?: number;
    stepPx?: number;
  } = {},
): BristleSample[] {
  const stepPx = options.stepPx ?? STROKE_STEP_PX;
  const samples: BristleSample[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = count === 1 ? 0 : index / (count - 1);
    const pressure =
      typeof options.pressure === "function"
        ? options.pressure(t)
        : (options.pressure ?? 0.55);
    samples.push({
      x: STROKE_X0 + index * stepPx,
      y: STROKE_Y,
      pressure,
      tiltX: options.tiltX ?? 0,
      tiltY: options.tiltY ?? 0,
      velocity: stepPx / STROKE_DT_MS,
      dtMs: STROKE_DT_MS,
      tMs: index * STROKE_DT_MS,
    });
  }
  return samples;
}

interface ColumnScan {
  gaps: number;
  widths: number[];
  centers: number[];
  spanPx: number;
  firstInked: number;
  lastInked: number;
}

/** Interior alpha-0 runs in one cross-section column of the rendered stroke. */
function scanColumn(buffer: Float32Array, x: number): ColumnScan {
  const { width, height } = STROKE_CANVAS;
  const inked: boolean[] = [];
  for (let y = 0; y < height; y += 1) inked.push(buffer[y * width + x]! > EMPTY_ALPHA);
  const firstInked = inked.indexOf(true);
  const lastInked = inked.lastIndexOf(true);
  if (firstInked < 0) {
    return { gaps: 0, widths: [], centers: [], spanPx: 0, firstInked, lastInked };
  }
  const widths: number[] = [];
  const centers: number[] = [];
  let run = 0;
  for (let y = firstInked; y <= lastInked; y += 1) {
    if (!inked[y]) {
      run += 1;
      continue;
    }
    if (run >= MIN_GAP_PX) {
      widths.push(run);
      centers.push(y - run / 2 - 0.5);
    }
    run = 0;
  }
  return {
    gaps: widths.length,
    widths,
    centers,
    spanPx: lastInked - firstInked + 1,
    firstInked,
    lastInked,
  };
}

interface ColumnContributors {
  /** Lowest/highest y any dab actually paints into this column. */
  minY: number;
  maxY: number;
  /** Distinct hairs that paint into this column anywhere along the stroke. */
  bristles: Set<number>;
}

/**
 * Exact per-column attribution: which hairs paint into each rendered column and
 * how far they reach. Built from the stamps themselves so the layout invariants
 * are checked against what was drawn, not against a single step's footprint
 * (neighbouring steps' dabs bleed into the same column).
 */
function columnContributors(
  footprints: readonly BristleFootprint[],
): ColumnContributors[] {
  const columns: ColumnContributors[] = [];
  for (let x = 0; x < STROKE_CANVAS.width; x += 1) {
    columns.push({
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
      bristles: new Set<number>(),
    });
  }
  for (const footprint of footprints) {
    for (const stamp of footprint.stamps) {
      const reach = stamp.radius + 0.5;
      const from = Math.max(0, Math.ceil(stamp.x - reach - 0.5));
      const to = Math.min(STROKE_CANVAS.width - 1, Math.floor(stamp.x + reach - 0.5));
      for (let x = from; x <= to; x += 1) {
        const column = columns[x]!;
        column.minY = Math.min(column.minY, stamp.y - reach);
        column.maxY = Math.max(column.maxY, stamp.y + reach);
        column.bristles.add(stamp.bristleIndex);
      }
    }
  }
  return columns;
}

interface DryBrushReport {
  wetColumns: number;
  wetGapColumns: number;
  wetMaxGaps: number;
  dryColumns: number;
  dryGapColumns: number;
  dryGapColumnRatio: number;
  dryMaxGaps: number;
  dryWidestGapPx: number;
  dryMaxContactCount: number;
  firstGapArcPx: number | null;
  gapCentersOutsideSpan: number;
  gapsExceedingBristleSlots: number;
  finalInkRatio: number;
  finalSplitDrive: number;
}

/** Render a constant-pressure stroke and split it into wet and dry windows. */
function dryBrushReport(config: BristleBrushConfig): DryBrushReport {
  const brush = createBristleBrush(config);
  const run = runBristleStroke(brush, horizontalStroke(STROKE_SAMPLES));
  const buffer = rasterizeBristleStroke(run.footprints, STROKE_CANVAS);
  const columns = columnContributors(run.footprints);

  const report: DryBrushReport = {
    wetColumns: 0,
    wetGapColumns: 0,
    wetMaxGaps: 0,
    dryColumns: 0,
    dryGapColumns: 0,
    dryGapColumnRatio: 0,
    dryMaxGaps: 0,
    dryWidestGapPx: 0,
    dryMaxContactCount: 0,
    firstGapArcPx: null,
    gapCentersOutsideSpan: 0,
    gapsExceedingBristleSlots: 0,
    finalInkRatio: run.footprints.at(-1)?.inkRatio ?? 0,
    finalSplitDrive: run.footprints.at(-1)?.splitDrive ?? 0,
  };

  run.footprints.forEach((footprint, index) => {
    const x = STROKE_X0 + index * STROKE_STEP_PX;
    if (x < 6 || x >= STROKE_CANVAS.width - 6) return;
    if (footprint.contactCount === 0) return;
    const scan = scanColumn(buffer, x);
    // Ignore columns where the tuft has all but vanished: a 3px remnant has no
    // meaningful interior left to measure.
    if (scan.spanPx < 6) return;

    if (scan.gaps > 0) {
      if (report.firstGapArcPx === null) {
        report.firstGapArcPx = index * STROKE_STEP_PX;
      }
      // A streak lives BETWEEN two hairs: it must fall inside the band the
      // hairs painting this column actually cover, and there cannot be more
      // streaks than those hairs leave slots between them.
      const column = columns[x]!;
      for (const center of scan.centers) {
        if (center < column.minY || center > column.maxY) {
          report.gapCentersOutsideSpan += 1;
        }
      }
      if (scan.gaps > Math.max(0, column.bristles.size - 1)) {
        report.gapsExceedingBristleSlots += 1;
      }
    }

    if (footprint.inkRatio > 0.8) {
      report.wetColumns += 1;
      if (scan.gaps > 0) report.wetGapColumns += 1;
      report.wetMaxGaps = Math.max(report.wetMaxGaps, scan.gaps);
    } else if (footprint.inkRatio < 0.35) {
      report.dryColumns += 1;
      if (scan.gaps > 0) report.dryGapColumns += 1;
      report.dryMaxGaps = Math.max(report.dryMaxGaps, scan.gaps);
      report.dryMaxContactCount = Math.max(
        report.dryMaxContactCount,
        footprint.contactCount,
      );
      for (const width of scan.widths) {
        report.dryWidestGapPx = Math.max(report.dryWidestGapPx, width);
      }
    }
  });

  report.dryGapColumnRatio =
    report.dryColumns > 0 ? report.dryGapColumns / report.dryColumns : 0;
  return report;
}

/** Width of one footprint, measured on its own render. */
function renderedFootprintWidthPx(footprint: BristleFootprint, centerX: number): number {
  const { width, height } = FOOTPRINT_CANVAS;
  const buffer = rasterizeBristleStamps(footprint.stamps, {
    width,
    height,
    originX: centerX - width / 2,
    originY: STROKE_Y - height / 2,
  });
  let first = -1;
  let last = -1;
  for (let y = 0; y < height; y += 1) {
    let peak = 0;
    for (let x = 0; x < width; x += 1) peak = Math.max(peak, buffer[y * width + x]!);
    if (peak > EMPTY_ALPHA) {
      if (first < 0) first = y;
      last = y;
    }
  }
  return first < 0 ? 0 : last - first + 1;
}

/** Alpha-weighted centroid of one footprint, measured on its own render. */
function renderedCentroidY(footprint: BristleFootprint, centerX: number): number {
  const { width, height } = FOOTPRINT_CANVAS;
  const originY = STROKE_Y - height / 2;
  const buffer = rasterizeBristleStamps(footprint.stamps, {
    width,
    height,
    originX: centerX - width / 2,
    originY,
  });
  let weight = 0;
  let weighted = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = buffer[y * width + x]!;
      if (alpha <= 0) continue;
      weight += alpha;
      weighted += (y + 0.5 + originY) * alpha;
    }
  }
  return weight > 0 ? weighted / weight : Number.NaN;
}

function digestStroke(buffer: Float32Array): string {
  const quantized = new Uint8Array(buffer.length);
  for (let index = 0; index < buffer.length; index += 1) {
    quantized[index] = Math.round(Math.min(1, Math.max(0, buffer[index]!)) * 255);
  }
  return createHash("sha256").update(quantized).digest("hex");
}

function renderPresetStroke(
  preset: BristlePresetId,
  overrides: Partial<BristleBrushConfig> = {},
): Float32Array {
  const brush = createBristleBrushFromPreset(preset, overrides);
  const run = runBristleStroke(
    brush,
    horizontalStroke(STROKE_SAMPLES, { pressure: (t) => 0.25 + 0.6 * t, tiltY: 0.35 }),
  );
  return rasterizeBristleStroke(run.footprints, STROKE_CANVAS);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function round(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function round4(value: number): number {
  return round(value, 4);
}

// ---------------------------------------------------------------------------
// 1. Pressure → spread response (monotone up, hysteresis down)
// ---------------------------------------------------------------------------

interface RampSample {
  pressure: number;
  widthPx: number;
  spread: number;
}

function pressureRamp(overrides: Partial<BristleBrushConfig>): {
  up: RampSample[];
  down: RampSample[];
} {
  // Deep ink reservoir: this gate isolates the spring, not the 갈필 term.
  const brush = createBristleBrushFromPreset("round", { inkCapacity: 24, ...overrides });
  const steps = 120;
  const up: RampSample[] = [];
  const down: RampSample[] = [];
  let x = STROKE_X0;
  for (let phase = 0; phase < 2; phase += 1) {
    for (let index = 0; index < steps; index += 1) {
      const t = index / (steps - 1);
      const pressure = phase === 0 ? t : 1 - t;
      stepBristles(brush, {
        x,
        y: STROKE_Y,
        pressure,
        velocity: 0.05,
        dtMs: STROKE_DT_MS,
      });
      const footprint = bristleFootprint(brush);
      const row: RampSample = {
        pressure,
        widthPx: renderedFootprintWidthPx(footprint, x),
        spread: footprint.spread,
      };
      (phase === 0 ? up : down).push(row);
      x += 0.4;
    }
  }
  return { up, down };
}

function hysteresisGaps(up: RampSample[], down: RampSample[]): {
  probes: Array<{ pressure: number; upPx: number; downPx: number; gapPx: number }>;
  meanGapPx: number;
  minGapPx: number;
} {
  const nearest = (rows: RampSample[], pressure: number): RampSample =>
    rows.reduce((best, row) =>
      Math.abs(row.pressure - pressure) < Math.abs(best.pressure - pressure) ? row : best,
    );
  const probes = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((pressure) => {
    const upRow = nearest(up, pressure);
    const downRow = nearest(down, pressure);
    return {
      pressure,
      upPx: upRow.widthPx,
      downPx: downRow.widthPx,
      gapPx: downRow.widthPx - upRow.widthPx,
    };
  });
  const gaps = probes.map((probe) => probe.gapPx);
  return {
    probes,
    meanGapPx: gaps.reduce((sum, value) => sum + value, 0) / gaps.length,
    minGapPx: Math.min(...gaps),
  };
}

describe("bristle model — pressure spread response", () => {
  it("widens monotonically on the way up and lags on the way down", () => {
    const { up, down } = pressureRamp({});
    let violations = 0;
    for (let index = 1; index < up.length; index += 1) {
      if (up[index]!.widthPx < up[index - 1]!.widthPx) violations += 1;
    }
    expect(violations).toBe(0);
    expect(up.at(-1)!.widthPx).toBeGreaterThan(up[0]!.widthPx + 10);

    const loop = hysteresisGaps(up, down);
    // Every matched pressure must be wider on the release than on the load.
    expect(loop.minGapPx).toBeGreaterThan(0);
    expect(loop.meanGapPx).toBeGreaterThanOrEqual(3);

    // Control: no asymmetry + a fast spring collapses the loop.
    const control = pressureRamp({ hysteresis: 0, springRateHz: 400 });
    const controlLoop = hysteresisGaps(control.up, control.down);
    expect(controlLoop.meanGapPx).toBeLessThan(1.5);
    expect(loop.meanGapPx).toBeGreaterThan(controlLoop.meanGapPx * 3);

    measurements.pressureSpread = {
      harness:
        "round preset (inkCapacity 24), 120-step 0→1 pressure ramp then 120-step 1→0; contact width read from the rendered footprint alpha (>0), 256x96 window",
      monotoneViolationsOnLoad: violations,
      widthAtZeroPressurePx: up[0]!.widthPx,
      widthAtFullPressurePx: up.at(-1)!.widthPx,
      hysteresis: {
        probes: loop.probes,
        meanGapPx: round(loop.meanGapPx),
        minGapPx: loop.minGapPx,
      },
      controlHysteresisOff: {
        config: { hysteresis: 0, springRateHz: 400 },
        meanGapPx: round(controlLoop.meanGapPx),
      },
    };
  });
});

// ---------------------------------------------------------------------------
// 2. Dry brush (갈필) streaks
// ---------------------------------------------------------------------------

describe("bristle model — dry-brush streaks", () => {
  it("lays a solid band while loaded and frays into layout-bounded streaks as it dries", () => {
    const roundReport = dryBrushReport(BRISTLE_PRESETS.round);
    const flatReport = dryBrushReport(BRISTLE_PRESETS.flat);

    for (const report of [roundReport, flatReport]) {
      // Wet: solid band, no interior holes anywhere.
      expect(report.wetColumns).toBeGreaterThan(20);
      expect(report.wetGapColumns).toBe(0);
      // Dry: streaks nearly everywhere, and always inside the tuft.
      expect(report.dryColumns).toBeGreaterThan(20);
      expect(report.dryGapColumnRatio).toBeGreaterThan(0.85);
      expect(report.dryMaxGaps).toBeGreaterThanOrEqual(2);
      expect(report.gapCentersOutsideSpan).toBe(0);
      expect(report.gapsExceedingBristleSlots).toBe(0);
      expect(report.finalInkRatio).toBeLessThan(0.35);
    }

    // Control: a uniform tuft (no layout jitter, no per-hair variation, no
    // splitting, no lift) fades instead of fraying — the streaks come from the
    // bristle model, not from the rasterizer.
    const control = dryBrushReport({
      ...BRISTLE_PRESETS.round,
      tipProfile: "flat",
      layoutJitter: 0,
      stiffnessVariation: 0,
      radiusVariation: 0,
      capacityVariation: 0,
      splitAmplitude: 0,
      liftFraction: 0,
    });
    expect(control.dryGapColumnRatio).toBeLessThan(0.5);
    expect(control.dryMaxGaps).toBeLessThanOrEqual(1);
    expect(roundReport.dryGapColumnRatio).toBeGreaterThan(
      control.dryGapColumnRatio * 2,
    );

    // Streak count tracks the bristle layout: more hairs, more streaks.
    const byCount = [16, 24, 32].map((bristleCount) => ({
      bristleCount,
      ...dryBrushReport({ ...BRISTLE_PRESETS.round, bristleCount }),
    }));
    for (let index = 1; index < byCount.length; index += 1) {
      expect(byCount[index]!.dryMaxGaps).toBeGreaterThanOrEqual(
        byCount[index - 1]!.dryMaxGaps,
      );
    }
    expect(byCount.at(-1)!.dryMaxGaps).toBeGreaterThan(byCount[0]!.dryMaxGaps);

    // The 갈필 preset frays while it is still wet; the round tuft does not.
    const roughReport = dryBrushReport(BRISTLE_PRESETS.rough);
    expect(roughReport.wetGapColumns).toBeGreaterThan(0);
    // Every streak of every preset stays inside the tuft and inside its slots.
    expect(roughReport.gapCentersOutsideSpan).toBe(0);
    expect(roughReport.gapsExceedingBristleSlots).toBe(0);
    expect(roundReport.firstGapArcPx).not.toBeNull();
    expect(roughReport.firstGapArcPx ?? Number.POSITIVE_INFINITY).toBeLessThan(
      roundReport.firstGapArcPx ?? Number.POSITIVE_INFINITY,
    );

    measurements.dryBrush = {
      harness: `constant-pressure 0.55 horizontal stroke, ${STROKE_SAMPLES} samples x ${STROKE_STEP_PX}px, rendered at ${STROKE_CANVAS.width}x${STROKE_CANVAS.height}; a gap is an interior run of alpha == 0 at least ${MIN_GAP_PX}px wide; wet = inkRatio > 0.8, dry = inkRatio < 0.35`,
      presets: { round: roundReport, flat: flatReport, rough: roughReport },
      uniformControl: control,
      byBristleCount: byCount.map((entry) => ({
        bristleCount: entry.bristleCount,
        dryMaxGaps: entry.dryMaxGaps,
        dryGapColumnRatio: round4(entry.dryGapColumnRatio),
        dryWidestGapPx: entry.dryWidestGapPx,
      })),
    };
  });
});

// ---------------------------------------------------------------------------
// 3. Tilt asymmetry
// ---------------------------------------------------------------------------

describe("bristle model — tilt asymmetry", () => {
  it("moves the rendered contact centroid along the lean", () => {
    const probe = (tiltY: number) => {
      const brush = createBristleBrushFromPreset("round", { inkCapacity: 8 });
      const samples = horizontalStroke(40, { tiltY });
      const run = runBristleStroke(brush, samples);
      const footprint = run.footprints.at(-1)!;
      const centerX = samples.at(-1)!.x;
      return {
        tiltY,
        renderedCentroidShiftPx: renderedCentroidY(footprint, centerX) - STROKE_Y,
        stateCentroidShiftPx: footprint.centroidY - STROKE_Y,
        contactWidthPx: footprint.contactWidthPx,
      };
    };
    const rows = [0, 0.25, 0.5, 0.75, 1].map(probe);
    expect(Math.abs(rows[0]!.renderedCentroidShiftPx)).toBeLessThan(0.5);
    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index]!.renderedCentroidShiftPx).toBeGreaterThan(
        rows[index - 1]!.renderedCentroidShiftPx + 1,
      );
    }
    expect(rows.at(-1)!.renderedCentroidShiftPx).toBeGreaterThan(8);
    // A leaning tuft also lies down into a wider ellipse.
    expect(rows.at(-1)!.contactWidthPx).toBeGreaterThan(rows[0]!.contactWidthPx);

    measurements.tiltAsymmetry = {
      harness:
        "round preset, 40-sample horizontal stroke at pressure 0.55; tiltY leans across the cross-section; centroid measured on the rendered footprint alpha",
      rows: rows.map((row) => ({
        tiltY: row.tiltY,
        renderedCentroidShiftPx: round(row.renderedCentroidShiftPx),
        stateCentroidShiftPx: round(row.stateCentroidShiftPx),
        contactWidthPx: round(row.contactWidthPx),
      })),
    };
  });
});

// ---------------------------------------------------------------------------
// 4. Determinism
// ---------------------------------------------------------------------------

describe("bristle model — determinism", () => {
  it("renders an identical sha256 from the same seed and input", () => {
    const digests: Record<string, string> = {};
    for (const preset of ["round", "flat", "rough"] as const) {
      const first = digestStroke(renderPresetStroke(preset));
      const second = digestStroke(renderPresetStroke(preset));
      expect(first).toBe(second);
      digests[preset] = first;
    }
    const reseeded = digestStroke(renderPresetStroke("round", { seed: 424_242 }));
    expect(reseeded).not.toBe(digests["round"]);
    expect(new Set(Object.values(digests)).size).toBe(3);

    measurements.determinism = {
      harness: `pressure-ramp 0.25→0.85 horizontal stroke with tiltY 0.35, ${STROKE_SAMPLES} samples, rendered at ${STROKE_CANVAS.width}x${STROKE_CANVAS.height}, alpha quantized to u8`,
      note: "bit-identity is scoped to one JS engine build (Math.exp/Math.pow are not cross-engine bit-exact by spec)",
      presetSha256: digests,
      reseededRoundSha256: reseeded,
    };
  });
});

// ---------------------------------------------------------------------------
// 5. Performance
// ---------------------------------------------------------------------------

describe("bristle model — performance", () => {
  it("simulates a 240-point stroke well inside a frame budget", () => {
    const samples = horizontalStroke(STROKE_SAMPLES, { pressure: (t) => 0.2 + 0.7 * t });
    const rows = [8, 16, 32, 64, 128].map((bristleCount) => {
      const config: BristleBrushConfig = { ...BRISTLE_PRESETS.round, bristleCount };
      const measure = (collect: boolean): number[] => {
        const timings: number[] = [];
        for (let repeat = 0; repeat < 41; repeat += 1) {
          const brush = createBristleBrush(config);
          const start = performance.now();
          runBristleStroke(brush, samples, {
            collectFootprints: collect,
            collectReports: collect,
          });
          timings.push(performance.now() - start);
        }
        return timings;
      };
      // Warm up the shapes before the measured passes.
      measure(false);
      measure(true);
      const simOnly = median(measure(false));
      const withFootprints = median(measure(true));
      return {
        bristleCount,
        simOnlyP50Ms: round(simOnly, 5),
        withFootprintsP50Ms: round(withFootprints, 5),
        simOnlyPerSampleUs: round((simOnly * 1000) / STROKE_SAMPLES, 4),
        frameBudgetPct: round((simOnly / FRAME_BUDGET_MS) * 100, 3),
        samplesPerFrameBudget: Math.floor(
          (FRAME_BUDGET_MS / simOnly) * STROKE_SAMPLES,
        ),
      };
    });

    for (let index = 1; index < rows.length; index += 1) {
      expect(rows[index]!.simOnlyP50Ms).toBeGreaterThan(0);
    }
    // Veto-only budget (품질 우선 정책): the whole 240-point stroke must cost
    // less than one 60Hz frame even at 128 hairs.
    expect(rows.at(-1)!.simOnlyP50Ms).toBeLessThan(FRAME_BUDGET_MS);

    measurements.performance = {
      harness: `${STROKE_SAMPLES}-sample pressure-ramp stroke, median of 41 runs after two warmup passes, round preset with bristleCount swept`,
      frameBudgetMs: round(FRAME_BUDGET_MS, 4),
      rows,
    };
  });
});

// ---------------------------------------------------------------------------
// 6. Stamp-path join (honesty record)
// ---------------------------------------------------------------------------

describe("bristle model — stamp path join", () => {
  it("splits a stroke into per-hair RasterStrokeSample tracks", () => {
    const brush = createBristleBrushFromPreset("round");
    const run = runBristleStroke(brush, horizontalStroke(STROKE_SAMPLES));
    const tracks = bristleStrokeTracks(run.footprints, { stepMs: STROKE_DT_MS });
    expect(tracks.length).toBeGreaterThan(0);

    const stampCount = run.footprints.reduce(
      (sum, footprint) => sum + footprint.stamps.length,
      0,
    );
    const trackSamples = tracks.reduce((sum, track) => sum + track.samples.length, 0);
    // Nothing is dropped on the way to the dab lane.
    expect(trackSamples).toBe(stampCount);

    const modulation = Math.max(...tracks.map((track) => track.radiusModulation));
    expect(modulation).toBeGreaterThan(1);

    measurements.stampJoin = {
      note: "each track feeds renderCompiledBrushStroke(hokusai, compiled, { samples }) verbatim; stamp alpha lowers to RasterStrokeSample.pressure",
      tracks: tracks.length,
      stamps: stampCount,
      trackSamples,
      maxRadiusModulation: round(modulation),
      lossyDimension:
        "a Hokusai stroke carries ONE setRadiusLog radius, so per-step radius modulation (max/mean above) must be lowered into the brush's pressure→radius curve; it is reported, never dropped silently",
    };
  });
});

afterAll(async () => {
  await mkdir(dirname(RESULTS_PATH), { recursive: true });
  const cpu = cpus()[0]?.model ?? "unknown";
  const payload = {
    harness: "tests/visual/bristle-quality.test.ts",
    model: "packages/studio-brush-platform/src/bristle-model.ts",
    generatedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      arch: arch(),
      cpu,
      node: process.version,
    },
    lineage:
      "2D reduction of WetBrush (Chen et al., SIGGRAPH Asia 2015) — concepts only, no upstream code: bristles collapse to a 1D cross-section with a spring-loaded spread, seeded clump splitting and a per-hair ink reservoir",
    presets: BRISTLE_PRESETS,
    gates: measurements,
  };
  await writeFile(RESULTS_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
});
