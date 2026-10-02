import { describe, expect, it } from "vitest";

import { BETA_FEATURE_IDS, EXTENDED_FEATURE_IDS, EXTENDED_FEATURE_LABELS_KO, RIG_CAPABILITY_IDS, betaActive, betaFailed, betaOff, betaUnsupported, betaWaiting, createBetaReport, hasBetaFeatures, isBetaFeatureId, readBetaFeatures, readExtendedFeatures, summarizeExtendedFeatures } from "./beta-features";
import { SCENE_FEATURE_IDS, createFeatureReport, featureActive } from "./scene-features";

describe("beta-features", () => {
  it("베타 4종과 능력 2종 id를 정의하고 라벨이 모두 한글이다", () => {
    expect([...BETA_FEATURE_IDS]).toEqual(["nodeMaterialToon", "iblShadows", "openPbr", "uvProjectionPaint"]);
    expect([...RIG_CAPABILITY_IDS]).toEqual(["jointOffsets", "glbMorphSparse"]);
    for (const id of EXTENDED_FEATURE_IDS) expect(EXTENDED_FEATURE_LABELS_KO[id]).toMatch(/[가-힣]/u);
    expect(isBetaFeatureId("openPbr")).toBe(true);
    expect(isBetaFeatureId("jointOffsets")).toBe(false);
    expect(isBetaFeatureId("nope")).toBe(false);
  });

  it("기본 보고는 전부 꺼짐·지원이고 요청이 없다", () => {
    const report = createBetaReport();
    for (const id of BETA_FEATURE_IDS) expect(report[id]).toEqual({ status: "off", requested: false, supported: true });
  });

  it("상태 생성 보조: 미지원은 요청 여부로 status가 갈리고 대기는 오류가 아니다", () => {
    expect(betaUnsupported("NullEngine", false)).toEqual({ status: "off", requested: false, supported: false, reasonKo: "NullEngine" });
    expect(betaUnsupported("NullEngine", true)).toEqual({ status: "unavailable", requested: true, supported: false, reasonKo: "NullEngine" });
    expect(betaWaiting("툰 모드에서만")).toEqual({ status: "off", requested: true, supported: true, reasonKo: "툰 모드에서만" });
    expect(betaFailed("빌드 실패")).toEqual({ status: "unavailable", requested: true, supported: true, reasonKo: "빌드 실패" });
    expect(betaActive("120블록")).toEqual({ status: "active", requested: true, supported: true, detail: "120블록" });
    expect(betaActive()).toEqual({ status: "active", requested: true, supported: true });
    expect(betaOff("기본 경로")).toEqual({ status: "off", requested: false, supported: true, reasonKo: "기본 경로" });
  });

  it("createBetaReport는 부분 값을 반영한다", () => {
    const report = createBetaReport({ openPbr: betaActive() });
    expect(report.openPbr.status).toBe("active");
    expect(report.iblShadows.status).toBe("off");
  });

  it("포트 판별은 두 메서드가 모두 있는 객체에서만 참이다", () => {
    expect(hasBetaFeatures(null)).toBe(false);
    expect(hasBetaFeatures({ betaFeatures: () => createBetaReport() })).toBe(false);
    const port = { betaFeatures: () => createBetaReport(), setBetaFeature: () => Promise.resolve(betaOff()) };
    expect(hasBetaFeatures(port)).toBe(true);
    expect(readBetaFeatures({})).toBeNull();
    expect(readBetaFeatures(port)).toEqual(createBetaReport());
  });

  it("확장 항목은 기본 9개 항목 보고에서 따로 읽는다(기본 9만 아는 보고면 null)", () => {
    const base = createFeatureReport();
    expect(readExtendedFeatures(null)).toBeNull();
    expect(readExtendedFeatures(base)).toBeNull();
    const full = { ...base, ...createBetaReport({ iblShadows: betaUnsupported("복셀 그림자는 WebGL2 전용", false) }), jointOffsets: featureActive("본 3개"), glbMorphSparse: featureActive("내보내기 4 MB") };
    const extended = readExtendedFeatures(full);
    expect(extended).not.toBeNull();
    expect(Object.keys(extended ?? {})).toHaveLength(EXTENDED_FEATURE_IDS.length);
    // 확장 키는 기본 9개 id와 겹치지 않는다(RenderPanel의 기본 9행 표가 그대로 유지된다).
    for (const id of EXTENDED_FEATURE_IDS) expect((SCENE_FEATURE_IDS as readonly string[]).includes(id)).toBe(false);
  });

  it("요약은 한글 라벨·상태·사유·상세를 한 줄씩 낸다", () => {
    const lines = summarizeExtendedFeatures({
      iblShadows: betaUnsupported("복셀 그림자는 WebGL2 전용", true),
      openPbr: betaActive("파츠 5개"),
      jointOffsets: featureActive("본 3개"),
    });
    expect(lines).toEqual(["IBL 그림자: 사용 불가 — 복셀 그림자는 WebGL2 전용", "OpenPBR 재질: 활성 (파츠 5개)", "체형 관절 오프셋: 활성 (본 3개)"]);
  });
});
