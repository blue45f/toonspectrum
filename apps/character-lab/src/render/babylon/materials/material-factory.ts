/**
 * PBR 재질 팩토리: material-presets 표를 Babylon PBRMaterial에 바인딩한다.
 * - 절차 소스: 프리셋 전체(금속·거칠기·색·시인·클리어코트·이방성·SSS)를 적용한다.
 * - 제작 패키지: 로더가 만든 PBR(텍스처 포함)을 보존하고 역할별 추가 기능(피부 SSS·헤어 이방성·의상 시인·눈 클리어코트)만 켠다.
 * SSS는 PrePass(SubSurfaceConfiguration)가 가용할 때만 켠다 — NullEngine·WebGL1에서는 scene-features에 사유를 남긴다.
 */
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector2 } from "@babylonjs/core/Maths/math.vector.js";

import { MATERIAL_PRESETS, ROLE_DEFAULT_PRESET, hexToLinear, sheenColor } from "../../material-presets";

import type { MaterialPresetId, PartRole } from "../../../contracts";
import type { MaterialPresetParams } from "../../material-presets";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

export interface MaterialFactoryOptions {
  readonly scene: Scene;
  /** scene.enableSubSurfaceForPrePass()가 성공했는지 */
  readonly sssAvailable: boolean;
}

function linearColor(hex: string): Color3 {
  const rgb = hexToLinear(hex);
  return new Color3(rgb[0], rgb[1], rgb[2]);
}

function applyFeatures(options: MaterialFactoryOptions, material: PBRMaterial, preset: MaterialPresetParams, albedoLinear: readonly [number, number, number]): void {
  material.sheen.isEnabled = preset.sheen !== undefined;
  if (preset.sheen) {
    material.sheen.intensity = preset.sheen.intensity;
    material.sheen.roughness = preset.sheen.roughness;
    const color = sheenColor(albedoLinear, preset.sheen);
    material.sheen.color = new Color3(color[0], color[1], color[2]);
  }
  material.clearCoat.isEnabled = preset.clearCoat !== undefined;
  if (preset.clearCoat) {
    material.clearCoat.intensity = preset.clearCoat.intensity;
    material.clearCoat.roughness = preset.clearCoat.roughness;
  }
  material.anisotropy.isEnabled = preset.anisotropy !== undefined;
  if (preset.anisotropy) {
    material.anisotropy.intensity = preset.anisotropy.intensity;
    material.anisotropy.direction = new Vector2(preset.anisotropy.direction[0], preset.anisotropy.direction[1]);
  }
  const sss = preset.subsurface !== undefined && options.sssAvailable;
  material.subSurface.isScatteringEnabled = sss;
  if (sss && preset.subsurface) {
    const profile = preset.subsurface.diffusionProfile;
    material.subSurface.scatteringDiffusionProfile = new Color3(profile[0], profile[1], profile[2]);
  }
}

/** 프리셋 전체를 재질에 적용한다(절차 소스·프리셋 교체). albedoHex가 null이면 색은 유지. */
export function applyPresetParams(options: MaterialFactoryOptions, material: PBRMaterial, presetId: MaterialPresetId, albedoHex: string | null): void {
  const preset = MATERIAL_PRESETS[presetId];
  material.metallic = preset.metallic;
  material.roughness = preset.roughness;
  material.backFaceCulling = preset.backFaceCulling;
  material.twoSidedLighting = !preset.backFaceCulling;
  material.unlit = preset.unlit === true;
  if (albedoHex !== null) material.albedoColor = linearColor(albedoHex);
  const albedo: readonly [number, number, number] = [material.albedoColor.r, material.albedoColor.g, material.albedoColor.b];
  const emissive = preset.emissiveScale ?? 0;
  material.emissiveColor = emissive > 0 ? new Color3(albedo[0] * emissive, albedo[1] * emissive, albedo[2] * emissive) : Color3.Black();
  applyFeatures(options, material, preset, albedo);
}

/** 프리셋 재질을 새로 만든다(절차 소스 파츠). */
export function createPresetMaterial(options: MaterialFactoryOptions, name: string, presetId: MaterialPresetId, albedoHex: string): PBRMaterial {
  const material = new PBRMaterial(name, options.scene);
  applyPresetParams(options, material, presetId, albedoHex);
  return material;
}

/** 재질 색만 바꾼다(레시피 색). emissive·시인 색도 알베도에서 파생한다. */
export function setMaterialAlbedo(material: PBRMaterial, presetId: MaterialPresetId, hex: string): void {
  const preset = MATERIAL_PRESETS[presetId];
  material.albedoColor = linearColor(hex);
  const albedo: readonly [number, number, number] = [material.albedoColor.r, material.albedoColor.g, material.albedoColor.b];
  const emissive = preset.emissiveScale ?? 0;
  if (emissive > 0) material.emissiveColor = new Color3(albedo[0] * emissive, albedo[1] * emissive, albedo[2] * emissive);
  if (preset.sheen && material.sheen.isEnabled) {
    const color = sheenColor(albedo, preset.sheen);
    material.sheen.color = new Color3(color[0], color[1], color[2]);
  }
}

/**
 * 로더가 만든 재질을 역할에 맞게 보강한다. PBR이 아니면(비표준 로더 결과) 프리셋 재질로 교체한다.
 * 금속·거칠기·알베도(텍스처)는 보존하고 역할 기능만 켠다.
 */
export function adaptLoadedMaterial(options: MaterialFactoryOptions, material: Material | null, role: PartRole, fallbackName: string): { material: PBRMaterial; replaced: boolean } {
  const presetId = ROLE_DEFAULT_PRESET[role];
  if (material instanceof PBRMaterial) {
    const preset = MATERIAL_PRESETS[presetId];
    const albedo: readonly [number, number, number] = [material.albedoColor.r, material.albedoColor.g, material.albedoColor.b];
    applyFeatures(options, material, preset, albedo);
    if (preset.unlit) material.unlit = true;
    return { material, replaced: false };
  }
  return { material: createPresetMaterial(options, fallbackName, presetId, MATERIAL_PRESETS[presetId].defaultColor), replaced: true };
}
