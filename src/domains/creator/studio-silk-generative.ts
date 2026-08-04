/**
 * Silk-class interactive generative symmetry trails.
 *
 * Given a pointer path, emits multi-arm mirrored/rotated samples for
 * generative abstract art (backgrounds, energy patterns). Pure geometry.
 */

export interface StudioSilkPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly t?: number;
}

export interface StudioSilkGenerativeSpec {
  /** Number of rotational arms (Silk-like multi-filament). */
  readonly arms: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Mirror each arm (kaleidoscope energy). */
  readonly mirror: boolean;
  /** Soft trail copies behind the live tip (0..8). */
  readonly trailCopies: number;
  /** Document units between trail echoes. */
  readonly trailSpacing: number;
  /** Attenuate pressure/opacity along trail echoes. */
  readonly trailFalloff: number;
}

export const DEFAULT_STUDIO_SILK_GENERATIVE_SPEC: StudioSilkGenerativeSpec = Object.freeze({
  arms: 6,
  centerX: 400,
  centerY: 600,
  mirror: true,
  trailCopies: 3,
  trailSpacing: 14,
  trailFalloff: 0.72,
});

export const STUDIO_SILK_MAX_ARMS = 24;
export const STUDIO_SILK_MAX_TRAIL_COPIES = 8;

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeSpec(spec?: Partial<StudioSilkGenerativeSpec>): StudioSilkGenerativeSpec {
  const base = DEFAULT_STUDIO_SILK_GENERATIVE_SPEC;
  return Object.freeze({
    arms: clampInt(spec?.arms ?? base.arms, 1, STUDIO_SILK_MAX_ARMS, base.arms),
    centerX: Number.isFinite(spec?.centerX) ? Number(spec?.centerX) : base.centerX,
    centerY: Number.isFinite(spec?.centerY) ? Number(spec?.centerY) : base.centerY,
    mirror: spec?.mirror ?? base.mirror,
    trailCopies: clampInt(
      spec?.trailCopies ?? base.trailCopies,
      0,
      STUDIO_SILK_MAX_TRAIL_COPIES,
      base.trailCopies,
    ),
    trailSpacing: Math.max(0, Number.isFinite(spec?.trailSpacing) ? Number(spec?.trailSpacing) : base.trailSpacing),
    trailFalloff: Math.max(
      0.05,
      Math.min(1, Number.isFinite(spec?.trailFalloff) ? Number(spec?.trailFalloff) : base.trailFalloff),
    ),
  });
}

function rotateAround(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  angle: number,
): StudioSilkPoint {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - centerX;
  const dy = y - centerY;
  return {
    x: centerX + dx * cos - dy * sin,
    y: centerY + dx * sin + dy * cos,
  };
}

function mirrorVertical(
  x: number,
  y: number,
  centerX: number,
): StudioSilkPoint {
  return { x: centerX * 2 - x, y };
}

/**
 * Expand one sample into the full Silk filament set (arms × mirror × trails).
 * Deterministic order: arm major, mirror, trail.
 */
export function expandStudioSilkSample(
  sample: StudioSilkPoint,
  partialSpec?: Partial<StudioSilkGenerativeSpec>,
): readonly StudioSilkPoint[] {
  const spec = normalizeSpec(partialSpec);
  const pressure = Math.max(0, Math.min(1, sample.pressure ?? 0.7));
  const out: StudioSilkPoint[] = [];

  for (let arm = 0; arm < spec.arms; arm += 1) {
    const angle = (arm * 2 * Math.PI) / spec.arms;
    const rotated = rotateAround(sample.x, sample.y, spec.centerX, spec.centerY, angle);
    const bases = spec.mirror
      ? [rotated, mirrorVertical(rotated.x, rotated.y, spec.centerX)]
      : [rotated];

    for (const base of bases) {
      out.push({
        x: base.x,
        y: base.y,
        pressure,
        t: sample.t,
      });
      for (let trail = 1; trail <= spec.trailCopies; trail += 1) {
        const towardCenterX = spec.centerX - base.x;
        const towardCenterY = spec.centerY - base.y;
        const len = Math.hypot(towardCenterX, towardCenterY) || 1;
        const nx = towardCenterX / len;
        const ny = towardCenterY / len;
        const fall = pressure * (spec.trailFalloff ** trail);
        out.push({
          x: base.x + nx * spec.trailSpacing * trail,
          y: base.y + ny * spec.trailSpacing * trail,
          pressure: fall,
          t: sample.t,
        });
      }
    }
  }

  return Object.freeze(out);
}

export function expandStudioSilkPath(
  path: readonly StudioSilkPoint[],
  partialSpec?: Partial<StudioSilkGenerativeSpec>,
): readonly StudioSilkPoint[] {
  const expanded: StudioSilkPoint[] = [];
  for (const sample of path) {
    expanded.push(...expandStudioSilkSample(sample, partialSpec));
  }
  return Object.freeze(expanded);
}

export function studioSilkVariationCount(partialSpec?: Partial<StudioSilkGenerativeSpec>): number {
  const spec = normalizeSpec(partialSpec);
  const mirrors = spec.mirror ? 2 : 1;
  return spec.arms * mirrors * (1 + spec.trailCopies);
}
