import { describe, expect, it } from "vitest";

import {
  studioBrushDefaultSizeProfile,
  studioBrushDefaultStartWidth,
} from "./studio-brush-default-size-policy";

describe("studio brush perceived default size policy", () => {
  it("preserves deliberately fine and medium authored widths", () => {
    expect(studioBrushDefaultStartWidth("ink", 3)).toBe(3);
    expect(studioBrushDefaultStartWidth("pencil", 8)).toBe(8);
    expect(studioBrushDefaultStartWidth("watercolor", 18)).toBe(18);
    expect(studioBrushDefaultStartWidth("oil", 30)).toBe(30);
  });

  it("compresses only oversized starting footprints by material", () => {
    expect(studioBrushDefaultStartWidth("texture", 56)).toBe(38);
    expect(studioBrushDefaultStartWidth("watercolor", 64)).toBe(40);
    expect(studioBrushDefaultStartWidth("oil", 96)).toBe(44);
    expect(studioBrushDefaultStartWidth("airbrush", 58)).toBe(41);
    expect(studioBrushDefaultStartWidth("ink", 80)).toBe(20);
  });

  it("reports the authored footprint, normalized start and usable range", () => {
    expect(studioBrushDefaultSizeProfile("watercolor", 64)).toEqual({
      sourceWidth: 64,
      defaultWidth: 40,
      recommendedMin: 14,
      recommendedMax: 76,
      sizeClassLabel: "초광폭",
      normalized: true,
    });
  });

  it("clamps invalid authored values without leaking NaN into selection", () => {
    expect(studioBrushDefaultStartWidth("ink", Number.NaN)).toBe(1);
    expect(studioBrushDefaultStartWidth("oil", Number.POSITIVE_INFINITY)).toBe(1);
    expect(studioBrushDefaultStartWidth("texture", -20)).toBe(1);
  });
});
