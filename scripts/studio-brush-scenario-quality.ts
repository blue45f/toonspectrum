import type { StudioBrushMediaPixelImage } from "./studio-brush-media-pixel-quality";

/**
 * Multi-stroke scenario quality — the metrics the single-stroke long matrix cannot see.
 *
 * The long matrix draws one straight stroke and compares live/released/settled frames. Real
 * drawing crosses strokes, layers brushes over each other, taps, flicks and lifts. Each of those
 * has its own way of being wrong, and every one of them was reported by artists before it was
 * measured:
 *
 *  - flicker: the overlay clears before the retained document paints, so a stroke vanishes for a
 *    frame (or several) right after pointer-up and comes back — visible as a blink;
 *  - crossing drift: where a second stroke crosses a first, the live composite and the committed
 *    composite disagree (the overlay blends differently from the retained layer);
 *  - cap drift: the live pointer-down cap or the pointer-up cap exists only in one representation.
 *
 * Every function here is pure over decoded frames so the verifier's judgement is unit-testable.
 */

export interface StudioBrushScenarioRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioBrushScenarioMaskStats {
  readonly count: number;
  readonly bounds: Readonly<{ left: number; top: number; right: number; bottom: number }> | null;
}

export interface StudioBrushScenarioFlickerAnalysis {
  /** Ink pixels (vs baseline) of every captured frame after pointer-up, in capture order. */
  readonly counts: readonly number[];
  /** Largest fractional drop from one frame to the next. */
  readonly maxDropRatio: number;
  /** Index of the frame that dipped, when a dip later recovered. */
  readonly dipFrame: number | null;
  readonly verdict: "stable" | "flicker" | "vanish" | "empty";
}

export interface StudioBrushScenarioDiscrepancy {
  readonly liveInk: number;
  readonly releasedInk: number;
  readonly liveOnly: number;
  readonly releasedOnly: number;
  readonly shared: number;
  /** XOR / union of the two ink masks, 0 = identical silhouette, 1 = disjoint. */
  readonly shapeDifferenceRatio: number;
  /** Mean per-channel delta over pixels inked in both frames. */
  readonly sharedMeanDelta: number;
}

export interface StudioBrushScenarioFinding {
  readonly level: "error" | "warning";
  readonly code:
    | "post-release-flicker"
    | "post-release-vanish"
    | "post-release-empty"
    | "crossing-live-commit-drift"
    | "crossing-live-commit-tone"
    | "start-cap-live-commit-drift"
    | "end-cap-live-commit-drift"
    | "eraser-gap-missing"
    | "eraser-live-commit-drift"
    | "long-task"
    | "frame-stall"
    | "stroke-refused"
    | "undo-residue";
  readonly message: string;
}

function assertSameGeometry(a: StudioBrushMediaPixelImage, b: StudioBrushMediaPixelImage): void {
  if (a.width !== b.width || a.height !== b.height || a.channels !== b.channels) {
    throw new Error(
      `scenario frames differ in geometry: ${a.width}x${a.height}x${a.channels} vs `
        + `${b.width}x${b.height}x${b.channels}`,
    );
  }
}

/** 1 where any colour channel moved more than `tolerance` code values from the baseline. */
export function studioBrushScenarioInkMask(
  baseline: StudioBrushMediaPixelImage,
  frame: StudioBrushMediaPixelImage,
  tolerance = 12,
): Uint8Array {
  assertSameGeometry(baseline, frame);
  const channels = Math.min(3, baseline.channels);
  const pixels = baseline.width * baseline.height;
  const mask = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    const offset = index * baseline.channels;
    for (let channel = 0; channel < channels; channel += 1) {
      if (Math.abs(baseline.data[offset + channel]! - frame.data[offset + channel]!) > tolerance) {
        mask[index] = 1;
        break;
      }
    }
  }
  return mask;
}

export function studioBrushScenarioMaskStats(
  mask: Uint8Array,
  width: number,
  height: number,
  region?: StudioBrushScenarioRegion,
): StudioBrushScenarioMaskStats {
  const x0 = region ? Math.max(0, Math.floor(region.x)) : 0;
  const y0 = region ? Math.max(0, Math.floor(region.y)) : 0;
  const x1 = region ? Math.min(width, Math.ceil(region.x + region.width)) : width;
  const y1 = region ? Math.min(height, Math.ceil(region.y + region.height)) : height;
  let count = 0;
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      if (mask[y * width + x] === 0) continue;
      count += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return {
    count,
    bounds: count === 0 ? null : { left, top, right, bottom },
  };
}

