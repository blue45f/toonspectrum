import {
  brushProgramIRSchema,
  colorIRSchema,
  dynamicMappingIRSchema,
  pathIRSchema,
  tipGraphIRSchema,
} from "@toonspectrum/studio-project-model";
import { z } from "zod";

import { BRUSH_PREVIEW_DEFAULTS } from "./brush-preview";
import {
  layTextOnPath,
  simulateParticleSplats,
  solveRibbonStrands,
  stampPatternAlongPath,
} from "./composition-providers";
import { strokeOutlinePath } from "./geometry";
import { renderLibMypaintStroke } from "./libmypaint";
import {
  compileRasterBrush,
  renderCompiledBrushStroke,
  standardZigzagStrokeSamples,
} from "./raster-compile";
import { selectStabilizerBackend } from "./stabilizer-provider";

import type { CompositionTextEngine } from "./composition-providers";
import type { InkStrokeModeler } from "./ink-modeler";
import type { LibMypaintRaw } from "./libmypaint/index";
import type { HokusaiModuleLike, RasterStrokeSample } from "./raster-compile";
import type { StabilizerBackend } from "./stabilizer-provider";
import type {
  ModeledSampleIR,
  PathIR,
  SceneIR,
  StrokeIR,
} from "@toonspectrum/studio-project-model";

/**
 * Composition brush program executor — V12 §12.2 "대표 공격적 조합".
 *
 * §12.1 promotes the BrushProgram (not a single provider) to the product
 * unit: one brush chains several next-generation engines. This module gives
 * that chain a declarative IR and a deterministic executor over the shipped
 * providers:
 *
 * - input stage: stabilizer seam (./stabilizer-provider — ema | spring |
 *   quarantined Google ink-stroke-modeler, opt-in via an injected modeler);
 * - geometry stage: vector-outline (perfect-freehand via ./geometry, with an
 *   optional Kurbo centerline fit through the injected Vello engine),
 *   raster-dab passthrough for the natural-media engines, or one of the
 *   §12.2 row-9..12 path providers (pattern-stamp | particle-splat |
 *   ribbon-xpbd | text-on-path, ./composition-providers);
 * - engine stage: vector-fill (Vello CPU SceneIR render), libmypaint
 *   (pinned 1.6.1 injection lane, ./libmypaint) or hokusai (challenger via
 *   ./raster-compile);
 * - composite stage: deterministic straight-alpha blending of the layer
 *   frames in declared order (src-over | multiply, per-layer opacity) onto
 *   the shared preview background.
 *
 * Contracts (zero silent loss, 품질·손맛 우선 정책):
 * - Deterministic: identical program + stroke input + engines produce
 *   byte-identical pixels. Every engine is seeded; wasm modules are injected
 *   by the host (this module never loads wasm itself).
 * - Every stage's output is validated against an explicit contract; a broken
 *   chain fails loudly with {@link CompositionExecutionError} naming the
 *   stage — never a silent fallback.
 * - Stage reports are merged into `warnings` with stage prefixes
 *   (`layer[<id>].engine[<name>] …`) in deterministic order.
 * - §12.2 rows whose Studio Max providers are not all shipped either record
 *   the exact substitution in `laneNote` or live in
 *   {@link UNAVAILABLE_COMPOSITION_ROWS} with the missing provider named.
 *
 * Contract: import this file by direct path (like ./stabilizer-provider it
 * is intentionally NOT re-exported from the package barrel; barrel
 * integration is a coordinator decision).
 */

// ---------------------------------------------------------------------------
// CompositionProgramIR (zod)
// ---------------------------------------------------------------------------

/** Input stage: which stabilizer lane conditions the raw samples. */
export const compositionInputStageIRSchema = z.object({
  backend: z.enum(["ema", "spring", "ink-stroke-modeler"]).default("ema"),
  /** First-party lanes only; the ink lane runs its pinned upstream params. */
  strength: z.number().min(0).max(1).default(0.35),
  predictionMs: z.number().min(0).max(50).default(0),
});
export type CompositionInputStageIR = z.infer<typeof compositionInputStageIRSchema>;

export const vectorOutlineGeometryIRSchema = z.object({
  kind: z.literal("vector-outline"),
  thinning: z.number().min(-1).max(1).default(0.5),
  smoothing: z.number().min(0).max(1).default(0.5),
  streamline: z.number().min(0).max(1).default(0.5),
  capStart: z.boolean().default(true),
  capEnd: z.boolean().default(true),
  /**
   * Kurbo CENTERLINE fit (§12.2 "Kurbo centerline"): the stabilized sample
   * polyline collapses into sparse G1 cubics (fit_polyline_json via the
   * injected Vello engine) and is re-flattened before the outline generator
   * runs, so the outline follows the simplified centerline. Requires
   * `engines.vello.fitPolyline`.
   *
   * The outline POLYGON is deliberately never fed to the fitter: kurbo's
   * optimizing simplifier does not terminate in practical time on the
   * near-degenerate slivers a low-pressure stroke start produces (measured
   * 2026-08-08: a 168-point ramp outline ran > 30 s with no result, while
   * the same stroke's 96–199 point centerline fits in 0.1–112 ms).
   */
  kurboFitAccuracy: z.number().positive().max(4).optional(),
});
export type VectorOutlineGeometryIR = z.infer<typeof vectorOutlineGeometryIRSchema>;

export const rasterDabGeometryIRSchema = z.object({
  kind: z.literal("raster-dab"),
});
export type RasterDabGeometryIR = z.infer<typeof rasterDabGeometryIRSchema>;

/**
 * §12.2 "장식·패턴": arc-length pattern stamping. `motif` is a plain PathIR,
 * which is exactly what studio-format-gateway's `parseSvgToScene` yields for
 * an authored SVG decoration, so the SVG lane feeds this field unchanged.
 */
export const patternStampGeometryIRSchema = z.object({
  kind: z.literal("pattern-stamp"),
  motif: pathIRSchema,
  /** Arc-length distance between stamp sites, in px. */
  spacingPx: z.number().positive().max(256).default(12),
  /** Motif bounding-box extent at pressure 1, in px. */
  sizePx: z.number().positive().max(256).default(14),
  sizePressure: z.number().min(0).max(1).default(0.6),
  alignToTangent: z.boolean().default(true),
  /** Site phase as a fraction of `spacingPx`. */
  phase: z.number().min(0).max(1).default(0),
});
export type PatternStampGeometryIR = z.infer<typeof patternStampGeometryIRSchema>;

/** §12.2 "파티클": deterministic CPU reference of the particle lane. */
export const particleSplatGeometryIRSchema = z.object({
  kind: z.literal("particle-splat"),
  emissionSpacingPx: z.number().positive().max(64).default(3),
  particlesPerSite: z.number().int().min(1).max(8).default(2),
  lifetimeMs: z.number().positive().max(2000).default(120),
  stepMs: z.number().positive().max(50).default(8),
  gravityPxPerMs2: z.number().min(-0.05).max(0.05).default(0.0012),
  drag: z.number().min(0).max(0.5).default(0.02),
  speedPxPerMs: z.number().min(0).max(4).default(0.12),
  /** Pressure share of the emission speed — widens the spray cone. */
  speedPressure: z.number().min(0).max(1).default(0),
  radiusPx: z.number().positive().max(16).default(1.8),
  radiusPressure: z.number().min(0).max(1).default(0.85),
  /** Mixed into the execution seed so two particle layers differ. */
  seedSalt: z.number().int().min(0).max(0xffff).default(0),
});
export type ParticleSplatGeometryIR = z.infer<typeof particleSplatGeometryIRSchema>;

