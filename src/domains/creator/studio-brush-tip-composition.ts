/**
 * Bounded dual/multi-tip composition for dynamic dabs.
 *
 * The legacy `tip` remains the primary tip. `tipLayers` adds at most two transformed tips, which
 * gives a three-tip renderer while bounding Canvas/SVG work and inline CRDT metadata. Imported
 * alpha maps share one encoded-byte budget; overflow falls back to that layer's procedural shape.
 */

import {
  normalizeStudioBrushTipSettings,
  type NormalizedStudioBrushTipSettings,
  type StudioBrushTipSettings,
} from "./studio-brush-tip-stamp";

export const STUDIO_BRUSH_TIP_LAYER_MAX_COUNT = 2;
export const STUDIO_BRUSH_TIP_COMBINED_ALPHA_MAP_BASE64_MAX_CHARS = 8 * 1024;

export const STUDIO_BRUSH_TIP_LAYER_LIMITS = {
  scale: { min: 0.1, max: 4 },
  opacity: { min: 0, max: 1 },
  offset: { min: -2, max: 2 },
  roundness: { min: 0.08, max: 2 },
} as const;

export interface StudioBrushTipLayerSettings {
  tip?: StudioBrushTipSettings | null;
  /** Multiplier applied to the primary dab diameter. */
  scale?: number;
  /** Multiplier applied after the primary dab opacity. */
  opacity?: number;
  /** Tip-local offset measured in primary-tip radii. */
  offsetX?: number;
  /** Tip-local offset measured in primary-tip radii. */
  offsetY?: number;
  /** Signed rotation relative to the primary tip. */
  angle?: number;
  /** Multiplier applied to the primary dab roundness. */
  roundness?: number;
}

export interface NormalizedStudioBrushTipLayerSettings {
  tip: NormalizedStudioBrushTipSettings;
  scale: number;
  opacity: number;
  offsetX: number;
  offsetY: number;
  angle: number;
  roundness: number;
}

export interface StudioBrushComposableDab {
  x: number;
  y: number;
  size: number;
  angle: number;
  roundness: number;
  opacity: number;
  flow: number;
}

export interface StudioBrushComposedTipDab {
  role: "primary" | "layer";
  layerIndex: number;
  tip: NormalizedStudioBrushTipSettings;
  dab: StudioBrushComposableDab;
}

