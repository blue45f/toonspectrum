import { ENTRY_POINTS, WORKGROUP_1D } from "../layout";

import { COMMON_WGSL, WGSL_WORKGROUP_SCAN } from "./common.wgsl";

/**
 * 비닝 6단계: 안정 scatter(원자 없음). 워크그룹 1개 = dirty 타일 1개(간접 디스패치).
 * dab를 256 stride로 순회하며 겹침 predicate → 워크그룹 exclusive scan → `refs[offset + cursor + prefix]`.
 * 청크 순서 × 레인 순서가 dab 인덱스 순서이므로 타일 안 refs는 항상 dab 인덱스 오름차순이다
 * (`raster/tile-binning.ts` binDabs CSR과 동일). 상한 없음: dab 수에 비례해 청크 수가 늘 뿐이다.
 */
export const BIN_SCATTER_WGSL: string = /* wgsl */ `${COMMON_WGSL}
${WGSL_WORKGROUP_SCAN}

@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.scatter}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let lane = lid.x;
  let tile = table.dirty_tiles[wid.x];
  let tc = tile_coord(tile);
  let tx = i32(tc.x);
  let ty = i32(tc.y);
  let base = bins.offsets[tile];
  var cursor = 0u;
  for (var start = 0u; start < params.dab_count; start += WORKGROUP_1D) {
    let i = start + lane;
    var hit = false;
    if (i < params.dab_count) {
      let b = dab_tile_bounds(dabs[i], params.tiles_x, params.tiles_y);
      hit = dab_admitted(b) && bounds_contains(b, tx, ty);
    }
    let prefix = workgroup_exclusive_scan(select(0u, 1u, hit), lane);
    let total = workgroup_scan_total();
    if (hit) {
      let o = base + cursor + prefix;
      if (o < MAX_REFS) { refs[o] = i; }
    }
    cursor = cursor + total;
    // 다음 청크가 scan_scratch를 다시 쓰기 전에 모든 레인이 total을 읽었음을 보장한다.
    workgroupBarrier();
  }
}
`;
