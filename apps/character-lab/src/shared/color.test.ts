import { describe, expect, it } from "vitest";

import { formatHex, hexToLinearRgb, hexToOklab, linearRgbToHex, mixHexOklab, normalizeHex, oklabToHex, parseHex } from "./color";

describe("shared/color", () => {
  it("hex 파싱·포맷·정규화", () => {
    expect(parseHex("#FF8800")).toEqual([255, 136, 0]);
    expect(parseHex("ff8800")).toBeNull();
    expect(formatHex([255, 136, 0])).toBe("#ff8800");
    expect(normalizeHex("#ABCDEF")).toBe("#abcdef");
    expect(normalizeHex("#abc")).toBeNull();
  });

  it("sRGB ↔ linear round-trip", () => {
    const linear = hexToLinearRgb("#808080");
    expect(linear).not.toBeNull();
    if (linear) {
      expect(linear[0]).toBeCloseTo(0.2158, 3);
      expect(linearRgbToHex(linear)).toBe("#808080");
    }
    expect(hexToLinearRgb("#000000")).toEqual([0, 0, 0]);
    expect(linearRgbToHex([1, 1, 1])).toBe("#ffffff");
  });

  it("OKLab round-trip이 모든 채널에서 ±1 이내", () => {
    for (const hex of ["#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#f3d3bd", "#123456"]) {
      const lab = hexToOklab(hex);
      expect(lab).not.toBeNull();
      if (!lab) continue;
      const back = parseHex(oklabToHex(lab));
      const original = parseHex(hex);
      expect(back).not.toBeNull();
      expect(original).not.toBeNull();
      if (back && original) for (let i = 0; i < 3; i += 1) expect(Math.abs((back[i] ?? 0) - (original[i] ?? 0))).toBeLessThanOrEqual(1);
    }
    const white = hexToOklab("#ffffff");
    expect(white?.[0]).toBeCloseTo(1, 3);
  });

  it("OKLab 보간은 양 끝을 보존한다", () => {
    expect(mixHexOklab("#ff0000", "#0000ff", 0)).toBe("#ff0000");
    expect(mixHexOklab("#ff0000", "#0000ff", 1)).toBe("#0000ff");
    expect(mixHexOklab("#zz0000", "#0000ff", 0.5)).toBeNull();
  });
});
