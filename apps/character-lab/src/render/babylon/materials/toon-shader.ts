/**
 * 커스텀 ShaderMaterial(툰·밑색·법선·ID·깊이 패스). shader-sources.ts의 GLSL/WGSL 2벌을 ShaderStore에 등록하고
 * 엔진 언어(WebGPU=WGSL, 그 외=GLSL)에 맞춰 재질을 만든다. 스키닝·morph attribute는 ShaderMaterial이 자동 추가한다.
 * NodeMaterial 툰은 베타 토글(미구현·문서 표기)이며 기본 경로는 이 ShaderMaterial이다.
 */
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore.js";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector.js";

import {
  CHARACTER_SHADER_ATTRIBUTES,
  CHARACTER_SHADER_BASE_UNIFORMS,
  CHARACTER_SHADER_DEFINES,
  CHARACTER_SHADER_SOURCES,
  CHARACTER_SHADER_UNIFORM_BUFFERS,
  CHARACTER_VERTEX_SHADER_NAME,
  DEPTH_UNIFORMS,
  FLAT_SAMPLERS,
  FLAT_UNIFORMS,
  FRAGMENT_SHADER_NAMES,
  ID_UNIFORMS,
  TOON_SAMPLERS,
  TOON_UNIFORMS,
} from "../../shader-sources";

import type { CharacterShaderKey } from "../../shader-sources";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";

export type PassMaterialKind = Exclude<CharacterShaderKey, "vertex">;

let registered = false;

/** ShaderStore에 GLSL·WGSL 소스를 등록한다(멱등). */
export function registerCharacterShaders(): void {
  if (registered) return;
  const glsl = ShaderStore.ShadersStore;
  const wgsl = ShaderStore.ShadersStoreWGSL;
  glsl[`${CHARACTER_VERTEX_SHADER_NAME}VertexShader`] = CHARACTER_SHADER_SOURCES.vertex.glsl;
  wgsl[`${CHARACTER_VERTEX_SHADER_NAME}VertexShader`] = CHARACTER_SHADER_SOURCES.vertex.wgsl;
  for (const kind of Object.keys(FRAGMENT_SHADER_NAMES) as PassMaterialKind[]) {
    glsl[`${FRAGMENT_SHADER_NAMES[kind]}FragmentShader`] = CHARACTER_SHADER_SOURCES[kind].glsl;
    wgsl[`${FRAGMENT_SHADER_NAMES[kind]}FragmentShader`] = CHARACTER_SHADER_SOURCES[kind].wgsl;
  }
  registered = true;
}

export function shaderLanguageFor(engine: AbstractEngine): ShaderLanguage {
  return engine.isWebGPU ? ShaderLanguage.WGSL : ShaderLanguage.GLSL;
}

export interface PassMaterialDeps {
  readonly scene: Scene;
  readonly language: ShaderLanguage;
}

function uniformsFor(kind: PassMaterialKind): string[] {
  switch (kind) {
    case "toon":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...TOON_UNIFORMS];
    case "flat":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...FLAT_UNIFORMS];
    case "id":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...ID_UNIFORMS];
    case "depth":
      return [...CHARACTER_SHADER_BASE_UNIFORMS, ...DEPTH_UNIFORMS];
    case "normal":
    default:
      return [...CHARACTER_SHADER_BASE_UNIFORMS];
  }
}

function samplersFor(kind: PassMaterialKind): string[] {
  if (kind === "toon") return [...TOON_SAMPLERS];
  if (kind === "flat") return [...FLAT_SAMPLERS];
  return [];
}

