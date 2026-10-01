import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import { studioSemanticLineCanTraverse, studioSemanticSurfaceAt, studioSemanticWorldIsUniform } from "./studio-virtual-space-semantic-world";
import {
  studioWorldCollisionRects,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldRect,
} from "./studio-virtual-space-world-manifest";
import {
  studioWorldCircleCanOccupy,
  studioWorldLineCanOccupy,
  studioWorldNavigationLattice,
  type StudioWorldNavigationLattice,
} from "./studio-virtual-space-world-connectivity";

/** 한 번의 경로 탐색이 펼칠 수 있는 최대 셀 수. 실제 한도는 월드 셀 수와 이 값 중 작은 쪽이다. */
const MAX_EXPANSIONS = 150_000;
export const STUDIO_WORLD_PLAYER_RADIUS = 9;
const DEFAULT_RADIUS = STUDIO_WORLD_PLAYER_RADIUS;
const OCCUPANCY_UNKNOWN = 0;
const OCCUPANCY_FREE = 1;
const OCCUPANCY_BLOCKED = 2;
const MAX_LINE_CACHE = 20_000;
const MAX_PATH_CACHE = 2_000;

interface StudioWorldPathfindingCache {
  readonly lattice: StudioWorldNavigationLattice;
  /** 지형 표면이 한 가지면 셀마다 표면을 다시 묻지 않는다. */
  readonly uniformSurface: boolean;
  /** 격자점 점유 캐시. 0 = 모름, 1 = 비어 있음, 2 = 막힘. */
  readonly occupancy: Uint8Array;
  /** 격자점 사이 직선 통과 캐시. 키 = from 셀 × 셀 수 + to 셀. */
  readonly lines: Map<number, boolean>;
  /** 시작 키 → 목표 키 → 경로. 좌표는 0.5px 단위로 반올림한다. */
  readonly paths: Map<number, Map<number, readonly StudioVirtualSpacePoint[]>>;
  pathCount: number;
}

const PATHFINDING_CACHE = new WeakMap<StudioVirtualSpaceWorldManifest, Map<number, StudioWorldPathfindingCache>>();

function cacheFor(manifest: StudioVirtualSpaceWorldManifest, radius: number): StudioWorldPathfindingCache {
  let byRadius = PATHFINDING_CACHE.get(manifest);
  if (!byRadius) { byRadius = new Map(); PATHFINDING_CACHE.set(manifest, byRadius); }
  let cache = byRadius.get(radius);
  const lattice = studioWorldNavigationLattice(manifest);
  if (!cache || cache.lattice !== lattice) {
    cache = { lattice, uniformSurface: studioSemanticWorldIsUniform(manifest), occupancy: new Uint8Array(lattice.cells),
      lines: new Map(), paths: new Map(), pathCount: 0 };
    byRadius.set(radius, cache);
  }
  return cache;
}

/**
 * 격자점 위이면서 가장자리 보정(clamp)이 필요 없는 좌표만 셀 번호를 가진다(캐시 대상).
 * 보정된 좌표와 격자 좌표가 같은 셀을 두고 다른 답을 캐시하지 않게 한다.
 */
function gridCell(
  manifest: StudioVirtualSpaceWorldManifest,
  lattice: StudioWorldNavigationLattice,
  point: StudioVirtualSpacePoint,
  radius: number,
): number | null {
  if (point.x < radius || point.y < radius || point.x > manifest.width - radius || point.y > manifest.height - radius) return null;
  const gx = point.x / lattice.grid, gy = point.y / lattice.grid;
  const rx = Math.round(gx), ry = Math.round(gy);
  if (Math.abs(gx - rx) > 1e-6 || Math.abs(gy - ry) > 1e-6) return null;
  if (rx < 0 || ry < 0 || rx >= lattice.columns || ry >= lattice.rows) return null;
  return ry * lattice.columns + rx;
}

function occupancyAt(
  manifest: StudioVirtualSpaceWorldManifest,
  cache: StudioWorldPathfindingCache,
  colliders: readonly StudioWorldRect[],
  point: StudioVirtualSpacePoint,
  radius: number,
): boolean {
  return studioWorldCircleCanOccupy(manifest, colliders, point, radius)
    && (cache.uniformSurface || studioSemanticSurfaceAt(manifest, point).walkable);
}

