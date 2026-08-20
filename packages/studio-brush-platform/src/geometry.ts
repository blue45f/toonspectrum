import { evaluateDynamicMapping } from "@toonspectrum/studio-project-model";
import { getStroke } from "perfect-freehand";

import type {
  BrushProgramIR,
  ModeledSampleIR,
  PathIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

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
  // D-03: pre-map each sample's dynamics-resolved effective size into the
  // per-point pressure channel so the outline lane gains velocity/tilt width
  // response, not just raw pressure. perfect-freehand's per-point radius is
  // size * (0.5 - thinning * (0.5 - pressure)), so pinning thinning to 1
  // makes the pressure channel address radius linearly (radius = size * p)
  // and lets it reproduce the desired per-sample radius exactly: the radius
  // the geometry's own thinning would produce if `size` were the sample's
  // effective size. Programs without sizeDynamics keep the legacy path
  // byte-identical (buildVectorOutline in brush-composition depends on it).
  const hasSizeDynamics = program.sizeDynamics.length > 0 && stroke.baseSizePx > 0;
  const points = hasSizeDynamics
    ? stroke.samples.map((sample) => {
        const effectiveSize = effectiveSizeAt(program, stroke.baseSizePx, sample);
        const radius =
          effectiveSize * (0.5 - geometry.thinning * (0.5 - sample.pressure));
        return [sample.x, sample.y, Math.min(1, Math.max(0, radius / stroke.baseSizePx))];
      })
    : stroke.samples.map((sample) => [sample.x, sample.y, sample.pressure]);
  const outline = getStroke(points, {
    size: stroke.baseSizePx,
    thinning: hasSizeDynamics ? 1 : geometry.thinning,
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
