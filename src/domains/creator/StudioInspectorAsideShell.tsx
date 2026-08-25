import {
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Suspense } from "react";

import { toggleStudioDrawingPalette } from "./brush/studio-drawing-palettes";
import { StudioLayerBorderEffectPanel } from "./layer/StudioLayerBorderEffectPanel";
import { CANVAS_W } from "./studio-assets";
import { elBounds } from "./studio-element-geometry";
import { elementLabel } from "./studio-element-label";
import { openStudioHelpCenter } from "./studio-help-center-channel";
import { uid } from "./studio-id";
import { normalizeStudioInspectorLayout } from "./studio-inspector-layout";
import { executeStudioInspectorRouteTransition } from "./studio-inspector-tool-transition";
import { isEffectivelyHidden } from "./studio-layers";
import { studioMobileSheetSizeStyle } from "./studio-mobile-sheet-snap";
import { StudioLayerNavigator } from "./studio-page-lazy-ui";
import { STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH } from "./studio-workspaces";
import { StudioCommandSearchHost } from "./StudioCommandSearchHost";
import { StudioInspectorCanvasControls } from "./StudioInspectorCanvasControls";
import { StudioInspectorNavigator } from "./StudioInspectorNavigator";
import {
  StudioInspectorDisabledReasons,
  StudioInspectorPageGradeSurface,
  StudioInspectorPublishPanel,
} from "./StudioInspectorUtilityPanels";
import { StudioMinimapViewportBox } from "./StudioMinimapViewportBox";
import { StudioMobileSheetHandle } from "./StudioMobileSheetHandle";

