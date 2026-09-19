import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import {
  studioWorldCollisionRects,
  type StudioVirtualSpaceWorldManifest,
  type StudioWorldRect,
} from "./studio-virtual-space-world-manifest";
import {
  studioWorldCircleCanOccupy,
  studioWorldLineCanOccupy,
} from "./studio-virtual-space-world-connectivity";

const GRID = 6;
const MAX_EXPANSIONS = 30_000;
export const STUDIO_WORLD_PLAYER_RADIUS = 9;
const DEFAULT_RADIUS = STUDIO_WORLD_PLAYER_RADIUS;

function canOccupyWithColliders(
  manifest: StudioVirtualSpaceWorldManifest,
  colliders: readonly StudioWorldRect[],
  point: StudioVirtualSpacePoint,
  radius: number,
): boolean {
  return studioWorldCircleCanOccupy(manifest, colliders, point, radius);
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
  return studioWorldLineCanOccupy(manifest, colliders, from, to, radius);
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

interface Node {
  readonly gx: number;
  readonly gy: number;
  readonly point: StudioVirtualSpacePoint;
}

interface HeapEntry {
  readonly key: string;
  readonly node: Node;
  readonly score: number;
}

class MinHeap {
  private readonly items: HeapEntry[] = [];

  get size(): number {
    return this.items.length;
  }

  push(entry: HeapEntry): void {
    this.items.push(entry);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent]!.score <= entry.score) break;
      this.items[index] = this.items[parent]!;
      index = parent;
    }
    this.items[index] = entry;
  }

  pop(): HeapEntry | null {
    if (this.items.length === 0) return null;
    const root = this.items[0]!;
    const last = this.items.pop()!;
    if (this.items.length === 0) return root;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;
      const child = right < this.items.length
        && this.items[right]!.score < this.items[left]!.score
        ? right
        : left;
      if (this.items[child]!.score >= last.score) break;
      this.items[index] = this.items[child]!;
      index = child;
    }
    this.items[index] = last;
    return root;
  }
}

function nodeKey(gx: number, gy: number): string {
  return `${gx}:${gy}`;
}

function createNode(
  manifest: StudioVirtualSpaceWorldManifest,
  gx: number,
  gy: number,
  radius: number,
): Node {
  return {
    gx,
    gy,
    point: clampStudioWorldPoint(manifest, { x: gx * GRID, y: gy * GRID }, radius),
  };
}

function nearestWalkableNode(
  manifest: StudioVirtualSpaceWorldManifest,
  colliders: readonly StudioWorldRect[],
  point: StudioVirtualSpacePoint,
  radius: number,
  requireConnection = false,
  preferNear: StudioVirtualSpacePoint = point,
): Node | null {
  const gx = Math.round(point.x / GRID);
  const gy = Math.round(point.y / GRID);
  for (let ring = 0; ring <= 16; ring += 1) {
    const candidates: Node[] = [];
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        if ((gx + dx) * GRID < 0 || (gy + dy) * GRID < 0
          || (gx + dx) * GRID > manifest.width || (gy + dy) * GRID > manifest.height) continue;
        const node = createNode(manifest, gx + dx, gy + dy, radius);
        if (canOccupyWithColliders(manifest, colliders, node.point, radius)
          && (!requireConnection || lineWalkable(manifest, colliders, point, node.point, radius))) {
          candidates.push(node);
        }
      }
    }
    if (candidates.length > 0) {
      candidates.sort((left, right) => (
        Math.hypot(left.point.x - preferNear.x, left.point.y - preferNear.y)
        - Math.hypot(right.point.x - preferNear.x, right.point.y - preferNear.y)
      ) || left.gy - right.gy || left.gx - right.gx);
      return candidates[0]!;
    }
  }
  return null;
}

