import { encodeLabImage, srgbToLinear } from "../../engine/core/color";
import { DabBatch } from "../../engine/core/dab-layout";
import { IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN, paperFor, renderStroke, Surface, thumbnailBackground } from "../../engine/raster/reference-renderer";
import { TILE_SIZE } from "../../engine/raster/tile-binning";
import { impastoLighting } from "../../engine/wet/impasto";
import { fixtureHasPressureVariation } from "../fixtures/stroke-fixtures";

import { expectedTaperWidth, lineWidthCurve, samplePath } from "./handfeel-metrics";
import {
  alphaMask,
  bilinearAlpha,
  erodeMask,
  inkCentroid,
  linearFit,
  normalProfile,
  pathStations,
  pearson,
  percentile,
  polylineLength,
  spearman,
} from "./lab-math";
import { edgeTransitionWidthPx, opacityAccumulationError } from "./render-metrics";
import { highFrequencyEnergyRatio, seamScore } from "./texture-metrics";

import type { DabInstance, LabImage } from "../../engine/core/types";
import type { FamilyMetricKey } from "../../engine/presets/families";
import type { BrushFamily, BrushProgram } from "../../engine/presets/program-schema";
import type { StrokeFixture } from "../fixtures/stroke-fixtures";

/**
 * 매체 가족별 품질 지표. 키는 core `presets/families.ts`의 `FamilyMetricKey`와 1:1이다.
 * 입력은 LabImage·fixture·program이며, 일부 지표(불투명도 누적·릴리프·smudge·eraser)는 CPU 참조 래스터로
 * 합성 장면을 다시 렌더해 측정한다(레인 비의존 — 리포트 metricNotes에 그 사실을 기록한다).
 * 측정 불가는 null.
 */
export interface FamilyMetricContext {
  out: LabImage;
  /** 비교 기준 이미지(선택). */
  ref?: LabImage;
  /** 레인의 선형 premultiplied 버퍼(선택). */
  linear?: Float32Array | null;
  fixture: StrokeFixture;
  receipt?: { dabCount: number };
  program: BrushProgram;
  /** 임파스토 높이 필드(캔버스 크기, 선택). 없으면 CPU 참조로 재렌더해 얻는다. */
  height?: Float32Array | null;
}

export type FamilyMetrics = Partial<Record<FamilyMetricKey, number | null>>;

const INK_THRESHOLD = 8;
const PRESSURE_BINS = 16;
const OVERLAP_LAYERS = 10;

/** 광학 밀도 d = α·(1 − Y)(흰 배경 위 침착량 근사, 0..1). */
function depositField(img: LabImage): Float32Array {
  const n = img.width * img.height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    const a = (img.data[o + 3] ?? 0) / 255;
    const y =
      0.2126729 * srgbToLinear((img.data[o] ?? 0) / 255) +
      0.7151522 * srgbToLinear((img.data[o + 1] ?? 0) / 255) +
      0.072175 * srgbToLinear((img.data[o + 2] ?? 0) / 255);
    out[i] = a * (1 - y);
  }
  return out;
}

function maskedMeanStd(field: Float32Array, mask: Uint8Array): { mean: number; std: number; count: number } {
  let s = 0;
  let n = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) {
      s += field[i] ?? 0;
      n += 1;
    }
  }
  if (n === 0) return { mean: 0, std: 0, count: 0 };
  const m = s / n;
  let ss = 0;
  for (let i = 0; i < mask.length; i += 1) {
    if (mask[i]) {
      const d = (field[i] ?? 0) - m;
      ss += d * d;
    }
  }
  return { mean: m, std: Math.sqrt(ss / n), count: n };
}

/** 압력 상승 구간의 압력 → 단면 잉크 질량 스피어만 단조성. 압력 변화가 없으면 null. */
export function grainPressureMonotonicityOf(out: LabImage, fixture: StrokeFixture, program: BrushProgram): number | null {
  if (!fixtureHasPressureVariation(fixture)) return null;
  const samples = fixture.samples;
  let iMax = 0;
  for (let i = 1; i < samples.length; i += 1) {
    if ((samples[i]?.pressure ?? 0) > (samples[iMax]?.pressure ?? 0)) iMax = i;
  }
  const reach = Math.max(8, program.tip.sizePx);
  const sum = new Float64Array(PRESSURE_BINS);
  const cnt = new Uint32Array(PRESSURE_BINS);
  for (let i = 1; i <= iMax; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (!a || !b) continue;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist <= 0) continue;
    const profile = normalProfile(
      out,
      { x: b.x, y: b.y, tx: (b.x - a.x) / dist, ty: (b.y - a.y) / dist, s: 0 },
      reach,
      0.5,
    );
    let m = 0;
    for (let k = 0; k < profile.length; k += 1) m += (profile[k] ?? 0) * 0.5;
    const bin = Math.min(PRESSURE_BINS - 1, Math.floor(b.pressure * PRESSURE_BINS));
    sum[bin] = (sum[bin] ?? 0) + m;
    cnt[bin] = (cnt[bin] ?? 0) + 1;
  }
  const p: number[] = [];
  const g: number[] = [];
  for (let b = 0; b < PRESSURE_BINS; b += 1) {
    const c = cnt[b] ?? 0;
    if (c === 0) continue;
    p.push((b + 0.5) / PRESSURE_BINS);
    g.push((sum[b] ?? 0) / c);
  }
  if (p.length < 3) return null;
  return spearman(p, g);
}

