import { describe, expect, it } from "vitest";

import {
  addStudioPressureCurvePoint,
  isStudioPressureCurveMonotone,
  moveStudioPressureCurvePoint,
  normalizeStudioPressureCurvePoints,
  removeStudioPressureCurvePoint,
  studioPressureCurvePreset,
  studioPressureCurvePresetIds,
  studioPressureCurveToProfile,
  STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS,
} from "./studio-pressure-curve-editor";
import { studioStylusPressureProfileMap } from "./studio-stylus-pressure-profile";

describe("studio-pressure-curve-editor", () => {
  it("프리셋 5종이 모두 단조 곡선이다", () => {
    for (const id of studioPressureCurvePresetIds()) {
      const points = studioPressureCurvePreset(id);
      expect(isStudioPressureCurveMonotone(points)).toBe(true);
    }
    expect(studioPressureCurvePresetIds()).toContain("s-curve");
  });

  it("정규화는 정렬·단조·간격을 강제한다", () => {
    const points = normalizeStudioPressureCurvePoints([
      { input: 0.7, output: 0.9 },
      { input: 0.2, output: 0.1 },
      { input: 0.5, output: 0.4 },
      { input: 0.5, output: 0.99 },
    ]);
    expect(isStudioPressureCurveMonotone(points)).toBe(true);
    expect(points[0]).toEqual({ input: 0, output: 0 });
    expect(points.at(-1)).toEqual({ input: 1, output: 1 });
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!.input - points[i - 1]!.input).toBeGreaterThanOrEqual(0.014);
    }
  });

  it("포인트 추가는 정렬 위치에 삽입된다", () => {
    const base = studioPressureCurvePreset("linear");
    const result = addStudioPressureCurvePoint(base, 0.5, 0.6);
    expect(result.applied).toBe(true);
    expect(result.points).toHaveLength(3);
    expect(result.points[1]).toMatchObject({ input: 0.5, output: 0.6 });
    expect(isStudioPressureCurveMonotone(result.points)).toBe(true);
  });

  it("엔드포인트 근처 추가와 개수 초과는 거부된다", () => {
    const base = studioPressureCurvePreset("linear");
    expect(addStudioPressureCurvePoint(base, 0.005, 0.5).applied).toBe(false);
    expect(addStudioPressureCurvePoint(base, 0.999, 0.5).applied).toBe(false);
    let points = base;
    for (let i = 0; i < STUDIO_PRESSURE_CURVE_MAX_INTERIOR_POINTS; i += 1) {
      const result = addStudioPressureCurvePoint(points, 0.1 + i * 0.12, 0.1 + i * 0.12);
      points = result.points;
    }
    expect(addStudioPressureCurvePoint(points, 0.95, 0.95).applied).toBe(false);
  });

  it("이동은 이웃을 넘지 못하고 단조를 유지한다", () => {
    const base = addStudioPressureCurvePoint(
      studioPressureCurvePreset("linear"), 0.5, 0.5,
    ).points;
    const moved = moveStudioPressureCurvePoint(base, 1, 0.9, 0.1);
    expect(moved.applied).toBe(true);
    expect(moved.points[1]!.input).toBeLessThan(1 - 0.015);
    expect(isStudioPressureCurveMonotone(moved.points)).toBe(true);
    // 엔드포인트 이동 불가
    expect(moveStudioPressureCurvePoint(base, 0, 0.3, 0.3).applied).toBe(false);
    expect(moveStudioPressureCurvePoint(base, 2, 0.3, 0.3).applied).toBe(false);
  });

  it("삭제는 엔드포인트를 보호한다", () => {
    const base = addStudioPressureCurvePoint(
      studioPressureCurvePreset("linear"), 0.5, 0.5,
    ).points;
    const removed = removeStudioPressureCurvePoint(base, 1);
    expect(removed.applied).toBe(true);
    expect(removed.points).toHaveLength(2);
    expect(removeStudioPressureCurvePoint(base, 0).applied).toBe(false);
    expect(removeStudioPressureCurvePoint(base, 99).applied).toBe(false);
  });

  it("프로파일 변환 후 매핑이 곡선을 따른다", () => {
    const points = studioPressureCurvePreset("s-curve");
    const profile = studioPressureCurveToProfile(points);
    expect(studioStylusPressureProfileMap(0, profile)).toBe(0);
    expect(studioStylusPressureProfileMap(1, profile)).toBe(1);
    const mid = studioStylusPressureProfileMap(0.5, profile);
    expect(mid).toBeCloseTo(0.5, 1);
    // s-curve: 낮은 입력은 억제, 높은 입력은 증폭
    expect(studioStylusPressureProfileMap(0.25, profile)).toBeLessThan(0.25);
    expect(studioStylusPressureProfileMap(0.75, profile)).toBeGreaterThan(0.75);
  });

  it("deadZone/saturation 옵션이 전달된다", () => {
    const profile = studioPressureCurveToProfile(studioPressureCurvePreset("linear"), {
      deadZone: 0.05,
      saturation: 0.95,
    });
    expect(profile.deadZone).toBeCloseTo(0.05, 10);
    expect(profile.saturation).toBeCloseTo(0.95, 10);
  });
});