function canOccupyWithColliders(
  manifest: StudioVirtualSpaceWorldManifest,
  colliders: readonly StudioWorldRect[],
  point: StudioVirtualSpacePoint,
  radius: number,
): boolean {
  const cache = cacheFor(manifest, radius);
  const cell = gridCell(manifest, cache.lattice, point, radius);
  if (cell !== null) {
    const known = cache.occupancy[cell]!;
    if (known !== OCCUPANCY_UNKNOWN) return known === OCCUPANCY_FREE;
  }
  const value = occupancyAt(manifest, cache, colliders, point, radius);
  if (cell !== null) cache.occupancy[cell] = value ? OCCUPANCY_FREE : OCCUPANCY_BLOCKED;
  return value;
}

export function clampStudioWorldPoint(
  manifest: StudioVirtualSpaceWorldManifest,
  point: StudioVirtualSpacePoint,
  radius = DEFAULT_RADIUS,
): StudioVirtualSpacePoint {
  return {
    x: Math.max(radius, Math.min(manifest.width - radius, point.x)),
    y: Math.max(radius, Math.min(manifest.height - radius, point.y)),
  };
}

export function studioWorldCanOccupy(
  manifest: StudioVirtualSpaceWorldManifest,
  point: StudioVirtualSpacePoint,
  radius = DEFAULT_RADIUS,
): boolean {
  return canOccupyWithColliders(
    manifest,
    studioWorldCollisionRects(manifest),
    point,
    radius,
  );
}

function lineWalkable(
  manifest: StudioVirtualSpaceWorldManifest,
  colliders: readonly StudioWorldRect[],
  from: StudioVirtualSpacePoint,
  to: StudioVirtualSpacePoint,
  radius: number,
): boolean {
  const cache = cacheFor(manifest, radius);
  const fromCell = gridCell(manifest, cache.lattice, from, radius), toCell = gridCell(manifest, cache.lattice, to, radius);
  const key = fromCell !== null && toCell !== null ? fromCell * cache.lattice.cells + toCell : null;
  const cached = key !== null ? cache.lines.get(key) : undefined;
  if (cached !== undefined) return cached;
  const value = studioWorldLineCanOccupy(manifest, colliders, from, to, radius)
    && studioSemanticLineCanTraverse(manifest, from, to);
  if (key !== null) {
    if (cache.lines.size >= MAX_LINE_CACHE) cache.lines.clear();
    cache.lines.set(key, value);
  }
  return value;
}

/** 계획과 실제 경유점 단축이 같은 충돌·지형·높이 규칙을 사용한다. */
export function studioWorldCanTraverse(
  manifest: StudioVirtualSpaceWorldManifest,
  from: StudioVirtualSpacePoint,
  to: StudioVirtualSpacePoint,
  radius = DEFAULT_RADIUS,
): boolean {
  return lineWalkable(manifest, studioWorldCollisionRects(manifest), from, to, radius);
}

function smoothPath(
  manifest: StudioVirtualSpaceWorldManifest,
  colliders: readonly StudioWorldRect[],
  start: StudioVirtualSpacePoint,
  points: readonly StudioVirtualSpacePoint[],
  radius: number,
): readonly StudioVirtualSpacePoint[] {
  if (points.length <= 2) return points;
  const result: StudioVirtualSpacePoint[] = [];
  let anchor = start;
  let index = 0;
  while (index < points.length) {
    let furthest = index;
    for (let candidate = points.length - 1; candidate >= index; candidate -= 1) {
      if (lineWalkable(manifest, colliders, anchor, points[candidate]!, radius)) {
        furthest = candidate;
        break;
      }
    }
    const point = points[furthest]!;
    result.push(point);
    anchor = point;
    index = furthest + 1;
  }
  return result;
}

/** 셀 번호를 f 점수 순으로 꺼내는 최소 힙. */
class CellHeap {
  private cells = new Int32Array(1024);
  private scores = new Float64Array(1024);
  private length = 0;

  get size(): number {
    return this.length;
  }

  clear(): void {
    this.length = 0;
  }

  private grow(): void {
    const cells = new Int32Array(this.cells.length * 2);
    const scores = new Float64Array(this.scores.length * 2);
    cells.set(this.cells);
    scores.set(this.scores);
    this.cells = cells;
    this.scores = scores;
  }

