import {
  STUDIO_VIRTUAL_SPACE_HEIGHT,
  STUDIO_VIRTUAL_SPACE_WIDTH,
  clampStudioVirtualSpacePoint,
  type StudioVirtualSpacePoint,
} from "./studio-virtual-space-model";

export const STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS = 10;
export const STUDIO_VIRTUAL_SPACE_WALK_SPEED = 205;
export const STUDIO_VIRTUAL_SPACE_CLICK_STOP_DISTANCE = 8;

export interface StudioVirtualSpaceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly kind: "wall" | "furniture";
}

const WALL = 9;
const DOOR = 72;

function horizontalWall(
  x: number,
  y: number,
  width: number,
  openingCenter?: number,
): readonly StudioVirtualSpaceRect[] {
  if (openingCenter == null) return [{ x, y, width, height: WALL, kind: "wall" }];
  const leftWidth = Math.max(0, openingCenter - DOOR / 2 - x);
  const rightX = openingCenter + DOOR / 2;
  const rightWidth = Math.max(0, x + width - rightX);
  return [
    ...(leftWidth > 0 ? [{ x, y, width: leftWidth, height: WALL, kind: "wall" as const }] : []),
    ...(rightWidth > 0 ? [{ x: rightX, y, width: rightWidth, height: WALL, kind: "wall" as const }] : []),
  ];
}

function verticalWall(
  x: number,
  y: number,
  height: number,
  openingCenter?: number,
): readonly StudioVirtualSpaceRect[] {
  if (openingCenter == null) return [{ x, y, width: WALL, height, kind: "wall" }];
  const topHeight = Math.max(0, openingCenter - DOOR / 2 - y);
  const bottomY = openingCenter + DOOR / 2;
  const bottomHeight = Math.max(0, y + height - bottomY);
  return [
    ...(topHeight > 0 ? [{ x, y, width: WALL, height: topHeight, kind: "wall" as const }] : []),
    ...(bottomHeight > 0 ? [{ x, y: bottomY, width: WALL, height: bottomHeight, kind: "wall" as const }] : []),
  ];
}

const TOP_ROOMS = [
  { x: 32, y: 32, width: 340, height: 190 },
  { x: 390, y: 32, width: 330, height: 190 },
  { x: 738, y: 32, width: 410, height: 190 },
] as const;

const MIDDLE_ROOMS = [
  { x: 32, y: 250, width: 310, height: 190 },
  { x: 838, y: 250, width: 310, height: 190 },
] as const;

const BOTTOM_ROOMS = [
  { x: 32, y: 462, width: 430, height: 226 },
  { x: 718, y: 462, width: 430, height: 226 },
] as const;

const roomWalls: StudioVirtualSpaceRect[] = [];
for (const room of TOP_ROOMS) {
  roomWalls.push(
    ...horizontalWall(room.x, room.y, room.width),
    ...horizontalWall(room.x, room.y + room.height - WALL, room.width, room.x + room.width / 2),
    ...verticalWall(room.x, room.y, room.height),
    ...verticalWall(room.x + room.width - WALL, room.y, room.height),
  );
}
for (const room of MIDDLE_ROOMS) {
  roomWalls.push(
    ...horizontalWall(room.x, room.y, room.width, room.x + room.width / 2),
    ...horizontalWall(room.x, room.y + room.height - WALL, room.width, room.x + room.width / 2),
    ...verticalWall(room.x, room.y, room.height),
    ...verticalWall(room.x + room.width - WALL, room.y, room.height),
  );
}
for (const room of BOTTOM_ROOMS) {
  roomWalls.push(
    ...horizontalWall(room.x, room.y, room.width, room.x + room.width / 2),
    ...horizontalWall(room.x, room.y + room.height - WALL, room.width),
    ...verticalWall(room.x, room.y, room.height),
    ...verticalWall(room.x + room.width - WALL, room.y, room.height),
  );
}

