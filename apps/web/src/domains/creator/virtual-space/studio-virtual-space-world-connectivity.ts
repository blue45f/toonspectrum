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

/** 작은 월드(960×640·1280×960)는 기존 6px 격자를 그대로 쓴다. */
const MIN_NAVIGATION_GRID = 6;
/** 월드 전체 격자 셀 수가 이 값을 넘지 않게 격자 간격을 넓힌다. */
const TARGET_NAVIGATION_CELLS = 40_000;
/** 선분 충돌 표본 간격. 격자 간격과 무관하게 얇은 벽을 건너뛰지 않게 고정한다. */
const LINE_SAMPLE_STEP = 6;
const MAX_CONNECTIVITY_EXPANSIONS = 40_000;
const MAX_VALIDATION_EXPANSIONS = MAX_CONNECTIVITY_EXPANSIONS * 4;
/** 충돌체 공간 해시 버킷 크기(px). */
const COLLIDER_BUCKET = 128;
/** 이보다 적은 충돌체는 해시보다 선형 탐색이 빠르다. */
const COLLIDER_HASH_THRESHOLD = 24;

/**
 * 경로 탐색(pathfinding)과 연결성 검증(connectivity)이 함께 쓰는 격자 간격.
 * max(6, ceil(sqrt(width × height / 40000))) — 3072×1920 캠퍼스는 13px, 약 3.5만 셀이다.
 */
export function studioWorldNavigationGrid(width: number, height: number): number {
  const area = Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, width) * Math.max(0, height) : 0;
  return Math.max(MIN_NAVIGATION_GRID, Math.ceil(Math.sqrt(area / TARGET_NAVIGATION_CELLS)));
}

export interface StudioWorldNavigationLattice {
  readonly grid: number;
  readonly columns: number;
  readonly rows: number;
  readonly cells: number;
}

const LATTICE_CACHE = new WeakMap<StudioWorldConnectivityBounds, StudioWorldNavigationLattice>();

/** manifest(또는 bounds) 객체별로 격자 크기를 캐시한다. */
export function studioWorldNavigationLattice(bounds: StudioWorldConnectivityBounds): StudioWorldNavigationLattice {
  const cached = LATTICE_CACHE.get(bounds);
  if (cached && cached.grid === studioWorldNavigationGrid(bounds.width, bounds.height)) return cached;
  const grid = studioWorldNavigationGrid(bounds.width, bounds.height);
  const columns = Math.floor(Math.max(0, bounds.width) / grid) + 1;
  const rows = Math.floor(Math.max(0, bounds.height) / grid) + 1;
  const lattice = Object.freeze({ grid, columns, rows, cells: columns * rows });
  LATTICE_CACHE.set(bounds, lattice);
  return lattice;
}

interface ColliderHash {
  readonly buckets: Map<number, number[]>;
}

const COLLIDER_HASHES = new WeakMap<readonly StudioWorldConnectivityRect[], ColliderHash>();

function bucketKey(bx: number, by: number): number {
  // 월드 최대 10000px → 버킷 좌표는 0~79. 음수 방지 오프셋을 두고 하나의 정수로 묶는다.
  return (bx + 64) * 4096 + (by + 64);
}

function colliderHash(colliders: readonly StudioWorldConnectivityRect[]): ColliderHash {
  const cached = COLLIDER_HASHES.get(colliders);
  if (cached) return cached;
  const buckets = new Map<number, number[]>();
  colliders.forEach((rect, index) => {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return;
    const minX = Math.floor(rect.x / COLLIDER_BUCKET), maxX = Math.floor((rect.x + rect.width) / COLLIDER_BUCKET);
    const minY = Math.floor(rect.y / COLLIDER_BUCKET), maxY = Math.floor((rect.y + rect.height) / COLLIDER_BUCKET);
    for (let by = minY; by <= maxY; by += 1) {
      for (let bx = minX; bx <= maxX; bx += 1) {
        const key = bucketKey(bx, by);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(index); else buckets.set(key, [index]);
      }
    }
  });
  const hash = { buckets };
  COLLIDER_HASHES.set(colliders, hash);
  return hash;
}

