// V12 lane 5 WESL PoC — 루트 모듈(컴퓨트 엔트리 + @if 스테이지 포함/제외).
//
// @if 조건명은 연산 키와 1:1 이다:
//   brightness_contrast ↔ "brightness-contrast" · hsl ↔ "hsl" ·
//   levels ↔ "levels" · curves ↔ "curves" · color_balance ↔ "color-balance"
// 조건이 켜진 연산만 링크에 포함될 수 있다 — 꺼진 연산의 스테이지 함수는
// @if 로 선언 자체가 제거되므로, 스케줄이 참조하면 링크가 명시 실패한다
// (조건 누락 게이트). 아래 마커 상수는 루트 모듈 소속이라 조건이 켜지면
// 항상 산출 WGSL 에 남는다 — wesl-compile.ts 가 "켜진 조건 == 활성 스테이지"
// 를 이 마커로 대조해 조건 과잉도 명시 실패시킨다.
//
// 스테이지 "순서·반복"은 불리언 @if 로 표현할 수 없으므로(WESL 조건 컴파일의
// 표현력 한계 — PoC 실측 소견) 실행 스케줄은 studio_schedule 가상 모듈
// (wesl-js virtualLibs, wesl-compile.ts 가 ops 시퀀스에서 생성)이 담당한다.
// 디스패치 규약은 기존 생성기와 동일: workgroup_size 64, 행 16384 스레드.

import package::common::{src, dst, studio_repack, studio_unpack_a};
import studio_schedule::{params, studio_apply_stages};

@if(brightness_contrast) const STUDIO_WESL_STAGE_BRIGHTNESS_CONTRAST : u32 = 1u;
@if(hsl) const STUDIO_WESL_STAGE_HSL : u32 = 1u;
@if(levels) const STUDIO_WESL_STAGE_LEVELS : u32 = 1u;
@if(curves) const STUDIO_WESL_STAGE_CURVES : u32 = 1u;
@if(color_balance) const STUDIO_WESL_STAGE_COLOR_BALANCE : u32 = 1u;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.y * 16384u + gid.x;
  if (i >= params.pixel_count) { return; }
  let texel = src[i];
  let rgb = studio_apply_stages(vec3<u32>(
    texel & 0xffu,
    (texel >> 8u) & 0xffu,
    (texel >> 16u) & 0xffu,
  ));
  dst[i] = studio_repack(rgb.x, rgb.y, rgb.z, studio_unpack_a(texel));
}
