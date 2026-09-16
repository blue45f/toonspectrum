import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";

import {
  planStudioVrmContactReplay,
  refineStudioVrmContact,
  releaseStudioVrmContactReplay,
  sameStudioVrmContactValues,
  type StudioVrmContactReplay,
} from "./studio-vrm-contact-refinement";
import {
  createStudioVrmGripContactTargets,
  type StudioVrmGripDigitOrdinal,
} from "./studio-vrm-grip-contact-targets";
import { createAutoGripFingerOverrides, resolvePropAttachment, resolveSecondaryPropTarget } from "./studio-vrm-prop-rig";
import { propDefById } from "./studio-vrm-props";
import {
  createStudioVrmVirtualFingertipProbe,
  sampleStudioVrmVirtualFingertip,
  type StudioVrmVirtualFingertipProbe,
} from "./studio-vrm-virtual-fingertip";

import type { VrmPropRigMetrics, ResolvedPropAttachment } from "./studio-vrm-prop-rig";
import type { PropInstance, PropAnchorDef } from "./studio-vrm-props";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

// Base pose (-3), prop IK (-2), contact (-1.5), then raw-skeleton commit (-1).
const STUDIO_VRM_GRIP_CONTACT_PRIORITY = -1.5;
const DIGITS = [
  { name: "Thumb", segments: ["Metacarpal", "Proximal", "Distal"], ordinal: "thumb", limits: [55, 75, 85], tipRatio: 0.82 },
  { name: "Index", segments: ["Proximal", "Intermediate", "Distal"], ordinal: 0, limits: [80, 100, 65], tipRatio: 0.72 },
  { name: "Middle", segments: ["Proximal", "Intermediate", "Distal"], ordinal: 1, limits: [80, 100, 65], tipRatio: 0.68 },
  { name: "Ring", segments: ["Proximal", "Intermediate", "Distal"], ordinal: 2, limits: [80, 100, 65], tipRatio: 0.72 },
  { name: "Little", segments: ["Proximal", "Intermediate", "Distal"], ordinal: 3, limits: [80, 100, 65], tipRatio: 0.78 },
] as const;

export type StudioVrmGripContactPass = { run(): void; release(): boolean };

/**
 * Product-authoritative grip passes. The browser visual harness can import this exact factory so
 * screenshots cannot silently drift to a legacy hand solver.
 */
