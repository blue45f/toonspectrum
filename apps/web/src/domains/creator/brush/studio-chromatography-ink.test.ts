import { describe, expect, it } from "vitest";

import {
  normalizeStudioChromatographyInk,
  resolveStudioChromatographyColor,
  studioChromatographyColorToCss,
  studioChromatographyConcentration,
  studioChromatographyInkBlackPreset,
  studioChromatographyInkSumiPreset,
} from "./studio-chromatography-ink";

describe("studio-chromatography-ink", () => {
  it("빈 성분은 null이다", () => {
    expect(normalizeStudioChromatographyInk([])).toBeNull();
    expect(normalizeStudioChromatographyInk([{ color: [0, 0, 0], mobility: 0.5, amount: 0 }])).toBeNull();
  });

  it("정규화는 범위를 강제한다", () => {
    const ink = normalizeStudioChromatographyInk([
      { color: [300, -10, 128], mobility: 2, amount: 1.5 },
    ]);
    expect(ink?.components[0]?.color).toEqual([255, 0, 128]);
    expect(ink?.components[0]?.mobility).toBe(1);
    expect(ink?.components[0]?.amount).toBe(1);
  });

  it("이동도가 높은 성분은 바깥에 피크를 가진다", () => {
    const slow = { color: [0, 0, 0] as const, mobility: 0.1, amount: 1 };
    const fast = { color: [255, 0, 0] as const, mobility: 0.9, amount: 1 };
    const dryness = 0.8;
    const separation = 0.8;
    const slowCenter = studioChromatographyConcentration(slow, 0.05, dryness, separation);
    const slowEdge = studioChromatographyConcentration(slow, 0.9, dryness, separation);
    const fastCenter = studioChromatographyConcentration(fast, 0.05, dryness, separation);
    const fastEdge = studioChromatographyConcentration(fast, 0.9, dryness, separation);
    expect(slowCenter).toBeGreaterThan(slowEdge);
    expect(fastEdge).toBeGreaterThan(fastCenter);
  });

  it("마름이 진행될수록 분리가 커진다", () => {
    const ink = studioChromatographyInkBlackPreset();
    expect(ink).not.toBeNull();
    if (!ink) return;
    const wetEdge = resolveStudioChromatographyColor(ink, 0.9, 0.1);
    const dryEdge = resolveStudioChromatographyColor(ink, 0.9, 1);
    // 건조 시 가장자리가 빨강 성분에 가까워진다
    expect(dryEdge[0]).toBeGreaterThanOrEqual(wetEdge[0]);
  });

  it("중심은 저이동도 성분 색에 가깝다", () => {
    const ink = studioChromatographyInkBlackPreset();
    expect(ink).not.toBeNull();
    if (!ink) return;
    const center = resolveStudioChromatographyColor(ink, 0.02, 0.9);
    // 검정 성분 (20,20,28)에 가까움
    expect(center[0]).toBeLessThan(80);
    expect(center[1]).toBeLessThan(80);
    expect(center[2]).toBeLessThan(80);
  });

  it("검정 프리셋이 실제로 분리된다: 중심≠가장자리", () => {
    const ink = studioChromatographyInkBlackPreset();
    expect(ink).not.toBeNull();
    if (!ink) return;
    const center = resolveStudioChromatographyColor(ink, 0.05, 1);
    const edge = resolveStudioChromatographyColor(ink, 0.95, 1);
    const distance = Math.hypot(center[0] - edge[0], center[1] - edge[1], center[2] - edge[2]);
    expect(distance).toBeGreaterThan(40);
  });

  it("수묵 프리셋이 존재한다", () => {
    const ink = studioChromatographyInkSumiPreset();
    expect(ink).not.toBeNull();
    expect(ink?.components).toHaveLength(3);
  });

  it("CSS 변환", () => {
    expect(studioChromatographyColorToCss([255, 0, 128])).toBe("rgb(255, 0, 128)");
    expect(studioChromatographyColorToCss([300, -5, 100])).toBe("rgb(255, 0, 100)");
  });

  it("결정적이다", () => {
    const ink = studioChromatographyInkBlackPreset();
    expect(ink).not.toBeNull();
    if (!ink) return;
    expect(resolveStudioChromatographyColor(ink, 0.4, 0.6)).toEqual(
      resolveStudioChromatographyColor(ink, 0.4, 0.6),
    );
  });
});
