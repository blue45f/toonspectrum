import { describe, expect, it } from "vitest";
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import {
  EXPRESSION_PRESETS,
  EXTRA_POSE_PRESETS,
  NATURAL_IDLE_POSES,
  naturalIdleSeed,
  pickNaturalIdlePose,
  POSER_FINGER_BONES,
  POSER_KNOWN_BONES,
  RELAXED_FINGER_CURL_MAX_DEG,
  RELAXED_FINGER_CURL_MIN_DEG,
  VRM_STANDARD_EXPRESSIONS,
  type PoseDirectionTarget,
  type PoseVec3,
  type StudioPosePreset,
} from "./studio-pose-presets";
import { POSE_PRESETS } from "./StudioVrmPoser";

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const HEAD_BONES = new Set(["neck", "head"]);
const TORSO_BONES = new Set(["spine", "chest"]);
const ROOT_BONES = new Set(["hips"]);

function directionTuple(direction: PoseDirectionTarget | undefined) {
  if (!direction) return undefined;
  if ("sideX" in direction) return [direction.sideX, direction.y, direction.z ?? 0];
  const [x, y, z] = direction as PoseVec3;
  return [x, y, z];
}

// 오른쪽 본 스펙이 왼쪽의 "완전 미러"인지 판정 — 미러가 아니면 비대칭으로 본다.
// sideX 방향 타깃은 포저가 좌우를 자동 반전하므로 동일 스펙 = 대칭, 회전은 [x, -y, -z] 미러.
function isMirroredPair(pose: StudioPosePreset, leftName: VRMHumanBoneName, rightName: VRMHumanBoneName) {
  const leftSpec = pose.bones[leftName];
  const rightSpec = pose.bones[rightName];
  if (!leftSpec || !rightSpec) return leftSpec === rightSpec;

  const mirrorRotation = (rotation: PoseVec3 | undefined) => (rotation ? [rotation[0], -rotation[1], -rotation[2]] : undefined);
  const leftJson = JSON.stringify({
    direction: directionTuple(leftSpec.direction),
    rotation: mirrorRotation(leftSpec.rotation),
  });
  const rightJson = JSON.stringify({
    direction: directionTuple(rightSpec.direction),
    rotation: rightSpec.rotation ? [...rightSpec.rotation] : undefined,
  });
  return leftJson === rightJson;
}

describe("확장 포즈 프리셋(studio-pose-presets)", () => {
  it("provides at least 20 presets with unique ids that do not collide with builtin poses", () => {
    expect(EXTRA_POSE_PRESETS.length).toBeGreaterThanOrEqual(20);
    const ids = EXTRA_POSE_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const builtinIds = new Set(POSE_PRESETS.map((p) => p.id));
    for (const id of ids) {
      expect(builtinIds.has(id), `builtin collision: ${id}`).toBe(false);
    }
  });

  it("labels every preset with Korean label and tone", () => {
    for (const pose of EXTRA_POSE_PRESETS) {
      expect(pose.label.trim().length).toBeGreaterThan(0);
      expect(pose.tone.trim().length).toBeGreaterThan(0);
    }
  });

  it("only references bones the poser knows how to apply", () => {
    const known = new Set<string>(POSER_KNOWN_BONES);
    for (const pose of EXTRA_POSE_PRESETS) {
      for (const boneName of Object.keys(pose.bones)) {
        expect(known.has(boneName), `${pose.id} uses unknown bone ${boneName}`).toBe(true);
      }
    }
  });

  it("gives every bone spec a usable direction or rotation", () => {
    for (const pose of EXTRA_POSE_PRESETS) {
      for (const [boneName, spec] of Object.entries(pose.bones)) {
        const hasRotation = Array.isArray(spec.rotation) && spec.rotation.length === 3;
        const direction = spec.direction;
        let hasDirection = false;
        if (direction) {
          // Array.isArray는 readonly 튜플(PoseVec3)을 else 분기에서 좁히지 못한다 — `in` 연산자로 유니온을 판별.
          if ("sideX" in direction) {
            hasDirection = Math.hypot(direction.sideX, direction.y, direction.z ?? 0) > 0.01;
          } else {
            const [x, y, z] = direction as PoseVec3;
            hasDirection = Math.hypot(x, y, z) > 0.01;
          }
        }
        expect(hasRotation || hasDirection, `${pose.id}:${boneName} empty spec`).toBe(true);
      }
    }
  });

  it("keeps core rotations within comic-panel safe ranges", () => {
    const violations = EXTRA_POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, spec]) => {
        if (!spec.rotation) return [];
        const limit = HEAD_BONES.has(boneName)
          ? 12
          : TORSO_BONES.has(boneName)
            ? 45
            : ROOT_BONES.has(boneName)
              ? 90
              : null;
        if (limit === null) return [];
        return spec.rotation.flatMap((radians, axis) => {
          const degrees = Math.round(toDegrees(radians));
          return Math.abs(degrees) > limit ? [`${pose.id}:${boneName}:${axis}:${degrees}`] : [];
        });
      })
    );
    expect(violations).toEqual([]);
  });

  it("keeps y-offsets within the poser stage range", () => {
    for (const pose of EXTRA_POSE_PRESETS) {
      expect(Math.abs(pose.yOffset ?? 0), `${pose.id} yOffset`).toBeLessThanOrEqual(0.6);
    }
  });

  it("covers the ComiPo-style staple poses", () => {
    const ids = new Set(EXTRA_POSE_PRESETS.map((p) => p.id));
    for (const required of [
      "xp_idle_relax",
      "xp_hands_on_hips",
      "xp_one_hand_hip",
      "xp_sprint",
      "xp_chair_sit",
      "xp_kneel",
      "xp_finger_heart",
      "xp_double_v",
      "xp_point_you",
      "xp_shock_hands",
      "xp_teary",
      "xp_banzai",
      "xp_guard_up",
      "xp_shrug",
      "xp_phone_look",
      "xp_chin_rest",
      "xp_polite_bow",
      "xp_jump_joy",
      "xp_look_back",
      "xp_lying_down",
    ]) {
      expect(ids.has(required), `missing pose ${required}`).toBe(true);
    }
  });
});

