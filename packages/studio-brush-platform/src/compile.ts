import { evaluateDynamicMapping, pathIRSchema } from "@toonspectrum/studio-project-model";

import { strokeOutlinePath } from "./geometry";
import { inkMeshInputPointFromModeledSample as meshInputPoint } from "./ink-mesh-derivation";
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
  PathIR,
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

/* -------------------------------------------------------------------------- *
 * Settled-phase centerline refit (vector-path lane enhancer), V12 §12.2
 * "Kurbo centerline" — the preview-lane fit promoted to an opt-in product
 * editing capability. After a stroke settles, its CENTERLINE polyline can be
 * refit to sparse G1 cubics (kurbo fit_polyline_json via the injected Vello
 * engine) so the editable proxy carries smooth bezier nodes instead of a
 * dense sample polyline.
 *
 * Centerline-only contract (enforced, never advisory): the outline POLYGON is
 * deliberately rejected. kurbo's optimizing simplifier does not terminate in
 * practical time on the near-degenerate slivers a low-pressure stroke start
 * produces (measured 2026-08-08: a 168-point ramp outline ran > 30 s with no
 * result, while the same stroke's 96–199 point centerline fits in
 * 0.1–112 ms — see vectorOutlineGeometryIRSchema in ./brush-composition).
 *
 * Editable-path invariants (asserted numerically, fail closed):
 * - endpoints exact: the fitted path starts/ends on the source endpoints;
 * - bounded deviation: the re-flattened fit stays within a max deviation
 *   tolerance of the source polyline (symmetric directed max distance);
 * - deterministic: same centerline + engine + options → identical result.
 * -------------------------------------------------------------------------- */

/** Fixed subdivision per fitted segment — determinism over adaptive stepping. */
const CENTERLINE_FLATTEN_STEPS = 16;

/** Mirrors fitPolylineToPath's upstream default accuracy (studio-engine-vello). */
const CENTERLINE_REFIT_DEFAULT_ACCURACY = 0.35;

/** Mirrors vectorOutlineGeometryIRSchema's kurboFitAccuracy cap. */
const CENTERLINE_REFIT_MAX_ACCURACY = 4;

/**
 * Endpoint exactness gate in px. kurbo's fit preserves the source endpoints
 * and the wasm JSON roundtrip is f64-exact, so any drift above this is an
 * engine contract violation, not float noise.
 */
const CENTERLINE_REFIT_ENDPOINT_EPSILON_PX = 1e-6;

/** A first↔last gap at or below this is a closed ring — outline territory. */
const CENTERLINE_REFIT_RING_EPSILON_PX = 1e-6;

/** Consecutive samples closer than this collapse before fitting (pen dwell). */
const CENTERLINE_REFIT_DUPLICATE_EPSILON_PX = 1e-9;

function centerlineLerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Deterministic fixed-step flattening of a fitted centerline PathIR. This is
 * the canonical flattener shared by the composition preview lane
 * (runCenterlineFit in ./brush-composition) and the settled-phase deviation
 * gate below — one contract, no drift between the two lanes.
 */
export function flattenCenterline(path: PathIR): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  const push = (x: number, y: number): void => {
    const last = points[points.length - 1];
    if (!last || Math.abs(last[0] - x) > 1e-9 || Math.abs(last[1] - y) > 1e-9) {
      points.push([x, y]);
    }
  };
  let cx = 0;
  let cy = 0;
  for (const verb of path.verbs) {
    if (verb.v === "Z") continue;
    if (verb.v === "M") {
      cx = verb.x;
      cy = verb.y;
      push(cx, cy);
      continue;
    }
    for (let step = 1; step <= CENTERLINE_FLATTEN_STEPS; step += 1) {
      const t = step / CENTERLINE_FLATTEN_STEPS;
      if (verb.v === "L") {
        push(centerlineLerp(cx, verb.x, t), centerlineLerp(cy, verb.y, t));
      } else if (verb.v === "Q") {
        const u = 1 - t;
        push(
          u * u * cx + 2 * u * t * verb.cx + t * t * verb.x,
          u * u * cy + 2 * u * t * verb.cy + t * t * verb.y,
        );
      } else {
        const u = 1 - t;
        push(
          u * u * u * cx +
            3 * u * u * t * verb.c1x +
            3 * u * t * t * verb.c2x +
            t * t * t * verb.x,
          u * u * u * cy +
            3 * u * u * t * verb.c1y +
            3 * u * t * t * verb.c2y +
            t * t * t * verb.y,
        );
      }
    }
    cx = verb.x;
    cy = verb.y;
  }
  return points;
}

export type CenterlineRefitFailureReason =
  | "invalid-input"
  | "outline-input"
  | "fit-degenerate"
  | "endpoint-drift"
  | "deviation-exceeded";

