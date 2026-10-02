import { ENTRY_POINTS, PRESENT_BINDINGS } from "../layout";

/**
 * present 렌더 패스: 풀스크린 삼각형 1개로 present_tex(sRGB straight + 선형 알파)를 캔버스에 올린다.
 * 캔버스는 `alphaMode: "premultiplied"`로 구성하므로 출력에서 rgb × a 로 premultiply한다.
 * 바인딩은 PRESENT_BINDINGS(group 0: 텍스처 0, 샘플러 1).
 */
export const PRESENT_WGSL: string = /* wgsl */ `
@group(${PRESENT_BINDINGS.source.group}) @binding(${PRESENT_BINDINGS.source.binding}) var ${PRESENT_BINDINGS.source.name}: texture_2d<f32>;
@group(${PRESENT_BINDINGS.sampler.group}) @binding(${PRESENT_BINDINGS.sampler.binding}) var ${PRESENT_BINDINGS.sampler.name}: sampler;

struct PresentVsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

// 꼭짓점 0:(-1,-1) 1:(3,-1) 2:(-1,3) — 화면을 덮는 삼각형 1개.
@vertex
fn ${ENTRY_POINTS.presentVs}(@builtin(vertex_index) vi: u32) -> PresentVsOut {
  let x = f32(i32(vi & 1u) * 4 - 1);
  let y = f32(i32(vi >> 1u) * 4 - 1);
  var out: PresentVsOut;
  out.pos = vec4<f32>(x, y, 0.0, 1.0);
  out.uv = vec2<f32>((x + 1.0) * 0.5, 1.0 - (y + 1.0) * 0.5);
  return out;
}

@fragment
fn ${ENTRY_POINTS.presentFs}(in: PresentVsOut) -> @location(0) vec4<f32> {
  let c = textureSampleLevel(${PRESENT_BINDINGS.source.name}, ${PRESENT_BINDINGS.sampler.name}, in.uv, 0.0);
  return vec4<f32>(c.rgb * c.a, c.a);
}
`;
