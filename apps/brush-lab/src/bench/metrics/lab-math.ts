import { linearToLab, srgbToLinear } from "../../engine/core/color";

import type { LabImage } from "../../engine/core/types";

/**
 * 벤치 지표 공용 수학. 의존성 0, 입력은 숫자 배열·Float32Array·LabImage뿐이다.
 * 2-D DFT는 분리형 정의식(트위들 테이블)으로 정확히 계산한다(윈도 ≤ 128).
 */

const TAU = Math.PI * 2;

export function mean(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i += 1) s += values[i] ?? 0;
  return s / n;
}

/** 모집단 표준편차. */
export function std(values: ArrayLike<number>): number {
  const n = values.length;
  if (n === 0) return 0;
  const m = mean(values);
  let s = 0;
  for (let i = 0; i < n; i += 1) {
    const d = (values[i] ?? 0) - m;
    s += d * d;
  }
  return Math.sqrt(s / n);
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 선형 보간 백분위수(p ∈ [0, 100]). 빈 배열이면 0. */
export function percentile(values: ArrayLike<number>, p: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = Array.from({ length: n }, (_, i) => values[i] ?? 0).sort((a, b) => a - b);
  const pos = (clamp(p, 0, 100) / 100) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  const t = pos - lo;
  return (sorted[lo] ?? 0) * (1 - t) + (sorted[hi] ?? 0) * t;
}

/** 피어슨 상관. 어느 한쪽 분산이 0이면 0. */
export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a);
  const mb = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i += 1) {
    const da = (a[i] ?? 0) - ma;
    const db = (b[i] ?? 0) - mb;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa === 0 || sbb === 0) return 0;
  return sab / Math.sqrt(saa * sbb);
}

/** 동순위 평균 순위(1부터). */
export function rank(values: ArrayLike<number>): number[] {
  const n = values.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort(
    (i, j) => (values[i] ?? 0) - (values[j] ?? 0),
  );
  const out = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    const vi = values[idx[i] ?? 0] ?? 0;
    while (j + 1 < n && (values[idx[j + 1] ?? 0] ?? 0) === vi) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[idx[k] ?? 0] = r;
    i = j + 1;
  }
  return out;
}

/** 스피어만 순위 상관. 어느 한쪽이 상수면 0(정보 없음). */
export function spearman(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ra = rank(Array.from({ length: n }, (_, i) => a[i] ?? 0));
  const rb = rank(Array.from({ length: n }, (_, i) => b[i] ?? 0));
  return pearson(ra, rb);
}

export interface LinearFit {
  slope: number;
  intercept: number;
  r2: number;
}

/** 최소제곱 직선 적합. 분산 0이면 slope 0·r2 0. */
export function linearFit(x: ArrayLike<number>, y: ArrayLike<number>): LinearFit {
  const n = Math.min(x.length, y.length);
  if (n < 2) return { slope: 0, intercept: n === 1 ? (y[0] ?? 0) : 0, r2: 0 };
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (x[i] ?? 0) - mx;
    const dy = (y[i] ?? 0) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return { slope: 0, intercept: my, r2: 0 };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  if (syy === 0) return { slope, intercept, r2: 1 };
  let ssRes = 0;
  for (let i = 0; i < n; i += 1) {
    const r = (y[i] ?? 0) - (intercept + slope * (x[i] ?? 0));
    ssRes += r * r;
  }
  return { slope, intercept, r2: 1 - ssRes / syy };
}

/**
 * 다항식 최소제곱(정규방정식 + 부분 피벗 가우스 소거). 계수는 낮은 차수부터.
 * x는 수치 안정성을 위해 [-1, 1]로 정규화해 적합하고, 평가는 `polyEval`에 같은 정규화를 적용한다.
 */
export interface PolyFit {
  coeffs: number[];
  xMin: number;
  xMax: number;
}

