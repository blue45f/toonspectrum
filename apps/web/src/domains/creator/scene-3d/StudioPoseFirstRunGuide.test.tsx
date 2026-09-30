// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Hand } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readStudioPoseGuideDismissed,
  StudioPoseFirstRunGuide,
} from "./StudioPoseFirstRunGuide";

const SCOPE = "test-guide-scope";

function renderGuide() {
  return render(
    <StudioPoseFirstRunGuide
      scope={SCOPE}
      icon={Hand}
      title="포즈 패널 30초 가이드"
      steps={[
        { ko: "카드를 클릭하면 3D에 바로 적용됩니다.", en: "Click a card to apply instantly." },
        { ko: "강도 슬라이더로 조절하세요." },
      ]}
    />,
  );
}

describe("StudioPoseFirstRunGuide (첫 진입 가이드)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("처음에는 가이드가 보이고 단계를 렌더링한다", () => {
    renderGuide();
    expect(screen.getByRole("note", { name: "포즈 패널 30초 가이드 안내" })).toBeTruthy();
    expect(screen.getByText("카드를 클릭하면 3D에 바로 적용됩니다.")).toBeTruthy();
    expect(screen.getByText("Click a card to apply instantly.")).toBeTruthy();
    expect(screen.getByLabelText(/다시 보지 않기/)).toBeTruthy();
  });

  it("다시 보지 않기를 체크하고 닫으면 다음 진입부터 숨겨진다", () => {
    const { unmount } = renderGuide();
    fireEvent.click(screen.getByLabelText(/다시 보지 않기/));
    fireEvent.click(screen.getByRole("button", { name: "가이드 닫기" }));
    expect(readStudioPoseGuideDismissed(SCOPE)).toBe(true);
    expect(screen.queryByRole("note")).toBeNull();

    unmount();
    renderGuide();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("체크 없이 닫으면 이번만 숨기고 다음 진입에 다시 보인다", () => {
    const { unmount } = renderGuide();
    fireEvent.click(screen.getByRole("button", { name: "가이드 닫기" }));
    expect(readStudioPoseGuideDismissed(SCOPE)).toBe(false);
    expect(screen.queryByRole("note")).toBeNull();

    unmount();
    renderGuide();
    expect(screen.getByRole("note", { name: "포즈 패널 30초 가이드 안내" })).toBeTruthy();
  });

  it("localStorage가 막혀도 가이드는 표시되고 닫힌다", () => {
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      renderGuide();
      expect(screen.getByRole("note")).toBeTruthy();
      fireEvent.click(screen.getByLabelText(/다시 보지 않기/));
      fireEvent.click(screen.getByRole("button", { name: "가이드 닫기" }));
      expect(screen.queryByRole("note")).toBeNull();
    } finally {
      Object.defineProperty(window, "localStorage", { configurable: true, value: original });
    }
  });
});
