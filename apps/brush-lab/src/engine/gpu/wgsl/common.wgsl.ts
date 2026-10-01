import { CURVATURE_AA_CORRECTION, SUBPIXEL_RADIUS } from "../../raster/coverage";
import { IMPASTO_MIN_MASS } from "../../raster/fine-raster";
import { IMPASTO_SPECULAR } from "../../raster/reference-renderer";
import { IMPASTO_SHININESS } from "../../wet/impasto";
import { WET_KERNEL } from "../../wet/params";
import {
  BAKE_MASS_TO_ALPHA,
  BINDINGS,
  BINDING_WGSL_NAMES,
  GPU_TILE_PIXELS,
  GPU_TILE_SIZE,
  IMPASTO_DAB_MEMBERS,
  INDIRECT_MEMBERS,
  MAX_DABS_PER_BATCH,
  MAX_REFS,
  MAX_SCAN_BLOCKS,
  MAX_TILES,
  MAX_TILES_PER_DAB,
  PARAMS_EDGE_CURVE_SAMPLES,
  PARAMS_SCALARS,
  SLOT_NONE,
  SLOT_RESERVED,
  SMUDGE_STRENGTH,
  STROKE_FLOATS_PER_TILE,
  TABLE_ARRAY_MEMBERS,
  TABLE_HEADER_MEMBERS,
  TABLE_OFFSETS,
  TIP_ATLAS_KINDS,
  WET_CHANNELS,
  WET_EPS,
  WET_FLOATS_PER_TILE,
  WORKGROUP_1D,
} from "../layout";

import type { BindingName } from "../layout";

/**
 * 모든 compute 모듈이 앞에 붙이는 공통 WGSL: struct·바인딩 선언·TS 미러 함수·공유 헬퍼.
 *
 * - struct Dab 필드 순서는 `core/dab-layout.ts`의 DAB_WGSL_STRUCT_FIELDS와 같다(정적 대조).
 * - 미러 함수(`hash_u32`, `superellipse_coverage`, `dab_tile_bounds`, `km_mix`, …)는 TS와 같은
 *   연산 순서로 쓴다. `mix`/`fma`는 드라이버가 연산을 재배열할 수 있어 명시적 산술로 푼다.
 * - 식별자로 `meta`, `active`를 쓰지 않는다(WGSL 예약어 후보).
 * - 팁 마스크는 아틀라스 타일 경계에서 이웃 팁으로 번지지 않도록 하드웨어 샘플러 대신 `textureLoad`로
 *   CPU `texture/sampling.ts`와 같은 clamp·보간을 직접 구현한다. 샘플러는 종이(반복)에만 쓴다.
 */

/** JS 숫자 → WGSL f32 리터럴(정수도 소수점을 붙인다; 지수 표기는 그대로 둔다). */
export function wgslF32(n: number): string {
  const text = String(n);
  return /[.eE]/.test(text) ? text : `${text}.0`;
}

function bindingDeclaration(name: BindingName): string {
  const slot = BINDINGS[name];
  const ident = BINDING_WGSL_NAMES[name];
  let decl: string;
  switch (slot.kind) {
    case "uniform":
      decl = `var<uniform> ${ident}: Params`;
      break;
    case "uniform-dynamic":
      decl = `var<uniform> ${ident}: ImpastoDab`;
      break;
    case "storage-read":
      decl = `var<storage, read> ${ident}: array<Dab>`;
      break;
    case "storage-rw":
      decl = `var<storage, read_write> ${ident}: ${storageType(name)}`;
      break;
    case "texture-2d":
      decl = `var ${ident}: texture_2d<f32>`;
      break;
    case "sampler":
      decl = `var ${ident}: sampler`;
      break;
    case "storage-texture-write-rgba8unorm":
      decl = `var ${ident}: texture_storage_2d<rgba8unorm, write>`;
      break;
  }
  return `@group(${slot.group}) @binding(${slot.binding}) ${decl};`;
}

function storageType(name: BindingName): string {
  switch (name) {
    case "bins":
      return "Bins";
    case "refs":
      return "array<u32>";
    case "table":
      return "TileTable";
    case "indirect":
      return "IndirectArgs";
    case "strokePool":
      return "array<vec4<f32>>";
    case "wetPool":
      return "array<f32>";
    case "document":
      return "array<vec4<f32>>";
    default:
      return "array<u32>";
  }
}

function paramsStruct(): string {
  const lines = PARAMS_SCALARS.map(([name, type]) => `  ${name}: ${type},`);
  const pad = (4 - (PARAMS_SCALARS.length % 4)) % 4;
  for (let i = 0; i < pad; i += 1) lines.push(`  pad_${i}: u32,`);
  lines.push(`  edge_curve: array<vec4<f32>, ${PARAMS_EDGE_CURVE_SAMPLES / 4}>,`);
  return `struct Params {\n${lines.join("\n")}\n}`;
}

/** TileTable struct를 layout.ts의 멤버 표에서 생성한다(순서 = 바이트 오프셋 순서). */
function tileTableStruct(): string {
  const lines: string[] = [];
  for (const [name, type] of TABLE_HEADER_MEMBERS) lines.push(`  ${name}: ${type},`);
  for (const [name, type] of TABLE_ARRAY_MEMBERS) {
    const elem = type === "array<atomic<u32>>" ? "atomic<u32>" : "u32";
    lines.push(`  ${name}: array<${elem}, ${MAX_TILES}>,`);
  }
  return `struct TileTable {\n${lines.join("\n")}\n}`;
}

