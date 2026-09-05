import { readFileSync } from "node:fs";

import { VRMLoaderPlugin, VRMUtils, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { beforeAll, describe, expect, it } from "vitest";

import { measureStudioVrmHeadSurface, sanitizeStudioVrmHeadSurface } from "./studio-vrm-headwear-fit";
import { getPropFitStatus, measureVrmPropRigMetrics, resolvePropAttachment, scaleVrmPropRigMetrics } from "./studio-vrm-prop-rig";
import * as base from "./studio-vrm-prop-rig-base";
import { createPropInstance, propDefById } from "./studio-vrm-props";

const models: VRM[] = [];
beforeAll(async () => {
  for (const file of ["sample.vrm", "AvatarSample_B.vrm"]) {
    const bytes = readFileSync(`public/vrm/${file}`);
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    const gltf = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "");
    const vrm = gltf.userData.vrm as VRM;
    if (vrm.meta.metaVersion === "0") VRMUtils.rotateVRM0(vrm);
    vrm.update(0);
    models.push(vrm);
  }
});

describe("native surface headwear fit", () => {
  it("measures both native skin/hair envelopes instead of the short neck-to-head segment", () => {
    for (const vrm of models) {
      const metrics = measureVrmPropRigMetrics(vrm);
      expect(metrics.head).toBeLessThan(0.12);
      expect(metrics.headSurface?.width).toBeGreaterThan(0.19);
      expect(metrics.headSurface?.top).toBeGreaterThan(0.20);
      expect(metrics.headSurface?.width).toBeLessThan(0.28);
      expect(measureStudioVrmHeadSurface(vrm)).toEqual(metrics.headSurface);
    }
  });

  it("keeps the cap crown above the measured hair and preserves the attachment anchor invariant", () => {
    for (const vrm of models) {
      const metrics = measureVrmPropRigMetrics(vrm);
      const item = createPropInstance("cap", "head-fit-cap")!;
      const definition = propDefById("cap")!;
      const result = resolvePropAttachment(definition, item, metrics);
      expect(result.scale).toBeGreaterThan(1.15);
      expect(result.scale).toBeLessThanOrEqual(definition.fit.maxScale);
      expect(result.socketSource).toBe("measured");
      const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(...result.rotationDeg.map(THREE.MathUtils.degToRad) as [number, number, number]));
      const head = vrm.humanoid.getNormalizedBoneNode("head")!;
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
      expect(forward.z).toBeGreaterThan(0.9);
      const anchor = new THREE.Vector3(...result.anchor.position).multiplyScalar(result.scale).applyQuaternion(rotation).add(new THREE.Vector3(...result.position));
      expect(anchor.distanceTo(new THREE.Vector3(...result.socketPosition))).toBeLessThan(1e-8);
      expect(result.position[1] + 0.165 * result.scale).toBeGreaterThan(metrics.headSurface!.top);
      expect(getPropFitStatus(definition, item, metrics).fitScale).toBeCloseTo(result.fit.fitScale);
    }
  });

  it("does not modify legacy, manual, moved-to-neck, or unrelated hand props", () => {
    const metrics = measureVrmPropRigMetrics(models[0]!);
    const definition = propDefById("cap")!;
    const item = createPropInstance("cap", "head-fit-legacy")!;
    const legacy = { ...item };
    delete legacy.rig;
    expect(resolvePropAttachment(definition, legacy, metrics)).toEqual(base.resolvePropAttachment(definition, legacy, metrics));
    const manual = { ...item, rig: { ...item.rig!, autoScale: false } };
    expect(resolvePropAttachment(definition, manual, metrics)).toEqual(base.resolvePropAttachment(definition, manual, metrics));
    const moved = { ...item, bone: "neck" as const };
    expect(resolvePropAttachment(definition, moved, metrics)).toEqual(base.resolvePropAttachment(definition, moved, metrics));
    const mug = createPropInstance("mug", "head-fit-mug")!;
    expect(resolvePropAttachment(propDefById("mug")!, mug, metrics)).toEqual(base.resolvePropAttachment(propDefById("mug")!, mug, metrics));
  });

  it("scales world diameters once while leaving head-local landmarks unchanged", () => {
    const metrics = measureVrmPropRigMetrics(models[0]!);
    const scaled = scaleVrmPropRigMetrics(metrics, { width: 1.15, height: 0.9 });
    expect(scaled.headSurface!.width).toBeCloseTo(metrics.headSurface!.width * 1.15);
    expect(scaled.headSurface!.worldScaleY).toBeCloseTo(metrics.headSurface!.worldScaleY * 0.9);
    expect(scaled.headSurface!.top).toBe(metrics.headSurface!.top);
  });

  it("rejects non-finite and unbounded external surface data", () => {
    const surface = measureVrmPropRigMetrics(models[0]!).headSurface!;
    for (const key of Object.keys(surface)) {
      expect(sanitizeStudioVrmHeadSurface({ ...surface, [key]: NaN })).toBeUndefined();
    }
    expect(sanitizeStudioVrmHeadSurface({ ...surface, width: 100 })).toBeUndefined();
    expect(sanitizeStudioVrmHeadSurface(null)).toBeUndefined();
  });
});