describe("자연 아이들 포즈(NATURAL_IDLE_POSES)", () => {
  const SIDE_PAIRS: ReadonlyArray<readonly [VRMHumanBoneName, VRMHumanBoneName]> = [
    ["leftShoulder", "rightShoulder"],
    ["leftUpperArm", "rightUpperArm"],
    ["leftLowerArm", "rightLowerArm"],
    ["leftHand", "rightHand"],
    ["leftUpperLeg", "rightUpperLeg"],
    ["leftLowerLeg", "rightLowerLeg"],
    ["leftFoot", "rightFoot"],
  ];

  it("provides 3-4 spawn idle variants with unique non-colliding ids", () => {
    expect(NATURAL_IDLE_POSES.length).toBeGreaterThanOrEqual(3);
    expect(NATURAL_IDLE_POSES.length).toBeLessThanOrEqual(4);

    const ids = NATURAL_IDLE_POSES.map((pose) => pose.id);
    expect(new Set(ids).size).toBe(ids.length);

    const otherIds = new Set([...POSE_PRESETS.map((pose) => pose.id), ...EXTRA_POSE_PRESETS.map((pose) => pose.id)]);
    for (const id of ids) {
      expect(otherIds.has(id), `id collision: ${id}`).toBe(false);
    }

    for (const pose of NATURAL_IDLE_POSES) {
      expect(pose.label.trim().length).toBeGreaterThan(0);
      expect(pose.tone.trim().length).toBeGreaterThan(0);
    }
  });

  it("only references bones the poser can apply and keeps rotations in safe ranges", () => {
    const known = new Set<string>(POSER_KNOWN_BONES);
    for (const pose of NATURAL_IDLE_POSES) {
      expect(Math.abs(pose.yOffset ?? 0)).toBeLessThanOrEqual(0.2);
      for (const [boneName, spec] of Object.entries(pose.bones)) {
        expect(known.has(boneName), `${pose.id} uses unknown bone ${boneName}`).toBe(true);
        if (!spec.rotation) continue;
        const limit = HEAD_BONES.has(boneName) ? 12 : TORSO_BONES.has(boneName) ? 45 : ROOT_BONES.has(boneName) ? 90 : 65;
        for (const radians of spec.rotation) {
          expect(Math.abs(toDegrees(radians)), `${pose.id}:${boneName}`).toBeLessThanOrEqual(limit);
        }
      }
    }
  });

  it("builds contrapposto weight-shift with explicit left-right asymmetry", () => {
    for (const pose of NATURAL_IDLE_POSES) {
      // 골반 2~4° 기울임 + 척추/가슴이 반대 방향으로 카운터 회전.
      const hipsRoll = toDegrees(pose.bones.hips?.rotation?.[2] ?? 0);
      expect(Math.abs(hipsRoll), `${pose.id} hips roll`).toBeGreaterThanOrEqual(1.9);
      expect(Math.abs(hipsRoll)).toBeLessThanOrEqual(4.1);

      const counterRoll = toDegrees((pose.bones.spine?.rotation?.[2] ?? 0) + (pose.bones.chest?.rotation?.[2] ?? 0));
      expect(Math.sign(counterRoll), `${pose.id} spine/chest counter`).toBe(-Math.sign(hipsRoll));

      // 머리 2~4° 기울임.
      const headRoll = Math.abs(toDegrees(pose.bones.head?.rotation?.[2] ?? 0));
      expect(headRoll, `${pose.id} head roll`).toBeGreaterThanOrEqual(1.9);
      expect(headRoll).toBeLessThanOrEqual(4.1);

      // 어깨 내림 3~5° (정규화 본: 왼쪽 -z / 오른쪽 +z).
      const leftShoulderRoll = toDegrees(pose.bones.leftShoulder?.rotation?.[2] ?? 0);
      const rightShoulderRoll = toDegrees(pose.bones.rightShoulder?.rotation?.[2] ?? 0);
      expect(leftShoulderRoll, `${pose.id} left shoulder`).toBeLessThanOrEqual(-2.9);
      expect(leftShoulderRoll).toBeGreaterThanOrEqual(-5.1);
      expect(rightShoulderRoll, `${pose.id} right shoulder`).toBeGreaterThanOrEqual(2.9);
      expect(rightShoulderRoll).toBeLessThanOrEqual(5.1);

      // 손목 안쪽 5~8°.
      for (const handName of ["leftHand", "rightHand"] as const) {
        const wristRoll = Math.abs(toDegrees(pose.bones[handName]?.rotation?.[2] ?? 0));
        expect(wristRoll, `${pose.id} ${handName} wrist`).toBeGreaterThanOrEqual(4.9);
        expect(wristRoll).toBeLessThanOrEqual(8.1);
      }

      // 좌우 본 회전 불일치(비대칭 필수) — 미러 대칭 쌍이 아니어야 한다.
      const asymmetricPairs = SIDE_PAIRS.filter(([left, right]) => !isMirroredPair(pose, left, right));
      expect(asymmetricPairs.length, `${pose.id} asymmetric pairs`).toBeGreaterThanOrEqual(4);
      expect(isMirroredPair(pose, "leftLowerArm", "rightLowerArm"), `${pose.id} arms must differ`).toBe(false);
      expect(isMirroredPair(pose, "leftUpperLeg", "rightUpperLeg"), `${pose.id} legs must differ`).toBe(false);
    }
  });

  it("relaxes elbows by 10-18 degrees", () => {
    const angleBetweenDeg = (a: number[], b: number[]) => {
      const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
      const len = Math.hypot(...a) * Math.hypot(...b);
      return (Math.acos(Math.min(1, Math.max(-1, dot / len))) * 180) / Math.PI;
    };

    for (const pose of NATURAL_IDLE_POSES) {
      for (const side of ["left", "right"] as const) {
        const upper = directionTuple(pose.bones[`${side}UpperArm`]?.direction);
        const lower = directionTuple(pose.bones[`${side}LowerArm`]?.direction);
        expect(upper, `${pose.id} ${side} upper arm`).toBeDefined();
        expect(lower, `${pose.id} ${side} lower arm`).toBeDefined();
        if (!upper || !lower) continue;
        const bend = angleBetweenDeg(upper, lower);
        expect(bend, `${pose.id} ${side} elbow bend`).toBeGreaterThanOrEqual(10);
        expect(bend).toBeLessThanOrEqual(18);
      }
    }
  });

  it("includes relaxed finger curls (12-25 degrees) in every idle pose", () => {
    for (const pose of NATURAL_IDLE_POSES) {
      for (const boneName of POSER_FINGER_BONES) {
        const rotation = pose.bones[boneName]?.rotation;
        expect(rotation, `${pose.id} missing finger ${boneName}`).toBeDefined();
        if (!rotation) continue;

        if (boneName.includes("Thumb")) {
          for (const radians of rotation) {
            expect(Math.abs(toDegrees(radians)), `${pose.id}:${boneName}`).toBeLessThanOrEqual(RELAXED_FINGER_CURL_MAX_DEG + 0.1);
          }
          continue;
        }

        // 손바닥 쪽 굽힘 방향: 왼손 -z / 오른손 +z.
        const curlDeg = toDegrees(rotation[2]);
        const signedCurl = boneName.startsWith("left") ? -curlDeg : curlDeg;
        expect(signedCurl, `${pose.id}:${boneName} curl`).toBeGreaterThanOrEqual(RELAXED_FINGER_CURL_MIN_DEG - 0.1);
        expect(signedCurl).toBeLessThanOrEqual(RELAXED_FINGER_CURL_MAX_DEG + 0.1);
      }
    }
  });

  it("picks idle poses deterministically from the character id (no RNG)", () => {
    const sampleIds = [
      "sample-vrm",
      "avatar-a",
      "avatar-b",
      "avatar-c",
      "shion",
      "vivi",
      "vita",
      "rubin",
      "orion",
      "cryptovoxel",
      "meebit",
      "seedsan",
      "shino",
      "fumi",
      "kage",
      "hera",
      "haru",
      "mio",
      "noa",
      "alicia",
    ];

    const firstRun = sampleIds.map((id) => pickNaturalIdlePose(id).id);
    const secondRun = sampleIds.map((id) => pickNaturalIdlePose(id).id);
    expect(secondRun).toEqual(firstRun);

    const validIds = new Set(NATURAL_IDLE_POSES.map((pose) => pose.id));
    for (const poseId of firstRun) {
      expect(validIds.has(poseId)).toBe(true);
    }

    // 캐릭터마다 결정적으로 분산 — 모든 캐릭터가 한 포즈에 몰리면 안 된다.
    expect(new Set(firstRun).size).toBeGreaterThanOrEqual(2);
    expect(naturalIdleSeed("kage")).toBe(naturalIdleSeed("kage"));
    expect(validIds.has(pickNaturalIdlePose("").id)).toBe(true);
  });
});

