import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyPoserVisualState,
  serializeFullVrmState,
  type FullVrmState,
  type PoseBoneMap,
} from "./studio-vrm-poser-utils";
import { EMPTY_STUDIO_VRM_POSE_TRANSLATIONS } from "./studio-vrm-pose-translations";
import { commitStudioVrmFullStateHistoryTransaction } from "./studio-vrm-state-history";
import { useStudioVrmPoserPoseEdit } from "./useStudioVrmPoserPoseEdit";

import type { StudioVrmPoserHost } from "./StudioVrmPoserHost";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: vi.fn(),
}));
vi.mock("./studio-vrm-poser-utils", async (importOriginal) => ({
  ...await importOriginal<typeof import("./studio-vrm-poser-utils")>(),
  serializeFullVrmState: vi.fn((value: unknown) => value),
  applyPoserVisualState: vi.fn(),
}));
vi.mock("./studio-vrm-persistent-ik-signature", () => ({
  buildStudioVrmPersistentIkSignature: () => "direct-joint-candidate",
}));
vi.mock("./studio-vrm-state-history", () => ({
  commitStudioVrmFullStateHistoryTransaction: vi.fn((_history, before, after) => ({
    entries: [before, after],
    index: 1,
    generation: 1,
  })),
}));

function createBeforeState(bones: PoseBoneMap = {}): FullVrmState {
  return {
    version: 3,
    modelId: "direct-joint-model",
    poseId: "standing",
    bones,
    yOffset: 0,
    poseTranslations: EMPTY_STUDIO_VRM_POSE_TRANSLATIONS,
    ikConstraints: [],
    bodyRotation: 0,
    fingerOverrides: {},
    avatarForge: null,
    bodyScale: { height: 1, width: 1 },
  } as FullVrmState;
}
function fixture({ locked = [] }: { locked?: string[] } = {}) {
  const chest = new THREE.Object3D();
  chest.rotation.set(0.1, -0.2, 0.05);
  chest.updateMatrixWorld(true);
  const currentVrm = {
    scene: new THREE.Object3D(),
    humanoid: {
      getNormalizedBoneNode: (bone: string) => bone === "chest" ? chest : null,
    },
  };
  const before = createBeforeState({
    chest: { rotation: [0.1, -0.2, 0.05] },
  });
  const directJointRotationTransactionRef = { current: null };
  const host = {
    activeModelId: "direct-joint-model",
    activePoseId: "standing",
    customBones: before.bones,
    customYOffset: before.yOffset,
    poseTranslations: before.poseTranslations,
    ikConstraints: before.ikConstraints,
    lockedPoseBones: locked,
    bodyScale: { height: 1, width: 1 },
    fingerEdits: {},
    jointLimitsEnabled: false,
    rigJointProfile: "balanced",
    fullBodyIkEnabled: false,
    footPlantEnabled: false,
    rigFloorHeight: 0,
    vrmRef: { current: currentVrm },
    directJointRotationTransactionRef,
    jointIkTransactionRef: { current: null },
    pendingPersistentIkCommandRef: { current: null },
    persistentIkResolvedSignatureRef: { current: "" },
    persistentIkCaptureIsReady: () => true,
    persistentIkReconciling: false,
    fullStateHistoryRef: { current: { entries: [before], index: 0, generation: 0 } },
    captureFullState: () => before,
    setActivePoseId: vi.fn(),
    setCustomBones: vi.fn(),
    setCustomYOffset: vi.fn(),
    setPoseTranslations: vi.fn(),
    setFingerEdits: vi.fn(),
    setSelectedJointHandle: vi.fn(),
    setSelectedViewportPoseBone: vi.fn(),
    setActiveCategory: vi.fn(),
    setTurntable: vi.fn(),
    setJointHandleStatus: vi.fn(),
    setCanUndo: vi.fn(),
    setCanRedo: vi.fn(),
    setPersistentIkReconciling: vi.fn(),
  } as unknown as StudioVrmPoserHost;
  useStudioVrmPoserPoseEdit(host);
  return { host, before, currentVrm, directJointRotationTransactionRef };
}

