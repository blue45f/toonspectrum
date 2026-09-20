// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceContextPanel } from "./WorkspaceContextPanel";

const original = Object.fromEntries(["show", "showModal", "close"].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));
const show = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
const showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
let wide = true;
beforeEach(() => {
  wide = true; show.mockClear(); showModal.mockClear();
  vi.stubGlobal("matchMedia", () => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(HTMLDialogElement.prototype, "show", { configurable: true, value: show });
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: showModal });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  for (const [name, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
it("opens an opt-in desktop inspector without making the workspace modal", () => {
  render(<WorkspaceContextPanel open title="People" presentation="adaptive" onClose={vi.fn()}><input aria-label="Person" /></WorkspaceContextPanel>);
  expect(show).toHaveBeenCalledOnce(); expect(showModal).not.toHaveBeenCalled(); expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("false");
});
it("preserves modal consent by default even on a desktop", () => {
  render(<WorkspaceContextPanel open title="Consent" onClose={vi.fn()}>Consent</WorkspaceContextPanel>);
  expect(showModal).toHaveBeenCalledOnce(); expect(show).not.toHaveBeenCalled();
});
it("uses modal behavior for narrow viewports", () => {
  wide = false; render(<WorkspaceContextPanel open title="People" presentation="adaptive" onClose={vi.fn()}>People</WorkspaceContextPanel>);
  expect(showModal).toHaveBeenCalledOnce(); expect(show).not.toHaveBeenCalled();
});
it("does not steal focus back after a desktop user resumed work outside the inspector", () => {
  const close = vi.fn();
  const view = (open: boolean) => <><button type="button">Canvas tools</button><WorkspaceContextPanel open={open} title="People" presentation="adaptive" onClose={close}>People</WorkspaceContextPanel></>;
  const { rerender } = render(view(true)); const outside = screen.getByRole("button", { name: "Canvas tools" }); outside.focus(); rerender(view(false));
  expect(document.activeElement).toBe(outside); expect(close).not.toHaveBeenCalled();
});
it("ignores composition Escape but allows explicit keyboard dismissal", () => {
  const close = vi.fn(); render(<WorkspaceContextPanel open title="People" presentation="adaptive" onClose={close}><input aria-label="Person" /></WorkspaceContextPanel>);
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape", isComposing: true }); expect(close).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" }); expect(close).toHaveBeenCalledOnce();
});
