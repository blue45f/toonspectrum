import { PARAMS_EDGE_CURVE_SAMPLES, TIP_ATLAS_KINDS } from "../gpu/layout";
import { CURVATURE_AA_CORRECTION, SUBPIXEL_RADIUS } from "../raster/coverage";

/**
 * WebGL2 비교 레인 GLSL ES 3.00 셰이더. 수식은 `gpu/wgsl/common.wgsl.ts`의 `shade_dab`·`superellipse_coverage`·
 * `dab_tile_bounds`·`hash_u32`·`km`·`blend_stroke`·`encode_present`와 같은 연산 순서로 포팅했다.
 * 포기(명시): f16 누적(RGBA16F), smudge(문서 읽기)·습식·임파스토 없음, 간접 디스패치·원자 없음.
 * dab 64 B 레이아웃은 4개 attribute(vec4 ×3 + uvec4)로 넘긴다(location 0..3).
 */
export const GLSL_VERSION = "#version 300 es";

/** 공통 함수(정점·프래그먼트 공용). */
export const GLSL_COMMON = /* glsl */ `
precision highp float;
precision highp int;

const float PI = 3.141592653589793;
const float SUBPIXEL_RADIUS = ${SUBPIXEL_RADIUS};
const float CURVATURE_AA_CORRECTION = ${CURVATURE_AA_CORRECTION};
const uint FLAG_ERASE = 65536u;
const uint FLAG_SMUDGE = 131072u;
const uint DEP_AIRBRUSH = 1u;
const uint DEP_SPRAY = 2u;
const uint DEP_HATCH_HALFTONE = 4u;
const uint DEP_WET_FLOW = 8u;
const int FILTER_NEAREST = 0;
const int FILTER_BILINEAR = 1;
const int FILTER_ANISOTROPIC = 3;
const uint TIP_ROUND = 0u;
const int TIP_ATLAS_KINDS = ${TIP_ATLAS_KINDS};

struct Dab {
  vec2 p;
  vec2 r;
  float angle;
  float hardness;
  float flow;
  float shape_exp;
  vec4 color;
  uint tip_seed;
  float grain;
  float wet;
  uint flags;
};

Dab dab_from_attrs(vec4 a0, vec4 a1, vec4 a2, uvec4 a3) {
  Dab d;
  d.p = a0.xy;
  d.r = a0.zw;
  d.angle = a1.x;
  d.hardness = a1.y;
  d.flow = a1.z;
  d.shape_exp = a1.w;
  d.color = a2;
  d.tip_seed = a3.x;
  d.grain = uintBitsToFloat(a3.y);
  d.wet = uintBitsToFloat(a3.z);
  d.flags = a3.w;
  return d;
}

uint dab_tip_kind(Dab d) { return d.tip_seed >> 24u; }
uint dab_seed(Dab d) { return d.tip_seed & 16777215u; }
uint dab_deposition(Dab d) { return d.flags >> 24u; }
bool dab_has_flag(Dab d, uint bit) { return (d.flags & bit) != 0u; }

float dab_feather_px(Dab d) {
  float rmin = min(d.r.x, d.r.y);
  float feather = max(1.0, (1.0 - d.hardness) * rmin);
  uint dep = dab_deposition(d);
  float scatter = 0.0;
  if (dep == DEP_AIRBRUSH || dep == DEP_SPRAY) { scatter = max(d.r.x, d.r.y); }
  return feather + scatter;
}

float dab_extent_px(Dab d) {
  return max(d.r.x, d.r.y) + dab_feather_px(d) + 1.0;
}
`;

