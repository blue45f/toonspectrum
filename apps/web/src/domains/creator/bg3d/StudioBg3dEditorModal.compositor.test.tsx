// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement, createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dEditorModal } from "./StudioBg3dEditorModal";

import type { StudioBg3dEditorModalHost } from "./StudioBg3dEditorModal";
import type { StudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";

vi.mock("./studio-bg3d-editor-runtime-bindings", () => ({}));
vi.mock("./StudioBg3dEditorViewport", () => ({ StudioBg3dEditorViewport: () => null }));
vi.mock("./StudioBg3dEditorSidebar", () => ({ StudioBg3dEditorSidebar: () => null }));
vi.mock("./StudioBg3dSceneAssistantWorkspace", () => ({
  StudioBg3dSceneAssistantWorkspace: () => <div data-testid="mock-scene-assistant" />,
}));
afterEach(() => cleanup());

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
