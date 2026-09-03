import { describe, expect, it } from "vitest";

import { DEFAULT_SHAPER_SELECTION } from "./studio-shaper-model";
import { applyShaperSelectionDeltaToBodyParams } from "./studio-shaper-selection-delta";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
} from "./studio-mannequin-model";

const BASE = {
  ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  ...STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
};

describe("applyShaperSelectionDeltaToBodyParams", () => {
  it("changes an eye slot without resetting manual body or face values", () => {
    const current = {
      ...BASE,
      shoulderWidth: 1.23,
      legLength: 1.17,
      faceWidth: 0.91,
      chinLength: 1.09,
    };
    const previous = { ...DEFAULT_SHAPER_SELECTION };
    const next = { ...previous, eye: "eye-large" };

    expect(applyShaperSelectionDeltaToBodyParams(current, previous, next)).toEqual({
      ...current,
      eyeScale: 1.15,
    });
  });

  it("applies every changed category in a style recipe while preserving unrelated edits", () => {
    const current = {
      ...BASE,
      armLength: 1.19,
    };
    const previous = { ...DEFAULT_SHAPER_SELECTION };
    const next = {
      ...previous,
      body: "body-muscular",
      face: "face-sharp",
      eye: "eye-large",
      nose: "nose-high",
      bodypose: "pose-sword",
    };

    const result = applyShaperSelectionDeltaToBodyParams(current, previous, next);
    expect(result.build).toBe(3);
    expect(result.shoulderWidth).toBe(1.3);
    expect(result.faceWidth).toBe(0.82);
    expect(result.chinLength).toBe(1.15);
    expect(result.eyeScale).toBe(1.15);
    expect(result.noseHeight).toBe(1.18);
    // Body changed, so its authored arm length intentionally replaces the manual value.
    expect(result.armLength).toBe(1.05);
  });

  it("leaves all geometry untouched for pose-only changes", () => {
    const current = {
      ...BASE,
      heightCm: 193,
      shoulderWidth: 0.84,
      eyeScale: 1.21,
    };
    const previous = { ...DEFAULT_SHAPER_SELECTION };
    const next = { ...previous, bodypose: "pose-run", handpose: "hand-fist" };

    expect(applyShaperSelectionDeltaToBodyParams(current, previous, next)).toEqual(current);
  });
});
