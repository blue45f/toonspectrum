/**
 * Clean-room InkWash fluid for `inkwash-pen` / `inkwash-water-brush`.
 *
 * Operators match the public engine description (Stam advection, pressure projection,
 * vorticity, wet gates, per-channel chromatography, Beer–Lambert, fix/settle). The
 * Stam step is the shipped Living Ink CPU reference — not a second solver and not a
 * paste of johnowhitaker/inkwash shaders (no public license; mayShipInProduct: false).
 */

import {
  STUDIO_LIVING_INK_EXECUTION_LIMITS,
  STUDIO_LIVING_INK_FLUID_DEFAULTS,
} from "../studio-living-ink-execution-protocol";
import {
  createStudioLivingInkFluidReference,
  projectStudioLivingInkReference,
  stepStudioLivingInkFluidReference,
  studioLivingInkReferenceDivergenceL2,
  type StudioLivingInkFluidReferenceField,
  type StudioLivingInkFluidReferenceStepParams,
} from "../studio-living-ink-fluid-reference";

import { STUDIO_WET_INK_INKWASH_DISPLAY } from "./studio-wet-ink-field";

import type { StudioWetInkTileUpload } from "./studio-wet-ink-field";

export const STUDIO_INKWASH_FLUID_VERSION = "inkwash-fluid-v1" as const;

/** InkWash §04: fresh pen ink lays a faint wetness so a following wash can catch it. */
export const STUDIO_INKWASH_PEN_FRESH_WETNESS = 0.16;

/** InkWash §05: gaussian stamps spaced at 0.6 × radius. */
export const STUDIO_INKWASH_STAMP_SPACING_RATIO = 0.6;

const PAPER = Object.freeze({ r: 0.965, g: 0.956, b: 0.932 });
const FIELD_MAX = 2_048;
const HASH_OFFSET = 0x811c9dc5;
const HASH_PRIME = 0x01000193;

export interface StudioInkwashFluidSession {
  readonly version: typeof STUDIO_INKWASH_FLUID_VERSION;
  readonly fluid: StudioLivingInkFluidReferenceField;
  /** Settled optical density (RGBA interleaved). Fix/settle copies mobile pigment here. */
  readonly fixed: Float32Array;
  simulationStep: number;
  revision: number;
}

export interface StudioInkwashFluidStamp {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** Additive per-channel optical density. Water stamps pass ~0. */
  readonly pigment: readonly [number, number, number];
  /** Saturating wetness (MAX, not accumulate). */
  readonly wetness: number;
  /** Coarse-grid motion impulse. Water stamps push; pen stamps stay near 0. */
  readonly velocity: readonly [number, number];
}

export interface StudioInkwashFluidStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timeMs?: number;
}

export interface StudioInkwashFluidStrokeInput {
  readonly tool: "pen" | "water";
  readonly samples: readonly StudioInkwashFluidStrokeSample[];
  readonly radius: number;
  readonly pigmentLoad: number;
  readonly wetnessLoad: number;
  readonly spectralAbsorption?: Readonly<{ r: number; g: number; b: number }>;
  readonly inkColor?: Readonly<{ r: number; g: number; b: number }>;
}

export interface StudioInkwashFluidCell {
  readonly wet: number;
  readonly mobile: readonly [number, number, number];
  readonly fixed: readonly [number, number, number];
  readonly velocity: readonly [number, number];
}

export const STUDIO_INKWASH_FLUID_STEP_PARAMS: StudioLivingInkFluidReferenceStepParams =
  Object.freeze({
    dt: STUDIO_LIVING_INK_EXECUTION_LIMITS.fixedTimeStepSeconds,
    flow: 0.72,
    bleed: 0.56,
    dryRate: 0.18,
    chromaticSeparation: 0.5,
    vorticity: 0.18,
    capillaryCreep: 0.34,
    pressureIterations: STUDIO_LIVING_INK_EXECUTION_LIMITS.interactivePressureIterations,
  });

