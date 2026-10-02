import { describe, expect, it } from "vitest";

import { SCENE_FEATURE_IDS, createFeatureReport, featureActive, featureOff, featureUnavailable, hasSceneFeatures, readSceneFeatures, summarizeFeatures } from "./scene-features";

describe("scene-features", () => {
  it("createFeatureReport는 모든 id를 채우고 부분 값을 반영한다", () => {
    const report = createFeatureReport({ cascadedShadows: featureUnavailable("NullEngine") });
    for (const id of SCENE_FEATURE_IDS) expect(report[id]).toBeDefined();
    expect(report.cascadedShadows).toEqual({ status: "unavailable", reasonKo: "NullEngine" });
    expect(report.taa).toEqual({ status: "off" });
    expect(featureActive("4 샘플")).toEqual({ status: "active", detail: "4 샘플" });
    expect(featureOff()).toEqual({ status: "off" });
  });

  it("readSceneFeatures는 포트가 있는 객체에서만 보고를 읽는다", () => {
    expect(readSceneFeatures(null)).toBeNull();
    expect(readSceneFeatures({})).toBeNull();
    const report = createFeatureReport();
    expect(hasSceneFeatures({ sceneFeatures: () => report })).toBe(true);
    expect(readSceneFeatures({ sceneFeatures: () => report })).toBe(report);
  });

  it("summarizeFeatures는 한글 라벨·상태·사유를 한 줄씩 낸다", () => {
    const lines = summarizeFeatures(createFeatureReport({ msaa: featureActive("4 샘플"), ssao: featureOff("프로파일에서 꺼짐") }));
    expect(lines).toHaveLength(SCENE_FEATURE_IDS.length);
    expect(lines.find((line) => line.startsWith("MSAA"))).toContain("활성 (4 샘플)");
    expect(lines.find((line) => line.startsWith("SSAO2"))).toContain("꺼짐 — 프로파일에서 꺼짐");
  });
});
