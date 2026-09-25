import { describe, expect, it } from "vitest";

import { studioBrushDynamicsSettingsForBrushId } from "./studio-brush-dynamics";
import {
  listStudioBrushMaterialNearestPairs,
  profileStudioBrushMaterialDistinctness,
  studioBrushMaterialDistinctnessDistance,
} from "./studio-brush-material-distinctness";
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";

function profile(id: "airbrush" | "dry-media" | "ink-particle") {
  return profileStudioBrushMaterialDistinctness({
    catalogId: id,
    runtimeBrushId: id,
    defaultWidth: id === "airbrush" ? 48 : 18,
    defaultOpacity: id === "airbrush" ? 0.5 : 0.8,
    brushDynamics: studioBrushDynamicsSettingsForBrushId(id),
    seed: 73,
  });
}

describe("Studio brush material distinctness", () => {
  it("촉의 평균 농도가 같아도 세로 홈과 가로 홈의 공간 차이를 보존한다", () => {
    const map = (vertical: boolean) => Uint8Array.from({ length: 64 }, (_, index) =>
      (vertical ? index % 8 : Math.floor(index / 8)) % 4 < 2 ? 255 : 0);
    const make = (vertical: boolean) => profileStudioBrushMaterialDistinctness({
      catalogId: vertical ? "vertical" : "horizontal", runtimeBrushId: "ink-particle",
      defaultWidth: 24, defaultOpacity: 0.8, seed: 73,
      brushDynamics: { tip: { shape: "hard", softness: 0, alphaMapSize: 8,
        alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(map(vertical)) } },
    });
    const vertical = make(true), horizontal = make(false);
    expect(vertical.spatialAlpha.reduce((sum, alpha) => sum + alpha, 0))
      .toBeCloseTo(horizontal.spatialAlpha.reduce((sum, alpha) => sum + alpha, 0), 5);
    expect(studioBrushMaterialDistinctnessDistance(vertical, horizontal)).toBeGreaterThan(0.1);
    expect(vertical.behaviorFingerprint).not.toBe(horizontal.behaviorFingerprint);
  });

  it("is deterministic and identity-free for the same rendered response", () => {
    const left = profile("dry-media");
    const right = profileStudioBrushMaterialDistinctness({
      catalogId: "renamed-dry-media",
      runtimeBrushId: "dry-media",
      defaultWidth: 18,
      defaultOpacity: 0.8,
      brushDynamics: studioBrushDynamicsSettingsForBrushId("dry-media"),
      seed: 73,
    });
    expect(left.vector).toEqual(right.vector);
    expect(left.behaviorFingerprint).toBe(right.behaviorFingerprint);
    expect(studioBrushMaterialDistinctnessDistance(left, right)).toBe(0);
  });

  it("separates real spacing, scatter, deposition and texture responses", () => {
    const airbrush = profile("airbrush");
    const dryMedia = profile("dry-media");
    const inkParticle = profile("ink-particle");
    expect(studioBrushMaterialDistinctnessDistance(airbrush, dryMedia)).toBeGreaterThan(0);
    expect(studioBrushMaterialDistinctnessDistance(dryMedia, inkParticle)).toBeGreaterThan(0);
    expect(studioBrushMaterialDistinctnessDistance(airbrush, inkParticle)).toBeGreaterThan(0);
    expect(
      studioBrushMaterialDistinctnessDistance(airbrush, dryMedia),
    ).toBe(
      studioBrushMaterialDistinctnessDistance(dryMedia, airbrush),
    );
  });

  it("reports nearest pairs in stable distance/id order and marks exact collisions", () => {
    const dryMedia = profile("dry-media");
    const renamed = profileStudioBrushMaterialDistinctness({
      catalogId: "renamed-dry-media",
      runtimeBrushId: "dry-media",
      defaultWidth: 18,
      defaultOpacity: 0.8,
      brushDynamics: studioBrushDynamicsSettingsForBrushId("dry-media"),
      seed: 73,
    });
    const pairs = listStudioBrushMaterialNearestPairs([
      profile("airbrush"),
      dryMedia,
      profile("ink-particle"),
      renamed,
    ]);
    expect(pairs[0]).toMatchObject({
      leftId: "dry-media",
      rightId: "renamed-dry-media",
      distance: 0,
      exactBehaviorCollision: true,
    });
    expect(pairs.map(({ distance }) => distance)).toEqual(
      [...pairs.map(({ distance }) => distance)].sort((left, right) => left - right),
    );
  });
});
