import { describe, expect, it } from "vitest";
import {
  EXPRESSION_PRESETS,
  EXTRA_POSE_PRESETS,
  POSER_KNOWN_BONES,
  VRM_STANDARD_EXPRESSIONS,
  type PoseVec3,
} from "./studio-pose-presets";
import { POSE_PRESETS } from "./StudioVrmPoser";

const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const HEAD_BONES = new Set(["neck", "head"]);
const TORSO_BONES = new Set(["spine", "chest"]);
const ROOT_BONES = new Set(["hips"]);

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
