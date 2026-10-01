/**
 * 꾸미기 도구 (Track 4 · 에디터 강화)
 *
 * 가구 배치의 진입장벽을 낮추는 스냅·복제·회전·nudge 헬퍼.
 * 전부 `editStudioVirtualDecoration`/`addStudioVirtualDecorationSafely`
 * (studio-virtual-space-decoration-layout)를 경유하므로 충돌·경계·접근성
 * 규칙이 항상 적용된다.
 */

import {
  addStudioVirtualDecorationSafely,
  editStudioVirtualDecoration,
  type StudioDecorationLayoutResult,
} from "./studio-virtual-space-decoration-layout";
import type {
  StudioVirtualDecorationState,
  StudioVirtualDecorPlacement,
} from "./studio-virtual-space-customization";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 기본 격자 간격(px). */
export const STUDIO_DECOR_GRID = 16;

/** 점을 격자에 스냅한다. */
export function snapStudioVirtualDecorPointToGrid(
  point: StudioVirtualSpacePoint,
  grid: number = STUDIO_DECOR_GRID,
): StudioVirtualSpacePoint {
  const step = Number.isFinite(grid) && grid > 0 ? grid : STUDIO_DECOR_GRID;
  return { x: Math.round(point.x / step) * step, y: Math.round(point.y / step) * step };
}

/** 선택한 가구를 격자에 맞춘다. */
export function alignStudioVirtualDecorationToGrid(
  current: StudioVirtualDecorationState,
  id: string,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
  grid: number = STUDIO_DECOR_GRID,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  const snapped = snapStudioVirtualDecorPointToGrid(item, grid);
  if (snapped.x === item.x && snapped.y === item.y) return { ok: true, state: current };
  return editStudioVirtualDecoration(current, id, { x: snapped.x, y: snapped.y }, world, self);
}

const DUPLICATE_OFFSET = { x: 32, y: 32 };

/** 선택한 가구를 옆에 복제한다. 회전·크기를 그대로 유지한다. */
export function duplicateStudioVirtualDecoration(
  current: StudioVirtualDecorationState,
  id: string,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  const added = addStudioVirtualDecorationSafely(
    current,
    item.type,
    { x: item.x + DUPLICATE_OFFSET.x, y: item.y + DUPLICATE_OFFSET.y },
    world,
  );
  if (!added.ok) return added;
  const last = added.state.placements.at(-1);
  if (!last || (last.rotation === item.rotation && last.scale === item.scale)) return added;
  return editStudioVirtualDecoration(
    added.state,
    last.id,
    { rotation: item.rotation, scale: item.scale },
    world,
    self,
  );
}

/** 선택한 가구를 시계 방향 90° 회전한다. */
export function rotateStudioVirtualDecoration(
  current: StudioVirtualDecorationState,
  id: string,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  const rotation = ((item.rotation + 90) % 360) as StudioVirtualDecorPlacement["rotation"];
  return editStudioVirtualDecoration(current, id, { rotation }, world, self);
}

/** 선택한 가구를 미세 이동(nudge)한다. */
export function nudgeStudioVirtualDecoration(
  current: StudioVirtualDecorationState,
  id: string,
  dx: number,
  dy: number,
  world: StudioVirtualSpaceWorldManifest,
  self?: StudioVirtualSpacePoint,
): StudioDecorationLayoutResult {
  const item = current.placements.find((entry) => entry.id === id);
  if (!item) return { ok: false, reason: "invalid" };
  return editStudioVirtualDecoration(current, id, { x: item.x + dx, y: item.y + dy }, world, self);
}
