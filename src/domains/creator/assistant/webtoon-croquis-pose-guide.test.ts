import { describe, expect, it } from "vitest";

import {
  WebtoonCroquisPoseGuide,
  COMIC_POSE_LIBRARY,
  PERSPECTIVE_GUIDES,
} from "./webtoon-croquis-pose-guide";

describe("WebtoonCroquisPoseGuide", () => {
  const guide = new WebtoonCroquisPoseGuide();

  it("lists all comic pose prompts and filters by category", () => {
    expect(COMIC_POSE_LIBRARY.length).toBeGreaterThanOrEqual(5);

    const actions = guide.listPoses("action");
    expect(actions.length).toBeGreaterThanOrEqual(2);
    expect(actions.every((p) => p.category === "action")).toBe(true);

    const all = guide.listPoses();
    expect(all.length).toBe(COMIC_POSE_LIBRARY.length);
  });

  it("provides 4 distinct perspective camera guide presets", () => {
    expect(Object.keys(PERSPECTIVE_GUIDES).length).toBe(4);

    const low = guide.getPerspectiveGuide("low-angle");
    expect(low.horizonRatioY).toBe(0.8);
    expect(low.vanishingPointCount).toBe(3);

    const dutch = guide.getPerspectiveGuide("dutch-tilt");
    expect(dutch.tiltAngleDeg).toBe(-12);
  });

  it("picks random pose consistently using seed", () => {
    const poseA = guide.getRandomPose(42);
    const poseB = guide.getRandomPose(42);
    expect(poseA.id).toBe(poseB.id);
  });
});
