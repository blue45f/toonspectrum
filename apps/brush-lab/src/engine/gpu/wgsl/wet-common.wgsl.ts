import { LBM_CX, LBM_CY, LBM_LINK_CLASS, LBM_LINK_OWNER_IS_UPSTREAM, LBM_OPP, LBM_W } from "../../wet/lbm-d2q9";
import { OIL_EPS, OIL_OPACITY_K, OIL_RELOAD, OIL_SIDE_GAIN } from "../../wet/oil-layer";
import { PCH } from "../../wet/padded";
import { FIBER_ANGLE_POWER } from "../../wet/paper-wet";
import { WET_PHYSICS } from "../../wet/params";
import { WET_EXT_CH } from "../../wet/state";
import {
  PAPER_WET_CHANNELS,
  WET_BINDING_WGSL_NAMES,
  WET_BINDINGS,
  WET_FAMILIES,
  WET_KERNEL_MEMBERS,
  WET_PAD_SIZE,
  OIL_DAB_MEMBERS,
  OIL_SCRATCH_HEADER_FLOATS,
} from "../layout";

import { COMMON_TYPES_WGSL, indirectArgsStruct, paramsStruct, tileTableStruct, wgslF32 } from "./common.wgsl";

import type { WetBindingName, WetFamilyName } from "../layout";

/**
 * 습식 compute 모듈 공통 머리말. 기본 모듈과 달리 모든 바인딩을 선언하지 않고, 모듈이 담은 가족(`WET_FAMILIES`)의 바인딩
 * 합집합만 선언한다. 가족별 바인드 그룹·파이프라인 레이아웃은 `wet-bindings.ts`가 같은 표에서 만든다.
 *
 * 수치 상수는 CPU 단일 원천(`WET_PHYSICS`·`LBM_*`·`OIL_*`·`PCH`·`WET_EXT_CH`)에서 템플릿으로 삽입한다.
 */

/** WGSL 변수 선언에 쓰는 형식(바인딩 이름 → 선언 접미). */
const WET_BINDING_TYPES: Record<WetBindingName, string> = {
  params: "Params",
  dabs: "array<Dab>",
  table: "TileTable",
  strokePool: "array<vec4<f32>>",
  wetPool: "array<f32>",
  document: "array<vec4<f32>>",
  tipAtlas: "texture_2d<f32>",
  paperTex: "texture_2d<f32>",
  linSampler: "sampler",
  presentTex: "texture_storage_2d<rgba8unorm, write>",
  indirect: "IndirectArgs",
  oilDab: "OilDab",
  wetExt: "array<f32>",
  wetSnap: "array<f32>",
  paperWet: "array<f32>",
  wetKernel: "WetKernel",
  oilScratch: "array<f32>",
  displayLinear: "array<vec4<f32>>",
};

function declareWetBinding(name: WetBindingName): string {
  const slot = WET_BINDINGS[name];
  const ident = WET_BINDING_WGSL_NAMES[name];
  const type = WET_BINDING_TYPES[name];
  let decl: string;
  switch (slot.kind) {
    case "uniform":
    case "uniform-dynamic":
      decl = `var<uniform> ${ident}: ${type}`;
      break;
    case "storage-read":
      decl = `var<storage, read> ${ident}: ${type}`;
      break;
    case "storage-rw":
      decl = `var<storage, read_write> ${ident}: ${type}`;
      break;
    case "texture-2d":
    case "sampler":
      decl = `var ${ident}: ${type}`;
      break;
    case "storage-texture-write-rgba8unorm":
      decl = `var ${ident}: ${type}`;
      break;
  }
  return `@group(${slot.group}) @binding(${slot.binding}) ${decl};`;
}

/** 가족 목록의 바인딩 합집합(중복 제거, 선언 순서는 group·binding). */
export function wetBindingsOf(families: readonly WetFamilyName[]): WetBindingName[] {
  const set = new Set<WetBindingName>();
  for (const f of families) for (const b of WET_FAMILIES[f] as readonly WetBindingName[]) set.add(b);
  return [...set].sort((a, b) => {
    const sa = WET_BINDINGS[a];
    const sb = WET_BINDINGS[b];
    return sa.group - sb.group || sa.binding - sb.binding;
  });
}

