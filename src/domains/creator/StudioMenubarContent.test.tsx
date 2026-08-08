// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioMenubarContent,
  type StudioMenubarContentHandlers,
  type StudioMenubarContentProps,
} from "./StudioMenubarContent";
import { StudioToolHintPreferencesProvider } from "./StudioToolHint";

import type { StudioAiProvenanceDocument } from "./studio-ai-provenance";
import type { StudioCharacterBible } from "./studio-character-bible";
import type { WatermarkSettings } from "./studio-watermark";
import type { StudioWriterRoomDocument } from "./studio-writer-room";

const {
  preloadStudioAssetMenuPanel,
  preloadStudioExportMenuPanel,
} = vi.hoisted(() => ({
  preloadStudioAssetMenuPanel: vi.fn(),
  preloadStudioExportMenuPanel: vi.fn(),
}));

vi.mock("./studio-page-lazy-ui", () => ({
  StudioExportMenuPanel: ({ onCopyToClipboard }: { onCopyToClipboard: () => void }) => (
    <div data-studio-export-menu-panel="true">
      <button type="button" onClick={onCopyToClipboard}>내보내기 복사</button>
    </div>
  ),
  StudioMainMenu: () => <nav aria-label="데스크톱 앱 메뉴" />,
  preloadStudioAssetMenuPanel,
  preloadStudioExportMenuPanel,
}));

vi.mock("./StudioWorkspaceMenuGate", () => ({
  StudioWorkspaceMenuGate: () => <button type="button">작업공간</button>,
}));

const WATERMARK = {
  enabled: false,
} as WatermarkSettings;

function createHandlers(): StudioMenubarContentHandlers {
  return {
    applyStudioWorkspaceLayout: vi.fn(),
    cancelInterchangeImport: vi.fn(),
    changeMobileImmersiveMode: vi.fn(),
    ensureWatermarkLoaded: vi.fn(() => WATERMARK),
    exportCurrentPageToInkMl: vi.fn(async () => ({}) as never),
    exportCurrentPageToWillV1: vi.fn(async () => ({}) as never),
    exportCurrentPageToPsd: vi.fn(async () => ({}) as never),
    exportCurrentPageToRasterInterchange: vi.fn(async () => ({}) as never),
    exportCurrentPageToSvg: vi.fn(async () => ({}) as never),
    handleCapturePagesForPreset: vi.fn(async () => []),
    handleCapturePagesForIndices: vi.fn(async () => []),
    handleCopyToClipboard: vi.fn(async () => undefined),
    handleDownload: vi.fn(async () => undefined),
    handleDownloadAll: vi.fn(async () => undefined),
    handleExportProject: vi.fn(),
    handleExportProjectArchive: vi.fn(async () => undefined),
    handleImportProject: vi.fn(),
    handleImportProjectArchive: vi.fn(async () => undefined),
    handleImportInterchangeArchive: vi.fn(async () => undefined),
    handleImportPsd: vi.fn(async () => undefined),
    handleSave: vi.fn(async () => undefined),
    openAutoActions: vi.fn(async () => undefined),
    openOwnerFxPanel: vi.fn(async () => undefined),
    redo: vi.fn(),
    persistStudioWorkspaceState: vi.fn((state) => ({ state }) as never),
    setWatermark: vi.fn(),
    toggleHistoryPanel: vi.fn(),
    undo: vi.fn(),
    toggleAnimationTimeline: vi.fn(),
    openTimelapse: vi.fn(),
    openStoryboardGrid: vi.fn(),
    openScrollPreview: vi.fn(),
    openContinuityCheck: vi.fn(),
    toggleDocumentComments: vi.fn(),
    openPageReview: vi.fn(),
  };
}

