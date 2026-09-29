import { describe, expect, it } from "vitest";

import {
  getSpectacleLabels,
  SPECTACLE_LABELS_EN,
  SPECTACLE_LABELS_KO,
  type SpectacleEmptyKind,
} from "./spectacle-labels";

const kinds: SpectacleEmptyKind[] = ["empty", "error", "search", "offline", "success"];

describe("getSpectacleLabels", () => {
  it("ko면 한국어 라벨", () => {
    expect(getSpectacleLabels("ko-KR")).toBe(SPECTACLE_LABELS_KO);
    expect(getSpectacleLabels("ko")).toBe(SPECTACLE_LABELS_KO);
  });

  it("그 외는 영어 라벨", () => {
    expect(getSpectacleLabels("en-US")).toBe(SPECTACLE_LABELS_EN);
    expect(getSpectacleLabels("ja")).toBe(SPECTACLE_LABELS_EN);
  });

  it("모든 종류에 제목·설명이 있다", () => {
    for (const kind of kinds) {
      expect(SPECTACLE_LABELS_KO.emptyTitle(kind).length).toBeGreaterThan(0);
      expect(SPECTACLE_LABELS_KO.emptyDescription(kind).length).toBeGreaterThan(0);
      expect(SPECTACLE_LABELS_EN.emptyTitle(kind).length).toBeGreaterThan(0);
      expect(SPECTACLE_LABELS_EN.emptyDescription(kind).length).toBeGreaterThan(0);
    }
  });

  it("공통 문구가 비어있지 않다", () => {
    for (const labels of [SPECTACLE_LABELS_KO, SPECTACLE_LABELS_EN]) {
      expect(labels.retry.length).toBeGreaterThan(0);
      expect(labels.goHome.length).toBeGreaterThan(0);
      expect(labels.loading.length).toBeGreaterThan(0);
      expect(labels.celebrate.length).toBeGreaterThan(0);
    }
  });
});
