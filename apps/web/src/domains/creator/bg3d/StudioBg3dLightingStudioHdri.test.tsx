// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_HDRI_LIGHTING_PRESETS,
  getStudioBg3dHdriLightingPreset,
} from "./studio-bg3d-hdri-lighting-presets";
import { StudioBg3dLightingStudio } from "./StudioBg3dLightingStudio";

import type {
  StudioBg3dLightingSettings,
} from "./studio-bg3d-scene-document";

// 무거운 패널 렌더가 병렬 실행 부하에서 5초를 넘길 수 있어 타임아웃을 늘립니다.
vi.setConfig({ testTimeout: 30000 });

const daylight = getStudioBg3dHdriLightingPreset("daylight")!;

function renderStudio() {
  const onUpdateLighting = vi.fn();
  const onUpdateExposure = vi.fn();
  const onCommitLightingHistory = vi.fn();
  const onApplyHdriSunTime = vi.fn();
  const onLinkHdriWeatherPreset = vi.fn();
  const props: Record<string, unknown> = {
    lighting: daylight.lighting,
    exposure: daylight.exposure,
    onUpdateLighting,
    onUpdateExposure,
    onCommitLightingHistory,
    onApplyHdriSunTime,
    onLinkHdriWeatherPreset,
  };
  const view = render(<StudioBg3dLightingStudio {...(props as never)} />);
  return { view, onUpdateLighting, onUpdateExposure, onCommitLightingHistory, onApplyHdriSunTime, onLinkHdriWeatherPreset };
}

describe("StudioBg3dLightingStudio HDRI gallery", () => {
  afterEach(cleanup);

  it("renders 4 HDRI presets with bilingual labels and tooltips", () => {
    renderStudio();
    expect(screen.getByText("HDRI 조명 프리셋")).toBeDefined();
    for (const preset of STUDIO_BG3D_HDRI_LIGHTING_PRESETS) {
      const button = screen.getByTestId(`bg3d-hdri-lighting-preset-${preset.id}`);
      expect(button.getAttribute("aria-pressed")).toBe(
        preset.id === "daylight" ? "true" : "false",
      );
      expect(button.getAttribute("title")).toBe(preset.tooltipKo);
    }
  });

  it("applies lighting, exposure, sun time and weather link on preset click", () => {
    const { onUpdateLighting, onUpdateExposure, onCommitLightingHistory, onApplyHdriSunTime, onLinkHdriWeatherPreset } = renderStudio();
    const twilight = getStudioBg3dHdriLightingPreset("twilight")!;

    fireEvent.click(screen.getByTestId("bg3d-hdri-lighting-preset-twilight"));

    expect(onUpdateLighting).toHaveBeenCalledOnce();
    expect(onUpdateLighting).toHaveBeenCalledWith(twilight.lighting);
    expect(onUpdateExposure).toHaveBeenCalledOnce();
    expect(onUpdateExposure).toHaveBeenCalledWith(twilight.exposure);
    expect(onApplyHdriSunTime).toHaveBeenCalledOnce();
    expect(onApplyHdriSunTime).toHaveBeenCalledWith(twilight.sunTimeHours);
    expect(onLinkHdriWeatherPreset).toHaveBeenCalledOnce();
    expect(onLinkHdriWeatherPreset).toHaveBeenCalledWith(
      twilight.weatherPresetId,
      twilight.sunTimeHours,
    );
    expect(onCommitLightingHistory).toHaveBeenCalledOnce();
  });

  it("marks the resolved HDRI preset in the summary line and shows the weather badge", () => {
    const lighting = daylight.lighting satisfies StudioBg3dLightingSettings;
    render(
      <StudioBg3dLightingStudio
        lighting={lighting}
        exposure={daylight.exposure}
        linkedWeatherPresetId={daylight.weatherPresetId}
        onUpdateLighting={vi.fn()}
        onUpdateExposure={vi.fn()}
      />,
    );
    expect(screen.getByText("날씨 연동 중")).toBeDefined();
    expect(screen.getByTestId("bg3d-hdri-lighting-preset-daylight").getAttribute("aria-pressed")).toBe("true");
  });

  it("works without the optional sun-time and weather callbacks", () => {
    const onUpdateLighting = vi.fn();
    const onUpdateExposure = vi.fn();
    render(
      <StudioBg3dLightingStudio
        lighting={daylight.lighting}
        exposure={daylight.exposure}
        onUpdateLighting={onUpdateLighting}
        onUpdateExposure={onUpdateExposure}
      />,
    );
    fireEvent.click(screen.getByTestId("bg3d-hdri-lighting-preset-night"));
    expect(onUpdateLighting).toHaveBeenCalledOnce();
    expect(onUpdateExposure).toHaveBeenCalledOnce();
  });
});
