// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockEngine } from "../../testing/mock-engine";
import { MockLabProvider, createMockEngineSession } from "../../testing/mock-store";

import { createViewportRegistry } from "./viewport-registry";
import { WorkbenchLayout } from "./WorkbenchLayout";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function ViewportPaneStub() {
  return <canvas data-testid="pane-canvas" />;
}

function SlotPanelStub() {
  return <p>슬롯 패널 스텁</p>;
}

describe("app/shell/WorkbenchLayout", () => {
  it("패널이 없으면 기본 캔버스를 등록하고 미조립 안내를 보여준다", () => {
    const viewport = createViewportRegistry();
    render(
      <MockLabProvider shell={{ viewport }}>
        <WorkbenchLayout panels={{}} />
      </MockLabProvider>,
    );
    expect(viewport.current()).toBeInstanceOf(HTMLCanvasElement);
    expect(screen.getByLabelText("캐릭터 뷰포트(기본 캔버스)")).toBeTruthy();
    expect(screen.getByText(/SlotPanel\(state-presets 작업자\)/u)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "슬롯 레일(15칸)" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "인스펙터" })).toBeTruthy();
  });

  it("ViewportPane·SlotPanel이 있으면 그것을 그리고 호스트 탐색으로 캔버스를 찾는다", () => {
    const viewport = createViewportRegistry();
    render(
      <MockLabProvider shell={{ viewport }}>
        <WorkbenchLayout panels={{ ViewportPane: ViewportPaneStub, SlotPanel: SlotPanelStub }} />
      </MockLabProvider>,
    );
    expect(viewport.current()).toBe(screen.getByTestId("pane-canvas"));
    expect(screen.getByText("슬롯 패널 스텁")).toBeTruthy();
    expect(screen.queryByText(/기본 캔버스만/u)).toBeNull();
  });

  it("기본 캔버스는 표시 크기 × 픽셀비로 렌더 버퍼를 맞추고 엔진에 resize를 알린다", () => {
    const callbacks: Array<() => void> = [];
    class ResizeObserverStub {
      constructor(callback: () => void) {
        callbacks.push(callback);
      }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.stubGlobal("devicePixelRatio", 3);
    Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", { configurable: true, get: () => 400 });
    Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", { configurable: true, get: () => 300 });
    try {
      const engine = createMockEngine();
      const session = createMockEngineSession();
      session.setEngine(engine);
      const viewport = createViewportRegistry();
      render(
        <MockLabProvider shell={{ viewport }} engineSession={session}>
          <WorkbenchLayout panels={{}} />
        </MockLabProvider>,
      );
      const canvas = screen.getByLabelText("캐릭터 뷰포트(기본 캔버스)") as HTMLCanvasElement;
      // 픽셀비는 2로 제한된다
      expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 800, height: 600 });
      expect(engine.calls.filter((call) => call.method === "resize")).toEqual([{ method: "resize", args: [800, 600] }]);
      // 같은 크기에서 관찰자가 다시 불려도 엔진에 다시 알리지 않는다
      for (const callback of callbacks) callback();
      expect(engine.calls.filter((call) => call.method === "resize")).toHaveLength(1);
    } finally {
      Reflect.deleteProperty(HTMLCanvasElement.prototype, "clientWidth");
      Reflect.deleteProperty(HTMLCanvasElement.prototype, "clientHeight");
    }
  });
});
