// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceEnvironmentPanel } from "./StudioVirtualSpaceEnvironmentPanel";
import { DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT } from "./studio-virtual-space-environment-preference";

afterEach(() => cleanup());

// 첫 렌더에서 i18n 런타임 초기화가 느릴 수 있어 여유를 둔다.
vi.setConfig({ testTimeout: 30000 });

describe("StudioVirtualSpaceEnvironmentPanel", () => {
  it("선택한 테마의 배경 원본을 보여주며 날씨·시간대 선택은 유지한다", () => {
    const onChange = vi.fn();
    const value = { ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, backdrop: "forest" as const, weather: "petals" as const, dayPhase: "dusk" as const };
    const view = render(<StudioVirtualSpaceEnvironmentPanel value={value} artStyle="pastel" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /정원 숲/ }).querySelector("img")?.getAttribute("src")).toContain("backdrop-pastel-forest.png");
    view.rerender(<StudioVirtualSpaceEnvironmentPanel value={value} artStyle="ink" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /정원 숲/ }).querySelector("img")?.getAttribute("src")).toContain("backdrop-ink-forest.png");
    expect(screen.getByRole("button", { name: "꽃잎" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "노을" }).getAttribute("aria-pressed")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("changes backdrop, day phase and weather without carrying arbitrary data", () => {
    const onChange = vi.fn();
    const { rerender } = render(<StudioVirtualSpaceEnvironmentPanel value={DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /정원 숲/u }));
    expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, backdrop: "forest" });

    const forest = { ...DEFAULT_STUDIO_VIRTUAL_ENVIRONMENT, backdrop: "forest" as const };
    rerender(<StudioVirtualSpaceEnvironmentPanel value={forest} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "노을" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...forest, dayPhase: "dusk" });

    const dusk = { ...forest, dayPhase: "dusk" as const };
    rerender(<StudioVirtualSpaceEnvironmentPanel value={dusk} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "꽃잎" }));
    expect(onChange).toHaveBeenLastCalledWith({ ...dusk, weather: "petals" });
  });
});