const furniture: readonly StudioVirtualSpaceRect[] = [
  // Reference-layout footprints: warm room furniture stays solid while the central plaza remains walkable around its ring.
  { x: 70, y: 132, width: 190, height: 48, kind: "furniture" },
  { x: 452, y: 135, width: 190, height: 48, kind: "furniture" },
  { x: 870, y: 118, width: 230, height: 62, kind: "furniture" },
  { x: 68, y: 336, width: 185, height: 56, kind: "furniture" },
  { x: 914, y: 334, width: 184, height: 58, kind: "furniture" },
  { x: 95, y: 586, width: 260, height: 64, kind: "furniture" },
  { x: 794, y: 582, width: 266, height: 68, kind: "furniture" },
  { x: 520, y: 302, width: 140, height: 118, kind: "furniture" },
];

export const STUDIO_VIRTUAL_SPACE_COLLIDERS: readonly StudioVirtualSpaceRect[] = Object.freeze([
  ...roomWalls,
  ...furniture,
]);

function circleIntersectsRect(
  point: StudioVirtualSpacePoint,
  radius: number,
  rect: StudioVirtualSpaceRect,
): boolean {
  const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
  const dx = point.x - nearestX;
  const dy = point.y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

export function studioVirtualSpaceCanOccupy(
  point: StudioVirtualSpacePoint,
  radius = STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS,
): boolean {
  if (
    point.x < radius
    || point.y < radius
    || point.x > STUDIO_VIRTUAL_SPACE_WIDTH - radius
    || point.y > STUDIO_VIRTUAL_SPACE_HEIGHT - radius
  ) {
    return false;
  }
  return !STUDIO_VIRTUAL_SPACE_COLLIDERS.some((rect) => circleIntersectsRect(point, radius, rect));
}

export function resolveStudioVirtualSpaceMovement(
  current: StudioVirtualSpacePoint,
  delta: StudioVirtualSpacePoint,
): StudioVirtualSpacePoint {
  const boundedTarget = clampStudioVirtualSpacePoint({
    x: current.x + delta.x,
    y: current.y + delta.y,
  });
  if (studioVirtualSpaceCanOccupy(boundedTarget)) return boundedTarget;

  const xOnly = clampStudioVirtualSpacePoint({ x: current.x + delta.x, y: current.y });
  if (studioVirtualSpaceCanOccupy(xOnly)) return xOnly;

  const yOnly = clampStudioVirtualSpacePoint({ x: current.x, y: current.y + delta.y });
  if (studioVirtualSpaceCanOccupy(yOnly)) return yOnly;

  return clampStudioVirtualSpacePoint(current);
}

export function normalizeStudioVirtualSpaceVector(
  x: number,
  y: number,
): StudioVirtualSpacePoint {
  const length = Math.hypot(x, y);
  if (length <= 0.0001) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
}

export function studioVirtualSpaceStepToward(
  current: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
  maxDistance: number,
): StudioVirtualSpacePoint {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= STUDIO_VIRTUAL_SPACE_CLICK_STOP_DISTANCE) return current;
  const amount = Math.min(Math.max(0, maxDistance), distance);
  const direction = normalizeStudioVirtualSpaceVector(dx, dy);
  return resolveStudioVirtualSpaceMovement(current, {
    x: direction.x * amount,
    y: direction.y * amount,
  });
}

const PATH_GRID = 20;
const PATH_MAX_EXPANSIONS = 4_000;
const PATH_MIN_GX = Math.ceil(STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS / PATH_GRID);
const PATH_MIN_GY = Math.ceil(STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS / PATH_GRID);
const PATH_MAX_GX = Math.floor((STUDIO_VIRTUAL_SPACE_WIDTH - STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS) / PATH_GRID);
const PATH_MAX_GY = Math.floor((STUDIO_VIRTUAL_SPACE_HEIGHT - STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS) / PATH_GRID);

interface PathNode {
  readonly gx: number;
  readonly gy: number;
  readonly point: StudioVirtualSpacePoint;
}

function pathKey(gx: number, gy: number): string {
  return `${gx}:${gy}`;
}

function pathNode(gx: number, gy: number): PathNode {
  return {
    gx,
    gy,
    point: {
      x: Math.min(STUDIO_VIRTUAL_SPACE_WIDTH - STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS, Math.max(STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS, gx * PATH_GRID)),
      y: Math.min(STUDIO_VIRTUAL_SPACE_HEIGHT - STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS, Math.max(STUDIO_VIRTUAL_SPACE_PLAYER_RADIUS, gy * PATH_GRID)),
    },
  };
}

