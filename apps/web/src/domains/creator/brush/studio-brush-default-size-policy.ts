import type { StudioBrushMaterialGroup } from "./studio-brush-visual";

interface StudioBrushSizeLimit {
  readonly softCap: number;
  readonly hardCap: number;
  readonly compression: number;
}

/**
 * Product start-size envelope, tuned by perceived footprint rather than raw simulation radius.
 *
 * Material engines need a wide authored radius for grain, diffusion, particles and bristle lanes,
 * but applying that raw radius as the artist's first stroke makes many presets feel two to three
 * sizes too large. Values below the soft cap stay byte-for-byte unchanged; only oversized defaults
 * are compressed. The renderer still receives the selected stroke width as its live size override.
 */
const STUDIO_BRUSH_START_SIZE_LIMITS: Readonly<Record<StudioBrushMaterialGroup, StudioBrushSizeLimit>> =
  Object.freeze({
    ink: { softCap: 12, hardCap: 20, compression: 0.34 },
    pencil: { softCap: 10, hardCap: 18, compression: 0.34 },
    marker: { softCap: 20, hardCap: 30, compression: 0.34 },
    watercolor: { softCap: 28, hardCap: 42, compression: 0.34 },
    oil: { softCap: 30, hardCap: 44, compression: 0.34 },
    airbrush: { softCap: 32, hardCap: 48, compression: 0.36 },
    pastel: { softCap: 22, hardCap: 34, compression: 0.34 },
    texture: { softCap: 28, hardCap: 42, compression: 0.34 },
    tone: { softCap: 20, hardCap: 30, compression: 0.34 },
    fx: { softCap: 28, hardCap: 44, compression: 0.36 },
    eraser: { softCap: 32, hardCap: 48, compression: 0.4 },
  });

export interface StudioBrushDefaultSizeProfile {
  readonly sourceWidth: number;
  readonly defaultWidth: number;
  readonly recommendedMin: number;
  readonly recommendedMax: number;
  readonly sizeClassLabel: "극세" | "세필" | "중간" | "광폭" | "초광폭";
  readonly normalized: boolean;
}

function finiteWidth(value: number): number {
  return Number.isFinite(value) ? Math.min(240, Math.max(1, value)) : 1;
}

function sizeClassLabel(width: number): StudioBrushDefaultSizeProfile["sizeClassLabel"] {
  if (width <= 3) return "극세";
  if (width <= 8) return "세필";
  if (width <= 18) return "중간";
  if (width <= 32) return "광폭";
  return "초광폭";
}

/** Returns the artist-facing start width while preserving intentionally fine and medium presets. */
export function studioBrushDefaultStartWidth(
  mediaGroup: StudioBrushMaterialGroup,
  authoredWidth: number,
): number {
  const sourceWidth = finiteWidth(authoredWidth);
  const limit = STUDIO_BRUSH_START_SIZE_LIMITS[mediaGroup];
  if (sourceWidth <= limit.softCap) return Math.round(sourceWidth);
  return Math.round(Math.min(
    limit.hardCap,
    limit.softCap + (sourceWidth - limit.softCap) * limit.compression,
  ));
}

export function studioBrushDefaultSizeProfile(
  mediaGroup: StudioBrushMaterialGroup,
  authoredWidth: number,
): StudioBrushDefaultSizeProfile {
  const sourceWidth = finiteWidth(authoredWidth);
  const defaultWidth = studioBrushDefaultStartWidth(mediaGroup, sourceWidth);
  const lowerRatio = mediaGroup === "ink" || mediaGroup === "pencil" || mediaGroup === "tone"
    ? 0.45
    : 0.34;
  const upperRatio = mediaGroup === "airbrush" || mediaGroup === "watercolor" || mediaGroup === "fx"
    ? 1.9
    : 1.65;
  return Object.freeze({
    sourceWidth,
    defaultWidth,
    recommendedMin: Math.max(1, Math.round(defaultWidth * lowerRatio)),
    recommendedMax: Math.min(80, Math.max(defaultWidth, Math.round(defaultWidth * upperRatio))),
    sizeClassLabel: sizeClassLabel(defaultWidth),
    normalized: defaultWidth !== Math.round(sourceWidth),
  });
}
