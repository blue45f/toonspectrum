import {
  normalizeStudioBrushDynamicsSettings,
  serializeStudioBrushDynamicsSettingsCanonical,
  studioBrushDynamicsPresetSettings,
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsMappingSettings,
  type StudioBrushDynamicsSettings,
} from "./studio-brush-dynamics";
import {
  applyStudioBrushPackExpansionTuning,
  studioBrushPackExpansionTuningById,
} from "./studio-brush-pack-expansion";
import { STUDIO_BRUSH_PACK_CATALOG_IDS, type StudioBrushPackCatalogId } from "./studio-brush-pack-id";
import {
  STUDIO_BRUSH_PACK_DESCRIPTORS,
  studioBrushPackDescriptorById,
  type StudioBrushPackDescriptor,
  type StudioBrushPackRuntimeBrushId,
} from "./studio-brush-pack-index";
import {
  encodeStudioBrushTipAlphaMapBase64,
  normalizeStudioBrushTipSettings,
  type NormalizedStudioBrushTipSettings,
  type StudioBrushTipShapeId,
} from "./studio-brush-tip-stamp";

import type { StudioBrushCatalogSelection } from "./studio-brush-selection";
import type { StudioBrushTipLayerSettings } from "./studio-brush-tip-composition";
import type { StudioBrushPreviewStyle } from "./studio-brush-visual";
import type { StudioBrushMediaGroup } from "./studio-creative-ux";

export const STUDIO_BRUSH_PACK_CUSTOM_TIP_MOTIFS = [
  "square",
  "chisel",
  "line-block",
  "rake",
  "leaf",
  "leaf-cluster",
  "grass",
  "oval-stack",
  "checker",
  "hair",
  "stripe",
  "footstep",
  "heart",
  "cross-hatch",
  "halftone",
  "weave",
  "fold",
  "pine",
] as const;

export type StudioBrushPackCustomTipMotif =
  (typeof STUDIO_BRUSH_PACK_CUSTOM_TIP_MOTIFS)[number];
export type StudioBrushPackTipMotif = StudioBrushTipShapeId | StudioBrushPackCustomTipMotif;

export interface StudioBrushPackSelection extends StudioBrushCatalogSelection {
  catalogId: StudioBrushPackCatalogId;
  runtimeBrushId: StudioBrushPackRuntimeBrushId;
  brushDynamics: NormalizedStudioBrushDynamicsSettings;
  mediaGroup: StudioBrushMediaGroup;
  previewStyle: StudioBrushPreviewStyle;
  shortName: string;
  hint: string;
}

const CUSTOM_MOTIF_SET: ReadonlySet<string> = new Set(STUDIO_BRUSH_PACK_CUSTOM_TIP_MOTIFS);
const CUSTOM_TIP_SIZE = 24;

/**
 * Compact per-brush physics row. Values are intentionally renderer-neutral:
 * `[motif, spacing bias, scatter bias, roundness, angle, behavior flags]`.
 */
type CompactProfileRow = readonly [
  motif: StudioBrushPackTipMotif,
  spacingBias: number,
  scatterBias: number,
  roundness: number,
  angle: number,
  flags: number,
];

const FOLLOW_DIRECTION = 1;
const TAPER = 2;
const PRESSURE_OPACITY = 4;
const WIDTH_GRAIN = 8;
const ANGLE_GRAIN = 16;
const SPEED_SPACING = 32;

