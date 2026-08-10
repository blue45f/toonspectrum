import { readFileSync } from "node:fs";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { measureStudioVrmWardrobeMetrics } from "./StudioVrmWardrobePropsProjection";

import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

const poserSource = readFileSync(new URL("./StudioVrmPoser.tsx", import.meta.url), "utf8");
const projectionSource = readFileSync(
  new URL("./StudioVrmWardrobePropsProjection.tsx", import.meta.url),
  "utf8",
);
const lazyUiSource = readFileSync(new URL("./studio-page-lazy-ui.ts", import.meta.url), "utf8");

function requiredIndex(source: string, token: string, from = 0): number {
  const index = source.indexOf(token, from);
  if (index < 0) throw new Error(`Expected source token was not found: ${token}`);
  return index;
}

function sourceBetween(source: string, startToken: string, endToken: string): string {
  const start = requiredIndex(source, startToken);
  const end = requiredIndex(source, endToken, start + startToken.length);
  return source.slice(start, end);
}

function createRestPoseVrm(): VRM {
  const scene = new THREE.Group();
  const bones = new Map<VRMHumanBoneName, THREE.Object3D>();
  const add = (name: VRMHumanBoneName, position: THREE.Vector3Tuple) => {
    const bone = new THREE.Bone();
    bone.name = name;
    bone.position.set(...position);
    scene.add(bone);
    bones.set(name, bone);
  };

  add("hips", [0, 1, 0]);
  add("spine", [0, 1.22, 0]);
  add("neck", [0, 1.62, 0]);
  add("leftUpperArm", [0.31, 1.48, 0]);
  add("rightUpperArm", [-0.31, 1.48, 0]);
  add("leftLowerArm", [0.59, 1.29, 0]);
  add("rightLowerArm", [-0.59, 1.29, 0]);
  add("leftHand", [0.79, 1.13, 0]);
  add("rightHand", [-0.79, 1.13, 0]);
  add("leftUpperLeg", [0.14, 0.91, 0]);
  add("rightUpperLeg", [-0.14, 0.91, 0]);
  add("leftLowerLeg", [0.14, 0.48, 0]);
  add("rightLowerLeg", [-0.14, 0.48, 0]);
  add("leftFoot", [0.14, 0.08, 0.12]);
  add("rightFoot", [-0.14, 0.08, 0.12]);

  return {
    scene,
    humanoid: {
      getRawBoneNode: (name: VRMHumanBoneName) => bones.get(name) ?? null,
    },
  } as unknown as VRM;
}

