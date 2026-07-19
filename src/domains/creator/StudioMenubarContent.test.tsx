// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioMenubarContent,
  type StudioMenubarContentHandlers,
  type StudioMenubarContentProps,
} from "./StudioMenubarContent";

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
    changeMobileImmersiveMode: vi.fn(),
    ensureWatermarkLoaded: vi.fn(() => WATERMARK),
    exportCurrentPageToPsd: vi.fn(async () => ({}) as never),
    exportCurrentPageToSvg: vi.fn(async () => ({}) as never),
    handleCapturePagesForPreset: vi.fn(async () => []),
    handleCopyToClipboard: vi.fn(async () => undefined),
    handleDownload: vi.fn(async () => undefined),
    handleDownloadAll: vi.fn(async () => undefined),
    handleExportProject: vi.fn(),
    handleExportProjectArchive: vi.fn(async () => undefined),
    handleImportProject: vi.fn(),
    handleImportProjectArchive: vi.fn(async () => undefined),
    handleImportPsd: vi.fn(async () => undefined),
    handleSave: vi.fn(async () => undefined),
    openAutoActions: vi.fn(async () => undefined),
    openOwnerFxPanel: vi.fn(async () => undefined),
    persistStudioWorkspaceState: vi.fn((state) => ({ state }) as never),
    setWatermark: vi.fn(),
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
    loadedWork: null,
    menu: null,
    mobileImmersive: false,
    pageCount: 2,
    pageLabels: ["첫 장면", "두 번째"],
    projectActionsOpen: false,
    projectActionsRef: { current: null },
    projectArchiveBusy: false,
    projectArchiveImportInputRef: { current: null },
    projectArchiveStatus: null,
    projectImportInputRef: { current: null },
    psdImportBusy: false,
    psdImportInputRef: { current: null },
    psdImportStatus: null,
    saving: false,
    setAiProvenanceOpen: vi.fn(),
    setCharacterBibleOpen: vi.fn(),
    setCheckpointPanelOpen: vi.fn(),
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

  it("preloads the asset surface before delegating the desktop insert shortcut", () => {
    const setMenu = vi.fn();
    render(<StudioMenubarContent {...createProps({ setMenu })} />);

    fireEvent.click(screen.getByRole("button", { name: "템플릿·에셋" }));

    expect(preloadStudioAssetMenuPanel).toHaveBeenCalledOnce();
    expect(setMenu).toHaveBeenCalledWith("template");
  });
});