function pathOf(fixture: StrokeFixture): readonly (readonly [number, number])[] {
  return fixture.intendedPath ?? samplePath(fixture.samples);
}

export function edgeTransitionWidthOf(out: LabImage, fixture: StrokeFixture): number | null {
  return edgeTransitionWidthPx(out, pathOf(fixture));
}

const TAPER_STATIONS = 48;
const TAPER_STATIONS_MAX = 512;

/**
 * 테이퍼 폭 오차: 시작·끝 테이퍼 구간에서 선폭이 엔진 규약 기대치 wMax·smoothstep(d/taperPx)와 얼마나 다른지 RMS/wMax.
 * 정류장은 ≈1 px 간격, 잉크가 끝난 뒤의 정류장은 제외한다. 프로그램에 테이퍼가 없거나 잉크가 없으면 null.
 */
export function taperWidthErrorOf(out: LabImage, fixture: StrokeFixture, program: BrushProgram): number | null {
  const start = program.edge.taperStartPx;
  const end = program.edge.taperEndPx;
  if (start <= 0 && end <= 0) return null;
  const path = pathOf(fixture);
  const total = polylineLength(path);
  if (total <= 0) return null;
  const stations = Math.max(TAPER_STATIONS, Math.min(TAPER_STATIONS_MAX, Math.ceil(total)));
  const widths = lineWidthCurve(out, path, stations);
  let wMax = 0;
  let lastInked = -1;
  widths.forEach((w, i) => {
    if (w > wMax) wMax = w;
    if (w > 0) lastInked = i;
  });
  if (wMax <= 0) return null;
  let ss = 0;
  let n = 0;
  for (let i = 0; i <= lastInked; i += 1) {
    const w = widths[i] ?? 0;
    const s = (total * i) / (stations - 1);
    const inStart = start > 0 && s < start;
    const inEnd = end > 0 && total - s < end;
    if (!inStart && !inEnd) continue;
    const d = (w - expectedTaperWidth(s, total, wMax, start, end)) / wMax;
    ss += d * d;
    n += 1;
  }
  if (n === 0) return null;
  return Math.sqrt(ss / n);
}

const OVERLAP_SIZE = 32;

/**
 * 불투명도 누적 오차(CPU 참조 합성 검사): 32² 표면 중앙에 같은 dab를 10회 찍어 최대 알파를
 * opacity·(1 − (1 − flow)^10)과 비교한다. 균일 커버리지 모델(dry-stamp, round/flat 팁)에서만 측정한다.
 */
export function overlapAccumulationErrorOf(program: BrushProgram): number | null {
  const model = program.deposition.model;
  const kind = program.tip.kind;
  if (model !== "dry-stamp" || (kind !== "round" && kind !== "flat")) return null;
  const plain: BrushProgram = {
    ...program,
    paper: { ...program.paper, enabled: false },
    deposition: { ...program.deposition, dual: null },
  };
  const surface = new Surface(OVERLAP_SIZE, OVERLAP_SIZE);
  surface.beginStroke(plain, 1);
  const batch = new DabBatch(OVERLAP_LAYERS);
  const dab: DabInstance = {
    x: OVERLAP_SIZE / 2,
    y: OVERLAP_SIZE / 2,
    rx: 6,
    ry: 6,
    angle: 0,
    hardness: 1,
    flow: plain.deposition.flow,
    shapeExp: 2,
    r: 0,
    g: 0,
    b: 0,
    a: 1,
    tipKind: kind,
    seed: 1,
    grain: 0,
    wet: 0,
    pigmentMass: 0,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "dry-stamp",
  };
  for (let i = 0; i < OVERLAP_LAYERS; i += 1) batch.push(dab);
  surface.addDabs(batch);
  surface.endStroke();
  return opacityAccumulationError(surface.toLabImage(), plain.deposition.flow, OVERLAP_LAYERS, plain.deposition.opacity);
}

/**
 * 마스크 경계 링 평균 / 내부(innerPx 침식) 평균. 링은 경계에서 skipPx 안쪽부터 ringPx 두께다(`skipPx` 기본 0). 경계 픽셀은
 * 안티앨리어싱으로 부분 커버리지라 옅어 링을 끌어내리므로 이미지 지표(`edgeDarkeningRatioOf`)는 1 px 건너뛴다. 내부나 링이 비면 null.
 */