beforeEach(() => {
  vi.clearAllMocks();
});
describe("direct viewport joint rotation transaction", () => {
  it("previews from the baked baseline and commits exactly one history entry", () => {
    const { host, before, directJointRotationTransactionRef } = fixture();

    host.handleViewportJointRotationGesture("chest", [0, 0, 0], "start");
    expect(directJointRotationTransactionRef.current).toEqual(expect.objectContaining({
      bone: "chest",
      before,
      didPreview: false,
    }));

    host.handleViewportJointRotationGesture("chest", [20, -10, 5], "move");
    expect(host.setCustomBones).toHaveBeenCalledWith(expect.objectContaining({
      chest: {
        rotation: [
          expect.closeTo(0.1 + THREE.MathUtils.degToRad(20), 6),
          expect.closeTo(-0.2 + THREE.MathUtils.degToRad(-10), 6),
          expect.closeTo(0.05 + THREE.MathUtils.degToRad(5), 6),
        ],
      },
    }));
    expect(applyPoserVisualState).toHaveBeenCalledOnce();
    expect(commitStudioVrmFullStateHistoryTransaction).not.toHaveBeenCalled();

    host.handleViewportJointRotationGesture("chest", [20, -10, 5], "end");
    expect(directJointRotationTransactionRef.current).toBeNull();
    expect(serializeFullVrmState).toHaveBeenCalledWith(expect.objectContaining({
      poseId: "manual-pose",
      bones: expect.objectContaining({ chest: expect.anything() }),
    }));
    expect(commitStudioVrmFullStateHistoryTransaction).toHaveBeenCalledOnce();
    expect(commitStudioVrmFullStateHistoryTransaction).toHaveBeenCalledWith(
      expect.anything(),
      before,
      expect.objectContaining({ poseId: "manual-pose" }),
      "direct-joint-model",
    );
    expect(host.setCanUndo).toHaveBeenCalledWith(true);
    expect(host.setCanRedo).toHaveBeenCalledWith(false);
  });

  it("restores the authoritative pose without committing when the gesture is cancelled", () => {
    const { host, before, currentVrm, directJointRotationTransactionRef } = fixture();

    host.handleViewportJointRotationGesture("chest", [0, 0, 0], "start");
    host.handleViewportJointRotationGesture("chest", [15, 0, 0], "move");
    vi.mocked(applyPoserVisualState).mockClear();

    host.handleViewportJointRotationGesture("chest", [15, 0, 0], "cancel");

    expect(directJointRotationTransactionRef.current).toBeNull();
    expect(commitStudioVrmFullStateHistoryTransaction).not.toHaveBeenCalled();
    expect(host.setActivePoseId).toHaveBeenLastCalledWith("standing");
    expect(host.setCustomBones).toHaveBeenLastCalledWith(before.bones);
    expect(host.setCustomYOffset).toHaveBeenLastCalledWith(before.yOffset);
    expect(host.setPoseTranslations).toHaveBeenCalled();
    expect(host.setFingerEdits).toHaveBeenLastCalledWith({});
    expect(applyPoserVisualState).toHaveBeenCalledWith(
      currentVrm,
      expect.objectContaining({
        bones: before.bones,
        yOffset: before.yOffset,
      }),
    );
  });

  it("rejects a locked joint before starting a transaction", () => {
    const { host, directJointRotationTransactionRef } = fixture({ locked: ["chest"] });

    host.handleViewportJointRotationGesture("chest", [0, 0, 0], "start");

    expect(directJointRotationTransactionRef.current).toBeNull();
    expect(host.setJointHandleStatus).toHaveBeenCalledWith(expect.stringContaining("잠겨"));
    expect(host.setCustomBones).not.toHaveBeenCalled();
    expect(applyPoserVisualState).not.toHaveBeenCalled();
  });
});
