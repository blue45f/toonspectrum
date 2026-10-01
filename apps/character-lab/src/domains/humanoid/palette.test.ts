import { describe, expect, it } from "vitest";

import { DEFAULT_RECIPE_COLORS } from "../../contracts";
import { hexToOklab, oklabDistance } from "../../shared/color";

import { HAIR_COLORS, IRIS_COLORS, PALETTES, SKIN_TONES, findPaletteEntry, paletteInvariants } from "./palette";

describe("팔레트", () => {
  it("피부 8·홍채 10·헤어 12색이고 불변식(소문자 #rrggbb·id 유일·한글 라벨)을 지킨다", () => {
    expect([SKIN_TONES.length, IRIS_COLORS.length, HAIR_COLORS.length]).toEqual([8, 10, 12]);
    for (const entries of Object.values(PALETTES)) expect(paletteInvariants(entries)).toEqual([]);
    for (const entry of [...SKIN_TONES, ...IRIS_COLORS, ...HAIR_COLORS]) expect(entry.labelKo).toMatch(/[가-힣]/u);
  });

  it("같은 팔레트 안에서 색이 서로 구별된다(OKLab 거리 ≥ 0.03)", () => {
    for (const entries of Object.values(PALETTES)) {
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const a = hexToOklab(entries[i].hex);
          const b = hexToOklab(entries[j].hex);
          expect(a && b).toBeTruthy();
          if (a && b) expect(oklabDistance(a, b)).toBeGreaterThan(0.03);
        }
      }
    }
  });

  it("기본 레시피 색이 각 팔레트의 견본으로 들어 있다", () => {
    expect(findPaletteEntry(SKIN_TONES, DEFAULT_RECIPE_COLORS.skin)?.id).toBe("fair");
    expect(findPaletteEntry(IRIS_COLORS, DEFAULT_RECIPE_COLORS.iris)?.id).toBe("dark-brown");
    expect(findPaletteEntry(HAIR_COLORS, DEFAULT_RECIPE_COLORS.hair)?.id).toBe("dark-brown");
    expect(findPaletteEntry(HAIR_COLORS, DEFAULT_RECIPE_COLORS.brow)?.id).toBe("dark-brown");
  });

  it("findPaletteEntry는 대소문자를 구분하지 않고 없는 색은 null이다", () => {
    expect(findPaletteEntry(SKIN_TONES, "#F3D3BD")?.id).toBe("fair");
    expect(findPaletteEntry(SKIN_TONES, "#000000")).toBeNull();
  });

  it("paletteInvariants가 형식 위반·중복·빈 라벨을 잡아낸다", () => {
    const problems = paletteInvariants([
      { id: "a", labelKo: "가", hex: "#ABCDEF" },
      { id: "a", labelKo: "나", hex: "#abcdef" },
      { id: "b", labelKo: " ", hex: "#abcdef" },
    ]);
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).toContain("hex 형식");
    expect(problems.join("\n")).toContain("id 중복");
    expect(problems.join("\n")).toContain("한글 라벨");
  });
});
