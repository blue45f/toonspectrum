import { createFuzzyNeighborhoodGate } from "@toonstudio/studio-engine-registry";
import { describe, expect, it } from "vitest";

import {
  alphaFieldImage,
  bandImage,
  diagonalBandImage,
  diagonalBandImageAa,
  diskImage,
  invertAlpha,
  noiseImage,
  shiftImage,
  solidImage,
} from "../testing/synthetic-images";

import { imageToLab } from "./lab-math";
import {
  coverageIoU,
  deltaEStats,
  deltaEStatsImages,
  edgeStaircaseEnergy,
  edgeTransitionWidthPx,
  fuzzyMismatchPct,
  opacityAccumulationError,
  pixelHash,
  pixelSha256,
} from "./render-metrics";

import type { LabImage } from "../../engine/core/types";

const gate = createFuzzyNeighborhoodGate({ fuzzyDelta: 48, mismatchPctGate: 0.5 });

function registryMismatch(a: LabImage, b: LabImage): number {
  return gate(new Uint8Array(a.data.buffer, a.data.byteOffset, a.data.byteLength), new Uint8Array(b.data.buffer, b.data.byteOffset, b.data.byteLength), a.width, a.height).mismatchPct;
}

describe("렌더 지표", () => {
  it("동일 이미지: ΔE 0·IoU 1·퍼지 불일치 0·해시 동일", async () => {
    const img = diskImage(32, 32, 16, 16, 8);
    expect(deltaEStatsImages(img, img)).toEqual({ mean: 0, p99: 0, max: 0 });
    expect(coverageIoU(img, img)).toBe(1);
    expect(fuzzyMismatchPct(img.data, img.data, 32, 32)).toBe(0);
    expect(pixelHash(img)).toBe(pixelHash(diskImage(32, 32, 16, 16, 8)));
    expect(pixelHash(img)).toHaveLength(16);
    expect(await pixelSha256(img)).toHaveLength(64);
    expect(pixelHash({ width: 32, height: 32, data: img.data })).not.toBe(pixelHash({ width: 16, height: 64, data: img.data }));
  });

  it("반전 마스크 IoU 0, 빈 이미지끼리 IoU 1, 크기 불일치는 RangeError", () => {
    const img = diskImage(32, 32, 16, 16, 8);
    expect(coverageIoU(img, invertAlpha(img))).toBe(0);
    expect(coverageIoU(solidImage(8, 8), solidImage(8, 8))).toBe(1);
    expect(() => coverageIoU(img, solidImage(8, 8))).toThrow(RangeError);
    expect(() => deltaEStatsImages(img, solidImage(8, 8))).toThrow(RangeError);
  });

  it("1 px 이동 이미지는 δ48 퍼지 불일치 0이고 2 px 이동은 0보다 크다", () => {
    const img = diskImage(32, 32, 16, 16, 6);
    expect(fuzzyMismatchPct(shiftImage(img, 1, 0).data, img.data, 32, 32)).toBe(0);
    expect(fuzzyMismatchPct(shiftImage(img, 0, 1).data, img.data, 32, 32)).toBe(0);
    expect(fuzzyMismatchPct(shiftImage(img, 2, 0).data, img.data, 32, 32)).toBeGreaterThan(0);
    expect(() => fuzzyMismatchPct(img.data, new Uint8Array(4), 32, 32)).toThrow(RangeError);
  });

  it("δ48 퍼지 불일치율이 studio-engine-registry createFuzzyNeighborhoodGate와 일치한다", () => {
    const base = diskImage(24, 24, 12, 12, 7);
    const pairs: [LabImage, LabImage][] = [
      [base, base],
      [base, shiftImage(base, 1, 1)],
      [base, shiftImage(base, 2, 0)],
      [base, shiftImage(base, 3, 2)],
      [noiseImage(24, 1), noiseImage(24, 2)],
      [base, invertAlpha(base)],
      [alphaFieldImage(24, 24, (x) => x / 23), alphaFieldImage(24, 24, (x) => 1 - x / 23)],
    ];
    for (const [a, b] of pairs) {
      expect(fuzzyMismatchPct(a.data, b.data, a.width, a.height)).toBeCloseTo(registryMismatch(a, b), 9);
    }
  });

  it("불투명도 누적 오차: 이론값 1 − (1 − flow)^n 대비", () => {
    const flow = 0.5;
    const layers = 3;
    const expected = 1 - Math.pow(1 - flow, layers);
    const img = alphaFieldImage(4, 4, () => expected);
    expect(opacityAccumulationError(img, flow, layers)).toBeLessThan(0.003);
    expect(opacityAccumulationError(alphaFieldImage(4, 4, () => 1), flow, layers)).toBeCloseTo(1 - expected, 2);
    expect(opacityAccumulationError(alphaFieldImage(4, 4, () => expected * 0.5), flow, layers, 0.5)).toBeLessThan(0.003);
  });

  it("에지 계단 에너지: 이진 대각선 띠는 1, AA 대각선 띠는 낮고 빈 이미지는 0", () => {
    expect(edgeStaircaseEnergy(diagonalBandImage(48, 3))).toBeCloseTo(1, 9);
    expect(edgeStaircaseEnergy(diagonalBandImageAa(48, 3))).toBeLessThan(0.1);
    expect(edgeStaircaseEnergy(solidImage(8, 8))).toBe(0);
    expect(edgeStaircaseEnergy(bandImage(32, 32, 10, 14, 3))).toBeLessThan(0.1);
  });

  it("에지 전이폭: 램프 경계는 램프 폭에 비례하고 경질 경계는 1 px 이하, 잉크 없으면 null", () => {
    const path: [number, number][] = [
      [0, 16],
      [32, 16],
    ];
    const hard = edgeTransitionWidthPx(bandImage(32, 32, 10, 22), path);
    const soft = edgeTransitionWidthPx(bandImage(32, 32, 10, 22, 6), path);
    expect(hard).not.toBeNull();
    expect(hard ?? 99).toBeLessThanOrEqual(1);
    expect(soft ?? 0).toBeGreaterThan(3);
    expect(soft ?? 0).toBeLessThan(6);
    expect(edgeTransitionWidthPx(solidImage(32, 32), path)).toBeNull();
  });

  it("deltaEStats는 Lab 버퍼 길이에 맞춰 평균·p99·최대를 준다", () => {
    const a = imageToLab(solidImage(2, 2, [255, 255, 255, 255]));
    const b = imageToLab(solidImage(2, 2, [0, 0, 0, 255]));
    const st = deltaEStats(a, b);
    expect(st.mean).toBeCloseTo(100, 1);
    expect(st.max).toBeCloseTo(100, 1);
    expect(deltaEStats(new Float32Array(0), new Float32Array(0))).toEqual({ mean: 0, p99: 0, max: 0 });
  });
});