function clamp(value: number, min: number, max: number): number {
  return value <= min ? min : value >= max ? max : value;
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampDimension(value: number): number {
  return Math.max(8, Math.min(FIELD_MAX, Math.floor(value)));
}

export function createStudioInkwashFluidSession(options: Readonly<{
  width: number;
  height: number;
  coarseBase?: number;
}>): StudioInkwashFluidSession {
  const width = clampDimension(options.width);
  const height = clampDimension(options.height);
  const fluid = createStudioLivingInkFluidReference({
    width,
    height,
    coarseBase: options.coarseBase ?? 128,
  });
  return {
    version: STUDIO_INKWASH_FLUID_VERSION,
    fluid,
    fixed: new Float32Array(width * height * 4),
    simulationStep: 0,
    revision: 0,
  };
}

function gaussianWeight(dx: number, dy: number, radius: number): number {
  const r2 = Math.max(1e-4, radius * radius);
  return Math.exp(-(dx * dx + dy * dy) / r2);
}

/**
 * One gaussian splat. Ink is additive optical density; wetness saturates (MAX);
 * water may inject a coarse velocity impulse. Dry cells are not forced wet unless
 * the stamp itself carries wetness.
 */
export function depositStudioInkwashFluidStamp(
  session: StudioInkwashFluidSession,
  stamp: StudioInkwashFluidStamp,
): void {
  const { fluid } = session;
  const radius = Math.max(0.5, stamp.radius);
  const reach = radius * 2;
  const left = Math.max(0, Math.floor(stamp.x - reach));
  const right = Math.min(fluid.width - 1, Math.ceil(stamp.x + reach));
  const bottom = Math.max(0, Math.floor(stamp.y - reach));
  const top = Math.min(fluid.height - 1, Math.ceil(stamp.y + reach));
  const pigment = stamp.pigment;
  const hasPigment = pigment[0] > 0 || pigment[1] > 0 || pigment[2] > 0;
  const wetness = clamp(stamp.wetness, 0, STUDIO_LIVING_INK_FLUID_DEFAULTS.wetCeiling);
  for (let y = bottom; y <= top; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const dx = x + 0.5 - stamp.x;
      const dy = y + 0.5 - stamp.y;
      const weight = gaussianWeight(dx, dy, radius);
      if (weight < 1e-4) continue;
      const cell = y * fluid.width + x;
      if (hasPigment) {
        const base = cell * 4;
        fluid.pigment[base] = (fluid.pigment[base] ?? 0) + pigment[0] * weight;
        fluid.pigment[base + 1] = (fluid.pigment[base + 1] ?? 0) + pigment[1] * weight;
        fluid.pigment[base + 2] = (fluid.pigment[base + 2] ?? 0) + pigment[2] * weight;
      }
      if (wetness > 0) {
        const nextWet = wetness * weight;
        const current = fluid.wet[cell] ?? 0;
        if (nextWet > current) fluid.wet[cell] = nextWet;
      }
    }
  }
  const impulseX = stamp.velocity[0];
  const impulseY = stamp.velocity[1];
  if (impulseX === 0 && impulseY === 0) {
    session.revision += 1;
    return;
  }
  const { coarseWidth: cw, coarseHeight: ch, velocity } = fluid;
  const clampV = STUDIO_LIVING_INK_FLUID_DEFAULTS.velocityClamp;
  const cx = (stamp.x / fluid.width) * cw;
  const cy = (stamp.y / fluid.height) * ch;
  const coarseRadius = Math.max(1, (radius / fluid.width) * cw * 1.2);
  const leftC = Math.max(0, Math.floor(cx - coarseRadius * 2));
  const rightC = Math.min(cw - 1, Math.ceil(cx + coarseRadius * 2));
  const bottomC = Math.max(0, Math.floor(cy - coarseRadius * 2));
  const topC = Math.min(ch - 1, Math.ceil(cy + coarseRadius * 2));
  for (let y = bottomC; y <= topC; y += 1) {
    for (let x = leftC; x <= rightC; x += 1) {
      const weight = gaussianWeight(x + 0.5 - cx, y + 0.5 - cy, coarseRadius);
      if (weight < 1e-4) continue;
      const index = (y * cw + x) * 2;
      velocity[index] = clamp(
        (velocity[index] ?? 0) + impulseX * weight,
        -clampV,
        clampV,
      );
      velocity[index + 1] = clamp(
        (velocity[index + 1] ?? 0) + impulseY * weight,
        -clampV,
        clampV,
      );
    }
  }
  session.revision += 1;
}

function spectralColor(
  input: StudioInkwashFluidStrokeInput,
): [number, number, number] {
  const spec = input.spectralAbsorption ?? { r: 1, g: 0.96, b: 0.88 };
  const color = input.inkColor;
  if (!color) return [spec.r, spec.g, spec.b];
  const reflectanceR = clamp(color.r / 255, 0.02, 0.98);
  const reflectanceG = clamp(color.g / 255, 0.02, 0.98);
  const reflectanceB = clamp(color.b / 255, 0.02, 0.98);
  return [
    -Math.log(reflectanceR) * spec.r,
    -Math.log(reflectanceG) * spec.g,
    -Math.log(reflectanceB) * spec.b,
  ];
}

/**
 * Chains gaussian stamps along a polyline. Pen: pressure/speed scale radius and density,
 * faint MAX wetness, no motion impulse. Water: MAX wetness, motion impulses, no ink.
 */
