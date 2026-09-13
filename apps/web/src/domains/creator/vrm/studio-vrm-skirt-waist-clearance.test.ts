import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { fitStudioVrmSkirtWaistClearance } from "./studio-vrm-skirt-waist-clearance";
import { StudioVrmSkirtTriangleDistance } from "./studio-vrm-skirt-triangle-distance";
import { createStudioVrmXpbdSkirtTopology, type StudioVrmXpbdSkirtCapsuleProxy } from "./studio-vrm-xpbd-skirt";

const frame = { center: [0, 1, 0], right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1] } as const;
const capsule = (head: [number, number, number], tail: [number, number, number], radius: number): StudioVrmXpbdSkirtCapsuleProxy =>
  ({ restHead: head, restTail: tail, currentHead: head, currentTail: tail, radius });
const base = { frame, radiusX: 0.2, radiusZ: 0.2, segmentCount: 16, pleatCount: 4,
  pleatAmplitudeRatio: 0, particleRadius: 0.003, maxOffsetY: 0.3, maxRadius: 0.5 };

describe("rest-body waistband clearance", () => {
  it("clears polygon chords when every original vertex was already outside the body", () => {
    const hips = capsule([0, 1, 0], [0, 1, 0], 0.194);
    expect(base.radiusX).toBeGreaterThan(hips.radius + base.particleRadius + 0.002);
    expect(base.radiusX * Math.cos(Math.PI / 16)).toBeLessThan(hips.radius + base.particleRadius + 0.002);
    const result = fitStudioVrmSkirtWaistClearance({ ...base, capsules: { hips } });
    expect(result).not.toBeNull();
    expect(result!.radiusX).toBeCloseTo((hips.radius + base.particleRadius + 0.002) / Math.cos(Math.PI / 16), 6);
    expect(result!.radiusX).toBe(result!.radiusZ);
    expect(result!.offsetY).toBe(0);
  });

  it("accounts for a tilted plane's 90-degree thigh bend without moving pose pins", () => {
    const tilt = 0.24, upright = Math.sqrt(1 - tilt * tilt);
    const tiltedFrame = { ...frame, up: [0, upright, tilt], forward: [0, -tilt, upright] } as const;
    const thigh = capsule([0.08, 0.94, 0], [0.08, 0.54, 0], 0.09);
    const result = fitStudioVrmSkirtWaistClearance({ ...base, frame: tiltedFrame, capsules: { leftThigh: thigh } });
    expect(result).not.toBeNull();
    expect(result!.offsetY).toBeCloseTo(-0.06 * upright + 0.4 * tilt + 0.09 + 0.005, 6);
    const distance = new StudioVrmSkirtTriangleDistance();
    distance.head.set(...thigh.restHead); distance.tail.set(0.08, 0.94, 0.4);
    const center = new Vector3(...frame.center).addScaledVector(new Vector3(...tiltedFrame.up), result!.offsetY);
    for (let segment = 0; segment < base.segmentCount; segment += 1) {
      const point = (index: number) => center.clone()
        .addScaledVector(new Vector3(...tiltedFrame.right), Math.cos(index * Math.PI * 2 / base.segmentCount) * result!.radiusX)
        .addScaledVector(new Vector3(...tiltedFrame.forward), Math.sin(index * Math.PI * 2 / base.segmentCount) * result!.radiusZ);
      distance.triangle.a.copy(point(segment)); distance.triangle.b.copy(point(segment + 1)); distance.triangle.c.copy(point(segment));
      expect(distance.evaluate().distance).toBeGreaterThanOrEqual(thigh.radius + base.particleRadius);
    }
  });

  it("rejects bodies that cannot fit the bounded waist instead of accepting intersecting pins", () => {
    expect(fitStudioVrmSkirtWaistClearance({ ...base, maxOffsetY: 0.03,
      capsules: { leftThigh: capsule([0.1, 1, 0], [0.1, 0.6, 0], 0.15) } })).toBeNull();
    expect(fitStudioVrmSkirtWaistClearance({ ...base,
      capsules: { hips: capsule([0, 1, 0], [0, 1, 0], 0.6) } })).toBeNull();
  });

  it("preserves hem positions, style and caller-owned body data while fitting the waistband", () => {
    const body = { hips: capsule([-0.08, 0.94, 0], [0.08, 0.94, 0], 0.15),
      leftThigh: capsule([0.08, 0.94, 0], [0.08, 0.55, 0], 0.13),
      rightThigh: capsule([-0.08, 0.94, 0], [-0.08, 0.55, 0], 0.13) };
    const before = JSON.stringify(body);
    const input = { kind: "pleated" as const, metrics: { totalHeight: 1.6, headUnits: 8, hipsHeight: 0.95, legLength: 0.86, shoulderSpan: 0.18 },
      restWaist: frame, fit: 0.75, segmentCount: 24 };
    const nominal = createStudioVrmXpbdSkirtTopology(input);
    const fitted = createStudioVrmXpbdSkirtTopology({ ...input, restBody: body });
    expect(nominal.ok && fitted.ok).toBe(true);
    if (!nominal.ok || !fitted.ok) throw new Error("fixture topology unavailable");
    expect(fitted.topology.dimensions.waistOffsetY).toBeGreaterThan(0);
    expect(fitted.topology.restPositions.slice(-24 * 3)).toEqual(nominal.topology.restPositions.slice(-24 * 3));
    expect(fitted.topology.dimensions.pleatCount).toBe(nominal.topology.dimensions.pleatCount);
    expect(fitted.topology.topologySha256).not.toBe(nominal.topology.topologySha256);
    expect(JSON.stringify(body)).toBe(before);
    expect(createStudioVrmXpbdSkirtTopology({ ...input, restBody: { ...body, hips: { ...body.hips, radius: NaN } } })).toMatchObject({ ok: false, code: "invalid-input" });
  });
});
