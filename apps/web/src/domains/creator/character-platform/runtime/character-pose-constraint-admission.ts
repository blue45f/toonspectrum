import { Quaternion, Vector3 } from "three";

import { isStudioHumanoidBoneName } from "../../studio-humanoid-bones";
import { applyCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { createCharacterPoseEvaluationVrm } from "./character-pose-preset-document";

import type { VRM } from "@pixiv/three-vrm";
import type { CharacterPoseDocumentV3 } from "../pose-v3/character-pose-v3";

/** 고정된 접점과 컨트롤을 벗어난 외부 포즈는 원본에 확정하지 않는다. */
export function assertCharacterPoseConstraintAdmission(source: VRM, previous: CharacterPoseDocumentV3, candidate: CharacterPoseDocumentV3): void {
  if (!previous.fixedControllers.length && !previous.contacts.some((contact) => contact.mode === "hard-pin" && contact.weight > 0)) return;
  const rig = createCharacterPoseEvaluationVrm(source, previous);
  applyCharacterPoseRuntimeV3(rig, previous);
  const positions = new Map(previous.fixedControllers.flatMap((control) => {
    if (!isStudioHumanoidBoneName(control.bone) || !control.lockPosition) return [];
    const bone = rig.humanoid.getNormalizedBoneNode(control.bone);
    return bone ? [[control.bone, bone.getWorldPosition(new Vector3())] as const] : [];
  }));
  applyCharacterPoseRuntimeV3(rig, candidate);
  for (const control of previous.fixedControllers) {
    if (!isStudioHumanoidBoneName(control.bone)) throw new Error("고정한 관절을 확인할 수 없습니다.");
    const node = rig.humanoid.getNormalizedBoneNode(control.bone);
    if (!node) throw new Error(`${control.bone}: 고정한 관절이 모델에 없습니다.`);
    const before = previous.bones[control.bone];
    const after = candidate.bones[control.bone];
    if (control.lockRotation && before && after && new Quaternion(...before).angleTo(new Quaternion(...after)) > 1e-6) {
      throw new Error(`${control.bone}: 회전이 고정된 관절을 변경할 수 없습니다.`);
    }
    const position = positions.get(control.bone);
    if (control.lockPosition && (!position || node.getWorldPosition(new Vector3()).distanceTo(position) > 0.01)) {
      throw new Error(`${control.bone}: 위치 고정을 벗어나는 포즈입니다. 포즈 도구에서 접점을 조정해 주세요.`);
    }
  }
  for (const contact of previous.contacts) {
    if (contact.mode !== "hard-pin" || contact.weight <= 0) continue;
    if (!isStudioHumanoidBoneName(contact.bone)) throw new Error("접점의 관절을 확인할 수 없습니다.");
    const node = rig.humanoid.getNormalizedBoneNode(contact.bone);
    if (!node || node.getWorldPosition(new Vector3()).distanceTo(new Vector3(...contact.target)) > contact.tolerance + 1e-6) {
      throw new Error(`${contact.bone}: 고정 접점을 벗어나는 포즈입니다. 포즈 도구에서 먼저 조정해 주세요.`);
    }
  }
}
