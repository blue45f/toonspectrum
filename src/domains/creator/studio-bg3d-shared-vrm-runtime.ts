import * as THREE from "three";

import {
  STUDIO_VRM_BASE_ROTATION_Y_KEY,
  loadStudioVrmAsset,
} from "./studio-vrm-asset-runtime";
import { resolveStudioVrmFingerAuthority } from "./studio-vrm-auto-grip-authority";
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
  createAutoGripFingerOverrides,
  inspectAutoGripReadiness,
  type VrmPropRigMetrics,
} from "./studio-vrm-prop-rig";
import { propDefById } from "./studio-vrm-props";
import { STUDIO_VRM_FINGER_BONES } from "./studio-vrm-scene-document";
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
  options: Readonly<{
    propRigMetrics?: VrmPropRigMetrics;
    projectHandProps?: boolean;
  }> = {},
): boolean {
  const { scene } = source;
  const [stageX, stageY, stageZ] = source.stageTransform.position;
  const poseApplied = applyPoseToVrm(
    vrm,
    scene.pose.bones as PoseBoneMap,
    stageY,
    {
      ...scene.pose.translations,
      root: [stageX, 0, stageZ],
    },
  );
  if (!poseApplied) return false;

  const handProps = source.compatibility.appearanceProjection.handProps;
  const projectedProps = options.projectHandProps !== false && handProps.status === "supported"
    ? handProps.props.map((prop) => prop.instance)
    : [];
  const authoredFingers = scene.pose.fingerOverrides as FingerRotationMap;
  let effectiveFingers = authoredFingers;
  if (options.propRigMetrics) {
    const autoGripItems = projectedProps.filter((item) => item.rig?.autoFingerPose === true);
    if (autoGripItems.some((item) => (
      inspectAutoGripReadiness(
        item,
        projectedProps,
        propDefById,
        options.propRigMetrics,
      ).kind !== "ready"
    ))) return false;

    const autoGrip = createAutoGripFingerOverrides(
      projectedProps,
      propDefById,
      options.propRigMetrics,
    );
    const requiredHands = new Set<"left" | "right">();
    for (const item of autoGripItems) {
      if (item.bone === "leftHand") requiredHands.add("left");
      if (item.bone === "rightHand") requiredHands.add("right");
      const secondary = item.rig?.secondary;
      if (secondary?.enabled && secondary.influence > 0) {
        requiredHands.add(secondary.bone === "leftHand" ? "left" : "right");
      }
    }
    for (const hand of requiredHands) {
      const prefix = hand === "left" ? "left" : "right";
      const complete = STUDIO_VRM_FINGER_BONES
        .filter((bone) => bone.startsWith(prefix))
        .every((bone) => autoGrip[bone] !== undefined);
      if (!complete) return false;
    }
    effectiveFingers = resolveStudioVrmFingerAuthority(authoredFingers, autoGrip);
  } else if (projectedProps.some((item) => item.rig?.autoFingerPose === true)) {
    return false;
  }
  applyFingerRotations(vrm, effectiveFingers);
  applyBodyScale(vrm, scene.appearance.bodyScale);
  applyExpressionWeightsToVrm(vrm, { ...scene.expressions });
  applyVrmCustomColors(vrm, { ...scene.appearance.customColors });
  applyVrmMaterialFx(vrm, scene.appearance.materialFx as VrmMaterialFx);

  const baseRotationY = vrm.scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY];
  vrm.scene.rotation.y =
    (typeof baseRotationY === "number" && Number.isFinite(baseRotationY) ? baseRotationY : 0) +
    source.stageTransform.rotationY;
  vrm.scene.name = `ToonSpectrumSharedCharacter:${source.elementId}`;
  vrm.scene.userData.studioShared3dCharacterElementId = source.elementId;
  vrm.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // One bounded root proxy owns character selection. Internal face, hair and garment meshes stay
    // pass-through so transparent or oversized geometry cannot steal picks from the background.
    mesh.raycast = () => undefined;
  });
  vrm.update(0);
  vrm.scene.updateMatrixWorld(true);
  return true;
}
