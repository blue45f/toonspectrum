import { fbm2D, hashNoise2D } from "../core/rng";

import type { TipKind } from "../core/types";

/**
 * 절차적 팁 마스크 8종. 외부 에셋 0, 같은 (kind, size, seed, params)면 바이트 동일.
 * 좌표계: 텍셀 중심을 [-1, 1]²로 정규화하고 반경 1이 팁 가장자리다.
 */
export interface TipMask {
  size: number;
  /** 0..1, row-major. */
  data: Float32Array;
}

export interface TipParams {
  /** 가장자리 경도 0..1. */
  hardness: number;
  /** ry/rx 비율(1 = 원). */
  aspect: number;
  /** bristle-strands 가닥 수. */
  strands?: number;
  /** noise/texture/stipple/particle 밀도 0..1. */
  density?: number;
  /** hatch 선 각도(rad). */
  angle?: number;
  /** hatch 선 수·stipple 격자 수·texture 주파수(지름 기준). */
  frequency?: number;
  /** noise/texture 팁의 fBm 옥타브 수(1..8, 기본 noise 2·texture 4). */
  octaves?: number;
}

const f = Math.fround;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 정규화 반경 d(1 = 가장자리)에서의 소프트 디스크 값. */
function discFalloff(d: number, hardness: number, size: number): number {
  const edge = Math.max(1 - hardness, 2 / size);
  return clamp01((1 - d) / edge);
}

/** 소금(salt)으로 분리한 시드. */
function salted(seed: number, salt: number): number {
  return (seed + Math.imul(salt, 0x9e3779b1)) >>> 0;
}

type Generator = (u: number, v: number, x: number, y: number) => number;

function fill(size: number, gen: Generator): TipMask {
  const data = new Float32Array(size * size);
  const inv = 2 / size;
  for (let y = 0; y < size; y += 1) {
    const v = (y + 0.5) * inv - 1;
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) * inv - 1;
      data[y * size + x] = f(clamp01(gen(u, v, x, y)));
    }
  }
  return { size, data };
}

function roundTip(size: number, p: TipParams): TipMask {
  const aspect = Math.max(0.05, p.aspect);
  return fill(size, (u, v) => discFalloff(Math.sqrt(u * u + (v / aspect) * (v / aspect)), p.hardness, size));
}

function flatTip(size: number, p: TipParams): TipMask {
  const aspect = Math.max(0.05, p.aspect);
  return fill(size, (u, v) => discFalloff(Math.max(Math.abs(u), Math.abs(v) / aspect), p.hardness, size));
}

function bristleTip(size: number, seed: number, p: TipParams): TipMask {
  const n = Math.max(1, Math.floor(p.strands ?? 24));
  const s = salted(seed, 2);
  const offsets: number[] = [];
  const widths: number[] = [];
  const gains: number[] = [];
  const lengths: number[] = [];
  for (let i = 0; i < n; i += 1) {
    offsets.push((hashNoise2D(i, 0, s) - 0.5) * 1.8);
    widths.push(0.03 + 0.07 * hashNoise2D(i, 1, s));
    gains.push(0.4 + 0.6 * hashNoise2D(i, 2, s));
    lengths.push(0.55 + 0.45 * hashNoise2D(i, 3, s));
  }
  return fill(size, (u, v) => {
    let best = 0;
    for (let i = 0; i < n; i += 1) {
      const w = widths[i] ?? 0.05;
      const dx = Math.abs(u - (offsets[i] ?? 0));
      if (dx >= w || Math.abs(v) > (lengths[i] ?? 1)) continue;
      const val = (gains[i] ?? 1) * (1 - dx / w);
      if (val > best) best = val;
    }
    const env = discFalloff(Math.sqrt(u * u + v * v), Math.min(p.hardness, 0.9), size);
    return best * env;
  });
}

function octavesOf(p: TipParams, fallback: number): number {
  const o = Math.floor(p.octaves ?? fallback);
  return o < 1 ? 1 : o > 8 ? 8 : o;
}