export function polyFit(x: ArrayLike<number>, y: ArrayLike<number>, degree: number): PolyFit {
  const n = Math.min(x.length, y.length);
  const d = Math.max(0, Math.min(degree, Math.max(0, n - 1)));
  let xMin = Number.POSITIVE_INFINITY;
  let xMax = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i += 1) {
    const v = x[i] ?? 0;
    if (v < xMin) xMin = v;
    if (v > xMax) xMax = v;
  }
  if (n === 0) return { coeffs: [0], xMin: 0, xMax: 1 };
  if (xMax === xMin) return { coeffs: [mean(y)], xMin, xMax: xMin + 1 };
  const norm = (v: number): number => ((v - xMin) / (xMax - xMin)) * 2 - 1;
  const m = d + 1;
  const ata = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const atb = new Array<number>(m).fill(0);
  for (let i = 0; i < n; i += 1) {
    const u = norm(x[i] ?? 0);
    const powers = new Array<number>(m);
    let p = 1;
    for (let k = 0; k < m; k += 1) {
      powers[k] = p;
      p *= u;
    }
    for (let r = 0; r < m; r += 1) {
      const pr = powers[r] ?? 0;
      atb[r] = (atb[r] ?? 0) + pr * (y[i] ?? 0);
      const row = ata[r];
      if (!row) continue;
      for (let c = 0; c < m; c += 1) row[c] = (row[c] ?? 0) + pr * (powers[c] ?? 0);
    }
  }
  const coeffs = solveLinear(ata, atb);
  return { coeffs, xMin, xMax };
}

export function polyEval(fit: PolyFit, xv: number): number {
  const u = ((xv - fit.xMin) / (fit.xMax - fit.xMin)) * 2 - 1;
  let acc = 0;
  let p = 1;
  for (const c of fit.coeffs) {
    acc += c * p;
    p *= u;
  }
  return acc;
}

/** 부분 피벗 가우스 소거. 특이 행렬이면 해당 미지수를 0으로 둔다. */
export function solveLinear(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    let best = Math.abs(m[col]?.[col] ?? 0);
    for (let r = col + 1; r < n; r += 1) {
      const v = Math.abs(m[r]?.[col] ?? 0);
      if (v > best) {
        best = v;
        pivot = r;
      }
    }
    if (best < 1e-12) continue;
    if (pivot !== col) {
      const tmp = m[col];
      const piv = m[pivot];
      if (tmp && piv) {
        m[col] = piv;
        m[pivot] = tmp;
      }
    }
    const prow = m[col];
    if (!prow) continue;
    const pv = prow[col] ?? 1;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const row = m[r];
      if (!row) continue;
      const factor = (row[col] ?? 0) / pv;
      if (factor === 0) continue;
      for (let c = col; c <= n; c += 1) row[c] = (row[c] ?? 0) - factor * (prow[c] ?? 0);
    }
  }
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const row = m[i];
    const diag = row?.[i] ?? 0;
    out[i] = Math.abs(diag) < 1e-12 ? 0 : (row?.[n] ?? 0) / diag;
  }
  return out;
}

/** Hann 창 h(i) = 0.5·(1 − cos(2πi/(n−1))). n = 1이면 [1]. */
export function hann1D(n: number): Float32Array {
  const out = new Float32Array(n);
  if (n === 1) {
    out[0] = 1;
    return out;
  }
  for (let i = 0; i < n; i += 1) out[i] = 0.5 * (1 - Math.cos((TAU * i) / (n - 1)));
  return out;
}

/** 분리형 2-D Hann 창(size·size, 행 우선). */
export function hann2D(size: number): Float32Array {
  const h = hann1D(size);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const hy = h[y] ?? 0;
    for (let x = 0; x < size; x += 1) out[y * size + x] = hy * (h[x] ?? 0);
  }
  return out;
}

export interface Spectrum2D {
  size: number;
  /** |F(kx, ky)| (행 우선, 인덱스 ky·size + kx). */
  magnitude: Float32Array;
  /** |F|² / N⁴. */
  power: Float32Array;
}

/**
 * 정확한 분리형 2-D DFT. 입력은 size·size 실수 필드(창은 호출자가 적용).
 * F(kx,ky) = Σ_x Σ_y w(x,y)·exp(−2πi(kx·x + ky·y)/N). 복잡도 O(N³).
 */
