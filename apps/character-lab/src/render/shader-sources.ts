/**
 * 캐릭터 커스텀 셰이더 소스(순수 문자열). GLSL(WebGL2)과 WGSL(WebGPU) 2벌을 같은 의미로 유지한다.
 *
 * 공통 정점 셰이더는 Babylon include(bones/morph/instances)를 써서 스키닝·morph 텍스처 모드를 그대로 지원한다.
 * 프래그먼트 변형: toon(계단 램프 + 얼굴 SDF 그림자 + 림 + 알베도/페인트 데칼), flat(밑색), normal(월드 법선),
 * id(부위/재질 ID), depth(선형 뷰 깊이 RGBA8 패킹 — readback.ts `packDepthRgba8`과 같은 식).
 * 참고: MToon 1.0 수식 구조(N·L 음영 → linearstep → mix(shade, base)), lilToon의 fwidth 밴드 AA 개념. 코드 복제 아님.
 */

/** ShaderStore 키 접두 */
export const CHARACTER_VERTEX_SHADER_NAME = "clCharacter";
export const TOON_FRAGMENT_SHADER_NAME = "clToon";
export const FLAT_FRAGMENT_SHADER_NAME = "clFlat";
export const NORMAL_FRAGMENT_SHADER_NAME = "clNormal";
export const ID_FRAGMENT_SHADER_NAME = "clId";
export const DEPTH_FRAGMENT_SHADER_NAME = "clDepth";

/** 정점 attribute(ShaderMaterial options.attributes). 스키닝·morph attribute는 ShaderMaterial이 자동 추가한다. */
export const CHARACTER_SHADER_ATTRIBUTES: readonly string[] = ["position", "normal", "uv"];
/** ShaderMaterial이 자동 바인딩하는 행렬·카메라 uniform */
export const CHARACTER_SHADER_BASE_UNIFORMS: readonly string[] = ["world", "view", "viewProjection", "cameraPosition"];
/** WGSL 전용 UBO 이름 */
export const CHARACTER_SHADER_UNIFORM_BUFFERS: readonly string[] = ["Scene", "Mesh"];
/** morph normal·uv 변형을 켜는 define */
export const CHARACTER_SHADER_DEFINES: readonly string[] = ["#define NORMAL", "#define UV1"];

export const TOON_UNIFORMS: readonly string[] = ["baseColor", "shadeTint", "lightColor", "ambientColor", "toLight", "rimColor", "toonParams", "faceParams"];
export const TOON_SAMPLERS: readonly string[] = ["albedoSampler", "paintSampler", "sdfSampler"];
export const FLAT_UNIFORMS: readonly string[] = ["baseColor", "toonParams", "faceParams"];
export const FLAT_SAMPLERS: readonly string[] = ["albedoSampler", "paintSampler"];
export const ID_UNIFORMS: readonly string[] = ["idColor"];
/** depthRange: x=near, y=far(카메라 뷰 깊이, m), z·w 예비 */
export const DEPTH_UNIFORMS: readonly string[] = ["depthRange"];

export const CHARACTER_VERTEX_GLSL = `precision highp float;
attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
uniform mat4 view;
uniform mat4 viewProjection;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
void main(void) {
  vec3 positionUpdated = position;
  vec3 normalUpdated = normal;
  vec2 uvUpdated = uv;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
  vec4 worldPos = finalWorld * vec4(positionUpdated, 1.0);
  vPositionW = worldPos.xyz;
  vNormalW = normalize(mat3(finalWorld) * normalUpdated);
  vUV = uvUpdated;
  vViewZ = -(view * worldPos).z;
  gl_Position = viewProjection * worldPos;
}
`;

export const CHARACTER_VERTEX_WGSL = `#include<sceneUboDeclaration>
#include<meshUboDeclaration>
attribute position: vec3f;
attribute normal: vec3f;
attribute uv: vec2f;
#include<bonesDeclaration>
#include<morphTargetsVertexGlobalDeclaration>
#include<morphTargetsVertexDeclaration>[0..maxSimultaneousMorphTargets]
#include<instancesDeclaration>
varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
@vertex
fn main(input: VertexInputs) -> FragmentInputs {
  var positionUpdated: vec3f = vertexInputs.position;
  var normalUpdated: vec3f = vertexInputs.normal;
  var uvUpdated: vec2f = vertexInputs.uv;
#include<morphTargetsVertexGlobal>
#include<morphTargetsVertex>[0..maxSimultaneousMorphTargets]
#include<instancesVertex>
#include<bonesVertex>
  let worldPos: vec4f = finalWorld * vec4f(positionUpdated, 1.0);
  vertexOutputs.vPositionW = worldPos.xyz;
  vertexOutputs.vNormalW = normalize(mat3x3f(finalWorld[0].xyz, finalWorld[1].xyz, finalWorld[2].xyz) * normalUpdated);
  vertexOutputs.vUV = uvUpdated;
  vertexOutputs.vViewZ = -(scene.view * worldPos).z;
  vertexOutputs.position = scene.viewProjection * worldPos;
}
`;