describe("기존 프리셋 자연화 패스", () => {
  it("keeps intentionally symmetric presets symmetric and naturalized ones asymmetric", () => {
    const byId = new Map(EXTRA_POSE_PRESETS.map((pose) => [pose.id, pose]));

    // 의도적 대칭(만세·양손 브이·공손한 목례)은 좌우 미러 대칭을 유지한다.
    for (const id of ["xp_banzai", "xp_double_v", "xp_polite_bow"]) {
      const pose = byId.get(id);
      expect(pose, `missing pose ${id}`).toBeDefined();
      if (!pose) continue;
      expect(isMirroredPair(pose, "leftUpperArm", "rightUpperArm"), `${id} should stay symmetric`).toBe(true);
      expect(isMirroredPair(pose, "leftLowerArm", "rightLowerArm"), `${id} should stay symmetric`).toBe(true);
    }

    // 자연화 패스가 적용된 프리셋은 좌우 미세 비대칭을 가진다.
    for (const id of ["xp_hands_on_hips", "xp_chair_sit", "xp_kneel", "xp_shock_hands", "xp_teary", "xp_guard_up", "xp_shrug", "xp_jump_joy", "xp_lying_down", "xp_hands_behind"]) {
      const pose = byId.get(id);
      expect(pose, `missing pose ${id}`).toBeDefined();
      if (!pose) continue;
      const asymmetric = !isMirroredPair(pose, "leftUpperArm", "rightUpperArm") || !isMirroredPair(pose, "leftLowerArm", "rightLowerArm");
      expect(asymmetric, `${id} should be micro-asymmetric`).toBe(true);
    }
  });
});

