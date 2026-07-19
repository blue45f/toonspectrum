import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  STUDIO_HUMANOID_BONE_NAMES,
  studioHumanoidBonesForScope,
  type StudioHumanoidBoneName,
} from "./studio-humanoid-bones";
import {
  parseStudioPoseMaterial,
  STUDIO_POSE_MATERIAL_KIND,
  STUDIO_POSE_MATERIAL_VERSION,
  STUDIO_POSE_ROTATION_CONVENTION,
  type StudioPoseMaterial,
} from "./studio-pose-material";
import {
  applyStudioVrmPoseMaterial,
  captureStudioVrmPoseMaterial,
  type StudioVrmPoseMaterialRuntime,
} from "./studio-vrm-pose-material-adapter";

import type { VRMPose } from "@pixiv/three-vrm";

type QuaternionTuple = [number, number, number, number];

interface FakeRuntimeOptions {
  readonly bones?: readonly StudioHumanoidBoneName[];
  readonly rotations?: Partial<Record<StudioHumanoidBoneName, QuaternionTuple>>;
  readonly restRotations?: Partial<Record<StudioHumanoidBoneName, QuaternionTuple>>;
  readonly throwAfterFirstMutation?: boolean;
}

function copyQuaternion(rotation: readonly number[]): QuaternionTuple {
  return [rotation[0]!, rotation[1]!, rotation[2]!, rotation[3]!];
}

function createRuntime(options: FakeRuntimeOptions = {}) {
  const boneNames = options.bones ?? STUDIO_HUMANOID_BONE_NAMES;
  const nodes = new Map<StudioHumanoidBoneName, THREE.Object3D>();
  const pose: VRMPose = {};
  const restRotations = new Map<StudioHumanoidBoneName, THREE.Quaternion>();
  for (const bone of boneNames) {
    const node = new THREE.Object3D();
    const rest = new THREE.Quaternion().fromArray(options.restRotations?.[bone] ?? [0, 0, 0, 1]);
    const delta = new THREE.Quaternion().fromArray(options.rotations?.[bone] ?? [0, 0, 0, 1]);
    node.quaternion.copy(delta).multiply(rest);
    nodes.set(bone, node);
    restRotations.set(bone, rest);
    pose[bone] = { rotation: delta.toArray() };
  }

  let mutationCalls = 0;
  const receivedFrozenFlags: boolean[] = [];
  const humanoid = {
    getNormalizedPose: (): VRMPose => {
      const snapshot: VRMPose = {};
      for (const bone of boneNames) {
        const rotation = pose[bone]?.rotation;
        if (rotation) snapshot[bone] = { rotation: copyQuaternion(rotation) };
      }
      return snapshot;
    },
    setNormalizedPose: (incoming: VRMPose): void => {
      mutationCalls += 1;
      for (const [rawBone, transform] of Object.entries(incoming)) {
        const bone = rawBone as StudioHumanoidBoneName;
        const rotation = transform?.rotation;
        const node = nodes.get(bone);
        const rest = restRotations.get(bone);
        if (!rotation || !node || !rest) continue;
        receivedFrozenFlags.push(Object.isFrozen(rotation));
        const copied = copyQuaternion(rotation);
        pose[bone] = { rotation: copied };
        node.quaternion.fromArray(copied).multiply(rest);
      }
      if (options.throwAfterFirstMutation && mutationCalls === 1) {
        throw new Error("injected setNormalizedPose failure");
      }
    },
    getNormalizedBoneNode: (bone: StudioHumanoidBoneName): THREE.Object3D | null =>
      nodes.get(bone) ?? null,
  };

  return {
    runtime: { humanoid } satisfies StudioVrmPoseMaterialRuntime,
    nodes,
    getPose: humanoid.getNormalizedPose,
    receivedFrozenFlags,
  };
}

function material(
  bones: Array<{ bone: StudioHumanoidBoneName; rotation: QuaternionTuple }>,
): StudioPoseMaterial {
  const parsed = parseStudioPoseMaterial({
    kind: STUDIO_POSE_MATERIAL_KIND,
    version: STUDIO_POSE_MATERIAL_VERSION,
    rotationConvention: STUDIO_POSE_ROTATION_CONVENTION,
    id: "portable-pose",
    name: "Portable pose",
    scope: "full",
    bones,
    metadata: { description: "", tags: [] },
  });
  if (!parsed) throw new Error("invalid test material");
  return parsed;
}

function quaternionFromEuler(rotation: readonly [number, number, number]): THREE.Quaternion {
  return new THREE.Quaternion().setFromEuler(
    new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
  );
}

