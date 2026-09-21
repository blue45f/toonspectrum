// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { revealStudioColorFocusedControl, studioColorControlScrollDelta } from "./studio-color-focus-visibility";

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
it.each([
  [20, 60, 0], [170, 210, 18], [-10, 30, -18], [20, 250, 12],
])("reveals [%i, %i] without overscrolling", (top, bottom, delta) => {
  expect(studioColorControlScrollDelta({ top, bottom }, { top: 0, bottom: 200 })).toBe(delta);
});
it("ignores unavailable geometry", () => {
  expect(studioColorControlScrollDelta({ top: NaN, bottom: 30 }, { top: 0, bottom: 200 })).toBe(0);
  expect(studioColorControlScrollDelta({ top: 10, bottom: 30 }, { top: 0, bottom: 0 })).toBe(0);
});
it("scrolls only the owning color body and preserves focus and text selection", () => {
  const root = document.createElement("div");
  const scroller = document.createElement("div"); scroller.dataset.studioColorScroll = "true";
  const input = document.createElement("input"); input.value = "#123456";
  root.append(scroller); scroller.append(input); document.body.append(root);
  vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue({ top: 100, bottom: 200 } as DOMRect);
  vi.spyOn(input, "getBoundingClientRect").mockReturnValue({ top: 180, bottom: 224 } as DOMRect);
  input.focus(); input.setSelectionRange(2, 4);
  revealStudioColorFocusedControl(root);
  expect(scroller.scrollTop).toBe(32);
  expect(document.activeElement).toBe(input);
  expect([input.selectionStart, input.selectionEnd]).toEqual([2, 4]);
  input.blur(); revealStudioColorFocusedControl(root);
  expect(scroller.scrollTop).toBe(32);
});