import type { El } from "./studio-element-model";
import type { StudioInspectorAsideModel } from "./useStudioInspectorAsideModel";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StudioInspectorAsideShell({
  model,
  children,
}: {
  model: StudioInspectorAsideModel;
  children: ReactNode;
}) {
  const {
    activeImageRasterPolicy,
    applyBgPreset,
    applyMagicResizePreset,
    applyPageGrade,
    applyPaperTintBackground,
    bg,
    bgGrad,
    canvasControlsDisabled,
    canvasFlipH,
    canvasH,
    canvasRotation,
    changeDrawingPaletteLayout,
    changeInspectorLayout,
    commit,
    currentPageId,
    currentTemplate,
    description,
    disarmAllPixelTools,
    drawingPaletteLayout,
    effScale,
    elements,
    ensureWebtoonGuidesLoaded,
    gridSize,
    groups,
    handleLayerNavigatorAction,
    inspectorContentMode,
    inspectorDrawing,
    inspectorInteractionPolicy,
    inspectorLayout,
    inspectorTransientState,
    isMobile,
    layerNavigatorItems,
    localHiddenElementIds,
    magicResizeStrategy,
    marqueeIds,
    masterEditMode,
    mobileInspectorSnap,
    mobileSheet,
    onMinimapClick,
    onMinimapKeyDown,
    openFeatureTutorial,
    pageGrade,
    pageGradeActive,
    pageGradePanelOpen,
    panelGutter,
    paperGrainKind,
    paperGrainVisible,
    patchEl,
    patchPageGrade,
    propsSheetRef,
    regenerateTemplate,
    resetPageGrade,
    rightPanelDisabledReasons,
    rightResize,
    safeMobileKeyboardInset,
    scrollViewportStore,
    selectLayersFromNavigator,
    selected,
    selectedId,
    setBg,
    setBgGrad,
    setCanvasH,
    setDescription,
    setGridSize,
    setMagicResizeStrategy,
    setMenu,
    setMobileInspectorSnap,
    setMobileSheet,
    setPageGradePanelOpen,
    setPanelGutter,
    setPaperGrainKind,
    setPaperGrainVisible,
    setRightPanelOpen,
    setSharedDocumentNotice,
    setShowAlignmentGuides,
    setShowGrid,
    setShowWebtoonGuides,
    setSnapEnabled,
    setTagsText,
    setTitle,
    setUserGuides,
    setWebtoonTheme,
    showAlignmentGuides,
    showGrid,
    showWebtoonGuides,
    snapEnabled,
    soloLayerId,
    tagsText,
    title,
    titleInputRef,
    toggleLayerSolo,
    toggleLocalHidden,
    userGuides,
    visibleRightPanelOpen,
    webtoonGuides,
    webtoonTheme,
    withCanvasControlsGuard,
  } = model;
  return (
        <aside
          ref={propsSheetRef}
          role={isMobile ? "dialog" : undefined}
          aria-modal={isMobile && mobileSheet === "props" ? true : undefined}
          data-studio-sheet-id="props"
          data-studio-mobile-sheet={isMobile && mobileSheet === "props" ? "true" : undefined}
          data-studio-sheet-snap={isMobile ? mobileInspectorSnap : undefined}
          data-popup-kind={isMobile && mobileSheet === "props" ? "sheet" : undefined}
          aria-label={isMobile ? "속성" : undefined}
          tabIndex={isMobile ? -1 : undefined}
          inert={isMobile && mobileSheet !== "props" ? true : undefined}
          className={cn(
            "flex min-h-0 flex-col gap-2 overscroll-contain [scrollbar-gutter:stable]",
            "fixed inset-x-0 bottom-0 z-[60] overflow-y-auto rounded-t-3xl border border-line bg-panel p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl transition-[transform,height,max-height] duration-300 ease-out motion-reduce:transition-none",
            "lg:static lg:z-auto lg:max-h-none lg:min-h-0 lg:flex-none lg:self-stretch lg:overflow-y-auto lg:rounded-none lg:border lg:border-y-0 lg:border-r-0 lg:border-line lg:bg-panel/50 lg:p-2 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "props" ? "translate-y-0" : "translate-y-full",
            !visibleRightPanelOpen && "lg:hidden",
            inspectorLayout.primary === "layers" && "overflow-hidden lg:overflow-hidden",
            inspectorDrawing &&
              inspectorLayout.primary === "properties" &&
              "lg:overflow-hidden"
          )}
          style={
            isMobile
              ? {
                  bottom: safeMobileKeyboardInset,
                  ...studioMobileSheetSizeStyle(
                    mobileInspectorSnap,
                    safeMobileKeyboardInset,
                  ),
                }
              : { width: rightResize.width, minWidth: STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH.minimum }
          }
        >
          <StudioCommandSearchHost
            hideTrigger={isMobile}
            trailing={
              isMobile ? null : (
                <button
                  type="button"
                  onClick={() => setRightPanelOpen(false)}
                  aria-label="속성 패널 접기"
                  className="mr-1 hidden min-h-9 shrink-0 items-center gap-0.5 rounded px-1.5 text-[0.65rem] text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:inline-flex"
                  title="속성 패널 접기"
                >
                  접기 <ChevronRight size={12} aria-hidden />
                </button>
              )
            }
            onNavigateInspector={(route) => {
              changeInspectorLayout(
                normalizeStudioInspectorLayout({ ...inspectorLayout, ...route }),
              );
            }}
            onOpenTutorial={(tutorialId) => openFeatureTutorial(tutorialId)}
            onExpandPalette={(paletteId) => {
              if (!drawingPaletteLayout.collapsed[paletteId]) return;
              changeDrawingPaletteLayout(
                toggleStudioDrawingPalette(drawingPaletteLayout, paletteId),
              );
            }}
            onOpenHelp={(_helpNodeId, commandId) =>
              openStudioHelpCenter({
                section: "current-tool",
                toolCommandId: commandId,
              })
            }
          />
          <StudioInspectorNavigator
            layout={inspectorLayout}
            selectedType={
              inspectorContentMode === "selection" ? selected?.type ?? null : null
            }
            selectionLabel={
              inspectorContentMode === "selection" && selected
                ? elementLabel(selected)
                : null
            }
            drawing={inspectorDrawing}
            imageToolsAvailable={!inspectorDrawing}
            imageToolsStatusLabel={activeImageRasterPolicy?.statusLabel}
            imageToolsStatusDescription={activeImageRasterPolicy?.description}
            imageToolsStatusTone={
              activeImageRasterPolicy?.state === "ready"
                ? "good"
                : activeImageRasterPolicy?.selectable
                  ? "accent"
                  : activeImageRasterPolicy
                    ? "warn"
                    : undefined
            }
            layerCount={elements.length}
            mobileSheetHandle={
              <StudioMobileSheetHandle
                active={isMobile && mobileSheet === "props"}
                kind="props"
                label="속성 시트"
                onDismiss={() => setMobileSheet(null)}
                onSnapChange={setMobileInspectorSnap}
                sheetRef={propsSheetRef}
                snap={mobileInspectorSnap}
              />
            }
            onRequestClose={() => setMobileSheet(null)}
            onChange={(next) => {
              executeStudioInspectorRouteTransition(
                {
                  current: inspectorLayout,
                  next,
                  transient: inspectorTransientState,
                  drawing: inspectorDrawing,
                },
                {
                  disarm: disarmAllPixelTools,
                  navigate: changeInspectorLayout,
                },
              );
            }}
          />
          <StudioInspectorDisabledReasons reasons={rightPanelDisabledReasons} />
          <StudioInspectorCanvasControls
            background={bg}
            canvasHeight={canvasH}
            controlsDisabled={canvasControlsDisabled}
            gridSize={gridSize}
            hidden={
              inspectorLayout.primary !== "document" ||
              inspectorLayout.document !== "canvas"
            }
            magicResizeStrategy={magicResizeStrategy}
            masterEditMode={masterEditMode}
            panelGutter={panelGutter}
            paperGrainKind={paperGrainKind}
            paperGrainVisible={paperGrainVisible}
            showAlignmentGuides={showAlignmentGuides}
            showGrid={showGrid}
            showWebtoonGuides={showWebtoonGuides}
            snapEnabled={snapEnabled}
            templateGutterAvailable={
              currentTemplate !== null && currentTemplate.id !== "blank"
            }
            userGuides={userGuides}
            webtoonGuides={webtoonGuides}
            webtoonTheme={webtoonTheme}
            onAddUserGuide={withCanvasControlsGuard((type, pos?: number) =>
              setUserGuides((current) => [
                ...current,
                {
                  id: uid(),
                  type,
                  pos: pos ?? (type === "v" ? CANVAS_W / 2 : canvasH / 2),
                },
              ])
            )}
            onApplyBackgroundPreset={withCanvasControlsGuard(applyBgPreset)}
            onApplyMagicResizePreset={withCanvasControlsGuard(applyMagicResizePreset)}
            onBackgroundChange={withCanvasControlsGuard(setBg)}
            onCanvasHeightDelta={withCanvasControlsGuard((delta: number) =>
              setCanvasH((height) => height + delta)
            )}
            onClearUserGuides={withCanvasControlsGuard(() => setUserGuides([]))}
            onDeleteUserGuide={withCanvasControlsGuard((nextId) =>
              setUserGuides((current) =>
                current.filter((guide) => guide.id !== nextId)
              )
            )}
            onGradientChange={withCanvasControlsGuard(setBgGrad)}
            onGridSizeChange={withCanvasControlsGuard(setGridSize)}
            onMagicResizeStrategyChange={withCanvasControlsGuard(setMagicResizeStrategy)}
            onMoveUserGuide={withCanvasControlsGuard((id, pos: number) =>
              setUserGuides((current) =>
                current.map((guide) =>
                  guide.id === id ? { ...guide, pos } : guide
                )
              )
            )}
            onOpenBackgroundEditor={withCanvasControlsGuard(() => setMenu("bgFill"))}
            onPaperGrainKindChange={withCanvasControlsGuard(setPaperGrainKind)}
            onPaperGrainVisibleChange={withCanvasControlsGuard(setPaperGrainVisible)}
            onApplyPaperTintBackground={withCanvasControlsGuard(applyPaperTintBackground)}
            onPanelGutterChange={withCanvasControlsGuard((nextGutter) => {
              setPanelGutter(nextGutter);
              setSharedDocumentNotice(null);
              if (currentTemplate) {
                const nextElements = regenerateTemplate(currentTemplate, nextGutter);
                commit(nextElements);
              }
            })}
            onShowAlignmentGuidesChange={withCanvasControlsGuard(setShowAlignmentGuides)}
            onShowGridChange={withCanvasControlsGuard(setShowGrid)}
            onShowWebtoonGuidesChange={withCanvasControlsGuard((visible: boolean) => {
              if (visible) ensureWebtoonGuidesLoaded();
              setShowWebtoonGuides(visible);
            })}
            onSnapEnabledChange={withCanvasControlsGuard(setSnapEnabled)}
            onWarmWebtoonGuides={withCanvasControlsGuard(() => ensureWebtoonGuidesLoaded())}
            onWebtoonThemeChange={withCanvasControlsGuard((theme) => {
              setWebtoonTheme(theme);
              setSharedDocumentNotice(null);
            })}
          />
          <StudioInspectorPageGradeSurface
            active={
              inspectorLayout.primary === "document" &&
              inspectorLayout.document === "grade"
            }
            expanded={pageGradePanelOpen}
            grade={pageGrade}
            gradeActive={pageGradeActive}
            gate={inspectorInteractionPolicy.page}
            onApplyPreset={applyPageGrade}
            onExpandedChange={setPageGradePanelOpen}
            onPatch={patchPageGrade}
            onReset={resetPageGrade}
          />
          {children}
          <div
            role="tabpanel"
            aria-label="레이어"
            hidden={inspectorLayout.primary !== "layers"}
            className="flex h-[min(31rem,54dvh)] min-h-72 flex-col gap-2 lg:h-[calc(100dvh-28rem)] lg:min-h-72"
          >
            {inspectorLayout.primary === "layers" ? (
              <>
                <div className="min-h-0 flex-1 [&>section]:h-full">
                  <Suspense
                    fallback={
                      <div
                        role="status"
                        aria-live="polite"
                        className="grid h-full min-h-72 place-items-center rounded-xl border border-line bg-panel/40 px-4 text-center"
                      >
                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-fg-3">
                          <Loader2
                            size={15}
                            className="animate-spin motion-reduce:animate-none"
                            aria-hidden
                          />
                          레이어 탐색기 불러오는 중
                        </span>
                      </div>
                    }
                  >
                    <StudioLayerNavigator
                      items={layerNavigatorItems}
                      groups={masterEditMode ? [] : groups}
                      selectedIds={marqueeIds.length > 0 ? marqueeIds : selectedId ? [selectedId] : []}
                      pageKey={`${masterEditMode ? "master" : currentPageId}:${inspectorLayout.primary}`}
                      livePageId={masterEditMode ? null : currentPageId}
                      readOnly={inspectorInteractionPolicy.global.disabled}
                      groupingDisabled={masterEditMode}
                      localHiddenIds={localHiddenElementIds}
                      onToggleLocalHidden={toggleLocalHidden}
                      soloLayerId={soloLayerId}
                      onToggleLayerSolo={toggleLayerSolo}
                      onSelectionChange={selectLayersFromNavigator}
                      onAction={handleLayerNavigatorAction}
                    />
                  </Suspense>
                </div>
                {/* CSP 경계 효과(fuchi) — 선택 이미지 레이어의 비파괴 테두리. 문서 커밋은
                    다른 레이어 속성(불투명도 등)과 같은 patchEl 시임 하나만 쓴다(2026-08-20). */}
                {selected?.type === "image" ? (
                  <StudioLayerBorderEffectPanel
                    value={selected.borderEffect}
                    disabled={inspectorInteractionPolicy.global.disabled}
                    onChange={(next) => patchEl(selected.id, { borderEffect: next } as Partial<El>)}
                  />
                ) : null}
              </>
            ) : null}
          </div>

          {/* 미니맵 / 네비게이터 */}
          <div
            role="tabpanel"
            aria-label="미니맵과 페이지 탐색"
            hidden={
              inspectorLayout.primary !== "document" ||
              inspectorLayout.document !== "navigator"
            }
            className="rounded-xl border border-line bg-panel/40 p-3"
          >
            <p className="mb-2 text-xs font-semibold text-fg-3 uppercase tracking-wider">미니맵 / 네비게이터</p>
            <div className="flex justify-center bg-canvas/30 rounded-xl p-2 border border-line/50">
              <div
                role="button"
                tabIndex={0}
                aria-label="미니맵: 클릭하거나 끌어서 캔버스 이동, 방향키로 스크롤"
                onClick={onMinimapClick}
                // Figma/Procreate식 드래그 스크럽: 포인터를 잡은 채 끌면 뷰포트가 연속으로 따라온다.
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (e.buttons !== 1) return;
                  onMinimapClick(e as unknown as React.MouseEvent<HTMLDivElement>);
                }}
                onKeyDown={onMinimapKeyDown}
                style={{
                  width: "120px",
                  height: `${Math.round(120 * (canvasH / CANVAS_W))}px`,
                  background: bgGrad ? `linear-gradient(${bgGrad[0]}, ${bgGrad[1]})` : bg,
                  position: "relative",
                  cursor: "pointer",
                  overflow: "hidden",
                }}
                className="rounded border border-line shadow-inner"
              >
                {/* Render panels/frames — hidden 탭패널일 땐 요소별 박스 생성을 건너뛴다
                    (요소 수에 비례하는 커밋당 jsxDEV 비용이 미니맵을 안 보는 동안에도 나가던 것). */}
                {inspectorLayout.primary === "document" && inspectorLayout.document === "navigator"
                  ? elements.map((el) => {
                  if (isEffectivelyHidden(el, groups) || localHiddenElementIds.has(el.id)) return null;
                  const bounds = elBounds(el);
                  const pctX = (bounds.x / CANVAS_W) * 100;
                  const pctY = (bounds.y / canvasH) * 100;
                  const pctW = (bounds.w / CANVAS_W) * 100;
                  const pctH = (bounds.h / canvasH) * 100;

                  // 디자인 토큰만 사용(스톡 Tailwind 팔레트 금지) — 레이어 패널의 색 의미와 정렬.
                  let colorClass = "bg-accent/40";
                  if (el.type === "frame") colorClass = "border border-bad/50 bg-bad/10";
                  else if (el.type === "text") colorClass = "bg-accent-2/50";
                  else if (el.type === "bubble") colorClass = "bg-warn/50";
                  else if (el.type === "draw") colorClass = "bg-good/30";

                  return (
                    <div
                      key={`mini-${el.id}`}
                      className={cn("absolute rounded-sm pointer-events-none", colorClass)}
                      style={{
                        left: `${pctX}%`,
                        top: `${pctY}%`,
                        width: `${pctW}%`,
                        height: `${pctH}%`,
                      }}
                    />
                  );
                })
                  : null}
                {/* Render scroll window box — 액센트 프레임 + 바깥 영역 딤(오버플로 히든 활용).
                    팬 중에도 프레임 정확도를 지켜야 하므로 살아 있는 스크롤 스토어를 구독하는
                    전용 리프로 분리했다(이 박스만 다시 그려지고 인스펙터 렌더는 없다). */}
                <StudioMinimapViewportBox
                  store={scrollViewportStore}
                  canvasHeight={canvasH}
                  effScale={effScale}
                  canvasFlipH={canvasFlipH}
                  canvasRotation={canvasRotation}
                />
              </div>
            </div>
          </div>
          <StudioInspectorPublishPanel
            active={inspectorLayout.primary === "publish"}
            description={description}
            readOnly={inspectorInteractionPolicy.global.disabled}
            tags={tagsText}
            title={title}
            titleInputRef={titleInputRef}
            onDescriptionChange={(value) => {
              setDescription(value);
              setSharedDocumentNotice(null);
            }}
            onTagsChange={(value) => {
              setTagsText(value);
              setSharedDocumentNotice(null);
            }}
            onTitleChange={(value) => {
              setTitle(value);
              setSharedDocumentNotice(null);
            }}
          />
        </aside>
  );
}
