import { ENTRY_POINTS, GPU_TILE_SIZE, WORKGROUP_1D } from "../layout";

import { COMMON_WGSL } from "./common.wgsl";

/**
 * 습식 compute(베타). 서브스텝 1회 = `wet_step` → `wet_expand` → `wet_commit`.
 *
 * - `wet_step`(간접, (16,16,1)): 활성(live) 타일의 셀마다 gather로 물(5점 Jacobi 확산·증발·모세관 흡수·속도장),
 *   안료(이웃 유출 비율 gather → 질량 보존·에지 다크닝·그래뉼레이션), 임파스토 높이 점성 완화, 건조(water<ε → fixed 이동)를
 *   읽기 패리티 p에서 읽어 쓰기 패리티 q에 기록한다. 순서·수식은 `wet/step-water.ts`·`step-pigment.ts`·
 *   `step-dry.ts`와 같다(물 스텝은 이전 물, 안료 스텝은 이전 물, 건조는 새 물을 본다).
 *   비활성 타일은 패리티 동기화 복사만 한다(재활성 시 CPU처럼 단일 상태를 보도록).
 *   타일 활성 유지 여부(= 어느 셀이든 water ≥ ε)는 워크그룹 원자 OR로 모아 `wet_live_next`에 쓴다.
 * - `wet_expand`(간접): 활성 타일의 경계 셀에 물이 있으면 4이웃을 활성화(필요 시 CAS 슬롯 할당, 목록 추가)
 *   — `wet/active-tiles.ts` expandActive 미러. 슬롯 번호는 결과에 영향이 없으므로 원자 할당이 결정성을 해치지 않는다.
 * - `wet_commit`(64 워크그룹): live_next → live 복사, 패리티 뒤집기, 간접 인자(`indirect_args.wet`, group 2) 갱신.
 * - `bake_wet`(간접): 모든 할당 타일의 부유+침착 안료를 문서에 굽는다(`wet-reference.ts` bakeWet 미러).
 *   임파스토 높이는 굽지 않고 유지한다(릴리프 조명은 표시 시점 `impasto_display`가 적용).
 */
