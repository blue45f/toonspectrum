import { describe, expect, it } from "vitest";

import { POSE_LANDMARK_NAMES } from "../../contracts";

import { tPoseBody, toImageLandmarks, toWorldLandmarks } from "./landmark-fixtures";
import { POSE_MIRROR_INDEX, angleBetweenDeg, clampVisibility, preparePoseLandmarks, segmentDirection, toModelSpace } from "./landmark-space";

describe("vision/landmark-space", () => {
  it("월드 좌표는 y·z를 뒤집고 이미지 좌표는 중심 이동·비율 보정 후 뒤집는다", () => {
    expect(toModelSpace({ x: 0.1, y: 0.2, z: 0.3 }, { space: "world" })).toEqual([0.1, -0.2, -0.3]);
    const image = toModelSpace({ x: 0.75, y: 0.25, z: -0.1 }, { space: "image", aspectRatio: 2 });
    expect(image[0]).toBeCloseTo(0.5, 12);
    expect(image[1]).toBeCloseTo(0.25, 12);
    expect(image[2]).toBeCloseTo(0.2, 12);
    expect(toModelSpace({ x: 0.1, y: 0, z: 0 }, { space: "world", mirror: true })[0]).toBe(-0.1);
  });

  it("거울 모드는 좌우 랜드마크를 교환하고 x를 반전한다", () => {
    const prepared = preparePoseLandmarks(toWorldLandmarks(tPoseBody()), { space: "world", mirror: true });
    const leftWrist = prepared.points[POSE_LANDMARK_NAMES.indexOf("left_wrist")];
    expect(leftWrist?.[0]).toBeCloseTo(0.7, 12);
    expect(POSE_MIRROR_INDEX[POSE_LANDMARK_NAMES.indexOf("left_ear")]).toBe(POSE_LANDMARK_NAMES.indexOf("right_ear"));
    expect(POSE_MIRROR_INDEX[POSE_LANDMARK_NAMES.indexOf("mouth_left")]).toBe(POSE_LANDMARK_NAMES.indexOf("mouth_right"));
    expect(POSE_MIRROR_INDEX[0]).toBe(0);
    expect(prepared.mirrored).toBe(true);
  });

  it("이미지 픽스처는 비율 보정 후 월드 픽스처와 같은 방향을 낸다", () => {
    const world = preparePoseLandmarks(toWorldLandmarks(tPoseBody()), { space: "world" });
    const image = preparePoseLandmarks(toImageLandmarks(tPoseBody(), 1.5), { space: "image", aspectRatio: 1.5 });
    const shoulder = POSE_LANDMARK_NAMES.indexOf("left_shoulder");
    const elbow = POSE_LANDMARK_NAMES.indexOf("left_elbow");
    const a = segmentDirection(world.points[shoulder] ?? [0, 0, 0], world.points[elbow] ?? [0, 0, 0]);
    const b = segmentDirection(image.points[shoulder] ?? [0, 0, 0], image.points[elbow] ?? [0, 0, 0]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a && b && angleBetweenDeg(a, b)).toBeLessThan(1e-6);
  });

  it("개수가 33이 아니면 throw하고 가시성은 0..1로 클램프한다", () => {
    expect(() => preparePoseLandmarks([], { space: "world" })).toThrow(/33개/u);
    expect(clampVisibility(undefined)).toBe(0);
    expect(clampVisibility(Number.NaN)).toBe(0);
    expect(clampVisibility(2)).toBe(1);
    expect(segmentDirection([1, 1, 1], [1, 1, 1])).toBeNull();
    expect(angleBetweenDeg([1, 0, 0], [0, 1, 0])).toBeCloseTo(90, 9);
  });
});
