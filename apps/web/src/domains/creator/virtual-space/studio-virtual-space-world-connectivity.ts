export interface StudioWorldConnectivityPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioWorldConnectivityRect extends StudioWorldConnectivityPoint {
  readonly width: number;
  readonly height: number;
}

export interface StudioWorldConnectivityBounds {
  readonly width: number;
  readonly height: number;
}

const CONNECTIVITY_GRID = 6;
const MAX_CONNECTIVITY_EXPANSIONS = 30_000;
const MAX_VALIDATION_EXPANSIONS = MAX_CONNECTIVITY_EXPANSIONS * 4;

export function studioWorldCircleCanOccupy(
  bounds: StudioWorldConnectivityBounds,
  colliders: readonly StudioWorldConnectivityRect[],
  point: StudioWorldConnectivityPoint,
  radius: number,
): boolean {
  if (
    !Number.isFinite(point.x) || !Number.isFinite(point.y)
    || point.x < radius || point.y < radius
    || point.x > bounds.width - radius || point.y > bounds.height - radius
  ) return false;

  return !colliders.some((rect) => {
    const nearestX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width));
    const nearestY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height));
    const dx = point.x - nearestX;
    const dy = point.y - nearestY;
    return dx * dx + dy * dy < radius * radius;
  });
}

export function studioWorldLineCanOccupy(
  bounds: StudioWorldConnectivityBounds,
  colliders: readonly StudioWorldConnectivityRect[],
  from: StudioWorldConnectivityPoint,
  to: StudioWorldConnectivityPoint,
  radius: number,
): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / CONNECTIVITY_GRID));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    if (!studioWorldCircleCanOccupy(bounds, colliders, {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    }, radius)) return false;
  }
  return true;
}

interface ConnectivityNode {
  readonly gx: number;
  readonly gy: number;
  readonly point: StudioWorldConnectivityPoint;
}

function connectivityNode(
  bounds: StudioWorldConnectivityBounds,
  gx: number,
  gy: number,
  radius: number,
): ConnectivityNode {
  return {
    gx,
    gy,
    point: {
      x: Math.max(radius, Math.min(bounds.width - radius, gx * CONNECTIVITY_GRID)),
      y: Math.max(radius, Math.min(bounds.height - radius, gy * CONNECTIVITY_GRID)),
    },
  };
}

function nearestConnectedNode(
  bounds: StudioWorldConnectivityBounds,
  colliders: readonly StudioWorldConnectivityRect[],
  point: StudioWorldConnectivityPoint,
  radius: number,
): ConnectivityNode | null {
  const centerX = Math.round(point.x / CONNECTIVITY_GRID);
  const centerY = Math.round(point.y / CONNECTIVITY_GRID);
  for (let ring = 0; ring <= 16; ring += 1) {
    const candidates: ConnectivityNode[] = [];
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const gx = centerX + dx;
        const gy = centerY + dy;
        if (gx * CONNECTIVITY_GRID < 0 || gy * CONNECTIVITY_GRID < 0
          || gx * CONNECTIVITY_GRID > bounds.width || gy * CONNECTIVITY_GRID > bounds.height) continue;
        const node = connectivityNode(bounds, gx, gy, radius);
        if (studioWorldCircleCanOccupy(bounds, colliders, node.point, radius)
          && studioWorldLineCanOccupy(bounds, colliders, point, node.point, radius)) {
          candidates.push(node);
        }
      }
    }
    if (candidates.length > 0) {
      candidates.sort((left, right) => (
        Math.hypot(left.point.x - point.x, left.point.y - point.y)
        - Math.hypot(right.point.x - point.x, right.point.y - point.y)
      ) || left.gy - right.gy || left.gx - right.gx);
      return candidates[0]!;
    }
  }
  return null;
}

/** Mirrors the runtime grid/corner rules so authored patrol legs cannot be accepted but never run. */
const CONNECTIVITY_DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
] as const;

function connectivityKey(node: Pick<ConnectivityNode, "gx" | "gy">): string {
  return `${node.gx}:${node.gy}`;
}

export class StudioWorldConnectivityIndex {
  private readonly componentByKey = new Map<string, number>();
  private readonly pairResults = new Map<string, boolean>();
  private remainingExpansions = MAX_VALIDATION_EXPANSIONS;
  private nextComponent = 1;
  private searches = 0;
  private exceeded = false;
  private readonly canFullyIndex: boolean;

  constructor(
    private readonly bounds: StudioWorldConnectivityBounds,
    private readonly colliders: readonly StudioWorldConnectivityRect[],
    private readonly radius: number,
  ) {
    const columns = Math.floor(bounds.width / CONNECTIVITY_GRID) + 1;
    const rows = Math.floor(bounds.height / CONNECTIVITY_GRID) + 1;
    this.canFullyIndex = columns * rows <= MAX_CONNECTIVITY_EXPANSIONS;
  }