/** 프래그먼트 전용 수식(해시·커버리지·샘플링·셰이딩). */
export const GLSL_SHADE = /* glsl */ `
uniform sampler2D u_tip_atlas;
uniform sampler2D u_paper_tex;
uniform int u_filter_mode;
uniform int u_tip_atlas_tile;
uniform int u_tip_levels;
uniform int u_paper_enabled;
uniform float u_paper_scale;
uniform float u_paper_rotation;
uniform float u_paper_size;
uniform float u_edge_curve[${PARAMS_EDGE_CURVE_SAMPLES}];
uniform int u_edge_curve_len;
uniform int u_edge_curve_enabled;

uint hash_lowbias32(uint v) {
  uint x = v;
  x ^= x >> 16u;
  x *= 2146121005u;
  x ^= x >> 15u;
  x *= 2221713035u;
  x ^= x >> 16u;
  return x;
}

uint hash_u32(uint x, uint y, uint seed) {
  uint sx = hash_lowbias32(seed ^ 2654435769u);
  uint hx = hash_lowbias32(sx ^ x);
  return hash_lowbias32(hx ^ (y * 2246822507u) ^ 668265263u);
}

float hash_noise_2d(int x, int y, uint seed) {
  return float(hash_u32(uint(x), uint(y), seed)) * 2.3283064365386963e-10;
}

float normalized_distance(float dx, float dy, Dab d) {
  float c = cos(d.angle);
  float s = sin(d.angle);
  float u = dx * c + dy * s;
  float v = -dx * s + dy * c;
  float au = abs(u / d.r.x);
  float av = abs(v / d.r.y);
  if (d.shape_exp == 2.0) { return sqrt(au * au + av * av); }
  float n = d.shape_exp;
  return pow(pow(au, n) + pow(av, n), 1.0 / n);
}

float superellipse_coverage(float dx, float dy, Dab d) {
  float rmin = min(d.r.x, d.r.y);
  if (rmin <= 0.0) { return 0.0; }
  if (rmin <= SUBPIXEL_RADIUS) {
    float area = min(1.0, PI * d.r.x * d.r.y);
    float kx = 1.0 - abs(dx);
    float ky = 1.0 - abs(dy);
    if (kx <= 0.0 || ky <= 0.0) { return 0.0; }
    return area * kx * ky;
  }
  float dn = normalized_distance(dx, dy, d);
  if (dab_deposition(d) == DEP_AIRBRUSH) { return exp(-2.0 * dn * dn); }
  // 곡률 보정 κ/24(raster/coverage.ts CURVATURE_AA_CORRECTION 미러).
  float dpx = (dn - 1.0) * rmin + CURVATURE_AA_CORRECTION / rmin;
  float feather = max(1.0, (1.0 - d.hardness) * rmin);
  return clamp((-dpx + 0.5) / feather, 0.0, 1.0);
}

float edge_curve(float c) {
  int n = u_edge_curve_len;
  if (n == 0) { return 0.0; }
  if (n == 1) { return u_edge_curve[0]; }
  float x = clamp(c, 0.0, 1.0) * float(n - 1);
  int lower = int(floor(x));
  int upper = min(n - 1, lower + 1);
  float t = x - float(lower);
  float lo = u_edge_curve[lower];
  float hi = u_edge_curve[upper];
  return lo + (hi - lo) * t;
}

float lod_for(float px_per_texel) {
  if (!(px_per_texel > 0.0)) { return 0.0; }
  return max(-log2(px_per_texel), 0.0);
}

int tip_level_size(int level) { return max(1, u_tip_atlas_tile >> level); }

float tip_texel(int kind, int level, int x, int y) {
  int n = tip_level_size(level);
  int cx = clamp(x, 0, n - 1);
  int cy = clamp(y, 0, n - 1);
  return texelFetch(u_tip_atlas, ivec2(kind * n + cx, cy), level).r;
}

float tip_nearest(int kind, int level, float u, float v) {
  int n = tip_level_size(level);
  return tip_texel(kind, level, int(floor(u * float(n))), int(floor(v * float(n))));
}

float tip_bilinear(int kind, int level, float u, float v) {
  int n = tip_level_size(level);
  if (n == 1) { return tip_texel(kind, level, 0, 0); }
  float fx = u * float(n) - 0.5;
  float fy = v * float(n) - 0.5;
  int x0 = int(floor(fx));
  int y0 = int(floor(fy));
  float tx = fx - float(x0);
  float ty = fy - float(y0);
  float a = tip_texel(kind, level, x0, y0);
  float b = tip_texel(kind, level, x0 + 1, y0);
  float c = tip_texel(kind, level, x0, y0 + 1);
  float d = tip_texel(kind, level, x0 + 1, y0 + 1);
  float top = a + (b - a) * tx;
  float bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

float tip_trilinear(int kind, float u, float v, float lod) {
  float max_lod = float(u_tip_levels - 1);
  float l = clamp(lod, 0.0, max_lod);
  float l0 = floor(l);
  float l1 = min(max_lod, l0 + 1.0);
  float t = l - l0;
  float a = tip_bilinear(kind, int(l0), u, v);
  if (t <= 0.0 || l1 == l0) { return a; }
  float b = tip_bilinear(kind, int(l1), u, v);
  return a + (b - a) * t;
}

float round_half_up(float x) { return floor(x + 0.5); }

float tip_sample(int kind, float u, float v, float lod, vec2 aniso_dir, float ratio) {
  if (u < 0.0 || u >= 1.0 || v < 0.0 || v >= 1.0) { return 0.0; }
  // round(lod) 레벨을 체인 끝으로 clamp한다(texture/sampling.ts levelAt 미러 — 작은 dab의 lod가 레벨 수를 넘는다).
  if (u_filter_mode == FILTER_NEAREST) { return tip_nearest(kind, min(int(round_half_up(lod)), u_tip_levels - 1), u, v); }
  if (u_filter_mode == FILTER_BILINEAR) { return tip_bilinear(kind, min(int(round_half_up(lod)), u_tip_levels - 1), u, v); }
  if (u_filter_mode == FILTER_ANISOTROPIC && ratio > 1.0) {
    // texture/sampling.ts sampleMask 미러: 장축 발자국은 floor(lod) 레벨 기준, 각 탭은 같은 lod의 trilinear.
    float r = min(16.0, ratio);
    int level = clamp(int(floor(lod)), 0, u_tip_levels - 1);
    float base = float(tip_level_size(level));
    float span = r / base;
    float sum = 0.0;
    for (int i = 0; i < 4; i++) {
      float o = (-0.375 + 0.25 * float(i)) * span;
      float su = u + aniso_dir.x * o;
      float sv = v + aniso_dir.y * o;
      if (su < 0.0 || su >= 1.0 || sv < 0.0 || sv >= 1.0) { continue; }
      sum += tip_trilinear(kind, su, sv, lod);
    }
    return sum / 4.0;
  }
  return tip_trilinear(kind, u, v, lod);
}

int paper_wrap(int i) {
  int n = int(u_paper_size);
  return ((i % n) + n) % n;
}

vec2 paper_sample(float x, float y) {
  float sc = u_paper_scale <= 0.0 ? 1.0 : u_paper_scale;
  float c = cos(u_paper_rotation);
  float s = sin(u_paper_rotation);
  float tx = (x * c - y * s) / sc;
  float ty = (x * s + y * c) / sc;
  if (u_filter_mode == FILTER_NEAREST) {
    vec4 t = texelFetch(u_paper_tex, ivec2(paper_wrap(int(floor(tx))), paper_wrap(int(floor(ty)))), 0);
    return vec2(t.g, t.b);
  }
  vec4 t = texture(u_paper_tex, vec2(tx, ty) / u_paper_size);
  return vec2(t.g, t.b);
}

// shade_dab 미러(픽셀 중심 px,py; dx,dy = 픽셀 − dab 중심). 반환 .a <= 0 이면 기여 없음.
vec4 shade_dab(Dab d, float px, float py, float dx, float dy) {
  float cov = superellipse_coverage(dx, dy, d);
  if (cov <= 0.0) { return vec4(0.0); }
  if (u_edge_curve_enabled != 0) { cov = edge_curve(cov); }
  uint kind = dab_tip_kind(d);
  uint dep = dab_deposition(d);
  float m = 1.0;
  if (kind != TIP_ROUND) {
    float rmin = min(d.r.x, d.r.y);
    float rmax = max(d.r.x, d.r.y);
    float lod = lod_for((2.0 * rmin) / float(u_tip_atlas_tile));
    float ratio = rmax / max(rmin, 0.001);
    vec2 aniso_dir = vec2(0.0);
    float aniso_ratio = 0.0;
    if (ratio > 1.01) {
      aniso_dir = d.r.x >= d.r.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      aniso_ratio = ratio;
    }
    float u;
    float v;
    if (dep == DEP_HATCH_HALFTONE) {
      float pu = px / (2.0 * d.r.x);
      float pv = py / (2.0 * d.r.y);
      u = pu - floor(pu);
      v = pv - floor(pv);
    } else {
      float c = cos(d.angle);
      float s = sin(d.angle);
      float lu = dx * c + dy * s;
      float lv = -dx * s + dy * c;
      u = (lu / d.r.x) * 0.5 + 0.5;
      v = (lv / d.r.y) * 0.5 + 0.5;
    }
    m = tip_sample(int(kind), u, v, lod, aniso_dir, aniso_ratio);
    if (m <= 0.0) { return vec4(0.0); }
  }
  float grain_resp = 1.0;
  if (d.grain > 0.0 && u_paper_enabled != 0) {
    float bump = paper_sample(px, py).x;
    grain_resp = 1.0 - d.grain * (1.0 - bump);
  }
  if (dep == DEP_SPRAY) {
    float h = hash_noise_2d(int(floor(px)), int(floor(py)), dab_seed(d));
    if (h > 0.3 * cov + 0.1) { return vec4(0.0); }
    cov = 1.0;
  }
  float alpha = cov * m * grain_resp * d.flow;
  if (alpha <= 0.0) { return vec4(0.0); }
  if (dab_has_flag(d, FLAG_ERASE)) { return vec4(0.0, 0.0, 0.0, alpha); }
  float wet_factor = 1.0;
  if (dep == DEP_WET_FLOW) { wet_factor = 1.0 - 0.6 * d.wet; }
  return d.color * (alpha * wet_factor);
}
`;

