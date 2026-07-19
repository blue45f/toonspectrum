/**
 * Batch-only artifact production for one frozen 3D shot.
 *
 * The interactive editor owns applying the shot, capturing renderer pixels, recovery authorization,
 * and publishing committed artifacts. This module owns the deterministic captured-pixels ->
 * LT/pass PNG/optional PSD staging contract and remains behind the shot-batch runtime boundary.
 */

import { waitForStudioBg3dCapturePhase } from "./studio-bg3d-capture-adapter";
import { createStudioBg3dDepthRasterLayer } from "./studio-bg3d-depth-pass";
import {
  renderStudioBg3dLtLayers,
  type StudioBg3dLtRasterInput,
  type StudioBg3dLtRasterLayer,
  type StudioBg3dLtRenderResult,
  type StudioBg3dLtRenderSettings,
} from "./studio-bg3d-lt-render";
import {
  renderStudioBg3dLtLayersInWorker,
  StudioBg3dLtRenderWorkerError,
} from "./studio-bg3d-lt-render-worker-client";
import {
  STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES,
  STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES,
} from "./studio-bg3d-shot-batch";
import { STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION } from "./studio-bg3d-shot-batch-limits";
import {
  admitStudioBg3dShotPsdLayers,
  type StudioBg3dShotPsdAdmission,
} from "./studio-bg3d-shot-psd-contract";
import { buildStudioBg3dShotLayeredPsdInWorker } from "./studio-bg3d-shot-psd-worker-client";

import type { StudioBg3dCapturedRaster } from "./studio-bg3d-capture-adapter";
import type {
  StudioBg3dShotBatchImage,
  StudioBg3dShotBatchLayeredPsd,
  StudioBg3dShotBatchPsdFallback,
  StudioBg3dShotBatchSkippedArtifact,
} from "./studio-bg3d-shot-batch";
import type {
  StudioBg3dShotBatchPass,
  StudioBg3dShotBatchPlannedShot,
} from "./studio-bg3d-shot-batch-plan";

const STUDIO_BG3D_LT_RENDER_SYNC_FALLBACK_MAX_PIXELS = 1_048_576;

export interface StudioBg3dShotArtifactPipelineInput {
  readonly shot: StudioBg3dShotBatchPlannedShot;
  readonly captured: StudioBg3dCapturedRaster;
  readonly settings: StudioBg3dLtRenderSettings;
  readonly passes: readonly StudioBg3dShotBatchPass[];
  readonly includeLayeredPsd: boolean;
  /** Bytes already committed by earlier shots in this recovery session. */
  readonly committedArtifactBytes: number;
  readonly signal?: AbortSignal;
}

export interface StudioBg3dShotArtifactPipelineResult {
  readonly images: readonly StudioBg3dShotBatchImage[];
  readonly skippedArtifacts: readonly StudioBg3dShotBatchSkippedArtifact[];
  readonly layeredPsds: readonly StudioBg3dShotBatchLayeredPsd[];
  readonly psdFallbacks: readonly StudioBg3dShotBatchPsdFallback[];
  /** Bytes staged by this shot only. */
  readonly artifactBytes: number;
}

export interface StudioBg3dShotArtifactPipelineDependencies {
  readonly renderLtInWorker: (
    input: StudioBg3dLtRasterInput,
    settings: StudioBg3dLtRenderSettings,
    options: { readonly signal?: AbortSignal },
  ) => Promise<StudioBg3dLtRenderResult>;
  readonly renderLtSynchronously: (
    input: StudioBg3dLtRasterInput,
    settings: StudioBg3dLtRenderSettings,
  ) => StudioBg3dLtRenderResult;
  readonly createDepthLayer: (
    width: number,
    height: number,
    depth: Float32Array,
  ) => StudioBg3dLtRasterLayer;
  readonly encodePng: (
    layers: readonly StudioBg3dLtRasterLayer[],
    options: { readonly signal?: AbortSignal; readonly timeoutMs?: number },
  ) => Promise<Blob>;
  readonly admitPsdLayers: (
    layers: readonly StudioBg3dLtRasterLayer[],
  ) => StudioBg3dShotPsdAdmission;
  readonly buildLayeredPsdInWorker: (
    layers: readonly StudioBg3dLtRasterLayer[],
    options: { readonly signal?: AbortSignal; readonly timeoutMs?: number },
  ) => Promise<Blob>;
  readonly workersAvailable: () => boolean;
  readonly maxImageBytes: number;
  readonly maxTotalBytes: number;
}

interface PassLayerSelection {
  readonly layers: readonly StudioBg3dLtRasterLayer[] | null;
  readonly skipReason: StudioBg3dShotBatchSkippedArtifact["reason"];
}