function ringInnerRatio(
  dep: Float32Array,
  mask: Uint8Array,
  width: number,
  height: number,
  ringPx = 2,
  innerPx = 3,
  skipPx = 0,
): number | null {
  const inner = erodeMask(mask, width, height, innerPx);
  const outer = skipPx > 0 ? erodeMask(mask, width, height, skipPx) : mask;
  const core = erodeMask(mask, width, height, skipPx + ringPx);
  const ring = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) ring[i] = outer[i] && !core[i] ? 1 : 0;
  const i = maskedMeanStd(dep, inner);
  const r = maskedMeanStd(dep, ring);
  if (i.count === 0 || r.count === 0 || i.mean <= 0) return null;
  return r.mean / i.mean;
}

/**
 * 에지 다크닝 비: 경계(안티앨리어싱 1 px 제외)에서 안쪽 2 px 링 평균 침착 / 내부(3 px 침식) 평균 침착. 내부가 비면 null.
 * 2026-10-02: 경계 픽셀을 링에서 뺐다 — 부분 커버리지 픽셀이 날카로운 가장자리일수록 링을 끌어내렸고, 습식 층이 안쪽 1–4 px에
 * 짙은 테두리를 만들 때 이를 놓쳤다(같은 정의로 재면 이전 엔진 수채 1.19/1.29 → 새 엔진 1.21/1.14).
 */
export function edgeDarkeningRatioOf(out: LabImage): number | null {
  return ringInnerRatio(depositField(out), alphaMask(out, INK_THRESHOLD), out.width, out.height, 2, 3, 1);
}

/** 그래뉼레이션 대비: 내부(3 px 침식) 침착의 std/mean. */
export function granulationContrastOf(out: LabImage): number | null {
  const mask = alphaMask(out, INK_THRESHOLD);
  const inner = erodeMask(mask, out.width, out.height, 3);
  const st = maskedMeanStd(depositField(out), inner);
  if (st.count === 0 || st.mean <= 0) return null;
  return st.std / st.mean;
}

// ---- 습식 시간축 지표(순수 함수: 엔진 `snapshotConcentration`의 농도 필드를 읽기 전용으로 받는다) ----

/** 농도장 한 프레임. 엔진 `WetConcentrationSnapshot`의 필드 하나를 `frameOf`로 묶어 만든다. */
export interface FieldFrame {
  readonly width: number;
  readonly height: number;
  /** 가상 시간(ms). */
  readonly timeMs: number;
  readonly field: Float32Array;
}

type SnapshotKey = "pigment" | "suspended" | "deposited" | "rewettable" | "water";

/** 스냅샷의 필드 하나를 프레임으로 묶는다(복사 없음, 입력은 바뀌지 않는다). */
export function frameOf(
  snap: { readonly width: number; readonly height: number; readonly timeMs: number } & Readonly<Record<SnapshotKey, Float32Array>>,
  key: SnapshotKey,
): FieldFrame {
  return { width: snap.width, height: snap.height, timeMs: snap.timeMs, field: snap[key] };
}

/** 농도장의 0차(질량)·1차(중심)·2차(공분산) 모멘트. 질량 ≤ 0이면 null. */
export function fieldCovariance(
  frame: Pick<FieldFrame, "width" | "height" | "field">,
): { mass: number; cx: number; cy: number; sxx: number; syy: number; sxy: number } | null {
  const { width, height, field } = frame;
  let m0 = 0;
  let mx = 0;
  let my = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = field[y * width + x] ?? 0;
      m0 += v;
      mx += v * (x + 0.5);
      my += v * (y + 0.5);
    }
  }
  if (!(m0 > 0)) return null;
  const cx = mx / m0;
  const cy = my / m0;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = field[y * width + x] ?? 0;
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      sxx += v * dx * dx;
      syy += v * dy * dy;
      sxy += v * dx * dy;
    }
  }
  return { mass: m0, cx, cy, sxx: sxx / m0, syy: syy / m0, sxy: sxy / m0 };
}

/**
 * 확산 반경–시간 log-log 기울기. frames[0]이 기준(t₀, 초기 방울)이고 이후 프레임 k의 "초과 반경"은
 * R_k = √(σ²(t_k) − σ²(t₀))(σ² = 공분산 대각합)이다. 초기 방울 크기와 무관하게 순수 확산은 R ∝ t^0.5이다.
 * ln R_k를 ln(t_k − t₀)에 최소제곱 적합한 기울기를 돌려준다. 유효 프레임(R > 0, Δt > 0)이 3개 미만이면 null.
 */
