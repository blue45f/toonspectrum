// @vitest-environment jsdom
import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceContextPanel } from "./WorkspaceContextPanel";

const original = Object.fromEntries(["showModal", "close"].map((name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => {
  cleanup();
  for (const [name, descriptor] of Object.entries(original)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
function Fixture() {
  const [open, setOpen] = useState(false); const input = useRef<HTMLInputElement>(null);
  return <><button type="button" onClick={() => setOpen(true)}>찾기</button>
    <WorkspaceContextPanel open={open} title="작품 찾기" onClose={() => setOpen(false)} initialFocusRef={open ? input : undefined}>
      {open ? <input ref={input} type="search" aria-label="제목" /> : null}
    </WorkspaceContextPanel></>;
}
function open() { render(<Fixture />); const trigger = screen.getByRole("button", { name: "찾기" }); trigger.focus(); fireEvent.click(trigger); return trigger; }
it("focuses search on opening and restores the invoker after React removes that input", () => {
  const trigger = open(); const input = screen.getByRole("searchbox");
  expect(document.activeElement).toBe(input);
  expect(fireEvent.keyDown(input, { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it("does not treat an IME composition Escape as a panel dismissal", () => {
  open(); fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape", isComposing: true });
  expect(screen.getByRole("dialog", { name: "작품 찾기" })).toBeTruthy();
});
it("keeps the native cancel path and restores focus without relying on native close", () => {
  const trigger = open();
  expect(fireEvent(screen.getByRole("dialog"), new Event("cancel", { bubbles: false, cancelable: true }))).toBe(false);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
