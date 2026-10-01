import { describe, expect, it } from "vitest";

import { FINGER_BONE_NAMES, LEFT_FINGER_BONE_NAMES, RIGHT_FINGER_BONE_NAMES } from "../../contracts/bones";
import { isUnitQuat } from "../../contracts/pose";
import { SLOT_PRESET_IDS } from "../../contracts/preset-vocabulary";
import { poseLimitViolations } from "../joint-limits";
import { poseHash } from "../pose-blend";
import { createReferenceSkeleton } from "../reference-skeleton";
import { computeWorldTransforms } from "../skeleton-fk";

import { findHandPosePreset, HAND_POSE_PRESETS } from "./hand-pose-presets";

const skeleton = createReferenceSkeleton();

describe("HAND_POSE_PRESETS", () => {
  it("8개이며 어휘 id와 1:1(순서 포함)", () => {
    expect(HAND_POSE_PRESETS).toHaveLength(8);
    expect(HAND_POSE_PRESETS.map((p) => p.id)).toEqual(SLOT_PRESET_IDS["hand-pose"].map((n) => `hand-pose/${n}`));
  });

  it("손가락 본만 담고(좌는 좌, 우는 우), 단위 쿼터니언이며 관절 제한 안이다", () => {
    const left = new Set<string>(LEFT_FINGER_BONE_NAMES);
    const right = new Set<string>(RIGHT_FINGER_BONE_NAMES);
    const fingers = new Set<string>(FINGER_BONE_NAMES);
    for (const preset of HAND_POSE_PRESETS) {
      for (const [bone, q] of Object.entries(preset.left)) {
        expect(left.has(bone), `${preset.id} left ${bone}`).toBe(true);
        expect(isUnitQuat(q ?? [0, 0, 0, 0])).toBe(true);
      }
      for (const [bone, q] of Object.entries(preset.right)) {
        expect(right.has(bone), `${preset.id} right ${bone}`).toBe(true);
        expect(isUnitQuat(q ?? [0, 0, 0, 0])).toBe(true);
      }
      for (const bone of [...Object.keys(preset.left), ...Object.keys(preset.right)]) expect(fingers.has(bone)).toBe(true);
      expect(poseLimitViolations({ ...preset.left, ...preset.right }, skeleton), preset.id).toEqual([]);
      expect(preset.labelKo).toMatch(/[가-힣]/u);
    }
  });

  it("서로 다르고 좌우가 거울 대칭이다", () => {
    const hashes = new Set(HAND_POSE_PRESETS.map((p) => poseHash({ ...p.left, ...p.right })));
    expect(hashes.size).toBe(8);
    for (const preset of HAND_POSE_PRESETS) {
      const t = computeWorldTransforms(skeleton, { ...preset.left, ...preset.right });
      for (const bone of LEFT_FINGER_BONE_NAMES) {
        const mirror = `right${bone.slice(4)}`;
        const l = t.get(bone)?.position ?? [0, 0, 0];
        const r = t.get(mirror)?.position ?? [0, 0, 0];
        expect(r[0], `${preset.id} ${bone}`).toBeCloseTo(-l[0], 6);
        expect(r[1]).toBeCloseTo(l[1], 6);
        expect(r[2]).toBeCloseTo(l[2], 6);
      }
    }
  });

  it("주먹은 손끝이 손바닥 쪽으로 말리고, 펼친 손은 곧게 뻗는다", () => {
    const rest = computeWorldTransforms(skeleton, {});
    const fist = computeWorldTransforms(skeleton, findHandPosePreset("fist").left);
    const open = computeWorldTransforms(skeleton, findHandPosePreset("open").left);
    const hand = rest.get("leftHand")?.position ?? [0, 0, 0];
    const tipRest = rest.get("leftIndexDistal")?.position ?? [0, 0, 0];
    const tipFist = fist.get("leftIndexDistal")?.position ?? [0, 0, 0];
    const tipOpen = open.get("leftIndexDistal")?.position ?? [0, 0, 0];
    // 주먹: 손끝이 손목에 가까워지고 손바닥(-Y) 쪽으로 내려간다
    expect(Math.hypot(tipFist[0] - hand[0], tipFist[1] - hand[1])).toBeLessThan(Math.hypot(tipRest[0] - hand[0], tipRest[1] - hand[1]) * 0.7);
    expect(tipFist[1]).toBeLessThan(tipRest[1]);
    // 펼침: 손끝 높이는 rest와 같고(굴곡 0) 벌림으로 z만 바뀐다
    expect(tipOpen[1]).toBeCloseTo(tipRest[1], 6);
    expect(tipOpen[2]).toBeGreaterThan(tipRest[2]);
    // 가리키기: 검지만 펴진다
    const point = computeWorldTransforms(skeleton, findHandPosePreset("point").left);
    expect(point.get("leftIndexDistal")?.position[1]).toBeCloseTo(tipRest[1], 6);
    expect(point.get("leftMiddleDistal")?.position[1]).toBeLessThan(tipRest[1] - 0.02);
  });
});