export function diffusionRadiusSlopeOf(frames: readonly FieldFrame[]): number | null {
  const base = frames[0];
  if (!base) return null;
  const c0 = fieldCovariance(base);
  if (!c0) return null;
  const v0 = c0.sxx + c0.syy;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let k = 1; k < frames.length; k += 1) {
    const fr = frames[k];
    if (!fr) continue;
    const dt = fr.timeMs - base.timeMs;
    const c = fieldCovariance(fr);
    if (!c || dt <= 0) continue;
    const excess = c.sxx + c.syy - v0;
    if (excess <= 0) continue;
    xs.push(Math.log(dt));
    ys.push(0.5 * Math.log(excess));
  }
  if (xs.length < 3) return null;
  return linearFit(xs, ys).slope;
}

/**
 * 섬유 이방비: 기준 프레임 대비 초과 공분산 Σ(t) − Σ(t₀)의 주축 비로 1 − R⊥/R∥ = 1 − √(λmin/λmax).
 * 0 = 등방, 1에 가까울수록 한 방향으로만 퍼진다. 초과 분산이 없으면 null.
 */
export function fiberAnisotropyRatioOf(base: FieldFrame, later: FieldFrame): number | null {
  const c0 = fieldCovariance(base);
  const c1 = fieldCovariance(later);
  if (!c0 || !c1) return null;
  const a = c1.sxx - c0.sxx;
  const b = c1.sxy - c0.sxy;
  const d = c1.syy - c0.syy;
  const tr = a + d;
  const disc = Math.sqrt(Math.max(0, ((a - d) * (a - d)) / 4 + b * b));
  const lMax = tr / 2 + disc;
  const lMin = tr / 2 - disc;
  if (!(lMax > 0)) return null;
  return 1 - Math.sqrt(Math.max(0, lMin) / lMax);
}

/**
 * 농도장의 발자국 마스크: 대표 농도(최댓값의 1 % 초과 셀의 중앙값)의 `fraction`배를 넘는 셀.
 * 가장자리가 짙어진 워시도 안쪽이 대표 농도로 잡혀 발자국이 링만 남지 않고, 옅은 번짐 후광은 빠진다.
 */
function footprintMask(field: Float32Array, fraction: number): Uint8Array | null {
  let max = 0;
  for (let i = 0; i < field.length; i += 1) if ((field[i] ?? 0) > max) max = field[i] ?? 0;
  if (!(max > 0)) return null;
  const floor = max * 0.01;
  const positive: number[] = [];
  for (let i = 0; i < field.length; i += 1) if ((field[i] ?? 0) > floor) positive.push(field[i] ?? 0);
  const typical = percentile(positive, 50);
  const cut = typical * fraction;
  const mask = new Uint8Array(field.length);
  for (let i = 0; i < field.length; i += 1) mask[i] = (field[i] ?? 0) > cut ? 1 : 0;
  return mask;
}

/**
 * 침착 농도장의 에지 다크닝 비(설계 §4): 발자국(`footprintMask`, 대표 농도의 `footprintFraction`배 초과)의 바깥 `ringPx` 링 평균 /
 * 내부(`innerPx` 침식) 평균. 내부나 링이 비면 null.
 */
export function edgeDarkeningRatioOfField(
  deposit: Float32Array,
  width: number,
  height: number,
  opts: { footprintFraction?: number; ringPx?: number; innerPx?: number } = {},
): number | null {
  const mask = footprintMask(deposit, opts.footprintFraction ?? 0.5);
  if (!mask) return null;
  return ringInnerRatio(deposit, mask, width, height, opts.ringPx ?? 2, opts.innerPx ?? 3);
}

/** 정사각 박스 평균(반지름 radius, 가장자리는 가장 가까운 유효 셀로 클램프). */
function boxBlur(field: Float32Array, width: number, height: number, radius: number): Float32Array {
  const tmp = new Float32Array(field.length);
  const out = new Float32Array(field.length);
  const n = 2 * radius + 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += field[y * width + Math.min(width - 1, Math.max(0, x + k))] ?? 0;
      tmp[y * width + x] = sum / n;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) sum += tmp[Math.min(height - 1, Math.max(0, y + k)) * width + x] ?? 0;
      out[y * width + x] = sum / n;
    }
  }
  return out;
}

/**
 * 그래뉼레이션 대비(설계 §4): 균일 워시 내부의 침착 농도 질감 대비 = std(농도 − 박스 블러(`blurRadiusPx`)) / mean.
 * 가장자리 쪽 완만한 농도 기울기(에지 다크닝)는 블러가 흡수하므로 종이 요철 척도(수 px)의 얼룩만 잰다.
 * 내부는 발자국(`footprintMask`, 대표 농도의 `footprintFraction`배 초과)을 `innerPx` 침식한 영역이며 블러 반경만큼 더 안쪽에서 잰다.
 * 내부가 비면 null.
 */