export const WET_STEP_WGSL: string = /* wgsl */ `${COMMON_WGSL}

var<workgroup> wg_tile: u32;
var<workgroup> wg_slot: u32;
var<workgroup> wg_live: u32;
var<workgroup> wg_any_wet: atomic<u32>;
var<workgroup> wg_sides: atomic<u32>;

fn neighbor_offset(n: u32) -> vec2<i32> {
  if (n == 0u) { return vec2<i32>(-1, 0); }
  if (n == 1u) { return vec2<i32>(1, 0); }
  if (n == 2u) { return vec2<i32>(0, -1); }
  return vec2<i32>(0, 1);
}

// 이웃 n의 어느 유출 방향이 나에게 들어오는가: 왼쪽 이웃의 오른쪽(1) 유출 등.
fn incoming_index(n: u32) -> u32 {
  if (n == 0u) { return 1u; }
  if (n == 1u) { return 0u; }
  if (n == 2u) { return 3u; }
  return 2u;
}

// wet/step-pigment.ts outFractions 미러: 셀(gx,gy)의 4방향 유출 비율 (left, right, up, down).
fn wet_out_fractions(gx: i32, gy: i32, parity: u32, dp: f32, k: f32) -> vec4<f32> {
  var out = vec4<f32>(0.0);
  let wc = wet_read_cell(gx, gy, parity, WET_CH_WATER);
  if (!wc.valid || wc.value <= WET_EPS) { return out; }
  let w = wc.value;
  var sum = 0.0;
  for (var n = 0u; n < 4u; n += 1u) {
    let off = neighbor_offset(n);
    let nc = wet_read_cell(gx + off.x, gy + off.y, parity, WET_CH_WATER);
    if (!nc.valid) { continue; }
    var frac = 0.0;
    if (nc.value > WET_EPS) { frac = frac + dp; }
    let dw = w - nc.value;
    if (dw > 0.0) { frac = frac + k * min(1.0, dw / (w + 0.001)); }
    out[n] = frac;
    sum = sum + frac;
  }
  if (sum > 0.5) { out = out * (0.5 / sum); }
  return out;
}

fn wet_read_pigment(gx: i32, gy: i32, parity: u32) -> vec4<f32> {
  return vec4<f32>(
    wet_read_cell(gx, gy, parity, WET_CH_PIG_R).value,
    wet_read_cell(gx, gy, parity, WET_CH_PIG_G).value,
    wet_read_cell(gx, gy, parity, WET_CH_PIG_B).value,
    wet_read_cell(gx, gy, parity, WET_CH_PIG_MASS).value);
}

fn wet_neighbor_or(gx: i32, gy: i32, parity: u32, fallback: f32) -> f32 {
  let c = wet_read_cell(gx, gy, parity, WET_CH_WATER);
  if (c.valid) { return c.value; }
  return fallback;
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.wetStep}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    let t = table.wet_active_tiles[wid.x];
    wg_tile = t;
    wg_slot = atomicLoad(&table.wet_slots[t]);
    wg_live = table.wet_live[t];
    atomicStore(&wg_any_wet, 0u);
    // 서브스텝 시작: live 계수를 비운다(wet_commit이 다시 센다). 디스패치 순서가 보장한다.
    if (wid.x == 0u) { atomicStore(&table.wet_live_count, 0u); }
  }
  let tile = workgroupUniformLoad(&wg_tile);
  let slot = workgroupUniformLoad(&wg_slot);
  let live = workgroupUniformLoad(&wg_live);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) {
    if (lane == 0u) { atomicStore(&table.wet_live_next[tile], 0u); }
    return;
  }
  let p = table.wet_parity;
  let q = 1u - p;
  let local = lane;
  if (live == 0u) {
    for (var ch = 0u; ch < WET_CHANNELS; ch += 1u) {
      wet_pool[wet_index(slot, q, ch, local)] = wet_pool[wet_index(slot, p, ch, local)];
    }
    if (lane == 0u) { atomicStore(&table.wet_live_next[tile], 0u); }
    return;
  }
  let tc = tile_coord(tile);
  let gx = i32(tc.x * TILE_SIZE + lid.x);
  let gy = i32(tc.y * TILE_SIZE + lid.y);
  let dt = params.substep_dt_ms;
  let diff = WET_WATER_DIFFUSION_SCALE * params.wet_diffusion;
  let evap_rate = params.wet_evaporation * dt;
  var dry_rate = 0.0;
  if (params.wet_drying_ms > 0.0) { dry_rate = dt / params.wet_drying_ms; }
  let absorb_rate = params.wet_capillary * params.wet_absorptivity * WET_CAPILLARY_SCALE * dt;
  let paper = paper_sample_wet(f32(gx) + 0.5, f32(gy) + 0.5);

  // ---- 물 (step-water.ts) ----
  let w = wet_pool[wet_index(slot, p, WET_CH_WATER, local)];
  let wl = wet_neighbor_or(gx - 1, gy, p, w);
  let wr = wet_neighbor_or(gx + 1, gy, p, w);
  let wu = wet_neighbor_or(gx, gy - 1, p, w);
  let wd = wet_neighbor_or(gx, gy + 1, p, w);
  var nw = w + diff * (wl + wr + wu + wd - 4.0 * w);
  if (nw < 0.0) { nw = 0.0; }
  let ev = min(nw, evap_rate + nw * dry_rate);
  nw = nw - ev;
  let ab = min(nw, absorb_rate * paper.y);
  nw = nw - ab;
  let vx = -(wr - wl) * 0.5;
  let vy = -(wd - wu) * 0.5;

  // ---- 안료 (step-pigment.ts, 이전 물 기준) ----
  let dp = WET_PIGMENT_DIFFUSION_SCALE * params.wet_diffusion;
  let k = WET_EDGE_ADVECTION_SCALE * params.wet_edge_darkening;
  let gran = params.wet_granulation * WET_GRANULATION_SCALE;
  let self_out = wet_out_fractions(gx, gy, p, dp, k);
  let keep = 1.0 - (self_out.x + self_out.y + self_out.z + self_out.w);
  var next = wet_read_pigment(gx, gy, p) * keep;
  for (var n = 0u; n < 4u; n += 1u) {
    let off = neighbor_offset(n);
    let nx = gx + off.x;
    let ny = gy + off.y;
    let nc = wet_read_cell(nx, ny, p, WET_CH_WATER);
    if (!nc.valid) { continue; }
    let nb = wet_out_fractions(nx, ny, p, dp, k);
    let frac = nb[incoming_index(n)];
    if (frac <= 0.0) { continue; }
    next = next + wet_read_pigment(nx, ny, p) * frac;
  }
  var fixed = vec4<f32>(
    wet_pool[wet_index(slot, p, WET_CH_FIX_R, local)],
    wet_pool[wet_index(slot, p, WET_CH_FIX_G, local)],
    wet_pool[wet_index(slot, p, WET_CH_FIX_B, local)],
    wet_pool[wet_index(slot, p, WET_CH_FIX_MASS, local)]);
  if (w > WET_EPS && gran > 0.0) {
    let dep_frac = min(1.0, gran * paper.x);
    let dep = next * dep_frac;
    next = next - dep;
    fixed = fixed + dep;
  }
  next = max(next, vec4<f32>(0.0));

  // ---- 높이 점성 완화 (impasto.ts relaxHeight, 이전 높이 기준) ----
  // Dh = heightRelaxScale·(1 − viscosity)의 5점 Jacobi 확산. 활성 집합 밖과는 교환하지 않는다(no-flux).
  let height_c = wet_pool[wet_index(slot, p, WET_CH_HEIGHT, local)];
  var height_next = height_c;
  let relax = WET_HEIGHT_RELAX_SCALE * (1.0 - clamp(params.wet_viscosity, 0.0, 1.0));
  if (relax > 0.0) {
    var hsum = 0.0;
    for (var hn = 0u; hn < 4u; hn += 1u) {
      let off = neighbor_offset(hn);
      let hc = wet_read_cell(gx + off.x, gy + off.y, p, WET_CH_HEIGHT);
      hsum = hsum + select(height_c, hc.value, hc.valid);
    }
    height_next = max(height_c + relax * (hsum - 4.0 * height_c), 0.0);
  }

  // ---- 건조 (step-dry.ts, 새 물 기준) ----
  var new_water = nw;
  if (new_water < WET_EPS) {
    new_water = 0.0;
    fixed = fixed + next;
    next = vec4<f32>(0.0);
  } else {
    atomicStore(&wg_any_wet, 1u);
  }

  wet_pool[wet_index(slot, q, WET_CH_WATER, local)] = new_water;
  wet_pool[wet_index(slot, q, WET_CH_VX, local)] = vx;
  wet_pool[wet_index(slot, q, WET_CH_VY, local)] = vy;
  wet_pool[wet_index(slot, q, WET_CH_PIG_R, local)] = next.x;
  wet_pool[wet_index(slot, q, WET_CH_PIG_G, local)] = next.y;
  wet_pool[wet_index(slot, q, WET_CH_PIG_B, local)] = next.z;
  wet_pool[wet_index(slot, q, WET_CH_PIG_MASS, local)] = next.w;
  wet_pool[wet_index(slot, q, WET_CH_HEIGHT, local)] = height_next;
  wet_pool[wet_index(slot, q, WET_CH_FIX_R, local)] = fixed.x;
  wet_pool[wet_index(slot, q, WET_CH_FIX_G, local)] = fixed.y;
  wet_pool[wet_index(slot, q, WET_CH_FIX_B, local)] = fixed.z;
  wet_pool[wet_index(slot, q, WET_CH_FIX_MASS, local)] = fixed.w;
  workgroupBarrier();
  if (lane == 0u) { atomicStore(&table.wet_live_next[tile], atomicLoad(&wg_any_wet)); }
}

// 이웃 타일 n을 활성화한다. 미할당이면 CAS로 예약한 뒤 슬롯을 할당하고 활성 목록에 추가한다.
fn wet_activate(n: u32) {
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
  // 슬롯 확정과 무관하게 활성 표식을 남긴다. 슬롯이 없으면 wet_step이 건너뛴다(wet_overflow로 fail-visible).
  atomicStore(&table.wet_live_next[n], 1u);
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.wetExpand}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.y * TILE_SIZE + lid.x;
  if (lane == 0u) {
    let t = table.wet_active_tiles[wid.x];
    wg_tile = t;
    wg_slot = atomicLoad(&table.wet_slots[t]);
    wg_live = atomicLoad(&table.wet_live_next[t]);
    atomicStore(&wg_sides, 0u);
  }
  let tile = workgroupUniformLoad(&wg_tile);
  let slot = workgroupUniformLoad(&wg_slot);
  let live = workgroupUniformLoad(&wg_live);
  if (live == 0u || slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  let q = 1u - table.wet_parity;
  let w = wet_pool[wet_index(slot, q, WET_CH_WATER, lane)];
  if (w > WET_EPS) {
    var bits = 0u;
    if (lid.x == 0u) { bits = bits | 1u; }
    if (lid.x == TILE_SIZE - 1u) { bits = bits | 2u; }
    if (lid.y == 0u) { bits = bits | 4u; }
    if (lid.y == TILE_SIZE - 1u) { bits = bits | 8u; }
    if (bits != 0u) { atomicOr(&wg_sides, bits); }
  }
  workgroupBarrier();
  if (lane == 0u) {
    let sides = atomicLoad(&wg_sides);
    let tc = tile_coord(tile);
    if ((sides & 1u) != 0u && tc.x > 0u) { wet_activate(tile - 1u); }
    if ((sides & 2u) != 0u && tc.x + 1u < params.tiles_x) { wet_activate(tile + 1u); }
    if ((sides & 4u) != 0u && tc.y > 0u) { wet_activate(tile - params.tiles_x); }
    if ((sides & 8u) != 0u && tc.y + 1u < params.tiles_y) { wet_activate(tile + params.tiles_x); }
  }
}

@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.wetCommit}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  let n = min(atomicLoad(&table.wet_active_count), MAX_TILES);
  if (i < n) {
    let t = table.wet_active_tiles[i];
    let lv = atomicLoad(&table.wet_live_next[t]);
    table.wet_live[t] = lv;
    if (lv != 0u) { atomicAdd(&table.wet_live_count, 1u); }
  }
  if (i == 0u) {
    table.wet_parity = 1u - table.wet_parity;
    indirect_args.wet = vec3<u32>(n, 1u, 1u);
  }
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.bakeWet}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tile = table.wet_active_tiles[wid.x];
  let slot = atomicLoad(&table.wet_slots[tile]);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  let tc = tile_coord(tile);
  let px = tc.x * TILE_SIZE + lid.x;
  let py = tc.y * TILE_SIZE + lid.y;
  if (px >= params.width || py >= params.height) { return; }
  let local = lid.y * TILE_SIZE + lid.x;
  let p = table.wet_parity;
  let q = 1u - p;
  let pig = vec4<f32>(
    wet_pool[wet_index(slot, p, WET_CH_PIG_R, local)],
    wet_pool[wet_index(slot, p, WET_CH_PIG_G, local)],
    wet_pool[wet_index(slot, p, WET_CH_PIG_B, local)],
    wet_pool[wet_index(slot, p, WET_CH_PIG_MASS, local)]);
  let fix = vec4<f32>(
    wet_pool[wet_index(slot, p, WET_CH_FIX_R, local)],
    wet_pool[wet_index(slot, p, WET_CH_FIX_G, local)],
    wet_pool[wet_index(slot, p, WET_CH_FIX_B, local)],
    wet_pool[wet_index(slot, p, WET_CH_FIX_MASS, local)]);
  let mass = pig.w + fix.w;
  let o = py * params.width + px;
  var doc = document_px[o];
  if (mass > 0.0) {
    let col = (pig.rgb + fix.rgb) / mass;
    let alpha = 1.0 - exp(-mass * BAKE_MASS_TO_ALPHA);
    var c = col;
    if (params.km_mixing != 0u && doc.a > 0.0) {
      c = km_mix(doc.rgb / doc.a, col, alpha);
    }
    let kk = 1.0 - alpha;
    doc = vec4<f32>(c * alpha + doc.rgb * kk, alpha + doc.a * kk);
    // 구운 안료는 문서로 옮겨졌으므로 두 패리티 모두 비운다(재굽기 방지, 패리티 동기화).
    for (var ch = WET_CH_PIG_R; ch <= WET_CH_PIG_MASS; ch += 1u) {
      wet_pool[wet_index(slot, p, ch, local)] = 0.0;
      wet_pool[wet_index(slot, q, ch, local)] = 0.0;
    }
    for (var ch = WET_CH_FIX_R; ch <= WET_CH_FIX_MASS; ch += 1u) {
      wet_pool[wet_index(slot, p, ch, local)] = 0.0;
      wet_pool[wet_index(slot, q, ch, local)] = 0.0;
    }
  }
  // 임파스토 높이는 문서에 굽지 않는다(CPU 참조와 같이 표시 시점 composite·readbackLinear에서 조명만 적용).
  document_px[o] = doc;
}
`;
