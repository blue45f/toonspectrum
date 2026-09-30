import { describe, expect, it } from "vitest";

import {
  STUDIO_SHAPER_POSE_PRESET_IDS,
  STUDIO_SHAPER_POSE_PRESET_LABELS,
  StubStudioSketchToModelProvider,
  adaptSketchModelToMannequinRegistration,
  applyStudioShaperPosePreset,
  runStudioSketchToModelPipeline,
  StudioSketchPipelineError,
} from "./studio-shaper-sketch-pipeline";

const FRONT = { id: "front-1", view: "front", hash: "hash-front-abc", widthPx: 800, heightPx: 1200 } as const;
const SIDE = { id: "side-1", view: "side", hash: "hash-side-def", widthPx: 800, heightPx: 1200 } as const;

describe("runStudioSketchToModelPipeline", () => {
  it("단계가 업로드→분석→생성→등록→완료 순서로 전이됩니다", async () => {
    const result = await runStudioSketchToModelPipeline(
      { front: FRONT, side: SIDE },
      new StubStudioSketchToModelProvider(() => 1_700_000_000_000),
    );
    expect(result.steps.map((step) => step.stage)).toEqual([
      "uploading",
      "analyzing",
      "generating",
      "registering",
      "done",
    ]);
    for (const step of result.steps) {
      expect(step.enteredAt).toBe(1_700_000_000_000);
      expect(step.detail.length).toBeGreaterThan(0);
    }
  });

  it("stub 생성 결과는 provenance=stub으로 식별됩니다", async () => {
    const result = await runStudioSketchToModelPipeline(
      { front: FRONT, side: SIDE },
      new StubStudioSketchToModelProvider(),
    );
    expect(result.model.provenance).toBe("stub");
    expect(result.model.modelId.startsWith("stub-model-")).toBe(true);
    expect(result.model.sourceSketches).toHaveLength(2);
  });

  it("동일 입력은 결정적으로 동일 모델을 생성합니다", async () => {
    const provider = new StubStudioSketchToModelProvider();
    const first = await runStudioSketchToModelPipeline({ front: FRONT, side: SIDE }, provider);
    const second = await runStudioSketchToModelPipeline({ front: FRONT, side: SIDE }, provider);
    expect(second.model.modelId).toBe(first.model.modelId);
    expect(second.model.bodyParams).toEqual(first.model.bodyParams);
  });

  it("서로 다른 스케치는 서로 다른 모델을 생성합니다", async () => {
    const provider = new StubStudioSketchToModelProvider();
    const first = await runStudioSketchToModelPipeline({ front: FRONT, side: SIDE }, provider);
    const other = await runStudioSketchToModelPipeline(
      { front: { ...FRONT, hash: "hash-front-zzz" }, side: SIDE },
      provider,
    );
    expect(other.model.modelId).not.toBe(first.model.modelId);
  });

  it("잘못된 입력에서는 invalid-input 오류가 발생합니다", async () => {
    const provider = new StubStudioSketchToModelProvider();
    await expect(runStudioSketchToModelPipeline({ front: null, side: SIDE }, provider)).rejects.toMatchObject({
      code: "invalid-input",
    });
    await expect(
      runStudioSketchToModelPipeline({ front: { ...FRONT, view: "side" }, side: SIDE }, provider),
    ).rejects.toBeInstanceOf(StudioSketchPipelineError);
  });

  it("분석 결과가 체형 파라미터 범위를 벗어나지 않습니다", async () => {
    const result = await runStudioSketchToModelPipeline(
      { front: FRONT, side: SIDE },
      new StubStudioSketchToModelProvider(),
    );
    const params = result.model.bodyParams;
    expect(params.headCount).toBeGreaterThanOrEqual(3);
    expect(params.headCount).toBeLessThanOrEqual(9);
    expect(params.shoulderWidth).toBeGreaterThanOrEqual(0.7);
    expect(params.shoulderWidth).toBeLessThanOrEqual(1.3);
  });
});

describe("adaptSketchModelToMannequinRegistration", () => {
  it("생성 모델을 데생 인형 등록 스펙으로 변환합니다", async () => {
    const provider = new StubStudioSketchToModelProvider();
    const { model } = await runStudioSketchToModelPipeline({ front: FRONT, side: SIDE }, provider);
    const registration = adaptSketchModelToMannequinRegistration(model, "주인공 A");
    expect(registration.displayName).toBe("주인공 A");
    expect(registration.sourceModelId).toBe(model.modelId);
    expect(registration.provenance).toBe("stub");
    expect(registration.registrationId.startsWith("mannequin-reg-")).toBe(true);
    expect(registration.bodyParams.headCount).toBe(model.bodyParams.headCount);
  });

  it("빈 이름은 등록을 거부합니다", async () => {
    const provider = new StubStudioSketchToModelProvider();
    const { model } = await runStudioSketchToModelPipeline({ front: FRONT, side: SIDE }, provider);
    expect(() => adaptSketchModelToMannequinRegistration(model, "   ")).toThrow(StudioSketchPipelineError);
  });
});

describe("applyStudioShaperPosePreset", () => {
  it("10종 프리셋이 모두 존재합니다", () => {
    expect(STUDIO_SHAPER_POSE_PRESET_IDS).toHaveLength(10);
    for (const poseId of STUDIO_SHAPER_POSE_PRESET_IDS) {
      expect(STUDIO_SHAPER_POSE_PRESET_LABELS[poseId].length).toBeGreaterThan(0);
    }
  });

  it("각 프리셋은 결정적인 2D 레퍼런스 출력 파라미터를 반환합니다", () => {
    for (const poseId of STUDIO_SHAPER_POSE_PRESET_IDS) {
      const first = applyStudioShaperPosePreset(poseId);
      const second = applyStudioShaperPosePreset(poseId);
      expect(second).toEqual(first);
      expect(first.poseId).toBe(poseId);
      expect(first.frameWidthPx).toBe(1024);
      expect(first.frameHeightPx).toBe(1536);
      expect(first.cameraAngleDeg).toBeGreaterThanOrEqual(0);
      expect(first.cameraAngleDeg).toBeLessThanOrEqual(90);
    }
  });

  it("포즈별로 카메라 파라미터가 구분됩니다", () => {
    const front = applyStudioShaperPosePreset("standing-front");
    const side = applyStudioShaperPosePreset("standing-side");
    expect(front.cameraAngleDeg).not.toBe(side.cameraAngleDeg);
    expect(front.poseLabel).toBe("정면 기립");
    expect(side.poseLabel).toBe("측면 기립");
  });

  it("알 수 없는 포즈 id는 오류를 발생시킵니다", () => {
    expect(() => applyStudioShaperPosePreset("flying" as never)).toThrow(StudioSketchPipelineError);
  });
});
