// V12 lane 5 WESL PoC — 공용 모듈(양자화·패킹·바인딩).
//
// 시맨틱 원본: packages/studio-engine-registry/src/wgsl-variants.ts 의
// WGSL_BYTE_HELPERS + 바인딩 선언 텍스트(시맨틱 변경 금지 이식).
//  - 픽셀은 rgba8 바이트를 u32 로 패킹한 storage buffer.
//  - 바인딩: 0=src(read) · 1=dst(read_write) · 3=lut(read, LUT 스테이지가
//    있을 때만 — @if 조건은 LUT 를 쓰는 연산 키의 합집합).
//  - 스테이지 경계 양자화 clamp(round(v), 0, 255) — WGSL round 는
//    round-half-to-even 이라 Uint8ClampedArray 대입과 동일 규칙.

@group(0) @binding(0) var<storage, read> src : array<u32>;
@group(0) @binding(1) var<storage, read_write> dst : array<u32>;

@if(brightness_contrast || levels || curves)
@group(0) @binding(3) var<storage, read> lut : array<u32>;

fn studio_unpack_r(texel : u32) -> f32 { return f32(texel & 0xffu); }
fn studio_unpack_g(texel : u32) -> f32 { return f32((texel >> 8u) & 0xffu); }
fn studio_unpack_b(texel : u32) -> f32 { return f32((texel >> 16u) & 0xffu); }
fn studio_unpack_a(texel : u32) -> u32 { return (texel >> 24u) & 0xffu; }

fn studio_quantize_byte(value : f32) -> u32 {
  return u32(clamp(round(value), 0.0, 255.0));
}

fn studio_repack(r : u32, g : u32, b : u32, a : u32) -> u32 {
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}
