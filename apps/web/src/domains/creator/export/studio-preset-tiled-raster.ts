/** 전체 페이지의 RGBA 사본을 만들지 않는 원본 해상도 읽기 계약. */
export interface StudioPresetRasterRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioPresetTiledRasterSource {
  readonly kind: "studio-preset-tiled-raster";
  readonly width: number;
  readonly height: number;
  readRegion(region: StudioPresetRasterRegion): Promise<Uint8Array> | Uint8Array;
}

export const STUDIO_PRESET_TILE_SOURCE_PIXELS = 2_048 * 2_048;
const OUTPUT_TILE_EDGE = 128;

interface SampleWeight { readonly index: number; readonly weight: number }

function lanczos3(distance: number): number {
  const x = Math.abs(distance);
  if (x < 1e-10) return 1;
  if (x >= 3) return 0;
  return Math.sin(Math.PI * x) * Math.sin(Math.PI * x / 3) / (Math.PI * Math.PI * x * x / 3);
}

/** 타일 위치와 무관한 전역 픽셀 중심으로 커널을 정해 경계의 위상 차이를 없앤다. */
function sampleWeights(output: number, sourceSize: number, targetSize: number): SampleWeight[] {
  if (sourceSize === targetSize) return [{ index: output, weight: 1 }];
  // libvips resize의 reducing-gap=2와 같은 정수 box 선필터 후 Lanczos3.
  // 강한 축소에서도 고주파 앨리어싱을 줄이며 원본 구간의 모든 픽셀이 가중치에 참여한다.
  const shrink = Math.max(1, Math.floor(sourceSize / targetSize / 2));
  const scale = Math.min(1, targetSize * shrink / sourceSize);
  const center = (output + 0.5) * sourceSize / targetSize / shrink - 0.5;
  const radius = 3 / scale;
  const weights = new Map<number, number>();
  let total = 0;
  for (let index = Math.ceil(center - radius); index <= Math.floor(center + radius); index += 1) {
    const weight = lanczos3((index - center) * scale);
    if (weight === 0) continue;
    for (let offset = 0; offset < shrink; offset += 1) {
      const clamped = Math.max(0, Math.min(sourceSize - 1, index * shrink + offset));
      weights.set(clamped, (weights.get(clamped) ?? 0) + weight / shrink);
    }
    total += weight;
  }
  return Array.from(weights, ([index, weight]) => ({ index, weight: weight / total }));
}

function assertGeometry(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("타일 내보내기의 원본 또는 출력 크기가 올바르지 않아요.");
  }
}

/**
 * 원본 픽셀을 Lanczos3로 한 번만 리샘플한다. 출력 규격이 원본과 같으면 픽셀을 그대로
 * 복사하며, 축소 시에는 premultiplied alpha로 계산해 투명 경계의 색 번짐을 막는다.
 * 각 읽기는 최대 2048² 픽셀이고 다음 타일 전에 소비하므로 길이와 무관하게 메모리가 제한된다.
 */