  push(cell: number, score: number): void {
    if (this.length === this.cells.length) this.grow();
    let index = this.length++;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.scores[parent]! <= score) break;
      this.cells[index] = this.cells[parent]!;
      this.scores[index] = this.scores[parent]!;
      index = parent;
    }
    this.cells[index] = cell;
    this.scores[index] = score;
  }

  /** 가장 작은 점수의 셀. 비었으면 -1. `lastScore`에 점수를 남긴다. */
  lastScore = 0;
  pop(): number {
    if (this.length === 0) return -1;
    const root = this.cells[0]!;
    this.lastScore = this.scores[0]!;
    const lastCell = this.cells[--this.length]!;
    const lastScore = this.scores[this.length]!;
    if (this.length === 0) return root;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= this.length) break;
      const right = left + 1;
      const child = right < this.length && this.scores[right]! < this.scores[left]! ? right : left;
      if (this.scores[child]! >= lastScore) break;
      this.cells[index] = this.cells[child]!;
      this.scores[index] = this.scores[child]!;
      index = child;
    }
    this.cells[index] = lastCell;
    this.scores[index] = lastScore;
    return root;
  }
}

/** 탐색마다 버퍼를 새로 할당하지 않고 세대 번호로 초기화를 대신한다. */
interface SearchWorkspace {
  readonly cells: number;
  readonly gScore: Float64Array;
  readonly fScore: Float64Array;
  readonly cameFrom: Int32Array;
  readonly closed: Uint8Array;
  readonly stamp: Uint32Array;
  generation: number;
  readonly heap: CellHeap;
}

let workspace: SearchWorkspace | null = null;

function searchWorkspace(cells: number): SearchWorkspace {
  if (!workspace || workspace.cells < cells) {
    workspace = {
      cells,
      gScore: new Float64Array(cells),
      fScore: new Float64Array(cells),
      cameFrom: new Int32Array(cells),
      closed: new Uint8Array(cells),
      stamp: new Uint32Array(cells),
      generation: 0,
      heap: new CellHeap(),
    };
  }
  workspace.generation += 1;
  if (workspace.generation >= 0xffffffff) {
    workspace.stamp.fill(0);
    workspace.generation = 1;
  }
  workspace.heap.clear();
  return workspace;
}

function cellPoint(
  manifest: StudioVirtualSpaceWorldManifest,
  lattice: StudioWorldNavigationLattice,
  cell: number,
  radius: number,
): StudioVirtualSpacePoint {
  const gx = cell % lattice.columns;
  const gy = Math.floor(cell / lattice.columns);
  return clampStudioWorldPoint(manifest, { x: gx * lattice.grid, y: gy * lattice.grid }, radius);
}

/**
 * 격자 노드(가장자리는 보정된 좌표)의 점유 여부. 노드 전용 캐시를 써서 좌표 객체를 만들지 않는다.
 * 보정이 필요 없는 내부 노드는 좌표 캐시와 같은 칸을 공유한다.
 */
function cellFree(
  manifest: StudioVirtualSpaceWorldManifest,
  cache: StudioWorldPathfindingCache,
  colliders: readonly StudioWorldRect[],
  gx: number,
  gy: number,
  radius: number,
): boolean {
  const { lattice } = cache;
  if (gx < 0 || gy < 0 || gx >= lattice.columns || gy >= lattice.rows) return false;
  const x = gx * lattice.grid, y = gy * lattice.grid;
  const interior = x >= radius && y >= radius && x <= manifest.width - radius && y <= manifest.height - radius;
  const cell = gy * lattice.columns + gx;
  if (interior) {
    const known = cache.occupancy[cell]!;
    if (known !== OCCUPANCY_UNKNOWN) return known === OCCUPANCY_FREE;
  }
  const value = occupancyAt(manifest, cache, colliders, cellPoint(manifest, lattice, cell, radius), radius);
  if (interior) cache.occupancy[cell] = value ? OCCUPANCY_FREE : OCCUPANCY_BLOCKED;
  return value;
}

