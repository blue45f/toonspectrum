import { ENTRY_POINTS, GPU_TILE_SIZE } from "../layout";

import { COMMON_WGSL } from "./common.wgsl";

/**
 * 획 레이어 굽기(기본 가족). `bake_stroke`(간접, stroke_dirty 타일): document = blend(document, stroke × opacity) 후 획 타일을
 * 0으로 비운다(`raster/composite.ts` compositeTile 미러; 캔버스 밖 픽셀은 쓰지 않는다).
 * 표시 합성(수채·유화 층·릴리프 조명)은 습식 가족의 `wet-composite.wgsl.ts`가 맡는다 — 습식 층은 문서에 굽지 않는다.
 */
export const BAKE_STROKE_WGSL: string = /* wgsl */ `${COMMON_WGSL}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.bakeStroke}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tile = table.stroke_dirty_tiles[wid.x];
  let slot = table.slots[tile];
  if (slot == SLOT_NONE) { return; }
  let local = lid.y * TILE_SIZE + lid.x;
  let si = slot * TILE_PIXELS + local;
  let s = stroke_pool[si] * params.stroke_opacity;
  stroke_pool[si] = vec4<f32>(0.0);
  let tc = tile_coord(tile);
  let px = tc.x * TILE_SIZE + lid.x;
  let py = tc.y * TILE_SIZE + lid.y;
  if (px >= params.width || py >= params.height) { return; }
  let o = py * params.width + px;
  document_px[o] = blend_stroke(document_px[o], s, params.blend_mode);
}
`;
