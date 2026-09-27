// @vitest-environment jsdom
import { useMemo, useRef, useState } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Bone, Group, Quaternion, Vector3 } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCharacterShaperBinding } from "../../character-shaper/useCharacterShaperBinding";
import { EMPTY_STUDIO_VRM_POSE_TRANSLATIONS } from "../../vrm/studio-vrm-pose-translations";
import type { StudioVrmPoseTranslations } from "../../vrm/studio-vrm-scene-document";
import { serializeCharacterDocumentV3 } from "../document/character-document-v3";
import { useCharacterPlatformWorkbench } from "./use-character-platform-workbench";

const storage = vi.hoisted(() => ({ rows: new Map<string, string>() }));
vi.mock("../../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({ asAsyncKeyValueStore: (namespace: string) => ({
    get: async (key: string) => storage.rows.get(`${namespace}/${key}`) ?? null,
    set: async (key: string, value: string) => { storage.rows.set(`${namespace}/${key}`, value); },
    delete: async (key: string) => { storage.rows.delete(`${namespace}/${key}`); },
  }) }),
}));

function useFixture() {
  const vrm = useMemo(() => {
    const scene = new Group(); const nodes = new Map<string, Bone>();
    const add = (name: string, parent: Group | Bone, xyz: readonly [number, number, number]) => {
      const bone = new Bone(); bone.position.set(...xyz); nodes.set(name, bone); parent.add(bone); return bone;
    };
    const hips = add("hips", scene, [0, 2, 0]);
    const upper = add("leftUpperArm", hips, [0.2, 0.4, 0]);
    const lower = add("leftLowerArm", upper, [0.6, 0, 0]);
    add("leftHand", lower, [0.6, 0, 0]);
    for (const [side, x] of [["left", 0.15], ["right", -0.15]] as const) {
      const thigh = add(`${side}UpperLeg`, hips, [x, 0, 0]);
      const calf = add(`${side}LowerLeg`, thigh, [0, -1, 0]);
      add(`${side}Foot`, calf, [0, -1, 0]);
    }
    scene.updateMatrixWorld(true);
    return { scene, nodes, humanoid: { getNormalizedBoneNode: (name: string) => nodes.get(name) ?? null, update: () => {} } };
  }, []);
  const [customBones, setCustomBones] = useState<Record<string, { rotation: readonly [number, number, number] }>>({});
  const [customYOffset, setCustomYOffset] = useState(0);
  const [poseTranslations, setPoseTranslations] = useState<StudioVrmPoseTranslations>(EMPTY_STUDIO_VRM_POSE_TRANSLATIONS);
  const [bodyRotation, setBodyRotation] = useState(0);
  const writes = useRef(0);
  const host = { activeModelId: "pose-v3-runtime", status: "ready", vrm, customBones,
    setCustomBones: (value: Record<string, { rotation: readonly [number, number, number] }>) => { writes.current++; setCustomBones(value); },
    customYOffset, setCustomYOffset, poseTranslations, setPoseTranslations, bodyRotation, setBodyRotation };
  const workbench = useCharacterPlatformWorkbench(host, useCharacterShaperBinding(host));
  return { workbench, host, vrm, writes };
}

function handPosition(vrm: ReturnType<typeof useFixture>["vrm"]): Vector3 {
  const hand = vrm.nodes.get("leftHand");
  if (!hand) throw new Error("손 fixture 누락");
  return hand.getWorldPosition(new Vector3());
}

beforeEach(() => storage.rows.clear());
afterEach(cleanup);

