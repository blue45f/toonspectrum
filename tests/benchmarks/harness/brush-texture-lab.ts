/**
 * Brush Texture Quality Lab v1 — "is the texture itself any good?"
 *
 * The existing brush measurements answer two questions only: do the two
 * engines agree (libmypaint↔hokusai column-profile correlation 0.9997 and
 * 0.999999986, tests/benchmarks/results/libmypaint-parity.json) and does
 * pressure move ink (correlation(pressure, thickness) > 0.95,
 * tests/visual/pressure-fidelity.test.ts). Neither says anything about the
 * *texture* a brush produces. This lab closes that gap with five measured
 * axes, each with a computable definition written out as a formula below.
 *
 * Nothing here judges "good" or "bad": every field is a number plus the
 * formula that produced it. Interpretation lives in the report, not the data.
 *
 * Engines: libmypaint v1.6.1 wasm = REFERENCE, hokusai-core 0.3.0 = CHALLENGER
 * (same roles as the parity lab). Corpus: tests/corpus/brushes/myb.
 *
 * Run: pnpm exec tsx tests/benchmarks/harness/brush-texture-lab.ts
 * Gate: tests/visual/brush-texture-quality.test.ts
 *
 * ── Metric definitions ─────────────────────────────────────────────────────
 *
 * Notation: A(x, y) ∈ [0, 1] is the straight-alpha channel of the rendered
 * RGBA8 frame divided by 255. All lanes render ONE deterministic stroke; no
 * randomness beyond each engine's seeded per-stroke RNG (seed 7).
 *
 * (1) GRAIN SPECTRAL DENSITY — texture lane, N×N interior window W.
 *     Detrend + taper:  w(x,y) = (A(x,y) − Ā) · h(x) · h(y),
 *                       h(i)   = 0.5·(1 − cos(2πi/(N−1)))          [Hann]
 *     2-D DFT (separable, exact, no dependency):
 *       F(kx,ky) = Σ_x Σ_y w(x,y)·exp(−2πi(kx·x + ky·y)/N)
 *       P(kx,ky) = |F(kx,ky)|² / N⁴
 *     Signed wavenumber k̂ = k for k ≤ N/2, else k − N; radial frequency in
 *     cycles per pixel:
 *       f(kx,ky) = hypot(k̂x, k̂y) / N          ∈ (0, √2/2]
 *     Radial average spectrum S(r) = mean{ P : f ∈ [r/N, (r+1)/N) }.
 *     Band energies (sum of P over the band, DC excluded). The band edges are
 *     fixed by the lane's physical scale, not by the outcome: the measured dab
 *     cadence of the corpus brushes in this lane is 13.3 px (ink-crisp) and
 *     19.6 px (wash-soft), so the mid band brackets that range by ~1.5× on
 *     each side, the low band is everything at or above half the window (the
 *     stroke's own falloff envelope) and the high band is everything below
 *     the finest dab spacing:
 *       E_low  = Σ P,  0      < f ≤ 1/32   (period ≥ 32 px — shading envelope)
 *       E_mid  = Σ P,  1/32   < f ≤ 1/8    (period 8–32 px — dab-scale grain)
 *       E_high = Σ P,  1/8    < f ≤ √2/2   (period < 8 px  — sub-dab noise)
 *       ratio_b = E_b / (E_low + E_mid + E_high)
 *     A brush whose interior is a smooth wash puts its energy in E_low; a
 *     brush whose dab overlap prints structure puts it in E_mid. Absolute
 *     `totalPowerExDc` is reported too, because a perfectly flat interior has
 *     near-zero power in every band and its ratios are then quantisation
 *     noise — the ratios are only interpretable next to the absolute level.
 *
 * (2) EDGE QUALITY — texture lane, vertical columns through the stroke.
 *     For column x with peak alpha A* = max_y A(x,y) and centre row cy, walk
 *     outward on each side to the first row below 0.9·A* (linear-interpolated
 *     y₉₀) and then below 0.1·A* (y₁₀):
 *       transitionWidth(x, side) = |y₁₀ − y₉₀|            [px]
 *     Averaged over all measured columns and both sides. Normalised form:
 *       transitionWidthPerRadius = transitionWidth / measuredRadius,
 *       measuredRadius = mean distance from cy to the outermost A > 0 row.
 *     Aliasing / discreteness: collect every integer row in the transition band
 *     (y₉₀..y₁₀, ±1 px) over all columns and sides as coverage A/A* — the peak
 *     normalisation matters, because a faint brush can never reach the upper
 *     bins of an absolute-alpha histogram and would score as "discrete" purely
 *     for being faint. Bin A/A* into B = 32 equal bins with probabilities p_i:
 *       H          = −Σ p_i·log₂ p_i                       [bits, ≤ log₂B = 5]
 *       aliasingIx = 1 − H / log₂B                         ∈ [0, 1]
 *     A stair-stepped edge repeats the same coverage over many rows and piles
 *     its mass into few bins → H → 0 → aliasingIx → 1; a finely graded edge
 *     spreads across bins → aliasingIx → 0. Per column and side,
 *       gradationDensity = |{distinct 8-bit alpha in the band}| / (band rows)
 *     averaged over all column-sides: 1 = every row in the transition carries
 *     its own coverage level, below 1 = rows repeat (plateaus / quantisation).
 *     Both are entangled with transition width by construction — a narrow
 *     transition simply has fewer rows to resolve levels in — so width and
 *     discreteness are always read together, never in isolation.
 *
 * (3) DAB OVERLAP UNIFORMITY (RIPPLE) — texture lane, centre row.
 *     Over M interior columns of the constant-pressure centre line a(x):
 *       least-squares detrend  a(x) ≈ α + βx,  d(x) = a(x) − (α + βx)
 *       rippleRms = sqrt( mean d² ),  rippleCv = rippleRms / mean(a)
 *     Dominant period from the 1-D DFT of the Hann-tapered d:
 *       D(k) = Σ_x d(x)·h(x)·exp(−2πikx/M),  k* = argmax_{1≤k≤M/2} |D(k)|²
 *       ripplePeriod = M / k*                                        [px]
 *     libmypaint spaces dabs at `actual_radius / dabs_per_actual_radius`, so
 *       expectedDabSpacing = measuredRadius / dabs_per_actual_radius
 *       ripplePeriodOverDabSpacing = ripplePeriod / expectedDabSpacing
 *     ≈ 1 means the ripple IS the dab cadence ("beading"); far from 1 means
 *     the dominant variation has another source.
 *
 * (4) PRESSURE RESPONSE LINEARITY — pressure lane, triangular 0→1→0 ramp.
 *     Cross-section ink mass of column x:  m(x) = Σ_y A(x,y).
 *     On the rising half the pressure of column x is known exactly from the
 *     sample path, p(x) = 2·(x − x₀)/L. Over the analysis band p ∈ [0.1, 0.9]:
 *       r2Linear    = 1 − SS_res/SS_tot for the OLS fit m = a + b·p
 *       r2LogLinear = same for ln m = a + b·p          (exponential response)
 *     "Ideal" here is *a straight line*: equal pressure increments produce
 *     equal mass increments. libmypaint's radius is exp(base + c·p), so a low
 *     r2Linear next to a high r2LogLinear is the engine's documented model
 *     showing through, not a defect — both numbers are reported so the shape
 *     is identifiable rather than merely scored.
 *     Taper symmetry mirrors each rising column x about the apex xm:
 *       taperAsymmetry = sqrt( mean (m(x) − m(2·xm − x))² )
 *                        / mean( (m(x) + m(2·xm − x))/2 )
 *     0 = start and end tapers are identical at equal pressure; speed/slow-
 *     tracking history is what makes it non-zero.
 *
 * (5) COLOUR MIXING ACCURACY — mixing lane, two crossing strokes on one canvas.
 *     Colour A is painted horizontally, colour B vertically across it. The
 *     same pair is rendered twice: once with the brush's own `smudge`, once
 *     with `smudge` forced to 0. The no-smudge frame IS the linear reference:
 *     plain source-over compositing, C = α_B·C_B + (1 − α_B)·C_A. Over the
 *     intersection window both frames are composited onto white and compared:
 *       ΔE00 = CIEDE2000( Lab(smudge), Lab(linear) )      [per pixel]
 *     reported as mean and max. 0 means the brush has no colour-mixing model
 *     engaged; larger means the smudge model pulls the mix off the linear
 *     interpolation, which is the point of a smudge brush.
 *     Caveat recorded in the results file: the two engines read back RGB in
 *     different channel spaces (libmypaint v1 non-linear fix15 vs hokusai
 *     linear→sRGB), so the WITHIN-engine ΔE00 above is self-consistent while
 *     the cross-engine ΔE00 is confounded by that known difference — it is
 *     recorded as evidence only and never gated.
 */