function nearestWalkableCell(
  manifest: StudioVirtualSpaceWorldManifest,
  colliders: readonly StudioWorldRect[],
  point: StudioVirtualSpacePoint,
  radius: number,
  requireConnection = false,
  preferNear: StudioVirtualSpacePoint = point,
): number | null {
  const cache = cacheFor(manifest, radius);
  const { lattice } = cache;
  const gx = Math.round(point.x / lattice.grid);
  const gy = Math.round(point.y / lattice.grid);
  for (let ring = 0; ring <= 16; ring += 1) {
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cx = gx + dx, cy = gy + dy;
        if (!cellFree(manifest, cache, colliders, cx, cy, radius)) continue;
        const cell = cy * lattice.columns + cx;
        const candidate = cellPoint(manifest, lattice, cell, radius);
        if (requireConnection && !lineWalkable(manifest, colliders, point, candidate, radius)) continue;
        const distance = Math.hypot(candidate.x - preferNear.x, candidate.y - preferNear.y);
        if (distance < bestDistance || (distance === bestDistance && best !== null && cell < best)) {
          best = cell;
          bestDistance = distance;
        }
      }
    }
    if (best !== null) return best;
  }
  return null;
}

function roundedPointKey(point: StudioVirtualSpacePoint): number {
  // 0.5px 단위. 월드 최대 10000px → 20001 이하 두 값을 하나의 안전한 정수로 묶는다.
  return Math.round(point.x * 2) * 32_768 + Math.round(point.y * 2);
}

function cachedPath(cache: StudioWorldPathfindingCache, start: number, target: number): readonly StudioVirtualSpacePoint[] | undefined {
  return cache.paths.get(start)?.get(target);
}

function storePath(
  cache: StudioWorldPathfindingCache,
  start: number,
  target: number,
  path: readonly StudioVirtualSpacePoint[],
  max = MAX_PATH_CACHE,
): readonly StudioVirtualSpacePoint[] {
  if (cache.pathCount >= max) { cache.paths.clear(); cache.pathCount = 0; }
  let byTarget = cache.paths.get(start);
  if (!byTarget) { byTarget = new Map(); cache.paths.set(start, byTarget); }
  if (!byTarget.has(target)) cache.pathCount += 1;
  byTarget.set(target, path);
  return path;
}

const EMPTY_PATH: readonly StudioVirtualSpacePoint[] = Object.freeze([]);
const SQRT2 = Math.SQRT2;
const DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
] as const;

