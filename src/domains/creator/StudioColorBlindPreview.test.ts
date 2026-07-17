import { describe, expect, it } from "vitest";

import { colorBlindFilterStyle } from "./StudioColorBlindPreview";

describe("colorBlindFilterStyle", () => {
  it("returns no filter for none", () => {
    expect(colorBlindFilterStyle("none")).toEqual({});
  });

  it("returns a plain CSS grayscale filter, not an SVG matrix", () => {
    expect(colorBlindFilterStyle("grayscale")).toEqual({ filter: "grayscale(1)" });
  });

  it("still routes the 3 CVD modes through the SVG feColorMatrix defs by id", () => {
    expect(colorBlindFilterStyle("protanopia")).toEqual({ filter: "url(#cvd-protanopia)" });
    expect(colorBlindFilterStyle("deuteranopia")).toEqual({ filter: "url(#cvd-deuteranopia)" });
    expect(colorBlindFilterStyle("tritanopia")).toEqual({ filter: "url(#cvd-tritanopia)" });
  });
});
