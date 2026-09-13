// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { subscribeStudioCommandSearchRequests } from "./studio-help-center-channel";
import { STUDIO_GETTING_STARTED_TASKS } from "./studio-toolbar-disclosure";
import { StudioWorkflowAccess, type StudioWorkflowAccessProps } from "./StudioWorkflowAccess";

const showModalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

beforeAll(() => {
  // jsdom does not implement the browser top layer. Tests exercise our behavior,
  // not a simulated claim that native browser focus trapping was verified.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) { this.removeAttribute("open"); },
  });
});

afterAll(() => {
  if (showModalDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModalDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
  else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

afterEach(cleanup);

function setup(overrides: Partial<StudioWorkflowAccessProps> = {}) {
  const props: StudioWorkflowAccessProps = {
    expanded: false,
    canCollapse: true,
    controlsId: "advanced-tools",
    onToggleExpanded: vi.fn(),
    onTask: vi.fn(),
    onBeforeOpen: vi.fn(),
    ...overrides,
  };
  const view = render(<StudioWorkflowAccess {...props} />);
  return { ...view, props };
}

function openGuide() {
  fireEvent.click(screen.getByRole("button", { name: "시작 안내" }));
  return screen.getByRole("dialog") as HTMLDialogElement;
}

describe("Studio task-first workflow access", () => {
  it("does not interrupt work or mutate a document on mount or guide opening", () => {
    const { props } = setup();
    expect(screen.queryByRole("dialog")).toBeNull();
    const dialog = openGuide();
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(props.onBeforeOpen).toHaveBeenCalledTimes(1);
    expect(props.onTask).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "시작 안내 닫기" }));
  });

  it.each(STUDIO_GETTING_STARTED_TASKS)("dispatches $id once and closes the guide", (task) => {
    const { props } = setup();
    const dialog = openGuide();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(task.label) }));
    expect(props.onTask).toHaveBeenCalledTimes(1);
    expect(props.onTask).toHaveBeenCalledWith(task.id);
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "시작 안내" }));
  });

  it("explains edit locks without blocking preview and help", () => {
    const { props } = setup({ lockedReason: "검토 잠금을 먼저 해제해 주세요." });
    openGuide();
    expect(screen.getByRole("status").textContent).toContain("검토 잠금");
    for (const task of STUDIO_GETTING_STARTED_TASKS) {
      const button = screen.getByRole("button", { name: new RegExp(task.label) }) as HTMLButtonElement;
      expect(button.disabled).toBe(task.changesDocument);
      if (task.changesDocument) {
        expect(button.getAttribute("aria-describedby")).toBeTruthy();
        fireEvent.click(button);
      }
    }
    expect(props.onTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /독자처럼 미리보기/ }));
    expect(props.onTask).toHaveBeenCalledTimes(1);
    expect(props.onTask).toHaveBeenCalledWith("preview");
  });

  it("uses the existing command-search channel", () => {
    const received = vi.fn();
    const unsubscribe = subscribeStudioCommandSearchRequests(received);
    try {
      const { props } = setup();
      fireEvent.click(screen.getByRole("button", { name: "도구 찾기" }));
      expect(received).toHaveBeenCalledTimes(1);
      expect(received).toHaveBeenCalledWith({ scope: "all" });
      expect(props.onBeforeOpen).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("status")).toBeNull();
    } finally { unsubscribe(); }
  });

  it("reports an unavailable search host instead of silently dropping the action", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "도구 찾기" }));
    expect(screen.getByRole("status").textContent).toContain("검색이 아직 준비되지 않았어요");
  });

  it("exposes the disclosure state and retains the user's full-mode choice", () => {
    const { props, rerender } = setup();
    const more = screen.getByRole("button", { name: "더 많은 도구" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(more.getAttribute("aria-controls")).toBe("advanced-tools");
    fireEvent.click(more);
    expect(props.onToggleExpanded).toHaveBeenCalledTimes(1);
    rerender(<StudioWorkflowAccess {...props} expanded />);
    expect(screen.getByRole("button", { name: "기본 도구만" }).getAttribute("aria-expanded")).toBe("true");
    rerender(<StudioWorkflowAccess {...props} expanded canCollapse={false} />);
    expect(screen.queryByRole("button", { name: /더 많은 도구|기본 도구만/ })).toBeNull();
    expect(screen.getByRole("button", { name: "도구 찾기" })).toBeTruthy();
  });

  it("closes on Escape, restores focus and does not forward canvas shortcuts", () => {
    setup();
    const dialog = openGuide();
    const shortcut = vi.fn();
    window.addEventListener("keydown", shortcut);
    try {
      fireEvent.keyDown(dialog, { key: "b" });
      expect(shortcut).not.toHaveBeenCalled();
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(dialog.open).toBe(false);
      expect(shortcut).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "시작 안내" }));
    } finally { window.removeEventListener("keydown", shortcut); }
  });

  it("reports action failures without a false success message", () => {
    setup({ onTask: () => { throw new Error("not ready"); } });
    openGuide();
    fireEvent.click(screen.getByRole("button", { name: /만화 칸 만들기/ }));
    expect(screen.getByRole("status").textContent).toContain("도구를 열지 못했어요");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("uses an explicitly non-modal fallback when showModal is unavailable", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    try {
      setup();
      const dialog = openGuide();
      expect(dialog.getAttribute("aria-modal")).toBe("false");
      fireEvent.click(screen.getByRole("button", { name: "시작 안내 닫기" }));
      expect(dialog.open).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", descriptor);
    }
  });
});