/**
 * Post-release frame series. A stroke that is painted by the live overlay and then by the retained
 * document must never be painted by neither: a dip that recovers is a blink, a dip that never
 * recovers is a stroke that vanished.
 */
export function analyzeStudioBrushScenarioFlicker(
  baseline: StudioBrushMediaPixelImage,
  frames: readonly StudioBrushMediaPixelImage[],
  tolerance = 12,
): StudioBrushScenarioFlickerAnalysis {
  const counts = frames.map((frame) =>
    studioBrushScenarioMaskStats(
      studioBrushScenarioInkMask(baseline, frame, tolerance),
      baseline.width,
      baseline.height,
    ).count,
  );
  if (counts.length === 0 || Math.max(...counts) < 4) {
    return { counts, maxDropRatio: 0, dipFrame: null, verdict: "empty" };
  }
  let maxDropRatio = 0;
  let dipFrame: number | null = null;
  for (let index = 1; index < counts.length; index += 1) {
    const previous = counts[index - 1]!;
    const current = counts[index]!;
    if (previous < 4) continue;
    const drop = 1 - current / previous;
    if (drop > maxDropRatio) maxDropRatio = drop;
    // A dip is a frame that lost more than half of its predecessor's ink while a later frame
    // holds at least three quarters of that predecessor again.
    if (dipFrame === null && drop > 0.5) {
      const recovered = counts.slice(index + 1).some((later) => later >= previous * 0.75);
      if (recovered) dipFrame = index;
    }
  }
  if (dipFrame !== null) {
    return { counts, maxDropRatio, dipFrame, verdict: "flicker" };
  }
  const first = counts[0]!;
  const last = counts[counts.length - 1]!;
  if (first >= 4 && last < first * 0.25) {
    return { counts, maxDropRatio, dipFrame: null, verdict: "vanish" };
  }
  return { counts, maxDropRatio, dipFrame: null, verdict: "stable" };
}

/** Live vs released silhouettes and tone inside one region. */
export function analyzeStudioBrushScenarioDiscrepancy(
  baseline: StudioBrushMediaPixelImage,
  live: StudioBrushMediaPixelImage,
  released: StudioBrushMediaPixelImage,
  region: StudioBrushScenarioRegion,
  tolerance = 12,
): StudioBrushScenarioDiscrepancy {
  assertSameGeometry(baseline, live);
  assertSameGeometry(baseline, released);
  const liveMask = studioBrushScenarioInkMask(baseline, live, tolerance);
  const releasedMask = studioBrushScenarioInkMask(baseline, released, tolerance);
  const channels = Math.min(3, baseline.channels);
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(baseline.width, Math.ceil(region.x + region.width));
  const y1 = Math.min(baseline.height, Math.ceil(region.y + region.height));
  let liveOnly = 0;
  let releasedOnly = 0;
  let shared = 0;
  let sharedDelta = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const index = y * baseline.width + x;
      const inLive = liveMask[index] === 1;
      const inReleased = releasedMask[index] === 1;
      if (inLive && inReleased) {
        shared += 1;
        const offset = index * baseline.channels;
        let delta = 0;
        for (let channel = 0; channel < channels; channel += 1) {
          delta += Math.abs(live.data[offset + channel]! - released.data[offset + channel]!);
        }
        sharedDelta += delta / channels;
      } else if (inLive) {
        liveOnly += 1;
      } else if (inReleased) {
        releasedOnly += 1;
      }
    }
  }
  const union = liveOnly + releasedOnly + shared;
  return {
    liveInk: liveOnly + shared,
    releasedInk: releasedOnly + shared,
    liveOnly,
    releasedOnly,
    shared,
    shapeDifferenceRatio: union === 0 ? 0 : (liveOnly + releasedOnly) / union,
    sharedMeanDelta: shared === 0 ? 0 : sharedDelta / shared,
  };
}

export interface StudioBrushScenarioJudgementInput {
  readonly softWet: boolean;
  readonly transparent: boolean;
}

function finding(
  level: StudioBrushScenarioFinding["level"],
  code: StudioBrushScenarioFinding["code"],
  message: string,
): StudioBrushScenarioFinding {
  return { level, code, message };
}

