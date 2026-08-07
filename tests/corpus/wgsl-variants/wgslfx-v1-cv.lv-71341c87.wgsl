// wgsl-variant wgslfx-v1-cv.lv-71341c87
// structure: v1:curves[lut256x3]|levels[lut256x3]
struct Params {
  pixel_count : u32,
  _pad0 : u32,
  _pad1 : u32,
  _pad2 : u32,
}

@group(0) @binding(0) var<storage, read> src : array<u32>;
@group(0) @binding(1) var<storage, read_write> dst : array<u32>;
@group(0) @binding(2) var<uniform> params : Params;
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

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.y * 16384u + gid.x;
  if (i >= params.pixel_count) { return; }
  let texel = src[i];
  var r : u32 = texel & 0xffu;
  var g : u32 = (texel >> 8u) & 0xffu;
  var b : u32 = (texel >> 16u) & 0xffu;
  let a = studio_unpack_a(texel);
  // stage 0: curves (lut base 0)
  r = lut[0u + r] & 0xffu;
  g = lut[256u + g] & 0xffu;
  b = lut[512u + b] & 0xffu;
  // stage 1: levels (lut base 768)
  r = lut[768u + r] & 0xffu;
  g = lut[1024u + g] & 0xffu;
  b = lut[1280u + b] & 0xffu;
  dst[i] = studio_repack(r, g, b, a);
}