/** `WetKernel` struct(layout.ts WET_KERNEL_MEMBERS에서 생성, 모두 4 B 스칼라 + 16 B 패딩). */
function wetKernelStruct(): string {
  const lines = WET_KERNEL_MEMBERS.map(([name, type]) => `  ${name}: ${type},`);
  const pad = (4 - (WET_KERNEL_MEMBERS.length % 4)) % 4;
  for (let i = 0; i < pad; i += 1) lines.push(`  pad_${i}: u32,`);
  return `struct WetKernel {\n${lines.join("\n")}\n}`;
}

/** 유화 dab 레코드 struct(layout.ts OIL_DAB_MEMBERS에서 생성). */
function oilDabStruct(): string {
  const lines = OIL_DAB_MEMBERS.map(([name, type]) => `  ${name}: ${type},`);
  return `struct OilDab {\n${lines.join("\n")}\n}`;
}

function u32List(values: readonly number[]): string {
  return values.map((v) => `${v}u`).join(", ");
}

function f32List(values: readonly number[]): string {
  return values.map((v) => wgslF32(v)).join(", ");
}

const SQRT1_2 = 0.7071067811865476;
const WP = WET_PHYSICS;

/** 습식 물리·채널·LBM 상수(모든 습식 모듈 공통). */
const WET_CONSTANTS_WGSL = /* wgsl */ `
// ---- 습식 확장 풀 채널(wet/state.ts WET_EXT_CH) ----
const EXT_F0: u32 = ${WET_EXT_CH.lbm0}u;
const EXT_RHO: u32 = ${WET_EXT_CH.rho}u;
const EXT_CAP: u32 = ${WET_EXT_CH.capillary}u;
const EXT_GLUE: u32 = ${WET_EXT_CH.glue}u;
const EXT_CURE: u32 = ${WET_EXT_CH.cure}u;
const EXT_HARD_R: u32 = ${WET_EXT_CH.hardR}u;
const EXT_HARD_G: u32 = ${WET_EXT_CH.hardG}u;
const EXT_HARD_B: u32 = ${WET_EXT_CH.hardB}u;
const EXT_HARD_MASS: u32 = ${WET_EXT_CH.hardMass}u;
const EXT_OIL_R: u32 = ${WET_EXT_CH.oilR}u;
const EXT_OIL_G: u32 = ${WET_EXT_CH.oilG}u;
const EXT_OIL_B: u32 = ${WET_EXT_CH.oilB}u;
const EXT_OIL_WET: u32 = ${WET_EXT_CH.oilWet}u;
const EXT_OIL_BASE: u32 = ${WET_EXT_CH.oilBase}u;
const EXT_BLUR: u32 = ${WET_EXT_CH.wetBlur}u;

// ---- 스냅샷 채널(wet/padded.ts PCH) ----
const PCH_F0: u32 = ${PCH.f0}u;
const PCH_RHO: u32 = ${PCH.rho}u;
const PCH_WS: u32 = ${PCH.ws}u;
const PCH_S: u32 = ${PCH.s}u;
const PCH_G0: u32 = ${PCH.g0}u;
const PCH_UX: u32 = ${PCH.ux}u;
const PCH_UY: u32 = ${PCH.uy}u;
const PCH_DELTA: u32 = ${PCH.delta}u;
const PCH_B: u32 = ${PCH.b}u;

const PAD_SIZE: u32 = ${WET_PAD_SIZE}u;
const PAD_CELLS: u32 = ${WET_PAD_SIZE * WET_PAD_SIZE}u;
const PAPER_SIZE: i32 = 256;
const PAPER_CHANNELS: u32 = ${PAPER_WET_CHANNELS}u;

// ---- 습식 물리 상수(wet/params.ts WET_PHYSICS) ----
const U_MAX: f32 = ${wgslF32(WP.uMax)};
const RHO_FULL: f32 = ${wgslF32(WP.rhoFull)};
const RHO_MIN: f32 = ${wgslF32(WP.rhoMin)};
const WATER_EPS: f32 = ${wgslF32(WP.waterEps)};
const SURFACE_CAP: f32 = ${wgslF32(WP.surfaceCap)};
const KAPPA_MAX: f32 = ${wgslF32(WP.kappaMax)};
const FIBER_INV_L: f32 = ${wgslF32(1 / WP.fiberLengthPx)};
const FIBER_INV_W: f32 = ${wgslF32(1 / WP.fiberWidthPx)};
const BLUR_KEEP_WET: f32 = ${wgslF32(WP.wetBlurKeepWet)};
const BLUR_KEEP_DRY: f32 = ${wgslF32(WP.wetBlurKeepDry)};
const BLUR_FULL: f32 = ${wgslF32(WP.wetBlurFull)};
const BLUR_WAKE: f32 = ${wgslF32(WP.wetBlurWake)};
const ACCEL_MAX: f32 = ${wgslF32(WP.accelMax)};
const FACE_OUT_MAX: f32 = ${wgslF32(WP.faceOutMax)};
const DIAG_OUT_MAX: f32 = ${wgslF32(WP.diagOutMax)};
const THIN_BOOST: f32 = ${wgslF32(WP.thinBoost)};
const DEPTH_REF: f32 = ${wgslF32(WP.depthRef)};
const DRY_BRUSH_DEPTH: f32 = ${wgslF32(WP.dryBrushDepth)};
const PIN_SPEED_REF: f32 = ${wgslF32(WP.pinSpeedRef)};
const PIN_STATIC: f32 = ${wgslF32(WP.pinStaticFraction)};
const CAPACITY_BASE: f32 = ${wgslF32(WP.capacityBase)};
const CAPACITY_SPAN: f32 = ${wgslF32(WP.capacitySpan)};
const MASS_EPS: f32 = 1e-9;
const FIBER_ANGLE_POWER_CHECK: u32 = ${FIBER_ANGLE_POWER}u;

// ---- D2Q9(wet/lbm-d2q9.ts): y는 아래가 +, 링크 클래스 E·S·SE·NE = 0..3 ----
const LBM_CX = array<i32, 9>(${LBM_CX.join(", ")});
const LBM_CY = array<i32, 9>(${LBM_CY.join(", ")});
const LBM_OPP = array<u32, 9>(${u32List(LBM_OPP)});
const LBM_W = array<f32, 9>(${f32List(LBM_W)});
const LBM_CLASS = array<u32, 9>(${u32List(LBM_LINK_CLASS)});
const LBM_UPSTREAM = array<u32, 9>(${u32List(LBM_LINK_OWNER_IS_UPSTREAM.map((b) => (b ? 1 : 0)))});
// 링크 확산 가중(면 2/3, 대각 1/6).
const LINK_W = array<f32, 9>(0.0, ${f32List([2 / 3, 2 / 3, 2 / 3, 2 / 3, 1 / 6, 1 / 6, 1 / 6, 1 / 6])});
// 전방 링크 클래스 E, S, SE, NE의 단위 방향.
const CLASS_DIR = array<vec2<f32>, 4>(vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0), vec2<f32>(${wgslF32(SQRT1_2)}, ${wgslF32(SQRT1_2)}), vec2<f32>(${wgslF32(SQRT1_2)}, ${wgslF32(-SQRT1_2)}));

// ---- 유화 상수(wet/oil-layer.ts) ----
const OIL_EPS: f32 = ${wgslF32(OIL_EPS)};
const OIL_OPACITY_K: f32 = ${wgslF32(OIL_OPACITY_K)};
const OIL_RELOAD: f32 = ${wgslF32(OIL_RELOAD)};
const OIL_SIDE_GAIN: f32 = ${wgslF32(OIL_SIDE_GAIN)};
const OIL_HEADER: u32 = ${OIL_SCRATCH_HEADER_FLOATS}u;
`;

