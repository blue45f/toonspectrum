/**
 * Living-ink settled BAKE v1 — 정착(커밋) 시점에 CPU 유체 레퍼런스로 획을 "말리는" 증강 패스.
 *
 * The repo carries a complete deterministic stable-fluids reference
 * (studio-living-ink-wgsl-shaders.ts, READ-ONLY — the certified CPU twin of the WebGL2/WebGPU
 * living-ink engine). Product admission for page-wide physical strokes is OFF
 * (studio-living-ink-brush-admission.ts), so this module reuses the verified solver in the one
 * place it fits today's document model: a **stroke-local, settled-only bake** that augments an
 * ordinary ink/watercolor dab plan and then disappears — no full-page raster, no journal, no
 * worker, no new render primitive.
 *
 * Pipeline (pure function of the dab plan + settings):
 *   1. Seed a stroke-local coarse fluid: every dab deposits pigment+water (the reference `splat`
 *      Gaussian) and every dab injects a radial capillary impulse (a wet mark physically pushes
 *      water outward — the GLSL deposit shader's `radialVector`) plus a drag impulse along the
 *      travel direction (the brush pulls the wet film with it). Opacity is the pressure proxy —
 *      the planners fold pressure into station opacity, and the dab contract carries no pressure.
 *   2. Run a FIXED number of solver ticks (see STUDIO_LIVING_INK_SETTLED_BAKE_STEPS).
 *   3. Lower the settled pigment field back into the dab plan as per-dab augmentation:
 *      bleed offsets (halo centres drift with the local flow + pigment centroid), rim density
 *      modulation (coffee-ring alpha gain where pigment migrated outward OR where the wet front
 *      crept past the pigment and will pin while drying) and feather extras — along the local
 *      flow when a coherent current survives projection, isotropic around still washes. Same
 *      dab-in/dab-out contract as `augmentStudioWetEdgeBloomDabs`, so Canvas and SVG agree
 *      automatically at the shared planner level.
 *
 * SETTLED-ONLY GATE: the fluid field is a global function of the whole stroke, so augmenting a
 * prefix does NOT yield a prefix of the augmented full stroke (unlike wet-edge-bloom). The
 * causal walker's live prefix discipline therefore forbids running the bake mid-stroke. The
 * `phase` setting fail-closes this: anything except an explicit `"settled"` returns the exact
 * input reference, so a mis-wired live call can never move already-visible pigment. Live strokes
 * render the base lane material; the bloom lands when the stroke settles — which is also what
 * physical wet-in-wet does while drying.
 *
 * Determinism: the solve is pure float arithmetic over the dab plan; the only stochastic values
 * (feather jitter) come from studioOssUnitHash. No Math.random, no Date.now.
 */

import {
  STUDIO_LIVING_INK_EXECUTION_LIMITS,
  STUDIO_LIVING_INK_FLUID_DEFAULTS,
} from "./studio-living-ink-execution-protocol";
import {
  createStudioLivingInkFluidReference,
  depositStudioLivingInkReference,
  stepStudioLivingInkFluidReference,
  type StudioLivingInkFluidReferenceField,
} from "./studio-living-ink-wgsl-shaders";
import { studioOssUnitHash } from "./studio-oss-brush-kernels";

import type { WatercolorBrushDab } from "./studio-watercolor-brush";

export const STUDIO_LIVING_INK_SETTLED_BAKE_VERSION_V1 = 1 as const;

export const STUDIO_LIVING_INK_SETTLED_BAKE_PROVENANCE = Object.freeze({
  solver:
    "repo-internal certified CPU stable-fluids reference (studio-living-ink-wgsl-shaders.ts) — no new fluid was invented",
  radialImpulse:
    "living-ink GLSL deposit radialVector semantics — a dwell water mark injects divergent capillary outflow",
  chroma:
    "InkWash §06 chromatography multipliers as shipped by the reference solver",
} as const);

/**
 * Fixed solver tick count. 24 is chosen against the engine's own constants, not convergence:
 * - 24 ticks = 0.4 s at the canonical 1/60 s step — squarely inside the bloom-forming transport
 *   phase and far inside the 2 s minimum dry window, so the bake reads as settled wet-in-wet
 *   rather than a fully dried-down wash.
 * - Velocity decays geometrically (retention exp(-dt·(3−2.35·flow)) ≈ 0.975/tick at program
 *   flows): the first 24 ticks carry ≈46% of all transport a dab impulse will EVER do, the next
 *   24 add ≈25%, the next ≈12% — each doubling of cost buys about half the previous motion.
 * - A fixed count keeps the bake a pure function of the stroke; a residual-driven loop would make
 *   byte output depend on float-noise thresholds (and the protocol warns against chasing the
 *   residual curve, because over-projection deletes the capillary outflow that hollows a dab).
 */