/* Aligned with STUDIO_BRUSH_PACK_CATALOG_IDS; no alpha bitmap or third-party asset is stored. */
const COMPACT_PROFILE_ROWS: readonly CompactProfileRow[] = [
  ["hard", 0.00, 0.00, 1.00, 0, FOLLOW_DIRECTION | TAPER],
  ["hard", -0.05, 0.00, 0.92, 0, FOLLOW_DIRECTION | TAPER | SPEED_SPACING],
  ["sumi", -0.03, 0.02, 0.62, -8, FOLLOW_DIRECTION | TAPER | ANGLE_GRAIN],
  ["soft", 0.12, 0.02, 1.00, 0, PRESSURE_OPACITY],
  ["soft", 0.18, 0.04, 1.00, 0, PRESSURE_OPACITY | WIDTH_GRAIN],
  ["grain", 0.06, 0.09, 0.86, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | SPEED_SPACING],
  ["round", 0.02, 0.03, 0.96, 0, FOLLOW_DIRECTION | TAPER],
  ["bristle", 0.08, 0.06, 0.7, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN],
  ["grain", -0.02, 0.02, 0.82, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY],
  ["soft", 0.05, 0.03, 0.84, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN],
  ["hair", 0.00, 0.01, 0.42, 0, FOLLOW_DIRECTION | TAPER],
  ["round", 0.03, 0.00, 1.00, 0, PRESSURE_OPACITY],
  ["chisel", 0.02, 0.00, 0.48, -18, FOLLOW_DIRECTION | PRESSURE_OPACITY],
  ["grain", 0.08, 0.08, 0.88, 0, WIDTH_GRAIN | PRESSURE_OPACITY],
  ["sponge", 0.11, 0.12, 0.82, 0, WIDTH_GRAIN | ANGLE_GRAIN],
  ["chisel", 0.06, 0.04, 0.54, -12, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["stripe", 0.12, 0.05, 0.52, 20, FOLLOW_DIRECTION | ANGLE_GRAIN],
  ["hair", 0.1, 0.06, 0.5, -10, FOLLOW_DIRECTION | ANGLE_GRAIN | SPEED_SPACING],
  ["sponge", 0.14, 0.09, 0.9, 0, PRESSURE_OPACITY | WIDTH_GRAIN],
  ["line-block", 0.05, 0.01, 0.42, -20, FOLLOW_DIRECTION | TAPER],
  ["square", 0.03, 0.00, 1.00, 0, FOLLOW_DIRECTION],
  ["chisel", -0.01, 0.00, 0.28, 0, FOLLOW_DIRECTION | TAPER],
  ["chisel", -0.01, 0.00, 0.28, 90, FOLLOW_DIRECTION | TAPER],
  ["chisel", 0.03, 0.00, 0.44, -12, FOLLOW_DIRECTION],
  ["chisel", 0.08, 0.16, 0.46, -8, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN],
  ["chisel", 0.24, 0.02, 0.46, -12, FOLLOW_DIRECTION],
  ["chisel", 0.11, 0.2, 0.42, -10, FOLLOW_DIRECTION | ANGLE_GRAIN | SPEED_SPACING],
  ["round", 0.01, 0.00, 0.96, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY],
  ["bristle", 0.07, 0.03, 0.72, 0, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["chisel", 0.02, 0.00, 0.42, -16, FOLLOW_DIRECTION | PRESSURE_OPACITY],
  ["chisel", 0.09, 0.01, 0.5, -12, FOLLOW_DIRECTION | PRESSURE_OPACITY],
  ["round", 0.01, 0.00, 0.55, -8, FOLLOW_DIRECTION],
  ["checker", 0.12, 0.02, 0.82, 0, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["grain", 0.1, 0.1, 0.86, 0, WIDTH_GRAIN | ANGLE_GRAIN],
  ["sponge", 0.13, 0.12, 0.88, 0, WIDTH_GRAIN | PRESSURE_OPACITY],
  ["sponge", 0.17, 0.08, 0.78, 0, WIDTH_GRAIN | ANGLE_GRAIN | SPEED_SPACING],
  ["sponge", 0.16, 0.05, 0.92, 0, PRESSURE_OPACITY | ANGLE_GRAIN],
  ["grain", 0.14, 0.2, 0.9, 0, WIDTH_GRAIN],
  ["sponge", 0.18, 0.08, 0.76, 0, WIDTH_GRAIN | ANGLE_GRAIN],
  ["sponge", 0.2, 0.14, 0.72, 0, WIDTH_GRAIN | ANGLE_GRAIN | SPEED_SPACING],
  ["hair", 0.12, 0.16, 0.6, 0, ANGLE_GRAIN | PRESSURE_OPACITY],
  ["grain", 0.15, 0.12, 0.84, 0, WIDTH_GRAIN | PRESSURE_OPACITY],
  ["round", 0.02, 0.00, 0.94, 0, FOLLOW_DIRECTION | TAPER],
  ["sumi", 0.03, 0.02, 0.68, -7, FOLLOW_DIRECTION | TAPER | WIDTH_GRAIN],
  ["stripe", 0.11, 0.02, 0.52, 0, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["grain", 0.16, 0.42, 0.92, 0, WIDTH_GRAIN | ANGLE_GRAIN | SPEED_SPACING],
  ["sumi", 0.08, 0.06, 0.64, -6, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN],
  ["rake", 0.08, 0.02, 0.62, 0, FOLLOW_DIRECTION | TAPER],
  ["rake", 0.1, 0.03, 0.54, 0, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["rake", 0.14, 0.05, 0.58, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | SPEED_SPACING],
  ["grass", 0.16, 0.22, 0.72, 0, FOLLOW_DIRECTION | ANGLE_GRAIN],
  ["grass", 0.2, 0.48, 0.62, 0, FOLLOW_DIRECTION | ANGLE_GRAIN | SPEED_SPACING],
  ["grass", 0.11, 0.22, 0.68, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN],
  ["leaf", 0.18, 0.28, 0.66, 0, FOLLOW_DIRECTION | ANGLE_GRAIN],
  ["leaf", 0.16, 0.22, 0.44, 0, FOLLOW_DIRECTION | ANGLE_GRAIN],
  ["leaf", 0.14, 0.18, 0.8, 0, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["leaf-cluster", 0.2, 0.38, 0.7, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN],
  ["flake", 0.22, 0.24, 0.8, 0, ANGLE_GRAIN | WIDTH_GRAIN],
  ["round", 0.2, 0.5, 0.58, 0, ANGLE_GRAIN | WIDTH_GRAIN],
  ["round", 0.22, 0.02, 0.56, 0, FOLLOW_DIRECTION],
  ["oval-stack", 0.26, 0.12, 0.54, 0, ANGLE_GRAIN | WIDTH_GRAIN],
  ["checker", 0.24, 0.00, 1.00, 0, FOLLOW_DIRECTION],
  ["hair", 0.05, 0.01, 0.38, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY],
  ["stripe", 0.14, 0.00, 0.68, 0, FOLLOW_DIRECTION],
  ["stripe", 0.16, 0.06, 0.62, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN],
  ["footstep", 0.34, 0.04, 0.72, 0, FOLLOW_DIRECTION],
  ["heart", 0.3, 0.08, 0.82, 0, FOLLOW_DIRECTION | ANGLE_GRAIN],
  ["hard", -0.06, 0, 0.34, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY | SPEED_SPACING],
  ["sumi", 0.13, 0.05, 0.58, -7, FOLLOW_DIRECTION | TAPER | WIDTH_GRAIN | ANGLE_GRAIN | SPEED_SPACING],
  ["chisel", 0.07, 0.04, 0.28, -18, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["sponge", 0.1, 0.08, 0.45, -12, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["round", 0.04, 0.01, 0.9, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY],
  ["chisel", 0.1, 0.02, 0.32, -12, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN],
  ["sponge", 0.03, 0.01, 0.82, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN],
  ["oval-stack", 0.08, 0.03, 0.6, -8, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["chisel", 0.02, 0, 0.34, -22, FOLLOW_DIRECTION | PRESSURE_OPACITY],
  ["bristle", 0.05, 0.02, 0.58, -8, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["square", -0.05, 0, 1, 0, FOLLOW_DIRECTION],
  ["checker", 0.16, 0, 1, 0, FOLLOW_DIRECTION],
  ["cross-hatch", 0.18, 0.01, 0.92, 0, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["rake", 0.14, 0.04, 0.52, 0, FOLLOW_DIRECTION | TAPER | SPEED_SPACING],
  ["halftone", 0.14, 0, 1, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY],
  ["soft", 0.22, 0.58, 1, 0, PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["weave", 0.12, 0.03, 0.82, 0, FOLLOW_DIRECTION | WIDTH_GRAIN],
  ["hair", 0.04, 0.015, 0.28, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY | ANGLE_GRAIN],
  ["fold", 0.11, 0.04, 0.5, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN | SPEED_SPACING],
  ["pine", 0.18, 0.32, 0.58, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | ANGLE_GRAIN],
  // ── 2026-07 확장 웨이브(33) — 세부 물성은 studio-brush-pack-expansion.ts 튜닝이 덮어쓴다.
  ["grain", 0.02, 0.04, 0.86, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY | WIDTH_GRAIN],
  ["hard", -0.06, 0.00, 0.97, 0, FOLLOW_DIRECTION | TAPER],
  ["grain", 0.04, 0.05, 0.8, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY | WIDTH_GRAIN],
  ["sponge", 0.06, 0.08, 0.66, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["grain", 0.08, 0.03, 0.8, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN],
  ["hard", -0.05, 0.00, 0.9, 0, FOLLOW_DIRECTION | TAPER | SPEED_SPACING],
  ["hard", -0.07, 0.00, 0.95, 0, FOLLOW_DIRECTION | TAPER],
  ["round", -0.04, 0.00, 0.93, 0, FOLLOW_DIRECTION | TAPER],
  ["sumi", -0.02, 0.02, 0.55, -6, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY | SPEED_SPACING],
  ["chisel", 0.00, 0.00, 0.24, -32, TAPER],
  ["hard", -0.03, 0.00, 1.00, 0, 0],
  ["soft", 0.08, 0.04, 1.00, 0, PRESSURE_OPACITY | WIDTH_GRAIN],
  ["sponge", 0.14, 0.08, 0.94, 0, PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["bristle", -0.07, 0.01, 0.62, -6, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["bristle", 0.08, 0.05, 0.58, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY | WIDTH_GRAIN | SPEED_SPACING],
  ["sponge", 0.09, 0.05, 0.85, 0, PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["grain", 0.03, 0.03, 0.78, 0, FOLLOW_DIRECTION | TAPER | PRESSURE_OPACITY | WIDTH_GRAIN],
  ["soft", 0.2, 0.02, 1.00, 0, PRESSURE_OPACITY],
  ["sponge", 0.6, 0.16, 0.9, 0, PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["soft", 0.08, 0.00, 0.86, 0, PRESSURE_OPACITY],
  ["chisel", 0.00, 0.00, 0.3, -35, 0],
  ["hard", 0.28, 0.9, 1.00, 0, PRESSURE_OPACITY | WIDTH_GRAIN | SPEED_SPACING],
  ["star", 0.55, 0.5, 1.00, 0, ANGLE_GRAIN | WIDTH_GRAIN],
  ["leaf", 0.45, 0.6, 0.6, 0, ANGLE_GRAIN | WIDTH_GRAIN],
  ["sponge", 0.22, 0.1, 1.00, 0, PRESSURE_OPACITY | WIDTH_GRAIN | ANGLE_GRAIN],
  ["fold", 0.85, 0.00, 0.55, 90, FOLLOW_DIRECTION],
  ["halftone", 0.3, 0.00, 1.00, 0, FOLLOW_DIRECTION | PRESSURE_OPACITY],
  ["hair", 0.35, 0.5, 0.3, -70, SPEED_SPACING | WIDTH_GRAIN],
  ["star", 0.9, 0.35, 1.00, 0, PRESSURE_OPACITY | WIDTH_GRAIN],
  ["flake", 0.55, 0.65, 0.95, 0, ANGLE_GRAIN | WIDTH_GRAIN],
  ["hard", 0.45, 0.8, 0.9, 0, WIDTH_GRAIN],
  ["hair", 0.06, 0.1, 0.5, 0, FOLLOW_DIRECTION | TAPER | ANGLE_GRAIN],
  ["fold", 0.08, 0.02, 0.6, 0, FOLLOW_DIRECTION | WIDTH_GRAIN | SPEED_SPACING],
];

if (COMPACT_PROFILE_ROWS.length !== STUDIO_BRUSH_PACK_CATALOG_IDS.length) {
  throw new Error("Studio procedural brush runtime table is out of sync with its stable ids");
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothEdge(distance: number, inner: number, outer: number): number {
  if (distance <= inner) return 1;
  if (distance >= outer) return 0;
  const amount = (outer - distance) / Math.max(0.0001, outer - inner);
  return amount * amount * (3 - 2 * amount);
}

function hashUnit(x: number, y: number, seed: number): number {
  let hash = Math.imul((x | 0) ^ seed, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16) ^ (y | 0), 0x45d9f3b);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffff_ffff;
}

function rotatedEllipseAlpha(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  angle: number
): number {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const offsetX = x - centerX;
  const offsetY = y - centerY;
  const localX = (offsetX * cosine + offsetY * sine) / radiusX;
  const localY = (-offsetX * sine + offsetY * cosine) / radiusY;
  return smoothEdge(Math.hypot(localX, localY), 0.76, 1);
}

function distanceToSegment(
  x: number,
  y: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): number {
  const segmentX = endX - startX;
  const segmentY = endY - startY;
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  const amount = lengthSquared > 0
    ? clamp01(((x - startX) * segmentX + (y - startY) * segmentY) / lengthSquared)
    : 0;
  return Math.hypot(x - (startX + segmentX * amount), y - (startY + segmentY * amount));
}

function customTipAlpha(
  motif: StudioBrushPackCustomTipMotif,
  x: number,
  y: number,
  variant: number
): number {
  const absX = Math.abs(x);
  const absY = Math.abs(y);
  const radius = Math.hypot(x, y);
  const phase = (variant % 11) * 0.17;

  switch (motif) {
    case "square": {
      const skewedX = x + y * (((variant % 3) - 1) * 0.06);
      return smoothEdge(Math.max(Math.abs(skewedX), absY), 0.72, 0.9);
    }
    case "chisel": {
      const skewedX = x + y * (0.18 + (variant % 4) * 0.035);
      const boundary = Math.max(Math.abs(skewedX) * 0.58, absY * 1.48);
      return smoothEdge(boundary, 0.72, 0.96);
    }
    case "rake": {
      if (absY >= 0.94) return 0;
      const count = 4 + (variant % 4);
      const position = ((x + 0.92) / 1.84) * (count - 1);
      const lineDistance = Math.abs(position - Math.round(position));
      const line = smoothEdge(lineDistance, 0.07, 0.18 + (variant % 2) * 0.025);
      return line * smoothEdge(Math.hypot(x * 0.92, y), 0.78, 0.98);
    }
    case "line-block": {
      const thinLine = smoothEdge(Math.max(Math.abs(x + 0.26) / 0.7, absY / 0.075), 0.72, 1);
      const block = smoothEdge(Math.max(Math.abs(x - 0.45) / 0.28, absY / 0.52), 0.76, 1);
      return Math.max(thinLine, block);
    }
    case "leaf": {
      if (absY >= 0.96) return 0;
      const belly = Math.pow(Math.max(0, 1 - absY / 0.96), 0.58) * (0.48 + (variant % 4) * 0.055);
      const body = smoothEdge(absX, Math.max(0, belly - 0.1), belly);
      const vein = smoothEdge(absX, 0, 0.045 + (variant % 2) * 0.012) * 0.35;
      return clamp01(Math.max(body, vein) * smoothEdge(absY, 0.82, 0.98));
    }
    case "leaf-cluster": {
      const left = rotatedEllipseAlpha(x, y, -0.28, 0.12, 0.28, 0.62, -0.58);
      const right = rotatedEllipseAlpha(x, y, 0.3, 0.08, 0.29, 0.65, 0.6);
      const top = rotatedEllipseAlpha(x, y, 0, -0.34, 0.25, 0.55, 0.04);
      const stem = smoothEdge(Math.abs(x + y * 0.08), 0.018, 0.055)
        * smoothEdge(Math.abs(y - 0.34), 0.45, 0.72);
      return clamp01(Math.max(left, right, top, stem));
    }
    case "grass": {
      const count = 3 + (variant % 3);
      let alpha = 0;
      for (let blade = 0; blade < count; blade++) {
        const base = -0.62 + blade * (1.24 / Math.max(1, count - 1));
        const progress = clamp01((1 - y) / 1.9);
        const bend = ((blade % 2 === 0 ? -1 : 1) * (0.14 + (variant % 5) * 0.018));
        const targetX = base + bend * progress * progress + Math.sin(progress * 4 + phase) * 0.025;
        const width = 0.055 * (1 - progress * 0.72) + 0.012;
        alpha = Math.max(alpha, smoothEdge(Math.abs(x - targetX), width * 0.35, width));
      }
      return alpha * smoothEdge(absY, 0.82, 1);
    }
    case "checker": {
      if (Math.max(absX, absY) >= 0.94) return 0;
      const cells = 4 + (variant % 3);
      const cellX = Math.floor(((x + 1) / 2) * cells);
      const cellY = Math.floor(((y + 1) / 2) * cells);
      const filled = (cellX + cellY + variant) % 2 === 0;
      const localX = Math.abs((((x + 1) / 2) * cells) % 1 - 0.5);
      const localY = Math.abs((((y + 1) / 2) * cells) % 1 - 0.5);
      const border = Math.max(localX, localY);
      return filled ? smoothEdge(border, 0.36, 0.48) : 0;
    }
    case "hair": {
      const count = 5 + (variant % 4);
      let alpha = 0;
      for (let strand = 0; strand < count; strand++) {
        const origin = -0.68 + strand * (1.36 / Math.max(1, count - 1));
        const targetX = origin + Math.sin(y * (2.2 + strand * 0.13) + phase + strand) * 0.055;
        const strandWidth = 0.018 + ((strand + variant) % 3) * 0.009;
        alpha = Math.max(alpha, smoothEdge(Math.abs(x - targetX), strandWidth * 0.25, strandWidth));
      }
      return alpha * smoothEdge(radius, 0.82, 1);
    }
    case "stripe": {
      if (radius >= 1) return 0;
      const count = 3 + (variant % 5);
      const position = ((x + 0.9) / 1.8) * count;
      const stripeDistance = Math.abs(position - Math.round(position));
      const roughness = 0.82 + hashUnit(Math.round(x * 31), Math.round(y * 31), variant + 71) * 0.18;
      return smoothEdge(stripeDistance, 0.08, 0.2) * smoothEdge(radius, 0.82, 1) * roughness;
    }
    case "oval-stack": {
      const back = rotatedEllipseAlpha(x, y, -0.28, 0.12, 0.48, 0.25, -0.2);
      const middle = rotatedEllipseAlpha(x, y, 0.04, -0.08, 0.58, 0.29, 0.12);
      const front = rotatedEllipseAlpha(x, y, 0.38, 0.14, 0.4, 0.22, 0.28);
      return clamp01(Math.max(back * 0.62, middle * 0.82, front));
    }
    case "cross-hatch": {
      const frequency = 3 + (variant % 3);
      const firstPosition = ((x + y + 2) * frequency) / 4;
      const secondPosition = ((x - y + 2) * frequency) / 4;
      const firstDistance = Math.abs(firstPosition - Math.round(firstPosition));
      const secondDistance = Math.abs(secondPosition - Math.round(secondPosition));
      const lineWidth = 0.045 + (variant % 4) * 0.008;
      const lines = Math.max(
        smoothEdge(firstDistance, lineWidth * 0.35, lineWidth),
        smoothEdge(secondDistance, lineWidth * 0.35, lineWidth)
      );
      return lines * smoothEdge(Math.max(absX, absY), 0.82, 0.98);
    }
    case "halftone": {
      const cells = 4 + (variant % 3);
      const gridX = ((x + 1) / 2) * cells;
      const gridY = ((y + 1) / 2) * cells;
      const localX = gridX - Math.floor(gridX) - 0.5;
      const localY = gridY - Math.floor(gridY) - 0.5;
      const dotRadius = 0.22 + (variant % 5) * 0.025;
      const dot = smoothEdge(Math.hypot(localX, localY), dotRadius * 0.72, dotRadius);
      return dot * smoothEdge(Math.max(absX, absY), 0.84, 0.98);
    }
    case "weave": {
      const frequency = 5 + (variant % 3);
      const gridX = ((x + 1) / 2) * frequency;
      const gridY = ((y + 1) / 2) * frequency;
      const column = Math.floor(gridX);
      const row = Math.floor(gridY);
      const localX = Math.abs(gridX - column - 0.5);
      const localY = Math.abs(gridY - row - 0.5);
      const vertical = smoothEdge(localX, 0.08, 0.22) * ((column + row) % 2 === 0 ? 1 : 0.48);
      const horizontal = smoothEdge(localY, 0.08, 0.22) * ((column + row) % 2 === 0 ? 0.48 : 1);
      return Math.max(vertical, horizontal) * smoothEdge(Math.max(absX, absY), 0.84, 0.98);
    }
    case "fold": {
      const count = 3 + (variant % 4);
      let alpha = 0;
      for (let fold = 0; fold < count; fold++) {
        const origin = -0.68 + fold * (1.36 / Math.max(1, count - 1));
        const curve = Math.sin((y + 1) * (1.4 + fold * 0.18) + phase) * (0.08 + fold * 0.012);
        const width = 0.035 + ((fold + variant) % 3) * 0.012;
        alpha = Math.max(alpha, smoothEdge(Math.abs(x - origin - curve), width * 0.35, width));
      }
      return alpha * smoothEdge(Math.max(absX, absY), 0.84, 0.99);
    }
    case "pine": {
      let alpha = smoothEdge(Math.abs(y), 0.018, 0.055) * smoothEdge(absX, 0.72, 0.9);
      const count = 5 + (variant % 3);
      for (let needle = 0; needle < count; needle++) {
        const originX = -0.65 + needle * (1.3 / Math.max(1, count - 1));
        const length = 0.42 + ((needle + variant) % 3) * 0.08;
        const lean = 0.14 + (needle % 2) * 0.05;
        for (const direction of [-1, 1] as const) {
          const distance = distanceToSegment(
            x,
            y,
            originX,
            0,
            originX + lean,
            direction * length
          );
          alpha = Math.max(alpha, smoothEdge(distance, 0.012, 0.038));
        }
      }
      return alpha * smoothEdge(Math.max(absX, absY), 0.86, 1);
    }
    case "footstep": {
      let alpha = 0;
      for (const [centerX, centerY, mirror] of [
        [-0.3, 0.3, 1],
        [0.3, -0.3, -1],
      ] as const) {
        const localX = (x - centerX) * mirror;
        const localY = y - centerY;
        const soleX = (localX + 0.04) / 0.2;
        const soleY = (localY + 0.01) / 0.34;
        alpha = Math.max(alpha, smoothEdge(Math.hypot(soleX, soleY), 0.7, 1));
        for (let toe = 0; toe < 4; toe++) {
          const toeX = -0.16 + toe * 0.1;
          const toeY = -0.4 - Math.abs(toe - 1.5) * 0.018;
          const toeRadius = 0.055 - Math.abs(toe - 1.5) * 0.006;
          alpha = Math.max(
            alpha,
            smoothEdge(Math.hypot(localX - toeX, localY - toeY), toeRadius * 0.48, toeRadius)
          );
        }
      }
      return alpha;
    }
    case "heart": {
      const hx = x * 1.04;
      const hy = -(y + 0.08) * 1.06;
      const implicit = Math.pow(hx * hx + hy * hy - 0.58, 3) - hx * hx * hy * hy * hy;
      if (implicit > 0.04) return 0;
      return smoothEdge(implicit, -0.08, 0.04) * smoothEdge(radius, 0.86, 1.02);
    }
  }
}

function buildCustomTipBytes(
  motif: StudioBrushPackCustomTipMotif,
  variant: number,
  size = CUSTOM_TIP_SIZE
): Uint8Array {
  const bytes = new Uint8Array(size * size);
  const center = (size - 1) / 2;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = center === 0 ? 0 : (px - center) / center;
      const y = center === 0 ? 0 : (py - center) / center;
      bytes[py * size + px] = Math.round(clamp01(customTipAlpha(motif, x, y, variant)) * 255);
    }
  }
  return bytes;
}

/** Materialize a deterministic procedural/custom alpha tip without any external image asset. */
export function materializeStudioBrushPackTipSettings(
  motif: StudioBrushPackTipMotif,
  variant = 0,
  softness = 0.2
): NormalizedStudioBrushTipSettings {
  if (!CUSTOM_MOTIF_SET.has(motif)) {
    return normalizeStudioBrushTipSettings({ shape: motif, softness });
  }
  const customMotif = motif as StudioBrushPackCustomTipMotif;
  return normalizeStudioBrushTipSettings({
    shape: "hard",
    softness,
    alphaMapSize: CUSTOM_TIP_SIZE,
    alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(
      buildCustomTipBytes(customMotif, variant)
    ),
  });
}

function profileSoftness(descriptor: StudioBrushPackDescriptor, index: number): number {
  if (descriptor.runtimeBrushId === "airbrush") return 0.58 + (index % 5) * 0.065;
  if (descriptor.runtimeBrushId === "dry-media") return 0.08 + (index % 6) * 0.055;
  return 0.04 + (index % 5) * 0.045;
}

function pressureWidthMapping(
  descriptor: StudioBrushPackDescriptor,
  index: number
): StudioBrushDynamicsMappingSettings {
  const dry = descriptor.runtimeBrushId === "dry-media";
  const soft = descriptor.runtimeBrushId === "airbrush";
  return {
    source: "pressure",
    from: dry ? 0.5 + (index % 3) * 0.06 : soft ? 0.7 : 0.22 + (index % 4) * 0.07,
    to: dry ? 1.2 + (index % 4) * 0.08 : soft ? 1.12 + (index % 3) * 0.06 : 1.42 + (index % 5) * 0.075,
    curve: 0.78 + (index % 6) * 0.11,
  };
}

function angleMappings(flags: number): readonly StudioBrushDynamicsMappingSettings[] {
  if ((flags & FOLLOW_DIRECTION) === 0) return [];
  return [{ source: "direction", mode: "add", from: 0, to: 360 }];
}

function colorDynamicsFor(
  descriptor: StudioBrushPackDescriptor,
  index: number
): StudioBrushDynamicsSettings["colorDynamics"] {
  if (descriptor.category === "foliage") {
    return {
      hueJitter: 5 + (index % 4) * 1.5,
      saturationJitter: 0.035 + (index % 3) * 0.015,
      valueJitter: 0.055 + (index % 4) * 0.012,
    };
  }
  if (
    descriptor.category === "pattern"
    || descriptor.category === "stamp"
    || descriptor.category === "tone"
    || descriptor.category === "effect"
  ) {
    return {
      hueJitter: 2 + (index % 3),
      saturationJitter: 0.02,
      valueJitter: 0.035 + (index % 3) * 0.012,
    };
  }
  if (descriptor.category === "paint" || descriptor.category === "marker") {
    return { valueJitter: 0.018 + (index % 4) * 0.009 };
  }
  return undefined;
}

function grainFor(
  descriptor: StudioBrushPackDescriptor,
  index: number
): StudioBrushDynamicsSettings["grain"] {
  const textured = descriptor.category === "sketch"
    || descriptor.category === "chalk"
    || descriptor.category === "texture"
    || descriptor.category === "rake";
  if (!textured) return undefined;
  return {
    space: index % 2 === 0 ? "canvas-fixed" : "stroke-fixed",
    amount: descriptor.category === "texture"
      ? 0.34 + (index % 4) * 0.055
      : 0.2 + (index % 4) * 0.045,
    scale: 2.5 + (index % 7) * 1.15,
    contrast: 0.38 + (index % 5) * 0.09,
    seed: (0x6d2b_79f5 + Math.imul(index + 3, 0x85eb_ca6b)) >>> 0,
  };
}

function tipLayersFor(
  descriptor: StudioBrushPackDescriptor,
  motif: StudioBrushPackTipMotif,
  index: number
): readonly StudioBrushTipLayerSettings[] | undefined {
  if (descriptor.category === "rake") {
    return [
      {
        tip: materializeStudioBrushPackTipSettings(motif, index + 101, 0.12),
        scale: 0.78,
        opacity: 0.62,
        offsetY: -0.48,
        angle: -3,
        roundness: 0.82,
      },
      {
        tip: materializeStudioBrushPackTipSettings(motif, index + 211, 0.16),
        scale: 0.64,
        opacity: 0.46,
        offsetY: 0.5,
        angle: 4,
        roundness: 0.7,
      },
    ];
  }
  if (descriptor.category === "foliage" && motif === "pine") {
    return [
      {
        tip: materializeStudioBrushPackTipSettings("pine", index + 79, 0.08),
        scale: 0.72,
        opacity: 0.64,
        offsetX: 0.34,
        offsetY: -0.28,
        angle: 18,
        roundness: 0.7,
      },
      {
        tip: materializeStudioBrushPackTipSettings("hair", index + 37, 0.1),
        scale: 0.34,
        opacity: 0.4,
        offsetX: -0.38,
        offsetY: 0.3,
        angle: -16,
        roundness: 0.54,
      },
    ];
  }
  if (descriptor.category === "foliage") {
    return [
      {
        tip: materializeStudioBrushPackTipSettings("leaf", index + 79, 0.1),
        scale: 0.7,
        opacity: 0.68,
        offsetX: 0.4,
        offsetY: -0.32,
        angle: 24,
        roundness: 0.72,
      },
      {
        tip: materializeStudioBrushPackTipSettings("round", index, 0.18),
        scale: 0.3,
        opacity: 0.42,
        offsetX: -0.42,
        offsetY: 0.28,
        angle: -18,
        roundness: 0.8,
      },
    ];
  }
  if (
    descriptor.category === "pattern"
    && (motif === "oval-stack" || motif === "stripe" || motif === "checker")
  ) {
    return [{
      tip: materializeStudioBrushPackTipSettings(motif, index + 53, 0.14),
      scale: 0.62,
      opacity: 0.58,
      offsetY: 0.52,
      angle: 12,
      roundness: 0.78,
    }];
  }
  return undefined;
}

/** Expand one compact catalogue row into a detached, finite, renderer-ready settings snapshot. */
export function materializeStudioBrushPackDynamics(
  value: unknown
): NormalizedStudioBrushDynamicsSettings | null {
  const descriptor = studioBrushPackDescriptorById(value);
  if (!descriptor) return null;
  const index = STUDIO_BRUSH_PACK_CATALOG_IDS.indexOf(descriptor.catalogId);
  const profile = COMPACT_PROFILE_ROWS[index]!;
  const motif = profile[0];
  const flags = profile[5];
  const tuning = studioBrushPackExpansionTuningById(descriptor.catalogId);
  const base = studioBrushDynamicsPresetSettings(descriptor.runtimeBrushId);
  const widthMapping = pressureWidthMapping(descriptor, index);
  const opacityMappings: StudioBrushDynamicsMappingSettings[] = (flags & PRESSURE_OPACITY) !== 0
    ? [{ source: "pressure", from: 0.32 + (index % 4) * 0.07, to: 1, curve: 0.82 + (index % 5) * 0.1 }]
    : [];
  const spacingMappings: StudioBrushDynamicsMappingSettings[] = (flags & SPEED_SPACING) !== 0
    ? [{ source: "speed", from: 0.78, to: 1.3 + (index % 4) * 0.08 }]
    : [];
  const seed = (0x51f1_5e5d + Math.imul(index + 1, 0x9e37_79b1)) >>> 0;
  const spacingBase = descriptor.runtimeBrushId === "airbrush"
    ? 0.18
    : descriptor.runtimeBrushId === "dry-media" ? 0.2 : 0.12;
  const scatterBase = descriptor.runtimeBrushId === "airbrush"
    ? 0.2
    : descriptor.runtimeBrushId === "dry-media" ? 0.04 : 0;
  // Toolbar opacity is stored on the draw element and multiplied after every planned dab. Keep
  // the dynamics opacity neutral so a 34% catalogue default is not applied twice (0.34²) before
  // flow/pressure. Media character belongs to flow; the artist's opacity lock remains an outer,
  // predictable control.
  const flowBase = descriptor.runtimeBrushId === "airbrush"
    ? 0.22 + (index % 4) * 0.035
    : descriptor.runtimeBrushId === "dry-media"
      ? 0.46 + (index % 5) * 0.045
      : 0.72 + (index % 4) * 0.055;
  const settings: StudioBrushDynamicsSettings = {
    ...base,
    seed,
    fallbackPressure: 0.48 + (index % 5) * 0.025,
    maxSpeed: 1.2 + (index % 7) * 0.14,
    tip: materializeStudioBrushPackTipSettings(
      motif,
      index,
      tuning?.tipSoftness ?? profileSoftness(descriptor, index)
    ),
    colorDynamics: colorDynamicsFor(descriptor, index),
    grain: grainFor(descriptor, index),
    tipLayers: tipLayersFor(descriptor, motif, index),
    taper: {
      ...base.taper,
      enabled: (flags & TAPER) !== 0,
      startLength: 0.06 + (index % 5) * 0.018,
      endLength: 0.1 + (index % 6) * 0.018,
      minSizeRatio: 0.12 + (index % 4) * 0.06,
      minOpacityRatio: 0.34 + (index % 5) * 0.07,
      curve: 0.82 + (index % 6) * 0.12,
    },
    width: {
      ...base.width,
      base: descriptor.defaultWidth,
      mappings: [widthMapping],
      jitter: (flags & WIDTH_GRAIN) !== 0
        ? { mode: "multiply", amount: 0.035 + (index % 6) * 0.022 }
        : null,
    },
    opacity: {
      ...base.opacity,
      base: 1,
      mappings: opacityMappings,
      jitter: descriptor.runtimeBrushId === "dry-media"
        ? { mode: "multiply", amount: 0.04 + (index % 5) * 0.018 }
        : null,
    },
    flow: {
      ...base.flow,
      base: Math.min(1, flowBase),
      mappings: (flags & PRESSURE_OPACITY) !== 0
        ? [{ source: "pressure", from: 0.58, to: 1, curve: 0.9 + (index % 3) * 0.12 }]
        : [],
    },
    spacingRatio: Math.max(0.02, spacingBase + profile[1] + (index % 11) * 0.0031),
    spacing: { ...base.spacing, mappings: spacingMappings },
    scatterRatio: Math.max(0, scatterBase + profile[2] + (index % 13) * 0.0027),
    scatter: {
      ...base.scatter,
      mappings: profile[2] > 0.1
        ? [{ source: "speed", from: 0.62, to: 1.18 + (index % 5) * 0.08 }]
        : [],
      jitter: profile[2] > 0.02 ? { mode: "add", amount: 0.08 + (index % 7) * 0.025 } : null,
    },
    angle: {
      ...base.angle,
      base: profile[4] + ((index % 3) - 1) * 1.5,
      mappings: angleMappings(flags),
      jitter: (flags & ANGLE_GRAIN) !== 0
        ? { mode: "add", amount: 3 + (index % 7) * 2.25 }
        : null,
    },
    roundness: {
      ...base.roundness,
      base: profile[3],
      mappings: motif === "chisel" || motif === "leaf" || motif === "leaf-cluster"
        ? [{ source: "tilt-magnitude", from: 1, to: 0.72, amount: 0.5 }]
        : [],
      jitter: (flags & WIDTH_GRAIN) !== 0
        ? { mode: "multiply", amount: 0.025 + (index % 4) * 0.018 }
        : null,
    },
  };
  if (tuning) {
    // Expansion presets replace the index-derived formula with hand-tuned physics. Catalogue
    // width and the neutral dynamics opacity stay invariant so the toolbar remains the artist's
    // outer control (same contract as the formula path above).
    const tuned = applyStudioBrushPackExpansionTuning(settings, tuning);
    return normalizeStudioBrushDynamicsSettings({
      ...tuned,
      width: { ...tuned.width, base: descriptor.defaultWidth },
      opacity: { ...tuned.opacity, base: 1 },
    });
  }
  return normalizeStudioBrushDynamicsSettings(settings);
}

/**
 * Materialize the serializable selection contract consumed by StudioPage. The catalogue id/name
 * remain available for UI history while runtimeBrushId + brushDynamics are sufficient to replay.
 */
export function materializeStudioBrushPackSelection(
  value: unknown
): StudioBrushPackSelection | null {
  const descriptor = studioBrushPackDescriptorById(value);
  if (!descriptor) return null;
  const brushDynamics = materializeStudioBrushPackDynamics(descriptor.catalogId);
  if (!brushDynamics) return null;
  return {
    catalogId: descriptor.catalogId,
    catalogName: descriptor.catalogName,
    defaultWidth: descriptor.defaultWidth,
    defaultOpacity: descriptor.defaultOpacity,
    runtimeBrushId: descriptor.runtimeBrushId,
    brushDynamics,
    mediaGroup: descriptor.mediaGroup,
    previewStyle: descriptor.previewStyle,
    shortName: descriptor.shortName,
    hint: descriptor.hint,
  };
}

/** Stable cache/collaboration key for a fully materialized library behavior. */
export function studioBrushPackRuntimeSignature(value: unknown): string | null {
  const selection = materializeStudioBrushPackSelection(value);
  if (!selection) return null;
  return `${selection.runtimeBrushId}:${serializeStudioBrushDynamicsSettingsCanonical(selection.brushDynamics)}`;
}

/** Eager materialization is intentionally opt-in; the library loader may call this after import. */
export function materializeAllStudioBrushPackSelections(): readonly StudioBrushPackSelection[] {
  return STUDIO_BRUSH_PACK_DESCRIPTORS.map((descriptor) =>
    materializeStudioBrushPackSelection(descriptor.catalogId)!
  );
}