/** 타일·슬롯·활성 헬퍼(모든 습식 가족이 params·table을 바인딩한다). */
const WET_TILE_HELPERS_WGSL = /* wgsl */ `
fn tile_coord(tile: u32) -> vec2<u32> {
  return vec2<u32>(tile % params.tiles_x, tile / params.tiles_x);
}

fn core_index(slot: u32, ch: u32, local: u32) -> u32 {
  return slot * WET_FLOATS_PER_TILE + ch * TILE_PIXELS + local;
}

fn ext_index(slot: u32, ch: u32, local: u32) -> u32 {
  return slot * WET_EXT_FLOATS_PER_TILE + ch * TILE_PIXELS + local;
}

fn snap_index(slot: u32, ch: u32, local: u32) -> u32 {
  return slot * WET_SNAP_FLOATS_PER_TILE + ch * TILE_PIXELS + local;
}

// 코어·확장 풀 값 읽기(슬롯이 유효한 셀).
fn pool_at(slot: u32, ch: u32, local: u32) -> f32 { return wet_pool[core_index(slot, ch, local)]; }
fn ext_at(slot: u32, ch: u32, local: u32) -> f32 { return wet_ext[ext_index(slot, ch, local)]; }

// 타일 슬롯(미할당·예약이면 SLOT_NONE). 캔버스 격자 밖 타일도 SLOT_NONE.
fn tile_slot(tx: i32, ty: i32) -> u32 {
  if (tx < 0 || ty < 0 || tx >= i32(params.tiles_x) || ty >= i32(params.tiles_y)) { return SLOT_NONE; }
  let s = atomicLoad(&table.wet_slots[u32(ty) * params.tiles_x + u32(tx)]);
  if (s == SLOT_RESERVED) { return SLOT_NONE; }
  return s;
}

// CPU 활성 집합 미러: 격자 안 + 이번 서브스텝 활성(live) + 슬롯 할당. 아니면 벽(SLOT_NONE).
fn live_slot_at_tile(tx: i32, ty: i32) -> u32 {
  if (tx < 0 || ty < 0 || tx >= i32(params.tiles_x) || ty >= i32(params.tiles_y)) { return SLOT_NONE; }
  let t = u32(ty) * params.tiles_x + u32(tx);
  if (table.wet_live[t] == 0u) { return SLOT_NONE; }
  let s = atomicLoad(&table.wet_slots[t]);
  if (s == SLOT_RESERVED) { return SLOT_NONE; }
  return s;
}

// 전역 픽셀 좌표의 타일 슬롯(캔버스 안 좌표만; 음수·격자 밖은 SLOT_NONE).
fn slot_at_pixel(gx: i32, gy: i32) -> u32 {
  if (gx < 0 || gy < 0) { return SLOT_NONE; }
  return tile_slot(gx / i32(TILE_SIZE), gy / i32(TILE_SIZE));
}

fn local_of_pixel(gx: i32, gy: i32) -> u32 {
  return (u32(gy) % TILE_SIZE) * TILE_SIZE + (u32(gx) % TILE_SIZE);
}
`;

