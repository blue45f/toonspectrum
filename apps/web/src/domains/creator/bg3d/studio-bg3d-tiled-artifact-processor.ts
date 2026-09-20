import { createStudioBg3dDepthRasterLayer } from "./studio-bg3d-depth-pass";
import { renderStudioBg3dLtLayers } from "./studio-bg3d-lt-render";
import { selectStudioBg3dShotPassLayers } from "./studio-bg3d-shot-pass-layers";
import { StudioBg3dStreamingPng } from "./studio-bg3d-streaming-png";
import { validateStudioBg3dTiledOptions } from "./studio-bg3d-tiled-artifact-contract";
import type { StudioBg3dCapturedRaster } from "./studio-bg3d-capture-adapter";
import type { StudioBg3dLtRasterLayer } from "./studio-bg3d-lt-render";
import type { StudioBg3dShotBatchPass } from "./studio-bg3d-shot-batch-pass-catalog";
import type {
  StudioBg3dTiledArtifactOptions,
  StudioBg3dTiledArtifactResult,
} from "./studio-bg3d-tiled-artifact-contract";
import type {
  StudioBg3dOutputTile,
  StudioBg3dTilePlan,
} from "./studio-bg3d-tile-plan";

/** Stable source-over in sRGB byte space, matching the existing PNG pass paint order. */
function writeCore(
  band: Uint8Array,
  imageWidth: number,
  tile: StudioBg3dOutputTile,
  layers: readonly StudioBg3dLtRasterLayer[],
): boolean {
  const { core, capture } = tile;
  let any = false;
  for (let y = 0; y < core.height; y++)
    for (let x = 0; x < core.width; x++) {
      const source =
        ((core.y - capture.y + y) * capture.width + core.x - capture.x + x) * 4;
      const destination = (y * imageWidth + core.x + x) * 4;
      let alpha = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const layer of layers) {
        const a = layer.data[source + 3]! / 255;
        if (a === 0) continue;
        r = layer.data[source]! * a + r * (1 - a);
        g = layer.data[source + 1]! * a + g * (1 - a);
        b = layer.data[source + 2]! * a + b * (1 - a);
        alpha = a + alpha * (1 - a);
      }
      if (alpha > 0) {
        band[destination] = Math.round(r / alpha);
        band[destination + 1] = Math.round(g / alpha);
        band[destination + 2] = Math.round(b / alpha);
        band[destination + 3] = Math.round(alpha * 255);
        any = true;
      }
    }
  return any;
}
interface PassState {
  readonly pass: StudioBg3dShotBatchPass;
  readonly encoder: StudioBg3dStreamingPng;
  band: Uint8Array<ArrayBuffer>;
  any: boolean;
  reason: "disabled" | "unavailable";
}
export class StudioBg3dTiledArtifactProcessor {
  readonly plan: StudioBg3dTilePlan;
  private readonly options: StudioBg3dTiledArtifactOptions;
  private readonly passes: PassState[] = [];
  private next = 0;
  private closed = false;
  constructor(value: unknown) {
    const parsed = validateStudioBg3dTiledOptions(value);
    this.plan = parsed.plan;
    this.options = parsed.options;
    // Validate settings with existing production math before starting compression streams.
    renderStudioBg3dLtLayers(
      { width: 1, height: 1, rgba: new Uint8Array(4) },
      this.options.settings,
    );
    for (const pass of this.options.passes)
      this.passes.push({
        pass,
        encoder: new StudioBg3dStreamingPng(this.plan.width, this.plan.height),
        band: new Uint8Array(
          this.plan.width *
            Math.min(this.plan.height, this.plan.bandHeight) *
            4,
        ),
        any: pass === "beauty",
        reason: "unavailable",
      });
  }
  async append(index: number, raster: StudioBg3dCapturedRaster): Promise<void> {
    if (this.closed || index !== this.next || !Number.isSafeInteger(index))
      throw new Error("Unexpected or replayed output tile.");
    const tile = this.plan.tiles[index];
    if (
      !tile ||
      raster.width !== tile.capture.width ||
      raster.height !== tile.capture.height
    )
      throw new RangeError("Tile pixels do not match the output plan.");
    if (
      this.options.includeDepth !== undefined &&
      Boolean(raster.depth) !== this.options.includeDepth
    )
      throw new Error("Unexpected or missing tile depth.");
    if (
      this.options.includeNormals !== undefined &&
      Boolean(raster.normalRgba) !== this.options.includeNormals
    )
      throw new Error("Unexpected or missing tile normals.");
    const layers = renderStudioBg3dLtLayers(
      { ...raster, window: tile.capture },
      this.options.settings,
    );
    for (const pass of this.passes) {
      const selected = selectStudioBg3dShotPassLayers(
        pass.pass,
        raster,
        layers,
        this.options.settings,
        createStudioBg3dDepthRasterLayer,
      );
      pass.reason = selected.skipReason;
      if (selected.layers)
        pass.any =
          writeCore(pass.band, this.plan.width, tile, selected.layers) ||
          pass.any;
    }
    if ((index + 1) % this.plan.columns === 0) {
      for (const pass of this.passes) {
        await pass.encoder.appendRows(pass.band, tile.core.height);
        const remaining = this.plan.height - tile.core.y - tile.core.height;
        pass.band = new Uint8Array(
          this.plan.width * Math.min(this.plan.bandHeight, remaining) * 4,
        );
      }
    }
    this.next++;
  }
  async finish(): Promise<StudioBg3dTiledArtifactResult> {
    if (this.closed || this.next !== this.plan.tiles.length)
      throw new Error("Cannot finish incomplete tiled output.");
    this.closed = true;
    const images: { pass: StudioBg3dShotBatchPass; png: Blob }[] = [],
      skipped: {
        pass: StudioBg3dShotBatchPass;
        reason: "disabled" | "unavailable";
      }[] = [];
    try {
      for (const pass of this.passes) {
        if (pass.any)
          images.push({ pass: pass.pass, png: await pass.encoder.finish() });
        else {
          skipped.push({ pass: pass.pass, reason: pass.reason });
          await pass.encoder.abort();
        }
      }
      return { images, skipped };
    } catch (error) {
      await this.abort();
      throw error;
    }
  }
  async abort(): Promise<void> {
    this.closed = true;
    for (const pass of this.passes) pass.band = new Uint8Array();
    await Promise.allSettled(this.passes.map((pass) => pass.encoder.abort()));
  }
}