export const STUDIO_LIVING_INK_SETTLED_BAKE_STEPS = 24 as const;

/**
 * Stroke-local grid budget. The workstream caps are velocity ≤128 short side and pigment ≤384;
 * both constants sit deliberately below them so a 2000-dab settled bake stays under its 120 ms
 * budget on the CPU reference solver (fine cells dominate the per-tick cost):
 * - fine (pigment/wet) long side 160, cell-count cap 9 000 (blob-shaped strokes coarsen instead
 *   of exploding, mirroring the impasto grid discipline);
 * - coarse (velocity/pressure) target 40 on the long edge — the protocol's 2/4/8 snap keeps the
 *   realized coarse grid ≤ 96, well under the 128 cap.
 */
export const STUDIO_LIVING_INK_SETTLED_BAKE_GRID = Object.freeze({
  fineLongSide: 160,
  fineMaxCells: 9_000,
  fineMinSide: 16,
  coarseBase: 40,
  velocityShortSideCap: 128,
  pigmentLongSideCap: 384,
} as const);

const TAU = Math.PI * 2;
const MIN_DAB_RADIUS = 0.05;
const AUGMENTED_OPACITY_MAX = 0.95;
const MIN_VISIBLE_EXTRA_OPACITY = 0.002;

/** Grid padding: pigment must never reach the walls, or clamped sampling piles it up. */
const GRID_PAD_RADIUS_RATIO = 1.9;
const GRID_PAD_MIN_PX = 2;

/** Core deposit: pigment-heavy, moderately wet (ink sits where it was laid). */
const CORE_DEPOSIT_AMOUNT = 0.85;
const CORE_DEPOSIT_WET = 0.9;
const CORE_COLOR = Object.freeze([0.16, 0.13, 0.11] as const);
/** Halo deposit: water-heavy, pigment-light (the wash carries the water load). */
const HALO_DEPOSIT_AMOUNT = 1;
const HALO_DEPOSIT_WET = 1.35;
const HALO_COLOR = Object.freeze([0.02, 0.02, 0.02] as const);

/** Dwell outflow / travel drag impulse strengths, uv/s at pressure proxy 1. */
const RADIAL_IMPULSE_UV = 0.35;
const DRAG_IMPULSE_UV = 0.5;
/** Impulse footprint, in dab radii on the coarse grid. */
const IMPULSE_REACH_RADII = 1.5;

/**
 * Rim signal calibration. Two channels, max-combined:
 * - pigment migration: a fresh Gaussian deposit sits at rim/centre ≈ 0.31; only genuinely
 *   transported pigment (strong flow) exceeds the 0.45 neutral. The solver's transport is a
 *   relaxation blend capped at pigmentTransportCeiling, so in 24 ticks this channel fires on
 *   flow-driven strokes, not on still dwells.
 * - wet front: capillary creep advances the water front much faster than pigment (front-advance
 *   has no transport ceiling), and the drying ring forms exactly where water outruns pigment and
 *   later pins while drying. Measured dwell-tap wet rim/centre after 24 ticks ≈ 0.43 against a
 *   fresh-deposit ≈ 0.3, hence neutral 0.3 / span 0.45.
 */
const RIM_NEUTRAL_RATIO = 0.45;
const RIM_RATIO_SPAN = 0.55;
const WET_RING_NEUTRAL_RATIO = 0.3;
const WET_RING_RATIO_SPAN = 0.45;
const RIM_CENTRE_RADIUS_RATIO = 0.55;
const RIM_ANNULUS_INNER_RATIO = 0.85;
const RIM_ANNULUS_OUTER_RATIO = 1.3;

/** Halo drift shaping: flow term (mid-stroke downstream bias) + pigment centroid term. */
const DRIFT_FLOW_RADIUS_RATIO = 0.3;
const DRIFT_CENTROID_GAIN = 0.6;
const MAX_SHIFT_RADIUS_RATIO = 0.5;
/** Flow speeds saturating the flow-drift response, uv/s. */
const FLOW_RESPONSE_REF_UV = 0.25;
/** Below this flow speed there is no coherent current to feather along. */
const FLOW_MIN_UV = 0.004;

