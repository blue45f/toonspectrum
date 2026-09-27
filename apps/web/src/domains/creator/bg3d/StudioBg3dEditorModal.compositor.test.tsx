// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dEditorModal } from "./StudioBg3dEditorModal";

import type { StudioBg3dEditorModalHost } from "./StudioBg3dEditorModal";
import type { StudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";

vi.mock("./studio-bg3d-editor-runtime-bindings", () => ({}));
vi.mock("./StudioBg3dEditorViewport", () => ({ StudioBg3dEditorViewport: () => null }));
vi.mock("./StudioBg3dEditorSidebar", () => ({ StudioBg3dEditorSidebar: () => null }));
vi.mock("./StudioBg3dSceneAssistantWorkspace", () => ({
  StudioBg3dSceneAssistantWorkspace: () => <div data-testid="mock-scene-assistant"><input aria-label="장면 검색" /></div>,
}));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

function emptyOutlinerController(): StudioBg3dSceneOutlinerController {
  return {
    query: "",
    items: [],
    filteredItems: [],
    hierarchy: {
      roots: [],
      childrenByParent: new Map(),
      parentById: new Map(),
      repairedOrphans: 0,
      repairedSelfParents: 0,
      repairedCycles: 0,
    },
    selectedIds: new Set(),
    setQuery: vi.fn(),
    select: vi.fn(),
    rename: vi.fn(),
    toggleVisibility: vi.fn(),
    toggleLock: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
  };
}

function host(
  overrides: Partial<StudioBg3dEditorModalHost> = {},
): StudioBg3dEditorModalHost {
  return {
    Boxes: () => null,
    X: () => null,
    CONTROL_BUTTON: "control",
    ICON_BUTTON: "icon-control",
    cx: (...parts: string[]) => parts.join(" "),
    open: true,
    webXrRendererLifetimeRetained: false,
    modalDialogRef: createRef<HTMLDivElement>(),
    isBatchRenderingShots: false,
    shotBatchProgress: null,
    shotBatchAbortRef: createRef<AbortController>(),
    isCapturing: false,
    deletingModelId: null,
    webXrSessionState: { status: "idle" },
    requestUserClose: vi.fn(),
    outlinerController: emptyOutlinerController(),
    ...overrides,
  };
}

describe("BG3D modal compositor boundary", () => {
  it("uses a dense readable scrim rather than sampling the underlying full-screen GPU canvas", () => {
    render(createElement(StudioBg3dEditorModal, { h: host() }));
    const dialog = screen.getByRole("dialog", { name: "장면 도우미" });
    expect(dialog.className).toContain("bg-[oklch(0.08_0.01_70/0.94)]");
    expect(dialog.className).not.toContain("backdrop-blur");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("tabindex")).toBe("-1");
  });

  it("opens in simple mode and keeps the professional workspace one click away", () => {
    render(createElement(StudioBg3dEditorModal, { h: host() }));
    const dialog = screen.getByRole("dialog", { name: "장면 도우미" });
    expect(dialog.getAttribute("data-studio-bg3d-experience")).toBe("simple");
    expect(dialog.getAttribute("data-studio-bg3d-workspace")).toBe("scene-assistant-v1");
    expect(screen.getByTestId("mock-scene-assistant")).toBeDefined();
    expect(screen.getByRole("button", { name: /간편/ }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /정밀/ }));
    expect(dialog.getAttribute("data-studio-bg3d-experience")).toBe("pro");
    expect(dialog.getAttribute("data-studio-bg3d-workspace")).toBe("professional-v2");
    expect(screen.getByRole("dialog", { name: "정밀 3D 편집" })).toBeDefined();
    expect(screen.getByRole("button", { name: /정밀/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the keyboard-focusable close action and its original dismissal handler", () => {
    const h = host();
    render(createElement(StudioBg3dEditorModal, { h }));
    const close = screen.getByRole("button", { name: /^닫기$/ });
    expect(close.getAttribute("data-bg3d-initial-focus")).toBe("true");
    fireEvent.click(close);
    expect(h.requestUserClose).toHaveBeenCalledOnce();
  });

  it("닫힌 상태에서 연 모달도 키보드 높이를 적용하고 모드를 바꿔도 닫기를 유지한다", () => {
    vi.useFakeTimers();
    const viewport = Object.assign(new EventTarget(), { height: 664, offsetTop: 0, scale: 1 });
    vi.stubGlobal("visualViewport", viewport);
    vi.stubGlobal("innerHeight", 664);
    const h = host({ open: false });
    const view = render(createElement(StudioBg3dEditorModal, { h }));
    view.rerender(createElement(StudioBg3dEditorModal, { h: { ...h, open: true } }));
    const dialog = screen.getByRole("dialog", { name: "장면 도우미" });
    screen.getByRole("textbox", { name: "장면 검색" }).focus();
    viewport.height = 350;
    viewport.dispatchEvent(new Event("resize"));
    act(() => { vi.advanceTimersByTime(32); });
    expect(dialog.style.getPropertyValue("--studio-3d-viewport-height")).toBe("350px");
    expect(dialog.getAttribute("data-studio-3d-keyboard-open")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBe("studio-bg3d-dialog-description");
    expect(document.getElementById("studio-bg3d-dialog-description")?.textContent).toContain("장소를 고르고");
    fireEvent.click(screen.getByRole("button", { name: /정밀/ }));
    expect(screen.getByRole("dialog", { name: "정밀 3D 편집" })).toBe(dialog);
    fireEvent.click(screen.getByRole("button", { name: /^닫기$/ }));
    expect(h.requestUserClose).toHaveBeenCalledOnce();
    view.rerender(createElement(StudioBg3dEditorModal, { h }));
    expect(dialog.style.getPropertyValue("--studio-3d-viewport-height")).toBe("");
  });

  it("does not dismiss or expose scene editing while a capture owns the scene", () => {
    const h = host({ isCapturing: true });
    render(createElement(StudioBg3dEditorModal, { h }));
    const close = screen.getByRole("button", { name: /^닫기$/ }) as HTMLButtonElement;
    expect(close.disabled).toBe(true);
    fireEvent.click(close);
    expect(h.requestUserClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog").querySelector('[aria-busy="true"]')?.hasAttribute("inert"))
      .toBe(true);
  });

  it("retains a hidden inert XR owner without retaining an accessible dialog", () => {
    const h = host({ open: false, webXrRendererLifetimeRetained: true });
    const view = render(createElement(StudioBg3dEditorModal, { h }));
    const root = view.container.firstElementChild;
    expect(root?.hasAttribute("hidden")).toBe(true);
    expect(root?.hasAttribute("inert")).toBe(true);
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.queryByRole("dialog")).toBeNull();
    view.rerender(createElement(StudioBg3dEditorModal, { h: host({ open: false }) }));
    expect(view.container.childNodes).toHaveLength(0);
  });
});
