// V12 lane 5 WESL PoC — 컬러 밸런스 스테이지 모듈(연산 키 "color-balance" 와
// 1:1, @if 조건 color_balance).
//
// 기존 생성기(emitColorBalanceStage)와 동일: applyColorBalance verbatim —
// luminance 가중(t)·섀도/미드톤/하이라이트 존 가중·GAIN 1.275 포함. 존 시프트
// 값은 uniform vec4(w 미사용)로 받고 스테이지 경계에서 양자화한다.

import package::common::studio_quantize_byte;

@if(color_balance)
const STUDIO_COLOR_BALANCE_GAIN : f32 = 1.275;

@if(color_balance)
fn studio_color_balance_stage(
  rgb : vec3<u32>,
  shadows : vec4<f32>,
  midtones : vec4<f32>,
  highlights : vec4<f32>,
) -> vec3<u32> {
  let rf = f32(rgb.x);
  let gf = f32(rgb.y);
  let bf = f32(rgb.z);
  let t = (0.299 * rf + 0.587 * gf + 0.114 * bf) / 255.0;
  let sw = (1.0 - t) * (1.0 - t);
  let hw = t * t;
  let mid = 2.0 * t - 1.0;
  let mw = max(0.0, 1.0 - mid * mid);
  return vec3<u32>(
    studio_quantize_byte(rf + (sw * shadows.x + mw * midtones.x + hw * highlights.x) * STUDIO_COLOR_BALANCE_GAIN),
    studio_quantize_byte(gf + (sw * shadows.y + mw * midtones.y + hw * highlights.y) * STUDIO_COLOR_BALANCE_GAIN),
    studio_quantize_byte(bf + (sw * shadows.z + mw * midtones.z + hw * highlights.z) * STUDIO_COLOR_BALANCE_GAIN),
  );
}
