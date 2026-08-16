import {
  Boxes,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eraser,
  Film,
  Folder,
  GanttChartSquare,
  ImagePlus,
  LayoutGrid,
  MessageCircle,
  Mountain,
  MousePointer2,
  PaintBucket,
  Palette,
  Plus,
  Pencil,
  PersonStanding,
  PictureInPicture2,
  Smartphone,
  SquareSplitHorizontal,
  Type as TypeIcon,
  UsersRound,
  Video,
  WandSparkles,
} from "lucide-react";
import { memo, Suspense, type ComponentProps } from "react";

import {
  LazyStudioAiToolPopoverBody,
  LazyStudioAssetToolPopoverBody,
  LazyStudioBubbleToolPopoverBody,
  LazyStudioSceneToolPopoverBody,
  LazyStudioStyleToolPopoverBody,
  preloadStudioAiToolPopoverBody,
  preloadStudioAssetMenuPanel,
  preloadStudioAssetToolPopoverBody,
  preloadStudioBubbleToolPopoverBody,
  preloadStudioPaletteLibraryPanel,
  preloadStudioReferencePanel,
  preloadStudioSceneToolPopoverBody,
  preloadStudioStyleToolPopoverBody,
} from "./studio-tool-belt-lazy-ui";
import { writeStudioInsertDragPayload } from "./studio-insert-drag-writer";
import { LazyStudioColorPopover } from "./StudioLazyColorPopover";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import {
  StudioFloatingToolPopover,
  StudioToolbarCluster,
  StudioToolbarDivider,
  studioChromeIconClass,
  STUDIO_ICON_SIZE,
  STUDIO_ICON_STROKE,
} from "./studio-chrome-ui";
import { StudioToolHintTarget } from "./StudioToolHint";
import { studioToolButtonClass } from "./studio-panel-ui";
import { studioUiDensityAllows } from "./studio-ui-density";

import type { StudioToolBeltContentProps, StudioToolBeltHintMap } from "./StudioToolBeltContent";

import { cn } from "@/lib/utils";

type StudioToolBeltHintTargetProps = Omit<
  ComponentProps<typeof StudioToolHintTarget>,
  "preferredSide"
>;

function StudioToolBeltHintTarget(props: StudioToolBeltHintTargetProps) {
  return <StudioToolHintTarget preferredSide="bottom" {...props} />;
}

const iconToolBtnTouch = "pointer-coarse:min-w-11 pointer-coarse:justify-center";

const groupPopoverClass = (width: "w-72" | "w-80") =>
  cn(
    "fixed inset-x-2 top-[6.5rem] z-[70] max-h-[min(78dvh,36rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-2xl lg:inset-x-auto lg:left-3 lg:w-auto lg:max-w-[min(28rem,calc(100vw-1.5rem))]",
    width === "w-72" ? "lg:w-72" : "lg:w-80"
  );

export interface StudioToolBeltCreateModeGroupsProps {
  hints: StudioToolBeltHintMap;
  studioCanvasImageAccept: string;
  toolBelt: StudioToolBeltContentProps;
}

