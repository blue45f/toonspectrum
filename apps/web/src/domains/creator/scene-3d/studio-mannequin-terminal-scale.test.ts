import { describe, expect, it } from "vitest";

import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  buildStudioMannequinSpec,
  type StudioMannequinBodyParams,
} from "./studio-mannequin-model";

type Spec = ReturnType<typeof buildStudioMannequinSpec>;
type Sphere = Extract<Spec["primitives"][number], { readonly kind: "sphere" }>;

function spec(overrides: Partial<StudioMannequinBodyParams> = {}): Spec {
  return buildStudioMannequinSpec({
    ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
    ...overrides,
  });
}

function sphere(
  value: Spec,
  jointId: "leftHand" | "leftFoot",
  role: "joint" | "volume",
): Sphere {
  const found = value.primitives.find((primitive) =>
    primitive.kind === "sphere"
    && primitive.jointId === jointId
    && (role === "joint" ? primitive.center[1] === 0 : primitive.center[1] < 0),
  );
  expect(found?.kind).toBe("sphere");
  if (!found || found.kind !== "sphere") throw new Error(`${jointId} ${role} sphere missing`);
  return found;
}

function extent(value: Sphere, axis: 0 | 1 | 2): number {
  return value.radius * (value.scale?.[axis] ?? 1);
}

describe("studio mannequin terminal scale ownership", () => {
  it("handScale changes the palm but not the wrist joint ball", () => {
    const base = spec();
    const hand = spec({ handScale: 1.2 });
    const limb = spec({ limbThickness: 1.2 });

    expect(extent(sphere(hand, "leftHand", "volume"), 1)).toBeGreaterThan(
      extent(sphere(base, "leftHand", "volume"), 1),
    );
    expect(extent(sphere(hand, "leftHand", "joint"), 0)).toBeCloseTo(
      extent(sphere(base, "leftHand", "joint"), 0),
      12,
    );
    expect(extent(sphere(limb, "leftHand", "joint"), 0)).toBeGreaterThan(
      extent(sphere(base, "leftHand", "joint"), 0),
    );
  });

  it("footScale changes every rendered foot-volume axis but not the ankle joint ball", () => {
    const base = spec();
    const foot = spec({ footScale: 1.2 });
    const limb = spec({ limbThickness: 1.2 });
    const baseVolume = sphere(base, "leftFoot", "volume");
    const footVolume = sphere(foot, "leftFoot", "volume");

    for (const axis of [0, 1, 2] as const) {
      expect(extent(footVolume, axis)).toBeGreaterThan(extent(baseVolume, axis));
    }
    expect(extent(sphere(foot, "leftFoot", "joint"), 0)).toBeCloseTo(
      extent(sphere(base, "leftFoot", "joint"), 0),
      12,
    );
    expect(extent(sphere(limb, "leftFoot", "joint"), 0)).toBeGreaterThan(
      extent(sphere(base, "leftFoot", "joint"), 0),
    );
  });
});