describe("Pose V3 authority와 실제 호스트 뼈대 왕복", () => {
  it("실제 손 IK preview와 취소·적용·undo가 같은 뼈대를 복원한다", async () => {
    const hook = renderHook(useFixture);
    await waitFor(() => expect(hook.result.current.workbench.poseRuntime.ready).toBe(true));
    act(() => hook.result.current.workbench.setSelectedPoseRegions(["left-arm"]));
    const original = handPosition(hook.result.current.vrm);
    act(() => expect(hook.result.current.workbench.poseRuntime.previewTarget("leftHand", [-0.3, 0.1, -0.3])).toBe(true));
    await waitFor(() => expect(handPosition(hook.result.current.vrm).distanceTo(original)).toBeGreaterThan(0.3));
    expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(0);
    act(() => hook.result.current.workbench.poseRuntime.cancel());
    await waitFor(() => expect(handPosition(hook.result.current.vrm).distanceTo(original)).toBeLessThan(1e-6));
    act(() => expect(hook.result.current.workbench.poseRuntime.previewTarget("leftHand", [-0.3, 0.1, -0.3])).toBe(true));
    act(() => hook.result.current.workbench.poseRuntime.apply());
    await waitFor(() => expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(1));
    expect(hook.result.current.workbench.poseRuntime.message).toContain("포즈 편집을 적용했습니다");
    act(() => hook.result.current.workbench.poseRuntime.apply());
    expect(hook.result.current.workbench.poseRuntime.message).toContain("미리보기가 없습니다");
    expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(1);
    expect(hook.result.current.workbench.authoring.snapshot.document.pose.effectors).toHaveLength(1);
    act(() => hook.result.current.workbench.poseRuntime.undo());
    await waitFor(() => expect(handPosition(hook.result.current.vrm).distanceTo(original)).toBeLessThan(1e-6));
  });

  it("포즈 import·다시 열기·undo를 실제 본과 호스트 Euler에 반영한다", async () => {
    const hook = renderHook(useFixture);
    await waitFor(() => expect(hook.result.current.workbench.poseRuntime.ready).toBe(true));
    const document = hook.result.current.workbench.authoring.snapshot.document;
    const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.35);
    const imported = { ...document, pose: { ...document.pose, bones: { ...document.pose.bones,
      leftUpperArm: [rotation.x, rotation.y, rotation.z, rotation.w] as const,
    } } };
    await act(async () => expect(await hook.result.current.workbench.authoring.importJson(serializeCharacterDocumentV3(imported))).toBe(true));
    await waitFor(() => expect(hook.result.current.vrm.nodes.get("leftUpperArm")?.quaternion.angleTo(rotation)).toBeLessThan(1e-7));
    expect(hook.result.current.host.customBones.leftUpperArm?.rotation[2]).toBeCloseTo(0.35, 6);
    await act(async () => { await hook.result.current.workbench.authoring.saveNow(); });
    hook.unmount();
    const reopened = renderHook(useFixture);
    await waitFor(() => expect(reopened.result.current.workbench.poseRuntime.ready).toBe(true));
    await waitFor(() => expect(reopened.result.current.vrm.nodes.get("leftUpperArm")?.quaternion.angleTo(rotation)).toBeLessThan(1e-7));
    const current = reopened.result.current.workbench.authoring.snapshot.document;
    const reset = { ...current, pose: document.pose };
    await act(async () => { await reopened.result.current.workbench.authoring.importJson(serializeCharacterDocumentV3(reset)); });
    act(() => reopened.result.current.workbench.authoring.undo());
    await waitFor(() => expect(reopened.result.current.vrm.nodes.get("leftUpperArm")?.quaternion.angleTo(rotation)).toBeLessThan(1e-7));
  });

  it("다른 섹션의 명령은 포즈를 반복 적용하지 않고 runtime echo도 history를 늘리지 않는다", async () => {
    const hook = renderHook(useFixture);
    await waitFor(() => expect(hook.result.current.workbench.poseRuntime.ready).toBe(true));
    const before = hook.result.current.writes.current;
    act(() => {
      const document = hook.result.current.workbench.authoring.snapshot.document;
      hook.result.current.workbench.authoring.dispatch({ commandId: "test:output", label: "출력 크기", source: "user", expectedDocumentId: document.documentId, expectedRevision: document.revision,
        operations: [{ kind: "set-output", output: { ...document.output, width: 1024 } }],
      });
    });
    expect(hook.result.current.writes.current).toBe(before);
    expect(hook.result.current.workbench.authoring.snapshot.historyLength).toBe(1);
    expect(hook.result.current.workbench.poseRuntime.runtimeError).toBeNull();
  });

  it("정규화된 사람형 뼈대가 없는 모델은 포즈 기능을 완료로 표시하지 않는다", async () => {
    const host = { activeModelId: "unsupported-pose", status: "ready", vrm: { scene: new Group() } };
    const hook = renderHook(() => useCharacterPlatformWorkbench(host, useCharacterShaperBinding(host)));
    await waitFor(() => expect(hook.result.current.authoring.hydrated).toBe(true));
    expect(hook.result.current.poseRuntime.supported).toBe(false);
    act(() => expect(hook.result.current.poseRuntime.previewStabilization()).toBe(false));
    expect(hook.result.current.poseRuntime.message).toContain("지원하는 캐릭터");
  });
});
