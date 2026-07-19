// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioLazyPanelStack,
  type StudioLazyPanelStackHandlers,
  type StudioLazyPanelStackProps,
} from "./StudioLazyPanelStack";

vi.mock("./studio-page-lazy-ui", () => {
  const panel = (name: string) => () => (
    <div data-optional-panel={name}>{name}</div>
  );
  return {
    StudioAiProvenancePanel: panel("ai-provenance"),
    StudioAutoActionsPanel: panel("auto-actions"),
    StudioBackground3D: ({ onClose, onInsert }: { onClose: () => void; onInsert: (value: unknown) => void }) => (
      <div data-optional-panel="bg3d">
        <button type="button" onClick={() => onInsert({ kind: "bg3d" })}>BG3D 삽입</button>
        <button type="button" onClick={onClose}>BG3D 닫기</button>
      </div>
    ),
    StudioCharacterBiblePanel: panel("character-bible"),
    StudioCheckpointPanel: panel("checkpoint"),
    StudioColorWheelOverlay: panel("color-wheel"),
    StudioCommentsPanel: ({ open }: { open: boolean }) => (
      <div data-optional-panel="comments" data-open={String(open)} />
    ),
    StudioContinuityPanel: panel("continuity"),
    StudioPageReviewPanel: panel("page-review"),
    StudioProductionInsightsPanel: panel("production-insights"),
    StudioPublicationOperationsPanel: panel("publication-operations"),
    StudioPublishPackagePanel: panel("publish-package"),
    StudioPublishPreflightPanel: panel("publish-preflight"),
    StudioQuickActionsMenu: panel("quick-actions"),
    StudioReferencePanel: panel("reference"),
    StudioScenarioAutoLayoutPanel: panel("scenario"),
    StudioScrollPreviewPanel: panel("scroll-preview"),
    StudioStoryboardGridPanel: panel("storyboard"),
    StudioTeamPanel: panel("team"),
    StudioTimelapsePanel: panel("timelapse"),
    StudioVrmPoser: ({
      initialScene,
      onClose,
      onInsert,
    }: {
      initialScene?: unknown;
      onClose: () => void;
      onInsert: (value: unknown) => void;
    }) => (
      <div data-optional-panel="vrm" data-has-initial-scene={String(Boolean(initialScene))}>
        <button type="button" onClick={() => onInsert({ kind: "vrm" })}>VRM 삽입</button>
        <button type="button" onClick={onClose}>VRM 닫기</button>
      </div>
    ),
    StudioWriterRoomPanel: panel("writer-room"),
    WorkFxPanel: panel("work-fx"),
  };
});

function createHandlers(): StudioLazyPanelStackHandlers {
  return {
    insertBg3dResult: vi.fn(async () => true),
    insertVrmResult: vi.fn(async () => true),
  } as unknown as StudioLazyPanelStackHandlers;
}

function createProps(
  overrides: Partial<StudioLazyPanelStackProps> = {},
): StudioLazyPanelStackProps {
  return {
    aiProvenanceOpen: false,
    autoActionsOpen: false,
    bg3dOpen: false,
    characterBibleOpen: false,
    checkpointPanelOpen: false,
    colorWheelOpen: false,
    commentsOpen: false,
    commentsPanelMounted: false,
    continuityOpen: false,
    elementById: new Map(),
    fxPanelOpen: false,
    isMobile: false,
    pageReviewOpen: false,
    pages: [],
    pagesHistory: [],
    poserVrmOpen: false,
    productionInsightsOpen: false,
    publicationOperationsOpen: false,
    publishPackageOpen: false,
    publishPreflightOpen: false,
    quickActionsOpen: false,
    recentColors: [],
    referencePanelOpen: false,
    scenarioOpen: false,
    scrollPreviewOpen: false,
    storyboardGridOpen: false,
    teamPanelOpen: false,
    timelapseOpen: false,
    quickActionsDisabledActions: new Set(),
    stableHandlers: createHandlers(),
    writerRoomOpen: false,
    ...overrides,
  } as unknown as StudioLazyPanelStackProps;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("StudioLazyPanelStack", () => {
  it("does not mount optional surfaces while every open flag is false", () => {
    const view = render(<StudioLazyPanelStack {...createProps()} />);

    expect(view.container.querySelectorAll("[data-optional-panel]")).toHaveLength(0);
  });

  it("keeps the comments rail mounted while closed only after its retry-preserving flag is set", () => {
    const view = render(
      <StudioLazyPanelStack
        {...createProps({ commentsOpen: false, commentsPanelMounted: false })}
      />
    );
    expect(view.container.querySelector('[data-optional-panel="comments"]')).toBeNull();

    view.rerender(
      <StudioLazyPanelStack
        {...createProps({ commentsOpen: false, commentsPanelMounted: true })}
      />
    );
    expect(view.container.querySelector('[data-optional-panel="comments"]')?.getAttribute("data-open"))
      .toBe("false");
  });

  it("delegates semantic VRM insertion and clears the caller-owned initial scene on close", () => {
    const stableHandlers = createHandlers();
    const setPoserInitialDataUrl = vi.fn();
    const setPoserInitialElementId = vi.fn();
    const setPoserVrmOpen = vi.fn();
    const scene = { version: 1 };
    render(
      <StudioLazyPanelStack
        {...createProps({
          elementById: new Map([
            ["vrm-image", { id: "vrm-image", type: "image", vrmScene: scene } as never],
          ]),
          poserInitialElementId: "vrm-image",
          poserVrmOpen: true,
          setPoserInitialDataUrl,
          setPoserInitialElementId,
          setPoserVrmOpen,
          stableHandlers,
        })}
      />
    );

    expect(screen.getByText("VRM 삽입").closest("[data-has-initial-scene]")?.getAttribute("data-has-initial-scene"))
      .toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "VRM 삽입" }));
    expect(stableHandlers.insertVrmResult).toHaveBeenCalledWith({ kind: "vrm" });

    fireEvent.click(screen.getByRole("button", { name: "VRM 닫기" }));
    expect(setPoserVrmOpen).toHaveBeenCalledWith(false);
    expect(setPoserInitialDataUrl).toHaveBeenCalledWith(undefined);
    expect(setPoserInitialElementId).toHaveBeenCalledWith(undefined);
  });

  it("delegates semantic BG3D insertion and clears every caller-owned initial value on close", () => {
    const stableHandlers = createHandlers();
    const setBg3dInitialDataUrl = vi.fn();
    const setBg3dInitialElementId = vi.fn();
    const setBg3dInitialScene = vi.fn();
    const setBg3dOpen = vi.fn();
    render(
      <StudioLazyPanelStack
        {...createProps({
          bg3dOpen: true,
          setBg3dInitialDataUrl,
          setBg3dInitialElementId,
          setBg3dInitialScene,
          setBg3dOpen,
          stableHandlers,
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "BG3D 삽입" }));
    expect(stableHandlers.insertBg3dResult).toHaveBeenCalledWith({ kind: "bg3d" });

    fireEvent.click(screen.getByRole("button", { name: "BG3D 닫기" }));
    expect(setBg3dOpen).toHaveBeenCalledWith(false);
    expect(setBg3dInitialDataUrl).toHaveBeenCalledWith(undefined);
    expect(setBg3dInitialScene).toHaveBeenCalledWith(undefined);
    expect(setBg3dInitialElementId).toHaveBeenCalledWith(undefined);
  });
});
