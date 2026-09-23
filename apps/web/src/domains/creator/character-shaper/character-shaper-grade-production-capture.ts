/**
 * Optional production capture bridge for shaper-grade character PSD.
 *
 * When a real VRM/viewport beauty raster is available, pack it into the semantic
 * PSD layer contract (밑색 / 그림자 / 하이라이트 / 선화). Without a raster,
 * fall back to the pure synthetic `captureShaperCharacter` path.
 */

import { CHARACTER_PSD_GROUP_NAMES } from "./character-shaper-psd-assembly";
import {
  captureShaperCharacter,
  type ShaperCharacter,
  type ShaperPsdExport,
  type ShaperPsdLayer,
  type ShaperPsdOmission,
} from "./character-shaper-grade";

export interface ShaperProductionRasterInput {
  readonly width: number;
  readonly height: number;
  /** Beauty / color plate from VRM viewport or multipass capture. */
  readonly beautyRgba: Uint8ClampedArray;
  /** Optional pre-separated semantic layers; omitted layers are derived or omitted. */
  readonly layers?: readonly ShaperPsdLayer[];
}

function isEmptyPass(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i]! > 8) return false;
  }
  return true;
}

function sobelEdgeAlpha(src: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const right = (y * width + x + 1) * 4;
      const below = ((y + 1) * width + x) * 4;
      const gx =
        Math.abs(src[i]! - src[right]!) +
        Math.abs(src[i + 1]! - src[right + 1]!) +
        Math.abs(src[i + 2]! - src[right + 2]!);
      const gy =
        Math.abs(src[i]! - src[below]!) +
        Math.abs(src[i + 1]! - src[below + 1]!) +
        Math.abs(src[i + 2]! - src[below + 2]!);
      const mag = Math.min(255, Math.round((gx + gy) * 0.45));
      if (mag < 24) continue;
      out[i] = 20;
      out[i + 1] = 16;
      out[i + 2] = 16;
      out[i + 3] = mag;
    }
  }
  return out;
}

/**
 * Prefer a production VRM raster when dimensions match; otherwise synthetic capture.
 * Semantic layer names stay aligned with `CHARACTER_PSD_GROUP_NAMES`.
 */
export function captureShaperCharacterFromProduction(
  character: ShaperCharacter,
  width: number,
  height: number,
  production?: ShaperProductionRasterInput | null,
): ShaperPsdExport {
  if (
    !production ||
    production.width !== width ||
    production.height !== height ||
    production.beautyRgba.length !== width * height * 4
  ) {
    return captureShaperCharacter(character, width, height);
  }

  const beauty = production.beautyRgba;
  const omissions: ShaperPsdOmission[] = [];
  const layers: ShaperPsdLayer[] = [];

  if (production.layers && production.layers.length > 0) {
    for (const layer of production.layers) {
      if (layer.rgba.length !== beauty.length || isEmptyPass(layer.rgba)) {
        omissions.push({ name: layer.name, reason: "프로덕션 레이어가 비어 있거나 크기가 맞지 않습니다." });
        continue;
      }
      layers.push(layer);
    }
  } else {
    // Flat beauty as 밑색; derive line; shadow/highlight omitted honestly when not separated.
    layers.push({
      name: "밑색-얼굴",
      rgba: beauty,
      visible: true,
      blend: "source-over",
    });
    omissions.push({
      name: CHARACTER_PSD_GROUP_NAMES.shadow,
      reason: "프로덕션 래스터에서 음영 패스를 분리하지 못했습니다.",
    });
    omissions.push({
      name: CHARACTER_PSD_GROUP_NAMES.highlight,
      reason: "프로덕션 래스터에서 하이라이트 패스를 분리하지 못했습니다.",
    });
    const line = sobelEdgeAlpha(beauty, width, height);
    if (!isEmptyPass(line)) {
      layers.push({
        name: CHARACTER_PSD_GROUP_NAMES.line,
        rgba: line,
        visible: true,
        blend: "source-over",
      });
    }
  }

  return { width, height, beauty, layers, omissions };
}
