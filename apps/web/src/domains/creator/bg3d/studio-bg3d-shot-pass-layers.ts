import type { StudioBg3dCapturedRaster } from "./studio-bg3d-capture-adapter";
import type {
  StudioBg3dLtRasterLayer,
  StudioBg3dLtRenderResult,
  StudioBg3dLtRenderSettings,
} from "./studio-bg3d-lt-render";
import type { StudioBg3dShotBatchPass } from "./studio-bg3d-shot-batch-pass-catalog";
import type { StudioBg3dShotBatchSkippedArtifact } from "./studio-bg3d-shot-batch";

interface PassLayerSelection {
  readonly layers: readonly StudioBg3dLtRasterLayer[] | null;
  readonly skipReason: StudioBg3dShotBatchSkippedArtifact["reason"];
}

export function selectStudioBg3dShotPassLayers(
  pass: StudioBg3dShotBatchPass,
  captured: StudioBg3dCapturedRaster,
  rendered: StudioBg3dLtRenderResult,
  settings: StudioBg3dLtRenderSettings,
  createDepthLayer: (
    width: number,
    height: number,
    depth: Float32Array,
  ) => StudioBg3dLtRasterLayer,
): PassLayerSelection {
  const mainLineConfigured =
    settings.line.enabled && settings.line.strength > 0;
  const textureLineConfigured =
    mainLineConfigured &&
    settings.line.textureLineEnabled &&
    settings.line.textureLineStrength > 0;
  const toneConfigured =
    settings.tone.mode !== "none" && settings.tone.opacity > 0;
  const colorConfigured = toneConfigured && settings.tone.type === "color";
  const layerByRole = new Map(
    rendered.layers.map((layer) => [layer.role, layer] as const),
  );

  if (pass === "beauty") {
    return {
      layers: [
        {
          role: "color",
          width: captured.width,
          height: captured.height,
          data: new Uint8ClampedArray(captured.rgba),
        },
      ],
      skipReason: "disabled",
    };
  }
  if (pass === "lt-composite") {
    return {
      layers: rendered.layers.length > 0 ? rendered.layers : null,
      skipReason:
        mainLineConfigured || textureLineConfigured || toneConfigured
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
  const configured =
    pass === "main-line"
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