/** Builds one normalized secondary-tip dab without allocating a composition result array. */
export function composeNormalizedStudioBrushTipLayerDab(
  dab: StudioBrushComposableDab,
  layer: NormalizedStudioBrushTipLayerSettings
): StudioBrushComposableDab | null {
  if (layer.opacity <= 0) return null;
  const angleRadians = dab.angle * Math.PI / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);
  const radius = Math.max(0.025, finiteNumber(dab.size, 1) / 2);
  const localX = layer.offsetX * radius;
  const localY = layer.offsetY * radius;
  return {
    x: dab.x + localX * cos - localY * sin,
    y: dab.y + localX * sin + localY * cos,
    size: clamp(
      finiteNumber(dab.size, 1) * layer.scale,
      0.05,
      16_384
    ),
    angle: normalizeSignedDegrees(finiteNumber(dab.angle, 0) + layer.angle),
    roundness: clamp(
      finiteNumber(dab.roundness, 1) * layer.roundness,
      0.08,
      1
    ),
    opacity: clamp(finiteNumber(dab.opacity, 1) * layer.opacity, 0, 1),
    flow: clamp(finiteNumber(dab.flow, 1), 0, 1),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeSignedDegrees(value: number): number {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function alphaMapCharacterCount(tip: NormalizedStudioBrushTipSettings): number {
  return tip.alphaMapBase64?.length ?? 0;
}

/** Normalizes extra tip layers and enforces the aggregate inline-alpha budget. */
export function normalizeStudioBrushTipLayers(
  value?: unknown,
  primaryTipValue?: unknown
): readonly NormalizedStudioBrushTipLayerSettings[] {
  if (!Array.isArray(value)) return [];
  const primaryTip = normalizeStudioBrushTipSettings(primaryTipValue);
  let remainingAlphaCharacters = Math.max(
    0,
    STUDIO_BRUSH_TIP_COMBINED_ALPHA_MAP_BASE64_MAX_CHARS
      - alphaMapCharacterCount(primaryTip)
  );
  const layers: NormalizedStudioBrushTipLayerSettings[] = [];
  for (const candidate of value.slice(0, STUDIO_BRUSH_TIP_LAYER_MAX_COUNT)) {
    const source = asRecord(candidate);
    if (!source) continue;
    let tip = normalizeStudioBrushTipSettings(source.tip);
    const alphaCharacters = alphaMapCharacterCount(tip);
    if (alphaCharacters > remainingAlphaCharacters) {
      // Preserve the declared procedural shape/softness while dropping only the oversized payload.
      tip = { ...tip, alphaMapBase64: null };
    } else {
      remainingAlphaCharacters -= alphaCharacters;
    }
    layers.push({
      tip,
      scale: clamp(
        finiteNumber(source.scale, 1),
        STUDIO_BRUSH_TIP_LAYER_LIMITS.scale.min,
        STUDIO_BRUSH_TIP_LAYER_LIMITS.scale.max
      ),
      opacity: clamp(
        finiteNumber(source.opacity, 1),
        STUDIO_BRUSH_TIP_LAYER_LIMITS.opacity.min,
        STUDIO_BRUSH_TIP_LAYER_LIMITS.opacity.max
      ),
      offsetX: clamp(
        finiteNumber(source.offsetX, 0),
        STUDIO_BRUSH_TIP_LAYER_LIMITS.offset.min,
        STUDIO_BRUSH_TIP_LAYER_LIMITS.offset.max
      ),
      offsetY: clamp(
        finiteNumber(source.offsetY, 0),
        STUDIO_BRUSH_TIP_LAYER_LIMITS.offset.min,
        STUDIO_BRUSH_TIP_LAYER_LIMITS.offset.max
      ),
      angle: normalizeSignedDegrees(finiteNumber(source.angle, 0)),
      roundness: clamp(
        finiteNumber(source.roundness, 1),
        STUDIO_BRUSH_TIP_LAYER_LIMITS.roundness.min,
        STUDIO_BRUSH_TIP_LAYER_LIMITS.roundness.max
      ),
    });
  }
  return layers;
}

/** Expands one base dab into its primary and bounded transformed secondary tips. */
export function planStudioBrushTipComposition(
  dab: StudioBrushComposableDab,
  primaryTipValue?: unknown,
  layerValues?: readonly NormalizedStudioBrushTipLayerSettings[] | unknown
): readonly StudioBrushComposedTipDab[] {
  const primaryTip = normalizeStudioBrushTipSettings(primaryTipValue);
  const layers = Array.isArray(layerValues)
    ? normalizeStudioBrushTipLayers(layerValues, primaryTip)
    : [];
  return planNormalizedStudioBrushTipComposition(dab, primaryTip, layers);
}

/** Renderer fast path for settings that already crossed the dynamics normalization boundary. */
export function planNormalizedStudioBrushTipComposition(
  dab: StudioBrushComposableDab,
  primaryTip: NormalizedStudioBrushTipSettings,
  layers: readonly NormalizedStudioBrushTipLayerSettings[]
): readonly StudioBrushComposedTipDab[] {
  const result: StudioBrushComposedTipDab[] = [{
    role: "primary",
    layerIndex: -1,
    tip: primaryTip,
    dab: { ...dab },
  }];

  for (const [layerIndex, layer] of layers.entries()) {
    const composedDab = composeNormalizedStudioBrushTipLayerDab(dab, layer);
    if (!composedDab) continue;
    result.push({
      role: "layer",
      layerIndex,
      tip: layer.tip,
      dab: composedDab,
    });
  }
  return result;
}