export function granulationContrastOfField(
  deposit: Float32Array,
  width: number,
  height: number,
  opts: { footprintFraction?: number; innerPx?: number; blurRadiusPx?: number } = {},
): number | null {
  const mask = footprintMask(deposit, opts.footprintFraction ?? 0.5);
  if (!mask) return null;
  const radius = opts.blurRadiusPx ?? 3;
  const inner = erodeMask(mask, width, height, (opts.innerPx ?? 6) + radius);
  const blurred = boxBlur(deposit, width, height, radius);
  const residual = new Float32Array(deposit.length);
  for (let i = 0; i < residual.length; i += 1) residual[i] = (deposit[i] ?? 0) - (blurred[i] ?? 0);
  const st = maskedMeanStd(residual, inner);
  const base = maskedMeanStd(deposit, inner);
  if (st.count === 0 || base.mean <= 0) return null;
  return st.std / base.mean;
}

/**
 * 백런(재습윤) 경계 비(설계 §4): 중심 (cx, cy) 둘레의 1 px 반경 구간 평균 프로파일에서 새 젖음 전선(반경 `minRadiusPx` 이상
 * `maxRadiusPx` 이하 구간의 최대 3구간 이동평균)의 링 농도 / 안쪽(반경 < 0.5·링 반경) 평균 농도. 안쪽이 비면 null.
 * `maxRadiusPx`로 바깥의 옛 워시 가장자리를 탐색에서 뺀다.
 * 맑은 물방울이 마른 워시를 다시 적셔 안료를 새 전선으로 모은 장면에서 쓴다.
 */
export function backrunBoundaryRatioOf(
  deposit: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  minRadiusPx = 3,
  maxRadiusPx = Number.POSITIVE_INFINITY,
): number | null {
  const maxR = Math.min(Math.floor(Math.min(cx, cy, width - cx, height - cy)), Math.floor(maxRadiusPx));
  if (maxR < minRadiusPx + 2) return null;
  const sum = new Float64Array(maxR + 1);
  const cnt = new Float64Array(maxR + 1);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const bin = Math.floor(r);
      if (bin > maxR) continue;
      sum[bin] = (sum[bin] ?? 0) + (deposit[y * width + x] ?? 0);
      cnt[bin] = (cnt[bin] ?? 0) + 1;
    }
  }
  const prof = Array.from(sum, (v, i) => ((cnt[i] ?? 0) > 0 ? v / (cnt[i] ?? 1) : 0));
  let best = -1;
  let bestAt = minRadiusPx;
  for (let r = minRadiusPx; r + 2 <= maxR; r += 1) {
    const avg = ((prof[r] ?? 0) + (prof[r + 1] ?? 0) + (prof[r + 2] ?? 0)) / 3;
    if (avg > best) {
      best = avg;
      bestAt = r + 1;
    }
  }
  const innerEnd = Math.max(2, Math.floor(0.5 * bestAt));
  let inner = 0;
  for (let r = 0; r < innerEnd; r += 1) inner += prof[r] ?? 0;
  inner /= innerEnd;
  if (!(inner > 0) || best <= 0) return null;
  return best / inner;
}

export interface MetricRange {
  readonly min?: number;
  readonly max?: number;
}

/**
 * 습식 시간축 지표 임계값(설계 보충 §4 표, 임의 완화 금지). 매체별 범위는 닫힌 구간이다.
 *  - 에지 다크닝 비: 수채 1.3–1.8, 수묵 1.1–1.4, 구아슈 ≤ 1.1
 *  - 그래뉼레이션 대비: 그래뉼레이션 안료 0.15–0.35, 비그래뉼레이션 ≤ 0.05
 *  - 확산 반경–시간 log-log 기울기: 0.45–0.55
 *  - 섬유 이방비: `fiberAnisotropy` ±10 %(상대) — `anisotropyWithinTolerance`
 *  - 백런 경계 비: ≥ 1.25
 */
export const WET_TIME_TARGETS = {
  edgeDarkeningRatio: {
    watercolor: { min: 1.3, max: 1.8 },
    sumi: { min: 1.1, max: 1.4 },
    gouache: { max: 1.1 },
  },
  granulationContrast: {
    granulating: { min: 0.15, max: 0.35 },
    nonGranulating: { max: 0.05 },
  },
  diffusionSlope: { min: 0.45, max: 0.55 },
  anisotropyRelativeTolerance: 0.1,
  backrunBoundaryRatio: { min: 1.25 },
} as const satisfies {
  edgeDarkeningRatio: Record<string, MetricRange>;
  granulationContrast: Record<string, MetricRange>;
  diffusionSlope: MetricRange;
  anisotropyRelativeTolerance: number;
  backrunBoundaryRatio: MetricRange;
};

/** 값이 닫힌 구간 안에 있는가. null(측정 불가)은 false다. */
export function withinRange(value: number | null, range: MetricRange): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  if (range.min !== undefined && value < range.min) return false;
  if (range.max !== undefined && value > range.max) return false;
  return true;
}

/** 측정 이방비가 `fiberAnisotropy`의 ±10 %(상대) 안인가. aniso가 0이면 절대 0.02 이내. */
export function anisotropyWithinTolerance(measured: number | null, aniso: number): boolean {
  if (measured === null || !Number.isFinite(measured)) return false;
  if (aniso <= 0) return Math.abs(measured) <= 0.02;
  return Math.abs(measured / aniso - 1) <= WET_TIME_TARGETS.anisotropyRelativeTolerance;
}