/** §12.2 "리본·헤어·로프": XPBD guide-curve solver over the stroke. */
export const ribbonXpbdGeometryIRSchema = z.object({
  kind: z.literal("ribbon-xpbd"),
  /** Chain nodes; node 0 is kinematic, each node paints one lagging strand. */
  strands: z.number().int().min(2).max(24).default(5),
  restLengthPx: z.number().positive().max(64).default(3),
  iterations: z.number().int().min(1).max(32).default(8),
  /** XPBD compliance (inverse stiffness); 0 is a rigid rope. */
  compliance: z.number().min(0).max(10).default(0),
  gravityPxPerMs2: z.number().min(-0.05).max(0.05).default(0.0015),
  damping: z.number().min(0).max(1).default(0.06),
  widthPx: z.number().positive().max(64).default(4),
  widthPressure: z.number().min(0).max(1).default(0.8),
  /** Width falloff from the guide strand to the last trailing strand. */
  taper: z.number().min(0).max(1).default(0.5),
  substepMs: z.number().positive().max(64).default(6),
});
export type RibbonXpbdGeometryIR = z.infer<typeof ribbonXpbdGeometryIRSchema>;

/** §12.2 "텍스트 브러시": a shaped glyph run laid on the brush path. */
export const textOnPathGeometryIRSchema = z.object({
  kind: z.literal("text-on-path"),
  text: z.string().min(1).max(128),
  fontSizePx: z.number().positive().max(256).default(18),
  letterSpacingPx: z.number().min(-32).max(64).default(1),
  repeat: z.boolean().default(true),
  alignToTangent: z.boolean().default(true),
  sizePressure: z.number().min(0).max(1).default(0.7),
  baselineOffsetPx: z.number().min(-64).max(64).default(0),
});
export type TextOnPathGeometryIR = z.infer<typeof textOnPathGeometryIRSchema>;

export const compositionGeometryStageIRSchema = z.discriminatedUnion("kind", [
  vectorOutlineGeometryIRSchema,
  rasterDabGeometryIRSchema,
  patternStampGeometryIRSchema,
  particleSplatGeometryIRSchema,
  ribbonXpbdGeometryIRSchema,
  textOnPathGeometryIRSchema,
]);
export type CompositionGeometryStageIR = z.infer<
  typeof compositionGeometryStageIRSchema
>;

/**
 * Geometry kinds that emit a PathIR for the `vector-fill` engine. Everything
 * else is a raster-dab passthrough for the natural-media engines.
 */
const VECTOR_GEOMETRY_KINDS = new Set<CompositionGeometryStageIR["kind"]>([
  "vector-outline",
  "pattern-stamp",
  "particle-splat",
  "ribbon-xpbd",
  "text-on-path",
]);

export const vectorFillEngineIRSchema = z.object({
  engine: z.literal("vector-fill"),
  color: colorIRSchema.default({ r: 0, g: 0, b: 0, a: 1 }),
  baseSizePx: z.number().positive().max(64).default(8),
});
export type VectorFillEngineIR = z.infer<typeof vectorFillEngineIRSchema>;

const libmypaintCurvePointSchema = z.tuple([z.number(), z.number()]);
export const libmypaintSettingIRSchema = z.object({
  base_value: z.number(),
  inputs: z
    .record(z.string(), z.array(libmypaintCurvePointSchema).min(2))
    .default({}),
});
export const libmypaintEngineIRSchema = z.object({
  engine: z.literal("libmypaint"),
  /** `.myb` v3 settings injected through the pinned 1.6.1 injection API. */
  settings: z.record(z.string(), libmypaintSettingIRSchema),
});
export type LibmypaintEngineIR = z.infer<typeof libmypaintEngineIRSchema>;

export const hokusaiEngineIRSchema = z.object({
  engine: z.literal("hokusai"),
  sizeDynamics: z.array(dynamicMappingIRSchema).default([]),
  flowDynamics: z.array(dynamicMappingIRSchema).default([]),
  tip: tipGraphIRSchema.default({
    kind: "round",
    hardness: 1,
    spacingPct: 10,
    angleJitterDeg: 0,
  }),
  /** Stroke color, HSV in [0, 1] (StrokeIR color lives outside `.myb`). */
  colorHsv: z
    .tuple([
      z.number().min(0).max(1),
      z.number().min(0).max(1),
      z.number().min(0).max(1),
    ])
    .default([0, 0, 0]),
  /** Base-2 log radius override (per-stroke baseSizePx concern). */
  radiusLog2: z.number().min(-2).max(6).optional(),
});
export type HokusaiEngineIR = z.infer<typeof hokusaiEngineIRSchema>;

export const compositionEngineStageIRSchema = z.discriminatedUnion("engine", [
  vectorFillEngineIRSchema,
  libmypaintEngineIRSchema,
  hokusaiEngineIRSchema,
]);
export type CompositionEngineStageIR = z.infer<
  typeof compositionEngineStageIRSchema
>;

export const compositionCompositeIRSchema = z.object({
  blend: z.enum(["src-over", "multiply"]).default("src-over"),
  opacity: z.number().min(0).max(1).default(1),
});
export type CompositionCompositeIR = z.infer<typeof compositionCompositeIRSchema>;

export const compositionLayerIRSchema = z
  .object({
    id: z.string().min(1),
    geometry: compositionGeometryStageIRSchema,
    engine: compositionEngineStageIRSchema,
    composite: compositionCompositeIRSchema.default({
      blend: "src-over",
      opacity: 1,
    }),
  })
  .superRefine((layer, context) => {
    const vectorGeometry = VECTOR_GEOMETRY_KINDS.has(layer.geometry.kind);
    const vectorEngine = layer.engine.engine === "vector-fill";
    if (vectorGeometry !== vectorEngine) {
      context.addIssue({
        code: "custom",
        message:
          `layer ${layer.id}: geometry ${layer.geometry.kind} cannot feed engine ` +
          `${layer.engine.engine} ([${[...VECTOR_GEOMETRY_KINDS].join("|")}] ↔ ` +
          `vector-fill, raster-dab ↔ libmypaint|hokusai)`,
        path: ["engine"],
      });
    }
  });
export type CompositionLayerIR = z.infer<typeof compositionLayerIRSchema>;

export const compositionProgramIRSchema = z.object({
  id: z.string().min(1),
  /** §12.2 row name verbatim for presets (e.g. "G펜·매핑펜"). */
  name: z.string().min(1),
  /** Which §12.2 column this program realizes. */
  lane: z.enum(["studio-max", "stable"]),
  /** Explicit substitution/omission record — zero silent loss. */
  laneNote: z.string().default(""),
  input: compositionInputStageIRSchema.default({
    backend: "ema",
    strength: 0.35,
    predictionMs: 0,
  }),
  layers: z.array(compositionLayerIRSchema).min(1).max(4),
});
export type CompositionProgramIR = z.infer<typeof compositionProgramIRSchema>;

// ---------------------------------------------------------------------------
// Engine injection boundary
// ---------------------------------------------------------------------------

/** Structural Vello boundary (studio-engine-vello render.ts, injected). */
export interface VelloCompositionEngine {
  /** Straight-alpha RGBA8 of scene.width × scene.height. */
  renderScene(scene: SceneIR): Uint8Array;
  /** Kurbo polyline simplification (fitPolylineToPath). */
  fitPolyline?(
    points: ReadonlyArray<readonly [number, number]>,
    options: { closed?: boolean; accuracy?: number },
  ): PathIR;
}

export interface CompositionEngines {
  /** Pinned libmypaint bridge (`await loadLibMypaint()`). */
  libmypaint?: LibMypaintRaw;
  /** Initialized studio-hokusai-wasm module. */
  hokusai?: HokusaiModuleLike;
  /** Vello CPU boundary for vector-fill layers and Kurbo fitting. */
  vello?: VelloCompositionEngine;
  /** Google ink lane (`await loadInkStrokeModeler()`), opt-in per ADR-0009. */
  inkModeler?: InkStrokeModeler;
  /**
   * Glyph shaper for `text-on-path` layers — the parley lane
   * (`shapeTextToGlyphPaths`, optionally fronted by `shapeTextCached`) with
   * the font bytes bound by the host.
   */
  text?: CompositionTextEngine;
  /**
   * §12.2 "3D 표면 브러시" seam. NOT satisfied by anything in `packages/`:
   * the shipped hit/UV + texture-paint implementation lives in the app layer
   * (`src/domains/creator/studio-vrm-texture-uv.ts` +
   * `studio-vrm-texture-paint-ops.ts`), which packages must not import.
   * Declared here so a host that owns both sides can inject it without a
   * schema change; see {@link UNAVAILABLE_COMPOSITION_ROWS}.
   */
  surface?: SurfaceProjectionProvider;
}

