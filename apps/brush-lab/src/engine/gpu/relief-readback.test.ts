import { describe, expect, it } from "vitest";

import { presetById } from "../presets/catalog";
import { renderStroke, Surface } from "../raster/reference-renderer";
import { zigzagStroke } from "../testing/synthetic-strokes";

import { SLOT_NONE, SLOT_RESERVED, WET_FLOATS_PER_TILE } from "./layout";
import { applyReliefLighting, heightMapFromWetPool } from "./relief-readback";

const SIZE = 64;

/**
 * 임파스토 획을 CPU 참조로 그려 높이가 쌓인 표면을 만든다.
 * CPU는 유화 물감 층(색·부피)을 문서에 굽지 않고 표시 시점에 합성하지만 GPU 문서 버퍼는 그 층을 모른다(색층 미러 대기).
 * 그래서 `flattenWet()`로 색을 문서에 굽고 부피를 마른 릴리프(높이 채널)로 굳혀, 이 테스트가 검증하는
 * "표시 시점 릴리프 조명식 동일성"만 분리해 비교한다.
 */
function impastoSurface(): Surface {
  const surface = new Surface(SIZE, SIZE);
  renderStroke(presetById("oil-impasto"), zigzagStroke(SIZE, { durationMs: 200 }), { width: SIZE, height: SIZE, seed: 5, surface });
  surface.flattenWet();
  return surface;
}

/** CPU 습식 풀을 GPU 풀 배치(슬롯 표 + 슬롯 연속 배열)로 옮긴다. */
function toGpuWetLayout(surface: Surface): { slots: Uint32Array; pool: Float32Array; used: number } {
  const wet = surface.wet;
  if (!wet) throw new Error("습식 상태 없음");
  const tiles = surface.tilesX * surface.tilesY;
  const slots = new Uint32Array(tiles).fill(SLOT_NONE);
  const entries = wet.pool.entries();
  const pool = new Float32Array(entries.length * WET_FLOATS_PER_TILE);
  entries.forEach(([tile, cpuSlot], gpuSlot) => {
    slots[tile] = gpuSlot;
    pool.set(wet.pool.view(cpuSlot).subarray(0, WET_FLOATS_PER_TILE), gpuSlot * WET_FLOATS_PER_TILE);
  });
  return { slots, pool, used: entries.length };
}

describe("GPU readbackLinear 릴리프 조명 보조", () => {
  it("슬롯 표 + 연속 풀에서 만든 높이 맵이 CPU Surface.heightMap과 비트까지 같다(미할당·예약 타일은 0)", () => {
    const surface = impastoSurface();
    const wet = surface.wet;
    expect(wet).not.toBeNull();
    if (!wet) return;
    const cpu = surface.heightMap(wet);
    expect(cpu.some((v) => v > 0)).toBe(true);
    const { slots, pool, used } = toGpuWetLayout(surface);
    const gpuMap = heightMapFromWetPool(slots, pool, used, SIZE, SIZE, surface.tilesX);
    expect(Array.from(gpuMap)).toEqual(Array.from(cpu));
    // 예약(SLOT_RESERVED)·범위 밖 슬롯은 읽지 않는다.
    const reserved = new Uint32Array(slots).fill(SLOT_RESERVED);
    expect(heightMapFromWetPool(reserved, pool, used, SIZE, SIZE, surface.tilesX).every((v) => v === 0)).toBe(true);
    const outOfRange = new Uint32Array(slots).fill(used + 5);
    expect(heightMapFromWetPool(outOfRange, pool, used, SIZE, SIZE, surface.tilesX).every((v) => v === 0)).toBe(true);
  });

  it("applyReliefLighting(원본 문서, 높이 맵)이 CPU Surface.toLinear()(조명 포함)와 비트까지 같고 원본과는 다르다", () => {
    const surface = impastoSurface();
    const wet = surface.wet;
    if (!wet) throw new Error("습식 상태 없음");
    const lit = applyReliefLighting(surface.document, surface.heightMap(wet), SIZE);
    const cpu = surface.toLinear();
    expect(Array.from(lit)).toEqual(Array.from(cpu));
    expect(Array.from(lit)).not.toEqual(Array.from(surface.document));
    // premultiplied 불변식: rgb ≤ alpha, 비음수.
    for (let i = 0; i < lit.length; i += 4) {
      const a = lit[i + 3] ?? 0;
      for (let c = 0; c < 3; c += 1) {
        expect(lit[i + c] ?? 0).toBeGreaterThanOrEqual(0);
        expect(lit[i + c] ?? 0).toBeLessThanOrEqual(a);
      }
    }
  });

  it("높이가 모두 0이면 문서 복사본을 그대로 돌려준다(입력 불변)", () => {
    const doc = new Float32Array(SIZE * SIZE * 4).fill(0.25);
    const out = applyReliefLighting(doc, new Float32Array(SIZE * SIZE), SIZE);
    expect(out).not.toBe(doc);
    expect(Array.from(out)).toEqual(Array.from(doc));
  });
});