import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { cpus, platform, arch } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import {
  applyMybSettings,
  renderLibMypaintStroke,
} from "../../../packages/studio-brush-platform/src/libmypaint";
import {
  compileRasterBrush,
  renderCompiledBrushStroke,
} from "../../../packages/studio-brush-platform/src/raster-compile";
import { importMybBrush } from "../../../packages/studio-format-gateway/src/myb";

import { ciede2000, encodedToLab } from "./color-lab";

import type { Vec3 } from "./color-lab";
import type { LibMypaintBrushDocument } from "../../../packages/studio-brush-platform/src/libmypaint";
import type { LibMypaintRaw } from "../../../packages/studio-brush-platform/src/libmypaint/index";
import type {
  HokusaiModuleLike,
  RasterStrokeSample,
} from "../../../packages/studio-brush-platform/src/raster-compile";

const REPO_ROOT = new URL("../../..", import.meta.url).pathname;
const RESULTS_DIR = join(REPO_ROOT, "tests", "benchmarks", "results");
const CORPUS_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "myb");
const HOKUSAI_PKG_DIR = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
const LIBMYPAINT_DIR = join(
  REPO_ROOT,
  "packages",
  "studio-brush-platform",
  "src",
  "libmypaint",
);

export const TEXTURE_LAB_BRUSHES = ["wash-soft", "ink-crisp"] as const;
export type TextureLabBrushId = (typeof TEXTURE_LAB_BRUSHES)[number];

export const TEXTURE_LAB_ENGINES = ["libmypaint", "hokusai"] as const;
export type TextureLabEngineId = (typeof TEXTURE_LAB_ENGINES)[number];

const SEED = 7;

/**
 * Texture lane — one straight, constant-pressure stroke that feeds metrics
 * (1) grain, (2) edge and (3) ripple from a single frame.
 *
 * `radiusLogarithmicBase` is pinned (each brush keeps its own pressure curve
 * and dab spacing) so the SAME interior window fits strictly inside the stroke
 * core for both corpus brushes — at native radius ink-crisp's core is ~11 px
 * tall and no meaningful 2-D window exists. Precedent: the parity lab's
 * `readLargeDocument` pins the same setting for its large-brush lane.
 * `pressure` 0.7 was chosen by measurement: it is the highest constant
 * pressure at which NEITHER corpus brush clips the alpha channel at 255
 * (ink-crisp saturates its whole core at p = 0.9), and clipping would erase
 * exactly the interior variation these metrics exist to measure.
 */
export const TEXTURE_LANE = {
  width: 448,
  height: 256,
  centreY: 128,
  x0: 64,
  x1: 384,
  sampleCount: 140,
  sampleIntervalMs: 6,
  pressure: 0.7,
  radiusLogarithmicBase: 4.2,
  /** Interior window for the 2-D DFT (N×N), centred on the stroke core. */
  grainWindow: { size: 64, centreX: 224 },
  /** Steady-state column range (both stroke caps excluded). */
  interior: { xLo: 144, xHi: 304 },
  /** Every Nth interior column feeds the edge statistics. */
  edgeColumnStep: 4,
} as const;

/** Pressure lane — native corpus radius, triangular 0→1→0 pressure ramp. */
export const PRESSURE_LANE = {
  width: 288,
  height: 96,
  centreY: 48,
  x0: 24,
  x1: 264,
  sampleCount: 160,
  sampleIntervalMs: 6,
  /** Pressure band used for the linearity fit and the symmetry mirror. */
  analysisPressureLo: 0.1,
  analysisPressureHi: 0.9,
} as const;

/** Mixing lane — two crossing strokes, native corpus radius. */
export const MIXING_LANE = {
  size: 160,
  strokeLo: 20,
  strokeHi: 140,
  sampleCount: 80,
  sampleIntervalMs: 6,
  /** Second stroke starts well after the first finishes (ms). */
  secondStrokeStartMs: 480,
  /** Intersection window (side length, px) centred on the crossing. */
  windowSize: 16,
  colorA: [0.02, 0.85, 0.85] as const,
  colorB: [0.62, 0.85, 0.85] as const,
} as const;

/** Radial band edges in cycles per pixel (see definition (1)). */
export const GRAIN_BANDS = { lowMax: 1 / 32, midMax: 1 / 8 } as const;
/** Histogram bins for the edge-band alpha distribution (see definition (2)). */
const EDGE_HISTOGRAM_BINS = 32;

/* -------------------------------------------------------------------------- *
 * Small numeric helpers
 * -------------------------------------------------------------------------- */

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

/** Round to `digits` decimals so the results file is diff-readable. */
function round(value: number, digits = 6): number {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

/** Ordinary least squares y = a + b·x, returning the fit and its R². */
function leastSquaresR2(xs: readonly number[], ys: readonly number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return 0;
  const meanX = mean(xs.slice(0, n));
  const meanY = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = (xs[index] ?? 0) - meanX;
    sxy += dx * ((ys[index] ?? 0) - meanY);
    sxx += dx * dx;
  }
  if (sxx === 0) return 0;
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  let ssRes = 0;
  let ssTot = 0;
  for (let index = 0; index < n; index += 1) {
    const predicted = intercept + slope * (xs[index] ?? 0);
    const actual = ys[index] ?? 0;
    ssRes += (actual - predicted) ** 2;
    ssTot += (actual - meanY) ** 2;
  }
  if (ssTot === 0) return 0;
  return 1 - ssRes / ssTot;
}

/** Hann taper h(i) = 0.5·(1 − cos(2πi/(n−1))). */
function hannWindow(length: number): Float64Array {
  const taper = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    taper[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (length - 1)));
  }
  return taper;
}

interface TwiddleTable {
  cos: Float64Array;
  sin: Float64Array;
}

/** exp(−2πij/n) tables; indexing by (k·x mod n) keeps the DFT trig-free. */
function twiddles(n: number): TwiddleTable {
  const cos = new Float64Array(n);
  const sin = new Float64Array(n);
  for (let index = 0; index < n; index += 1) {
    const angle = (-2 * Math.PI * index) / n;
    cos[index] = Math.cos(angle);
    sin[index] = Math.sin(angle);
  }
  return { cos, sin };
}

/**
 * Separable 2-D DFT power spectrum P(kx,ky) = |F|²/N⁴ (definition (1)).
 * Naive O(N³) — exact, dependency-free, and N ≤ 64 here.
 */
export function dft2dPower(samples: Float64Array, n: number): Float64Array {
  const { cos, sin } = twiddles(n);
  const rowRe = new Float64Array(n * n);
  const rowIm = new Float64Array(n * n);
  for (let y = 0; y < n; y += 1) {
    for (let kx = 0; kx < n; kx += 1) {
      let re = 0;
      let im = 0;
      for (let x = 0; x < n; x += 1) {
        const value = samples[y * n + x] ?? 0;
        const twiddle = (kx * x) % n;
        re += value * (cos[twiddle] ?? 0);
        im += value * (sin[twiddle] ?? 0);
      }
      rowRe[y * n + kx] = re;
      rowIm[y * n + kx] = im;
    }
  }
  const power = new Float64Array(n * n);
  const norm = n ** 4;
  for (let kx = 0; kx < n; kx += 1) {
    for (let ky = 0; ky < n; ky += 1) {
      let re = 0;
      let im = 0;
      for (let y = 0; y < n; y += 1) {
        const vr = rowRe[y * n + kx] ?? 0;
        const vi = rowIm[y * n + kx] ?? 0;
        const twiddle = (ky * y) % n;
        const c = cos[twiddle] ?? 0;
        const s = sin[twiddle] ?? 0;
        re += vr * c - vi * s;
        im += vr * s + vi * c;
      }
      power[ky * n + kx] = (re * re + im * im) / norm;
    }
  }
  return power;
}

