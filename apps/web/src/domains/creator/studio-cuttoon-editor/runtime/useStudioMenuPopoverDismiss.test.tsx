// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioMenuPopoverDismiss } from "./useStudioMenuPopoverDismiss";

afterEach(() => { cleanup(); document.body.innerHTML = ""; });

function fixture(panelAttribute = "data-studio-export-menu-panel") {
  const wrapper = document.createElement("div");
  const download = document.createElement("button");
  const launcher = document.createElement("button");
  launcher.setAttribute("aria-expanded", "true");
  wrapper.append(download, launcher);
  const outside = document.createElement("button");
  document.body.append(wrapper, outside);
  const triggerRef = { current: wrapper };
  const onDismiss = vi.fn();
  const hook = renderHook(({ open, dismiss }) => useStudioMenuPopoverDismiss({
    open, triggerRef, panelSelector: `[${panelAttribute}]`, onDismiss: dismiss,
  }), { initialProps: { open: true, dismiss: onDismiss } });
  const panel = document.createElement("div");
  panel.setAttribute(panelAttribute, "true");
  const control = document.createElement("button");
  panel.append(control);
  document.body.append(panel);
  return { ...hook, onDismiss, panel, control, launcher, outside, panelAttribute };
}

function escape(target: EventTarget): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function pointerDown(target: Element): void {
  target.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
}

describe("Studio menubar popover dismissal", () => {
  it.each(["data-studio-export-menu-panel", "data-studio-project-actions-menu"])(
    "closes %s on Escape and returns focus to its launcher before editor shortcuts",
    attribute => {
      const menu = fixture(attribute);
      const editorShortcut = vi.fn();
      window.addEventListener("keydown", editorShortcut);
      try {
        menu.control.focus();
        expect(escape(menu.control).defaultPrevented).toBe(true);
        expect(menu.onDismiss).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(menu.launcher);
        expect(editorShortcut).not.toHaveBeenCalled();
      } finally { window.removeEventListener("keydown", editorShortcut); }
    },
  );

  it("recognizes a delayed or replaced portal and the launcher as inside", () => {
    const menu = fixture();
    pointerDown(menu.control);
    const replacement = document.createElement("div");
    replacement.setAttribute(menu.panelAttribute, "true");
    menu.panel.replaceWith(replacement);
    pointerDown(replacement);
    pointerDown(menu.launcher);
    expect(menu.onDismiss).not.toHaveBeenCalled();
  });

  it("closes for an outside press without taking focus from the clicked control", () => {
    const menu = fixture();
    menu.outside.focus();
    pointerDown(menu.outside);
    expect(menu.onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(menu.outside);
  });

  it("respects a control consuming Escape and a separately mounted modal", () => {
    const menu = fixture();
    const consume = (event: KeyboardEvent) => event.preventDefault();
    menu.control.addEventListener("keydown", consume);
    escape(menu.control);
    expect(menu.onDismiss).not.toHaveBeenCalled();
    menu.control.removeEventListener("keydown", consume);
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.append(menu.outside);
    document.body.append(modal);
    escape(menu.outside);
    expect(menu.onDismiss).not.toHaveBeenCalled();
  });

  it("removes both listeners when closed or unmounted and uses the latest callback", () => {
    const menu = fixture();
    menu.rerender({ open: false, dismiss: menu.onDismiss });
    escape(menu.control);
    pointerDown(menu.outside);
    expect(menu.onDismiss).not.toHaveBeenCalled();
    const latestDismiss = vi.fn();
    menu.rerender({ open: true, dismiss: latestDismiss });
    escape(menu.control);
    expect(latestDismiss).toHaveBeenCalledOnce();
    expect(menu.onDismiss).not.toHaveBeenCalled();
    menu.unmount();
    escape(menu.control);
    pointerDown(menu.outside);
    expect(latestDismiss).toHaveBeenCalledOnce();
  });
});
