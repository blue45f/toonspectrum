import { describe, expect, it } from "vitest";

import {
  renderStudioPresetTiledRegion,
  STUDIO_PRESET_TILE_SOURCE_PIXELS,
  type StudioPresetRasterRegion,
  type StudioPresetTiledRasterSource,
} from "./studio-preset-tiled-raster";

function source(width: number, height: number, pixel: (x: number, y: number) => readonly number[]) {
  const reads: StudioPresetRasterRegion[] = [];
  const raster: StudioPresetTiledRasterSource = {
    kind: "studio-preset-tiled-raster", width, height,
    readRegion: (region) => {
      reads.push(region);
      expect(region.width * region.height).toBeLessThanOrEqual(STUDIO_PRESET_TILE_SOURCE_PIXELS);
      const bytes = new Uint8Array(region.width * region.height * 4);
      for (let y = 0; y < region.height; y += 1) {
        for (let x = 0; x < region.width; x += 1) bytes.set(pixel(x + region.x, y + region.y), (y * region.width + x) * 4);
      }
      return bytes;
    },
  };
  return { raster, reads };
}

async function render(raster: StudioPresetTiledRasterSource, width: number, height: number, split = height) {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let start = 0; start < height; start += split) {
    await renderStudioPresetTiledRegion(raster, width, height, { x: 0, y: start, width, height: Math.min(split, height - start) }, (tile, bytes) => {
      for (let y = 0; y < tile.height; y += 1) output.set(bytes.subarray(y * tile.width * 4, (y + 1) * tile.width * 4), ((tile.y + y) * width + tile.x) * 4);
    });
  }
  return output;
}

describe("규격 내보내기 원본 타일 처리", () => {
  it("단일 캔버스 범위를 넘는 원고 끝에서도 원본 해상도와 투명 픽셀 색을 그대로 보존한다", async () => {
    const { raster, reads } = source(720, 500_000, (x, y) => [x % 256, y % 256, 91, 0]);
    const region = { x: 500, y: 499_998, width: 220, height: 2 };
    const values: number[] = [];
    await renderStudioPresetTiledRegion(raster, raster.width, raster.height, region, (tile, rgba) => {
      for (let y = 0; y < tile.height; y += 1) {
        for (let x = 0; x < tile.width; x += 1) {
          expect([...rgba.subarray((y * tile.width + x) * 4, (y * tile.width + x + 1) * 4)])
            .toEqual([(tile.x + x) % 256, (tile.y + y) % 256, 91, 0]);
        }
      }
      values.push(rgba.length);
    });
    expect(values.reduce((sum, value) => sum + value, 0)).toBe(region.width * region.height * 4);
    expect(reads.every((read) => read.height <= 2)).toBe(true);
  });

  it("Lanczos3의 픽셀 중심은 타일·파일 절단 위치와 무관해 얇은 선과 부분 알파가 이어진다", async () => {
    const { raster } = source(519, 1_021, (x, y) => [210, 45, 91, x % 29 < 2 || y % 37 < 2 ? 192 : 0]);
    const whole = await render(raster, 173, 341);
    const sliced = await render(raster, 173, 341, 47);
    expect(sliced).toEqual(whole);
    expect(whole.some((value, index) => index % 4 === 3 && value > 0 && value < 192)).toBe(true);
    for (let offset = 0; offset < whole.length; offset += 4) {
      if ((whole[offset + 3] ?? 0) > 10) expect([...whole.subarray(offset, offset + 3)]).toEqual([210, 45, 91]);
    }
  });

  it("큰 축소 입력은 커널 여백을 포함한 읽기 영역을 다시 나누고 출력 픽셀을 누락하지 않는다", async () => {
    const { raster, reads } = source(4_099, 4_101, () => [33, 87, 125, 255]);
    const output = await render(raster, 129, 129);
    expect(reads.length).toBeGreaterThan(1);
    for (let offset = 0; offset < output.length; offset += 4) expect([...output.subarray(offset, offset + 4)]).toEqual([33, 87, 125, 255]);
  });

  it("읽기 실패나 잘못된 픽셀 크기에는 다른 렌더러로 재실행하지 않는다", async () => {
    const { raster } = source(32, 32, () => [1, 2, 3, 255]);
    await expect(render({ ...raster, readRegion: () => new Uint8Array(4) }, 16, 16)).rejects.toThrow("픽셀 크기");
    await expect(render({ ...raster, readRegion: () => { throw new Error("읽기 실패"); } }, 16, 16)).rejects.toThrow("읽기 실패");
  });
});