export const StudioToolBeltCreateModeGroups = memo(function StudioToolBeltCreateModeGroups(
  props: StudioToolBeltCreateModeGroupsProps,
) {
  const { hints, studioCanvasImageAccept, toolBelt } = props;
  const {
    activeSurfaceReviewLocked,
    activeToolbarGroup,
    advancedFillActive,
    advancedFillUnsupportedReason,
    bg3dOpen,
    color,
    collaborationDocumentLocked,
    collaborationLockMessage,
    continuityOpen,
    commentsOpen,
    drawMode,
    frameAnimOpen,
    frameAnimTargetId,
    menu,
    menuRef,
    masterEditMode,
    mannequinPoserOpen,
    openStudioCommentCount,
    pageEditLocked,
    pageReviewOpen,
    poserVrmOpen,
    recentColors,
    referencePanelOpen,
    selected,
    sharedDocument,
    stableHandlers,
    timelineOpen,
    teamPanelOpen,
    tool,
    uiDensityMode,
    setBg3dOpen,
    setColor,
    setCommentsOpen,
    setContinuityOpen,
    setMannequinPoserOpen,
    setMenu,
    setPageReviewOpen,
    setPoserVrmOpen,
    setReferencePanelOpen,
    setScrollPreviewOpen,
    setStoryboardGridOpen,
    setTeamPanelOpen,
    setTimelapseOpen,
    setTimelineOpen,
    onPickImage,
    rememberColor,
    ensureRecentColorsLoaded,
  } = toolBelt;

  const {
    activatePrimaryCanvasTool,
    addDiagonalSplit,
    addFrame,
    addText,
    openFrameAnimationForSelected,
    rememberColor: stableRememberColor,
    ensureRecentColorsLoaded: stableEnsureRecentColorsLoaded,
    setColor: stableSetColor,
    toggleAdvancedFill,
    toggleSelectedFrameDiagonal,
  } = stableHandlers;

  const studioToolIconClass = (nextProps?: Parameters<typeof studioChromeIconClass>[0]) =>
    studioChromeIconClass(nextProps ?? {});
  const toolBtn = (active: boolean) => studioToolButtonClass(active, { dense: true });

  return (
    <>
      {(studioUiDensityAllows(uiDensityMode, "toolbar-assets") || activeToolbarGroup === "assetGroup") ? (
        <StudioToolbarCluster
          label="에셋 라이브러리"
          className={cn(!studioUiDensityAllows(uiDensityMode, "toolbar-assets") && "border-0 bg-transparent p-0 shadow-none")}
        >
          <div ref={activeToolbarGroup === "assetGroup" ? menuRef : undefined} className="relative">
            <StudioToolBeltHintTarget hint={hints.assets}>
              <button
                type="button"
                onClick={() => {
                  preloadStudioAssetMenuPanel();
                  setMenu(activeToolbarGroup === "assetGroup" ? null : "template");
                }}
                onPointerEnter={() => {
                  preloadStudioAssetToolPopoverBody();
                  preloadStudioAssetMenuPanel();
                }}
                onPointerDown={preloadStudioAssetToolPopoverBody}
                onFocus={() => {
                  preloadStudioAssetToolPopoverBody();
                  preloadStudioAssetMenuPanel();
                }}
                aria-haspopup="menu"
                aria-expanded={activeToolbarGroup === "assetGroup"}
                className={cn(
                  toolBtn(activeToolbarGroup === "assetGroup"),
                  !studioUiDensityAllows(uiDensityMode, "toolbar-assets") && "sr-only"
                )}
              >
                <Folder
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({
                    tone: activeToolbarGroup === "assetGroup" ? "accent" : "default",
                    active: activeToolbarGroup === "assetGroup",
                  })}
                />
                템플릿·에셋
                <ChevronDown
                  size={STUDIO_ICON_SIZE.subtab}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={cn("transition-transform duration-150", activeToolbarGroup === "assetGroup" && "rotate-180")}
                />
              </button>
            </StudioToolBeltHintTarget>
            <StudioFloatingToolPopover
              open={activeToolbarGroup === "assetGroup"}
              id="asset-group"
              className={cn(groupPopoverClass("w-80"), "lg:w-[22rem] lg:max-w-[min(24rem,calc(100vw-1.5rem))]")}
            >
              <Suspense fallback={<StudioPanelLoading label="에셋 메뉴를 여는 중..." />}>
                <LazyStudioAssetToolPopoverBody toolBelt={toolBelt} />
              </Suspense>
            </StudioFloatingToolPopover>
          </div>
        </StudioToolbarCluster>
      ) : null}

      {studioUiDensityAllows(uiDensityMode, "toolbar-cut") ? (
        <>
          <StudioToolbarDivider label="컷" />
          <StudioToolbarCluster label="컷 배치">
            <StudioToolBeltHintTarget hint={hints.panelAdd}>
              <button type="button" onClick={addFrame} className={toolBtn(false)}>
                <Plus
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass()}
                /> 패널
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget hint={hints.panelSplit}>
              <button type="button" onClick={addDiagonalSplit} className={toolBtn(false)}>
                <SquareSplitHorizontal
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass()}
                /> 사선 컷
              </button>
            </StudioToolBeltHintTarget>
            {selected?.type === "frame" && (
              <StudioToolBeltHintTarget
                hint={selected.points ? hints.panelStraighten : hints.panelDiagonalize}
              >
                <button
                  type="button"
                  onClick={toggleSelectedFrameDiagonal}
                  className={toolBtn(Boolean(selected.points))}
                >
                  <SquareSplitHorizontal
                    size={STUDIO_ICON_SIZE.toolCompact}
                    strokeWidth={STUDIO_ICON_STROKE}
                    aria-hidden
                    className={cn(studioToolIconClass({ active: Boolean(selected?.points) }), "opacity-90")}
                  />
                  {selected.points ? "직선화" : "사선화"}
                </button>
              </StudioToolBeltHintTarget>
            )}
          </StudioToolbarCluster>
        </>
      ) : null}

      {studioUiDensityAllows(uiDensityMode, "toolbar-draw") ? (
        <>
          <StudioToolbarDivider label="도구" className="lg:hidden" />
          <StudioToolbarCluster label="그리기 도구" className="lg:hidden">
            <StudioToolBeltHintTarget hint={hints.select}>
              <button
                type="button"
                onClick={() => {
                  activatePrimaryCanvasTool("select");
                  setMenu(null);
                }}
                className={toolBtn(tool === "select")}
                aria-pressed={tool === "select"}
              >
                <MousePointer2
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ active: tool === "select" })}
                />
                선택
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={hints.pen}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? "편집 잠금을 해제한 뒤 펜을 사용할 수 있어요." : undefined}
            >
              <button
                type="button"
                disabled={activeSurfaceReviewLocked}
                onClick={() => {
                  activatePrimaryCanvasTool("draw", "pen");
                  setMenu(null);
                }}
                className={cn(toolBtn(tool === "draw" && drawMode === "pen"), "disabled:cursor-not-allowed disabled:opacity-40")}
                aria-pressed={tool === "draw" && drawMode === "pen"}
              >
                <Pencil
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ active: tool === "draw" && drawMode === "pen" })}
                />
                펜
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={hints.eraser}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? "편집 잠금을 해제한 뒤 지우개를 사용할 수 있어요." : undefined}
            >
              <button
                type="button"
                disabled={activeSurfaceReviewLocked}
                onClick={() => {
                  activatePrimaryCanvasTool("draw", "eraser");
                  setMenu(null);
                }}
                className={cn(toolBtn(tool === "draw" && drawMode === "eraser"), "disabled:cursor-not-allowed disabled:opacity-40")}
                aria-pressed={tool === "draw" && drawMode === "eraser"}
              >
                <Eraser
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ active: tool === "draw" && drawMode === "eraser" })}
                />
                지우개
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={hints.fill}
              unavailableReason={
                advancedFillUnsupportedReason
                  ? `${advancedFillUnsupportedReason} 채우기를 누르면 안전한 단일 래스터 후보를 찾거나 필요한 조건을 안내합니다.`
                  : undefined
              }
            >
              <button
                type="button"
                onClick={toggleAdvancedFill}
                className={toolBtn(advancedFillActive)}
                aria-pressed={advancedFillActive}
              >
                <PaintBucket
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ active: advancedFillActive })}
                />
                채우기
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={hints.frameAnimation}
              disabled={selected?.type !== "image"}
              unavailableReason={selected?.type !== "image" ? "애니메이션으로 만들 이미지를 먼저 선택하세요." : undefined}
            >
              <button
                type="button"
                onClick={openFrameAnimationForSelected}
                disabled={selected?.type !== "image"}
                className={cn(toolBtn(frameAnimOpen && frameAnimTargetId === selected?.id), "disabled:opacity-40")}
              >
                <Film
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ disabled: selected?.type !== "image" })}
                />
                프레임
              </button>
            </StudioToolBeltHintTarget>
          </StudioToolbarCluster>
        </>
      ) : null}

      {studioUiDensityAllows(uiDensityMode, "toolbar-reference") ? (
        <>
          <StudioToolbarDivider label="참조" />
          <StudioToolbarCluster label="참조·3D">
            <StudioToolBeltHintTarget hint={hints.character3d}>
              <button
                type="button"
                onClick={() => setPoserVrmOpen(true)}
                className={cn(toolBtn(poserVrmOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
              >
                <UsersRound
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ tone: "accent" })}
                />
                3D 캐릭터
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget hint={hints.mannequin3d}>
              <button
                type="button"
                onClick={() => setMannequinPoserOpen(true)}
                className={cn(toolBtn(mannequinPoserOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
              >
                <PersonStanding
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ tone: "accent" })}
                />
                3D 데생 인형
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget hint={hints.bg3d}>
              <button
                type="button"
                onClick={() => setBg3dOpen(true)}
                className={cn(toolBtn(bg3dOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
              >
                <Boxes
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ tone: "accent" })}
                />
                3D 배경
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget hint={hints.reference}>
              <button
                type="button"
                onClick={() => setReferencePanelOpen((v) => !v)}
                onMouseEnter={preloadStudioReferencePanel}
                onFocus={preloadStudioReferencePanel}
                className={cn(toolBtn(referencePanelOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
                aria-pressed={referencePanelOpen}
              >
                <PictureInPicture2
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ tone: "accent" })}
                />
                참고
              </button>
            </StudioToolBeltHintTarget>
          </StudioToolbarCluster>
        </>
      ) : null}

      {(studioUiDensityAllows(uiDensityMode, "toolbar-scene") || activeToolbarGroup === "bgGroup") ? (
        <>
          {studioUiDensityAllows(uiDensityMode, "toolbar-scene") ? <StudioToolbarDivider label="장면" /> : null}
          <StudioToolbarCluster
            label="배경·톤"
            className={cn(!studioUiDensityAllows(uiDensityMode, "toolbar-scene") && "border-0 bg-transparent p-0 shadow-none")}
          >
            <div ref={activeToolbarGroup === "bgGroup" ? menuRef : undefined} className="relative">
              <StudioToolBeltHintTarget hint={hints.background}>
                <button
                  type="button"
                  onClick={() => setMenu(activeToolbarGroup === "bgGroup" ? null : "bgFill")}
                  onPointerEnter={preloadStudioSceneToolPopoverBody}
                  onPointerDown={preloadStudioSceneToolPopoverBody}
                  onFocus={preloadStudioSceneToolPopoverBody}
                  aria-haspopup="menu"
                  aria-expanded={activeToolbarGroup === "bgGroup"}
                  className={cn(
                    toolBtn(activeToolbarGroup === "bgGroup"),
                    !studioUiDensityAllows(uiDensityMode, "toolbar-scene") && "sr-only"
                  )}
                >
                  <Mountain
                    size={STUDIO_ICON_SIZE.toolCompact}
                    strokeWidth={STUDIO_ICON_STROKE}
                    aria-hidden
                    className={studioToolIconClass({
                      tone: activeToolbarGroup === "bgGroup" ? "accent" : "default",
                      active: activeToolbarGroup === "bgGroup",
                    })}
                  />
                  배경
                  <ChevronDown
                    size={STUDIO_ICON_SIZE.subtab}
                    strokeWidth={STUDIO_ICON_STROKE}
                    aria-hidden
                    className={cn("transition-transform duration-150", activeToolbarGroup === "bgGroup" && "rotate-180")}
                  />
                </button>
              </StudioToolBeltHintTarget>
              <StudioFloatingToolPopover
                open={activeToolbarGroup === "bgGroup"}
                id="bg-group"
                className={groupPopoverClass("w-80")}
              >
                <Suspense fallback={<StudioPanelLoading label="배경 메뉴를 여는 중..." />}>
                  <LazyStudioSceneToolPopoverBody toolBelt={toolBelt} />
                </Suspense>
              </StudioFloatingToolPopover>
            </div>
          </StudioToolbarCluster>
        </>
      ) : null}

      {(studioUiDensityAllows(uiDensityMode, "toolbar-style") || activeToolbarGroup === "styleGroup") ? (
        <StudioToolbarCluster
          label="스타일"
          className={cn(!studioUiDensityAllows(uiDensityMode, "toolbar-style") && "border-0 bg-transparent p-0 shadow-none")}
        >
          <div ref={activeToolbarGroup === "styleGroup" ? menuRef : undefined} className="relative">
            <StudioToolBeltHintTarget hint={hints.style}>
              <button
                type="button"
                onClick={() => setMenu(activeToolbarGroup === "styleGroup" ? null : "palette")}
                onPointerEnter={() => {
                  preloadStudioStyleToolPopoverBody();
                  preloadStudioPaletteLibraryPanel();
                }}
                onPointerDown={() => {
                  preloadStudioStyleToolPopoverBody();
                  preloadStudioPaletteLibraryPanel();
                }}
                onFocus={() => {
                  preloadStudioStyleToolPopoverBody();
                  preloadStudioPaletteLibraryPanel();
                }}
                aria-haspopup="menu"
                aria-expanded={activeToolbarGroup === "styleGroup"}
                className={cn(
                  toolBtn(activeToolbarGroup === "styleGroup"),
                  !studioUiDensityAllows(uiDensityMode, "toolbar-style") && "sr-only"
                )}
              >
                <Palette
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({
                    tone: activeToolbarGroup === "styleGroup" ? "accent" : "default",
                    active: activeToolbarGroup === "styleGroup",
                  })}
                /> 스타일
                <ChevronDown
                  size={STUDIO_ICON_SIZE.subtab}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={cn("transition-transform duration-150", activeToolbarGroup === "styleGroup" && "rotate-180")}
                />
              </button>
            </StudioToolBeltHintTarget>
            <StudioFloatingToolPopover
              open={activeToolbarGroup === "styleGroup"}
              id="style-group"
              className={groupPopoverClass("w-72")}
            >
              <Suspense fallback={<StudioPanelLoading label="스타일 메뉴를 여는 중..." />}>
                <LazyStudioStyleToolPopoverBody toolBelt={toolBelt} />
              </Suspense>
            </StudioFloatingToolPopover>
          </div>
        </StudioToolbarCluster>
      ) : null}

      {(studioUiDensityAllows(uiDensityMode, "toolbar-ai") || activeToolbarGroup === "aiGroup") ? (
        <>
          {studioUiDensityAllows(uiDensityMode, "toolbar-ai") ? <StudioToolbarDivider label="AI" /> : null}
          <StudioToolbarCluster
            label="AI 연동"
            className={cn(!studioUiDensityAllows(uiDensityMode, "toolbar-ai") && "border-0 bg-transparent p-0 shadow-none")}
          >
            <div ref={activeToolbarGroup === "aiGroup" ? menuRef : undefined} className="relative">
              <StudioToolBeltHintTarget hint={hints.ai}>
                <button
                  type="button"
                  onClick={() => setMenu(activeToolbarGroup === "aiGroup" ? null : "aiAssist")}
                  onPointerEnter={preloadStudioAiToolPopoverBody}
                  onPointerDown={preloadStudioAiToolPopoverBody}
                  onFocus={preloadStudioAiToolPopoverBody}
                  aria-haspopup="menu"
                  aria-expanded={activeToolbarGroup === "aiGroup"}
                  className={cn(
                    toolBtn(activeToolbarGroup === "aiGroup"),
                    !studioUiDensityAllows(uiDensityMode, "toolbar-ai") && "sr-only"
                  )}
                >
                  <WandSparkles
                    size={STUDIO_ICON_SIZE.toolCompact}
                    strokeWidth={STUDIO_ICON_STROKE}
                    aria-hidden
                    className={studioToolIconClass({
                      tone: activeToolbarGroup === "aiGroup" ? "accent" : "default",
                      active: activeToolbarGroup === "aiGroup",
                    })}
                  />
                  AI
                  <ChevronDown
                    size={STUDIO_ICON_SIZE.subtab}
                    strokeWidth={STUDIO_ICON_STROKE}
                    aria-hidden
                    className={cn("transition-transform duration-150", activeToolbarGroup === "aiGroup" && "rotate-180")}
                  />
                </button>
              </StudioToolBeltHintTarget>
              <StudioFloatingToolPopover
                open={activeToolbarGroup === "aiGroup"}
                id="ai-group"
                className={cn(
                  groupPopoverClass("w-80"),
                  "flex h-[min(78dvh,36rem)] max-h-[min(78dvh,36rem)] flex-col overflow-hidden lg:w-96 lg:max-w-[min(24rem,calc(100vw-1.5rem))]"
                )}
              >
                <Suspense fallback={<StudioPanelLoading label="AI 메뉴를 여는 중..." />}>
                  <LazyStudioAiToolPopoverBody toolBelt={toolBelt} />
                </Suspense>
              </StudioFloatingToolPopover>
            </div>
          </StudioToolbarCluster>
        </>
      ) : null}

      {studioUiDensityAllows(uiDensityMode, "toolbar-insert") ? (
        <>
          <StudioToolbarDivider label="삽입" />
          <StudioToolbarCluster label="삽입·대사">
            <StudioToolBeltHintTarget hint={hints.text}>
              <button
                type="button"
                onClick={() => {
                  addText();
                  setMenu(null);
                }}
                draggable
                onDragStart={(event) => {
                  writeStudioInsertDragPayload(event.dataTransfer, { kind: "text" });
                }}
                className={toolBtn(false)}
              >
                <TypeIcon
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass()}
                /> 텍스트
              </button>
            </StudioToolBeltHintTarget>
            <div ref={menu === "bubble" ? menuRef : undefined} className="relative">
              <StudioToolBeltHintTarget hint={hints.bubble}>
                <button
                  type="button"
                  onClick={() => setMenu(menu === "bubble" ? null : "bubble")}
                  onPointerEnter={preloadStudioBubbleToolPopoverBody}
                  onPointerDown={preloadStudioBubbleToolPopoverBody}
                  onFocus={preloadStudioBubbleToolPopoverBody}
                  aria-haspopup="menu"
                  aria-expanded={menu === "bubble"}
                  className={toolBtn(menu === "bubble")}
                >
                  <MessageCircle
                    size={STUDIO_ICON_SIZE.toolCompact}
                    strokeWidth={STUDIO_ICON_STROKE}
                    aria-hidden
                    className={studioToolIconClass({ active: menu === "bubble" })}
                  />
                  말풍선
                </button>
              </StudioToolBeltHintTarget>
              <StudioFloatingToolPopover
                open={menu === "bubble"}
                id="bubble-menu"
                className="fixed inset-x-2 top-[4.5rem] z-[70] max-h-[calc(100dvh-13rem)] w-auto overflow-y-auto rounded-2xl border border-line/70 bg-panel p-0 shadow-xl lg:inset-x-auto lg:left-3 lg:top-[4.5rem] lg:max-h-[min(42rem,calc(100dvh-7rem))] lg:w-[22rem] lg:max-w-[calc(100vw-1.5rem)]"
              >
                <Suspense fallback={<StudioPanelLoading label="말풍선 메뉴를 여는 중..." />}>
                  <LazyStudioBubbleToolPopoverBody toolBelt={toolBelt} />
                </Suspense>
              </StudioFloatingToolPopover>
            </div>
            <StudioToolBeltHintTarget hint={hints.image}>
              <label
                className={cn(
                  toolBtn(false),
                  "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
                )}
              >
                <ImagePlus
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ tone: "default" })}
                />
                이미지
                <input
                  type="file"
                  accept={studioCanvasImageAccept}
                  className="sr-only"
                  onChange={onPickImage}
                />
              </label>
            </StudioToolBeltHintTarget>
            <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-xs text-fg-2 pointer-coarse:h-11">
              <Palette
                size={STUDIO_ICON_SIZE.toolCompact}
                strokeWidth={STUDIO_ICON_STROKE}
                aria-hidden
                className={studioToolIconClass({ tone: "default" })}
              />
              <span className="sr-only sm:not-sr-only sm:inline">색</span>
              <LazyStudioColorPopover
                value={color}
                onChange={(nextColor) => {
                  setColor(nextColor);
                  stableSetColor(nextColor);
                }}
                recentColors={recentColors}
                onUseColor={(nextColor) => {
                  rememberColor(nextColor);
                  stableRememberColor(nextColor);
                }}
                onLoadRecentColors={() => {
                  ensureRecentColorsLoaded();
                  stableEnsureRecentColorsLoaded();
                }}
                label="브러시·도형 색상"
                purpose="brush-shape"
              />
            </span>
          </StudioToolbarCluster>
        </>
      ) : null}

      <span className="mx-0.5 h-5 w-px bg-line" />
      <StudioToolBeltHintTarget
        hint={hints.timelapse}
        disabled={masterEditMode}
        unavailableReason={masterEditMode ? "마스터 편집 중에는 타임랩스를 녹화할 수 없습니다." : undefined}
      >
        <button
          type="button"
          onClick={() => setTimelapseOpen(true)}
          disabled={masterEditMode}
          aria-label="타임랩스 녹화"
          className={cn(toolBtn(false), iconToolBtnTouch, "disabled:opacity-40")}
        >
          <Video
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass({ disabled: masterEditMode })}
          />
        </button>
      </StudioToolBeltHintTarget>
      <StudioToolBeltHintTarget hint={hints.storyboard}>
        <button
          type="button"
          onClick={() => setStoryboardGridOpen(true)}
          aria-label="스토리보드 그리드 보기"
          className={cn(toolBtn(false), iconToolBtnTouch)}
        >
          <LayoutGrid
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass()}
          />
        </button>
      </StudioToolBeltHintTarget>
      <StudioToolBeltHintTarget
        hint={
          pageEditLocked
            ? { ...hints.review, tip: "현재 페이지가 검토 잠금 상태예요." }
            : hints.review
        }
      >
        <button
          type="button"
          onClick={() => setPageReviewOpen(true)}
          aria-pressed={pageReviewOpen}
          aria-label={pageEditLocked ? "페이지 검토, 현재 편집 잠금" : "페이지 검토와 편집 잠금"}
          className={cn(toolBtn(pageReviewOpen || pageEditLocked), iconToolBtnTouch)}
        >
          <ClipboardCheck
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass({ active: pageReviewOpen || pageEditLocked })}
          />
        </button>
      </StudioToolBeltHintTarget>
      <StudioToolHintTarget
        preferredSide="bottom"
        disabled={collaborationDocumentLocked && !sharedDocument?.capabilities.view}
        unavailableReason={
          collaborationDocumentLocked && !sharedDocument?.capabilities.view
            ? collaborationLockMessage()
            : undefined
        }
        hint={{
          id: "toolbelt-comment-inbox",
          title: "문서 댓글",
          description:
            sharedDocument?.access === "view"
              ? "팀 댓글을 읽고 연결된 페이지·컷·요소 위치로 바로 이동합니다."
              : `페이지·컷·요소에 ${sharedDocument ? "팀 댓글을 남기고 서버로 동기화합니다." : "댓글을 남겨 프로젝트와 함께 저장합니다."}`,
          preview: "comment-inbox",
          tip:
            openStudioCommentCount > 0
              ? `아직 해결되지 않은 댓글이 ${openStudioCommentCount}개 있어요.`
              : "캔버스 위치를 지정해 댓글을 남기면 검토자가 맥락을 바로 이해할 수 있어요.",
        }}
      >
        <button
          type="button"
          onClick={() => {
            setTeamPanelOpen(false);
            setCommentsOpen((current) => !current);
          }}
          disabled={collaborationDocumentLocked && !sharedDocument?.capabilities.view}
          aria-expanded={commentsOpen}
          aria-haspopup="dialog"
          aria-controls="studio-comments-review-dialog"
          aria-label={`문서 댓글${openStudioCommentCount > 0 ? `, 열림 ${openStudioCommentCount}개` : ""}`}
          className={cn(
            toolBtn(commentsOpen),
            iconToolBtnTouch,
            "relative disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          <MessageCircle
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass({ active: commentsOpen })}
          />
          {openStudioCommentCount > 0 ? (
            <span
              aria-hidden
              className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-[0.58rem] font-bold leading-4 text-on-accent"
            >
              {openStudioCommentCount > 99 ? "99+" : openStudioCommentCount}
            </span>
          ) : null}
        </button>
      </StudioToolHintTarget>
      <StudioToolBeltHintTarget hint={hints.team}>
        <button
          type="button"
          data-studio-team-share-btn="true"
          onClick={() => {
            setCommentsOpen(false);
            setTeamPanelOpen((prev) => !prev);
          }}
          aria-pressed={teamPanelOpen}
          aria-label="팀 작업 공간"
          className={cn(
            toolBtn(teamPanelOpen),
            iconToolBtnTouch,
            "relative gap-1 px-2.5 font-medium text-xs text-accent hover:bg-accent/15 border border-accent/30 rounded-full transition-all shadow-sm"
          )}
        >
          <UsersRound
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass({ tone: "accent" })}
          />
          <span className="hidden sm:inline font-semibold text-[0.7rem] text-accent">팀 &amp; 실시간 공유</span>
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
        </button>
      </StudioToolBeltHintTarget>
      <StudioToolBeltHintTarget hint={hints.continuity}>
        <button
          type="button"
          onClick={() => setContinuityOpen(true)}
          aria-pressed={continuityOpen}
          aria-label="이야기 연속성 검사"
          className={cn(toolBtn(continuityOpen), iconToolBtnTouch)}
        >
          <CheckCircle2
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass({ active: continuityOpen })}
          />
        </button>
      </StudioToolBeltHintTarget>
      <StudioToolBeltHintTarget hint={hints.scrollPreview}>
        <button
          type="button"
          onClick={() => setScrollPreviewOpen(true)}
          aria-label="세로 스크롤 미리보기"
          className={cn(toolBtn(false), iconToolBtnTouch)}
        >
          <Smartphone
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass()}
          />
        </button>
      </StudioToolBeltHintTarget>
      <StudioToolBeltHintTarget
        hint={hints.timeline}
        disabled={masterEditMode}
        unavailableReason={masterEditMode ? "마스터 편집 중에는 타임라인을 열 수 없습니다." : undefined}
      >
        <button
          type="button"
          onClick={() => {
            setTimelineOpen((v) => !v);
          }}
          disabled={masterEditMode}
          aria-pressed={timelineOpen}
          aria-label="다중 레이어 타임라인"
          className={cn(toolBtn(timelineOpen), iconToolBtnTouch, "disabled:opacity-40")}
        >
          <GanttChartSquare
            size={STUDIO_ICON_SIZE.toolCompact}
            strokeWidth={STUDIO_ICON_STROKE}
            aria-hidden
            className={studioToolIconClass({ active: timelineOpen })}
          />
        </button>
      </StudioToolBeltHintTarget>
      <span className="mx-0.5 hidden h-5 w-px bg-line lg:block" />
    </>
  );
});
