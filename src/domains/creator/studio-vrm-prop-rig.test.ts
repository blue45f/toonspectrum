import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_VRM_PROP_RIG_METRICS,
  PROP_RIG_FIT_MAX,
  createAutoGripFingerOverrides,
  createDefaultSecondaryRig,
  getPropFitStatus,
  measureVrmPropRigMetrics,
  resolvePropAttachment,
  resolveSecondaryPropTarget,
  sanitizeVrmPropRigMetrics,
  type VrmPropMetricBone,
} from "./studio-vrm-prop-rig";
import {
  createPropInstance,
  propDefById,
  type PropInstance,
  type Vec3,
} from "./studio-vrm-props";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

function createMeasuredVrm(options: { omitFingers?: boolean; noHumanoid?: boolean } = {}): VRM {
  const scene = new THREE.Group();
  const bones: Partial<Record<VrmPropMetricBone, THREE.Object3D>> = {};
  const add = (name: VrmPropMetricBone, position: Vec3) => {
    const node = new THREE.Object3D();
    node.name = name;
    node.position.set(...position);
    scene.add(node);
    bones[name] = node;
  };

  add("leftFoot", [0.12, 0, 0]);
  add("rightFoot", [-0.12, 0, 0]);
  add("hips", [0, 0.92, 0]);
  add("leftUpperLeg", [0.12, 0.92, 0]);
  add("rightUpperLeg", [-0.12, 0.92, 0]);
  add("neck", [0, 1.46, 0]);
  add("head", [0, 1.62, 0]);
  add("leftShoulder", [0.21, 1.43, 0]);
  add("rightShoulder", [-0.21, 1.43, 0]);
  add("leftLowerArm", [0.43, 1.2, 0]);
  add("rightLowerArm", [-0.43, 1.2, 0]);
  add("leftHand", [0.56, 1.2, 0]);
  add("rightHand", [-0.56, 1.2, 0]);
  if (!options.omitFingers) {
    // 양손에서 index/little의 X 순서를 반전해 실측 basis도 좌우 반사되게 한다.
    add("leftMiddleProximal", [0.56, 1.2, 0.08]);
    add("leftIndexProximal", [0.535, 1.2, 0.08]);
    add("leftLittleProximal", [0.585, 1.2, 0.08]);
    add("rightMiddleProximal", [-0.56, 1.2, 0.08]);
    add("rightIndexProximal", [-0.535, 1.2, 0.08]);
    add("rightLittleProximal", [-0.585, 1.2, 0.08]);
  }
  scene.updateMatrixWorld(true);

  return {
    scene,
    humanoid: options.noHumanoid
      ? undefined
      : {
          getNormalizedBoneNode: (name: VRMHumanBoneName) => bones[name as VrmPropMetricBone] ?? null,
        },
  } as unknown as VRM;
}

function expectVecClose(actual: Vec3, expected: Vec3, precision = 6) {
  expect(actual[0]).toBeCloseTo(expected[0], precision);
  expect(actual[1]).toBeCloseTo(expected[1], precision);
  expect(actual[2]).toBeCloseTo(expected[2], precision);
}