export function dft2D(field: Float32Array, size: number): Spectrum2D {
  if (field.length < size * size) {
    throw new RangeError(`dft2D: field has ${field.length} values, need ${size * size}`);
  }
  const cos = new Float64Array(size);
  const sin = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    cos[i] = Math.cos((TAU * i) / size);
    sin[i] = Math.sin((TAU * i) / size);
  }
  // 행 방향(x) 변환: R[y][kx]
  const re1 = new Float64Array(size * size);
  const im1 = new Float64Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let kx = 0; kx < size; kx += 1) {
      let re = 0;
      let im = 0;
      for (let x = 0; x < size; x += 1) {
        const v = field[y * size + x] ?? 0;
        const idx = (kx * x) % size;
        re += v * (cos[idx] ?? 1);
        im -= v * (sin[idx] ?? 0);
      }
      re1[y * size + kx] = re;
      im1[y * size + kx] = im;
    }
  }
  // 열 방향(y) 변환
  const magnitude = new Float32Array(size * size);
  const power = new Float32Array(size * size);
  const n4 = size * size * size * size;
  for (let kx = 0; kx < size; kx += 1) {
    for (let ky = 0; ky < size; ky += 1) {
      let re = 0;
      let im = 0;
      for (let y = 0; y < size; y += 1) {
        const a = re1[y * size + kx] ?? 0;
        const b = im1[y * size + kx] ?? 0;
        const idx = (ky * y) % size;
        const c = cos[idx] ?? 1;
        const s = sin[idx] ?? 0;
        // (a + ib)(c − is) = (ac + bs) + i(bc − as)
        re += a * c + b * s;
        im += b * c - a * s;
      }
      const mag2 = re * re + im * im;
      magnitude[ky * size + kx] = Math.sqrt(mag2);
      power[ky * size + kx] = mag2 / n4;
    }
  }
  return { size, magnitude, power };
}

/** 부호 있는 파수 → 반경 주파수(cycles/px). */
export function radialFrequency(kx: number, ky: number, size: number): number {
  const sx = kx <= size / 2 ? kx : kx - size;
  const sy = ky <= size / 2 ? ky : ky - size;
  return Math.hypot(sx, sy) / size;
}

/** fLo < f ≤ fHi 대역의 파워 합(DC 제외). */
export function bandPower(spectrum: Spectrum2D, fLo: number, fHi: number): number {
  const { size, power } = spectrum;
  let sum = 0;
  for (let ky = 0; ky < size; ky += 1) {
    for (let kx = 0; kx < size; kx += 1) {
      if (kx === 0 && ky === 0) continue;
      const f = radialFrequency(kx, ky, size);
      if (f > fLo && f <= fHi) sum += power[ky * size + kx] ?? 0;
    }
  }
  return sum;
}

/** DC 제외 전체 파워. */
export function totalPowerExDc(spectrum: Spectrum2D): number {
  return bandPower(spectrum, 0, Number.POSITIVE_INFINITY);
}

/** sRGB RGBA8 → 흰 배경 위 상대 휘도(0..1, 1 = 흰색). */
export function toGray(img: LabImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  const d = img.data;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const a = (d[o + 3] ?? 0) / 255;
    const r = srgbToLinear((d[o] ?? 0) / 255);
    const g = srgbToLinear((d[o + 1] ?? 0) / 255);
    const b = srgbToLinear((d[o + 2] ?? 0) / 255);
    const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
    out[i] = y * a + (1 - a);
  }
  return out;
}

/** 알파 채널(0..1). */
export function toAlpha(img: LabImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = (img.data[i * 4 + 3] ?? 0) / 255;
  return out;
}

/** 흰 배경 위 선형 합성 후 CIE L*a*b*(픽셀당 3값). */
export function imageToLab(img: LabImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n * 3);
  const d = img.data;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const a = (d[o + 3] ?? 0) / 255;
    const r = srgbToLinear((d[o] ?? 0) / 255) * a + (1 - a);
    const g = srgbToLinear((d[o + 1] ?? 0) / 255) * a + (1 - a);
    const b = srgbToLinear((d[o + 2] ?? 0) / 255) * a + (1 - a);
    const lab = linearToLab(r, g, b);
    out[i * 3] = lab[0];
    out[i * 3 + 1] = lab[1];
    out[i * 3 + 2] = lab[2];
  }
  return out;
}

/** 선형 premultiplied f32 버퍼(흰 배경 위 합성) → CIE L*a*b*. */
export function linearPremulToLab(linear: Float32Array, pixels: number): Float32Array {
  const out = new Float32Array(pixels * 3);
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    const a = clamp(linear[o + 3] ?? 0, 0, 1);
    const r = clamp((linear[o] ?? 0) + (1 - a), 0, 1);
    const g = clamp((linear[o + 1] ?? 0) + (1 - a), 0, 1);
    const b = clamp((linear[o + 2] ?? 0) + (1 - a), 0, 1);
    const lab = linearToLab(r, g, b);
    out[i * 3] = lab[0];
    out[i * 3 + 1] = lab[1];
    out[i * 3 + 2] = lab[2];
  }
  return out;
}