export function depositStudioInkwashFluidStroke(
  session: StudioInkwashFluidSession,
  input: StudioInkwashFluidStrokeInput,
): number {
  const samples = input.samples.filter((sample) => finite(sample.x) && finite(sample.y));
  if (samples.length === 0) return 0;
  const baseRadius = Math.max(0.75, input.radius);
  const spacing = Math.max(0.35, baseRadius * STUDIO_INKWASH_STAMP_SPACING_RATIO);
  const absorption = spectralColor(input);
  const isWater = input.tool === "water";
  let stamped = 0;
  let cursorX = samples[0]!.x;
  let cursorY = samples[0]!.y;
  let previousX = cursorX;
  let previousY = cursorY;
  let previousTime = samples[0]!.timeMs ?? 0;

  const stampAt = (
    x: number,
    y: number,
    pressure: number,
    vx: number,
    vy: number,
    speed: number,
  ): void => {
    const speedShrink = 1 / (1 + speed * (isWater ? 0.35 : 0.85));
    const pressureGrow = 0.35 + 0.65 * clamp01(pressure);
    const radius = baseRadius * pressureGrow * speedShrink;
    const densityScale = input.pigmentLoad * (0.4 + 0.6 * clamp01(pressure)) * speedShrink;
    const pigment: [number, number, number] = isWater || densityScale <= 0
      ? [0, 0, 0]
      : [
        absorption[0] * densityScale,
        absorption[1] * densityScale,
        absorption[2] * densityScale,
      ];
    const wetness = isWater
      ? clamp01(input.wetnessLoad) * (0.55 + 0.45 * clamp01(pressure))
      : clamp01(input.wetnessLoad);
    depositStudioInkwashFluidStamp(session, {
      x,
      y,
      radius,
      pigment,
      wetness,
      velocity: isWater ? [vx, vy] : [0, 0],
    });
    stamped += 1;
  };

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const dx = sample.x - previousX;
    const dy = sample.y - previousY;
    const distance = Math.hypot(dx, dy);
    const dt = Math.max(1, (sample.timeMs ?? previousTime) - previousTime);
    const speed = distance / dt;
    const dirX = distance > 1e-6 ? dx / distance : 0;
    const dirY = distance > 1e-6 ? dy / distance : 0;
    const impulse = isWater ? 0.55 * Math.min(1.8, 0.35 + speed * 8) : 0;
    if (index === 0) {
      stampAt(sample.x, sample.y, sample.pressure, dirX * impulse, dirY * impulse, 0);
      cursorX = sample.x;
      cursorY = sample.y;
    } else {
      const span = Math.hypot(sample.x - cursorX, sample.y - cursorY);
      const steps = Math.max(1, Math.ceil(span / spacing));
      for (let step = 1; step <= steps; step += 1) {
        const t = step / steps;
        stampAt(
          cursorX + (sample.x - cursorX) * t,
          cursorY + (sample.y - cursorY) * t,
          sample.pressure,
          dirX * impulse,
          dirY * impulse,
          speed,
        );
      }
      cursorX = sample.x;
      cursorY = sample.y;
    }
    previousX = sample.x;
    previousY = sample.y;
    previousTime = sample.timeMs ?? previousTime;
  }
  return stamped;
}

export function studioInkwashFluidStepParams(
  overrides: Partial<StudioLivingInkFluidReferenceStepParams> = {},
): StudioLivingInkFluidReferenceStepParams {
  return {
    ...STUDIO_INKWASH_FLUID_STEP_PARAMS,
    ...overrides,
  };
}

/** One Stam tick: the shipped Living Ink CPU reference (advection + pressure + vorticity). */
export function stepStudioInkwashFluid(
  session: StudioInkwashFluidSession,
  steps = 1,
  params: StudioLivingInkFluidReferenceStepParams = STUDIO_INKWASH_FLUID_STEP_PARAMS,
): Readonly<{ divergenceBefore: number; divergenceAfter: number }> {
  const count = Math.max(0, Math.floor(steps));
  let before = studioLivingInkReferenceDivergenceL2(session.fluid);
  let after = before;
  for (let step = 0; step < count; step += 1) {
    const result = stepStudioLivingInkFluidReference(session.fluid, params);
    if (step === 0) before = result.divergenceBefore;
    after = result.divergenceAfter;
    session.simulationStep += 1;
  }
  if (count > 0) session.revision += 1;
  return { divergenceBefore: before, divergenceAfter: after };
}

/**
 * InkWash §07 fix: mobile pigment transfers to the settled sheet, velocity is braked,
 * wetness flash-dries. Later water moves only new/mobile ink.
 */
export function fixStudioInkwashFluid(session: StudioInkwashFluidSession): void {
  const { fluid, fixed } = session;
  const pigment = fluid.pigment;
  for (let index = 0; index < pigment.length; index += 1) {
    const mobile = pigment[index] ?? 0;
    if (mobile <= 0) continue;
    fixed[index] = (fixed[index] ?? 0) + mobile;
    pigment[index] = 0;
  }
  fluid.wet.fill(0);
  fluid.velocity.fill(0);
  session.revision += 1;
}

