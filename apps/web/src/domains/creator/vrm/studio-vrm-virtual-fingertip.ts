import * as THREE from "three";

const VECTOR_EPSILON = 1e-10;
const MATRIX_EPSILON = 1e-12;

export interface StudioVrmVirtualFingertipProbeInput {
  /** Final authored phalanx joint. The virtual tip is expressed in this node's local space. */
  readonly distal: THREE.Object3D;
  /** Joint immediately before `distal`, used to infer the finger's authored forward axis. */
  readonly previousJoint: THREE.Object3D;
  /** Current measured hand size in world metres. */
  readonly handSize: number;
  /** Distal-tip length relative to the preceding phalanx. */
  readonly lengthRatio?: number;
}

export interface StudioVrmVirtualFingertipProbe {
  readonly distal: THREE.Object3D;
  readonly localTip: readonly [number, number, number];
  readonly estimatedWorldLength: number;
  readonly sourceSegmentWorldLength: number;
}

function finiteVector(value: THREE.Vector3): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);
}

function finiteMatrix(value: THREE.Matrix4): boolean {
  return value.elements.every(Number.isFinite)
    && Number.isFinite(value.determinant())
    && Math.abs(value.determinant()) > MATRIX_EPSILON;
}

/**
 * Builds a model-scaled virtual fingertip from the final visible phalanx.
 *
 * VRM has no semantic fingertip bone. Measuring the distal joint origin therefore makes the last
 * joint's rotation invisible to contact refinement. This probe records a local point beyond that
 * joint, calibrated from the preceding phalanx, so distal rotation moves the measured contact.
 */
export function createStudioVrmVirtualFingertipProbe(
  input: StudioVrmVirtualFingertipProbeInput,
): StudioVrmVirtualFingertipProbe | null {
  const { distal, previousJoint } = input;
  const handSize = input.handSize;
  const lengthRatio = input.lengthRatio ?? 0.72;
  if (
    !distal
    || !previousJoint
    || distal === previousJoint
    || !Number.isFinite(handSize)
    || handSize <= 0
    || handSize > 0.35
    || !Number.isFinite(lengthRatio)
    || lengthRatio < 0.35
    || lengthRatio > 1.25
  ) return null;

  try {
    distal.updateWorldMatrix(true, false);
    previousJoint.updateWorldMatrix(true, false);
    if (!finiteMatrix(distal.matrixWorld) || !finiteMatrix(previousJoint.matrixWorld)) return null;

    const previousWorld = previousJoint.getWorldPosition(new THREE.Vector3());
    const distalWorld = distal.getWorldPosition(new THREE.Vector3());
    if (!finiteVector(previousWorld) || !finiteVector(distalWorld)) return null;

    const segment = distalWorld.clone().sub(previousWorld);
    const sourceSegmentWorldLength = segment.length();
    if (!Number.isFinite(sourceSegmentWorldLength) || sourceSegmentWorldLength <= VECTOR_EPSILON) {
      return null;
    }
    const worldAxis = segment.multiplyScalar(1 / sourceSegmentWorldLength);

    const localOrigin = distal.worldToLocal(distalWorld.clone());
    const localAxis = distal.worldToLocal(distalWorld.clone().add(worldAxis)).sub(localOrigin);
    if (!finiteVector(localAxis) || localAxis.lengthSq() <= VECTOR_EPSILON) return null;
    localAxis.normalize();

    const worldOrigin = distal.localToWorld(new THREE.Vector3());
    const worldUnit = distal.localToWorld(localAxis.clone());
    const worldUnitsPerLocalUnit = worldUnit.distanceTo(worldOrigin);
    if (!Number.isFinite(worldUnitsPerLocalUnit) || worldUnitsPerLocalUnit <= VECTOR_EPSILON) {
      return null;
    }

    const estimatedWorldLength = THREE.MathUtils.clamp(
      sourceSegmentWorldLength * lengthRatio,
      handSize * 0.1,
      handSize * 0.38,
    );
    const localTip = localAxis.multiplyScalar(estimatedWorldLength / worldUnitsPerLocalUnit);
    if (!finiteVector(localTip) || localTip.lengthSq() <= VECTOR_EPSILON) return null;

    return Object.freeze({
      distal,
      localTip: Object.freeze([localTip.x, localTip.y, localTip.z]) as readonly [number, number, number],
      estimatedWorldLength,
      sourceSegmentWorldLength,
    });
  } catch {
    return null;
  }
}

/** Samples into caller-owned storage and fails closed if a later rig transform becomes degenerate. */
export function sampleStudioVrmVirtualFingertip(
  probe: StudioVrmVirtualFingertipProbe,
  target: THREE.Vector3,
): THREE.Vector3 | null {
  try {
    probe.distal.updateWorldMatrix(true, false);
    if (!finiteMatrix(probe.distal.matrixWorld)) return null;
    target.set(probe.localTip[0], probe.localTip[1], probe.localTip[2]);
    probe.distal.localToWorld(target);
    return finiteVector(target) ? target : null;
  } catch {
    return null;
  }
}