/** dab 인스턴싱 정점 셰이더: 쿼드 1개/인스턴스, 문서 px → NDC(y 아래 방향). */
export const DAB_VERTEX_GLSL = `${GLSL_VERSION}
${GLSL_COMMON}
layout(location = 0) in vec4 a0;
layout(location = 1) in vec4 a1;
layout(location = 2) in vec4 a2;
layout(location = 3) in uvec4 a3;
uniform vec2 u_canvas;
flat out vec4 v0;
flat out vec4 v1;
flat out vec4 v2;
flat out uvec4 v3;
out vec2 v_px;

vec2 quad_corner(int vi) {
  if (vi == 0) { return vec2(0.0, 0.0); }
  if (vi == 1) { return vec2(1.0, 0.0); }
  if (vi == 2) { return vec2(0.0, 1.0); }
  if (vi == 3) { return vec2(1.0, 0.0); }
  if (vi == 4) { return vec2(1.0, 1.0); }
  return vec2(0.0, 1.0);
}

void main() {
  Dab d = dab_from_attrs(a0, a1, a2, a3);
  float e = dab_extent_px(d);
  vec2 corner = quad_corner(gl_VertexID % 6);
  vec2 pos = d.p + (corner * 2.0 - 1.0) * e;
  v_px = pos;
  v0 = a0;
  v1 = a1;
  v2 = a2;
  v3 = a3;
  gl_Position = vec4(pos.x / u_canvas.x * 2.0 - 1.0, 1.0 - pos.y / u_canvas.y * 2.0, 0.0, 1.0);
}
`;