/** 간접 디스패치 인자 struct(layout.ts INDIRECT_MEMBERS에서 생성, vec3<u32>는 16 B 정렬). */
function indirectArgsStruct(): string {
  const lines = INDIRECT_MEMBERS.map(([name, type]) => `  ${name}: ${type},`);
  return `struct IndirectArgs {\n${lines.join("\n")}\n}`;
}

/** 임파스토 dab 레코드 struct(layout.ts IMPASTO_DAB_MEMBERS에서 생성). */
function impastoDabStruct(): string {
  const lines = IMPASTO_DAB_MEMBERS.map(([name, type]) => `  ${name}: ${type},`);
  return `struct ImpastoDab {\n${lines.join("\n")}\n}`;
}

/** 모든 바인딩 선언(group 0·1·2). 사용하지 않는 바인딩은 WGSL에서 무시된다. */
export const WGSL_BINDING_DECLARATIONS: string = (Object.keys(BINDINGS) as BindingName[])
  .map(bindingDeclaration)
  .join("\n");

/** 상수·struct Dab·TS 미러 함수(바인딩 비의존). 렌더 파이프라인(instanced)도 이 부분만 쓴다. */
export const COMMON_TYPES_WGSL = /* wgsl */ `
// ---- Sumi 공통 상수·타입·미러 함수 (layout.ts에서 생성) ----
const TILE_SIZE: u32 = ${GPU_TILE_SIZE}u;
const TILE_PIXELS: u32 = ${GPU_TILE_PIXELS}u;
const MAX_TILES: u32 = ${MAX_TILES}u;
const MAX_SCAN_BLOCKS: u32 = ${MAX_SCAN_BLOCKS}u;
const MAX_REFS: u32 = ${MAX_REFS}u;
const MAX_TILES_PER_DAB: u32 = ${MAX_TILES_PER_DAB}u;
const SLOT_NONE: u32 = ${SLOT_NONE}u;
const SLOT_RESERVED: u32 = ${SLOT_RESERVED}u;
const STROKE_FLOATS_PER_TILE: u32 = ${STROKE_FLOATS_PER_TILE}u;
const WET_CHANNELS: u32 = ${WET_CHANNELS}u;
const WET_FLOATS_PER_TILE: u32 = ${WET_FLOATS_PER_TILE}u;
const TIP_ATLAS_KINDS: u32 = ${TIP_ATLAS_KINDS}u;
const WORKGROUP_1D: u32 = ${WORKGROUP_1D}u;
const WET_EPS: f32 = ${wgslF32(WET_EPS)};
const SMUDGE_STRENGTH: f32 = ${wgslF32(SMUDGE_STRENGTH)};
const SUBPIXEL_RADIUS: f32 = ${wgslF32(SUBPIXEL_RADIUS)};
const CURVATURE_AA_CORRECTION: f32 = ${wgslF32(CURVATURE_AA_CORRECTION)};
const IMPASTO_SHININESS: f32 = ${wgslF32(IMPASTO_SHININESS)};
const IMPASTO_SPECULAR: f32 = ${wgslF32(IMPASTO_SPECULAR)};
const IMPASTO_MIN_MASS: f32 = ${wgslF32(IMPASTO_MIN_MASS)};
// 습식 CPU 참조 커널 상수(wet/params.ts WET_KERNEL — 단일 원천). 사용자 파라미터에 곱해지는 내부 스케일이다.
const WET_WATER_DIFFUSION_SCALE: f32 = ${wgslF32(WET_KERNEL.waterDiffusionScale)};
const WET_CAPILLARY_SCALE: f32 = ${wgslF32(WET_KERNEL.capillaryScale)};
const WET_PIGMENT_DIFFUSION_SCALE: f32 = ${wgslF32(WET_KERNEL.pigmentDiffusionScale)};
const WET_EDGE_ADVECTION_SCALE: f32 = ${wgslF32(WET_KERNEL.edgeAdvectionScale)};
const WET_GRANULATION_SCALE: f32 = ${wgslF32(WET_KERNEL.granulationScale)};
const WET_HEIGHT_RELAX_SCALE: f32 = ${wgslF32(WET_KERNEL.heightRelaxScale)};
const BAKE_MASS_TO_ALPHA: f32 = ${BAKE_MASS_TO_ALPHA}.0;
const FLAG_ERASE: u32 = 65536u;
const FLAG_SMUDGE: u32 = 131072u;
const FLAG_DUAL_TIP: u32 = 262144u;
const FLAG_LOCK_ALPHA: u32 = 524288u;
const FLAG_IMPASTO: u32 = 1048576u;
const DEP_DRY_STAMP: u32 = 0u;
const DEP_AIRBRUSH: u32 = 1u;
const DEP_SPRAY: u32 = 2u;
const DEP_BRISTLE: u32 = 3u;
const DEP_HATCH_HALFTONE: u32 = 4u;
const DEP_SMUDGE: u32 = 5u;
const DEP_ERASER: u32 = 6u;
const DEP_IMPASTO: u32 = 7u;
const DEP_WET_FLOW: u32 = 8u;
const BLEND_NORMAL: u32 = 0u;
const BLEND_MULTIPLY: u32 = 1u;
const BLEND_ERASE: u32 = 2u;
const BLEND_MAX: u32 = 3u;
const FILTER_NEAREST: u32 = 0u;
const FILTER_BILINEAR: u32 = 1u;
const FILTER_TRILINEAR: u32 = 2u;
const FILTER_ANISOTROPIC: u32 = 3u;
const TIP_ROUND: u32 = 0u;
const WET_CH_WATER: u32 = 0u;
const WET_CH_VX: u32 = 1u;
const WET_CH_VY: u32 = 2u;
const WET_CH_PIG_R: u32 = 3u;
const WET_CH_PIG_G: u32 = 4u;
const WET_CH_PIG_B: u32 = 5u;
const WET_CH_PIG_MASS: u32 = 6u;
const WET_CH_HEIGHT: u32 = 7u;
const WET_CH_FIX_R: u32 = 8u;
const WET_CH_FIX_G: u32 = 9u;
const WET_CH_FIX_B: u32 = 10u;
const WET_CH_FIX_MASS: u32 = 11u;

// 64 B, 정렬 16. 필드 순서 = DAB_WGSL_STRUCT_FIELDS.
struct Dab {
  p: vec2<f32>,
  r: vec2<f32>,
  angle: f32,
  hardness: f32,
  flow: f32,
  shape_exp: f32,
  color: vec4<f32>,
  tip_seed: u32,
  grain: f32,
  wet: f32,
  flags: u32,
}

// ---- dab 필드 디코딩 ----
fn dab_tip_kind(d: Dab) -> u32 { return d.tip_seed >> 24u; }
fn dab_seed(d: Dab) -> u32 { return d.tip_seed & 16777215u; }
fn dab_deposition(d: Dab) -> u32 { return d.flags >> 24u; }
fn dab_has_flag(d: Dab, bit: u32) -> bool { return (d.flags & bit) != 0u; }
fn dab_pigment_mass(d: Dab) -> f32 { return f32(d.flags & 65535u) / 65535.0; }

// ---- 해시·노이즈 (core/rng.ts 미러, 정수 연산은 비트 동일) ----
fn hash_lowbias32(v: u32) -> u32 {
  var x = v;
  x ^= x >> 16u;
  x *= 2146121005u;
  x ^= x >> 15u;
  x *= 2221713035u;
  x ^= x >> 16u;
  return x;
}

fn hash_u32(x: u32, y: u32, seed: u32) -> u32 {
  let sx = hash_lowbias32(seed ^ 2654435769u);
  let hx = hash_lowbias32(sx ^ x);
  return hash_lowbias32(hx ^ (y * 2246822507u) ^ 668265263u);
}

// u32 → [0,1). f32(h) * 2^-32 는 fround(h * 2^-32)와 비트 동일(2의 거듭제곱 스케일).
fn hash_noise_2d(x: i32, y: i32, seed: u32) -> f32 {
  return f32(hash_u32(u32(x), u32(y), seed)) * 2.3283064365386963e-10;
}

fn smoothstep01(t: f32) -> f32 { return t * t * (3.0 - 2.0 * t); }

fn value_noise_2d(p: vec2<f32>, seed: u32) -> f32 {
  let ix = floor(p.x);
  let iy = floor(p.y);
  let fx = p.x - ix;
  let fy = p.y - iy;
  let sx = smoothstep01(fx);
  let sy = smoothstep01(fy);
  let cx = i32(ix);
  let cy = i32(iy);
  let n00 = hash_noise_2d(cx, cy, seed);
  let n10 = hash_noise_2d(cx + 1, cy, seed);
  let n01 = hash_noise_2d(cx, cy + 1, seed);
  let n11 = hash_noise_2d(cx + 1, cy + 1, seed);
  let a = n00 + sx * (n10 - n00);
  let b = n01 + sx * (n11 - n01);
  return a + sy * (b - a);
}

fn fbm_2d(p: vec2<f32>, octaves: u32, seed: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var norm = 0.0;
  var q = p;
  let n = max(1u, octaves);
  for (var i = 0u; i < n; i += 1u) {
    sum = sum + amp * value_noise_2d(q, seed + i * 16777619u);
    norm = norm + amp;
    amp = amp * 0.5;
    q = q * 2.0;
  }
  return sum / norm;
}

// ---- 색 공간 (core/color.ts 미러) ----
fn srgb_to_linear(c: f32) -> f32 {
  let x = clamp(c, 0.0, 1.0);
  if (x <= 0.04045) { return x / 12.92; }
  return pow((x + 0.055) / 1.055, 2.4);
}

fn linear_to_srgb(c: f32) -> f32 {
  let x = clamp(c, 0.0, 1.0);
  if (x <= 0.0031308) { return x * 12.92; }
  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

fn linear_to_srgb3(c: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(linear_to_srgb(c.x), linear_to_srgb(c.y), linear_to_srgb(c.z));
}

// ---- Kubelka-Munk 닫힌식 (pigment/kubelka-munk.ts kmMixRgb 미러) ----
fn km_f(r: f32) -> f32 {
  let x = clamp(r, 0.0001, 1.0);
  return (1.0 - x) * (1.0 - x) / (2.0 * x);
}

fn km_r(q: f32) -> f32 {
  let qq = max(q, 0.0);
  return clamp(1.0 + qq - sqrt(qq * (qq + 2.0)), 0.0001, 1.0);
}

fn km_mix(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
  let w = clamp(t, 0.0, 1.0);
  let qa = vec3<f32>(km_f(a.x), km_f(a.y), km_f(a.z));
  let qb = vec3<f32>(km_f(b.x), km_f(b.y), km_f(b.z));
  let q = qa * (1.0 - w) + qb * w;
  return vec3<f32>(km_r(q.x), km_r(q.y), km_r(q.z));
}

// ---- 커버리지 (raster/coverage.ts superellipseCoverage 미러) ----
// rmin > 0.5: (u,v) = 회전 역변환; dn = (|u/rx|^n + |v/ry|^n)^(1/n); dpx = (dn − 1)·rmin + κ/24/rmin(곡률 보정)
//   feather = max(1, (1 − hardness)·rmin); cov = clamp((−dpx + 0.5)/feather, 0, 1); airbrush는 exp(−2·dn²)
// rmin ≤ 0.5(서브픽셀): 면적 min(1, π·rx·ry)를 쌍선형 커널로 뿌린다.
fn normalized_distance(dx: f32, dy: f32, d: Dab) -> f32 {
  let c = cos(d.angle);
  let s = sin(d.angle);
  let u = dx * c + dy * s;
  let v = -dx * s + dy * c;
  let au = abs(u / d.r.x);
  let av = abs(v / d.r.y);
  if (d.shape_exp == 2.0) {
    return sqrt(au * au + av * av);
  }
  let n = d.shape_exp;
  return pow(pow(au, n) + pow(av, n), 1.0 / n);
}

fn superellipse_coverage(dx: f32, dy: f32, d: Dab) -> f32 {
  let rmin = min(d.r.x, d.r.y);
  if (rmin <= 0.0) { return 0.0; }
  if (rmin <= SUBPIXEL_RADIUS) {
    let area = min(1.0, 3.141592653589793 * d.r.x * d.r.y);
    let kx = 1.0 - abs(dx);
    let ky = 1.0 - abs(dy);
    if (kx <= 0.0 || ky <= 0.0) { return 0.0; }
    return area * kx * ky;
  }
  let dn = normalized_distance(dx, dy, d);
  if (dab_deposition(d) == DEP_AIRBRUSH) {
    return exp(-2.0 * dn * dn);
  }
  let dpx = (dn - 1.0) * rmin + CURVATURE_AA_CORRECTION / rmin;
  let feather = max(1.0, (1.0 - d.hardness) * rmin);
  return clamp((-dpx + 0.5) / feather, 0.0, 1.0);
}

// ---- 타일 범위 (raster/tile-binning.ts dabTileBounds 미러) ----
// e = max(rx,ry) + feather + scatter + 1, feather = max(1,(1−hardness)·min(rx,ry)),
// scatter = airbrush/spray면 max(rx,ry). 결과 (x0,y0,x1,y1) inclusive, x1<x0 또는 y1<y0이면 빈 범위.
fn dab_feather_px(d: Dab) -> f32 {
  let rmin = min(d.r.x, d.r.y);
  let feather = max(1.0, (1.0 - d.hardness) * rmin);
  let dep = dab_deposition(d);
  var scatter = 0.0;
  if (dep == DEP_AIRBRUSH || dep == DEP_SPRAY) { scatter = max(d.r.x, d.r.y); }
  return feather + scatter;
}

fn dab_extent_px(d: Dab) -> f32 {
  return max(d.r.x, d.r.y) + dab_feather_px(d) + 1.0;
}

fn dab_tile_bounds(d: Dab, tiles_x: u32, tiles_y: u32) -> vec4<i32> {
  let e = dab_extent_px(d);
  let inv = 1.0 / f32(TILE_SIZE);
  let x0 = max(0, i32(floor((d.p.x - e) * inv)));
  let y0 = max(0, i32(floor((d.p.y - e) * inv)));
  let x1 = min(i32(tiles_x) - 1, i32(floor((d.p.x + e) * inv)));
  let y1 = min(i32(tiles_y) - 1, i32(floor((d.p.y + e) * inv)));
  return vec4<i32>(x0, y0, x1, y1);
}

fn bounds_empty(b: vec4<i32>) -> bool { return b.z < b.x || b.w < b.y; }

fn bounds_span(b: vec4<i32>) -> u32 {
  if (bounds_empty(b)) { return 0u; }
  return u32(b.z - b.x + 1) * u32(b.w - b.y + 1);
}

// count_main·scatter_stable가 공유하는 허용 predicate(한도 초과 dab는 둘 다 건너뛴다).
fn dab_admitted(b: vec4<i32>) -> bool {
  return !bounds_empty(b) && bounds_span(b) <= MAX_TILES_PER_DAB;
}

fn bounds_contains(b: vec4<i32>, tx: i32, ty: i32) -> bool {
  return tx >= b.x && tx <= b.z && ty >= b.y && ty <= b.w;
}

// ---- premultiplied 합성 ----
fn premul_over(src: vec4<f32>, dst: vec4<f32>) -> vec4<f32> {
  return src + dst * (1.0 - src.a);
}

// raster/composite.ts compositeTile 미러(s는 이미 opacity를 곱한 값).
fn blend_stroke(doc: vec4<f32>, s: vec4<f32>, mode: u32) -> vec4<f32> {
  if (mode == BLEND_MULTIPLY) {
    let k = 1.0 - s.a;
    let j = 1.0 - doc.a;
    return vec4<f32>(
      s.r * doc.r + s.r * j + doc.r * k,
      s.g * doc.g + s.g * j + doc.g * k,
      s.b * doc.b + s.b * j + doc.b * k,
      s.a + doc.a * k);
  }
  if (mode == BLEND_ERASE) {
    return doc * (1.0 - s.a);
  }
  if (mode == BLEND_MAX) {
    return max(doc, s);
  }
  return s + doc * (1.0 - s.a);
}

// 선형 premultiplied → sRGB straight(encodeLabImage 미러). 알파는 선형 그대로.
fn encode_present(c: vec4<f32>) -> vec4<f32> {
  let a = clamp(c.a, 0.0, 1.0);
  if (a <= 0.0) { return vec4<f32>(0.0, 0.0, 0.0, 0.0); }
  let inv = 1.0 / a;
  return vec4<f32>(linear_to_srgb3(c.rgb * inv), a);
}

// texture/sampling.ts lodFor 미러.
fn lod_for(px_per_texel: f32) -> f32 {
  if (!(px_per_texel > 0.0)) { return 0.0; }
  let lod = -log2(px_per_texel);
  return max(lod, 0.0);
}

// JS Math.round 미러(비음수 입력 전제: 0.5는 올림).
fn round_half_up(x: f32) -> f32 { return floor(x + 0.5); }
`;

