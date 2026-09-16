// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioToolBeltCreateModeGroups } from "./StudioToolBeltCreateModeGroups";

import type { StudioToolBeltContentProps, StudioToolBeltHintMap } from "./StudioToolBeltContent";

type Children = { children?: ReactNode };
vi.mock("./studio-chrome-ui", () => ({
  StudioToolbarCluster: ({ children }: Children) => <div>{children}</div>,
  StudioToolbarDivider: () => null,
  StudioFloatingToolPopover: ({
    children,
    open,
    id,
    className,
  }: Children & { open: boolean; id: string; className?: string }) =>
    open ? <div data-testid={id} className={className}>{children}</div> : null,
  studioChromeIconClass: () => "",
  STUDIO_ICON_SIZE: { toolCompact: 16, subtab: 12 },
  STUDIO_ICON_STROKE: 1.5,
}));
vi.mock("./studio-page-lazy-ui", () => ({
  preloadStudioAssetMenuPanel: vi.fn(),
  preloadStudioPaletteLibraryPanel: vi.fn(),
  preloadStudioReferencePanel: vi.fn(),
}));
vi.mock("./studio-panel-ui", () => ({ studioToolButtonClass: () => "" }));
vi.mock("./studio-tool-belt-lazy-ui", () => ({
  LazyStudioAiToolPopoverBody: () => <div>AI body</div>,
  LazyStudioAssetToolPopoverBody: () => <div>Asset body</div>,
  LazyStudioSceneToolPopoverBody: () => <div>Scene body</div>,
  LazyStudioStyleToolPopoverBody: () => <div>Style body</div>,
  preloadStudioAiToolPopoverBody: vi.fn(),
  preloadStudioAssetToolPopoverBody: vi.fn(),
  preloadStudioSceneToolPopoverBody: vi.fn(),
  preloadStudioStyleToolPopoverBody: vi.fn(),
}));
vi.mock("./StudioLazySurfaceFallback", () => ({ StudioPanelLoading: () => null }));
vi.mock("./StudioToolBeltCreateModeInsertTools", () => ({ StudioToolBeltCreateModeInsertTools: () => <div data-testid="core-insert-tools">삽입·말풍선·이미지</div> }));
vi.mock("./StudioToolBeltCreateModeUtilityButtons", () => ({ StudioToolBeltCreateModeUtilityButtons: () => <div data-testid="specialist-utilities">제작 도구</div> }));
vi.mock("./StudioToolHint", () => ({ StudioToolHintTarget: ({ children }: Children) => <>{children}</> }));

afterEach(cleanup);

function setup(overrides: Partial<StudioToolBeltContentProps> = {}) {
  // This component reads only this subset of the editor's 207-prop session contract.
  const toolBelt = {
    uiDensityMode: "simple",
    activeSurfaceReviewLocked: false,
    collaborationDocumentLocked: false,
    collaborationLockMessage: () => "공동 작업 잠금",
    activeToolbarGroup: null,
    advancedFillActive: false,
    advancedFillUnsupportedReason: null,
    drawMode: "pen",
    frameAnimOpen: false,
    frameAnimTargetId: null,
    menuRef: createRef<HTMLDivElement>(),
    referencePanelOpen: false,
    selected: null,
    tool: "select",
    setMenu: vi.fn(),
    setReferencePanelOpen: vi.fn(),
    setScrollPreviewOpen: vi.fn(),
    stableHandlers: {
      activatePrimaryCanvasTool: vi.fn(),
      addDiagonalSplit: vi.fn(),
      addFrame: vi.fn(),
      openFrameAnimationForSelected: vi.fn(),
      toggleAdvancedFill: vi.fn(),
      toggleSelectedFrameDiagonal: vi.fn(),
      openFeatureTutorial: vi.fn(),
    },
    ...overrides,
  } as unknown as StudioToolBeltContentProps;
  const hints = {} as StudioToolBeltHintMap;
  const view = render(<StudioToolBeltCreateModeGroups hints={hints} studioCanvasImageAccept="image/*" toolBelt={toolBelt} />);
  return { ...view, toolBelt };
}

describe("Studio toolbar disclosure integration", () => {
  it("keeps basic creation visible while folding specialist launchers", () => {
    setup();
    expect(screen.getByRole("button", { name: "컷 추가 · 만화 패널" })).toBeTruthy();
    expect(screen.getByTestId("core-insert-tools")).toBeTruthy();
    for (const name of ["사선 컷", "참고 이미지", "3D 스튜디오", "스타일", "AI", "프레임"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByTestId("specialist-utilities")).toBeNull();
  });

  it("opens the unified asset workspace from the primary template and asset entry", () => {
    const { toolBelt } = setup();
    fireEvent.click(screen.getByRole("button", { name: "템플릿·에셋" }));
    expect(toolBelt.setMenu).toHaveBeenCalledWith("asset");
  });

  it("gives the unified asset workspace a viewport-safe desktop surface without nested outer scrolling", () => {
    setup({ activeToolbarGroup: "assetGroup", menu: "asset" });
    const popover = screen.getByTestId("asset-group");
    expect(popover.className).toContain("lg:max-h-[calc(100dvh-7.5rem)]");
    expect(popover.className).toContain("lg:overflow-hidden");
  });

  it("expands and collapses without executing an edit", () => {
    const { toolBelt } = setup();
    fireEvent.click(screen.getByRole("button", { name: "더 많은 도구" }));
    for (const name of ["사선 컷", "참고 이미지", "3D 스튜디오", "스타일", "AI"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
    expect(screen.getByTestId("specialist-utilities")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기본 도구만" }));
    expect(screen.queryByRole("button", { name: "3D 스튜디오" })).toBeNull();
    expect(toolBelt.stableHandlers.addFrame).not.toHaveBeenCalled();
    expect(toolBelt.stableHandlers.activatePrimaryCanvasTool).not.toHaveBeenCalled();
  });

  it("respects full mode without offering a misleading collapse switch", () => {
    setup({ uiDensityMode: "full" });
    expect(screen.getByRole("button", { name: "3D 스튜디오" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "AI" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /더 많은 도구|기본 도구만/ })).toBeNull();
  });

  it("retains externally opened specialist popovers when collapsed", () => {
    setup({ activeToolbarGroup: "bgGroup" });
    expect(screen.getByTestId("bg-group").textContent).toBe("Scene body");
    expect(screen.queryByTestId("specialist-utilities")).toBeNull();
  });

  it("retains an open reference panel's close affordance", () => {
    const { toolBelt } = setup({ referencePanelOpen: true });
    const reference = screen.getByRole("button", { name: "참고 이미지" });
    expect(reference.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(reference);
    expect(toolBelt.setReferencePanelOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps animation discoverable when an image is selected", () => {
    setup({ selected: { id: "image-1", type: "image" } as StudioToolBeltContentProps["selected"] });
    expect((screen.getByRole("button", { name: "프레임" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("starts a drawing through the canonical transition, not direct tool state", () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value(this: HTMLDialogElement) { this.setAttribute("open", ""); },
    });
    try {
      const { toolBelt } = setup();
      fireEvent.click(screen.getByRole("button", { name: "시작 안내" }));
      fireEvent.click(screen.getByRole("button", { name: /그림 그리기/ }));
      expect(toolBelt.stableHandlers.activatePrimaryCanvasTool).toHaveBeenCalledTimes(1);
      expect(toolBelt.stableHandlers.activatePrimaryCanvasTool).toHaveBeenCalledWith("draw", "pen");
      expect(toolBelt.setMenu).toHaveBeenCalledWith(null);
    } finally {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", descriptor);
      else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    }
  });
});