/**
 * Typed settled-refit failure. `reason === "outline-input"` is the enforced
 * centerline-only guard; every other reason is a broken editable-path
 * invariant. Fail-closed by contract: callers keep the original polyline
 * stroke — the refit is an enhancer, never an authority.
 */
export class CenterlineRefitError extends BrushCompileError {
  readonly reason: CenterlineRefitFailureReason;

  constructor(reason: CenterlineRefitFailureReason, message: string) {
    super(message);
    this.name = "CenterlineRefitError";
    this.reason = reason;
  }
}

/**
 * Structural fit-engine boundary — satisfied by studio-engine-vello's
 * `fitPolylineToPath` (and by `VelloCompositionEngine.fitPolyline` when
 * present). Injected by the host; this package never loads wasm itself.
 */
export interface CenterlineFitEngine {
  fitPolyline(
    points: ReadonlyArray<readonly [number, number]>,
    options: { closed?: boolean; accuracy?: number },
  ): PathIR;
}

export interface SettledCenterlineRefitOptions {
  /** Kurbo fit tolerance in px, (0, 4] (default 0.35, the upstream default). */
  readonly accuracy?: number;
  /**
   * Max allowed deviation between the re-flattened fit and the source
   * polyline, in px. Default `accuracy * 2`: the fitter promises ≤ accuracy;
   * the doubled gate absorbs fixed-step flattening measurement slack while
   * still failing closed on any gross shape change.
   */
  readonly maxDeviationPx?: number;
}

export interface SettledCenterlineRefitResult {
  /** Open single-subpath bezier PathIR (M then L/Q/C, no Z). */
  readonly path: PathIR;
  /** Verb count of the fitted path. */
  readonly verbs: number;
  /** Distinct source points the fitter consumed (after dwell dedupe). */
  readonly inputPoints: number;
  /** Accuracy actually passed to the fit engine. */
  readonly accuracy: number;
  /** Deviation gate that was enforced, in px. */
  readonly maxDeviationTolerancePx: number;
  /** Measured symmetric max deviation of the fit vs the source polyline. */
  readonly measuredDeviationPx: number;
}

function pointToSegmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Directed max distance from every point of `from` to the polyline `to`. */
function directedPolylineDeviation(
  from: ReadonlyArray<readonly [number, number]>,
  to: ReadonlyArray<readonly [number, number]>,
): number {
  let max = 0;
  for (const [px, py] of from) {
    let best = Infinity;
    for (let at = 0; at < to.length - 1; at += 1) {
      const [ax, ay] = to[at]!;
      const [bx, by] = to[at + 1]!;
      best = Math.min(best, pointToSegmentDistance(px, py, ax, ay, bx, by));
      if (best === 0) break;
    }
    max = Math.max(max, best);
  }
  return max;
}

/**
 * Refit a settled stroke CENTERLINE to a smooth editable bezier.
 *
 * Optional settled-phase enhancer for the vector-path lane: it runs after a
 * stroke settles (never on the hot path), only when a caller explicitly opts
 * in, and every invariant violation throws {@link CenterlineRefitError}
 * instead of returning an approximation — the caller keeps the original
 * polyline. Deterministic: same centerline + engine + options produce an
 * identical result.
 */