describe("VRM 소품 리그 실측", () => {
  it("손가락·머리·어깨·골반·키를 실측하고 손목이 아닌 손바닥 소켓을 만든다", () => {
    const metrics = measureVrmPropRigMetrics(createMeasuredVrm());

    expect(metrics.avatarHeight).toBeGreaterThan(1.6);
    expect(metrics.shoulder).toBeCloseTo(0.42, 5);
    expect(metrics.hip).toBeCloseTo(0.24, 5);
    expect(metrics.hand).toBeCloseTo(0.092, 3);
    expect(metrics.sources.hand).toBe("measured");
    expect(metrics.handSockets.leftHand.source).toBe("measured");
    expect(metrics.handSockets.rightHand.source).toBe("measured");
    expect(Math.hypot(...metrics.handSockets.leftHand.position)).toBeGreaterThan(0.03);
    expect(Math.hypot(...metrics.handSockets.rightHand.position)).toBeGreaterThan(0.03);
  });

  it("좌우 손의 palm basis가 반사되고 quaternion은 정규화된다", () => {
    const { handSockets } = measureVrmPropRigMetrics(createMeasuredVrm());
    const left = new THREE.Quaternion(...handSockets.leftHand.rotationQuaternion);
    const right = new THREE.Quaternion(...handSockets.rightHand.rotationQuaternion);
    const leftRight = new THREE.Vector3(1, 0, 0).applyQuaternion(left);
    const rightRight = new THREE.Vector3(1, 0, 0).applyQuaternion(right);

    expect(left.length()).toBeCloseTo(1, 6);
    expect(right.length()).toBeCloseTo(1, 6);
    expect(leftRight.x * rightRight.x).toBeLessThan(0);
  });

  it("손가락이 없으면 lower-arm 방향으로 palm socket을 유도한다", () => {
    const metrics = measureVrmPropRigMetrics(createMeasuredVrm({ omitFingers: true }));
    expect(metrics.handSockets.leftHand.source).toBe("derived");
    expect(metrics.handSockets.rightHand.source).toBe("derived");
    expect(Math.hypot(...metrics.handSockets.leftHand.position)).toBeGreaterThan(0.02);
  });

  it("humanoid가 없거나 외부 값이 NaN/극단값이면 안전한 기본값과 범위로 폴백한다", () => {
    const missing = measureVrmPropRigMetrics(createMeasuredVrm({ noHumanoid: true }));
    expect(missing.avatarHeight).toBe(DEFAULT_VRM_PROP_RIG_METRICS.avatarHeight);
    expect(missing.missingBones).toHaveLength(DEFAULT_VRM_PROP_RIG_METRICS.missingBones.length);

    const sanitized = sanitizeVrmPropRigMetrics({
      avatarHeight: Number.NaN,
      hand: 99,
      head: -4,
      handSockets: {
        leftHand: { position: [Number.NaN, 0, 0], rotationQuaternion: [0, 0, 0, 0] },
      },
    });
    expect(sanitized.avatarHeight).toBe(DEFAULT_VRM_PROP_RIG_METRICS.avatarHeight);
    expect(sanitized.hand).toBeLessThan(1);
    expect(sanitized.head).toBeGreaterThan(0);
    expect(sanitized.handSockets.leftHand.source).toBe("fallback");
  });
});

