// V12 lane 5 WESL PoC — HSL 스테이지 모듈(연산 키 "hsl" 과 1:1).
//
// 기존 생성기(emitHslStage)와 동일: nativeHSL(konva verbatim)의 3×3 행렬
// + luminance 오프셋을 uniform 행 벡터(vec4, w=luminance)로 받아 dot 만
// 수행하고 스테이지 경계에서 양자화한다. 행렬 계수는 CPU 패커
// (packWgslVariantUniform → hslCoefficients, f64)가 계산한다.

import package::common::studio_quantize_byte;

@if(hsl)
fn studio_hsl_stage(
  rgb : vec3<u32>,
  row_r : vec4<f32>,
  row_g : vec4<f32>,
  row_b : vec4<f32>,
) -> vec3<u32> {
  let p = vec4<f32>(f32(rgb.x), f32(rgb.y), f32(rgb.z), 1.0);
  return vec3<u32>(
    studio_quantize_byte(dot(p, row_r)),
    studio_quantize_byte(dot(p, row_g)),
    studio_quantize_byte(dot(p, row_b)),
  );
}
