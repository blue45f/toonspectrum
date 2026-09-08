import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS } from "./studio-bg3d-cinematic-asset-blueprints";

function normalized(value: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(...value);
  return [value[0] / length, value[1] / length, value[2] / length];
}

function rotateLocalYAxis(
  rotation: readonly [number, number, number],
): [number, number, number] {
  const [x, y, z] = rotation.map((value) => value / 2);
  const cx = Math.cos(x);
  const cy = Math.cos(y);
  const cz = Math.cos(z);
  const sx = Math.sin(x);
  const sy = Math.sin(y);
  const sz = Math.sin(z);
  const qx = sx * cy * cz + cx * sy * sz;
  const qy = cx * sy * cz - sx * cy * sz;
  const qz = cx * cy * sz + sx * sy * cz;
  const qw = cx * cy * cz - sx * sy * sz;

  return [
    2 * (qx * qy - qz * qw),
    1 - 2 * (qx * qx + qz * qz),
    2 * (qy * qz + qx * qw),
  ];
}

function expectSegmentDirection(
  assetId: string,
  partId: string,
  start: readonly [number, number, number],
  end: readonly [number, number, number],
): void {
  const asset = STUDIO_BG3D_CINEMATIC_ASSET_BLUEPRINTS.find(
    (candidate) => candidate.id === assetId,
  );
  const part = asset?.parts.find((candidate) => candidate.id === partId);
  expect(part).toBeTruthy();
  if (!part) return;

  const expected = normalized([
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2],
  ]);
  const actual = rotateLocalYAxis(part.rotation);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, 6);
  });
  expect(part.scale[1]).toBeCloseTo(
    Math.hypot(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2],
    ),
    6,
  );
}

describe("cinematic procedural segment orientation", () => {
  it("aligns a diagonal running forearm to its authored endpoints", () => {
    expectSegmentDirection(
      "ts3d-character-running-v1",
      "forearm-left",
      [-0.52, 1.24, -0.18],
      [-0.22, 1.1, -0.32],
    );
  });

  it("aligns a seated thigh across all three axes", () => {
    expectSegmentDirection(
      "ts3d-character-seated-reader-v1",
      "thigh-left",
      [-0.21, 0.7, 0],
      [-0.28, 0.49, 0.46],
    );
  });

  it("aligns a vertical-down segment without NaN or gimbal drift", () => {
    expectSegmentDirection(
      "ts3d-character-neutral-hero-v1",
      "shin-left",
      [-0.2, 0.48, 0],
      [-0.22, 0.08, 0.08],
    );
  });
});