const FEATHER_ALPHA_RATIO = 0.24;
const FEATHER_ALPHA_DECAY = 0.62;
const FEATHER_DISTANCE_BASE_RATIO = 1.05;
const FEATHER_DISTANCE_STEP_RATIO = 0.45;
const FEATHER_RADIUS_BASE_RATIO = 0.42;
const FEATHER_RADIUS_STEP_RATIO = 0.12;
/** Fan half-angle jitter (rad) keeps feathers a plume, not a ray. */
const FEATHER_FAN_RAD = 0.9;

const SALT_FEATHER_ANGLE = 0x0ba1_ce17;
const SALT_FEATHER_DISTANCE = 0x2f00_c0a1;

export const STUDIO_LIVING_INK_SETTLED_BAKE_RANGES = Object.freeze({
  strength: Object.freeze({ min: 0, max: 1 }),
  rimGain: Object.freeze({ min: 0, max: 2 }),
  featherCount: Object.freeze({ min: 0, max: 4 }),
  maxExtraDabs: Object.freeze({ min: 0, max: 32_768 }),
  axis: Object.freeze({ min: 0, max: 1 }),
} as const);

export const STUDIO_LIVING_INK_SETTLED_BAKE_DEFAULTS = Object.freeze({
  seed: 1,
  phase: "live",
  strength: 0.85,
  rimGain: 1.15,
  featherCount: 3,
  maxExtraDabs: STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.maxExtraDabs.max,
  flow: 0.62,
  bleed: 0.5,
  dryRate: 0.35,
  vorticity: 0.4,
  capillaryCreep: 0.55,
  chromaticSeparation: 0,
} as const);

export type StudioLivingInkSettledBakePhase = "live" | "settled";

