import { describe, expect, it } from "vitest";

import { MATERIAL_PRESET_IDS } from "../contracts";

import { MATERIAL_PRESETS, hexToLinear, sheenColor } from "./material-presets";
import { OPENPBR_COAT_IOR, OPENPBR_DIFFERENCES_KO, OPENPBR_SKIN_SSS_RADIUS_M, mapPresetToOpenPbr } from "./openpbr-mapping";

const ALBEDO = [0.4, 0.3, 0.2] as const;

describe("openpbr-mapping", () => {
  it("모든 프리셋 11종이 범위 안의 파라미터로 매핑된다", () => {
    expect(MATERIAL_PRESET_IDS).toHaveLength(11);
    for (const id of MATERIAL_PRESET_IDS) {
      const preset = MATERIAL_PRESETS[id];
      const out = mapPresetToOpenPbr(preset, hexToLinear(preset.defaultColor), { sssAvailable: true });
      for (const value of [out.baseMetalness, out.specularRoughness, out.coatWeight, out.coatRoughness, out.fuzzWeight, out.fuzzRoughness, out.specularRoughnessAnisotropy, out.subsurfaceWeight]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(out.baseMetalness).toBe(preset.metallic);
      expect(out.specularRoughness).toBe(preset.roughness);
      expect(out.backFaceCulling).toBe(preset.backFaceCulling);
      expect(out.twoSidedLighting).toBe(!preset.backFaceCulling);
      expect(out.unlit).toBe(preset.unlit === true);
      expect(out.coatIor).toBe(OPENPBR_COAT_IOR);
    }
  });

  it("클리어코트·시인·이방성·emissive를 같은 이름 규약으로 옮긴다", () => {
    const eye = mapPresetToOpenPbr(MATERIAL_PRESETS["eye-wet"], ALBEDO, { sssAvailable: true });
    expect(eye.coatWeight).toBe(1);
    expect(eye.coatRoughness).toBe(0.04);
    const silk = mapPresetToOpenPbr(MATERIAL_PRESETS["cloth-silk"], ALBEDO, { sssAvailable: true });
    expect(silk.fuzzWeight).toBe(0.8);
    expect(silk.fuzzRoughness).toBe(0.25);
    expect(silk.fuzzColor).toEqual(sheenColor(ALBEDO, { intensity: 0.8, roughness: 0.25, tintFromAlbedo: true }));
    const cotton = mapPresetToOpenPbr(MATERIAL_PRESETS["cloth-cotton"], ALBEDO, { sssAvailable: true });
    expect(cotton.fuzzColor).toEqual([1, 1, 1]);
    const hair = mapPresetToOpenPbr(MATERIAL_PRESETS["hair-aniso"], ALBEDO, { sssAvailable: true });
    expect(hair.specularRoughnessAnisotropy).toBe(0.6);
    expect(hair.geometryTangent).toEqual([0, 1]);
    const iris = mapPresetToOpenPbr(MATERIAL_PRESETS.iris, ALBEDO, { sssAvailable: true });
    expect(iris.emissionLuminance).toBe(0.08);
    expect(iris.emissionColor).toEqual(ALBEDO);
    const unlit = mapPresetToOpenPbr(MATERIAL_PRESETS["unlit-highlight"], ALBEDO, { sssAvailable: true });
    expect(unlit.unlit).toBe(true);
    expect(unlit.emissionLuminance).toBe(1);
  });

  it("기능이 없는 프리셋은 가중치 0이다", () => {
    const metal = mapPresetToOpenPbr(MATERIAL_PRESETS.metal, ALBEDO, { sssAvailable: true });
    expect(metal).toMatchObject({ baseMetalness: 1, coatWeight: 0, fuzzWeight: 0, specularRoughnessAnisotropy: 0, subsurfaceWeight: 0, emissionLuminance: 0 });
    expect(metal.geometryTangent).toEqual([1, 0]);
  });

  it("피부 SSS: 확산 프로파일을 최대 채널 1로 정규화한 배율과 평균 자유 경로로 근사하고, SSS 불가 엔진이면 가중치 0", () => {
    const profile = MATERIAL_PRESETS["skin-sss"].subsurface?.diffusionProfile ?? [0, 0, 0];
    const on = mapPresetToOpenPbr(MATERIAL_PRESETS["skin-sss"], ALBEDO, { sssAvailable: true });
    expect(on.subsurfaceWeight).toBe(1);
    expect(on.subsurfaceRadius).toBe(OPENPBR_SKIN_SSS_RADIUS_M);
    expect(Math.max(...on.subsurfaceRadiusScale)).toBe(1);
    expect(on.subsurfaceRadiusScale[1]).toBeCloseTo((profile[1] as number) / (profile[0] as number), 12);
    expect(on.subsurfaceColor).toEqual(ALBEDO);
    const off = mapPresetToOpenPbr(MATERIAL_PRESETS["skin-sss"], ALBEDO, { sssAvailable: false });
    expect(off.subsurfaceWeight).toBe(0);
    expect(off.subsurfaceRadius).toBe(0);
  });

  it("범위를 벗어난 프리셋 값은 [0, 1]로 자른다", () => {
    const out = mapPresetToOpenPbr({ metallic: 2, roughness: -1, defaultColor: "#ffffff", backFaceCulling: true, clearCoat: { intensity: 3, roughness: -2 } }, ALBEDO, { sssAvailable: true });
    expect(out.baseMetalness).toBe(1);
    expect(out.specularRoughness).toBe(0);
    expect(out.coatWeight).toBe(1);
    expect(out.coatRoughness).toBe(0);
  });

  it("차이점 목록은 한글이고 페인트 데칼 미지원과 외부 요청을 밝힌다", () => {
    expect(OPENPBR_DIFFERENCES_KO.some((line) => line.includes("데칼"))).toBe(true);
    expect(OPENPBR_DIFFERENCES_KO.some((line) => line.includes("외부 요청"))).toBe(true);
    for (const line of OPENPBR_DIFFERENCES_KO) expect(line).toMatch(/[가-힣]/u);
  });
});