/**
 * §12.2 "3D 표면 브러시" injection boundary — 실측 결과 기반 인터페이스.
 *
 * The provider projects a screen-space stroke sample onto a mesh and answers
 * with the UV texel it hit, which is what the 2D dab engine then paints into
 * the texture atlas (no UV flip: the shipped app-layer implementation resolves
 * texels in the same y-down space the raster engines already use).
 *
 * Shipped implementation (surveyed 2026-08-08, read-only):
 * - `src/domains/creator/studio-vrm-texture-uv.ts` —
 *   `computeStudioVrmBarycentric`, `resolveStudioVrmTriangleUv`,
 *   `resolveStudioVrmTextureHit`, `resolveStudioVrmTexelPoint`;
 * - `src/domains/creator/studio-vrm-texture-paint-ops.ts` —
 *   `applyStudioVrmTexturePaintOp` (2D brush engine reused on the atlas);
 * - `src/domains/creator/studio-vrm-texture-stroke.ts` — stroke walking.
 *
 * They cannot be wired from this package: `packages/*` may not depend on
 * `src/`, and publishing a package-facing adapter would require editing the
 * app layer. Interface only, by design — no approximation is substituted.
 */
export interface SurfaceProjectionProvider {
  /**
   * Project one screen-space sample onto the bound mesh.
   * Returns `null` when the ray misses (the executor must then decide, never
   * this boundary — a miss is data, not a fallback).
   */
  projectSample(sample: ModeledSampleIR): {
    /** Texture-space UV in [0, 1]². */
    u: number;
    v: number;
    /** Texel footprint of one screen px — drives the dab radius in UV space. */
    texelDensity: number;
  } | null;
  /** Atlas size the projected texels address. */
  textureSize(): { width: number; height: number };
}

export interface ExecuteCompositionOptions {
  /** Canvas width in px (default 192 — the shared preview spec). */
  width?: number;
  /** Canvas height in px (default 96). */
  height?: number;
  /** Seed for the seeded raster engines (default 7). */
  seed?: number;
  /** Background color, sRGB in [0, 1] (default white, preview spec). */
  background?: { r: number; g: number; b: number };
}

export interface CompositionLayerReport {
  id: string;
  geometry: CompositionGeometryStageIR["kind"];
  engine: CompositionEngineStageIR["engine"];
  /** Pixels with alpha > 0 in the layer's pre-composite frame. */
  inkedPixels: number;
  /** Verb count of the Kurbo-fitted centerline; absent when the fit is off. */
  centerlineVerbs?: number;
  /** Samples the outline generator consumed (post-fit resampling). */
  geometrySamples?: number;
  /**
   * Instances the row-9..12 providers emitted (stamps / particles / strands /
   * glyphs). Absent for vector-outline and raster-dab layers.
   */
  instances?: number;
}

export interface ExecuteCompositionResult {
  /** RGBA8 over `background`, row-major, alpha 255 (preview pixel space). */
  pixels: Uint8Array;
  width: number;
  height: number;
  input: {
    backend: CompositionInputStageIR["backend"];
    inSamples: number;
    outSamples: number;
  };
  layers: CompositionLayerReport[];
  /** Stage-prefixed reports in execution order — never dropped. */
  warnings: string[];
}

export class CompositionExecutionError extends Error {
  constructor(
    readonly stage: string,
    message: string,
  ) {
    super(`${stage}: ${message}`);
    this.name = "CompositionExecutionError";
  }
}

// ---------------------------------------------------------------------------
// Shared stroke input (preview spec: standard zigzag, lifted to IR samples)
// ---------------------------------------------------------------------------

/**
 * The standard preview stroke (raster-compile's pressure-ramp zigzag) lifted
 * into ModeledSampleIR so one input feeds stabilizer, vector and raster
 * stages alike. Velocity is derived from the path (px/ms); tilt is neutral
 * (altitude 90°), matching the zigzag's tiltX/tiltY = 0.
 */
