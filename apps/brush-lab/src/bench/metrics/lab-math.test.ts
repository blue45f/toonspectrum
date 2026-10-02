import { describe, expect, it } from "vitest";

import { alphaFieldImage, bandImage, solidImage, WHITE } from "../testing/synthetic-images";

import {
  alphaMask,
  bandPower,
  bilinearAlpha,
  cropWindow,
  detrendAndWindow,
  dft2D,
  downsample2x,
  erodeMask,
  hann1D,
  hann2D,
  imageToLab,
  inkCentroid,
  linearFit,
  mean,
  normalProfile,
  pathStations,
  pearson,
  percentile,
  polyEval,
  polyFit,
  polylineLength,
  profilePeak,
  profileWidth,
  radialFrequency,
  rank,
  solveLinear,
  spearman,
  std,
  toAlpha,
  toGray,
  totalPowerExDc,
} from "./lab-math";

describe("lab-math 통계", () => {
  it("mean·std·percentile", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(std([2, 2, 2])).toBe(0);
    expect(std([1, 3])).toBe(1);
    expect(percentile([5, 1, 3], 50)).toBe(3);
    expect(percentile([1, 2, 3, 4], 100)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0)).toBe(1);
    expect(percentile([], 50)).toBe(0);
  });

  it("pearson·spearman·rank: 단조 1, 역순 −1, 상수 0, 동순위 평균", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [10, 20, 25, 100])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(rank([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  it("linearFit은 정확한 직선을 복원하고 polyFit은 3차 다항식을 복원한다", () => {
    const x = [0, 1, 2, 3, 4];
    const fit = linearFit(x, x.map((v) => 3 * v - 1));
    expect(fit.slope).toBeCloseTo(3, 10);
    expect(fit.intercept).toBeCloseTo(-1, 10);
    expect(fit.r2).toBeCloseTo(1, 10);
    expect(linearFit([1, 1, 1], [1, 2, 3]).slope).toBe(0);
    const xs = Array.from({ length: 12 }, (_, i) => i * 0.7);
    const f = (v: number): number => 1 + 2 * v + 3 * v * v - v * v * v;
    const pf = polyFit(xs, xs.map(f), 3);
    for (const v of [0.3, 2.2, 5.1]) expect(polyEval(pf, v)).toBeCloseTo(f(v), 6);
  });

  it("solveLinear는 부분 피벗으로 풀고 특이 행렬은 0을 둔다", () => {
    expect(solveLinear([[0, 1], [2, 0]], [3, 4])).toEqual([2, 3]);
    expect(solveLinear([[1, 1], [2, 2]], [1, 2])[1]).toBe(0);
  });
});

describe("lab-math 스펙트럼", () => {
  it("Hann 창: 양끝 0, 중앙 1, 2-D는 분리형", () => {
    const h = hann1D(5);
    expect(h[0]).toBeCloseTo(0, 12);
    expect(h[2]).toBeCloseTo(1, 12);
    expect(hann1D(1)[0]).toBe(1);
    const h2 = hann2D(5);
    expect(h2[2 * 5 + 2]).toBeCloseTo(1, 12);
    expect(h2[0]).toBeCloseTo(0, 12);
  });

  it("dft2D: x 방향 k사이클 코사인은 (k,0)·(N−k,0)에 피크가 있고 DC는 평균", () => {
    const n = 16;
    const k = 3;
    const field = new Float32Array(n * n);
    for (let y = 0; y < n; y += 1) for (let x = 0; x < n; x += 1) field[y * n + x] = 2 + Math.cos((2 * Math.PI * k * x) / n);
    const spec = dft2D(field, n);
    expect(spec.magnitude[0]).toBeCloseTo(2 * n * n, 6);
    expect(spec.magnitude[k]).toBeCloseTo((n * n) / 2, 6);
    expect(spec.magnitude[n - k]).toBeCloseTo((n * n) / 2, 6);
    expect(spec.magnitude[1] ?? 1).toBeLessThan(1e-4);
    expect(radialFrequency(k, 0, n)).toBeCloseTo(k / n, 12);
    expect(radialFrequency(n - k, 0, n)).toBeCloseTo(k / n, 12);
    const total = totalPowerExDc(spec);
    expect(bandPower(spec, 0, 0.2)).toBeCloseTo(total, 9);
    expect(bandPower(spec, 0.25, 1)).toBeCloseTo(0, 9);
    expect(() => dft2D(new Float32Array(3), 4)).toThrow(RangeError);
  });

  it("detrendAndWindow는 평균을 제거하고 cropWindow는 경계값으로 채운다", () => {
    const field = Float32Array.from([1, 2, 3, 4]);
    const dw = detrendAndWindow(field, 2);
    expect(dw[0]).toBeCloseTo(0, 12);
    expect(Array.from(cropWindow(field, 2, 2, 1, 1, 2))).toEqual([1, 2, 3, 4]);
    expect(Array.from(cropWindow(field, 2, 2, 2, 2, 2))).toEqual([4, 4, 4, 4]);
    expect(Array.from(cropWindow(field, 2, 2, 0, 0, 2))).toEqual([1, 1, 1, 1]);
  });
});

describe("lab-math 이미지", () => {
  it("toGray·toAlpha·imageToLab: 흰 1·검정 0·투명은 흰 배경, L*=100", () => {
    const white = solidImage(1, 1, WHITE);
    const black = solidImage(1, 1, [0, 0, 0, 255]);
    const clear = solidImage(1, 1);
    expect(toGray(white)[0]).toBeCloseTo(1, 6);
    expect(toGray(black)[0]).toBeCloseTo(0, 6);
    expect(toGray(clear)[0]).toBeCloseTo(1, 6);
    expect(toAlpha(black)[0]).toBe(1);
    expect(imageToLab(white)[0]).toBeCloseTo(100, 2);
    expect(imageToLab(black)[0]).toBeCloseTo(0, 2);
  });

  it("alphaMask·erodeMask·inkCentroid·downsample2x", () => {
    const img = alphaFieldImage(5, 5, (x, y) => (x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 1 : 0));
    const mask = alphaMask(img);
    expect(Array.from(mask).reduce((a, b) => a + b, 0)).toBe(9);
    const eroded = erodeMask(mask, 5, 5, 1);
    expect(Array.from(eroded).reduce((a, b) => a + b, 0)).toBe(1);
    expect(eroded[2 * 5 + 2]).toBe(1);
    const c = inkCentroid(img);
    expect(c.x).toBeCloseTo(2.5, 9);
    expect(c.y).toBeCloseTo(2.5, 9);
    expect(c.count).toBe(9);
    expect(inkCentroid(solidImage(4, 4)).count).toBe(0);
    const down = downsample2x(alphaFieldImage(4, 4, (x) => (x < 2 ? 1 : 0)));
    expect(down.width).toBe(2);
    expect(down.data[3]).toBe(255);
    expect(down.data[7]).toBe(0);
  });

  it("pathStations는 호 길이 균등 정류장과 접선을 주고 polylineLength는 길이를 준다", () => {
    const path: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
    ];
    expect(polylineLength(path)).toBe(20);
    const st = pathStations(path, 5);
    expect(st.map((s) => [s.x, s.y])).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10],
    ]);
    expect(st[1]).toMatchObject({ tx: 1, ty: 0, s: 5 });
    expect(st[3]).toMatchObject({ tx: 0, ty: 1, s: 15 });
    expect(pathStations([[1, 1]], 3).length).toBe(3);
  });

  it("normalProfile·profileWidth는 4 px 띠의 폭을 서브픽셀로 복원한다", () => {
    const img = bandImage(32, 32, 10, 14);
    const st = { x: 16, y: 12, tx: 1, ty: 0, s: 0 };
    const profile = normalProfile(img, st, 8, 0.5);
    expect(profile.length).toBe(33);
    expect(profileWidth(profile, 0.5)).toBeCloseTo(4, 1);
    expect(profileWidth(profile, 0.5, 8 / 255)).toBeGreaterThan(4.5);
    expect(profilePeak(profile)).toBeCloseTo(1, 6);
    expect(bilinearAlpha(img, 16, 12)).toBeCloseTo(1, 6);
    expect(bilinearAlpha(img, 16, 2)).toBe(0);
    expect(bilinearAlpha(img, -5, -5)).toBe(0);
    const offCenter = { x: 16, y: 20, tx: 1, ty: 0, s: 0 };
    expect(profileWidth(normalProfile(img, offCenter, 12, 0.5), 0.5)).toBeCloseTo(4, 1);
    const dim = bandImage(32, 32, 10, 14);
    for (let i = 3; i < dim.data.length; i += 4) dim.data[i] = Math.round((dim.data[i] ?? 0) * 0.3);
    expect(profileWidth(normalProfile(dim, st, 8, 0.5), 0.5)).toBeCloseTo(4, 1);
    expect(profileWidth(normalProfile(solidImage(32, 32), st, 8, 0.5), 0.5)).toBe(0);
  });
});