/** CPU 참조로 fixture를 다시 렌더해 임파스토 높이 필드(캔버스 크기)를 모은다. 습식 상태가 없으면 null. */
export function heightFieldOf(program: BrushProgram, fixture: StrokeFixture, seed = 1): Float32Array | null {
  const surface = new Surface(fixture.width, fixture.height);
  renderStroke(program, fixture.samples, { width: fixture.width, height: fixture.height, seed, surface });
  const wet = surface.wet;
  if (!wet) return null;
  const out = new Float32Array(fixture.width * fixture.height);
  let any = false;
  for (let tile = 0; tile < wet.tilesX * wet.tilesY; tile += 1) {
    const view = wet.view(tile);
    if (!view) continue;
    const tx = tile % wet.tilesX;
    const ty = Math.floor(tile / wet.tilesX);
    for (let ly = 0; ly < TILE_SIZE; ly += 1) {
      const py = ty * TILE_SIZE + ly;
      if (py >= fixture.height) break;
      for (let lx = 0; lx < TILE_SIZE; lx += 1) {
        const px = tx * TILE_SIZE + lx;
        if (px >= fixture.width) break;
        const h = view.height[ly * TILE_SIZE + lx] ?? 0;
        if (h !== 0) any = true;
        out[py * fixture.width + px] = h;
      }
    }
  }
  return any ? out : null;
}

/**
 * 릴리프 조명 일관성: 높이맵을 램버트 조명으로 4방향(0/90/180/270°) 셰이딩하고 반대 방향 쌍의
 * 음의 상관(−corr)을 평균한다. 또렷한 릴리프면 → 1, 릴리프가 없거나 잡음이면 → 0.
 */
export function reliefLightingConsistencyOf(height: Float32Array, width: number): number | null {
  const l0 = impastoLighting(height, width, [1, 0, 1]);
  const l180 = impastoLighting(height, width, [-1, 0, 1]);
  const l90 = impastoLighting(height, width, [0, 1, 1]);
  const l270 = impastoLighting(height, width, [0, -1, 1]);
  const c1 = pearson(l0, l180);
  const c2 = pearson(l90, l270);
  if (c1 === 0 && c2 === 0) return null;
  const score = (Math.max(0, -c1) + Math.max(0, -c2)) / 2;
  return Math.min(1, score);
}

/** 릴리프 대비 기본 광원(좌상단 45°). */
const RELIEF_LIGHT: readonly [number, number, number] = [1, 0, 1];

/**
 * 임파스토 릴리프 대비(습식 설계 §4): 높이맵을 램버트 조명한 휘도의 p95 − p5(획 안, height > 0인 픽셀).
 * 두꺼운 획 ≥ 0.25, 글레이즈 ≤ 0.05가 목표다. 높이가 있는 픽셀이 2개 미만이면 null.
 * 기본 광원·gain은 단위 테스트용 합성 높이맵 기준이고, oil 가족 지표는 렌더러(`IMPASTO_LIGHT`·`IMPASTO_RELIEF_GAIN`) 값을 넘긴다.
 * core `FAMILY_TARGETS.oil`의 `impastoReliefContrast`(op ≥, 0.25)와 같은 키이며 oil 가족 지표로 계산한다.
 */
export function impastoReliefContrastOf(
  height: Float32Array,
  width: number,
  light: readonly [number, number, number] = RELIEF_LIGHT,
  gain = 1,
): number | null {
  const lit = impastoLighting(height, width, light, gain);
  const inside: number[] = [];
  for (let i = 0; i < height.length; i += 1) if ((height[i] ?? 0) > 0) inside.push(lit[i] ?? 0);
  if (inside.length < 2) return null;
  return percentile(inside, 95) - percentile(inside, 5);
}

const AIRBRUSH_STATIONS = 8;

/** 에어브러시 가우시안 적합: 단면 평균 프로파일의 ln α ~ d² 직선 적합 R². */
export function airbrushGaussianFitOf(out: LabImage, fixture: StrokeFixture, program: BrushProgram): number | null {
  const path = pathOf(fixture);
  const reach = Math.max(8, program.tip.sizePx);
  const step = 0.5;
  let acc: Float64Array | null = null;
  for (const st of pathStations(path, AIRBRUSH_STATIONS)) {
    const p = normalProfile(out, st, reach, step);
    if (!acc) acc = new Float64Array(p.length);
    for (let i = 0; i < p.length; i += 1) acc[i] = (acc[i] ?? 0) + (p[i] ?? 0);
  }
  if (!acc) return null;
  const half = Math.floor(acc.length / 2);
  let peak = 0;
  for (let i = 0; i < acc.length; i += 1) if ((acc[i] ?? 0) > peak) peak = acc[i] ?? 0;
  if (peak <= 0) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < acc.length; i += 1) {
    const a = acc[i] ?? 0;
    if (a < 0.05 * peak) continue;
    const d = (i - half) * step;
    xs.push(d * d);
    ys.push(Math.log(a / peak));
  }
  if (xs.length < 5) return null;
  return linearFit(xs, ys).r2;
}

