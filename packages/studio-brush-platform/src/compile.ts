import { evaluateDynamicMapping } from "@toonspectrum/studio-project-model";

import { strokeOutlinePath } from "./geometry";
import { inkStrokeMeshToPathIR } from "./ink-mesh-path";
import { applyStabilizer } from "./stabilizer";

import type {
  InProgressInkStroke,
  InkMeshBrushParams,
  InkMeshGenerator,
  InkMeshInputPoint,
  InkStrokeMeshDelta,
  InkStrokeMeshReplica,
} from "./ink-mesh";
import type {
  BrushProgramIR,
  DynamicMappingIR,
  ModeledSampleIR,
  SceneNodeIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

/**
 * BrushProgramIR compilers for the vector output lanes (V11 §6.1, V19 §2.3).
 *
 * - `compileVectorBrush` — the vector-path lane: stabilize samples → generate
 *   outline geometry → bake a SceneNodeIR.
 * - `compileMeshBrush` — the vector-mesh lane: bind a `google-ink-mesh`
 *   geometry program to the Google Ink WASM session machinery (./ink-mesh.ts):
 *   vertices/indices/texture coords with incremental retain-and-replace
 *   revisions, plus a mesh→PathIR editable-proxy bake (./ink-mesh-path.ts).
 *
 * Raster-tile output (`output.target === "raster-tiles"`) belongs to
 * raster/natural-media providers (Hokusai/Skia) and is rejected here rather
 * than silently approximated. Likewise the mesh lane fails closed when the
 * ink WASM provider is unavailable (`BrushProviderRequiredError`) — it never
 * degrades to perfect-freehand.
 */

export class BrushCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrushCompileError";
  }
}

/**
 * A compiled program needs an engine provider that is not present at runtime.
 * Fail-closed by contract: callers surface this to the user (brush disabled /
 * hidden) instead of substituting a different geometry engine.
 */
export class BrushProviderRequiredError extends BrushCompileError {
  readonly providerId: string;

