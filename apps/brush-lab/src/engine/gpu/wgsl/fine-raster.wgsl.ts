import { ENTRY_POINTS, GPU_TILE_SIZE, WORKGROUP_1D } from "../layout";

import { COMMON_WGSL } from "./common.wgsl";

/**
 * fine 래스터: 워크그룹 (16,16,1) = dirty 타일 1개(간접 디스패치), 스레드 1개 = 픽셀 1개.
 * refs(dab 인덱스 오름차순)를 순회해 레지스터에서 premultiplied over로 누적한 뒤 획 풀에 1회 기록한다.
 * 타일은 워크그룹이 배타 소유하므로 획 풀·습식 풀 read-modify-write에 원자가 필요 없다.
 * 수식·순서는 `raster/fine-raster.ts` rasterizeTile과 같다(smudge는 `smudge_carry`가 계산한 dab별 운반 색, wet-flow는 습식 풀 투입).
 * 임파스토 높이(밀기 + 침착)는 타일을 가로지르는 dab 순서 패스라 이 커널이 아니라 `impasto.wgsl.ts`가 맡는다(CPU도 같다).
 */
export const FINE_RASTER_WGSL: string = /* wgsl */ `${COMMON_WGSL}

// 문서에서 dab 중심 주변 3×3 평균(premultiplied) — raster/fine-raster.ts pickupColor 미러.
fn pickup_color(cx: f32, cy: f32) -> vec4<f32> {
  var sum = vec4<f32>(0.0);
  var n = 0.0;
  let ix = i32(floor(cx));
  let iy = i32(floor(cy));
  for (var oy = -1; oy <= 1; oy += 1) {
    let y = iy + oy;
    if (y < 0 || y >= i32(params.height)) { continue; }
    for (var ox = -1; ox <= 1; ox += 1) {
      let x = ix + ox;
      if (x < 0 || x >= i32(params.width)) { continue; }
      sum = sum + document_px[u32(y) * params.width + u32(x)];
      n = n + 1.0;
    }
  }
  if (n == 0.0) { return vec4<f32>(0.0); }
  return sum / n;
}

// smudge 운반 색(raster/fine-raster.ts computeSmudgeColors 미러). 붓이 들고 있는 색은 dab 순서의 1차 재귀
//   첫 smudge dab: carry = local, 내려놓는 색 없음(알파 0) / 이후: dab i는 carry를 내려놓고 carry ← carry + (local − carry)·pickup
// 라서 타일 순회와 무관하게 dab 순서로 한 번만 계산한다. 문서는 획 중에 바뀌지 않으므로(endStroke에서 합성) local은 병렬로 구하고,
// 재귀는 워크그룹 1개의 lane 0이 순서대로 돈다(smudge dab 수가 보통 프레임당 수십 개라 직렬이 충분하다).
// 상태(carry·loaded)는 bins.smudge_state에 남아 프레임·청크 사이에 이어지고 호스트가 획마다 0으로 리셋한다.
@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.smudgeCarry}(@builtin(local_invocation_id) lid: vec3<u32>) {
  let lane = lid.x;
  for (var i = lane; i < params.dab_count; i += WORKGROUP_1D) {
    let d = dabs[i];
    if (dab_has_flag(d, FLAG_SMUDGE)) { bins.picks[i] = pickup_color(d.p.x, d.p.y); }
  }
  storageBarrier();
  workgroupBarrier();
  if (lane != 0u) { return; }
  var carry = bins.smudge_state[0];
  var loaded = bins.smudge_state[1].x != 0.0;
  for (var i = 0u; i < params.dab_count; i += 1u) {
    let d = dabs[i];
    if (!dab_has_flag(d, FLAG_SMUDGE)) { continue; }
    let local = bins.picks[i];
    if (!loaded) {
      carry = local;
      loaded = true;
      bins.picks[i] = vec4<f32>(0.0);
      continue;
    }
    bins.picks[i] = carry;
    carry = carry + (local - carry) * params.smudge_pickup;
  }
  bins.smudge_state[0] = carry;
  bins.smudge_state[1] = vec4<f32>(select(0.0, 1.0, loaded), 0.0, 0.0, 0.0);
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.fineRaster}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tile = table.dirty_tiles[wid.x];
  let slot = table.slots[tile];
  // 획 풀 초과 타일은 건너뛴다(pool_overflow로 fail-visible).
  if (slot == SLOT_NONE) { return; }
  let tc = tile_coord(tile);
  let local = lid.y * TILE_SIZE + lid.x;
  let px = f32(tc.x * TILE_SIZE + lid.x) + 0.5;
  let py = f32(tc.y * TILE_SIZE + lid.y) + 0.5;
  let stroke_i = slot * TILE_PIXELS + local;
  var acc = stroke_pool[stroke_i];
  let start = bins.offsets[tile];
  let count = atomicLoad(&bins.counts[tile]);
  let end = min(start + count, MAX_REFS);
  let wet_on = params.wet_enabled != 0u;
  var wslot = SLOT_NONE;
  if (wet_on) { wslot = atomicLoad(&table.wet_slots[tile]); }
  let wet_ok = wet_on && wslot != SLOT_NONE && wslot != SLOT_RESERVED;
  let parity = table.wet_parity;
  let use_curve = params.edge_curve_enabled != 0u;
  let filter_id = params.filter_mode;
  let tip_size = f32(params.tip_atlas_tile);
  let paper_on = params.paper_enabled != 0u;
  for (var k = start; k < end; k += 1u) {
    let dab_index = refs[k];
    let d = dabs[dab_index];
    let e = dab_extent_px(d);
    let dy = py - d.p.y;
    if (dy > e || dy < -e) { continue; }
    let dx = px - d.p.x;
    if (dx > e || dx < -e) { continue; }
    var pick = vec4<f32>(0.0);
    if (dab_has_flag(d, FLAG_SMUDGE)) {
      // smudge_carry가 dab별로 계산해 둔 운반 색. 알파가 0이면 dab 전체를 건너뛴다(CPU: pick[3] ≤ 0 → continue).
      pick = bins.picks[dab_index];
      if (pick.a <= 0.0) { continue; }
    }
    let sh = shade_dab(d, px, py, dx, dy, pick, use_curve, filter_id, tip_size, paper_on);
    if (!sh.hit) { continue; }
    acc = sh.src + acc * (1.0 - sh.src.a);
    if (wet_ok) {
      let dep = dab_deposition(d);
      if (dep == DEP_WET_FLOW) {
        let iw = wet_index(wslot, parity, WET_CH_WATER, local);
        wet_pool[iw] = wet_pool[iw] + d.wet * sh.cov;
        let mass = dab_pigment_mass(d) * sh.cov * sh.mask;
        var pr = 0.0;
        var pg = 0.0;
        var pb = 0.0;
        if (d.color.a > 0.0) {
          pr = d.color.r / d.color.a;
          pg = d.color.g / d.color.a;
          pb = d.color.b / d.color.a;
        }
        let im = wet_index(wslot, parity, WET_CH_PIG_MASS, local);
        wet_pool[im] = wet_pool[im] + mass;
        let ir = wet_index(wslot, parity, WET_CH_PIG_R, local);
        wet_pool[ir] = wet_pool[ir] + pr * mass;
        let ig = wet_index(wslot, parity, WET_CH_PIG_G, local);
        wet_pool[ig] = wet_pool[ig] + pg * mass;
        let ib = wet_index(wslot, parity, WET_CH_PIG_B, local);
        wet_pool[ib] = wet_pool[ib] + pb * mass;
      }
    }
  }
  stroke_pool[stroke_i] = acc;
}
`;