export function refitSettledCenterline(
  centerline: ReadonlyArray<readonly [number, number]>,
  engine: CenterlineFitEngine,
  options: SettledCenterlineRefitOptions = {},
): SettledCenterlineRefitResult {
  // Centerline-only guard, part 1: a smuggled `closed` request is the
  // outline-polygon lane by definition — reject before touching the engine.
  if ("closed" in options) {
    throw new CenterlineRefitError(
      "outline-input",
      "refitSettledCenterline fits open centerlines only; closed input is the outline-polygon lane, " +
        "where kurbo's optimizing simplifier has measured non-termination on sliver outlines",
    );
  }
  for (const [index, point] of centerline.entries()) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
      throw new CenterlineRefitError(
        "invalid-input",
        `centerline[${index}] is not finite: (${String(point[0])}, ${String(point[1])})`,
      );
    }
  }
  // Collapse pen-dwell duplicates deterministically before fitting.
  const points: Array<readonly [number, number]> = [];
  for (const point of centerline) {
    const last = points[points.length - 1];
    if (
      !last ||
      Math.abs(last[0] - point[0]) > CENTERLINE_REFIT_DUPLICATE_EPSILON_PX ||
      Math.abs(last[1] - point[1]) > CENTERLINE_REFIT_DUPLICATE_EPSILON_PX
    ) {
      points.push([point[0], point[1]] as const);
    }
  }
  if (points.length < 2) {
    throw new CenterlineRefitError(
      "invalid-input",
      `centerline needs at least 2 distinct points; received ${points.length} ` +
        `(${centerline.length} raw)`,
    );
  }
  // Centerline-only guard, part 2: a closed ring (first == last) is an
  // outline polygon signature. An artist's hand never lands back on the
  // start point within 1e-6 px; a generated outline ring does exactly that.
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (
    points.length > 2 &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) <= CENTERLINE_REFIT_RING_EPSILON_PX
  ) {
    throw new CenterlineRefitError(
      "outline-input",
      "centerline closes back onto its start point — this is an outline polygon, which the fitter " +
        "must never receive (measured non-termination on sliver outlines; centerline-only contract)",
    );
  }
  const accuracy = options.accuracy ?? CENTERLINE_REFIT_DEFAULT_ACCURACY;
  if (
    !Number.isFinite(accuracy) ||
    accuracy <= 0 ||
    accuracy > CENTERLINE_REFIT_MAX_ACCURACY
  ) {
    throw new CenterlineRefitError(
      "invalid-input",
      `accuracy must be in (0, ${CENTERLINE_REFIT_MAX_ACCURACY}]; received ${String(options.accuracy)}`,
    );
  }
  const maxDeviationPx = options.maxDeviationPx ?? accuracy * 2;
  if (!Number.isFinite(maxDeviationPx) || maxDeviationPx <= 0) {
    throw new CenterlineRefitError(
      "invalid-input",
      `maxDeviationPx must be positive and finite; received ${String(options.maxDeviationPx)}`,
    );
  }

  const rawFit = engine.fitPolyline(points, { closed: false, accuracy });
  let fitted: PathIR;
  try {
    fitted = pathIRSchema.parse(rawFit);
  } catch (error) {
    throw new CenterlineRefitError(
      "fit-degenerate",
      `fit engine returned an invalid PathIR: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (fitted.verbs.length < 2) {
    throw new CenterlineRefitError(
      "fit-degenerate",
      `kurbo fit collapsed the centerline to ${fitted.verbs.length} verbs`,
    );
  }
  const [firstVerb, ...restVerbs] = fitted.verbs;
  if (firstVerb!.v !== "M") {
    throw new CenterlineRefitError(
      "fit-degenerate",
      `fitted path must start with M; received ${firstVerb!.v}`,
    );
  }
  for (const verb of restVerbs) {
    if (verb.v === "Z" || verb.v === "M") {
      throw new CenterlineRefitError(
        "fit-degenerate",
        `fitted centerline must be one open subpath; received a ${verb.v} verb ` +
          "(closed/multi-subpath output is outline-shaped, not a centerline)",
      );
    }
    const coordinates =
      verb.v === "L"
        ? [verb.x, verb.y]
        : verb.v === "Q"
          ? [verb.cx, verb.cy, verb.x, verb.y]
          : [verb.c1x, verb.c1y, verb.c2x, verb.c2y, verb.x, verb.y];
    if (coordinates.some((value) => !Number.isFinite(value))) {
      throw new CenterlineRefitError(
        "fit-degenerate",
        "fitted path contains non-finite coordinates",
      );
    }
  }
  const lastVerb = fitted.verbs[fitted.verbs.length - 1]!;
  if (lastVerb.v === "Z" || lastVerb.v === "M") {
    // Unreachable after the loop above; narrows the type for the reads below.
    throw new CenterlineRefitError("fit-degenerate", "fitted path ended without an on-curve endpoint");
  }
  const startDrift = Math.hypot(firstVerb!.x - first[0], firstVerb!.y - first[1]);
  const endDrift = Math.hypot(lastVerb.x - last[0], lastVerb.y - last[1]);
  if (
    startDrift > CENTERLINE_REFIT_ENDPOINT_EPSILON_PX ||
    endDrift > CENTERLINE_REFIT_ENDPOINT_EPSILON_PX
  ) {
    throw new CenterlineRefitError(
      "endpoint-drift",
      `refit must keep endpoints exact; drift start=${startDrift.toExponential(3)}px ` +
        `end=${endDrift.toExponential(3)}px exceeds ${CENTERLINE_REFIT_ENDPOINT_EPSILON_PX}px`,
    );
  }

  const flattened = flattenCenterline(fitted);
  if (flattened.length < 2) {
    throw new CenterlineRefitError(
      "fit-degenerate",
      `flattening the fitted centerline produced ${flattened.length} points`,
    );
  }
  const measuredDeviationPx = Math.max(
    directedPolylineDeviation(flattened, points),
    directedPolylineDeviation(points, flattened),
  );
  if (measuredDeviationPx > maxDeviationPx) {
    throw new CenterlineRefitError(
      "deviation-exceeded",
      `refit deviates ${measuredDeviationPx.toFixed(4)}px from the source centerline; ` +
        `tolerance is ${maxDeviationPx.toFixed(4)}px (accuracy ${accuracy})`,
    );
  }

  return {
    path: fitted,
    verbs: fitted.verbs.length,
    inputPoints: points.length,
    accuracy,
    maxDeviationTolerancePx: maxDeviationPx,
    measuredDeviationPx,
  };
}