export function findStudioWorldPath(
  manifest: StudioVirtualSpaceWorldManifest,
  start: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  radius = DEFAULT_RADIUS,
): readonly StudioVirtualSpacePoint[] {
  if (![start.x, start.y, target.x, target.y, radius].every(Number.isFinite) || radius <= 0) return [];
  const cache = cacheFor(manifest, radius);
  const startKey = roundedPointKey(start);
  const targetKey = roundedPointKey(target);
  const cached = cachedPath(cache, startKey, targetKey);
  if (cached) return cached;
  const colliders = studioWorldCollisionRects(manifest);
  const boundedStart = clampStudioWorldPoint(manifest, start, radius);
  const boundedTarget = clampStudioWorldPoint(manifest, target, radius);

  if (!canOccupyWithColliders(manifest, colliders, boundedStart, radius)) {
    return storePath(cache, startKey, targetKey, EMPTY_PATH);
  }
  if (lineWalkable(manifest, colliders, boundedStart, boundedTarget, radius)) {
    return storePath(cache, startKey, targetKey, Object.freeze([{ ...boundedTarget }]));
  }

  const startCell = nearestWalkableCell(manifest, colliders, boundedStart, radius, true);
  const targetCell = nearestWalkableCell(
    manifest,
    colliders,
    boundedTarget,
    radius,
    canOccupyWithColliders(manifest, colliders, boundedTarget, radius),
    boundedStart,
  );
  if (startCell === null || targetCell === null) {
    return storePath(cache, startKey, targetKey, EMPTY_PATH);
  }

  const { lattice } = cache;
  const { columns } = lattice;
  const search = searchWorkspace(lattice.cells);
  const { gScore, fScore, cameFrom, closed, stamp, heap } = search;
  const generation = search.generation;
  const targetX = targetCell % columns, targetY = Math.floor(targetCell / columns);
  const touch = (cell: number) => {
    if (stamp[cell] === generation) return;
    stamp[cell] = generation;
    gScore[cell] = Number.POSITIVE_INFINITY;
    fScore[cell] = Number.POSITIVE_INFINITY;
    cameFrom[cell] = -1;
    closed[cell] = 0;
  };
  touch(startCell);
  const startX = startCell % columns, startY = Math.floor(startCell / columns);
  const startF = Math.hypot(targetX - startX, targetY - startY);
  gScore[startCell] = 0;
  fScore[startCell] = startF;
  heap.push(startCell, startF);

  const maxExpansions = Math.min(MAX_EXPANSIONS, lattice.cells);
  let expansions = 0;
  while (heap.size > 0 && expansions < maxExpansions) {
    const current = heap.pop();
    if (current < 0) break;
    if (closed[current]) continue;
    if (heap.lastScore > fScore[current]! + 1e-9) continue;

    if (current === targetCell) {
      const reversed: StudioVirtualSpacePoint[] = [cellPoint(manifest, lattice, targetCell, radius)];
      let cursor = current;
      while (cameFrom[cursor]! >= 0) {
        cursor = cameFrom[cursor]!;
        if (cursor === startCell) break;
        reversed.push(cellPoint(manifest, lattice, cursor, radius));
      }
      reversed.reverse();
      const targetPoint = cellPoint(manifest, lattice, targetCell, radius);
      if (canOccupyWithColliders(manifest, colliders, boundedTarget, radius)
        && lineWalkable(manifest, colliders, targetPoint, boundedTarget, radius)) {
        reversed.push(boundedTarget);
      }
      const smoothed = Object.freeze([...smoothPath(manifest, colliders, boundedStart, reversed, radius)]);
      return storePath(cache, startKey, targetKey, smoothed);
    }

    closed[current] = 1;
    expansions += 1;
    const currentG = gScore[current]!;
    const cx = current % columns, cy = Math.floor(current / columns);

    for (const [dx, dy] of DIRECTIONS) {
      const nx = cx + dx, ny = cy + dy;
      if (!cellFree(manifest, cache, colliders, nx, ny, radius)) continue;
      if (dx !== 0 && dy !== 0
        && (!cellFree(manifest, cache, colliders, nx, cy, radius) || !cellFree(manifest, cache, colliders, cx, ny, radius))) {
        continue;
      }
      const next = ny * columns + nx;
      touch(next);
      if (closed[next]) continue;
      const speed = cache.uniformSurface ? 1 : studioSemanticSurfaceAt(manifest, cellPoint(manifest, lattice, next, radius)).speedMultiplier;
      const tentative = currentG + (dx !== 0 && dy !== 0 ? SQRT2 : 1) * (1 / Math.max(.35, speed));
      if (tentative >= gScore[next]!) continue;
      cameFrom[next] = current;
      gScore[next] = tentative;
      const score = tentative + Math.hypot(targetX - nx, targetY - ny);
      fScore[next] = score;
      heap.push(next, score);
    }
  }

  return storePath(cache, startKey, targetKey, EMPTY_PATH);
}

/** 클릭-투-무브 경로 재계산 최소 간격(ms). */
export const STUDIO_WORLD_REPLAN_INTERVAL_MS = 350;

/**
 * 목적지 주변이 막혔거나 혼잡하면 대체 도착점을 찾는다.
 * 목표 지점 자체가 점유 불가능하면 점점 넓은 링을 탐색해 가장 가깝고 목표가 보이는(line-of-sight)
 * 지점을 돌려준다. 가구 뒤가 아니라 가구 앞(목표가 보이는 쪽)에 멈추도록 가시성을 먼저 본다.
 */
