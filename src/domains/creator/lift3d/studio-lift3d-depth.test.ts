import { describe, expect, it } from "vitest";

import {
  buildStudioLift3dDepthField,
  smoothStudioLift3dHeights,
  studioLift3dDistanceField,
  studioLift3dShadingField,
} from "./studio-lift3d-depth";
import {
  extractStudioLift3dMask,
  resampleStudioLift3dImage,
  type StudioLift3dMask,
} from "./studio-lift3d-mask";
import { discImage, verticalGradientImage } from "./studio-lift3d.test-fixture";

function solidMask(width: number, height: number, inset: number): StudioLift3dMask {
  const cells = new Uint8Array(width * height);
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) cells[y * width + x] = 1;
  }
  return {
    width,
    height,
    cells,
    bounds: { minX: inset, minY: inset, maxX: width - inset - 1, maxY: height - inset - 1 },
    coverage: ((width - inset * 2) * (height - inset * 2)) / (width * height),
    mode: "alpha",
    warnings: [],
  };
}

describe("Studio Lift 3D 깊이장", () => {
  it("거리장이 윤곽에서 0, 안쪽으로 갈수록 커진다", () => {
    const mask = solidMask(21, 21, 2);
    const distance = studioLift3dDistanceField(mask.cells, 21, 21);

    expect(distance[0]).toBe(0);
    // 윤곽 바로 안쪽 셀은 1픽셀 거리.
    expect(distance[2 * 21 + 2]).toBeCloseTo(1, 6);
    // 17×17 사각형의 중심 내접 거리는 9픽셀.
    expect(distance[10 * 21 + 10]).toBeCloseTo(9, 6);
  });

  it("격자 밖을 배경으로 취급해 화면에 잘린 피사체도 그 변에서 닫힌다", () => {
    const width = 9;
    const height = 9;
    const cells = new Uint8Array(width * height).fill(1);
    const distance = studioLift3dDistanceField(cells, width, height);

    expect(distance[0]).toBeCloseTo(1, 6);
    expect(distance[4 * width + 4]).toBeCloseTo(5, 6);
  });

  it("round 프로파일은 윤곽에서 0, 가장 두꺼운 곳에서 1 을 준다", () => {
    const mask = solidMask(25, 25, 2);
    const grid = resampleStudioLift3dImage(discImage(25), 25);
    const field = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 0 });

    expect(field.heights[2 * 25 + 2]).toBeCloseTo(0, 6);
    expect(field.heights[12 * 25 + 12]).toBeCloseTo(1, 6);
    // 원형 단면이라 절반 거리에서 이미 높이가 절반을 크게 넘는다(납작하지 않다).
    expect(field.heights[7 * 25 + 12]).toBeGreaterThan(0.8);
  });

  it("slab 프로파일은 얇은 베벨만 남기고 곧바로 최대 두께에 도달한다", () => {
    const mask = solidMask(25, 25, 2);
    const grid = resampleStudioLift3dImage(discImage(25), 25);
    const field = buildStudioLift3dDepthField(mask, grid, { profile: "slab", smoothing: 0 });

    expect(field.heights[2 * 25 + 2]).toBeCloseTo(0, 6);
    expect(field.heights[6 * 25 + 12]).toBeCloseTo(1, 6);
  });

  it("명암장을 피사체 안쪽 범위로 정규화한다", () => {
    const source = verticalGradientImage(32);
    const grid = resampleStudioLift3dImage(source, 32);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const shading = studioLift3dShadingField(grid, mask.cells);

    expect(shading[0]).toBeCloseTo(0, 6);
    expect(shading[31 * 32 + 16]).toBeCloseTo(1, 6);
  });

  it("relief 프로파일은 밝은 면을 앞으로 내보내고 invert 로 뒤집힌다", () => {
    const source = verticalGradientImage(32);
    const grid = resampleStudioLift3dImage(source, 32);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });

    const lit = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });
    const inverted = buildStudioLift3dDepthField(mask, grid, {
      profile: "relief",
      smoothing: 0,
      invertRelief: true,
    });

    const bottom = 31 * 32 + 16;
    const top = 16;
    expect(lit.heights[bottom]!).toBeGreaterThan(lit.heights[top]!);
    expect(inverted.heights[bottom]!).toBeLessThan(inverted.heights[top]!);
  });

  it("평활은 봉합선(윤곽 접촉 셀)의 높이 0 을 건드리지 않는다", () => {
    const mask = solidMask(21, 21, 2);
    const heights = new Float64Array(21 * 21);
    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = mask.cells[index] === 1 ? 1 : 0;
    }
    heights[2 * 21 + 2] = 0;

    const smoothed = smoothStudioLift3dHeights(heights, mask.cells, 21, 21, 4, true);

    expect(smoothed[2 * 21 + 2]).toBe(0);
    expect(smoothed[10 * 21 + 10]).toBeCloseTo(1, 6);
  });

  it("같은 입력에 같은 깊이장을 준다(결정론)", () => {
    const grid = resampleStudioLift3dImage(discImage(64), 48);
    const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
    const first = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 2 });
    const second = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 2 });

    expect(Array.from(first.heights)).toEqual(Array.from(second.heights));
  });
});
