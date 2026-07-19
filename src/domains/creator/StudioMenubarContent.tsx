import {
  Bookmark,
  ChevronDown,
  Clapperboard,
  ClipboardCheck,
  Download,
  Files,
  FileUp,
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
import { StudioWorkspaceMenuGate } from "./StudioWorkspaceMenuGate";

import type { StudioAiProvenanceDocument } from "./studio-ai-provenance";
import type { StudioCharacterBible } from "./studio-character-bible";
import type { StudioMenu } from "./studio-editor-tool-model";
import type { ExportFormat } from "./studio-export";
import type { PsdExportResult } from "./studio-psd-export";
import type { StudioSharedDocument } from "./studio-shared-document-client";
import type { SvgExportResult } from "./studio-svg-export";
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

export interface StudioMenubarContentHandlers {
  applyStudioWorkspaceLayout: (layout: StudioWorkspaceLayout) => void;
  changeMobileImmersiveMode: (enabled: boolean) => void;
  ensureWatermarkLoaded: () => WatermarkSettings;
  exportCurrentPageToPsd: () => Promise<PsdExportResult>;
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
  persistStudioWorkspaceState: (nextState: StudioWorkspaceState) => StudioWorkspaceSaveResult;
  setWatermark: (next: WatermarkSettings) => void;
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
    persistStudioWorkspaceState,
    setWatermark,
    exportCurrentPageToPsd,
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
          {/* Desktop application commands live in the compressible center lane. */}
          <Suspense fallback={null}>
            <StudioMainMenu
              groups={studioMainMenuGroups}
              className={cn("hidden min-w-0 md:flex", mobileImmersive && "!hidden")}
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
          <button
            type="button"
            onClick={() => {
              preloadStudioAssetMenuPanel();
              setMenu(activeToolbarGroup === "assetGroup" ? null : "template");
            }}
            aria-haspopup="menu"
            aria-expanded={activeToolbarGroup === "assetGroup"}
            className={cn(
              buttonClass({ size: "sm", variant: activeToolbarGroup === "assetGroup" ? "solid" : "quiet" }),
              "min-h-9 gap-1.5 px-2.5 text-[0.72rem]"
            )}
            title="템플릿 · 콜라주 · 요소 · 장면 · 클립 · 효과 · 내 에셋"
          >
            <Folder size={14} aria-hidden />
            템플릿·에셋
          </button>
          <button
            type="button"
            onClick={() => setMenu(menu === "bubble" ? null : "bubble")}
            aria-haspopup="menu"
            aria-expanded={menu === "bubble"}
            className={cn(
              buttonClass({ size: "sm", variant: menu === "bubble" ? "solid" : "quiet" }),
              "min-h-9 gap-1.5 px-2.5 text-[0.72rem]"
            )}
            title="말풍선 라이브러리"
          >
            <MessageCircle size={14} aria-hidden />
            말풍선
          </button>
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
              title={
                mobileImmersive
                  ? "일반 화면으로 복원"
                  : "전체 화면으로 그리기"
              }
            >
              {mobileImmersive ? (
                <Minimize2 size={15} aria-hidden />
              ) : (
                <Maximize2 size={15} aria-hidden />
              )}
              {mobileImmersive ? "종료" : "전체화면"}
            </button>
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
            <button
              type="button"
              onClick={() => handleDownload()}
              className={cn(
                buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5 pr-2" }),
                isMobile && "min-h-11"
              )}
              title={`현재 페이지를 ${exportScale}× ${exportFormat.toUpperCase()}로 다운로드${exportTransparent && exportFormat === "png" ? " (투명 배경)" : ""}`}
            >
              <Download size={14} /> <span className="max-xl:sr-only">다운로드</span>
              <span className="text-[10px] font-semibold tabular-nums text-fg-3 max-xl:hidden">
                {exportScale}× {exportFormat.toUpperCase()}
              </span>
            </button>
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
              title="내보내기 옵션 (배율·포맷·투명 배경)"
            >
              <ChevronDown size={13} className={cn("transition-transform", exportMenuOpen && "rotate-180")} />
            </button>
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
            <button
              type="button"
              onClick={() => {
                setExportMenuOpen(false);
                setProjectActionsOpen((open) => !open);
              }}
              aria-haspopup="dialog"
              aria-expanded={projectActionsOpen}
              aria-controls="studio-project-actions-menu"
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "min-h-11 shrink-0 gap-1.5 whitespace-nowrap",
              })}
              title="백업·복구·기획·검토·연재·게시 도구"
            >
              <Folder size={14} aria-hidden /> <span className="max-xl:sr-only">프로젝트</span>
              <ChevronDown
                size={13}
                className={cn("transition-transform", projectActionsOpen && "rotate-180")}
                aria-hidden
              />
            </button>
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
            <FileUp size={14} /> 아카이브 복구
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
            {psdImportBusy ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
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
            <Files size={14} /> 게시 패키지
          </button>
              </div>,
              document.body
            )
            : null}
          </div>
          <button
            type="button"
            onClick={() => handleSave("draft")}
            disabled={saving || collaborationDocumentLocked}
            title={collaborationDocumentLocked ? collaborationLockMessage() : "현재 원고를 임시저장"}
            className={cn(
              buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50" }),
              isMobile && "min-h-11"
            )}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {sharedDocument && sharedDocument.role !== "owner" ? "공동 저장" : "임시저장"}
          </button>
          {!sharedDocument || sharedDocument.role === "owner" ? (
            <button
              type="button"
              onClick={() => handleSave("published")}
              disabled={saving || collaborationDocumentLocked}
              title={collaborationDocumentLocked ? collaborationLockMessage() : "게시 상태로 저장"}
              className={cn(
                buttonClass({ size: "sm", variant: "solid", className: "shrink-0 whitespace-nowrap gap-1.5 disabled:cursor-not-allowed disabled:opacity-50" }),
                isMobile && "min-h-11"
              )}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {workId ? "수정 게시" : "게시하기"}
            </button>
          ) : null}
        </div>
    </>
  );
});
