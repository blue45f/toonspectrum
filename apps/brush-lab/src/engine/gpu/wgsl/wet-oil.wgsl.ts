import { ENTRY_POINTS, GPU_TILE_SIZE, OIL_WORKGROUP } from "../layout";

import { samplingHelpersWgsl } from "./common.wgsl";
import { WET_PAD_WGSL, wetModuleHeader } from "./wet-common.wgsl";

/**
 * 유화(medium = "oil") GPU 미러 — CPU `raster/fine-raster.ts` `applyImpastoDabs`와 `wet/oil-layer.ts`의 창 처리·서브스텝.
 *
 * **dab 순서 처리**(dab 1개 = 순차 단계, 이전 dab의 결과를 본다). 호스트가 dab마다 창·방향 레코드(`oil_dab`, 동적 uniform)를 올리고
 * 아래 커널을 dab 인덱스 순서로 직접 디스패치한다(디스패치 사이 storage 동기화가 dab 순서 의미를 보장한다).
 *   oil_shade   — 창 셀마다 풀 → 스크래치 벌 0 로드 + dab 입력(amount·dep·weight·dir) 계산(shadeDabPixel 미러)
 *   oil_reduce  — 단일 워크그룹 고정 트리 리덕션: 침착 합 depTotal, any(= dab가 닿는 셀이 있는가)
 *   oil_push    — 밀기 gather 패스(passes회, 스크래치 벌 핑퐁): 창 전체를 한 번에 읽고 한 번에 쓴다(pushOilWindow 미러)
 *   oil_carry   — 단일 워크그룹 리덕션으로 젖은 물감의 평균 색을 집어 붓 색을 갱신(updateOilCarry 미러, 고정 순서 트리)
 *   oil_deposit — 붓 색으로 침착, 아래 젖은 물감과 KM 혼색(depositOilWindow 미러)
 *   oil_store   — 스크래치 → 풀 되쓰기(storeOilWindow 미러; 창이 덮는 타일은 scan_add가 미리 할당해 두므로 슬롯 없는 셀은 건너뜀)
 * 스크래치 버퍼(`oil_scratch`): 헤더 16 f32(붓 색 carry·이번 색·합계) + 벌 2개(H·B·m·Cr·Cg·Cb 각 창 셀 수 N) + dab 입력 4채널.
 *
 * **서브스텝**: oil_snapshot → oil_level(Bingham 레벨링, gather) → oil_dry(모든 할당 타일의 젖은 부피 감쇠) → wet_commit.
 * 유화는 LBM을 쓰지 않으며 `expandActive`도 부르지 않는다(타일은 dab 침착의 1링 활성화로만 깨어나고 레벨링 이동이 없으면 retire).
 *
 * 결정성: 모든 쓰기는 자기 셀, 리덕션은 고정 순서(스레드 stride + 고정 트리), 원자 없음(keep 합류 제외).
 */
