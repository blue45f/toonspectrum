import { ENTRY_POINTS, SCAN_BLOCK, WORKGROUP_1D } from "../layout";

import { COMMON_WGSL, WGSL_WORKGROUP_SCAN } from "./common.wgsl";

/**
 * 비닝 2~5단계(reduce-then-scan, 3 디스패치 + 간접 인자 기록).
 *
 * - `scan_blocks`: 블록(1024 타일) 안 exclusive scan. 스레드당 연속 4요소 → 워크그룹 스캔 → 블록 합.
 * - `scan_block_sums`: 이번 프레임 블록 합(ceil(tile_count/1024) ≤ 16)만 exclusive scan, refs 총수·MAX_REFS 초과분 기록.
 * - `scan_add`: offsets += 블록 prefix; counts>0 타일을 dirty 목록에 넣고 획 풀 슬롯을 처음 1회 할당
 *   (stroke_dirty = 획 동안 할당된 타일 합집합). 습식이 켜져 있으면 dirty + 8이웃(1링)을 활성화하고
 *   습식 슬롯을 할당한다(`wet/active-tiles.ts` activeTilesAfterDeposit 미러).
 * - `write_indirect`: dirty·stroke_dirty·wet_active 수를 vec3<u32> 간접 인자(`indirect_args`, group 2)로 기록.
 *
 * decoupled look-back(단일 패스)은 WebGPU forward-progress 미보장과 특허 문제로 쓰지 않는다.
 */
export const BIN_SCAN_WGSL: string = /* wgsl */ `${COMMON_WGSL}
${WGSL_WORKGROUP_SCAN}
const SCAN_BLOCK: u32 = ${SCAN_BLOCK}u;

@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.scanBlocks}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.x;
  let block = wid.x;
  let base = block * SCAN_BLOCK + lane * 4u;
  var c = array<u32, 4>(0u, 0u, 0u, 0u);
  var local_sum = 0u;
  for (var k = 0u; k < 4u; k += 1u) {
    let t = base + k;
    var v = 0u;
    if (t < params.tile_count) { v = atomicLoad(&bins.counts[t]); }
    c[k] = v;
    local_sum = local_sum + v;
  }
  var run = workgroup_exclusive_scan(local_sum, lane);
  for (var k = 0u; k < 4u; k += 1u) {
    let t = base + k;
    if (t < params.tile_count) { bins.offsets[t] = run; }
    run = run + c[k];
  }
  if (lane == 0u) { bins.block_sums[block] = workgroup_scan_total(); }
}

@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.scanBlockSums}(@builtin(local_invocation_id) lid: vec3<u32>) {
  let lane = lid.x;
  // 이번 프레임에 scan_blocks가 쓴 블록만 합산한다. 이전 프레임이 prefix로 덮어쓴 남은 칸을 읽으면 총합이 프레임마다 누적된다.
  let n_blocks = min((params.tile_count + SCAN_BLOCK - 1u) / SCAN_BLOCK, MAX_SCAN_BLOCKS);
  var v = 0u;
  if (lane < n_blocks) { v = bins.block_sums[lane]; }
  let ex = workgroup_exclusive_scan(v, lane);
  if (lane < n_blocks) { bins.block_sums[lane] = ex; }
  if (lane == 0u) {
    let total = workgroup_scan_total();
    table.refs_total = total;
    // 획 동안 누적(endStroke에서 읽고 0으로 되돌린다).
    if (total > MAX_REFS) { table.refs_overflow = table.refs_overflow + (total - MAX_REFS); }
  }
}

@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.scanAdd}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let t = gid.x;
  if (t >= params.tile_count) { return; }
  bins.offsets[t] = bins.offsets[t] + bins.block_sums[t / SCAN_BLOCK];
  let c = atomicLoad(&bins.counts[t]);
  var ring = c > 0u;
  if (c > 0u) {
    let i = atomicAdd(&table.dirty_count, 1u);
    if (i < MAX_TILES) { table.dirty_tiles[i] = t; }
    if (table.slots[t] == SLOT_NONE) {
      let s = atomicAdd(&table.pool_cursor, 1u);
      if (s < params.stroke_capacity) {
        table.slots[t] = s;
        let j = atomicAdd(&table.stroke_dirty_count, 1u);
        if (j < MAX_TILES) { table.stroke_dirty_tiles[j] = t; }
      } else {
        atomicAdd(&table.pool_overflow, 1u);
      }
    }
  }
  if (params.wet_enabled == 0u) { return; }
  if (!ring) {
    let tc = tile_coord(t);
    let tx = i32(tc.x);
    let ty = i32(tc.y);
    for (var oy = -1; oy <= 1; oy += 1) {
      let ny = ty + oy;
      if (ny < 0 || ny >= i32(params.tiles_y)) { continue; }
      for (var ox = -1; ox <= 1; ox += 1) {
        let nx = tx + ox;
        if (nx < 0 || nx >= i32(params.tiles_x)) { continue; }
        if (atomicLoad(&bins.counts[u32(ny) * params.tiles_x + u32(nx)]) > 0u) { ring = true; }
      }
    }
  }
  if (!ring) { return; }
  var slot = atomicLoad(&table.wet_slots[t]);
  if (slot == SLOT_NONE) {
    let s = atomicAdd(&table.wet_cursor, 1u);
    if (s < params.wet_capacity) {
      atomicStore(&table.wet_slots[t], s);
      let j = atomicAdd(&table.wet_active_count, 1u);
      if (j < MAX_TILES) { table.wet_active_tiles[j] = t; }
      slot = s;
    } else {
      atomicAdd(&table.wet_overflow, 1u);
    }
  }
  if (slot != SLOT_NONE) { table.wet_live[t] = 1u; }
}

@compute @workgroup_size(1)
fn ${ENTRY_POINTS.writeIndirect}() {
  indirect_args.dirty = vec3<u32>(min(atomicLoad(&table.dirty_count), MAX_TILES), 1u, 1u);
  indirect_args.stroke = vec3<u32>(min(atomicLoad(&table.stroke_dirty_count), MAX_TILES), 1u, 1u);
  indirect_args.wet = vec3<u32>(min(atomicLoad(&table.wet_active_count), MAX_TILES), 1u, 1u);
}
`;
