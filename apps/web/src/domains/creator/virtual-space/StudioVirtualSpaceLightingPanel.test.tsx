// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceLightingPanel } from "./StudioVirtualSpaceLightingPanel";
import {
  createStudioLightFixture,
  studioAmbientLightFor,
} from "./studio-virtual-space-lighting";

afterEach(() => {
  cleanup();
});

const fixtures = [
  createStudioLightFixture({ id: "l1", kind: "desk-lamp", position: { x: 0, y: 0 } }),
  createStudioLightFixture({ id: "l2", kind: "floor-lamp", position: { x: 100, y: 100 }, on: false, dimmer: 0.5 }),
];
const ambient = studioAmbientLightFor(12, "clear");

function renderPanel(overrides: Partial<Parameters<typeof StudioVirtualSpaceLightingPanel>[0]> = {}) {
  const handlers = {
    onToggleFixture: vi.fn(),
    onDimmerChange: vi.fn(),
    onHourOverride: vi.fn(),
    onClearHourOverride: vi.fn(),
  };
  render(
    <StudioVirtualSpaceLightingPanel
      fixtures={fixtures}
      ambient={ambient}
      hour={12}
      hourOverride={null}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe("조명 패널", () => {
  it("현재 시간대와 밝기를 표시한다", () => {
    renderPanel();
    expect(screen.getAllByText("정오").length).toBeGreaterThan(0);
    expect(screen.getByText(/100%/)).not.toBeNull();
  });

  it("기구 목록을 렌더링한다", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: /책상 스탠드 끄기/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /플로어 스탠드 켜기/ })).not.toBeNull();
  });

  it("토글 버튼 클릭 시 onToggleFixture가 호출된다", () => {
    const { onToggleFixture } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /책상 스탠드 끄기/ }));
    expect(onToggleFixture).toHaveBeenCalledWith("l1");
  });

  it("밝기 슬라이더 변경 시 onDimmerChange가 호출된다", () => {
    const { onDimmerChange } = renderPanel();
    const slider = screen.getByRole("slider", { name: /책상 스탠드 밝기/ });
    fireEvent.change(slider, { target: { value: "40" } });
    expect(onDimmerChange).toHaveBeenCalledWith("l1", 0.4);
  });

  it("꺼진 기구의 슬라이더는 비활성화된다", () => {
    renderPanel();
    expect((screen.getByRole("slider", { name: /플로어 스탠드 밝기/ }) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("slider", { name: /책상 스탠드 밝기/ }) as HTMLInputElement).disabled).toBe(false);
  });

  it("시간대 버튼 클릭 시 onHourOverride가 호출된다", () => {
    const { onHourOverride } = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "밤" }));
    expect(onHourOverride).toHaveBeenCalledWith(21);
  });

  it("기구가 없으면 안내 문구를 표시한다", () => {
    renderPanel({ fixtures: [] });
    expect(screen.getByText(/배치된 조명이 없습니다/)).not.toBeNull();
  });
});

describe("조명 프리셋", () => {
  it("onApplyPreset이 없으면 프리셋 섹션을 숨긴다", () => {
    renderPanel();
    expect(screen.queryByRole("group", { name: "조명 프리셋" })).toBeNull();
  });

  it("프리셋 버튼 클릭 시 onApplyPreset이 프리셋 키와 함께 호출된다", () => {
    const onApplyPreset = vi.fn();
    renderPanel({ onApplyPreset });
    expect(screen.getByRole("group", { name: "조명 프리셋" })).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "아침 햇살" }));
    expect(onApplyPreset).toHaveBeenCalledWith("morning-fresh");
    fireEvent.click(screen.getByRole("button", { name: "파티 모드" }));
    expect(onApplyPreset).toHaveBeenCalledWith("event-party");
  });
});
