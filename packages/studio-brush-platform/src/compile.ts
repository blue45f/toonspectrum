
import { strokeOutlinePath } from "./geometry";
import { applyStabilizer } from "./stabilizer";

import type {
  BrushProgramIR,
  ModeledSampleIR,
  SceneNodeIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

/**
 * BrushProgramIR compiler for the vector-path output lane (V11 §6.1).
 *
 * A compiled program is a pure pipeline: stabilize samples → generate outline
 * geometry → bake a SceneNodeIR. Raster-tile output (`output.target ===
 * "raster-tiles"`) belongs to raster/natural-media providers (Hokusai/Skia)
 * and is rejected here rather than silently approximated.
 */

export class BrushCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrushCompileError";
  }
}

export interface CompiledVectorBrush {
  program: BrushProgramIR;
  stabilize: (samples: readonly ModeledSampleIR[]) => ModeledSampleIR[];
  bake: (stroke: StrokeIR) => SceneNodeIR;
}

export function compileVectorBrush(program: BrushProgramIR): CompiledVectorBrush {
  if (program.output.target !== "vector-path") {
    throw new BrushCompileError(
      `program ${program.id} targets ${program.output.target}; this compiler only handles vector-path`,
    );
  }
  if (program.geometry.kind === "google-ink-mesh") {
    throw new BrushCompileError(
      `program ${program.id} requires google-ink-mesh geometry, which is behind the PoC gate (ADR 0005)`,
    );
  }
  return {
    program,
    stabilize: (samples) => applyStabilizer(samples, program.stabilizer),
    bake: (stroke) => {
      const stabilized: StrokeIR = {
        ...stroke,
        samples: applyStabilizer(stroke.samples, program.stabilizer),
      };
      return {
        id: stroke.id,
        kind: "fill-path",
        path: strokeOutlinePath(program, stabilized),
        paint: { kind: "solid", color: stroke.color },
        opacity: 1,
        blend: "src-over",
        fillRule: "nonzero",
      };
    },
  };
}