function createProps(
  overrides: Partial<StudioMenubarContentProps> = {},
): StudioMenubarContentProps {
  return {
    activePageLabel: "첫 장면",
    activeToolbarGroup: null,
    aiProvenance: { version: 1, operations: [] } as StudioAiProvenanceDocument,
    canvasH: 2_000,
    characterBible: { version: 1, characters: [] } as StudioCharacterBible,
    collaborationDocumentLocked: false,
    collaborationLockMessage: () => "협업 잠금",
    currentWorkspaceOwnerScope: "owner",
    displayLinkedTitleId: null,
    exportFormat: "png",
    exportMenuOpen: false,
    exportMenuRef: { current: null },
    exportPresetId: null,
    exportScale: 2,
    exportTransparent: false,
    fxPanelLoading: false,
    isExporting: false,
    isMobile: false,
    liveWorkspaceLayout: {} as StudioMenubarContentProps["liveWorkspaceLayout"],
    resolveWorkspaceDeviceKind: () => null,
    loadedWork: null,
    masterEditMode: false,
    menu: null,
    mobileImmersive: false,
    historyPanelOpen: false,
    openStudioCommentCount: 0,
    pageCount: 2,
    pageEditLocked: false,
    pageLabels: ["첫 장면", "두 번째"],
    projectActionsOpen: false,
    projectActionsRef: { current: null },
    projectArchiveBusy: false,
    projectArchiveImportInputRef: { current: null },
    projectArchiveStatus: null,
    projectImportInputRef: { current: null },
    interchangeImportBusy: false,
    interchangeImportInputRef: { current: null },
    interchangeImportStatus: null,
    psdImportBusy: false,
    psdImportInputRef: { current: null },
    psdImportStatus: null,
    redoDisabled: true,
    saving: false,
    setAiProvenanceOpen: vi.fn(),
    setAnimaticTimelineOpen: vi.fn(),
    setAssetRightsAuditOpen: vi.fn(),
    setCharacterBibleOpen: vi.fn(),
    setCheckpointPanelOpen: vi.fn(),
    setProductionBibleOpen: vi.fn(),
    setHybridDccOpen: vi.fn(),
    setSceneSnapshotOpen: vi.fn(),
    setExportFormat: vi.fn(),
    setExportMenuOpen: vi.fn(),
    setExportPresetId: vi.fn(),
    setExportScale: vi.fn(),
    setExportTransparent: vi.fn(),
    setMenu: vi.fn(),
    setProductionInsightsOpen: vi.fn(),
    setProjectActionsOpen: vi.fn(),
    setPublicationOperationsOpen: vi.fn(),
    setPublishPackageOpen: vi.fn(),
    setPublishPreflightOpen: vi.fn(),
    setWriterRoomOpen: vi.fn(),
    sharedDocument: null,
    stableHandlers: createHandlers(),
    studioMainMenuGroups: [],
    title: "테스트 원고",
    undoDisabled: true,
    watermark: WATERMARK,
    workId: null,
    workspaceMenuEpoch: 0,
    workspacePersistence: {
      ownerScope: "owner",
    } as StudioMenubarContentProps["workspacePersistence"],
    workspaceState: {} as StudioMenubarContentProps["workspaceState"],
    workspaceSyncNotice: null,
    writerRoom: {
      version: 1,
      completion: {
        premise: false,
        synopsis: false,
        "episode-outline": false,
        beats: false,
        scenes: false,
        "panel-plan": false,
        "dialogue-sfx": false,
      },
    } as StudioWriterRoomDocument,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("StudioMenubarContent", () => {
  it("keeps export controls in a body portal and delegates preload and copy actions", () => {
    const stableHandlers = createHandlers();
    const setExportMenuOpen = vi.fn();
    const setProjectActionsOpen = vi.fn();
    render(
      <StudioMenubarContent
        {...createProps({
          exportMenuOpen: true,
          setExportMenuOpen,
          setProjectActionsOpen,
          stableHandlers,
        })}
      />
    );

    const trigger = screen.getByRole("button", { name: "내보내기 옵션" });
    fireEvent.mouseEnter(trigger);
    fireEvent.focus(trigger);
    fireEvent.click(trigger);

    expect(preloadStudioExportMenuPanel).toHaveBeenCalledTimes(3);
    expect(stableHandlers.ensureWatermarkLoaded).toHaveBeenCalledOnce();
    expect(setProjectActionsOpen).toHaveBeenCalledWith(false);
    expect(setExportMenuOpen).toHaveBeenCalledWith(expect.any(Function));
    expect(vi.mocked(setExportMenuOpen).mock.calls.at(-1)?.[0]).toBeTypeOf("function");
    expect((vi.mocked(setExportMenuOpen).mock.calls.at(-1)?.[0] as (open: boolean) => boolean)(true)).toBe(false);

    const portal = document.body.querySelector('[data-studio-export-menu-panel="true"]');
    expect(portal).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "내보내기 복사" }));
    expect(stableHandlers.handleCopyToClipboard).toHaveBeenCalledOnce();
  });

  it("keeps project actions portalled and closes after delegated one-shot commands", () => {
    vi.useFakeTimers();
    const stableHandlers = createHandlers();
    const setProjectActionsOpen = vi.fn();
    const projectActionsRef = { current: null };
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          projectActionsRef,
          setProjectActionsOpen,
          stableHandlers,
        })}
      />
    );

    expect(document.body.querySelector('[data-studio-project-actions-menu="true"]')).not.toBeNull();
    expect(projectActionsRef.current).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "백업 (.json)" }));
    expect(stableHandlers.handleExportProject).toHaveBeenCalledOnce();
    expect(setProjectActionsOpen).not.toHaveBeenCalledWith(false);

    vi.runAllTimers();
    expect(setProjectActionsOpen).toHaveBeenCalledWith(false);
  });

  it("opens the reusable scene snapshot library from project actions", () => {
    const setSceneSnapshotOpen = vi.fn();
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          setSceneSnapshotOpen,
        })}
      />
    );

    const trigger = screen.getByRole("button", { name: "장면 스냅샷" });
    expect(trigger.className).toContain("min-h-11");
    fireEvent.click(trigger);
    expect(setSceneSnapshotOpen).toHaveBeenCalledWith(true);
  });

  it("opens the local animatic timeline from project actions", () => {
    const setAnimaticTimelineOpen = vi.fn();
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          setAnimaticTimelineOpen,
        })}
      />,
    );

    const trigger = screen.getByRole("button", { name: "애니매틱" });
    expect(trigger.className).toContain("min-h-11");
    fireEvent.click(trigger);
    expect(setAnimaticTimelineOpen).toHaveBeenCalledWith(true);
  });

  it("opens the production bible from project actions without crowding the main toolbar", () => {
    const setProductionBibleOpen = vi.fn();
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          setProductionBibleOpen,
        })}
      />
    );

    const trigger = screen.getByRole("button", { name: "제작 바이블" });
    expect(trigger.className).toContain("min-h-11");
    fireEvent.click(trigger);
    expect(setProductionBibleOpen).toHaveBeenCalledWith(true);
  });

  it("opens Hybrid DCC workspace from project actions", () => {
    const setHybridDccOpen = vi.fn();
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          setHybridDccOpen,
        })}
      />
    );

    const trigger = screen.getByRole("button", { name: /Hybrid DCC/i });
    expect(trigger.getAttribute("data-studio-hybrid-dcc-open")).toBe("true");
    fireEvent.click(trigger);
    expect(setHybridDccOpen).toHaveBeenCalledWith(true);
  });

  /**
   * 회귀 계약 — 아래 7종은 툴벨트에만 트리거가 있었고, 벨트 호스트는 데스크톱 `lg:hidden` +
   * 모바일 몰입 `max-lg:hidden`이 겹쳐 1600 / 900 / 430 전 구간에서 display:none 이었다.
   * (docs/perf/heavy-feature-findings.md §4-1) 다시 벨트 단독 소유로 돌아가면 여기서 깨진다.
   */
  it("restores every belt-only review surface as a clickable project action", () => {
    const stableHandlers = createHandlers();
    render(
      <StudioMenubarContent
        {...createProps({ projectActionsOpen: true, stableHandlers })}
      />
    );

    const expectations = [
      ["anim-timeline", "다중 레이어 타임라인", stableHandlers.toggleAnimationTimeline],
      ["timelapse", "타임랩스 녹화", stableHandlers.openTimelapse],
      ["storyboard-grid", "스토리보드 그리드 보기", stableHandlers.openStoryboardGrid],
      ["scroll-preview", "세로 스크롤 미리보기", stableHandlers.openScrollPreview],
      ["continuity", "이야기 연속성 검사", stableHandlers.openContinuityCheck],
      ["comments", "문서 댓글", stableHandlers.toggleDocumentComments],
      ["page-review", "페이지 검토와 편집 잠금", stableHandlers.openPageReview],
    ] as const;

    for (const [actionId, accessibleName, handler] of expectations) {
      const trigger = screen.getByRole<HTMLButtonElement>("button", { name: accessibleName });
      expect(trigger.getAttribute("data-studio-project-action")).toBe(actionId);
      // 벨트와 달리 이 호스트에는 뷰포트 게이트가 없다 — 실제로 눌린다.
      expect(trigger.disabled).toBe(false);
      expect(trigger.closest("[hidden]")).toBeNull();
      fireEvent.click(trigger);
      expect(handler).toHaveBeenCalledOnce();
    }
  });

  it("keeps history-scrubbing surfaces disabled during master edit and shows the unresolved comment count", () => {
    const stableHandlers = createHandlers();
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          masterEditMode: true,
          openStudioCommentCount: 3,
          pageEditLocked: true,
          stableHandlers,
        })}
      />
    );

    const disabledState = (name: string) =>
      screen.getByRole<HTMLButtonElement>("button", { name }).disabled;

    expect(disabledState("다중 레이어 타임라인")).toBe(true);
    expect(disabledState("타임랩스 녹화")).toBe(true);
    // 히스토리와 무관한 검수 표면은 마스터 편집 중에도 열려 있어야 한다.
    expect(disabledState("스토리보드 그리드 보기")).toBe(false);
    expect(disabledState("문서 댓글, 열림 3개")).toBe(false);
    expect(disabledState("페이지 검토, 현재 편집 잠금")).toBe(false);
  });

  it("locks the comment entry point when the shared document forbids even viewing", () => {
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          collaborationDocumentLocked: true,
          collaborationLockMessage: () => "문서가 잠겨 있어요",
          sharedDocument: {
            capabilities: { view: false },
          } as unknown as StudioMenubarContentProps["sharedDocument"],
        })}
      />
    );

    const trigger = screen.getByRole<HTMLButtonElement>("button", { name: "문서 댓글" });
    expect(trigger.disabled).toBe(true);
    expect(trigger.getAttribute("title")).toBe("문서가 잠겨 있어요");
  });

  it("opens the placed-asset rights ledger from project actions", () => {
    const setAssetRightsAuditOpen = vi.fn();
    render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          setAssetRightsAuditOpen,
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "에셋 권리 감사" }));
    expect(setAssetRightsAuditOpen).toHaveBeenCalledWith(true);
  });

  it("ref-clicks root import inputs and turns the busy control into an explicit cancel action", () => {
    // File inputs live on StudioPage root (data-studio-document-import-inputs), not in menubar.
    const stableHandlers = createHandlers();
    const interchangeImportInputRef = {
      current: { click: vi.fn() } as unknown as HTMLInputElement,
    };
    const view = render(
      <StudioMenubarContent
        {...createProps({
          projectActionsOpen: true,
          interchangeImportInputRef,
          stableHandlers,
        })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "ORA · CBZ · WILL" }));
    expect(interchangeImportInputRef.current.click).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("OpenRaster, CBZ 또는 WILL v1 가져오기")).toBeNull();

    view.rerender(
      <StudioMenubarContent
        {...createProps({
          interchangeImportBusy: true,
          interchangeImportInputRef,
          projectActionsOpen: true,
          stableHandlers,
        })}
      />
    );
    expect(screen.getByRole("button", { name: "PSD 가져오기" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "문서 검사 취소" }));
    expect(stableHandlers.cancelInterchangeImport).toHaveBeenCalledOnce();

    view.rerender(
      <StudioMenubarContent
        {...createProps({
          psdImportBusy: true,
          interchangeImportInputRef,
          projectActionsOpen: true,
          stableHandlers,
        })}
      />
    );
    expect(screen.getByRole("button", { name: "ORA · CBZ · WILL" }))
      .toHaveProperty("disabled", true);
  });

  it("delegates mobile immersive and save actions without taking controller state", () => {
    const stableHandlers = createHandlers();
    render(
      <StudioMenubarContent
        {...createProps({ isMobile: true, stableHandlers })}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "전체 화면 드로잉" }));
    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    fireEvent.click(screen.getByRole("button", { name: "게시하기" }));

    expect(stableHandlers.changeMobileImmersiveMode).toHaveBeenCalledWith(true);
    expect(stableHandlers.handleSave).toHaveBeenNthCalledWith(1, "draft");
    expect(stableHandlers.handleSave).toHaveBeenNthCalledWith(2, "published");
  });

  it("switches the mobile immersive coach from entering to exiting", () => {
    const view = render(
      <StudioToolHintPreferencesProvider mode="compact" touchHoldDelayMs={640} reduceMotion>
        <StudioMenubarContent {...createProps({ isMobile: true })} />
      </StudioToolHintPreferencesProvider>
    );

    fireEvent.focus(screen.getByRole("button", { name: "전체 화면 드로잉" }));
    expect(screen.getByRole("tooltip").textContent).toContain("캔버스 작업에 집중");

    view.rerender(
      <StudioToolHintPreferencesProvider mode="compact" touchHoldDelayMs={640} reduceMotion>
        <StudioMenubarContent
          {...createProps({ isMobile: true, mobileImmersive: true })}
        />
      </StudioToolHintPreferencesProvider>
    );
    fireEvent.focus(screen.getByRole("button", { name: "전체 화면 드로잉 종료" }));
    expect(screen.getByRole("tooltip").textContent).toContain("일반 작업 화면으로 돌아갑니다");
  });

  it("keeps the immersive pill compact: document context is sr-only, actions stay reachable", () => {
    render(
      <StudioMenubarContent
        {...createProps({ isMobile: true, mobileImmersive: true })}
      />
    );

    // 몰입 필은 콘텐츠 폭 기반이라 제목 스팬이 flex-1 로 눌리며 마지막 버튼을 잘라선 안 된다.
    // 문서 맥락은 보조기술 전용으로만 남긴다.
    const context = screen.getByText("테스트 원고 · 첫 장면");
    expect(context.className).toContain("sr-only");
    expect(context.className).not.toContain("flex-1");
    const exit = screen.getByRole("button", { name: "전체 화면 드로잉 종료" });
    const draft = screen.getByRole("button", { name: "임시저장" });
    const publish = screen.getByRole("button", { name: "게시하기" });
    expect(exit).toBeTruthy();
    expect(draft).toBeTruthy();
    expect(publish).toBeTruthy();
    // Sticky canvas ring was painting over the draft button in the compact pill.
    expect(exit.className).not.toContain("sticky");
    expect(exit.className).not.toContain("shadow-[0_0_0_4px");
    const actions = exit.closest("[data-studio-menubar-actions=\"true\"]");
    expect(actions?.className).toContain("gap-1");
    expect(actions?.className).not.toContain("gap-0.5");
  });

  it("keeps the horizontal-menu continuation cue through compact laptop widths", () => {
    const { container } = render(
      <StudioMenubarContent {...createProps()} />
    );

    const cue = container.querySelector(
      '[data-studio-menubar-overflow-cue="true"]'
    );
    expect(cue).not.toBeNull();
    expect(cue?.className).toContain("xl:hidden");
    expect(cue?.className).not.toContain("lg:hidden");
  });

  it("keeps the workspace trigger lane out of the history cluster while the menubar scrolls", () => {
    const { container } = render(<StudioMenubarContent {...createProps()} />);

    const workspace = screen.getByRole("button", { name: "작업공간" });
    const documentLane = workspace.parentElement;
    const primaryLane = container.querySelector('[data-studio-menubar-primary="true"]');

    expect(primaryLane?.className).toContain("overflow-x-auto");
    expect(documentLane?.className).toContain("min-w-max");
    expect(documentLane?.className).toContain("shrink-0");
    expect(documentLane?.className).not.toMatch(/(?:^|\s)shrink(?:\s|$)/u);
  });

  it("preloads the asset surface before delegating the desktop insert shortcut", () => {
    const setMenu = vi.fn();
    render(<StudioMenubarContent {...createProps({ setMenu })} />);

    fireEvent.click(screen.getByRole("button", { name: "템플릿·에셋" }));

    expect(preloadStudioAssetMenuPanel).toHaveBeenCalledOnce();
    expect(setMenu).toHaveBeenCalledWith("template");
  });

  it("exposes one authoritative desktop history cluster and delegates its commands", () => {
    const stableHandlers = createHandlers();
    render(
      <StudioMenubarContent
        {...createProps({
          historyPanelOpen: true,
          redoDisabled: false,
          stableHandlers,
          undoDisabled: false,
        })}
      />
    );

    const group = screen.getByRole("group", { name: "작업 내역 빠른 작업" });
    expect(group.getAttribute("data-studio-menubar-history-actions")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "실행취소" }));
    fireEvent.click(screen.getByRole("button", { name: "다시실행" }));
    fireEvent.click(screen.getByRole("button", { name: "작업 내역" }));

    expect(stableHandlers.undo).toHaveBeenCalledOnce();
    expect(stableHandlers.redo).toHaveBeenCalledOnce();
    expect(stableHandlers.toggleHistoryPanel).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "작업 내역" }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("routes meaningful top actions through the exclusive rich-tooltip channel", () => {
    render(
      <StudioMenubarContent
        {...createProps({
          redoDisabled: false,
          undoDisabled: false,
        })}
      />
    );

    for (const name of [
      "실행취소",
      "다시실행",
      "작업 내역",
      "템플릿·에셋",
      "말풍선",
      "현재 페이지 다운로드",
      "내보내기 옵션",
      "프로젝트 작업",
      "임시저장",
      "게시하기",
    ]) {
      const control = screen.getByRole("button", { name });
      expect(control.closest('[data-studio-tool-hint-target="true"]')).not.toBeNull();
      expect(control.getAttribute("title")).toBeNull();
    }
  });
});
