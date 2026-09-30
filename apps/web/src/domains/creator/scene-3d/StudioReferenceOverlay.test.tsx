// @vitest-environment jsdom

/**
 * 플로팅 레퍼런스 오버레이(B-5) 테스트.
 *
 * - 옵트인 마운트/닫기(defaultOpen, 닫기 버튼, Esc)
 * - 접기/펼치기, 투명도 슬라이더, 드래그 이동(포인터·키보드), 크기 조절(포인터·키보드)
 * - 포즈 선택 + localStorage 저장/복원
 * - 포인터 이벤트 격리(레이어 none / 패널 auto), reduced-motion, 한/영 카피
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ADVANCED_WEBTOON_POSES } from "./studio-3d-advanced-poses-library";
import { StudioReferenceOverlay } from "./StudioReferenceOverlay";

const POSE_STORAGE_KEY = "toonstudio.reference-overlay.pose.v1";
const LAYOUT_STORAGE_KEY = "toonstudio.reference-overlay.layout.v1";

// jsdom 기본 뷰포트(1024x768) 기준 오버레이 초기 위치/크기.
const INITIAL_LEFT = 1024 - 288 - 12;
const INITIAL_TOP = 12;
const INITIAL_WIDTH = 288;
const INITIAL_HEIGHT = 384;

function shortName(fullName: string): string {
  const parenIndex = fullName.indexOf(" (");
  return parenIndex > 0 ? fullName.slice(0, parenIndex) : fullName;
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  window.localStorage.removeItem(POSE_STORAGE_KEY);
  window.localStorage.removeItem(LAYOUT_STORAGE_KEY);
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: "ko" });
});

function renderOverlay(props?: Partial<Parameters<typeof StudioReferenceOverlay>[0]>) {
  return render(<StudioReferenceOverlay {...props} />);
}

function getPanel(): HTMLElement {
  return screen.getByTestId("reference-overlay-panel");
}

describe("StudioReferenceOverlay", () => {
  it("기본 열림 상태로 한국어 카피와 함께 렌더링된다", () => {
    renderOverlay();
    expect(screen.getByText("3D 레퍼런스")).toBeTruthy();
    expect(screen.getByText("포즈 스냅샷")).toBeTruthy();
    expect(screen.getByTestId("reference-overlay-layer")).toBeTruthy();
    expect(screen.getByTestId("reference-overlay-snapshot")).toBeTruthy();
    // 첫 번째 포즈 프리셋의 스냅샷이 표시된다.
    const first = ADVANCED_WEBTOON_POSES[0]!;
    expect(screen.getByText(shortName(first.name))).toBeTruthy();
  });

  it("defaultOpen=false 이면 아무것도 렌더링하지 않는다", () => {
    renderOverlay({ defaultOpen: false });
    expect(screen.queryByTestId("reference-overlay-layer")).toBeNull();
  });

  it("닫기 버튼을 누르면 패널이 사라지고 onOpenChange(false)가 호출된다", () => {
    const onOpenChange = vi.fn();
    renderOverlay({ onOpenChange });
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(screen.queryByTestId("reference-overlay-panel")).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Esc 키로 닫힌다", () => {
    const onOpenChange = vi.fn();
    renderOverlay({ onOpenChange });
    fireEvent.keyDown(getPanel(), { key: "Escape" });
    expect(screen.queryByTestId("reference-overlay-panel")).toBeNull();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("접기/펼치기가 동작한다", () => {
    renderOverlay();
    const collapseButton = screen.getByRole("button", { name: "접기" });
    fireEvent.click(collapseButton);
    expect(screen.queryByTestId("reference-overlay-snapshot")).toBeNull();
    expect(screen.queryByTestId("reference-overlay-resize-handle")).toBeNull();
    const expandButton = screen.getByRole("button", { name: "펼치기" });
    expect(expandButton.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(expandButton);
    expect(screen.getByTestId("reference-overlay-snapshot")).toBeTruthy();
    expect(screen.getByTestId("reference-overlay-resize-handle")).toBeTruthy();
  });

  it("투명도 슬라이더가 패널 opacity에 반영된다", () => {
    renderOverlay();
    const slider = screen.getByRole("slider", { name: /투명도/ });
    expect(getPanel().style.opacity).toBe("1");
    fireEvent.change(slider, { target: { value: "50" } });
    expect(getPanel().style.opacity).toBe("0.5");
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("드래그 핸들 포인터 드래그로 패널이 이동한다", () => {
    renderOverlay();
    const handle = screen.getByTestId("reference-overlay-drag-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(window, { clientX: 150, clientY: 120 });
    fireEvent.pointerUp(window, { clientX: 150, clientY: 120 });
    expect(getPanel().style.left).toBe(`${INITIAL_LEFT + 50}px`);
    expect(getPanel().style.top).toBe(`${INITIAL_TOP + 20}px`);
    // 레이아웃이 저장된다.
    const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}") as {
      x: number;
      y: number;
    };
    expect(stored.x).toBe(INITIAL_LEFT + 50);
    expect(stored.y).toBe(INITIAL_TOP + 20);
  });

  it("드래그 핸들에 포커스 후 방향키로 이동한다", () => {
    renderOverlay();
    const handle = screen.getByTestId("reference-overlay-drag-handle");
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(getPanel().style.left).toBe(`${INITIAL_LEFT + 8}px`);
    fireEvent.keyDown(handle, { key: "ArrowDown", shiftKey: true });
    expect(getPanel().style.top).toBe(`${INITIAL_TOP + 24}px`);
  });

  it("리사이즈 핸들 드래그로 크기가 조절된다", () => {
    renderOverlay();
    const handle = screen.getByTestId("reference-overlay-resize-handle");
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 40, clientY: 30 });
    fireEvent.pointerUp(window, { clientX: 40, clientY: 30 });
    expect(getPanel().style.width).toBe(`${INITIAL_WIDTH + 40}px`);
    expect(getPanel().style.height).toBe(`${INITIAL_HEIGHT + 30}px`);
  });

  it("리사이즈 핸들에 포커스 후 방향키로 크기를 조절한다", () => {
    renderOverlay();
    const handle = screen.getByTestId("reference-overlay-resize-handle");
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(getPanel().style.height).toBe(`${INITIAL_HEIGHT + 8}px`);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(getPanel().style.width).toBe(`${INITIAL_WIDTH - 8}px`);
  });

  it("포즈를 선택하면 스냅샷이 바뀌고 localStorage에 저장된다", () => {
    renderOverlay();
    const second = ADVANCED_WEBTOON_POSES[1]!;
    const poseButton = screen.getByRole("button", { name: `${second.name} 포즈 선택` });
    expect(poseButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(poseButton);
    expect(poseButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(shortName(second.name))).toBeTruthy();
    expect(window.localStorage.getItem(POSE_STORAGE_KEY)).toBe(second.id);
  });

  it("저장된 포즈 선택을 복원한다", () => {
    const third = ADVANCED_WEBTOON_POSES[2]!;
    window.localStorage.setItem(POSE_STORAGE_KEY, third.id);
    renderOverlay();
    const poseButton = screen.getByRole("button", { name: `${third.name} 포즈 선택` });
    expect(poseButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(shortName(third.name))).toBeTruthy();
  });

  it("레이어는 pointer-events-none, 패널은 pointer-events-auto 로 캔버스 조작과 격리된다", () => {
    renderOverlay();
    expect(screen.getByTestId("reference-overlay-layer").className).toContain("pointer-events-none");
    expect(getPanel().className).toContain("pointer-events-auto");
  });

  it("reduced-motion 에서는 opacity 트랜지션을 끈다", () => {
    const original = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
    try {
      renderOverlay();
      expect(getPanel().className).not.toContain("transition-[opacity]");
    } finally {
      Object.defineProperty(window, "matchMedia", { configurable: true, value: original });
    }
  });

  it("기본 상태에서는 opacity 트랜지션이 켜져 있다", () => {
    renderOverlay();
    expect(getPanel().className).toContain("transition-[opacity]");
  });

  it("영어 로케일에서는 영어 카피를 쓴다", () => {
    useI18n.setState({ lang: "en" });
    renderOverlay();
    expect(screen.getByText("3D Reference")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
    expect(screen.getByRole("slider", { name: /Opacity/ })).toBeTruthy();
  });

  it("viewport 슬롯을 교체하면 커스텀 뷰어가 렌더링된다", () => {
    renderOverlay({
      viewport: () => <div data-testid="custom-viewport">custom</div>,
    });
    expect(screen.getByTestId("custom-viewport")).toBeTruthy();
    expect(screen.queryByTestId("reference-overlay-snapshot")).toBeNull();
  });

  it("포즈 스트립의 실루엣 버튼들은 스크린리더에서 숨겨진다", () => {
    renderOverlay();
    const group = screen.getByRole("group");
    const poseButtons = within(group).getAllByRole("button");
    expect(poseButtons.length).toBe(ADVANCED_WEBTOON_POSES.length);
    for (const button of poseButtons) {
      const svg = button.querySelector("svg");
      expect(svg?.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