/**
 * toonParams: x=rampSteps(2..4), y=rim(0/1), z=faceSdf(0/1), w=hasPaint(0/1)
 * faceParams: x=threshold(0.5·(1−fdotl)), y=flipU(0/1), z=sdfOffset, w=hasAlbedo(0/1)
 * 텍스처 샘플은 균일 제어 흐름을 위해 분기 밖에서 한 번만 읽는다(WGSL 규칙).
 */
export const TOON_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
uniform vec3 cameraPosition;
uniform vec3 baseColor;
uniform vec3 shadeTint;
uniform vec3 lightColor;
uniform vec3 ambientColor;
uniform vec3 toLight;
uniform vec3 rimColor;
uniform vec4 toonParams;
uniform vec4 faceParams;
uniform sampler2D albedoSampler;
uniform sampler2D paintSampler;
uniform sampler2D sdfSampler;
void main(void) {
  vec3 n = normalize(vNormalW);
  vec4 albedoTex = texture2D(albedoSampler, vUV);
  vec4 paint = texture2D(paintSampler, vUV);
  float sdfU = mix(vUV.x, 1.0 - vUV.x, step(0.5, faceParams.y));
  float sdf = texture2D(sdfSampler, vec2(sdfU, vUV.y)).r;
  vec3 base = mix(baseColor, baseColor * albedoTex.rgb, step(0.5, faceParams.w));
  vec3 albedo = mix(base, mix(base, paint.rgb, paint.a), step(0.5, toonParams.w));
  float lambert = dot(n, normalize(toLight)) * 0.5 + 0.5;
  float faceLit = step(faceParams.x, sdf + faceParams.z);
  float faceShading = mix(0.25, 0.85, faceLit);
  float shading = mix(lambert, faceShading, step(0.5, toonParams.z));
  float steps = max(2.0, toonParams.x);
  float w = fwidth(shading) + 0.002;
  float acc = 0.0;
  for (int j = 1; j < 4; j++) {
    float fj = float(j);
    if (fj < steps) {
      float thr = fj / steps;
      acc += smoothstep(thr - w, thr + w, shading);
    }
  }
  float band = acc / (steps - 1.0);
  vec3 shadeColor = albedo * shadeTint;
  vec3 color = mix(shadeColor, albedo, band) * lightColor + albedo * ambientColor;
  vec3 v = normalize(cameraPosition - vPositionW);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float rim = smoothstep(0.55, 0.65, fresnel) * step(0.5, toonParams.y);
  color += rimColor * rim;
  gl_FragColor = vec4(color, 1.0);
}
`;

export const TOON_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
uniform cameraPosition: vec3f;
uniform baseColor: vec3f;
uniform shadeTint: vec3f;
uniform lightColor: vec3f;
uniform ambientColor: vec3f;
uniform toLight: vec3f;
uniform rimColor: vec3f;
uniform toonParams: vec4f;
uniform faceParams: vec4f;
var albedoSampler: texture_2d<f32>;
var albedoSamplerSampler: sampler;
var paintSampler: texture_2d<f32>;
var paintSamplerSampler: sampler;
var sdfSampler: texture_2d<f32>;
var sdfSamplerSampler: sampler;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let n: vec3f = normalize(fragmentInputs.vNormalW);
  let albedoTex: vec4f = textureSample(albedoSampler, albedoSamplerSampler, fragmentInputs.vUV);
  let paint: vec4f = textureSample(paintSampler, paintSamplerSampler, fragmentInputs.vUV);
  let sdfU: f32 = mix(fragmentInputs.vUV.x, 1.0 - fragmentInputs.vUV.x, step(0.5, uniforms.faceParams.y));
  let sdf: f32 = textureSample(sdfSampler, sdfSamplerSampler, vec2f(sdfU, fragmentInputs.vUV.y)).r;
  let base: vec3f = mix(uniforms.baseColor, uniforms.baseColor * albedoTex.rgb, step(0.5, uniforms.faceParams.w));
  let albedo: vec3f = mix(base, mix(base, paint.rgb, paint.a), step(0.5, uniforms.toonParams.w));
  let lambert: f32 = dot(n, normalize(uniforms.toLight)) * 0.5 + 0.5;
  let faceLit: f32 = step(uniforms.faceParams.x, sdf + uniforms.faceParams.z);
  let faceShading: f32 = mix(0.25, 0.85, faceLit);
  let shading: f32 = mix(lambert, faceShading, step(0.5, uniforms.toonParams.z));
  let steps: f32 = max(2.0, uniforms.toonParams.x);
  let w: f32 = fwidth(shading) + 0.002;
  var acc: f32 = 0.0;
  for (var j: i32 = 1; j < 4; j = j + 1) {
    let fj: f32 = f32(j);
    if (fj < steps) {
      let thr: f32 = fj / steps;
      acc = acc + smoothstep(thr - w, thr + w, shading);
    }
  }
  let band: f32 = acc / (steps - 1.0);
  let shadeColor: vec3f = albedo * uniforms.shadeTint;
  var color: vec3f = mix(shadeColor, albedo, band) * uniforms.lightColor + albedo * uniforms.ambientColor;
  let v: vec3f = normalize(uniforms.cameraPosition - fragmentInputs.vPositionW);
  let fresnel: f32 = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  let rim: f32 = smoothstep(0.55, 0.65, fresnel) * step(0.5, uniforms.toonParams.y);
  color = color + uniforms.rimColor * rim;
  fragmentOutputs.color = vec4f(color, 1.0);
}
`;