/**
 * 워크그룹 exclusive scan(Hillis-Steele, 256 레인). bin-scan·bin-scatter가 포함한다.
 * 반환은 exclusive prefix, 호출 뒤 `scan_scratch[255]`에 inclusive 총합이 남는다.
 * 모든 레인이 균일 제어 흐름에서 호출해야 한다(barrier 포함).
 */
export const WGSL_WORKGROUP_SCAN = /* wgsl */ `
var<workgroup> scan_scratch: array<u32, ${WORKGROUP_1D}>;

fn workgroup_exclusive_scan(v: u32, lane: u32) -> u32 {
  scan_scratch[lane] = v;
  workgroupBarrier();
  for (var s = 1u; s < WORKGROUP_1D; s = s << 1u) {
    var add = 0u;
    if (lane >= s) { add = scan_scratch[lane - s]; }
    workgroupBarrier();
    scan_scratch[lane] = scan_scratch[lane] + add;
    workgroupBarrier();
  }
  return scan_scratch[lane] - v;
}

fn workgroup_scan_total() -> u32 { return scan_scratch[WORKGROUP_1D - 1u]; }
`;

/**
 * edge_curve·팁 아틀라스·종이 샘플링 헬퍼. 파라미터 struct 식별자(`params` 또는 `inst_params`)만 다르고
 * `tip_atlas`·`paper_tex`·`lin_sampler` 바인딩 이름은 compute·instanced 모듈이 같이 쓴다.
 * 필요한 필드: tip_atlas_tile, tip_levels, paper_size, paper_scale, paper_rotation, paper_enabled,
 * filter_mode, edge_curve_len, edge_curve(array<vec4<f32>, 16>).
 */
