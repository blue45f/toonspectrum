// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioShellFloatingLayoutProvider } from "./StudioShellFloatingLayoutProvider";
import {
  STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS,
  isStudioShellDrawingSurfaceTarget,
} from "./studio-shell-drawing-auto-hide";
import { useStudioShellFloatingLayout } from "./studio-shell-floating-layout-context";

vi.mock("./studio-shell-floating-visibility-sqlite", () => ({
  acquireProductStudioShellFloatingVisibilityRepository: async () => ({
    load: async () => ({
      state: { version: 1, hidden: [], autoHideWhileDrawing: true },
      persisted: false,
      failure: null,
    }),
    save: async (state: unknown) => ({ state, status: "persisted", failure: null }),
    flush: async () => undefined,
  }),
}));
function Probe() {
  const shell = useStudioShellFloatingLayout();
  return (
    <output
      data-testid="floating-runtime"
      data-auto-hide={String(shell.autoHideWhileDrawing)}
      data-active={String(shell.drawingAutoHideActive)}
    />
  );
}
function dispatchPen(
  target: Element,
  type: "pointerdown" | "pointerup" | "pointercancel",
  pointerId = 7,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    pointerType: { value: "pen" },
    pointerId: { value: pointerId },
    button: { value: 0 },
    isPrimary: { value: true },
  });
  target.dispatchEvent(event);
}
beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.setItem(
    "toonspectrum:studio:shell-floating-visibility:v1",
    JSON.stringify({ version: 1, hidden: [], autoHideWhileDrawing: true }),
  );
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.useRealTimers();
});

describe("Studio shell drawing auto-hide", () => {
  it("recognizes drawing pixels but ignores controls and outside content", () => {
    document.body.innerHTML = `
      <div data-studio-canvas-viewport>
        <canvas id="drawing"></canvas>
        <button id="control" data-studio-canvas-control>도구</button>
      </div>
      <canvas id="outside"></canvas>
    `;
    expect(isStudioShellDrawingSurfaceTarget(document.querySelector("#drawing"))).toBe(true);
    expect(isStudioShellDrawingSurfaceTarget(document.querySelector("#control"))).toBe(false);
    expect(isStudioShellDrawingSurfaceTarget(document.querySelector("#outside"))).toBe(false);
  });

  it("hides during pen strokes and restores after the continuation delay", () => {
    render(
      <StudioShellFloatingLayoutProvider>
        <div data-studio-canvas-viewport>
          <canvas data-testid="drawing-canvas" />
          <button data-testid="canvas-control" data-studio-canvas-control>도구</button>
        </div>
        <Probe />
      </StudioShellFloatingLayoutProvider>,
    );

    const runtime = screen.getByTestId("floating-runtime");
    const canvas = screen.getByTestId("drawing-canvas");
    expect(runtime.getAttribute("data-auto-hide")).toBe("true");
    expect(runtime.getAttribute("data-active")).toBe("false");
    act(() => dispatchPen(canvas, "pointerdown"));
    expect(runtime.getAttribute("data-active")).toBe("true");

    act(() => dispatchPen(canvas, "pointerup"));
    expect(runtime.getAttribute("data-active")).toBe("true");

    act(() => vi.advanceTimersByTime(STUDIO_SHELL_DRAWING_AUTO_HIDE_RELEASE_MS - 1));
    expect(runtime.getAttribute("data-active")).toBe("true");

    act(() => vi.advanceTimersByTime(1));
    expect(runtime.getAttribute("data-active")).toBe("false");

    act(() => dispatchPen(screen.getByTestId("canvas-control"), "pointerdown", 9));
    expect(runtime.getAttribute("data-active")).toBe("false");
  });
});