function circleHitsRect(rect: StudioWorldConnectivityRect, x: number, y: number, radiusSquared: number): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radiusSquared;
}

export function studioWorldCircleCanOccupy(
  bounds: StudioWorldConnectivityBounds,
  colliders: readonly StudioWorldConnectivityRect[],
  point: StudioWorldConnectivityPoint,
  radius: number,
): boolean {
  const { x, y } = point;
  if (
    !Number.isFinite(x) || !Number.isFinite(y)
    || x < radius || y < radius
    || x > bounds.width - radius || y > bounds.height - radius
  ) return false;
  const radiusSquared = radius * radius;
  if (colliders.length < COLLIDER_HASH_THRESHOLD) {
    for (const rect of colliders) if (circleHitsRect(rect, x, y, radiusSquared)) return false;
    return true;
  }
  const { buckets } = colliderHash(colliders);
  const minX = Math.floor((x - radius) / COLLIDER_BUCKET), maxX = Math.floor((x + radius) / COLLIDER_BUCKET);
  const minY = Math.floor((y - radius) / COLLIDER_BUCKET), maxY = Math.floor((y + radius) / COLLIDER_BUCKET);
  for (let by = minY; by <= maxY; by += 1) {
    for (let bx = minX; bx <= maxX; bx += 1) {
      const bucket = buckets.get(bucketKey(bx, by));
      if (!bucket) continue;
      for (const index of bucket) if (circleHitsRect(colliders[index]!, x, y, radiusSquared)) return false;
    }
  }
  return true;
}

export function studioWorldLineCanOccupy(
  bounds: StudioWorldConnectivityBounds,
  colliders: readonly StudioWorldConnectivityRect[],
  from: StudioWorldConnectivityPoint,
  to: StudioWorldConnectivityPoint,
  radius: number,
): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / LINE_SAMPLE_STEP));
  for (let index = 1; index <= steps; index += 1) {
    const progress = index / steps;
    if (!studioWorldCircleCanOccupy(bounds, colliders, {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    }, radius)) return false;
  }
  return true;
}

function nodePoint(
  bounds: StudioWorldConnectivityBounds,
  grid: number,
  gx: number,
  gy: number,
  radius: number,
): StudioWorldConnectivityPoint {
  return {
    x: Math.max(radius, Math.min(bounds.width - radius, gx * grid)),
    y: Math.max(radius, Math.min(bounds.height - radius, gy * grid)),
  };
}

/** Mirrors the runtime grid/corner rules so authored patrol legs cannot be accepted but never run. */
const CONNECTIVITY_DIRECTIONS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
  [-1, -1], [-1, 1], [1, -1], [1, 1],
] as const;

const UNKNOWN = 0;
const FREE = 1;
const BLOCKED = 2;

