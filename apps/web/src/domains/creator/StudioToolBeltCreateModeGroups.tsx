import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ChevronDown,
  Eraser,
  Film,
  Folder,
  Mountain,
  MousePointer2,
  PaintBucket,
  Plus,
  Pencil,
  Palette,
  PictureInPicture2,
  SquareSplitHorizontal,
  WandSparkles,
} from "lucide-react";
import { memo, Suspense, useId, useState, type ComponentProps } from "react";

import {
  StudioFloatingToolPopover,
  StudioToolbarCluster,
  StudioToolbarDivider,
  studioChromeIconClass,
  STUDIO_ICON_SIZE,
  STUDIO_ICON_STROKE,
} from "./studio-chrome-ui";
import { preloadStudioReferencePanel } from "./studio-page-lazy-ui";
import { studioToolButtonClass } from "./studio-panel-ui";
import {
  LazyStudioAiToolPopoverBody,
  LazyStudioAssetToolPopoverBody,
  LazyStudioSceneToolPopoverBody,
  LazyStudioStyleToolPopoverBody,
  preloadStudioAiToolPopoverBody,
  preloadStudioAssetToolPopoverBody,
  preloadStudioSceneToolPopoverBody,
  preloadStudioStyleToolPopoverBody,
} from "./studio-tool-belt-lazy-ui";
import { STUDIO_FLOATING_MENU_LAYOUTS } from "./studio-floating-menu-layouts";
import {
  studioToolbarDisclosureAllows,
  studioToolbarIsExpanded,
  type StudioGettingStartedAction,
} from "./studio-toolbar-disclosure";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import { StudioToolBeltCreateModeInsertTools } from "./StudioToolBeltCreateModeInsertTools";
import { StudioToolBeltCreateModeUtilityButtons } from "./StudioToolBeltCreateModeUtilityButtons";
import { StudioToolHintTarget } from "./StudioToolHint";
import { StudioWorkflowAccess } from "./StudioWorkflowAccess";

import type { StudioUiChromeRegion } from "./studio-ui-density";
import type { StudioToolBeltContentProps, StudioToolBeltHintMap } from "./StudioToolBeltContent";

import { cn } from "@/shared/lib/utils";

type StudioToolBeltHintTargetProps = Omit<
  ComponentProps<typeof StudioToolHintTarget>,
  "preferredSide"
>;