/** 패딩(18×18) 좌표 읽기 헬퍼: 3×3 이웃 타일 슬롯 맵(`wg_slots`)으로 스냅샷을 읽는다(수채 물 스텝·유화 레벨링 공용). */
export const WET_PAD_WGSL = /* wgsl */ `
var<workgroup> wg_slots: array<u32, 9>;

fn pad_slot(px: i32, py: i32) -> u32 {
  let dx = select(select(0, 1, px > 16), -1, px < 1);
  let dy = select(select(0, 1, py > 16), -1, py < 1);
  return wg_slots[u32((dy + 1) * 3 + (dx + 1))];
}

fn pad_local(px: i32, py: i32) -> u32 {
  return u32((py + 15) % 16) * TILE_SIZE + u32((px + 15) % 16);
}

fn pad_valid(px: i32, py: i32) -> bool {
  return pad_slot(px, py) != SLOT_NONE;
}

fn sa(ch: u32, px: i32, py: i32) -> f32 {
  let s = pad_slot(px, py);
  if (s == SLOT_NONE) { return 0.0; }
  return wet_snap[snap_index(s, ch, pad_local(px, py))];
}

fn pad_index(px: i32, py: i32) -> u32 {
  return u32(py) * PAD_SIZE + u32(px);
}

`;

