import { describe, expect, it } from "vitest";

import { FINGER_BONE_NAMES, isHumanoidBoneName, POSE_SCOPES } from "../../contracts/bones";
import { isUnitQuat } from "../../contracts/pose";
import { SLOT_PRESET_IDS } from "../../contracts/preset-vocabulary";
import { poseLimitViolations } from "../joint-limits";
import { poseHash } from "../pose-blend";
import { createReferenceSkeleton } from "../reference-skeleton";
import { computeWorldTransforms } from "../skeleton-fk";

import { findPosePreset, POSE_PRESETS } from "./pose-presets";

const skeleton = createReferenceSkeleton();

describe("POSE_PRESETS", () => {
  it("10개이며 어휘 id와 1:1(순서 포함), 스코프는 POSE_SCOPES 안", () => {
    expect(POSE_PRESETS).toHaveLength(10);
    expect(POSE_PRESETS.map((p) => p.id)).toEqual(SLOT_PRESET_IDS.pose.map((n) => `pose/${n}`));
    for (const preset of POSE_PRESETS) {
      expect(POSE_SCOPES).toContain(preset.scope);
      expect(preset.labelKo).toMatch(/[가-힣]/u);
    }
  });

  it("모든 본 이름은 어휘 안, 손가락 본은 없고, 쿼터니언은 단위이며 관절 제한 안이다", () => {
    const fingers = new Set<string>(FINGER_BONE_NAMES);
    for (const preset of POSE_PRESETS) {
      for (const [bone, q] of Object.entries(preset.pose)) {
        expect(isHumanoidBoneName(bone)).toBe(true);
        expect(fingers.has(bone)).toBe(false);
        expect(isUnitQuat(q ?? [0, 0, 0, 0])).toBe(true);
      }
      expect(poseLimitViolations(preset.pose, skeleton), preset.id).toEqual([]);
    }
  });

  it("서로 다른 포즈다(해시 상이), t-pose는 rest", () => {
    const hashes = new Set(POSE_PRESETS.map((p) => poseHash(p.pose)));
    expect(hashes.size).toBe(10);
    expect(findPosePreset("t-pose").pose).toEqual({});
  });

  it("FK로 본 주요 관절 위치가 자연스럽다(손 흔들기 손은 머리 위, 가리키기 손은 앞, 앉기 무릎은 앞)", () => {
    const pos = (name: string, bone: string): readonly [number, number, number] =>
      computeWorldTransforms(skeleton, findPosePreset(name as "idle").pose).get(bone)?.position ?? [0, 0, 0];
    const head = pos("wave", "head");
    expect(pos("wave", "rightHand")[1]).toBeGreaterThan(head[1]);
    expect(pos("point", "rightHand")[2]).toBeGreaterThan(0.35);
    expect(pos("sit", "leftLowerLeg")[2]).toBeGreaterThan(0.3);
    expect(pos("sit", "leftLowerLeg")[1]).toBeGreaterThan(0.8);
    // 팔짱: 양손이 몸 중심선을 넘어 반대편으로 간다
    expect(pos("arms-crossed", "leftHand")[0]).toBeLessThan(0);
    expect(pos("arms-crossed", "rightHand")[0]).toBeGreaterThan(0);
    // 허리에 손: 손이 엉덩이 높이 근처
    expect(Math.abs(pos("hands-on-hips", "leftHand")[1] - 1.0)).toBeLessThan(0.08);
    expect(Math.abs(pos("hands-on-hips", "rightHand")[1] - 1.0)).toBeLessThan(0.08);
    // 좌우 대칭 프리셋은 대칭이다
    const l = pos("a-pose", "leftHand");
    const r = pos("a-pose", "rightHand");
    expect(r[0]).toBeCloseTo(-l[0], 9);
    expect(r[1]).toBeCloseTo(l[1], 9);
    // idle은 손이 허벅지 옆 아래
    expect(pos("idle", "leftHand")[1]).toBeLessThan(1.0);
  });
});
