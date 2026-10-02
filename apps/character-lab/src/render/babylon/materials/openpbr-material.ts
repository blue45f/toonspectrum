/**
 * OpenPBR 재질(베타): PBR 프리셋(`MaterialPresetParams`)을 `OpenPBRMaterial`(Babylon 9.19)로 옮긴 대체 경로. 수치 변환은 순수 모듈
 * `render/openpbr-mapping.ts`가 하고 여기서는 Babylon 속성에 넣기만 한다. 엔진 본체가 **동적 import**로만 불러온다(OpenPBR 셰이더는 크다).
 *
 * 요구·한계: WebGL2 이상 또는 WebGPU가 필요하다(Babylon이 WebGL1에서 오류를 낸다 — 능력 판정은 `beta-support.ts`). 페인트 데칼은 보이지 않는다(OpenPBRMaterial에 decalMap 플러그인 없음).
 * 생성자가 청색 노이즈 PNG 1장을 assets.babylonjs.com에서 받는다(장면당 1회, 외부 요청 — 베타를 켤 때만 발생). 셰이더 컴파일·렌더 결과는 브라우저 미검증.
 */
import { OpenPBRMaterial } from "@babylonjs/core/Materials/PBR/openpbrMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector2 } from "@babylonjs/core/Maths/math.vector.js";

import type { OpenPbrParams } from "../../openpbr-mapping";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

function color(rgb: readonly [number, number, number]): Color3 {
  return new Color3(rgb[0], rgb[1], rgb[2]);
}

/** 매핑 결과를 재질에 적용한다(재질 생성·프리셋 교체·색 변경에 공용). 알베도 텍스처 설정은 건드리지 않는다. */
export function applyOpenPbrParams(material: OpenPBRMaterial, params: OpenPbrParams): void {
  material.baseColor = color(params.baseColor);
  material.baseMetalness = params.baseMetalness;
  material.specularRoughness = params.specularRoughness;
  material.coatWeight = params.coatWeight;
  material.coatRoughness = params.coatRoughness;
  material.coatIor = params.coatIor;
  material.fuzzWeight = params.fuzzWeight;
  material.fuzzRoughness = params.fuzzRoughness;
  material.fuzzColor = color(params.fuzzColor);
  material.specularRoughnessAnisotropy = params.specularRoughnessAnisotropy;
  material.geometryTangent = new Vector2(params.geometryTangent[0], params.geometryTangent[1]);
  material.subsurfaceWeight = params.subsurfaceWeight;
  material.subsurfaceColor = color(params.subsurfaceColor);
  material.subsurfaceRadius = params.subsurfaceRadius;
  material.subsurfaceRadiusScale = color(params.subsurfaceRadiusScale);
  material.emissionColor = color(params.emissionColor);
  material.emissionLuminance = params.emissionLuminance;
  material.unlit = params.unlit;
  material.backFaceCulling = params.backFaceCulling;
  material.twoSidedLighting = params.twoSidedLighting;
}

/** OpenPBR 재질을 만들고 파라미터를 적용한다. */
export function createOpenPbrMaterial(scene: Scene, name: string, params: OpenPbrParams): OpenPBRMaterial {
  const material = new OpenPBRMaterial(name, scene);
  applyOpenPbrParams(material, params);
  return material;
}

/** 알베도 텍스처(패키지 알베도·입 안 마스크)를 기본색 텍스처로 쓴다(null이면 제거). */
export function setOpenPbrAlbedoTexture(material: OpenPBRMaterial, texture: BaseTexture | null): void {
  material.baseColorTexture = texture;
}

export type { OpenPBRMaterial };