describe("표정 프리셋(EXPRESSION_PRESETS)", () => {
  it("provides at least 12 presets with unique ids", () => {
    expect(EXPRESSION_PRESETS.length).toBeGreaterThanOrEqual(12);
    const ids = EXPRESSION_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("uses only VRM standard expression names with weights in 0..1", () => {
    const standard = new Set(VRM_STANDARD_EXPRESSIONS);
    for (const preset of EXPRESSION_PRESETS) {
      for (const [name, weight] of Object.entries(preset.weights)) {
        expect(standard.has(name), `${preset.id} uses non-standard expression ${name}`).toBe(true);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(1);
      }
    }
  });

  it("labels every preset with Korean label, emoji and tone", () => {
    for (const preset of EXPRESSION_PRESETS) {
      expect(preset.label.trim().length).toBeGreaterThan(0);
      expect(preset.emoji.trim().length).toBeGreaterThan(0);
      expect(preset.tone.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers the requested core emotions", () => {
    const labels = EXPRESSION_PRESETS.map((p) => p.label).join(" ");
    for (const required of ["기쁨", "활짝웃음", "슬픔", "눈물", "분노", "킹받음", "놀람", "멍", "부끄러움", "윙크", "졸림", "무표정"]) {
      expect(labels).toContain(required);
    }
  });
});
