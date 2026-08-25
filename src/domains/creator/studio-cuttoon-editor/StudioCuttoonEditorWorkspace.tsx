/* Extracted render tree from StudioCuttoonEditor.
 * Session props are an `any` bag matching the original editor closure. */
// @ts-nocheck
import { Suspense } from "react";
import { LazyStudioLeftToolRail, LazyStudioPageListPane } from "../studio-page-modal-lazy-boundaries";
import { cn } from "@/lib/utils";
import { StudioCuttoonEditorCanvasColumn } from "./StudioCuttoonEditorCanvasColumn";
import { StudioCuttoonEditorInspectorColumn } from "./StudioCuttoonEditorInspectorColumn";
import { StudioCuttoonEditorPanels } from "./StudioCuttoonEditorPanels";
import { StudioCuttoonEditorSessionDialogs } from "./StudioCuttoonEditorSessionDialogs";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export function StudioCuttoonEditorWorkspace(s: StudioCuttoonEditorViewSession) {
  const {
    activeSurfaceReviewLocked,
    admittedBg3dOpen,
    admittedMannequinPoserOpen,
    admittedPoserVrmOpen,
    advancedFillActive,
    advancedFillUnsupportedReason,
    appSettings,
    appSettingsOpen,
    canvasOnlyMode,
    collaborationDocumentLocked,
    collaborationLockMessage,
    commentPlacementActive,
    composeWorkAssetPreviewPage,
    cropRect,
    currentPageId,
    dismissActiveMobileSheet,
    dodgeBurnActive,
    drawMode,
    drawShape,
    eyedropperActive,
    frameAnimOpen,
    frameAnimTargetId,
    hybridDccOpen,
    isMobile,
    isRailToolVisible,
    leftResize,
    liquifyActive,
    master,
    masterEditMode,
    masterPanelOpen,
    metaEditPageId,
    mobileImmersive,
    mobileKeyboardInset,
    mobileSheet,
    modalMobileSheet,
    pageDnd,
    pages,
    pagesSheetRef,
    perspectiveRulerActive,
    pixelForceCircle,
    pixelSel,
    pixelTool,
    pixelToolTargetAvailable,
    quickShapeActive,
    railMoreOpen,
    rasterRetouchTargetAvailable,
    referencePanelOpen,
    selected,
    selectedImageMutationLocked,
    setAppSettingsInitialTab,
    setAppSettingsOpen,
    setBg3dOpen,
    setCurrentPageId,
    setDrawShape,
    setEyedropperActive,
    setHybridDccOpen,
    setLeftPanelOpenWithOverride,
    setMannequinPoserOpen,
    setMasterPanelOpen,
    setMenu,
    setMetaEditPageId,
    setMobileSheet,
    setPerspectiveRulerActive,
    setPixelForceCircle,
    setPixelTool,
    setPoserVrmOpen,
    setQuickShapeActive,
    setRailMoreOpen,
    setReferencePanelOpen,
    setStrokeWidth,
    setTool,
    setViewTool,
    smudgeActive,
    studioLeftToolRailHandlers,
    studioPageListPaneHandlers,
    tool,
    uiDensityMode,
    viewTool,
    viewTransformSuppressed,
    wetMixActive,
    presentationPanelsHidden,
    visibleLeftPanelOpen,
  } = s;
  return (
      <div
        data-studio-mobile-canvas-workspace={isMobile ? "true" : undefined}
        className={cn(
          // Edge-dock workspace: the mobile dock overlays the scrollport instead of shrinking this
          // flex lane. StudioCanvasViewport owns the matching scroll-safe inset, so the final canvas
          // pixels remain reachable while the full dynamic viewport stays available for drawing.
          "flex min-h-0 flex-1 flex-col gap-0 pb-0 lg:flex-row lg:overflow-hidden",
          canvasOnlyMode && "overflow-hidden",
          mobileImmersive && "overflow-hidden"
        )}
      >
        {/* 모달 시트 전용 스크림. 브러시 설정(draw)은 캔버스를 계속 만질 수 있는 비모달이다. */}
        {isMobile && modalMobileSheet && (
          <div
            aria-hidden
            data-studio-modal-backdrop="true"
            onPointerDown={(event) => {
              // The scrim itself is not a focus target. Prevent the pointer's default focus move
              // from overriding the modal controller's launcher-focus restoration during unmount.
              event.preventDefault();
              dismissActiveMobileSheet();
            }}
            className="fixed inset-0 z-[59] bg-black/45 backdrop-blur-sm lg:hidden"
          />
        )}
        {/* 왼쪽: 페이지 목록 — 접히면 아이콘 엣지 레일 */}
        <Suspense
          fallback={(
            <div
              aria-hidden="true"
              data-studio-page-list-loading="true"
              className="hidden w-12 shrink-0 border-r border-line bg-panel lg:block"
            />
          )}
        >
          <LazyStudioPageListPane
            collaborationDocumentLocked={collaborationDocumentLocked}
            collaborationLockMessage={collaborationLockMessage}
            composeWorkAssetPreviewPage={composeWorkAssetPreviewPage}
            currentPageId={currentPageId}
            isMobile={isMobile}
            leftResize={leftResize}
            master={master}
            masterEditMode={masterEditMode}
            masterPanelOpen={masterPanelOpen}
            metaEditPageId={metaEditPageId}
            mobileKeyboardInset={mobileKeyboardInset}
            mobileSheet={mobileSheet}
            pageDnd={pageDnd}
            pages={pages}
            pagesSheetRef={pagesSheetRef}
            presentationPanelsHidden={presentationPanelsHidden}
            setCurrentPageId={setCurrentPageId}
            setLeftPanelOpen={setLeftPanelOpenWithOverride}
            setMasterPanelOpen={setMasterPanelOpen}
            setMetaEditPageId={setMetaEditPageId}
            setMobileSheet={setMobileSheet}
            visibleLeftPanelOpen={visibleLeftPanelOpen}
            stableHandlers={studioPageListPaneHandlers}
          />
        </Suspense>

        {/* Left vertical toolbar — desktop only; mobile uses bottom dock / horizontal belt */}
        <Suspense
          fallback={(
            <div
              aria-hidden="true"
              data-studio-left-tool-rail-loading="true"
              className="hidden w-12 shrink-0 border-r border-line bg-panel lg:block"
            />
          )}
        >
        <LazyStudioLeftToolRail
          activeSurfaceReviewLocked={activeSurfaceReviewLocked}
          pixelToolTargetAvailable={pixelToolTargetAvailable}
          rasterRetouchTargetAvailable={rasterRetouchTargetAvailable}
          advancedFillActive={advancedFillActive}
          advancedFillUnsupportedReason={advancedFillUnsupportedReason}
          appSettings={appSettings}
          appSettingsOpen={appSettingsOpen}
          canvasOnlyMode={canvasOnlyMode}
          commentPinArmed={commentPlacementActive}
          cropActive={cropRect !== null}
          drawMode={drawMode}
          drawShape={drawShape}
          eyedropperActive={eyedropperActive}
          frameAnimOpen={frameAnimOpen}
          frameAnimTargetId={frameAnimTargetId}
          isRailToolVisible={isRailToolVisible}
          liquifyActive={liquifyActive}
          mobileImmersive={mobileImmersive}
          perspectiveRulerActive={perspectiveRulerActive}
          pixelForceCircle={pixelForceCircle}
          pixelSel={pixelSel}
          pixelTool={pixelTool}
          quickShapeActive={quickShapeActive}
          railMoreOpen={railMoreOpen}
          referencePanelOpen={referencePanelOpen}
          mannequinPoserOpen={admittedMannequinPoserOpen}
          poserVrmOpen={admittedPoserVrmOpen}
          bg3dOpen={admittedBg3dOpen}
          hybridDccOpen={hybridDccOpen}
          selected={selected}
          selectedImageMutationLocked={selectedImageMutationLocked}
          setAppSettingsInitialTab={setAppSettingsInitialTab}
          setAppSettingsOpen={setAppSettingsOpen}
          setDrawShape={setDrawShape}
          setEyedropperActive={setEyedropperActive}
          setMenu={setMenu}
          setPerspectiveRulerActive={setPerspectiveRulerActive}
          setPixelForceCircle={setPixelForceCircle}
          setPixelTool={setPixelTool}
          setQuickShapeActive={setQuickShapeActive}
          setRailMoreOpen={setRailMoreOpen}
          setReferencePanelOpen={setReferencePanelOpen}
          setMannequinPoserOpen={setMannequinPoserOpen}
          setPoserVrmOpen={setPoserVrmOpen}
          setBg3dOpen={setBg3dOpen}
          setHybridDccOpen={setHybridDccOpen}
          setStrokeWidth={setStrokeWidth}
          setTool={setTool}
          setViewTool={setViewTool}
          dodgeBurnActive={dodgeBurnActive}
          wetMixActive={wetMixActive}
          smudgeActive={smudgeActive}
          tool={tool}
          uiDensityMode={uiDensityMode}
          viewTransformSuppressed={viewTransformSuppressed}
          viewTool={viewTool}
          stableHandlers={studioLeftToolRailHandlers}
        />
        </Suspense>

        {/* 중앙: 캔버스 + 우측 인스펙터 — 데스크톱에서는 한 행으로 남은 높이를 공유한다. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex-row">
          <StudioCuttoonEditorCanvasColumn {...s} />
          <StudioCuttoonEditorInspectorColumn {...s} />
        </div>
        <StudioCuttoonEditorPanels {...s} />
        <StudioCuttoonEditorSessionDialogs {...s} />
      </div>
  );
}
