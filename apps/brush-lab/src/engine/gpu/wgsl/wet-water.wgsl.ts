import { ENTRY_POINTS, GPU_TILE_SIZE, WORKGROUP_1D } from "../layout";

import { WGSL_WORKGROUP_SCAN } from "./common.wgsl";
import { WET_PAD_WGSL, WET_PAPER_WGSL, wetModuleHeader } from "./wet-common.wgsl";

/**
 * 수채·수묵·구아슈 물 스텝(CPU `wet/step-water.ts`·`wet/padded.ts`·`wet/active-tiles.ts`의 GPU 미러). 서브스텝 1회 =
 *   wet_snapshot → wet_edge_delta → wet_step_water → wet_expand → wet_commit
 * (앞 네 개는 활성 타일 목록(`wet_live_tiles`)에 대한 간접 디스패치, wet_commit은 단일 워크그룹).
 *
 * - **gather 전용·원자 없음(결과 경로)**: 모든 이웃 읽기는 서브스텝 시작 시점의 스냅샷(`wet_snap`, 20채널)에서 하고, 쓰기는 자기 셀뿐이라
 *   타일 처리 순서·스레드 순서가 결과에 영향을 주지 않는다(원자는 활성 목록 확정·슬롯 할당·keep 합류에만 쓴다).
 * - **벽 규칙**: 셀이 격자 밖이거나 그 셀의 타일이 활성(live)이 아니거나 슬롯이 없으면 벽이다(no-flux, LBM은 no-slip bounce-back,
 *   스냅샷 읽기 값은 0). 3×3 이웃 타일 슬롯 맵을 워크그룹 공유 메모리에 두고 18×18 패딩 좌표로 읽는다.
 * - **종이 파생 필드**: `paper_cell`이 전역 셀 좌표 함수로 18×18(h·absorb·capBase·κ 4클래스)을 워크그룹 공유 메모리에 즉시 계산한다
 *   (`det_sin/det_cos`·f32 `paper_wet` 버퍼·`pow` 대신 곱셈).
 * - 가벼운 경로(near 게이트)는 비트 동치 최적화이므로 두지 않고 항상 전체 경로로 돈다(명세 §3.3).
 * - `wet_commit`: 단일 워크그룹이 지금까지 할당된 타일 목록을 훑어 live ← live_next를 확정하고 활성 타일만 고정 순서(목록 순서)로
 *   압축해 `wet_live_tiles`·간접 인자(`indirect_args.wet_live`)를 쓴다.
 */
