import {
  ENTRY_POINTS,
  INST_PARAMS_SCALARS,
  INSTANCED_BINDINGS,
  INSTANCED_BLIT_BINDINGS,
  PARAMS_EDGE_CURVE_SAMPLES,
} from "../layout";

import { COMMON_TYPES_WGSL, samplingHelpersWgsl } from "./common.wgsl";

/**
 * 렌더 인스턴싱 비교 레인(확장). 같은 Dab 64 B 레이아웃을 4개 vec4 attribute로 받아
 * 쿼드 1개/인스턴스를 그리고 fragment에서 compute 레인과 같은 `shade_dab` 수식을 쓴다.
 * 누적은 rgba16float 획 타깃에 하드웨어 블렌딩(one, one-minus-src-alpha)으로 한다.
 * 차이(명시): 프래그먼트 순서는 드라이버가 보장하는 프리미티브 순서를 따르므로 결정적이지만 f16 저장이라
 * compute 레인(f32)과 비트 동일하지 않다. smudge(문서 읽기)·습식·임파스토는 지원하지 않는다(레인이 거부).
 */
function instParamsStruct(): string {
  const lines = INST_PARAMS_SCALARS.map(([name, type]) => `  ${name}: ${type},`);
  lines.push(`  edge_curve: array<vec4<f32>, ${PARAMS_EDGE_CURVE_SAMPLES / 4}>,`);
  return `struct InstParams {\n${lines.join("\n")}\n}`;
}

const B = INSTANCED_BINDINGS;
const L = INSTANCED_BLIT_BINDINGS;

export const INSTANCED_DAB_WGSL: string = /* wgsl */ `${COMMON_TYPES_WGSL}
${instParamsStruct()}

@group(${B.params.group}) @binding(${B.params.binding}) var<uniform> ${B.params.name}: InstParams;
@group(${B.tipAtlas.group}) @binding(${B.tipAtlas.binding}) var ${B.tipAtlas.name}: texture_2d<f32>;
@group(${B.paperTex.group}) @binding(${B.paperTex.binding}) var ${B.paperTex.name}: texture_2d<f32>;
@group(${B.linSampler.group}) @binding(${B.linSampler.binding}) var ${B.linSampler.name}: sampler;
${samplingHelpersWgsl(B.params.name)}

struct InstIn {
  @builtin(vertex_index) vi: u32,
  @location(0) a0: vec4<f32>,
  @location(1) a1: vec4<f32>,
  @location(2) a2: vec4<f32>,
  @location(3) a3: vec4<u32>,
}

struct InstVsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) @interpolate(flat) f0: vec4<f32>,
  @location(1) @interpolate(flat) f1: vec4<f32>,
  @location(2) @interpolate(flat) f2: vec4<f32>,
  @location(3) @interpolate(flat) f3: vec4<u32>,
}

fn dab_from_attrs(a0: vec4<f32>, a1: vec4<f32>, a2: vec4<f32>, a3: vec4<u32>) -> Dab {
  var d: Dab;
  d.p = a0.xy;
  d.r = a0.zw;
  d.angle = a1.x;
  d.hardness = a1.y;
  d.flow = a1.z;
  d.shape_exp = a1.w;
  d.color = a2;
  d.tip_seed = a3.x;
  d.grain = bitcast<f32>(a3.y);
  d.wet = bitcast<f32>(a3.z);
  d.flags = a3.w;
  return d;
}

// 삼각형 2개 = 꼭짓점 6개: (0,0)(1,0)(0,1) (1,0)(1,1)(0,1)
fn quad_corner(vi: u32) -> vec2<f32> {
  switch (vi) {
    case 0u: { return vec2<f32>(0.0, 0.0); }
    case 1u: { return vec2<f32>(1.0, 0.0); }
    case 2u: { return vec2<f32>(0.0, 1.0); }
    case 3u: { return vec2<f32>(1.0, 0.0); }
    case 4u: { return vec2<f32>(1.0, 1.0); }
    default: { return vec2<f32>(0.0, 1.0); }
  }
}

@vertex
fn ${ENTRY_POINTS.instancedVs}(in: InstIn) -> InstVsOut {
  let d = dab_from_attrs(in.a0, in.a1, in.a2, in.a3);
  let e = dab_extent_px(d);
  let corner = quad_corner(in.vi % 6u);
  let pos = d.p + (corner * 2.0 - 1.0) * e;
  let w = f32(${B.params.name}.width);
  let h = f32(${B.params.name}.height);
  var out: InstVsOut;
  out.pos = vec4<f32>(pos.x / w * 2.0 - 1.0, 1.0 - pos.y / h * 2.0, 0.0, 1.0);
  out.f0 = in.a0;
  out.f1 = in.a1;
  out.f2 = in.a2;
  out.f3 = in.a3;
  return out;
}

@fragment
fn ${ENTRY_POINTS.instancedFs}(in: InstVsOut) -> @location(0) vec4<f32> {
  let d = dab_from_attrs(in.f0, in.f1, in.f2, in.f3);
  let px = in.pos.x;
  let py = in.pos.y;
  let dx = px - d.p.x;
  let dy = py - d.p.y;
  let e = dab_extent_px(d);
  if (dy > e || dy < -e || dx > e || dx < -e) { discard; }
  let sh = shade_dab(
    d, px, py, dx, dy, vec4<f32>(0.0),
    ${B.params.name}.edge_curve_enabled != 0u,
    ${B.params.name}.filter_mode,
    f32(${B.params.name}.tip_atlas_tile),
    ${B.params.name}.paper_enabled != 0u);
  if (!sh.hit) { discard; }
  return sh.src;
}
`;

