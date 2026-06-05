import { describe, expect, it } from "vitest";

import { POSE_PRESETS } from "./StudioVrmPoser";

const MAX_SINGLE_AXIS_DEGREES = 145;

function toDegrees(radians: number) {
  return Math.round((radians * 180) / Math.PI);
}

describe("StudioVrmPoser pose presets", () => {
  it("keeps all bundled poses inside a natural single-axis rotation range", () => {
    const overloadedRotations = POSE_PRESETS.flatMap((pose) =>
      Object.entries(pose.bones).flatMap(([boneName, rotation]) =>
        rotation.flatMap((radians, axisIndex) => {
          const degrees = toDegrees(radians);
          return Math.abs(degrees) > MAX_SINGLE_AXIS_DEGREES ? [`${pose.id}:${boneName}:${axisIndex}:${degrees}`] : [];
        })
      )
    );

    expect(overloadedRotations).toEqual([]);
  });

  it("offers a broad set of calm comic-panel pose options", () => {
    expect(POSE_PRESETS.map((pose) => pose.id)).toEqual([
      "default",
      "wave",
      "point",
      "cheer",
      "think",
      "sit",
      "run",
      "present",
      "support",
      "despair",
      "attack",
      "defense",
    ]);
  });
});