/** dab 프래그먼트 셰이더: premultiplied src 출력(블렌드 ONE, ONE_MINUS_SRC_ALPHA). */
export const DAB_FRAGMENT_GLSL = `${GLSL_VERSION}
${GLSL_COMMON}
${GLSL_SHADE}
flat in vec4 v0;
flat in vec4 v1;
flat in vec4 v2;
flat in uvec4 v3;
in vec2 v_px;
out vec4 o_color;

void main() {
  Dab d = dab_from_attrs(v0, v1, v2, v3);
  float px = v_px.x;
  float py = v_px.y;
  float dx = px - d.p.x;
  float dy = py - d.p.y;
  float e = dab_extent_px(d);
  if (dy > e || dy < -e || dx > e || dx < -e) { discard; }
  vec4 src = shade_dab(d, px, py, dx, dy);
  if (src.a <= 0.0 && !(dab_has_flag(d, FLAG_ERASE) && src.a > 0.0)) { discard; }
  o_color = src;
}
`;

/** 풀스크린 삼각형 정점 셰이더(gl_VertexID만). */
export const BLIT_VERTEX_GLSL = `${GLSL_VERSION}
precision highp float;
void main() {
  float x = float((gl_VertexID & 1) * 4 - 1);
  float y = float((gl_VertexID >> 1) * 4 - 1);
  gl_Position = vec4(x, y, 0.0, 1.0);
}
`;

