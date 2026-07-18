import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import {
  applyStudioBg3dThreeWebglRenderSettings,
  resolveStudioBg3dThreeRenderSettings,
  type StudioBg3dWebglRendererSettingsTarget,
} from "./studio-bg3d-three-render-settings";

function renderSettings(overrides: Record<string, unknown> = {}) {
  return {
    ...createDefaultStudioBg3dSceneDocument().render,
    ...overrides,
  };
}

describe("Studio BG3D Three render settings", () => {
  it.each([
    ["none", THREE.NoToneMapping],
    ["neutral", THREE.NeutralToneMapping],
    ["aces", THREE.ACESFilmicToneMapping],
  ] as const)("maps %s without depending on the R3F default", (toneMapping, expected) => {
    expect(resolveStudioBg3dThreeRenderSettings(renderSettings({ toneMapping }))).toEqual({
      outputColorSpace: THREE.SRGBColorSpace,
      toneMapping: expected,
      toneMappingExposure: 1,
    });
  });

  it("bounds hostile exposure at the renderer boundary and always resolves document sRGB", () => {
    expect(resolveStudioBg3dThreeRenderSettings(
      renderSettings({ exposure: 99, colorSpace: "future-wide-gamut" }) as never,
    )).toMatchObject({
      outputColorSpace: THREE.SRGBColorSpace,
      toneMappingExposure: 8,
    });
    expect(resolveStudioBg3dThreeRenderSettings(
      renderSettings({ exposure: Number.NaN }) as never,
    ).toneMappingExposure).toBe(1);
  });

  it("applies output color space, tone mapping, and exposure to an admitted WebGL renderer", () => {
    const renderer = {
      isWebGLRenderer: true,
      outputColorSpace: THREE.LinearSRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 1,
    } satisfies StudioBg3dWebglRendererSettingsTarget;

    expect(applyStudioBg3dThreeWebglRenderSettings(
      renderer,
      renderSettings({ toneMapping: "aces", exposure: 1.35 }),
    )).toBe(true);
    expect(renderer).toMatchObject({
      outputColorSpace: THREE.SRGBColorSpace,
      toneMapping: THREE.ACESFilmicToneMapping,
      toneMappingExposure: 1.35,
    });
  });

  it("does not mutate a WebGPU-specialist or unknown renderer boundary", () => {
    const renderer = {
      isWebGLRenderer: false,
      outputColorSpace: THREE.LinearSRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 0.5,
    } satisfies StudioBg3dWebglRendererSettingsTarget;
    const before = { ...renderer };

    expect(applyStudioBg3dThreeWebglRenderSettings(
      renderer,
      renderSettings({ toneMapping: "aces", exposure: 2 }),
    )).toBe(false);
    expect(renderer).toEqual(before);
  });
});
