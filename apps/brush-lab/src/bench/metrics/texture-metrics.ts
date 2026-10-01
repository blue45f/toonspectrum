import {
  bandPower,
  cropWindow,
  detrendAndWindow,
  dft2D,
  downsample2x,
  inkCentroid,
  spearman,
  std,
  toGray,
  totalPowerExDc,
} from "./lab-math";
import { deltaEStatsImages } from "./render-metrics";

import type { Spectrum2D } from "./lab-math";
import type { LabImage } from "../../engine/core/types";
import type { PaperField } from "../../engine/texture/paper-grain";
import type { SamplingFilter } from "../../engine/texture/sampling";

/**
 * 질감 지표(순수 함수). 스펙트럼 지표는 잉크 무게중심에 둔 N×N 창(기본 64)에서
 * 평균 제거 + Hann 창 + 2-D DFT로 계산한다(tests/benchmarks/harness/brush-texture-lab.ts의 정의 (1)과 동일).
 */

export const DEFAULT_SPECTRUM_WINDOW = 64;
/** 나이퀴스트 주파수(cycles/px). */
export const NYQUIST = 0.5;

/** 이미지의 잉크 중심 창 스펙트럼(흰 배경 위 휘도). */
export function spectrumWindow(img: LabImage, window = DEFAULT_SPECTRUM_WINDOW): Spectrum2D {
  const size = Math.max(2, Math.min(window, img.width, img.height));
  const gray = toGray(img);
  const c = inkCentroid(img);
  const crop = cropWindow(gray, img.width, img.height, c.x, c.y, size);
  return dft2D(detrendAndWindow(crop, size), size);
}

/**
 * 그레인 대비 보존: 잉크 중심 창 휘도 표준편차의 비(out/ref). 1 = 보존, < 1 = 뭉개짐, > 1 = 과장.
 * ref 대비가 0이면 out도 0일 때 1, 아니면 +∞ 대신 0(측정 불가 취급은 호출자가 판단).
 */
export function grainContrastPreservation(ref: LabImage, out: LabImage, window = DEFAULT_SPECTRUM_WINDOW): number {
  const size = Math.max(2, Math.min(window, ref.width, ref.height, out.width, out.height));
  const c = inkCentroid(ref);
  const sRef = std(cropWindow(toGray(ref), ref.width, ref.height, c.x, c.y, size));
  const sOut = std(cropWindow(toGray(out), out.width, out.height, c.x, c.y, size));
  if (sRef === 0) return sOut === 0 ? 1 : 0;
  return sOut / sRef;
}

/**
 * 고주파 에너지 비(앨리어싱·모아레 지표): 반경 주파수 f > cutoff·나이퀴스트인 파워 / DC 제외 전체 파워.
 * cutoff는 나이퀴스트(0.5 cycles/px)에 대한 비율(기본 0.5 → 0.25 cycles/px, 주기 < 4 px).
 */
export function highFrequencyEnergyRatio(
  img: LabImage,
  cutoff = 0.5,
  window = DEFAULT_SPECTRUM_WINDOW,
): number {
  const spectrum = spectrumWindow(img, window);
  const total = totalPowerExDc(spectrum);
  if (total <= 0) return 0;
  return bandPower(spectrum, cutoff * NYQUIST, Number.POSITIVE_INFINITY) / total;
}

function meanAbs(values: number[]): number {
  if (values.length === 0) return 0;
  let s = 0;
  for (const v of values) s += Math.abs(v);
  return s / values.length;
}

/**
 * 타일 이음새 점수. 필드(bump·absorb)를 주기 타일로 볼 때 좌/우·상/하 경계를 넘는 1 px 차의 평균 절대값이
 * 내부 이웃 차의 평균을 얼마나 초과하는지, 필드 표준편차로 정규화한다: max(0, MAD_edge − MAD_int) / σ.
 * 주기 필드면 ≈ 0, 비주기 필드면 O(1).
 */
export function seamScore(field: PaperField): number {
  const n = field.size;
  if (n < 2) return 0;
  const channels: Float32Array[] = [field.bump, field.absorb].filter((c) => c.length >= n * n);
  if (channels.length === 0) return 0;
  let worst = 0;
  for (const ch of channels) {
    const sigma = std(ch.subarray(0, n * n));
    if (sigma === 0) continue;
    const edge: number[] = [];
    const inner: number[] = [];
    for (let i = 0; i < n; i += 1) {
      // 좌/우 경계(행 i)와 상/하 경계(열 i)
      edge.push((ch[i * n] ?? 0) - (ch[i * n + (n - 1)] ?? 0));
      edge.push((ch[i] ?? 0) - (ch[(n - 1) * n + i] ?? 0));
      for (let j = 0; j + 1 < n; j += 1) {
        inner.push((ch[i * n + j + 1] ?? 0) - (ch[i * n + j] ?? 0));
        inner.push((ch[(j + 1) * n + i] ?? 0) - (ch[j * n + i] ?? 0));
      }
    }
    const score = Math.max(0, meanAbs(edge) - meanAbs(inner)) / sigma;
    if (score > worst) worst = score;
  }
  return worst;
}

/** 샘플링 필터별 고주파 에너지 비(같은 장면을 필터만 바꿔 렌더한 이미지 묶음). */
export function filterComparison(
  imgs: Record<SamplingFilter, LabImage>,
  cutoff = 0.5,
): Record<SamplingFilter, number> {
  return {
    nearest: highFrequencyEnergyRatio(imgs.nearest, cutoff),
    bilinear: highFrequencyEnergyRatio(imgs.bilinear, cutoff),
    trilinear: highFrequencyEnergyRatio(imgs.trilinear, cutoff),
    anisotropic: highFrequencyEnergyRatio(imgs.anisotropic, cutoff),
  };
}

/** 압력 → 그레인 응답 스피어만 단조성(1 = 완전 단조 증가). */
export function pressureGrainMonotonicity(pressures: readonly number[], grainResponse: readonly number[]): number {
  return spearman(pressures, grainResponse);
}

/**
 * 해상도 일관성: hi(2배 캔버스)를 2× 박스 다운샘플한 결과와 lo의 평균 ΔE. 크기가 맞지 않으면 RangeError.
 */
export function resolutionConsistency(lo: LabImage, hi: LabImage): number {
  const down = downsample2x(hi);
  if (down.width !== lo.width || down.height !== lo.height) {
    throw new RangeError(
      `resolutionConsistency: hi/2 = ${down.width}×${down.height}, lo = ${lo.width}×${lo.height}`,
    );
  }
  return deltaEStatsImages(lo, down).mean;
}
