// wgsl-variant wgslfx-v1-cb.cv-e1f8d26e
// structure: v1:color-balance[highlights,midtones,shadows]|curves[lut256x3]
struct Params {
  pixel_count : u32,
  _pad0 : u32,
  _pad1 : u32,
  _pad2 : u32,
  s0_shadows : vec4<f32>,
  s0_midtones : vec4<f32>,
  s0_highlights : vec4<f32>,
}

@group(0) @binding(0) var<storage, read> src : array<u32>;
@group(0) @binding(1) var<storage, read_write> dst : array<u32>;
@group(0) @binding(2) var<uniform> params : Params;
@group(0) @binding(3) var<storage, read> lut : array<u32>;

const STUDIO_COLOR_BALANCE_GAIN : f32 = 1.275;

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
  // stage 0: color-balance (applyColorBalance verbatim)
  {
    let rf = f32(r);
    let gf = f32(g);
    let bf = f32(b);
    let t = (0.299 * rf + 0.587 * gf + 0.114 * bf) / 255.0;
    let sw = (1.0 - t) * (1.0 - t);
    let hw = t * t;
    let mid = 2.0 * t - 1.0;
    let mw = max(0.0, 1.0 - mid * mid);
    r = studio_quantize_byte(rf + (sw * params.s0_shadows.x + mw * params.s0_midtones.x + hw * params.s0_highlights.x) * STUDIO_COLOR_BALANCE_GAIN);
    g = studio_quantize_byte(gf + (sw * params.s0_shadows.y + mw * params.s0_midtones.y + hw * params.s0_highlights.y) * STUDIO_COLOR_BALANCE_GAIN);
    b = studio_quantize_byte(bf + (sw * params.s0_shadows.z + mw * params.s0_midtones.z + hw * params.s0_highlights.z) * STUDIO_COLOR_BALANCE_GAIN);
  }
  // stage 1: curves (lut base 0)
  r = lut[0u + r] & 0xffu;
  g = lut[256u + g] & 0xffu;
  b = lut[512u + b] & 0xffu;
  dst[i] = studio_repack(r, g, b, a);
}