/** (cx, cy) 중심 size·size 창을 잘라낸다. 범위를 벗어나는 픽셀은 경계값으로 채운다. */
export function cropWindow(
  field: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
): Float32Array {
  const out = new Float32Array(size * size);
  const x0 = Math.round(cx - size / 2);
  const y0 = Math.round(cy - size / 2);
  for (let y = 0; y < size; y += 1) {
    const sy = clamp(y0 + y, 0, height - 1);
    for (let x = 0; x < size; x += 1) {
      const sx = clamp(x0 + x, 0, width - 1);
      out[y * size + x] = field[sy * width + sx] ?? 0;
    }
  }
  return out;
}

/** 평균 제거 + Hann 창 적용(스펙트럼 분석 전처리). */
export function detrendAndWindow(field: Float32Array, size: number): Float32Array {
  const m = mean(field);
  const h = hann2D(size);
  const out = new Float32Array(size * size);
  for (let i = 0; i < size * size; i += 1) out[i] = ((field[i] ?? 0) - m) * (h[i] ?? 0);
  return out;
}

/** 쌍선형 알파 표본(0..1). 범위 밖은 0. */
export function bilinearAlpha(img: LabImage, x: number, y: number): number {
  const { width, height, data } = img;
  if (x < -1 || y < -1 || x > width || y > height) return 0;
  const x0 = Math.floor(x - 0.5);
  const y0 = Math.floor(y - 0.5);
  const tx = x - 0.5 - x0;
  const ty = y - 0.5 - y0;
  const at = (px: number, py: number): number => {
    if (px < 0 || py < 0 || px >= width || py >= height) return 0;
    return (data[(py * width + px) * 4 + 3] ?? 0) / 255;
  };
  const a00 = at(x0, y0);
  const a10 = at(x0 + 1, y0);
  const a01 = at(x0, y0 + 1);
  const a11 = at(x0 + 1, y0 + 1);
  return (a00 * (1 - tx) + a10 * tx) * (1 - ty) + (a01 * (1 - tx) + a11 * tx) * ty;
}

/** 알파 ≥ threshold(0..255) 마스크. */
export function alphaMask(img: LabImage, threshold = 8): Uint8Array {
  const n = img.width * img.height;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) out[i] = (img.data[i * 4 + 3] ?? 0) >= threshold ? 1 : 0;
  return out;
}

/** 4-이웃 침식(iterations 회). 가장자리는 바깥을 0으로 본다. */
export function erodeMask(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  let cur = mask;
  for (let it = 0; it < iterations; it += 1) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        if (!cur[i]) continue;
        const l = x > 0 ? cur[i - 1] : 0;
        const r = x < width - 1 ? cur[i + 1] : 0;
        const u = y > 0 ? cur[i - width] : 0;
        const d = y < height - 1 ? cur[i + width] : 0;
        next[i] = l && r && u && d ? 1 : 0;
      }
    }
    cur = next;
  }
  return cur;
}

/** 알파 가중 2× 박스 다운샘플(sRGB 공간 근사, premultiplied 평균). */
export function downsample2x(img: LabImage): LabImage {
  const w = Math.max(1, Math.floor(img.width / 2));
  const h = Math.max(1, Math.floor(img.height / 2));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const sx = Math.min(img.width - 1, x * 2 + dx);
          const sy = Math.min(img.height - 1, y * 2 + dy);
          const o = (sy * img.width + sx) * 4;
          const pa = (img.data[o + 3] ?? 0) / 255;
          r += (img.data[o] ?? 0) * pa;
          g += (img.data[o + 1] ?? 0) * pa;
          b += (img.data[o + 2] ?? 0) * pa;
          a += pa;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
      }
      out[o + 3] = Math.round((a / 4) * 255);
    }
  }
  return { width: w, height: h, data: out };
}

/** 잉크 픽셀(알파 ≥ threshold)의 무게중심. 없으면 캔버스 중심. */
export function inkCentroid(img: LabImage, threshold = 8): { x: number; y: number; count: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) >= threshold) {
        sx += x + 0.5;
        sy += y + 0.5;
        n += 1;
      }
    }
  }
  if (n === 0) return { x: img.width / 2, y: img.height / 2, count: 0 };
  return { x: sx / n, y: sy / n, count: n };
}

/** 폴리라인 길이. */
export function polylineLength(path: readonly (readonly [number, number])[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1];
    const b = path[i];
    if (a && b) len += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return len;
}

export interface PathStation {
  x: number;
  y: number;
  /** 단위 접선. */
  tx: number;
  ty: number;
  /** 시작부터의 호 길이. */
  s: number;
}