describe("Studio VRM wardrobe/prop projection boundary", () => {
  it("keeps the complete heavy render runtime in one one-way lazy leaf", () => {
    expect(poserSource).toContain('from "./StudioVrmWardrobePropsProjection";');
    for (const exportedName of [
      "StudioVrmPropAttachment",
      "measureStudioVrmWardrobeMetrics",
      "StudioVrmWardrobeAttachment",
      "StudioVrmRuntimeCommit",
    ]) {
      expect(projectionSource).toContain(`export function ${exportedName}(`);
      expect(poserSource).toContain(exportedName);
    }

    expect(poserSource).not.toMatch(
      /function (?:VrmPropAttachment|measureVrmWardrobeMetrics|VrmWardrobeAttachment|VrmRuntimeCommit)\b/u,
    );
    for (const privateRuntimeOwner of [
      "pendingPropDisposals",
      "STUDIO_VRM_PROP_GEOMETRY_QUALITY",
      "createGarmentWeaveTexture",
      "assembleSkinnedGarment",
      "pendingGarmentDisposals",
    ]) {
      expect(projectionSource).toContain(privateRuntimeOwner);
      expect(poserSource).not.toContain(privateRuntimeOwner);
    }

    expect(projectionSource).not.toMatch(
      /from ["']\.\/(?:StudioVrmPoser|StudioPage)["']/u,
    );
    expect(lazyUiSource).toContain('() => import("./StudioVrmPoser")');
    expect(lazyUiSource).not.toContain("StudioVrmWardrobePropsProjection");
  });

  it("preserves the smart prop follower, secondary-hand IK, quality, and StrictMode disposal", () => {
    const propRuntime = sourceBetween(
      projectionSource,
      "const pendingPropDisposals",
      "/* ── 실장착 워드로브",
    );

    expect(propRuntime).toContain("const VRM_FRAME_PROP_PRIORITY = -2;");
    expect(propRuntime).toContain("new RoundedBoxGeometry(width, height, depth, 3, radius)");
    expect(propRuntime).toContain("group.scale.setScalar(resolved.scale);");
    expect(propRuntime).toContain(".multiplyScalar(resolved.scale)");
    expect(propRuntime).toContain(".applyQuaternion(group.quaternion)");
    expect(propRuntime).toContain("resolveSecondaryHandConstraint(");
    expect(propRuntime).toContain("metrics.handSockets[secondary.bone]");
    expect(propRuntime).toContain("applyVrmTwoBoneGrip(");
    expect(propRuntime).toContain("{ targetQuaternion, state: secondaryGripState }");
    expect(propRuntime).toContain("}, VRM_FRAME_PROP_PRIORITY);");
    expect(propRuntime.match(/queueMicrotask\(/gu)).toHaveLength(1);
    expect(propRuntime).toContain("cancelScheduledPropDisposal(object);");
    expect(propRuntime).toContain("return () => schedulePropDisposal(object);");
  });

  it("preserves skinned/rigid garment assembly and material-only color or fabric updates", () => {
    const wardrobeRuntime = sourceBetween(
      projectionSource,
      "export function StudioVrmWardrobeAttachment(",
      "/** base pose/tracking과 모든 소품 IK가 끝난 뒤",
    );
    const renderable = sourceBetween(
      wardrobeRuntime,
      "const renderable = useMemo(() => {",
      "const entries = renderable.entries;",
    );
    const materialUpdate = sourceBetween(
      wardrobeRuntime,
      "useLayoutEffect(() => {",
      "// GPU 버퍼 정리",
    );

    expect(projectionSource).toContain("buildStudioVrmSkinnedGarment({");
    expect(projectionSource).toContain("buildStudioVrmGarmentGeometry(part.shape)");
    expect(projectionSource).toContain("const pendingGarmentDisposals = new WeakMap");
    expect(projectionSource.match(/queueMicrotask\(/gu)).toHaveLength(2);
    expect(renderable).toContain("}, [vrm, equip.itemId, effectiveFit, metrics]);");
    expect(renderable).not.toContain("equip.color");
    expect(renderable).not.toContain("equip.fabricId");
    expect(materialUpdate).toContain(
      "applyGarmentMaterialStyle(material, part, equip.color, equip.fabricId, nextWeave);",
    );
    expect(materialUpdate).toContain("}, [entries, equip.color, equip.fabricId]);");
    expect(wardrobeRuntime).toContain("cancelScheduledGarmentDisposal(entry.object)");
    expect(wardrobeRuntime).toContain("scheduleGarmentDisposal(entry.object)");
    expect(wardrobeRuntime).toContain("createPortal(<primitive object={entry.object} />, entry.node)");
  });

  it("keeps rest-pose measurement before either restore or spawn pose application", () => {
    const installVrm = sourceBetween(
      poserSource,
      "function installVrm(",
      "function loadModelFromLibraryEntry(",
    );
    const wardrobeMeasurement = requiredIndex(
      installVrm,
      "setWardrobeMetrics(measureStudioVrmWardrobeMetrics(nextVrm));",
    );
    const propMeasurement = requiredIndex(
      installVrm,
      "setPropRigMetrics(measureVrmPropRigMetrics(nextVrm));",
      wardrobeMeasurement,
    );
    const pendingRestore = requiredIndex(installVrm, "const pending = pendingPoseDataRef.current;");
    const restore = requiredIndex(installVrm, "commitFullStateRestore(pendingFull, nextVrm);");
    const spawnPose = requiredIndex(installVrm, "applyPoserVisualState(nextVrm, {");

    expect(wardrobeMeasurement).toBeLessThan(propMeasurement);
    expect(propMeasurement).toBeLessThan(pendingRestore);
    expect(pendingRestore).toBeLessThan(restore);
    expect(propMeasurement).toBeLessThan(spawnPose);
  });

  it("preserves raw-rig wardrobe measurements as an exported engine adapter", () => {
    const metrics = measureStudioVrmWardrobeMetrics(createRestPoseVrm());

    expect(metrics.source).toBe("raw-rig");
    expect(metrics.shoulderW).toBeCloseTo(0.62, 6);
    expect(metrics.hipW).toBeCloseTo(0.28, 6);
    expect(metrics.hipsToSpine).toBeCloseTo(0.22, 6);
    expect(metrics.spineToNeck).toBeCloseTo(0.4, 6);
    expect(metrics.upperArm.left.len).toBeGreaterThan(0.3);
    expect(metrics.lowerLeg.right.len).toBeGreaterThan(0.4);
    expect(metrics.footForward.left.every(Number.isFinite)).toBe(true);
  });

  it("keeps runtime commit after prop IK at the exact -1 priority", () => {
    const commitRuntime = sourceBetween(
      projectionSource,
      "export function StudioVrmRuntimeCommit(",
      "return null;\n}",
    );

    expect(projectionSource).toContain("const VRM_FRAME_COMMIT_PRIORITY = -1;");
    expect(commitRuntime).toContain("Math.min(delta, PHYSICS_PREVIEW_MAX_DELTA)");
    expect(commitRuntime).toContain("vrm.update(springDelta);");
    expect(commitRuntime).toContain("}, VRM_FRAME_COMMIT_PRIORITY);");
  });
});