export function resolveStudioWorldArrivalPoint(
  manifest: StudioVirtualSpaceWorldManifest,
  target: StudioVirtualSpacePoint,
  radius = DEFAULT_RADIUS,
): StudioVirtualSpacePoint | null {
  if (![target.x, target.y, radius].every(Number.isFinite) || radius <= 0) return null;
  const colliders = studioWorldCollisionRects(manifest);
  const bounded = clampStudioWorldPoint(manifest, target, radius);
  if (canOccupyWithColliders(manifest, colliders, bounded, radius)) return bounded;

  const { grid } = cacheFor(manifest, radius).lattice;
  const gx = Math.round(bounded.x / grid);
  const gy = Math.round(bounded.y / grid);
  type Candidate = { readonly point: StudioVirtualSpacePoint; readonly gx: number; readonly gy: number };
  const visible: Candidate[] = [];
  const hidden: Candidate[] = [];
  for (let ring = 1; ring <= 32; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = (gx + dx) * grid, y = (gy + dy) * grid;
        if (x < 0 || y < 0 || x > manifest.width || y > manifest.height) continue;
        const point = clampStudioWorldPoint(manifest, { x, y }, radius);
        if (!canOccupyWithColliders(manifest, colliders, point, radius)) continue;
        (lineWalkable(manifest, colliders, point, bounded, radius) ? visible : hidden).push({ point, gx: gx + dx, gy: gy + dy });
      }
    }
    if (visible.length > 0 || hidden.length > 0) {
      const bucket = visible.length > 0 ? visible : hidden;
      bucket.sort((left, right) => (
        Math.hypot(left.point.x - bounded.x, left.point.y - bounded.y)
        - Math.hypot(right.point.x - bounded.x, right.point.y - bounded.y)
      ) || left.gy - right.gy || left.gx - right.gx);
      return bucket[0]!.point;
    }
  }
  return null;
}

/** 경로 재계산 스로틀 요청. */
export interface StudioWorldReplanRequest {
  /** 마지막으로 경로를 계산한 시각(ms). */
  readonly lastPlanAt: number;
  /** 현재 시각(ms). */
  readonly now: number;
  /** 목적지 자체가 바뀌었는지. */
  readonly targetChanged: boolean;
  /** 목적지가 마지막 계산 이후 움직인 거리(px). */
  readonly targetMovedPx: number;
  /** 최소 재계산 간격(ms). 기본 STUDIO_WORLD_REPLAN_INTERVAL_MS. */
  readonly intervalMs?: number;
}

/**
 * 경로를 다시 계산해야 하는지 판단한다(스로틀).
 * 목적지가 바뀌었거나 4칸(24px) 넘게 움직였으면(따라가기 등) 즉시, 그 외에는 최소 간격이 지났을 때만.
 */
export function shouldReplanStudioWorldPath(request: StudioWorldReplanRequest): boolean {
  if (request.targetChanged) return true;
  if (Number.isFinite(request.targetMovedPx) && request.targetMovedPx > 24) return true;
  const interval = Number.isFinite(request.intervalMs) && (request.intervalMs ?? 0) > 0
    ? request.intervalMs!
    : STUDIO_WORLD_REPLAN_INTERVAL_MS;
  if (!Number.isFinite(request.now) || !Number.isFinite(request.lastPlanAt)) return true;
  return request.now - request.lastPlanAt >= interval;
}

/** Validate both remembered positions and map spawns. Fail closed if no floor exists. */
export function resolveStudioWorldSpawn(
  manifest: StudioVirtualSpaceWorldManifest,
  preferred: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint | null {
  const colliders = studioWorldCollisionRects(manifest);
  const candidates = [preferred, ...manifest.spawns.map((spawn) => spawn.point), { x: manifest.width / 2, y: manifest.height / 2 }];
  for (const candidate of candidates) {
    if (![candidate.x, candidate.y].every(Number.isFinite)) continue;
    const bounded = clampStudioWorldPoint(manifest, candidate);
    if (canOccupyWithColliders(manifest, colliders, bounded, DEFAULT_RADIUS)) return bounded;
    const nearby = nearestWalkableCell(manifest, colliders, bounded, DEFAULT_RADIUS);
    if (nearby !== null) return cellPoint(manifest, cacheFor(manifest, DEFAULT_RADIUS).lattice, nearby, DEFAULT_RADIUS);
  }
  // Bounded emergency scan only; never start inside geometry or teleport through it while walking.
  const grid = studioWorldNavigationLattice(manifest).grid;
  const dx = Math.max(grid, manifest.width / 64), dy = Math.max(grid, manifest.height / 64);
  for (let y = DEFAULT_RADIUS; y <= manifest.height - DEFAULT_RADIUS; y += dy) {
    for (let x = DEFAULT_RADIUS; x <= manifest.width - DEFAULT_RADIUS; x += dx) {
      if (canOccupyWithColliders(manifest, colliders, { x, y }, DEFAULT_RADIUS)) return { x, y };
    }
  }
  return null;
}
