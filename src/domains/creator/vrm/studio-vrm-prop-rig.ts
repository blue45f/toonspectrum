/** Public rig boundary: retain the established hand/legacy contracts and opt the
 * regenerated headwear into native skinned-surface measurements. */
import * as THREE from "three";

import {
  measureStudioVrmHeadSurface,
  sanitizeStudioVrmHeadSurface,
  studioVrmHeadwearScale,
  studioVrmHeadwearSocket,
  type StudioVrmHeadSurface,
} from "./studio-vrm-headwear-fit";
import * as base from "./studio-vrm-prop-rig-base";

import type { PropDef, PropInstance, Vec3 } from "./studio-vrm-props";
import type { VRM } from "@pixiv/three-vrm";

export * from "./studio-vrm-prop-rig-base";

export interface VrmPropRigMetrics extends base.VrmPropRigMetrics {
  readonly headSurface?: StudioVrmHeadSurface;
}

export function sanitizeVrmPropRigMetrics(raw: unknown): VrmPropRigMetrics {
  const metrics = base.sanitizeVrmPropRigMetrics(raw);
  const surface = sanitizeStudioVrmHeadSurface(
    raw && typeof raw === "object" ? (raw as Partial<VrmPropRigMetrics>).headSurface : undefined,
  );
  return surface ? { ...metrics, headSurface: surface } : metrics;
}

export function measureVrmPropRigMetrics(vrm: VRM): VrmPropRigMetrics {
  const metrics = base.measureVrmPropRigMetrics(vrm);
  try {
    const headSurface = measureStudioVrmHeadSurface(vrm);
    return headSurface ? { ...metrics, headSurface } : metrics;
  } catch {
    // Malformed external skinning retains the established safe bone fallback.
    return metrics;
  }
}

export function scaleVrmPropRigMetrics(
  rawMetrics: VrmPropRigMetrics,
  bodyScale: { height: number; width: number },
): VrmPropRigMetrics {
  const metrics = sanitizeVrmPropRigMetrics(rawMetrics);
  const scaled = base.scaleVrmPropRigMetrics(metrics, bodyScale);
  const width = Number.isFinite(bodyScale?.width) ? Math.min(1.6, Math.max(0.5, bodyScale.width)) : 1;
  const height = Number.isFinite(bodyScale?.height) ? Math.min(1.6, Math.max(0.5, bodyScale.height)) : 1;
  const surface = metrics.headSurface;
  return surface ? sanitizeVrmPropRigMetrics({ ...scaled, headSurface: {
    ...surface, width: surface.width * width, worldScaleX: surface.worldScaleX * width, depth: surface.depth * width,
    worldScaleY: surface.worldScaleY * height,
  } }) : scaled;
}

function headwearMetrics(def: PropDef, instance: PropInstance, raw: VrmPropRigMetrics): VrmPropRigMetrics {
  const metrics = sanitizeVrmPropRigMetrics(raw);
  const ratio = studioVrmHeadwearScale(def, instance, metrics.headSurface);
  const reference = def.fit.reference;
  if (ratio === null || (reference !== "head" && reference !== "eyeDistance")) return metrics;
  return {
    ...metrics,
    [reference]: ratio * def.fit.designReference,
    sources: { ...metrics.sources, [reference]: "measured" },
  };
}

/** UI and renderer consume the same clamped, measured fitting decision. */
export function getPropFitStatus(def: PropDef, instance: PropInstance, metrics: VrmPropRigMetrics): base.PropFitStatus {
  return base.getPropFitStatus(def, instance, headwearMetrics(def, instance, metrics));
}

export function resolvePropAttachment(
  def: PropDef,
  instance: PropInstance,
  rawMetrics: VrmPropRigMetrics,
): base.ResolvedPropAttachment {
  const metrics = headwearMetrics(def, instance, rawMetrics);
  const resolved = base.resolvePropAttachment(def, instance, metrics);
  if (!resolved.usesSmartRig || !instance.rig) return resolved;
  const headSocket = studioVrmHeadwearSocket(def, instance, resolved.scale, metrics.headSurface);
  if (!headSocket) return resolved;
  const socketPosition: Vec3 = [
    headSocket[0] + instance.rig.deltaPosition[0],
    headSocket[1] + instance.rig.deltaPosition[1],
    headSocket[2] + instance.rig.deltaPosition[2],
  ];
  const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), metrics.headSurface!.facing < 0 ? Math.PI : 0);
  const rotation = facing.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
    ...resolved.rotationDeg.map(THREE.MathUtils.degToRad) as [number, number, number],
  )));
  const rotationEuler = new THREE.Euler().setFromQuaternion(rotation, "XYZ");
  const visualOffset = new THREE.Vector3(...resolved.anchorInverseLocal).applyQuaternion(rotation);
  const socketRotation = facing.multiply(new THREE.Quaternion(...resolved.socketRotationQuaternion));
  const socketEuler = new THREE.Euler().setFromQuaternion(socketRotation, "XYZ");
  return {
    ...resolved,
    rotationDeg: [rotationEuler.x, rotationEuler.y, rotationEuler.z].map(THREE.MathUtils.radToDeg) as [number, number, number],
    socketRotationQuaternion: socketRotation.toArray() as [number, number, number, number],
    socketRotationDeg: [socketEuler.x, socketEuler.y, socketEuler.z].map(THREE.MathUtils.radToDeg) as [number, number, number],
    visualOffset: visualOffset.toArray(),
    socketPosition,
    socketSource: "measured",
    position: [
      socketPosition[0] + visualOffset.x,
      socketPosition[1] + visualOffset.y,
      socketPosition[2] + visualOffset.z,
    ],
  };
}
