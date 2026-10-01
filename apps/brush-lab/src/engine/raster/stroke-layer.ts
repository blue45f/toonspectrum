import { activeTilesAfterDeposit } from "../wet/active-tiles";

import { applyImpastoDabs, computeSmudgeColors, rasterizeTile, unpackAll } from "./fine-raster";
import { binDabs, STROKE_FLOATS_PER_TILE, TILE_SIZE } from "./tile-binning";
import { TilePool } from "./tile-pool";

import type { RasterContext } from "./fine-raster";
import type { DabBatch } from "../core/dab-layout";

export interface RasterReceipt {
  dabCount: number;
  dirtyTiles: number;
  overflowDabs: number;
  poolTilesUsed: number;
}

/**
 * 획 레이어(희소 타일 풀, rgba f32 premultiplied). 획 동안 dab를 over로 누적하고
 * endStroke에서 문서에 1회 합성한다(획 알파 상한 = 합성 opacity).
 */
export class StrokeLayer {
  readonly width: number;
  readonly height: number;
  readonly tilesX: number;
  readonly tilesY: number;
  readonly pool: TilePool;

  constructor(width: number, height: number, capacityTiles: number) {
    this.width = width;
    this.height = height;
    this.tilesX = Math.ceil(width / TILE_SIZE);
    this.tilesY = Math.ceil(height / TILE_SIZE);
    this.pool = new TilePool(capacityTiles, STROKE_FLOATS_PER_TILE);
  }

  accumulate(batch: DabBatch, ctx: RasterContext): RasterReceipt {
    const bin = binDabs(batch, this.tilesX, this.tilesY);
    ctx.dabs = unpackAll(batch);
    const model = ctx.program.deposition.model;
    // smudge 운반 색은 타일 순회와 무관하게 dab 순서로 한 번만 계산한다.
    ctx.smudgeColors = model === "smudge" ? computeSmudgeColors(ctx.dabs, ctx) : undefined;
    const wet = ctx.wet && (model === "wet-flow" || model === "impasto") ? ctx.wet : null;
    for (let i = 0; i < bin.dirtyCount; i += 1) {
      const tile = bin.dirtyTiles[i] ?? 0;
      const slot = this.pool.alloc(tile);
      const strokeTile = this.pool.view(slot);
      const wetTile = wet ? wet.pool.view(wet.pool.alloc(tile)) : null;
      rasterizeTile(tile, bin, batch, ctx, strokeTile, wetTile);
    }
    // 임파스토 높이장은 타일을 가로지르므로 dab 순서의 별도 패스로 처리한다(타일 경계 이음새 방지).
    if (wet && model === "impasto") applyImpastoDabs(wet, ctx.dabs, ctx);
    if (wet) activeTilesAfterDeposit(wet, bin);
    return {
      dabCount: batch.count,
      dirtyTiles: bin.dirtyCount,
      overflowDabs: bin.overflowDabs,
      poolTilesUsed: this.pool.used(),
    };
  }

  /** 할당된 타일(타일 번호 오름차순). */
  *tiles(): Iterable<[tile: number, data: Float32Array]> {
    for (const [tile, slot] of this.pool.entries()) {
      yield [tile, this.pool.view(slot)];
    }
  }

  clear(): void {
    this.pool.clear();
  }
}