/** |D(k)|² of a Hann-tapered real sequence (definition (3)). */
export function dft1dPower(values: readonly number[]): Float64Array {
  const n = values.length;
  const taper = hannWindow(n);
  const { cos, sin } = twiddles(n);
  const power = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    let re = 0;
    let im = 0;
    for (let x = 0; x < n; x += 1) {
      const value = (values[x] ?? 0) * (taper[x] ?? 0);
      const twiddle = (k * x) % n;
      re += value * (cos[twiddle] ?? 0);
      im += value * (sin[twiddle] ?? 0);
    }
    power[k] = re * re + im * im;
  }
  return power;
}

/* -------------------------------------------------------------------------- *
 * Frame accessors
 * -------------------------------------------------------------------------- */

interface Frame {
  data: Uint8Array;
  width: number;
  height: number;
}

function alphaAt(frame: Frame, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return 0;
  return frame.data[(y * frame.width + x) * 4 + 3] ?? 0;
}

/** Straight-alpha RGBA composited onto opaque white, in 0..1 encoded RGB. */
function overWhite(frame: Frame, x: number, y: number): Vec3 {
  const offset = (y * frame.width + x) * 4;
  const alpha = (frame.data[offset + 3] ?? 0) / 255;
  const channel = (index: number): number =>
    (((frame.data[offset + index] ?? 0) / 255) * alpha + (1 - alpha));
  return [channel(0), channel(1), channel(2)];
}

/* -------------------------------------------------------------------------- *
 * (1) Grain spectral density
 * -------------------------------------------------------------------------- */

export interface GrainMetrics {
  windowSize: number;
  windowMeanAlpha: number;
  windowStdAlpha: number;
  totalPowerExDc: number;
  /** totalPowerExDc / windowMeanAlpha² — contrast-normalised, cross-brush comparable. */
  totalPowerExDcNormalised: number;
  lowBandEnergy: number;
  midBandEnergy: number;
  highBandEnergy: number;
  lowBandRatio: number;
  midBandRatio: number;
  highBandRatio: number;
  /** midBandEnergy / windowMeanAlpha² — grain strength, comparable across brushes. */
  midBandPowerNormalised: number;
  peakRadialFrequencyCyclesPerPx: number;
  peakRadialPeriodPx: number;
  /** Period of the strongest bin INSIDE the grain band; compare to the dab spacing. */
  midBandPeakPeriodPx: number;
  /** Radial average power per 1/N-wide frequency bin, index r → f = r/N. */
  radialSpectrum: number[];
}

export function grainMetrics(frame: Frame, centreX: number, centreY: number, size: number): GrainMetrics {
  const half = size / 2;
  const raw = new Float64Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      raw[row * size + col] =
        alphaAt(frame, centreX - half + col, centreY - half + row) / 255;
    }
  }
  let sum = 0;
  for (const value of raw) sum += value;
  const windowMean = sum / raw.length;
  let variance = 0;
  for (const value of raw) variance += (value - windowMean) ** 2;
  variance /= raw.length;

  const taper = hannWindow(size);
  const prepared = new Float64Array(size * size);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      prepared[row * size + col] =
        ((raw[row * size + col] ?? 0) - windowMean) * (taper[row] ?? 0) * (taper[col] ?? 0);
    }
  }
  const power = dft2dPower(prepared, size);

  const binCount = Math.ceil((Math.SQRT2 / 2) * size) + 1;
  const binSum = new Float64Array(binCount);
  const binCounts = new Int32Array(binCount);
  let low = 0;
  let mid = 0;
  let high = 0;
  let peakPower = -1;
  let peakFrequency = 0;
  let midPeakPower = -1;
  let midPeakFrequency = 0;
  for (let ky = 0; ky < size; ky += 1) {
    const signedKy = ky <= size / 2 ? ky : ky - size;
    for (let kx = 0; kx < size; kx += 1) {
      if (kx === 0 && ky === 0) continue;
      const signedKx = kx <= size / 2 ? kx : kx - size;
      const frequency = Math.hypot(signedKx, signedKy) / size;
      const value = power[ky * size + kx] ?? 0;
      const bin = Math.min(binCount - 1, Math.floor(frequency * size));
      binSum[bin] = (binSum[bin] ?? 0) + value;
      binCounts[bin] = (binCounts[bin] ?? 0) + 1;
      if (frequency <= GRAIN_BANDS.lowMax) low += value;
      else if (frequency <= GRAIN_BANDS.midMax) {
        mid += value;
        if (value > midPeakPower) {
          midPeakPower = value;
          midPeakFrequency = frequency;
        }
      } else high += value;
      if (value > peakPower) {
        peakPower = value;
        peakFrequency = frequency;
      }
    }
  }
  const total = low + mid + high;
  const radialSpectrum: number[] = [];
  for (let bin = 0; bin < binCount; bin += 1) {
    const count = binCounts[bin] ?? 0;
    radialSpectrum.push(count === 0 ? 0 : (binSum[bin] ?? 0) / count);
  }

  return {
    windowSize: size,
    windowMeanAlpha: windowMean,
    windowStdAlpha: Math.sqrt(variance),
    totalPowerExDc: total,
    totalPowerExDcNormalised: windowMean === 0 ? 0 : total / (windowMean * windowMean),
    lowBandEnergy: low,
    midBandEnergy: mid,
    highBandEnergy: high,
    lowBandRatio: total === 0 ? 0 : low / total,
    midBandRatio: total === 0 ? 0 : mid / total,
    highBandRatio: total === 0 ? 0 : high / total,
    midBandPowerNormalised: windowMean === 0 ? 0 : mid / (windowMean * windowMean),
    peakRadialFrequencyCyclesPerPx: peakFrequency,
    peakRadialPeriodPx: peakFrequency === 0 ? 0 : 1 / peakFrequency,
    midBandPeakPeriodPx: midPeakFrequency === 0 ? 0 : 1 / midPeakFrequency,
    radialSpectrum,
  };
}

/* -------------------------------------------------------------------------- *
 * (2) Edge quality
 * -------------------------------------------------------------------------- */

export interface EdgeMetrics {
  columnsMeasured: number;
  measuredRadiusPx: number;
  peakAlpha: number;
  transitionWidthPx: number;
  transitionWidthPerRadius: number;
  bandSampleCount: number;
  distinctAlphaLevels: number;
  gradationDensity: number;
  alphaEntropyBits: number;
  aliasingIndex: number;
}

interface EdgeCrossing {
  y90: number;
  y10: number;
}

/**
 * Walk outward from `centreY` in `direction` and interpolate the rows where the
 * column alpha crosses 0.9·peak and 0.1·peak. Returns undefined when the edge
 * leaves the frame (that column/side is then excluded from the statistics).
 */
function findEdgeCrossing(
  frame: Frame,
  x: number,
  centreY: number,
  direction: 1 | -1,
  peak: number,
): EdgeCrossing | undefined {
  const high = 0.9 * peak;
  const lowLevel = 0.1 * peak;
  let y90: number | undefined;
  let y10: number | undefined;
  let previousY = centreY;
  let previousValue = alphaAt(frame, x, centreY);
  for (let step = 1; ; step += 1) {
    const y = centreY + direction * step;
    if (y < 0 || y >= frame.height) return undefined;
    const value = alphaAt(frame, x, y);
    const interpolate = (level: number): number => {
      const span = previousValue - value;
      if (span === 0) return y;
      return previousY + ((previousValue - level) / span) * (y - previousY);
    };
    if (y90 === undefined && value < high) y90 = interpolate(high);
    if (y90 !== undefined && value < lowLevel) {
      y10 = interpolate(lowLevel);
      break;
    }
    previousY = y;
    previousValue = value;
  }
  if (y90 === undefined || y10 === undefined) return undefined;
  return { y90, y10 };
}

