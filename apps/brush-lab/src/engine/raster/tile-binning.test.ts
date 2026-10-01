import { describe, expect, it } from "vitest";

import { DabBatch } from "../core/dab-layout";
import { Pcg32 } from "../core/rng";

import {
  binDabs,
  dabExtentPx,
  dabFeatherPx,
  dabTileBounds,
  MAX_TILES_PER_DAB_DEFAULT,
  TILE_PIXELS,
  TILE_SIZE,
  tileRefs,
} from "./tile-binning";

import type { BinResult, TileBounds } from "./tile-binning";
import type { DabInstance, DepositionModel } from "../core/types";

function dab(partial: Partial<DabInstance> = {}): DabInstance {
  return {
    x: 0,
    y: 0,
    rx: 4,
    ry: 4,
    angle: 0,
    hardness: 1,
    flow: 1,
    shapeExp: 2,
    r: 0,
    g: 0,
    b: 0,
    a: 1,
    tipKind: "round",
    seed: 1,
    grain: 0,
    wet: 0,
    pigmentMass: 0,
    erase: false,
    smudge: false,
    dualTip: false,
    lockAlpha: false,
    impasto: false,
    deposition: "dry-stamp",
    ...partial,
  };
}

/** 브루트포스 오라클: 타일마다 전체 dab을 훑어 포함 여부를 판단한다. */
function oracle(dabs: readonly DabInstance[], tilesX: number, tilesY: number, maxTilesPerDab: number): BinResult {
  const tileCount = tilesX * tilesY;
  const bounds: (TileBounds | null)[] = dabs.map((d) => {
    const b = dabTileBounds(d, tilesX, tilesY);
    if (!b) return null;
    const span = (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1);
    return span > maxTilesPerDab ? null : b;
  });
  const overflowDabs = dabs.filter((d, i) => {
    const b = dabTileBounds(d, tilesX, tilesY);
    return b !== null && bounds[i] === null;
  }).length;
  const perTile: number[][] = Array.from({ length: tileCount }, () => []);
  for (let t = 0; t < tileCount; t += 1) {
    const tx = t % tilesX;
    const ty = Math.floor(t / tilesX);
    for (let i = 0; i < dabs.length; i += 1) {
      const b = bounds[i];
      if (b && tx >= b.x0 && tx <= b.x1 && ty >= b.y0 && ty <= b.y1) perTile[t]?.push(i);
    }
  }
  const counts = new Uint32Array(tileCount);
  const offsets = new Uint32Array(tileCount + 1);
  const refs: number[] = [];
  const dirty: number[] = [];
  for (let t = 0; t < tileCount; t += 1) {
    const list = perTile[t] ?? [];
    counts[t] = list.length;
    offsets[t] = refs.length;
    refs.push(...list);
    if (list.length > 0) dirty.push(t);
  }
  offsets[tileCount] = refs.length;
  return {
    counts,
    offsets,
    refs: Uint32Array.from(refs),
    dirtyTiles: Uint32Array.from(dirty),
    dirtyCount: dirty.length,
    overflowDabs,
  };
}

function randomDabs(seed: number, n: number, span: number): DabInstance[] {
  const rng = new Pcg32(seed, 9);
  const models: DepositionModel[] = ["dry-stamp", "airbrush", "spray", "eraser", "wet-flow"];
  const out: DabInstance[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(
      dab({
        x: rng.nextF32() * (span + 40) - 20,
        y: rng.nextF32() * (span + 40) - 20,
        rx: 0.5 + rng.nextF32() * 30,
        ry: 0.5 + rng.nextF32() * 30,
        hardness: rng.nextF32(),
        angle: rng.nextF32() * 6.28,
        deposition: models[Math.floor(rng.nextF32() * models.length)] ?? "dry-stamp",
      }),
    );
  }
  return out;
}

function same(a: BinResult, b: BinResult): void {
  expect(Array.from(a.counts)).toEqual(Array.from(b.counts));
  expect(Array.from(a.offsets)).toEqual(Array.from(b.offsets));
  expect(Array.from(a.refs)).toEqual(Array.from(b.refs));
  expect(Array.from(a.dirtyTiles)).toEqual(Array.from(b.dirtyTiles));
  expect(a.dirtyCount).toBe(b.dirtyCount);
  expect(a.overflowDabs).toBe(b.overflowDabs);
}

