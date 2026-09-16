import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createStudioVrmVirtualFingertipProbe,
  sampleStudioVrmVirtualFingertip,
} from "./studio-vrm-virtual-fingertip";

function fixture() {
  const root = new THREE.Object3D();
  const previous = new THREE.Object3D();
  const distal = new THREE.Object3D();
  previous.position.set(0, 0.04, 0);
  distal.position.set(0, 0.03, 0);
  root.add(previous);
  previous.add(distal);
  root.updateMatrixWorld(true);
  return { root, previous, distal };
}

describe("studio VRM virtual fingertip", () => {
  it("extends beyond the distal joint and moves when the final phalanx rotates", () => {
    const { root, previous, distal } = fixture();
    const probe = createStudioVrmVirtualFingertipProbe({
      distal,
      previousJoint: previous,
      handSize: 0.08,
    });
    expect(probe).not.toBeNull();

    const before = sampleStudioVrmVirtualFingertip(probe!, new THREE.Vector3())?.clone();
    const joint = distal.getWorldPosition(new THREE.Vector3());
    expect(before?.distanceTo(joint)).toBeCloseTo(probe!.estimatedWorldLength, 6);

    distal.rotation.z = Math.PI / 2;
    root.updateMatrixWorld(true);
    const after = sampleStudioVrmVirtualFingertip(probe!, new THREE.Vector3())?.clone();
    expect(after).not.toBeNull();
    expect(after!.distanceTo(before!)).toBeGreaterThan(probe!.estimatedWorldLength * 0.9);
    expect(after!.distanceTo(joint)).toBeCloseTo(probe!.estimatedWorldLength, 6);
  });

  it("calibrates world length under non-uniform parent scale", () => {
    const { root, previous, distal } = fixture();
    root.scale.set(2, 0.5, 3);
    root.updateMatrixWorld(true);
    const probe = createStudioVrmVirtualFingertipProbe({
      distal,
      previousJoint: previous,
      handSize: 0.08,
      lengthRatio: 0.8,
    });
    expect(probe).not.toBeNull();
    const tip = sampleStudioVrmVirtualFingertip(probe!, new THREE.Vector3());
    const joint = distal.getWorldPosition(new THREE.Vector3());
    expect(tip?.distanceTo(joint)).toBeCloseTo(probe!.estimatedWorldLength, 6);
  });

  it("fails closed for invalid metrics and degenerate transforms", () => {
    const { root, previous, distal } = fixture();
    expect(createStudioVrmVirtualFingertipProbe({
      distal,
      previousJoint: previous,
      handSize: Number.NaN,
    })).toBeNull();

    root.scale.set(1, 0, 1);
    root.updateMatrixWorld(true);
    expect(createStudioVrmVirtualFingertipProbe({
      distal,
      previousJoint: previous,
      handSize: 0.08,
    })).toBeNull();
  });
});
