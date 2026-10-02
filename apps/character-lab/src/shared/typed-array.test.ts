import { describe, expect, it } from "vitest";

import { bytesEqual, bytesOf, concatFloat32, flipRowsInPlace, meanAbsoluteError, offsetIndices, premultiply, unpremultiply } from "./typed-array";

describe("shared/typed-array", () => {
  it("concat·offsetIndices", () => {
    expect(Array.from(concatFloat32([new Float32Array([1, 2]), new Float32Array([3])]))).toEqual([1, 2, 3]);
    expect(Array.from(offsetIndices(new Uint32Array([0, 1, 2]), 10))).toEqual([10, 11, 12]);
  });

  it("flipRowsInPlace가 행 순서를 뒤집고 길이 불일치는 throw", () => {
    const rgba = new Uint8ClampedArray([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    flipRowsInPlace(rgba, 1, 3);
    expect(Array.from(rgba)).toEqual([3, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]);
    flipRowsInPlace(rgba, 1, 3);
    expect(Array.from(rgba)).toEqual([1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3]);
    expect(() => flipRowsInPlace(rgba, 2, 3)).toThrow(/길이/u);
    const depth = new Float32Array([0, 1]);
    flipRowsInPlace(depth, 1, 2, 1);
    expect(Array.from(depth)).toEqual([1, 0]);
  });

  it("unpremultiply는 a=0을 0으로, 오차 ≤1/255로 복원한다", () => {
    const straight = new Uint8ClampedArray([200, 100, 50, 128, 10, 20, 30, 0, 255, 255, 255, 255]);
    const pre = premultiply(new Uint8ClampedArray(straight));
    expect(Array.from(pre.slice(0, 4))).toEqual([100, 50, 25, 128]);
    expect(Array.from(pre.slice(4, 8))).toEqual([0, 0, 0, 0]);
    const back = unpremultiply(pre);
    for (let i = 0; i < 4; i += 1) expect(Math.abs((back[i] ?? 0) - (straight[i] ?? 0))).toBeLessThanOrEqual(2);
    expect(Array.from(back.slice(4, 8))).toEqual([0, 0, 0, 0]);
    expect(Array.from(back.slice(8, 12))).toEqual([255, 255, 255, 255]);
  });

  it("bytesOf는 복사 없이 바이트 뷰를 준다", () => {
    const f32 = new Float32Array([1.5]);
    const bytes = bytesOf(f32);
    expect(bytes.byteLength).toBe(4);
    expect(bytes.buffer).toBe(f32.buffer);
    expect(bytesEqual(bytes, new Uint8Array(f32.buffer))).toBe(true);
    expect(meanAbsoluteError([0, 10], [0, 20])).toBe(5);
  });
});
