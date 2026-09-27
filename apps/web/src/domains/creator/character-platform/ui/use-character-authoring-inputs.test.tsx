/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmptyCharacterRecipe } from "../../character-shaper/character-shaper-recipe";
import { createCharacterDocumentV2, projectCharacterRecipeV1 } from "../document/character-document-v2";
import { migrateCharacterDocumentV2ToV3 } from "../document/character-document-v3";
import { CharacterDocumentV3Repository } from "../document/character-document-v3-repository";
import { captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { createAuthoringPoseVrm } from "../runtime/__fixtures__/character-authoring-vrm";
import { useCharacterAuthoringAuthority } from "./use-character-authoring-authority";
import { useCharacterAuthoringInputs } from "./use-character-authoring-inputs";

import type { StudioVrmPhotoPoseApplyPayload } from "../../vrm/StudioVrmPhotoPoseScanner";
import type { StudioVrmPoserHost } from "../../vrm/StudioVrmPoserHost";

afterEach(cleanup);

function fixture() {
  const vrm = createAuthoringPoseVrm();
  const recipe = createEmptyCharacterRecipe();
  const initial = { ...migrateCharacterDocumentV2ToV3(createCharacterDocumentV2({
    documentId: "character:input-test", model: { assetId: "hero", assetVersion: "1", contentSha256: null,
      mode: "canonical", topologyFamily: "toon-standard", topologyRevision: "v1", rigRevision: "v1", morphRevision: "v1", rendererRevision: "v1" },
    compatibility: { grade: "canonical", supported: [], partial: [], unsupported: [], sourceRevision: "v1" },
    recipe: projectCharacterRecipeV1(recipe), colors: recipe.colors, now: "2026-09-27T00:00:00.000Z",
  })), pose: captureCharacterPoseRuntimeV3({ source: vrm, poseId: "before", generationId: 0, includeFingers: true }) };
  const rows = new Map<string, string>();
  const repository = new CharacterDocumentV3Repository({ storeFactory: async () => ({
    get: async (key) => rows.get(key) ?? null,
    set: async (key, value) => { rows.set(key, value); }, delete: async (key) => { rows.delete(key); },
  }) });
  const host: StudioVrmPoserHost = { vrm, status: "ready", activeModelId: "hero", setJointHandleStatus: vi.fn(), setWebcamActive: vi.fn() };
  const hook = renderHook(({ h }) => {
    const authoring = useCharacterAuthoringAuthority(initial, "input-test", { repository, autosave: false, synchronizeProjection: false });
    return { authoring, input: useCharacterAuthoringInputs(h, authoring, true) };
  }, { initialProps: { h: host } });
  return { hook, host, vrm, rows, repository, initial };
}

const payload: StudioVrmPhotoPoseApplyPayload = {
  sourceName: "pose.png", bones: { leftUpperArm: [0.2, 0.3, 0.4] },
  fingerEdits: { leftIndexProximal: [0, 0.1, 0.5] }, detectedHandSides: ["left"], landmarks: [], worldLandmarks: [],
  confidence: { overall: 0.9, coverage: 0.9, quality: "high", lowConfidenceGroups: [],
    groups: { torso: 1, leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 },
    joints: { leftShoulder: 1, rightShoulder: 1, leftElbow: 1, rightElbow: 1, leftWrist: 1, rightWrist: 1,
      leftHip: 1, rightHip: 1, leftKnee: 1, rightKnee: 1, leftAnkle: 1, rightAnkle: 1 } },
};

async function ready(f: ReturnType<typeof fixture>) {
  await waitFor(() => expect(f.hook.result.current.authoring.hydrated).toBe(true));
}

describe("실제 사진·웹캠 UI 입력의 V3 연결", () => {
  it("사진 입력이 문서에 먼저 반영되고 한 번의 undo·redo와 저장·복원으로 유지된다", async () => {
    const f = fixture(); await ready(f);
    const before = f.hook.result.current.authoring.snapshot.document;
    act(() => { expect(f.hook.result.current.input.handlePhotoPoseApply(payload)).toBe(true); });
    const pose = f.hook.result.current.authoring.snapshot.document.pose;
    expect(pose.source).toBe("photo");
    expect(pose.bones.leftIndexProximal).not.toEqual(before.pose.bones.leftIndexProximal);
    expect(f.vrm.humanoid.getNormalizedBoneNode("leftUpperArm")?.quaternion.toArray()).toEqual(before.pose.bones.leftUpperArm);
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(1);
    act(() => { f.hook.result.current.authoring.undo(); });
    expect(f.hook.result.current.authoring.snapshot.document.pose).toEqual(before.pose);
    act(() => { f.hook.result.current.authoring.redo(); });
    expect(f.hook.result.current.authoring.snapshot.document.pose).toEqual(pose);
    await act(async () => { expect(await f.hook.result.current.authoring.saveNow()).toBe(true); });
    f.hook.unmount();
    const restored = renderHook(() => useCharacterAuthoringAuthority(f.initial, "input-test", {
      repository: f.repository, autosave: false, synchronizeProjection: false,
    }));
    await waitFor(() => expect(restored.result.current.hydrated).toBe(true));
    expect(restored.result.current.snapshot.document.pose).toEqual(pose);
  });
  it("웹캠의 실제 뼈대와 표정을 함께 확정하고 중지한다", async () => {
    const f = fixture(); await ready(f);
    f.vrm.humanoid.getNormalizedBoneNode("rightUpperArm")?.rotation.set(0.1, 0.2, 0.3);
    f.hook.rerender({ h: { ...f.host, webcamActive: true, trackingDataRef: { current: { expressions: { happy: 0.8 } } } } });
    act(() => { expect(f.hook.result.current.input.handleCapturePose()).toBe(true); });
    expect(f.hook.result.current.authoring.snapshot.document.pose.source).toBe("webcam");
    expect(f.hook.result.current.authoring.snapshot.document.expression.weights.happy).toBe(0.8);
    expect(f.host.setWebcamActive).toHaveBeenCalledWith(false);
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(1);
    act(() => { f.hook.result.current.authoring.undo(); });
    expect(f.hook.result.current.authoring.snapshot.document.expression.weights.happy).toBeUndefined();
  });
  it.each([{ isCapturing: true }, { isSharingPose: true }, { persistentIkReconciling: true }, { activeModelId: "other" }])("사용할 수 없는 상태 %j에서는 문서를 변경하지 않는다", async (patch) => {
    const f = fixture(); await ready(f);
    f.hook.rerender({ h: { ...f.host, ...patch } });
    const before = f.hook.result.current.authoring.snapshot.document;
    act(() => { expect(f.hook.result.current.input.handlePhotoPoseApply(payload)).toBe(false); });
    expect(f.hook.result.current.authoring.snapshot.document).toBe(before);
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(0);
    expect(f.host.setJointHandleStatus).toHaveBeenCalled();
  });
  it("이전 VRM 인스턴스의 늦은 결과를 새 모델에 적용하지 않는다", async () => {
    const f = fixture(); await ready(f);
    const staleApply = f.hook.result.current.input.handlePhotoPoseApply;
    f.hook.rerender({ h: { ...f.host, vrm: createAuthoringPoseVrm() } });
    act(() => { expect(staleApply(payload)).toBe(false); });
    expect(f.hook.result.current.authoring.snapshot.historyLength).toBe(0);
    expect(f.host.setJointHandleStatus).toHaveBeenLastCalledWith(expect.stringContaining("이전 캐릭터"));
  });
});