export const WET_WATER_WGSL: string = /* wgsl */ `${wetModuleHeader(["waterStep", "listWriter"])}
${WGSL_WORKGROUP_SCAN}
${WET_PAD_WGSL}
${WET_PAPER_WGSL}

var<workgroup> wg_tile: u32;
var<workgroup> wg_tslot: u32;
var<workgroup> wg_flag: u32;
var<workgroup> wg_keep: atomic<u32>;
var<workgroup> wg_sides: atomic<u32>;
var<workgroup> pap_h: array<f32, 324>;
var<workgroup> pap_abs: array<f32, 324>;
var<workgroup> pap_cap: array<f32, 324>;
var<workgroup> pap_k: array<f32, 1296>;
var<workgroup> wg_total: u32;

// 링크 κ: 클래스 c(E, S, SE, NE)의 패딩 셀 (px, py).
fn kap_at(c: u32, px: i32, py: i32) -> f32 {
  return pap_k[c * PAD_CELLS + pad_index(px, py)];
}

// ---- wet_snapshot: 활성 타일마다 코어·확장 풀을 스냅샷(20채널)으로 복사한다(wet/padded.ts buildPaddedSnapshots). ----
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.wetSnapshot}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    let t = table.wet_live_tiles[wid.x];
    wg_tile = t;
    wg_tslot = atomicLoad(&table.wet_slots[t]);
  }
  let slot = workgroupUniformLoad(&wg_tslot);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  for (var q = 0u; q < 9u; q += 1u) {
    wet_snap[snap_index(slot, PCH_F0 + q, lane)] = wet_ext[ext_index(slot, EXT_F0 + q, lane)];
  }
  wet_snap[snap_index(slot, PCH_RHO, lane)] = wet_ext[ext_index(slot, EXT_RHO, lane)];
  wet_snap[snap_index(slot, PCH_WS, lane)] = wet_pool[core_index(slot, WET_CH_WATER, lane)];
  wet_snap[snap_index(slot, PCH_S, lane)] = wet_ext[ext_index(slot, EXT_CAP, lane)];
  for (var q = 0u; q < 4u; q += 1u) {
    wet_snap[snap_index(slot, PCH_G0 + q, lane)] = wet_pool[core_index(slot, WET_CH_PIG_R + q, lane)];
  }
  wet_snap[snap_index(slot, PCH_UX, lane)] = wet_pool[core_index(slot, WET_CH_VX, lane)];
  wet_snap[snap_index(slot, PCH_UY, lane)] = wet_pool[core_index(slot, WET_CH_VY, lane)];
  wet_snap[snap_index(slot, PCH_DELTA, lane)] = 0.0;
  wet_snap[snap_index(slot, PCH_B, lane)] = wet_ext[ext_index(slot, EXT_BLUR, lane)];
}

// ---- wet_edge_delta: 에지 필드 Δ = 젖은 셀의 8이웃 중 마른(유효) 셀 비율(wet/padded.ts computeEdgeDelta). ----
// 이웃 타일의 Δ는 그 셀의 전역 유효 규칙으로 계산한 값과 같으므로(CPU의 2단계 헤일로 교환과 동치) 스냅샷이 끝난 뒤 셀마다 독립 계산한다.
fn depth_at_global(gx: i32, gy: i32) -> vec2<f32> {
  // (유효 여부, ws + ρ). 무효면 (0, 0).
  if (gx < 0 || gy < 0) { return vec2<f32>(0.0, 0.0); }
  let s = live_slot_at_tile(gx / i32(TILE_SIZE), gy / i32(TILE_SIZE));
  if (s == SLOT_NONE) { return vec2<f32>(0.0, 0.0); }
  let l = local_of_pixel(gx, gy);
  return vec2<f32>(1.0, wet_snap[snap_index(s, PCH_WS, l)] + wet_snap[snap_index(s, PCH_RHO, l)]);
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.wetEdgeDelta}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    let t = table.wet_live_tiles[wid.x];
    wg_tile = t;
    wg_tslot = atomicLoad(&table.wet_slots[t]);
  }
  let tile = workgroupUniformLoad(&wg_tile);
  let slot = workgroupUniformLoad(&wg_tslot);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  let tc = tile_coord(tile);
  let gx = i32(tc.x * TILE_SIZE + lid.x);
  let gy = i32(tc.y * TILE_SIZE + lid.y);
  let d0 = wet_snap[snap_index(slot, PCH_WS, lane)] + wet_snap[snap_index(slot, PCH_RHO, lane)];
  var delta = 0.0;
  if (d0 > RHO_MIN) {
    var dry = 0u;
    for (var oy = -1; oy <= 1; oy += 1) {
      for (var ox = -1; ox <= 1; ox += 1) {
        if (ox == 0 && oy == 0) { continue; }
        let nd = depth_at_global(gx + ox, gy + oy);
        if (nd.x > 0.0 && nd.y <= RHO_MIN) { dry += 1u; }
      }
    }
    delta = f32(dry) * 0.125;
  }
  wet_snap[snap_index(slot, PCH_DELTA, lane)] = delta;
}

// ---- wet_step_water: 타일당 stepTile(셀당 1스레드, 쓰기는 자기 셀뿐) ----
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.wetStepWater}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    let t = table.wet_live_tiles[wid.x];
    wg_tile = t;
    wg_tslot = atomicLoad(&table.wet_slots[t]);
    atomicStore(&wg_keep, 0u);
  }
  let tile = workgroupUniformLoad(&wg_tile);
  let slot = workgroupUniformLoad(&wg_tslot);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) {
    if (lane == 0u) { atomicStore(&table.wet_live_next[tile], 0u); }
    return;
  }
  let tc = tile_coord(tile);
  // 3×3 이웃 타일 슬롯 맵(활성 + 할당이어야 유효, 아니면 벽).
  if (lane < 9u) {
    wg_slots[lane] = live_slot_at_tile(i32(tc.x) + i32(lane % 3u) - 1, i32(tc.y) + i32(lane / 3u) - 1);
  }
  // 종이 파생 필드(18×18, 1셀 헤일로 포함).
  for (var i = lane; i < PAD_CELLS; i += 256u) {
    let pc = paper_cell(i32(tc.x * TILE_SIZE) - 1 + i32(i % PAD_SIZE), i32(tc.y * TILE_SIZE) - 1 + i32(i / PAD_SIZE));
    pap_h[i] = pc.h;
    pap_abs[i] = pc.absorb;
    pap_cap[i] = pc.cap;
    for (var c = 0u; c < 4u; c += 1u) { pap_k[c * PAD_CELLS + i] = pc.k[c]; }
  }
  workgroupBarrier();

  let px = i32(lid.x) + 1;
  let py = i32(lid.y) + 1;
  let p = pad_index(px, py);
  let cap_scale = wet_kernel.cap_scale;

  let ws0 = sa(PCH_WS, px, py);
  let rho0 = sa(PCH_RHO, px, py);
  let s0 = sa(PCH_S, px, py);
  let cap = pap_cap[p] * cap_scale;
  var keep = false;

  // (0) 젖음 블러 B: 한 걸음 헬름홀츠 완화(이웃 평균 쪽으로 + 젖음 w를 주입). 마른 셀은 빨리 식는다.
  var b_new = 0.0;
  {
    let wd = ws0 + rho0;
    let w_inject = select(wd / BLUR_FULL, 1.0, wd >= BLUR_FULL);
    let bp = sa(PCH_B, px, py);
    var sum_b = 0.0;
    // 면 이웃 순서: W, E, N, S.
    sum_b = sum_b + select(bp, sa(PCH_B, px - 1, py), pad_valid(px - 1, py));
    sum_b = sum_b + select(bp, sa(PCH_B, px + 1, py), pad_valid(px + 1, py));
    sum_b = sum_b + select(bp, sa(PCH_B, px, py - 1), pad_valid(px, py - 1));
    sum_b = sum_b + select(bp, sa(PCH_B, px, py + 1), pad_valid(px, py + 1));
    let kb = select(BLUR_KEEP_DRY, BLUR_KEEP_WET, wd > RHO_MIN);
    b_new = (1.0 - kb) * w_inject + kb * 0.25 * sum_b;
    if (b_new < BLUR_WAKE) { b_new = 0.0; }
    wet_ext[ext_index(slot, EXT_BLUR, lane)] = b_new;
    if (b_new > 0.0) { keep = true; }
  }

  // (1) LBM: 풀 스트리밍 + 다공성 부분 bounce-back
  var fin: array<f32, 9>;
  var feq: array<f32, 9>;
  var jin: array<f32, 9>;
  fin[0] = sa(PCH_F0, px, py);
  var rho1 = fin[0];
  var jx = 0.0;
  var jy = 0.0;
  let s_t = wet_kernel.surf_tension;
  for (var q = 1u; q < 9u; q += 1u) {
    let yx = px - LBM_CX[q];
    let yy = py - LBM_CY[q];
    let fo = sa(LBM_OPP[q], px, py);
    var v = fo;
    if (pad_valid(yx, yy)) {
      var ox = px;
      var oy = py;
      if (LBM_UPSTREAM[q] == 1u) { ox = yx; oy = yy; }
      let kp = kap_at(LBM_CLASS[q], ox, oy);
      var x = ((rho0 + sa(PCH_RHO, yx, yy)) * 0.5) / RHO_FULL;
      if (x > 1.0) { x = 1.0; }
      let phi = x * (1.0 - s_t + s_t * x);
      let kap = 1.0 - (1.0 - kp) * phi;
      v = (1.0 - kap) * sa(q, yx, yy) + kap * fo;
    }
    fin[q] = v;
    rho1 = rho1 + v;
    jx = jx + f32(LBM_CX[q]) * v;
    jy = jy + f32(LBM_CY[q]) * v;
  }

  // (2) 체적 가속: 모세관 흡입, 종이 기울기, 에지 바깥 흐름, 중력
  let sc0 = s0 / cap;
  let pe = pad_index(px + 1, py);
  let pw = pad_index(px - 1, py);
  let pn = pad_index(px, py - 1);
  let ps = pad_index(px, py + 1);
  var sc_e = sc0;
  var sc_w = sc0;
  var sc_n = sc0;
  var sc_s = sc0;
  if (pad_valid(px + 1, py)) { sc_e = sa(PCH_S, px + 1, py) / (pap_cap[pe] * cap_scale); }
  if (pad_valid(px - 1, py)) { sc_w = sa(PCH_S, px - 1, py) / (pap_cap[pw] * cap_scale); }
  if (pad_valid(px, py - 1)) { sc_n = sa(PCH_S, px, py - 1) / (pap_cap[pn] * cap_scale); }
  if (pad_valid(px, py + 1)) { sc_s = sa(PCH_S, px, py + 1) / (pap_cap[ps] * cap_scale); }
  var ax = -wet_kernel.kc * (sc_e - sc_w) * 0.5 - wet_kernel.kh_flow * (pap_h[pe] - pap_h[pw]) * 0.5;
  var ay = -wet_kernel.kc * (sc_s - sc_n) * 0.5 - wet_kernel.kh_flow * (pap_h[ps] - pap_h[pn]) * 0.5;
  ax = ax + (wet_kernel.eta_edge * (sa(PCH_DELTA, px + 1, py) - sa(PCH_DELTA, px - 1, py)) * 0.5 + wet_kernel.g_ax);
  ay = ay + (wet_kernel.eta_edge * (sa(PCH_DELTA, px, py + 1) - sa(PCH_DELTA, px, py - 1)) * 0.5 + wet_kernel.g_ay);
  let a2 = ax * ax + ay * ay;
  if (a2 > ACCEL_MAX * ACCEL_MAX) {
    let sc = ACCEL_MAX / sqrt(a2);
    ax = ax * sc;
    ay = ay * sc;
  }

  // (3) 속도(이류용 거시 속도, 평형용 이동 속도) — 마하 상한
  var ux = 0.0;
  var uy = 0.0;
  var uex = 0.0;
  var uey = 0.0;
  if (rho1 > 1e-7) {
    let inv = 1.0 / rho1;
    ux = jx * inv + 0.5 * ax;
    uy = jy * inv + 0.5 * ay;
    uex = jx * inv + wet_kernel.tau * ax;
    uey = jy * inv + wet_kernel.tau * ay;
    let m1 = ux * ux + uy * uy;
    if (m1 > U_MAX * U_MAX) {
      let sc = U_MAX / sqrt(m1);
      ux = ux * sc;
      uy = uy * sc;
    }
    let m2 = uex * uex + uey * uey;
    if (m2 > U_MAX * U_MAX) {
      let sc = U_MAX / sqrt(m2);
      uex = uex * sc;
      uey = uey * sc;
    }
  }

  // (4) 충돌(BGK)
  let usq = 1.5 * (uex * uex + uey * uey);
  for (var q = 0u; q < 9u; q += 1u) {
    let cu = 3.0 * (f32(LBM_CX[q]) * uex + f32(LBM_CY[q]) * uey);
    let eq = LBM_W[q] * rho1 * (1.0 + cu + 0.5 * cu * cu - usq);
    feq[q] = fin[q] - wet_kernel.omega_lbm * (fin[q] - eq);
  }

  // (5) 모세관층 확산(문턱 이상, 8링크 — 섬유 전도율 1 − κ 적용, 링크 기증 한도 10%)
  var s1 = s0;
  for (var q = 1u; q < 9u; q += 1u) {
    jin[q] = 0.0;
    let qx = px + LBM_CX[q];
    let qy = py + LBM_CY[q];
    if (!pad_valid(qx, qy)) { continue; }
    let s_n = sa(PCH_S, qx, qy);
    let cap_n = pap_cap[pad_index(qx, qy)] * cap_scale;
    let cbar = 0.5 * (cap + cap_n);
    if (!(max(s0, s_n) > wet_kernel.theta_c * cbar)) { continue; }
    var ox = px;
    var oy = py;
    if (LBM_UPSTREAM[q] == 0u) { ox = qx; oy = qy; }
    let kk = kap_at(LBM_CLASS[q], ox, oy);
    var j = wet_kernel.dc * LINK_W[q] * (1.0 - kk) * cbar * (s_n / cap_n - sc0);
    if (j > 0.0) {
      let lim = 0.1 * s_n;
      if (j > lim) { j = lim; }
    } else {
      let lim = -0.1 * s0;
      if (j < lim) { j = lim; }
    }
    s1 = s1 + j;
    jin[q] = j;
  }

  // (6) 표면층: 상한 초과분은 흐름층으로, 흡수(seep)는 모세관 용량과 (1 − s/c)에 비례
  var ws = ws0;
  var flow_add = 0.0;
  if (ws > SURFACE_CAP) {
    flow_add = flow_add + (ws - SURFACE_CAP);
    ws = SURFACE_CAP;
  }
  if (ws > 0.0) {
    let room = cap - s1;
    var frac = wet_kernel.alpha * pap_abs[p] * (1.0 - s1 / cap) * wet_kernel.hf;
    if (frac < 0.0) { frac = 0.0; }
    if (frac > 1.0) { frac = 1.0; }
    var seep = ws * frac;
    if (wet_kernel.beta > 0.0 && seep * wet_kernel.beta > room) {
      seep = select(0.0, room / wet_kernel.beta, room > 0.0);
    }
    ws = ws - seep;
    s1 = s1 + wet_kernel.beta * seep;
    flow_add = flow_add + (1.0 - wet_kernel.beta) * seep;
  }

  // (7) 증발(젖음 전선 가중)
  var front = 0.0;
  let wtx = ws0 + rho0;
  if (wtx > RHO_MIN) {
    for (var n = 0u; n < 4u; n += 1u) {
      var qx = px;
      var qy = py;
      if (n == 0u) { qx = px - 1; }
      if (n == 1u) { qx = px + 1; }
      if (n == 2u) { qy = py - 1; }
      if (n == 3u) { qy = py + 1; }
      if (!pad_valid(qx, qy)) { continue; }
      let v = 1.0 - (sa(PCH_WS, qx, qy) + sa(PCH_RHO, qx, qy)) / (wtx + 1e-6);
      if (v > front) { front = v; }
    }
  }
  let boost = 1.0 + wet_kernel.edge_boost * front;
  var ev_s = wet_kernel.es * boost + ws * wet_kernel.dry_tail;
  if (ev_s > ws) { ev_s = ws; }
  ws = ws - ev_s;
  var rho_tot = rho1 + flow_add;
  var ev_f = wet_kernel.ef * boost + rho_tot * wet_kernel.dry_tail;
  if (ev_f > rho_tot) { ev_f = rho_tot; }
  let rho_after = rho_tot - ev_f;
  if (ws <= 0.0 && rho_after < RHO_MIN && s1 > 0.0) {
    var ev_c = wet_kernel.ec * boost + s1 * wet_kernel.dry_tail * 0.5;
    if (ev_c > s1) { ev_c = s1; }
    s1 = s1 - ev_c;
  }
  rho_tot = rho_after;

  // 잔량 접힘
  var residual = false;
  if (ws + rho_tot + s1 < WATER_EPS) {
    ws = 0.0;
    rho_tot = 0.0;
    s1 = 0.0;
    residual = true;
  }

  // 새 분포 기록(증발·흡수 반영: 비례 축소 + f0 가산)
  var scale_f = 0.0;
  if (rho1 > 0.0) { scale_f = (rho1 - min(ev_f, rho1)) / rho1; }
  if (residual) {
    for (var q = 0u; q < 9u; q += 1u) { wet_ext[ext_index(slot, EXT_F0 + q, lane)] = 0.0; }
    wet_ext[ext_index(slot, EXT_RHO, lane)] = 0.0;
  } else {
    let add0 = flow_add - max(0.0, ev_f - rho1);
    for (var q = 0u; q < 9u; q += 1u) {
      var fv = feq[q] * scale_f;
      if (q == 0u) { fv = fv + add0; }
      wet_ext[ext_index(slot, EXT_F0 + q, lane)] = fv;
    }
    wet_ext[ext_index(slot, EXT_RHO, lane)] = rho_tot;
  }
  wet_ext[ext_index(slot, EXT_CAP, lane)] = s1;
  wet_pool[core_index(slot, WET_CH_WATER, lane)] = ws;

  // (8) 안료: 8링크 확산(섬유 전도율 (1 − κ)/(1 − k0)) + 4면 상류 이류, 링크 유출 상한, gather
  let g0 = sa(PCH_G0 + 3u, px, py);
  let wet_x = ws0 + rho0 > RHO_MIN;
  let uxo = sa(PCH_UX, px, py);
  let uyo = sa(PCH_UY, px, py);
  var out_total = 0.0;
  var gr = 0.0;
  var gg = 0.0;
  var gb = 0.0;
  var gm = 0.0;
  for (var q = 1u; q < 9u; q += 1u) {
    let qx = px + LBM_CX[q];
    let qy = py + LBM_CY[q];
    if (!pad_valid(qx, qy)) { continue; }
    let wet_n = (sa(PCH_WS, qx, qy) + sa(PCH_RHO, qx, qy)) > RHO_MIN;
    var ox = px;
    var oy = py;
    if (LBM_UPSTREAM[q] == 0u) { ox = qx; oy = qy; }
    let kk = kap_at(LBM_CLASS[q], ox, oy);
    var diff = 0.0;
    if (wet_x && wet_n) { diff = wet_kernel.dp * LINK_W[q] * (1.0 - kk) * wet_kernel.inv_gref; }
    var adv = 0.0;
    var adv_in = 0.0;
    // 모세관 운반: 이 링크로 모세관 물이 흐르면 기증 셀 안료의 (이동도 × 유량 / 기증 셀 총 물)이 같이 간다.
    let jq = jin[q];
    if (jq > 0.0) {
      let wn = (sa(PCH_WS, qx, qy) + sa(PCH_RHO, qx, qy)) + sa(PCH_S, qx, qy);
      adv_in = adv_in + (wet_kernel.lambda_k * jq) / (wn + 1e-6);
    } else if (jq < 0.0) {
      adv = adv + (-wet_kernel.lambda_k * jq) / (ws0 + rho0 + s0 + 1e-6);
    }
    if (q <= 4u) {
      let ufx = 0.5 * (uxo + sa(PCH_UX, qx, qy));
      let ufy = 0.5 * (uyo + sa(PCH_UY, qx, qy));
      let un = ufx * f32(LBM_CX[q]) + ufy * f32(LBM_CY[q]);
      if (un > 0.0) { adv = adv + wet_kernel.lambda_k * un; } else { adv_in = adv_in - wet_kernel.lambda_k * un; }
      // 에지 이동(Curtis FlowOutward): 젖은 두 셀 사이에서 블러 B가 높은 안쪽에서 낮은 바깥쪽(젖음 전선)으로 안료가 모인다.
      if (wet_kernel.edge_drift > 0.0 && wet_x && wet_n) {
        let de = wet_kernel.edge_drift * (sa(PCH_B, px, py) - sa(PCH_B, qx, qy));
        if (de > 0.0) { adv = adv + de; } else { adv_in = adv_in - de; }
      }
      // 그래뉼레이션: 젖은 두 셀 사이에서 안료가 종이 요철의 높은 쪽에서 낮은 쪽(골)으로 흘러내린다.
      if (wet_kernel.grain_drift > 0.0 && wet_x && wet_n) {
        let dh = wet_kernel.grain_drift * (pap_h[p] - pap_h[pad_index(qx, qy)]);
        if (dh > 0.0) { adv = adv + dh; } else { adv_in = adv_in - dh; }
      }
    }
    let link_cap = select(DIAG_OUT_MAX, FACE_OUT_MAX, q <= 4u);
    // x → 이웃(q 방향)
    var o_out = diff + adv;
    if (o_out > link_cap) { o_out = link_cap; }
    if (g0 > 0.0) { out_total = out_total + o_out; }
    // 이웃 → x (반대 방향)
    var o_in = diff + adv_in;
    if (o_in > link_cap) { o_in = link_cap; }
    let gn = sa(PCH_G0 + 3u, qx, qy);
    if (gn > 0.0) {
      gr = gr + o_in * sa(PCH_G0, qx, qy);
      gg = gg + o_in * sa(PCH_G0 + 1u, qx, qy);
      gb = gb + o_in * sa(PCH_G0 + 2u, qx, qy);
      gm = gm + o_in * gn;
    }
  }
  let keep_frac = 1.0 - out_total;
  gr = gr + keep_frac * sa(PCH_G0, px, py);
  gg = gg + keep_frac * sa(PCH_G0 + 1u, px, py);
  gb = gb + keep_frac * sa(PCH_G0 + 2u, px, py);
  gm = gm + keep_frac * g0;

  // (9) 침착·재부유·건조 정착
  let wdepth = ws + rho_tot;
  var dr = pool_at(slot, WET_CH_FIX_R, lane);
  var dg = pool_at(slot, WET_CH_FIX_G, lane);
  var db = pool_at(slot, WET_CH_FIX_B, lane);
  var dm = pool_at(slot, WET_CH_FIX_MASS, lane);
  let h_p = pap_h[p];
  var catch_depth = RHO_MIN;
  if (wet_kernel.dry_brush > 0.0) { catch_depth = max(RHO_MIN, wet_kernel.dry_brush * h_p * DRY_BRUSH_DEPTH); }
  var cure = ext_at(slot, EXT_CURE, lane);
  if (wdepth < catch_depth) {
    // 마른(또는 종이 요철에 걸린) 곳: 부유 안료는 즉시 침착한다(새로 쌓였으면 경화를 처음부터 센다).
    if (gm > MASS_EPS && cure > wet_kernel.cure_limit) { cure = 0.0; }
    dr = dr + gr;
    dg = dg + gg;
    db = db + gb;
    dm = dm + gm;
    gr = 0.0;
    gg = 0.0;
    gb = 0.0;
    gm = 0.0;
  } else {
    let wetness = min(1.0, wdepth / DEPTH_REF);
    // 재부유(재습윤): 침착 안료의 일부가 떠오른다
    if (dm > MASS_EPS && wet_kernel.omega_k > 0.0) {
      let lf = min(0.5, wet_kernel.omega_k * wetness);
      gr = gr + dr * lf;
      gg = gg + dg * lf;
      gb = gb + db * lf;
      gm = gm + dm * lf;
      dr = dr - dr * lf;
      dg = dg - dg * lf;
      db = db - db * lf;
      dm = dm - dm * lf;
    }
    if (gm > 0.0) {
      let hard = ext_at(slot, EXT_HARD_MASS, lane);
      let glue = min(2.0, gm + dm + hard);
      let thin = 1.0 - wetness;
      // 침착 = 중력 침강(얇을수록·골일수록 빠름) + 섬유 포집(속도 비례).
      let spd = min(1.0, length(vec2<f32>(ux, uy)) / PIN_SPEED_REF);
      let kbar = (kap_at(0u, px, py) + kap_at(0u, px - 1, py) + kap_at(1u, px, py) + kap_at(1u, px, py - 1)) * 0.25;
      var dep = wet_kernel.rho_k * (1.0 + wet_kernel.gran * (1.0 - h_p)) * (1.0 + THIN_BOOST * thin)
        + wet_kernel.pin * wet_kernel.hf * kbar * (1.0 + wet_kernel.glue_gain * glue) * (PIN_STATIC + (1.0 - PIN_STATIC) * spd);
      if (dep > 0.9) { dep = 0.9; }
      dr = dr + gr * dep;
      dg = dg + gg * dep;
      db = db + gb * dep;
      dm = dm + gm * dep;
      gr = gr - gr * dep;
      gg = gg - gg * dep;
      gb = gb - gb * dep;
      gm = gm - gm * dep;
    }
  }
  wet_pool[core_index(slot, WET_CH_PIG_R, lane)] = gr;
  wet_pool[core_index(slot, WET_CH_PIG_G, lane)] = gg;
  wet_pool[core_index(slot, WET_CH_PIG_B, lane)] = gb;
  wet_pool[core_index(slot, WET_CH_PIG_MASS, lane)] = gm;
  wet_pool[core_index(slot, WET_CH_VX, lane)] = select(0.0, ux, rho_tot > 0.0);
  wet_pool[core_index(slot, WET_CH_VY, lane)] = select(0.0, uy, rho_tot > 0.0);

  // (10) 경화: 마른 셀은 카운터 증가, 한계를 넘으면 (1 − rewet)만 고정(D)
  if (wdepth >= RHO_MIN) {
    cure = 0.0;
  } else if (dm > MASS_EPS && cure <= wet_kernel.cure_limit) {
    cure = cure + 1.0;
    if (cure > wet_kernel.cure_limit) {
      let fixed_frac = 1.0 - wet_kernel.rewet;
      wet_ext[ext_index(slot, EXT_HARD_R, lane)] = ext_at(slot, EXT_HARD_R, lane) + fixed_frac * dr;
      wet_ext[ext_index(slot, EXT_HARD_G, lane)] = ext_at(slot, EXT_HARD_G, lane) + fixed_frac * dg;
      wet_ext[ext_index(slot, EXT_HARD_B, lane)] = ext_at(slot, EXT_HARD_B, lane) + fixed_frac * db;
      wet_ext[ext_index(slot, EXT_HARD_MASS, lane)] = ext_at(slot, EXT_HARD_MASS, lane) + fixed_frac * dm;
      dr = wet_kernel.rewet * dr;
      dg = wet_kernel.rewet * dg;
      db = wet_kernel.rewet * db;
      dm = wet_kernel.rewet * dm;
    }
  }
  wet_pool[core_index(slot, WET_CH_FIX_R, lane)] = dr;
  wet_pool[core_index(slot, WET_CH_FIX_G, lane)] = dg;
  wet_pool[core_index(slot, WET_CH_FIX_B, lane)] = db;
  wet_pool[core_index(slot, WET_CH_FIX_MASS, lane)] = dm;
  wet_ext[ext_index(slot, EXT_CURE, lane)] = cure;
  if (ws + rho_tot + s1 >= WATER_EPS || gm > MASS_EPS || (dm > MASS_EPS && cure <= wet_kernel.cure_limit)) { keep = true; }

  if (keep) { atomicOr(&wg_keep, 1u); }
  workgroupBarrier();
  if (lane == 0u) { atomicStore(&table.wet_live_next[tile], atomicLoad(&wg_keep)); }
}

// ---- wet_expand: retire 뒤 남은 활성 타일의 경계 셀에 물(ws + ρ > WET_EPS)이 있으면 4면 이웃을, 모서리 셀이면 대각 이웃을 활성화한다. ----
// 새 타일은 필요하면 CAS로 슬롯을 할당한다(슬롯 번호는 결과에 영향이 없다). 새로 활성화된 타일은 다음 서브스텝부터 처리된다.
fn wet_activate(tx: i32, ty: i32) {
  if (tx < 0 || ty < 0 || tx >= i32(params.tiles_x) || ty >= i32(params.tiles_y)) { return; }
  let n = u32(ty) * params.tiles_x + u32(tx);
  var slot = atomicLoad(&table.wet_slots[n]);
  if (slot == SLOT_NONE) {
    var won = false;
    for (var attempt = 0u; attempt < 16u; attempt += 1u) {
      let r = atomicCompareExchangeWeak(&table.wet_slots[n], SLOT_NONE, SLOT_RESERVED);
      if (r.exchanged) { won = true; break; }
      if (r.old_value != SLOT_NONE) { break; }
    }
    if (won) {
      let s = atomicAdd(&table.wet_cursor, 1u);
      if (s < params.wet_capacity) {
        atomicStore(&table.wet_slots[n], s);
        let j = atomicAdd(&table.wet_active_count, 1u);
        if (j < MAX_TILES) { table.wet_active_tiles[j] = n; }
      } else {
        atomicAdd(&table.wet_overflow, 1u);
        atomicStore(&table.wet_slots[n], SLOT_NONE);
      }
    }
  }
  // 슬롯 확정과 무관하게 활성 표식을 남긴다. 슬롯이 없으면 처리되지 않는다(wet_overflow로 fail-visible).
  atomicStore(&table.wet_live_next[n], 1u);
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.wetExpand}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    let t = table.wet_live_tiles[wid.x];
    wg_tile = t;
    wg_tslot = atomicLoad(&table.wet_slots[t]);
    wg_flag = atomicLoad(&table.wet_live_next[t]);
    atomicStore(&wg_sides, 0u);
  }
  let tile = workgroupUniformLoad(&wg_tile);
  let slot = workgroupUniformLoad(&wg_tslot);
  let live = workgroupUniformLoad(&wg_flag);
  if (live == 0u || slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  let w = wet_pool[core_index(slot, WET_CH_WATER, lane)] + wet_ext[ext_index(slot, EXT_RHO, lane)];
  if (w > WET_EPS) {
    var bits = 0u;
    if (lid.x == 0u) { bits = bits | 1u; }
    if (lid.x == TILE_SIZE - 1u) { bits = bits | 2u; }
    if (lid.y == 0u) { bits = bits | 4u; }
    if (lid.y == TILE_SIZE - 1u) { bits = bits | 8u; }
    if (lid.x == 0u && lid.y == 0u) { bits = bits | 16u; }
    if (lid.x == TILE_SIZE - 1u && lid.y == 0u) { bits = bits | 32u; }
    if (lid.x == 0u && lid.y == TILE_SIZE - 1u) { bits = bits | 64u; }
    if (lid.x == TILE_SIZE - 1u && lid.y == TILE_SIZE - 1u) { bits = bits | 128u; }
    if (bits != 0u) { atomicOr(&wg_sides, bits); }
  }
  workgroupBarrier();
  if (lane == 0u) {
    let sides = atomicLoad(&wg_sides);
    let tc = tile_coord(tile);
    let tx = i32(tc.x);
    let ty = i32(tc.y);
    if ((sides & 1u) != 0u) { wet_activate(tx - 1, ty); }
    if ((sides & 2u) != 0u) { wet_activate(tx + 1, ty); }
    if ((sides & 4u) != 0u) { wet_activate(tx, ty - 1); }
    if ((sides & 8u) != 0u) { wet_activate(tx, ty + 1); }
    if ((sides & 16u) != 0u) { wet_activate(tx - 1, ty - 1); }
    if ((sides & 32u) != 0u) { wet_activate(tx + 1, ty - 1); }
    if ((sides & 64u) != 0u) { wet_activate(tx - 1, ty + 1); }
    if ((sides & 128u) != 0u) { wet_activate(tx + 1, ty + 1); }
  }
}

// ---- wet_commit: live ← live_next 확정 + 활성 타일 압축(목록 순서 고정) + 간접 인자 기록. 단일 워크그룹. ----
@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.wetCommit}(@builtin(local_invocation_id) lid: vec3<u32>) {
  let lane = lid.x;
  if (lane == 0u) {
    wg_total = min(atomicLoad(&table.wet_active_count), MAX_TILES);
  }
  let n = workgroupUniformLoad(&wg_total);
  var base = 0u;
  for (var start = 0u; start < n; start += WORKGROUP_1D) {
    let i = start + lane;
    var flag = 0u;
    var t = 0u;
    if (i < n) {
      t = table.wet_active_tiles[i];
      flag = atomicLoad(&table.wet_live_next[t]);
      table.wet_live[t] = flag;
    }
    let ex = workgroup_exclusive_scan(flag, lane);
    if (i < n && flag != 0u) { table.wet_live_tiles[base + ex] = t; }
    base = base + workgroup_scan_total();
    workgroupBarrier();
  }
  if (lane == 0u) {
    atomicStore(&table.wet_live_count, base);
    indirect_args.wet = vec3<u32>(n, 1u, 1u);
    indirect_args.wet_live = vec3<u32>(base, 1u, 1u);
  }
}

// ---- wet_settle_check: 정착 루프 프레임 끝 검사. 활성 타일이 0이면 이후 프레임의 유화 건조 등을 건너뛰게 표시한다(CPU settleWet break 미러). ----
@compute @workgroup_size(1)
fn ${ENTRY_POINTS.wetSettleCheck}() {
  if (params.wet_settle != 0u && atomicLoad(&table.wet_live_count) == 0u) { table.wet_settle_done = 1u; }
}
`;
