// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioPixelSelectionHud,
  type StudioPixelSelectionHudPlacementHandlers,
} from "./StudioPixelSelectionHud";
import {
  emptyPixelSelection,
  rectSelectionPolygon,
} from "./studio-selection-tools";

const selection = {
  ...emptyPixelSelection(),
  featherPx: 4,
  subpaths: [{
    mode: "add" as const,
    points: rectSelectionPolygon({ x: 0.1, y: 0.2 }, { x: 0.8, y: 0.9 }),
  }],
};
const SELECTION_RECT = { left: 560, top: 360, width: 240, height: 180 };
const CANVAS_RECT = { left: 224, top: 44, width: 900, height: 800 };

function placementHandlers(
  overrides: Partial<StudioPixelSelectionHudPlacementHandlers> = {},
): StudioPixelSelectionHudPlacementHandlers {
  return {
    getSelectionRect: () => SELECTION_RECT,
    getCanvasRect: () => CANVAS_RECT,
    ...overrides,
  };
}

function renderHud(
  overrides: Partial<Parameters<typeof StudioPixelSelectionHud>[0]> = {},
  stableHandlers = placementHandlers(),
) {
  const callbacks = {
    onOperationChange: vi.fn(),
    onExpand: vi.fn(),
    onContract: vi.fn(),
    onSmooth: vi.fn(),
    onFeatherChange: vi.fn(),
    onInvert: vi.fn(),
    onClear: vi.fn(),
  };
  const result = render(
    <StudioPixelSelectionHud
      visible
      selection={selection}
      operation="replace"
      stableHandlers={stableHandlers}
      {...callbacks}
      {...overrides}
    />,
  );
  return { ...result, callbacks, stableHandlers };
}

function hudNode(): HTMLElement {
  const node = document.querySelector<HTMLElement>('[data-studio-pixel-selection-hud="true"]');
  if (!node) throw new Error("pixel selection HUD not mounted");
  return node;
}

let rafQueue: FrameRequestCallback[] = [];

beforeEach(() => {
  rafQueue = [];
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    rafQueue.push(callback);
    return rafQueue.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return this.dataset?.studioPixelSelectionHud === "true" ? 720 : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return this.dataset?.studioPixelSelectionHud === "true" ? 48 : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function flushFrames() {
  const queued = rafQueue;
  rafQueue = [];
  for (const callback of queued) callback(0);
}

describe("StudioPixelSelectionHud", () => {
  it("anchors the professional selection actions beside the selected image", () => {
    renderHud();
    flushFrames();

    const hud = hudNode();
    expect(hud.style.visibility).toBe("visible");
    expect(hud.dataset.studioPixelSelectionHudSide).toBeTruthy();
    expect(hud.dataset.studioPixelSelectionHudWithinBudget).toBe("true");
    expect(screen.getByRole("toolbar", { name: "픽셀 선택 빠른 작업" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "픽셀 선택 경계 확장" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "픽셀 선택 경계 축소" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "픽셀 선택 경계 스무딩" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "선택 페더 픽셀" })).toHaveProperty("value", "4");
    expect(hud.textContent).toContain("1개 · 70% × 70% · 페더 4px");
  });

  it("routes mode, boundary, feather, invert, and clear commands without canvas bubbling", () => {
    const { callbacks } = renderHud();
    flushFrames();

    fireEvent.click(screen.getByRole("button", { name: "다음 선택: 교차" }));
    fireEvent.click(screen.getByRole("button", { name: "픽셀 선택 경계 확장" }));
    fireEvent.click(screen.getByRole("button", { name: "픽셀 선택 경계 축소" }));
    fireEvent.click(screen.getByRole("button", { name: "픽셀 선택 경계 스무딩" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "선택 페더 픽셀" }), {
      target: { value: "11" },
    });
    fireEvent.click(screen.getByRole("button", { name: "픽셀 선택 반전" }));
    fireEvent.click(screen.getByRole("button", { name: "픽셀 선택 해제" }));

    expect(callbacks.onOperationChange).toHaveBeenCalledWith("intersect");
    expect(callbacks.onExpand).toHaveBeenCalledOnce();
    expect(callbacks.onContract).toHaveBeenCalledOnce();
    expect(callbacks.onSmooth).toHaveBeenCalledOnce();
    expect(callbacks.onFeatherChange).toHaveBeenCalledWith(11);
    expect(callbacks.onInvert).toHaveBeenCalledOnce();
    expect(callbacks.onClear).toHaveBeenCalledOnce();
  });

  it("keeps full-image selection safe while allowing invert and clear", () => {
    renderHud({ selection: { ...emptyPixelSelection(), invert: true } });
    flushFrames();

    expect(screen.getByRole("button", { name: "픽셀 선택 경계 확장" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "픽셀 선택 경계 축소" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "픽셀 선택 경계 스무딩" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "픽셀 선택 반전" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "픽셀 선택 해제" })).toHaveProperty("disabled", false);
    expect(hudNode().textContent).toContain("전체 이미지 · 페더 0px");
  });

  it("locks every mutation on busy or review-locked surfaces", () => {
    renderHud({ readOnly: true });
    flushFrames();

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveProperty("disabled", true);
    }
    expect(screen.getByRole("spinbutton", { name: "선택 페더 픽셀" })).toHaveProperty("disabled", true);
  });

  it("hides when projection is unavailable and renders nothing without a usable selection", () => {
    renderHud({}, placementHandlers({ getSelectionRect: () => null }));
    flushFrames();
    expect(hudNode().style.visibility).toBe("hidden");

    cleanup();
    renderHud({ selection: emptyPixelSelection() });
    expect(document.querySelector('[data-studio-pixel-selection-hud="true"]')).toBeNull();
  });

  it("stays a body-portaled fixed overlay so selection never reflows the canvas", () => {
    const host = document.createElement("div");
    host.dataset.canvasHost = "true";
    document.body.append(host);
    const { container } = renderHud();
    flushFrames();
    const hud = hudNode();

    expect(container.contains(hud)).toBe(false);
    expect(host.contains(hud)).toBe(false);
    expect(hud.parentElement).toBe(document.body);
    expect(hud.style.position).toBe("fixed");
    expect(hud.style.left).toBe("0px");
    expect(hud.style.top).toBe("0px");
    expect(hud.style.transform).toContain("translate3d");
    host.remove();
  });
});
