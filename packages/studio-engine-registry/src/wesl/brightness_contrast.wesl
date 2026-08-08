// V12 lane 5 WESL PoC — brightness-contrast 스테이지 모듈.
//
// 연산 키 "brightness-contrast" 와 1:1(@if 조건 brightness_contrast).
// 기존 생성기(emitLutStage)와 동일하게 GPU 측은 256칸×3채널 LUT 조회만
// 수행한다 — 밝기 오프셋·대비 곡선·스테이지 경계 양자화는 CPU 패커
// (packWgslVariantLut → brightnessContrastLutBytes, f64)가 LUT 에 굽는다.
// nativeBrighten→nativeContrast 융합이 CPU LUT 베이크에서 일어나므로
// brightness / contrast 를 별도 GPU 스테이지로 쪼개지 않는다(쪼개면 기존
// 생성기의 스테이지 구조·LUT 레이아웃과 달라져 시맨틱 기준 진실 위반).

import package::common::lut;

@if(brightness_contrast)
fn studio_brightness_contrast_stage(rgb : vec3<u32>, base : u32) -> vec3<u32> {
  return vec3<u32>(
    lut[base + rgb.x] & 0xffu,
    lut[base + 256u + rgb.y] & 0xffu,
    lut[base + 512u + rgb.z] & 0xffu,
  );
}