/** 밑색: baseColor(×알베도 텍스처)(+페인트 데칼), 조명·톤맵 없음 */
export const FLAT_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
uniform vec3 baseColor;
uniform vec4 toonParams;
uniform vec4 faceParams;
uniform sampler2D albedoSampler;
uniform sampler2D paintSampler;
void main(void) {
  vec4 albedoTex = texture2D(albedoSampler, vUV);
  vec4 paint = texture2D(paintSampler, vUV);
  vec3 base = mix(baseColor, baseColor * albedoTex.rgb, step(0.5, faceParams.w));
  vec3 albedo = mix(base, mix(base, paint.rgb, paint.a), step(0.5, toonParams.w));
  gl_FragColor = vec4(albedo, 1.0);
}
`;

export const FLAT_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
uniform baseColor: vec3f;
uniform toonParams: vec4f;
uniform faceParams: vec4f;
var albedoSampler: texture_2d<f32>;
var albedoSamplerSampler: sampler;
var paintSampler: texture_2d<f32>;
var paintSamplerSampler: sampler;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let albedoTex: vec4f = textureSample(albedoSampler, albedoSamplerSampler, fragmentInputs.vUV);
  let paint: vec4f = textureSample(paintSampler, paintSamplerSampler, fragmentInputs.vUV);
  let base: vec3f = mix(uniforms.baseColor, uniforms.baseColor * albedoTex.rgb, step(0.5, uniforms.faceParams.w));
  let albedo: vec3f = mix(base, mix(base, paint.rgb, paint.a), step(0.5, uniforms.toonParams.w));
  fragmentOutputs.color = vec4f(albedo, 1.0);
}
`;

/** 월드 법선 n·0.5+0.5 */
export const NORMAL_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
void main(void) {
  vec3 n = normalize(vNormalW) * 0.5 + 0.5;
  gl_FragColor = vec4(n, 1.0);
}
`;

export const NORMAL_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let n: vec3f = normalize(fragmentInputs.vNormalW) * 0.5 + 0.5;
  fragmentOutputs.color = vec4f(n, 1.0);
}
`;

/** ID: idColor = (partId&255, partId>>8, materialId, 255)/255 상수 출력 */
export const ID_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
uniform vec4 idColor;
void main(void) {
  gl_FragColor = idColor;
}
`;

export const ID_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
uniform idColor: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  fragmentOutputs.color = uniforms.idColor;
}
`;

