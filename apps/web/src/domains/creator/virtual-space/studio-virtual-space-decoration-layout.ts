import {
  addStudioVirtualDecoration,
  parseStudioVirtualDecorationState,
  studioVirtualDecorationPreset,
  type StudioVirtualDecorationState,
  type StudioVirtualDecorPlacement,
  type StudioVirtualDecorPresetKey,
  type StudioVirtualDecorType,
} from "./studio-virtual-space-customization";
import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { StudioWorldConnectivityIndex, studioWorldCircleCanOccupy } from "./studio-virtual-space-world-connectivity";
import { studioWorldCollisionRects, studioWorldInteractions, studioWorldPortals, type StudioVirtualSpaceWorldManifest as World, type StudioWorldRect } from "./studio-virtual-space-world-manifest";
import { studioSemanticSurfaceAt } from "./studio-virtual-space-semantic-world";
import { linkStudioVirtualDerivedWorld } from "./studio-virtual-space-world-presentation";

const SOLID_DECOR = new Set<StudioVirtualDecorType>(["tree", "bench", "market-stall", "fountain", "portal", "drawing-desk", "bookshelf", "review-board", "sofa"]);
export type StudioDecorationLayoutResult = { readonly ok: true; readonly state: StudioVirtualDecorationState }
  | { readonly ok: false; readonly reason: "bounds" | "occupied" | "access" | "limit" | "invalid" };
const projectionCache = new WeakMap<StudioVirtualDecorationState, WeakMap<World, StudioVirtualDecorationState>>();

function rotatedRect(item: StudioVirtualDecorPlacement, left: number, top: number, width: number, height: number): StudioWorldRect {
  const angle = item.rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  const points = [[left, top], [left + width, top], [left + width, top + height], [left, top + height]]
    .map(([x = 0, y = 0]) => ({ x: item.x + x * cos - y * sin, y: item.y + x * sin + y * cos }));
  const x = Math.min(...points.map((point) => point.x)), y = Math.min(...points.map((point) => point.y));
  return { x, y, width: Math.max(...points.map((point) => point.x)) - x, height: Math.max(...points.map((point) => point.y)) - y };
}

export function studioVirtualDecorBounds(item: StudioVirtualDecorPlacement): StudioWorldRect {
  const size = 82 * item.scale;
  return rotatedRect(item, -size * .5, -size * .9, size, size);
}

/** 렌더러와 경로 탐색이 같은 발밑 영역을 사용한다. 장식 애니메이션은 이 영역을 바꾸지 않는다. */
export function studioVirtualDecorCollider(item: StudioVirtualDecorPlacement): StudioWorldRect | null {
  if (!SOLID_DECOR.has(item.type)) return null;
  const size = 82 * item.scale;
  return rotatedRect(item, -size * .31, -size * .33, size * .62, size * .36);
}

function fit(item: StudioVirtualDecorPlacement, world: World): StudioVirtualDecorPlacement {
  const bounds = studioVirtualDecorBounds(item);
  return { ...item,
    x: Math.max(Math.ceil(item.x - bounds.x), Math.min(Math.floor(world.width - bounds.width + item.x - bounds.x), Math.round(item.x))),
    y: Math.max(Math.ceil(item.y - bounds.y), Math.min(Math.floor(world.height - bounds.height + item.y - bounds.y), Math.round(item.y))),
  };
}

/** 레거시 좌표를 현재 장소 크기로 변환하며, 변환된 저장본은 다시 축소하지 않는다. */
export function studioVirtualDecorationStateForWorld(state: StudioVirtualDecorationState, world: World): StudioVirtualDecorationState {
  if (state.layoutWidth === world.width && state.layoutHeight === world.height) return state;
  const cached = projectionCache.get(state)?.get(world);
  if (cached) return cached;
  const width = state.layoutWidth ?? 1280, height = state.layoutHeight ?? 960;
  const next = Object.freeze({ ...state, layoutWidth: world.width, layoutHeight: world.height,
    placements: Object.freeze(state.placements.map((item) => Object.freeze(fit({ ...item,
      x: item.x / width * world.width, y: item.y / height * world.height,
    }, world)))),
  });
  let byWorld = projectionCache.get(state);
  if (!byWorld) { byWorld = new WeakMap(); projectionCache.set(state, byWorld); }
  byWorld.set(world, next);
  return next;
}