export function samplingHelpersWgsl(p: string): string {
  return /* wgsl */ `
// edge.curve LUT(최대 64점, 유효 길이 edge_curve_len). core/curve.ts evalCurve와 같은 규약.
fn edge_curve_at(i: u32) -> f32 {
  return ${p}.edge_curve[i >> 2u][i & 3u];
}

fn edge_curve(c: f32) -> f32 {
  let n = ${p}.edge_curve_len;
  if (n == 0u) { return 0.0; }
  if (n == 1u) { return edge_curve_at(0u); }
  let x = clamp(c, 0.0, 1.0) * f32(n - 1u);
  let lower = u32(floor(x));
  let upper = min(n - 1u, lower + 1u);
  let t = x - f32(lower);
  let lo = edge_curve_at(lower);
  let hi = edge_curve_at(upper);
  return lo + (hi - lo) * t;
}

// ---- 팁 아틀라스 샘플링 (texture/sampling.ts sampleMask 미러, textureLoad 기반) ----
fn tip_level_size(level: u32) -> i32 {
  return i32(max(1u, ${p}.tip_atlas_tile >> level));
}

fn tip_texel(kind: u32, level: u32, x: i32, y: i32) -> f32 {
  let n = tip_level_size(level);
  let cx = clamp(x, 0, n - 1);
  let cy = clamp(y, 0, n - 1);
  return textureLoad(tip_atlas, vec2<i32>(i32(kind) * n + cx, cy), i32(level)).r;
}

fn tip_nearest(kind: u32, level: u32, u: f32, v: f32) -> f32 {
  let n = tip_level_size(level);
  let x = i32(floor(u * f32(n)));
  let y = i32(floor(v * f32(n)));
  return tip_texel(kind, level, x, y);
}

fn tip_bilinear(kind: u32, level: u32, u: f32, v: f32) -> f32 {
  let n = tip_level_size(level);
  if (n == 1) { return tip_texel(kind, level, 0, 0); }
  let fx = u * f32(n) - 0.5;
  let fy = v * f32(n) - 0.5;
  let x0 = i32(floor(fx));
  let y0 = i32(floor(fy));
  let tx = fx - f32(x0);
  let ty = fy - f32(y0);
  let a = tip_texel(kind, level, x0, y0);
  let b = tip_texel(kind, level, x0 + 1, y0);
  let c = tip_texel(kind, level, x0, y0 + 1);
  let d = tip_texel(kind, level, x0 + 1, y0 + 1);
  let top = a + (b - a) * tx;
  let bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

fn tip_trilinear(kind: u32, u: f32, v: f32, lod: f32) -> f32 {
  let max_lod = f32(${p}.tip_levels - 1u);
  let l = clamp(lod, 0.0, max_lod);
  let l0 = floor(l);
  let l1 = min(max_lod, l0 + 1.0);
  let t = l - l0;
  let a = tip_bilinear(kind, u32(l0), u, v);
  if (t <= 0.0 || l1 == l0) { return a; }
  let b = tip_bilinear(kind, u32(l1), u, v);
  return a + (b - a) * t;
}

// aniso_dir = (dirU, dirV) 단위 벡터, ratio ≤ 1이면 등방.
// anisotropic(texture/sampling.ts sampleMask 미러): lod는 단축(minor) 기준이고 장축 발자국(ratio 텍셀, floor(lod) 레벨 기준)을
// 4탭이 -3/8..+3/8 구간으로 덮는다. 각 탭은 같은 lod의 trilinear 샘플이다.
fn tip_sample(kind: u32, u: f32, v: f32, lod: f32, filter_id: u32, aniso_dir: vec2<f32>, ratio: f32) -> f32 {
  if (u < 0.0 || u >= 1.0 || v < 0.0 || v >= 1.0) { return 0.0; }
  // nearest·bilinear는 round(lod) 레벨을 쓰며 체인 끝으로 clamp한다(texture/sampling.ts levelAt 미러 — 작은 dab의 lod가 레벨 수를 넘는다).
  if (filter_id == FILTER_NEAREST) {
    return tip_nearest(kind, min(u32(round_half_up(lod)), ${p}.tip_levels - 1u), u, v);
  }
  if (filter_id == FILTER_BILINEAR) {
    return tip_bilinear(kind, min(u32(round_half_up(lod)), ${p}.tip_levels - 1u), u, v);
  }
  if (filter_id == FILTER_ANISOTROPIC && ratio > 1.0) {
    let r = min(16.0, ratio);
    let max_level = ${p}.tip_levels - 1u;
    let level = min(max_level, u32(max(0.0, floor(lod))));
    let base = f32(tip_level_size(level));
    let span = r / base;
    var sum = 0.0;
    for (var i = 0u; i < 4u; i += 1u) {
      let o = (-0.375 + 0.25 * f32(i)) * span;
      let su = u + aniso_dir.x * o;
      let sv = v + aniso_dir.y * o;
      if (su < 0.0 || su >= 1.0 || sv < 0.0 || sv >= 1.0) { continue; }
      sum = sum + tip_trilinear(kind, su, sv, lod);
    }
    return sum / 4.0;
  }
  return tip_trilinear(kind, u, v, lod);
}

// ---- 종이 샘플링 (texture/paper-grain.ts samplePaper 미러; G = bump, B = absorb) ----
fn paper_wrap(i: i32) -> i32 {
  let n = i32(${p}.paper_size);
  return ((i % n) + n) % n;
}

// scale·rotation·filter를 명시하는 저수준 샘플(wet 참조는 DEFAULT_PAPER_SPEC: scale 1, rot 0, bilinear).
fn paper_sample_spec(x: f32, y: f32, scale: f32, rotation: f32, nearest: bool) -> vec2<f32> {
  let sc = select(scale, 1.0, scale <= 0.0);
  let c = cos(rotation);
  let s = sin(rotation);
  let tx = (x * c - y * s) / sc;
  let ty = (x * s + y * c) / sc;
  if (nearest) {
    let pt = vec2<i32>(paper_wrap(i32(floor(tx))), paper_wrap(i32(floor(ty))));
    let t = textureLoad(paper_tex, pt, 0);
    return vec2<f32>(t.g, t.b);
  }
  let uv = vec2<f32>(tx, ty) / ${p}.paper_size;
  let t = textureSampleLevel(paper_tex, lin_sampler, uv, 0.0);
  return vec2<f32>(t.g, t.b);
}

// 프로그램 종이 스펙으로 bump(x)·absorb(y)를 샘플한다.
fn paper_sample(x: f32, y: f32) -> vec2<f32> {
  return paper_sample_spec(x, y, ${p}.paper_scale, ${p}.paper_rotation, ${p}.filter_mode == FILTER_NEAREST);
}

// 습식 참조가 쓰는 DEFAULT_PAPER_SPEC 샘플. 종이 비활성이면 CPU 참조와 같이 0.5.
fn paper_sample_wet(x: f32, y: f32) -> vec2<f32> {
  if (${p}.paper_enabled == 0u) { return vec2<f32>(0.5, 0.5); }
  return paper_sample_spec(x, y, 1.0, 0.0, false);
}

// dab 1개의 픽셀(px,py)에서 커버리지·에지 곡선·팁 마스크·그레인 응답을 계산한다(texture·paper 샘플 포함).
// raster/fine-raster.ts shadeDabPixel 미러: cov ≤ 0 또는 mask ≤ 0이면 hit = false. 래스터와 임파스토 패스가 공유한다.
struct DabCoverage { cov: f32, mask: f32, grain: f32, hit: bool }

fn dab_coverage(d: Dab, px: f32, py: f32, dx: f32, dy: f32, use_curve: bool, filter_id: u32, tip_size: f32, paper_on: bool) -> DabCoverage {
  var out = DabCoverage(0.0, 1.0, 1.0, false);
  var cov = superellipse_coverage(dx, dy, d);
  if (cov <= 0.0) { return out; }
  if (use_curve) { cov = edge_curve(cov); }
  let kind = dab_tip_kind(d);
  let dep = dab_deposition(d);
  var m = 1.0;
  if (kind != TIP_ROUND) {
    let rmin = min(d.r.x, d.r.y);
    let rmax = max(d.r.x, d.r.y);
    let lod = lod_for((2.0 * rmin) / tip_size);
    let ratio = rmax / max(rmin, 0.001);
    var aniso_dir = vec2<f32>(0.0, 0.0);
    var aniso_ratio = 0.0;
    if (ratio > 1.01) {
      aniso_dir = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), d.r.x >= d.r.y);
      aniso_ratio = ratio;
    }
    var u = 0.0;
    var v = 0.0;
    if (dep == DEP_HATCH_HALFTONE) {
      let pu = px / (2.0 * d.r.x);
      let pv = py / (2.0 * d.r.y);
      u = pu - floor(pu);
      v = pv - floor(pv);
    } else {
      let c = cos(d.angle);
      let s = sin(d.angle);
      let lu = dx * c + dy * s;
      let lv = -dx * s + dy * c;
      u = (lu / d.r.x) * 0.5 + 0.5;
      v = (lv / d.r.y) * 0.5 + 0.5;
    }
    m = tip_sample(kind, u, v, lod, filter_id, aniso_dir, aniso_ratio);
    if (m <= 0.0) { return out; }
  }
  var grain_resp = 1.0;
  if (d.grain > 0.0 && paper_on) {
    let bump = paper_sample(px, py).x;
    grain_resp = 1.0 - d.grain * (1.0 - bump);
  }
  out.cov = cov;
  out.mask = m;
  out.grain = grain_resp;
  out.hit = true;
  return out;
}

// dab 1개의 픽셀(px,py)에서 커버리지·팁·그레인·스프레이를 적용한 premultiplied src를 계산한다.
// raster/fine-raster.ts rasterizeTile의 픽셀 내부 루프 미러(smudge 픽업·습식 투입은 호출자 담당).
struct DabShade { src: vec4<f32>, cov: f32, mask: f32, grain: f32, hit: bool }

fn shade_dab(d: Dab, px: f32, py: f32, dx: f32, dy: f32, pick: vec4<f32>, use_curve: bool, filter_id: u32, tip_size: f32, paper_on: bool) -> DabShade {
  var out = DabShade(vec4<f32>(0.0), 0.0, 1.0, 1.0, false);
  let base = dab_coverage(d, px, py, dx, dy, use_curve, filter_id, tip_size, paper_on);
  if (!base.hit) { return out; }
  var cov = base.cov;
  let m = base.mask;
  let grain_resp = base.grain;
  let dep = dab_deposition(d);
  if (dep == DEP_SPRAY) {
    let h = hash_noise_2d(i32(floor(px)), i32(floor(py)), dab_seed(d));
    if (h > 0.3 * cov + 0.1) { return out; }
    cov = 1.0;
  }
  let alpha = cov * m * grain_resp * d.flow;
  if (alpha <= 0.0) { return out; }
  var src: vec4<f32>;
  if (dab_has_flag(d, FLAG_ERASE)) {
    src = vec4<f32>(0.0, 0.0, 0.0, alpha);
  } else if (dab_has_flag(d, FLAG_SMUDGE)) {
    src = pick * (alpha * SMUDGE_STRENGTH);
  } else {
    var wet_factor = 1.0;
    if (dep == DEP_WET_FLOW) { wet_factor = 1.0 - 0.6 * d.wet; }
    src = d.color * (alpha * wet_factor);
  }
  out.src = src;
  out.cov = cov;
  out.mask = m;
  out.grain = grain_resp;
  out.hit = true;
  return out;
}
`;
}