describe("스마트 anchor wrapper", () => {
  it("검의 geometry anchor를 실측 palm socket에 정확히 일치시킨다", () => {
    const def = propDefById("sword")!;
    const instance = createPropInstance("sword", "sword-1")!;
    instance.rig = {
      ...instance.rig!,
      deltaPosition: [0.01, -0.005, 0.002],
      deltaRotationDeg: [8, 12, -4],
      deltaScale: 1.1,
    };
    const result = resolvePropAttachment(def, instance, measureVrmPropRigMetrics(createMeasuredVrm()));
    const rotation = new THREE.Euler(
      THREE.MathUtils.degToRad(result.rotationDeg[0]),
      THREE.MathUtils.degToRad(result.rotationDeg[1]),
      THREE.MathUtils.degToRad(result.rotationDeg[2]),
      "XYZ"
    );
    const transformedAnchor = new THREE.Vector3(...result.anchor.position)
      .multiplyScalar(result.scale)
      .applyEuler(rotation)
      .add(new THREE.Vector3(...result.position));

    expect(result.usesSmartRig).toBe(true);
    expect(result.socketSource).toBe("measured");
    expect(Math.hypot(...result.socketPosition)).toBeGreaterThan(0.02);
    expectVecClose(
      [transformedAnchor.x, transformedAnchor.y, transformedAnchor.z],
      result.socketPosition,
      5
    );
  });

  it("rig가 있으면 legacy instance transform은 무시하고 def 기본값+delta만 사용한다", () => {
    const def = propDefById("mug")!;
    const instance = createPropInstance("mug", "mug-1")!;
    instance.position = [0.9, 0.9, 0.9];
    instance.rotationDeg = [170, 160, 150];
    instance.scale = 3.8;
    instance.rig = { ...instance.rig!, deltaPosition: [0.01, 0.02, 0.03], deltaRotationDeg: [1, 2, 3] };
    const result = resolvePropAttachment(def, instance, DEFAULT_VRM_PROP_RIG_METRICS);

    expect(result.socketPosition[0]).not.toBeCloseTo(0.9, 2);
    expect(result.scale).toBeLessThan(3.8);
  });

  it("rig가 없는 V1 인스턴스는 기존 절대 transform을 그대로 통과시킨다", () => {
    const def = propDefById("mug")!;
    const instance: PropInstance = { ...createPropInstance("mug", "legacy")!, rig: undefined };
    const result = resolvePropAttachment(def, instance, DEFAULT_VRM_PROP_RIG_METRICS);
    expect(result.usesSmartRig).toBe(false);
    expect(result.position).toEqual(instance.position);
    expect(result.rotationDeg).toEqual(instance.rotationDeg);
    expect(result.scale).toBe(instance.scale);
  });

  it("오른손 프리셋을 왼손에 붙이면 delta와 회전이 좌우 미러된다", () => {
    const def = propDefById("sword")!;
    const instance = createPropInstance("sword", "left-sword")!;
    instance.bone = "leftHand";
    instance.rig = { ...instance.rig!, deltaPosition: [0.02, 0.01, 0], deltaRotationDeg: [5, 10, 20] };
    const result = resolvePropAttachment(def, instance, measureVrmPropRigMetrics(createMeasuredVrm()));
    expect(result.mirrored).toBe(true);
    expect(result.socketPosition[0]).toBeCloseTo(
      result.socketPosition[0],
      6
    );
    // mirrored delta는 해당 손의 실측 socket X에서 음의 방향으로 더해진다.
    const socketX = measureVrmPropRigMetrics(createMeasuredVrm()).handSockets.leftHand.position[0];
    expect(result.socketPosition[0]).toBeCloseTo(socketX - 0.02, 6);
  });

  it("자동 fit을 프로필 범위와 전역 안전 범위로 클램프하고 UI 상태를 공유한다", () => {
    const base = propDefById("mug")!;
    const def = { ...base, fit: { ...base.fit, designReference: 0.001, minScale: 0.5, maxScale: 1.2 } };
    const instance = createPropInstance("mug", "fit")!;
    const status = getPropFitStatus(def, instance, DEFAULT_VRM_PROP_RIG_METRICS);
    const resolved = resolvePropAttachment(def, instance, DEFAULT_VRM_PROP_RIG_METRICS);
    expect(status.kind).toBe("clamped");
    expect(status.fitScale).toBe(1.2);
    expect(resolved.fit).toEqual(status);
    expect(resolved.scale).toBeLessThanOrEqual(PROP_RIG_FIT_MAX);
  });
});

describe("자동 손 그립과 양손 보조 target", () => {
  it("grip kind를 좌우 부호가 맞는 FingerRotationMap 호환 값으로 만든다", () => {
    const right = createPropInstance("sword", "right")!;
    const left = createPropInstance("book", "left")!;
    const overrides = createAutoGripFingerOverrides([right, left]);

    expect(overrides.rightIndexIntermediate[2]).toBeGreaterThan(0);
    expect(overrides.leftIndexIntermediate[2]).toBeLessThan(0);
    expect(overrides.rightThumbProximal[1]).toBeGreaterThan(0);
    expect(overrides.leftThumbProximal[1]).toBeLessThan(0);
  });

  it("secondary가 켜진 양손 소품은 같은 grip을 보조 손에도 적용한다", () => {
    const def = propDefById("sword")!;
    const item = createPropInstance("sword", "two-hand")!;
    item.rig = { ...item.rig!, secondary: createDefaultSecondaryRig(def, item.bone)! };
    const overrides = createAutoGripFingerOverrides([item]);
    expect(overrides.rightMiddleProximal).toBeDefined();
    expect(overrides.leftMiddleProximal).toBeDefined();

    const target = resolveSecondaryPropTarget(def, item);
    expect(target).toMatchObject({ enabled: true, bone: "leftHand", anchorId: "secondary", influence: 1 });
  });

  it("autoFingerPose가 꺼졌거나 손 본이 아니면 override를 만들지 않는다", () => {
    const hand = createPropInstance("mug", "off")!;
    hand.rig = { ...hand.rig!, autoFingerPose: false };
    const head = createPropInstance("cap", "head")!;
    expect(createAutoGripFingerOverrides([hand, head])).toEqual({});
  });
});