export function createStudioVrmGripContactPasses(
  vrm: VRM,
  items: readonly PropInstance[],
  metrics: VrmPropRigMetrics,
  locked: readonly string[],
): StudioVrmGripContactPass[] {
  const authority = createAutoGripFingerOverrides(items, propDefById, metrics);
  const passes: StudioVrmGripContactPass[] = [];
  for (const item of items) {
    const def = propDefById(item.propId);
    // Flat, precision-pinch and support poses keep their own authored profiles.
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
    if (secondary && secondary.influence >= 0.999) contacts.push({
      side: secondary.bone === "leftHand" ? "left" : "right", anchor: secondary.anchor,
    });
    for (const { side, anchor } of contacts) {
      if (!authority[`${side}IndexProximal`]) continue;
      const hand = vrm.humanoid?.getNormalizedBoneNode(`${side}Hand`);
      if (!hand) continue;
      const radius = (anchor.gripRadius ?? def.grip.radius) * resolved.scale;
      const handSize = side === "left" ? metrics.leftHand : metrics.rightHand;
      if (![radius, handSize].every((value) => Number.isFinite(value) && value > 0)) continue;

      hand.updateWorldMatrix(true, true);
      const chains: THREE.Object3D[][] = [];
      const fingerOrdinals: StudioVrmGripDigitOrdinal[] = [];
      const probes: StudioVrmVirtualFingertipProbe[] = [];
      const jointLimits: number[] = [];
      for (const digit of DIGITS) {
        const names = digit.segments.map((segment) => (
          `${side}${digit.name}${segment}` as VRMHumanBoneName
        ));
        // A locked joint protects its entire digit, not unrelated unlocked digits.
        if (names.some((name) => locked.includes(name))) continue;
        const nodes = names.map((name) => vrm.humanoid?.getNormalizedBoneNode(name));
        if (nodes.some((node) => !node)) continue;
        const chain = nodes as THREE.Object3D[];
        const probe = createStudioVrmVirtualFingertipProbe({
          distal: chain[2]!,
          previousJoint: chain[1]!,
          handSize,
          lengthRatio: digit.tipRatio,
        });
        if (!probe) continue;
        chains.push(chain);
        fingerOrdinals.push(digit.ordinal);
        probes.push(probe);
        jointLimits.push(...digit.limits.map(THREE.MathUtils.degToRad));
      }
      if (chains.length === 0) continue;
      const bones = chains.flat();
      const endpointWorldPositions = probes.map(() => new THREE.Vector3());
      const groups = chains.map((_, index) => [index * 3, index * 3 + 1, index * 3 + 2]);
      const gripCenter = new THREE.Vector3();
      const localCenter = new THREE.Vector3();
      const gripAxis = new THREE.Vector3();
      const fallbackRadial = new THREE.Vector3();
      const localAxis = new THREE.Vector3();
      const localRadial = new THREE.Vector3();
      const scratch = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      const inverseHandRotation = new THREE.Quaternion();
      const offset = new THREE.Vector3(...anchor.position).sub(new THREE.Vector3(...resolved.anchor.position)).multiplyScalar(resolved.scale);
      const localRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(
        THREE.MathUtils.degToRad(resolved.rotationDeg[0]),
        THREE.MathUtils.degToRad(resolved.rotationDeg[1]),
        THREE.MathUtils.degToRad(resolved.rotationDeg[2]),
      ));
      let cache: StudioVrmContactReplay | null = null;
      let faulted = false;
      const read = () => bones.map((bone) => bone.rotation.z);
      const readShape = () => bones.flatMap((bone) => [
        bone.rotation.x, bone.rotation.y,
        bone.position.x, bone.position.y, bone.position.z,
        bone.scale.x, bone.scale.y, bone.scale.z,
      ]);
      const apply = (angles: readonly number[]) => {
        bones.forEach((bone, index) => { bone.rotation.z = angles[index]; });
        hand.updateWorldMatrix(true, true);
      };
      const release = (): boolean => {
        const previous = cache;
        cache = null;
        try {
          const original = releaseStudioVrmContactReplay(previous, read(), readShape());
          if (!original) return false;
          apply(original);
          return true;
        } catch {
          faulted = true;
          return false;
        }
      };
      passes.push({
        run() {
          if (faulted) return;
          try {
            if (vrm.humanoid?.getNormalizedBoneNode(`${side}Hand`) !== hand) {
              release();
              faulted = true;
              return;
            }
            sourceHand.updateWorldMatrix(true, false);
            gripCenter.set(...resolved.socketPosition);
            sourceHand.localToWorld(gripCenter);
            sourceHand.getWorldQuaternion(rotation).multiply(localRotation).normalize();
            gripCenter.add(scratch.copy(offset).applyQuaternion(rotation));
            gripAxis.set(...anchor.up).applyQuaternion(rotation).normalize();
            fallbackRadial.set(...anchor.forward).applyQuaternion(rotation).normalize();
            hand.updateWorldMatrix(true, true);
            const determinant = hand.matrixWorld.determinant();
            if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12
              || !gripCenter.toArray().every(Number.isFinite)
              || !gripAxis.toArray().every(Number.isFinite)
              || !fallbackRadial.toArray().every(Number.isFinite)
              || gripCenter.distanceTo(hand.getWorldPosition(scratch)) > handSize * 1.8) {
              release(); // Do not leave a previous correction on an unreachable contact.
              return;
            }

            localCenter.copy(gripCenter);
            hand.worldToLocal(localCenter);
            hand.getWorldQuaternion(inverseHandRotation).invert();
            localAxis.copy(gripAxis).applyQuaternion(inverseHandRotation).normalize();
            localRadial.copy(fallbackRadial).applyQuaternion(inverseHandRotation).normalize();
            const m = hand.matrixWorld.elements;
            const context = [
              localCenter.x, localCenter.y, localCenter.z,
              localAxis.x, localAxis.y, localAxis.z,
              localRadial.x, localRadial.y, localRadial.z,
              radius, handSize,
              ...fingerOrdinals.map((ordinal) => ordinal === "thumb" ? -1 : ordinal),
              ...probes.flatMap((probe) => [
                ...probe.localTip,
                probe.estimatedWorldLength,
                probe.sourceSegmentWorldLength,
              ]),
            ];
            // Scale/shear Gram matrix is invariant under common rigid movement.
            for (let a = 0; a < 3; a += 1) {
              for (let b = a; b < 3; b += 1) context.push(m[a * 4] * m[b * 4] + m[a * 4 + 1] * m[b * 4 + 1] + m[a * 4 + 2] * m[b * 4 + 2]);
            }
            const shape = readShape();
            const current = read();
            if (![...context, ...shape, ...current].every(Number.isFinite)) { release(); return; }
            const plan = planStudioVrmContactReplay(cache, current, shape, context);
            if (plan.kind === "unchanged") return;
            if (plan.kind === "replay") { apply(plan.angles); return; }
            const initial = [...plan.angles];
            if (!sameStudioVrmContactValues(initial, current)) apply(initial);

            let sampledAllTips = true;
            probes.forEach((probe, index) => {
              sampledAllTips = Boolean(
                sampleStudioVrmVirtualFingertip(probe, endpointWorldPositions[index]!),
              ) && sampledAllTips;
            });
            if (!sampledAllTips) {
              release();
              return;
            }
            const contactPlan = createStudioVrmGripContactTargets({
              center: gripCenter,
              axis: gripAxis,
              fallbackRadial,
              fingertipWorldPositions: endpointWorldPositions,
              fingerOrdinals,
              gripRadius: radius,
              handSize,
              side,
            });
            if (!contactPlan) {
              cache = null;
              return;
            }

            const measureContacts = (): number[] | null => {
              const distances: number[] = [];
              for (let index = 0; index < probes.length; index += 1) {
                const tip = sampleStudioVrmVirtualFingertip(
                  probes[index]!,
                  endpointWorldPositions[index]!,
                );
                if (!tip) return null;
                distances.push(tip.distanceTo(contactPlan.targets[index]!));
              }
              return distances.every(Number.isFinite) ? distances : null;
            };
            const result = refineStudioVrmContact({
              initial, groups,
              limits: jointLimits,
              goal: contactPlan.tolerance,
              minImprovement: Math.max(5e-6, handSize * 0.004),
              allowRelaxation: true,
              maxAngularChange: THREE.MathUtils.degToRad(24),
              maxEvaluations: 80,
              apply,
              measure: () => {
                const distances = measureContacts();
                return distances ? Math.max(...distances) : null;
              },
              measureContacts,
            });
            if (result.reason === "invalid" || !result.restored) {
              cache = null;
              faulted = true;
              return;
            }
            cache = { input: initial, output: [...result.angles], shape, context };
          } catch {
            release();
            faulted = true;
          }
        },
        release,
      });
    }
  }
  return passes;
}