export function edgeMetrics(
  frame: Frame,
  centreY: number,
  columns: readonly number[],
): EdgeMetrics {
  const widths: number[] = [];
  const radii: number[] = [];
  const peaks: number[] = [];
  const densities: number[] = [];
  const distinct = new Set<number>();
  const histogram = new Int32Array(EDGE_HISTOGRAM_BINS);
  let bandSampleCount = 0;

  for (const x of columns) {
    let peak = 0;
    for (let y = 0; y < frame.height; y += 1) peak = Math.max(peak, alphaAt(frame, x, y));
    if (peak === 0) continue;
    peaks.push(peak);
    for (const direction of [1, -1] as const) {
      const crossing = findEdgeCrossing(frame, x, centreY, direction, peak);
      if (!crossing) continue;
      widths.push(Math.abs(crossing.y10 - crossing.y90));
      // Transition band ±1 px so a hard edge still contributes its partial rows.
      const lo = Math.floor(Math.min(crossing.y90, crossing.y10)) - 1;
      const hi = Math.ceil(Math.max(crossing.y90, crossing.y10)) + 1;
      const sideDistinct = new Set<number>();
      let sideRows = 0;
      for (let y = lo; y <= hi; y += 1) {
        const alpha = alphaAt(frame, x, y);
        // Coverage, not raw alpha: a faint brush must not read as "discrete"
        // merely because it never reaches the upper bins.
        const coverage = alpha / peak;
        const bin = Math.min(
          EDGE_HISTOGRAM_BINS - 1,
          Math.floor(Math.min(1, Math.max(0, coverage)) * EDGE_HISTOGRAM_BINS),
        );
        histogram[bin] = (histogram[bin] ?? 0) + 1;
        bandSampleCount += 1;
        sideRows += 1;
        sideDistinct.add(alpha);
        distinct.add(alpha);
      }
      if (sideRows > 0) densities.push(sideDistinct.size / sideRows);
      let outermost = centreY;
      for (let step = 1; ; step += 1) {
        const y = centreY + direction * step;
        if (y < 0 || y >= frame.height || alphaAt(frame, x, y) === 0) break;
        outermost = y;
      }
      radii.push(Math.abs(outermost - centreY));
    }
  }

  let entropy = 0;
  for (const count of histogram) {
    if (count === 0) continue;
    const p = count / bandSampleCount;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(EDGE_HISTOGRAM_BINS);
  const radius = mean(radii);
  const width = mean(widths);

  return {
    columnsMeasured: columns.length,
    measuredRadiusPx: radius,
    peakAlpha: mean(peaks),
    transitionWidthPx: width,
    transitionWidthPerRadius: radius === 0 ? 0 : width / radius,
    bandSampleCount,
    distinctAlphaLevels: distinct.size,
    gradationDensity: mean(densities),
    alphaEntropyBits: entropy,
    aliasingIndex: bandSampleCount === 0 ? 0 : 1 - entropy / maxEntropy,
  };
}

/* -------------------------------------------------------------------------- *
 * (3) Dab overlap uniformity (ripple)
 * -------------------------------------------------------------------------- */

export interface RippleMetrics {
  samples: number;
  centrelineMeanAlpha: number;
  rippleRmsAlpha: number;
  rippleCv: number;
  ripplePeriodPx: number;
  expectedDabSpacingPx: number;
  ripplePeriodOverDabSpacing: number;
  saturatedCentrelineFraction: number;
}

export function rippleMetrics(
  frame: Frame,
  centreY: number,
  xLo: number,
  xHi: number,
  expectedDabSpacingPx: number,
): RippleMetrics {
  const profile: number[] = [];
  const positions: number[] = [];
  let saturated = 0;
  for (let x = xLo; x < xHi; x += 1) {
    const alpha = alphaAt(frame, x, centreY);
    if (alpha === 255) saturated += 1;
    profile.push(alpha);
    positions.push(x);
  }
  const meanAlpha = mean(profile);
  // Linear detrend so a slow drift (slow-tracking lead-in) is not read as ripple.
  const meanX = mean(positions);
  let sxy = 0;
  let sxx = 0;
  for (let index = 0; index < profile.length; index += 1) {
    const dx = (positions[index] ?? 0) - meanX;
    sxy += dx * ((profile[index] ?? 0) - meanAlpha);
    sxx += dx * dx;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const residual = profile.map(
    (value, index) => value - (meanAlpha + slope * ((positions[index] ?? 0) - meanX)),
  );
  const rms = Math.sqrt(mean(residual.map((value) => value * value)));

  const power = dft1dPower(residual);
  let peakK = 1;
  let peakPower = -1;
  for (let k = 1; k <= residual.length / 2; k += 1) {
    const value = power[k] ?? 0;
    if (value > peakPower) {
      peakPower = value;
      peakK = k;
    }
  }
  const period = residual.length / peakK;

  return {
    samples: profile.length,
    centrelineMeanAlpha: meanAlpha,
    rippleRmsAlpha: rms,
    rippleCv: meanAlpha === 0 ? 0 : rms / meanAlpha,
    ripplePeriodPx: period,
    expectedDabSpacingPx,
    ripplePeriodOverDabSpacing:
      expectedDabSpacingPx === 0 ? 0 : period / expectedDabSpacingPx,
    saturatedCentrelineFraction: profile.length === 0 ? 0 : saturated / profile.length,
  };
}

/* -------------------------------------------------------------------------- *
 * (4) Pressure response linearity
 * -------------------------------------------------------------------------- */

export interface PressureResponseMetrics {
  columnsFitted: number;
  massAtPressure: Record<string, number>;
  r2Linear: number;
  r2LogLinear: number;
  taperAsymmetry: number;
  saturatedCorePixels: number;
}

export function pressureResponseMetrics(frame: Frame): PressureResponseMetrics {
  const { x0, x1, analysisPressureLo, analysisPressureHi } = PRESSURE_LANE;
  const span = x1 - x0;
  const apexX = x0 + span / 2;
  const mass: number[] = [];
  let saturated = 0;
  for (let x = 0; x < frame.width; x += 1) {
    let column = 0;
    for (let y = 0; y < frame.height; y += 1) {
      const alpha = alphaAt(frame, x, y);
      if (alpha === 255) saturated += 1;
      column += alpha / 255;
    }
    mass.push(column);
  }

  const pressures: number[] = [];
  const masses: number[] = [];
  const logMasses: number[] = [];
  const logPressures: number[] = [];
  const risingMass: number[] = [];
  const fallingMass: number[] = [];
  const loX = Math.ceil(x0 + (analysisPressureLo / 2) * span);
  const hiX = Math.floor(x0 + (analysisPressureHi / 2) * span);
  for (let x = loX; x <= hiX; x += 1) {
    const pressure = (2 * (x - x0)) / span;
    const value = mass[x] ?? 0;
    pressures.push(pressure);
    masses.push(value);
    if (value > 0) {
      logPressures.push(pressure);
      logMasses.push(Math.log(value));
    }
    risingMass.push(value);
    fallingMass.push(mass[Math.round(2 * apexX - x)] ?? 0);
  }

  const differences = risingMass.map((value, index) => value - (fallingMass[index] ?? 0));
  const averages = risingMass.map((value, index) => (value + (fallingMass[index] ?? 0)) / 2);
  const asymmetryRms = Math.sqrt(mean(differences.map((value) => value * value)));
  const averageMass = mean(averages);

  const massAtPressure: Record<string, number> = {};
  for (const probe of [0.25, 0.5, 0.75]) {
    const x = Math.round(x0 + (probe / 2) * span);
    massAtPressure[probe.toFixed(2)] = round(mass[x] ?? 0, 4);
  }

  return {
    columnsFitted: masses.length,
    massAtPressure,
    r2Linear: leastSquaresR2(pressures, masses),
    r2LogLinear: leastSquaresR2(logPressures, logMasses),
    taperAsymmetry: averageMass === 0 ? 0 : asymmetryRms / averageMass,
    saturatedCorePixels: saturated,
  };
}

/* -------------------------------------------------------------------------- *
 * (5) Colour mixing accuracy
 * -------------------------------------------------------------------------- */

export interface MixingMetrics {
  smudgeBaseValue: number;
  intersectionMeanAlpha: number;
  deltaE00VsLinearMean: number;
  deltaE00VsLinearMax: number;
  identicalToLinear: boolean;
}

function intersectionPixels(): Array<[number, number]> {
  const centre = MIXING_LANE.size / 2;
  const half = MIXING_LANE.windowSize / 2;
  const pixels: Array<[number, number]> = [];
  for (let y = centre - half; y < centre + half; y += 1) {
    for (let x = centre - half; x < centre + half; x += 1) pixels.push([x, y]);
  }
  return pixels;
}

export function mixingMetrics(
  smudgeFrame: Frame,
  linearFrame: Frame,
  smudgeBaseValue: number,
): MixingMetrics {
  const deltas: number[] = [];
  const alphas: number[] = [];
  for (const [x, y] of intersectionPixels()) {
    const labSmudge = encodedToLab(overWhite(smudgeFrame, x, y), "srgb");
    const labLinear = encodedToLab(overWhite(linearFrame, x, y), "srgb");
    deltas.push(ciede2000(labSmudge, labLinear));
    alphas.push(alphaAt(smudgeFrame, x, y));
  }
  let identical = smudgeFrame.data.length === linearFrame.data.length;
  if (identical) {
    for (let index = 0; index < smudgeFrame.data.length; index += 1) {
      if (smudgeFrame.data[index] !== linearFrame.data[index]) {
        identical = false;
        break;
      }
    }
  }
  return {
    smudgeBaseValue,
    intersectionMeanAlpha: mean(alphas),
    deltaE00VsLinearMean: mean(deltas),
    deltaE00VsLinearMax: deltas.length === 0 ? 0 : Math.max(...deltas),
    identicalToLinear: identical,
  };
}

/** Mean ΔE00 between two engines' frames over the intersection window. */
function crossEngineDeltaE00(a: Frame, b: Frame): { meanDeltaE00: number; maxDeltaE00: number } {
  const deltas: number[] = [];
  for (const [x, y] of intersectionPixels()) {
    deltas.push(
      ciede2000(encodedToLab(overWhite(a, x, y), "srgb"), encodedToLab(overWhite(b, x, y), "srgb")),
    );
  }
  return {
    meanDeltaE00: mean(deltas),
    maxDeltaE00: deltas.length === 0 ? 0 : Math.max(...deltas),
  };
}

/* -------------------------------------------------------------------------- *
 * Stroke paths
 * -------------------------------------------------------------------------- */

function textureStrokeSamples(): RasterStrokeSample[] {
  const { x0, x1, centreY, sampleCount, sampleIntervalMs, pressure } = TEXTURE_LANE;
  const samples: RasterStrokeSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    samples.push({
      x: x0 + t * (x1 - x0),
      y: centreY,
      pressure,
      tiltX: 0,
      tiltY: 0,
      tMs: index * sampleIntervalMs,
    });
  }
  return samples;
}

function pressureStrokeSamples(): RasterStrokeSample[] {
  const { x0, x1, centreY, sampleCount, sampleIntervalMs } = PRESSURE_LANE;
  const samples: RasterStrokeSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    samples.push({
      x: x0 + t * (x1 - x0),
      y: centreY,
      // Triangular 0 → 1 → 0: the rising half carries the linearity fit, the
      // mirrored falling half carries the taper-symmetry comparison.
      pressure: t <= 0.5 ? 2 * t : 2 * (1 - t),
      tiltX: 0,
      tiltY: 0,
      tMs: index * sampleIntervalMs,
    });
  }
  return samples;
}

