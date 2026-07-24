import { describe, expect, it } from "vitest";

import {
  solvePoseToMannequinJoints,
  smoothMannequinJointRotations,
  type PoseLandmark,
} from "./studio-mannequin-webcam-tracking";

describe("studio-mannequin-webcam-tracking", () => {
  it("solves MediaPipe pose landmarks into 3D mannequin joint rotations", () => {
    // Create minimal 33 landmarks mock
    const landmarks: PoseLandmark[] = Array.from({ length: 33 }, () => ({
      x: 0.5,
      y: 0.5,
      z: 0,
      visibility: 0.9,
    }));

    // Position shoulders and elbows
    landmarks[11] = { x: 0.4, y: 0.3, z: 0, visibility: 0.9 }; // leftShoulder
    landmarks[12] = { x: 0.6, y: 0.3, z: 0, visibility: 0.9 }; // rightShoulder
    landmarks[13] = { x: 0.3, y: 0.5, z: 0, visibility: 0.9 }; // leftElbow
    landmarks[14] = { x: 0.7, y: 0.5, z: 0, visibility: 0.9 }; // rightElbow
    landmarks[15] = { x: 0.2, y: 0.7, z: 0, visibility: 0.9 }; // leftWrist
    landmarks[16] = { x: 0.8, y: 0.7, z: 0, visibility: 0.9 }; // rightWrist

    const joints = solvePoseToMannequinJoints(landmarks);
    expect(joints.leftUpperArm).toBeDefined();
    expect(joints.rightUpperArm).toBeDefined();
    expect(joints.leftUpperArm?.[0]).toBeTypeOf("number");
  });

  it("smooths joint rotations via EMA factor", () => {
    const prev = { leftUpperArm: [0, 0, 0] as const };
    const curr = { leftUpperArm: [1, 1, 1] as const };

    const smoothed = smoothMannequinJointRotations(prev, curr, 0.5);
    expect(smoothed.leftUpperArm?.[0]).toBe(0.5);
    expect(smoothed.leftUpperArm?.[1]).toBe(0.5);
    expect(smoothed.leftUpperArm?.[2]).toBe(0.5);
  });
});