export class StudioWorldConnectivityIndex {
  private readonly lattice: StudioWorldNavigationLattice;
  /** 0 = 미색인, 그 외 = 연결 요소 번호. */
  private readonly componentByCell: Int32Array;
  /** 0 = 모름, 1 = 비어 있음, 2 = 막힘. */
  private readonly occupancy: Uint8Array;
  private readonly pairResults = new Map<number, boolean>();
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
    this.lattice = studioWorldNavigationLattice(bounds);
    this.canFullyIndex = this.lattice.cells <= MAX_CONNECTIVITY_EXPANSIONS;
    this.componentByCell = new Int32Array(this.lattice.cells);
    this.occupancy = new Uint8Array(this.lattice.cells);
  }

  get searchCount(): number {
    return this.searches;
  }

  get budgetExceeded(): boolean {
    return this.exceeded;
  }

  /** 격자 간격(px). 경로 탐색과 같은 값이다. */
  get grid(): number {
    return this.lattice.grid;
  }

  private cellIndex(gx: number, gy: number): number {
    return gy * this.lattice.columns + gx;
  }

  private insideLattice(gx: number, gy: number): boolean {
    return gx >= 0 && gy >= 0 && gx < this.lattice.columns && gy < this.lattice.rows;
  }

  private free(gx: number, gy: number): boolean {
    if (!this.insideLattice(gx, gy)) return false;
    const index = this.cellIndex(gx, gy);
    const known = this.occupancy[index]!;
    if (known !== UNKNOWN) return known === FREE;
    const value = studioWorldCircleCanOccupy(this.bounds, this.colliders,
      nodePoint(this.bounds, this.lattice.grid, gx, gy, this.radius), this.radius);
    this.occupancy[index] = value ? FREE : BLOCKED;
    return value;
  }

  private forEachNeighbor(index: number, visit: (next: number) => void): void {
    const gx = index % this.lattice.columns;
    const gy = Math.floor(index / this.lattice.columns);
    for (const [dx, dy] of CONNECTIVITY_DIRECTIONS) {
      const nx = gx + dx, ny = gy + dy;
      if (!this.free(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!this.free(gx + dx, gy) || !this.free(gx, gy + dy))) continue;
      visit(this.cellIndex(nx, ny));
    }
  }

  private nearestConnectedCell(point: StudioWorldConnectivityPoint): number | null {
    const grid = this.lattice.grid;
    const centerX = Math.round(point.x / grid);
    const centerY = Math.round(point.y / grid);
    for (let ring = 0; ring <= 16; ring += 1) {
      let best: number | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let dy = -ring; dy <= ring; dy += 1) {
        for (let dx = -ring; dx <= ring; dx += 1) {
          if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
          const gx = centerX + dx, gy = centerY + dy;
          if (!this.free(gx, gy)) continue;
          const candidate = nodePoint(this.bounds, grid, gx, gy, this.radius);
          if (!studioWorldLineCanOccupy(this.bounds, this.colliders, point, candidate, this.radius)) continue;
          const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
          const index = this.cellIndex(gx, gy);
          if (distance < bestDistance || (distance === bestDistance && best !== null && index < best)) {
            best = index;
            bestDistance = distance;
          }
        }
      }
      if (best !== null) return best;
    }
    return null;
  }

  private spendExpansion(): boolean {
    if (this.remainingExpansions <= 0) {
      this.exceeded = true;
      return false;
    }
    this.remainingExpansions -= 1;
    return true;
  }

  private indexComponent(start: number): number | null {
    const existing = this.componentByCell[start]!;
    if (existing !== 0) return existing;
    this.searches += 1;
    const component = this.nextComponent++;
    const queue = [start];
    this.componentByCell[start] = component;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      if (!this.spendExpansion()) {
        // 예산 초과: 부분 색인은 잘못된 "연결됨"을 만들 수 있으므로 되돌린다.
        for (const cell of queue) this.componentByCell[cell] = 0;
        return null;
      }
      this.forEachNeighbor(queue[cursor]!, (next) => {
        if (this.componentByCell[next] !== 0) return;
        this.componentByCell[next] = component;
        queue.push(next);
      });
    }
    return component;
  }

  private searchPair(start: number, target: number): boolean {
    const pairKey = Math.min(start, target) * this.lattice.cells + Math.max(start, target);
    const cached = this.pairResults.get(pairKey);
    if (cached !== undefined) return cached;
    this.searches += 1;
    const queue = [start];
    const visited = new Set<number>([start]);
    let cursor = 0;
    while (cursor < queue.length && cursor < MAX_CONNECTIVITY_EXPANSIONS) {
      if (!this.spendExpansion()) return false;
      const current = queue[cursor++]!;
      if (current === target) {
        this.pairResults.set(pairKey, true);
        return true;
      }
      this.forEachNeighbor(current, (next) => {
        if (visited.has(next)) return;
        visited.add(next);
        queue.push(next);
      });
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
    const start = this.nearestConnectedCell(from);
    const target = this.nearestConnectedCell(to);
    if (start === null || target === null) return false;
    if (start === target) return true;
    if (!this.canFullyIndex) return this.searchPair(start, target);
    const startComponent = this.indexComponent(start);
    if (startComponent === null) return false;
    const targetComponent = this.componentByCell[target] || this.indexComponent(target);
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
