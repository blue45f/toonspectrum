/** Three/WebGL projection of the engine-neutral Studio 3D render settings. */

import * as THREE from "three";

import type { StudioBg3dRenderSettings } from "./studio-bg3d-scene-document";

export interface StudioBg3dResolvedThreeRenderSettings {
  readonly outputColorSpace: typeof THREE.SRGBColorSpace;
  readonly toneMapping: THREE.ToneMapping;
  readonly toneMappingExposure: number;
}

export type StudioBg3dWebglRendererSettingsTarget = Pick<
  THREE.WebGLRenderer,
  "outputColorSpace" | "toneMapping" | "toneMappingExposure"
> & { readonly isWebGLRenderer?: boolean };

/**
 * Resolves a persistence-safe render contract without relying on R3F's renderer defaults.
 * Runtime callers remain fail-closed for manually constructed or future document values.
 */
export function resolveStudioBg3dThreeRenderSettings(
  render: StudioBg3dRenderSettings,
): StudioBg3dResolvedThreeRenderSettings {
  const exposure = typeof render.exposure === "number" && Number.isFinite(render.exposure)
    ? THREE.MathUtils.clamp(render.exposure, 0.1, 8)
    : 1;
  const toneMapping = render.toneMapping === "none"
    ? THREE.NoToneMapping
    : render.toneMapping === "aces"
      ? THREE.ACESFilmicToneMapping
      : THREE.NeutralToneMapping;
  return Object.freeze({
    outputColorSpace: THREE.SRGBColorSpace,
    toneMapping,
    toneMappingExposure: exposure,
  });
}

/**
 * Applies settings only to an admitted Three WebGL renderer. A future WebGPU renderer is owned by
 * its specialist adapter and is intentionally not duck-typed into this boundary.
 */
export function applyStudioBg3dThreeWebglRenderSettings(
  renderer: StudioBg3dWebglRendererSettingsTarget,
  render: StudioBg3dRenderSettings,
): boolean {
  if (renderer.isWebGLRenderer !== true) return false;
  const resolved = resolveStudioBg3dThreeRenderSettings(render);
  const previous = {
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
  };
  try {
    renderer.outputColorSpace = resolved.outputColorSpace;
    renderer.toneMapping = resolved.toneMapping;
    renderer.toneMappingExposure = resolved.toneMappingExposure;
    return true;
  } catch {
    try {
      renderer.outputColorSpace = previous.outputColorSpace;
      renderer.toneMapping = previous.toneMapping;
      renderer.toneMappingExposure = previous.toneMappingExposure;
    } catch {
      // A renderer that rejects its own previous values is already unusable. Keep this boundary
      // non-throwing so the editor can retain the persisted scene and report through its adapter.
    }
    return false;
  }
}
