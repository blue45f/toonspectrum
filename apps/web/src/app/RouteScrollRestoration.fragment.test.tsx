// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteScrollRestoration } from "./RouteScrollRestoration";

const previousScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (previousScrollIntoView) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", previousScrollIntoView);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
function mount(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><RouteScrollRestoration /><main id="main-content" tabIndex={-1} /></MemoryRouter>);
}
function addTarget() {
  const target = document.createElement("section");
  target.id = "late-section";
  document.getElementById("main-content")!.append(target);
  return target;
}
describe("single-owner lazy fragment restoration", () => {
  it("focuses a late fragment even when the page height does not change", async () => {
    mount("/learn#late-section");
    const target = addTarget();
    await waitFor(() => expect(document.activeElement).toBe(target));
    expect(target.scrollIntoView).toHaveBeenCalledOnce();
    expect(target.hasAttribute("tabindex")).toBe(false);
  });
  it("does not steal focus after the user cancels delayed restoration by interacting", async () => {
    mount("/learn#late-section");
    fireEvent.wheel(window);
    const target = addTarget();
    await act(async () => { await Promise.resolve(); });
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(target);
  });
  it("does not install public fragment observers inside a Studio document", async () => {
    mount("/studio/canvas#late-section");
    const target = addTarget();
    await act(async () => { await Promise.resolve(); });
    expect(target.scrollIntoView).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(target);
  });
});