describe("Studio VRM portable pose-material adapter", () => {
  it("captures all available normalized humanoid rotations without positions or model paths", () => {
    const { runtime } = createRuntime({
      rotations: {
        head: [0, 0, -0.5, -0.5],
      },
    });

    const captured = captureStudioVrmPoseMaterial(runtime, {
      id: "capture-full",
      name: "Full capture",
      scope: "full",
    });

    expect(captured?.bones).toHaveLength(STUDIO_HUMANOID_BONE_NAMES.length);
    expect(captured?.bones.map((entry) => entry.bone)).toEqual(STUDIO_HUMANOID_BONE_NAMES);
    expect(captured?.bones.find((entry) => entry.bone === "head")?.rotation[3]).toBeGreaterThan(0);
    expect(captured?.bones.every((entry) => !("position" in entry))).toBe(true);
    expect(captured?.bones.every((entry) => !("node" in entry))).toBe(true);
  });

  it("captures exact authored scopes and skips optional bones missing from the target VRM", () => {
    const { runtime } = createRuntime({ bones: ["leftEye", "jaw"] });
    const captured = captureStudioVrmPoseMaterial(runtime, {
      id: "capture-gaze",
      name: "Gaze",
      scope: "gaze-jaw",
    });

    expect(captured?.bones.map((entry) => entry.bone)).toEqual(["leftEye", "jaw"]);
    expect(studioHumanoidBonesForScope("gaze-jaw")).toEqual(["leftEye", "rightEye", "jaw"]);
  });

  it("applies only the requested, unlocked, available bones and keeps fingers in their single owner", () => {
    const { runtime, nodes, receivedFrozenFlags } = createRuntime({
      bones: ["head", "leftHand", "leftIndexProximal"],
      restRotations: {
        leftHand: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0)).toArray(),
      },
    });
    const sourceMaterial = material([
      { bone: "head", rotation: [0, 0.1, 0, 0.995] },
      { bone: "leftFoot", rotation: [0.1, 0, 0, 0.995] },
      { bone: "leftHand", rotation: [0, 0, 0.2, 0.98] },
      { bone: "leftIndexProximal", rotation: [0, 0, -0.3, 0.95] },
    ]);
    const sourceSnapshot = JSON.stringify(sourceMaterial);
    const originalBones = {
      chest: { rotation: [0.2, 0, 0] as const },
      leftFoot: { rotation: [0, 0.2, 0] as const },
    };
    const originalFingers = { rightIndexProximal: [0, 0, 0.4] as const };

    const result = applyStudioVrmPoseMaterial(runtime, sourceMaterial, {
      scope: "upper",
      lockedBones: ["head"],
      bones: originalBones,
      fingerEdits: originalFingers,
    });

    expect(result?.appliedBones).toEqual(["leftHand", "leftIndexProximal"]);
    expect(result?.skippedLocked).toEqual(["head"]);
    expect(result?.skippedOutsideScope).toEqual(["leftFoot"]);
    expect(result?.skippedMissing).toEqual([]);
    expect(result?.bones.chest).toEqual(originalBones.chest);
    expect(result?.bones.leftFoot).toEqual(originalBones.leftFoot);
    expect(result?.bones.leftIndexProximal).toBeUndefined();
    expect(result?.fingerEdits.rightIndexProximal).toEqual(originalFingers.rightIndexProximal);
    expect(result?.fingerEdits.leftIndexProximal).toBeDefined();
    expect(receivedFrozenFlags).toEqual([false, false]);
    expect(JSON.stringify(sourceMaterial)).toBe(sourceSnapshot);
    expect(originalBones).toEqual({
      chest: { rotation: [0.2, 0, 0] },
      leftFoot: { rotation: [0, 0.2, 0] },
    });

    const handEuler = result?.bones.leftHand?.rotation;
    expect(handEuler).toBeDefined();
    const expectedVisible = new THREE.Quaternion()
      .fromArray(sourceMaterial.bones.find((entry) => entry.bone === "leftHand")!.rotation)
      .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0, 0)));
    expect(Math.abs(quaternionFromEuler(handEuler!).dot(expectedVisible))).toBeCloseTo(1, 10);
    expect(Math.abs(nodes.get("leftHand")!.quaternion.dot(expectedVisible))).toBeCloseTo(1, 10);
  });

  it("reports missing target bones without injecting their state for a later model switch", () => {
    const { runtime } = createRuntime({ bones: ["head"] });
    const result = applyStudioVrmPoseMaterial(
      runtime,
      material([
        { bone: "head", rotation: [0, 0, 0.2, 0.98] },
        { bone: "jaw", rotation: [0.1, 0, 0, 0.995] },
      ]),
      { bones: {}, fingerEdits: {} },
    );

    expect(result?.appliedBones).toEqual(["head"]);
    expect(result?.skippedMissing).toEqual(["jaw"]);
    expect(result?.bones.jaw).toBeUndefined();
  });

  it("rolls the normalized runtime back when three-vrm rejects the mutation", () => {
    const initial: QuaternionTuple = [0, 0, 0.1, Math.sqrt(0.99)];
    const { runtime, getPose } = createRuntime({
      bones: ["head"],
      rotations: { head: initial },
      throwAfterFirstMutation: true,
    });
    const result = applyStudioVrmPoseMaterial(
      runtime,
      material([{ bone: "head", rotation: [0, 0.2, 0, Math.sqrt(0.96)] }]),
      { bones: {}, fingerEdits: {} },
    );

    expect(result).toBeNull();
    expect(getPose().head?.rotation).toEqual(initial);
  });

  it("fails closed when a humanoid or safe normalized rotation is unavailable", () => {
    expect(
      captureStudioVrmPoseMaterial({ humanoid: null }, {
        id: "no-humanoid",
        name: "No humanoid",
        scope: "full",
      }),
    ).toBeNull();

    const node = new THREE.Object3D();
    const runtime: StudioVrmPoseMaterialRuntime = {
      humanoid: {
        getNormalizedPose: () => ({ head: { rotation: [Number.NaN, 0, 0, 1] } }),
        setNormalizedPose: () => undefined,
        getNormalizedBoneNode: (bone) => bone === "head" ? node : null,
      },
    };
    expect(
      captureStudioVrmPoseMaterial(runtime, {
        id: "bad-rotation",
        name: "Bad rotation",
        scope: "upper",
      }),
    ).toBeNull();
  });
});
