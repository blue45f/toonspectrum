import { beforeAll, describe, expect, it } from "vitest";

import {
  STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1,
  STUDIO_PAPER_MEDIA_INTERACTION_V1,
  STUDIO_PAPER_MEDIA_MODULATION_BOUNDS_V1,
  STUDIO_PAPER_MEDIA_MODULATION_IDENTITY_V1,
  STUDIO_PAPER_MEDIUM_BY_BRUSH_FAMILY_V1,
  STUDIO_PAPER_PRESETS_V1,
  STUDIO_PAPER_PRESET_IDS_V1,
  isStudioPaperMediumV1,
  isStudioPaperPresetIdV1,
  getStudioPaperPresetV1,
  resolveStudioDefaultPaperPresetForBrushFamilyV1,
  resolveStudioPaperMediaModulationForBrushFamilyV1,
  resolveStudioPaperMediaModulationV1,
  resolveStudioPaperMediumForBrushFamilyV1,
  samplePaperHeightV1,
  type StudioPaperMediaModulationV1,
  type StudioPaperMediumV1,
  type StudioPaperPresetV1,
} from "./studio-paper-media-profile-v1";
import {
  evaluateStudioCalibratedBudget,
  evaluateStudioCalibratedDetection,
  type StudioCalibratedBudgetVerdict,
} from "./studio-perf-calibration";

const SEED = 41;

/** 프리셋 간 비교·상관 계산에 함께 쓰는 결정적 표본 좌표 격자. */
function sampleGrid(size: number, step: number): ReadonlyArray<readonly [number, number]> {
  const points: Array<readonly [number, number]> = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      points.push([column * step + 0.37, row * step + 0.53]);
    }
  }
  return points;
}

function mean(values: readonly number[]): number {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function variance(values: readonly number[]): number {
  const average = mean(values);
  let sum = 0;
  for (const value of values) sum += (value - average) ** 2;
  return sum / values.length;
}

function pearson(left: readonly number[], right: readonly number[]): number {
  const meanLeft = mean(left);
  const meanRight = mean(right);
  let covariance = 0;
  let varianceLeft = 0;
  let varianceRight = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]! - meanLeft;
    const b = right[index]! - meanRight;
    covariance += a * b;
    varianceLeft += a * a;
    varianceRight += b * b;
  }
  const denominator = Math.sqrt(varianceLeft * varianceRight);
  return denominator === 0 ? 0 : covariance / denominator;
}

/** 여러 행에서 잰 x축 자기상관의 평균 — 직조 주기 검출용. */
function averageRowAutocorrelation(
  preset: StudioPaperPresetV1,
  lag: number,
  rows: number,
  columns: number,
): number {
  let total = 0;
  let counted = 0;
  for (let row = 0; row < rows; row += 1) {
    const heights: number[] = [];
    for (let column = 0; column < columns; column += 1) {
      heights.push(samplePaperHeightV1(preset, column, row, SEED));
    }
    const average = mean(heights);
    let covariance = 0;
    let varianceRow = 0;
    for (let column = 0; column < columns; column += 1) {
      varianceRow += (heights[column]! - average) ** 2;
    }
    for (let column = 0; column + lag < columns; column += 1) {
      covariance += (heights[column]! - average) * (heights[column + lag]! - average);
    }
    if (varianceRow <= 0) continue;
    total += covariance / ((columns - lag) / columns) / varianceRow;
    counted += 1;
  }
  return counted === 0 ? 0 : total / counted;
}

const MODE_REPRESENTATIVES: readonly StudioPaperMediumV1[] = [
  "charcoal",
  "watercolor",
  "oil",
  "marker",
];

function modulationDistance(
  left: StudioPaperMediaModulationV1,
  right: StudioPaperMediaModulationV1,
): number {
  return Math.hypot(
    left.depositScale - right.depositScale,
    left.granulationScale - right.granulationScale,
    left.bleedScale - right.bleedScale,
  );
}

// ---------------------------------------------------------------------------
// 결정성
// ---------------------------------------------------------------------------

