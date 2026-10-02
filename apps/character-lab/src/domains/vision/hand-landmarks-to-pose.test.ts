import { describe, expect, it } from "vitest";

import { LEFT_FINGER_BONE_NAMES, RIGHT_FINGER_BONE_NAMES } from "../../contracts";
import { qRotateVec3, qRotationAngle, radToDeg } from "../../shared/math";

import { fingerCurlQuat, handLandmarksToPose, thumbCurlQuat } from "./hand-landmarks-to-pose";
import { fistHandLandmarks, openHandLandmarks } from "./landmark-fixtures";

import type { PoseLandmark } from "../../contracts";

describe("vision/hand-landmarks-to-pose", () => {
  it("펼친 손은 손가락 15본 전부에 0° 굴곡을 낸다", () => {
    const result = handLandmarksToPose(openHandLandmarks(), { side: "left" });
    expect(result.side).toBe("left");
    expect(result.appliedBones).toEqual([...LEFT_FINGER_BONE_NAMES]);
    expect(result.skippedBones).toEqual([]);
    for (const bone of result.appliedBones) expect(result.curlDeg[bone] ?? Number.NaN).toBeLessThan(1);
    expect(Object.keys(result.pose).every((bone) => (LEFT_FINGER_BONE_NAMES as readonly string[]).includes(bone))).toBe(true);
  });

  it("주먹은 중위·원위 90° 굴곡을 내고 근위는 0°다", () => {
    const result = handLandmarksToPose(fistHandLandmarks(), { side: "right" });
    expect(result.appliedBones).toEqual([...RIGHT_FINGER_BONE_NAMES]);
    expect(result.curlDeg.rightIndexProximal ?? Number.NaN).toBeLessThan(1);
    expect(result.curlDeg.rightIndexIntermediate ?? Number.NaN).toBeCloseTo(90, 5);
    expect(result.curlDeg.rightIndexDistal ?? Number.NaN).toBeCloseTo(90, 5);
    expect(result.curlDeg.rightLittleIntermediate ?? Number.NaN).toBeCloseTo(90, 5);
    expect(result.clampedBones).toEqual([]);
  });

  it("손가락 굴곡 축은 애니메이션 DSL과 같다(왼손 -Z, 오른손 +Z, 손바닥 아래로 굽힘)", () => {
    const leftCurl = fingerCurlQuat("left", 90);
    const leftTip = qRotateVec3(leftCurl, [1, 0, 0]);
    expect(leftTip[1]).toBeCloseTo(-1, 6);
    const rightCurl = fingerCurlQuat("right", 90);
    const rightTip = qRotateVec3(rightCurl, [-1, 0, 0]);
    expect(rightTip[1]).toBeCloseTo(-1, 6);
    expect(radToDeg(qRotationAngle(thumbCurlQuat("left", 45)))).toBeCloseTo(45, 6);
  });

  it("관절 한계(95°)를 넘는 굴곡은 클램프하고 기록한다", () => {
    const landmarks = fistHandLandmarks();
    // 검지 끝을 더 꺾어 108° 근처로
    landmarks[8] = { x: landmarks[5]?.x ?? 0.45, y: (landmarks[5]?.y ?? 0.6) + 0.05, z: 0.05, visibility: 1 };
    const result = handLandmarksToPose(landmarks, { side: "left" });
    expect(result.clampedBones).toEqual(["leftIndexDistal"]);
    expect(result.curlDeg.leftIndexDistal).toBeCloseTo(95, 9);
    const raw = handLandmarksToPose(landmarks, { side: "left", clampToJointLimits: false });
    expect(raw.curlDeg.leftIndexDistal ?? 0).toBeGreaterThan(95);
  });

  it("거울 모드는 적용 측을 뒤집고, 겹친 랜드마크·NaN은 건너뛴다", () => {
    expect(handLandmarksToPose(openHandLandmarks(), { side: "left", mirror: true }).side).toBe("right");
    const degenerate = openHandLandmarks();
    degenerate[6] = { ...(degenerate[5] as PoseLandmark) };
    const result = handLandmarksToPose(degenerate, { side: "left" });
    expect(result.skippedBones.map((entry) => entry.bone)).toEqual(["leftIndexProximal", "leftIndexIntermediate"]);
    expect(result.skippedBones[0]?.reasonKo).toMatch(/겹쳐/u);
    const nan = openHandLandmarks();
    nan[0] = { x: Number.NaN, y: 0, z: 0, visibility: 1 };
    expect(handLandmarksToPose(nan, { side: "left" }).skippedBones.length).toBe(15);
    expect(() => handLandmarksToPose([], { side: "left" })).toThrow(/21개/u);
  });
});