/** Params·Bins·TileTable struct와 바인딩 선언, params 의존 헬퍼. compute 모듈 전용. */
export const COMMON_BINDINGS_WGSL = /* wgsl */ `
${paramsStruct()}

struct Bins {
  counts: array<atomic<u32>, ${MAX_TILES}>,
  offsets: array<u32, ${MAX_TILES}>,
  block_sums: array<u32, ${MAX_SCAN_BLOCKS}>,
  // smudge 운반 색 상태([0] = rgba, [1].x = loaded)와 dab별 운반 색(smudge_carry → raster_tile). 오프셋은 16 B 정렬이다.
  smudge_state: array<vec4<f32>, 2>,
  picks: array<vec4<f32>, ${MAX_DABS_PER_BATCH}>,
}

// 헤더 ${TABLE_OFFSETS.header} B(TABLE_OFFSETS) + u32 배열 7개. [0,${TABLE_OFFSETS.frameClearBytes})은 프레임마다 clearBuffer로 비운다.
${tileTableStruct()}

// dispatchWorkgroupsIndirect 인자. 같은 dispatch에서 INDIRECT와 쓰기 storage를 겸할 수 없어 TileTable과 분리한다(group 2).
${indirectArgsStruct()}

// 임파스토 dab 1개의 창·방향 레코드(동적 uniform, dispatch마다 오프셋으로 고른다).
${impastoDabStruct()}

${WGSL_BINDING_DECLARATIONS}

fn tile_coord(tile: u32) -> vec2<u32> {
  return vec2<u32>(tile % params.tiles_x, tile / params.tiles_x);
}

fn wet_index(slot: u32, parity: u32, ch: u32, local: u32) -> u32 {
  return (parity * params.wet_capacity + slot) * WET_FLOATS_PER_TILE + ch * TILE_PIXELS + local;
}

${samplingHelpersWgsl("params")}

// ---- 습식 셀 읽기 (wet/active-tiles.ts readCell 미러) ----
// 전역 픽셀 좌표로 이웃 타일을 찾는다. 캔버스 밖·미할당·비활성(live 0) 타일은 유효하지 않다(no-flux).
struct WetCell { value: f32, valid: bool }

fn wet_read_cell(gx: i32, gy: i32, parity: u32, ch: u32) -> WetCell {
  let w = i32(params.tiles_x * TILE_SIZE);
  let h = i32(params.tiles_y * TILE_SIZE);
  if (gx < 0 || gy < 0 || gx >= w || gy >= h) { return WetCell(0.0, false); }
  let tx = u32(gx) / TILE_SIZE;
  let ty = u32(gy) / TILE_SIZE;
  let tile = ty * params.tiles_x + tx;
  let slot = atomicLoad(&table.wet_slots[tile]);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return WetCell(0.0, false); }
  if (table.wet_live[tile] == 0u) { return WetCell(0.0, false); }
  let local = (u32(gy) % TILE_SIZE) * TILE_SIZE + (u32(gx) % TILE_SIZE);
  return WetCell(wet_pool[wet_index(slot, parity, ch, local)], true);
}

// ---- 임파스토 높이맵 조명 (wet/impasto.ts impastoLighting 미러) ----
// 높이맵 읽기(활성 여부와 무관, 미할당 타일은 0, 캔버스 가장자리는 clamp).
fn wet_height_at(gx: i32, gy: i32) -> f32 {
  let w = i32(params.width);
  let h = i32(params.height);
  let cx = clamp(gx, 0, w - 1);
  let cy = clamp(gy, 0, h - 1);
  let tile = (u32(cy) / TILE_SIZE) * params.tiles_x + u32(cx) / TILE_SIZE;
  let slot = atomicLoad(&table.wet_slots[tile]);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return 0.0; }
  let local = (u32(cy) % TILE_SIZE) * TILE_SIZE + (u32(cx) % TILE_SIZE);
  return wet_pool[wet_index(slot, table.wet_parity, WET_CH_HEIGHT, local)];
}

fn impasto_light_dir() -> vec3<f32> {
  let light = vec3<f32>(params.light_x, params.light_y, params.light_z);
  var ll = length(light);
  if (ll == 0.0) { ll = 1.0; }
  return light / ll;
}

// 중앙차분 법선·램버트(0..1).
fn impasto_shade(gx: i32, gy: i32) -> f32 {
  let hl = wet_height_at(gx - 1, gy);
  let hr = wet_height_at(gx + 1, gy);
  let hu = wet_height_at(gx, gy - 1);
  let hd = wet_height_at(gx, gy + 1);
  let nx = -(hr - hl) * 0.5 * params.impasto_gain;
  let ny = -(hd - hu) * 0.5 * params.impasto_gain;
  let nl = sqrt(nx * nx + ny * ny + 1.0);
  let l = impasto_light_dir();
  let lambert = (nx * l.x + ny * l.y + l.z) / nl;
  return clamp(lambert, 0.0, 1.0);
}

// 램버트 배율(reference-renderer displayDocument의 factor): 평탄면 배율 1, 상한 1.5.
fn impasto_factor(gx: i32, gy: i32) -> f32 {
  let flat = impasto_light_dir().z;
  return min(1.5, impasto_shade(gx, gy) / flat);
}

// wet/impasto.ts impastoSpecular 미러: H = normalize(L̂ + (0,0,1))(정사 시점), spec = max(0, N·H)^shininess.
fn impasto_half_vector() -> vec3<f32> {
  let l = impasto_light_dir();
  let h = vec3<f32>(l.x, l.y, l.z + 1.0);
  var hl = length(h);
  if (hl == 0.0) { hl = 1.0; }
  return h / hl;
}

// 평탄면(법선 (0,0,1))의 하이라이트 — 표시 시점에 빼서 평탄면 변화 0을 보장한다(impastoSpecularFlat 미러).
fn impasto_specular_flat() -> f32 {
  let h = impasto_half_vector();
  return pow(max(0.0, h.z), IMPASTO_SHININESS);
}

fn impasto_specular(gx: i32, gy: i32) -> f32 {
  let hl = wet_height_at(gx - 1, gy);
  let hr = wet_height_at(gx + 1, gy);
  let hu = wet_height_at(gx, gy - 1);
  let hd = wet_height_at(gx, gy + 1);
  let nx = -(hr - hl) * 0.5 * params.impasto_gain;
  let ny = -(hd - hu) * 0.5 * params.impasto_gain;
  let nl = sqrt(nx * nx + ny * ny + 1.0);
  let h = impasto_half_vector();
  let ndh = (nx * h.x + ny * h.y + h.z) / nl;
  if (ndh <= 0.0) { return 0.0; }
  return pow(min(1.0, ndh), IMPASTO_SHININESS);
}

// raster/reference-renderer.ts displayDocument 미러(표시 시점 전용 — 문서에는 굽지 않는다):
// 높이 > 0인 픽셀만 rgb = clamp(rgb·factor + IMPASTO_SPECULAR·max(0, spec − spec_flat)·a, 0, a). 평탄면은 변화 0.
fn impasto_display(c: vec4<f32>, gx: i32, gy: i32) -> vec4<f32> {
  if (wet_height_at(gx, gy) <= 0.0) { return c; }
  let factor = impasto_factor(gx, gy);
  let highlight = IMPASTO_SPECULAR * max(0.0, impasto_specular(gx, gy) - impasto_specular_flat()) * c.a;
  let rgb = clamp(c.rgb * factor + vec3<f32>(highlight), vec3<f32>(0.0), vec3<f32>(c.a));
  return vec4<f32>(rgb, c.a);
}
`;

/** compute 모듈 공통 머리말 = 타입·미러 함수 + 바인딩. */
export const COMMON_WGSL: string = `${COMMON_TYPES_WGSL}\n${COMMON_BINDINGS_WGSL}`;