/** 종이 파생 필드(wet/paper-wet.ts buildTilePaper 미러, 전역 셀 좌표의 순수 함수). `wet_kernel`·`paper_wet`·`params`가 필요하다. */
export const WET_PAPER_WGSL = /* wgsl */ `
struct PaperCell { h: f32, absorb: f32, cap: f32, k: vec4<f32> }

fn paper_wrap_i(i: i32) -> i32 {
  return ((i % PAPER_SIZE) + PAPER_SIZE) % PAPER_SIZE;
}

fn paper_texel(i: i32, j: i32, ch: u32) -> f32 {
  return paper_wet[u32(paper_wrap_i(j) * PAPER_SIZE + paper_wrap_i(i)) * PAPER_CHANNELS + ch];
}

// texture/paper-grain.ts sampleChannel 미러(nearest = floor, bilinear은 fx = tx − 0.5 규약).
fn paper_channel(tx: f32, ty: f32, ch: u32, bilinear: bool) -> f32 {
  if (!bilinear) { return paper_texel(i32(floor(tx)), i32(floor(ty)), ch); }
  let fx = tx - 0.5;
  let fy = ty - 0.5;
  let x0 = i32(floor(fx));
  let y0 = i32(floor(fy));
  let sx = fx - f32(x0);
  let sy = fy - f32(y0);
  let a = paper_texel(x0, y0, ch);
  let b = paper_texel(x0 + 1, y0, ch);
  let c = paper_texel(x0, y0 + 1, ch);
  let d = paper_texel(x0 + 1, y0 + 1, ch);
  let top = a + (b - a) * sx;
  let bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

// 전역 셀 (gx, gy)의 요철 h·흡수 absorb·모세관 용량 기본값·전방 링크 κ(E, S, SE, NE). 종이 없음이면 균일 종이.
fn paper_cell(gx: i32, gy: i32) -> PaperCell {
  if (params.paper_enabled == 0u) {
    let kf = min(KAPPA_MAX, wet_kernel.fiber_k0);
    return PaperCell(0.5, 0.5, CAPACITY_BASE + CAPACITY_SPAN * 0.5, vec4<f32>(kf, kf, kf, kf));
  }
  let x = f32(gx) + 0.5;
  let y = f32(gy) + 0.5;
  let tx = (x * wet_kernel.paper_cos - y * wet_kernel.paper_sin) / wet_kernel.paper_scale_w;
  let ty = (x * wet_kernel.paper_sin + y * wet_kernel.paper_cos) / wet_kernel.paper_scale_w;
  let bilinear = wet_kernel.paper_nearest == 0u;
  // 방향은 각도라 보간하지 않고 최근접을 쓴다.
  let dir = paper_channel(tx, ty, 2u, false) + wet_kernel.paper_rot;
  let bump = paper_channel(tx, ty, 0u, bilinear);
  let absorb = paper_channel(tx, ty, 1u, bilinear);
  // WGSL sin/cos는 정밀도가 보장되지 않으므로 결정적 다항식(det_sin/det_cos)을 쓴다.
  let cs = det_cos(dir);
  let sn = det_sin(dir);
  let rough = wet_kernel.fiber_rough;
  var fib = 0.5;
  if (rough > 0.0) {
    let fx = f32(gx);
    let fy = f32(gy);
    fib = value_noise_2d(vec2<f32>((fx * cs + fy * sn) * FIBER_INV_L, (-fx * sn + fy * cs) * FIBER_INV_W), wet_kernel.fiber_seed);
  }
  var modv = 1.0 + rough * (2.0 * fib - 1.0) * 1.2;
  if (modv < 0.05) { modv = 0.05; }
  var kk = vec4<f32>(0.0);
  for (var c = 0u; c < 4u; c += 1u) {
    let dd = CLASS_DIR[c];
    let dot_v = dd.x * cs + dd.y * sn;
    let d2 = dot_v * dot_v;
    // |cos φ|^6: 거듭제곱 함수 대신 곱셈 3회로 결정적으로 계산한다.
    let d6 = d2 * d2 * d2;
    let k = 1.0 - (1.0 - (wet_kernel.fiber_perp + (wet_kernel.fiber_par - wet_kernel.fiber_perp) * d6)) * modv;
    kk[c] = clamp(k, 0.0, KAPPA_MAX);
  }
  return PaperCell(bump, absorb, CAPACITY_BASE + CAPACITY_SPAN * absorb, kk);
}
`;