export function studioVirtualDecorationNavigationWorld(world: World, state: StudioVirtualDecorationState): World {
  const projected = studioVirtualDecorationStateForWorld(state, world);
  const extra = projected.placements.map(studioVirtualDecorCollider).filter((rect): rect is StudioWorldRect => rect !== null);
  return extra.length ? linkStudioVirtualDerivedWorld({ ...world, colliders: [...world.colliders, ...extra] }, world) : world;
}

function footprint(item: StudioVirtualDecorPlacement): StudioWorldRect {
  return studioVirtualDecorCollider(item) ?? { x: item.x - 12 * item.scale, y: item.y - 12 * item.scale, width: 24 * item.scale, height: 24 * item.scale };
}

function protectedPoints(world: World, self?: StudioVirtualSpacePoint): readonly StudioVirtualSpacePoint[] {
  return [
    ...world.spawns.map((entry) => entry.point), ...studioWorldPortals(world).flatMap((entry) => entry.targetPoint ? [entry.point, entry.targetPoint] : [entry.point]),
    ...studioWorldInteractions(world).map((entry) => entry.point),
    ...(world.interactionSlots ?? []).flatMap((entry) => [entry.approachPoint, entry.anchorPoint, entry.exitPoint]),
    ...(world.npcActivityAnchors ?? []).flatMap((entry) => [entry.approachPoint, entry.anchorPoint, entry.exitPoint]),
    ...world.npcs.flatMap((entry) => [entry.point, ...(entry.patrol ?? [])]), ...(self ? [self] : []),
  ];
}

function placementProblem(world: World, state: StudioVirtualDecorationState, candidate: StudioVirtualDecorPlacement,
  self?: StudioVirtualSpacePoint): Extract<StudioDecorationLayoutResult, { ok: false }>["reason"] | null {
  const bounds = studioVirtualDecorBounds(candidate);
  if (bounds.x < -.001 || bounds.y < -.001 || bounds.x + bounds.width > world.width + .001
    || bounds.y + bounds.height > world.height + .001) return "bounds";
  const floor = footprint(candidate);
  if (!studioSemanticSurfaceAt(world, { x: floor.x + floor.width / 2, y: floor.y + floor.height / 2 }).walkable) return "occupied";
  const other = state.placements.filter((item) => item.id !== candidate.id);
  const blockers = [...studioWorldCollisionRects(world), ...other.map(footprint)];
  if (blockers.some((rect) => floor.x < rect.x + rect.width + 6 && floor.x + floor.width + 6 > rect.x
    && floor.y < rect.y + rect.height + 6 && floor.y + floor.height + 6 > rect.y)) return "occupied";
  if (protectedPoints(world, self).some((point) => !studioWorldCircleCanOccupy(world, [floor], point, 20))) return "access";
  if (!studioVirtualDecorCollider(candidate)) return null;
  const before = studioVirtualDecorationNavigationWorld(world, { ...state, placements: other });
  const beforeRects = studioWorldCollisionRects(before), afterRects = [...beforeRects, floor];
  const anchors = protectedPoints(world, self).filter((point) => studioWorldCircleCanOccupy(world, beforeRects, point, 9));
  const origin = self && studioWorldCircleCanOccupy(world, beforeRects, self, 9) ? self : anchors[0];
  if (!origin) return null;
  const baseline = new StudioWorldConnectivityIndex(world, beforeRects, 9);
  const proposed = new StudioWorldConnectivityIndex(world, afterRects, 9);
  for (const anchor of anchors) {
    if (baseline.connected(origin, anchor) && !proposed.connected(origin, anchor)) return "access";
  }
  return proposed.budgetExceeded ? "access" : null;
}

