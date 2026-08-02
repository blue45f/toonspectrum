import * as THREE from "three";

import {
  STUDIO_VRM_BASE_ROTATION_Y_KEY,
  loadStudioVrmAsset,
} from "./studio-vrm-asset-runtime";
import {
  applyBodyScale,
  applyExpressionWeightsToVrm,
  applyFingerRotations,
  applyPoseToVrm,
  applyVrmCustomColors,
  applyVrmMaterialFx,
  type FingerRotationMap,
  type PoseBoneMap,
  type VrmMaterialFx,
} from "./studio-vrm-poser-utils";
import {
  getStoredVrmModelByHash,
  selectableSampleVrmUrl,
} from "./vrm-library";

import type { StudioShared3dCharacterSource } from "./studio-shared-3d-scene-bridge";
import type { VRM } from "@pixiv/three-vrm";

export async function loadStudioBg3dLinkedVrm(
  scene: StudioShared3dCharacterSource["scene"],
): Promise<VRM> {
  if (scene.model.source === "bundled") {
    const url = selectableSampleVrmUrl(scene.model.id);
    if (!url) throw new Error("bundled-model-unavailable");
    return loadStudioVrmAsset(url);
  }

  const stored = await getStoredVrmModelByHash(scene.model.hash);
  if (!stored) throw new Error("attachment-unavailable");
  const objectUrl = URL.createObjectURL(stored.blob);
  try {
    return await loadStudioVrmAsset(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function applyStudioBg3dLinkedCharacterState(
  vrm: VRM,
  source: StudioShared3dCharacterSource,
): boolean {
  const { scene } = source;
  const poseApplied = applyPoseToVrm(
    vrm,
    scene.pose.bones as PoseBoneMap,
    scene.pose.yOffset,
    scene.pose.translations,
  );
  if (!poseApplied) return false;

  applyFingerRotations(vrm, scene.pose.fingerOverrides as FingerRotationMap);
  applyBodyScale(vrm, scene.appearance.bodyScale);
  applyExpressionWeightsToVrm(vrm, { ...scene.expressions });
  applyVrmCustomColors(vrm, { ...scene.appearance.customColors });
  applyVrmMaterialFx(vrm, scene.appearance.materialFx as VrmMaterialFx);

  const baseRotationY = vrm.scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY];
  vrm.scene.rotation.y =
    (typeof baseRotationY === "number" && Number.isFinite(baseRotationY) ? baseRotationY : 0) +
    scene.pose.bodyRotationY;
  vrm.scene.name = `ToonSpectrumSharedCharacter:${source.elementId}`;
  vrm.scene.userData.studioShared3dCharacterElementId = source.elementId;
  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Linked characters are read-only in the background stage. Pointer hits pass through to
    // editable BG3D nodes until a shared transform transaction is introduced.
    mesh.raycast = () => undefined;
  });
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return true;
}
