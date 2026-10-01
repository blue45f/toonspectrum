// @vitest-environment jsdom

import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CREATION_MODE_EVENT } from "../studio-creation-mode";
import { StudioCinematicCanvasWelcome } from "./StudioCinematicCanvasWelcome";
import { STUDIO_CANVAS_START_DOCK_STORAGE_KEY } from "./studio-canvas-start-dock-preference";
import { useStudioCanvasStartDockExpanded } from "./studio-canvas-start-dock-state";
import { shouldShowStudioCinematicCanvasWelcome } from "./studio-cinematic-canvas-welcome-visibility";

const HEADING = "첫 장면을 어떻게 시작할까요?";

function openExampleScenes() {
  fireEvent.click(screen.getByRole("button", { name: /예시 장면/u }));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("StudioCinematicCanvasWelcome", () => {
  it("keeps the empty-canvas launcher out of a joined live room", () => {
    const base = {
      elementCount: 0,
      sourceHydrationPending: false,
      workHydrationFailed: false,
      collaborationDocumentUnavailable: false,
      joinedStudioLiveJam: false,
    };
    expect(shouldShowStudioCinematicCanvasWelcome(base)).toBe(true);
    expect(shouldShowStudioCinematicCanvasWelcome({
      ...base,
      joinedStudioLiveJam: true,
    })).toBe(false);
    expect(shouldShowStudioCinematicCanvasWelcome({
      ...base,
      elementCount: 1,
    })).toBe(false);
  });

  it("shows six starting paths as a non-modal dock and reveals labelled example scenes on request", () => {
    const { container } = render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);

    expect(screen.getByRole("heading", { name: HEADING })).toBeTruthy();
    // 캔버스를 막는 대화상자가 아니라 캔버스 위의 안내 영역이다.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("button").filter((button) => (
      button.hasAttribute("data-canvas-start-mode")
    ))).toHaveLength(6);
    expect(container.querySelectorAll("[data-canvas-scene-example]")).toHaveLength(0);

    openExampleScenes();

    expect(screen.getByRole("button", { name: /예시 장면/u }).getAttribute("aria-expanded")).toBe("true");
    const examples = screen.getByRole("list", { name: "예시 장면" });
    expect(examples.querySelectorAll("[data-canvas-scene-example]")).toHaveLength(6);
    // 예시 장면은 장르를 도구에 넘기지 않으므로 누르는 선택지로 꾸미지 않고 '예시'라고 표시한다.
    expect(examples.querySelectorAll("button")).toHaveLength(0);
    expect(examples.textContent?.match(/예시/gu)).toHaveLength(6);
  });

  it("requests a creation mode and dismisses after selection", () => {
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);

    fireEvent.click(screen.getByRole("button", { name: /캐릭터 배치/ }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
    window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
  });

  it("opens the background workspace from the single background action beside the examples", () => {
    const listener = vi.fn();
    window.addEventListener(STUDIO_CREATION_MODE_EVENT, listener);
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);

    openExampleScenes();
    fireEvent.click(screen.getByRole("button", { name: /배경 도구 열기/u }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      mode: "background",
    });
    window.removeEventListener(STUDIO_CREATION_MODE_EVENT, listener);
  });

  it("offers the guided tour from the dock itself and closes the dock first", () => {
    const onOpenTutorial = vi.fn();
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible onOpenTutorial={onOpenTutorial} />);

    fireEvent.click(screen.getByRole("button", { name: /처음이라면 사용법 따라 하기/u }));

    expect(onOpenTutorial).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
  });

  it("tells the coach and inspector card while the dock is expanded", () => {
    const expanded = renderHook(() => useStudioCanvasStartDockExpanded());
    expect(expanded.result.current).toBe(false);

    const view = render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);
    expanded.rerender();
    expect(expanded.result.current).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
    expanded.rerender();
    expect(expanded.result.current).toBe(false);

    view.unmount();
    expanded.unmount();
  });

  it("can be dismissed while keeping the canvas blank", () => {
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);
    fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
  });

  it("remembers a dismissal and only offers a compact start button on the next blank page", () => {
    render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);
    fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
    expect(window.localStorage.getItem(STUDIO_CANVAS_START_DOCK_STORAGE_KEY)).toBe("collapsed");

    // 새로 연 편집기(다음 빈 페이지)는 기억된 선택을 따른다.
    cleanup();
    render(<StudioCinematicCanvasWelcome pageKey="page-2" visible />);

    expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
    const reopen = screen.getByRole("button", { name: /시작 방법 보기/u });
    expect(reopen.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(reopen);
    expect(screen.getByRole("heading", { name: HEADING })).toBeTruthy();
  });
});

it("같은 편집 세션의 다음 빈 페이지에서는 접힌 시작 버튼만 보여 준다", () => {
  const { rerender } = render(<StudioCinematicCanvasWelcome pageKey="page-1" visible />);
  fireEvent.click(screen.getByRole("button", { name: /직접 그리기/u }));
  rerender(<StudioCinematicCanvasWelcome pageKey="page-2" visible />);

  expect(screen.queryByRole("heading", { name: HEADING })).toBeNull();
  expect(screen.getByRole("button", { name: /시작 방법 보기/u })).toBeTruthy();
});

it("시작 안내 안에서 Escape로 캔버스 편집에 돌아간다", () => {
  render(<StudioCinematicCanvasWelcome pageKey="keyboard" visible />);
  fireEvent.keyDown(screen.getByRole("button", { name: "시작 안내 닫기" }), { key: "Escape" });
  expect(screen.queryByRole("region", { name: "빈 캔버스 시작 방법" })).toBeNull();
});

it("장면 미리보기에서 원본 PNG를 내려받지 않는다", () => {
  const { container } = render(<StudioCinematicCanvasWelcome pageKey="preview" visible />);
  // 장면 이미지는 사용자가 펼치기 전에는 요청하지 않는다.
  expect(container.querySelectorAll("[style]")).toHaveLength(0);
  openExampleScenes();
  const backgrounds = Array.from(container.querySelectorAll<HTMLElement>("[style]"))
    .map((element) => element.style.backgroundImage).filter(Boolean);
  expect(backgrounds).toHaveLength(6);
  expect(backgrounds.every((url) => url.includes("/brand/studio-canvas-previews/") && url.includes(".webp"))).toBe(true);
  expect(backgrounds.some((url) => url.includes("background.png"))).toBe(false);
});
