/**
 * 주선 추출(이미지 공간, CPU 참조 구현). 채널을 분리해 계산하고 OR로 합친다.
 *   silhouette : 알파 안쪽 경계(픽셀 α>0이고 4-이웃에 α=0) — 캐릭터 실루엣. 선은 항상 실루엣 안쪽에만 놓인다.
 *   depth      : 선형 깊이 Sobel. |∇d| > depthThreshold × max(d, 0.1) (거리 보정, Saito-Takahashi 1990 개념)
 *   crease     : 법선 각도. 3×3 이웃과의 최대 (1 − n·n') > 1 − cos(normalAngleDeg)
 *   partBoundary: part-id 불연속(두 픽셀 모두 >0일 때) — 부위 경계
 *   materialBoundary: material-id 불연속(옵션)
 *   luma       : lit 휘도 Sobel(투명 이웃은 중심값으로 대체해 실루엣과 이중 계산하지 않음) > lumaThreshold
 * 검은 재질 내부는 휘도·깊이·법선 변화가 없으므로 0이다(회귀 테스트: 검은 평면 fixture).
 * 참고: three.js SobelOperatorShader(MIT) 커널 상수, Bénard-Hertzmann 2019 선 추출 개관.
 */
import { decodeIdPass, decodeMaterialIdPass } from "./raster-convert";

import type { CapturedDepth, CapturedRaster } from "../contracts";

export interface LineArtInput {
  readonly lit: CapturedRaster;
  readonly depth?: CapturedDepth;
  /** 법선 패스(rgb = n·0.5+0.5) */
  readonly normal?: CapturedRaster;
  /** 픽셀별 partId(없으면 ID 패스 래스터에서 디코드) */
  readonly partId?: Uint16Array;
  readonly idPass?: CapturedRaster;
  readonly width: number;
  readonly height: number;
}

export interface LineArtOptions {
  /** 휘도 Sobel 임계(0..1, 정규화 기울기) */
  readonly lumaThreshold: number;
  /** 깊이 Sobel 임계(선형 깊이 단위, 거리 보정 전) */
  readonly depthThreshold: number;
  /** 법선 크리즈 각도(도) */
  readonly normalAngleDeg: number;
  readonly idEdges: boolean;
  readonly alphaEdges: boolean;
  readonly materialEdges: boolean;
  readonly lumaEdges: boolean;
  /** 선폭(px). 1이면 팽창 없음, n이면 반지름 floor((n−1)/2)로 팽창 */
  readonly lineWidthPx: number;
}

export const DEFAULT_LINE_ART_OPTIONS: LineArtOptions = Object.freeze({
  lumaThreshold: 0.2,
  depthThreshold: 0.1,
  normalAngleDeg: 35,
  idEdges: true,
  alphaEdges: true,
  materialEdges: false,
  lumaEdges: true,
  lineWidthPx: 1,
});

export interface LineArtChannels {
  readonly silhouette: Uint8ClampedArray;
  readonly depth: Uint8ClampedArray;
  readonly crease: Uint8ClampedArray;
  readonly partBoundary: Uint8ClampedArray;
  readonly materialBoundary: Uint8ClampedArray;
  readonly luma: Uint8ClampedArray;
  /** 모든 채널 OR 후 선폭 팽창 */
  readonly combined: Uint8ClampedArray;
}

function alphaMask(lit: CapturedRaster): Uint8Array {
  const out = new Uint8Array(lit.width * lit.height);
  for (let p = 0; p < out.length; p += 1) out[p] = (lit.rgba[p * 4 + 3] ?? 0) > 0 ? 1 : 0;
  return out;
}