async function encodeStudioBg3dLtCompositeToPngBlob(
  layers: readonly StudioBg3dLtRasterLayer[],
  options: { readonly signal?: AbortSignal; readonly timeoutMs?: number } = {},
): Promise<Blob> {
  const width = layers[0]?.width ?? 0;
  const height = layers[0]?.height ?? 0;
  if (
    layers.length < 1 ||
    width < 1 ||
    height < 1 ||
    width > STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION ||
    height > STUDIO_BG3D_SHOT_BATCH_MAX_DIMENSION ||
    layers.some((layer) => (
      layer.width !== width ||
      layer.height !== height ||
      layer.data.byteLength !== width * height * 4
    ))
  ) {
    throw new RangeError("컷 LT 레이어가 PNG 출력 예산과 일치하지 않습니다.");
  }
  const compositeCanvas = document.createElement("canvas");
  const layerCanvas = document.createElement("canvas");
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  layerCanvas.width = width;
  layerCanvas.height = height;
  const compositeContext = compositeCanvas.getContext("2d");
  const layerContext = layerCanvas.getContext("2d");
  if (!compositeContext || !layerContext) {
    throw new Error("컷 LT PNG 인코더를 준비하지 못했습니다.");
  }
  let blob: Blob | null;
  try {
    for (const layer of layers) {
      if (options.signal?.aborted) {
        const error = new Error("컷 일괄 렌더를 취소했습니다.");
        error.name = "AbortError";
        throw error;
      }
      layerContext.clearRect(0, 0, width, height);
      const imageBytes = new Uint8ClampedArray(layer.data.length);
      imageBytes.set(layer.data);
      layerContext.putImageData(new ImageData(imageBytes, width, height), 0, 0);
      compositeContext.drawImage(layerCanvas, 0, 0);
    }
    blob = await waitForStudioBg3dCapturePhase(
      new Promise<Blob | null>((resolve) => compositeCanvas.toBlob(resolve, "image/png")),
      options,
    );
  } finally {
    layerCanvas.width = 1;
    layerCanvas.height = 1;
    compositeCanvas.width = 1;
    compositeCanvas.height = 1;
  }
  if (!blob || blob.type !== "image/png") {
    throw new Error("컷 LT PNG 인코딩에 실패했습니다.");
  }
  return blob;
}

const DEFAULT_DEPENDENCIES: StudioBg3dShotArtifactPipelineDependencies = {
  renderLtInWorker: renderStudioBg3dLtLayersInWorker,
  renderLtSynchronously: renderStudioBg3dLtLayers,
  createDepthLayer: createStudioBg3dDepthRasterLayer,
  encodePng: encodeStudioBg3dLtCompositeToPngBlob,
  admitPsdLayers: admitStudioBg3dShotPsdLayers,
  buildLayeredPsdInWorker: buildStudioBg3dShotLayeredPsdInWorker,
  workersAvailable: () => typeof Worker === "function",
  maxImageBytes: STUDIO_BG3D_SHOT_BATCH_MAX_IMAGE_BYTES,
  maxTotalBytes: STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES,
};

function selectPassLayers(
  pass: StudioBg3dShotBatchPass,
  captured: StudioBg3dCapturedRaster,
  rendered: StudioBg3dLtRenderResult,
  settings: StudioBg3dLtRenderSettings,
  createDepthLayer: StudioBg3dShotArtifactPipelineDependencies["createDepthLayer"],
): PassLayerSelection {
  const mainLineConfigured = settings.line.enabled && settings.line.strength > 0;
  const textureLineConfigured = mainLineConfigured &&
    settings.line.textureLineEnabled && settings.line.textureLineStrength > 0;
  const toneConfigured = settings.tone.mode !== "none" && settings.tone.opacity > 0;
  const colorConfigured = toneConfigured && settings.tone.type === "color";
  const layerByRole = new Map(rendered.layers.map((layer) => [layer.role, layer] as const));

  if (pass === "beauty") {
    return {
      layers: [{
        role: "color",
        width: captured.width,
        height: captured.height,
        data: new Uint8ClampedArray(captured.rgba),
      }],
      skipReason: "disabled",
    };
  }
  if (pass === "lt-composite") {
    return {
      layers: rendered.layers.length > 0 ? rendered.layers : null,
      skipReason: mainLineConfigured || textureLineConfigured || toneConfigured
        ? "unavailable"
        : "disabled",
    };
  }
  if (pass === "depth") {
    return {
      layers: captured.depth
        ? [createDepthLayer(captured.width, captured.height, captured.depth)]
        : null,
      skipReason: "unavailable",
    };
  }

  const layer = layerByRole.get(pass);
  const configured = pass === "main-line"
    ? mainLineConfigured
    : pass === "texture-line"
      ? textureLineConfigured
      : pass === "tone"
        ? toneConfigured && settings.tone.type !== "color"
        : colorConfigured;
  return {
    layers: layer ? [layer] : null,
    skipReason: configured ? "unavailable" : "disabled",
  };
}