/**
 * 풀스크린 bake/encode 패스(인스턴싱 레인 전용).
 * - `inst_bake_fs`: doc_next = blend(doc, stroke × opacity, mode) (rgba16float 타깃)
 * - `inst_encode_fs`: present/readback용 rgba8unorm = encode(blend(doc, stroke × opacity × stroke_pass))
 */
export const INSTANCED_BLIT_WGSL: string = /* wgsl */ `${COMMON_TYPES_WGSL}
${instParamsStruct()}

@group(${L.params.group}) @binding(${L.params.binding}) var<uniform> ${L.params.name}: InstParams;
@group(${L.docTex.group}) @binding(${L.docTex.binding}) var ${L.docTex.name}: texture_2d<f32>;
@group(${L.strokeTex.group}) @binding(${L.strokeTex.binding}) var ${L.strokeTex.name}: texture_2d<f32>;

struct BlitVsOut {
  @builtin(position) pos: vec4<f32>,
}

@vertex
fn ${ENTRY_POINTS.instancedBlitVs}(@builtin(vertex_index) vi: u32) -> BlitVsOut {
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  var out: BlitVsOut;
  out.pos = vec4<f32>(x, y, 0.0, 1.0);
  return out;
}

fn blit_blend(pos: vec4<f32>, stroke_scale: f32) -> vec4<f32> {
  let p = vec2<i32>(i32(pos.x), i32(pos.y));
  let doc = textureLoad(${L.docTex.name}, p, 0);
  let s = textureLoad(${L.strokeTex.name}, p, 0) * (${L.params.name}.stroke_opacity * stroke_scale);
  return blend_stroke(doc, s, ${L.params.name}.blend_mode);
}

@fragment
fn ${ENTRY_POINTS.instancedBakeFs}(in: BlitVsOut) -> @location(0) vec4<f32> {
  return blit_blend(in.pos, 1.0);
}

@fragment
fn ${ENTRY_POINTS.instancedEncodeFs}(in: BlitVsOut) -> @location(0) vec4<f32> {
  return encode_present(blit_blend(in.pos, f32(${L.params.name}.stroke_pass)));
}
`;