export interface StudioLivingInkSettledBakeSettings {
  /** Stroke-stable seed (e.g. `watercolorBrushSeedFromKey(element.id)`), never wall-clock. */
  readonly seed: number;
  /**
   * Fail-closed prefix-safety gate. The bake is a global pass over the whole stroke, so it runs
   * ONLY when the caller asserts the stroke is settled; the default (`"live"`) is exact identity.
   */
  readonly phase: StudioLivingInkSettledBakePhase;
  /** Master bleed gain: scales halo drift and feather alpha. 0 disables displacement. */
  readonly strength: number;
  /** Rim (coffee-ring) alpha gain against the measured outward pigment migration. */
  readonly rimGain: number;
  /** Feather dabs emitted along the local flow per station (int 0..4). */
  readonly featherCount: number;
  /** Safety ceiling for appended dabs; shaped originals are never dropped. */
  readonly maxExtraDabs: number;
  /** Fluid material axes consumed verbatim by the reference solver (all 0..1). */
  readonly flow: number;
  readonly bleed: number;
  readonly dryRate: number;
  readonly vorticity: number;
  readonly capillaryCreep: number;
  readonly chromaticSeparation: number;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function clampAugmentedOpacity(value: number): number {
  return clamp(value, 0, AUGMENTED_OPACITY_MAX);
}

function axis01(value: unknown, fallback: number): number {
  return clamp01(finiteNumber(value, fallback));
}

export function normalizeStudioLivingInkSettledBakeSettings(
  input?: Partial<StudioLivingInkSettledBakeSettings> | null,
): StudioLivingInkSettledBakeSettings {
  const source = input && typeof input === "object" ? input : {};
  const defaults = STUDIO_LIVING_INK_SETTLED_BAKE_DEFAULTS;
  return {
    seed: Math.floor(finiteNumber(source.seed, defaults.seed)) | 0,
    // 알 수 없는 phase 는 조용히 live(항등)로 fail-closed 한다.
    phase: source.phase === "settled" ? "settled" : "live",
    strength: clamp(
      finiteNumber(source.strength, defaults.strength),
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.strength.min,
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.strength.max,
    ),
    rimGain: clamp(
      finiteNumber(source.rimGain, defaults.rimGain),
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.rimGain.min,
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.rimGain.max,
    ),
    featherCount: Math.floor(clamp(
      finiteNumber(source.featherCount, defaults.featherCount),
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.featherCount.min,
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.featherCount.max,
    )),
    maxExtraDabs: Math.floor(clamp(
      finiteNumber(source.maxExtraDabs, defaults.maxExtraDabs),
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.maxExtraDabs.min,
      STUDIO_LIVING_INK_SETTLED_BAKE_RANGES.maxExtraDabs.max,
    )),
    flow: axis01(source.flow, defaults.flow),
    bleed: axis01(source.bleed, defaults.bleed),
    dryRate: axis01(source.dryRate, defaults.dryRate),
    vorticity: axis01(source.vorticity, defaults.vorticity),
    capillaryCreep: axis01(source.capillaryCreep, defaults.capillaryCreep),
    chromaticSeparation: axis01(
      source.chromaticSeparation,
      defaults.chromaticSeparation,
    ),
  };
}

/**
 * True when the normalized settings cannot change any dab — callers may skip the whole solve.
 * The live phase is identity by contract; with every augmentation channel at zero the settled
 * solve could not move a byte either, so it is skipped too.
 */
export function isStudioLivingInkSettledBakeIdentitySettings(
  settings: StudioLivingInkSettledBakeSettings,
): boolean {
  return settings.phase !== "settled"
    || (settings.strength === 0
      && settings.rimGain === 0
      && settings.featherCount === 0);
}

// ---------------------------------------------------------------------------
// Opt-in lane programs — material tables reference these by id so only lanes
// that declare a program change behavior (mirrors wetEdgeBloomProgramId).
// ---------------------------------------------------------------------------

export type StudioLivingInkSettledBakeProgramId =
  | "sumi-flow-bake"
  | "fluid-feather-lite";

export type StudioLivingInkSettledBakeProgram = Omit<
  StudioLivingInkSettledBakeSettings,
  "seed" | "maxExtraDabs" | "phase"
>;

/**
 * Two intentional bake programs for this wave's experimental lanes:
 * - sumi-flow-bake: 수묵 — slow-drying, vortical, strongly rimmed ink wash. High flow keeps dab
 *   momentum alive through the bake, so plumes and rims develop.
 * - fluid-feather-lite: 수채 — lighter preset: higher bleed/creep, faster dry, softer rim, a
 *   touch of chromatography; feathers stay faint and short.
 */
export const STUDIO_LIVING_INK_SETTLED_BAKE_PROGRAMS: Readonly<
  Record<StudioLivingInkSettledBakeProgramId, StudioLivingInkSettledBakeProgram>
> = Object.freeze({
  "sumi-flow-bake": Object.freeze({
    strength: 0.85, rimGain: 1.15, featherCount: 3,
    flow: 0.62, bleed: 0.5, dryRate: 0.35, vorticity: 0.4,
    capillaryCreep: 0.55, chromaticSeparation: 0,
  }),
  "fluid-feather-lite": Object.freeze({
    strength: 0.55, rimGain: 0.6, featherCount: 2,
    flow: 0.5, bleed: 0.72, dryRate: 0.55, vorticity: 0.2,
    capillaryCreep: 0.7, chromaticSeparation: 0.15,
  }),
});

export function resolveStudioLivingInkSettledBakeProgram(
  programId: string | null | undefined,
): StudioLivingInkSettledBakeProgram | null {
  if (!programId) return null;
  return (STUDIO_LIVING_INK_SETTLED_BAKE_PROGRAMS as Record<
    string,
    StudioLivingInkSettledBakeProgram
  >)[programId] ?? null;
}

// ---------------------------------------------------------------------------
// Stroke-local bake field
// ---------------------------------------------------------------------------

export interface StudioLivingInkSettledBakeFieldResult {
  readonly field: StudioLivingInkFluidReferenceField;
  /** Canvas-px position of fine cell (0, 0)'s origin corner. */
  readonly originXPx: number;
  readonly originYPx: number;
  /** Canvas px per fine cell. */
  readonly cellPx: number;
  readonly steps: number;
  /** Post-projection divergence residual of the final tick (diagnostics). */
  readonly divergenceAfter: number;
}

interface FiniteDab {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly opacity: number;
  readonly core: boolean;
}

function collectFiniteDabs(dabs: readonly WatercolorBrushDab[]): FiniteDab[] {
  const collected: FiniteDab[] = [];
  for (const dab of dabs) {
    if (!Number.isFinite(dab.x) || !Number.isFinite(dab.y)) continue;
    collected.push({
      x: dab.x,
      y: dab.y,
      radius: Math.max(MIN_DAB_RADIUS, finiteNumber(dab.radius, MIN_DAB_RADIUS)),
      opacity: clamp01(finiteNumber(dab.opacity, 0)),
      core: dab.role === "core",
    });
  }
  return collected;
}

/**
 * Adds a Gaussian velocity impulse into the coarse grid: radial outflow (dwell capillary push)
 * plus a directed drag along the travel direction. Writes are clamped to the engine's
 * velocityClamp exactly like the reference seeders.
 */
function injectBakeImpulse(
  field: StudioLivingInkFluidReferenceField,
  gridX: number,
  gridY: number,
  radiusCells: number,
  dirX: number,
  dirY: number,
  radialStrength: number,
  dragStrength: number,
): void {
  const { coarseWidth: w, coarseHeight: h, coarseScale, velocity } = field;
  const clampUv = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
  const centerX = gridX / coarseScale;
  const centerY = gridY / coarseScale;
  const reach = Math.max(1.25, (radiusCells / coarseScale) * IMPULSE_REACH_RADII);
  const reachSquared = reach * reach;
  const minX = Math.max(0, Math.floor(centerX - reach));
  const maxX = Math.min(w - 1, Math.ceil(centerX + reach));
  const minY = Math.max(0, Math.floor(centerY - reach));
  const maxY = Math.min(h - 1, Math.ceil(centerY + reach));
  for (let y = minY; y <= maxY; y += 1) {
    const dy = y - centerY;
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x - centerX;
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared > reachSquared * 4) continue;
      const distance = Math.max(1e-3, Math.sqrt(distanceSquared));
      const falloff = Math.exp(-distanceSquared / reachSquared);
      const index = (y * w + x) * 2;
      velocity[index] = clamp(
        (velocity[index] ?? 0)
          + ((dx / distance) * radialStrength + dirX * dragStrength) * falloff,
        -clampUv,
        clampUv,
      );
      velocity[index + 1] = clamp(
        (velocity[index + 1] ?? 0)
          + ((dy / distance) * radialStrength + dirY * dragStrength) * falloff,
        -clampUv,
        clampUv,
      );
    }
  }
}

