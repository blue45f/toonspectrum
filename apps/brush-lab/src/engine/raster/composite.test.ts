import { describe, expect, it } from "vitest";

import { BLEND_MODES, compositeTile } from "./composite";
import { STROKE_FLOATS_PER_TILE, TILE_SIZE } from "./tile-binning";

/** 타일 전체(16×16)를 같은 premultiplied 값으로 채운 획 타일. */
function filledStroke(r: number, g: number, b: number, a: number): Float32Array {
  const stroke = new Float32Array(STROKE_FLOATS_PER_TILE);
  for (let i = 0; i < STROKE_FLOATS_PER_TILE; i += 4) {
    stroke[i] = r;
    stroke[i + 1] = g;
    stroke[i + 2] = b;
    stroke[i + 3] = a;
  }
  return stroke;
}

/** 문서를 서로 다른 값으로 채워 어느 픽셀이 바뀌었는지 모드와 무관하게 구분한다. */
function seededDoc(floats: number): Float32Array {
  const doc = new Float32Array(floats);
  for (let i = 0; i < floats; i += 1) doc[i] = Math.fround(0.1 + (i % 7) * 0.05);
  return doc;
}

function changedPixels(before: Float32Array, after: Float32Array, width: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < before.length; i += 4) {
    let differs = false;
    for (let c = 0; c < 4; c += 1) if (before[i + c] !== after[i + c]) differs = true;
    if (differs) {
      const p = i / 4;
      out.push(`${p % width},${Math.floor(p / width)}`);
    }
  }
  return out;
}

describe("compositeTile(캔버스 밖 픽셀 가드)", () => {
  it.each(BLEND_MODES)("%s: 부분 타일은 캔버스 안쪽 픽셀만 바꾸고 다음 행 앞쪽·버퍼 뒤쪽은 건드리지 않는다", (mode) => {
    const width = 20; // 마지막 타일 열은 x 16..19만 캔버스 안
    const height = 20; // 마지막 타일 행은 y 16..19만 캔버스 안
    const doc = seededDoc(width * height * 4);
    const before = new Float32Array(doc);
    const stroke = filledStroke(0.5, 0.25, 0.125, 0.5);
    // 오른쪽 아래 구석 타일(1, 1): 안쪽 4×4만 바뀌어야 한다.
    compositeTile(doc, 0, stroke, 1, mode, width, height, 1, 1);
    const expected: string[] = [];
    for (let y = 16; y < 20; y += 1) for (let x = 16; x < 20; x += 1) expected.push(`${x},${y}`);
    const changed = changedPixels(before, doc, width);
    // multiply/max 등 모드에 따라 값이 우연히 같은 픽셀이 있을 수 있으므로 "바뀐 픽셀 ⊆ 안쪽 4×4"만 요구하고,
    // 안쪽에서 최소 한 픽셀은 반드시 바뀌었는지도 확인한다.
    expect(changed.filter((p) => !expected.includes(p))).toEqual([]);
    expect(changed.length).toBeGreaterThan(0);
  });

  it("normal: 마지막 타일 열(1, 0)의 캔버스 밖 열이 다음 행 x = px − width 위치로 감기지 않는다", () => {
    const width = 20;
    const height = 32;
    const doc = new Float32Array(width * height * 4);
    compositeTile(doc, 0, filledStroke(1, 1, 1, 1), 1, "normal", width, height, 1, 0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const a = doc[(y * width + x) * 4 + 3] ?? 0;
        // 타일(1,0)은 x 16..19, y 0..15만 덮는다.
        const inside = x >= 16 && y < 16;
        expect(a, `(${x},${y})`).toBe(inside ? 1 : 0);
      }
    }
  });

  it("height 밖 행은 docOffset 뒤의 버퍼 영역(다른 레이어 등)을 오염시키지 않는다", () => {
    const width = 16;
    const height = 10; // 타일 1개, 아래쪽 6행은 캔버스 밖
    const docFloats = width * height * 4;
    const offset = 8; // 앞쪽 8 float는 다른 데이터
    const sentinel = 0.75;
    const buffer = new Float32Array(offset + docFloats + 6 * width * 4).fill(sentinel);
    for (let i = offset; i < offset + docFloats; i += 1) buffer[i] = 0;
    compositeTile(buffer, offset, filledStroke(1, 1, 1, 1), 1, "normal", width, height, 0, 0);
    for (let i = 0; i < offset; i += 1) expect(buffer[i], `앞 ${i}`).toBe(sentinel);
    for (let i = offset + docFloats; i < buffer.length; i += 1) expect(buffer[i], `뒤 ${i}`).toBe(sentinel);
    // 캔버스 안 10행은 모두 칠해졌다.
    for (let i = offset; i < offset + docFloats; i += 4) expect(buffer[i + 3]).toBe(1);
  });

  it.each(BLEND_MODES)("%s: 캔버스 안 타일은 전체 16×16을 합성한다(가드가 안쪽 픽셀을 건너뛰지 않는다)", (mode) => {
    const width = 32;
    const height = 32;
    const doc = seededDoc(width * height * 4);
    const before = new Float32Array(doc);
    compositeTile(doc, 0, filledStroke(0.5, 0.25, 0.125, 0.5), 1, mode, width, height, 1, 1);
    const changed = changedPixels(before, doc, width);
    expect(changed.length).toBe(TILE_SIZE * TILE_SIZE);
    // 바뀐 픽셀은 타일(1,1) = x 16..31, y 16..31 안에만 있다.
    for (const p of changed) {
      const [x, y] = p.split(",").map(Number);
      expect(x).toBeGreaterThanOrEqual(16);
      expect(y).toBeGreaterThanOrEqual(16);
    }
  });

  it("타일이 통째로 캔버스 밖이면 아무것도 쓰지 않는다", () => {
    const width = 20;
    const height = 20;
    const doc = seededDoc(width * height * 4);
    const before = new Float32Array(doc);
    compositeTile(doc, 0, filledStroke(1, 1, 1, 1), 1, "normal", width, height, 2, 0);
    compositeTile(doc, 0, filledStroke(1, 1, 1, 1), 1, "normal", width, height, 0, 2);
    expect(doc).toEqual(before);
  });
});
