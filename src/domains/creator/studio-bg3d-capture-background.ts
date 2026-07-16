import {
  getSkyPreset,
  normalizePanoramaRotationDegrees,
} from "./studio-background-3d-sky";

import type {
  StudioBg3dBackgroundSettings,
  StudioBg3dSkyPresetId,
} from "./studio-bg3d-scene-document";

/** Immutable intent shared by the persisted document, R3F scene, and raster request of one capture. */
export interface StudioBg3dCaptureBackgroundSnapshot {
  readonly background: StudioBg3dBackgroundSettings;
  readonly clearColor: string;
  readonly panoramaRotation: number;
  readonly skyPresetId: StudioBg3dSkyPresetId;
  readonly transparent: boolean;
}

export function createStudioBg3dCaptureBackgroundSnapshot(input: {
  readonly background: StudioBg3dBackgroundSettings;
  readonly transparent: boolean;
}): StudioBg3dCaptureBackgroundSnapshot {
  const preset = getSkyPreset(input.background.skyPresetId);
  const panoramaRotation = normalizePanoramaRotationDegrees(input.background.panoramaRotation);
  const background = Object.freeze({
    ...input.background,
    mode: input.transparent ? "transparent" as const : "sky-preset" as const,
    color: preset.clearColor,
    skyPresetId: preset.id,
    panoramaRotation,
  });
  return Object.freeze({
    background,
    clearColor: preset.clearColor,
    panoramaRotation,
    skyPresetId: preset.id,
    transparent: input.transparent,
  });
}
