import { buildStudioBg3dTiledImages } from "./studio-bg3d-tiled-artifact-client";
import { STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES } from "./studio-bg3d-shot-batch";
import type { StudioBg3dCaptureAdapter } from "./studio-bg3d-capture-adapter";
import type {
  StudioBg3dShotArtifactPipelineInput,
  StudioBg3dShotArtifactPipelineResult,
} from "./studio-bg3d-shot-artifact-pipeline";

export async function buildStudioBg3dTiledShotArtifacts(
  input: Omit<StudioBg3dShotArtifactPipelineInput, "captured"> & {
    readonly tileShape?: {
      readonly tileWidth: number;
      readonly bandHeight: number;
    };
    readonly adapter: StudioBg3dCaptureAdapter;
    readonly includeNormals: boolean;
    readonly assertCurrent: () => void | Promise<void>;
    readonly onProgress?: (completed: number, total: number) => void;
  },
): Promise<StudioBg3dShotArtifactPipelineResult> {
  const { shot } = input;
  const result = await buildStudioBg3dTiledImages({
    adapter: input.adapter,
    options: {
      width: shot.capture.width,
      height: shot.capture.height,
      ...input.tileShape,
      settings: input.settings,
      passes: input.passes,
    },
    includeDepth: shot.capture.includeDepth,
    includeNormals: input.includeNormals,
    background: shot.capture.background,
    signal: input.signal,
    assertCurrent: input.assertCurrent,
    onProgress: input.onProgress,
  });
  const artifactBytes = result.images.reduce(
    (sum, image) => sum + image.png.size,
    0,
  );
  if (
    input.committedArtifactBytes + artifactBytes >
    STUDIO_BG3D_SHOT_BATCH_MAX_TOTAL_BYTES
  )
    throw new RangeError(
      "컷 PNG 합계가 브라우저 배치 메모리 예산을 벗어났습니다.",
    );
  return {
    artifactBytes,
    images: result.images.map((image) => ({
      ...image,
      shotId: shot.shotId,
      shotName: shot.shotName,
      width: shot.capture.width,
      height: shot.capture.height,
      requestedHeight: shot.capture.requestedHeight,
      wasReduced: shot.capture.wasReduced,
    })),
    skippedArtifacts: result.skipped.map(({ pass, reason }) => ({
      shotId: shot.shotId,
      shotName: shot.shotName,
      pass,
      reason,
    })),
    layeredPsds: [],
    // Existing PSD path requires full RGBA surfaces. Keep its budget instead of secretly allocating 4K layers.
    psdFallbacks: input.includeLayeredPsd
      ? [{ shotId: shot.shotId, shotName: shot.shotName, reason: "budget" }]
      : [],
  };
}