function StudioToolBeltHintTarget(props: StudioToolBeltHintTargetProps) {
  return <StudioToolHintTarget preferredSide="bottom" {...props} />;
}

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
    drawMode,
    frameAnimOpen,
    frameAnimTargetId,
    menu,
    menuRef,
    referencePanelOpen,
    selected,
    stableHandlers,
    tool,
    uiDensityMode,
    setMenu,
    setReferencePanelOpen,
  } = toolBelt;

  const {
    activatePrimaryCanvasTool,
    addDiagonalSplit,
    addFrame,
    openFrameAnimationForSelected,
    toggleAdvancedFill,
    toggleSelectedFrameDiagonal,
  } = stableHandlers;

  const [expanded, setExpanded] = useState(false);
  const advancedToolsId = useId();
  const showAdvanced = studioToolbarIsExpanded(uiDensityMode, expanded);
  const allows = (region: StudioUiChromeRegion) =>
    studioToolbarDisclosureAllows(uiDensityMode, expanded, region);
  const documentLocked = toolBelt.collaborationDocumentLocked || activeSurfaceReviewLocked;
  const lockedReason = toolBelt.collaborationDocumentLocked
    ? toolBelt.collaborationLockMessage() || "이 문서는 지금 편집할 수 없어요."
    : activeSurfaceReviewLocked ? "검토 중인 페이지의 편집 잠금을 먼저 해제해 주세요." : undefined;

  const activatePen = () => {
    activatePrimaryCanvasTool("draw", "pen");
    setMenu(null);
  };

  const startTask = (action: StudioGettingStartedAction) => {
    // Keep the same handlers used by the normal tools: no direct document writes.
    if (documentLocked && action !== "preview" && action !== "help") return;
    switch (action) {
      case "frame": addFrame(); break;
      case "draw": activatePen(); break;
      case "bubble": setMenu("bubble"); break;
      case "background": setMenu("bgFill"); break;
      case "preview": toolBelt.setScrollPreviewOpen(true); break;
      case "help": stableHandlers.openFeatureTutorial(); break;
    }
  };

  const studioToolIconClass = (nextProps?: Parameters<typeof studioChromeIconClass>[0]) =>
    studioChromeIconClass(nextProps ?? {});
  const toolBtn = (active: boolean) => studioToolButtonClass(active, { dense: true });

  return (
    <>
      <StudioWorkflowAccess
        expanded={showAdvanced}
        canCollapse={uiDensityMode !== "full"}
        controlsId={advancedToolsId}
        onToggleExpanded={() => { setMenu(null); setExpanded((value) => !value); }}
        lockedReason={lockedReason}
        onTask={startTask}
        onBeforeOpen={() => setMenu(null)}
      />
      {(allows("toolbar-assets") || activeToolbarGroup === "assetGroup") ? (
        <StudioToolbarCluster
          label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "에셋 라이브러리")}
          className={cn(!allows("toolbar-assets") && "border-0 bg-transparent p-0 shadow-none")}
        >
          <div ref={activeToolbarGroup === "assetGroup" ? menuRef : undefined} className="relative">
            <StudioToolBeltHintTarget hint={hints.assets}>
              <button
                type="button"
                aria-label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "템플릿·에셋")}
                onClick={() => {
                  preloadStudioAssetToolPopoverBody();
                  setMenu(activeToolbarGroup === "assetGroup" ? null : "asset");
                }}
                onPointerEnter={preloadStudioAssetToolPopoverBody}
                onPointerDown={preloadStudioAssetToolPopoverBody}
                onFocus={preloadStudioAssetToolPopoverBody}
                aria-haspopup="menu"
                aria-expanded={activeToolbarGroup === "assetGroup"}
                className={cn(
                  toolBtn(activeToolbarGroup === "assetGroup"),
                  !allows("toolbar-assets") && "sr-only"
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
                <span><span className="max-[359px]:hidden">{translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "템플릿·")}</span>{translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "에셋")}</span>
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
              className={cn(
                groupPopoverClass("w-80"),
                menu === "asset"
                  ? "lg:left-1/2 lg:w-[min(74rem,calc(100vw-2rem))] lg:max-w-[calc(100vw-2rem)] lg:max-h-[calc(100dvh-7.5rem)] lg:-translate-x-1/2 lg:overflow-hidden"
                  : "lg:w-[22rem] lg:max-w-[min(24rem,calc(100vw-1.5rem))]",
              )}
              desktopWindow={{
                label: "에셋",
                surfaceId: "toolbar-assets",
                defaultLayout: STUDIO_FLOATING_MENU_LAYOUTS.asset,
                onClose: () => setMenu(null),
                minWidth: 400,
                minHeight: 320,
                maxWidth: 860,
                maxHeight: 1100,
                contentClassName: "overflow-y-auto overflow-x-hidden",
              }}
            >
              <Suspense fallback={<StudioPanelLoading label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "에셋 메뉴를 여는 중...")} />}>
                <LazyStudioAssetToolPopoverBody toolBelt={toolBelt} />
              </Suspense>
            </StudioFloatingToolPopover>
          </div>
        </StudioToolbarCluster>
      ) : null}

      {allows("toolbar-cut") ? (
        <>
          <StudioToolbarDivider label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "컷")} />
          <StudioToolbarCluster label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "컷 배치")}>
            <StudioToolBeltHintTarget hint={hints.panelAdd}>
              <button
                type="button"
                aria-label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "컷 추가 · 만화 패널")}
                onClick={addFrame}
                className={toolBtn(false)}
              >
                <Plus
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass()}
                /> {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "컷 추가")}</button>
            </StudioToolBeltHintTarget>
            {showAdvanced ? (
              <StudioToolBeltHintTarget hint={hints.panelSplit}>
                <button type="button" onClick={addDiagonalSplit} className={toolBtn(false)}>
                  <SquareSplitHorizontal
                    size={STUDIO_ICON_SIZE.toolCompact}
                    strokeWidth={STUDIO_ICON_STROKE}
                    aria-hidden
                    className={studioToolIconClass()}
                  /> {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "사선 컷")}</button>
              </StudioToolBeltHintTarget>
            ) : null}
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
                  {selected.points ? translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "직선화") : translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "사선화")}
                </button>
              </StudioToolBeltHintTarget>
            )}
          </StudioToolbarCluster>
        </>
      ) : null}

      {allows("toolbar-draw") ? (
        <>
          <StudioToolbarDivider label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "도구")} className="lg:hidden" />
          <StudioToolbarCluster label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "그리기 도구")} className="lg:hidden">
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
                {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "선택")}</button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={hints.pen}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "편집 잠금을 해제한 뒤 펜을 사용할 수 있어요.") : undefined}
            >
              <button
                type="button"
                disabled={activeSurfaceReviewLocked}
                onClick={activatePen}
                className={cn(toolBtn(tool === "draw" && drawMode === "pen"), "disabled:cursor-not-allowed disabled:opacity-40")}
                aria-pressed={tool === "draw" && drawMode === "pen"}
              >
                <Pencil
                  size={STUDIO_ICON_SIZE.toolCompact}
                  strokeWidth={STUDIO_ICON_STROKE}
                  aria-hidden
                  className={studioToolIconClass({ active: tool === "draw" && drawMode === "pen" })}
                />
                {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "펜")}</button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={hints.eraser}
              disabled={activeSurfaceReviewLocked}
              unavailableReason={activeSurfaceReviewLocked ? translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "편집 잠금을 해제한 뒤 지우개를 사용할 수 있어요.") : undefined}
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
                {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "지우개")}</button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={hints.fill}
              unavailableReason={
                advancedFillUnsupportedReason
                  ? formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "{v0} 채우기를 누르면 안전한 단일 래스터 후보를 찾거나 필요한 조건을 안내합니다."), { v0: String(advancedFillUnsupportedReason) })
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
                {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "채우기")}</button>
            </StudioToolBeltHintTarget>
            {showAdvanced || selected?.type === "image" ? (
              <StudioToolBeltHintTarget
                hint={hints.frameAnimation}
                disabled={selected?.type !== "image"}
                unavailableReason={selected?.type !== "image" ? translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "애니메이션으로 만들 이미지를 먼저 선택하세요.") : undefined}
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
                  {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "프레임")}</button>
              </StudioToolBeltHintTarget>
            ) : null}
          </StudioToolbarCluster>
        </>
      ) : null}

      {allows("toolbar-insert") ? (
        <StudioToolBeltCreateModeInsertTools
          hints={hints}
          studioCanvasImageAccept={studioCanvasImageAccept}
          toolBelt={toolBelt}
        />
      ) : null}

      <div id={advancedToolsId} className="contents" data-studio-advanced-tools={showAdvanced ? translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "en", "expanded") : translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "en", "contextual")}>
      {allows("toolbar-reference") || referencePanelOpen ? (
      <>
        <StudioToolbarDivider label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "참조")} />
        <StudioToolbarCluster label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "참고 이미지")}>
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
              {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "참고 이미지")}</button>
          </StudioToolBeltHintTarget>
        </StudioToolbarCluster>
      </>
    ) : null}

      {(allows("toolbar-scene") || activeToolbarGroup === "bgGroup") ? (
        <>
          {allows("toolbar-scene") ? <StudioToolbarDivider label="3D" /> : null}
          <StudioToolbarCluster
            label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "3D 제작·배경")}
            className={cn(!allows("toolbar-scene") && "border-0 bg-transparent p-0 shadow-none")}
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
                    !allows("toolbar-scene") && "sr-only"
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
                  {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "3D 스튜디오")}<ChevronDown
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
                desktopWindow={{
                  label: "장면",
                  surfaceId: "toolbar-scene",
                  defaultLayout: STUDIO_FLOATING_MENU_LAYOUTS.scene,
                  onClose: () => setMenu(null),
                  minWidth: 380,
                  minHeight: 320,
                  maxWidth: 820,
                  maxHeight: 1050,
                  contentClassName: "overflow-y-auto",
                }}
              >
                <Suspense fallback={<StudioPanelLoading label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "3D 스튜디오를 여는 중...")} />}>
                  <LazyStudioSceneToolPopoverBody toolBelt={toolBelt} />
                </Suspense>
              </StudioFloatingToolPopover>
            </div>
          </StudioToolbarCluster>
        </>
      ) : null}

      {(allows("toolbar-style") || activeToolbarGroup === "styleGroup") ? (
        <StudioToolbarCluster
          label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "스타일")}
          className={cn(!allows("toolbar-style") && "border-0 bg-transparent p-0 shadow-none")}
        >
          <div ref={activeToolbarGroup === "styleGroup" ? menuRef : undefined} className="relative">
            <StudioToolBeltHintTarget hint={hints.style}>
              <button
                type="button"
                onClick={() => setMenu(activeToolbarGroup === "styleGroup" ? null : "palette")}
                onPointerEnter={preloadStudioStyleToolPopoverBody}
                onPointerDown={preloadStudioStyleToolPopoverBody}
                onFocus={preloadStudioStyleToolPopoverBody}
                aria-haspopup="menu"
                aria-expanded={activeToolbarGroup === "styleGroup"}
                className={cn(
                  toolBtn(activeToolbarGroup === "styleGroup"),
                  !allows("toolbar-style") && "sr-only"
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
                /> {translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "스타일")}<ChevronDown
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
              className={cn(
                groupPopoverClass("w-80"),
                "lg:w-[23rem] lg:max-w-[min(24rem,calc(100vw-1.5rem))]",
              )}
              desktopWindow={{
                label: "스타일",
                surfaceId: "toolbar-style",
                defaultLayout: STUDIO_FLOATING_MENU_LAYOUTS.style,
                onClose: () => setMenu(null),
                minWidth: 360,
                minHeight: 300,
                maxWidth: 720,
                maxHeight: 900,
                contentClassName: "overflow-y-auto",
              }}
            >
              <Suspense fallback={<StudioPanelLoading label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "스타일 메뉴를 여는 중...")} />}>
                <LazyStudioStyleToolPopoverBody toolBelt={toolBelt} />
              </Suspense>
            </StudioFloatingToolPopover>
          </div>
        </StudioToolbarCluster>
      ) : null}

      {(allows("toolbar-ai") || activeToolbarGroup === "aiGroup") ? (
        <>
          {allows("toolbar-ai") ? <StudioToolbarDivider label="AI" /> : null}
          <StudioToolbarCluster
            label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "AI 연동")}
            className={cn(!allows("toolbar-ai") && "border-0 bg-transparent p-0 shadow-none")}
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
                    !allows("toolbar-ai") && "sr-only"
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
                desktopWindow={{
                  label: "AI 도우미",
                  surfaceId: "toolbar-ai-assistant",
                  defaultLayout: STUDIO_FLOATING_MENU_LAYOUTS.ai,
                  onClose: () => setMenu(null),
                  minWidth: 440,
                  minHeight: 380,
                  maxWidth: 960,
                  maxHeight: 1100,
                  contentClassName: "flex flex-col overflow-hidden",
                }}
              >
                <Suspense fallback={<StudioPanelLoading label={translateCurrentStaticSourceText("domains.creator.StudioToolBeltCreateModeGroups", "ko", "AI 메뉴를 여는 중...")} />}>
                  <LazyStudioAiToolPopoverBody toolBelt={toolBelt} />
                </Suspense>
              </StudioFloatingToolPopover>
            </div>
          </StudioToolbarCluster>
        </>
      ) : null}

      {showAdvanced ? (
        <StudioToolBeltCreateModeUtilityButtons
          hints={hints}
          toolBelt={toolBelt}
        />
      ) : null}
      </div>
    </>
  );
});
