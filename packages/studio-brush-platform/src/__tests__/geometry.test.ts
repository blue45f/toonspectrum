import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import { strokeOutlinePath } from "../geometry";

import type {
  BrushProgramIR,
  ModeledSampleIR,
  PathIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

/**
 * D-03 — sizeDynamics wired into the vector outline lane. The per-sample
 * effective size (velocity/tilt/pressure dynamics) is pre-mapped into the
 * pressure channel fed to perfect-freehand, so outline brushes gain width
 * response beyond raw pressure. Deterministic: no seed anywhere.
 */

const BASE_SIZE_PX = 8;

/** Horizontal polyline at y=50, 10px spacing, constant pressure. */
function horizontalSamples(
  velocityAt: (index: number) => number,
  altitudeDeg = 90,
): ModeledSampleIR[] {
  const samples: ModeledSampleIR[] = [];
  for (let index = 0; index <= 20; index += 1) {
    samples.push({
      x: index * 10,
      y: 50,
      tMs: index * 8,
      pressure: 0.7,
      velocity: velocityAt(index),
      altitudeDeg,
      azimuthDeg: 0,
    });
  }
  return samples;
}

function makeStroke(samples: ModeledSampleIR[]): StrokeIR {
  return {
    id: "outline-dynamics",
    brushPresetId: "outline-dynamics-pen",
    seed: 3,
    color: { r: 0, g: 0, b: 0, a: 1 },
    baseSizePx: BASE_SIZE_PX,
    samples,
  };
}

/**
 * thinning 0 keeps the dynamics-off outline uniform, so any width variation
 * can only come from sizeDynamics; smoothing/streamline 0 keep the outline
 * vertices anchored to the input samples for crisp width measurement.
 */
function makeProgram(sizeDynamics: BrushProgramIR["sizeDynamics"]): BrushProgramIR {
  return brushProgramIRSchema.parse({
    id: "outline-dynamics-pen",
    name: "Outline Dynamics Pen",
    stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
    sizeDynamics,
    geometry: {
      kind: "perfect-freehand",
      thinning: 0,
      smoothing: 0,
      streamline: 0,
      capStart: true,
      capEnd: true,
    },
  });
}

/** Vertical extent of the outline polygon near x=targetX (±5px window). */
function widthNear(path: PathIR, targetX: number): number {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const verb of path.verbs) {
    if (verb.v === "Z") continue;
    if (Math.abs(verb.x - targetX) > 5) continue;
    minY = Math.min(minY, verb.y);
    maxY = Math.max(maxY, verb.y);
  }
  return maxY - minY;
}

describe("strokeOutlinePath sizeDynamics wiring", () => {
  // velocity input normalizes as min(1, velocity/4): 0 → curve tap 0 (×1,
  // width unchanged at rest), 4 → curve tap 1 (×1.6, wider when fast).
  const velocityDynamics = [
    { input: "velocity", curve: [0, 1], min: 1, max: 1.6 },
  ] satisfies BrushProgramIR["sizeDynamics"];

  it("same polyline: different widths at high-velocity samples, identical at rest", () => {
    const samples = horizontalSamples((index) => (index <= 10 ? 0 : 4));
    const off = strokeOutlinePath(makeProgram([]), makeStroke(samples));
    const on = strokeOutlinePath(makeProgram(velocityDynamics), makeStroke(samples));

    // Rest region (velocity 0): the mapping resolves to ×1, so the outline
    // width matches the dynamics-off lane.
    expect(widthNear(on, 50)).toBeCloseTo(widthNear(off, 50), 6);
    expect(widthNear(off, 50)).toBeCloseTo(BASE_SIZE_PX, 6);

    // Fast region (velocity 4 → ×1.6): visibly wider than the static lane.
    expect(widthNear(off, 150)).toBeCloseTo(BASE_SIZE_PX, 6);
    expect(widthNear(on, 150)).toBeGreaterThan(widthNear(off, 150) + 3);
  });

  it("a fully at-rest stroke is verb-for-verb identical with dynamics on or off", () => {
    const samples = horizontalSamples(() => 0);
    const off = strokeOutlinePath(makeProgram([]), makeStroke(samples));
    const on = strokeOutlinePath(makeProgram(velocityDynamics), makeStroke(samples));
    expect(on).toEqual(off);
  });

  it("tilt dynamics change outline width; without dynamics tilt is inert", () => {
    const tiltDynamics = [
      { input: "tiltAltitude", curve: [1, 0.5], min: 0, max: 1 },
    ] satisfies BrushProgramIR["sizeDynamics"];
    const vertical = makeStroke(horizontalSamples(() => 0, 90));
    const tilted = makeStroke(horizontalSamples(() => 0, 30));

    const offProgram = makeProgram([]);
    expect(strokeOutlinePath(offProgram, tilted)).toEqual(
      strokeOutlinePath(offProgram, vertical),
    );

    const onProgram = makeProgram(tiltDynamics);
    const verticalWidth = widthNear(strokeOutlinePath(onProgram, vertical), 100);
    const tiltedWidth = widthNear(strokeOutlinePath(onProgram, tilted), 100);
    // curve [1, 0.5]: altitude 90 → ×0.5, altitude 30 → ×0.833… — the more
    // tilted pen draws the wider line per the dynamics config.
    expect(tiltedWidth).toBeGreaterThan(verticalWidth + 1);
  });

  it("dynamics-driven outlines stay deterministic (same input → same verbs)", () => {
    const samples = horizontalSamples((index) => (index % 3) * 2);
    const program = makeProgram(velocityDynamics);
    expect(strokeOutlinePath(program, makeStroke(samples))).toEqual(
      strokeOutlinePath(program, makeStroke(samples)),
    );
  });
});