/** 모아레 고주파 비: 나이퀴스트의 80 % 이상 대역 에너지 비. */
export function moireHighFrequencyRatioOf(out: LabImage): number {
  return highFrequencyEnergyRatio(out, 0.8);
}

function dilateMask(mask: Uint8Array, width: number, height: number, iterations: number): Uint8Array {
  let cur = mask;
  for (let it = 0; it < iterations; it += 1) {
    const next = new Uint8Array(cur.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const v =
          cur[i] ||
          (x > 0 && cur[i - 1]) ||
          (x < width - 1 && cur[i + 1]) ||
          (y > 0 && cur[i - width]) ||
          (y < height - 1 && cur[i + width]);
        next[i] = v ? 1 : 0;
      }
    }
    cur = next;
  }
  return cur;
}

const REGULARITY_WINDOW = 64;
const REGULARITY_MIN_LAG = 2;
const REGULARITY_MAX_LAG = 16;

/**
 * 망점 규칙성: 잉크 중심 창에서 획 외곽(닫힘 연산으로 구멍을 메운 영역) 안 픽셀 쌍의 정규화 자기상관을
 * 2..16 px 지연에서 구해 최대값을 돌려준다. 완전 주기 패턴 → 1, 잡음 → ≈ 0. 영역이 작으면 null.
 */
export function halftoneDotRegularityOf(out: LabImage): number | null {
  const size = Math.min(REGULARITY_WINDOW, out.width, out.height);
  const c = inkCentroid(out, INK_THRESHOLD);
  const x0 = Math.max(0, Math.min(out.width - size, Math.round(c.x - size / 2)));
  const y0 = Math.max(0, Math.min(out.height - size, Math.round(c.y - size / 2)));
  const field = new Float32Array(size * size);
  const mask = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const o = ((y0 + y) * out.width + (x0 + x)) * 4;
      const a = (out.data[o + 3] ?? 0) / 255;
      field[y * size + x] = a;
      mask[y * size + x] = a * 255 >= INK_THRESHOLD ? 1 : 0;
    }
  }
  const hull = erodeMask(dilateMask(mask, size, size, 4), size, size, 4);
  const st = maskedMeanStd(field, hull);
  if (st.count < 64 || st.std === 0) return null;
  let best = -1;
  for (let dy = 0; dy <= REGULARITY_MAX_LAG; dy += 1) {
    for (let dx = -REGULARITY_MAX_LAG; dx <= REGULARITY_MAX_LAG; dx += 1) {
      if (Math.hypot(dx, dy) < REGULARITY_MIN_LAG) continue;
      if (dy === 0 && dx < 0) continue;
      let num = 0;
      let n = 0;
      for (let y = 0; y + dy < size; y += 1) {
        for (let x = Math.max(0, -dx); x + dx < size && x < size; x += 1) {
          const i = y * size + x;
          const j = (y + dy) * size + (x + dx);
          if (!hull[i] || !hull[j]) continue;
          num += ((field[i] ?? 0) - st.mean) * ((field[j] ?? 0) - st.mean);
          n += 1;
        }
      }
      if (n < 32) continue;
      const r = num / n / (st.std * st.std);
      if (r > best) best = r;
    }
  }
  return best < 0 ? 0 : Math.min(1, best);
}

/**
 * 가닥 분리도(산포 분산): 경로를 따라 1 px 간격 정류장마다 법선 ±R(팁 반경 + 산포)의 띠에서
 * 잉크 없는 표본 비율. 0 = 꽉 찬 획, 1 = 완전 분산.
 */
export function strandSeparationOf(out: LabImage, fixture: StrokeFixture, program: BrushProgram): number | null {
  const path = pathOf(fixture);
  const total = polylineLength(path);
  if (total <= 0) return null;
  const reach = program.tip.sizePx / 2 + program.strokeDynamics.scatter.positionPx;
  const stations = pathStations(path, Math.max(2, Math.round(total)));
  let inked = 0;
  let count = 0;
  for (const st of stations) {
    const nx = -st.ty;
    const ny = st.tx;
    for (let d = -reach; d <= reach; d += 1) {
      const a = bilinearAlpha(out, st.x + nx * d, st.y + ny * d);
      if (a * 255 >= INK_THRESHOLD) inked += 1;
      count += 1;
    }
  }
  if (count === 0) return null;
  return 1 - inked / count;
}

export function seamScoreOf(program: BrushProgram): number {
  return seamScore(paperFor(program.paper));
}

