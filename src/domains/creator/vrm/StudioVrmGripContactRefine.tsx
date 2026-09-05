import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import * as THREE from "three";

import { refineStudioVrmContact, sameStudioVrmContactValues } from "./studio-vrm-contact-refinement";
import { createAutoGripFingerOverrides, resolvePropAttachment, resolveSecondaryPropTarget } from "./studio-vrm-prop-rig";
import { propDefById } from "./studio-vrm-props";

import type { VrmPropRigMetrics, ResolvedPropAttachment } from "./studio-vrm-prop-rig";
import type { PropInstance, PropAnchorDef } from "./studio-vrm-props";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

// The base pose is written at -3 and prop IK at -2. Refine after both and before
// the VRM/raw-skeleton commit (-1), otherwise the next frame erases the grip.
const STUDIO_VRM_GRIP_CONTACT_PRIORITY = -1.5;
const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;
const SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;
const LIMITS = [80, 100, 65].map(THREE.MathUtils.degToRad);

function createContactPasses(vrm: VRM, items: readonly PropInstance[], metrics: VrmPropRigMetrics, locked: readonly string[]) {
  const authority = createAutoGripFingerOverrides(items, propDefById, metrics);
  const passes: Array<{ run(): void; release(): void }> = [];
  for (const item of items) {
    const def = propDefById(item.propId);
    // Flat phones, precision pinches and support poses must not be tightened
    // into a generic fist. Their authored profiles remain the sole authority.
    if (!item.rig?.autoFingerPose || !def?.grip || !["cylinder", "handle"].includes(def.grip.kind)) continue;
    let resolved: ResolvedPropAttachment;
    try { resolved = resolvePropAttachment(def, item, metrics); } catch { continue; }
    if (!resolved.usesSmartRig) continue;
    const sourceHand = vrm.humanoid?.getNormalizedBoneNode(item.bone);
    if (!sourceHand) continue;
    const secondary = resolveSecondaryPropTarget(def, item);
    const contacts: Array<{ side: "left" | "right"; anchor: PropAnchorDef }> = [];
    if (item.bone === "leftHand" || item.bone === "rightHand") {
      contacts.push({ side: item.bone === "leftHand" ? "left" : "right", anchor: resolved.anchor });
    }
    // A partially influenced secondary hand deliberately need not reach the prop.
    if (secondary && secondary.influence >= 0.999) contacts.push({
      side: secondary.bone === "leftHand" ? "left" : "right", anchor: secondary.anchor,
    });
    for (const { side, anchor } of contacts) {
      if (!authority[`${side}IndexProximal`]) continue;
      const names = FINGERS.flatMap((finger) => SEGMENTS.map((segment) => `${side}${finger}${segment}` as VRMHumanBoneName));
      if (names.some((name) => locked.includes(name))) continue;
      const hand = vrm.humanoid?.getNormalizedBoneNode(`${side}Hand`);
      const nodes = names.map((name) => vrm.humanoid?.getNormalizedBoneNode(name));
      if (!hand || nodes.some((node) => !node)) continue;
      const bones = nodes as THREE.Object3D[];
      const endpoints = bones.filter((_, index) => index % 3 === 2);
      const radius = (anchor.gripRadius ?? def.grip.radius) * resolved.scale;
      const handSize = side === "left" ? metrics.leftHand : metrics.rightHand;
      if (![radius, handSize].every((value) => Number.isFinite(value) && value > 0)) continue;
      const target = new THREE.Vector3();
      const localTarget = new THREE.Vector3();
      const scratch = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const offset = new THREE.Vector3(...anchor.position).sub(new THREE.Vector3(...resolved.anchor.position)).multiplyScalar(resolved.scale);
      const localRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...resolved.rotationDeg.map(THREE.MathUtils.degToRad) as [number, number, number]));
      let cache: { input: number[]; output: readonly number[]; frame: number[] } | null = null;
      const read = () => bones.map((bone) => bone.rotation.z);
      const apply = (angles: readonly number[]) => {
        bones.forEach((bone, index) => { bone.rotation.z = angles[index]; });
        hand.updateWorldMatrix(true, true);
      };
      passes.push({
        run() {
          sourceHand.updateWorldMatrix(true, false);
          target.set(...resolved.socketPosition);
          sourceHand.localToWorld(target);
          sourceHand.getWorldQuaternion(rotation).multiply(localRotation);
          target.add(scratch.copy(offset).applyQuaternion(rotation));
          hand.updateWorldMatrix(true, true);
          // Do not chase a secondary anchor outside the hand's contact region.
          if (target.distanceTo(hand.getWorldPosition(scratch)) > handSize * 1.8) return;
          if (Math.abs(hand.matrixWorld.determinant()) < 1e-12) return;
          localTarget.copy(target);
          hand.worldToLocal(localTarget);
          const m = hand.matrixWorld.elements;
          // Gram matrix preserves scale/shear but ignores common rigid motion:
          // camera orbit and ordinary arm movement do not rerun the search.
          const frame = [localTarget.x, localTarget.y, localTarget.z];
          for (let a = 0; a < 3; a += 1) {
            for (let b = a; b < 3; b += 1) frame.push(m[a * 4] * m[b * 4] + m[a * 4 + 1] * m[b * 4 + 1] + m[a * 4 + 2] * m[b * 4 + 2]);
          }
          for (const bone of bones) frame.push(bone.rotation.x, bone.rotation.y, bone.position.x, bone.position.y, bone.position.z);
          if (!frame.every(Number.isFinite)) return;
          let initial = read();
          if (cache) {
            const isInput = sameStudioVrmContactValues(initial, cache.input);
            const isOutput = sameStudioVrmContactValues(initial, cache.output);
            if ((isInput || isOutput) && sameStudioVrmContactValues(frame, cache.frame)) {
              if (isInput) apply(cache.output);
              return;
            }
            if (isOutput) { initial = [...cache.input]; apply(initial); }
          }
          const result = refineStudioVrmContact({
            initial,
            limits: bones.map((_, index) => LIMITS[index % 3]),
            goal: radius * 2.2 + handSize * 0.4,
            minImprovement: Math.max(1e-5, handSize * 0.008),
            apply,
            measure: () => Math.max(...endpoints.map((node) => node.getWorldPosition(scratch).distanceTo(target))),
          });
          cache = { input: initial, output: result.angles, frame };
        },
        release() {
          if (cache && sameStudioVrmContactValues(read(), cache.output)) apply(cache.input);
          cache = null;
        },
      });
    }
  }
  return passes;
}

const NO_LOCKS: readonly string[] = [];

export function StudioVrmGripContactRefine({ vrm, items, metrics, rigRevision, lockedBones = NO_LOCKS, disabled = false }: {
  vrm: VRM;
  items: readonly PropInstance[];
  metrics: VrmPropRigMetrics;
  rigRevision?: number;
  lockedBones?: readonly string[];
  disabled?: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const passes = useMemo(() => {
    void rigRevision;
    return disabled ? [] : createContactPasses(vrm, items, metrics, lockedBones);
  }, [disabled, items, lockedBones, metrics, rigRevision, vrm]);
  useEffect(() => {
    invalidate();
    return () => { passes.forEach((pass) => pass.release()); };
  }, [invalidate, passes]);
  useFrame(() => { passes.forEach((pass) => pass.run()); }, STUDIO_VRM_GRIP_CONTACT_PRIORITY);
  return null;
}