describe("samplePaperHeightV1 — 결정성", () => {
  it("같은 (preset, x, y, seed)는 항상 같은 높이를 낸다", () => {
    const points = sampleGrid(24, 3.1);
    for (const preset of Object.values(STUDIO_PAPER_PRESETS_V1)) {
      for (const [x, y] of points) {
        expect(samplePaperHeightV1(preset, x, y, SEED)).toBe(
          samplePaperHeightV1(preset, x, y, SEED),
        );
      }
    }
  });

  it("시드가 다르면 높이 필드가 유의하게 달라진다", () => {
    const points = sampleGrid(24, 3.1);
    for (const preset of Object.values(STUDIO_PAPER_PRESETS_V1)) {
      let moved = 0;
      for (const [x, y] of points) {
        const base = samplePaperHeightV1(preset, x, y, SEED);
        const shifted = samplePaperHeightV1(preset, x, y, SEED + 1);
        if (Math.abs(base - shifted) > 1e-6) moved += 1;
      }
      expect(moved / points.length, preset.id).toBeGreaterThan(0.9);
    }
  });

  it("프리셋이 다르면 같은 시드에서도 서로 다른 종이가 나온다", () => {
    const points = sampleGrid(16, 5.3);
    const presets = Object.values(STUDIO_PAPER_PRESETS_V1);
    for (let left = 0; left < presets.length; left += 1) {
      for (let right = left + 1; right < presets.length; right += 1) {
        let difference = 0;
        for (const [x, y] of points) {
          difference += Math.abs(
            samplePaperHeightV1(presets[left]!, x, y, SEED)
              - samplePaperHeightV1(presets[right]!, x, y, SEED),
          );
        }
        expect(
          difference / points.length,
          `${presets[left]!.id} vs ${presets[right]!.id}`,
        ).toBeGreaterThan(0.01);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 값 범위와 통계 성질
// ---------------------------------------------------------------------------

describe("samplePaperHeightV1 — 범위·통계", () => {
  it("모든 프리셋·시드·좌표(음수 포함)에서 [0, 1] 안의 유한값이다", () => {
    const seeds = [0, 1, SEED, 0xffff_ffff];
    for (const preset of Object.values(STUDIO_PAPER_PRESETS_V1)) {
      for (const seed of seeds) {
        for (let row = -8; row < 8; row += 1) {
          for (let column = -8; column < 8; column += 1) {
            const height = samplePaperHeightV1(preset, column * 7.7, row * 7.7, seed);
            expect(Number.isFinite(height)).toBe(true);
            expect(height).toBeGreaterThanOrEqual(0);
            expect(height).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("비유한 좌표·시드도 조용히 [0, 1]로 수렴한다(fail-closed)", () => {
    const preset = STUDIO_PAPER_PRESETS_V1["watercolor-rough"];
    for (const hostile of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const height = samplePaperHeightV1(preset, hostile, hostile, hostile);
      expect(Number.isFinite(height)).toBe(true);
      expect(height).toBeGreaterThanOrEqual(0);
      expect(height).toBeLessThanOrEqual(1);
    }
  });

  it("결 거칠기(표준편차)가 켄트지 < 세목 < 황목 < 판화지 순서로 커진다", () => {
    const points = sampleGrid(48, 2.3);
    const spread = (preset: StudioPaperPresetV1): number =>
      Math.sqrt(variance(points.map(([x, y]) => samplePaperHeightV1(preset, x, y, SEED))));
    const kent = spread(STUDIO_PAPER_PRESETS_V1.kent);
    const hotPress = spread(STUDIO_PAPER_PRESETS_V1["watercolor-hot-press"]);
    const rough = spread(STUDIO_PAPER_PRESETS_V1["watercolor-rough"]);
    const printmaking = spread(STUDIO_PAPER_PRESETS_V1.printmaking);
    expect(kent).toBeGreaterThan(0);
    expect(hotPress).toBeGreaterThan(kent);
    expect(rough).toBeGreaterThan(hotPress * 1.5);
    expect(printmaking).toBeGreaterThan(rough);
  });

  it("황목은 섬유 축(x) 자기상관이 세로보다 길다(섬유 줄무늬)", () => {
    const preset = STUDIO_PAPER_PRESETS_V1["watercolor-rough"];
    const lag = 8;
    const alongX = averageRowAutocorrelation(preset, lag, 24, 240);
    // 세로 상관은 좌표를 전치해 같은 자로 잰다.
    let alongY = 0;
    let counted = 0;
    for (let column = 0; column < 24; column += 1) {
      const heights: number[] = [];
      for (let row = 0; row < 240; row += 1) {
        heights.push(samplePaperHeightV1(preset, column, row, SEED));
      }
      const average = mean(heights);
      let covariance = 0;
      let varianceColumn = 0;
      for (let row = 0; row < 240; row += 1) {
        varianceColumn += (heights[row]! - average) ** 2;
      }
      for (let row = 0; row + lag < 240; row += 1) {
        covariance += (heights[row]! - average) * (heights[row + lag]! - average);
      }
      if (varianceColumn <= 0) continue;
      alongY += covariance / ((240 - lag) / 240) / varianceColumn;
      counted += 1;
    }
    alongY /= counted;
    expect(alongX).toBeGreaterThan(alongY + 0.12);
  });
});

// ---------------------------------------------------------------------------
// 직조 주기성
// ---------------------------------------------------------------------------

describe("캔버스 직조 — 자기상관 피크가 pitch에 선다", () => {
  const canvas = STUDIO_PAPER_PRESETS_V1["canvas-weave"];
  const pitch = canvas.weave!.pitchX;

  it("pitch 지연의 자기상관이 뚜렷한 양의 피크다", () => {
    const atPitch = averageRowAutocorrelation(canvas, pitch, 28, 40 * pitch);
    const atHalfPitch = averageRowAutocorrelation(canvas, pitch / 2, 28, 40 * pitch);
    const belowPitch = averageRowAutocorrelation(canvas, pitch - 4, 28, 40 * pitch);
    const abovePitch = averageRowAutocorrelation(canvas, pitch + 4, 28, 40 * pitch);
    expect(atPitch).toBeGreaterThan(0.25);
    // 반주기에서는 씨실 위상이 뒤집혀 상관이 음수로 떨어진다.
    expect(atHalfPitch).toBeLessThan(0);
    expect(atPitch - atHalfPitch).toBeGreaterThan(0.3);
    expect(atPitch).toBeGreaterThan(belowPitch + 0.15);
    expect(atPitch).toBeGreaterThan(abovePitch + 0.15);
  });

  it("직조 없는 켄트지는 같은 지연에서 주기 신호가 없다(조작 감지)", () => {
    const kentAtPitch = averageRowAutocorrelation(
      STUDIO_PAPER_PRESETS_V1.kent,
      pitch,
      28,
      40 * pitch,
    );
    expect(Math.abs(kentAtPitch)).toBeLessThan(0.12);
  });
});

// ---------------------------------------------------------------------------
// peak-catch — 건식 매체
// ---------------------------------------------------------------------------

describe("peak-catch — 필압 단조성과 저필압 이빨", () => {
  const preset = STUDIO_PAPER_PRESETS_V1.printmaking;
  const points = sampleGrid(48, 2.9);

  function depositsAt(pressure: number): number[] {
    return points.map(([x, y]) =>
      resolveStudioPaperMediaModulationV1({
        medium: "charcoal",
        preset,
        pressure,
        x,
        y,
        seed: SEED,
      }).depositScale,
    );
  }

  it("필압이 커질수록 평균 침착이 엄격히 증가한다", () => {
    const ladder = [0.1, 0.35, 0.65, 0.95];
    let previous = -1;
    for (const pressure of ladder) {
      const average = mean(depositsAt(pressure));
      expect(average, `pressure ${pressure}`).toBeGreaterThan(previous);
      previous = average;
    }
  });

  it("저필압은 봉우리만 닿아 커버리지 분산이 고필압보다 뚜렷이 크다(= 드라이브러시 이빨)", () => {
    const varianceLow = variance(depositsAt(0.2));
    const varianceHigh = variance(depositsAt(0.9));
    expect(varianceLow).toBeGreaterThan(varianceHigh * 1.15);
  });

  it("저필압 침착은 종이 높이와 강한 양의 상관이다(봉우리 캐치)", () => {
    const heights = points.map(([x, y]) => samplePaperHeightV1(preset, x, y, SEED));
    expect(pearson(depositsAt(0.25), heights)).toBeGreaterThan(0.8);
  });

  it("모든 건식 매체가 필압 0에서도 유한한 침착 규칙을 준다", () => {
    for (const medium of ["crayon", "chalk", "charcoal", "pastel", "pencil", "dry-media"] as const) {
      const modulation = resolveStudioPaperMediaModulationV1({
        medium,
        preset,
        pressure: 0,
        x: 12.7,
        y: 43.1,
        seed: SEED,
      });
      expect(Number.isFinite(modulation.depositScale)).toBe(true);
      expect(modulation.depositScale).toBeGreaterThanOrEqual(0);
      expect(modulation.depositScale).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// valley-settle — 수채·수묵
// ---------------------------------------------------------------------------

describe("valley-settle — 골 정착과 흡수 번짐", () => {
  const rough = STUDIO_PAPER_PRESETS_V1["watercolor-rough"];
  const hotPress = STUDIO_PAPER_PRESETS_V1["watercolor-hot-press"];
  const points = sampleGrid(40, 3.7);

  it("granulationScale이 종이 높이와 반상관한다(골에 몰림)", () => {
    const heights: number[] = [];
    const granulations: number[] = [];
    for (const [x, y] of points) {
      heights.push(samplePaperHeightV1(rough, x, y, SEED));
      granulations.push(
        resolveStudioPaperMediaModulationV1({
          medium: "watercolor",
          preset: rough,
          pressure: 0.6,
          x,
          y,
          seed: SEED,
        }).granulationScale,
      );
    }
    expect(pearson(granulations, heights)).toBeLessThan(-0.999);
  });

  it("침착 편향은 평균적으로 안료량을 보존한다(depositScale 평균 ≈ 1)", () => {
    const deposits = points.map(([x, y]) =>
      resolveStudioPaperMediaModulationV1({
        medium: "watercolor",
        preset: rough,
        pressure: 0.6,
        x,
        y,
        seed: SEED,
      }).depositScale,
    );
    expect(Math.abs(mean(deposits) - 1)).toBeLessThan(0.05);
  });

  it("흡수율이 높은 종이가 같은 획에서 더 크게 번진다", () => {
    const bleedOn = (preset: StudioPaperPresetV1): number =>
      mean(
        points.map(([x, y]) =>
          resolveStudioPaperMediaModulationV1({
            medium: "watercolor",
            preset,
            pressure: 0.7,
            x,
            y,
            seed: SEED,
          }).bleedScale,
        ),
      );
    expect(bleedOn(rough)).toBeGreaterThan(bleedOn(hotPress) * 1.4);
  });

  it("번짐은 필압(물 양)에 단조 증가한다", () => {
    const bleedAt = (pressure: number): number =>
      mean(
        points.map(([x, y]) =>
          resolveStudioPaperMediaModulationV1({
            medium: "ink-wash",
            preset: rough,
            pressure,
            x,
            y,
            seed: SEED,
          }).bleedScale,
        ),
      );
    expect(bleedAt(0.9)).toBeGreaterThan(bleedAt(0.5));
    expect(bleedAt(0.5)).toBeGreaterThan(bleedAt(0.1));
  });
});

// ---------------------------------------------------------------------------
// weave-reveal — 유화·아크릴
// ---------------------------------------------------------------------------

describe("weave-reveal — 얇은 물감이 직조를 드러낸다", () => {
  const canvas = STUDIO_PAPER_PRESETS_V1["canvas-weave"];
  const points = sampleGrid(40, 3.3);

  it("thinness 1(얇은 스컴블)은 커버리지가 종이 높이를 그대로 따른다", () => {
    const heights: number[] = [];
    const deposits: number[] = [];
    for (const [x, y] of points) {
      heights.push(samplePaperHeightV1(canvas, x, y, SEED));
      deposits.push(
        resolveStudioPaperMediaModulationV1({
          medium: "oil",
          preset: canvas,
          pressure: 0.5,
          thinness: 1,
          x,
          y,
          seed: SEED,
        }).depositScale,
      );
    }
    expect(pearson(deposits, heights)).toBeGreaterThan(0.999);
    expect(variance(deposits)).toBeGreaterThan(0.005);
  });

  it("thinness 0(두꺼운 임파스토)은 종이를 완전히 무시한다", () => {
    for (const [x, y] of points) {
      const modulation = resolveStudioPaperMediaModulationV1({
        medium: "oil",
        preset: canvas,
        pressure: 0.5,
        thinness: 0,
        x,
        y,
        seed: SEED,
      });
      expect(modulation.depositScale).toBe(1);
      expect(modulation.granulationScale).toBe(0);
    }
  });

  it("thinness를 생략하면 1 - pressure로 유도된다(가벼운 터치 = 얇은 물감)", () => {
    const [x, y] = points[7]!;
    const implicit = resolveStudioPaperMediaModulationV1({
      medium: "oil",
      preset: canvas,
      pressure: 0.3,
      x,
      y,
      seed: SEED,
    });
    const explicit = resolveStudioPaperMediaModulationV1({
      medium: "oil",
      preset: canvas,
      pressure: 0.3,
      thinness: 0.7,
      x,
      y,
      seed: SEED,
    });
    expect(implicit.depositScale).toBeCloseTo(explicit.depositScale, 12);
    expect(implicit.granulationScale).toBeCloseTo(explicit.granulationScale, 12);
  });
});

// ---------------------------------------------------------------------------
// 변조 벡터 계약 — 범위·결정성·매체 간 분별력
// ---------------------------------------------------------------------------

describe("resolveStudioPaperMediaModulationV1 — 계약", () => {
  const media = Object.keys(STUDIO_PAPER_MEDIA_INTERACTION_V1) as readonly StudioPaperMediumV1[];
  const pressures = [0, 0.25, 0.5, 0.75, 1] as const;
  const points = sampleGrid(8, 11.3);

  it("모든 매체 × 종이 × 필압 조합이 문서화된 범위를 지킨다", () => {
    const bounds = STUDIO_PAPER_MEDIA_MODULATION_BOUNDS_V1;
    for (const medium of media) {
      for (const preset of Object.values(STUDIO_PAPER_PRESETS_V1)) {
        for (const pressure of pressures) {
          for (const [x, y] of points) {
            const modulation = resolveStudioPaperMediaModulationV1({
              medium,
              preset,
              pressure,
              x,
              y,
              seed: SEED,
            });
            const label = `${medium}/${preset.id}/p${pressure}`;
            expect(Number.isFinite(modulation.depositScale), label).toBe(true);
            expect(modulation.depositScale, label).toBeGreaterThanOrEqual(bounds.depositScale.min);
            expect(modulation.depositScale, label).toBeLessThanOrEqual(bounds.depositScale.max);
            expect(modulation.granulationScale, label).toBeGreaterThanOrEqual(
              bounds.granulationScale.min,
            );
            expect(modulation.granulationScale, label).toBeLessThanOrEqual(
              bounds.granulationScale.max,
            );
            expect(modulation.bleedScale, label).toBeGreaterThanOrEqual(bounds.bleedScale.min);
            expect(modulation.bleedScale, label).toBeLessThanOrEqual(bounds.bleedScale.max);
          }
        }
      }
    }
  });

  it("같은 입력은 항상 같은 변조 벡터를 낸다(결정성)", () => {
    for (const medium of media) {
      const first = resolveStudioPaperMediaModulationV1({
        medium,
        preset: STUDIO_PAPER_PRESETS_V1["canvas-weave"],
        pressure: 0.55,
        x: 101.7,
        y: 55.3,
        seed: SEED,
      });
      const second = resolveStudioPaperMediaModulationV1({
        medium,
        preset: STUDIO_PAPER_PRESETS_V1["canvas-weave"],
        pressure: 0.55,
        x: 101.7,
        y: 55.3,
        seed: SEED,
      });
      expect(second).toEqual(first);
    }
  });

  it("네 상호작용 모드의 변조 벡터가 같은 점·같은 필압에서 서로 뚜렷이 다르다", () => {
    const preset = STUDIO_PAPER_PRESETS_V1["canvas-weave"];
    const probes = sampleGrid(16, 5.9);
    for (let left = 0; left < MODE_REPRESENTATIVES.length; left += 1) {
      for (let right = left + 1; right < MODE_REPRESENTATIVES.length; right += 1) {
        let distance = 0;
        for (const [x, y] of probes) {
          distance += modulationDistance(
            resolveStudioPaperMediaModulationV1({
              medium: MODE_REPRESENTATIVES[left]!,
              preset,
              pressure: 0.55,
              x,
              y,
              seed: SEED,
            }),
            resolveStudioPaperMediaModulationV1({
              medium: MODE_REPRESENTATIVES[right]!,
              preset,
              pressure: 0.55,
              x,
              y,
              seed: SEED,
            }),
          );
        }
        expect(
          distance / probes.length,
          `${MODE_REPRESENTATIVES[left]!} vs ${MODE_REPRESENTATIVES[right]!}`,
        ).toBeGreaterThan(0.05);
      }
    }
  });

  it("알 수 없는 매체·비유한 필압은 정확한 항등으로 fail-closed 한다", () => {
    const preset = STUDIO_PAPER_PRESETS_V1.kent;
    expect(
      resolveStudioPaperMediaModulationV1({
        medium: "plasma" as StudioPaperMediumV1,
        preset,
        pressure: 0.5,
        x: 1,
        y: 2,
        seed: SEED,
      }),
    ).toBe(STUDIO_PAPER_MEDIA_MODULATION_IDENTITY_V1);
    expect(
      resolveStudioPaperMediaModulationV1({
        medium: "watercolor",
        preset,
        pressure: Number.NaN,
        x: 1,
        y: 2,
        seed: SEED,
      }),
    ).toBe(STUDIO_PAPER_MEDIA_MODULATION_IDENTITY_V1);
  });

  it("반환 벡터와 모든 표·프리셋은 frozen이다", () => {
    expect(Object.isFrozen(STUDIO_PAPER_PRESETS_V1)).toBe(true);
    expect(Object.isFrozen(STUDIO_PAPER_MEDIA_INTERACTION_V1)).toBe(true);
    expect(Object.isFrozen(STUDIO_PAPER_MEDIA_MODULATION_BOUNDS_V1)).toBe(true);
    expect(Object.isFrozen(STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1)).toBe(true);
    expect(Object.isFrozen(STUDIO_PAPER_MEDIUM_BY_BRUSH_FAMILY_V1)).toBe(true);
    for (const preset of Object.values(STUDIO_PAPER_PRESETS_V1)) {
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.fiberAnisotropy)).toBe(true);
      if (preset.weave) expect(Object.isFrozen(preset.weave)).toBe(true);
      if (preset.fleck) expect(Object.isFrozen(preset.fleck)).toBe(true);
    }
    for (const profile of Object.values(STUDIO_PAPER_MEDIA_INTERACTION_V1)) {
      expect(Object.isFrozen(profile)).toBe(true);
    }
    const modulation = resolveStudioPaperMediaModulationV1({
      medium: "watercolor",
      preset: STUDIO_PAPER_PRESETS_V1["watercolor-rough"],
      pressure: 0.5,
      x: 3,
      y: 4,
      seed: SEED,
    });
    expect(Object.isFrozen(modulation)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 패밀리 기본값 지도
// ---------------------------------------------------------------------------

describe("브러시 패밀리 기본 종이·매체 지도", () => {
  it("기본 종이 지도의 모든 값이 실재하는 프리셋 id다", () => {
    for (const [family, presetId] of Object.entries(
      STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1,
    )) {
      expect(isStudioPaperPresetIdV1(presetId), family).toBe(true);
    }
  });

  it("매체 지도의 모든 값이 유효한 매체이거나 명시적 null이다", () => {
    for (const [family, medium] of Object.entries(STUDIO_PAPER_MEDIUM_BY_BRUSH_FAMILY_V1)) {
      expect(medium === null || isStudioPaperMediumV1(medium), family).toBe(true);
    }
  });

  it("두 지도의 패밀리 키 집합이 완전히 일치한다", () => {
    expect(Object.keys(STUDIO_PAPER_MEDIUM_BY_BRUSH_FAMILY_V1).sort()).toEqual(
      Object.keys(STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1).sort(),
    );
  });

  it("대표 배정이 매체 물리와 맞는다 — 수채→황목, 유화→직조, 건식→판화지, 연필→켄트지", () => {
    expect(STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1.watercolor).toBe("watercolor-rough");
    expect(STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1.oil).toBe("canvas-weave");
    expect(STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1["dry-media"]).toBe("printmaking");
    expect(STUDIO_PAPER_DEFAULT_PRESET_BY_BRUSH_FAMILY_V1.pencil).toBe("kent");
  });

  it("종이를 타지 않는 패밀리는 매체가 null이고 배선 진입점도 정확한 항등이다", () => {
    for (const family of ["pen", "gpen", "perfect", "screentone", "stamp", "pixel"] as const) {
      expect(resolveStudioPaperMediumForBrushFamilyV1(family)).toBeNull();
      expect(
        resolveStudioPaperMediaModulationForBrushFamilyV1({
          family,
          pressure: 0.8,
          x: 10,
          y: 20,
          seed: SEED,
        }),
      ).toBe(STUDIO_PAPER_MEDIA_MODULATION_IDENTITY_V1);
    }
  });

  it("배선 진입점이 패밀리 기본 종이로 실제 변조를 만든다", () => {
    const modulation = resolveStudioPaperMediaModulationForBrushFamilyV1({
      family: "watercolor",
      pressure: 0.6,
      x: 33.3,
      y: 71.9,
      seed: SEED,
    });
    expect(modulation).not.toBe(STUDIO_PAPER_MEDIA_MODULATION_IDENTITY_V1);
    expect(modulation.granulationScale).toBeGreaterThan(0);
    expect(modulation.bleedScale).toBeGreaterThan(0);
  });

  it("미지의 패밀리·id는 안전한 기본값으로 정규화된다", () => {
    expect(resolveStudioPaperMediumForBrushFamilyV1("unknown-family")).toBeNull();
    expect(resolveStudioDefaultPaperPresetForBrushFamilyV1("unknown-family").id).toBe("kent");
    expect(getStudioPaperPresetV1("no-such-paper").id).toBe("kent");
    expect(getStudioPaperPresetV1("printmaking").id).toBe("printmaking");
  });

  it("프리셋 라이브러리는 한국어 표기 6종을 정확히 노출한다", () => {
    expect(STUDIO_PAPER_PRESET_IDS_V1.length).toBeGreaterThanOrEqual(6);
    const names = Object.values(STUDIO_PAPER_PRESETS_V1).map((preset) => preset.nameKo);
    expect(names).toEqual(
      expect.arrayContaining(["수채 황목", "수채 세목", "켄트지", "캔버스 직조", "신문지", "판화지"]),
    );
    expect(new Set(names).size).toBe(names.length);
  });
});

// ---------------------------------------------------------------------------
// 성능 예산
// ---------------------------------------------------------------------------

describe("성능 예산 — 스칼라 샘플러", () => {
  /** 1e6 샘플 창(≈157ms)과 길이를 맞춘 기준 커널 라운드 수. */
  const CALIBRATION_ROUNDS = 13_000;
  const SAMPLE_COUNT = 1_000_000;

  let sink = 0;

  function sampleSweep(sweeps: number): () => void {
    return () => {
      for (let sweep = 0; sweep < sweeps; sweep += 1) {
        for (let index = 0; index < SAMPLE_COUNT; index += 1) {
          sink += samplePaperHeightV1(
            STUDIO_PAPER_PRESETS_V1["canvas-weave"],
            (index % 1024) * 0.83,
            (index / 1024) * 0.57,
            SEED,
          );
        }
      }
    };
  }

  // 예산은 "샘플당 200ns"였지만, 밀리초는 샘플러가 아니라 그 아래 기계까지 함께 잰다. 같은
  // 커밋이 CI 러너에서 170ms에 끝나고 스로틀된 4-vCPU 개발 컨테이너에서 241.7ms가 나오면,
  // 절대 예산은 느린 기계에서 정직한 코드를 떨어뜨리거나 아무도 못 잡을 때까지 늘어난다.
  // 최솟값 표본은 "일시적 정지가 더한 시간"만 걷어낼 뿐 기계 자체는 못 걷어낸다.
  //
  // 그래서 예산을 같은 프로세스에서 표본마다 번갈아 재는 고정 기준 커널과의 '비율'로 옮겼다
  // (studio-perf-calibration). 분자·분모가 함께 기계 속도를 타므로 판정은 기계에 안 흔들리고,
  // 샘플러만 느려지면 분자만 움직여 그대로 걸린다. CALIBRATION_ROUNDS는 회귀 없는 샘플러가
  // ≈1.0을 받도록 맞췄고, 게이트는 1.5x다 — 아래 합성 회귀 테스트가 반대편 끝을 잡는다.
  let budget: StudioCalibratedBudgetVerdict;

  beforeAll(() => {
    // 워밍업 — 파생 상수 캐시와 JIT를 채운다.
    for (let index = 0; index < 10_000; index += 1) {
      sink += samplePaperHeightV1(
        STUDIO_PAPER_PRESETS_V1["canvas-weave"],
        index * 0.83,
        index * 0.57,
        SEED,
      );
    }
    budget = evaluateStudioCalibratedBudget({
      label: "1e6 paper height samples",
      workload: sampleSweep(1),
      referenceRounds: CALIBRATION_ROUNDS,
      samples: 3,
      warmups: 1,
    });
  });

  it("1e6 샘플이 보정된 스칼라 샘플러 예산 안에서 끝난다", () => {
    expect(budget.ok, budget.detail).toBe(true);
    expect(Number.isFinite(sink)).toBe(true);
    expect(sink).toBeGreaterThan(0);
  });

  it("샘플러가 2배 비싸졌다면 같은 측정이 예산을 넘겼다", () => {
    // 보정된 예산의 요점은 "느린 기계에서 살아남되 무의미해지지 않는 것"이므로, 2배 회귀 탐지
    // 여부는 같은 기계·같은 기준 창·같은 실행 안에서 확인해야 한다. 방금 잰 패스를 그대로 재사용
    // 하므로 건강한 측정에서는 추가 측정 비용이 0이다. 나머지 절반 — 실제로 2배 느려진 코드를
    // 하네스가 2배로 읽는다는 것 — 은 studio-perf-calibration.test.ts에서 실측으로 잡는다.
    //
    // 이 단언은 보정 자체의 자기 점검이기도 하다. 어떤 기계가 기준 커널과 샘플러를 그 정도로
    // 벌려놓으면, 조용히 3배짜리만 잡는 예산으로 썩는 대신 이 테스트가 먼저 터진다.
    const detection = evaluateStudioCalibratedDetection({
      label: budget.label,
      workload: sampleSweep(1),
      referenceRounds: CALIBRATION_ROUNDS,
      seed: budget.passes,
      factor: 2,
      samples: 3,
      warmups: 1,
    });
    // detectableFactor = 이 측정이 유죄로 잡아냈을 최소 감속 배수. 기록된 정직한 측정에서는
    // 1.4x 근방이라 2배 한참 전에 이미 걸린다. 놓쳐선 안 되는 선이 2x이고, 그걸 단언한다.
    expect(detection.detected, detection.detail).toBe(true);
  });
});
