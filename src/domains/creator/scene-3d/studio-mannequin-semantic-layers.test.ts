import { describe, expect, it } from "vitest";

import {
  STUDIO_MANNEQUIN_SEMANTIC_PARTS,
  getStudioMannequinSemanticPartForJoint,
  partitionStudioMannequinSemanticLayers,
} from "./studio-mannequin-semantic-layers";

function pixel(red: number, green: number, blue: number, alpha = 255): number[] {
  return [red, green, blue, alpha];
}

describe("studio mannequin semantic layers", () => {
  it("maps every runtime joint into one stable editable body part", () => {
    expect(getStudioMannequinSemanticPartForJoint("head")).toBe("head");
    expect(getStudioMannequinSemanticPartForJoint("chest")).toBe("torso");
    expect(getStudioMannequinSemanticPartForJoint("leftHand")).toBe("left-arm");
    expect(getStudioMannequinSemanticPartForJoint("rightFoot")).toBe("right-leg");
  });

  it("assigns every visible composite pixel to exactly one nearest ID layer", () => {
    const composite = Uint8ClampedArray.from([
      ...pixel(100, 90, 80),
      ...pixel(120, 110, 100),
      ...pixel(140, 130, 120),
      ...pixel(0, 0, 0, 0),
      ...pixel(160, 150, 140),
      ...pixel(180, 170, 160),
    ]);
    const ids = [
      STUDIO_MANNEQUIN_SEMANTIC_PARTS[0]!,
      STUDIO_MANNEQUIN_SEMANTIC_PARTS[1]!,
      STUDIO_MANNEQUIN_SEMANTIC_PARTS[2]!,
      STUDIO_MANNEQUIN_SEMANTIC_PARTS[3]!,
      STUDIO_MANNEQUIN_SEMANTIC_PARTS[4]!,
      STUDIO_MANNEQUIN_SEMANTIC_PARTS[5]!,
    ];
    const idPass = Uint8ClampedArray.from(
      ids.flatMap((part) => pixel(part.rgb[0], part.rgb[1], part.rgb[2])),
    );

    const layers = partitionStudioMannequinSemanticLayers({
      width: 3,
      height: 2,
      composite,
      idPass,
    });

    expect(layers.map((layer) => layer.visiblePixelCount)).toEqual([1, 1, 1, 0, 1, 1]);
    for (let offset = 0; offset < composite.length; offset += 4) {
      const ownerCount = layers.filter((layer) => layer.data[offset + 3]! > 0).length;
      expect(ownerCount).toBe(composite[offset + 3]! > 0 ? 1 : 0);
    }
  });

  it("rejects malformed capture buffers before allocating output layers", () => {
    expect(() => partitionStudioMannequinSemanticLayers({
      width: 2,
      height: 2,
      composite: new Uint8ClampedArray(12),
      idPass: new Uint8ClampedArray(16),
    })).toThrow(/전체 렌더 RGBA/);
  });
});