  constructor(message: string, providerId: string) {
    super(message);
    this.name = "BrushProviderRequiredError";
    this.providerId = providerId;
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
      `program ${program.id} uses google-ink-mesh geometry; use compileMeshBrush for the vector-mesh lane`,
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

/* -------------------------------------------------------------------------- *
 * Vector-mesh lane (Google Ink), V19 §2.3 — the former ADR 0005 PoC gate,
 * promoted: mesh→PathIR conversion and incremental delta parity are measured
 * in the fidelity harness, so the gate no longer throws.
 * -------------------------------------------------------------------------- */

const GOOGLE_INK_MESH_PROVIDER_ID = "google-ink-mesh";
const DEG_TO_RAD = Math.PI / 180;
const HALF_PI = Math.PI / 2;
const TWO_PI = Math.PI * 2;

/** One live mesh stroke bound to a compiled program (ModeledSampleIR in). */
export interface CompiledMeshBrushSession {
  /** Underlying ink session, exposed for metrics()/state introspection. */
  readonly session: InProgressInkStroke;
  append(samples: readonly ModeledSampleIR[]): InkStrokeMeshDelta;
  finish(): InkStrokeMeshDelta;
  snapshot(): InkStrokeMeshReplica;
  cancel(): void;
  dispose(): void;
}

/**
 * A `google-ink-mesh` geometry program compiled for the vector-mesh lane.
 *
 * The ink WASM generator is injected (as raster-compile injects the Hokusai
 * module) so this package stays loader-free; `null`/`undefined` means the
 * provider is unavailable and every binding fails closed with
 * `BrushProviderRequiredError` — never a perfect-freehand substitute.
 *
 * Input modeling belongs to the ink stroke modeler upstream of this lane; the
 * JS stabilizer and the freehand shape fields (thinning/smoothing/streamline)
 * do not apply here. Dimensions that cannot reach the mesh engine are surfaced
 * in `warnings`, never dropped quietly.
 */
export interface CompiledMeshBrush {
  program: BrushProgramIR;
  /** Ink brush parameters for a stroke of the given base size. Deterministic. */
  brushParams: (baseSizePx: number) => InkMeshBrushParams;
  /** Verbatim ModeledSampleIR → ink input point conversion (no JS stabilizer). */
  toInkInputPoints: (samples: readonly ModeledSampleIR[]) => InkMeshInputPoint[];
  /** Program dimensions that cannot reach the ink mesh engine. Sorted, exhaustive. */
  warnings: string[];
  createSession: (
    generator: InkMeshGenerator | null | undefined,
    baseSizePx: number,
  ) => CompiledMeshBrushSession;
  /** Editable-proxy bake: final mesh → boundary-loop fill path (nonzero winding). */
  bake: (
    generator: InkMeshGenerator | null | undefined,
    stroke: StrokeIR,
  ) => SceneNodeIR;
}

function requireInkMeshGenerator(
  generator: InkMeshGenerator | null | undefined,
  programId: string,
): InkMeshGenerator {
  if (generator === null || generator === undefined) {
    throw new BrushProviderRequiredError(
      `program ${programId} requires the ${GOOGLE_INK_MESH_PROVIDER_ID} provider (ink WASM modeler), which is unavailable; the mesh lane fails closed instead of degrading to perfect-freehand`,
      GOOGLE_INK_MESH_PROVIDER_ID,
    );
  }
  return generator;
}

function meshInputPoint(sample: ModeledSampleIR): InkMeshInputPoint {
  const tiltRad = Math.min(
    HALF_PI,
    Math.max(0, (90 - sample.altitudeDeg) * DEG_TO_RAD),
  );
  const wrapped = (sample.azimuthDeg * DEG_TO_RAD) % TWO_PI;
  return {
    x: sample.x,
    y: sample.y,
    tMs: sample.tMs,
    pressure: sample.pressure,
    tiltRad,
    orientationRad: wrapped < 0 ? wrapped + TWO_PI : wrapped,
  };
}

/**
 * Lower sizeDynamics into ink's linear `pressureToSize` response. Only the
 * first pressure mapping can reach the engine; everything else is surfaced.
 */
function derivePressureToSize(
  program: BrushProgramIR,
  warnings: string[],
): { minMultiplier: number; maxMultiplier: number } | null {
  let mapping: DynamicMappingIR | null = null;
  program.sizeDynamics.forEach((candidate, index) => {
    if (candidate.input !== "pressure") {
      warnings.push(
        `sizeDynamics[${index}].input=${candidate.input}: ink pressureToSize only reads pressure; this dimension cannot reach the mesh`,
      );
      return;
    }
    if (mapping !== null) {
      warnings.push(
        `sizeDynamics[${index}]: additional pressure mapping (ink takes one pressureToSize response)`,
      );
      return;
    }
    mapping = candidate;
  });
  if (mapping === null) return null;
  const resolved: DynamicMappingIR = mapping;
  const minMultiplier = evaluateDynamicMapping(resolved, 0);
  const maxMultiplier = evaluateDynamicMapping(resolved, 1);
  for (let index = 1; index < resolved.curve.length - 1; index += 1) {
    const t = index / (resolved.curve.length - 1);
    const linear = minMultiplier + (maxMultiplier - minMultiplier) * t;
    if (Math.abs(evaluateDynamicMapping(resolved, t) - linear) > 1e-6) {
      warnings.push(
        "sizeDynamics pressure curve is non-linear; ink pressureToSize keeps only the endpoint multipliers",
      );
      break;
    }
  }
  return { minMultiplier, maxMultiplier };
}

/**
 * Compile a `google-ink-mesh` geometry program into the vector-mesh lane.
 *
 * The compiled object binds the incremental ink session machinery: appends
 * yield protocol-v1 retain-and-replace deltas with strictly increasing
 * revisions (validated by `applyInkStrokeMeshDelta` on the consumer side),
 * and `bake` produces the deterministic editable-proxy fill path from the
 * final mesh. Same program + samples → byte-identical mesh output.
 */
export function compileMeshBrush(program: BrushProgramIR): CompiledMeshBrush {
  if (program.output.target === "raster-tiles") {
    throw new BrushCompileError(
      `program ${program.id} targets raster-tiles; use compileRasterBrush for the raster lane`,
    );
  }
  if (program.geometry.kind !== "google-ink-mesh") {
    throw new BrushCompileError(
      `program ${program.id} uses ${program.geometry.kind} geometry; the vector-mesh lane requires google-ink-mesh (use compileVectorBrush for the outline lane)`,
    );
  }

  const warnings: string[] = [];
  const pressureToSize = derivePressureToSize(program, warnings);
  program.flowDynamics.forEach((mapping, index) => {
    warnings.push(
      `flowDynamics[${index}].input=${mapping.input}: ink mesh has no flow/opacity dynamic; this dimension cannot reach the mesh`,
    );
  });
  if (program.tip.kind !== "round") {
    warnings.push(
      `tip.kind=${program.tip.kind}: ink mesh has no stamp/image tip textures; the parametric round tip is used`,
    );
  }
  if (program.tip.hardness !== 1) {
    warnings.push("tip.hardness: ink mesh has no hardness falloff dimension");
  }
  if (program.tip.angleJitterDeg > 0) {
    warnings.push("tip.angleJitterDeg: ink mesh has no jitter dimension");
  }
  if (program.stabilizer.kind !== "none" && program.stabilizer.strength > 0) {
    warnings.push(
      "stabilizer: the mesh lane consumes pre-modeled input (ink stroke modeler); the JS stabilizer is not applied",
    );
  }

  const brushParams = (baseSizePx: number): InkMeshBrushParams => ({
    size: baseSizePx,
    pressureToSize,
  });
  const toInkInputPoints = (
    samples: readonly ModeledSampleIR[],
  ): InkMeshInputPoint[] => samples.map(meshInputPoint);

  return {
    program,
    brushParams,
    toInkInputPoints,
    warnings: [...warnings].sort(),
    createSession: (generator, baseSizePx) => {
      const ink = requireInkMeshGenerator(generator, program.id);
      const session = ink.createInProgressStroke(brushParams(baseSizePx));
      return {
        session,
        append: (samples) => session.append(toInkInputPoints(samples)),
        finish: () => session.finish(),
        snapshot: () => session.snapshot(),
        cancel: () => session.cancel(),
        dispose: () => session.dispose(),
      };
    },
    bake: (generator, stroke) => {
      const ink = requireInkMeshGenerator(generator, program.id);
      const mesh = ink.generateInkStrokeMesh(
        toInkInputPoints(stroke.samples),
        brushParams(stroke.baseSizePx),
      );
      return {
        id: stroke.id,
        kind: "fill-path",
        path: inkStrokeMeshToPathIR(mesh).path,
        paint: { kind: "solid", color: stroke.color },
        opacity: 1,
        blend: "src-over",
        fillRule: "nonzero",
      };
    },
  };
}