/** 패스 재질을 만든다. 텍스처·uniform 값은 호출자가 채운다. */
export function createPassMaterial(deps: PassMaterialDeps, kind: PassMaterialKind, name: string): ShaderMaterial {
  registerCharacterShaders();
  const material = new ShaderMaterial(
    name,
    deps.scene,
    { vertex: CHARACTER_VERTEX_SHADER_NAME, fragment: FRAGMENT_SHADER_NAMES[kind] },
    {
      attributes: [...CHARACTER_SHADER_ATTRIBUTES],
      uniforms: uniformsFor(kind),
      uniformBuffers: deps.language === ShaderLanguage.WGSL ? [...CHARACTER_SHADER_UNIFORM_BUFFERS] : [],
      samplers: samplersFor(kind),
      defines: [...CHARACTER_SHADER_DEFINES],
      needAlphaBlending: false,
      needAlphaTesting: false,
      shaderLanguage: deps.language,
    },
  );
  material.backFaceCulling = true;
  return material;
}

export interface ToonUniformValues {
  readonly baseColor: readonly [number, number, number];
  readonly shadeTint: readonly [number, number, number];
  readonly lightColor: readonly [number, number, number];
  readonly ambientColor: readonly [number, number, number];
  readonly toLight: readonly [number, number, number];
  readonly rimColor: readonly [number, number, number];
  readonly rampSteps: 2 | 3 | 4;
  readonly rim: boolean;
  readonly faceSdf: boolean;
  readonly hasPaint: boolean;
  readonly faceThreshold: number;
  readonly flipU: 0 | 1;
  readonly sdfOffset: number;
  readonly hasAlbedo: boolean;
}

export function setToonUniforms(material: ShaderMaterial, values: ToonUniformValues): void {
  material.setColor3("baseColor", new Color3(...values.baseColor));
  material.setColor3("shadeTint", new Color3(...values.shadeTint));
  material.setColor3("lightColor", new Color3(...values.lightColor));
  material.setColor3("ambientColor", new Color3(...values.ambientColor));
  material.setVector3("toLight", new Vector3(...values.toLight));
  material.setColor3("rimColor", new Color3(...values.rimColor));
  material.setVector4("toonParams", new Vector4(values.rampSteps, values.rim ? 1 : 0, values.faceSdf ? 1 : 0, values.hasPaint ? 1 : 0));
  material.setVector4("faceParams", new Vector4(values.faceThreshold, values.flipU, values.sdfOffset, values.hasAlbedo ? 1 : 0));
}

export interface FlatUniformValues {
  readonly baseColor: readonly [number, number, number];
  readonly hasPaint: boolean;
  readonly hasAlbedo: boolean;
}

export function setFlatUniforms(material: ShaderMaterial, values: FlatUniformValues): void {
  material.setColor3("baseColor", new Color3(...values.baseColor));
  material.setVector4("toonParams", new Vector4(3, 0, 0, values.hasPaint ? 1 : 0));
  material.setVector4("faceParams", new Vector4(0, 0, 0, values.hasAlbedo ? 1 : 0));
}

/** ID 패스 색: contracts/passes.ts encodeIdPixel과 같은 인코딩을 0..1로 */
export function setIdUniform(material: ShaderMaterial, partId: number, materialId: number): void {
  material.setVector4("idColor", new Vector4((partId & 255) / 255, ((partId >> 8) & 255) / 255, (materialId & 255) / 255, 1));
}

export function setDepthUniform(material: ShaderMaterial, near: number, far: number): void {
  material.setVector4("depthRange", new Vector4(near, far, 0, 0));
}

export interface PassTextures {
  readonly albedo: BaseTexture;
  readonly paint: BaseTexture;
  readonly sdf: BaseTexture;
}

export function setToonTextures(material: ShaderMaterial, textures: PassTextures): void {
  material.setTexture("albedoSampler", textures.albedo);
  material.setTexture("paintSampler", textures.paint);
  material.setTexture("sdfSampler", textures.sdf);
}

export function setFlatTextures(material: ShaderMaterial, textures: Pick<PassTextures, "albedo" | "paint">): void {
  material.setTexture("albedoSampler", textures.albedo);
  material.setTexture("paintSampler", textures.paint);
}