/**
 * Seeds and settles the stroke-local field. Pure; returns null when the plan holds no finite dab.
 * Exported so quality gates can assert on the actual pigment field, not only on dab output.
 */
export function bakeStudioLivingInkSettledField(
  dabs: readonly WatercolorBrushDab[],
  settings?: Partial<StudioLivingInkSettledBakeSettings> | null,
): StudioLivingInkSettledBakeFieldResult | null {
  const normalized = normalizeStudioLivingInkSettledBakeSettings(settings);
  const finiteDabs = collectFiniteDabs(dabs);
  if (finiteDabs.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxRadius = MIN_DAB_RADIUS;
  for (const dab of finiteDabs) {
    minX = Math.min(minX, dab.x - dab.radius);
    minY = Math.min(minY, dab.y - dab.radius);
    maxX = Math.max(maxX, dab.x + dab.radius);
    maxY = Math.max(maxY, dab.y + dab.radius);
    maxRadius = Math.max(maxRadius, dab.radius);
  }
  const pad = maxRadius * GRID_PAD_RADIUS_RATIO + GRID_PAD_MIN_PX;
  const spanX = Math.max(1e-3, maxX - minX) + pad * 2;
  const spanY = Math.max(1e-3, maxY - minY) + pad * 2;
  const grid = STUDIO_LIVING_INK_SETTLED_BAKE_GRID;
  let cellPx = Math.max(1e-6, Math.max(spanX, spanY) / grid.fineLongSide);
  const cellsAtLongSide = (spanX / cellPx) * (spanY / cellPx);
  if (cellsAtLongSide > grid.fineMaxCells) {
    cellPx *= Math.sqrt(cellsAtLongSide / grid.fineMaxCells);
  }
  const width = clamp(Math.ceil(spanX / cellPx), grid.fineMinSide, grid.pigmentLongSideCap);
  const height = clamp(Math.ceil(spanY / cellPx), grid.fineMinSide, grid.pigmentLongSideCap);
  const originXPx = minX - pad;
  const originYPx = minY - pad;

  const field = createStudioLivingInkFluidReference({
    width,
    height,
    coarseBase: grid.coarseBase,
  });

  // --- 1. deposits + impulses, in stroke order --------------------------------
  let previousCoreX: number | null = null;
  let previousCoreY: number | null = null;
  for (const dab of finiteDabs) {
    const gridX = (dab.x - originXPx) / cellPx;
    const gridY = (dab.y - originYPx) / cellPx;
    const radiusCells = Math.max(0.5, dab.radius / cellPx);
    const pressureProxy = dab.opacity;
    if (dab.core) {
      depositStudioLivingInkReference(field, {
        x: gridX,
        y: gridY,
        radius: radiusCells,
        amount: CORE_DEPOSIT_AMOUNT * pressureProxy,
        color: CORE_COLOR,
        wet: CORE_DEPOSIT_WET,
      });
      let dirX = 0;
      let dirY = 0;
      if (previousCoreX !== null && previousCoreY !== null) {
        const dx = dab.x - previousCoreX;
        const dy = dab.y - previousCoreY;
        const length = Math.hypot(dx, dy);
        if (length > 1e-6) {
          dirX = dx / length;
          dirY = dy / length;
        }
      }
      injectBakeImpulse(
        field,
        gridX,
        gridY,
        radiusCells,
        dirX,
        dirY,
        RADIAL_IMPULSE_UV * pressureProxy,
        DRAG_IMPULSE_UV * pressureProxy,
      );
      previousCoreX = dab.x;
      previousCoreY = dab.y;
      continue;
    }
    depositStudioLivingInkReference(field, {
      x: gridX,
      y: gridY,
      radius: radiusCells,
      amount: HALO_DEPOSIT_AMOUNT * pressureProxy,
      color: HALO_COLOR,
      wet: HALO_DEPOSIT_WET,
    });
  }

  // --- 2. fixed deterministic settle ------------------------------------------
  const stepParams = {
    dt: STUDIO_LIVING_INK_EXECUTION_LIMITS.fixedTimeStepSeconds,
    flow: normalized.flow,
    bleed: normalized.bleed,
    dryRate: normalized.dryRate,
    chromaticSeparation: normalized.chromaticSeparation,
    vorticity: normalized.vorticity,
    capillaryCreep: normalized.capillaryCreep,
    pressureIterations: STUDIO_LIVING_INK_FLUID_DEFAULTS.settlePressureIterations,
  } as const;
  let divergenceAfter = 0;
  for (let step = 0; step < STUDIO_LIVING_INK_SETTLED_BAKE_STEPS; step += 1) {
    divergenceAfter = stepStudioLivingInkFluidReference(field, stepParams).divergenceAfter;
  }

  return Object.freeze({
    field,
    originXPx,
    originYPx,
    cellPx,
    steps: STUDIO_LIVING_INK_SETTLED_BAKE_STEPS,
    divergenceAfter,
  });
}

// ---------------------------------------------------------------------------
// Field → per-dab derivation
// ---------------------------------------------------------------------------

export interface StudioLivingInkSettledBakeDabDerivation {
  /** Pigment-migration drift at the dab, px (flow term + centroid term, uncapped). */
  readonly driftXPx: number;
  readonly driftYPx: number;
  /** 0..1 outward-migration rim signal (0 = fresh Gaussian deposit, no ring). */
  readonly rimSignal: number;
  /** Unit local flow direction in px space; zero vector when the wash is still. */
  readonly flowDirX: number;
  readonly flowDirY: number;
  /** Local flow magnitude, uv/s. */
  readonly flowSpeedUv: number;
}

function pigmentDensityAt(field: StudioLivingInkFluidReferenceField, cell: number): number {
  const base = cell * 4;
  return (field.pigment[base] ?? 0)
    + (field.pigment[base + 1] ?? 0)
    + (field.pigment[base + 2] ?? 0);
}

function coarseVelocityBilinear(
  field: StudioLivingInkFluidReferenceField,
  uvx: number,
  uvy: number,
): readonly [number, number] {
  const w = field.coarseWidth;
  const h = field.coarseHeight;
  const px = clamp(uvx * w - 0.5, 0, w - 1);
  const py = clamp(uvy * h - 0.5, 0, h - 1);
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(x0 + 1, w - 1);
  const y1 = Math.min(y0 + 1, h - 1);
  const fx = px - x0;
  const fy = py - y0;
  const out: [number, number] = [0, 0];
  for (let channel = 0; channel < 2; channel += 1) {
    const a = field.velocity[(y0 * w + x0) * 2 + channel] ?? 0;
    const b = field.velocity[(y0 * w + x1) * 2 + channel] ?? 0;
    const c = field.velocity[(y1 * w + x0) * 2 + channel] ?? 0;
    const d = field.velocity[(y1 * w + x1) * 2 + channel] ?? 0;
    out[channel] = (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }
  return out;
}

/**
 * Samples the settled field around one dab: pigment centroid drift, rim-vs-centre migration
 * signal and the local flow direction. Pure and position-only; exported for quality gates.
 */
export function deriveStudioLivingInkSettledBakeDab(
  bake: StudioLivingInkSettledBakeFieldResult,
  x: number,
  y: number,
  radiusPx: number,
): StudioLivingInkSettledBakeDabDerivation {
  const { field, originXPx, originYPx, cellPx } = bake;
  const gridX = (x - originXPx) / cellPx;
  const gridY = (y - originYPx) / cellPx;
  const radiusCells = Math.max(0.5, radiusPx / cellPx);
  const scanRadius = clamp(radiusCells * RIM_ANNULUS_OUTER_RATIO, 2, 14);
  const minX = Math.max(0, Math.floor(gridX - scanRadius));
  const maxX = Math.min(field.width - 1, Math.ceil(gridX + scanRadius));
  const minY = Math.max(0, Math.floor(gridY - scanRadius));
  const maxY = Math.min(field.height - 1, Math.ceil(gridY + scanRadius));

  const centreRadius = radiusCells * RIM_CENTRE_RADIUS_RATIO;
  const annulusInner = radiusCells * RIM_ANNULUS_INNER_RATIO;
  const annulusOuter = radiusCells * RIM_ANNULUS_OUTER_RATIO;
  let densityTotal = 0;
  let centroidX = 0;
  let centroidY = 0;
  let centreSum = 0;
  let centreCount = 0;
  let rimSum = 0;
  let rimCount = 0;
  let wetCentreSum = 0;
  let wetRimSum = 0;
  for (let cellY = minY; cellY <= maxY; cellY += 1) {
    const dy = cellY + 0.5 - gridY;
    for (let cellX = minX; cellX <= maxX; cellX += 1) {
      const dx = cellX + 0.5 - gridX;
      const distance = Math.hypot(dx, dy);
      if (distance > scanRadius) continue;
      const cell = cellY * field.width + cellX;
      const density = pigmentDensityAt(field, cell);
      densityTotal += density;
      centroidX += dx * density;
      centroidY += dy * density;
      if (distance <= centreRadius) {
        centreSum += density;
        wetCentreSum += field.wet[cell] ?? 0;
        centreCount += 1;
      } else if (distance >= annulusInner && distance < annulusOuter) {
        rimSum += density;
        wetRimSum += field.wet[cell] ?? 0;
        rimCount += 1;
      }
    }
  }

  const centroidDriftX = densityTotal > 1e-9 ? (centroidX / densityTotal) * cellPx : 0;
  const centroidDriftY = densityTotal > 1e-9 ? (centroidY / densityTotal) * cellPx : 0;
  const centreDensity = centreCount > 0 ? centreSum / centreCount : 0;
  const rimDensity = rimCount > 0 ? rimSum / rimCount : 0;
  const pigmentSignal = centreDensity + rimDensity > 1e-9
    ? clamp01((rimDensity / (centreDensity + 1e-9) - RIM_NEUTRAL_RATIO) / RIM_RATIO_SPAN)
    : 0;
  const wetCentre = centreCount > 0 ? wetCentreSum / centreCount : 0;
  const wetRim = rimCount > 0 ? wetRimSum / rimCount : 0;
  const wetSignal = wetCentre + wetRim > 1e-9
    ? clamp01((wetRim / (wetCentre + 1e-9) - WET_RING_NEUTRAL_RATIO) / WET_RING_RATIO_SPAN)
    : 0;
  const rimSignal = Math.max(pigmentSignal, wetSignal);

  const [flowUvX, flowUvY] = coarseVelocityBilinear(
    field,
    gridX / field.width,
    gridY / field.height,
  );
  const flowSpeedUv = Math.hypot(flowUvX, flowUvY);
  // uv/s → px direction: anisotropic grids scale each axis by its own px span.
  const flowPxX = flowUvX * field.width * cellPx;
  const flowPxY = flowUvY * field.height * cellPx;
  const flowPxLength = Math.hypot(flowPxX, flowPxY);
  const hasFlow = flowSpeedUv > FLOW_MIN_UV && flowPxLength > 1e-9;
  const flowDirX = hasFlow ? flowPxX / flowPxLength : 0;
  const flowDirY = hasFlow ? flowPxY / flowPxLength : 0;
  const flowResponse = clamp01(flowSpeedUv / FLOW_RESPONSE_REF_UV);

  return Object.freeze({
    driftXPx: centroidDriftX * DRIFT_CENTROID_GAIN
      + flowDirX * flowResponse * radiusPx * DRIFT_FLOW_RADIUS_RATIO,
    driftYPx: centroidDriftY * DRIFT_CENTROID_GAIN
      + flowDirY * flowResponse * radiusPx * DRIFT_FLOW_RADIUS_RATIO,
    rimSignal,
    flowDirX,
    flowDirY,
    flowSpeedUv,
  });
}

// ---------------------------------------------------------------------------
// Single wire-in point — same dab-in/dab-out contract as augmentStudioWetEdgeBloomDabs
// ---------------------------------------------------------------------------

/**
 * Augments a SETTLED ink/watercolor dab plan with baked fluid texture. Pure and
 * allocation-bounded: the input array and its dabs are never mutated; identity settings (which
 * include every non-settled phase) return the exact input reference so non-opted lanes and every
 * live prefix stay bit-identical.
 *
 * Per station: the core dab passes through byte-identical (pigment stays where the artist put
 * it); every diffuse dab drifts with the baked flow and gains rim alpha where pigment actually
 * migrated outward; the station's first diffuse dab additionally sprouts `featherCount` faint
 * extras along the local flow direction.
 */
export function augmentStudioLivingInkSettledBakeDabs(
  dabs: readonly WatercolorBrushDab[],
  settings?: Partial<StudioLivingInkSettledBakeSettings> | null,
): readonly WatercolorBrushDab[] {
  const normalized = normalizeStudioLivingInkSettledBakeSettings(settings);
  if (dabs.length === 0 || isStudioLivingInkSettledBakeIdentitySettings(normalized)) {
    return dabs;
  }
  const bake = bakeStudioLivingInkSettledField(dabs, normalized);
  if (!bake) return dabs;

  const { seed, strength, rimGain, featherCount } = normalized;
  const output: WatercolorBrushDab[] = [];
  let extraBudget = normalized.maxExtraDabs;
  let stationOrdinal = -1;
  let stationHasFeathered = true;

  const pushExtra = (dab: WatercolorBrushDab): void => {
    if (extraBudget <= 0 || dab.opacity < MIN_VISIBLE_EXTRA_OPACITY) return;
    output.push(dab);
    extraBudget -= 1;
  };

  for (const dab of dabs) {
    if (dab.role === "core") {
      stationOrdinal += 1;
      stationHasFeathered = false;
      // Core pigment is the settled deposit itself — byte-identical passthrough.
      output.push(dab);
      continue;
    }
    if (!Number.isFinite(dab.x) || !Number.isFinite(dab.y)) {
      output.push(dab);
      continue;
    }
    const radius = Math.max(MIN_DAB_RADIUS, finiteNumber(dab.radius, MIN_DAB_RADIUS));
    const opacity = clamp01(finiteNumber(dab.opacity, 0));
    const derived = deriveStudioLivingInkSettledBakeDab(bake, dab.x, dab.y, radius);

    // Bleed offset: capped so a halo can never abandon its own core.
    const driftLength = Math.hypot(derived.driftXPx, derived.driftYPx);
    const maxShift = radius * MAX_SHIFT_RADIUS_RATIO;
    const shiftScale = driftLength > 1e-9
      ? (Math.min(driftLength * strength, maxShift) / driftLength)
      : 0;
    const shiftedX = dab.x + derived.driftXPx * shiftScale;
    const shiftedY = dab.y + derived.driftYPx * shiftScale;

    output.push({
      x: shiftedX,
      y: shiftedY,
      radius,
      opacity: clampAugmentedOpacity(opacity * (1 + rimGain * derived.rimSignal)),
      role: "diffuse",
    });

    if (!stationHasFeathered && featherCount > 0) {
      stationHasFeathered = true;
      // Coherent current → a directed plume; still wash (e.g. a dwell blot whose
      // radial outflow the projection removed) → isotropic capillary feathering
      // around the wet edge. Both are seeded, never clock-driven.
      const coherentFlow = derived.flowDirX !== 0 || derived.flowDirY !== 0;
      const baseAngle = coherentFlow
        ? Math.atan2(derived.flowDirY, derived.flowDirX)
        : 0;
      for (let feather = 0; feather < featherCount; feather += 1) {
        const angleHash = studioOssUnitHash(seed ^ SALT_FEATHER_ANGLE, stationOrdinal, feather);
        const angle = coherentFlow
          ? baseAngle + (angleHash - 0.5) * FEATHER_FAN_RAD
          : angleHash * TAU;
        const distance = radius * (
          FEATHER_DISTANCE_BASE_RATIO
          + FEATHER_DISTANCE_STEP_RATIO * feather
          + 0.2 * studioOssUnitHash(seed ^ SALT_FEATHER_DISTANCE, stationOrdinal, feather)
        );
        pushExtra({
          x: shiftedX + Math.cos(angle) * distance,
          y: shiftedY + Math.sin(angle) * distance,
          radius: Math.max(
            MIN_DAB_RADIUS,
            radius * (FEATHER_RADIUS_BASE_RATIO + FEATHER_RADIUS_STEP_RATIO * feather),
          ),
          opacity: clampAugmentedOpacity(
            opacity * FEATHER_ALPHA_RATIO * strength * (FEATHER_ALPHA_DECAY ** feather),
          ),
          role: "diffuse",
        });
      }
    }
  }

  return output;
}