export function readStudioInkwashFluidCell(
  session: StudioInkwashFluidSession,
  x: number,
  y: number,
): StudioInkwashFluidCell | null {
  const { fluid, fixed } = session;
  if (
    !Number.isInteger(x)
    || !Number.isInteger(y)
    || x < 0
    || y < 0
    || x >= fluid.width
    || y >= fluid.height
  ) {
    return null;
  }
  const cell = y * fluid.width + x;
  const base = cell * 4;
  const uvx = (x + 0.5) / fluid.width;
  const uvy = (y + 0.5) / fluid.height;
  const cx = Math.min(fluid.coarseWidth - 1, Math.max(0, Math.floor(uvx * fluid.coarseWidth)));
  const cy = Math.min(fluid.coarseHeight - 1, Math.max(0, Math.floor(uvy * fluid.coarseHeight)));
  const velocityIndex = (cy * fluid.coarseWidth + cx) * 2;
  return {
    wet: fluid.wet[cell] ?? 0,
    mobile: [
      fluid.pigment[base] ?? 0,
      fluid.pigment[base + 1] ?? 0,
      fluid.pigment[base + 2] ?? 0,
    ],
    fixed: [
      fixed[base] ?? 0,
      fixed[base + 1] ?? 0,
      fixed[base + 2] ?? 0,
    ],
    velocity: [
      fluid.velocity[velocityIndex] ?? 0,
      fluid.velocity[velocityIndex + 1] ?? 0,
    ],
  };
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

/**
 * InkWash §08 Beer–Lambert display: `paper * exp(-density * strength)`.
 * Overlaps add density (multiply transmittance) instead of clipping to gray-mud alpha-over.
 */
export function resolveStudioInkwashFluidDisplay(
  session: StudioInkwashFluidSession,
  options?: Readonly<{
    originX?: number;
    originY?: number;
  }>,
): StudioWetInkTileUpload {
  const { fluid, fixed } = session;
  const { width, height, pigment, wet } = fluid;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const strength = STUDIO_WET_INK_INKWASH_DISPLAY.beerLambertStrength;
  const sheen = STUDIO_WET_INK_INKWASH_DISPLAY.wetSheen;
  const { lo, hi } = STUDIO_WET_INK_INKWASH_DISPLAY.wetSheenGate;
  for (let index = 0; index < width * height; index += 1) {
    const base = index * 4;
    const densityR = (pigment[base] ?? 0) + (fixed[base] ?? 0);
    const densityG = (pigment[base + 1] ?? 0) + (fixed[base + 1] ?? 0);
    const densityB = (pigment[base + 2] ?? 0) + (fixed[base + 2] ?? 0);
    const wetness = wet[index] ?? 0;
    const wetGate = clamp01((wetness - lo) / Math.max(1e-8, hi - lo));
    const transR = Math.exp(-densityR * strength) * (1 - wetGate * sheen.r);
    const transG = Math.exp(-densityG * strength) * (1 - wetGate * sheen.g);
    const transB = Math.exp(-densityB * strength) * (1 - wetGate * sheen.b);
    rgba[base] = clampByte(PAPER.r * transR * 255);
    rgba[base + 1] = clampByte(PAPER.g * transG * 255);
    rgba[base + 2] = clampByte(PAPER.b * transB * 255);
    rgba[base + 3] = clampByte((1 - Math.min(transR, transG, transB)) * 255);
  }
  return {
    tileX: 0,
    tileY: 0,
    x: options?.originX ?? 0,
    y: options?.originY ?? 0,
    width,
    height,
    revision: session.revision,
    rgba,
  };
}

export function studioInkwashFluidDigest(session: StudioInkwashFluidSession): string {
  let hash = HASH_OFFSET;
  const bytes = new Uint8Array(4);
  const view = new DataView(bytes.buffer);
  const feed = (value: number): void => {
    view.setFloat32(0, Math.fround(value), false);
    for (const byte of bytes) hash = Math.imul(hash ^ byte, HASH_PRIME) >>> 0;
  };
  feed(session.simulationStep);
  feed(session.revision);
  const { fluid, fixed } = session;
  for (let index = 0; index < fluid.wet.length; index += 8) feed(fluid.wet[index] ?? 0);
  for (let index = 0; index < fluid.pigment.length; index += 16) {
    feed(fluid.pigment[index] ?? 0);
  }
  for (let index = 0; index < fixed.length; index += 16) feed(fixed[index] ?? 0);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function studioInkwashFluidProject(
  session: StudioInkwashFluidSession,
  iterations = STUDIO_INKWASH_FLUID_STEP_PARAMS.pressureIterations,
): Readonly<{ before: number; after: number }> {
  return projectStudioLivingInkReference(session.fluid, iterations);
}
