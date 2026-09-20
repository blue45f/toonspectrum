/** Output dimensions and processing-tile budgets are intentionally distinct. */
export const STUDIO_BG3D_TILED_OUTPUT_MAX_EDGE = 4096;
export const STUDIO_BG3D_TILED_OUTPUT_MAX_PIXELS = 4096 * 4096;
export const STUDIO_BG3D_TILE_PROFILE =
  "studio-full-frustum-global-lt-tiles-v1" as const;
export const STUDIO_BG3D_TILE_HALO = 12;
export interface StudioBg3dPixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface StudioBg3dRasterWindow extends StudioBg3dPixelRect {
  readonly fullWidth: number;
  readonly fullHeight: number;
}
export interface StudioBg3dOutputTile {
  readonly index: number;
  readonly band: number;
  readonly core: StudioBg3dPixelRect;
  readonly capture: StudioBg3dRasterWindow;
}
export interface StudioBg3dTilePlan {
  readonly width: number;
  readonly height: number;
  readonly tileWidth: number;
  readonly bandHeight: number;
  readonly columns: number;
  readonly bands: number;
  readonly tiles: readonly StudioBg3dOutputTile[];
}
export function assertStudioBg3dRasterWindow(
  window: StudioBg3dRasterWindow,
): void {
  if (
    !window ||
    typeof window !== "object" ||
    Array.isArray(window) ||
    Object.keys(window).length !== 6 ||
    ![
      window.x,
      window.y,
      window.width,
      window.height,
      window.fullWidth,
      window.fullHeight,
    ].every(Number.isSafeInteger) ||
    window.x < 0 ||
    window.y < 0 ||
    window.width < 1 ||
    window.height < 1 ||
    window.fullWidth < 1 ||
    window.fullHeight < 1 ||
    window.fullWidth > STUDIO_BG3D_TILED_OUTPUT_MAX_EDGE ||
    window.fullHeight > STUDIO_BG3D_TILED_OUTPUT_MAX_EDGE ||
    window.x + window.width > window.fullWidth ||
    window.y + window.height > window.fullHeight
  ) {
    throw new RangeError("Invalid bounded full-image pixel window.");
  }
}
export function createStudioBg3dTilePlan(input: {
  readonly width: number;
  readonly height: number;
  readonly tileWidth?: number;
  readonly bandHeight?: number;
}): StudioBg3dTilePlan {
  const width = input.width,
    height = input.height;
  assertStudioBg3dRasterWindow({
    x: 0,
    y: 0,
    width,
    height,
    fullWidth: width,
    fullHeight: height,
  });
  const tileWidth = input.tileWidth ?? 1024,
    bandHeight = input.bandHeight ?? 512;
  if (
    !Number.isSafeInteger(tileWidth) ||
    tileWidth < 16 ||
    tileWidth > 1024 ||
    !Number.isSafeInteger(bandHeight) ||
    bandHeight < 16 ||
    bandHeight > 512
  )
    throw new RangeError("Invalid bounded tile dimensions.");
  const columns = Math.ceil(width / tileWidth),
    bands = Math.ceil(height / bandHeight);
  if (columns * bands > 1024) throw new RangeError("Too many output tiles.");
  const tiles: StudioBg3dOutputTile[] = [];
  for (let band = 0; band < bands; band++)
    for (let column = 0; column < columns; column++) {
      const core = Object.freeze({
        x: column * tileWidth,
        y: band * bandHeight,
        width: Math.min(tileWidth, width - column * tileWidth),
        height: Math.min(bandHeight, height - band * bandHeight),
      });
      const x = Math.max(0, core.x - STUDIO_BG3D_TILE_HALO),
        y = Math.max(0, core.y - STUDIO_BG3D_TILE_HALO);
      const right = Math.min(
          width,
          core.x + core.width + STUDIO_BG3D_TILE_HALO,
        ),
        bottom = Math.min(height, core.y + core.height + STUDIO_BG3D_TILE_HALO);
      tiles.push(
        Object.freeze({
          index: tiles.length,
          band,
          core,
          capture: Object.freeze({
            x,
            y,
            width: right - x,
            height: bottom - y,
            fullWidth: width,
            fullHeight: height,
          }),
        }),
      );
    }
  return Object.freeze({
    width,
    height,
    tileWidth,
    bandHeight,
    columns,
    bands,
    tiles: Object.freeze(tiles),
  });
}