export function findStudioWorldPath(
  manifest: StudioVirtualSpaceWorldManifest,
  start: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  radius = DEFAULT_RADIUS,
): readonly StudioVirtualSpacePoint[] {
  if (![start.x, start.y, target.x, target.y, radius].every(Number.isFinite) || radius <= 0) return [];
  const colliders = studioWorldCollisionRects(manifest);
  const boundedStart = clampStudioWorldPoint(manifest, start, radius);
  const boundedTarget = clampStudioWorldPoint(manifest, target, radius);

  if (!canOccupyWithColliders(manifest, colliders, boundedStart, radius)) return [];
  if (lineWalkable(manifest, colliders, boundedStart, boundedTarget, radius)) {
    return [boundedTarget];
  }

  const startNode = nearestWalkableNode(manifest, colliders, boundedStart, radius, true);
  const targetNode = nearestWalkableNode(
    manifest,
    colliders,
    boundedTarget,
    radius,
    canOccupyWithColliders(manifest, colliders, boundedTarget, radius),
    boundedStart,
  );
  if (!startNode || !targetNode) return [];

  const startKey = nodeKey(startNode.gx, startNode.gy);
  const targetKey = nodeKey(targetNode.gx, targetNode.gy);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>();
  const closed = new Set<string>();
  const open = new MinHeap();
  const startF = Math.hypot(targetNode.gx - startNode.gx, targetNode.gy - startNode.gy);
  fScore.set(startKey, startF);
  open.push({ key: startKey, node: startNode, score: startF });

  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ] as const;

  let expansions = 0;
  while (open.size > 0 && expansions < MAX_EXPANSIONS) {
    const entry = open.pop();
    if (!entry) break;
    if (closed.has(entry.key)) continue;
    if (entry.score > (fScore.get(entry.key) ?? Number.POSITIVE_INFINITY) + 1e-9) continue;

    const currentKey = entry.key;
    const current = entry.node;
    if (currentKey === targetKey) {
      const reversed: StudioVirtualSpacePoint[] = [targetNode.point];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        if (cursor === startKey) break;
        const [gx, gy] = cursor.split(":").map(Number);
        reversed.push(createNode(manifest, gx!, gy!, radius).point);
      }
      reversed.reverse();
      if (canOccupyWithColliders(manifest, colliders, boundedTarget, radius)
        && lineWalkable(manifest, colliders, targetNode.point, boundedTarget, radius)) {
        reversed.push(boundedTarget);
      }
      return smoothPath(manifest, colliders, boundedStart, reversed, radius);
    }

    closed.add(currentKey);
    expansions += 1;
    const currentG = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY;

    for (const [dx, dy] of directions) {
      if ((current.gx + dx) * GRID < 0 || (current.gy + dy) * GRID < 0
        || (current.gx + dx) * GRID > manifest.width || (current.gy + dy) * GRID > manifest.height) continue;
      const next = createNode(manifest, current.gx + dx, current.gy + dy, radius);
      if (!canOccupyWithColliders(manifest, colliders, next.point, radius)) continue;

      if (dx !== 0 && dy !== 0) {
        const horizontal = createNode(manifest, current.gx + dx, current.gy, radius);
        const vertical = createNode(manifest, current.gx, current.gy + dy, radius);
        if (
          !canOccupyWithColliders(manifest, colliders, horizontal.point, radius)
          || !canOccupyWithColliders(manifest, colliders, vertical.point, radius)
        ) {
          continue;
        }
      }

      const key = nodeKey(next.gx, next.gy);
      if (closed.has(key)) continue;
      const tentative = currentG + Math.hypot(dx, dy);
      if (tentative >= (gScore.get(key) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(key, currentKey);
      gScore.set(key, tentative);
      const score = tentative + Math.hypot(targetNode.gx - next.gx, targetNode.gy - next.gy);
      fScore.set(key, score);
      open.push({ key, node: next, score });
    }
  }

  return [];
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
    const nearby = nearestWalkableNode(manifest, colliders, bounded, DEFAULT_RADIUS);
    if (nearby) return nearby.point;
  }
  // Bounded emergency scan only; never start inside geometry or teleport through it while walking.
  const dx = Math.max(GRID, manifest.width / 64), dy = Math.max(GRID, manifest.height / 64);
  for (let y = DEFAULT_RADIUS; y <= manifest.height - DEFAULT_RADIUS; y += dy) {
    for (let x = DEFAULT_RADIUS; x <= manifest.width - DEFAULT_RADIUS; x += dx) {
      if (canOccupyWithColliders(manifest, colliders, { x, y }, DEFAULT_RADIUS)) return { x, y };
    }
  }
  return null;
}
