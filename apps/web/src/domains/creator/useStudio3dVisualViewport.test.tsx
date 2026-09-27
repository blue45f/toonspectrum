/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStudio3dVisualViewport } from "./useStudio3dVisualViewport";

class Viewport extends EventTarget {
  height = 664;
  offsetTop = 0;
  scale = 1;
}
function Harness({ enabled = true, inputType = "text", readOnly = false }: {
  readonly enabled?: boolean;
  readonly inputType?: string;
  readonly readOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useStudio3dVisualViewport(ref, enabled);
  return <div ref={ref} data-testid="surface"><input type={inputType} readOnly={readOnly} aria-label="프리셋 검색" /><button type="button">완료</button></div>;
}
const viewport = new Viewport();
beforeEach(() => {
  vi.useFakeTimers();
  viewport.height = 664;
  viewport.offsetTop = 0;
  viewport.scale = 1;
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerHeight", 664);
  vi.stubGlobal("innerWidth", 390);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function settle() { act(() => { vi.advanceTimersByTime(32); }); }

describe("3D 편집기의 실제 표시 영역", () => {
  it("키보드가 올라오면 높이와 오프셋을 갱신하고 닫히면 복구한다", () => {
    render(<Harness />);
    const surface = screen.getByTestId("surface");
    expect(surface.style.getPropertyValue("--studio-3d-viewport-height")).toBe("664px");
    screen.getByRole("textbox").focus();
    viewport.height = 350;
    viewport.offsetTop = 24;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(surface.style.getPropertyValue("--studio-3d-viewport-height")).toBe("350px");
    expect(surface.style.getPropertyValue("--studio-3d-viewport-top")).toBe("24px");
    expect(surface.getAttribute("data-studio-3d-keyboard-open")).toBe("true");
    viewport.height = 664;
    viewport.offsetTop = 0;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(surface.hasAttribute("data-studio-3d-keyboard-open")).toBe(false);
  });
  it("브라우저 핀치 확대를 역보정하거나 키보드로 오인하지 않는다", () => {
    render(<Harness />);
    const surface = screen.getByTestId("surface");
    screen.getByRole("textbox").focus();
    viewport.height = 332;
    viewport.scale = 2;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(surface.style.getPropertyValue("--studio-3d-viewport-height")).toBe("");
    expect(surface.style.getPropertyValue("--studio-3d-viewport-top")).toBe("");
    expect(surface.hasAttribute("data-studio-3d-keyboard-open")).toBe(false);
    viewport.scale = 1;
    viewport.height = 664;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(surface.style.getPropertyValue("--studio-3d-viewport-height")).toBe("664px");
  });
  it("키보드가 layout viewport도 줄이는 환경에서 입력 전 높이를 기준으로 도구를 재배치한다", () => {
    render(<Harness />);
    screen.getByRole("textbox").focus();
    vi.stubGlobal("innerHeight", 350);
    viewport.height = 350;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(screen.getByTestId("surface").getAttribute("data-studio-3d-keyboard-open")).toBe("true");
    screen.getByRole("button").focus();
    settle();
    expect(screen.getByTestId("surface").hasAttribute("data-studio-3d-keyboard-open")).toBe(false);
  });
  it("입력 중 가로 회전을 키보드 열림으로 오인하지 않는다", () => {
    render(<Harness />);
    screen.getByRole("textbox").focus();
    vi.stubGlobal("innerHeight", 390);
    vi.stubGlobal("innerWidth", 844);
    viewport.height = 390;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(screen.getByTestId("surface").hasAttribute("data-studio-3d-keyboard-open")).toBe(false);
    viewport.height = 180;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(screen.getByTestId("surface").getAttribute("data-studio-3d-keyboard-open")).toBe("true");
  });
  it.each(["file", "radio", "checkbox", "range", "color", "date", "button"])(
    "%s 입력의 포커스가 소프트 키보드용 레이아웃을 열지 않는다", (inputType) => {
      render(<Harness inputType={inputType} />);
      screen.getByLabelText("프리셋 검색").focus();
      viewport.height = 350;
      viewport.dispatchEvent(new Event("resize"));
      settle();
      expect(screen.getByTestId("surface").hasAttribute("data-studio-3d-keyboard-open")).toBe(false);
    },
  );
  it("읽기 전용 입력과 잘못된 viewport 좌표를 안전하게 처리한다", () => {
    render(<Harness readOnly />);
    screen.getByRole("textbox").focus();
    viewport.height = 350;
    viewport.offsetTop = Number.NaN;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    const surface = screen.getByTestId("surface");
    expect(surface.style.getPropertyValue("--studio-3d-viewport-top")).toBe("0px");
    expect(surface.hasAttribute("data-studio-3d-keyboard-open")).toBe(false);
    viewport.height = -1;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(surface.style.getPropertyValue("--studio-3d-viewport-height")).toBe("350px");
  });
  it("키보드와 무관한 작은 화면은 입력 상태로 바꾸지 않는다", () => {
    render(<Harness />);
    screen.getByRole("button").focus();
    viewport.height = 350;
    viewport.dispatchEvent(new Event("resize"));
    settle();
    expect(screen.getByTestId("surface").hasAttribute("data-studio-3d-keyboard-open")).toBe(false);
  });
  it("비활성화하면 표시 영역 스타일과 이벤트 처리를 해제한다", () => {
    const view = render(<Harness />);
    const surface = screen.getByTestId("surface");
    view.rerender(<Harness enabled={false} />);
    viewport.height = 300;
    viewport.dispatchEvent(new Event("resize"));
    fireEvent.focusIn(screen.getByRole("textbox"));
    settle();
    expect(surface.style.getPropertyValue("--studio-3d-viewport-height")).toBe("");
  });
  it("VisualViewport 미지원 환경에서는 창 높이를 사용한다", () => {
    vi.stubGlobal("visualViewport", undefined);
    render(<Harness />);
    expect(screen.getByTestId("surface").style.getPropertyValue("--studio-3d-viewport-height")).toBe("664px");
  });
});