/** 3×3 Sobel 정규화 기울기 크기(단위 계단 → 1). 마스크 밖 이웃은 중심값으로 대체한다. */
export function sobelMagnitude(field: Float32Array, width: number, height: number, mask?: Uint8Array): Float32Array {
  const out = new Float32Array(width * height);
  const sample = (x: number, y: number, cx: number, cy: number): number => {
    const sx = Math.min(width - 1, Math.max(0, x));
    const sy = Math.min(height - 1, Math.max(0, y));
    if (mask && mask[sy * width + sx] === 0) return field[cy * width + cx] ?? 0;
    return field[sy * width + sx] ?? 0;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask && mask[y * width + x] === 0) continue;
      const tl = sample(x - 1, y - 1, x, y);
      const t = sample(x, y - 1, x, y);
      const tr = sample(x + 1, y - 1, x, y);
      const l = sample(x - 1, y, x, y);
      const r = sample(x + 1, y, x, y);
      const bl = sample(x - 1, y + 1, x, y);
      const b = sample(x, y + 1, x, y);
      const br = sample(x + 1, y + 1, x, y);
      const gx = (tr + 2 * r + br - (tl + 2 * l + bl)) / 4;
      const gy = (bl + 2 * b + br - (tl + 2 * t + tr)) / 4;
      out[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return out;
}

function lumaField(lit: CapturedRaster): Float32Array {
  const out = new Float32Array(lit.width * lit.height);
  for (let p = 0; p < out.length; p += 1) {
    const i = p * 4;
    out[p] = (0.2126 * (lit.rgba[i] ?? 0) + 0.7152 * (lit.rgba[i + 1] ?? 0) + 0.0722 * (lit.rgba[i + 2] ?? 0)) / 255;
  }
  return out;
}

function neighborDiffers<T extends ArrayLike<number>>(ids: T, width: number, height: number, x: number, y: number, requireBothNonZero: boolean): boolean {
  const center = ids[y * width + x] ?? 0;
  if (requireBothNonZero && center === 0) return false;
  const check = (nx: number, ny: number): boolean => {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) return false;
    const other = ids[ny * width + nx] ?? 0;
    if (requireBothNonZero && other === 0) return false;
    return other !== center;
  };
  return check(x - 1, y) || check(x + 1, y) || check(x, y - 1) || check(x, y + 1);
}

function dilate(mask: Uint8ClampedArray, width: number, height: number, radius: number, inside: Uint8Array): Uint8ClampedArray {
  if (radius <= 0) return mask;
  const out = new Uint8ClampedArray(mask.length);
  const r2 = radius * radius + 0.25;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      if (inside[p] === 0) continue;
      let best = 0;
      for (let dy = -radius; dy <= radius && best < 255; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width || dx * dx + dy * dy > r2) continue;
          const value = mask[ny * width + nx] ?? 0;
          if (value > best) best = value;
        }
      }
      out[p] = best;
    }
  }
  return out;
}