/**
 * Produces one shot's artifacts without publishing them. The caller must commit the returned batch
 * to recovery storage before exposing it to the local archive accumulator.
 */
export async function buildStudioBg3dShotArtifacts(
  input: StudioBg3dShotArtifactPipelineInput,
  dependencies: StudioBg3dShotArtifactPipelineDependencies = DEFAULT_DEPENDENCIES,
): Promise<StudioBg3dShotArtifactPipelineResult> {
  const ltRenderInput: StudioBg3dLtRasterInput = {
    width: input.captured.width,
    height: input.captured.height,
    rgba: input.captured.rgba,
    ...(input.captured.depth ? { depth: input.captured.depth } : {}),
  };
  const rendered = await dependencies.renderLtInWorker(
    ltRenderInput,
    input.settings,
    { signal: input.signal },
  ).catch((cause: unknown) => {
    if (
      cause instanceof StudioBg3dLtRenderWorkerError &&
      cause.code === "worker-unavailable" &&
      input.captured.width * input.captured.height <=
        STUDIO_BG3D_LT_RENDER_SYNC_FALLBACK_MAX_PIXELS
    ) {
      return dependencies.renderLtSynchronously(ltRenderInput, input.settings);
    }
    throw cause;
  });

  const images: StudioBg3dShotBatchImage[] = [];
  const skippedArtifacts: StudioBg3dShotBatchSkippedArtifact[] = [];
  const layeredPsds: StudioBg3dShotBatchLayeredPsd[] = [];
  const psdFallbacks: StudioBg3dShotBatchPsdFallback[] = [];
  let artifactBytes = 0;

  for (const pass of input.passes) {
    const selection = selectPassLayers(
      pass,
      input.captured,
      rendered,
      input.settings,
      dependencies.createDepthLayer,
    );
    if (!selection.layers) {
      skippedArtifacts.push({
        shotId: input.shot.shotId,
        shotName: input.shot.shotName,
        pass,
        reason: selection.skipReason,
      });
      continue;
    }
    const png = await dependencies.encodePng(selection.layers, {
      signal: input.signal,
      timeoutMs: 20_000,
    });
    if (
      png.size > dependencies.maxImageBytes ||
      input.committedArtifactBytes + artifactBytes + png.size > dependencies.maxTotalBytes
    ) {
      throw new RangeError("컷 PNG 합계가 브라우저 배치 메모리 예산을 벗어났습니다.");
    }
    artifactBytes += png.size;
    images.push({
      shotId: input.shot.shotId,
      shotName: input.shot.shotName,
      width: rendered.width,
      height: rendered.height,
      requestedHeight: input.shot.capture.requestedHeight,
      wasReduced: input.shot.capture.wasReduced,
      pass,
      png,
    });
  }

  // Required PNG passes reserve the batch budget first. PSD is optional and must degrade without
  // invalidating PNGs that are ready for the same atomic recovery checkpoint.
  if (input.includeLayeredPsd) {
    const admission = dependencies.admitPsdLayers(rendered.layers);
    if (!admission.ok) {
      psdFallbacks.push({
        shotId: input.shot.shotId,
        shotName: input.shot.shotName,
        reason: admission.reason === "empty" ? "unavailable" : "budget",
      });
    } else if (!dependencies.workersAvailable()) {
      psdFallbacks.push({
        shotId: input.shot.shotId,
        shotName: input.shot.shotName,
        reason: "unavailable",
      });
    } else {
      try {
        const psd = await dependencies.buildLayeredPsdInWorker(rendered.layers, {
          signal: input.signal,
          timeoutMs: 90_000,
        });
        if (
          input.committedArtifactBytes + artifactBytes + psd.size > dependencies.maxTotalBytes
        ) {
          psdFallbacks.push({
            shotId: input.shot.shotId,
            shotName: input.shot.shotName,
            reason: "budget",
          });
        } else {
          artifactBytes += psd.size;
          layeredPsds.push({
            shotId: input.shot.shotId,
            shotName: input.shot.shotName,
            width: rendered.width,
            height: rendered.height,
            psd,
          });
        }
      } catch (cause) {
        if (cause instanceof Error && cause.name === "AbortError") throw cause;
        psdFallbacks.push({
          shotId: input.shot.shotId,
          shotName: input.shot.shotName,
          reason: "worker-failed",
        });
      }
    }
  }

  return {
    images,
    skippedArtifacts,
    layeredPsds,
    psdFallbacks,
    artifactBytes,
  };
}