const NO_LOCKS: readonly string[] = [];

export function StudioVrmGripContactRefine({ vrm, items, metrics, rigRevision, lockedBones = NO_LOCKS, disabled = false, capturePaused = false }: {
  vrm: VRM;
  items: readonly PropInstance[];
  metrics: VrmPropRigMetrics;
  rigRevision?: number;
  lockedBones?: readonly string[];
  disabled?: boolean;
  capturePaused?: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const passes = useMemo(() => {
    void rigRevision;
    return disabled ? [] : createStudioVrmGripContactPasses(vrm, items, metrics, lockedBones);
  }, [disabled, items, lockedBones, metrics, rigRevision, vrm]);
  // Release old passes before the new frame callbacks run, including StrictMode replay.
  useLayoutEffect(() => {
    invalidate();
    return () => {
      let changed = false;
      passes.forEach((pass) => { changed = pass.release() || changed; });
      if (changed) {
        vrm.humanoid?.update();
        vrm.scene.updateMatrixWorld(true);
        invalidate();
      }
    };
  }, [invalidate, passes, vrm]);
  useFrame(() => {
    if (capturePaused) return;
    passes.forEach((pass) => pass.run());
  }, STUDIO_VRM_GRIP_CONTACT_PRIORITY);
  return null;
}
