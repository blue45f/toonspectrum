import { Euler, Quaternion } from "three";
import { describe, expect, it } from "vitest";

import { applyCharacterPoseRuntimeV3, captureCharacterPoseRuntimeV3 } from "../pose-v3/character-pose-runtime-adapter";
import { createAuthoringPoseVrm } from "./__fixtures__/character-authoring-vrm";
import { planCharacterPoseAuthoringInput } from "./character-pose-authoring-input";

const capture = (source: ReturnType<typeof createAuthoringPoseVrm>) => captureCharacterPoseRuntimeV3({
  source, poseId: "pose:before", generationId: 1, includeFingers: true,
});

describe("사진·손 입력의 문서 선계산", () => {
  it("실제 VRM은 바꾸지 않고 새 팔·손가락만 계산한다", () => {
    const source = createAuthoringPoseVrm();
    source.humanoid.getNormalizedBoneNode("leftMiddleProximal")?.rotation.set(0.1, 0.2, 0.35);
    const previous = capture(source);
    const pose = planCharacterPoseAuthoringInput({ source, previous, kind: "photo",
      bones: { leftUpperArm: [0.2, 0.3, 0.4] }, fingers: { leftIndexProximal: [0, 0.1, 0.65] }, confidence: 0.9 });
    expect(capture(source)).toEqual(previous);
    expect(pose.bones.leftMiddleProximal).toEqual(previous.bones.leftMiddleProximal);
    expect(pose.bones.rightIndexProximal).toEqual(previous.bones.rightIndexProximal);
    expect(pose.bones.leftIndexProximal).not.toEqual(previous.bones.leftIndexProximal);
    expect(new Quaternion(...pose.bones.leftUpperArm!).angleTo(new Quaternion().setFromEuler(new Euler(0.2, 0.3, 0.4, "YXZ")))).toBeLessThan(1e-6);
    expect(pose.confidence.overall).toBe(0.9);
    applyCharacterPoseRuntimeV3(source, pose);
    expect(capture(source).bones).toEqual(pose.bones);
  });
  it("잠긴 관절과 인식하지 못한 관절을 보존한다", () => {
    const source = createAuthoringPoseVrm(); const previous = capture(source);
    const pose = planCharacterPoseAuthoringInput({ source, previous, kind: "photo",
      bones: { leftUpperArm: [0.5, 0, 0], rightUpperArm: [0.3, 0, 0] },
      fingers: { leftIndexProximal: [0, 0, 0.5], rightMiddleProximal: [0, 0, 0.5] },
      lockedBones: ["leftUpperArm", "leftIndexProximal"] });
    expect(pose.bones.leftUpperArm).toEqual(previous.bones.leftUpperArm);
    expect(pose.bones.leftIndexProximal).toEqual(previous.bones.leftIndexProximal);
    expect(pose.bones.rightUpperArm).not.toEqual(previous.bones.rightUpperArm);
    expect(pose.sourceWarnings.join(" ")).toContain("잠긴 관절 2개");
    expect(pose.sourceWarnings.join(" ")).toContain("모델에 없는 관절 1개");
  });
  it("비정상 높이·신뢰도·관절은 원본 쓰기 없이 거부한다", () => {
    const source = createAuthoringPoseVrm(); const previous = capture(source);
    const input = { source, previous, kind: "photo" as const, bones: { leftUpperArm: [0.1, 0, 0] as const } };
    expect(() => planCharacterPoseAuthoringInput({ ...input, yOffset: Number.NaN })).toThrow("높이");
    expect(() => planCharacterPoseAuthoringInput({ ...input, confidence: 2 })).toThrow("신뢰도");
    expect(() => planCharacterPoseAuthoringInput({ ...input, bones: { missing: [1, 2, 3] } })).toThrow("잠금 해제 관절");
    expect(capture(source)).toEqual(previous);
  });
  it("일부 손가락만 있던 이전 V3에서도 명시한 회전과 나머지 손을 보존한다", () => {
    const source = createAuthoringPoseVrm(); const previous = capture(source);
    const partial = { ...previous, bones: Object.fromEntries(Object.entries(previous.bones).filter(([name]) => !name.includes("Index"))) };
    const next = planCharacterPoseAuthoringInput({ source, previous: partial, kind: "manual", bones: {}, fingers: { leftIndexProximal: [0, 0, 0.4] } });
    expect(next.bones.rightIndexProximal).toEqual(previous.bones.rightIndexProximal);
    expect(next.bones.leftIndexProximal).not.toEqual(previous.bones.leftIndexProximal);
  });
});
