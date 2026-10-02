import { describe, expect, it } from "vitest";

import { decodeIdPixel } from "../contracts";
import { decodeDepth } from "../export/raster-convert";
import { pixelAt } from "../testing/raster-fixtures";

import { DEPTH_CLEAR_RGBA01, RTT_READBACK_FLIP_Y, RTT_READBACK_PREMULTIPLIED, packDepthRgba8, rasterizeSyntheticDepth, rasterizeSyntheticPass } from "./readback";

import type { SyntheticBox } from "./readback";

describe("readback 상수", () => {
  it("backend 상수는 webgl2·webgpu·null을 모두 가진다", () => {
    expect(Object.keys(RTT_READBACK_FLIP_Y).sort()).toEqual(["null", "webgl2", "webgpu"]);
    expect(RTT_READBACK_PREMULTIPLIED.null).toBe(false);
    expect(RTT_READBACK_FLIP_Y.null).toBe(false);
  });
});

describe("packDepthRgba8", () => {
  it("decodeDepth(rgba-packed)와 역함수이며 오차가 1/16M 이하다", () => {
    const samples = [0, 1e-6, 0.001, 0.123456789, 0.25, 0.5, 0.75, 0.999, 1];
    const rgba = new Uint8Array(samples.length * 4);
    samples.forEach((d, i) => {
      const packed = packDepthRgba8(d);
      for (const channel of packed) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
      rgba.set(packed, i * 4);
    });
    const decoded = decodeDepth(rgba, samples.length, 1, { near: 0.1, far: 10, flipY: false, encoding: "rgba-packed" });
    samples.forEach((d, i) => expect(Math.abs((decoded.depth[i] ?? 0) - d)).toBeLessThan(1 / 16_000_000));
  });

  it("배경 clear 값은 far(1)이고 범위 밖·NaN은 클램프한다", () => {
    expect(packDepthRgba8(1)).toEqual([255, 0, 0, 0]);
    expect(DEPTH_CLEAR_RGBA01).toEqual([1, 0, 0, 0]);
    expect(packDepthRgba8(2)).toEqual([255, 0, 0, 0]);
    expect(packDepthRgba8(-1)).toEqual([0, 0, 0, 0]);
    expect(packDepthRgba8(Number.NaN)).toEqual([255, 0, 0, 0]);
  });
});

describe("합성 래스터", () => {
  const boxes: SyntheticBox[] = [
    { partId: 2, materialId: 1, x0: 0, y0: 0, x1: 4, y1: 4, depth01: 0.6, color: [100, 150, 200], normal: [0, 0, 1] },
    { partId: 300, materialId: 7, x0: 1, y0: 1, x1: 3, y1: 3, depth01: 0.3, color: [255, 0, 0], normal: [0, 1, 0] },
  ];

  it("가까운 상자가 먼 상자를 덮고 ID 인코딩을 보존한다", () => {
    const id = rasterizeSyntheticPass("part-id", 4, 4, boxes);
    expect(decodeIdPixel(...(pixelAt(id, 0, 0).slice(0, 3) as [number, number, number]))).toEqual({ partId: 2, materialId: 1 });
    expect(decodeIdPixel(...(pixelAt(id, 2, 2).slice(0, 3) as [number, number, number]))).toEqual({ partId: 300, materialId: 7 });
    const flat = rasterizeSyntheticPass("flat", 4, 4, boxes);
    expect(pixelAt(flat, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(flat, 3, 3)).toEqual([100, 150, 200, 255]);
    const normal = rasterizeSyntheticPass("normal", 4, 4, boxes);
    expect(pixelAt(normal, 0, 0)).toEqual([128, 128, 255, 255]);
    const empty = rasterizeSyntheticPass("lit", 2, 2, []);
    // 2×2 RGBA = 16바이트, 상자가 없으면 전부 투명 검정
    expect(Array.from(empty.rgba)).toEqual(new Array<number>(16).fill(0));
  });

  it("깊이는 배경 1, 상자는 depth01", () => {
    const depth = rasterizeSyntheticDepth(4, 4, boxes, 0.1, 10);
    expect(depth.depth[0]).toBeCloseTo(0.6);
    expect(depth.depth[2 * 4 + 2]).toBeCloseTo(0.3);
    expect(depth.near).toBe(0.1);
    const background = rasterizeSyntheticDepth(2, 2, [], 0.1, 10);
    expect(Array.from(background.depth)).toEqual([1, 1, 1, 1]);
  });

  it("화면 밖 상자는 무시한다", () => {
    const raster = rasterizeSyntheticPass("flat", 2, 2, [{ ...boxes[0]!, x0: 5, x1: 6 }]);
    expect(Array.from(raster.rgba).every((v) => v === 0)).toBe(true);
  });
});