export function judgeStudioBrushScenarioFlicker(
  flicker: StudioBrushScenarioFlickerAnalysis,
  input: StudioBrushScenarioJudgementInput,
): StudioBrushScenarioFinding[] {
  if (input.transparent) return [];
  switch (flicker.verdict) {
    case "flicker":
      return [finding(
        "error",
        "post-release-flicker",
        `ink dipped to ${flicker.counts[flicker.dipFrame!]} px at post-release frame `
          + `${flicker.dipFrame} (${flicker.counts.join(",")})`,
      )];
    case "vanish":
      return [finding(
        "error",
        "post-release-vanish",
        `ink fell from ${flicker.counts[0]} to ${flicker.counts[flicker.counts.length - 1]} px `
          + `after pointer-up (${flicker.counts.join(",")})`,
      )];
    case "empty":
      return [finding("error", "post-release-empty", "no ink in any post-release frame")];
    default:
      return [];
  }
}

/**
 * Crossing and cap regions compare live against released silhouettes. Soft/wet media settle their
 * edges for a moment after pointer-up, so their bound is looser; a transparent wash records only.
 */
export function judgeStudioBrushScenarioDiscrepancy(
  discrepancy: StudioBrushScenarioDiscrepancy,
  code: Extract<
    StudioBrushScenarioFinding["code"],
    | "crossing-live-commit-drift"
    | "start-cap-live-commit-drift"
    | "end-cap-live-commit-drift"
    | "eraser-live-commit-drift"
  >,
  input: StudioBrushScenarioJudgementInput,
): StudioBrushScenarioFinding[] {
  if (input.transparent) return [];
  const findings: StudioBrushScenarioFinding[] = [];
  const union = discrepancy.liveOnly + discrepancy.releasedOnly + discrepancy.shared;
  if (union < 16) return findings;
  const shapeLimit = input.softWet ? 0.72 : 0.55;
  const shapeWarn = input.softWet ? 0.5 : 0.35;
  if (discrepancy.shapeDifferenceRatio > shapeLimit) {
    findings.push(finding(
      "error",
      code,
      `live/committed silhouettes differ by ${(discrepancy.shapeDifferenceRatio * 100).toFixed(1)}% `
        + `(live-only ${discrepancy.liveOnly}, committed-only ${discrepancy.releasedOnly}, `
        + `shared ${discrepancy.shared})`,
    ));
  } else if (discrepancy.shapeDifferenceRatio > shapeWarn) {
    findings.push(finding(
      "warning",
      code,
      `live/committed silhouettes differ by ${(discrepancy.shapeDifferenceRatio * 100).toFixed(1)}%`,
    ));
  }
  if (code === "crossing-live-commit-drift" && discrepancy.shared >= 16) {
    const toneLimit = input.softWet ? 48 : 32;
    if (discrepancy.sharedMeanDelta > toneLimit) {
      findings.push(finding(
        "warning",
        "crossing-live-commit-tone",
        `shared crossing pixels moved ${discrepancy.sharedMeanDelta.toFixed(1)} code values `
          + "between live and committed",
      ));
    }
  }
  return findings;
}

export interface StudioBrushScenarioPerfSample {
  readonly longTasks: readonly number[];
  readonly frameGapsMs: readonly number[];
}

export function judgeStudioBrushScenarioPerf(
  perf: StudioBrushScenarioPerfSample,
): StudioBrushScenarioFinding[] {
  const findings: StudioBrushScenarioFinding[] = [];
  const worstTask = perf.longTasks.length === 0 ? 0 : Math.max(...perf.longTasks);
  if (worstTask >= 200) {
    findings.push(finding(
      "error",
      "long-task",
      `a ${worstTask.toFixed(0)} ms task blocked the main thread during the gesture `
        + `(${perf.longTasks.length} long tasks)`,
    ));
  } else if (worstTask >= 100) {
    findings.push(finding(
      "warning",
      "long-task",
      `a ${worstTask.toFixed(0)} ms task blocked the main thread during the gesture`,
    ));
  }
  const stalls = perf.frameGapsMs.filter((gap) => gap >= 250);
  if (stalls.length > 0) {
    findings.push(finding(
      "warning",
      "frame-stall",
      `${stalls.length} animation frame(s) stalled ≥250 ms (worst ${Math.max(...stalls).toFixed(0)} ms)`,
    ));
  }
  return findings;
}

/** Square region around a point, clamped to the frame. */
export function studioBrushScenarioPointRegion(
  point: Readonly<{ x: number; y: number }>,
  radius: number,
  frame: Readonly<{ width: number; height: number }>,
): StudioBrushScenarioRegion {
  const x = Math.max(0, Math.floor(point.x - radius));
  const y = Math.max(0, Math.floor(point.y - radius));
  const right = Math.min(frame.width, Math.ceil(point.x + radius));
  const bottom = Math.min(frame.height, Math.ceil(point.y + radius));
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}
