import { describe, expect, it } from "vitest";

import {
  SHAPER_HIGHLIGHT_OMISSION_REASON,
  SHAPER_PRODUCTION_CHARACTER_ID,
  SHAPER_REST_UPPER_ARM,
  applyShaperPose,
  applyShaperPresetSuggestion,
  captureShaperCharacter,
  createShaperCharacter,
  opaqueMeanAbsoluteError,
  parseShaperCharacter,
  placeShaperDrawing,
  poseFromShaperImage,
  recommendShaperPresets,
  recomposeShaperPsd,
  serializeShaperCharacter,
  shaperDrawingPoint,
  transparentFringeViolation,
  undoShaperPresetSuggestion,
  type ShaperImage,
} from "./character-shaper-grade";

function image(width: number, height: number, fill: readonly [number, number, number, number] = [255, 255, 255, 255]): ShaperImage {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = fill[0];
    rgba[i + 1] = fill[1];
    rgba[i + 2] = fill[2];
    rgba[i + 3] = fill[3];
  }
  return { width, height, rgba };
}

function stamp(target: ShaperImage, x0: number, y0: number, w: number, h: number, color: readonly [number, number, number, number]) {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || y < 0 || x >= target.width || y >= target.height) continue;
      const i = (y * target.width + x) * 4;
      target.rgba[i] = color[0];
      target.rgba[i + 1] = color[1];
      target.rgba[i + 2] = color[2];
      target.rgba[i + 3] = color[3];
    }
  }
}

function angleGap(a: number, b: number): number {
  const turn = Math.atan2(Math.sin(a - b), Math.cos(a - b));
  return Math.abs(turn);
}

function frontalFigure(): ShaperImage {
  const plate = image(96, 96);
  stamp(plate, 40, 8, 16, 18, [230, 190, 160, 255]);
  stamp(plate, 36, 28, 24, 48, [30, 30, 36, 255]);
  stamp(plate, 4, 30, 32, 8, [230, 190, 160, 255]);
  stamp(plate, 60, 30, 32, 8, [230, 190, 160, 255]);
  return plate;
}

function threeQuarterFigure(): ShaperImage {
  const plate = image(96, 96);
  stamp(plate, 34, 6, 18, 16, [230, 190, 160, 255]);
  stamp(plate, 38, 24, 18, 52, [24, 24, 30, 255]);
  stamp(plate, 8, 26, 28, 8, [230, 190, 160, 255]);
  stamp(plate, 52, 28, 10, 36, [230, 190, 160, 255]);
  return plate;
}

