// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StudioBg3dAtmospherePanel } from "./StudioBg3dAtmospherePanel";

// 무거운 패널 렌더가 병렬 실행 부하에서 5초를 넘길 수 있어 타임아웃을 늘립니다.
vi.setConfig({ testTimeout: 30000 });

describe("StudioBg3dAtmospherePanel", () => {
  afterEach(cleanup);

  it("renders all 12 weather atmosphere preset options and sun dials", () => {
    const markup = renderToStaticMarkup(
      <StudioBg3dAtmospherePanel
        currentPresetId="golden-hour"
        onPresetChange={vi.fn()}
        onSunAngleChange={vi.fn()}
      />,
    );

    expect(markup).toContain("3D 하늘 및 기상 분위기 프리셋 (12종)");
    expect(markup).toContain("쾌청한 한낮");
    expect(markup).toContain("골든 아워");
    expect(markup).toContain("사이버펑크 네온 나이트");
    expect(markup).toContain("폭풍우와 번개");
    expect(markup).toContain("흩날리는 벚꽃잎");
    expect(markup).toContain("환상적인 오로라 &amp; 별빛");
    expect(markup).toContain("태양 고도 및 방위각 제어");
  });

  it("renders disabled state when disabled prop is provided", () => {
    const markup = renderToStaticMarkup(
      <StudioBg3dAtmospherePanel
        disabled
        onPresetChange={vi.fn()}
      />,
    );

    expect(markup).toContain("disabled");
  });

  it("syncs internal selection when currentPresetId changes (controlled)", () => {
    const view = render(
      <StudioBg3dAtmospherePanel
        currentPresetId="golden-hour"
        onPresetChange={vi.fn()}
      />,
    );
    const goldenButton = screen.getByRole("button", { name: /골든 아워/ });
    expect(goldenButton.getAttribute("aria-pressed")).toBe("true");

    view.rerender(
      <StudioBg3dAtmospherePanel
        currentPresetId="rainy-drizzle"
        onPresetChange={vi.fn()}
      />,
    );
    expect(goldenButton.getAttribute("aria-pressed")).toBe("false");
    const rainyButton = screen.getByRole("button", { name: /촉촉한 봄비/ });
    expect(rainyButton.getAttribute("aria-pressed")).toBe("true");
  });

  it("exposes a thumbnail swatch and tooltip per preset", () => {
    const markup = renderToStaticMarkup(
      <StudioBg3dAtmospherePanel
        currentPresetId="golden-hour"
        onPresetChange={vi.fn()}
      />,
    );
    expect(markup).toContain("linear-gradient");
    expect(markup).toContain("title=");
  });
});