/** 폴리라인을 호 길이 기준 균등 분할한 정류장(접선 포함). count ≥ 2. */
export function pathStations(
  path: readonly (readonly [number, number])[],
  count: number,
): PathStation[] {
  const n = Math.max(2, Math.floor(count));
  const total = polylineLength(path);
  const out: PathStation[] = [];
  const first = path[0];
  if (!first || path.length < 2 || total === 0) {
    for (let i = 0; i < n; i += 1) {
      out.push({ x: first?.[0] ?? 0, y: first?.[1] ?? 0, tx: 1, ty: 0, s: 0 });
    }
    return out;
  }
  for (let i = 0; i < n; i += 1) {
    const target = (total * i) / (n - 1);
    let acc = 0;
    for (let k = 1; k < path.length; k += 1) {
      const a = path[k - 1];
      const b = path[k];
      if (!a || !b) continue;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len === 0) continue;
      if (target <= acc + len || k === path.length - 1) {
        const t = clamp((target - acc) / len, 0, 1);
        out.push({
          x: a[0] + (b[0] - a[0]) * t,
          y: a[1] + (b[1] - a[1]) * t,
          tx: (b[0] - a[0]) / len,
          ty: (b[1] - a[1]) / len,
          s: target,
        });
        break;
      }
      acc += len;
    }
  }
  return out;
}

/**
 * 정류장에서 법선 방향 알파 프로파일(−reach..+reach, step px). 쌍선형 표본.
 * 반환 배열 길이 = 2·reach/step + 1, 중앙 인덱스가 정류장 위치.
 */
export function normalProfile(
  img: LabImage,
  station: PathStation,
  reach: number,
  step = 0.5,
): Float32Array {
  const half = Math.ceil(reach / step);
  const out = new Float32Array(half * 2 + 1);
  const nx = -station.ty;
  const ny = station.tx;
  for (let i = -half; i <= half; i += 1) {
    const d = i * step;
    out[i + half] = bilinearAlpha(img, station.x + nx * d, station.y + ny * d);
  }
  return out;
}

/** 선폭 판정의 최소 절대 알파(8/255). 이보다 어두운 잉크는 없는 것으로 본다. */
export const MIN_INK_ALPHA = 8 / 255;

/** 프로파일 최대값. */
export function profilePeak(profile: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < profile.length; i += 1) if ((profile[i] ?? 0) > peak) peak = profile[i] ?? 0;
  return peak;
}

/**
 * 프로파일에서 선폭(px). 기준(threshold)을 생략하면 피크의 50 %(FWHM, 최소 8/255)를 쓴다 — 해석적 AA 경계의
 * 기하학적 폭과 일치하고 flow가 낮은 브러시도 상대 기준으로 잰다. 중앙에서 양쪽으로 걸어 나가며 경계는 선형 보간한다.
 * 중앙이 비어 있으면 가장 가까운 잉크 구간을 쓴다. 잉크가 없으면 0.
 */
export function profileWidth(profile: Float32Array, step: number, threshold?: number): number {
  const thr = threshold ?? Math.max(MIN_INK_ALPHA, 0.5 * profilePeak(profile));
  const half = Math.floor(profile.length / 2);
  if ((profile[half] ?? 0) < thr) {
    let best = -1;
    for (let i = 0; i < profile.length; i += 1) {
      if ((profile[i] ?? 0) >= thr && (best < 0 || Math.abs(i - half) < Math.abs(best - half))) {
        best = i;
      }
    }
    if (best < 0) return 0;
    return profileWidthFrom(profile, best, step, thr);
  }
  return profileWidthFrom(profile, half, step, thr);
}

function profileWidthFrom(profile: Float32Array, center: number, step: number, threshold: number): number {
  let lo = center;
  while (lo > 0 && (profile[lo - 1] ?? 0) >= threshold) lo -= 1;
  let hi = center;
  while (hi < profile.length - 1 && (profile[hi + 1] ?? 0) >= threshold) hi += 1;
  // 경계에서 선형 보간으로 서브픽셀 폭을 추정한다.
  let width = (hi - lo) * step;
  if (lo > 0) {
    const a = profile[lo] ?? 0;
    const b = profile[lo - 1] ?? 0;
    if (a > b) width += ((a - threshold) / (a - b)) * step;
  }
  if (hi < profile.length - 1) {
    const a = profile[hi] ?? 0;
    const b = profile[hi + 1] ?? 0;
    if (a > b) width += ((a - threshold) / (a - b)) * step;
  }
  return width;
}