  get searchCount(): number {
    return this.searches;
  }

  get budgetExceeded(): boolean {
    return this.exceeded;
  }

  private neighbors(current: ConnectivityNode): readonly ConnectivityNode[] {
    const result: ConnectivityNode[] = [];
    for (const [dx, dy] of CONNECTIVITY_DIRECTIONS) {
      const gx = current.gx + dx;
      const gy = current.gy + dy;
      if (gx * CONNECTIVITY_GRID < 0 || gy * CONNECTIVITY_GRID < 0
        || gx * CONNECTIVITY_GRID > this.bounds.width || gy * CONNECTIVITY_GRID > this.bounds.height) continue;
      const next = connectivityNode(this.bounds, gx, gy, this.radius);
      if (!studioWorldCircleCanOccupy(this.bounds, this.colliders, next.point, this.radius)) continue;
      if (dx !== 0 && dy !== 0) {
        const horizontal = connectivityNode(this.bounds, current.gx + dx, current.gy, this.radius);
        const vertical = connectivityNode(this.bounds, current.gx, current.gy + dy, this.radius);
        if (!studioWorldCircleCanOccupy(this.bounds, this.colliders, horizontal.point, this.radius)
          || !studioWorldCircleCanOccupy(this.bounds, this.colliders, vertical.point, this.radius)) continue;
      }
      result.push(next);
    }
    return result;
  }

  private spendExpansion(): boolean {
    if (this.remainingExpansions <= 0) {
      this.exceeded = true;
      return false;
    }
    this.remainingExpansions -= 1;
    return true;
  }

  private indexComponent(start: ConnectivityNode): number | null {
    const existing = this.componentByKey.get(connectivityKey(start));
    if (existing !== undefined) return existing;
    this.searches += 1;
    const queue = [start];
    const visited = new Set<string>([connectivityKey(start)]);
    let cursor = 0;
    while (cursor < queue.length) {
      if (!this.spendExpansion()) return null;
      const current = queue[cursor++]!;
      for (const next of this.neighbors(current)) {
        const key = connectivityKey(next);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push(next);
      }
    }
    const component = this.nextComponent++;
    for (const key of visited) this.componentByKey.set(key, component);
    return component;
  }

  private searchPair(start: ConnectivityNode, target: ConnectivityNode): boolean {
    const startKey = connectivityKey(start);
    const targetKey = connectivityKey(target);
    const pairKey = startKey < targetKey ? `${startKey}|${targetKey}` : `${targetKey}|${startKey}`;
    const cached = this.pairResults.get(pairKey);
    if (cached !== undefined) return cached;
    this.searches += 1;
    const queue = [start];
    const visited = new Set<string>([startKey]);
    let cursor = 0;
    while (cursor < queue.length && cursor < MAX_CONNECTIVITY_EXPANSIONS) {
      if (!this.spendExpansion()) return false;
      const current = queue[cursor++]!;
      if (connectivityKey(current) === targetKey) {
        this.pairResults.set(pairKey, true);
        return true;
      }
      for (const next of this.neighbors(current)) {
        const key = connectivityKey(next);
        if (visited.has(key)) continue;
        visited.add(key);
        queue.push(next);
      }
    }
    if (cursor >= MAX_CONNECTIVITY_EXPANSIONS) this.exceeded = true;
    this.pairResults.set(pairKey, false);
    return false;
  }

  connected(from: StudioWorldConnectivityPoint, to: StudioWorldConnectivityPoint): boolean {
    this.exceeded = false;
    if (!studioWorldCircleCanOccupy(this.bounds, this.colliders, from, this.radius)
      || !studioWorldCircleCanOccupy(this.bounds, this.colliders, to, this.radius)) return false;
    if (studioWorldLineCanOccupy(this.bounds, this.colliders, from, to, this.radius)) return true;
    const start = nearestConnectedNode(this.bounds, this.colliders, from, this.radius);
    const target = nearestConnectedNode(this.bounds, this.colliders, to, this.radius);
    if (!start || !target) return false;
    if (connectivityKey(start) === connectivityKey(target)) return true;
    if (!this.canFullyIndex) return this.searchPair(start, target);
    const startComponent = this.indexComponent(start);
    if (startComponent === null) return false;
    const targetComponent = this.componentByKey.get(connectivityKey(target))
      ?? this.indexComponent(target);
    return targetComponent !== null && startComponent === targetComponent;
  }
}

export function studioWorldPointsConnected(
  bounds: StudioWorldConnectivityBounds,
  colliders: readonly StudioWorldConnectivityRect[],
  from: StudioWorldConnectivityPoint,
  to: StudioWorldConnectivityPoint,
  radius: number,
): boolean {
  return new StudioWorldConnectivityIndex(bounds, colliders, radius).connected(from, to);
}
