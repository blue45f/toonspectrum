// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createStudioShellStrokeFocusController,
  shouldBeginStudioShellStrokeFocus,
} from "./studio-shell-stroke-focus";

function pointer(
  target: EventTarget,
  overrides: Partial<Pick<PointerEvent, "button" | "defaultPrevented" | "isPrimary" | "pointerType">> = {},
) {
  return {
    target,
    button: 0,
    defaultPrevented: false,
    isPrimary: true,
    pointerType: "pen",
    ...overrides,
  } as Pick<PointerEvent, "button" | "defaultPrevented" | "isPrimary" | "pointerType" | "target">;
}

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("studio shell stroke focus admission", () => {
  it("admits only primary pen/mouse contacts on an armed canvas", () => {
    const viewport = document.createElement("div");
    viewport.dataset.studioCanvasViewport = "";
    viewport.dataset.studioDrawDockSafeArea = "true";
    const canvas = document.createElement("canvas");
    viewport.append(canvas);
    document.body.append(viewport);

    expect(shouldBeginStudioShellStrokeFocus(pointer(canvas))).toBe(true);
    expect(shouldBeginStudioShellStrokeFocus(pointer(canvas, { pointerType: "mouse" }))).toBe(true);
    expect(shouldBeginStudioShellStrokeFocus(pointer(canvas, { pointerType: "touch" }))).toBe(false);
    expect(shouldBeginStudioShellStrokeFocus(pointer(canvas, { button: 2 }))).toBe(false);
    expect(shouldBeginStudioShellStrokeFocus(pointer(canvas, { isPrimary: false }))).toBe(false);

    viewport.dataset.studioDrawDockSafeArea = "false";
    expect(shouldBeginStudioShellStrokeFocus(pointer(canvas))).toBe(false);
  });

  it("does not react to controls nested inside the canvas viewport", () => {
    const viewport = document.createElement("div");
    viewport.dataset.studioCanvasViewport = "";
    viewport.dataset.studioDrawDockSafeArea = "true";
    const control = document.createElement("button");
    viewport.append(control);
    document.body.append(viewport);

    expect(shouldBeginStudioShellStrokeFocus(pointer(control))).toBe(false);
  });
});

describe("studio shell stroke focus controller", () => {
  it("keeps a settling fence between consecutive marks", () => {
    vi.useFakeTimers();
    const phases: string[] = [];
    const controller = createStudioShellStrokeFocusController((phase) => phases.push(phase), 700);

    controller.begin(7);
    controller.end(7);
    expect(phases).toEqual(["drawing", "settling"]);
    vi.advanceTimersByTime(699);
    expect(controller.snapshot()).toBe("settling");
    vi.advanceTimersByTime(1);
    expect(controller.snapshot()).toBe("idle");
  });

  it("cancels settling when the next stroke starts and waits for every active pointer", () => {
    vi.useFakeTimers();
    const phases: string[] = [];
    const controller = createStudioShellStrokeFocusController((phase) => phases.push(phase), 700);

    controller.begin(1);
    controller.end(1);
    vi.advanceTimersByTime(300);
    controller.begin(2);
    controller.begin(3);
    controller.end(2);
    expect(controller.snapshot()).toBe("drawing");
    controller.end(3);
    vi.advanceTimersByTime(700);

    expect(phases).toEqual(["drawing", "settling", "drawing", "settling", "idle"]);
  });

  it("resets immediately on lifecycle loss", () => {
    vi.useFakeTimers();
    const phases: string[] = [];
    const controller = createStudioShellStrokeFocusController((phase) => phases.push(phase));
    controller.begin(11);
    controller.reset();
    vi.runAllTimers();
    expect(phases).toEqual(["drawing", "idle"]);
  });
});