/** 표시 합성·평탄화 헬퍼: 수채 층·유화 층·릴리프 조명(wet/layer-composite.ts·oil-layer.ts·raster/reference-renderer.ts 미러). */
export const WET_LAYER_WGSL = /* wgsl */ `
// 수채 층 합성(compositeWaterLayer): 부유 + 침착 + 경화 안료 질량으로 알파(1 − exp(−3·mass)), 색 = 질량 가중 평균, km이면 바탕과 KM 혼색.
fn water_layer_mass(slot: u32, local: u32) -> f32 {
  return (pool_at(slot, WET_CH_PIG_MASS, local) + pool_at(slot, WET_CH_FIX_MASS, local)) + ext_at(slot, EXT_HARD_MASS, local);
}

fn water_layer_apply(c: vec4<f32>, slot: u32, local: u32) -> vec4<f32> {
  let mass = water_layer_mass(slot, local);
  if (mass <= 0.0) { return c; }
  let r = ((pool_at(slot, WET_CH_PIG_R, local) + pool_at(slot, WET_CH_FIX_R, local)) + ext_at(slot, EXT_HARD_R, local)) / mass;
  let g = ((pool_at(slot, WET_CH_PIG_G, local) + pool_at(slot, WET_CH_FIX_G, local)) + ext_at(slot, EXT_HARD_G, local)) / mass;
  let b = ((pool_at(slot, WET_CH_PIG_B, local) + pool_at(slot, WET_CH_FIX_B, local)) + ext_at(slot, EXT_HARD_B, local)) / mass;
  let alpha = 1.0 - exp(-mass * BAKE_MASS_TO_ALPHA);
  var col = vec3<f32>(r, g, b);
  if (params.wet_render_km != 0u && c.a > 0.0) {
    col = km_mix(c.rgb / c.a, col, alpha);
  }
  let k = 1.0 - alpha;
  return vec4<f32>(col * alpha + c.rgb * k, alpha + c.a * k);
}

// 유화 층 합성(compositeOilLayer): 물감 부피 V = H − B, α = kV/(1 + kV), 색 = C/V.
fn oil_layer_volume(slot: u32, local: u32) -> f32 {
  let h = pool_at(slot, WET_CH_HEIGHT, local);
  let b = ext_at(slot, EXT_OIL_BASE, local);
  return select(0.0, h - b, h > b);
}

fn oil_layer_apply(c: vec4<f32>, slot: u32, local: u32) -> vec4<f32> {
  let v = oil_layer_volume(slot, local);
  if (v <= OIL_EPS) { return c; }
  let alpha = (OIL_OPACITY_K * v) / (1.0 + OIL_OPACITY_K * v);
  let k = 1.0 - alpha;
  let col = vec3<f32>(ext_at(slot, EXT_OIL_R, local), ext_at(slot, EXT_OIL_G, local), ext_at(slot, EXT_OIL_B, local)) / v;
  return vec4<f32>(col * alpha + c.rgb * k, alpha + c.a * k);
}

// ---- 임파스토 높이맵 조명 (wet/impasto.ts impastoLighting 미러, 표시 시점 전용) ----
// 높이맵 읽기(미할당 타일은 0, 캔버스 가장자리는 clamp).
fn wet_height_at(gx: i32, gy: i32) -> f32 {
  let cx = clamp(gx, 0, i32(params.width) - 1);
  let cy = clamp(gy, 0, i32(params.height) - 1);
  let slot = slot_at_pixel(cx, cy);
  if (slot == SLOT_NONE) { return 0.0; }
  return pool_at(slot, WET_CH_HEIGHT, local_of_pixel(cx, cy));
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

// 표시 합성 한 픽셀(CPU Surface.displayDocument 순서): 문서(+ 살아 있는 획 레이어) → 수채 층 → 유화 층 → 릴리프 조명.
fn display_pixel(c0: vec4<f32>, gx: i32, gy: i32) -> vec4<f32> {
  var c = c0;
  let slot = slot_at_pixel(gx, gy);
  if (slot != SLOT_NONE) {
    let local = local_of_pixel(gx, gy);
    if (params.wet_water_layer != 0u) { c = water_layer_apply(c, slot, local); }
    if (params.wet_oil_layer != 0u) { c = oil_layer_apply(c, slot, local); }
  }
  if (params.has_height != 0u) { c = impasto_display(c, gx, gy); }
  return c;
}
`;

/**
 * 습식 모듈 머리말: 공통 타입·미러 함수 + 가족 바인딩에 필요한 struct + 바인딩 선언 + 상수·타일 헬퍼.
 * `Params`·`TileTable`은 모든 습식 가족이 쓴다.
 */
export function wetModuleHeader(families: readonly WetFamilyName[]): string {
  const bindings = wetBindingsOf(families);
  const has = (n: WetBindingName): boolean => bindings.includes(n);
  const structs = [paramsStruct(), tileTableStruct()];
  if (has("indirect")) structs.push(indirectArgsStruct());
  if (has("wetKernel")) structs.push(wetKernelStruct());
  if (has("oilDab")) structs.push(oilDabStruct());
  return `${COMMON_TYPES_WGSL}
${structs.join("\n\n")}

${bindings.map(declareWetBinding).join("\n")}
${WET_CONSTANTS_WGSL}
${WET_TILE_HELPERS_WGSL}
`;
}