function mixingStrokeSamples(axis: "horizontal" | "vertical"): RasterStrokeSample[] {
  const { size, strokeLo, strokeHi, sampleCount, sampleIntervalMs, secondStrokeStartMs } =
    MIXING_LANE;
  const startMs = axis === "horizontal" ? 0 : secondStrokeStartMs;
  const samples: RasterStrokeSample[] = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const t = index / (sampleCount - 1);
    const along = strokeLo + t * (strokeHi - strokeLo);
    samples.push({
      x: axis === "horizontal" ? along : size / 2,
      y: axis === "horizontal" ? size / 2 : along,
      pressure: 1,
      tiltX: 0,
      tiltY: 0,
      tMs: startMs + index * sampleIntervalMs,
    });
  }
  return samples;
}

/* -------------------------------------------------------------------------- *
 * Corpus documents
 * -------------------------------------------------------------------------- */

interface CorpusDocument extends LibMypaintBrushDocument {
  version: 3;
}

async function readCorpusDocument(id: TextureLabBrushId): Promise<CorpusDocument> {
  const bytes = await readFile(join(CORPUS_DIR, `${id}.myb`));
  // importMybBrush normalises every setting to { base_value, inputs } — the raw
  // JSON omits `inputs` on curve-free settings, which applyMybSettings rejects.
  const { document } = importMybBrush(new Uint8Array(bytes), id, id);
  return document as CorpusDocument;
}

function withSetting(
  document: CorpusDocument,
  name: string,
  baseValue: number,
): CorpusDocument {
  const existing = document.settings[name];
  return {
    ...document,
    settings: {
      ...document.settings,
      [name]: { base_value: baseValue, inputs: existing?.inputs ?? {} },
    },
  };
}

function settingBaseValue(document: CorpusDocument, name: string): number {
  return document.settings[name]?.base_value ?? 0;
}

/* -------------------------------------------------------------------------- *
 * Engine drivers
 * -------------------------------------------------------------------------- */

export interface TextureLabEngines {
  libmypaint: LibMypaintRaw;
  hokusai: HokusaiModuleLike;
}

function hokusaiCompiled(document: CorpusDocument, id: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(document));
  const { preset } = importMybBrush(bytes, id, id);
  return compileRasterBrush(preset);
}

function renderSingleStroke(
  engines: TextureLabEngines,
  engine: TextureLabEngineId,
  document: CorpusDocument,
  id: string,
  width: number,
  height: number,
  samples: readonly RasterStrokeSample[],
): Frame {
  if (engine === "libmypaint") {
    const result = renderLibMypaintStroke(engines.libmypaint, document, {
      width,
      height,
      seed: SEED,
      samples,
    });
    return { data: result.frame, width, height };
  }
  const result = renderCompiledBrushStroke(engines.hokusai, hokusaiCompiled(document, id), {
    width,
    height,
    seed: SEED,
    samples,
  });
  return { data: result.frame, width, height };
}

/**
 * Two colour strokes on ONE surface. `renderLibMypaintStroke` /
 * `renderCompiledBrushStroke` each own a fresh surface, so the mixing lane
 * drives the engines directly — the libmypaint sample feed below is the exact
 * contract those helpers implement (dtime 0.0001 s first, then Δt/1000 s, then
 * eight idle 16 ms events to resolve the slow-tracking tail).
 */
function renderCrossStrokes(
  engines: TextureLabEngines,
  engine: TextureLabEngineId,
  document: CorpusDocument,
  id: string,
): Frame {
  const size = MIXING_LANE.size;
  const passes = [
    { samples: mixingStrokeSamples("horizontal"), color: MIXING_LANE.colorA },
    { samples: mixingStrokeSamples("vertical"), color: MIXING_LANE.colorB },
  ] as const;

  if (engine === "libmypaint") {
    const lmp = engines.libmypaint;
    const brush = lmp.brushNew();
    const surface = lmp.surfaceNew(size, size);
    try {
      applyMybSettings(lmp, brush, document);
      for (const pass of passes) {
        lmp.brushSetBaseValue(brush, lmp.settingId("color_h"), pass.color[0]);
        lmp.brushSetBaseValue(brush, lmp.settingId("color_s"), pass.color[1]);
        lmp.brushSetBaseValue(brush, lmp.settingId("color_v"), pass.color[2]);
        lmp.brushNewStroke(brush, SEED);
        let previousTMs: number | undefined;
        let last = pass.samples[0];
        for (const sample of pass.samples) {
          const dtime =
            previousTMs === undefined ? 0.0001 : Math.max(0, sample.tMs - previousTMs) / 1000;
          lmp.strokeTo(brush, surface, sample.x, sample.y, sample.pressure, 0, 0, dtime);
          previousTMs = sample.tMs;
          last = sample;
        }
        if (last) {
          for (let step = 0; step < 8; step += 1) {
            lmp.strokeTo(brush, surface, last.x, last.y, last.pressure, 0, 0, 0.016);
          }
        }
      }
      return { data: lmp.surfaceToRgba8(surface, size, size), width: size, height: size };
    } finally {
      lmp.surfaceFree(surface);
      lmp.brushFree(brush);
    }
  }

  const compiled = hokusaiCompiled(document, id);
  const brush = new engines.hokusai.HokusaiBrush(compiled.mybJson);
  const canvas = new engines.hokusai.HokusaiCanvas(size, size, SEED);
  try {
    for (const pass of passes) {
      brush.setColorHsv(pass.color[0], pass.color[1], pass.color[2]);
      canvas.beginStroke(brush, SEED);
      for (const sample of pass.samples) {
        canvas.addSample(brush, sample.x, sample.y, sample.pressure, 0, 0, sample.tMs);
      }
      canvas.finishStroke(brush);
    }
    return { data: canvas.fullFrame(), width: size, height: size };
  } finally {
    canvas.dispose();
    canvas.free();
    brush.free();
  }
}

