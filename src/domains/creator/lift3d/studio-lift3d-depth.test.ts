import { describe, expect, it } from "vitest";

import {
  buildStudioLift3dDepthBands,
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

  it("밴드가 한 칸씩 겹쳐 경계 사각형을 잃지 않는다", () => {
    // 깔끔한 분할이면 두 밴드가 맞닿는 사각형은 네 꼭짓점이 한 밴드에 다 들어가지 못해
    // 어느 카드도 만들지 않는다. 겹치기 전에는 부드러운 그라데이션에서도 13%가 사라졌다.
    const source = verticalGradientImage(64);
    const grid = resampleStudioLift3dImage(source, 32);
    const mask = extractStudioLift3dMask(grid, { mode: "full" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "relief", smoothing: 0 });
    const bands = buildStudioLift3dDepthBands(mask, depth, 5);

    const quadsOf = (cells: Uint8Array): number => {
      let count = 0;
      for (let j = 0; j + 1 < mask.height; j += 1) {
        for (let i = 0; i + 1 < mask.width; i += 1) {
          const a = cells[j * mask.width + i]!;
          const b = cells[j * mask.width + i + 1]!;
          const c = cells[(j + 1) * mask.width + i + 1]!;
          const d = cells[(j + 1) * mask.width + i]!;
          if (a === 1 && b === 1 && c === 1 && d === 1) count += 1;
        }
      }
      return count;
    };

    const whole = quadsOf(mask.cells);
    const covered = bands.reduce((sum, band) => sum + quadsOf(band.cells), 0);
    expect(whole).toBeGreaterThan(0);
    // 겹침 덕에 합이 전체보다 크거나 같다 — 빠진 띠가 없다는 뜻이다.
    expect(covered).toBeGreaterThanOrEqual(whole);
  });

  it("2×2 안에서 밴드가 대각으로 엇갈려도 빠지는 사각형이 없다", () => {
    // 4방향으로만 부풀리면 2×2 네 칸이 서로 다른 밴드로 갈릴 때 **어느 밴드도** 그 2×2 를
    // 전부 갖지 못해 사각형이 통째로 사라진다. 실루엣에 구멍이 뚫리는데 경고도 없다.
    const width = 12;
    const height = 12;
    const mask = solidMask(width, height, 0);
    const heights = new Float64Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        // 체커보드로 네 버킷을 깔면 **어떤 2×2 든 네 칸이 모두 다른 밴드**가 된다.
        heights[y * width + x] = ((x % 2) + 2 * (y % 2) + 0.5) / 4;
      }
    }
    const depth = { width, height, heights, maxDistance: 6 };

    const bands = buildStudioLift3dDepthBands(mask, depth, 4);

    expect(bands).toHaveLength(4);
    const covers = (cells: Uint8Array, x: number, y: number): boolean =>
      cells[y * width + x] === 1
      && cells[y * width + x + 1] === 1
      && cells[(y + 1) * width + x] === 1
      && cells[(y + 1) * width + x + 1] === 1;
    const orphans: string[] = [];
    for (let y = 0; y + 1 < height; y += 1) {
      for (let x = 0; x + 1 < width; x += 1) {
        if (!covers(mask.cells, x, y)) continue;
        if (!bands.some((band) => covers(band.cells, x, y))) orphans.push(`${x},${y}`);
      }
    }

    expect(orphans).toEqual([]);
  });

  it("밴드는 마스크 밖으로 새어 나가지 않는다", () => {
    const grid = resampleStudioLift3dImage(discImage(64), 32);
    const mask = extractStudioLift3dMask(grid, { mode: "alpha" });
    const depth = buildStudioLift3dDepthField(mask, grid, { profile: "round", smoothing: 0 });

    for (const band of buildStudioLift3dDepthBands(mask, depth, 4)) {
      for (let index = 0; index < band.cells.length; index += 1) {
        if (band.cells[index] === 1) expect(mask.cells[index]).toBe(1);
      }
    }
  });
});
