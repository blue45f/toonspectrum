import {
  Bookmark,
  ChevronDown,
  Clapperboard,
  ClipboardCheck,
  Download,
  Folder,
  GanttChartSquare,
  History as HistoryIcon,
  Loader2,
  Maximize2,
  MessageCircle,
  Minimize2,
  Music4,
  Package,
  ShieldCheck,
  Redo2,
  Undo2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import {
  Suspense,
  memo,
  type ChangeEvent,
  type ComponentProps,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

import { STUDIO_CANVAS_WIDTH as CANVAS_W } from "./studio-canvas-constants";
import {
  StudioExportMenuPanel,
  StudioMainMenu,
  preloadStudioAssetMenuPanel,
  preloadStudioExportMenuPanel,
} from "./studio-page-lazy-ui";
import { studioWriterRoomHasContent } from "./studio-writer-room";
import { StudioToolHintTarget } from "./StudioToolHint";
import { StudioWorkspaceMenuGate } from "./StudioWorkspaceMenuGate";

import type { StudioAiProvenanceDocument } from "./studio-ai-provenance";
import type { StudioCharacterBible } from "./studio-character-bible";
import type { StudioMenu } from "./studio-editor-tool-model";
import type { ExportFormat } from "./studio-export";
import type { PsdExportResult } from "./studio-psd-export";
import type {
  StudioRasterEncoded,
  StudioRasterInterchangeFormat,
} from "./studio-raster-interchange";
import type { StudioSharedDocument } from "./studio-shared-document-client";
import type { SvgExportResult } from "./studio-svg-export";
import type { StudioToolHintSpec } from "./studio-tool-hints";
import type { StudioToolbarGroupId } from "./studio-toolbar-groups";
import type { WatermarkSettings } from "./studio-watermark";
import type {
  StudioWorkspaceLayout,
  StudioWorkspaceLoadResult,
  StudioWorkspaceSaveResult,
  StudioWorkspaceState,
} from "./studio-workspaces";
import type { StudioWriterRoomDocument } from "./studio-writer-room";
import type { WorkDetail } from "@/src/infrastructure/creator-client";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

const MENUBAR_HINTS = {
  undo: {
    id: "menubar-undo",
    title: "실행취소",
    description: "가장 최근의 캔버스 또는 선택 편집을 한 단계 되돌립니다.",
    shortcut: "⌘Z",
    preview: "undo",
  },
  redo: {
    id: "menubar-redo",
    title: "다시실행",
    description: "되돌린 캔버스 또는 선택 편집을 다시 적용합니다.",
    shortcut: "⌘⇧Z",
    preview: "redo",
  },
  history: {
    id: "menubar-history",
    title: "작업 내역",
    description: "이 문서의 편집 단계를 확인하고 원하는 시점으로 이동합니다.",
    preview: "history",
    tip: "중요한 시점은 프로젝트 메뉴의 버전 기능으로 별도 복구 지점에 저장할 수 있어요.",
  },
  assets: {
    id: "menubar-assets",
    title: "템플릿·에셋",
    description: "템플릿, 콜라주, 장면, 클립, 효과와 내 에셋 라이브러리를 엽니다.",
    preview: "assets",
    tip: "자주 쓰는 소재는 내 에셋에 모아 반복 작업 시간을 줄여보세요.",
  },
  bubbles: {
    id: "menubar-bubbles",
    title: "말풍선",
    description: "말풍선 라이브러리를 열어 형태를 고르고 현재 장면에 배치합니다.",
    preview: "bubble",
    previewVariant: "open-library",
    tip: "배치 후 우측 속성에서 꼬리, 테두리, 여백과 대사를 정교하게 다듬을 수 있어요.",
  },
  download: {
    id: "menubar-download",
    title: "현재 페이지 다운로드",
    description: "현재 페이지를 선택한 배율과 이미지 형식으로 즉시 내보냅니다.",
    preview: "export",
    tip: "인쇄·후편집은 고배율, 빠른 검토 공유는 1×를 권장해요.",
  },
  exportOptions: {
    id: "menubar-export-options",
    title: "내보내기 옵션",
    description: "배율, 파일 형식, 투명 배경, 워터마크와 플랫폼 프리셋을 설정합니다.",
    preview: "export-options",
  },
  project: {
    id: "menubar-project",
    title: "프로젝트 작업",
    description: "백업·복구, 기획, 검토, 연재 운영과 게시 패키지 도구를 엽니다.",
    preview: "project",
    tip: "장기 보관이나 다른 기기로 옮길 때는 자산이 포함된 아카이브 백업을 사용하세요.",
  },
  immersive: {
    id: "menubar-immersive",
    title: "전체 화면 드로잉",
    description: "사이트 헤더와 보조 UI를 숨기고 모바일 화면을 캔버스 작업에 집중합니다.",
    preview: "fullscreen",
    previewVariant: "fullscreen",
  },
  immersiveExit: {
    id: "menubar-immersive-exit",
    title: "전체 화면 드로잉 종료",
    description: "캔버스 집중 화면을 닫고 사이트 헤더와 모바일 창작 메뉴가 보이는 일반 작업 화면으로 돌아갑니다.",
    preview: "fullscreen",
    previewVariant: "exit-fullscreen",
  },
  draft: {
    id: "menubar-save-draft",
    title: "임시저장",
    description: "현재 원고와 편집 상태를 게시하지 않고 안전하게 저장합니다.",
    shortcut: "⌘S",
    preview: "save",
  },
  publish: {
    id: "menubar-publish",
    title: "게시하기",
    description: "현재 원고를 게시 상태로 저장합니다. 게시 전 사전검사에서 구조와 고지를 확인할 수 있어요.",
    preview: "publish",
  },
} satisfies Readonly<Record<string, StudioToolHintSpec>>;

export interface StudioMenubarContentHandlers {
  applyStudioWorkspaceLayout: (layout: StudioWorkspaceLayout) => void;
  changeMobileImmersiveMode: (enabled: boolean) => void;
  ensureWatermarkLoaded: () => WatermarkSettings;
  exportCurrentPageToPsd: () => Promise<PsdExportResult>;
  exportCurrentPageToRasterInterchange: (
    format: StudioRasterInterchangeFormat
  ) => Promise<StudioRasterEncoded>;
  exportCurrentPageToSvg: () => Promise<SvgExportResult>;
  handleCapturePagesForPreset: (scope: "current" | "all") => Promise<HTMLCanvasElement[]>;
  handleCopyToClipboard: () => Promise<void>;
  handleDownload: () => Promise<void>;
  handleDownloadAll: (spacing?: number) => Promise<void>;
  handleExportProject: () => void;
  handleExportProjectArchive: () => Promise<void>;
  handleImportProject: (e: ChangeEvent<HTMLInputElement>) => void;
  handleImportProjectArchive: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleImportPsd: (e: ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleSave: (status: "published" | "draft") => Promise<void>;
  openAutoActions: () => Promise<void>;
  openOwnerFxPanel: () => Promise<void>;
  redo: () => void;
  persistStudioWorkspaceState: (nextState: StudioWorkspaceState) => StudioWorkspaceSaveResult;
  setWatermark: (next: WatermarkSettings) => void;
  toggleHistoryPanel: () => void;
  undo: () => void;
}

export interface StudioMenubarContentProps {
  activePageLabel: string;
  activeToolbarGroup: StudioToolbarGroupId | null;
  aiProvenance: StudioAiProvenanceDocument;
  canvasH: number;
  characterBible: StudioCharacterBible;
  collaborationDocumentLocked: boolean;
  collaborationLockMessage: () => string;
  currentWorkspaceOwnerScope: string;
  displayLinkedTitleId: string | null | undefined;
  exportFormat: ExportFormat;
  exportMenuOpen: boolean;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  exportPresetId: string | null;
  exportScale: number;
  exportTransparent: boolean;
  fxPanelLoading: boolean;
  isExporting: boolean;
  isMobile: boolean;
  liveWorkspaceLayout: StudioWorkspaceLayout;
  loadedWork: WorkDetail | null;
  menu: StudioMenu | null;
  mobileImmersive: boolean;
  historyPanelOpen: boolean;
  pageCount: number;
  pageLabels: string[];
  projectActionsOpen: boolean;
  projectActionsRef: RefObject<HTMLDivElement | null>;
  projectArchiveBusy: boolean;
  projectArchiveImportInputRef: RefObject<HTMLInputElement | null>;
  projectArchiveStatus: { tone: "good" | "warn" | "bad"; text: string; } | null;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  psdImportBusy: boolean;
  psdImportInputRef: RefObject<HTMLInputElement | null>;
  psdImportStatus: { tone: "good" | "warn"; text: string; } | null;
  saving: boolean;
  redoDisabled: boolean;
  setAiProvenanceOpen: Dispatch<SetStateAction<boolean>>;
  setCharacterBibleOpen: Dispatch<SetStateAction<boolean>>;
  setCheckpointPanelOpen: Dispatch<SetStateAction<boolean>>;
  setExportFormat: Dispatch<SetStateAction<ExportFormat>>;
  setExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  setExportPresetId: Dispatch<SetStateAction<string | null>>;
  setExportScale: Dispatch<SetStateAction<number>>;
  setExportTransparent: Dispatch<SetStateAction<boolean>>;
  setMenu: Dispatch<SetStateAction<StudioMenu | null>>;
  setProductionInsightsOpen: Dispatch<SetStateAction<boolean>>;
  setProjectActionsOpen: Dispatch<SetStateAction<boolean>>;
  setPublicationOperationsOpen: Dispatch<SetStateAction<boolean>>;
  setPublishPackageOpen: Dispatch<SetStateAction<boolean>>;
  setPublishPreflightOpen: Dispatch<SetStateAction<boolean>>;
  setWriterRoomOpen: Dispatch<SetStateAction<boolean>>;
  sharedDocument: StudioSharedDocument | null;
  studioMainMenuGroups: ComponentProps<typeof StudioMainMenu>["groups"];
  title: string;
  undoDisabled: boolean;
  watermark: WatermarkSettings;
  workId: string | null;
  workspaceMenuEpoch: number;
  workspacePersistence: StudioWorkspaceLoadResult;
  workspaceState: StudioWorkspaceState;
  workspaceSyncNotice: string | null;
  writerRoom: StudioWriterRoomDocument;
  stableHandlers: StudioMenubarContentHandlers;
}

export const StudioMenubarContent = memo(function StudioMenubarContent({
  activePageLabel,
  activeToolbarGroup,
  aiProvenance,
  canvasH,
  characterBible,
  collaborationDocumentLocked,
  collaborationLockMessage,
  currentWorkspaceOwnerScope,
  displayLinkedTitleId,
  exportFormat,
  exportMenuOpen,
  exportMenuRef,
  exportPresetId,
  exportScale,
  exportTransparent,
  fxPanelLoading,
  isExporting,
  isMobile,
  liveWorkspaceLayout,
  loadedWork,
  menu,
  mobileImmersive,
  historyPanelOpen,
  pageCount,
  pageLabels,
  projectActionsOpen,
  projectActionsRef,
  projectArchiveBusy,
  projectArchiveImportInputRef,
  projectArchiveStatus,
  projectImportInputRef,
  psdImportBusy,
  psdImportInputRef,
  psdImportStatus,
  saving,
  redoDisabled,
  setAiProvenanceOpen,
  setCharacterBibleOpen,
  setCheckpointPanelOpen,
  setExportFormat,
  setExportMenuOpen,
  setExportPresetId,
  setExportScale,
  setExportTransparent,
  setMenu,
  setProductionInsightsOpen,
  setProjectActionsOpen,
  setPublicationOperationsOpen,
  setPublishPackageOpen,
  setPublishPreflightOpen,
  setWriterRoomOpen,
  sharedDocument,
  studioMainMenuGroups,
  title,
  undoDisabled,
  watermark,
  workId,
  workspaceMenuEpoch,
  workspacePersistence,
  workspaceState,
  workspaceSyncNotice,
  writerRoom,
  stableHandlers,
}: StudioMenubarContentProps) {
  const {
    applyStudioWorkspaceLayout,
    changeMobileImmersiveMode,
    ensureWatermarkLoaded,
    handleCopyToClipboard,
    handleDownload,
    handleDownloadAll,
    handleExportProject,
    handleExportProjectArchive,
    handleImportProject,
    handleImportProjectArchive,
    handleImportPsd,
    handleSave,
    openAutoActions,
    openOwnerFxPanel,
    redo,
    persistStudioWorkspaceState,
    setWatermark,
    toggleHistoryPanel,
    undo,
    exportCurrentPageToPsd,
    exportCurrentPageToRasterInterchange,
    exportCurrentPageToSvg,
    handleCapturePagesForPreset,
  } = stableHandlers;
  return (
    <>
        <div
          data-studio-menubar-primary="true"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            mobileImmersive && "hidden"
          )}
        >
          {/* Document context and application commands may compress; publish actions never do. */}
          <div
            className={cn(
              "flex min-w-0 shrink items-center gap-1.5",
              mobileImmersive && "hidden"
            )}
          >
          <h1
            className="min-w-0 max-w-[8rem] truncate text-[0.8125rem] font-semibold tracking-tight text-fg xl:max-w-[16rem]"
            title={title.trim() || "무제"}
          >
            {title.trim() || "무제"}
          </h1>
          <span className="hidden shrink-0 rounded-md border border-line/60 bg-canvas/40 px-1.5 py-0.5 text-[0.62rem] font-medium tabular-nums text-fg-3 sm:inline">
            {activePageLabel}
          </span>
          {displayLinkedTitleId ? (
            <span className="hidden rounded-full border border-accent/30 bg-accent-soft/40 px-1.5 py-0.5 text-[0.6rem] font-semibold text-accent sm:inline">
              링크됨
            </span>
          ) : null}
          {workspacePersistence.ownerScope === currentWorkspaceOwnerScope ? (
            <StudioWorkspaceMenuGate
              key={`${currentWorkspaceOwnerScope}:${workspaceMenuEpoch}`}
              state={workspaceState}
              liveLayout={liveWorkspaceLayout}
              persistence={workspacePersistence}
              onStateChange={persistStudioWorkspaceState}
              onApplyLayout={applyStudioWorkspaceLayout}
            />
          ) : (
            <span role="status" className="inline-flex min-h-8 items-center text-[0.65rem] text-fg-3">
              전환 중…
            </span>
          )}
          {workspaceSyncNotice && workspacePersistence.ownerScope === currentWorkspaceOwnerScope ? (
            <span
              role="status"
              title={workspaceSyncNotice}
              className="max-w-40 truncate text-[0.62rem] font-medium text-cool"
            >
              {workspaceSyncNotice}
            </span>
          ) : null}
          </div>
          <span aria-hidden className="mx-0.5 hidden h-4 w-px shrink-0 bg-line md:block" />
          {/* The legacy tool belt is mobile-only. Keep the desktop history authority visible here
              so pointer commits, keyboard users, screen readers, and automation share one control. */}
          <div
            role="group"
            aria-label="작업 내역 빠른 작업"
            data-studio-menubar-history-actions="true"
            className={cn(
              "hidden shrink-0 items-center gap-0.5 md:flex",
              mobileImmersive && "!hidden"
            )}
          >
            <StudioToolHintTarget
              hint={MENUBAR_HINTS.undo}
              disabled={undoDisabled}
              unavailableReason={undoDisabled ? "되돌릴 편집 작업이 아직 없습니다." : undefined}
              preferredSide="bottom"
            >
              <button
                type="button"
                onClick={undo}
                disabled={undoDisabled}
                aria-label="실행취소"
                className={buttonClass({
                  size: "sm",
                  variant: "quiet",
                  className: "min-h-9 min-w-9 px-0 disabled:opacity-35",
                })}
              >
                <Undo2 size={14} aria-hidden />
              </button>
            </StudioToolHintTarget>
            <StudioToolHintTarget
              hint={MENUBAR_HINTS.redo}
              disabled={redoDisabled}
              unavailableReason={redoDisabled ? "다시 적용할 편집 작업이 아직 없습니다." : undefined}
              preferredSide="bottom"
            >
              <button
                type="button"
                onClick={redo}
                disabled={redoDisabled}
                aria-label="다시실행"
                className={buttonClass({
                  size: "sm",
                  variant: "quiet",
                  className: "min-h-9 min-w-9 px-0 disabled:opacity-35",
                })}
              >
                <Redo2 size={14} aria-hidden />
              </button>
            </StudioToolHintTarget>
            <StudioToolHintTarget hint={MENUBAR_HINTS.history} preferredSide="bottom">
              <button
                type="button"
                onClick={toggleHistoryPanel}
                aria-label="작업 내역"
                aria-pressed={historyPanelOpen}
                className={buttonClass({
                  size: "sm",
                  variant: historyPanelOpen ? "solid" : "quiet",
                  className: "min-h-9 min-w-9 px-0",
                })}
              >
                <HistoryIcon size={14} aria-hidden />
              </button>
            </StudioToolHintTarget>
          </div>
          <span aria-hidden className="mx-0.5 hidden h-4 w-px shrink-0 bg-line md:block" />
          {/* Desktop application commands live in the compressible center lane. */}
          <Suspense fallback={null}>
            <StudioMainMenu
              groups={studioMainMenuGroups}
              className={cn("hidden min-w-max shrink-0 md:flex", mobileImmersive && "!hidden")}
            />
          </Suspense>
          {/* Wide layouts expose high-frequency insert shortcuts; narrower widths use Insert. */}
          <div
            className={cn(
              "hidden min-w-0 items-center gap-0.5 xl:flex",
              mobileImmersive && "!hidden"
            )}
            role="group"
            aria-label="삽입 바로가기"
          >
          <StudioToolHintTarget hint={MENUBAR_HINTS.assets} preferredSide="bottom">
            <button
              type="button"
              onClick={() => {
                preloadStudioAssetMenuPanel();
                setMenu(activeToolbarGroup === "assetGroup" ? null : "template");
              }}
              aria-label="템플릿·에셋"
              aria-haspopup="menu"
              aria-expanded={activeToolbarGroup === "assetGroup"}
              className={cn(
                buttonClass({ size: "sm", variant: activeToolbarGroup === "assetGroup" ? "solid" : "quiet" }),
                "min-h-9 gap-1.5 px-2.5 text-[0.72rem]"
              )}
            >
              <Folder size={14} aria-hidden />
              템플릿·에셋
            </button>
          </StudioToolHintTarget>
          <StudioToolHintTarget hint={MENUBAR_HINTS.bubbles} preferredSide="bottom">
            <button
              type="button"
              onClick={() => setMenu(menu === "bubble" ? null : "bubble")}
              aria-label="말풍선"
              aria-haspopup="menu"
              aria-expanded={menu === "bubble"}
              className={cn(
                buttonClass({ size: "sm", variant: menu === "bubble" ? "solid" : "quiet" }),
                "min-h-9 gap-1.5 px-2.5 text-[0.72rem]"
              )}
            >
              <MessageCircle size={14} aria-hidden />
              말풍선
            </button>
          </StudioToolHintTarget>
          </div>
          <span aria-hidden className="mx-0.5 hidden h-4 w-px shrink-0 bg-line xl:block" />
        </div>
        {/* 파일·내보내기 — 드로잉 앱 메뉴바 */}
        <div
          data-studio-menubar-actions="true"
          className={cn(
            "flex shrink-0 flex-nowrap items-center gap-1",
            mobileImmersive && "min-w-0 w-full gap-0.5"
          )}
        >
          {isMobile ? (
            <StudioToolHintTarget
              hint={mobileImmersive ? MENUBAR_HINTS.immersiveExit : MENUBAR_HINTS.immersive}
              preferredSide="bottom"
            >
              <button
                type="button"
                onClick={() => changeMobileImmersiveMode(!mobileImmersive)}
                aria-pressed={mobileImmersive}
                aria-label={
                  mobileImmersive
                    ? "전체 화면 드로잉 종료"
                    : "전체 화면 드로잉"
                }
                data-studio-mobile-app-mode
                className={cn(
                  buttonClass({
                    size: "sm",
                    variant: mobileImmersive ? "solid" : "quiet",
                    className: "min-h-11 shrink-0 gap-1.5 whitespace-nowrap",
                  }),
                  "sticky left-0 z-20 shadow-[0_0_0_4px_var(--color-canvas)]"
                )}
              >
                {mobileImmersive ? (
                  <Minimize2 size={15} aria-hidden />
                ) : (
                  <Maximize2 size={15} aria-hidden />
                )}
                {mobileImmersive ? "종료" : "전체화면"}
              </button>
            </StudioToolHintTarget>
          ) : null}
          {mobileImmersive ? (
            <>
              <h1 className="sr-only">드로잉 전체화면</h1>
              <span
                className="min-w-0 max-w-40 flex-1 truncate px-1 text-xs font-semibold text-fg-2"
                title={`${title.trim() || "무제"} · ${activePageLabel}`}
              >
                {title.trim() || "무제"} · {activePageLabel}
              </span>
            </>
          ) : null}
          <div ref={exportMenuRef} className="relative flex shrink-0 items-center max-sm:hidden">
            <StudioToolHintTarget hint={MENUBAR_HINTS.download} preferredSide="bottom">
              <button
                type="button"
                onClick={() => handleDownload()}
                aria-label="현재 페이지 다운로드"
                className={cn(
                  buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5 pr-2" }),
                  isMobile && "min-h-11"
                )}
              >
                <Download size={14} aria-hidden /> <span className="max-xl:sr-only">다운로드</span>
                <span className="text-[10px] font-semibold tabular-nums text-fg-3 max-xl:hidden">
                  {exportScale}× {exportFormat.toUpperCase()}
                  {exportTransparent && exportFormat === "png" ? " · 투명" : null}
                </span>
              </button>
            </StudioToolHintTarget>
            <StudioToolHintTarget hint={MENUBAR_HINTS.exportOptions} preferredSide="bottom">
              <button
                type="button"
                onClick={() => {
                  preloadStudioExportMenuPanel();
                  ensureWatermarkLoaded();
                  setProjectActionsOpen(false);
                  setExportMenuOpen((open) => !open);
                }}
                onMouseEnter={preloadStudioExportMenuPanel}
                onFocus={preloadStudioExportMenuPanel}
                aria-expanded={exportMenuOpen}
                aria-label="내보내기 옵션"
                className={cn(
                  buttonClass({ size: "sm", variant: "quiet", className: "px-1.5" }),
                  isMobile && "min-h-11 min-w-11"
                )}
              >
                <ChevronDown
                  size={13}
                  aria-hidden
                  className={cn(
                    "transition-transform motion-reduce:transition-none",
                    exportMenuOpen && "rotate-180"
                  )}
                />
              </button>
            </StudioToolHintTarget>
            {exportMenuOpen && typeof document !== "undefined"
              ? createPortal(
                  <Suspense
                    fallback={
                      <div
                        data-studio-export-menu-panel="true"
                        className="fixed inset-x-2 top-12 z-[100] max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-xl border border-line bg-panel p-3 text-xs text-fg-3 shadow-2xl sm:inset-x-auto sm:right-3 sm:w-72"
                      >
                        내보내기 옵션을 여는 중...
                      </div>
                    }
                  >
                    <StudioExportMenuPanel
                      canvasWidth={CANVAS_W}
                      canvasHeight={canvasH}
                      exportScale={exportScale}
                      exportFormat={exportFormat}
                      exportTransparent={exportTransparent}
                      exportPresetId={exportPresetId}
                      watermark={watermark}
                      isExporting={isExporting}
                      exportTitle={title}
                      pageCount={pageCount}
                      pageLabels={pageLabels}
                      capturePagesForPreset={handleCapturePagesForPreset}
                      exportCurrentPageToSvg={exportCurrentPageToSvg}
                      exportCurrentPageToPsd={exportCurrentPageToPsd}
                      exportCurrentPageToRasterInterchange={exportCurrentPageToRasterInterchange}
                      setExportScale={setExportScale}
                      setExportFormat={setExportFormat}
                      setExportTransparent={setExportTransparent}
                      setExportPresetId={setExportPresetId}
                      setWatermark={setWatermark}
                      onCopyToClipboard={handleCopyToClipboard}
                    />
                  </Suspense>,
                  document.body
                )
              : null}
          </div>
          <div ref={projectActionsRef} className="relative shrink-0 max-sm:hidden">
            <StudioToolHintTarget hint={MENUBAR_HINTS.project} preferredSide="bottom">
              <button
                type="button"
                onClick={() => {
                  setExportMenuOpen(false);
                  setProjectActionsOpen((open) => !open);
                }}
                aria-label="프로젝트 작업"
                aria-haspopup="dialog"
                aria-expanded={projectActionsOpen}
                aria-controls="studio-project-actions-menu"
                className={buttonClass({
                  size: "sm",
                  variant: "quiet",
                  className: "min-h-11 shrink-0 gap-1.5 whitespace-nowrap",
                })}
              >
                <Folder size={14} aria-hidden /> <span className="max-xl:sr-only">프로젝트</span>
                <ChevronDown
                  size={13}
                  className={cn(
                    "transition-transform motion-reduce:transition-none",
                    projectActionsOpen && "rotate-180"
                  )}
                  aria-hidden
                />
              </button>
            </StudioToolHintTarget>
            {projectActionsOpen && typeof document !== "undefined"
              ? createPortal(
              <div
                id="studio-project-actions-menu"
                data-studio-project-actions-menu="true"
                role="dialog"
                aria-label="프로젝트 작업"
                onClickCapture={(event) => {
                  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button");
                  if (button && !button.dataset.projectKeepOpen) {
                    globalThis.setTimeout(() => setProjectActionsOpen(false), 0);
                  }
                }}
                className="fixed inset-x-2 top-12 z-[100] grid max-h-[calc(100dvh-4rem)] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain rounded-xl border border-line bg-panel p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl [scrollbar-gutter:stable] sm:grid-cols-3 sm:inset-x-auto sm:right-3 sm:w-[min(36rem,calc(100vw-1.5rem))] [&>button]:min-h-11 [&>button]:justify-start [&>label]:min-h-11 [&>label]:justify-start"
              >
                <div className="col-span-2 flex items-center justify-between gap-3 border-b border-line/60 px-2 py-2 sm:col-span-3">
                  <span>
                    <span className="block text-xs font-bold text-fg">파일 · 프로젝트</span>
                    <span className="mt-0.5 block text-[0.65rem] text-fg-3">백업 · 복구 · 검토 · 내보내기</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setProjectActionsOpen(false)}
                      aria-label="프로젝트 작업 닫기"
                      className="grid size-11 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg"
                    >
                      <X size={17} aria-hidden />
                    </button>
                  </span>
                </div>
          {pageCount > 1 && (
            <button
              type="button"
              onClick={() => handleDownloadAll(24)}
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "shrink-0 whitespace-nowrap gap-1.5 bg-accent/10 text-accent hover:bg-accent/20 border-accent/25 border",
              })}
              title="모든 페이지를 긴 세로 스크롤 웹툰으로 이어 붙여 다운로드 (내보내기 옵션의 배율·포맷 적용)"
            >
              <Download size={14} /> 웹툰 연합 스크롤
            </button>
          )}
          <button type="button" onClick={handleExportProject} className={buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5" })} title="빠른 가독형 백업입니다. 로컬 3D 모델 GLB는 포함되지 않으므로 다른 기기 이동·장기 보관에는 아카이브 백업을 사용하세요.">
            <Download size={14} /> 백업 (.json)
          </button>
          <button
            type="button"
            onClick={() => void handleExportProjectArchive()}
            data-project-keep-open
            disabled={projectArchiveBusy}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "min-h-11 shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-wait disabled:opacity-60",
            })}
            title="프로젝트 JSON과 이미지·마스크를 SHA-256 중복 제거·무결성 검증형 단일 archive로 저장"
          >
            {projectArchiveBusy ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            아카이브 백업
          </button>
          <button
            type="button"
            onClick={() => setWriterRoomOpen(true)}
            disabled={collaborationDocumentLocked}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50",
            })}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "한 줄 기획부터 시놉시스·비트·장면·컷·대사까지 한 흐름으로 설계하고 AI 초안을 검토"}
          >
            <Clapperboard size={14} /> Writer Room
            {studioWriterRoomHasContent(writerRoom) ? (
              <span className="rounded-full bg-accent-soft px-1.5 text-[0.65rem] font-bold text-accent">
                {Object.values(writerRoom.completion).filter(Boolean).length}/7
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setAiProvenanceOpen(true)}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5",
            })}
            title="AI 작업의 공급자·모델·상태·토큰 사용량을 확인하고 공개 가능한 요약만 내보내기"
          >
            <ClipboardCheck size={14} /> AI 작업 이력
            {aiProvenance.operations.length > 0 ? (
              <span className="rounded-full bg-cool/10 px-1.5 text-[0.65rem] font-bold text-cool">
                {aiProvenance.operations.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setCharacterBibleOpen(true)}
            disabled={collaborationDocumentLocked}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50",
            })}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "캐릭터 외형·의상·말투·관계와 AI 고정 제약을 문서에 저장"}
          >
            <Bookmark size={14} /> 캐릭터 바이블
            {characterBible.characters.length > 0 ? (
              <span className="rounded-full bg-accent-soft px-1.5 text-[0.65rem] font-bold text-accent">
                {characterBible.characters.length}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => setCheckpointPanelOpen(true)}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5",
            })}
            title="현재 문서를 이름 있는 복구 지점으로 브라우저에 저장하거나 이전 시점을 복원"
          >
            <HistoryIcon size={14} /> 버전
          </button>
          <button
            type="button"
            onClick={() => void openAutoActions()}
            disabled={collaborationDocumentLocked}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "min-h-11 shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50",
            })}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "허용된 반복 편집 명령을 현재·선택·전체 페이지에 dry run 후 한 번의 실행취소 단계로 적용"}
          >
            <WandSparkles size={14} /> Auto Actions
          </button>
          <button
            type="button"
            data-project-keep-open
            onClick={() => projectImportInputRef.current?.click()}
            disabled={collaborationDocumentLocked}
            className={buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50" })}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "빠른 .json 백업을 복구합니다. 포함되지 않은 로컬 3D 모델은 원래 기기의 검증 라이브러리에 있어야 합니다."}
          >
            <Upload size={14} /> 복구 (.json)
          </button>
          <input
            ref={projectImportInputRef}
            type="file"
            accept=".json"
            className="hidden"
            disabled={collaborationDocumentLocked}
            onChange={(event) => {
              const hasFile = Boolean(event.currentTarget.files?.[0]);
              handleImportProject(event);
              if (hasFile) setProjectActionsOpen(false);
            }}
          />
          <button
            type="button"
            data-project-keep-open
            onClick={() => projectArchiveImportInputRef.current?.click()}
            disabled={projectArchiveBusy || collaborationDocumentLocked}
            className={cn(
              buttonClass({
                size: "sm",
                variant: "quiet",
                className: "min-h-11 shrink-0 whitespace-nowrap gap-1.5",
              }),
              projectArchiveBusy && "cursor-wait opacity-60",
              collaborationDocumentLocked && "cursor-not-allowed opacity-50"
            )}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "무결성 검증형 .toonproject.zip에서 프로젝트와 포함 자산을 복구"}
          >
            <Upload size={14} /> 아카이브 복구
          </button>
          <input
            ref={projectArchiveImportInputRef}
            type="file"
            accept=".toonproject.zip,.zip,application/zip,application/vnd.toonspectrum.project+zip"
            className="hidden"
            disabled={projectArchiveBusy || collaborationDocumentLocked}
            onChange={(event) => void handleImportProjectArchive(event)}
          />
          {projectArchiveStatus ? (
            <span
              role="status"
              className={cn(
                "max-w-80 shrink-0 rounded-lg border px-2 py-1 text-[0.68rem] leading-relaxed",
                projectArchiveStatus.tone === "good"
                  ? "border-good/30 bg-good-soft/20 text-good"
                  : projectArchiveStatus.tone === "warn"
                    ? "border-warning/30 bg-warning-soft/20 text-warning"
                    : "border-bad/30 bg-bad-soft/20 text-bad"
              )}
            >
              {projectArchiveStatus.text}
            </span>
          ) : null}
          <button
            type="button"
            data-project-keep-open
            onClick={() => psdImportInputRef.current?.click()}
            disabled={psdImportBusy || collaborationDocumentLocked}
            className={cn(
              buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5" }),
              psdImportBusy && "cursor-wait opacity-60",
              collaborationDocumentLocked && "cursor-not-allowed opacity-50"
            )}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "포토샵(.psd) 파일의 레이어를 이미지 요소로 가져와요(래스터 평탄화, 편집 가능한 텍스트/조정 레이어는 재현되지 않음)"}
          >
            {psdImportBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            PSD 가져오기
          </button>
          <input
            ref={psdImportInputRef}
            type="file"
            accept=".psd,image/vnd.adobe.photoshop"
            className="hidden"
            disabled={psdImportBusy || collaborationDocumentLocked}
            onChange={(event) => void handleImportPsd(event)}
          />
          {psdImportStatus && (
            <span
              className={cn(
                "shrink-0 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] leading-snug",
                psdImportStatus.tone === "good" && "border-good/40 bg-good/10 text-good",
                psdImportStatus.tone === "warn" && "border-warn/40 bg-warn/10 text-warn"
              )}
            >
              {psdImportStatus.text}
            </span>
          )}
          {sharedDocument?.role === "owner" || loadedWork ? (
            <button
              type="button"
              onClick={() => void openOwnerFxPanel()}
              disabled={fxPanelLoading}
              className={buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-wait disabled:opacity-60" })}
              title="이미 게시된 이 작품의 배경음악·스크롤 모션·컷별 애니메이션 연출을 설정합니다"
            >
              {fxPanelLoading ? <Loader2 size={14} className="animate-spin" /> : <Music4 size={14} />}
              애니메이션 연출
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setProductionInsightsOpen(true)}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5",
            })}
            title="현재 문서 구조에서 제작 분량·검토·AI 에셋·미해결 항목을 계산"
          >
            <GanttChartSquare size={14} /> 제작 인사이트
          </button>
          <button
            type="button"
            onClick={() => setPublicationOperationsOpen(true)}
            disabled={collaborationDocumentLocked}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50",
            })}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "외부 자동 게시 없이 릴리스 일정과 직접 가져온 성과 기록을 관리"}
          >
            <Package size={14} /> 연재 운영
          </button>
          <button
            type="button"
            onClick={() => setPublishPreflightOpen(true)}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5",
            })}
            title="WEBTOON·Tapas·일반 게시 패키지의 구조와 AI 사용 고지를 미리 검사"
          >
            <ShieldCheck size={14} /> 게시 사전검사
          </button>
          <button
            type="button"
            onClick={() => setPublishPackageOpen(true)}
            className={buttonClass({
              size: "sm",
              variant: "quiet",
              className: "shrink-0 whitespace-nowrap gap-1.5",
            })}
            title="WEBTOON·Tapas·범용 목적지별 이미지 분할·썸네일·크레딧·검증 매니페스트를 계획"
          >
            <Package size={14} /> 게시 패키지
          </button>
              </div>,
              document.body
            )
            : null}
          </div>
          <StudioToolHintTarget
            hint={{
              ...MENUBAR_HINTS.draft,
              title: sharedDocument && sharedDocument.role !== "owner" ? "공동 저장" : "임시저장",
            }}
            disabled={saving || collaborationDocumentLocked}
            unavailableReason={
              collaborationDocumentLocked
                ? collaborationLockMessage()
                : saving
                  ? "현재 저장 작업이 끝난 뒤 다시 시도하세요."
                  : undefined
            }
            preferredSide="bottom"
          >
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={saving || collaborationDocumentLocked}
              aria-label={sharedDocument && sharedDocument.role !== "owner" ? "공동 저장" : "임시저장"}
              className={cn(
                buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50" }),
                isMobile && "min-h-11"
              )}
            >
              {saving ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
              {sharedDocument && sharedDocument.role !== "owner" ? "공동 저장" : "임시저장"}
            </button>
          </StudioToolHintTarget>
          {!sharedDocument || sharedDocument.role === "owner" ? (
            <StudioToolHintTarget
              hint={{
                ...MENUBAR_HINTS.publish,
                title: workId ? "수정 게시" : "게시하기",
              }}
              disabled={saving || collaborationDocumentLocked}
              unavailableReason={
                collaborationDocumentLocked
                  ? collaborationLockMessage()
                  : saving
                    ? "현재 저장 작업이 끝난 뒤 다시 시도하세요."
                    : undefined
              }
              preferredSide="bottom"
            >
              <button
                type="button"
                onClick={() => handleSave("published")}
                disabled={saving || collaborationDocumentLocked}
                aria-label={workId ? "수정 게시" : "게시하기"}
                className={cn(
                  buttonClass({ size: "sm", variant: "solid", className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50" }),
                  isMobile && "min-h-11"
                )}
              >
                {saving ? <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {workId ? "수정 게시" : "게시하기"}
              </button>
            </StudioToolHintTarget>
          ) : null}
        </div>
    </>
  );
});