describe("타일 비닝 CSR", () => {
  it("상수: 16 px 타일, 256 픽셀, 기본 dab당 타일 상한 4096", () => {
    expect(TILE_SIZE).toBe(16);
    expect(TILE_PIXELS).toBe(256);
    expect(MAX_TILES_PER_DAB_DEFAULT).toBe(4096);
  });

  it("CSR이 브루트포스 오라클과 동일하다(순서 포함, 무작위 300 dab × 3 시드)", () => {
    for (const seed of [1, 2, 3]) {
      const dabs = randomDabs(seed, 300, 256);
      const batch = new DabBatch(dabs.length);
      for (const d of dabs) batch.push(d);
      const bin = binDabs(batch, 16, 16);
      same(bin, oracle(dabs, 16, 16, MAX_TILES_PER_DAB_DEFAULT));
      // refs는 타일 안에서 dab 인덱스 오름차순
      for (let t = 0; t < 256; t += 1) {
        const r = tileRefs(bin, t);
        for (let k = 1; k < r.length; k += 1) expect(r[k]).toBeGreaterThan(r[k - 1] ?? -1);
      }
      expect(bin.offsets[256]).toBe(bin.refs.length);
    }
  });

  it("MAX_TILES_PER_DAB 초과 dab은 overflow로 세고 refs에 들어가지 않는다", () => {
    const batch = new DabBatch(3);
    batch.push(dab({ x: 128, y: 128, rx: 40, ry: 40 })); // 많은 타일에 걸친다
    batch.push(dab({ x: 20, y: 20, rx: 2, ry: 2 }));
    batch.push(dab({ x: -500, y: -500, rx: 2, ry: 2 })); // 캔버스 밖(overflow 아님)
    const bin = binDabs(batch, 16, 16, 4);
    expect(bin.overflowDabs).toBe(1);
    expect(Array.from(bin.refs).every((i) => i === 1)).toBe(true);
    expect(bin.refs.length).toBeGreaterThan(0);
    const dabs = [batch.at(0), batch.at(1), batch.at(2)];
    same(bin, oracle(dabs, 16, 16, 4));
    const wide = binDabs(batch, 16, 16);
    expect(wide.overflowDabs).toBe(0);
    expect(wide.refs.length).toBeGreaterThan(bin.refs.length);
  });

  it("경계 타일: 캔버스 밖 dab은 null, 걸친 dab은 clamp", () => {
    expect(dabTileBounds(dab({ x: -100, y: 10 }), 16, 16)).toBeNull();
    expect(dabTileBounds(dab({ x: 10, y: 300 }), 16, 16)).toBeNull();
    const left = dabTileBounds(dab({ x: -2, y: 8, rx: 4, ry: 4 }), 16, 16);
    expect(left).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
    const right = dabTileBounds(dab({ x: 258, y: 250, rx: 4, ry: 4 }), 16, 16);
    expect(right).toEqual({ x0: 15, y0: 15, x1: 15, y1: 15 });
    const far = dabTileBounds(dab({ x: 300, y: 250, rx: 4, ry: 4 }), 16, 16);
    expect(far).toBeNull();
    const corner = dabTileBounds(dab({ x: 16, y: 16, rx: 1, ry: 1 }), 16, 16);
    expect(corner).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });

  it("dabFeatherPx/dabExtentPx: hardness 1 → feather 1, airbrush/spray는 산포 여유 max(rx, ry) 추가", () => {
    expect(dabFeatherPx(dab({ rx: 8, ry: 4, hardness: 1 }))).toBe(1);
    expect(dabFeatherPx(dab({ rx: 8, ry: 4, hardness: 0 }))).toBe(4);
    expect(dabFeatherPx(dab({ rx: 8, ry: 4, hardness: 0.5 }))).toBe(2);
    expect(dabFeatherPx(dab({ rx: 8, ry: 4, hardness: 1, deposition: "spray" }))).toBe(9);
    expect(dabFeatherPx(dab({ rx: 8, ry: 4, hardness: 1, deposition: "airbrush" }))).toBe(9);
    expect(dabExtentPx(dab({ rx: 8, ry: 4, hardness: 1 }))).toBe(10);
  });

  it("packed 경계 계산이 unpack 경계와 같다(DabBatch 경로)", () => {
    const dabs = randomDabs(7, 100, 128);
    const batch = new DabBatch(100);
    for (const d of dabs) batch.push(d);
    const bin = binDabs(batch, 8, 8);
    const fromUnpacked = oracle(Array.from({ length: batch.count }, (_, i) => batch.at(i)), 8, 8, MAX_TILES_PER_DAB_DEFAULT);
    same(bin, fromUnpacked);
  });

  it("빈 배치는 빈 CSR", () => {
    const bin = binDabs(new DabBatch(4), 4, 4);
    expect(bin.dirtyCount).toBe(0);
    expect(bin.refs.length).toBe(0);
    expect(Array.from(bin.offsets)).toEqual(new Array<number>(17).fill(0));
  });
});
