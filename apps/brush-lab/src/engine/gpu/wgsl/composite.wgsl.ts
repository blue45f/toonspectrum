import { ENTRY_POINTS, GPU_TILE_SIZE } from "../layout";

import { COMMON_WGSL } from "./common.wgsl";

/**
 * 합성·bake.
 * - `composite_dirty`(간접, dirty 타일)·`composite_all`(tiles_x × tiles_y): present_tex[p] =
 *   encode(blend(document, stroke × opacity)). 임파스토 릴리프 조명(램버트 + Blinn-Phong)은 `has_height`일 때 이 단계에서
 *   표시 시점에만 적용한다(문서에는 굽지 않는다 — bake_stroke·bake_wet 모두 조명을 쓰지 않는다).
 * - `bake_stroke`(간접, stroke_dirty 타일): document = blend(document, stroke × opacity) 후 획 타일을 0으로
 *   비운다(`raster/composite.ts` compositeTile 미러; 캔버스 밖 픽셀은 쓰지 않는다).
 */
export const COMPOSITE_WGSL: string = /* wgsl */ `${COMMON_WGSL}

fn stroke_sample(tile: u32, local: u32) -> vec4<f32> {
  let slot = table.slots[tile];
  if (slot == SLOT_NONE) { return vec4<f32>(0.0); }
  return stroke_pool[slot * TILE_PIXELS + local];
}

// 임파스토 릴리프 조명(램버트 배율 + Blinn-Phong 가산)은 CPU 참조 displayDocument와 같이 표시 시점에만 적용한다
// (문서에 굽지 않아 여러 획이 겹쳐도 조명이 중복되지 않는다). has_height = 표면에 높이가 쌓인 적이 있는가.
fn composite_pixel(tile: u32, lx: u32, ly: u32) {
  let tc = tile_coord(tile);
  let px = tc.x * TILE_SIZE + lx;
  let py = tc.y * TILE_SIZE + ly;
  if (px >= params.width || py >= params.height) { return; }
  let local = ly * TILE_SIZE + lx;
  let doc = document_px[py * params.width + px];
  let s = stroke_sample(tile, local) * params.stroke_opacity;
  var c = blend_stroke(doc, s, params.blend_mode);
  if (params.has_height != 0u) { c = impasto_display(c, i32(px), i32(py)); }
  textureStore(present_tex, vec2<i32>(i32(px), i32(py)), encode_present(c));
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.compositeDirty}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  composite_pixel(table.dirty_tiles[wid.x], lid.x, lid.y);
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.compositeAll}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (wid.x >= params.tiles_x || wid.y >= params.tiles_y) { return; }
  composite_pixel(wid.y * params.tiles_x + wid.x, lid.x, lid.y);
}

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
