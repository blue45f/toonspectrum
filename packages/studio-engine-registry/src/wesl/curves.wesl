// V12 lane 5 WESL PoC — 커브 스테이지 모듈(연산 키 "curves" 와 1:1).
//
// 기존 생성기(emitLutStage)와 동일: studio-curves buildCurveChannelLuts 가
// 구운 채널별 256칸 LUT 를 그대로 조회한다(비트 동일 — GPU 는 조회만).

import package::common::lut;

@if(curves)
fn studio_curves_stage(rgb : vec3<u32>, base : u32) -> vec3<u32> {
  return vec3<u32>(
    lut[base + rgb.x] & 0xffu,
    lut[base + 256u + rgb.y] & 0xffu,
    lut[base + 512u + rgb.z] & 0xffu,
  );
}
