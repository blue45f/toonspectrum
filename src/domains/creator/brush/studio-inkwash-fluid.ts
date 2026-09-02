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

/**
 * 획 평균 간격에 해당하는 기준 속도. `speedShrink = 1/(1 + pace*0.85)` 에 들어가므로 이 값이
 * 곧 "보통 속도로 그은 획"의 굵기·농도 배율을 정한다. 환경 변수로 흔들지 않는 고정 상수여야
 * 라이브·커밋·내보내기가 같은 그림을 만든다.
 */
export const STUDIO_INKWASH_NOMINAL_PACE = 0.45;

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

  /*
   * 이 루프의 두 규칙은 모두 하나의 계약을 위한 것이다 — **같은 기하는 점 개수와 무관하게 같은
   * 마크가 된다.** 문서는 점당 시간을 저장하지 않고, 직선 획은 커밋되며 2점으로 단순화된다.
   *
   * 1) 속도. 예전에는 합성 타임스탬프(`index * 고정간격`)에서 속도를 유도해, "speed" 가 손의
   *    빠르기가 아니라 점이 얼마나 촘촘히 남았는지를 쟀다. 2점 직선에서는 한 구간의 거리가 획
   *    전체가 되어 감쇠가 0.006 까지 떨어졌고 획이 시작점 한 방울로 붕괴했다(실측: 391px 수묵
   *    세필 직선이 52px 얼룩 하나). 이제 속도는 이 획 자신의 평균 간격 대비 **상대값**으로만
   *    쓰고 절대 크기는 STUDIO_INKWASH_NOMINAL_PACE 로 고정한다. 손이 실제로 빨라져 점 간격이
   *    벌어진 구간은 그 비율만큼 여전히 얇고 옅어진다.
   * 2) 위치. 예전에는 구간마다 `ceil(span/spacing)` 로 나눠 t=step/steps 에 찍어서, 스탬프 간격이
   *    구간 길이에 따라 달라지고 샘플 점마다 뭉쳤다. 이제 획 시작점부터의 **호 길이**를 누적해
   *    정확히 spacing 마다 찍는다 — 같은 경로를 지나는 폴리라인이면 스탬프가 같은 자리에 놓인다.
   */
  const segmentLengths: number[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    segmentLengths.push(Math.hypot(
      samples[index]!.x - samples[index - 1]!.x,
      samples[index]!.y - samples[index - 1]!.y,
    ));
  }
  const meanSegment = segmentLengths.length > 0
    ? segmentLengths.reduce((total, value) => total + value, 0) / segmentLengths.length
    : 0;

  const first = samples[0]!;
  stampAt(first.x, first.y, first.pressure, 0, 0, 0);
  cursorX = first.x;
  cursorY = first.y;
  /** 다음 스탬프까지 남은 호 길이. 구간 경계에서 초기화하지 않아야 간격이 일정하다. */
  let untilNextStamp = spacing;

  for (let index = 1; index < samples.length; index += 1) {
    const sample = samples[index]!;
    const dx = sample.x - previousX;
    const dy = sample.y - previousY;
    const span = Math.hypot(dx, dy);
    const relativePace = meanSegment > 1e-6 ? span / meanSegment : 1;
    const speed = STUDIO_INKWASH_NOMINAL_PACE * Math.min(4, relativePace);
    const dirX = span > 1e-6 ? dx / span : 0;
    const dirY = span > 1e-6 ? dy / span : 0;
    const impulse = isWater ? 0.55 * Math.min(1.8, 0.35 + speed * 8) : 0;
    if (span <= 1e-9) {
      previousX = sample.x;
      previousY = sample.y;
      continue;
    }
    for (
      let travelled = untilNextStamp;
      travelled <= span + 1e-9;
      travelled += spacing
    ) {
      const t = travelled / span;
      stampAt(
        cursorX + dx * t,
        cursorY + dy * t,
        sample.pressure,
        dirX * impulse,
        dirY * impulse,
        speed,
      );
      untilNextStamp = travelled + spacing;
    }
    untilNextStamp -= span;
    cursorX = sample.x;
    cursorY = sample.y;
    previousX = sample.x;
    previousY = sample.y;
  }

  // 마지막 점은 항상 찍는다 — 호 길이 격자에 걸리지 않아도 획의 끝은 존재해야 한다.
  const last = samples[samples.length - 1]!;
  if (samples.length > 1 && untilNextStamp < spacing - 1e-9) {
    stampAt(last.x, last.y, last.pressure, 0, 0, STUDIO_INKWASH_NOMINAL_PACE);
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
    /** Field-cell rectangle to rasterize. Omit to dump the whole field. */
    clip?: Readonly<{ x: number; y: number; width: number; height: number }>;
  }>,
): StudioWetInkTileUpload {
  const { fluid, fixed } = session;
  const { width, height, pigment, wet } = fluid;
  const clip = options?.clip;
  const x0 = clip
    ? Math.max(0, Math.floor(clip.x))
    : 0;
  const y0 = clip
    ? Math.max(0, Math.floor(clip.y))
    : 0;
  const x1 = clip
    ? Math.min(width, Math.ceil(clip.x + clip.width))
    : width;
  const y1 = clip
    ? Math.min(height, Math.ceil(clip.y + clip.height))
    : height;
  const outW = Math.max(1, x1 - x0);
  const outH = Math.max(1, y1 - y0);
  const rgba = new Uint8ClampedArray(outW * outH * 4);
  const strength = STUDIO_WET_INK_INKWASH_DISPLAY.beerLambertStrength;
  const sheen = STUDIO_WET_INK_INKWASH_DISPLAY.wetSheen;
  const { lo, hi } = STUDIO_WET_INK_INKWASH_DISPLAY.wetSheenGate;
  for (let y = 0; y < outH; y += 1) {
    const srcY = y0 + y;
    if (srcY < 0 || srcY >= height) continue;
    for (let x = 0; x < outW; x += 1) {
      const srcX = x0 + x;
      if (srcX < 0 || srcX >= width) continue;
      const index = srcY * width + srcX;
      const base = index * 4;
      const dest = (y * outW + x) * 4;
      const densityR = (pigment[base] ?? 0) + (fixed[base] ?? 0);
      const densityG = (pigment[base + 1] ?? 0) + (fixed[base + 1] ?? 0);
      const densityB = (pigment[base + 2] ?? 0) + (fixed[base + 2] ?? 0);
      const wetness = wet[index] ?? 0;
      const wetGate = clamp01((wetness - lo) / Math.max(1e-8, hi - lo));
      const transR = Math.exp(-densityR * strength) * (1 - wetGate * sheen.r);
      const transG = Math.exp(-densityG * strength) * (1 - wetGate * sheen.g);
      const transB = Math.exp(-densityB * strength) * (1 - wetGate * sheen.b);
      rgba[dest] = clampByte(PAPER.r * transR * 255);
      rgba[dest + 1] = clampByte(PAPER.g * transG * 255);
      rgba[dest + 2] = clampByte(PAPER.b * transB * 255);
      rgba[dest + 3] = clampByte((1 - Math.min(transR, transG, transB)) * 255);
    }
  }
  return {
    tileX: 0,
    tileY: 0,
    x: (options?.originX ?? 0) + x0,
    y: (options?.originY ?? 0) + y0,
    width: outW,
    height: outH,
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