export const WET_OIL_WGSL: string = /* wgsl */ `${wetModuleHeader(["oilWindow", "oilLevel"])}
${samplingHelpersWgsl("params")}
${WET_PAD_WGSL}

var<workgroup> wg_tile: u32;
var<workgroup> wg_tslot: u32;
var<workgroup> red_a: array<f32, 256>;
var<workgroup> red_b: array<f32, 256>;
var<workgroup> red_c: array<f32, 256>;
var<workgroup> red_d: array<f32, 256>;

// ---- 스크래치 주소 ----
// 상태 채널: 0 H(총 높이), 1 B(마른 릴리프), 2 m(젖은 부피), 3..5 C(색 × 부피). 벌 buf ∈ {0, 1}.
fn os_state(buf: u32, c: u32, o: u32, n: u32) -> u32 { return OIL_HEADER + (buf * 6u + c) * n + o; }
// dab 입력 채널: 0 amount, 1 dep, 2 weight, 3 dir 코드(0 = dab가 닿지 않음, 아니면 (dx + 1) + 3(dy + 1): 1 위·3 왼쪽·5 오른쪽·7 아래).
fn os_aux(a: u32, o: u32, n: u32) -> u32 { return OIL_HEADER + 12u * n + a * n + o; }

fn oil_win_w() -> u32 { return u32(oil_dab.win_x1 - oil_dab.win_x0 + 1); }

// 창 셀의 체적 V = max(0, H − B)(oil-layer.ts volumeAt).
fn os_volume(buf: u32, o: u32, n: u32) -> f32 {
  let v = oil_scratch[os_state(buf, 0u, o, n)] - oil_scratch[os_state(buf, 1u, o, n)];
  return select(0.0, v, v > 0.0);
}

// 이 dab의 한 픽셀 셰이드(shadeDabPixel 미러): 픽셀 중심의 커버리지·팁 마스크·그레인. AABB 밖이면 hit = false.
fn oil_dab_shade(d: Dab, x: i32, y: i32) -> DabCoverage {
  let px = f32(x) + 0.5;
  let py = f32(y) + 0.5;
  let dx = px - d.p.x;
  let dy = py - d.p.y;
  let e = dab_extent_px(d);
  if (dy > e || dy < -e || dx > e || dx < -e) { return DabCoverage(0.0, 1.0, 1.0, false); }
  return dab_coverage(d, px, py, dx, dy, params.edge_curve_enabled != 0u, params.filter_mode, f32(params.tip_atlas_tile), params.paper_enabled != 0u);
}

// ---- oil_shade ----
@compute @workgroup_size(${OIL_WORKGROUP})
fn ${ENTRY_POINTS.oilShade}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = oil_dab.cell_count;
  let o = gid.x;
  if (o >= n) { return; }
  let ww = oil_win_w();
  let x = oil_dab.win_x0 + i32(o % ww);
  let y = oil_dab.win_y0 + i32(o / ww);
  // 풀 → 벌 0(loadOilWindow). 미할당 타일은 0.
  var st = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  let slot = slot_at_pixel(x, y);
  if (slot != SLOT_NONE) {
    let l = local_of_pixel(x, y);
    st[0] = pool_at(slot, WET_CH_HEIGHT, l);
    st[1] = ext_at(slot, EXT_OIL_BASE, l);
    st[2] = ext_at(slot, EXT_OIL_WET, l);
    st[3] = ext_at(slot, EXT_OIL_R, l);
    st[4] = ext_at(slot, EXT_OIL_G, l);
    st[5] = ext_at(slot, EXT_OIL_B, l);
  }
  for (var c = 0u; c < 6u; c += 1u) { oil_scratch[os_state(0u, c, o, n)] = st[c]; }
  // dab 입력(창 안쪽 AABB만).
  var amount = 0.0;
  var dep_v = 0.0;
  var weight = 0.0;
  var dirc = 0.0;
  if (x >= oil_dab.in_x0 && x <= oil_dab.in_x1 && y >= oil_dab.in_y0 && y <= oil_dab.in_y1) {
    let d = dabs[oil_dab.dab_index];
    let cv = oil_dab_shade(d, x, y);
    if (cv.hit) {
      let cm = cv.cov * cv.mask;
      let mass = max(IMPASTO_MIN_MASS, dab_pigment_mass(d));
      amount = cm * wet_kernel.oil_push;
      weight = cm;
      dep_v = cm * cv.grain * d.flow * mass;
      // 진행 방향 + 붓 가장자리일수록 큰 측면 성분(둑 형성). 지배 축 한 칸으로 보낸다.
      let r_lat = max(1e-3, d.r.y);
      let lat = clamp((-(f32(x) + 0.5 - d.p.x) * oil_dab.sin_a + (f32(y) + 0.5 - d.p.y) * oil_dab.cos_a) / r_lat, -1.0, 1.0);
      let vx = oil_dab.cos_a - OIL_SIDE_GAIN * lat * oil_dab.sin_a;
      let vy = oil_dab.sin_a + OIL_SIDE_GAIN * lat * oil_dab.cos_a;
      if (abs(vx) >= abs(vy)) {
        dirc = select(3.0, 5.0, vx >= 0.0);
      } else {
        dirc = select(1.0, 7.0, vy >= 0.0);
      }
    }
  }
  oil_scratch[os_aux(0u, o, n)] = amount;
  oil_scratch[os_aux(1u, o, n)] = dep_v;
  oil_scratch[os_aux(2u, o, n)] = weight;
  oil_scratch[os_aux(3u, o, n)] = dirc;
}

// ---- oil_reduce: 침착 합·any. 단일 워크그룹, 스레드 stride 합 + 고정 트리(합산 순서 고정) ----
@compute @workgroup_size(${OIL_WORKGROUP})
fn ${ENTRY_POINTS.oilReduce}(@builtin(local_invocation_id) lid: vec3<u32>) {
  let n = oil_dab.cell_count;
  let lane = lid.x;
  var dep_sum = 0.0;
  var hit = 0.0;
  for (var o = lane; o < n; o += ${OIL_WORKGROUP}u) {
    if (oil_scratch[os_aux(3u, o, n)] > 0.0) {
      hit = 1.0;
      dep_sum = dep_sum + oil_scratch[os_aux(1u, o, n)];
    }
  }
  red_a[lane] = dep_sum;
  red_b[lane] = hit;
  workgroupBarrier();
  for (var s = ${OIL_WORKGROUP / 2}u; s > 0u; s = s >> 1u) {
    if (lane < s) {
      red_a[lane] = red_a[lane] + red_a[lane + s];
      red_b[lane] = max(red_b[lane], red_b[lane + s]);
    }
    workgroupBarrier();
  }
  if (lane == 0u) {
    oil_scratch[12u] = red_a[0];
    oil_scratch[13u] = red_b[0];
  }
}

// ---- oil_push: 부피 보존 gather 밀기 1패스(pushOilWindow). 읽기 벌 src_buf → 쓰기 벌 1 − src_buf ----
struct PushOut { mv: f32, tx: i32, ty: i32 }

// 셀 (wx, wy)가 보내는 양과 목표 셀. 보내지 않으면 mv = 0, 목표 = (−1, −1).
fn push_out(src: u32, wx: i32, wy: i32, ww: i32, wh: i32, n: u32) -> PushOut {
  let o = u32(wy * ww + wx);
  let a = oil_scratch[os_aux(0u, o, n)];
  if (a <= 0.0) { return PushOut(0.0, -1, -1); }
  let code = u32(oil_scratch[os_aux(3u, o, n)]);
  if (code == 0u) { return PushOut(0.0, -1, -1); }
  let dx = i32(code % 3u) - 1;
  let dy = i32(code / 3u) - 1;
  let nx = wx + dx;
  let ny = wy + dy;
  if (nx < 0 || ny < 0 || nx >= ww || ny >= wh || (nx == wx && ny == wy)) { return PushOut(0.0, -1, -1); }
  let m = oil_scratch[os_state(src, 2u, o, n)];
  if (m <= OIL_EPS) { return PushOut(0.0, -1, -1); }
  return PushOut(m * min(1.0, a), nx, ny);
}

@compute @workgroup_size(${OIL_WORKGROUP})
fn ${ENTRY_POINTS.oilPush}(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (oil_scratch[13u] <= 0.0) { return; }
  let n = oil_dab.cell_count;
  let o = gid.x;
  if (o >= n) { return; }
  let ww = i32(oil_win_w());
  let wh = i32(n) / ww;
  let wx = i32(o) % ww;
  let wy = i32(o) / ww;
  let src = oil_dab.src_buf;
  let dst = 1u - src;
  let h0 = oil_scratch[os_state(src, 0u, o, n)];
  let b0 = oil_scratch[os_state(src, 1u, o, n)];
  let m0 = oil_scratch[os_state(src, 2u, o, n)];
  let v0 = os_volume(src, o, n);
  // 자기 유출 후 남는 양(색은 그대로)
  let own = push_out(src, wx, wy, ww, wh, n).mv;
  let vr = v0 - own;
  let mr = m0 - own;
  var cr = 0.0;
  var cg = 0.0;
  var cb = 0.0;
  if (v0 > OIL_EPS) {
    cr = oil_scratch[os_state(src, 3u, o, n)] / v0;
    cg = oil_scratch[os_state(src, 4u, o, n)] / v0;
    cb = oil_scratch[os_state(src, 5u, o, n)] / v0;
  }
  var incoming = 0.0;
  // 이웃 순서: (−1,0), (+1,0), (0,−1), (0,+1).
  for (var k = 0u; k < 4u; k += 1u) {
    var sx = wx;
    var sy = wy;
    if (k == 0u) { sx = wx - 1; }
    if (k == 1u) { sx = wx + 1; }
    if (k == 2u) { sy = wy - 1; }
    if (k == 3u) { sy = wy + 1; }
    if (sx < 0 || sy < 0 || sx >= ww || sy >= wh) { continue; }
    let so_i = u32(sy * ww + sx);
    let po = push_out(src, sx, sy, ww, wh, n);
    if (po.tx != wx || po.ty != wy) { continue; }
    let q = po.mv;
    if (q <= 0.0) { continue; }
    let sv = os_volume(src, so_i, n);
    if (sv <= OIL_EPS) { continue; }
    let qc = vec3<f32>(
      oil_scratch[os_state(src, 3u, so_i, n)] / sv,
      oil_scratch[os_state(src, 4u, so_i, n)] / sv,
      oil_scratch[os_state(src, 5u, so_i, n)] / sv);
    if (vr + incoming <= OIL_EPS) {
      cr = qc.x;
      cg = qc.y;
      cb = qc.z;
    } else {
      let t = q / (q + wet_kernel.oil_mixing * (mr + incoming) + 1e-9);
      let mixed = km_mix(vec3<f32>(cr, cg, cb), qc, t);
      cr = mixed.x;
      cg = mixed.y;
      cb = mixed.z;
    }
    incoming = incoming + q;
  }
  if (own == 0.0 && incoming == 0.0) {
    // 움직임이 없는 셀은 그대로 둔다(이론상 같은 값이지만 f32 재조합 오차를 만들지 않는다).
    oil_scratch[os_state(dst, 0u, o, n)] = h0;
    oil_scratch[os_state(dst, 2u, o, n)] = m0;
    oil_scratch[os_state(dst, 3u, o, n)] = oil_scratch[os_state(src, 3u, o, n)];
    oil_scratch[os_state(dst, 4u, o, n)] = oil_scratch[os_state(src, 4u, o, n)];
    oil_scratch[os_state(dst, 5u, o, n)] = oil_scratch[os_state(src, 5u, o, n)];
  } else {
    let v_new = vr + incoming;
    oil_scratch[os_state(dst, 0u, o, n)] = b0 + v_new;
    oil_scratch[os_state(dst, 2u, o, n)] = mr + incoming;
    oil_scratch[os_state(dst, 3u, o, n)] = cr * v_new;
    oil_scratch[os_state(dst, 4u, o, n)] = cg * v_new;
    oil_scratch[os_state(dst, 5u, o, n)] = cb * v_new;
  }
  oil_scratch[os_state(dst, 1u, o, n)] = b0;
}

// ---- oil_carry: 붓이 들고 있는 색 갱신(updateOilCarry). 단일 워크그룹 리덕션. ----
@compute @workgroup_size(${OIL_WORKGROUP})
fn ${ENTRY_POINTS.oilCarry}(@builtin(local_invocation_id) lid: vec3<u32>) {
  // 이른 return을 두지 않는다(아래 barrier는 균일 제어 흐름이어야 한다). any가 없으면 합계·갱신을 건너뛴다.
  let any_hit = oil_scratch[13u] > 0.0;
  let n = oil_dab.cell_count;
  let lane = lid.x;
  let cur = oil_dab.cur_buf;
  var mu = 0.0;
  var sr = 0.0;
  var sg = 0.0;
  var sb = 0.0;
  if (any_hit && wet_kernel.oil_pickup > 0.0 && oil_scratch[3u] != 0.0) {
    for (var o = lane; o < n; o += ${OIL_WORKGROUP}u) {
      let wgt = oil_scratch[os_aux(2u, o, n)];
      if (wgt <= 0.0) { continue; }
      let m = oil_scratch[os_state(cur, 2u, o, n)];
      if (m <= OIL_EPS) { continue; }
      let v = os_volume(cur, o, n);
      if (v <= OIL_EPS) { continue; }
      let q = wgt * m;
      mu = mu + q;
      sr = sr + (q * oil_scratch[os_state(cur, 3u, o, n)]) / v;
      sg = sg + (q * oil_scratch[os_state(cur, 4u, o, n)]) / v;
      sb = sb + (q * oil_scratch[os_state(cur, 5u, o, n)]) / v;
    }
  }
  red_a[lane] = mu;
  red_b[lane] = sr;
  red_c[lane] = sg;
  red_d[lane] = sb;
  workgroupBarrier();
  for (var s = ${OIL_WORKGROUP / 2}u; s > 0u; s = s >> 1u) {
    if (lane < s) {
      red_a[lane] = red_a[lane] + red_a[lane + s];
      red_b[lane] = red_b[lane] + red_b[lane + s];
      red_c[lane] = red_c[lane] + red_c[lane + s];
      red_d[lane] = red_d[lane] + red_d[lane + s];
    }
    workgroupBarrier();
  }
  if (lane == 0u && any_hit) {
    let d = dabs[oil_dab.dab_index];
    var dab_color = vec3<f32>(0.0, 0.0, 0.0);
    if (d.color.a > 0.0) { dab_color = d.color.rgb / d.color.a; }
    var carry = vec3<f32>(oil_scratch[0u], oil_scratch[1u], oil_scratch[2u]);
    var color = dab_color;
    if (oil_scratch[3u] == 0.0) {
      // 획의 첫 dab: 붓에 dab 색을 싣는다.
      carry = dab_color;
      color = carry;
    } else {
      var c = carry;
      let mu_t = red_a[0];
      if (mu_t > OIL_EPS) {
        let w_mix = (wet_kernel.oil_pickup * mu_t) / (mu_t + oil_scratch[12u] + 1e-9);
        c = km_mix(c, vec3<f32>(red_b[0] / mu_t, red_c[0] / mu_t, red_d[0] / mu_t), w_mix);
      }
      c = km_mix(c, dab_color, OIL_RELOAD);
      carry = c;
      color = c;
    }
    oil_scratch[0u] = carry.x;
    oil_scratch[1u] = carry.y;
    oil_scratch[2u] = carry.z;
    oil_scratch[3u] = 1.0;
    oil_scratch[4u] = color.x;
    oil_scratch[5u] = color.y;
    oil_scratch[6u] = color.z;
  }
}

// ---- oil_deposit: dep만큼 부피를 더하고 색을 섞는다(depositOilWindow). 최신 벌에서 제자리 갱신(셀 독립). ----
@compute @workgroup_size(${OIL_WORKGROUP})
fn ${ENTRY_POINTS.oilDeposit}(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (oil_scratch[13u] <= 0.0) { return; }
  let n = oil_dab.cell_count;
  let o = gid.x;
  if (o >= n) { return; }
  let dv = oil_scratch[os_aux(1u, o, n)];
  if (dv <= 0.0) { return; }
  let cur = oil_dab.cur_buf;
  let v0 = os_volume(cur, o, n);
  let m0 = oil_scratch[os_state(cur, 2u, o, n)];
  var color = vec3<f32>(oil_scratch[4u], oil_scratch[5u], oil_scratch[6u]);
  if (v0 > OIL_EPS && m0 > OIL_EPS) {
    let t = dv / (dv + wet_kernel.oil_mixing * m0 + 1e-9);
    let under = vec3<f32>(
      oil_scratch[os_state(cur, 3u, o, n)] / v0,
      oil_scratch[os_state(cur, 4u, o, n)] / v0,
      oil_scratch[os_state(cur, 5u, o, n)] / v0);
    color = km_mix(under, color, t);
  }
  let v1 = v0 + dv;
  oil_scratch[os_state(cur, 0u, o, n)] = oil_scratch[os_state(cur, 0u, o, n)] + dv;
  oil_scratch[os_state(cur, 2u, o, n)] = m0 + dv;
  oil_scratch[os_state(cur, 3u, o, n)] = color.x * v1;
  oil_scratch[os_state(cur, 4u, o, n)] = color.y * v1;
  oil_scratch[os_state(cur, 5u, o, n)] = color.z * v1;
}

// ---- oil_store: 창 상태 → 풀(storeOilWindow). 슬롯이 없는 타일의 셀은 건너뛴다(dab 창은 scan_add가 1링까지 미리 할당). ----
@compute @workgroup_size(${OIL_WORKGROUP})
fn ${ENTRY_POINTS.oilStore}(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (oil_scratch[13u] <= 0.0) { return; }
  let n = oil_dab.cell_count;
  let o = gid.x;
  if (o >= n) { return; }
  let ww = oil_win_w();
  let x = oil_dab.win_x0 + i32(o % ww);
  let y = oil_dab.win_y0 + i32(o / ww);
  let slot = slot_at_pixel(x, y);
  if (slot == SLOT_NONE) { return; }
  let l = local_of_pixel(x, y);
  let cur = oil_dab.cur_buf;
  wet_pool[core_index(slot, WET_CH_HEIGHT, l)] = oil_scratch[os_state(cur, 0u, o, n)];
  wet_ext[ext_index(slot, EXT_OIL_BASE, l)] = oil_scratch[os_state(cur, 1u, o, n)];
  wet_ext[ext_index(slot, EXT_OIL_WET, l)] = oil_scratch[os_state(cur, 2u, o, n)];
  wet_ext[ext_index(slot, EXT_OIL_R, l)] = oil_scratch[os_state(cur, 3u, o, n)];
  wet_ext[ext_index(slot, EXT_OIL_G, l)] = oil_scratch[os_state(cur, 4u, o, n)];
  wet_ext[ext_index(slot, EXT_OIL_B, l)] = oil_scratch[os_state(cur, 5u, o, n)];
}

// ---- oil_snapshot: 활성 타일 스냅샷(H·V·m·Cr·Cg·Cb → 채널 0..5, wet/oil-layer.ts buildOilPadded) ----
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.oilSnapshot}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    wg_tslot = atomicLoad(&table.wet_slots[table.wet_live_tiles[wid.x]]);
  }
  let slot = workgroupUniformLoad(&wg_tslot);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  let h = pool_at(slot, WET_CH_HEIGHT, lane);
  let b = ext_at(slot, EXT_OIL_BASE, lane);
  wet_snap[snap_index(slot, 0u, lane)] = h;
  wet_snap[snap_index(slot, 1u, lane)] = select(0.0, h - b, h > b);
  wet_snap[snap_index(slot, 2u, lane)] = ext_at(slot, EXT_OIL_WET, lane);
  wet_snap[snap_index(slot, 3u, lane)] = ext_at(slot, EXT_OIL_R, lane);
  wet_snap[snap_index(slot, 4u, lane)] = ext_at(slot, EXT_OIL_G, lane);
  wet_snap[snap_index(slot, 5u, lane)] = ext_at(slot, EXT_OIL_B, lane);
}

// ---- oil_level: Bingham 레벨링(stepOil의 (1)). 높이차가 항복 문턱을 넘는 면에서만 젖은 물감이 흐른다. ----
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.oilLevel}(
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
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) {
    if (lane == 0u) { atomicStore(&table.wet_live_next[tile], 0u); }
    return;
  }
  let tc = tile_coord(tile);
  if (lane < 9u) {
    wg_slots[lane] = live_slot_at_tile(i32(tc.x) + i32(lane % 3u) - 1, i32(tc.y) + i32(lane / 3u) - 1);
  }
  workgroupBarrier();
  let px = i32(lid.x) + 1;
  let py = i32(lid.y) + 1;
  let rate = wet_kernel.oil_rate;
  let yield_h = wet_kernel.oil_yield_h;
  let h = sa(0u, px, py);
  let v = sa(1u, px, py);
  let m = sa(2u, px, py);
  var out_v = 0.0;
  var in_v = 0.0;
  var in_r = 0.0;
  var in_g = 0.0;
  var in_b = 0.0;
  // 면 이웃 순서: W, E, N, S.
  for (var k = 0u; k < 4u; k += 1u) {
    var qx = px;
    var qy = py;
    if (k == 0u) { qx = px - 1; }
    if (k == 1u) { qx = px + 1; }
    if (k == 2u) { qy = py - 1; }
    if (k == 3u) { qy = py + 1; }
    if (!pad_valid(qx, qy)) { continue; }
    let hq = sa(0u, qx, qy);
    let d_out = h - hq - yield_h;
    if (d_out > 0.0 && m > OIL_EPS) { out_v = out_v + min(rate * d_out, 0.25 * m); }
    let d_in = hq - h - yield_h;
    let mq = sa(2u, qx, qy);
    if (d_in > 0.0 && mq > OIL_EPS) {
      let fl = min(rate * d_in, 0.25 * mq);
      let vq = max(sa(1u, qx, qy), OIL_EPS);
      in_v = in_v + fl;
      in_r = in_r + (fl * sa(3u, qx, qy)) / vq;
      in_g = in_g + (fl * sa(4u, qx, qy)) / vq;
      in_b = in_b + (fl * sa(5u, qx, qy)) / vq;
    }
  }
  var moved = 0.0;
  if (out_v > 0.0 || in_v > 0.0) {
    moved = out_v + in_v;
    var cx_r = 0.0;
    var cx_g = 0.0;
    var cx_b = 0.0;
    if (v > OIL_EPS) {
      cx_r = sa(3u, px, py) / v;
      cx_g = sa(4u, px, py) / v;
      cx_b = sa(5u, px, py) / v;
    }
    wet_pool[core_index(slot, WET_CH_HEIGHT, lane)] = h - out_v + in_v;
    wet_ext[ext_index(slot, EXT_OIL_WET, lane)] = m - out_v + in_v;
    wet_ext[ext_index(slot, EXT_OIL_R, lane)] = sa(3u, px, py) - out_v * cx_r + in_r;
    wet_ext[ext_index(slot, EXT_OIL_G, lane)] = sa(4u, px, py) - out_v * cx_g + in_g;
    wet_ext[ext_index(slot, EXT_OIL_B, lane)] = sa(5u, px, py) - out_v * cx_b + in_b;
  }
  red_a[lane] = moved;
  workgroupBarrier();
  for (var s = ${(GPU_TILE_SIZE * GPU_TILE_SIZE) / 2}u; s > 0u; s = s >> 1u) {
    if (lane < s) { red_a[lane] = red_a[lane] + red_a[lane + s]; }
    workgroupBarrier();
  }
  if (lane == 0u) { atomicStore(&table.wet_live_next[tile], select(0u, 1u, red_a[0] > 1e-5)); }
}

// ---- oil_dry: 모든 할당 타일의 젖은 부피가 시간척도 dryingMs로 줄어든다(stepOil의 (2)). 정착 루프에서 활성이 0이 된 뒤에는 건너뛴다. ----
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.oilDry}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    wg_tslot = atomicLoad(&table.wet_slots[table.wet_active_tiles[wid.x]]);
    // 정착 루프에서 활성이 0이 된 뒤에는 건조도 멈춘다(CPU settleWet break).
    wg_tile = select(0u, 1u, params.wet_settle != 0u && table.wet_settle_done != 0u);
  }
  let skip = workgroupUniformLoad(&wg_tile);
  let slot = workgroupUniformLoad(&wg_tslot);
  if (skip != 0u || slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  let m = ext_at(slot, EXT_OIL_WET, lane);
  if (m > 0.0) {
    let md = m * wet_kernel.oil_decay;
    wet_ext[ext_index(slot, EXT_OIL_WET, lane)] = select(md, 0.0, md < OIL_EPS);
  }
}
`;
