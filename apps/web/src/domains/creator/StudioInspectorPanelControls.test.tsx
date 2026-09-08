// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStudioInspectorTabA11y } from "./studio-inspector-tab-a11y";
import { resetStudioInspectorPanelStoreForTests } from "./studio-inspector-panel-preferences";
import { StudioInspectorNavigator } from "./StudioInspectorNavigator";

import type { StudioInspectorLayout } from "./studio-inspector-layout";

const TAB_A11Y = createStudioInspectorTabA11y("panel-controls");

beforeEach(() => {
  resetStudioInspectorPanelStoreForTests();
});

afterEach(() => {
  cleanup();
  resetStudioInspectorPanelStoreForTests();
});

function NavigatorHarness() {
  const [layout, setLayout] = useState<StudioInspectorLayout>({
    primary: "properties",
    image: "retouch",
    document: "canvas",
  });
  return (
    <StudioInspectorNavigator
      layout={layout}
      tabA11y={TAB_A11Y}
      selectedType="image"
      selectionLabel="이미지"
      selectionCount={1}
      drawing={false}
      layerCount={12}
      onChange={setLayout}
    />
  );
}

describe("Studio Inspector panel controls", () => {
  it("pins only the specialist route and exposes a clear live status", () => {
    render(<NavigatorHarness />);

    const pin = screen.getByRole("button", { name: "현재 전문 탭 고정" });
    expect(pin.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(pin);

    expect(
      screen.getByRole("button", { name: "선택에 따라 전문 탭 다시 전환" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByRole("status")).toHaveTextContent("전문 탭 고정");
    expect(screen.getByRole("status")).toHaveTextContent(
      "선택이 바뀌어도 이미지 전문 탭을 자동 초기화하지 않습니다",
    );
  });

  it("lets artists hide inactive primary tabs while protecting the active tab", () => {
    render(<NavigatorHarness />);
    fireEvent.click(screen.getByRole("button", { name: "작업 패널 구성" }));

    const options = screen.getByRole("region", { name: "작업 패널 구성" });
    const activeToggle = within(options).getByRole("button", {
      name: "선택 항목 탭 숨기기",
    });
    expect(activeToggle).toBeDisabled();
    expect(activeToggle).toHaveAttribute(
      "title",
      "현재 열려 있는 탭은 다른 탭으로 이동한 뒤 숨길 수 있습니다.",
    );

    fireEvent.click(within(options).getByRole("button", { name: "페이지 탭 숨기기" }));
    expect(screen.queryByRole("tab", { name: "페이지" })).toBeNull();
    expect(within(options).getByRole("button", { name: "페이지 탭 표시하기" }))
      .toHaveAttribute("aria-pressed", "false");
  });

  it("switches to an icon-only primary rail without changing accessible tab names", () => {
    render(<NavigatorHarness />);
    fireEvent.click(screen.getByRole("button", { name: "작업 패널 구성" }));

    const compact = screen.getByRole("button", { name: /탭 이름을 아이콘으로 접기/u });
    fireEvent.click(compact);

    expect(compact.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("tab", { name: "선택 항목" })).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "스튜디오 설정" })
        .getAttribute("data-studio-inspector-primary-tabs-compact"),
    ).toBe("true");
  });

  it("restores all panel chrome preferences with one reset action", () => {
    render(<NavigatorHarness />);
    fireEvent.click(screen.getByRole("button", { name: "현재 전문 탭 고정" }));
    fireEvent.click(screen.getByRole("button", { name: "작업 패널 구성" }));
    const options = screen.getByRole("region", { name: "작업 패널 구성" });
    fireEvent.click(within(options).getByRole("button", { name: "레이어 탭 숨기기" }));
    fireEvent.click(within(options).getByRole("button", { name: /탭 이름을 아이콘으로 접기/u }));

    fireEvent.click(within(options).getByRole("button", { name: "패널 기본값 복원" }));

    expect(screen.getByRole("button", { name: "현재 전문 탭 고정" }))
      .toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("tab", { name: "레이어" })).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "스튜디오 설정" })
        .getAttribute("data-studio-inspector-primary-tabs-compact"),
    ).toBeNull();
  });
});