function nearbyPlacement(world: World, state: StudioVirtualDecorationState, item: StudioVirtualDecorPlacement,
  self?: StudioVirtualSpacePoint): StudioVirtualDecorPlacement | null {
  const initial = fit(item, world);
  for (let ring = 0; ring <= 8; ring += 1) {
    const count = ring === 0 ? 1 : 16;
    for (let step = 0; step < count; step += 1) {
      const angle = step / count * Math.PI * 2;
      const candidate = { ...initial, x: Math.round(initial.x + Math.cos(angle) * ring * 24), y: Math.round(initial.y + Math.sin(angle) * ring * 24) };
      if (!placementProblem(world, state, candidate, self)) return candidate;
    }
  }
  return null;
}

export function addStudioVirtualDecorationSafely(current: StudioVirtualDecorationState, type: StudioVirtualDecorType,
  point: StudioVirtualSpacePoint, world: World): StudioDecorationLayoutResult {
  const state = studioVirtualDecorationStateForWorld(current, world);
  if (state.placements.length >= 36) return { ok: false, reason: "limit" };
  const added = addStudioVirtualDecoration(state, type, point);
  const last = added.placements.at(-1);
  if (added === state || !last) return { ok: false, reason: "invalid" };
  const candidate = nearbyPlacement(world, state, last, point);
  return candidate ? { ok: true, state: { ...added, placements: [...state.placements, candidate] } } : { ok: false, reason: "access" };
}

export function editStudioVirtualDecoration(current: StudioVirtualDecorationState, id: string,
  patch: Partial<Pick<StudioVirtualDecorPlacement, "x" | "y" | "rotation" | "scale">>, world: World,
  self?: StudioVirtualSpacePoint): StudioDecorationLayoutResult {
  const state = studioVirtualDecorationStateForWorld(current, world), selected = state.placements.find((item) => item.id === id);
  if (!selected) return { ok: false, reason: "invalid" };
  const item = { ...selected, ...patch };
  const next = { ...state, revision: state.revision + 1, placements: state.placements.map((entry) => entry.id === id ? item : entry) };
  if (!parseStudioVirtualDecorationState(next)) return { ok: false, reason: "invalid" };
  const reason = placementProblem(world, state, item, self);
  return reason ? { ok: false, reason } : { ok: true, state: next };
}

export function studioVirtualDecorationPresetForWorld(key: StudioVirtualDecorPresetKey, world: World,
  self?: StudioVirtualSpacePoint): StudioDecorationLayoutResult {
  const preset = studioVirtualDecorationStateForWorld(studioVirtualDecorationPreset(key), world);
  let state: StudioVirtualDecorationState = { ...preset, placements: [] };
  for (const item of preset.placements) {
    const candidate = nearbyPlacement(world, state, item, self);
    if (!candidate) return { ok: false, reason: "access" };
    state = { ...state, placements: [...state.placements, candidate] };
  }
  return { ok: true, state };
}

/** 묶음 배치는 전부 안전할 때만 한 번에 적용하여 부분 배치와 개수 초과를 막는다. */
export function placeStudioVirtualDecorationGroup(current: StudioVirtualDecorationState,
  items: readonly Omit<StudioVirtualDecorPlacement, "id">[], world: World,
  self?: StudioVirtualSpacePoint): StudioDecorationLayoutResult {
  if (current.placements.length + items.length > 36) return { ok: false, reason: "limit" };
  let state = studioVirtualDecorationStateForWorld(current, world);
  let sequence = state.placements.length;
  const prefix = `decor-${Date.now().toString(36)}`;
  for (const item of items) {
    while (state.placements.some((entry) => entry.id === `${prefix}-${sequence}`)) sequence += 1;
    const next = { ...item, id: `${prefix}-${sequence++}` };
    const bounded = fit(next, world);
    if (!parseStudioVirtualDecorationState({ ...state, placements: [...state.placements, bounded] })) return { ok: false, reason: "invalid" };
    const candidate = nearbyPlacement(world, state, bounded, self);
    if (!candidate) return { ok: false, reason: "access" };
    state = { ...state, placements: [...state.placements, candidate] };
  }
  return { ok: true, state: { ...state, revision: current.revision + 1 } };
}
