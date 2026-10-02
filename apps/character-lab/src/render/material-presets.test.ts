import { describe, expect, it } from "vitest";

import { DEFAULT_RECIPE_COLORS, MATERIAL_PRESET_IDS, PART_ROLES } from "../contracts";

import { MATERIAL_PRESETS, ROLE_COLOR_KEY, ROLE_DEFAULT_PRESET, hexToLinear, resolvePartColorHex, sheenColor, toonShadeTint } from "./material-presets";

describe("material-presets", () => {
  it("모든 프리셋 id와 역할에 항목이 있고 수치가 범위 안이다", () => {
    for (const id of MATERIAL_PRESET_IDS) {
      const preset = MATERIAL_PRESETS[id];
      expect(preset.metallic).toBeGreaterThanOrEqual(0);
      expect(preset.metallic).toBeLessThanOrEqual(1);
      expect(preset.roughness).toBeGreaterThan(0);
      expect(preset.roughness).toBeLessThanOrEqual(1);
      expect(preset.defaultColor).toMatch(/^#[0-9a-f]{6}$/u);
    }
    for (const role of PART_ROLES) expect(MATERIAL_PRESET_IDS).toContain(ROLE_DEFAULT_PRESET[role]);
    expect(MATERIAL_PRESETS["skin-sss"].subsurface).toBeDefined();
    expect(MATERIAL_PRESETS["hair-aniso"].anisotropy).toBeDefined();
    expect(MATERIAL_PRESETS["cloth-silk"].sheen?.intensity).toBeGreaterThan(MATERIAL_PRESETS["cloth-cotton"].sheen?.intensity ?? 0);
    expect(MATERIAL_PRESETS["unlit-highlight"].unlit).toBe(true);
    expect(ROLE_COLOR_KEY.hair).toBe("hair");
  });

  it("색 우선순위: 플랜 색 > 레시피 색 > 프리셋 기본색, 잘못된 형식은 건너뛴다", () => {
    const part = { materialPreset: "hair-aniso" as const, colorKey: "hair" as const };
    expect(resolvePartColorHex(part, DEFAULT_RECIPE_COLORS, "#112233")).toBe("#112233");
    expect(resolvePartColorHex(part, DEFAULT_RECIPE_COLORS)).toBe(DEFAULT_RECIPE_COLORS.hair);
    expect(resolvePartColorHex(part, null)).toBe(MATERIAL_PRESETS["hair-aniso"].defaultColor);
    expect(resolvePartColorHex(part, DEFAULT_RECIPE_COLORS, "nope")).toBe(DEFAULT_RECIPE_COLORS.hair);
    expect(resolvePartColorHex({ materialPreset: "metal" }, DEFAULT_RECIPE_COLORS)).toBe(MATERIAL_PRESETS.metal.defaultColor);
    expect(resolvePartColorHex(part, DEFAULT_RECIPE_COLORS, "#AABBCC")).toBe("#aabbcc");
  });

  it("hexToLinear·툰 틴트·시인 색은 0..1 범위", () => {
    expect(hexToLinear("#ffffff")).toEqual([1, 1, 1]);
    expect(hexToLinear("bad")).toEqual([0.2, 0.2, 0.2]);
    for (const role of PART_ROLES) for (const channel of toonShadeTint(role)) expect(channel).toBeGreaterThan(0);
    expect(toonShadeTint("skin")[0]).toBeGreaterThan(toonShadeTint("skin")[2]);
    expect(sheenColor([0.2, 0.2, 0.2], { intensity: 1, roughness: 0.5, tintFromAlbedo: false })).toEqual([1, 1, 1]);
    const tinted = sheenColor([0.2, 0.4, 0.6], { intensity: 1, roughness: 0.5, tintFromAlbedo: true });
    expect(tinted[0]).toBeGreaterThan(0.2);
    expect(tinted[2]).toBeLessThanOrEqual(1);
  });

  it("확산 프로파일은 g == b다(Babylon 9.19 addDiffusionProfile의 (r,b,g) 저장·(r,g,b) 중복 검사 불일치 우회 — 재질마다 프로파일이 늘어 console.error가 폭주했다)", () => {
    for (const id of MATERIAL_PRESET_IDS) {
      const profile = MATERIAL_PRESETS[id].subsurface?.diffusionProfile;
      if (!profile) continue;
      expect(profile[1], `${id} 확산 프로파일 g·b`).toBe(profile[2]);
    }
  });
});