function textureTip(size: number, seed: number, p: TipParams): TipMask {
  const freq = p.frequency ?? 4;
  const density = clamp01(p.density ?? 0.7);
  const s = salted(seed, 3);
  const octaves = octavesOf(p, 4);
  return fill(size, (u, v) => {
    const n = fbm2D((u + 1) * freq, (v + 1) * freq, octaves, s);
    const stretched = clamp01((n - 0.5 + density * 0.5) / Math.max(density, 1e-3));
    return stretched * discFalloff(Math.sqrt(u * u + v * v), p.hardness, size);
  });
}

function noiseTip(size: number, seed: number, p: TipParams): TipMask {
  const density = clamp01(p.density ?? 0.6);
  const s = salted(seed, 4);
  const octaves = octavesOf(p, 2);
  const freq = p.frequency ?? 8;
  return fill(size, (u, v, x, y) => {
    const h = hashNoise2D(x, y, s);
    const n = fbm2D((u + 1) * freq, (v + 1) * freq, octaves, salted(s, 1));
    const mix = 0.5 * h + 0.5 * n;
    const thr = clamp01((mix - (1 - density)) / Math.max(density, 1e-3));
    return thr * discFalloff(Math.sqrt(u * u + v * v), p.hardness, size);
  });
}

function hatchTip(size: number, p: TipParams): TipMask {
  const a = p.angle ?? 0;
  const freq = p.frequency ?? 6;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  return fill(size, (u, v) => {
    const sPos = u * ca + v * sa;
    const line = 0.5 + 0.5 * Math.cos(Math.PI * freq * sPos);
    const band = clamp01((line - 0.6) / 0.3);
    return band * discFalloff(Math.sqrt(u * u + v * v), Math.max(p.hardness, 0.8), size);
  });
}

function stippleTip(size: number, p: TipParams): TipMask {
  const freq = Math.max(1, p.frequency ?? 8);
  const dotR = 0.5 * clamp01(p.density ?? 0.5);
  return fill(size, (u, v) => {
    const cx = ((u + 1) / 2) * freq;
    const cy = ((v + 1) / 2) * freq;
    const dx = cx - Math.floor(cx) - 0.5;
    const dy = cy - Math.floor(cy) - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy);
    const dot = clamp01((dotR - d) / 0.12 + 0.5);
    return dot * discFalloff(Math.sqrt(u * u + v * v), Math.max(p.hardness, 0.9), size);
  });
}

function particleTip(size: number, seed: number, p: TipParams): TipMask {
  const count = 4 + Math.round(clamp01(p.density ?? 0.5) * 44);
  const s = salted(seed, 5);
  const px: number[] = [];
  const py: number[] = [];
  const pr: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const theta = hashNoise2D(i, 0, s) * Math.PI * 2;
    const rad = Math.sqrt(hashNoise2D(i, 1, s)) * 0.9;
    px.push(Math.cos(theta) * rad);
    py.push(Math.sin(theta) * rad);
    pr.push(0.04 + 0.08 * hashNoise2D(i, 2, s));
  }
  return fill(size, (u, v) => {
    let sum = 0;
    for (let i = 0; i < count; i += 1) {
      const dx = u - (px[i] ?? 0);
      const dy = v - (py[i] ?? 0);
      const r = pr[i] ?? 0.05;
      const d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 < 4) sum += Math.exp(-d2 * 1.5);
    }
    return sum;
  });
}

/** 팁 마스크 생성. size는 2의 거듭제곱 권장(mip 체인). */
export function generateTip(kind: TipKind, size: number, seed: number, params: TipParams): TipMask {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`generateTip: size must be a positive integer, got ${size}`);
  }
  switch (kind) {
    case "round":
      return roundTip(size, params);
    case "flat":
      return flatTip(size, params);
    case "bristle-strands":
      return bristleTip(size, seed, params);
    case "texture-stamp":
      return textureTip(size, seed, params);
    case "noise":
      return noiseTip(size, seed, params);
    case "hatch":
      return hatchTip(size, params);
    case "stipple":
      return stippleTip(size, params);
    case "particle":
      return particleTip(size, seed, params);
  }
}

/** 마스크 평균값(mip 평균 보존 테스트용). */
export function maskMean(mask: TipMask): number {
  let sum = 0;
  for (let i = 0; i < mask.data.length; i += 1) sum += mask.data[i] ?? 0;
  return sum / mask.data.length;
}
