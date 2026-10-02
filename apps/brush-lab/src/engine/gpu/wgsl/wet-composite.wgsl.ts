import { ENTRY_POINTS, GPU_TILE_SIZE } from "../layout";

import { WET_LAYER_WGSL, wetModuleHeader } from "./wet-common.wgsl";

/**
 * 표시 합성과 평탄화(습식 가족). CPU `Surface.displayDocument`·`flattenWet`의 GPU 미러다.
 *
 * 습식 층(수채 안료·유화 물감)은 문서가 아니라 풀이 들고 있고 **표시 시점**에 비파괴로 합성한다(`endStroke`가 문서에 굽지 않는다):
 *   문서 + 살아 있는 획 레이어 → 수채 층 → 유화 층 → 릴리프 조명(has_height) → sRGB 인코딩.
 * - `composite_dirty`(간접, dirty 타일)·`composite_wet`(간접, 할당된 습식 타일)·`composite_all`(타일 격자) → present 텍스처. `composite_linear` → 선형 premultiplied f32 버퍼
 *   (`readbackLinear`용, CPU `toLinear()`와 같은 값).
 * - `bake_wet`·`flatten_oil`(간접, 지금까지 할당된 모든 타일): 다른 매체 획이 시작될 때 습식 층을 문서에 굽는다(`flattenWet`).
 *   수채는 안료 12채널(부유·침착·경화)을 0으로 만들고, 유화는 색·젖음을 비우고 부피를 마른 릴리프로 굳힌다(릴리프 조명은 높이가 남아 계속 적용).
 */
export const WET_COMPOSITE_WGSL: string = /* wgsl */ `${wetModuleHeader(["composite", "compositeLinear", "flatten"])}
${WET_LAYER_WGSL}

fn stroke_sample(tile: u32, local: u32) -> vec4<f32> {
  let slot = table.slots[tile];
  if (slot == SLOT_NONE) { return vec4<f32>(0.0); }
  return stroke_pool[slot * TILE_PIXELS + local];
}

// 표시 색(선형 premultiplied): 문서 + 획 레이어(opacity·blend) → 수채 층 → 유화 층 → 릴리프 조명.
fn display_color(tile: u32, lx: u32, ly: u32) -> vec4<f32> {
  let tc = tile_coord(tile);
  let px = tc.x * TILE_SIZE + lx;
  let py = tc.y * TILE_SIZE + ly;
  let local = ly * TILE_SIZE + lx;
  let doc = document_px[py * params.width + px];
  let s = stroke_sample(tile, local) * params.stroke_opacity;
  let c = blend_stroke(doc, s, params.blend_mode);
  return display_pixel(c, i32(px), i32(py));
}

fn pixel_in_canvas(tile: u32, lx: u32, ly: u32) -> bool {
  let tc = tile_coord(tile);
  return tc.x * TILE_SIZE + lx < params.width && tc.y * TILE_SIZE + ly < params.height;
}

fn composite_present(tile: u32, lx: u32, ly: u32) {
  if (!pixel_in_canvas(tile, lx, ly)) { return; }
  let tc = tile_coord(tile);
  let px = i32(tc.x * TILE_SIZE + lx);
  let py = i32(tc.y * TILE_SIZE + ly);
  textureStore(present_tex, vec2<i32>(px, py), encode_present(display_color(tile, lx, ly)));
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.compositeDirty}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  composite_present(table.dirty_tiles[wid.x], lid.x, lid.y);
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.compositeAll}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (wid.x >= params.tiles_x || wid.y >= params.tiles_y) { return; }
  composite_present(wid.y * params.tiles_x + wid.x, lid.x, lid.y);
}

// 지금까지 할당된 습식 타일(간접 wet 인자)을 다시 합성한다: 물이 번지는 비 dirty 타일의 라이브 표시(마지막 프레임에 변한 타일 포함).
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.compositeWet}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  composite_present(table.wet_active_tiles[wid.x], lid.x, lid.y);
}

@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.compositeLinear}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  if (wid.x >= params.tiles_x || wid.y >= params.tiles_y) { return; }
  let tile = wid.y * params.tiles_x + wid.x;
  if (!pixel_in_canvas(tile, lid.x, lid.y)) { return; }
  let tc = tile_coord(tile);
  let px = tc.x * TILE_SIZE + lid.x;
  let py = tc.y * TILE_SIZE + lid.y;
  display_linear[py * params.width + px] = display_color(tile, lid.x, lid.y);
}

// 수채 층을 문서에 굽고 안료 채널(부유·침착·경화 12채널)을 비운다(bakeWet: 질량이 있는 셀만).
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.bakeWet}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tile = table.wet_active_tiles[wid.x];
  let slot = atomicLoad(&table.wet_slots[tile]);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  if (!pixel_in_canvas(tile, lid.x, lid.y)) { return; }
  let tc = tile_coord(tile);
  let local = lid.y * TILE_SIZE + lid.x;
  if (water_layer_mass(slot, local) <= 0.0) { return; }
  let o = (tc.y * TILE_SIZE + lid.y) * params.width + tc.x * TILE_SIZE + lid.x;
  document_px[o] = water_layer_apply(document_px[o], slot, local);
  for (var ch = 0u; ch < 4u; ch += 1u) {
    wet_pool[core_index(slot, WET_CH_PIG_R + ch, local)] = 0.0;
    wet_pool[core_index(slot, WET_CH_FIX_R + ch, local)] = 0.0;
    wet_ext[ext_index(slot, EXT_HARD_R + ch, local)] = 0.0;
  }
}

// 유화 층을 문서에 굽고 부피는 마른 릴리프로 굳힌다(flattenOil: 물감 부피가 있는 셀만 B = H, m = 0, C = 0).
@compute @workgroup_size(${GPU_TILE_SIZE}, ${GPU_TILE_SIZE}, 1)
fn ${ENTRY_POINTS.flattenOil}(
  @builtin(workgroup_id) wid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let tile = table.wet_active_tiles[wid.x];
  let slot = atomicLoad(&table.wet_slots[tile]);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  if (!pixel_in_canvas(tile, lid.x, lid.y)) { return; }
  let tc = tile_coord(tile);
  let local = lid.y * TILE_SIZE + lid.x;
  if (oil_layer_volume(slot, local) <= OIL_EPS) { return; }
  let o = (tc.y * TILE_SIZE + lid.y) * params.width + tc.x * TILE_SIZE + lid.x;
  document_px[o] = oil_layer_apply(document_px[o], slot, local);
  wet_ext[ext_index(slot, EXT_OIL_BASE, local)] = pool_at(slot, WET_CH_HEIGHT, local);
  wet_ext[ext_index(slot, EXT_OIL_WET, local)] = 0.0;
  wet_ext[ext_index(slot, EXT_OIL_R, local)] = 0.0;
  wet_ext[ext_index(slot, EXT_OIL_G, local)] = 0.0;
  wet_ext[ext_index(slot, EXT_OIL_B, local)] = 0.0;
}
`;