export async function renderStudioPresetTiledRegion(
  source: StudioPresetTiledRasterSource,
  targetWidth: number,
  targetHeight: number,
  region: StudioPresetRasterRegion,
  consume: (tile: StudioPresetRasterRegion, rgba: Uint8ClampedArray) => void | Promise<void>,
): Promise<void> {
  assertGeometry(source.width, source.height);
  assertGeometry(targetWidth, targetHeight);
  assertGeometry(region.width, region.height);
  if (!Number.isSafeInteger(region.x) || !Number.isSafeInteger(region.y) || region.x < 0 || region.y < 0
    || region.x + region.width > targetWidth || region.y + region.height > targetHeight) {
    throw new Error("타일 내보내기 영역이 페이지를 벗어났어요.");
  }
  const render = async (tile: StudioPresetRasterRegion): Promise<void> => {
    const horizontal = Array.from({ length: tile.width }, (_, x) => sampleWeights(tile.x + x, source.width, targetWidth));
    const vertical = Array.from({ length: tile.height }, (_, y) => sampleWeights(tile.y + y, source.height, targetHeight));
    const firstX = horizontal[0]?.[0]?.index;
    const firstY = vertical[0]?.[0]?.index;
    const lastX = horizontal.at(-1)?.at(-1)?.index;
    const lastY = vertical.at(-1)?.at(-1)?.index;
    if (firstX === undefined || firstY === undefined || lastX === undefined || lastY === undefined) {
      throw new Error("타일 리샘플 커널을 준비하지 못했어요.");
    }
    const input = { x: firstX, y: firstY, width: lastX - firstX + 1, height: lastY - firstY + 1 };
    if (input.width * input.height > STUDIO_PRESET_TILE_SOURCE_PIXELS
      || tile.width * input.height > 1_048_576) {
      const axis = tile.width >= tile.height && tile.width > 1 ? "width" : "height";
      if (tile[axis] <= 1) throw new Error("한 픽셀의 리샘플 범위가 타일 메모리 예산을 넘어요. 출력 규격을 확인해 주세요.");
      const size = Math.floor(tile[axis] / 2);
      await render({ ...tile, [axis]: size });
      await render({ ...tile, [axis === "width" ? "x" : "y"]: tile[axis === "width" ? "x" : "y"] + size, [axis]: tile[axis] - size });
      return;
    }
    const pixels = await source.readRegion(input);
    if (pixels.length !== input.width * input.height * 4) throw new Error("타일 픽셀 크기가 원본 영역과 다릅니다.");
    const output = new Uint8ClampedArray(tile.width * tile.height * 4);
    if (source.width === targetWidth && source.height === targetHeight) {
      output.set(pixels);
    } else {
      // 가로 패스를 먼저 계산해 2차원 커널의 곱만큼 원본 읽기가 늘어나지 않게 한다.
      const rows = new Float64Array(tile.width * input.height * 4);
      for (let y = 0; y < input.height; y += 1) {
        for (let x = 0; x < tile.width; x += 1) {
          const offset = (y * tile.width + x) * 4;
          for (const sample of horizontal[x] ?? []) {
            const index = (y * input.width + sample.index - input.x) * 4;
            const alpha = (pixels[index + 3] ?? 0) / 255;
            for (let channel = 0; channel < 3; channel += 1) rows[offset + channel] += (pixels[index + channel] ?? 0) * alpha * sample.weight;
            rows[offset + 3] += alpha * sample.weight;
          }
        }
      }
      for (let y = 0; y < tile.height; y += 1) {
        for (let x = 0; x < tile.width; x += 1) {
          const values = [0, 0, 0, 0];
          for (const sample of vertical[y] ?? []) {
            const offset = ((sample.index - input.y) * tile.width + x) * 4;
            for (let channel = 0; channel < 4; channel += 1) values[channel] += (rows[offset + channel] ?? 0) * sample.weight;
          }
          const offset = (y * tile.width + x) * 4;
          const alpha = Math.max(0, Math.min(1, values[3] ?? 0));
          output[offset + 3] = Math.round(alpha * 255);
          for (let channel = 0; channel < 3; channel += 1) output[offset + channel] = alpha > 0 ? Math.round((values[channel] ?? 0) / alpha) : 0;
        }
      }
    }
    await consume(tile, output);
  };
  for (let y = region.y; y < region.y + region.height; y += OUTPUT_TILE_EDGE) {
    for (let x = region.x; x < region.x + region.width; x += OUTPUT_TILE_EDGE) {
      await render({ x, y, width: Math.min(OUTPUT_TILE_EDGE, region.x + region.width - x), height: Math.min(OUTPUT_TILE_EDGE, region.y + region.height - y) });
    }
  }
}

export function studioPresetCanvasTileSource(canvas: HTMLCanvasElement): StudioPresetTiledRasterSource {
  return {
    kind: "studio-preset-tiled-raster", width: canvas.width, height: canvas.height,
    readRegion: ({ x, y, width, height }) => {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("원본 페이지의 타일 픽셀을 읽지 못했어요.");
      const { data } = context.getImageData(x, y, width, height);
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    },
  };
}