export function standardCompositionStrokeSamples(
  width: number = BRUSH_PREVIEW_DEFAULTS.width,
  height: number = BRUSH_PREVIEW_DEFAULTS.height,
  sampleCount: number = BRUSH_PREVIEW_DEFAULTS.sampleCount,
): ModeledSampleIR[] {
  const zigzag = standardZigzagStrokeSamples(width, height, sampleCount);
  return zigzag.map((sample, index) => {
    const previous = index > 0 ? zigzag[index - 1] : undefined;
    const dtMs = previous ? Math.max(1e-6, sample.tMs - previous.tMs) : 1;
    const velocity = previous
      ? Math.hypot(sample.x - previous.x, sample.y - previous.y) / dtMs
      : 0;
    return {
      x: sample.x,
      y: sample.y,
      tMs: sample.tMs,
      pressure: sample.pressure,
      velocity,
      altitudeDeg: 90,
      azimuthDeg: 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Stage execution
// ---------------------------------------------------------------------------

function assertFiniteSamples(
  stage: string,
  samples: readonly ModeledSampleIR[],
): void {
  if (samples.length === 0) {
    throw new CompositionExecutionError(stage, "produced zero samples");
  }
  for (const [index, sample] of samples.entries()) {
    if (
      !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.y) ||
      !Number.isFinite(sample.tMs) ||
      !Number.isFinite(sample.pressure) ||
      sample.pressure < 0 ||
      sample.pressure > 1
    ) {
      throw new CompositionExecutionError(
        stage,
        `sample[${index}] violates the ModeledSampleIR contract (finite x/y/tMs, pressure in [0, 1])`,
      );
    }
  }
}

function runInputStage(
  input: CompositionInputStageIR,
  strokeInput: readonly ModeledSampleIR[],
  engines: CompositionEngines,
): ModeledSampleIR[] {
  const stage = `input[${input.backend}]`;
  if (strokeInput.length === 0) {
    throw new CompositionExecutionError(stage, "stroke input is empty");
  }
  let backend: StabilizerBackend;
  try {
    backend = selectStabilizerBackend(input.backend, {
      allowInk: input.backend === "ink-stroke-modeler",
      ...(engines.inkModeler ? { inkModeler: engines.inkModeler } : {}),
    });
  } catch (error) {
    throw new CompositionExecutionError(stage, (error as Error).message);
  }
  let stabilized: ModeledSampleIR[];
  try {
    stabilized = backend.process(strokeInput, {
      strength: input.strength,
      predictionMs: input.predictionMs,
    });
  } catch (error) {
    throw new CompositionExecutionError(stage, (error as Error).message);
  }
  assertFiniteSamples(stage, stabilized);
  return stabilized;
}

/** Lower IR tilt (altitude/azimuth) to the engines' [-1, 1] tilt plane. */
function toRasterSamples(
  samples: readonly ModeledSampleIR[],
): RasterStrokeSample[] {
  return samples.map((sample) => {
    const altitudeRad = (sample.altitudeDeg * Math.PI) / 180;
    const azimuthRad = (sample.azimuthDeg * Math.PI) / 180;
    const magnitude = Math.cos(altitudeRad);
    return {
      x: sample.x,
      y: sample.y,
      pressure: sample.pressure,
      tiltX: magnitude * Math.cos(azimuthRad),
      tiltY: magnitude * Math.sin(azimuthRad),
      tMs: sample.tMs,
    };
  });
}

interface FrameContext {
  width: number;
  height: number;
  seed: number;
}

interface LayerFrame {
  /** Straight-alpha RGBA8, width*height*4 (pre-composite). */
  frame: Uint8Array;
  warnings: string[];
  centerlineVerbs?: number;
  geometrySamples?: number;
  instances?: number;
}

function requireEngine<T>(engine: T | undefined, stage: string, hint: string): T {
  if (engine === undefined) {
    throw new CompositionExecutionError(stage, `needs ${hint}`);
  }
  return engine;
}

/** Fixed subdivision per fitted segment — determinism over adaptive stepping. */
const CENTERLINE_FLATTEN_STEPS = 16;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Deterministic fixed-step flattening of a fitted centerline PathIR. */
function flattenCenterline(path: PathIR): Array<[number, number]> {
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
        push(lerp(cx, verb.x, t), lerp(cy, verb.y, t));
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

/** Normalized cumulative arc length (0..1) of a point sequence. */
function normalizedArcLengths(
  points: ReadonlyArray<readonly [number, number]>,
): number[] {
  const cumulative: number[] = [0];
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    total += Math.hypot(
      (current?.[0] ?? 0) - (previous?.[0] ?? 0),
      (current?.[1] ?? 0) - (previous?.[1] ?? 0),
    );
    cumulative.push(total);
  }
  if (total === 0) return cumulative.map((_, index) => index / (points.length - 1 || 1));
  return cumulative.map((value) => value / total);
}

/**
 * Carry the source samples' dynamics (pressure, time, velocity, tilt) onto a
 * re-flattened centerline by matching normalized arc-length position. Linear
 * interpolation only — no invented dynamics.
 */
function carryDynamicsOntoCenterline(
  points: ReadonlyArray<readonly [number, number]>,
  source: readonly ModeledSampleIR[],
): ModeledSampleIR[] {
  const sourceU = normalizedArcLengths(
    source.map((sample) => [sample.x, sample.y] as const),
  );
  const targetU = normalizedArcLengths(points);
  let cursor = 0;
  return points.map((point, index) => {
    const u = targetU[index] ?? 0;
    while (cursor < source.length - 2 && (sourceU[cursor + 1] ?? 1) < u) cursor += 1;
    const lower = source[cursor] ?? source[0];
    const upper = source[cursor + 1] ?? lower;
    const lowerU = sourceU[cursor] ?? 0;
    const upperU = sourceU[cursor + 1] ?? 1;
    const span = upperU - lowerU;
    const t = span > 0 ? Math.min(1, Math.max(0, (u - lowerU) / span)) : 0;
    const from = lower as ModeledSampleIR;
    const to = upper as ModeledSampleIR;
    return {
      x: point[0],
      y: point[1],
      tMs: lerp(from.tMs, to.tMs, t),
      pressure: Math.min(1, Math.max(0, lerp(from.pressure, to.pressure, t))),
      velocity: Math.max(0, lerp(from.velocity, to.velocity, t)),
      altitudeDeg: lerp(from.altitudeDeg, to.altitudeDeg, t),
      azimuthDeg: lerp(from.azimuthDeg, to.azimuthDeg, t),
    };
  });
}

interface CenterlineStage {
  samples: readonly ModeledSampleIR[];
  verbs?: number;
}

/**
 * §12.2 "Kurbo centerline": simplify the stabilized centerline into sparse
 * cubics, then re-flatten it (fixed steps) so the outline generator draws on
 * the simplified path. The outline polygon itself is never fitted — see the
 * schema doc for the measured upstream pathology.
 */
function runCenterlineFit(
  layer: CompositionLayerIR,
  geometry: VectorOutlineGeometryIR,
  samples: readonly ModeledSampleIR[],
  engines: CompositionEngines,
): CenterlineStage {
  if (geometry.kurboFitAccuracy === undefined) return { samples };
  const stage = `layer[${layer.id}].geometry[vector-outline:kurbo-centerline]`;
  const vello = requireEngine(
    engines.vello,
    stage,
    "engines.vello with fitPolyline (fitPolylineToPath from studio-engine-vello)",
  );
  const fitPolyline = requireEngine(
    vello.fitPolyline?.bind(vello),
    stage,
    "engines.vello.fitPolyline (fitPolylineToPath from studio-engine-vello)",
  );
  const fitted = fitPolyline(
    samples.map((sample) => [sample.x, sample.y] as const),
    { closed: false, accuracy: geometry.kurboFitAccuracy },
  );
  if (fitted.verbs.length < 2) {
    throw new CompositionExecutionError(
      stage,
      `kurbo fit collapsed the centerline to ${fitted.verbs.length} verbs`,
    );
  }
  const flattened = flattenCenterline(fitted);
  if (flattened.length < 2) {
    throw new CompositionExecutionError(
      stage,
      `flattening the fitted centerline produced ${flattened.length} points`,
    );
  }
  const carried = carryDynamicsOntoCenterline(flattened, samples);
  assertFiniteSamples(stage, carried);
  return { samples: carried, verbs: fitted.verbs.length };
}

function buildVectorOutline(
  layer: CompositionLayerIR,
  geometry: VectorOutlineGeometryIR,
  engineStage: VectorFillEngineIR,
  samples: readonly ModeledSampleIR[],
  context: FrameContext,
): PathIR {
  const stage = `layer[${layer.id}].geometry[vector-outline]`;
  const outlineProgram = brushProgramIRSchema.parse({
    id: `${layer.id}:outline`,
    name: `${layer.id} outline`,
    // Stage 1 owns smoothing — a second stabilizer here would double-smooth.
    stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
    geometry: {
      kind: "perfect-freehand",
      thinning: geometry.thinning,
      smoothing: geometry.smoothing,
      streamline: geometry.streamline,
      capStart: geometry.capStart,
      capEnd: geometry.capEnd,
    },
  });
  const stroke: StrokeIR = {
    id: `${layer.id}:stroke`,
    brushPresetId: layer.id,
    seed: context.seed,
    color: engineStage.color,
    baseSizePx: engineStage.baseSizePx,
    samples: [...samples],
  };
  const outline = strokeOutlinePath(outlineProgram, stroke);
  if (outline.verbs.length < 4) {
    throw new CompositionExecutionError(
      stage,
      `outline collapsed to ${outline.verbs.length} verbs (expected a closed polygon)`,
    );
  }
  return outline;
}

function runVectorFillEngine(
  layer: CompositionLayerIR,
  engineStage: VectorFillEngineIR,
  path: PathIR,
  engines: CompositionEngines,
  context: FrameContext,
): LayerFrame {
  const stage = `layer[${layer.id}].engine[vector-fill]`;
  const vello = requireEngine(
    engines.vello,
    stage,
    "engines.vello (renderSceneToPixels from studio-engine-vello)",
  );
  const scene: SceneIR = {
    version: 11,
    width: context.width,
    height: context.height,
    background: { r: 0, g: 0, b: 0, a: 0 },
    nodes: [
      {
        id: `${layer.id}:fill`,
        kind: "fill-path",
        path,
        paint: { kind: "solid", color: engineStage.color },
        opacity: 1,
        blend: "src-over",
        fillRule: "nonzero",
      },
    ],
  };
  return { frame: vello.renderScene(scene), warnings: [] };
}

function runLibmypaintEngine(
  layer: CompositionLayerIR,
  engineStage: LibmypaintEngineIR,
  samples: readonly RasterStrokeSample[],
  engines: CompositionEngines,
  context: FrameContext,
): LayerFrame {
  const stage = `layer[${layer.id}].engine[libmypaint]`;
  const lmp = requireEngine(
    engines.libmypaint,
    stage,
    "engines.libmypaint (await loadLibMypaint())",
  );
  const result = renderLibMypaintStroke(
    lmp,
    { settings: engineStage.settings },
    {
      width: context.width,
      height: context.height,
      seed: context.seed,
      samples,
    },
  );
  return {
    frame: result.frame,
    warnings: [
      ...result.settings.unknownSettings.map(
        (name) => `${stage} unknown setting: ${name}`,
      ),
      ...result.settings.unknownInputs.map(
        (name) => `${stage} unknown input: ${name}`,
      ),
    ],
  };
}

function runHokusaiEngine(
  layer: CompositionLayerIR,
  engineStage: HokusaiEngineIR,
  samples: readonly RasterStrokeSample[],
  engines: CompositionEngines,
  context: FrameContext,
): LayerFrame {
  const stage = `layer[${layer.id}].engine[hokusai]`;
  const hokusai = requireEngine(
    engines.hokusai,
    stage,
    "engines.hokusai (the initialized studio-hokusai-wasm module)",
  );
  const rasterProgram = brushProgramIRSchema.parse({
    id: `${layer.id}:raster`,
    name: `${layer.id} raster`,
    // Stage 1 owns smoothing: no slow_tracking is synthesized here.
    stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
    sizeDynamics: engineStage.sizeDynamics,
    flowDynamics: engineStage.flowDynamics,
    tip: engineStage.tip,
    mixing: { kind: "none", strength: 0 },
    output: { target: "raster-tiles", bake: "flatten" },
    providerPreference: ["hokusai-natural-media"],
  });
  const compiled = compileRasterBrush(rasterProgram);
  const rendered = renderCompiledBrushStroke(hokusai, compiled, {
    width: context.width,
    height: context.height,
    seed: context.seed,
    samples,
    colorHsv: engineStage.colorHsv,
    ...(engineStage.radiusLog2 !== undefined
      ? { radiusLog2: engineStage.radiusLog2 }
      : {}),
  });
  return {
    frame: rendered.frame,
    warnings: [
      ...compiled.warnings.map((warning) => `${stage} compile: ${warning}`),
      ...compiled.unmapped.map((entry) => `${stage} compile unmapped: ${entry}`),
    ],
  };
}

/** Shape of a row-9..12 provider stage before the vector-fill engine runs. */
interface ProviderStage {
  path: PathIR;
  instances: number;
  warnings: string[];
}

/**
 * Run one of the §12.2 row-9..12 path providers. Each returns a single PathIR
 * that the shared vector-fill engine rasterizes, so the new rows travel the
 * same engine + composite seam as the eight rows that shipped first.
 */
function runPathProvider(
  layer: CompositionLayerIR,
  geometry: Exclude<
    CompositionGeometryStageIR,
    { kind: "vector-outline" } | { kind: "raster-dab" }
  >,
  samples: readonly ModeledSampleIR[],
  engines: CompositionEngines,
  context: FrameContext,
): ProviderStage {
  const stage = `layer[${layer.id}].geometry[${geometry.kind}]`;
  const warnings: string[] = [];
  let produced: { path: PathIR; instances: number };
  switch (geometry.kind) {
    case "pattern-stamp":
      produced = stampPatternAlongPath(samples, {
        motif: geometry.motif,
        spacingPx: geometry.spacingPx,
        sizePx: geometry.sizePx,
        sizePressure: geometry.sizePressure,
        alignToTangent: geometry.alignToTangent,
        phase: geometry.phase,
      });
      break;
    case "particle-splat":
      produced = simulateParticleSplats(samples, {
        emissionSpacingPx: geometry.emissionSpacingPx,
        particlesPerSite: geometry.particlesPerSite,
        lifetimeMs: geometry.lifetimeMs,
        stepMs: geometry.stepMs,
        gravityPxPerMs2: geometry.gravityPxPerMs2,
        drag: geometry.drag,
        speedPxPerMs: geometry.speedPxPerMs,
        speedPressure: geometry.speedPressure,
        radiusPx: geometry.radiusPx,
        radiusPressure: geometry.radiusPressure,
        // Seeded from the execution seed so the whole program stays
        // reproducible while two particle layers stay decorrelated.
        seed: (context.seed * 0x9e3779b1 + geometry.seedSalt) >>> 0,
      });
      break;
    case "ribbon-xpbd":
      produced = solveRibbonStrands(samples, {
        strands: geometry.strands,
        restLengthPx: geometry.restLengthPx,
        iterations: geometry.iterations,
        compliance: geometry.compliance,
        gravityPxPerMs2: geometry.gravityPxPerMs2,
        damping: geometry.damping,
        widthPx: geometry.widthPx,
        widthPressure: geometry.widthPressure,
        taper: geometry.taper,
        substepMs: geometry.substepMs,
      });
      break;
    case "text-on-path": {
      const text = requireEngine(
        engines.text,
        stage,
        "engines.text (shapeTextToGlyphPaths from studio-engine-vello with font bytes bound)",
      );
      let shaped;
      try {
        shaped = layTextOnPath(samples, text, {
          text: geometry.text,
          fontSizePx: geometry.fontSizePx,
          letterSpacingPx: geometry.letterSpacingPx,
          repeat: geometry.repeat,
          alignToTangent: geometry.alignToTangent,
          sizePressure: geometry.sizePressure,
          baselineOffsetPx: geometry.baselineOffsetPx,
        });
      } catch (error) {
        throw new CompositionExecutionError(stage, (error as Error).message);
      }
      if (shaped.lineCount !== 1) {
        warnings.push(
          `${stage} shaper wrapped the run into ${shaped.lineCount} lines; only the laid glyphs are stamped`,
        );
      }
      produced = { path: shaped.path, instances: shaped.instances };
      break;
    }
  }
  if (produced.instances === 0 || produced.path.verbs.length === 0) {
    throw new CompositionExecutionError(
      stage,
      `provider produced ${produced.instances} instances / ${produced.path.verbs.length} verbs — an empty provider is a broken chain, not a fallback`,
    );
  }
  return { path: produced.path, instances: produced.instances, warnings };
}

function runLayer(
  layer: CompositionLayerIR,
  stabilized: readonly ModeledSampleIR[],
  engines: CompositionEngines,
  context: FrameContext,
): LayerFrame {
  let result: LayerFrame;
  if (layer.engine.engine === "vector-fill") {
    if (layer.geometry.kind === "raster-dab") {
      // Unreachable when the program came through the schema (superRefine),
      // but the executor re-checks so a hand-built program fails loudly.
      throw new CompositionExecutionError(
        `layer[${layer.id}].geometry[${layer.geometry.kind}]`,
        "vector-fill requires a path geometry stage",
      );
    }
    if (layer.geometry.kind !== "vector-outline") {
      const provider = runPathProvider(
        layer,
        layer.geometry,
        stabilized,
        engines,
        context,
      );
      const rendered = runVectorFillEngine(
        layer,
        layer.engine,
        provider.path,
        engines,
        context,
      );
      return finalizeLayerFrame(layer, context, {
        ...rendered,
        warnings: [...provider.warnings, ...rendered.warnings],
        instances: provider.instances,
        geometrySamples: stabilized.length,
      });
    }
    const centerline = runCenterlineFit(
      layer,
      layer.geometry,
      stabilized,
      engines,
    );
    const path = buildVectorOutline(
      layer,
      layer.geometry,
      layer.engine,
      centerline.samples,
      context,
    );
    result = {
      ...runVectorFillEngine(layer, layer.engine, path, engines, context),
      ...(centerline.verbs !== undefined ? { centerlineVerbs: centerline.verbs } : {}),
      geometrySamples: centerline.samples.length,
    };
  } else {
    const rasterSamples = toRasterSamples(stabilized);
    result =
      layer.engine.engine === "libmypaint"
        ? runLibmypaintEngine(layer, layer.engine, rasterSamples, engines, context)
        : runHokusaiEngine(layer, layer.engine, rasterSamples, engines, context);
  }
  return finalizeLayerFrame(layer, context, result);
}

/** Shared frame contract: exact byte count and non-empty ink, or a loud stop. */
function finalizeLayerFrame(
  layer: CompositionLayerIR,
  context: FrameContext,
  result: LayerFrame,
): LayerFrame {
  const stage = `layer[${layer.id}].engine[${layer.engine.engine}]`;
  const expectedBytes = context.width * context.height * 4;
  if (result.frame.length !== expectedBytes) {
    throw new CompositionExecutionError(
      stage,
      `frame is ${result.frame.length} bytes, contract requires width*height*4 = ${expectedBytes}`,
    );
  }
  if (countInkedPixels(result.frame) === 0) {
    throw new CompositionExecutionError(
      stage,
      "frame carries zero ink — an empty layer is a broken chain, not a fallback",
    );
  }
  return result;
}

/** Pixels with alpha > 0 in a straight-alpha RGBA8 frame. */
function countInkedPixels(frame: Uint8Array): number {
  let inked = 0;
  for (let offset = 3; offset < frame.length; offset += 4) {
    if ((frame[offset] ?? 0) > 0) inked += 1;
  }
  return inked;
}

/**
 * Deterministic straight-alpha compositing onto an opaque background.
 * With an opaque backdrop the separable blend formula reduces to
 * `result = B(cb, cs) * as + cb * (1 - as)` per channel.
 */
function compositeLayerFrames(
  frames: ReadonlyArray<{ frame: Uint8Array; composite: CompositionCompositeIR }>,
  width: number,
  height: number,
  background: { r: number; g: number; b: number },
): Uint8Array {
  const pixelCount = width * height;
  const canvas = new Float64Array(pixelCount * 3);
  for (let at = 0; at < pixelCount; at += 1) {
    canvas[at * 3] = background.r;
    canvas[at * 3 + 1] = background.g;
    canvas[at * 3 + 2] = background.b;
  }
  for (const { frame, composite } of frames) {
    for (let at = 0; at < pixelCount; at += 1) {
      const base = at * 4;
      const alpha = ((frame[base + 3] ?? 0) / 255) * composite.opacity;
      if (alpha === 0) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const cb = canvas[at * 3 + channel] ?? 0;
        const cs = (frame[base + channel] ?? 0) / 255;
        const blended = composite.blend === "multiply" ? cb * cs : cs;
        canvas[at * 3 + channel] = blended * alpha + cb * (1 - alpha);
      }
    }
  }
  const pixels = new Uint8Array(pixelCount * 4);
  for (let at = 0; at < pixelCount; at += 1) {
    pixels[at * 4] = Math.round((canvas[at * 3] ?? 0) * 255);
    pixels[at * 4 + 1] = Math.round((canvas[at * 3 + 1] ?? 0) * 255);
    pixels[at * 4 + 2] = Math.round((canvas[at * 3 + 2] ?? 0) * 255);
    pixels[at * 4 + 3] = 255;
  }
  return pixels;
}

/**
 * Execute one composition brush program: stabilize once, run every layer's
 * geometry → engine chain on the shared stabilized samples, then composite
 * the layer frames in declared order. Deterministic; loud on broken stages.
 */
export function executeCompositionProgram(
  program: CompositionProgramIR,
  strokeInput: readonly ModeledSampleIR[],
  engines: CompositionEngines,
  options: ExecuteCompositionOptions = {},
): ExecuteCompositionResult {
  const normalized = compositionProgramIRSchema.parse(program);
  const context: FrameContext = {
    width: Math.max(16, Math.floor(options.width ?? BRUSH_PREVIEW_DEFAULTS.width)),
    height: Math.max(
      16,
      Math.floor(options.height ?? BRUSH_PREVIEW_DEFAULTS.height),
    ),
    seed: options.seed ?? BRUSH_PREVIEW_DEFAULTS.seed,
  };
  const background = options.background ?? { r: 1, g: 1, b: 1 };

  const stabilized = runInputStage(normalized.input, strokeInput, engines);

  const layerFrames: Array<{
    frame: Uint8Array;
    composite: CompositionCompositeIR;
  }> = [];
  const layerReports: CompositionLayerReport[] = [];
  const warnings: string[] = [];
  if (engines.surface !== undefined) {
    // The seam exists, the consumer does not (see
    // UNAVAILABLE_COMPOSITION_ROWS). Injecting it must not look like it
    // worked — report the no-op instead of swallowing it.
    warnings.push(
      "engines.surface: no geometry stage consumes the 3D surface provider yet " +
        "(§12.2 '3D 표면 브러시' stays unavailable) — the injection is a no-op",
    );
  }
  for (const layer of normalized.layers) {
    const rendered = runLayer(layer, stabilized, engines, context);
    layerFrames.push({ frame: rendered.frame, composite: layer.composite });
    layerReports.push({
      id: layer.id,
      geometry: layer.geometry.kind,
      engine: layer.engine.engine,
      inkedPixels: countInkedPixels(rendered.frame),
      ...(rendered.centerlineVerbs !== undefined
        ? { centerlineVerbs: rendered.centerlineVerbs }
        : {}),
      ...(rendered.geometrySamples !== undefined
        ? { geometrySamples: rendered.geometrySamples }
        : {}),
      ...(rendered.instances !== undefined ? { instances: rendered.instances } : {}),
    });
    warnings.push(...rendered.warnings);
  }

  return {
    pixels: compositeLayerFrames(
      layerFrames,
      context.width,
      context.height,
      background,
    ),
    width: context.width,
    height: context.height,
    input: {
      backend: normalized.input.backend,
      inSamples: strokeInput.length,
      outSamples: stabilized.length,
    },
    layers: layerReports,
    warnings,
  };
}

/** Human-readable chain summary for goldens/reports. */
export function describeCompositionChain(program: CompositionProgramIR): string {
  const layers = program.layers
    .map((layer) => {
      const geometry =
        layer.geometry.kind === "vector-outline" &&
        layer.geometry.kurboFitAccuracy !== undefined
          ? "kurbo-centerline+vector-outline"
          : layer.geometry.kind;
      return `${layer.id}: ${geometry} → ${layer.engine.engine} → ${layer.composite.blend}@${layer.composite.opacity}`;
    })
    .join(" | ");
  return `${program.input.backend} → [${layers}]`;
}

// ---------------------------------------------------------------------------
// §12.2 preset constants (문서 조합명 그대로)
// ---------------------------------------------------------------------------

/** Every §12.2 row name, verbatim, in document order. */
export const V12_SECTION_12_2_ROW_NAMES: readonly string[] = [
  "G펜·매핑펜",
  "캘리그래피",
  "모노라인·기술펜",
  "연필·샤프",
  "색연필·목탄",
  "수채·수묵",
  "유화·과슈",
  "스머지·믹서",
  "장식·패턴",
  "파티클",
  "리본·헤어·로프",
  "텍스트 브러시",
  "3D 표면 브러시",
];

function defineComposition(program: CompositionProgramIR): CompositionProgramIR {
  return compositionProgramIRSchema.parse(program);
}

const pressureCurve = (min: number, max: number) => ({
  input: "pressure" as const,
  curve: [0, 1],
  min,
  max,
});

/**
 * The 장식·패턴 preset motif, as SVG path data — a five-point star inscribed
 * in the unit circle (y-down, tip up). Kept as the authored source of truth so
 * the SVG lane (`parseSvgToScene`, studio-format-gateway) and the composition
 * preset can be proven to agree verb-for-verb.
 */
export const PATTERN_STAR_MOTIF_SVG_PATH_DATA =
  "M 0 -1 L 0.22452 -0.30902 L 0.95106 -0.30902 L 0.36327 0.11803 " +
  "L 0.58779 0.80902 L 0 0.38197 L -0.58779 0.80902 L -0.36327 0.11803 " +
  "L -0.95106 -0.30902 L -0.22452 -0.30902 Z";

/** {@link PATTERN_STAR_MOTIF_SVG_PATH_DATA} lifted into PathIR. */
export const PATTERN_STAR_MOTIF: PathIR = {
  verbs: [
    { v: "M", x: 0, y: -1 },
    { v: "L", x: 0.22452, y: -0.30902 },
    { v: "L", x: 0.95106, y: -0.30902 },
    { v: "L", x: 0.36327, y: 0.11803 },
    { v: "L", x: 0.58779, y: 0.80902 },
    { v: "L", x: 0, y: 0.38197 },
    { v: "L", x: -0.58779, y: 0.80902 },
    { v: "L", x: -0.36327, y: 0.11803 },
    { v: "L", x: -0.95106, y: -0.30902 },
    { v: "L", x: -0.22452, y: -0.30902 },
    { v: "Z" },
  ],
};

/**
 * §12.2 rows whose stage providers are all shipped, realized as composition
 * programs. `lane` records which document column the preset follows;
 * `laneNote` names every substitution or omitted optional provider.
 */
export const COMPOSITION_PRESETS: readonly CompositionProgramIR[] = [
  defineComposition({
    id: "g-pen-mapping-pen",
    name: "G펜·매핑펜",
    lane: "studio-max",
    laneNote:
      "Google Ink model (ink-stroke-modeler) + Kurbo centerline fit + Vello composite; " +
      "the ink mesh tessellator is not shipped, so the outline comes from the " +
      "perfect-freehand generator on the ink-modeled samples.",
    input: { backend: "ink-stroke-modeler", strength: 0, predictionMs: 0 },
    layers: [
      {
        id: "nib",
        geometry: {
          kind: "vector-outline",
          thinning: 0.72,
          smoothing: 0.35,
          streamline: 0.3,
          capStart: true,
          capEnd: true,
          kurboFitAccuracy: 0.35,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0.05, g: 0.05, b: 0.08, a: 1 },
          baseSizePx: 7,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "calligraphy",
    name: "캘리그래피",
    lane: "studio-max",
    laneNote:
      "Google Ink BrushBehavior tilt/twist is not shipped — the ink stroke " +
      "modeler drives the input stage instead; multi-coat is realized as two " +
      "composite layers; CanvasKit stable renderer substituted by Vello CPU.",
    input: { backend: "ink-stroke-modeler", strength: 0, predictionMs: 0 },
    layers: [
      {
        id: "coat",
        geometry: {
          kind: "vector-outline",
          thinning: 0.25,
          smoothing: 0.6,
          streamline: 0.5,
          capStart: true,
          capEnd: true,
          kurboFitAccuracy: 0.5,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0.12, g: 0.16, b: 0.38, a: 0.55 },
          baseSizePx: 12,
        },
        composite: { blend: "multiply", opacity: 0.85 },
      },
      {
        id: "core",
        geometry: {
          kind: "vector-outline",
          thinning: 0.55,
          smoothing: 0.45,
          streamline: 0.4,
          capStart: true,
          capEnd: true,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0.05, g: 0.06, b: 0.16, a: 1 },
          baseSizePx: 6,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "monoline-technical-pen",
    name: "모노라인·기술펜",
    lane: "studio-max",
    laneNote:
      "Kurbo fit + Vello Classic; thinning 0 keeps the width pressure-free " +
      "by design (technical pen).",
    input: { backend: "ema", strength: 0.2, predictionMs: 0 },
    layers: [
      {
        id: "line",
        geometry: {
          kind: "vector-outline",
          thinning: 0,
          smoothing: 0.5,
          streamline: 0.5,
          capStart: true,
          capEnd: true,
          kurboFitAccuracy: 0.35,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0, g: 0, b: 0, a: 1 },
          baseSizePx: 5,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "pencil-mechanical",
    name: "연필·샤프",
    lane: "stable",
    laneNote:
      "Graphite/CanvasKit raster challenger + paper material are not shipped; " +
      "the stable path runs on the Hokusai challenger raster engine.",
    input: { backend: "ema", strength: 0.3, predictionMs: 0 },
    layers: [
      {
        id: "graphite",
        geometry: { kind: "raster-dab" },
        engine: {
          engine: "hokusai",
          sizeDynamics: [pressureCurve(0.35, 1)],
          flowDynamics: [pressureCurve(0.2, 0.85)],
          tip: { kind: "round", hardness: 0.85, spacingPct: 4, angleJitterDeg: 0 },
          colorHsv: [0, 0, 0.25],
          radiusLog2: 1.6,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "colored-pencil-charcoal",
    name: "색연필·목탄",
    lane: "studio-max",
    laneNote:
      "libmypaint/Hokusai dynamics realized on Hokusai; spectral pigment and " +
      "paper material providers are not shipped; the Vello texture composite " +
      "column is realized by the composite stage (multiply coat + grain).",
    input: { backend: "ema", strength: 0.35, predictionMs: 0 },
    layers: [
      {
        id: "base",
        geometry: { kind: "raster-dab" },
        engine: {
          engine: "hokusai",
          sizeDynamics: [pressureCurve(0.5, 1)],
          flowDynamics: [pressureCurve(0.15, 0.6)],
          tip: { kind: "round", hardness: 0.3, spacingPct: 5, angleJitterDeg: 0 },
          colorHsv: [0.08, 0.55, 0.45],
          radiusLog2: 2.2,
        },
        composite: { blend: "multiply", opacity: 0.9 },
      },
      {
        id: "grain",
        geometry: { kind: "raster-dab" },
        engine: {
          engine: "hokusai",
          sizeDynamics: [pressureCurve(0.3, 0.9)],
          flowDynamics: [pressureCurve(0.2, 0.7)],
          tip: { kind: "round", hardness: 0.7, spacingPct: 3.5, angleJitterDeg: 0 },
          colorHsv: [0.08, 0.6, 0.3],
          radiusLog2: 1.5,
        },
        composite: { blend: "src-over", opacity: 0.85 },
      },
    ],
  }),
  defineComposition({
    id: "watercolor-ink-wash",
    name: "수채·수묵",
    lane: "studio-max",
    laneNote:
      "libmypaint injection lane; the optional ToonWet compute extension is " +
      "not applied; Vello final composite realized by the composite stage.",
    input: { backend: "spring", strength: 0.5, predictionMs: 0 },
    layers: [
      {
        id: "wash",
        geometry: { kind: "raster-dab" },
        engine: {
          engine: "libmypaint",
          settings: {
            radius_logarithmic: {
              base_value: 2.5,
              inputs: { pressure: [[0, -0.4], [1, 0.35]] },
            },
            opaque: { base_value: 0.55, inputs: {} },
            opaque_multiply: {
              base_value: 0,
              inputs: { pressure: [[0, 0.1], [1, 1]] },
            },
            hardness: { base_value: 0.25, inputs: {} },
            dabs_per_actual_radius: { base_value: 4, inputs: {} },
            smudge: { base_value: 0.3, inputs: {} },
            smudge_length: { base_value: 0.5, inputs: {} },
            color_h: { base_value: 0.58, inputs: {} },
            color_s: { base_value: 0.65, inputs: {} },
            color_v: { base_value: 0.55, inputs: {} },
          },
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "oil-gouache",
    name: "유화·과슈",
    lane: "studio-max",
    laneNote:
      "libmypaint pickup/deposit (smudge chain); the optional viscosity/height " +
      "field extension is not shipped.",
    input: { backend: "spring", strength: 0.45, predictionMs: 0 },
    layers: [
      {
        id: "paint",
        geometry: { kind: "raster-dab" },
        engine: {
          engine: "libmypaint",
          settings: {
            radius_logarithmic: {
              base_value: 2.3,
              inputs: { pressure: [[0, -0.25], [1, 0.25]] },
            },
            opaque: { base_value: 0.95, inputs: {} },
            opaque_multiply: {
              base_value: 0,
              inputs: { pressure: [[0, 0.35], [1, 1]] },
            },
            hardness: { base_value: 0.55, inputs: {} },
            dabs_per_actual_radius: { base_value: 6, inputs: {} },
            smudge: { base_value: 0.55, inputs: {} },
            smudge_length: { base_value: 0.65, inputs: {} },
            color_h: { base_value: 0.07, inputs: {} },
            color_s: { base_value: 0.78, inputs: {} },
            color_v: { base_value: 0.62, inputs: {} },
          },
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "smudge-mixer",
    name: "스머지·믹서",
    lane: "studio-max",
    laneNote:
      "Cross-engine multi-layer: a Hokusai base coat mixed by a " +
      "libmypaint smudge pass; multi-layer texture references are not " +
      "shipped — the composite stage layers the two engine frames instead.",
    input: { backend: "ema", strength: 0.3, predictionMs: 0 },
    layers: [
      {
        id: "base",
        geometry: { kind: "raster-dab" },
        engine: {
          engine: "hokusai",
          sizeDynamics: [pressureCurve(0.6, 1)],
          flowDynamics: [pressureCurve(0.3, 0.8)],
          tip: { kind: "round", hardness: 0.25, spacingPct: 6, angleJitterDeg: 0 },
          colorHsv: [0.6, 0.5, 0.6],
          radiusLog2: 2.4,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
      {
        id: "mix",
        geometry: { kind: "raster-dab" },
        engine: {
          engine: "libmypaint",
          settings: {
            radius_logarithmic: { base_value: 2.4, inputs: {} },
            opaque: { base_value: 0.65, inputs: {} },
            opaque_multiply: {
              base_value: 0,
              inputs: { pressure: [[0, 0.2], [1, 1]] },
            },
            hardness: { base_value: 0.4, inputs: {} },
            dabs_per_actual_radius: { base_value: 4, inputs: {} },
            smudge: { base_value: 0.9, inputs: {} },
            smudge_length: { base_value: 0.85, inputs: {} },
            color_h: { base_value: 0.02, inputs: {} },
            color_s: { base_value: 0.7, inputs: {} },
            color_v: { base_value: 0.5, inputs: {} },
          },
        },
        composite: { blend: "src-over", opacity: 0.9 },
      },
    ],
  }),
  defineComposition({
    id: "decoration-pattern",
    name: "장식·패턴",
    lane: "studio-max",
    laneNote:
      "Arc-length pattern stamping (./composition-providers stampPatternAlongPath) " +
      "on the stabilized centerline, rendered by Vello CPU. The motif is a plain " +
      "PathIR, which is exactly what studio-format-gateway's SVG lane " +
      "(parseSvgToScene) yields — see PATTERN_STAR_MOTIF_SVG_PATH_DATA. The " +
      "ThorVG/CanvasKit recording-and-replay stamp caches are not shipped; each " +
      "instance is an affine image of the motif path instead.",
    input: { backend: "ema", strength: 0.3, predictionMs: 0 },
    layers: [
      {
        id: "trail",
        geometry: {
          kind: "pattern-stamp",
          motif: PATTERN_STAR_MOTIF,
          // Sites sit just under the smallest stamp (sizePx × (1 −
          // sizePressure) = 5.4 px vs 6 px spacing) so the trail never breaks
          // into a comb of gaps — a comb makes column ink mass measure the
          // stamp phase instead of the pressure (measured on the §12.2 ramp:
          // r = 0.74 at 7 px spacing / 13 px stamps, r = 0.92 here). Stamps
          // stay individually legible at the low-pressure end and merge into
          // a dense spiked trail at the high end, which is the point of the
          // row.
          spacingPx: 6,
          sizePx: 18,
          sizePressure: 0.7,
          alignToTangent: true,
          phase: 0,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0.42, g: 0.1, b: 0.36, a: 1 },
          baseSizePx: 8,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "particle-spray",
    name: "파티클",
    lane: "stable",
    laneNote:
      "Deterministic CPU reference of the particle lane " +
      "(./composition-providers simulateParticleSplats): fixed arc-length " +
      "emission, fixed-step semi-implicit integration with gravity + linear " +
      "drag, seeded mulberry32 jitter. The WGSL compute lane is NOT shipped " +
      "for particles (studio-engine-registry wgsl-variants covers filter ops " +
      "only) — this reference is what a GPU port must reproduce bit-for-bit.",
    input: { backend: "spring", strength: 0.4, predictionMs: 0 },
    layers: [
      {
        id: "spray",
        geometry: {
          kind: "particle-splat",
          // Emission density is a QUALITY parameter here, not a performance
          // knob: a spray is stochastic, so column ink mass only tracks
          // pressure once each column averages enough splats. Measured on the
          // §12.2 ramp (sweep over spacing × count × radius × speed):
          // 2 px / 3 per site → r = 0.60, 1 px / 8 → r = 0.92,
          // 0.5 px / 8 → r = 0.96. The last one is what ships.
          emissionSpacingPx: 0.5,
          particlesPerSite: 8,
          lifetimeMs: 110,
          stepMs: 8,
          gravityPxPerMs2: 0.0012,
          drag: 0.02,
          speedPxPerMs: 0.3,
          speedPressure: 0.4,
          radiusPx: 1.6,
          radiusPressure: 0.85,
          seedSalt: 0,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0.08, g: 0.28, b: 0.5, a: 1 },
          baseSizePx: 4,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "ribbon-hair-rope",
    name: "리본·헤어·로프",
    lane: "studio-max",
    laneNote:
      "XPBD guide-curve solver (./composition-providers solveRibbonStrands): the " +
      "stroke pins the kinematic head, the trailing chain is projected with " +
      "compliant distance constraints and each node paints one lagging ribbon. " +
      "Pure math, no dependency; the GPU strand tessellator is not shipped, so " +
      "the ribbons are polygon offsets rendered by Vello CPU.",
    input: { backend: "ema", strength: 0.25, predictionMs: 0 },
    layers: [
      {
        id: "strands",
        geometry: {
          kind: "ribbon-xpbd",
          strands: 5,
          restLengthPx: 4,
          iterations: 8,
          // Rigid rope: the strands keep their length, only their pose lags.
          compliance: 0,
          // Gravity dominates the head's drag so the chain HANGS from the pen
          // instead of trailing behind it. A trailing chain shifts every
          // strand backwards in x, which detaches ink mass from the pressure
          // that produced it (measured on the §12.2 ramp: r = 0.76 at
          // g = 0.0016, r = 0.998 at g = 0.02).
          gravityPxPerMs2: 0.02,
          damping: 0.08,
          widthPx: 5,
          widthPressure: 0.8,
          taper: 0.55,
          substepMs: 6,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0.1, g: 0.34, b: 0.22, a: 1 },
          baseSizePx: 6,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
  defineComposition({
    id: "text-brush",
    name: "텍스트 브러시",
    lane: "studio-max",
    laneNote:
      "Parley glyph-run shaper (studio-engine-vello shapeTextToGlyphPaths, " +
      "injected as engines.text and cacheable through shapeTextCached) laid on " +
      "the brush path by arc length (./composition-providers layTextOnPath): " +
      "font-metric advances become arc offsets, glyphs rotate onto the tangent " +
      "and scale with pressure. CanvasKit Paragraph is not used; glyph outlines " +
      "are filled by Vello CPU.",
    input: { backend: "ema", strength: 0.3, predictionMs: 0 },
    layers: [
      {
        id: "run",
        geometry: {
          kind: "text-on-path",
          text: "TOON",
          fontSizePx: 15,
          letterSpacingPx: 1.5,
          repeat: true,
          alignToTangent: true,
          sizePressure: 0.7,
          baselineOffsetPx: 5,
        },
        engine: {
          engine: "vector-fill",
          color: { r: 0.12, g: 0.12, b: 0.14, a: 1 },
          baseSizePx: 6,
        },
        composite: { blend: "src-over", opacity: 1 },
      },
    ],
  }),
];

export interface UnavailableCompositionRow {
  /** §12.2 row name verbatim. */
  name: string;
  /** The provider(s) neither §12.2 column can run on shipped parts. */
  missing: string;
}

/**
 * §12.2 rows that cannot be composed yet because a required provider is not
 * reachable from this package — recorded explicitly instead of approximated.
 * Rows 9–12 (장식·패턴 / 파티클 / 리본·헤어·로프 / 텍스트 브러시) moved out of
 * this list when their providers shipped in ./composition-providers.
 */
export const UNAVAILABLE_COMPOSITION_ROWS: readonly UnavailableCompositionRow[] = [
  {
    name: "3D 표면 브러시",
    missing:
      "Three.js hit/UV projection + texture paint provider reachable from packages/. " +
      "The provider EXISTS but on the app side of the layering boundary: " +
      "src/domains/creator/studio-vrm-texture-uv.ts (computeStudioVrmBarycentric, " +
      "resolveStudioVrmTriangleUv, resolveStudioVrmTextureHit) and " +
      "studio-vrm-texture-paint-ops.ts (applyStudioVrmTexturePaintOp, the 2D dab " +
      "engine reused on the UV atlas). packages/* must not import src/*, so the " +
      "composition executor only declares the injection seam " +
      "(SurfaceProjectionProvider, CompositionEngines.surface); wiring it needs a " +
      "package-facing adapter published from the app layer.",
  },
];