/**
 * 깊이: d = clamp((vViewZ − near)/(far − near), 0, 1)을 RGBA8 고정소수로 패킹(readback.ts packDepthRgba8과 동일).
 * d·255 = R + G/256 + B/65536 + A/16777216. 배경은 clear(1,0,0,0) = far.
 */
export const DEPTH_FRAGMENT_GLSL = `precision highp float;
varying vec3 vPositionW;
varying vec3 vNormalW;
varying vec2 vUV;
varying float vViewZ;
uniform vec4 depthRange;
void main(void) {
  float d = clamp((vViewZ - depthRange.x) / max(depthRange.y - depthRange.x, 1e-6), 0.0, 1.0);
  float x = d * 255.0;
  float r = floor(x);
  float f1 = x - r;
  float g = floor(f1 * 256.0);
  float f2 = f1 * 256.0 - g;
  float b = floor(f2 * 256.0);
  float f3 = f2 * 256.0 - b;
  float a = min(255.0, floor(f3 * 256.0));
  gl_FragColor = vec4(r, min(255.0, g), min(255.0, b), a) / 255.0;
}
`;

export const DEPTH_FRAGMENT_WGSL = `varying vPositionW: vec3f;
varying vNormalW: vec3f;
varying vUV: vec2f;
varying vViewZ: f32;
uniform depthRange: vec4f;
@fragment
fn main(input: FragmentInputs) -> FragmentOutputs {
  let d: f32 = clamp((fragmentInputs.vViewZ - uniforms.depthRange.x) / max(uniforms.depthRange.y - uniforms.depthRange.x, 1e-6), 0.0, 1.0);
  let x: f32 = d * 255.0;
  let r: f32 = floor(x);
  let f1: f32 = x - r;
  let g: f32 = floor(f1 * 256.0);
  let f2: f32 = f1 * 256.0 - g;
  let b: f32 = floor(f2 * 256.0);
  let f3: f32 = f2 * 256.0 - b;
  let a: f32 = min(255.0, floor(f3 * 256.0));
  fragmentOutputs.color = vec4f(r, min(255.0, g), min(255.0, b), a) / 255.0;
}
`;

export interface ShaderPair {
  readonly glsl: string;
  readonly wgsl: string;
}

export type CharacterShaderKey = "vertex" | "toon" | "flat" | "normal" | "id" | "depth";

export const CHARACTER_SHADER_SOURCES: Readonly<Record<CharacterShaderKey, ShaderPair>> = Object.freeze({
  vertex: { glsl: CHARACTER_VERTEX_GLSL, wgsl: CHARACTER_VERTEX_WGSL },
  toon: { glsl: TOON_FRAGMENT_GLSL, wgsl: TOON_FRAGMENT_WGSL },
  flat: { glsl: FLAT_FRAGMENT_GLSL, wgsl: FLAT_FRAGMENT_WGSL },
  normal: { glsl: NORMAL_FRAGMENT_GLSL, wgsl: NORMAL_FRAGMENT_WGSL },
  id: { glsl: ID_FRAGMENT_GLSL, wgsl: ID_FRAGMENT_WGSL },
  depth: { glsl: DEPTH_FRAGMENT_GLSL, wgsl: DEPTH_FRAGMENT_WGSL },
});

/** 프래그먼트 키 → ShaderStore 이름 */
export const FRAGMENT_SHADER_NAMES: Readonly<Record<Exclude<CharacterShaderKey, "vertex">, string>> = Object.freeze({
  toon: TOON_FRAGMENT_SHADER_NAME,
  flat: FLAT_FRAGMENT_SHADER_NAME,
  normal: NORMAL_FRAGMENT_SHADER_NAME,
  id: ID_FRAGMENT_SHADER_NAME,
  depth: DEPTH_FRAGMENT_SHADER_NAME,
});

/** 셰이더 소스에서 `#include<name>` 이름을 순서대로 뽑는다(테스트·side-effect 점검용). */
export function listShaderIncludes(source: string): string[] {
  const out: string[] = [];
  const pattern = /#include<([a-zA-Z0-9_]+)>/gu;
  let match: RegExpExecArray | null = pattern.exec(source);
  while (match) {
    out.push(match[1] ?? "");
    match = pattern.exec(source);
  }
  return out;
}

/** 두 언어가 같은 include 집합·순서를 쓰는지(의미 동치의 1차 조건) */
export const CHARACTER_VERTEX_INCLUDES: readonly string[] = listShaderIncludes(CHARACTER_VERTEX_GLSL);
