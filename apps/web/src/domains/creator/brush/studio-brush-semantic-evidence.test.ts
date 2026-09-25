import { describe, expect, it } from "vitest";
import { profileStudioBrushTipSemanticEvidence } from "./studio-brush-semantic-evidence";
import { auditStudioBrushSemanticClaims } from "./studio-brush-semantic-quality";
import { materializeStudioBrushPackSelection } from "./studio-brush-pack-runtime";
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";

describe("실제 브러시 촉의 의미 근거", () => {
  it("매끈한 원형을 무늬·강모·방향성 촉으로 오인하지 않는다", () => {
    const evidence = profileStudioBrushTipSemanticEvidence({
      tip: { shape: "hard", softness: 0 }, roundness: { base: 1, mappings: [] }, grain: { amount: 0 },
    });
    expect(evidence).toMatchObject({ directionalTip: false, patternedTip: false, bristleTip: false, grainTip: false });
    expect(evidence.spatialAlpha).toHaveLength(256);
  });

  it("맞춤 알파라는 사실만으로 무늬 근거를 만들지 않는다", () => {
    const evidence = profileStudioBrushTipSemanticEvidence({
      tip: { shape: "hard", softness: 0, alphaMapSize: 8,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(new Uint8Array(64).fill(255)) },
      grain: { amount: 0 }, roundness: { base: 1, mappings: [] },
    });
    expect(evidence.custom).toBe(true);
    expect(evidence.patternedTip).toBe(false);
    expect(evidence.bristleTip).toBe(false);
  });

  it("갈퀴의 실제 반복 섬유를 인식하고 문서 고정 격자와 구분한다", () => {
    const selection = materializeStudioBrushPackSelection("fine-rake");
    if (!selection?.brushDynamics) throw new Error("가는 갈퀴 설정 누락");
    const evidence = profileStudioBrushTipSemanticEvidence(selection.brushDynamics);
    expect(evidence).toMatchObject({ custom: true, directionalTip: true, patternedTip: true, bristleTip: true });
    const input = { catalogId: "fine-rake", runtimeBrushId: "dry-media", tipEvidence: evidence };
    expect(auditStudioBrushSemanticClaims({ ...input, name: "갈퀴 해칭" }).warningCount).toBe(0);
    expect(auditStudioBrushSemanticClaims({ ...input, name: "문서 고정 격자" }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "tone-claim-without-grid-response" })]));
  });

  it("저장용 옛 ID와 입자가 없다는 문구를 새 시각 효과 약속으로 해석하지 않는다", () => {
    expect(auditStudioBrushSemanticClaims({
      catalogId: "old-watercolor-glow-particle", runtimeBrushId: "pen", name: "균일선", hint: "입자 없는 매끈한 선",
    }).issues).toEqual([]);
    expect(auditStudioBrushSemanticClaims({
      catalogId: "hard-airbrush", name: "경질 에어", hint: "입자 간격 없이 연결되는 경계",
    }).issues).toEqual([]);
  });

  it("이름만 붙인 수채·강모·무늬와 필압 무시 약속은 계속 실패시킨다", () => {
    const result = auditStudioBrushSemanticClaims({
      catalogId: "fake", runtimeBrushId: "pen", name: "수채 강모 패턴", hint: "필압을 무시하는 선", pressureResponsive: true,
    });
    expect(result.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "wet-claim-without-wet-response", "bristle-claim-without-bristle-response",
      "tone-claim-without-grid-response", "fixed-pressure-claim-with-responsive-response",
    ]));
  });

  it("필버트는 타원 장식 대신 실제 평행 강모 단면을 쓴다", () => {
    const filbert = materializeStudioBrushPackSelection("material-filbert-bristle");
    const oval = materializeStudioBrushPackSelection("layered-oval");
    if (!filbert?.brushDynamics || !oval?.brushDynamics) throw new Error("비교 브러시 설정 누락");
    const evidence = profileStudioBrushTipSemanticEvidence(filbert.brushDynamics);
    expect(evidence.bristleTip).toBe(true);
    expect(evidence.spatialAlpha).not.toEqual(profileStudioBrushTipSemanticEvidence(oval.brushDynamics).spatialAlpha);
  });
});