function premulMass(linear: Float32Array): number {
  let s = 0;
  for (let i = 0; i < linear.length; i += 4) {
    s += (linear[i] ?? 0) + (linear[i + 1] ?? 0) + (linear[i + 2] ?? 0) + (linear[i + 3] ?? 0);
  }
  return s;
}

/** smudge 질량 보존: 썸네일 배경 위에 CPU 참조로 렌더하기 전후 premultiplied 합의 상대 변화 |Δ|/m0. */
export function smudgeMassConservationOf(program: BrushProgram, fixture: StrokeFixture, seed = 1): number | null {
  const surface = thumbnailBackground(program, fixture.width, fixture.height);
  const before = premulMass(surface.document);
  if (before <= 0) return null;
  renderStroke(program, fixture.samples, { width: fixture.width, height: fixture.height, seed, surface });
  const after = premulMass(surface.document);
  return Math.abs(after - before) / before;
}

/**
 * eraser 색 불변: 썸네일 배경 위 CPU 참조 렌더 전후를 8비트로 인코딩해 알파 > 0인 픽셀의
 * straight 색 채널 최대 |Δ|/255. 알파가 증가한 픽셀이 있으면 +1(불가). 정확 일치면 0.
 */
export function eraserColorInvarianceOf(program: BrushProgram, fixture: StrokeFixture, seed = 1): number {
  const surface = thumbnailBackground(program, fixture.width, fixture.height);
  const before = encodeLabImage(surface.document, fixture.width, fixture.height);
  renderStroke(program, fixture.samples, { width: fixture.width, height: fixture.height, seed, surface });
  const after = encodeLabImage(surface.document, fixture.width, fixture.height);
  let worst = 0;
  let alphaGrew = false;
  for (let i = 0; i < before.data.length; i += 4) {
    const a0 = before.data[i + 3] ?? 0;
    const a1 = after.data[i + 3] ?? 0;
    if (a1 > a0) alphaGrew = true;
    if (a1 === 0 || a0 === 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs((before.data[i + c] ?? 0) - (after.data[i + c] ?? 0));
      if (d > worst) worst = d;
    }
  }
  return worst / 255 + (alphaGrew ? 1 : 0);
}

/** 가족에 해당하는 지표만 계산한다(키는 `FAMILY_TARGETS[family].metrics`와 일치). */
export function computeFamilyMetrics(family: BrushFamily, ctx: FamilyMetricContext): FamilyMetrics {
  const { out, fixture, program } = ctx;
  switch (family) {
    case "pencil":
    case "chalk":
    case "charcoal":
    case "conte":
    case "crayon":
      return { grainPressureMonotonicity: grainPressureMonotonicityOf(out, fixture, program) };
    case "ink":
    case "ballpoint":
      return {
        edgeTransitionWidthPx: edgeTransitionWidthOf(out, fixture),
        taperWidthError: taperWidthErrorOf(out, fixture, program),
      };
    case "marker":
    case "gouache":
    case "acrylic":
      return { overlapAccumulationError: overlapAccumulationErrorOf(program) };
    case "watercolor":
      return {
        edgeDarkeningRatio: edgeDarkeningRatioOf(out),
        granulationContrast: granulationContrastOf(out),
      };
    case "sumi":
      return { granulationContrast: granulationContrastOf(out) };
    case "oil": {
      const height = ctx.height ?? heightFieldOf(program, fixture);
      return {
        reliefLightingConsistency: height ? reliefLightingConsistencyOf(height, fixture.width) : null,
        // 화면에 보이는 릴리프를 재도록 렌더러의 고정 광원·gain으로 조명한다(획 방향에 따른 값 흔들림 방지).
        impastoReliefContrast: height ? impastoReliefContrastOf(height, fixture.width, IMPASTO_LIGHT, IMPASTO_RELIEF_GAIN) : null,
      };
    }
    case "airbrush":
      return { airbrushGaussianFit: airbrushGaussianFitOf(out, fixture, program) };
    case "spray":
    case "special":
      return { strandSeparation: strandSeparationOf(out, fixture, program) };
    case "hatch":
    case "halftone":
      return {
        moireHighFrequencyRatio: moireHighFrequencyRatioOf(out),
        halftoneDotRegularity: halftoneDotRegularityOf(out),
      };
    case "texture":
      return { seamScore: seamScoreOf(program) };
    case "smudge":
      return { smudgeMassConservation: smudgeMassConservationOf(program, fixture) };
    case "eraser":
      return { eraserColorInvariance: eraserColorInvarianceOf(program, fixture) };
  }
}

/** 가족 지표 중 CPU 참조 재렌더로 측정하는 키(리포트 사유 표기용). */
export const CPU_SYNTHETIC_FAMILY_KEYS: readonly FamilyMetricKey[] = [
  "overlapAccumulationError",
  "reliefLightingConsistency",
  "impastoReliefContrast",
  "smudgeMassConservation",
  "eraserColorInvariance",
  "seamScore",
];
