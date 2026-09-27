/** @vitest-environment jsdom */

import { act, cleanup, render } from "@testing-library/react";
import { useEffect } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import { afterEach, describe, expect, it } from "vitest";

import { applyStudioVrmNormalizedFingerPose } from "../../vrm/studio-vrm-normalized-finger-pose";
import { createAuthoringPoseVrm } from "../runtime/__fixtures__/character-authoring-vrm";
import { assertCharacterPoseConstraintAdmission } from "../runtime/character-pose-constraint-admission";
import { captureCharacterPoseRuntimeV3 } from "./character-pose-runtime-adapter";
import { useCharacterNormalizedFingers } from "./use-character-normalized-fingers";

import type { CharacterPoseDocumentV3 } from "./character-pose-v3";

afterEach(cleanup);

describe("정규화 손가락의 원본 재생", () => {
  it("호환 Actor의 자식 effect 뒤에 V3의 실제 회전을 복원한다", () => {
    const vrm = createAuthoringPoseVrm();
    const node = vrm.humanoid.getNormalizedBoneNode("leftIndexProximal")!;
    const pose = captureCharacterPoseRuntimeV3({ source: vrm, poseId: "finger:test", generationId: 1, includeFingers: true });
    const q = new Quaternion().setFromEuler(new Euler(0.1, 0.2, 0.4));
    const target: CharacterPoseDocumentV3 = { ...pose, bones: { ...pose.bones, leftIndexProximal: q.toArray() } };
    function NativeActor() { useEffect(() => { node.rotation.set(0, 0, -0.8); }); return null; }
    function Host({ tracking }: { tracking: boolean }) {
      useCharacterNormalizedFingers({ vrm, pose: target, enabled: true, tracking });
      return <NativeActor />;
    }
    const view = render(<Host tracking={false} />);
    expect(node.quaternion.angleTo(q)).toBeLessThan(1e-6);
    view.rerender(<Host tracking={false} />);
    expect(node.quaternion.angleTo(q)).toBeLessThan(1e-6);
    view.rerender(<Host tracking />);
    expect(node.rotation.z).toBeCloseTo(-0.8);
    view.rerender(<Host tracking={false} />);
    expect(node.quaternion.angleTo(q)).toBeLessThan(1e-6);
  });
  it("잘못된 후속 관절 때문에 앞 관절만 변경되는 부분 적용을 막는다", () => {
    const vrm = createAuthoringPoseVrm();
    const node = vrm.humanoid.getNormalizedBoneNode("leftIndexProximal")!;
    const before = node.quaternion.toArray();
    expect(applyStudioVrmNormalizedFingerPose(vrm.humanoid, {
      leftIndexProximal: [0.1, 0.2, 0.3, 1], rightMiddleDistal: [0, 0, 0, 1],
    })).toBe(false);
    expect(node.quaternion.toArray()).toEqual(before);
    expect(applyStudioVrmNormalizedFingerPose(vrm.humanoid, { head: [0, 0, 0, 1] })).toBe(false);
    expect(applyStudioVrmNormalizedFingerPose(vrm.humanoid, { leftIndexProximal: [0, 0, 0, 0] })).toBe(false);
  });
  it("위치 고정과 hard-pin을 위반하는 포즈를 원본 변경 없이 거부한다", () => {
    const vrm = createAuthoringPoseVrm();
    const before = captureCharacterPoseRuntimeV3({ source: vrm, poseId: "constraints:test", generationId: 0 });
    const hand = vrm.humanoid.getNormalizedBoneNode("leftHand")!.getWorldPosition(new Vector3());
    const previous: CharacterPoseDocumentV3 = { ...before,
      fixedControllers: [{ id: "lock-hand", bone: "leftHand", lockPosition: true, lockRotation: false }],
      contacts: [{ id: "contact-hand", bone: "leftHand", kind: "prop", mode: "hard-pin", target: hand.toArray(), tolerance: 0.01, weight: 1 }] };
    expect(() => assertCharacterPoseConstraintAdmission(vrm, previous, previous)).not.toThrow();
    const candidate: CharacterPoseDocumentV3 = { ...previous, bones: { ...previous.bones,
      leftUpperArm: new Quaternion().setFromEuler(new Euler(0, 0, 0.6)).toArray() } };
    expect(() => assertCharacterPoseConstraintAdmission(vrm, previous, candidate)).toThrow("위치 고정");
    expect(() => assertCharacterPoseConstraintAdmission(vrm, { ...previous, fixedControllers: [] }, candidate)).toThrow("고정 접점");
    act(() => { expect(captureCharacterPoseRuntimeV3({ source: vrm, poseId: before.poseId, generationId: 0 })).toEqual(before); });
  });
});