function nearestWalkablePathNode(point: StudioVirtualSpacePoint): PathNode | null {
  const baseX = Math.round(point.x / PATH_GRID);
  const baseY = Math.round(point.y / PATH_GRID);
  for (let radius = 0; radius <= 5; radius += 1) {
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (radius > 0 && Math.max(Math.abs(offsetX), Math.abs(offsetY)) !== radius) continue;
        const candidate = pathNode(baseX + offsetX, baseY + offsetY);
        if (studioVirtualSpaceCanOccupy(candidate.point)) return candidate;
      }
    }
  }
  return null;
}

export function findStudioVirtualSpacePath(
  start: StudioVirtualSpacePoint,
  target: StudioVirtualSpacePoint,
): readonly StudioVirtualSpacePoint[] {
  const startNode = nearestWalkablePathNode(start);
  const targetNode = nearestWalkablePathNode(target);
  if (!startNode || !targetNode) return [];

  const startKey = pathKey(startNode.gx, startNode.gy);
  const targetKey = pathKey(targetNode.gx, targetNode.gy);
  if (startKey === targetKey) {
    return studioVirtualSpaceCanOccupy(target) ? [target] : [targetNode.point];
  }

  const open = new Map<string, PathNode>([[startKey, startNode]]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[
    startKey,
    Math.hypot(targetNode.gx - startNode.gx, targetNode.gy - startNode.gy),
  ]]);

  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ] as const;

  let expansions = 0;
  while (open.size > 0 && expansions < PATH_MAX_EXPANSIONS) {
    expansions += 1;
    let currentKey: string | null = null;
    let currentNode: PathNode | null = null;
    let currentF = Number.POSITIVE_INFINITY;
    for (const [key, node] of open) {
      const score = fScore.get(key) ?? Number.POSITIVE_INFINITY;
      if (score < currentF) {
        currentF = score;
        currentKey = key;
        currentNode = node;
      }
    }
    if (!currentKey || !currentNode) break;

    if (currentKey === targetKey) {
      const reversed: StudioVirtualSpacePoint[] = [targetNode.point];
      let cursor = currentKey;
      while (cameFrom.has(cursor)) {
        cursor = cameFrom.get(cursor)!;
        if (cursor === startKey) break;
        const [gx, gy] = cursor.split(":").map(Number);
        reversed.push(pathNode(gx, gy).point);
      }
      reversed.reverse();
      if (studioVirtualSpaceCanOccupy(target)) reversed.push(target);
      return Object.freeze(reversed);
    }

    open.delete(currentKey);
    const currentG = gScore.get(currentKey) ?? Number.POSITIVE_INFINITY;

    for (const [dx, dy] of directions) {
      const nextGx = currentNode.gx + dx;
      const nextGy = currentNode.gy + dy;
      if (
        nextGx < PATH_MIN_GX
        || nextGy < PATH_MIN_GY
        || nextGx > PATH_MAX_GX
        || nextGy > PATH_MAX_GY
      ) {
        continue;
      }
      const neighbor = pathNode(nextGx, nextGy);
      if (!studioVirtualSpaceCanOccupy(neighbor.point)) continue;
      if (dx !== 0 && dy !== 0) {
        const horizontal = pathNode(currentNode.gx + dx, currentNode.gy);
        const vertical = pathNode(currentNode.gx, currentNode.gy + dy);
        if (!studioVirtualSpaceCanOccupy(horizontal.point) || !studioVirtualSpaceCanOccupy(vertical.point)) continue;
      }

      const neighborKey = pathKey(neighbor.gx, neighbor.gy);
      const tentative = currentG + Math.hypot(dx, dy);
      if (tentative >= (gScore.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;

      cameFrom.set(neighborKey, currentKey);
      gScore.set(neighborKey, tentative);
      fScore.set(
        neighborKey,
        tentative + Math.hypot(targetNode.gx - neighbor.gx, targetNode.gy - neighbor.gy),
      );
      open.set(neighborKey, neighbor);
    }
  }

  return [];
}