/* -------------------------------------------------------------------------- *
 * Measurement
 * -------------------------------------------------------------------------- */

export interface EngineTextureRecord {
  /** sha256 of each lane's RGBA8 frame — pixel identity across engine upgrades. */
  frameSha256: {
    texture: string;
    pressure: string;
    mixing: string;
    mixingLinear: string;
  };
  grain: GrainMetrics;
  edge: EdgeMetrics;
  ripple: RippleMetrics;
  pressure: PressureResponseMetrics;
  mixing: MixingMetrics;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export interface BrushTextureRecord {
  dabsPerActualRadius: number;
  hardness: number;
  smudge: number;
  libmypaint: EngineTextureRecord;
  hokusai: EngineTextureRecord;
  crossEngine: {
    grainMidBandRatioDelta: number;
    grainLowBandRatioDelta: number;
    transitionWidthDeltaPx: number;
    aliasingIndexDelta: number;
    rippleCvDelta: number;
    r2LogLinearDelta: number;
    /** Evidence only — confounded by the engines' RGB readback difference. */
    mixingCrossEngineDeltaE00Mean: number;
    mixingCrossEngineDeltaE00Max: number;
  };
}

function measureEngine(
  engines: TextureLabEngines,
  engine: TextureLabEngineId,
  id: TextureLabBrushId,
  nativeDocument: CorpusDocument,
): { record: EngineTextureRecord; mixingFrame: Frame } {
  const textureDocument = withSetting(
    nativeDocument,
    "radius_logarithmic",
    TEXTURE_LANE.radiusLogarithmicBase,
  );
  const textureFrame = renderSingleStroke(
    engines,
    engine,
    textureDocument,
    `${id}-texture`,
    TEXTURE_LANE.width,
    TEXTURE_LANE.height,
    textureStrokeSamples(),
  );

  const columns: number[] = [];
  for (
    let x = TEXTURE_LANE.interior.xLo;
    x < TEXTURE_LANE.interior.xHi;
    x += TEXTURE_LANE.edgeColumnStep
  ) {
    columns.push(x);
  }

  const grain = grainMetrics(
    textureFrame,
    TEXTURE_LANE.grainWindow.centreX,
    TEXTURE_LANE.centreY,
    TEXTURE_LANE.grainWindow.size,
  );
  const edge = edgeMetrics(textureFrame, TEXTURE_LANE.centreY, columns);
  const dabsPerActualRadius = settingBaseValue(nativeDocument, "dabs_per_actual_radius");
  const ripple = rippleMetrics(
    textureFrame,
    TEXTURE_LANE.centreY,
    TEXTURE_LANE.interior.xLo,
    TEXTURE_LANE.interior.xHi,
    dabsPerActualRadius === 0 ? 0 : edge.measuredRadiusPx / dabsPerActualRadius,
  );

  const pressureFrame = renderSingleStroke(
    engines,
    engine,
    nativeDocument,
    `${id}-pressure`,
    PRESSURE_LANE.width,
    PRESSURE_LANE.height,
    pressureStrokeSamples(),
  );
  const pressure = pressureResponseMetrics(pressureFrame);

  const smudge = settingBaseValue(nativeDocument, "smudge");
  const mixingFrame = renderCrossStrokes(engines, engine, nativeDocument, `${id}-mix`);
  const linearFrame = renderCrossStrokes(
    engines,
    engine,
    withSetting(nativeDocument, "smudge", 0),
    `${id}-mix-linear`,
  );
  const mixing = mixingMetrics(mixingFrame, linearFrame, smudge);

  return {
    record: {
      frameSha256: {
        texture: sha256(textureFrame.data),
        pressure: sha256(pressureFrame.data),
        mixing: sha256(mixingFrame.data),
        mixingLinear: sha256(linearFrame.data),
      },
      grain,
      edge,
      ripple,
      pressure,
      mixing,
    },
    mixingFrame,
  };
}

/** Measure one corpus brush on both engines. */
export async function measureBrushTexture(
  engines: TextureLabEngines,
  id: TextureLabBrushId,
): Promise<BrushTextureRecord> {
  const document = await readCorpusDocument(id);
  const libmypaint = measureEngine(engines, "libmypaint", id, document);
  const hokusai = measureEngine(engines, "hokusai", id, document);
  const cross = crossEngineDeltaE00(libmypaint.mixingFrame, hokusai.mixingFrame);
  return {
    dabsPerActualRadius: settingBaseValue(document, "dabs_per_actual_radius"),
    hardness: settingBaseValue(document, "hardness"),
    smudge: settingBaseValue(document, "smudge"),
    libmypaint: libmypaint.record,
    hokusai: hokusai.record,
    crossEngine: {
      grainMidBandRatioDelta:
        hokusai.record.grain.midBandRatio - libmypaint.record.grain.midBandRatio,
      grainLowBandRatioDelta:
        hokusai.record.grain.lowBandRatio - libmypaint.record.grain.lowBandRatio,
      transitionWidthDeltaPx:
        hokusai.record.edge.transitionWidthPx - libmypaint.record.edge.transitionWidthPx,
      aliasingIndexDelta:
        hokusai.record.edge.aliasingIndex - libmypaint.record.edge.aliasingIndex,
      rippleCvDelta: hokusai.record.ripple.rippleCv - libmypaint.record.ripple.rippleCv,
      r2LogLinearDelta:
        hokusai.record.pressure.r2LogLinear - libmypaint.record.pressure.r2LogLinear,
      mixingCrossEngineDeltaE00Mean: cross.meanDeltaE00,
      mixingCrossEngineDeltaE00Max: cross.maxDeltaE00,
    },
  };
}

/* -------------------------------------------------------------------------- *
 * Regression bounds
 * -------------------------------------------------------------------------- */

/**
 * Gate band for a strictly positive metric: [min/2, max·2] over the engines
 * that produced it — literally "2× headroom around the measurement". Nothing
 * is invented; the band always brackets every observed value.
 */
export function gateBand(values: readonly number[]): { lo: number; hi: number } {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return { lo: 0, hi: 0 };
  return { lo: Math.min(...finite) / 2, hi: Math.max(...finite) * 2 };
}

/** Same idea for a metric bounded in [0,1]: the upper edge is clamped. */
function gateBandUnit(values: readonly number[]): { lo: number; hi: number } {
  const band = gateBand(values);
  return { lo: band.lo, hi: Math.min(1, band.hi) };
}

/* -------------------------------------------------------------------------- *
 * Engine loading (tsx entry point)
 * -------------------------------------------------------------------------- */

/** A `Module.cwrap`-produced binding: emscripten marshals string|number args. */
type CwrappedFunction = (...args: Array<string | number>) => number;

interface LibMypaintEmscriptenLike {
  cwrap: (
    name: string,
    returnType: string | null,
    argTypes: readonly string[],
  ) => CwrappedFunction;
  UTF8ToString: (pointer: number) => string;
  _malloc: (bytes: number) => number;
  _free: (pointer: number) => void;
  HEAPU8: Uint8Array;
}

/**
 * libmypaint's package loader (`libmypaint/index.ts`) resolves its emscripten
 * glue extensionlessly (`./mypaint-wasm`), which Vite/Vitest resolves and plain
 * Node ESM (tsx) does not. This harness therefore binds the SAME exported C
 * entry points itself. The gate test loads the package's `loadLibMypaint`
 * instead and recomputes every number in the results file, so any drift
 * between this binding and the package one fails CI.
 */
async function loadLibMypaintForTsx(): Promise<LibMypaintRaw> {
  const glueUrl = pathToFileURL(join(LIBMYPAINT_DIR, "mypaint-wasm.mjs")).href;
  const glue = (await import(/* @vite-ignore */ glueUrl)) as {
    default: () => Promise<LibMypaintEmscriptenLike>;
  };
  const wasmModule = await glue.default();
  const wrap = wasmModule.cwrap.bind(wasmModule);
  const version = wrap("lmp_version", "number", []);
  const surfaceToRgba8 = wrap("lmp_surface_to_rgba8", null, ["number", "number"]);
  return {
    version: () => wasmModule.UTF8ToString(version()),
    settingCount: wrap("lmp_setting_count", "number", []),
    inputCount: wrap("lmp_input_count", "number", []),
    settingId: wrap("lmp_setting_id", "number", ["string"]),
    inputId: wrap("lmp_input_id", "number", ["string"]),
    brushNew: wrap("lmp_brush_new", "number", []),
    brushFree: wrap("lmp_brush_free", null, ["number"]),
    brushSetBaseValue: wrap("lmp_brush_set_base_value", null, ["number", "number", "number"]),
    brushGetBaseValue: wrap("lmp_brush_get_base_value", "number", ["number", "number"]),
    brushSetMappingN: wrap("lmp_brush_set_mapping_n", null, [
      "number",
      "number",
      "number",
      "number",
    ]),
    brushSetMappingPoint: wrap("lmp_brush_set_mapping_point", null, [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
    ]),
    brushNewStroke: wrap("lmp_brush_new_stroke", null, ["number", "number"]),
    surfaceNew: wrap("lmp_surface_new", "number", ["number", "number"]),
    surfaceFree: wrap("lmp_surface_free", null, ["number"]),
    strokeTo: wrap("lmp_stroke_to", "number", [
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
      "number",
    ]),
    surfaceToRgba8: (surface: number, width: number, height: number) => {
      const byteLength = width * height * 4;
      const pointer = wasmModule._malloc(byteLength);
      try {
        surfaceToRgba8(surface, pointer);
        return new Uint8Array(wasmModule.HEAPU8.subarray(pointer, pointer + byteLength));
      } finally {
        wasmModule._free(pointer);
      }
    },
    module: wasmModule as unknown as LibMypaintRaw["module"],
  };
}

/** Load the pinned hokusai wasm module (same pkg the parity lab pins). */
export async function loadHokusaiModule(): Promise<HokusaiModuleLike> {
  const modulePath = join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm.js");
  const hokusaiModule = (await import(/* @vite-ignore */ modulePath)) as {
    default: (init: { module_or_path: Uint8Array }) => Promise<unknown>;
  };
  const wasmBytes = await readFile(join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm_bg.wasm"));
  await hokusaiModule.default({ module_or_path: new Uint8Array(wasmBytes) });
  return hokusaiModule as unknown as HokusaiModuleLike;
}

/* -------------------------------------------------------------------------- *
 * Report
 * -------------------------------------------------------------------------- */

function roundEngineRecord(record: EngineTextureRecord): EngineTextureRecord {
  return {
    frameSha256: record.frameSha256,
    grain: {
      ...record.grain,
      windowMeanAlpha: round(record.grain.windowMeanAlpha),
      windowStdAlpha: round(record.grain.windowStdAlpha),
      totalPowerExDc: round(record.grain.totalPowerExDc, 12),
      totalPowerExDcNormalised: round(record.grain.totalPowerExDcNormalised, 10),
      lowBandEnergy: round(record.grain.lowBandEnergy, 12),
      midBandEnergy: round(record.grain.midBandEnergy, 12),
      highBandEnergy: round(record.grain.highBandEnergy, 12),
      lowBandRatio: round(record.grain.lowBandRatio),
      midBandRatio: round(record.grain.midBandRatio),
      highBandRatio: round(record.grain.highBandRatio),
      midBandPowerNormalised: round(record.grain.midBandPowerNormalised, 10),
      peakRadialFrequencyCyclesPerPx: round(record.grain.peakRadialFrequencyCyclesPerPx),
      peakRadialPeriodPx: round(record.grain.peakRadialPeriodPx, 4),
      midBandPeakPeriodPx: round(record.grain.midBandPeakPeriodPx, 4),
      radialSpectrum: record.grain.radialSpectrum.map((value) => round(value, 12)),
    },
    edge: {
      ...record.edge,
      measuredRadiusPx: round(record.edge.measuredRadiusPx, 4),
      peakAlpha: round(record.edge.peakAlpha, 4),
      transitionWidthPx: round(record.edge.transitionWidthPx, 4),
      transitionWidthPerRadius: round(record.edge.transitionWidthPerRadius),
      gradationDensity: round(record.edge.gradationDensity),
      alphaEntropyBits: round(record.edge.alphaEntropyBits),
      aliasingIndex: round(record.edge.aliasingIndex),
    },
    ripple: {
      ...record.ripple,
      centrelineMeanAlpha: round(record.ripple.centrelineMeanAlpha, 4),
      rippleRmsAlpha: round(record.ripple.rippleRmsAlpha),
      rippleCv: round(record.ripple.rippleCv),
      ripplePeriodPx: round(record.ripple.ripplePeriodPx, 4),
      expectedDabSpacingPx: round(record.ripple.expectedDabSpacingPx, 4),
      ripplePeriodOverDabSpacing: round(record.ripple.ripplePeriodOverDabSpacing),
      saturatedCentrelineFraction: round(record.ripple.saturatedCentrelineFraction),
    },
    pressure: {
      ...record.pressure,
      r2Linear: round(record.pressure.r2Linear),
      r2LogLinear: round(record.pressure.r2LogLinear),
      taperAsymmetry: round(record.pressure.taperAsymmetry),
    },
    mixing: {
      ...record.mixing,
      intersectionMeanAlpha: round(record.mixing.intersectionMeanAlpha, 4),
      deltaE00VsLinearMean: round(record.mixing.deltaE00VsLinearMean),
      deltaE00VsLinearMax: round(record.mixing.deltaE00VsLinearMax),
    },
  };
}

/** Exported so the gate can round a fresh measurement the same way before comparing. */
export function roundBrushRecord(record: BrushTextureRecord): BrushTextureRecord {
  return {
    ...record,
    libmypaint: roundEngineRecord(record.libmypaint),
    hokusai: roundEngineRecord(record.hokusai),
    crossEngine: {
      grainMidBandRatioDelta: round(record.crossEngine.grainMidBandRatioDelta),
      grainLowBandRatioDelta: round(record.crossEngine.grainLowBandRatioDelta),
      transitionWidthDeltaPx: round(record.crossEngine.transitionWidthDeltaPx, 4),
      aliasingIndexDelta: round(record.crossEngine.aliasingIndexDelta),
      rippleCvDelta: round(record.crossEngine.rippleCvDelta),
      r2LogLinearDelta: round(record.crossEngine.r2LogLinearDelta),
      mixingCrossEngineDeltaE00Mean: round(record.crossEngine.mixingCrossEngineDeltaE00Mean),
      mixingCrossEngineDeltaE00Max: round(record.crossEngine.mixingCrossEngineDeltaE00Max),
    },
  };
}

function buildGateBounds(
  measurements: Record<string, BrushTextureRecord>,
): Record<string, Record<string, { lo: number; hi: number }>> {
  const bounds: Record<string, Record<string, { lo: number; hi: number }>> = {};
  for (const [id, record] of Object.entries(measurements)) {
    const engines = [record.libmypaint, record.hokusai];
    const band = (pick: (engine: EngineTextureRecord) => number) =>
      gateBand(engines.map(pick));
    const unitBand = (pick: (engine: EngineTextureRecord) => number) =>
      gateBandUnit(engines.map(pick));
    const roundBand = (value: { lo: number; hi: number }) => ({
      lo: round(value.lo),
      hi: round(value.hi),
    });
    bounds[id] = {
      grainMidBandRatio: roundBand(unitBand((engine) => engine.grain.midBandRatio)),
      grainLowBandRatio: roundBand(unitBand((engine) => engine.grain.lowBandRatio)),
      grainTotalPowerExDc: roundBand(band((engine) => engine.grain.totalPowerExDc)),
      edgeTransitionWidthPx: roundBand(band((engine) => engine.edge.transitionWidthPx)),
      edgeTransitionWidthPerRadius: roundBand(
        unitBand((engine) => engine.edge.transitionWidthPerRadius),
      ),
      edgeAliasingIndex: roundBand(unitBand((engine) => engine.edge.aliasingIndex)),
      edgeGradationDensity: roundBand(unitBand((engine) => engine.edge.gradationDensity)),
      rippleCv: roundBand(band((engine) => engine.ripple.rippleCv)),
      pressureR2LogLinear: roundBand(unitBand((engine) => engine.pressure.r2LogLinear)),
      pressureTaperAsymmetry: roundBand(band((engine) => engine.pressure.taperAsymmetry)),
      mixingDeltaE00VsLinearMean: roundBand(
        band((engine) => engine.mixing.deltaE00VsLinearMean),
      ),
    };
  }
  return bounds;
}

async function main(): Promise<void> {
  const engines: TextureLabEngines = {
    libmypaint: await loadLibMypaintForTsx(),
    hokusai: await loadHokusaiModule(),
  };

  const measurements: Record<string, BrushTextureRecord> = {};
  for (const id of TEXTURE_LAB_BRUSHES) {
    measurements[id] = roundBrushRecord(await measureBrushTexture(engines, id));
  }

  const report = {
    harness: "tests/benchmarks/harness/brush-texture-lab.ts",
    generatedAt: new Date().toISOString(),
    host: {
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model,
      node: process.version,
    },
    pin: {
      libmypaint: engines.libmypaint.version(),
      libmypaintBuild:
        "packages/studio-brush-platform/src/libmypaint/bridge/build.sh (json-c bypassed; injection API only)",
      hokusai: "hokusai-core 0.3.0 via packages/studio-hokusai-wasm",
      corpus: "tests/corpus/brushes/myb/{wash-soft,ink-crisp}.myb",
      deltaE: "CIEDE2000 (Sharma/Wu/Dalal 2005) via tests/benchmarks/harness/color-lab.ts",
    },
    roles: {
      libmypaint: "reference",
      hokusai: "challenger",
    },
    definitions: {
      grainSpectralDensity:
        "w(x,y) = (A(x,y) − Ā)·h(x)·h(y) with Hann h(i) = 0.5(1 − cos(2πi/(N−1))); F = Σ w·exp(−2πi(kx·x + ky·y)/N); P = |F|²/N⁴; f = hypot(k̂x,k̂y)/N cycles/px (k̂ = k for k ≤ N/2 else k − N); E_low = ΣP over 0 < f ≤ 1/32 (period ≥ 32 px, the stroke's falloff envelope), E_mid over 1/32 < f ≤ 1/8 (period 8–32 px, the dab-scale grain band — the corpus brushes' measured dab cadence in this lane is 13.3 px and 19.6 px, bracketed ~1.5× on each side), E_high over f > 1/8 (period < 8 px, sub-dab noise); ratio_b = E_b/(E_low+E_mid+E_high). Ratios are only interpretable next to totalPowerExDc: a flat interior has near-zero power everywhere.",
      edgeQuality:
        "Per column, A* = max_y A; walk outward from the centre row to the linearly interpolated crossings of 0.9·A* (y90) and 0.1·A* (y10); transitionWidth = |y10 − y90| px, averaged over all columns and both sides; transitionWidthPerRadius = transitionWidth / mean(distance from centre to outermost A > 0). Discreteness: 32-bin histogram of the COVERAGE A/A* over the y90..y10 band (±1 px) with probabilities p_i, H = −Σ p_i log2 p_i bits, aliasingIndex = 1 − H/log2(32) ∈ [0,1] (1 = the transition repeats a few coverage levels — stair-stepping; 0 = fully graded). Peak normalisation is required: an absolute-alpha histogram would score a faint brush as discrete purely for being faint. gradationDensity = mean over column-sides of |{distinct 8-bit alpha in the band}| / (band rows); 1 = every transition row carries its own level. Width and discreteness are entangled by construction (a narrow transition has fewer rows) and must be read together.",
      dabOverlapUniformity:
        "Centre-row alpha a(x) over M interior columns, linearly detrended: d(x) = a(x) − (α + βx) with (α,β) the OLS fit; rippleRms = sqrt(mean d²); rippleCv = rippleRms / mean(a). Dominant period from the Hann-tapered 1-D DFT: k* = argmax_{1≤k≤M/2} |D(k)|², ripplePeriod = M/k*. expectedDabSpacing = measuredRadius / dabs_per_actual_radius (libmypaint spaces dabs at actual_radius/dabs_per_actual_radius); ripplePeriodOverDabSpacing ≈ 1 means the ripple IS the dab cadence.",
      pressureResponseLinearity:
        "m(x) = Σ_y A(x,y) is the cross-section ink mass; on the rising half of a triangular 0→1→0 ramp p(x) = 2(x − x₀)/L is known exactly. Over p ∈ [0.1,0.9]: r2Linear = 1 − SS_res/SS_tot for the OLS fit m = a + b·p (ideal = a straight line), r2LogLinear = the same for ln m = a + b·p (exponential response — libmypaint's radius is exp(base + c·p)). taperAsymmetry = sqrt(mean (m(x) − m(2·xm − x))²) / mean((m(x) + m(2·xm − x))/2) about the apex xm; 0 = identical start/end tapers at equal pressure.",
      colourMixingAccuracy:
        "Two crossing colour strokes on one surface, rendered twice: with the brush's own smudge, and with smudge forced to 0. The no-smudge frame IS the linear reference (source-over C = α_B·C_B + (1 − α_B)·C_A). Both frames are composited onto opaque white over the intersection window and compared with CIEDE2000; mean and max are reported. 0 = no colour-mixing model engaged.",
    },
    lanes: {
      texture: {
        ...TEXTURE_LANE,
        note: "One straight constant-pressure stroke feeds grain + edge + ripple. radius_logarithmic.base_value is pinned so the same 64×64 interior window fits strictly inside both corpus brushes' cores (at native radius ink-crisp's core is ~11 px tall); each brush keeps its own pressure curve, hardness and dab spacing. pressure 0.7 is the highest constant pressure at which neither brush clips alpha at 255 — clipping would erase the interior variation these metrics measure.",
      },
      pressure: {
        ...PRESSURE_LANE,
        note: "Native corpus radius, triangular 0→1→0 pressure ramp, constant sample rate (so speed dynamics are symmetric and any asymmetry is history, not speed).",
      },
      mixing: {
        ...MIXING_LANE,
        note: "Native corpus radius, constant pressure 1. Colour A horizontal then colour B vertical across it, on one surface.",
      },
      seed: SEED,
    },
    measurements,
    gate: {
      rule: "Regression band for a measured metric = [min/2, max·2] over the two engines (2× headroom around the measurement, clamped to 1 for [0,1] metrics). tests/visual/brush-texture-quality.test.ts hardcodes these bounds with the measured values quoted, and additionally re-renders both engines and re-derives every metric to catch drift below the band width.",
      bounds: buildGateBounds(measurements),
      notes: [
        "Alpha is the cross-engine axis. RGB readback differs by construction (libmypaint v1 non-linear fix15 vs hokusai linear→sRGB), so crossEngine.mixingCrossEngineDeltaE00* is recorded as evidence only and is never gated; the within-engine deltaE00VsLinear* numbers compare two frames from the SAME engine and are therefore self-consistent.",
        "grain ratios are dimensionless and only interpretable together with grain.totalPowerExDc — a perfectly flat interior has near-zero power in every band.",
        "pressure.saturatedCorePixels counts pixels at alpha 255 in the pressure lane: for an opaque brush the cross-section mass saturates into a pure width measurement near the apex, which is a property of the brush, not an artefact.",
      ],
    },
  };

  await mkdir(RESULTS_DIR, { recursive: true });
  const target = join(RESULTS_DIR, "brush-texture-lab.json");
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`);

  for (const id of TEXTURE_LAB_BRUSHES) {
    const record = measurements[id];
    if (!record) continue;
    for (const engine of TEXTURE_LAB_ENGINES) {
      const value = record[engine];
      console.log(
        `${id}/${engine}: grain[low ${value.grain.lowBandRatio} mid ${value.grain.midBandRatio} high ${value.grain.highBandRatio} power ${value.grain.totalPowerExDc}] edge[width ${value.edge.transitionWidthPx}px alias ${value.edge.aliasingIndex} levels ${value.edge.distinctAlphaLevels}] ripple[cv ${value.ripple.rippleCv} period ${value.ripple.ripplePeriodPx}px /dab ${value.ripple.ripplePeriodOverDabSpacing}] pressure[r2lin ${value.pressure.r2Linear} r2log ${value.pressure.r2LogLinear} taper ${value.pressure.taperAsymmetry}] mix[dE00 ${value.mixing.deltaE00VsLinearMean}]`,
      );
    }
  }
  console.log(`written: ${target}`);
}

const executedDirectly =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) await main();
