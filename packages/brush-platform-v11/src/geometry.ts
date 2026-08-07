import { evaluateDynamicMapping } from "@toonspectrum/project-model-v11";
import { getStroke } from "perfect-freehand";

import type {
  BrushProgramIR,
  ModeledSampleIR,
  PathIR,
  StrokeIR,
} from "@toonspectrum/project-model-v11";

/**
 * Stroke geometry stage (matrix E10, ADR 0005): perfect-freehand converts
 * modeled samples into a pressure-aware outline polygon which becomes an
 * editable PathIR. Deterministic by construction — same samples, same program,
 * same outline.
 */

export function effectiveSizeAt(
  program: BrushProgramIR,
  baseSizePx: number,
  sample: ModeledSampleIR,
): number {
  let size = baseSizePx;
  for (const mapping of program.sizeDynamics) {
    const input =
      mapping.input === "pressure"
        ? sample.pressure
        : mapping.input === "velocity"
          ? Math.min(1, sample.velocity / 4)
          : mapping.input === "tiltAltitude"
            ? sample.altitudeDeg / 90
            : mapping.input === "tiltAzimuth"
              ? sample.azimuthDeg / 360
              : mapping.input === "constant"
                ? 1
                : 0.5; // "random"/"twist" resolved upstream by seeded dynamics
    size *= evaluateDynamicMapping(mapping, input);
  }
  return Math.max(0.1, size);
}

export function strokeOutlinePath(program: BrushProgramIR, stroke: StrokeIR): PathIR {
  const geometry = program.geometry;
  const points = stroke.samples.map((sample) => [sample.x, sample.y, sample.pressure]);
  const outline = getStroke(points, {
    size: stroke.baseSizePx,
    thinning: geometry.thinning,
    smoothing: geometry.smoothing,
    streamline: geometry.streamline,
    simulatePressure: false,
    last: true,
    start: { cap: geometry.capStart },
    end: { cap: geometry.capEnd },
  });
  const verbs: PathIR["verbs"] = [];
  outline.forEach(([x, y], index) => {
    if (x === undefined || y === undefined) return;
    verbs.push(index === 0 ? { v: "M", x, y } : { v: "L", x, y });
  });
  if (verbs.length > 2) verbs.push({ v: "Z" });
  return { verbs };
}
