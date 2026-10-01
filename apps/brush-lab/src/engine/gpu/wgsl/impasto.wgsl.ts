import { ENTRY_POINTS, IMPASTO_WORKGROUP } from "../layout";

import { COMMON_WGSL } from "./common.wgsl";

/**
 * 임파스토 높이장 패스(베타) — CPU `raster/fine-raster.ts` `applyImpastoDabs`의 GPU 미러.
 *
 * 높이장 밀기(`wet/impasto.ts` pushHeightField)는 타일을 가로지르고 dab 순서에 의존하므로 타일 배타 래스터(`raster_tile`)에 넣을 수
 * 없다. 그래서 프레임마다 raster_tile 뒤에 **임파스토 dab마다 dispatch 2회**를 dab 인덱스 순서로 낸다. dab마다 값이 다른 창·방향은
 * 동적 오프셋 uniform(`impasto_dab`, group 2)으로 고른다.
 *   1. `impasto_move`: 밀기 영역(창 + 진행 축 양쪽 1 px)의 픽셀마다 `moved = h·clamp(cov·mask·push)`를 스크래치(`refs` 버퍼를 f32로
 *      재사용 — 이 시점에 CSR은 이미 소비됐고 다음 프레임이 다시 쓴다)에 기록한다. 높이는 읽기만 한다.
 *   2. `impasto_apply`: gather — `next = h − (하류가 캔버스 안이면 moved[자기]) + (상류가 영역·캔버스 안이면 moved[상류])`을 쓰고,
 *      같은 dab의 침착량(`cov·mask·grain·flow·max(0.25, mass)`)을 더한다. 각 스레드는 자기 픽셀만 쓰므로 race가 없고,
 *      두 dispatch 사이의 storage 동기화가 dab 순서(밀기 → 침착 → 다음 dab)를 보장한다.
 * 수식·f32 연산 순서는 CPU와 같다. 표시 시점 릴리프 조명은 composite 모듈이 맡는다.
 */
export const IMPASTO_WGSL: string = /* wgsl */ `${COMMON_WGSL}

// 습식 풀 높이 채널의 픽셀 접근(현재 패리티). 캔버스 안 좌표만 받는다. 미할당 타일은 읽기 0, 쓰기 생략.
fn height_slot(gx: i32, gy: i32) -> u32 {
  let tile = (u32(gy) / TILE_SIZE) * params.tiles_x + u32(gx) / TILE_SIZE;
  return atomicLoad(&table.wet_slots[tile]);
}

fn height_index(slot: u32, gx: i32, gy: i32) -> u32 {
  let local = (u32(gy) % TILE_SIZE) * TILE_SIZE + (u32(gx) % TILE_SIZE);
  return wet_index(slot, table.wet_parity, WET_CH_HEIGHT, local);
}

fn height_raw(gx: i32, gy: i32) -> f32 {
  let slot = height_slot(gx, gy);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return 0.0; }
  return wet_pool[height_index(slot, gx, gy)];
}

fn height_store(gx: i32, gy: i32, v: f32) {
  let slot = height_slot(gx, gy);
  if (slot == SLOT_NONE || slot == SLOT_RESERVED) { return; }
  wet_pool[height_index(slot, gx, gy)] = v;
}

// shadeDabPixel 미러: 픽셀 중심 (x+0.5, y+0.5)의 커버리지·마스크·그레인. AABB 밖이면 hit = false.
fn impasto_dab_shade(d: Dab, x: i32, y: i32) -> DabCoverage {
  let px = f32(x) + 0.5;
  let py = f32(y) + 0.5;
  let dx = px - d.p.x;
  let dy = py - d.p.y;
  let e = dab_extent_px(d);
  if (dy > e || dy < -e || dx > e || dx < -e) { return DabCoverage(0.0, 1.0, 1.0, false); }
  return dab_coverage(d, px, py, dx, dy, params.edge_curve_enabled != 0u, params.filter_mode, f32(params.tip_atlas_tile), params.paper_enabled != 0u);
}

fn in_window(x: i32, y: i32) -> bool {
  return x >= impasto_dab.win_x0 && x <= impasto_dab.win_x1 && y >= impasto_dab.win_y0 && y <= impasto_dab.win_y1;
}

fn in_canvas(x: i32, y: i32) -> bool {
  return x >= 0 && x < i32(params.width) && y >= 0 && y < i32(params.height);
}

fn region_width() -> u32 { return u32(impasto_dab.reg_x1 - impasto_dab.reg_x0 + 1); }
fn region_height() -> u32 { return u32(impasto_dab.reg_y1 - impasto_dab.reg_y0 + 1); }

@compute @workgroup_size(${IMPASTO_WORKGROUP})
fn ${ENTRY_POINTS.impastoMove}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let rw = region_width();
  let i = gid.x;
  if (i >= rw * region_height()) { return; }
  let x = impasto_dab.reg_x0 + i32(i % rw);
  let y = impasto_dab.reg_y0 + i32(i / rw);
  var moved = 0.0;
  let h = height_raw(x, y);
  if (h > 0.0 && in_window(x, y)) {
    let d = dabs[impasto_dab.dab_index];
    let c = impasto_dab_shade(d, x, y);
    if (c.hit) {
      let amount = c.cov * c.mask * impasto_dab.push;
      moved = h * clamp(amount, 0.0, 1.0);
    }
  }
  // 스크래치는 refs 버퍼(CSR은 이미 소비됨)를 f32 비트로 재사용한다.
  refs[i] = bitcast<u32>(moved);
}

@compute @workgroup_size(${IMPASTO_WORKGROUP})
fn ${ENTRY_POINTS.impastoApply}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let rw = region_width();
  let i = gid.x;
  if (i >= rw * region_height()) { return; }
  let x = impasto_dab.reg_x0 + i32(i % rw);
  let y = impasto_dab.reg_y0 + i32(i / rw);
  let h = height_raw(x, y);
  var v = h;
  if (impasto_dab.do_push != 0u) {
    var next = h;
    if (in_canvas(x + impasto_dab.step_x, y + impasto_dab.step_y)) { next = next - bitcast<f32>(refs[i]); }
    let ux = x - impasto_dab.step_x;
    let uy = y - impasto_dab.step_y;
    if (in_canvas(ux, uy) && ux >= impasto_dab.reg_x0 && ux <= impasto_dab.reg_x1 && uy >= impasto_dab.reg_y0 && uy <= impasto_dab.reg_y1) {
      let ui = u32(uy - impasto_dab.reg_y0) * rw + u32(ux - impasto_dab.reg_x0);
      next = next + bitcast<f32>(refs[ui]);
    }
    if (next != h) { v = max(next, 0.0); }
  }
  if (in_window(x, y)) {
    let d = dabs[impasto_dab.dab_index];
    let c = impasto_dab_shade(d, x, y);
    if (c.hit) {
      let deposit = c.cov * c.mask * c.grain * d.flow * max(IMPASTO_MIN_MASS, dab_pigment_mass(d));
      if (deposit > 0.0) { v = v + deposit; }
    }
  }
  if (v != h) { height_store(x, y, v); }
}
`;
