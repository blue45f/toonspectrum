import { describe, expect, it } from "vitest";

import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  buildStudioMannequinSpec,
  clampStudioMannequinBodyParams,
  studioMannequinRestStature,
} from "./studio-mannequin-model";

function capsule(spec: ReturnType<typeof buildStudioMannequinSpec>, jointId: string) {
  return spec.primitives.find((item) => item.kind === "capsule" && item.jointId === jointId);
}

function sphere(
  spec: ReturnType<typeof buildStudioMannequinSpec>,
  jointId: string,
  predicate: (center: readonly number[]) => boolean = () => true,
) {
  return spec.primitives.find(
    (item) => item.kind === "sphere" && item.jointId === jointId && predicate(item.center),
  );
}

describe("mannequin anatomical silhouette controls", () => {
  it("normalizes every anatomy parameter and clamps hostile values", () => {
    const defaults = clampStudioMannequinBodyParams({});
    expect(defaults).toMatchObject({
      torsoDepth: 1,
      waistWidth: 1,
      limbThickness: 1,
      handScale: 1,
      footScale: 1,
      neckThickness: 1,
    });

    const clamped = clampStudioMannequinBodyParams({
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      torsoDepth: 99,
      waistWidth: -5,
      limbThickness: Number.NaN,
      handScale: 0,
      footScale: 50,
      neckThickness: Number.POSITIVE_INFINITY,
    });
    expect(clamped.torsoDepth).toBe(1.35);
    expect(clamped.waistWidth).toBe(0.7);
    expect(clamped.limbThickness).toBe(1);
    expect(clamped.handScale).toBe(0.75);
    expect(clamped.footScale).toBe(1.3);
    expect(clamped.neckThickness).toBe(1);
  });

  it("changes independent silhouette axes without changing stature or IK lengths", () => {
    const base = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const tuned = buildStudioMannequinSpec({
      ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
      torsoDepth: 1.3,
      waistWidth: 1.2,
      limbThickness: 1.25,
      handScale: 1.2,
      footScale: 1.2,
      neckThickness: 1.2,
    });

    expect(studioMannequinRestStature(tuned)).toBeCloseTo(base.heightM, 12);
    expect(tuned.chains.leftArm.upperLength).toBe(base.chains.leftArm.upperLength);
    expect(tuned.chains.leftArm.lowerLength).toBe(base.chains.leftArm.lowerLength);
    expect(tuned.chains.leftLeg.upperLength).toBe(base.chains.leftLeg.upperLength);

    const basePelvis = sphere(base, "pelvis");
    const tunedPelvis = sphere(tuned, "pelvis");
    const baseChest = sphere(base, "chest");
    const tunedChest = sphere(tuned, "chest");
    if (basePelvis?.kind === "sphere" && tunedPelvis?.kind === "sphere") {
      expect(tunedPelvis.scale?.[2]).toBeGreaterThan(basePelvis.scale?.[2] ?? 0);
    }
    if (baseChest?.kind === "sphere" && tunedChest?.kind === "sphere") {
      expect(tunedChest.scale?.[2]).toBeGreaterThan(baseChest.scale?.[2] ?? 0);
    }

    const baseSpine = capsule(base, "spine");
    const tunedSpine = capsule(tuned, "spine");
    const baseArm = capsule(base, "leftUpperArm");
    const tunedArm = capsule(tuned, "leftUpperArm");
    const baseNeck = capsule(base, "neck");
    const tunedNeck = capsule(tuned, "neck");
    if (baseSpine?.kind === "capsule" && tunedSpine?.kind === "capsule") {
      expect(tunedSpine.radius).toBeGreaterThan(baseSpine.radius);
    }
    if (baseArm?.kind === "capsule" && tunedArm?.kind === "capsule") {
      expect(tunedArm.radius).toBeGreaterThan(baseArm.radius);
    }
    if (baseNeck?.kind === "capsule" && tunedNeck?.kind === "capsule") {
      expect(tunedNeck.radius).toBeGreaterThan(baseNeck.radius);
    }

    const baseDigit = capsule(base, "leftHand");
    const tunedDigit = capsule(tuned, "leftHand");
    if (baseDigit?.kind === "capsule" && tunedDigit?.kind === "capsule") {
      expect(Math.abs(tunedDigit.to[1])).toBeGreaterThan(Math.abs(baseDigit.to[1]));
    }
    const baseFoot = sphere(base, "leftFoot", (center) => center[2] > 0);
    const tunedFoot = sphere(tuned, "leftFoot", (center) => center[2] > 0);
    if (baseFoot?.kind === "sphere" && tunedFoot?.kind === "sphere") {
      expect(tunedFoot.radius).toBeGreaterThan(baseFoot.radius);
      expect(tunedFoot.center[2]).toBeGreaterThan(baseFoot.center[2]);
    }
  });
});
