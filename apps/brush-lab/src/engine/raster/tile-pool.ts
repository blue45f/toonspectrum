import { StrokeBudgetExceededError } from "../core/errors";

/**
 * 희소 타일 풀. 타일 번호 → 슬롯을 처음 접근 순서로 할당하며 용량 초과는 던진다.
 * GPU `TileTable.slots`/`pool_cursor`와 같은 의미(슬롯 번호는 결과에 영향 없음).
 */
export class TilePool {
  readonly capacityTiles: number;
  readonly floatsPerTile: number;
  private readonly data: Float32Array;
  private readonly slots = new Map<number, number>();
  private cursor = 0;

  constructor(capacityTiles: number, floatsPerTile: number) {
    if (!Number.isInteger(capacityTiles) || capacityTiles <= 0) {
      throw new RangeError(`TilePool capacityTiles must be positive, got ${capacityTiles}`);
    }
    this.capacityTiles = capacityTiles;
    this.floatsPerTile = floatsPerTile;
    this.data = new Float32Array(capacityTiles * floatsPerTile);
  }

  slotOf(tile: number): number | undefined {
    return this.slots.get(tile);
  }

  /** 슬롯 할당(이미 있으면 기존 슬롯). 용량 초과 → StrokeBudgetExceededError. */
  alloc(tile: number): number {
    const existing = this.slots.get(tile);
    if (existing !== undefined) return existing;
    if (this.cursor >= this.capacityTiles) {
      throw new StrokeBudgetExceededError(this.cursor + 1, this.capacityTiles, { tile });
    }
    const slot = this.cursor;
    this.cursor += 1;
    this.slots.set(tile, slot);
    return slot;
  }

  view(slot: number): Float32Array {
    if (slot < 0 || slot >= this.cursor) {
      throw new RangeError(`TilePool slot ${slot} is not allocated`);
    }
    const base = slot * this.floatsPerTile;
    return this.data.subarray(base, base + this.floatsPerTile);
  }

  used(): number {
    return this.cursor;
  }

  /** 할당된 (tile, slot) 목록을 타일 번호 오름차순으로. */
  entries(): [tile: number, slot: number][] {
    return Array.from(this.slots.entries()).sort((a, b) => a[0] - b[0]);
  }

  clear(): void {
    this.slots.clear();
    this.cursor = 0;
    this.data.fill(0);
  }
}
