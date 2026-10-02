import { ENTRY_POINTS, WORKGROUP_1D } from "../layout";

import { COMMON_WGSL } from "./common.wgsl";

/**
 * 비닝 1단계: dab 1개/스레드. AABB(`dab_tile_bounds`)가 덮는 타일마다 `counts`를 원자 증가한다.
 * 타일 수 > MAX_TILES_PER_DAB인 dab는 건너뛰고 `dab_overflow`를 올린다(fail-visible).
 * 이 모듈만 `atomicAdd`로 counts를 만들며 scatter는 원자 없이 같은 predicate로 순서를 복원한다.
 */
export const BIN_COUNT_WGSL: string = /* wgsl */ `${COMMON_WGSL}

@compute @workgroup_size(${WORKGROUP_1D})
fn ${ENTRY_POINTS.binCount}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.dab_count) { return; }
  let d = dabs[i];
  let b = dab_tile_bounds(d, params.tiles_x, params.tiles_y);
  if (bounds_empty(b)) { return; }
  if (bounds_span(b) > MAX_TILES_PER_DAB) {
    atomicAdd(&table.dab_overflow, 1u);
    return;
  }
  for (var ty = b.y; ty <= b.w; ty += 1) {
    let row = u32(ty) * params.tiles_x;
    for (var tx = b.x; tx <= b.z; tx += 1) {
      atomicAdd(&bins.counts[row + u32(tx)], 1u);
    }
  }
}
`;
