import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createStudioShared3dSceneSession,
} from "./studio-shared-3d-scene-bridge";
import { createStudioVrmSceneDocument, normalizeStudioVrmSceneDocument } from "./studio-vrm-scene-document";

const loadStudioVrmAsset = vi.fn();
const getStoredVrmModelByHash = vi.fn();
const selectableSampleVrmUrl = vi.fn();
const applyPoseToVrm = vi.fn(() => true);
const applyFingerRotations = vi.fn();
const applyBodyScale = vi.fn();
const applyExpressionWeightsToVrm = vi.fn();
const applyVrmCustomColors = vi.fn();
const applyVrmMaterialFx = vi.fn();

vi.mock("./studio-vrm-asset-runtime", () => ({
  STUDIO_VRM_BASE_ROTATION_Y_KEY: "studioVrmBaseRotationY",
  disposeStudioVrmAsset: vi.fn(),
  loadStudioVrmAsset,
}));
vi.mock("./vrm-library", () => ({
  getStoredVrmModelByHash,
  selectableSampleVrmUrl,
}));
vi.mock("./studio-vrm-poser-utils", () => ({
  applyBodyScale,
  applyExpressionWeightsToVrm,
  applyFingerRotations,
  applyPoseToVrm,
  applyVrmCustomColors,
  applyVrmMaterialFx,
}));

const {
  applyStudioBg3dLinkedCharacterState,
  loadStudioBg3dLinkedVrm,
} = await import("./studio-bg3d-shared-vrm-runtime");

describe("Studio BG3D linked VRM runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectableSampleVrmUrl.mockReturnValue("/vrm/sample.vrm");
  });

  it("resolves a rights-admitted bundled model through the shared VRM runtime", async () => {
    const vrm = { scene: new THREE.Group() };
    loadStudioVrmAsset.mockResolvedValue(vrm);

    await expect(loadStudioBg3dLinkedVrm(createStudioVrmSceneDocument())).resolves.toBe(vrm);
    expect(selectableSampleVrmUrl).toHaveBeenCalledWith("sample-vrm");
    expect(loadStudioVrmAsset).toHaveBeenCalledWith("/vrm/sample.vrm");
    expect(getStoredVrmModelByHash).not.toHaveBeenCalled();
  });

  it("resolves an uploaded character by content hash and revokes its temporary URL", async () => {
    const hash = `sha256:${"b".repeat(64)}`;
    const scene = createStudioVrmSceneDocument({
      source: "attachment",
      hash,
      byteSize: 4,
      mime: "model/vrm",
      name: "업로드 캐릭터",
    });
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "model/vrm" });
    const vrm = { scene: new THREE.Group() };
    getStoredVrmModelByHash.mockResolvedValue({ blob });
    loadStudioVrmAsset.mockResolvedValue(vrm);
    const revoke = vi.spyOn(URL, "revokeObjectURL");

    await expect(loadStudioBg3dLinkedVrm(scene)).resolves.toBe(vrm);
    expect(getStoredVrmModelByHash).toHaveBeenCalledWith(hash);
    const runtimeUrl = loadStudioVrmAsset.mock.calls[0]?.[0] as string;
    expect(runtimeUrl).toMatch(/^blob:/u);
    expect(revoke).toHaveBeenCalledWith(runtimeUrl);
    revoke.mockRestore();
  });

  it("applies the canonical pose/expression/material subset and makes the projection read-only", () => {
    const scene = normalizeStudioVrmSceneDocument({
      ...createStudioVrmSceneDocument(),
      pose: {
        ...createStudioVrmSceneDocument().pose,
        bodyRotationY: 0.4,
        yOffset: 0.2,
      },
      expressions: { happy: 0.8 },
      appearance: {
        ...createStudioVrmSceneDocument().appearance,
        customColors: { hair: "#112233" },
      },
    });
    const source = createStudioShared3dSceneSession([
      { elementId: "character-a", scene },
    ]).characters[0]!;
    const root = new THREE.Group();
    root.userData.studioVrmBaseRotationY = 0.1;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(mesh);
    const vrm = {
      scene: root,
      update: vi.fn(),
    } as never;

    expect(applyStudioBg3dLinkedCharacterState(vrm, source)).toBe(true);
    expect(applyPoseToVrm).toHaveBeenCalledWith(
      vrm,
      scene.pose.bones,
      0.2,
      scene.pose.translations,
    );
    expect(applyFingerRotations).toHaveBeenCalledWith(vrm, scene.pose.fingerOverrides);
    expect(applyExpressionWeightsToVrm).toHaveBeenCalledWith(vrm, { happy: 0.8 });
    expect(applyVrmCustomColors).toHaveBeenCalledWith(vrm, { hair: "#112233" });
    expect(root.rotation.y).toBeCloseTo(0.5, 10);
    expect(mesh.castShadow).toBe(true);
    expect(mesh.receiveShadow).toBe(true);
    expect(mesh.raycast(new THREE.Raycaster(), [])).toBeUndefined();
  });
});
