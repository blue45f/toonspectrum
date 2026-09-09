// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  renderStudioCanvasStickyBanners,
  type StudioCanvasStickyBannersContext,
} from "./StudioCanvasStickyBanners";

const hudState = vi.hoisted(() => ({
  props: null as null | {
    magnification: number;
    minMagnification: number;
    maxMagnification: number;
    selectionCount: number;
    onSetMagnification: (magnification: number) => void;
    onFitSelection: () => void;
  },
}));

vi.mock("../studio-view-tools-hud-loader", () => ({
  StudioViewToolsHud: (props: NonNullable<typeof hudState.props>) => {
    hudState.props = props;
    return (
      <div role="toolbar" aria-label="precision view controls">
        <button type="button" onClick={() => props.onSetMagnification(1)}>
          확대율 100%
        </button>
        <button type="button" onClick={props.onFitSelection}>
          선택 영역 맞춤
        </button>
      </div>
    );
  },
}));

vi.mock("../live/StudioLiveCollaborationQuickControls", () => ({
  StudioLiveCollaborationQuickControls: () => null,
}));

vi.mock("../studio-page-lazy-ui", () => ({
  StudioLivePresenceDockConnected: () => null,
}));

function createContext(
  overrides: Partial<StudioCanvasStickyBannersContext> = {}
): StudioCanvasStickyBannersContext {
  const activePage = {
    id: "page-1",
    elements: [],
    bg: "#fff",
    bgGrad: null,
    canvasH: 1080,
  };
  return {
    activePage,
    canvasFlipH: false,
    canvasRotation: 0,
    closeViewToolWithFocus: vi.fn(),
    collaborationDocumentUnavailable: false,
    commentPinArmed: false,
    commitPages: vi.fn(() => true),
    dismissQuickStart: vi.fn(),
    effScale: 0.8,
    fitCanvasToWidth: vi.fn(),
    followingStudioSessionId: null,
    navigate: vi.fn(),
    pages: [activePage],
    remixId: null,
    resetView: vi.fn(),
    rotateCanvasView: vi.fn(),
    selectionCount: 3,
    setActualPixelView: vi.fn(),
    setCurrentPageId: vi.fn(() => true),
    setFollowingStudioSessionId: vi.fn(),
    setSelectedId: vi.fn(),
    setTeamPanelOpen: vi.fn(),
    setTool: vi.fn(),
    setZoom: vi.fn(),
    sourceHydrationPending: false,
    stopStudioCommentPlacementSession: vi.fn(),
    studioCrdtOperationSyncReady: true,
    t: (key) => key,
    toggleHorizontalCanvasView: vi.fn(),
    viewTool: "zoom",
    workHydrationFailed: false,
    workHydrationUnsupportedFormat: false,
    workId: null,
    zoom: 2,
    zoomToSelection: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  hudState.props = null;
  vi.restoreAllMocks();
});

describe("StudioCanvasStickyBanners precision View HUD wiring", () => {
  it("derives effective zoom bounds and adapts exact magnification to user zoom", () => {
    const context = createContext();

    render(<>{renderStudioCanvasStickyBanners(context)}</>);

    expect(hudState.props).toMatchObject({
      magnification: 0.8,
      minMagnification: 0.08,
      maxMagnification: 2,
      selectionCount: 3,
    });

    fireEvent.click(screen.getByRole("button", { name: "확대율 100%" }));
    expect(context.setZoom).toHaveBeenCalledWith(2.5);
  });

  it("forwards selection framing to the existing viewport controller", () => {
    const zoomToSelection = vi.fn();
    const context = createContext({ zoomToSelection });

    render(<>{renderStudioCanvasStickyBanners(context)}</>);
    fireEvent.click(screen.getByRole("button", { name: "선택 영역 맞춤" }));

    expect(zoomToSelection).toHaveBeenCalledOnce();
  });
});