/**
 * bake/encode 프래그먼트: c = blend(doc, stroke × opacity × stroke_pass).
 * u_encode = 1이면 encode_present(sRGB straight + 선형 알파), u_premultiply = 1이면 캔버스용 premultiply.
 */
export const BLIT_FRAGMENT_GLSL = `${GLSL_VERSION}
precision highp float;
precision highp int;
uniform sampler2D u_doc;
uniform sampler2D u_stroke;
uniform float u_opacity;
uniform float u_stroke_pass;
uniform int u_blend;
uniform int u_encode;
uniform int u_premultiply;
out vec4 o_color;

const int BLEND_MULTIPLY = 1;
const int BLEND_ERASE = 2;
const int BLEND_MAX = 3;

vec4 blend_stroke(vec4 doc, vec4 s, int mode) {
  if (mode == BLEND_MULTIPLY) {
    float k = 1.0 - s.a;
    float j = 1.0 - doc.a;
    return vec4(s.r * doc.r + s.r * j + doc.r * k, s.g * doc.g + s.g * j + doc.g * k, s.b * doc.b + s.b * j + doc.b * k, s.a + doc.a * k);
  }
  if (mode == BLEND_ERASE) { return doc * (1.0 - s.a); }
  if (mode == BLEND_MAX) { return max(doc, s); }
  return s + doc * (1.0 - s.a);
}

float linear_to_srgb(float c) {
  float x = clamp(c, 0.0, 1.0);
  if (x <= 0.0031308) { return x * 12.92; }
  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

vec4 encode_present(vec4 c) {
  float a = clamp(c.a, 0.0, 1.0);
  if (a <= 0.0) { return vec4(0.0); }
  vec3 rgb = c.rgb / a;
  return vec4(linear_to_srgb(rgb.r), linear_to_srgb(rgb.g), linear_to_srgb(rgb.b), a);
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  vec4 doc = texelFetch(u_doc, p, 0);
  vec4 s = texelFetch(u_stroke, p, 0) * (u_opacity * u_stroke_pass);
  vec4 c = blend_stroke(doc, s, u_blend);
  if (u_encode == 1) {
    c = encode_present(c);
    if (u_premultiply == 1) { c = vec4(c.rgb * c.a, c.a); }
  }
  o_color = c;
}
`;

/** 정적 검사용 목록. */
export const WEBGL2_SHADERS = {
  dabVertex: DAB_VERTEX_GLSL,
  dabFragment: DAB_FRAGMENT_GLSL,
  blitVertex: BLIT_VERTEX_GLSL,
  blitFragment: BLIT_FRAGMENT_GLSL,
} as const;