export function extractLineArtChannels(input: LineArtInput, partial: Partial<LineArtOptions> = {}): LineArtChannels {
  const opts: LineArtOptions = { ...DEFAULT_LINE_ART_OPTIONS, ...partial };
  const { width, height, lit } = input;
  if (lit.width !== width || lit.height !== height) {
    throw new Error(`extractLineArt: lit 크기 ${lit.width}×${lit.height}가 ${width}×${height}와 다릅니다.`);
  }
  const inside = alphaMask(lit);
  const pixels = width * height;
  const silhouette = new Uint8ClampedArray(pixels);
  const depthEdge = new Uint8ClampedArray(pixels);
  const crease = new Uint8ClampedArray(pixels);
  const partBoundary = new Uint8ClampedArray(pixels);
  const materialBoundary = new Uint8ClampedArray(pixels);
  const luma = new Uint8ClampedArray(pixels);

  if (opts.alphaEdges) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (inside[p] === 0) continue;
        if (neighborDiffers(inside, width, height, x, y, false)) silhouette[p] = 255;
      }
    }
  }

  if (input.depth && opts.depthThreshold > 0) {
    if (input.depth.width !== width || input.depth.height !== height) {
      throw new Error("extractLineArt: depth 크기가 lit와 다릅니다.");
    }
    const magnitude = sobelMagnitude(input.depth.depth, width, height, inside);
    for (let p = 0; p < pixels; p += 1) {
      if (inside[p] === 0) continue;
      const d = input.depth.depth[p] ?? 0;
      if ((magnitude[p] ?? 0) > opts.depthThreshold * Math.max(d, 0.1)) depthEdge[p] = 255;
    }
  }

  if (input.normal && opts.normalAngleDeg > 0) {
    const normal = input.normal;
    if (normal.width !== width || normal.height !== height) {
      throw new Error("extractLineArt: normal 크기가 lit와 다릅니다.");
    }
    const cosLimit = Math.cos((opts.normalAngleDeg * Math.PI) / 180);
    const n = (p: number, c: number): number => ((normal.rgba[p * 4 + c] ?? 0) / 255) * 2 - 1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (inside[p] === 0) continue;
        const cx = n(p, 0);
        const cy = n(p, 1);
        const cz = n(p, 2);
        const cl = Math.hypot(cx, cy, cz) || 1;
        let minDot = 1;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const q = ny * width + nx;
            if (inside[q] === 0) continue;
            const ox = n(q, 0);
            const oy = n(q, 1);
            const oz = n(q, 2);
            const ol = Math.hypot(ox, oy, oz) || 1;
            const dot = (cx * ox + cy * oy + cz * oz) / (cl * ol);
            if (dot < minDot) minDot = dot;
          }
        }
        if (minDot < cosLimit) crease[p] = 255;
      }
    }
  }

  const partIds = input.partId ?? (input.idPass ? decodeIdPass(input.idPass.rgba, width, height) : null);
  if (opts.idEdges && partIds) {
    if (partIds.length !== pixels) throw new Error(`extractLineArt: partId 길이 ${partIds.length} ≠ ${pixels}.`);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (inside[p] === 0) continue;
        if (neighborDiffers(partIds, width, height, x, y, true)) partBoundary[p] = 255;
      }
    }
  }

  if (opts.materialEdges && input.idPass) {
    const materialIds = decodeMaterialIdPass(input.idPass.rgba);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (inside[p] === 0) continue;
        const partsSame = !partIds || !neighborDiffers(partIds, width, height, x, y, true);
        if (partsSame && neighborDiffers(materialIds, width, height, x, y, false) && (partIds ? (partIds[p] ?? 0) > 0 : true)) {
          materialBoundary[p] = 255;
        }
      }
    }
  }

  if (opts.lumaEdges && opts.lumaThreshold > 0) {
    const magnitude = sobelMagnitude(lumaField(lit), width, height, inside);
    for (let p = 0; p < pixels; p += 1) {
      if (inside[p] !== 0 && (magnitude[p] ?? 0) > opts.lumaThreshold) luma[p] = 255;
    }
  }

  const combined = new Uint8ClampedArray(pixels);
  for (let p = 0; p < pixels; p += 1) {
    combined[p] = Math.max(silhouette[p] ?? 0, depthEdge[p] ?? 0, crease[p] ?? 0, partBoundary[p] ?? 0, materialBoundary[p] ?? 0, luma[p] ?? 0);
  }
  const radius = Math.max(0, Math.floor((opts.lineWidthPx - 1) / 2));
  return { silhouette, depth: depthEdge, crease, partBoundary, materialBoundary, luma, combined: dilate(combined, width, height, radius, inside) };
}

/** 합성 주선 마스크(0..255, width×height) */
export function extractLineArt(input: LineArtInput, options: Partial<LineArtOptions> = {}): Uint8ClampedArray {
  return extractLineArtChannels(input, options).combined;
}

/** 마스크 → 선 색 RGBA 래스터(alpha = mask) */
export function lineArtToRaster(mask: Uint8ClampedArray, width: number, height: number, color: readonly [number, number, number] = [0, 0, 0]): CapturedRaster {
  if (mask.length !== width * height) throw new Error(`lineArtToRaster: 마스크 길이 ${mask.length} ≠ ${width * height}.`);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < mask.length; p += 1) {
    const i = p * 4;
    rgba[i] = color[0];
    rgba[i + 1] = color[1];
    rgba[i + 2] = color[2];
    rgba[i + 3] = mask[p] ?? 0;
  }
  return { width, height, rgba };
}

/** 마스크에서 255인 픽셀 수 */
export function countLinePixels(mask: Uint8ClampedArray): number {
  let count = 0;
  for (let p = 0; p < mask.length; p += 1) if ((mask[p] ?? 0) > 0) count += 1;
  return count;
}