describe("Shaper-grade character session", () => {
  it("keeps presets and a body-region drawing when the pose changes, and restores the save", () => {
    const drawn = placeShaperDrawing(createShaperCharacter({
      face: "face-shape:round",
      hair: "hair:long",
      clothes: "top:coat",
    }), { id: "mark", region: "left-upper-arm", u: 0.7, v: 0.5, rgba: [240, 32, 48, 255] });
    expect(drawn.characterId).toBe(SHAPER_PRODUCTION_CHARACTER_ID);
    const before = shaperDrawingPoint(drawn, drawn.drawings[0]!, 96, 128);
    const posed = applyShaperPose(drawn, { leftUpperArm: 0.15, rightUpperArm: 2.6 });
    expect(posed.face).toBe("face-shape:round");
    expect(posed.hair).toBe("hair:long");
    expect(posed.clothes).toBe("top:coat");
    expect(posed.drawings[0]?.region).toBe("left-upper-arm");
    expect(shaperDrawingPoint(posed, posed.drawings[0]!, 96, 128)).not.toEqual(before);
    const captured = captureShaperCharacter(posed, 96, 128);
    let found = false;
    for (let i = 0; i < captured.beauty.length; i += 4) {
      if (captured.beauty[i] > 180 && captured.beauty[i + 1] < 80 && captured.beauty[i + 2] < 90) found = true;
    }
    expect(found).toBe(true);
    expect(parseShaperCharacter(serializeShaperCharacter(posed))).toEqual(posed);
  });

  it("recommends presets from a reference and undoes them in one step", () => {
    const reference = image(80, 100);
    stamp(reference, 10, 8, 60, 28, [20, 16, 18, 255]);
    stamp(reference, 18, 40, 44, 48, [18, 18, 22, 255]);
    const recommendation = recommendShaperPresets(reference);
    expect(recommendation.ok).toBe(true);
    if (!recommendation.ok) return;
    const start = createShaperCharacter();
    const applied = applyShaperPresetSuggestion(start, recommendation.suggestion);
    expect(applied.character.face).toBe("face-shape:round");
    expect(applied.character.hair).toBe("hair:long");
    expect(applied.character.clothes).toBe("top:coat");
    expect(applied.character).not.toEqual(start);
    expect(undoShaperPresetSuggestion(applied.undo)).toEqual(start);
  });

  it("reads frontal, three-quarter, and camera stills, and leaves a blank frame unchanged", () => {
    const start = createShaperCharacter();
    const frontal = poseFromShaperImage(frontalFigure(), start, "photo");
    expect(frontal.ok).toBe(true);
    if (frontal.ok) {
      expect(angleGap(frontal.character.pose.leftUpperArm, frontal.detected.leftUpperArm)).toBeLessThan(angleGap(SHAPER_REST_UPPER_ARM, frontal.detected.leftUpperArm));
      expect(angleGap(frontal.character.pose.rightUpperArm, frontal.detected.rightUpperArm)).toBeLessThan(angleGap(SHAPER_REST_UPPER_ARM, frontal.detected.rightUpperArm));
      expect(frontal.character.face).toBe(start.face);
    }
    const turned = poseFromShaperImage(threeQuarterFigure(), start, "photo");
    expect(turned.ok).toBe(true);
    if (turned.ok) {
      expect(angleGap(turned.character.pose.leftUpperArm, turned.detected.leftUpperArm)).toBeLessThan(angleGap(SHAPER_REST_UPPER_ARM, turned.detected.leftUpperArm));
      expect(angleGap(turned.character.pose.rightUpperArm, turned.detected.rightUpperArm)).toBeLessThan(angleGap(SHAPER_REST_UPPER_ARM, turned.detected.rightUpperArm));
      expect(turned.detected.rightUpperArm).not.toBeCloseTo(turned.detected.leftUpperArm, 1);
    }
    const still = poseFromShaperImage(frontalFigure(), start, "camera");
    expect(still.ok).toBe(true);
    if (still.ok && frontal.ok) {
      expect(still.source).toBe("camera");
      expect(still.detected.leftUpperArm).toBeCloseTo(frontal.detected.leftUpperArm, 5);
    }
    const empty = poseFromShaperImage(image(64, 64), start, "photo");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.reason.length).toBeGreaterThan(0);
    expect(empty.character).toEqual(start);
  });

  it("keeps transparent capture inside the silhouette fringe and recomposites the PSD within 2/255", () => {
    const character = placeShaperDrawing(createShaperCharacter({ clothes: "top:coat", hair: "hair:long" }), {
      id: "blush",
      region: "head",
      u: 0.5,
      v: 0.55,
      rgba: [220, 80, 90, 140],
    });
    const exported = captureShaperCharacter(character, 96, 128);
    expect(transparentFringeViolation({ width: exported.width, height: exported.height, rgba: exported.beauty })).toBe(0);
    const names = exported.layers.map((layer) => layer.name);
    expect(names).toEqual(expect.arrayContaining(["밑색-얼굴", "밑색-헤어", "밑색-의상", "음영", "주선"]));
    expect(names).not.toContain("하이라이트");
    expect(exported.omissions).toContainEqual({ name: "하이라이트", reason: SHAPER_HIGHLIGHT_OMISSION_REASON });
    const clothes = exported.layers.find((layer) => layer.name === "밑색-의상");
    expect(clothes).toBeTruthy();
    let dark = false;
    let translucent = false;
    for (let i = 0; i < exported.beauty.length; i += 4) {
      if (clothes && clothes.rgba[i + 3] > 200 && clothes.rgba[i] < 40) dark = true;
      if (exported.beauty[i + 3] > 20 && exported.beauty[i + 3] < 250) translucent = true;
    }
    expect(dark).toBe(true);
    expect(translucent).toBe(true);
    expect(opaqueMeanAbsoluteError(exported.beauty, recomposeShaperPsd(exported))).toBeLessThanOrEqual(2 / 255);
    const bald = captureShaperCharacter(createShaperCharacter({ hair: "" }), 64, 80);
    expect(bald.layers.some((layer) => layer.name === "밑색-헤어")).toBe(false);
    expect(bald.omissions.some((omission) => omission.name === "밑색-헤어" && omission.reason.length > 0)).toBe(true);
  });
});
