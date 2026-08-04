import { BookOpen, CircleHelp, Clapperboard, Eraser, FlipHorizontal2, Grid3X3, ImagePlus, Keyboard, Lock, Maximize2, MessageSquare, Minimize2, Minus, Mouse, MousePointer2, PaintBucket, Pencil, PenTool, Plus, Shapes, Sparkles, Square, Unlock, Wind } from "lucide-react";
import { Fragment, Profiler, Suspense, memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { Stage, Layer, Rect, Group, Circle as KCircle, Transformer, Shape, Text } from "react-konva/lib/ReactKonvaCore";

import { ClipMaskGroup } from "./ClipMaskGroup";
import { studioAdjustmentStackToFilterFields } from "./studio-adjustment-stack";
import { type StudioAdvancedRuler, type StudioAdvancedRulerDocument } from "./studio-advanced-ruler-document";
import { moveKeyframe, removeKeyframe, removeTrack, resolveTimelineComposite, resolveTimelineTransforms, type AnimationTimelineDoc } from "./studio-anim-tracks";
import { resetStudioAppSettings, studioAppSettingsStorage, type StudioAppSettings, type StudioAppSettingsTab } from "./studio-app-settings";
import { CANVAS_W } from "./studio-assets";
import { studioBackgroundGradientColorStops } from "./studio-background-gradient-color-stops";
import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";
import { studioBrushAliasEffectiveDiameter } from "./studio-brush-alias-profile";
import { BUBBLE_MERGE_MIN_COUNT, bubbleMergeUnavailableReason } from "./studio-bubble-merge";
import { isStudioBrushCursorMode, studioCanvasCursorClassName, studioCanvasViewportCursorClassName } from "./studio-canvas-cursor";
import { recordStudioRenderProfile, studioElementIdOf } from "./studio-canvas-shared-runtime";
import { StudioHudPill, StudioStatusBar } from "./studio-chrome-ui";
import { type CropRect } from "./studio-crop";
import { type DialogueReplacePlan } from "./studio-dialogue-batch";
import { applyDialogueFormatPatch, convertTextElementsToBubbles } from "./studio-dialogue-format";
import { applyDialogueRubySpan, clearDialogueRubyRange } from "./studio-dialogue-ruby";
import { mergeDialogueWithNext, splitDialogueElement, transferDialogueElement } from "./studio-dialogue-structure";
import { dialogueLocalesForPages, dialogueTranslationCoverage } from "./studio-dialogue-translate";
import { studioDrawHudToolLabel, studioPressureCurveHudLabel, studioShapeFillHudLabel, studioShapeKindLabel, studioStabilizerHudLabel, studioSymmetryHudLabel } from "./studio-draw-hud";
import { drawLiveFreehandDraftToContext, getSymmetricPoints } from "./studio-draw-rendering";
import { containingPanel, elBounds } from "./studio-element-geometry";
import { elementLabel } from "./studio-element-label";
import { type FilterMaskPaintMode } from "./studio-filter-mask";
import { clampFrameIndex, frameIndexOf, MAX_ANIM_FRAMES, onionSkinLayers, type OnionSkinSettings } from "./studio-frame-animation";
import { type SharedGutterSegment } from "./studio-frame-folder";
import { type HealCloneMode } from "./studio-heal-clone";
import { computeHistoryBrushAvailability } from "./studio-history-brush";
import { type StudioHokusaiLiveOverlayProjection } from "./studio-hokusai-live-brush-overlay";
import { uid } from "./studio-id";
import { imageFilterCacheKey } from "./studio-konva-filter-fields";
import { shouldApplyLayerMask, type LayerMaskPaintMode } from "./studio-layer-mask";
import { isEffectivelyHidden, isEffectivelyLocked, type LayerGroup } from "./studio-layers";
import { type StudioLiveDynamicBrushOverlayRenderer } from "./studio-live-dynamic-brush-overlay";
import { StudioLiveInkOverlayRenderer, StudioLiveInkPredictionRenderer } from "./studio-live-ink-overlay";
import { StudioLiveStampOverlayRenderer } from "./studio-live-stamp-overlay";
import { type StudioLivingInkOverlayProjection } from "./studio-living-ink-overlay";
import { MASTER_EDIT_GHOST_OPACITY, createEmptyDocumentMaster, togglePageHideMaster, type DocumentMaster } from "./studio-master-page";
import { type NodeEditHandle, type NodeEditTool } from "./studio-node-edit";
import { vignetteCss, type PageGrade } from "./studio-page-grade";
import { StudioAnimTimelinePanel, StudioAppSettingsPanel, StudioBubbleShapeOverlay, StudioCanonicalVNextDryMediaCanvas, StudioCropOverlay, StudioDialogueBatchPanel, StudioDialogueTranslatePanel, StudioFeatureTutorialHub, StudioFrameAnimationPanel, StudioHealCloneOverlay, StudioHistoryBrushOverlay, StudioHistoryPanel, StudioLayerMaskOverlay, StudioQuickMaskOverlay, StudioLiveDynamicBrushOverlayHost, StudioLiveInkOverlayHost, StudioLiveInkPredictionHost, StudioLivePresenceDockConnected, StudioLivePressureHudPill, StudioLiveStampOverlayHost, StudioLiveWetInkOverlayHost, StudioMasterPagePanel, StudioDrawSelectionOverlay, StudioNodeEditOverlay, StudioOnionSkinImage, StudioPanelSplitOverlay, StudioPuppetWarpOverlay, StudioRasterCrdtSurface, StudioRemoteCursorOverlay, StudioSelectionAntsOverlay, StudioShortcutsHelp, StudioTextEditFallbackModal, StudioTextEditOverlay, QuickStartPanel, StudioWebGpuCanvas, preloadStudioCommentThreadPopover } from "./studio-page-lazy-ui";
import { pageDisplayName } from "./studio-page-meta";
import { isEligibleForPanelAutoFit } from "./studio-panel-autofit";
import { type PanelSplitPreview } from "./studio-panel-split";
import { type VanishingPoint } from "./studio-perspective-guide";
import { movePuppetPin, type PuppetPin } from "./studio-puppet-warp";
import { type QuickMaskBrushMode } from "./studio-quick-mask";
import { type StudioRasterHandoffCandidate } from "./studio-raster-handoff-authority";
import { STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED } from "./studio-raster-publication-feature";
import { unionBounds } from "./studio-selection";
import { type PixelSelection, type PolyLassoSession, type SelectionDragState, type SelectionFrame, type SelPoint } from "./studio-selection-tools";
import { type SmartGuideOverlay } from "./studio-smart-guides";
import { normalizeShapeParams } from "./studio-stroke-shapes";
import { studioUiDensityDescription, studioUiDensityLabel, type StudioUiDensityMode } from "./studio-ui-density";
import { materializeStudioAdvancedFillVectorTarget } from "./studio-vector-fill-reference";
import { STUDIO_VIEW_ACTION_HINTS } from "./studio-view-action-hints";
import { planStudioViewStageLayout, stepStudioViewZoom, toggleStudioCanvasWheelMode, type StudioViewRotation } from "./studio-view-controls";
import { StudioViewToolsHud } from "./studio-view-tools-hud-loader";
import { type StudioWorkAssetRenderPlaceholder } from "./studio-work-asset-render-projection";
import { StudioBrushCursor } from "./StudioBrushCursor";
import { StudioCanvasGuideOverlayLayers, StudioCanvasGuideUnderlay } from "./StudioCanvasGuideLayers";
import { StudioCanvasStatusRail } from "./StudioCanvasStatusRail";
import { colorBlindFilterStyle, StudioColorBlindFilterDefs, type CvdMode } from "./StudioColorBlindPreview";
import { StudioDraftPreviewLayers } from "./StudioDraftPreviewLayers";
import { StudioDrawNode } from "./StudioDrawNode";
import { StudioGroupUniformResizeProxy } from "./StudioGroupUniformResizeProxy";
import { StudioKonvaBubbleNode } from "./StudioKonvaBubbleNode";
import { StudioKonvaImageNode } from "./StudioKonvaImageNode";
import { StudioFocusLinesNode, StudioFramePanel, StudioSpeedLinesNode, StudioWorkAssetPlaceholderNode } from "./StudioKonvaPrimitiveNodes";
import { StudioKonvaStickerNode, StudioKonvaTextNode } from "./StudioKonvaTextNodes";
import { StudioPageSequenceStrip } from "./StudioPageSequenceStrip";
import { StudioToolHintTarget } from "./StudioToolHint";

import type { StudioAdvancedFillPreview } from "./studio-advanced-fill-preview";
import type { StudioCrdtDocument } from "./studio-crdt-document";
import type { StudioRasterOverlaySourceElement } from "./studio-crdt-raster-ui-bridge";
import type { StudioDialogueImportApplyResult, StudioDialogueImportMatchMode, StudioDialogueInterchangeDocument } from "./studio-dialogue-interchange";
import type { StudioDraftPreviewStore } from "./studio-draft-preview-store";
import type { DrawMode, DrawShapeKind, StudioMenu, Tool } from "./studio-editor-tool-model";
import type { DrawEl, El, FrameEl, ImageEl } from "./studio-element-model";
import type { StudioTutorialTryAction } from "./studio-feature-tutorials";
import type { StudioFilterPreview } from "./studio-filter-menu";
import type { StudioGroupUniformResizeBounds } from "./studio-group-uniform-resize";
import type { StudioLiveRoom } from "./studio-live-collaboration-room";
import type { PageState } from "./studio-page-state";
import type { StudioGpuBackend, StudioGpuFrameReceipt } from "./studio-webgpu-frame-contract";
import type { StudioGpuStroke } from "./studio-webgpu-stroke";
import type { StudioCanonicalVNextDryMediaCanvasAuthority } from "./StudioCanonicalVNextDryMediaCanvas";
import type { StudioCommentPinClickPayload, StudioCommentPinReanchorPayload } from "./StudioLiveCanvasOverlay";
import type { StudioLivePressureStore } from "./StudioLiveInkHosts";
import type {
  StudioWebGpuCanvasHandle,
  StudioWebGpuSurfaceFrameRequest,
} from "./StudioWebGpuCanvas";
import type Konva from "konva";

import { useMediaQuery } from "@/components/use-media-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function localizeText(
  t: (key: string) => string,
  fallback: string,
  key: string,
): string {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

function liveNodeDisplayBounds(
  node: Konva.Node | null | undefined,
  layer: Konva.Layer | null,
  fallback: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  if (!node || !layer) return fallback;
  try {
    const rect = node.getClientRect({ relativeTo: layer });
    if (
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height)
    ) {
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    }
  } catch {
    // A node can detach between React render and Konva reconciliation. Document bounds stay safe.
  }
  return fallback;
}

/** Generative-image disclosure rendered above every isolated Studio surface. */
/**
 * 생성형 AI(이미지 생성) 최초 사용 고지 다이얼로그.
 * 사용자가 처음 "생성"을 누를 때 1회 노출하고, 확인하면 곧바로 생성을 이어서 실행한다.
 * a11y: role=dialog + aria-modal, Esc 닫기, 진입 시 기본(확인) 버튼 포커스, 스크림 클릭으로 닫기.
 */
function AiAssetNotice({ onCancel, onAcknowledge }: { onCancel: () => void; onAcknowledge: () => void }) {
  const t = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKey);
    const raf = requestAnimationFrame(() => confirmRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [onCancel]);

  const notice = (
    <div
      role="presentation"
      onClick={(e) => {
        // 스크림(다이얼로그 바깥) 클릭일 때만 닫는다 — 내부 클릭은 currentTarget 이 아니라 무시.
        if (e.target === e.currentTarget) onCancel();
      }}
      // z-[90] — 전체화면 모달(StoryboardGrid/ScrollPreview/Timelapse/Background3D 등, z-[80])이
      // 전부 route-stage(레이아웃 래퍼)의 isolation:isolate 안에 있어, 시나리오 자동 생성처럼 그
      // z-80 모달이 열린 채로 안에서 이미지 생성을 시작하면 이 고지가 그 위에 떠야 한다(기존 z-70은
      // z-80 모달 뒤로 가려 확인 버튼을 누를 수 없었다). 법적으로 필수인 고지라 항상 최상단이어야
      // 하므로, 이 앱의 어떤 z-index보다도 높게 고정한다 — document.body에 포탈로 렌더(아래 참고)
      // 하므로 route-stage의 격리 자체도 벗어난다(z-index 숫자만으로는 그 격리를 못 벗어난다).
      className="fixed inset-0 z-[90] grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-notice-title"
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={16} aria-hidden />
          </span>
          <h2 id="ai-notice-title" className="text-base font-bold text-fg">
            {localizeText(t, "생성형 AI 이미지 안내", "studio.aiNotice.title")}
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-fg-2">
          {localizeText(
            t,
            "이 기능은 생성형 AI(OpenAI)로 이미지를 만들어요. 만들어진 결과물에는 AI 배지가 표시돼요.",
            "studio.aiNotice.description"
          )}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-fg-3">
          <li>{localizeText(t, "타인의 저작물·캐릭터, 실존 인물의 얼굴은 생성하지 않아요.", "studio.aiNotice.ruleCopyright")}</li>
          <li>{localizeText(t, "AI 결과물은 부정확하거나 의도와 다를 수 있어요.", "studio.aiNotice.ruleAccuracy")}</li>
          <li>{localizeText(t, "만든 이미지의 사용 책임은 본인에게 있어요.", "studio.aiNotice.ruleResponsibility")}</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
          >
            {localizeText(t, "취소", "studio.aiNotice.cancel")}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onAcknowledge}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          >
            {localizeText(t, "이해했어요, 생성하기", "studio.aiNotice.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
  // auth-modal.tsx와 동일한 이유로 document.body에 포탈 렌더 — 이 앱의 라우트 콘텐츠 래퍼
  // (route-stage)가 isolation:isolate를 걸어놔서, 그 안에서 아무리 z-index를 높여도 사이트 전역
  // 고정 헤더(z-50, route-stage 밖의 형제) 뒤로 가려진다(z-index는 같은 스태킹 컨텍스트 안에서만
  // 비교된다). 이 고지는 페이지 어디서 트리거되든 항상 최상단이어야 해서 격리 자체를 벗어난다.
  if (typeof document === "undefined") return null;
  return createPortal(notice, document.body);
}

function StudioViewInputModeControls({
  compact = false,
  wheelMode,
  zoomLocked,
  onToggleWheelMode,
  onToggleZoomLock,
}: {
  compact?: boolean;
  wheelMode: StudioAppSettings["mouse"]["wheel"];
  zoomLocked: boolean;
  onToggleWheelMode: () => void;
  onToggleZoomLock: () => void;
}) {
  const t = useT();
  const wheelScrollMode = wheelMode === "pan";
  const wheelLabel = wheelScrollMode
    ? localizeText(t, "휠: 캔버스 스크롤", "studio.canvas.wheelMode.pan")
    : wheelMode === "brush-size"
      ? localizeText(t, "휠: 브러시 크기", "studio.canvas.wheelMode.brushSize")
      : localizeText(t, "휠: 캔버스 확대·축소", "studio.canvas.wheelMode.zoom");
  const lockLabel = zoomLocked
    ? localizeText(t, "캔버스 배율 잠금 해제", "studio.canvas.zoomLock.unlock")
    : localizeText(t, "캔버스 배율 잠금", "studio.canvas.zoomLock.lock");

  return (
    <div
      role="group"
      aria-label={localizeText(t, "캔버스 보기 조작", "studio.canvas.viewInputControls")}
      className={cn(
        "inline-flex items-center gap-0.5",
        compact ? "" : "rounded-full border border-line/60 bg-card/45 p-0.5",
      )}
    >
      <button
        type="button"
        aria-pressed={wheelScrollMode}
        aria-label={wheelLabel}
        title={`${wheelLabel} · ${localizeText(t, "클릭해서 줌/스크롤 전환", "studio.canvas.wheelMode.toggleHint")}`}
        onClick={onToggleWheelMode}
        className={cn(
          "inline-flex min-h-7 items-center justify-center gap-1 rounded-full px-2 text-[0.65rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          wheelScrollMode
            ? "bg-accent-soft text-accent"
            : "text-fg-2 hover:bg-raised hover:text-fg",
          compact && "size-7 px-0",
        )}
      >
        <Mouse className="size-3.5" aria-hidden />
        {!compact ? (
          <span>{wheelScrollMode
            ? localizeText(t, "스크롤", "studio.canvas.wheelMode.panShort")
            : localizeText(t, "줌", "studio.canvas.wheelMode.zoomShort")}</span>
        ) : null}
      </button>
      <button
        type="button"
        aria-pressed={zoomLocked}
        aria-label={lockLabel}
        title={lockLabel}
        onClick={onToggleZoomLock}
        className={cn(
          "grid size-7 place-items-center rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          zoomLocked
            ? "bg-warning-soft text-warning"
            : "text-fg-2 hover:bg-raised hover:text-fg",
        )}
      >
        {zoomLocked
          ? <Lock className="size-3.5" aria-hidden />
          : <Unlock className="size-3.5" aria-hidden />}
      </button>
    </div>
  );
}

export interface StudioCanvasViewportHandlers {
  addPage: () => void;
  beginCanvasSelectionResize: (
    sourceBounds: StudioGroupUniformResizeBounds
  ) => boolean;
  cancelCanvasSelectionResize: () => void;
  commitCanvasSelectionResize: (
    targetBounds: StudioGroupUniformResizeBounds
  ) => void;
  fitCanvasToWidth: () => void;
  onWebGpuFrameInvalid: () => void;
  onWebGpuFrameRequest: (request: StudioWebGpuSurfaceFrameRequest) => void;
  onWebGpuFrameReady: (receipt: StudioGpuFrameReceipt) => void;
  onWebGpuDeviceLost: () => void;
  onWebGpuBackendChange: (backend: StudioGpuBackend) => void;
  setWebGpuCanvasHandle: (handle: StudioWebGpuCanvasHandle | null) => void;
  setHokusaiLiveOverlaySurface: (
    surface: StudioHokusaiLiveOverlaySurfaceBinding | null
  ) => void;
  setLivingInkOverlaySurface: (
    surface: StudioLivingInkOverlaySurfaceBinding | null
  ) => void;
  onHokusaiCanonicalImageReady: (
    elementId: string,
    pngHash: `sha256:${string}`,
  ) => void;
  onLivingInkCanonicalImageReady: (
    elementId: string,
    pngHash: `sha256:${string}`,
    routeKey: string,
  ) => void;
  setElementNodeRef: (elId: string, node: Konva.Node | null) => void;
  isCanvasGroupDragActive: (elementId: string) => boolean;
  selectElementFromCanvas: (
    elementId: string,
    evt?: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    forceGroupEnter?: boolean
  ) => void;
  commitTextTransformEnd: (elId: string, fontSize: number, e: Konva.KonvaEventObject<Event>, opts: { minFontSize: number; patchWidth?: boolean }) => void;
  acknowledgeAiNotice: () => void;
  alignSelected: (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "distributeH" | "distributeV") => void;
  applyAdvancedFillPreview: () => void;
  applyBuiltInBrushPreset: (preset: BrushPreset) => void;
  applyDialogueReplacePlan: (plan: DialogueReplacePlan) => void;
  importDialogueInterchange: (
    document: StudioDialogueInterchangeDocument,
    mode: StudioDialogueImportMatchMode
  ) => Promise<StudioDialogueImportApplyResult>;
  applyTranslationDraft: () => void;
  cancelAdvancedFillPreview: () => void;
  cancelAiNotice: () => void;
  captureAnimFrame: (elId: string) => Promise<void>;
  captureTimelineKeyframe: (trackId: string, frameIndex: number) => Promise<void>;
  clearAdvancedFillTapGesture: () => void;
  clearAutosave: () => void;
  clearCanvasSelection: () => void;
  commitAppSettings: (next: StudioAppSettings) => void;
  retryAppSettingsPersistence: () => void;
  commitCoalesced: (nextElements: El[], key: string) => void;
  cancelEditText: () => void;
  commitEditText: (finalValue: string) => void;
  commitPages: (nextPages: PageState[], options?: { bypassReviewLock?: boolean; }) => boolean;
  designateHistoryBrushSource: (index: number) => void;
  dismissQuickStart: () => void;
  downloadAutosaveBackup: () => void;
  duplicateSelected: () => void;
  endLiveResourceEdit: () => void;
  enterCanvasOnlyMode: () => void;
  executeGenerateTranslations: () => Promise<void>;
  groupSelectedElements: () => void;
  ungroupSelectedElements: () => void;
  toggleSelectedElementsLocked: () => void;
  reorderSelectedElements: (direction: "front" | "back") => void;
  mergeSelectedBubbles: () => void;
  handleTutorialTry: (
    action: StudioTutorialTryAction,
    trigger: HTMLButtonElement,
  ) => void;
  openBrushCatalogFromHelp: (trigger: HTMLButtonElement) => void;
  hideBrushCursor: () => void;
  hideFilterMaskCursor: () => void;
  hideHealCloneCursors: () => void;
  hideHistoryBrushCursor: () => void;
  hideLayerMaskCursor: () => void;
  hideSmudgeCursor: () => void;
  jumpToHistoryIndex: (index: number) => void;
  moveVanishingPointById: (id: string, x: number, y: number) => void;
  previewVanishingPointById: (id: string, x: number, y: number) => void;
  setPerspectiveEyeLevelY: (y: number) => void;
  previewPerspectiveEyeLevelY: (y: number) => void;
  previewIsometricOrigin: (x: number, y: number) => void;
  commitIsometricOrigin: (x: number, y: number) => void;
  previewAdvancedRuler: (id: string, patch: Partial<StudioAdvancedRuler>) => void;
  patchAdvancedRuler: (id: string, patch: Partial<StudioAdvancedRuler>) => void;
  cancelStudioDrawingAssistPreview: () => void;
  nodeInteractionBegin: (elementId: string) => boolean;
  onStageDown: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onStageDragEnd: () => void;
  onStageDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onStageMove: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onStagePointerCancel: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onStageUp: (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => void;
  onWrapDragLeave: (e: React.DragEvent) => void;
  onWrapDragOver: (e: React.DragEvent) => void;
  onWrapDrop: (e: React.DragEvent) => Promise<void>;
  onWrapMouseDown: (e: React.MouseEvent) => void;
  onWrapMouseMove: (e: React.MouseEvent) => void;
  onWrapMouseUp: () => void;
  openFeatureTutorial: (tutorialId?: string | null) => void;
  openQuickComicWizard: () => void;
  openQuickStartMenu: (nextMenu: Extract<StudioMenu, "template" | "char" | "bubble">) => void;
  patchDialogueText: (pageId: string, elId: string, text: string) => void;
  patchEl: (id: string, patch: Partial<El>) => void;
  patchElCoalesced: (id: string, patch: Partial<El>, key: string) => void;
  patchTranslateDraft: (id: string, text: string) => void;
  removeSelected: () => void;
  restoreAutosave: () => Promise<void>;
  resetView: () => void;
  rotateCanvasView: (direction: "left" | "right") => void;
  selectDialogueElement: (pageId: string, elId: string) => void;
  openStudioCommentThreadPopover: (payload: StudioCommentPinClickPayload) => void;
  reanchorStudioCommentPin: (payload: StudioCommentPinReanchorPayload) => void;
  stopStudioCommentPlacementSession: () => void;
  setMaster: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<DocumentMaster<El>>>>[0]) => void;
  setStudioUiDensity: (mode: StudioUiDensityMode) => void;
  snapBoundFunc: (pos: { x: number; y: number; }) => { x: number; y: number; };
  startEditText: (id: string) => void;
  startFromExample: () => Promise<void>;
  setActualPixelView: () => void;
  switchToDialogueLocale: (locale: string) => void;
  toggleAdvancedFill: () => void;
  toggleHorizontalCanvasView: () => void;
  updateActivePage: (patch: Partial<Omit<PageState, "id">>) => void;
  beginSharedGutterDrag: (segment: SharedGutterSegment) => void;
  previewSharedGutterDrag: (segment: SharedGutterSegment, delta: number) => void;
  commitSharedGutterDrag: (segment: SharedGutterSegment, delta: number) => void;
}

export interface StudioHokusaiLiveOverlaySurfaceBinding {
  readonly canvas: HTMLCanvasElement;
  readonly projection: StudioHokusaiLiveOverlayProjection;
  /** Any change invalidates pixels composed against the previous viewport transform. */
  readonly surfaceKey: string;
}

export interface StudioLivingInkOverlaySurfaceBinding {
  readonly canvas: HTMLCanvasElement;
  readonly projection: StudioLivingInkOverlayProjection;
  /** Any page/viewport transform change invalidates pending ImageBitmap presentation. */
  readonly surfaceKey: string;
}

export interface StudioCanvasViewportProps {
  liveDynamicBrushOverlayRenderer: StudioLiveDynamicBrushOverlayRenderer;
  liveWetInkOverlayRenderer: import("./studio-live-wet-ink-overlay").StudioLiveWetInkOverlayRenderer;
  liveInkPredictionRenderer: StudioLiveInkPredictionRenderer;
  liveStampOverlayRenderer: StudioLiveStampOverlayRenderer;
  bubbleShapeActiveHandleIndex: number | null;
  draftPreviewStore: StudioDraftPreviewStore;
  liveDrawPressureStore: StudioLivePressureStore;
  liveInkOverlayRenderer: StudioLiveInkOverlayRenderer;
  nodeEditActiveHandleIndex: number | null;
  activeCatalogBrushName: string;
  activeDialogueLocale: string;
  activePage: PageState;
  activePageIndex: number;
  activeSurfaceReviewLocked: boolean;
  activeServerAiProviderLabel: string;
  advancedFillActive: boolean;
  advancedFillArmed: boolean;
  advancedFillBusy: boolean;
  advancedFillPreview: StudioAdvancedFillPreview | null;
  advancedRulers: StudioAdvancedRulerDocument;
  aiNoticeOpen: boolean;
  animTimeline: AnimationTimelineDoc;
  appSettings: StudioAppSettings;
  appSettingsInitialTab: StudioAppSettingsTab;
  appSettingsOpen: boolean;
  appSettingsPersistenceState: "saved" | "session-only";
  authorizedWorkAssetScopeId: string | null;
  autosaveRestoreBlockedReason: "legacy-unversioned" | "work-mismatch" | "revision-mismatch" | null;
  bg: string;
  bgGrad: string[] | null;
  brush: string;
  brushCursorRef: import("react").RefObject<import("konva/lib/Group").Group | null>;
  strokeGuideRef: import("react").RefObject<import("konva/lib/shapes/Line").Line | null>;
  brushOpacity: number;
  bubbleShapeArmed: boolean;
  bubbleShapeDraft: { elId: string; points: number[]; } | null;
  bubbleShapeHandles: NodeEditHandle[];
  canvasFlipH: boolean;
  canvasRotation: StudioViewRotation;
  canvasH: number;
  canvasOnlyMode: boolean;
  canvasInteractionBlocked: boolean;
  hardCanvasInteractionBlock: boolean;
  collaborationDocumentLocked: boolean;
  collaborationDocumentUnavailable: boolean;
  commentQuickReplyActive: boolean;
  collaborationLockMessage: () => string;
  closeViewToolWithFocus: (options?: { preferCanvas?: boolean }) => void;
  colorBlindPreview: CvdMode;
  commentPinArmed: boolean;
  cropArmed: boolean;
  cropRect: CropRect | null;
  dialogueBatchOpen: boolean;
  dialogueTranslateOpen: boolean;
  drawingRef: import("react").RefObject<DrawEl | null>;
  drawingShortcutNotice: { id: number; message: string; } | null;
  drawMode: DrawMode;
  drawShape: DrawShapeKind;
  editing: { id: string; } | null;
  eyedropperActive: boolean;
  effScale: number;
  elementById: Map<string, El>;
  elements: El[];
  studioFilterPageComposite: (ImageEl & El) | null;
  studioFilterPreview: StudioFilterPreview | null;
  followingStudioSessionId: string | null;
  frameAnimEl: ImageEl | null;
  frameAnimOpen: boolean;
  frameAnimTargetId: string | null;
  gpuCanvasShadowVisibleRef: import("react").RefObject<boolean>;
  gpuLiveInkPinnedRef: import("react").RefObject<boolean>;
  livingInkOverlayVisibleRef: import("react").RefObject<boolean>;
  gridSize: number;
  groups: LayerGroup[];
  guides: { x: number[]; y: number[]; };
  hasAutosave: boolean;
  healCloneArmed: boolean;
  healCloneCursorRef: import("react").RefObject<import("konva/lib/shapes/Circle").Circle | null>;
  healCloneDragPreview: { points: SelPoint[]; } | null;
  healCloneRadius: number;
  healCloneSourceAnchor: SelPoint | null;
  healCloneSourceCursorRef: import("react").RefObject<import("konva/lib/shapes/Circle").Circle | null>;
  healCloneTool: HealCloneMode | null;
  historyBrushArmed: boolean;
  historyBrushCursorRef: import("react").RefObject<import("konva/lib/shapes/Circle").Circle | null>;
  historyBrushDragPreview: { points: SelPoint[]; } | null;
  historyBrushRadius: number;
  historyBrushSourceIndex: number | null;
  historyPanelOpen: boolean;
  isExporting: boolean;
  isMobile: boolean;
  isometricAngleDeg: number;
  isometricCellSize: number;
  isometricGridActive: boolean;
  isometricOriginX: number;
  isometricOriginY: number;
  isPanning: boolean;
  isSpacePressed: boolean;
  filterMaskCursorRef: import("react").RefObject<import("konva/lib/shapes/Circle").Circle | null>;
  filterMaskDragPreview: { points: SelPoint[]; } | null;
  filterMaskPaintArmed: boolean;
  filterMaskPaintMode: FilterMaskPaintMode;
  filterMaskRadius: number;
  layerMaskCursorRef: import("react").RefObject<import("konva/lib/shapes/Circle").Circle | null>;
  layerMaskDragPreview: { points: SelPoint[]; } | null;
  layerMaskPaintArmed: boolean;
  layerMaskPaintMode: LayerMaskPaintMode;
  layerMaskRadius: number;
  quickMaskArmed: boolean;
  quickMaskBrushMode: QuickMaskBrushMode;
  quickMaskDragPreview: { points: SelPoint[]; } | null;
  quickMaskRadius: number;
  quickMaskTintCanvas: HTMLCanvasElement | null;
  quickMaskTintColor: string;
  quickMaskTintOpacity: number;
  /** "나만 숨기기" — 문서(CRDT)에 없는, 이 클라이언트에서만 켠 로컬 숨김 대상. */
  localHiddenElementIds: ReadonlySet<string>;
  liveDraftDirectRef: import("react").RefObject<boolean>;
  draftPreviewDynamicLayerRef: import("react").RefObject<import("konva/lib/Layer").Layer | null>;
  draftPreviewNormalLayerRef: import("react").RefObject<import("konva/lib/Layer").Layer | null>;
  liveDraftLayerRef: import("react").RefObject<import("konva/lib/Layer").Layer | null>;
  liveDraftVisualRef: import("react").RefObject<DrawEl | null>;
  liveInkOverlayRendererRef: import("react").RefObject<StudioLiveInkOverlayRenderer>;
  mainLayerRef: import("react").RefObject<import("konva/lib/Layer").Layer | null>;
  marqueeIds: string[];
  /** 그룹 진입(더블클릭) 편집 중인 그룹 id — 경계 오버레이 표시용. */
  activeGroupId: string | null;
  marqueeRectNodeRef: import("react").RefObject<import("konva/lib/shapes/Rect").Rect | null>;
  master: DocumentMaster<El>;
  masterEditMode: boolean;
  masterPanelOpen: boolean;
  masterRenderEls: El[];
  mobileImmersive: boolean;
  mobileKeyboardInset: number;
  navigate: import("react-router-dom").NavigateFunction;
  nodeEditArmed: boolean;
  nodeEditDraft: { elId: string; points: number[]; pressures: number[]; } | null;
  nodeEditHandles: NodeEditHandle[];
  nodeEditTool: NodeEditTool | null;
  nodeRefsRef: import("react").RefObject<Record<string, Konva.Node | null>>;
  onionSkin: OnionSkinSettings;
  pageGrade: PageGrade;
  pageGradeCss: string;
  pages: PageState[];
  pageSequenceOpen: boolean;
  pagesHi: number;
  pagesHistory: PageState[][];
  panelGutter: number;
  panelSplitArmed: boolean;
  panelSplitPreview: PanelSplitPreview | null;
  perspectiveRulerActive: boolean;
  pixelDragPreview: SelectionDragState | null;
  pixelOverlayFrame: SelectionFrame | null;
  pixelOverlaySel: PixelSelection | null;
  pixelToolArmed: boolean;
  polyLassoHover: SelPoint | null;
  polyLassoSession: PolyLassoSession | null;
  pressureCurve: number;
  puppetWarpArmed: boolean;
  puppetWarpBusy: boolean;
  puppetWarpPins: PuppetPin[];
  quickShapeActive: boolean;
  remixId: string | null;
  saving: boolean;
  scale: number;
  selected: El | null;
  selectedId: string | null;
  setAppSettingsInitialTab: import("react").Dispatch<import("react").SetStateAction<StudioAppSettingsTab>>;
  setAppSettingsOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setBg3dOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setCanvasOnlyMode: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setContextMenu: import("react").Dispatch<import("react").SetStateAction<{ visible: boolean; x: number; y: number; elId: string | null; }>>;
  setCurrentPageId: (value: import("react").SetStateAction<string>) => boolean;
  setDialogueBatchOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setDialogueTranslateOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setDrawMode: import("react").Dispatch<import("react").SetStateAction<DrawMode>>;
  setError: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setEyedropperActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setFollowingStudioSessionId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setFrameAnimOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setFrameAnimTargetId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setHistoryPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setLeftPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setMarqueeIds: import("react").Dispatch<import("react").SetStateAction<string[]>>;
  setMasterEditMode: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setMasterPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setOnionSkin: import("react").Dispatch<import("react").SetStateAction<OnionSkinSettings>>;
  setPageSequenceOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPoserVrmOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPuppetWarpPins: import("react").Dispatch<import("react").SetStateAction<PuppetPin[]>>;
  setQuickShapeActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setQuickStartOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setSelectedId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setSharedDocumentNotice: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setShortcutsOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setStudioRasterHandoffCandidate: import("react").Dispatch<import("react").SetStateAction<StudioRasterHandoffCandidate | null>>;
  setSymmetryCenterX: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryCenterY: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTeamPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTimelineFocusedTrackId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setTimelineOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTimelinePlayhead: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTimelinePlaying: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTool: import("react").Dispatch<import("react").SetStateAction<Tool>>;
  setTranslateDraft: import("react").Dispatch<import("react").SetStateAction<Map<string, string> | null>>;
  setTranslateGlossary: import("react").Dispatch<import("react").SetStateAction<string>>;
  setTranslateTargetLocale: import("react").Dispatch<import("react").SetStateAction<string>>;
  setTutorialHubOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setUserGuides: import("react").Dispatch<import("react").SetStateAction<{ id: string; type: "v" | "h"; pos: number; }[]>>;
  setZoom: import("react").Dispatch<import("react").SetStateAction<number>>;
  shapeFill: boolean;
  shortcutsOpen: boolean;
  showGrid: boolean;
  showQuickStart: boolean;
  showWebtoonGuides: boolean;
  smartGuides: SmartGuideOverlay;
  /** Axis-aligned abutting frame gutters (CSP co-edit handles). */
  sharedGutters: readonly SharedGutterSegment[];
  smudgeArmed: boolean;
  dodgeBurnArmed: boolean;
  dodgeBurnRadius: number;
  wetMixArmed: boolean;
  wetMixRadius: number;
  liquifyArmed: boolean;
  liquifyRadius: number;
  smudgeCursorRef: import("react").RefObject<import("konva/lib/shapes/Circle").Circle | null>;
  smudgeRadius: number;
  sourceHydrationPending: boolean;
  stabilizer: number;
  stabilizerMode: "standard" | "adaptive" | "precision";
  stageRef: import("react").RefObject<import("konva/lib/Stage").Stage | null>;
  strokeWidth: number;
  tipAngle: number;
  tipRoundness: number;
  studioCanvasCommentPins: import("./studio-live-canvas-overlay-model").StudioCanvasCommentPin[];
  studioCommentPinReanchorableThreadIds: ReadonlySet<string>;
  studioCommentPinReanchorDisabledReason?: string;
  studioCrdtDocument: StudioCrdtDocument | null;
  studioCrdtOperationSyncReady: boolean;
  studioLiveRoomRef: import("react").RefObject<StudioLiveRoom | null>;
  studioRasterAuthorizedAuthorityKey: string | null;
  studioRasterHandoffBaseKey: string;
  studioRasterHandoffBlocked: boolean;
  studioRasterHandoffGates: { readonly exportActive: boolean; readonly masterEditActive: boolean; readonly editActive: boolean; readonly specialDraftActive: boolean; readonly postProcessingActive: boolean; };
  studioRasterHiddenOperationIds: ReadonlySet<string>;
  studioRasterOverlayElements: readonly StudioRasterOverlaySourceElement[];
  studioRasterVisibleDocumentRect: import("./studio-raster-visible-rect").StudioRasterVisibleDocumentRect | null;
  studioWorkAssetRenderPlaceholders: StudioWorkAssetRenderPlaceholder[];
  studioWorkAssetRenderProjection: import("./studio-work-asset-render-projection").StudioWorkAssetRenderProjection<El>;
  symmetryCenterX: number;
  symmetryCenterY: number;
  symmetryRadialCount: number;
  symmetryType: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope";
  textAiConfigured: boolean;
  timelapseCapturing: boolean;
  timelineFocusedTrackId: string | null;
  timelineOpen: boolean;
  timelinePlayhead: number;
  timelinePlaying: boolean;
  timelinePreviewFrame: number;
  title: string;
  tool: Tool;
  viewTool: "zoom" | "rotate" | null;
  viewTransformSuppressed: boolean;
  translateBusy: boolean;
  translateDraft: Map<string, string> | null;
  translateError: string | null;
  translateGlossary: string;
  translateProgress: { done: number; total: number; } | null;
  translateTargetLocale: string;
  trRef: import("react").RefObject<import("konva/lib/shapes/Transformer").Transformer | null>;
  tutorialHubOpen: boolean;
  tutorialInitialId: string | null;
  uiDensityMode: "simple" | "full" | "focus";
  userGuides: { id: string; type: "v" | "h"; pos: number; }[];
  vanishingPoints: VanishingPoint[];
  perspectiveEyeLevelY: number | null;
  perspectiveLockHorizon: boolean;
  webGpuPreviewAuthorized: boolean;
  webGpuPreviewStrokes: readonly StudioGpuStroke[];
  webGpuViewportSurface: import("./studio-webgpu-viewport").StudioWebGpuViewportSurfacePlan | null;
  transientPenInkSurfaceEnabled: boolean;
  webtoonGuides: typeof import("./studio-webtoon-guides") | null;
  webtoonTheme: "classic" | "soft" | "vivid";
  workHydrationFailed: boolean;
  workHydrationUnsupportedFormat: boolean;
  workId: string | null;
  wrapRef: import("react").RefObject<HTMLDivElement | null>;
  zoom: number;
  zoomLocked: boolean;
  setZoomLocked: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  zoomHostRef: import("react").RefObject<HTMLDivElement | null>;
  stableHandlers: StudioCanvasViewportHandlers;
  setRightPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
}

export const StudioCanvasViewport = memo(function StudioCanvasViewport({
  liveDynamicBrushOverlayRenderer,
  liveWetInkOverlayRenderer,
  liveInkPredictionRenderer,
  liveStampOverlayRenderer,
  bubbleShapeActiveHandleIndex,
  draftPreviewStore,
  liveDrawPressureStore,
  liveInkOverlayRenderer,
  nodeEditActiveHandleIndex,
  activeCatalogBrushName,
  activeDialogueLocale,
  activePage,
  activePageIndex,
  activeSurfaceReviewLocked,
  activeServerAiProviderLabel,
  advancedFillActive,
  advancedFillArmed,
  advancedFillBusy,
  advancedFillPreview,
  advancedRulers,
  aiNoticeOpen,
  animTimeline,
  appSettings,
  appSettingsInitialTab,
  appSettingsOpen,
  appSettingsPersistenceState,
  authorizedWorkAssetScopeId,
  autosaveRestoreBlockedReason,
  bg,
  bgGrad,
  brush,
  brushCursorRef,
  strokeGuideRef,
  brushOpacity,
  bubbleShapeArmed,
  bubbleShapeDraft,
  bubbleShapeHandles,
  canvasFlipH,
  canvasRotation,
  canvasH,
  canvasOnlyMode,
  canvasInteractionBlocked,
  hardCanvasInteractionBlock,
  collaborationDocumentLocked,
  collaborationDocumentUnavailable,
  collaborationLockMessage,
  closeViewToolWithFocus,
  colorBlindPreview,
  commentPinArmed,
  commentQuickReplyActive,
  cropArmed,
  cropRect,
  dialogueBatchOpen,
  dialogueTranslateOpen,
  drawingRef,
  drawingShortcutNotice,
  drawMode,
  drawShape,
  editing,
  eyedropperActive,
  effScale,
  elementById,
  elements,
  studioFilterPageComposite,
  studioFilterPreview,
  followingStudioSessionId,
  frameAnimEl,
  frameAnimOpen,
  frameAnimTargetId,
  gpuCanvasShadowVisibleRef,
  gpuLiveInkPinnedRef,
  livingInkOverlayVisibleRef,
  gridSize,
  groups,
  guides,
  hasAutosave,
  healCloneArmed,
  healCloneCursorRef,
  healCloneDragPreview,
  healCloneRadius,
  healCloneSourceAnchor,
  healCloneSourceCursorRef,
  healCloneTool,
  historyBrushArmed,
  historyBrushCursorRef,
  historyBrushDragPreview,
  historyBrushRadius,
  historyBrushSourceIndex,
  historyPanelOpen,
  isExporting,
  isMobile,
  isometricAngleDeg,
  isometricCellSize,
  isometricGridActive,
  isometricOriginX,
  isometricOriginY,
  isPanning,
  isSpacePressed,
  filterMaskCursorRef,
  filterMaskDragPreview,
  filterMaskPaintArmed,
  filterMaskPaintMode,
  filterMaskRadius,
  layerMaskCursorRef,
  layerMaskDragPreview,
  layerMaskPaintArmed,
  quickMaskArmed,
  quickMaskBrushMode,
  quickMaskDragPreview,
  quickMaskRadius,
  quickMaskTintCanvas,
  quickMaskTintColor,
  quickMaskTintOpacity,
  layerMaskPaintMode,
  layerMaskRadius,
  localHiddenElementIds,
  liveDraftDirectRef,
  draftPreviewDynamicLayerRef,
  draftPreviewNormalLayerRef,
  liveDraftLayerRef,
  liveDraftVisualRef,
  liveInkOverlayRendererRef,
  mainLayerRef,
  marqueeIds,
  activeGroupId,
  marqueeRectNodeRef,
  master,
  masterEditMode,
  masterPanelOpen,
  masterRenderEls,
  mobileImmersive,
  mobileKeyboardInset,
  navigate,
  nodeEditArmed,
  nodeEditDraft,
  nodeEditHandles,
  nodeEditTool,
  nodeRefsRef,
  onionSkin,
  pageGrade,
  pageGradeCss,
  pages,
  pageSequenceOpen,
  pagesHi,
  pagesHistory,
  panelGutter,
  panelSplitArmed,
  panelSplitPreview,
  perspectiveRulerActive,
  pixelDragPreview,
  pixelOverlayFrame,
  pixelOverlaySel,
  pixelToolArmed,
  polyLassoHover,
  polyLassoSession,
  pressureCurve,
  puppetWarpArmed,
  puppetWarpBusy,
  puppetWarpPins,
  quickShapeActive,
  remixId,
  saving,
  scale,
  selected,
  selectedId,
  setAppSettingsInitialTab,
  setAppSettingsOpen,
  setBg3dOpen,
  setCanvasOnlyMode,
  setContextMenu,
  setCurrentPageId,
  setDialogueBatchOpen,
  setDialogueTranslateOpen,
  setDrawMode,
  setError,
  setEyedropperActive,
  setFollowingStudioSessionId,
  setFrameAnimOpen,
  setFrameAnimTargetId,
  setHistoryPanelOpen,
  setLeftPanelOpen,
  setMarqueeIds,
  setMasterEditMode,
  setMasterPanelOpen,
  setOnionSkin,
  setPageSequenceOpen,
  setPoserVrmOpen,
  setPuppetWarpPins,
  setQuickShapeActive,
  setQuickStartOpen,
  setSelectedId,
  setSharedDocumentNotice,
  setShortcutsOpen,
  setStudioRasterHandoffCandidate,
  setSymmetryCenterX,
  setSymmetryCenterY,
  setTeamPanelOpen,
  setTimelineFocusedTrackId,
  setTimelineOpen,
  setTimelinePlayhead,
  setTimelinePlaying,
  setTool,
  setTranslateDraft,
  setTranslateGlossary,
  setTranslateTargetLocale,
  setTutorialHubOpen,
  setUserGuides,
  setZoom,
  shapeFill,
  shortcutsOpen,
  showGrid,
  showQuickStart,
  showWebtoonGuides,
  smartGuides,
  sharedGutters,
  smudgeArmed,
  dodgeBurnArmed,
  dodgeBurnRadius,
  wetMixArmed,
  wetMixRadius,
  liquifyArmed,
  liquifyRadius,
  smudgeCursorRef,
  smudgeRadius,
  sourceHydrationPending,
  stabilizer,
  stabilizerMode,
  stageRef,
  strokeWidth,
  tipAngle,
  tipRoundness,
  studioCanvasCommentPins,
  studioCommentPinReanchorableThreadIds,
  studioCommentPinReanchorDisabledReason,
  studioCrdtDocument,
  studioCrdtOperationSyncReady,
  studioLiveRoomRef,
  studioRasterAuthorizedAuthorityKey,
  studioRasterHandoffBaseKey,
  studioRasterHandoffBlocked,
  studioRasterHandoffGates,
  studioRasterHiddenOperationIds,
  studioRasterOverlayElements,
  studioRasterVisibleDocumentRect,
  studioWorkAssetRenderPlaceholders,
  studioWorkAssetRenderProjection,
  symmetryCenterX,
  symmetryCenterY,
  symmetryRadialCount,
  symmetryType,
  textAiConfigured,
  timelapseCapturing,
  timelineFocusedTrackId,
  timelineOpen,
  timelinePlayhead,
  timelinePlaying,
  timelinePreviewFrame,
  title,
  tool,
  viewTool,
  viewTransformSuppressed,
  translateBusy,
  translateDraft,
  translateError,
  translateGlossary,
  translateProgress,
  translateTargetLocale,
  trRef,
  tutorialHubOpen,
  tutorialInitialId,
  uiDensityMode,
  userGuides,
  vanishingPoints,
  perspectiveEyeLevelY,
  perspectiveLockHorizon,
  webGpuPreviewAuthorized,
  webGpuPreviewStrokes,
  webGpuViewportSurface,
  transientPenInkSurfaceEnabled,
  webtoonGuides,
  webtoonTheme,
  workHydrationFailed,
  workHydrationUnsupportedFormat,
  workId,
  wrapRef,
  zoom,
  zoomLocked,
  setZoomLocked,
  zoomHostRef,
  stableHandlers,
  setRightPanelOpen: _setRightPanelOpen,

}: StudioCanvasViewportProps) {
  const {
    addPage,
    beginCanvasSelectionResize,
    cancelCanvasSelectionResize,
    commitCanvasSelectionResize,
    acknowledgeAiNotice,
    alignSelected,
    applyAdvancedFillPreview,
    applyBuiltInBrushPreset,
    applyDialogueReplacePlan,
    importDialogueInterchange,
    applyTranslationDraft,
    cancelAdvancedFillPreview,
    cancelAiNotice,
    cancelEditText,
    captureAnimFrame,
    captureTimelineKeyframe,
    clearAdvancedFillTapGesture,
    clearAutosave,
    clearCanvasSelection,
    commitAppSettings,
    retryAppSettingsPersistence,
    commitCoalesced,
    commitEditText,
    commitPages,
    dismissQuickStart,
    downloadAutosaveBackup,
    duplicateSelected,
    enterCanvasOnlyMode,
    fitCanvasToWidth,
    executeGenerateTranslations,
    groupSelectedElements,
    ungroupSelectedElements,
    toggleSelectedElementsLocked,
    reorderSelectedElements,
    mergeSelectedBubbles,
    handleTutorialTry,
    openBrushCatalogFromHelp,
    hideBrushCursor,
    hideFilterMaskCursor,
    hideHealCloneCursors,
    hideHistoryBrushCursor,
    hideLayerMaskCursor,
    hideSmudgeCursor,
    jumpToHistoryIndex,
    moveVanishingPointById,
    previewVanishingPointById,
    setPerspectiveEyeLevelY,
    previewPerspectiveEyeLevelY,
    previewIsometricOrigin,
    commitIsometricOrigin,
    previewAdvancedRuler,
    patchAdvancedRuler,
    cancelStudioDrawingAssistPreview,
    onStageDown,
    onStageDragEnd,
    onStageDragMove,
    onStageMove,
    onStagePointerCancel,
    onStageUp,
    onWrapDragLeave,
    onWrapDragOver,
    onWrapDrop,
    onWrapMouseDown,
    onWrapMouseMove,
    onWrapMouseUp,
    openFeatureTutorial,
    openQuickComicWizard,
    openQuickStartMenu,
    patchDialogueText,
    patchElCoalesced,
    patchTranslateDraft,
    removeSelected,
    restoreAutosave,
    resetView,
    rotateCanvasView,
    selectDialogueElement,
    openStudioCommentThreadPopover,
    reanchorStudioCommentPin,
    stopStudioCommentPlacementSession,
    setMaster,
    setStudioUiDensity,
    setActualPixelView,
    startFromExample,
    switchToDialogueLocale,
    toggleAdvancedFill,
    toggleHorizontalCanvasView,
    updateActivePage,
    beginSharedGutterDrag,
    previewSharedGutterDrag,
    commitSharedGutterDrag,
    endLiveResourceEdit,
    nodeInteractionBegin,
    patchEl,
    startEditText,
    snapBoundFunc,
    designateHistoryBrushSource,
    commitTextTransformEnd,
    setElementNodeRef,
    isCanvasGroupDragActive,
    selectElementFromCanvas,
    setWebGpuCanvasHandle,
    setHokusaiLiveOverlaySurface,
    setLivingInkOverlaySurface,
    onHokusaiCanonicalImageReady,
    onLivingInkCanonicalImageReady,
    onWebGpuBackendChange,
    onWebGpuDeviceLost,
    onWebGpuFrameInvalid,
    onWebGpuFrameRequest,
    onWebGpuFrameReady,
  } = stableHandlers;
  const [
    canonicalDryMediaCanvasAuthority,
    setCanonicalDryMediaCanvasAuthority,
  ] = useState<StudioCanonicalVNextDryMediaCanvasAuthority | null>(null);
  const hokusaiLiveCanvasRef = useRef<HTMLCanvasElement>(null);
  const livingInkCanvasRef = useRef<HTMLCanvasElement>(null);
  const hokusaiSurfaceLeft = webGpuViewportSurface?.surface.left;
  const hokusaiSurfaceTop = webGpuViewportSurface?.surface.top;
  const hokusaiSurfaceWidth = webGpuViewportSurface?.surface.width;
  const hokusaiSurfaceHeight = webGpuViewportSurface?.surface.height;

  useLayoutEffect(() => {
    const canvas = hokusaiLiveCanvasRef.current;
    // v1 is axis-aligned. A mirrored or quarter-turn view keeps the exact retained DrawEl route;
    // presenting unmirrored material pixels would be worse than a visible capability fallback.
    if (
      !canvas
      || hokusaiSurfaceLeft === undefined
      || hokusaiSurfaceTop === undefined
      || hokusaiSurfaceWidth === undefined
      || hokusaiSurfaceHeight === undefined
      || canvasFlipH
      || canvasRotation !== 0
      || !(effScale > 0)
    ) {
      setHokusaiLiveOverlaySurface(null);
      return undefined;
    }
    const dpr = Math.max(1, Math.min(4, globalThis.devicePixelRatio || 1));
    const backingWidth = Math.max(1, Math.ceil(hokusaiSurfaceWidth * dpr));
    const backingHeight = Math.max(1, Math.ceil(hokusaiSurfaceHeight * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    const surfaceKey = [
      activePage.id,
      hokusaiSurfaceLeft,
      hokusaiSurfaceTop,
      hokusaiSurfaceWidth,
      hokusaiSurfaceHeight,
      effScale,
      dpr,
    ].join(":");
    setHokusaiLiveOverlaySurface({
      canvas,
      surfaceKey,
      projection: {
        documentX: hokusaiSurfaceLeft / effScale,
        documentY: hokusaiSurfaceTop / effScale,
        scaleX: effScale,
        scaleY: effScale,
        devicePixelRatio: dpr,
      },
    });
    // A parent render can update this effect while canvas geometry is unchanged. Publishing a
    // transient null from dependency cleanup would cancel an admitted Hokusai route before the
    // exact same binding is registered again. The guarded branch above clears genuinely missing
    // surfaces, and StudioPage owns final provider/renderer disposal when the editor unmounts.
    return undefined;
  }, [
    activePage.id,
    canvasFlipH,
    canvasRotation,
    effScale,
    hokusaiSurfaceHeight,
    hokusaiSurfaceLeft,
    hokusaiSurfaceTop,
    hokusaiSurfaceWidth,
    setHokusaiLiveOverlaySurface,
  ]);

  useLayoutEffect(() => {
    const canvas = livingInkCanvasRef.current;
    if (
      !canvas
      || hokusaiSurfaceLeft === undefined
      || hokusaiSurfaceTop === undefined
      || hokusaiSurfaceWidth === undefined
      || hokusaiSurfaceHeight === undefined
      || canvasFlipH
      || canvasRotation !== 0
      || !(effScale > 0)
    ) {
      setLivingInkOverlaySurface(null);
      return undefined;
    }
    const dpr = Math.max(1, Math.min(4, globalThis.devicePixelRatio || 1));
    const backingWidth = Math.max(1, Math.ceil(hokusaiSurfaceWidth * dpr));
    const backingHeight = Math.max(1, Math.ceil(hokusaiSurfaceHeight * dpr));
    if (canvas.width !== backingWidth) canvas.width = backingWidth;
    if (canvas.height !== backingHeight) canvas.height = backingHeight;
    // Living Ink frames are full-field composites. The overlay's visible clip width/height can
    // resize when contextual editor chrome opens or closes without changing document projection;
    // canvas resizing clears old pixels, then the next full frame safely repopulates the clip.
    // Keep only physical-field/projection identity in the route key so that UI reflow cannot
    // cancel an otherwise valid pointer contact. Hokusai above stays stricter because it receives
    // incremental dirty patches whose accumulated canvas is invalidated by a backing resize.
    const surfaceKey = [
      "living-ink",
      activePage.id,
      hokusaiSurfaceLeft,
      hokusaiSurfaceTop,
      effScale,
      dpr,
      CANVAS_W,
      canvasH,
    ].join(":");
    setLivingInkOverlaySurface({
      canvas,
      surfaceKey,
      projection: {
        documentX: hokusaiSurfaceLeft / effScale,
        documentY: hokusaiSurfaceTop / effScale,
        scaleX: effScale,
        scaleY: effScale,
        devicePixelRatio: dpr,
        documentWidth: CANVAS_W,
        documentHeight: canvasH,
      },
    });
    // Dependency updates can be caused by an ordinary parent render (for example clearing the
    // selected canonical image when a Water stroke begins). Do not publish a transient null
    // surface from effect cleanup: the next layout effect often registers the exact same canvas
    // and key, but that momentary teardown would fail-close the already admitted pointer route.
    // A genuinely unavailable surface is cleared by the guarded branch above, while editor
    // unmount disposes the coordinator and renderer at the owning StudioPage boundary.
    return undefined;
  }, [
    activePage.id,
    canvasFlipH,
    canvasH,
    canvasRotation,
    effScale,
    hokusaiSurfaceHeight,
    hokusaiSurfaceLeft,
    hokusaiSurfaceTop,
    hokusaiSurfaceWidth,
    setLivingInkOverlaySurface,
  ]);

  function splitDialogueText(pageId: string, elementId: string, text: string, offset: number) {
    const newElementId = uid();
    const next = splitDialogueElement(pages, {
      pageId,
      elementId,
      text,
      offset,
      newElementId,
    });
    if (next === pages || !commitPages(next as PageState[])) return;
    setCurrentPageId(pageId);
    setSelectedId(newElementId);
  }

  function mergeDialogueTextWithNext(pageId: string, elementId: string, text: string) {
    const next = mergeDialogueWithNext(pages, pageId, elementId, text);
    if (next === pages || !commitPages(next as PageState[])) return;
    setCurrentPageId(pageId);
    setSelectedId(elementId);
  }

  function transferDialogueText(
    sourcePageId: string,
    elementId: string,
    targetPageId: string,
    mode: "move" | "copy",
    text: string
  ) {
    const nextElementId = mode === "copy" ? uid() : elementId;
    const next = transferDialogueElement(pages, {
      sourcePageId,
      targetPageId,
      elementId,
      mode,
      newElementId: mode === "copy" ? nextElementId : undefined,
      text,
    });
    if (next === pages || !commitPages(next as PageState[])) return;
    setCurrentPageId(targetPageId);
    setSelectedId(nextElementId);
  }

  function convertDialogueTextToBubble(pageId: string, elementId: string) {
    const next = convertTextElementsToBubbles(pages, {
      elementIds: [elementId],
      variant: "speech",
    });
    if (next === pages || !commitPages(next as PageState[])) return;
    setCurrentPageId(pageId);
    setSelectedId(elementId);
  }

  /** One undo step for many free-text → bubble conversions (story panel bulk action). */
  function convertDialogueTextsToBubbles(requests: readonly { pageId: string; elementId: string }[]) {
    if (requests.length === 0) return;
    const elementIds = requests.map((request) => request.elementId);
    const next = convertTextElementsToBubbles(pages, {
      elementIds,
      variant: "speech",
    });
    if (next === pages || !commitPages(next as PageState[])) return;
    const last = requests[requests.length - 1];
    if (last) {
      setCurrentPageId(last.pageId);
      setSelectedId(last.elementId);
    }
  }

  function applyDialogueMultiFormat(
    elementIds: readonly string[],
    patch: {
      fontSize?: number;
      fontStyle?: "normal" | "bold" | "italic" | "bold italic";
      textColor?: string;
      align?: "left" | "center" | "right";
    }
  ) {
    const targets =
      elementIds.length > 0
        ? elementIds
        : marqueeIds.length > 0
          ? marqueeIds
          : selectedId
            ? [selectedId]
            : [];
    const next = applyDialogueFormatPatch(pages, { elementIds: targets, patch });
    if (next === pages || !commitPages(next as PageState[])) return;
  }

  function applyDialogueRuby(
    pageId: string,
    elId: string,
    text: string,
    start: number,
    end: number,
    ruby: string
  ) {
    const next = applyDialogueRubySpan(pages, {
      pageId,
      elementId: elId,
      text,
      start,
      end,
      ruby,
    });
    if (next === pages || !commitPages(next as PageState[])) return;
    setCurrentPageId(pageId);
    setSelectedId(elId);
  }

  function clearDialogueRuby(
    pageId: string,
    elId: string,
    text: string,
    start: number,
    end: number
  ) {
    const next = clearDialogueRubyRange(pages, {
      pageId,
      elementId: elId,
      text,
      start,
      end,
    });
    if (next === pages || !commitPages(next as PageState[])) return;
    setCurrentPageId(pageId);
    setSelectedId(elId);
  }
  // 텍스트 인라인 편집 — canvasFlipH(좌우 반전 미리보기)나 세로쓰기 요소는 캔버스 실시간 오버레이가
  // 안전하게 다룰 수 없어(StudioTextEditOverlay 상단 주석 참고) 예전 중앙 모달로 폴백한다.
  const editingTarget = editing ? elementById.get(editing.id) : null;
  const editingVertical = !!editingTarget &&
    (editingTarget.type === "text" || editingTarget.type === "bubble") && !!editingTarget.vertical;
  const editingFallbackToModal = !!editingTarget && (
    canvasFlipH || canvasRotation !== 0 || editingVertical
  );
  // 보기 변환은 문서 데이터가 아니다. 저장·내보내기·타임랩스 캡처 프레임에서는
  // Stage를 정규 좌표계로 되돌려 회전/반전이 결과 픽셀에 굽히지 않게 한다.
  const suppressViewTransform = isExporting || saving || timelapseCapturing;
  const stageViewLayout = planStudioViewStageLayout({
    documentWidth: CANVAS_W,
    documentHeight: canvasH,
    scale: effScale,
    canvasFlipH: suppressViewTransform ? false : canvasFlipH,
    canvasRotation: suppressViewTransform ? 0 : canvasRotation,
  });
  const editingUseOverlay = !!editingTarget && !editingFallbackToModal;
  const canvasCursorInput = {
    tool,
    drawMode,
    isSpacePressed,
    isPanning,
    interactionBlocked: canvasInteractionBlocked,
    commentPinArmed,
    eyedropperActive,
    advancedFillArmed,
    cropArmed,
    pixelToolArmed,
    panelSplitArmed,
    nodeEditArmed,
    bubbleShapeArmed,
    puppetWarpArmed,
    perspectiveRulerActive,
    precisionBrushArmed:
      smudgeArmed
      || dodgeBurnArmed
      || wetMixArmed
      || liquifyArmed
      || healCloneArmed
      || historyBrushArmed
      || layerMaskPaintArmed
      || filterMaskPaintArmed
      || quickMaskArmed,
  } as const;
  const viewportCursorClassName = studioCanvasViewportCursorClassName(canvasCursorInput);
  const canvasCursorClassName = studioCanvasCursorClassName(canvasCursorInput);
  const brushCursorStyle = appSettings.general.brushCursorStyle;
  const t = useT();
  const hasCoarsePointer = useMediaQuery("(pointer: coarse)");
  /*
   * First product-visible canonical-vNext slice.
   *
   * The separate WebGPU canvas is intentionally authorized only for one selected, top-most,
   * unclipped dry-media DrawEl. Keeping this gate narrower than the product compiler prevents a
   * presentation-only surface from changing layer, clipping, mask, preview or rotation semantics.
   * DrawEl/CRDT stays authoritative; until the child returns an exact completed parity receipt the
   * ordinary Konva node below remains visible.
   */
  const canonicalDryMediaAuthoredElements = masterEditMode
    ? elements
    : studioWorkAssetRenderProjection.elements;
  const canonicalDryMediaVisibleElements =
    canonicalDryMediaAuthoredElements.filter(
      (element) =>
        !isEffectivelyHidden(element, groups)
        && !localHiddenElementIds.has(element.id),
    );
  const canonicalDryMediaTopElement =
    canonicalDryMediaVisibleElements[
      canonicalDryMediaVisibleElements.length - 1
    ] ?? null;
  const canonicalDryMediaSelectedElement =
    canonicalDryMediaTopElement?.id === selectedId
      && canonicalDryMediaTopElement.type === "draw"
      ? canonicalDryMediaTopElement
      : null;
  const canonicalDryMediaPanelClip =
    canonicalDryMediaSelectedElement
      && !canonicalDryMediaSelectedElement.noClip
      ? containingPanel(
          canonicalDryMediaSelectedElement,
          canonicalDryMediaAuthoredElements,
        )
      : null;
  const canonicalDryMediaCandidate =
    webGpuViewportSurface
    && tool === "select"
    && marqueeIds.length === 0
    && !masterEditMode
    && !isExporting
    && !saving
    && !timelapseCapturing
    && !sourceHydrationPending
    && !collaborationDocumentUnavailable
    && canvasRotation === 0
    && !timelinePlaying
    && studioFilterPreview === null
    && studioFilterPageComposite === null
    && advancedFillPreview === null
    && !webGpuPreviewAuthorized
    && studioRasterHiddenOperationIds.size === 0
    && canonicalDryMediaSelectedElement !== null
    && canonicalDryMediaSelectedElement.clipBelow !== true
    && canonicalDryMediaSelectedElement.maskSrc === undefined
    && canonicalDryMediaPanelClip === null
      ? canonicalDryMediaSelectedElement
      : null;
  const canonicalDryMediaLayoutKey = webGpuViewportSurface
    ? [
        activePage.id,
        CANVAS_W,
        canvasH,
        webGpuViewportSurface.surface.left,
        webGpuViewportSurface.surface.top,
        webGpuViewportSurface.surface.width,
        webGpuViewportSurface.surface.height,
        effScale,
        canvasFlipH ? 1 : 0,
      ].join(":")
    : "unavailable";
  const canonicalDryMediaAuthorized =
    canonicalDryMediaCanvasAuthority?.element === canonicalDryMediaCandidate
    && canonicalDryMediaCanvasAuthority.layoutKey === canonicalDryMediaLayoutKey
      ? canonicalDryMediaCanvasAuthority
      : null;
  const canonicalDryMediaHiddenElementId =
    canonicalDryMediaAuthorized?.element.id ?? null;
  // 말풍선 병합 액션 게이트 — 다중 선택에 말풍선이 2개 이상 섞였을 때만 노출하고, 비활성
  // 사유(혼합 선택·개수 범위)는 bubbleMergeUnavailableReason으로 툴팁에 안내한다.
  const canvasSelectionIds =
    marqueeIds.length > 0 ? marqueeIds : selectedId ? [selectedId] : [];
  const canvasSelectionEls = canvasSelectionIds
    .map((id) => elementById.get(id))
    .filter((element): element is El => element !== undefined);
  const canvasSelectionIdSet = new Set(canvasSelectionEls.map((element) => element.id));
  const marqueeSelectedEls =
    marqueeIds.length >= BUBBLE_MERGE_MIN_COUNT
      ? marqueeIds.map((id) => elementById.get(id)).filter((el): el is El => el !== undefined)
      : [];
  const selectedGroupIds = new Set(
    canvasSelectionEls
      .map((element) => element.groupId)
      .filter((groupId): groupId is string => groupId !== undefined)
  );
  const activeCanvasGroup = activeGroupId
    ? groups.find((group) => group.id === activeGroupId) ?? null
    : null;
  const activeCanvasGroupName = activeCanvasGroup
    ? activeCanvasGroup.name.trim() || "이름 없는 그룹"
    : null;
  const completeSelectionGroup =
    selectedGroupIds.size === 1
      ? groups.find((group) => {
          if (!selectedGroupIds.has(group.id)) return false;
          // 그룹에 들어간 뒤에는 모든 자식이 선택되어도 최상위 그룹 하나로 표시하지
          // 않는다. 내부 편집의 선택 경계·명령을 그대로 유지하는 PPT/Figma 동작이다.
          if (activeGroupId === group.id) return false;
          const memberIds = elements
            .filter((element) => element.groupId === group.id)
            .map((element) => element.id);
          return (
            memberIds.length > 0 &&
            memberIds.length === canvasSelectionEls.length &&
            memberIds.every((id) => canvasSelectionIdSet.has(id))
          );
        }) ?? null
      : null;
  const selectionMutationDisabledReason =
    collaborationDocumentLocked
      ? collaborationLockMessage()
      : activeSurfaceReviewLocked
        ? "검토 잠금이 켜진 작업면이에요. 잠금을 해제한 뒤 선택을 편집하세요."
        : null;
  const selectionContainsExistingGroup = canvasSelectionEls.some(
    (element) =>
      element.groupId !== undefined &&
      groups.some((group) => group.id === element.groupId)
  );
  const groupSelectionDisabledReason =
    selectionMutationDisabledReason ??
    (selectionContainsExistingGroup
      ? "기존 그룹이 포함된 선택이에요. 먼저 그룹을 해제한 뒤 다시 그룹화하세요."
      : null);
  const selectionLockedCount = canvasSelectionEls.filter((element) =>
    isEffectivelyLocked(element, groups)
  ).length;
  const topLevelSelectedGroupIds = new Set(
    canvasSelectionEls
      .map((element) => element.groupId)
      .filter(
        (groupId): groupId is string =>
          groupId !== undefined &&
          groupId !== activeGroupId &&
          groups.some((group) => group.id === groupId)
      )
  );
  const alignmentSelectionDisabledReason =
    selectionMutationDisabledReason ??
    (selectionLockedCount > 0
      ? "잠긴 객체가 포함되어 있어 정렬·분배할 수 없어요. 선택 항목의 잠금을 모두 해제하세요."
      : topLevelSelectedGroupIds.size > 0 && !completeSelectionGroup
        ? "여러 그룹의 내부 배치를 보호하려고 정렬·분배를 잠갔어요. 그룹 하나씩 선택해 정렬하세요."
        : null);
  const multiSelectionVisibleBounds = marqueeIds.length > 1
    ? canvasSelectionEls
        .filter((element) => !isEffectivelyHidden(element, groups))
        .map((element) =>
          // draw의 select-only hit Shape는 scene geometry가 없어 Konva Group clientRect에
          // 원점(0,0)을 끼워 넣을 수 있다. 그러면 그룹 union이 캔버스 좌상단까지 부풀고
          // 이름 배지가 화면 밖으로 사라진다. 선화는 권위 points 기반 bounds를 사용한다.
          element.type === "draw"
            ? elBounds(element)
            : liveNodeDisplayBounds(
                nodeRefsRef.current[element.id],
                mainLayerRef.current,
                elBounds(element)
              )
        )
    : [];
  const multiSelectionBounds =
    multiSelectionVisibleBounds.length > 0
      ? unionBounds(multiSelectionVisibleBounds)
      : null;
  const selectionLockState =
    selectionLockedCount === 0
      ? "unlocked"
      : selectionLockedCount === canvasSelectionEls.length
        ? "locked"
        : "mixed";
  const groupResizeEnabled =
    tool === "select" &&
    !isExporting &&
    !viewTransformSuppressed &&
    !canvasInteractionBlocked &&
    !hardCanvasInteractionBlock &&
    !activeSurfaceReviewLocked &&
    selectionMutationDisabledReason === null &&
    marqueeIds.length > 1 &&
    canvasSelectionEls.length === marqueeIds.length &&
    selectionLockState === "unlocked" &&
    multiSelectionBounds !== null &&
    multiSelectionBounds.w > 0 &&
    multiSelectionBounds.h > 0;
  const groupMovementBlockedIds = new Set(
    groups
      .filter((group) =>
        elements.some(
          (element) =>
            element.groupId === group.id && isEffectivelyLocked(element, groups)
        )
      )
      .map((group) => group.id)
  );
  const marqueeBubbleCount = marqueeSelectedEls.filter((el) => el.type === "bubble").length;
  const showBubbleMerge = marqueeBubbleCount >= BUBBLE_MERGE_MIN_COUNT;
  const bubbleMergeReason = showBubbleMerge
    ? bubbleMergeUnavailableReason(marqueeSelectedEls)
    : null;
  const zoomOutAtLimit = stepStudioViewZoom(zoom, -1) === zoom;
  const zoomInAtLimit = stepStudioViewZoom(zoom, 1) === zoom;
  const zoomLockedReason = zoomLocked
    ? localizeText(t, "캔버스 배율 잠금을 먼저 해제하세요.", "studio.canvas.zoomLock.blocked")
    : undefined;
  const viewBusyReason = viewTransformSuppressed
    ? localizeText(t, "내보내기·저장·타임랩스 캡처가 끝난 뒤 보기를 조절하세요.", "studio.canvas.viewBusyHint")
    : undefined;
  const zoomOutUnavailableReason = viewBusyReason ?? zoomLockedReason ?? (zoomOutAtLimit
    ? localizeText(t, "최소 축소 배율에 도달했습니다.", "studio.canvas.zoomOutLimitReached")
    : undefined);
  const zoomInUnavailableReason = viewBusyReason ?? zoomLockedReason ?? (zoomInAtLimit
    ? localizeText(t, "최대 확대 배율에 도달했습니다.", "studio.canvas.zoomInLimitReached")
    : undefined);
  const toggleWheelCanvasMode = () => {
    commitAppSettings({
      ...appSettings,
      mouse: {
        ...appSettings.mouse,
        wheel: toggleStudioCanvasWheelMode(appSettings.mouse.wheel),
      },
    });
  };
  const enterGroupFromCanvasGesture = (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ) => {
    if (
      canvasInteractionBlocked ||
      tool !== "select" ||
      commentPinArmed ||
      eyedropperActive ||
      advancedFillArmed ||
      pixelToolArmed ||
      cropArmed ||
      smudgeArmed ||
      dodgeBurnArmed ||
      wetMixArmed ||
      liquifyArmed ||
      panelSplitArmed ||
      nodeEditArmed ||
      healCloneArmed ||
      layerMaskPaintArmed ||
      filterMaskPaintArmed ||
      quickMaskArmed ||
      historyBrushArmed ||
      bubbleShapeArmed ||
      puppetWarpArmed
    ) {
      return;
    }
    const elementId = studioElementIdOf(event.target);
    if (elementId) selectElementFromCanvas(elementId, event, true);
  };
  return (
        <div
          className={cn(
            "relative min-h-0 min-w-0 flex-1 lg:min-w-[16rem]",
            "flex flex-col overflow-hidden",
            canvasOnlyMode && "overflow-hidden",
            mobileImmersive && "overflow-hidden"
          )}
          data-studio-logical-w={CANVAS_W}
        >
          <StudioCanvasStatusRail
            activeGroupName={activeCanvasGroupName}
            mobileImmersive={mobileImmersive}
            hasAutosave={hasAutosave}
            autosaveRestoreBlockedReason={autosaveRestoreBlockedReason}
            selectionCount={canvasSelectionEls.length}
            selectionGroupName={completeSelectionGroup?.name ?? null}
            selectionLockState={selectionLockState}
            groupSelectionDisabledReason={groupSelectionDisabledReason}
            lockSelectionDisabledReason={selectionMutationDisabledReason}
            layoutSelectionDisabledReason={selectionMutationDisabledReason}
            alignmentSelectionDisabledReason={alignmentSelectionDisabledReason}
            advancedFillBusy={advancedFillBusy}
            advancedFillPreviewMessage={advancedFillPreview?.message ?? null}
            advancedFillActive={advancedFillActive}
            onDownloadAutosaveBackup={downloadAutosaveBackup}
            onRestoreAutosave={restoreAutosave}
            onClearAutosave={clearAutosave}
            onGroupSelection={groupSelectedElements}
            onUngroupSelection={completeSelectionGroup ? ungroupSelectedElements : undefined}
            onToggleSelectionLock={toggleSelectedElementsLocked}
            onReorderSelection={reorderSelectedElements}
            onAlignSelection={alignSelected}
            showBubbleMerge={showBubbleMerge}
            bubbleMergeDisabledReason={bubbleMergeReason}
            onMergeBubbles={mergeSelectedBubbles}
            onDuplicateSelection={duplicateSelected}
            onRemoveSelection={removeSelected}
            onClearSelection={clearCanvasSelection}
            onCancelAdvancedFillPreview={cancelAdvancedFillPreview}
            onApplyAdvancedFillPreview={applyAdvancedFillPreview}
            onCancelAdvancedFillCalculation={toggleAdvancedFill}
          />
          {/* 색맹 시뮬레이션용 숨김 SVG filter defs — filter id 는 문서 전역 참조라 위치 무관, 정적이라 무조건 마운트 */}
          <StudioColorBlindFilterDefs />
          {/* Sketchbook/Krita/Concepts status — zoom HUD + tool metrics over canvas */}
          {!canvasOnlyMode && !isMobile ? (
            <StudioStatusBar
              className={cn(
                mobileImmersive && "bottom-[calc(5.5rem+env(safe-area-inset-bottom))]"
              )}
              style={
                tool === "draw"
                  ? {
                      bottom:
                        "calc(var(--studio-draw-options-height, 3.75rem) + max(0.75rem, env(safe-area-inset-bottom)) + 0.75rem)",
                    }
                  : undefined
              }
            >
              <StudioViewInputModeControls
                wheelMode={appSettings.mouse.wheel}
                zoomLocked={zoomLocked}
                onToggleWheelMode={toggleWheelCanvasMode}
                onToggleZoomLock={() => setZoomLocked((current) => !current)}
              />
              <StudioHudPill>
                <StudioToolHintTarget
                  hint={STUDIO_VIEW_ACTION_HINTS.zoomOut}
                  unavailableReason={zoomOutUnavailableReason}
                  preferredSide="top"
                >
                  <button
                    type="button"
                    className={cn(
                      "grid size-7 place-items-center rounded text-fg-3 hover:bg-raised hover:text-fg",
                      (viewTransformSuppressed || zoomLocked || zoomOutAtLimit) && "cursor-not-allowed opacity-40"
                    )}
                    aria-label="축소"
                    aria-disabled={viewTransformSuppressed || zoomLocked || zoomOutAtLimit ? true : undefined}
                    onClick={() => {
                      if (!viewTransformSuppressed && !zoomLocked && !zoomOutAtLimit) {
                        setZoom((current) => stepStudioViewZoom(current, -1));
                      }
                    }}
                  >
                    −
                  </button>
                </StudioToolHintTarget>
                <span className="min-w-[2.4rem] text-center tabular-nums text-fg">
                  {Math.round(zoom * scale * 100)}%
                </span>
                <StudioToolHintTarget
                  hint={STUDIO_VIEW_ACTION_HINTS.zoomIn}
                  unavailableReason={zoomInUnavailableReason}
                  preferredSide="top"
                >
                  <button
                    type="button"
                    className={cn(
                      "grid size-7 place-items-center rounded text-fg-3 hover:bg-raised hover:text-fg",
                      (viewTransformSuppressed || zoomLocked || zoomInAtLimit) && "cursor-not-allowed opacity-40"
                    )}
                    aria-label="확대"
                    aria-disabled={viewTransformSuppressed || zoomLocked || zoomInAtLimit ? true : undefined}
                    onClick={() => {
                      if (!viewTransformSuppressed && !zoomLocked && !zoomInAtLimit) {
                        setZoom((current) => stepStudioViewZoom(current, 1));
                      }
                    }}
                  >
                    +
                  </button>
                </StudioToolHintTarget>
              </StudioHudPill>
              <StudioHudPill title={pageDisplayName(activePage, activePageIndex)} className="max-w-[7rem] truncate">
                <button
                  type="button"
                  aria-expanded={pageSequenceOpen}
                  aria-label={`페이지 시퀀스 ${pageSequenceOpen ? "닫기" : "열기"} · ${pageDisplayName(activePage, activePageIndex)}`}
                  onClick={() => setPageSequenceOpen((current) => !current)}
                  className="inline-flex min-w-0 items-center gap-1 rounded-full px-0.5 text-fg transition-colors hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Clapperboard size={11} aria-hidden />
                  <span className="truncate">{pageDisplayName(activePage, activePageIndex)}</span>
                </button>
              </StudioHudPill>
              <StudioHudPill
                title={studioDrawHudToolLabel(
                  tool === "draw"
                    ? drawMode === "eraser"
                      ? { mode: "eraser", widthPx: strokeWidth }
                      : drawMode === "shape"
                        ? { mode: "shape", shapeLabel: studioShapeKindLabel(drawShape) }
                        : drawMode === "pixel"
                          ? { mode: "pixel" }
                        : {
                            mode: "pen",
                            brushName: activeCatalogBrushName,
                            widthPx: strokeWidth,
                            opacity01: brushOpacity,
                          }
                    : tool === "select"
                      ? {
                          mode: "select",
                          selectionLabel: selected ? elementLabel(selected) : null,
                        }
                      : { mode: "other", label: String(tool) }
                )}
                accent={tool === "draw"}
              >
                {tool === "draw" && drawMode === "eraser" ? (
                  <Eraser size={12} strokeWidth={1.75} aria-hidden />
                ) : tool === "draw" && drawMode === "shape" ? (
                  <Shapes size={12} strokeWidth={1.75} aria-hidden />
                ) : tool === "draw" && drawMode === "pixel" ? (
                  <Grid3X3 size={12} strokeWidth={1.75} aria-hidden />
                ) : tool === "draw" ? (
                  <Pencil size={12} strokeWidth={1.75} aria-hidden />
                ) : tool === "select" ? (
                  <MousePointer2 size={12} strokeWidth={1.75} aria-hidden />
                ) : (
                  <span className="tabular-nums">{String(tool)}</span>
                )}
                {tool === "draw" ? (
                  <span className="tabular-nums">
                    {drawMode === "shape"
                      ? studioShapeKindLabel(drawShape)
                      : drawMode === "pixel"
                        ? "1px"
                        : `${strokeWidth}px`}
                  </span>
                ) : null}
              </StudioHudPill>
              {tool === "draw" && drawMode === "pen" ? (
                <StudioHudPill title={studioStabilizerHudLabel(stabilizer, stabilizerMode)}>
                  <Wind size={12} strokeWidth={1.75} aria-hidden />
                  <span className="tabular-nums">{stabilizer}</span>
                </StudioHudPill>
              ) : null}
              {tool === "draw" && drawMode === "pen" ? (
                <StudioHudPill title={studioPressureCurveHudLabel(pressureCurve)}>
                  <PenTool size={12} strokeWidth={1.75} aria-hidden />
                </StudioHudPill>
              ) : null}
              {tool === "draw" && drawMode === "pen" ? (
                <Suspense fallback={null}>
                  <StudioLivePressureHudPill store={liveDrawPressureStore} />
                </Suspense>
              ) : null}
              {tool === "draw" && drawMode === "shape" && studioShapeFillHudLabel(shapeFill, drawShape) ? (
                <StudioHudPill accent title={localizeText(t, "도형 채우기", "studio.canvas.shapeFill")}>
                  <PaintBucket size={12} strokeWidth={1.75} aria-hidden />
                </StudioHudPill>
              ) : null}
              {tool === "draw" && drawMode !== "pixel" && symmetryType !== "none" ? (
                <StudioHudPill accent title={studioSymmetryHudLabel(symmetryType) ?? "대칭"}>
                  <FlipHorizontal2 size={12} strokeWidth={1.75} aria-hidden />
                </StudioHudPill>
              ) : null}
              {tool === "draw" && quickShapeActive ? (
                <StudioHudPill accent title={t("studio.quickShape.title")}>
                  <Sparkles size={12} strokeWidth={1.75} aria-hidden />
                </StudioHudPill>
              ) : null}
              <div
                className="flex items-center gap-px"
                role="group"
                aria-label={localizeText(t, "레이아웃 모드", "studio.canvas.layoutMode")}
              >
                {(
                  [
                    { mode: "focus" as const, Icon: Minimize2 },
                    { mode: "simple" as const, Icon: Square },
                    { mode: "full" as const, Icon: Maximize2 },
                  ] as const
                ).map(({ mode, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={uiDensityMode === mode}
                    title={`${studioUiDensityLabel(mode)} — ${studioUiDensityDescription(mode)}`}
                    aria-label={`${studioUiDensityLabel(mode)} — ${studioUiDensityDescription(mode)}`}
                    onClick={() => setStudioUiDensity(mode)}
                    className={cn(
                      "grid size-6 place-items-center rounded-full transition-colors",
                      uiDensityMode === mode
                        ? "bg-accent text-on-accent"
                        : "text-fg-3 hover:bg-raised hover:text-fg-2"
                    )}
                  >
                    <Icon size={11} strokeWidth={1.75} aria-hidden />
                  </button>
                ))}
              </div>
              <StudioToolHintTarget
                hint={STUDIO_VIEW_ACTION_HINTS.fitWidth}
                unavailableReason={viewBusyReason}
                preferredSide="top"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (!viewTransformSuppressed) fitCanvasToWidth();
                  }}
                  aria-disabled={viewTransformSuppressed ? true : undefined}
                  className={cn(
                    "min-h-7 rounded-full px-2 py-0.5 text-[0.58rem] font-bold text-fg-3 hover:bg-raised hover:text-fg",
                    viewTransformSuppressed && "cursor-not-allowed opacity-40"
                  )}
                >
                  {localizeText(t, "맞춤", "studio.canvas.fit")}
                </button>
              </StudioToolHintTarget>
              <button
                type="button"
                onClick={() => {
                  if (canvasOnlyMode) setCanvasOnlyMode(false);
                  else enterCanvasOnlyMode();
                }}
                className="rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold text-fg-3 hover:bg-raised hover:text-fg"
                title={localizeText(t, "` — 캔버스만 / 도구 토글", "studio.canvas.canvasOnlyModeTitle")}
              >
                {canvasOnlyMode ? localizeText(t, "도구", "studio.canvas.canvasOnlyModeTool") : "`"}
              </button>
            </StudioStatusBar>
          ) : null}
          {/* 고정높이 스크롤 뷰포트: 줌·긴 캔버스 시 내부 스크롤, 컨트롤은 바깥에 고정 */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 마우스 핸들러는 클릭이 아니라 스페이스+드래그 패닝/에셋 드롭 전용이며 실제 상호작용은 내부 Konva Stage + document keydown(Space) 이 담당한다 */}
          <div
            ref={wrapRef}
            data-studio-canvas-viewport
            data-studio-viewport-cursor={viewportCursorClassName.replace("cursor-", "")}
            data-studio-draw-dock-safe-area={tool === "draw" && !canvasOnlyMode ? "true" : undefined}
            data-studio-mobile-dock-safe-area={isMobile ? "true" : undefined}
            // 스크롤 뷰포트를 키보드 포커스 가능하게 해 방향키 스크롤 허용(WCAG scrollable-region) — focusable 은 의도적.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            role="group"
            aria-label={localizeText(t, "작업 캔버스 — 포커스 후 방향키로 스크롤", "studio.canvas.canvasAriaLabel")}
            onMouseDown={onWrapMouseDown}
            onMouseMove={onWrapMouseMove}
            onMouseUp={onWrapMouseUp}
            onMouseLeave={onWrapMouseUp}
            onDragLeave={onWrapDragLeave}
            onDragOver={onWrapDragOver}
            onDrop={onWrapDrop}
            className={cn(
              // Canvas fills remaining viewport under thin menubar+toolbelt (~6.5rem).
              "relative min-h-0 flex-1 overflow-auto rounded-none border-0 outline-none",
              "group/asset-drop transition-shadow data-[studio-asset-drop-active=true]:shadow-[inset_0_0_0_2px_oklch(0.72_0.18_45/0.9)]",
              "bg-[oklch(0.145_0.008_70)]",
              "[background-image:linear-gradient(oklch(0.162_0.008_70)_1px,transparent_1px),linear-gradient(90deg,oklch(0.162_0.008_70)_1px,transparent_1px)]",
              "[background-size:24px_24px]",
              "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:max-h-none",
              canvasOnlyMode && "min-h-0 flex-1 max-h-none overscroll-contain",
              mobileImmersive
                ? "min-h-0 flex-1 max-h-none rounded-xl overscroll-contain"
                : "max-h-[calc(100dvh-11rem)] min-h-[12rem] lg:max-h-none",
              viewportCursorClassName,
              (isSpacePressed || tool === "hand") && "select-none"
            )}
          >
          <div
            data-studio-asset-drop-indicator
            aria-hidden
            className="pointer-events-none absolute z-[46] size-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/15 opacity-0 shadow-[0_0_0_8px_oklch(0.72_0.18_45/0.12)] transition-opacity group-data-[studio-asset-drop-active=true]/asset-drop:opacity-100"
            style={{
              left: "var(--studio-asset-drop-x, -9999px)",
              top: "var(--studio-asset-drop-y, -9999px)",
            }}
          >
            <span className="absolute inset-1 rounded-full border border-dashed border-accent/80" />
          </div>
          <div
            aria-hidden
            className="pointer-events-none sticky top-3 z-[47] flex h-0 justify-center px-3 opacity-0 transition-opacity group-data-[studio-asset-drop-active=true]/asset-drop:opacity-100"
          >
            <div className="inline-flex min-h-9 items-center gap-2 rounded-full border border-accent/60 bg-panel/95 px-3 text-[0.68rem] font-bold text-fg shadow-xl backdrop-blur-md">
              <ImagePlus size={14} className="text-accent" aria-hidden />
              {localizeText(t, "놓는 위치에 정확히 배치", "studio.canvas.dropPlaceHint")}
              <span className="rounded-full bg-accent-soft px-1.5 py-0.5 text-[0.58rem] text-accent">
                {localizeText(t, "복사", "studio.canvas.copyBadge")}
              </span>
            </div>
          </div>
          <div className="pointer-events-none sticky top-2 z-[56] flex h-0 items-start justify-end pr-2">
            <Suspense fallback={null}>
              <StudioLivePresenceDockConnected
                operationSyncReady={studioCrdtOperationSyncReady}
                followingSessionId={followingStudioSessionId}
                onOpenTeam={() => {
                  dismissQuickStart();
                  setTeamPanelOpen(true);
                }}
                onToggleFollow={(sessionId) =>
                  setFollowingStudioSessionId((current) =>
                    current === sessionId ? null : sessionId
                  )
                }
                onFollowPage={(pageId) => {
                  if (pageId === activePage.id || !pages.some((page) => page.id === pageId)) return;
                  if (!setCurrentPageId(pageId)) return;
                  setSelectedId(null);
                  setTool("select");
                }}
              />
            </Suspense>
          </div>
          {viewTool ? (
            <div className="pointer-events-none sticky top-2 z-[44] flex h-0 items-start justify-center px-2">
              <Suspense fallback={null}>
                <StudioViewToolsHud
                  className="!relative !left-auto !top-auto !max-w-full !translate-x-0"
                  mode={viewTool}
                  magnification={effScale}
                  canZoomIn={stepStudioViewZoom(zoom, 1) !== zoom}
                  canZoomOut={stepStudioViewZoom(zoom, -1) !== zoom}
                  rotation={canvasRotation}
                  flipped={canvasFlipH}
                  onZoomIn={() => setZoom((current) => stepStudioViewZoom(current, 1))}
                  onZoomOut={() => setZoom((current) => stepStudioViewZoom(current, -1))}
                  onFit={fitCanvasToWidth}
                  onActual={setActualPixelView}
                  onRotateLeft={() => rotateCanvasView("left")}
                  onRotateRight={() => rotateCanvasView("right")}
                  onToggleFlip={toggleHorizontalCanvasView}
                  onReset={resetView}
                  onClose={closeViewToolWithFocus}
                />
              </Suspense>
            </div>
          ) : null}
          {commentPinArmed ? (
            <div className="pointer-events-none sticky top-3 z-[45] flex h-0 items-start justify-center px-3">
              <div
                role="status"
                aria-live="polite"
                className="pointer-events-auto flex max-w-[min(32rem,calc(100vw-1.5rem))] items-center gap-2 rounded-lg border border-accent/45 bg-panel px-3 py-2 text-xs text-fg shadow-[0_10px_30px_oklch(0.08_0.01_70/0.48)]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <MessageSquare size={15} aria-hidden />
                </span>
                <span className="min-w-0 flex-1 leading-relaxed">
                  캔버스에서 댓글을 연결할 위치를 선택하세요.
                  <span className="ml-1 text-fg-3">Esc로 취소</span>
                </span>
                <button
                  type="button"
                  aria-label="댓글 핀 배치 취소"
                  onClick={() => {
                    stopStudioCommentPlacementSession();
                  }}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line bg-card px-3 text-xs font-bold text-fg-2 transition-colors hover:border-line-strong hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:min-h-9"
                >
                  취소
                </button>
              </div>
            </div>
          ) : null}
          {sourceHydrationPending || collaborationDocumentUnavailable ? (
            <div className="sticky left-0 top-0 z-20 grid min-h-[15rem] w-full place-items-center px-6 py-10 text-center lg:min-h-[20rem]">
              <span className="max-w-sm">
                <Lock size={22} className="mx-auto text-warn" aria-hidden />
                <strong className="mt-3 block text-sm font-semibold text-fg">
                  {sourceHydrationPending
                    ? workHydrationFailed
                      ? workHydrationUnsupportedFormat
                        ? "업로드형 작품은 별도 편집기가 필요해요"
                        : remixId
                        ? "리믹스 원본을 열지 못했어요"
                        : "원고를 열지 못했어요"
                      : remixId
                        ? "리믹스 원본을 안전하게 불러오는 중"
                        : "원고를 안전하게 불러오는 중"
                    : "공동 문서를 열지 못했어요"}
                </strong>
                <span className="mt-1 block text-xs leading-relaxed text-fg-2">
                  {sourceHydrationPending
                    ? workHydrationFailed
                      ? workHydrationUnsupportedFormat
                        ? "원본을 보호하기 위해 컷툰 편집을 잠갔습니다. 업로드 편집 화면으로 이동해 주세요."
                        : "빈 캔버스로 덮어쓰지 않도록 잠금을 유지합니다. 다시 불러와 주세요."
                      : "불러오기가 끝날 때까지 편집·저장·가져오기·내보내기를 잠급니다."
                    : "이전 계정이나 다른 작품의 캔버스는 표시·내보내지 않습니다."}
                </span>
                {sourceHydrationPending && workHydrationFailed ? (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (workHydrationUnsupportedFormat && workId) {
                          navigate(`/studio?mode=upload&id=${encodeURIComponent(workId)}`);
                          return;
                        }
                        if (workHydrationUnsupportedFormat && remixId) {
                          navigate(`/create/${encodeURIComponent(remixId)}`);
                          return;
                        }
                        globalThis.location.reload();
                      }}
                      className="min-h-11 rounded-lg border border-line bg-card px-4 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {workHydrationUnsupportedFormat
                        ? workId
                          ? "업로드 편집기로 이동"
                          : "원본 작품으로 이동"
                        : "다시 불러오기"}
                    </button>
                    {!workHydrationUnsupportedFormat && (
                      <button
                        type="button"
                        onClick={() => {
                          globalThis.location.href = "/studio";
                        }}
                        className="min-h-11 rounded-lg border border-accent/40 bg-accent-soft px-4 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        새 작업 공간으로 이동
                      </button>
                    )}
                  </div>
                ) : null}
              </span>
            </div>
          ) : null}
          {/* 페이지 색보정 미리보기: Stage에 CSS filter, 그 위에 비네트 오버레이(내보내기 때 픽셀로 합성) */}
          {/* 색맹 시뮬레이션은 이미 색보정된 결과 위에 적용되도록 pageGradeCss 뒤에 이어 붙인다(filter 리스트는 좌→우로 순차 적용). */}
          {/* Raster handoff colocation contract — the data-studio-post-processing-scope div below
              applies the page grade + colour-vision CSS filters to the Konva Stage AND the DOM
              raster surface alike, so handed-off pixels match the vector presentation exactly.
              This is what lets the postProcessing handoff gate stay open for those inputs; the
              invariant (surface + Stage share this filter ancestor, vignette stays outside) is
              pinned by studio-raster-handoff-authority.test.ts. */}
          <div
            ref={zoomHostRef}
            data-studio-canvas-cursor={canvasCursorClassName.replace("cursor-", "")}
            data-studio-brush-cursor-style={
              tool === "draw" && isStudioBrushCursorMode(drawMode)
                ? brushCursorStyle
                : undefined
            }
            data-studio-brush-cursor-brush={
              tool === "draw" && isStudioBrushCursorMode(drawMode)
                ? drawMode === "eraser" ? "eraser" : brush
                : undefined
            }
            data-studio-comment-placement-active={commentPinArmed ? "true" : undefined}
            className={cn(
              "relative rounded-sm shadow-[0_0_0_1px_oklch(0.3_0.012_64/0.55),0_18px_50px_oklch(0.08_0.01_70/0.45)]",
              canvasCursorClassName,
              hardCanvasInteractionBlock && "pointer-events-none select-none",
              (sourceHydrationPending || collaborationDocumentUnavailable) && "invisible absolute inset-0"
            )}
            style={{
              height: stageViewLayout.height,
              isolation: "isolate",
              width: stageViewLayout.width,
            }}
          >
          <div
            data-studio-post-processing-scope=""
            className="relative"
            style={{ filter: [pageGradeCss, colorBlindFilterStyle(colorBlindPreview).filter].filter(Boolean).join(" ") || undefined }}
          >
          <Profiler id="studio:stage" onRender={recordStudioRenderProfile}>
          <Stage
            ref={stageRef}
            width={stageViewLayout.width}
            height={stageViewLayout.height}
            // Drawing owns the contact stream; browser panning would otherwise cancel a fast
            // finger stroke. The wrap's explicit two-finger pinch handler still receives bubbled
            // touch events, and a second touch cancels an unfinished finger stroke above.
            style={{
              touchAction: "none",
            }}
            scaleX={stageViewLayout.scaleX}
            scaleY={stageViewLayout.scaleY}
            x={stageViewLayout.x}
            y={stageViewLayout.y}
            rotation={stageViewLayout.rotation}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onPointerCancel={onStagePointerCancel}
            onDblClick={enterGroupFromCanvasGesture}
            onDblTap={enterGroupFromCanvasGesture}
            onMouseLeave={() => {
              studioLiveRoomRef.current?.clearCursor();
              clearAdvancedFillTapGesture();
              hideBrushCursor();
              hideSmudgeCursor();
              hideHealCloneCursors();
              hideHistoryBrushCursor();
              hideLayerMaskCursor();
              hideFilterMaskCursor();
            }}
            onDragMove={onStageDragMove}
            onDragEnd={onStageDragEnd}
            onContextMenu={(e) => {
              e.evt.preventDefault();
              if (canvasInteractionBlocked || commentPinArmed) return;
              const stage = stageRef.current;
              if (!stage) return;
              const pointerPos = stage.getPointerPosition();
              let clickedElId: string | null = null;
              if (pointerPos) {
                const shape = stage.getIntersection(pointerPos);
                if (shape) {
                  const elId = studioElementIdOf(shape);
                  if (elId) {
                    clickedElId = elId;
                    setTool("select");
                    // 우클릭도 일반 클릭과 같은 그룹 단위 선택 계약을 사용한다. 자식 하나로
                    // selection state를 덮어쓰면 삭제·복제·정렬 메뉴가 그룹을 찢을 수 있다.
                    selectElementFromCanvas(elId);
                  }
                }
              }
              setContextMenu({
                visible: true,
                x: e.evt.clientX,
                y: e.evt.clientY,
                elId: clickedElId,
              });
            }}
          >
            {/* 배경 전용 레이어 — 지우개(destination-out)는 위 콘텐츠 레이어만 지우므로 배경은 보존된다.
                (다크 테마에서 지운 자리로 페이지가 비쳐 검정으로 보이던 문제 해결) */}
            <Layer listening={true}>
              <Rect
                name="bg"
                x={0}
                y={0}
                width={CANVAS_W}
                height={canvasH}
                fill={bgGrad ? undefined : bg}
                fillLinearGradientStartPoint={bgGrad ? { x: 0, y: 0 } : undefined}
                fillLinearGradientEndPoint={bgGrad ? { x: 0, y: canvasH } : undefined}
                fillLinearGradientColorStops={
                  bgGrad
                    ? (studioBackgroundGradientColorStops(bgGrad) as (string | number)[])
                    : undefined
                }
              />
            </Layer>
            <Layer ref={mainLayerRef}>
              <StudioCanvasGuideUnderlay
                canvasWidth={CANVAS_W}
                canvasHeight={canvasH}
                effScale={effScale}
                gridSize={gridSize}
                showGrid={showGrid}
                showWebtoonGuides={showWebtoonGuides}
                webtoonGuides={webtoonGuides}
              />
              {(() => {
                // Only this paint-time array may contain ephemeral Blob URLs. The authored
                // `elements`, page history, autosave, revisions, and CRDT publisher continue to
                // see stable work-asset URIs.
                const authoredCanvasRenderElements = masterEditMode
                  ? elements
                  : studioWorkAssetRenderProjection.elements;
                const canvasRenderElements: El[] = studioFilterPreview
                  ? authoredCanvasRenderElements.map((element) =>
                      element.id === studioFilterPreview.elementId && element.type === "image"
                        ? ({ ...element, ...studioFilterPreview.patch } as El)
                        : element,
                    )
                  : [...authoredCanvasRenderElements];
                if (studioFilterPageComposite) {
                  const previewComposite = studioFilterPreview?.elementId === studioFilterPageComposite.id
                    ? ({ ...studioFilterPageComposite, ...studioFilterPreview.patch } as ImageEl & El)
                    : studioFilterPageComposite;
                  canvasRenderElements.push({
                    ...previewComposite,
                    locked: true,
                    noClip: true,
                  });
                }
                const virtualFillPreviewTarget =
                  !timelapseCapturing &&
                  advancedFillPreview?.virtualTarget &&
                  advancedFillPreview.historyIndex === pagesHi
                    ? advancedFillPreview.virtualTarget
                    : null;
                if (virtualFillPreviewTarget) {
                  const virtualFillPreviewElement: El = {
                    ...materializeStudioAdvancedFillVectorTarget(
                      virtualFillPreviewTarget,
                      advancedFillPreview!.resultSrc,
                    ),
                    locked: true,
                    noClip: true,
                  };
                  const insertionIndex = Math.max(
                    0,
                    Math.min(virtualFillPreviewTarget.insertionIndex, canvasRenderElements.length),
                  );
                  canvasRenderElements.splice(insertionIndex, 0, virtualFillPreviewElement);
                }
                // 다중 레이어 타임라인 재생 미리보기 — 재생 중에만 계산(커밋 없이 렌더 시점 override).
                // 정지 상태(timelinePlaying=false)면 항상 null이라 기존 렌더 경로와 100% 동일.
                const timelineComposite = timelinePlaying
                  ? resolveTimelineComposite(animTimeline, canvasRenderElements.map((e) => e.id), timelinePreviewFrame)
                  : null;
                // Preview-only transform tween (display offsets; does not commit to history).
                const timelineTransformFrame = timelinePlaying ? timelinePreviewFrame : timelinePlayhead;
                const timelineTransforms =
                  timelineOpen || timelinePlaying
                    ? resolveTimelineTransforms(
                        animTimeline,
                        canvasRenderElements.map((e) => e.id),
                        timelineTransformFrame
                      )
                    : null;
                // 이미지 드래그-드롭 패널 자동맞춤(studio-panel-autofit) 후보 프레임 — renderEl 안에서
                // 이미지 요소마다 매번 다시 필터링하지 않도록 렌더당 한 번만 계산한다. hidden 프레임은
                // containingPanel()과 동일하게 제외한다(자동맞춤 결과도 결국 그 클립 메커니즘에
                // 기대므로 대상이 일치해야 한다). locked 프레임은 제외하지 않는다(containingPanel()도
                // 프레임의 locked 여부를 보지 않는다 — "잠금"은 프레임 자체가 옮겨지지 않게 하는 것이지
                // 다른 요소가 그 위에 도킹되는 걸 막는 개념이 아니다).
                const autoFitFrameCandidates = canvasRenderElements.filter((e): e is FrameEl => e.type === "frame" && !e.hidden);
                // 한 요소를 렌더하는 함수. opts.asMask=클리핑 마스크의 베이스 사본(비상호작용),
                // opts.compositeOverride=알파 클리핑 자식의 "source-in" 합성.
                const renderEl = (el: El, idx: number, opts: { asMask?: boolean; compositeOverride?: string } = {}) => {
                const isAdvancedFillVirtualPreview = virtualFillPreviewTarget?.id === el.id;
                const isNonInteractiveRender =
                  opts.asMask === true || isAdvancedFillVirtualPreview;
                const locked = isAdvancedFillVirtualPreview || isEffectivelyLocked(el, groups);
                const isGroupDragMember =
                  marqueeIds.length > 1 && marqueeIds.includes(el.id);
                const topLevelGroupMovementBlocked =
                  el.groupId !== undefined &&
                  activeGroupId !== el.groupId &&
                  groupMovementBlockedIds.has(el.groupId);
                const selectedUnitMovementBlocked =
                  isGroupDragMember && selectionLockState !== "unlocked";
                // 픽셀 선택/크롭/패널 컷/노드 편집/문지르기/복구브러시 무장 중엔 요소 드래그를 잠근다 — 캔버스 드래그가 도구 조작으로 간다.
                const draggable =
                  !isNonInteractiveRender &&
                  !activeSurfaceReviewLocked &&
                  tool === "select" &&
                  !locked &&
                  !topLevelGroupMovementBlocked &&
                  !selectedUnitMovementBlocked &&
                  !advancedFillArmed &&
                  !pixelToolArmed &&
                  !cropArmed &&
                  !panelSplitArmed &&
                  !nodeEditArmed &&
                  !smudgeArmed &&
                  !dodgeBurnArmed &&
                  !wetMixArmed &&
                  !liquifyArmed &&
                  !healCloneArmed &&
                  !layerMaskPaintArmed &&
                  !filterMaskPaintArmed &&
                  !quickMaskArmed &&
                  !historyBrushArmed &&
                  !bubbleShapeArmed &&
                  !puppetWarpArmed;
                // 잠긴 요소(이메레스 밑그림 등)도 선택 모드에선 클릭 선택 허용 — 삭제/잠금해제 가능하게.
                // 이동·변형은 여전히 막힘(draggable=false·트랜스포머 미부착). 드로잉 모드(tool!=="select")엔 무영향.
                // 무장 중 클릭 선택 전환도 잠근다 — 제스처 도중 대상 이미지가 바뀌면 선택 좌표계가 깨진다.
                const onSelect = isNonInteractiveRender
                  ? () => {}
                  : (evt?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
                      if (
                        activeSurfaceReviewLocked ||
                        tool !== "select" ||
                        advancedFillArmed ||
                        pixelToolArmed ||
                        cropArmed ||
                        panelSplitArmed ||
                        nodeEditArmed ||
                        smudgeArmed ||
                        dodgeBurnArmed ||
                        wetMixArmed ||
                        liquifyArmed ||
                        healCloneArmed ||
                        layerMaskPaintArmed ||
                        filterMaskPaintArmed ||
                        quickMaskArmed ||
                        historyBrushArmed ||
                        bubbleShapeArmed ||
                        puppetWarpArmed
                      ) {
                        return;
                      }
                      // 그룹으로 묶인 요소는 PPT/Figma처럼 그룹 전체가 한 단위로 선택된다. Shift=그룹 단위
                      // 가산, 더블클릭=그룹 진입(개별 자식 편집). 순수 로직은 selectElementFromCanvas가 위임.
                      selectElementFromCanvas(el.id, evt);
                    };
                const setRef = isNonInteractiveRender
                  ? () => {}
                  : (n: Konva.Node | null) => {
                      setElementNodeRef(el.id, n);
                    };
                // 패널 내부 콘텐츠 클리핑(들어간 패널 영역). 아래 레이어 클리핑 마스크는 ClipMaskGroup이 알파로 처리한다.
                const panelClip = el.noClip ? null : containingPanel(el, canvasRenderElements);
                const clip = panelClip
                  ? { x: panelClip.x, y: panelClip.y, width: panelClip.width, height: panelClip.height }
                  : null;
                const wrapRenderInteraction = (node: ReactNode) =>
                  isNonInteractiveRender ? (
                    <Group
                      key={`${el.id}-non-interactive-render`}
                      listening={false}
                    >
                      {node}
                    </Group>
                  ) : (
                    node
                  );
                const wrapClip = (node: ReactNode) => {
                  const composite = (opts.compositeOverride ??
                    (el.blendMode || "source-over")) as NonNullable<
                    Konva.NodeConfig["globalCompositeOperation"]
                  >;
                  const clippedNode = clip ? (
                    <Group key={el.id} clipX={clip.x} clipY={clip.y} clipWidth={clip.width} clipHeight={clip.height} globalCompositeOperation={composite}>
                      {node}
                    </Group>
                  ) : (
                    composite !== "source-over" ? (
                      <Group key={el.id} globalCompositeOperation={composite}>
                        {node}
                      </Group>
                    ) : (
                      node
                    )
                  );
                  return wrapRenderInteraction(clippedNode);
                };
                if (el.type === "image") {
                  const isAnimTarget = frameAnimOpen && el.id === frameAnimTargetId && el.frames && el.frames.length > 1;
                  const onion = isAnimTarget
                    ? onionSkinLayers(el.frames!, clampFrameIndex(el.frames!, frameIndexOf(el.frames!, el.activeFrameId ?? null)), onionSkin)
                    : [];
                  // 단일-셀 온스킨(isAnimTarget)과 다중-트랙 재생 미리보기가 같은 요소를 동시에
                  // 건드리면 두 오버레이가 정의되지 않은 방식으로 충돌한다 — 패널의 eligible 계산이
                  // 이미 두 시스템을 UI 레벨에서 상호배제하지만(같은 요소는 frames.length>1 이면
                  // 트랙 추가가 애초에 막힘), 여기서도 방어적으로 한 번 더 가드한다.
                  const timelineOverride = isAnimTarget ? undefined : timelineComposite?.get(el.id);
                  const advancedFillPreviewSrc =
                    !timelapseCapturing &&
                    advancedFillPreview?.targetId === el.id &&
                    advancedFillPreview.historyIndex === pagesHi
                      ? advancedFillPreview.resultSrc
                      : undefined;
                  // 사용자가 아직 적용하지 않은 채우기 미리보기가 가장 높은 우선순위다. 타임라인 재생
                  // 중엔 도구 진입이 막히지만, 이미 만든 미리보기를 잃지 않고 적용/취소할 수는 있어야 한다.
                  const effectiveSrc = advancedFillPreviewSrc ?? timelineOverride?.src;
                  const smartFilterFields = studioAdjustmentStackToFilterFields(el.smartFilters);
                  const pose = timelineTransforms?.get(el.id);
                  const effectiveEl = {
                    ...el,
                    ...smartFilterFields,
                    ...(effectiveSrc ? { src: effectiveSrc } : null),
                    ...(pose
                      ? {
                          x: el.x + pose.x,
                          y: el.y + pose.y,
                          rotation: (el.rotation ?? 0) + pose.rotation,
                          width: Math.max(1, el.width * pose.scaleX),
                          height: Math.max(1, el.height * pose.scaleY),
                        }
                      : null),
                  } as ImageEl;
                  // 패널 자동맞춤(studio-panel-autofit) — 이 이미지가 드래그 종료 시 자동맞춤을
                  // 시도해도 되는지 여기서 전부 판정해 autoFitFrames 하나로 StudioKonvaImageNode 에 넘긴다.
                  // null 이면 StudioKonvaImageNode 는 시도조차 하지 않고 기존과 완전히 동일하게 {x,y}만 패치한다.
                  //
                  // isGroupDragMember 가드는 필수다 — 다중 선택(marqueeIds.length > 1)으로 이 이미지를
                  // 포함해 여러 요소를 함께 끌면, onStageDragEnd 가 드래그 시작 시점의 stale elements
                  // 스냅샷 + 델타로 marqueeIds 전원을 별도로 한 번 더 commit 한다 — 이 자동맞춤이 먼저
                  // 커밋한 결과(오버사이즈 박스)를 그 델타 커밋이 곧바로 덮어써 버려(원래의 "옮겨진
                  // 원본 위치 + 델타"로 되돌아감) 화면이 한 프레임 반짝인 뒤 자동맞춤이 무효화되는
                  // 버그가 된다. 그룹 드래그 중엔 이 기능을 아예 끄는 것으로 피한다 — 사용자 의도도
                  // "이 이미지를 패널에 맞추기"가 아니라 "선택한 여러 요소를 함께 옮기기"이므로
                  // 자연스러운 선택이기도 하다.
                  //
                  // isEligibleForPanelAutoFit 은 회전/기울임/다중 프레임 셀 애니메이션/noClip 을
                  // 걸러낸다 — 각 사유는 studio-panel-autofit.ts 의 isEligibleForPanelAutoFit
                  // docstring 참고.
                  const autoFitFrames =
                    !isGroupDragMember &&
                    !isCanvasGroupDragActive(el.id) &&
                    autoFitFrameCandidates.length > 0 &&
                    isEligibleForPanelAutoFit({
                      rotation: el.rotation,
                      skewX: el.skewX,
                      skewY: el.skewY,
                      frameCount: el.frames?.length,
                      noClip: el.noClip,
                    })
                      ? autoFitFrameCandidates
                      : null;
                  return wrapClip(
                    <Fragment key={el.id}>
                      <Suspense fallback={null}>
                        {onion.map((layer) => (
                          <StudioOnionSkinImage
                            key={`onion-${el.id}-${layer.frame.id}`}
                            el={el}
                            layer={layer}
                          />
                        ))}
                      </Suspense>
                      <StudioKonvaImageNode
                        el={effectiveEl}
                        draggable={draggable}
                        innerRef={setRef}
                        onSelect={onSelect}
                        onChange={(patch) => {
                          // 클릭 직후 시작된 그룹 드래그는 렌더 시점의 isGroupDragMember가
                          // 아직 false일 수 있다. 이 런타임 가드가 이미지 노드의 drag-end
                          // {x,y}/auto-fit 커밋 전체를 소비하고 Stage의 원자 그룹 커밋만 남긴다.
                          if (isCanvasGroupDragActive(el.id)) return;
                          patchEl(el.id, patch);
                        }}
                        dragBoundFunc={snapBoundFunc}
                        autoFitFrames={autoFitFrames}
                        onInteractionBegin={() => nodeInteractionBegin(el.id)}
                        onInteractionEnd={endLiveResourceEdit}
                        liveStrokeRef={drawingRef}
                        onHokusaiCanonicalImageReady={onHokusaiCanonicalImageReady}
                        onLivingInkCanonicalImageReady={onLivingInkCanonicalImageReady}
                      />
                    </Fragment>
                  );
                }
                if (el.type === "frame") {
                  return wrapRenderInteraction(
                    <StudioFramePanel
                      key={el.id}
                      el={el}
                      theme={webtoonTheme}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch as Partial<El>)}
                      dragBoundFunc={snapBoundFunc}
                      onInteractionBegin={() => nodeInteractionBegin(el.id)}
                      onInteractionEnd={endLiveResourceEdit}
                    />
                  );
                }
                if (el.type === "focusLines")
                  return wrapClip(
                    <StudioFocusLinesNode
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch)}
                      dragBoundFunc={snapBoundFunc}
                      onInteractionBegin={() => nodeInteractionBegin(el.id)}
                      onInteractionEnd={endLiveResourceEdit}
                    />
                  );
                if (el.type === "speedLines")
                  return wrapClip(
                    <StudioSpeedLinesNode
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch)}
                      dragBoundFunc={snapBoundFunc}
                      onInteractionBegin={() => nodeInteractionBegin(el.id)}
                      onInteractionEnd={endLiveResourceEdit}
                    />
                  );
                if (el.type === "draw") {
                  // 노드 편집 드래그 중엔 커밋 전 초안을 얕게 병합해 그대로 넘긴다 — StudioDrawNode
                  // 는 points/pressures 로부터 매끈화·굵기를 재계산하므로 별도 로직 중복 없이
                  // "라이브 리셰이프"가 커밋될 최종 결과와 픽셀 단위로 동일하게 미리보기된다.
                  const liveEl =
                    nodeEditDraft?.elId === el.id ? { ...el, points: nodeEditDraft.points, pressures: nodeEditDraft.pressures } : el;
                  const hitPointVariations =
                    tool === "select"
                      ? getSymmetricPoints(liveEl.points, liveEl.symmetry)
                      : [];
                  const hitKind = liveEl.kind ?? "freehand";
                  const hitShapeParams = normalizeShapeParams(liveEl.shapeParams);
                  const hitStrokeWidth = Math.max(
                    liveEl.mode === "eraser"
                      ? liveEl.strokeWidth
                      : studioBrushAliasEffectiveDiameter(
                          liveEl.brush,
                          liveEl.strokeWidth
                        ),
                    10 / Math.max(effScale, 0.001)
                  );
                  const hitClosedShape =
                    hitKind === "rect" ||
                    hitKind === "ellipse" ||
                    hitKind === "star" ||
                    hitKind === "triangle" ||
                    hitKind === "polygon";
                  return wrapClip(
                    <Group
                      key={el.id}
                      studioElementId={el.id}
                      ref={setRef}
                      x={0}
                      y={0}
                      draggable={draggable}
                      dragBoundFunc={snapBoundFunc}
                      onMouseDown={onSelect}
                      onTap={onSelect}
                      onDragStart={(event) => {
                        if (!nodeInteractionBegin(el.id)) event.target.stopDrag();
                      }}
                      onDragEnd={(event) => {
                        try {
                          // 다중선택은 Stage onDragEnd가 좌표형 자식과 함께 한 히스토리 스냅샷으로
                          // 확정한다. 단일 선화만 끌었을 때는 wrapper 오프셋을 points에 직접 굽는다.
                          if (
                            isGroupDragMember ||
                            isCanvasGroupDragActive(el.id)
                          ) {
                            return;
                          }
                          const deltaX = event.target.x();
                          const deltaY = event.target.y();
                          event.target.position({ x: 0, y: 0 });
                          if (deltaX === 0 && deltaY === 0) return;
                          patchEl(el.id, {
                            points: liveEl.points.map((value, index) =>
                              value + (index % 2 === 0 ? deltaX : deltaY)
                            ),
                          } as Partial<El>);
                        } finally {
                          endLiveResourceEdit();
                        }
                      }}
                    >
                      <StudioDrawNode el={liveEl} />
                      {/* StudioDrawNode의 실제 페인트 노드는 드로잉 핫패스를 위해 listening=false다.
                          선택 도구일 때만 이 scene-less hit shape가 실제 polyline/도형 경로를 화면
                          10px 허용폭으로 포착한다. 긴 대각선의 빈 bbox는 hit가 아니며, 닫힌 도형도
                          실제 fill이 있을 때만 내부를 잡는다. */}
                      {tool === "select" && !isNonInteractiveRender ? (
                        <Shape
                          sceneFunc={() => undefined}
                          hitFunc={(context, shape) => {
                            for (const points of hitPointVariations) {
                              if (points.length < 2) continue;
                              if (points.length === 2) {
                                // A tap is retained as a visible round/elliptic brush footprint.
                                // A moveTo-only path has zero hit area, so give it a stroke-backed
                                // disc whose screen tolerance matches the rest of the draw hit path.
                                context.beginPath();
                                context.arc(
                                  points[0]!,
                                  points[1]!,
                                  Math.max(0.1, hitStrokeWidth / 4),
                                  0,
                                  Math.PI * 2
                                );
                                context.closePath();
                                context.fillStrokeShape(shape);
                                continue;
                              }
                              let minX = points[0]!;
                              let minY = points[1]!;
                              let maxX = minX;
                              let maxY = minY;
                              for (let pointIndex = 2; pointIndex < points.length; pointIndex += 2) {
                                const x = points[pointIndex] ?? maxX;
                                const y = points[pointIndex + 1] ?? maxY;
                                minX = Math.min(minX, x);
                                minY = Math.min(minY, y);
                                maxX = Math.max(maxX, x);
                                maxY = Math.max(maxY, y);
                              }
                              const width = Math.max(0.1, maxX - minX);
                              const height = Math.max(0.1, maxY - minY);
                              context.beginPath();
                              if (hitKind === "rect") {
                                context.rect(minX, minY, width, height);
                                context.closePath();
                              } else if (hitKind === "ellipse") {
                                const radiusX = Math.max(0.1, width / 2);
                                const radiusY = Math.max(0.1, height / 2);
                                context.save();
                                context.translate(minX + width / 2, minY + height / 2);
                                context.scale(1, radiusY / radiusX);
                                context.arc(0, 0, radiusX, 0, Math.PI * 2);
                                context.restore();
                                context.closePath();
                              } else if (
                                hitKind === "star" ||
                                hitKind === "triangle" ||
                                hitKind === "polygon"
                              ) {
                                const centerX = minX + width / 2;
                                const centerY = minY + height / 2;
                                const radius = Math.max(0.1, Math.min(width, height) / 2);
                                const vertices =
                                  hitKind === "triangle"
                                    ? 3
                                    : hitKind === "polygon"
                                      ? hitShapeParams.polygonSides
                                      : hitShapeParams.starPoints * 2;
                                for (let vertex = 0; vertex < vertices; vertex += 1) {
                                  const angle = -Math.PI / 2 + (vertex * Math.PI * 2) / vertices;
                                  const vertexRadius =
                                    hitKind === "star" && vertex % 2 === 1
                                      ? radius * hitShapeParams.starInnerRatio
                                      : radius;
                                  const x = centerX + Math.cos(angle) * vertexRadius;
                                  const y = centerY + Math.sin(angle) * vertexRadius;
                                  if (vertex === 0) context.moveTo(x, y);
                                  else context.lineTo(x, y);
                                }
                                context.closePath();
                              } else {
                                context.moveTo(points[0]!, points[1]!);
                                for (
                                  let pointIndex = 2;
                                  pointIndex + 1 < points.length;
                                  pointIndex += 2
                                ) {
                                  context.lineTo(
                                    points[pointIndex]!,
                                    points[pointIndex + 1]!
                                  );
                                }
                              }
                              context.fillStrokeShape(shape);
                            }
                          }}
                          fill={
                            hitClosedShape &&
                            (liveEl.fill || liveEl.gradient || liveEl.pattern)
                              ? "#000"
                              : undefined
                          }
                          stroke="#000"
                          strokeWidth={hitStrokeWidth}
                          listening
                          perfectDrawEnabled={false}
                        />
                      ) : null}
                    </Group>
                  );
                }
                if (el.type === "text")
                  return wrapClip(
                    <StudioKonvaTextNode
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onEdit={startEditText}
                      onPatch={patchEl}
                      dragBoundFunc={snapBoundFunc}
                      onInteractionBegin={() => nodeInteractionBegin(el.id)}
                      onInteractionEnd={endLiveResourceEdit}
                      onCommitTransform={commitTextTransformEnd}
                    />
                  );
                if (el.type === "sticker")
                  return wrapClip(
                    <StudioKonvaStickerNode
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onEdit={startEditText}
                      onPatch={patchEl}
                      dragBoundFunc={snapBoundFunc}
                      onInteractionBegin={() => nodeInteractionBegin(el.id)}
                      onInteractionEnd={endLiveResourceEdit}
                      onCommitTransform={commitTextTransformEnd}
                    />
                  );
                // bubble
                return wrapClip(
                  <StudioKonvaBubbleNode
                    key={el.id}
                    el={el}
                    theme={webtoonTheme}
                    customShapeDraftPoints={
                      bubbleShapeDraft?.elId === el.id ? bubbleShapeDraft.points : undefined
                    }
                    selected={selectedId === el.id}
                    exporting={isExporting}
                    effectiveScale={effScale}
                    draggable={draggable}
                    innerRef={setRef}
                    dragBoundFunc={snapBoundFunc}
                    onSelect={onSelect}
                    onEdit={() => startEditText(el.id)}
                    onChange={(patch) => patchEl(el.id, patch)}
                    onInteractionBegin={() => nodeInteractionBegin(el.id)}
                    onInteractionEnd={endLiveResourceEdit}
                  />
                );
                };
                // 문서 마스터 밑그림 — 일반 요소 "아래"(배경 위)에 비상호작용(asMask)으로 합성(studio-master-page).
                // 같은 콘텐츠 레이어라 페이지 지우개(destination-out)에는 함께 지워진다(배경 레이어와 달리 의도된 동일 레이어 합성).
                const masterUnderlay =
                  !masterEditMode && !activePage.hideMaster && masterRenderEls.length > 0 ? (
                    <Group listening={false}>
                      {masterRenderEls.map((mel, mIdx) => renderEl(mel, mIdx, { asMask: true }))}
                    </Group>
                  ) : null;
                // 마스터 편집 모드 — 현재 페이지의 일반 요소를 반투명 잠금 고스트로 위에 겹쳐 위치 참고용으로만 보여준다.
                const pageGhost = masterEditMode ? (
                  <Group listening={false} opacity={MASTER_EDIT_GHOST_OPACITY}>
                    {studioWorkAssetRenderProjection.elements
                      .filter((pel) => !isEffectivelyHidden(pel, activePage.groups ?? []))
                      .map((pel, pIdx) => renderEl(pel, pIdx, { asMask: true }))}
                  </Group>
                ) : null;
                const mainEls = canvasRenderElements.map((el, idx) => {
                  if (isEffectivelyHidden(el, groups) || localHiddenElementIds.has(el.id)) return null; // 숨긴 레이어/그룹 + "나만 숨기기"는 렌더·내보내기에서 제외
                  // A verified raster frame and these vector fallbacks switch in one React commit.
                  // Any stale/gated/error frame yields an empty set, restoring Konva immediately.
                  if (studioRasterHiddenOperationIds.has(el.id)) return null;
                  // The canonical-vNext dry-media canvas receives authority only after its
                  // RGBA16F producer fence and exact live/final/commit parity receipt complete.
                  // This derived id and the child's `visible` prop flip in the same React commit,
                  // so one stroke never exposes two tips or a transparent handoff frame.
                  if (canonicalDryMediaHiddenElementId === el.id) return null;
                  const base = el.clipBelow && idx > 0 ? canvasRenderElements[idx - 1] : null;
                  // 자기 완결형 마스크(el.maskSrc) — clipBelow와 별개 축, 교집합으로 합성해야 하므로
                  // clipBelow보다 먼저 적용해 "이미 마스크 적용된 노드"를 만든다.
                  const maskOn = el.type === "image" && shouldApplyLayerMask(el as ImageEl);
                  // renderEl(el, idx, opts)를 그대로 호출하되, 마스크가 있으면 그 결과를 "자기 자신의
                  // maskSrc로 자른 ClipMaskGroup"으로 한 번 더 감싼다. opts는 clipBelow 분기
                  // (source-in override)와 평범한 분기(opts={}) 양쪽에서 재사용된다.
                  const renderWithOwnMask = (opts: { compositeOverride?: string } = {}) => {
                    const content = renderEl(el, idx, opts);
                    if (!maskOn) return content;
                    const imgEl = el as ImageEl;
                    const maskSrc = (el as El).maskSrc;
                    // 마스크 노드는 최소 필드만 새로 구성한다(el 스프레드 후 필터 필드를 하나하나
                    // undefined로 지우는 방식은 필드 하나만 빠뜨려도 마스크에 필터가 새어들어가는
                    // 실수를 낳기 쉽다 — 순수 알파 스텐실 용도이므로 기하 정보만 필요).
                    const maskEl = {
                      id: `${el.id}__mask`,
                      type: "image",
                      src: maskSrc!,
                      x: imgEl.x,
                      y: imgEl.y,
                      width: imgEl.width,
                      height: imgEl.height,
                      rotation: imgEl.rotation,
                      flipped: imgEl.flipped,
                      flippedY: imgEl.flippedY,
                    } as ImageEl;
                    const mck = [el.id, "mask", maskSrc, JSON.stringify(elBounds(el)), imgEl.rotation ?? 0].join("|");
                    return (
                      <ClipMaskGroup key={`${el.id}-mask`} cacheKey={mck}>
                        {renderEl(maskEl, idx, { asMask: true })}
                        {content}
                      </ClipMaskGroup>
                    );
                  };
                  if (base && !isEffectivelyHidden(base, groups) && !localHiddenElementIds.has(base.id)) {
                    // 알파 정밀 클리핑: 베이스 사본(마스크) + 자식(source-in)을 캐시 그룹에 담아 베이스 알파로만 자른다.
                    const ck = [
                      el.id,
                      base.id,
                      imageFilterCacheKey(el as ImageEl),
                      imageFilterCacheKey(base as ImageEl),
                      (el as { src?: string }).src ?? "",
                      (base as { src?: string }).src ?? "",
                      JSON.stringify(elBounds(el)),
                      JSON.stringify(elBounds(base)),
                      (el as { rotation?: number }).rotation ?? 0,
                      (base as { rotation?: number }).rotation ?? 0,
                      maskOn ? ((el as El).maskSrc ?? "") : "", // 마스크가 캐시 키에도 반영되게.
                    ].join("|");
                    return (
                      <ClipMaskGroup key={el.id} cacheKey={ck}>
                        {renderEl(base, idx - 1, { asMask: true })}
                        {renderWithOwnMask({ compositeOverride: "source-in" })}
                      </ClipMaskGroup>
                    );
                  }
                  return renderWithOwnMask();
                });
                return (
                  <>
                    {masterUnderlay}
                    {mainEls}
                    {!masterEditMode
                      ? studioWorkAssetRenderPlaceholders.map((placeholder) => (
                          <StudioWorkAssetPlaceholderNode
                            key={`${placeholder.elementType}:${placeholder.assetId}`}
                            placeholder={placeholder}
                            scale={effScale}
                          />
                        ))
                      : null}
                    {pageGhost}
                  </>
                );
              })()}
              {/* 지우개 초안만 메인 레이어에 남는다: destination-out 은 이 레이어의 커밋 픽셀과
                  합성되어야 지워지는 미리보기가 보인다. 나머지 초안은 아래 전용 레이어에서 그린다.
                  다이렉트 초안 노드는 상시 마운트 — 스트로크 시작이 렌더를 요구하지 않도록
                  sceneFunc 이 ref 로 스스로 게이트한다. */}
              {tool === "draw" && (
                <Shape
                  sceneFunc={(context) => {
                    const el = liveDraftVisualRef.current;
                    if (!el || el.mode !== "eraser" || !liveDraftDirectRef.current) return;
                    drawLiveFreehandDraftToContext(context, el);
                  }}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )}
              {/* 그룹 및 다중 선택은 구성 타입(draw + image/text 등)이 섞여도 하나의 union bounds를
                  항상 보여준다. 아직 전용 affine proxy가 없는 혼합 선택에서도 PPT/Figma처럼 무엇이
                  한 이동 단위인지 명확해야 한다. 잠금/혼합 상태는 amber 점선으로 즉시 구분하며
                  listening=false라 선택·드래그 hit를 절대 가로채지 않는다. */}
              {!isExporting &&
                tool === "select" &&
                !activeSurfaceReviewLocked &&
                marqueeIds.length > 1 &&
                multiSelectionBounds &&
                multiSelectionBounds.w >= 0 &&
                multiSelectionBounds.h >= 0 && (() => {
                  const pad = 7 / Math.max(effScale, 0.001);
                  const constrained = selectionLockState !== "unlocked";
                  const label =
                    completeSelectionGroup?.name?.trim() ||
                    (completeSelectionGroup ? "그룹" : "다중 선택");
                  const lockStateLabel =
                    selectionLockState === "locked"
                      ? "잠금"
                      : selectionLockState === "mixed"
                        ? "일부 잠금"
                        : null;
                  const badgeText = `${label} · ${canvasSelectionEls.length}개${
                    lockStateLabel ? ` · ${lockStateLabel}` : ""
                  }`;
                  const badgeWidth = Math.min(
                    180 / effScale,
                    Math.max(62 / effScale, (badgeText.length * 7 + 18) / effScale)
                  );
                  const badgeHeight = 20 / effScale;
                  const badgeInset = 2 / effScale;
                  const preferredBadgeY =
                    multiSelectionBounds.y - pad - badgeHeight - 4 / effScale;
                  const badgeX = Math.min(
                    Math.max(multiSelectionBounds.x - pad, badgeInset),
                    Math.max(badgeInset, CANVAS_W - badgeWidth - badgeInset)
                  );
                  const badgeY =
                    preferredBadgeY >= badgeInset
                      ? preferredBadgeY
                      : Math.min(
                          canvasH - badgeHeight - badgeInset,
                          multiSelectionBounds.y + pad + 4 / effScale
                        );
                  return (
                    <Group
                      name="studio-group-selection-overlay"
                      listening={false}
                      studioSelectionRole="group-bounds"
                      studioGroupId={completeSelectionGroup?.id ?? ""}
                      studioGroupLocked={completeSelectionGroup?.locked === true}
                    >
                      {/* 조절 가능한 선택은 전용 Transformer가 정확한 한 줄 경계와 핸들을 그린다.
                          같은 위치에 padded overlay까지 겹치면 이중 점선으로 보여 상용 도구보다
                          산만해진다. 잠금·일시 차단 상태에서만 이 fallback 경계를 사용한다. */}
                      {!groupResizeEnabled ? (
                        <Rect
                          name="studio-group-selection-boundary"
                          x={multiSelectionBounds.x - pad}
                          y={multiSelectionBounds.y - pad}
                          width={Math.max(
                            pad * 2,
                            multiSelectionBounds.w + pad * 2
                          )}
                          height={Math.max(
                            pad * 2,
                            multiSelectionBounds.h + pad * 2
                          )}
                          stroke={constrained ? "#b45309" : "#c2410c"}
                          strokeWidth={(constrained ? 1.75 : 1.35) / effScale}
                          dash={
                            constrained
                              ? [7 / effScale, 4 / effScale]
                              : [2 / effScale, 3 / effScale]
                          }
                          cornerRadius={5 / effScale}
                          shadowColor={constrained ? "#b45309" : "#c2410c"}
                          shadowBlur={4 / effScale}
                          shadowOpacity={0.22}
                        />
                      ) : null}
                      <Group
                        name="studio-group-selection-badge"
                        x={badgeX}
                        y={badgeY}
                      >
                        <Rect
                          width={badgeWidth}
                          height={badgeHeight}
                          fill={constrained ? "#b45309" : "#c2410c"}
                          cornerRadius={5 / effScale}
                          shadowColor="#111827"
                          shadowBlur={3 / effScale}
                          shadowOpacity={0.24}
                        />
                        <Text
                          text={badgeText}
                          width={badgeWidth}
                          height={badgeHeight}
                          padding={5 / effScale}
                          fontSize={10 / effScale}
                          fontStyle="600"
                          fill="#fffaf5"
                          ellipsis
                          wrap="none"
                        />
                      </Group>
                      {constrained ? (
                        <Rect
                          name="studio-group-selection-lock-marker"
                          x={multiSelectionBounds.x - pad}
                          y={multiSelectionBounds.y - pad}
                          width={10 / effScale}
                          height={10 / effScale}
                          offsetX={5 / effScale}
                          offsetY={5 / effScale}
                          rotation={45}
                          fill="#b45309"
                          stroke="#fff7ed"
                          strokeWidth={1 / effScale}
                          cornerRadius={1.5 / effScale}
                        />
                      ) : null}
                    </Group>
                  );
                })()}
              {marqueeIds.length > 1 && multiSelectionBounds ? (
                <StudioGroupUniformResizeProxy
                  bounds={{
                    x: multiSelectionBounds.x,
                    y: multiSelectionBounds.y,
                    width: multiSelectionBounds.w,
                    height: multiSelectionBounds.h,
                  }}
                  effScale={effScale}
                  mobile={isMobile}
                  coarse={hasCoarsePointer}
                  enabled={groupResizeEnabled}
                  onBegin={beginCanvasSelectionResize}
                  onCommit={commitCanvasSelectionResize}
                  onCancel={cancelCanvasSelectionResize}
                />
              ) : null}
              <Transformer
                ref={trRef}
                rotateEnabled
                rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
                rotationSnapTolerance={6}
                keepRatio={selected?.type === "text" || selected?.type === "sticker" || !!selected?.lockAspect}
                enabledAnchors={
                  selected?.type === "text" || selected?.type === "sticker" || selected?.lockAspect
                    ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                    : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]
                }
                // Konva 기본 파란 사각 핸들 대신 디자인 시스템(persimmon 악센트)의 라운드 핸들.
                // 그림자를 살짝 깔아 어떤 원고 색 위에서도 핸들이 읽힌다.
                anchorSize={11}
                anchorCornerRadius={5.5}
                anchorStroke="oklch(0.72 0.185 42)"
                anchorStrokeWidth={1.5}
                anchorFill="oklch(0.998 0.004 85)"
                borderStroke="oklch(0.72 0.185 42 / 0.9)"
                borderStrokeWidth={1.25}
                rotateAnchorOffset={26}
                anchorStyleFunc={(anchor) => {
                  anchor.shadowColor("oklch(0.08 0.01 70)");
                  anchor.shadowBlur(4);
                  anchor.shadowOpacity(0.35);
                  anchor.shadowOffsetY(1);
                }}
                boundBoxFunc={(oldBox, newBox) => (newBox.width < 24 || newBox.height < 24 ? oldBox : newBox)}
              />
              {/* 잠긴 선택 요소는 트랜스포머가 안 붙으므로 점선 박스로 '선택됨'을 표시(삭제·잠금해제 안내). */}
              {selected && isEffectivelyLocked(selected, groups) && marqueeIds.length === 0 && tool === "select" && !isExporting && (() => {
                const sb = elBounds(selected);
                return (
                  <Rect
                    x={sb.x}
                    y={sb.y}
                    width={sb.w}
                    height={sb.h}
                    rotation={(selected as { rotation?: number }).rotation ?? 0}
                    stroke="oklch(0.72 0.185 42 / 0.9)"
                    strokeWidth={1.5 / effScale}
                    dash={[7 / effScale, 4 / effScale]}
                    listening={false}
                  />
                );
              })()}
              {/* draw(선화)는 points 기반이라 노드 ref 미등록 → 트랜스포머가 붙지 않는다.
                  단일 선택·마퀴 다중선택의 선화 멤버 모두 점선 박스로 '선택됨'을 표시한다. */}
              {!isExporting && tool === "select" && !activeSurfaceReviewLocked && (() => {
                const drawSelectionEls =
                  marqueeIds.length > 0
                    ? completeSelectionGroup
                      ? []
                      : elements.filter(
                          (el): el is DrawEl & El =>
                            el.type === "draw" &&
                            marqueeIds.includes(el.id) &&
                            !isEffectivelyLocked(el, groups) &&
                            !isEffectivelyHidden(el, groups)
                        )
                    : selected?.type === "draw" &&
                        !isEffectivelyLocked(selected, groups) &&
                        !isEffectivelyHidden(selected, groups)
                      ? [selected]
                      : [];
                if (drawSelectionEls.length === 0) return null;
                return (
                  <Suspense fallback={null}>
                    <StudioDrawSelectionOverlay els={drawSelectionEls} scale={effScale} />
                  </Suspense>
                );
              })()}
              {/* 그룹 진입(더블클릭) 표시 — 편집 중인 그룹의 경계를 옅은 점선으로 그려 "지금 이 그룹
                  안에서 개별 편집 중"임을 알린다(PPT/Figma 관례). listening=false 라 클릭을 가로채지 않는다. */}
              {!isExporting && tool === "select" && !activeSurfaceReviewLocked && activeGroupId && (() => {
                const memberBounds = elements
                  .filter((el) => el.groupId === activeGroupId && !isEffectivelyHidden(el, groups))
                  .map((el) => elBounds(el));
                if (memberBounds.length === 0) return null;
                const box = unionBounds(memberBounds);
                if (box.w <= 0 || box.h <= 0) return null;
                const pad = 6 / effScale;
                return (
                  <Rect
                    x={box.x - pad}
                    y={box.y - pad}
                    width={box.w + pad * 2}
                    height={box.h + pad * 2}
                    stroke="oklch(0.62 0.02 250 / 0.7)"
                    strokeWidth={1 / effScale}
                    dash={[4 / effScale, 4 / effScale]}
                    cornerRadius={4 / effScale}
                    listening={false}
                  />
                );
              })()}
            </Layer>
            {/* 라이브 프리핸드 초안은 전용 레이어에서만 다시 그린다: 포인터 프레임마다 메인
                레이어의 모든 커밋 요소(세그먼트 압력 획·수채 dab 등)를 재래스터하지 않는다.
                일반 획은 source-over 단일 노드라 별도 캔버스에서 합성해도 시각 결과가 같다.
                지우개(destination-out)만 위의 메인 레이어 경로를 쓴다.
                다이렉트 모드(펜/마커/지우개)는 임페러티브 sceneFunc 이 ref 에서 직접 그리므로
                포인터 프레임에 React 렌더가 없고, 그 외 브러시는 기존 선언적 경로를 유지한다. */}
            {tool === "draw" && (
              <Layer ref={liveDraftLayerRef} listening={false}>
                <Shape
                  sceneFunc={(context) => {
                    const el = liveDraftVisualRef.current;
                    if (
                      !el
                      || el.mode === "eraser"
                      || !liveDraftDirectRef.current
                      || (
                        gpuLiveInkPinnedRef.current
                        && !gpuCanvasShadowVisibleRef.current
                      )
                      || livingInkOverlayVisibleRef.current
                      || liveInkOverlayRendererRef.current.isActive
                      || liveStampOverlayRenderer.isActive
                      || liveDynamicBrushOverlayRenderer.isActive
                      || liveWetInkOverlayRenderer.isActive
                    ) {
                      return;
                    }
                    drawLiveFreehandDraftToContext(context, el);
                  }}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              </Layer>
            )}
            {/* 비다이렉트 초안(팬시 브러시·도형·입자) — 스토어 구독 격리 레이어. 포인터
                프레임은 이 서브트리만 다시 렌더한다. */}
            <StudioDraftPreviewLayers
              store={draftPreviewStore}
              dynamicLayerRef={draftPreviewDynamicLayerRef}
              normalLayerRef={draftPreviewNormalLayerRef}
            />
            {/* 브러시 렌더 종류와 실제 범위를 반영하는 고대비 포인터. */}
            {!isExporting
              && !canvasInteractionBlocked
              && !isSpacePressed
              && !isPanning
              && tool === "draw"
              && isStudioBrushCursorMode(drawMode)
              && (
                brushCursorStyle !== "none"
                || (appSettings.general.showStrokeGuide && stabilizer > 0)
              ) ? (
                <StudioBrushCursor
                  cursorRef={brushCursorRef}
                  guideRef={
                    appSettings.general.showStrokeGuide
                      ? strokeGuideRef
                      : undefined
                  }
                  brushId={drawMode === "eraser" ? "eraser" : brush}
                  diameter={
                    drawMode === "pen"
                      ? studioBrushAliasEffectiveDiameter(brush, strokeWidth)
                      : strokeWidth
                  }
                  effectiveScale={effScale}
                  mode={drawMode}
                  style={brushCursorStyle}
                  tipAngleDeg={tipAngle}
                  tipRoundness={tipRoundness}
                />
              ) : null}
            {!isExporting && (smudgeArmed || liquifyArmed || dodgeBurnArmed || wetMixArmed) && (
              <Layer listening={false}>
                <KCircle
                  ref={smudgeCursorRef}
                  visible={false}
                  radius={Math.max(1.5, wetMixArmed ? wetMixRadius : dodgeBurnArmed ? dodgeBurnRadius : liquifyArmed ? liquifyRadius : smudgeRadius)}
                  stroke={wetMixArmed ? "#2dd4bf" : dodgeBurnArmed ? "#eab308" : liquifyArmed ? "#fb923c" : "#7c5cff"}
                  strokeWidth={1.25 / effScale}
                  dash={[3 / effScale, 3 / effScale]}
                  opacity={0.9}
                />
              </Layer>
            )}
            {!isExporting && (layerMaskPaintArmed || quickMaskArmed) && (
              <Layer listening={false}>
                <KCircle
                  ref={layerMaskCursorRef}
                  visible={false}
                  radius={Math.max(1.5, quickMaskArmed ? quickMaskRadius : layerMaskRadius)}
                  stroke="#eab308"
                  strokeWidth={1.25 / effScale}
                  dash={[3 / effScale, 3 / effScale]}
                  opacity={0.9}
                />
              </Layer>
            )}
            {!isExporting && filterMaskPaintArmed && (
              <Layer listening={false}>
                <KCircle
                  ref={filterMaskCursorRef}
                  visible={false}
                  radius={Math.max(1.5, filterMaskRadius)}
                  stroke="#8b5cf6"
                  strokeWidth={1.25 / effScale}
                  dash={[3 / effScale, 3 / effScale]}
                  opacity={0.9}
                />
              </Layer>
            )}
            {/* healCloneArmed 는 tool 과 무관하게 참일 수 있어(select 모드에서도 무장 가능) 기존
                brushCursorRef Layer(tool==="draw" 로 게이팅됨)에 얹으면 select 모드에서 커서가
                아예 안 그려진다 — smudge 커서와 동일하게 독립 게이팅 Layer로 둔다. */}
            {!isExporting && healCloneArmed && (
              <Layer listening={false}>
                <KCircle
                  ref={healCloneCursorRef}
                  visible={false}
                  stroke={healCloneTool === "heal" ? "#22c55e" : "#38bdf8"}
                  strokeWidth={1.5 / effScale}
                  dash={[3 / effScale, 2 / effScale]}
                />
                <KCircle ref={healCloneSourceCursorRef} visible={false} radius={5 / effScale} stroke="#f59e0b" strokeWidth={1.5 / effScale} />
              </Layer>
            )}
            {!isExporting && historyBrushArmed && (
              <Layer listening={false}>
                <KCircle
                  ref={historyBrushCursorRef}
                  visible={false}
                  radius={Math.max(1.5, historyBrushRadius)}
                  stroke="#ec4899"
                  strokeWidth={1.5 / effScale}
                  dash={[3 / effScale, 2 / effScale]}
                />
              </Layer>
            )}
            {/* 마퀴 프리뷰 — 상시 마운트 임페러티브 Rect(드래그 프레임당 페이지 렌더 없음). */}
            {!isExporting && tool === "select" && (
              <Layer listening={false}>
                <Rect
                  ref={marqueeRectNodeRef}
                  visible={false}
                  fill="rgba(90,140,255,0.12)"
                  stroke="rgba(90,140,255,0.85)"
                  strokeWidth={1 / effScale}
                  dash={[4 / effScale, 4 / effScale]}
                />
              </Layer>
            )}
            {/* 픽셀 선택 마칭앤츠 — 전용 레이어라 RAF 틱마다 이 레이어만 다시 그린다.
                퀵 마스크 중엔 PS처럼 앤츠를 숨긴다(마스크 틴트가 선택을 대신 표현). */}
            {!isExporting &&
              !quickMaskArmed &&
              pixelOverlayFrame &&
              (pixelOverlaySel || pixelDragPreview || polyLassoSession) && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioSelectionAntsOverlay
                    selection={pixelOverlaySel}
                    drag={pixelDragPreview}
                    polyDraft={
                      polyLassoSession
                        ? {
                            points: polyLassoSession.points,
                            hover: polyLassoHover,
                            mode: polyLassoSession.mode,
                          }
                        : null
                    }
                    frame={pixelOverlayFrame}
                    scale={effScale}
                  />
                </Suspense>
              </Layer>
            )}
            {/* 크롭 오버레이 — 크롭 모드 중 크롭 rect(바깥 어둡게 + 3분할선 + 8핸들). */}
            {!isExporting && cropRect && pixelOverlayFrame && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioCropOverlay rect={cropRect} frame={pixelOverlayFrame} scale={effScale} />
                </Suspense>
              </Layer>
            )}
            {/* 패널 손그림 컷 오버레이 — 드래그 중 절단선 미리보기(유효/무효 색 구분). */}
            {!isExporting && panelSplitPreview && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioPanelSplitOverlay preview={panelSplitPreview} gutterPx={panelGutter} scale={effScale} />
                </Suspense>
              </Layer>
            )}
            {/* 벡터 노드 편집 오버레이 — 자유선 점 핸들. */}
            {!isExporting && nodeEditArmed && selected?.type === "draw" && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioNodeEditOverlay
                    handles={nodeEditHandles}
                    tool={nodeEditTool!}
                    pressures={nodeEditDraft?.elId === selected.id ? nodeEditDraft.pressures : selected.pressures}
                    scale={effScale}
                    activeHandleIndex={nodeEditActiveHandleIndex}
                  />
                </Suspense>
              </Layer>
            )}
            {/* 말풍선 커스텀 모양 오버레이 — 폴리곤 점 핸들(로컬좌표, Group이 x/y/rotation 자동 적용). */}
            {!isExporting && bubbleShapeArmed && selected?.type === "bubble" && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioBubbleShapeOverlay
                    frame={{ x: selected.x, y: selected.y, rotation: selected.rotation }}
                    handles={bubbleShapeHandles}
                    scale={effScale}
                    activeHandleIndex={bubbleShapeActiveHandleIndex}
                  />
                </Suspense>
              </Layer>
            )}
            {!isExporting && healCloneArmed && pixelOverlayFrame && (healCloneSourceAnchor || healCloneDragPreview) && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioHealCloneOverlay
                    frame={pixelOverlayFrame}
                    scale={effScale}
                    sourceAnchor={healCloneSourceAnchor}
                    drag={healCloneDragPreview}
                    radiusPx={healCloneRadius}
                    mode={healCloneTool ?? "clone"}
                  />
                </Suspense>
              </Layer>
            )}
            {!isExporting && historyBrushArmed && pixelOverlayFrame && historyBrushDragPreview && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioHistoryBrushOverlay
                    frame={pixelOverlayFrame}
                    drag={historyBrushDragPreview}
                    radiusPx={historyBrushRadius}
                  />
                </Suspense>
              </Layer>
            )}
            {/* 퍼펫 워프 오버레이 — 핀 마커(드래그 가능) + 변형된 메쉬 그물선. 다른 픽셀 도구 오버레이와
                달리 이 Layer는 listening=false 를 주지 않는다 — 핀 Circle 이 Konva 네이티브 드래그를 받아야
                하기 때문(오버레이 파일 헤더 주석 참고). */}
            {!isExporting && puppetWarpArmed && pixelOverlayFrame && (
              <Layer>
                <Suspense fallback={null}>
                  <StudioPuppetWarpOverlay
                    frame={pixelOverlayFrame}
                    scale={effScale}
                    pins={puppetWarpPins}
                    busy={puppetWarpBusy}
                    onMovePin={(id, x, y) => setPuppetWarpPins((pins) => movePuppetPin(pins, id, x, y))}
                  />
                </Suspense>
              </Layer>
            )}
            {!isExporting && layerMaskPaintArmed && pixelOverlayFrame && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioLayerMaskOverlay
                    frame={pixelOverlayFrame}
                    scale={effScale}
                    drag={layerMaskDragPreview}
                    radiusPx={layerMaskRadius}
                    mode={layerMaskPaintMode}
                  />
                </Suspense>
              </Layer>
            )}
            {/* 필터 마스크 페인트 프리뷰 — 레이어 마스크와 동일한 스트로크 미리보기 오버레이 재사용
                (마스크 인코딩·규약이 같아 별도 컴포넌트 불필요). */}
            {!isExporting && filterMaskPaintArmed && pixelOverlayFrame && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioLayerMaskOverlay
                    frame={pixelOverlayFrame}
                    scale={effScale}
                    drag={filterMaskDragPreview}
                    radiusPx={filterMaskRadius}
                    mode={filterMaskPaintMode}
                  />
                </Suspense>
              </Layer>
            )}
            {!isExporting && quickMaskArmed && pixelOverlayFrame && (
              <Layer listening={false}>
                <Suspense fallback={null}>
                  <StudioQuickMaskOverlay
                    frame={pixelOverlayFrame}
                    scale={effScale}
                    tintCanvas={quickMaskTintCanvas}
                    drag={quickMaskDragPreview}
                    radiusPx={quickMaskRadius}
                    mode={quickMaskBrushMode}
                    tintColor={quickMaskTintColor}
                    tintOpacity={quickMaskTintOpacity}
                  />
                </Suspense>
              </Layer>
            )}
            <StudioCanvasGuideOverlayLayers
              isExporting={isExporting}
              drawingMode={tool === "draw"}
              canvasWidth={CANVAS_W}
              canvasHeight={canvasH}
              effScale={effScale}
              guides={guides}
              smartGuides={smartGuides}
              userGuides={userGuides}
              setUserGuides={setUserGuides}
              symmetryType={symmetryType}
              symmetryCenterX={symmetryCenterX}
              symmetryCenterY={symmetryCenterY}
              symmetryRadialCount={symmetryRadialCount}
              setSymmetryCenterX={setSymmetryCenterX}
              setSymmetryCenterY={setSymmetryCenterY}
              perspectiveRulerActive={perspectiveRulerActive}
              vanishingPoints={vanishingPoints}
              perspectiveEyeLevelY={perspectiveEyeLevelY}
              perspectiveLockHorizon={perspectiveLockHorizon}
              onPreviewVanishingPoint={previewVanishingPointById}
              onCommitVanishingPoint={moveVanishingPointById}
              onPreviewPerspectiveEyeLevelY={previewPerspectiveEyeLevelY}
              onCommitPerspectiveEyeLevelY={setPerspectiveEyeLevelY}
              isometricGridActive={isometricGridActive}
              isometricConfig={{
                angleDeg: isometricAngleDeg,
                cellSize: isometricCellSize,
                originX: isometricOriginX,
                originY: isometricOriginY,
              }}
              onPreviewIsometricOrigin={previewIsometricOrigin}
              onCommitIsometricOrigin={commitIsometricOrigin}
              advancedRulers={advancedRulers}
              onPreviewAdvancedRuler={previewAdvancedRuler}
              onCommitAdvancedRuler={patchAdvancedRuler}
              drawingAssistDisabled={activeSurfaceReviewLocked || saving || masterEditMode}
              onCancelDrawingAssistPreview={cancelStudioDrawingAssistPreview}
              sharedGutters={sharedGutters}
              onBeginSharedGutterDrag={beginSharedGutterDrag}
              onPreviewSharedGutterDrag={previewSharedGutterDrag}
              onCommitSharedGutterDrag={commitSharedGutterDrag}
            />
          </Stage>
          </Profiler>
          {STUDIO_AUTOMATIC_RASTER_PUBLICATION_ENABLED && webGpuViewportSurface ? (
            <Suspense fallback={null}>
              <StudioRasterCrdtSurface
                className="z-[9]"
                document={studioCrdtDocument}
                workId={authorizedWorkAssetScopeId}
                surfaceId={`raster:${activePage.id}:ink`}
                viewport={webGpuViewportSurface}
                visibleDocumentRect={studioRasterVisibleDocumentRect}
                handoff={{
                  baseKey: studioRasterHandoffBaseKey,
                  pageId: activePage.id,
                  documentWidth: CANVAS_W,
                  documentHeight: canvasH,
                  elements: studioRasterOverlayElements,
                  gates: studioRasterHandoffGates,
                }}
                authorizedAuthorityKey={studioRasterAuthorizedAuthorityKey}
                hidden={studioRasterHandoffBlocked}
                onHandoffCandidateChange={setStudioRasterHandoffCandidate}
                onError={(message) => setError((current) => current ?? message)}
              />
            </Suspense>
          ) : null}
          <Suspense fallback={null}>
            {webGpuViewportSurface ? (
              <StudioLiveInkOverlayHost
                renderer={liveInkOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveStampOverlayHost
                renderer={liveStampOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveDynamicBrushOverlayHost
                renderer={liveDynamicBrushOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {webGpuViewportSurface ? (
              <StudioLiveWetInkOverlayHost
                renderer={liveWetInkOverlayRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
            {transientPenInkSurfaceEnabled && webGpuViewportSurface ? (
              <StudioLiveInkPredictionHost
                renderer={liveInkPredictionRenderer}
                left={webGpuViewportSurface.surface.left}
                top={webGpuViewportSurface.surface.top}
                width={webGpuViewportSurface.surface.width}
                height={webGpuViewportSurface.surface.height}
                documentScale={effScale}
                documentWidth={CANVAS_W}
                flipX={canvasFlipH}
              />
            ) : null}
          </Suspense>
          {webGpuViewportSurface ? (
            <canvas
              ref={livingInkCanvasRef}
              aria-hidden="true"
              data-studio-living-ink-overlay="true"
              className="pointer-events-none absolute z-[13] mix-blend-multiply"
              style={{
                left: webGpuViewportSurface.surface.left,
                top: webGpuViewportSurface.surface.top,
                width: webGpuViewportSurface.surface.width,
                height: webGpuViewportSurface.surface.height,
              }}
            />
          ) : null}
          {webGpuViewportSurface ? (
            <canvas
              ref={hokusaiLiveCanvasRef}
              aria-hidden="true"
              data-studio-hokusai-live-overlay="true"
              className="pointer-events-none absolute z-[12]"
              style={{
                left: webGpuViewportSurface.surface.left,
                top: webGpuViewportSurface.surface.top,
                width: webGpuViewportSurface.surface.width,
                height: webGpuViewportSurface.surface.height,
              }}
            />
          ) : null}
          {webGpuViewportSurface ? (
            <Suspense fallback={null}>
              <StudioCanonicalVNextDryMediaCanvas
                element={canonicalDryMediaCandidate}
                layoutKey={canonicalDryMediaLayoutKey}
                visible={canonicalDryMediaAuthorized !== null}
                surfaceBounds={webGpuViewportSurface.surface}
                documentWidth={CANVAS_W}
                documentHeight={canvasH}
                documentScale={effScale}
                flipX={canvasFlipH}
                onAuthorityChange={setCanonicalDryMediaCanvasAuthority}
              />
            </Suspense>
          ) : null}
          {webGpuViewportSurface ? (
            <Suspense fallback={null}>
              <StudioWebGpuCanvas
                className="pointer-events-none z-10"
                width={CANVAS_W}
                height={canvasH}
                surfaceBounds={webGpuViewportSurface.surface}
                scaleX={webGpuViewportSurface.transform.scaleX}
                scaleY={webGpuViewportSurface.transform.scaleY}
                offsetX={webGpuViewportSurface.transform.offsetX}
                offsetY={webGpuViewportSurface.transform.offsetY}
                flipX={webGpuViewportSurface.transform.flipX}
                ref={setWebGpuCanvasHandle}
                strokes={webGpuPreviewStrokes}
                frameAuthorized={webGpuPreviewAuthorized}
                eagerInitialize
                onBackendChange={onWebGpuBackendChange}
                onDeviceLost={onWebGpuDeviceLost}
                onFrameInvalid={onWebGpuFrameInvalid}
                onFrameRequest={onWebGpuFrameRequest}
                onFrameReady={onWebGpuFrameReady}
              />
            </Suspense>
          ) : null}
          </div>
          {/* 비네트는 CSS filter가 아니라 별도 오버레이 — 필터 래퍼(post-processing scope) 밖의
              후행 형제라, z-[9] 래스터 표면이 래퍼의 스태킹 컨텍스트(필터가 있을 때만 생김)를
              벗어나면 비네트 위로 올라와 픽셀이 어긋날 수 있다. 그래서 pageGrade.vignette 는
              래스터 핸드오프 postProcessing 게이트에서 유일하게 veto 를 유지한다(fail closed).
              이 오버레이를 래퍼 안으로 옮기면 계약 테스트가 게이트 재검토를 강제한다. */}
          {pageGrade.vignette > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: vignetteCss(pageGrade.vignette) }}
            />
          )}
          {!masterEditMode ? (
            <Suspense fallback={null}>
              <StudioRemoteCursorOverlay
                pageId={activePage.id}
                canvasWidth={CANVAS_W}
                canvasHeight={canvasH}
                hidden={isExporting || sourceHydrationPending || collaborationDocumentUnavailable}
                commentPins={studioCanvasCommentPins}
                flipX={canvasFlipH}
                rotation={canvasRotation}
                commentQuickReplyActive={commentQuickReplyActive}
                onCommentQuickReplyPreload={preloadStudioCommentThreadPopover}
                onCommentPinClick={openStudioCommentThreadPopover}
                onCommentPinReanchor={reanchorStudioCommentPin}
                commentPinReanchorableThreadIds={studioCommentPinReanchorableThreadIds}
                commentPinReanchorDisabledReason={studioCommentPinReanchorDisabledReason}
              />
            </Suspense>
          ) : null}
          {editingUseOverlay ? (
            <Suspense fallback={null}>
              <StudioTextEditOverlay
                key={editing!.id}
                elementId={editing!.id}
                elementById={elementById}
                nodeRefsRef={nodeRefsRef}
                effScale={effScale}
                onCommit={commitEditText}
                onCancel={cancelEditText}
              />
            </Suspense>
          ) : null}
          </div>
          </div>

          {showQuickStart ? (
            <Suspense fallback={null}>
              <QuickStartPanel
              onDismiss={dismissQuickStart}
              onQuickComic={openQuickComicWizard}
              onExample={() => void startFromExample()}
              onOpenTemplate={() => openQuickStartMenu("template")}
              onOpenCharacter={() => {
                dismissQuickStart();
                setPoserVrmOpen(true);
              }}
              onOpenBackground3d={() => {
                dismissQuickStart();
                setBg3dOpen(true);
              }}
              onOpenBubble={() => openQuickStartMenu("bubble")}
              onSmartShape={() => {
                dismissQuickStart();
                setQuickShapeActive(true);
                setTool("draw");
                setDrawMode("pen");
                setEyedropperActive(false);
              }}
              onStartDraw={() => {
                dismissQuickStart();
                setTool("draw");
                setDrawMode("pen");
                applyBuiltInBrushPreset(BRUSH_PRESETS.find((p) => p.id === "pen") ?? BRUSH_PRESETS[0]);
              }}
              onBrushKit={(trigger) => {
                dismissQuickStart();
                openBrushCatalogFromHelp(trigger);
              }}
              onCollabFocus={() => {
                dismissQuickStart();
                setStudioUiDensity("focus");
                setLeftPanelOpen(false);
                _setRightPanelOpen(false);
              }}
              onOpenTutorials={() => {
                dismissQuickStart();
                openFeatureTutorial(null);
              }}
              shortcuts={appSettings.shortcuts}
              />
            </Suspense>
          ) : null}

          <div
            className="pointer-events-none absolute bottom-16 left-1/2 z-40 -translate-x-1/2"
            style={
              tool === "draw" && !canvasOnlyMode
                ? { bottom: "calc(var(--studio-draw-options-height, 3.75rem) + 0.75rem)" }
                : undefined
            }
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {drawingShortcutNotice ? (
              <span
                key={drawingShortcutNotice.id}
                className="mx-3 block max-w-[min(28rem,calc(100vw-1.5rem))] whitespace-normal rounded-lg border border-line bg-panel/95 px-3 py-1.5 text-center text-xs font-semibold leading-relaxed text-fg shadow-lg backdrop-blur motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
              >
                {drawingShortcutNotice.message}
              </span>
            ) : null}
            {quickShapeActive && tool === "draw" && drawMode === "pen" && !drawingShortcutNotice ? (
              <span className="mx-3 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-panel/95 px-3 py-1 text-center text-[0.68rem] font-semibold text-accent shadow-lg backdrop-blur">
                <Shapes size={12} aria-hidden />
                {localizeText(t, "스마트 도형 · 선·원·네모 등을 그리고 손을 떼면 다듬어요 (잠시 멈추면 미리보기)", "studio.quickShape.notice")}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => setQuickStartOpen(true)}
            className={cn(
              "absolute bottom-3 right-3 z-30 hidden size-9 place-items-center rounded-lg border border-line bg-panel/90 text-xs font-bold text-fg-2 shadow-md backdrop-blur transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:grid",
              canvasOnlyMode && "!hidden"
            )}
            style={
              tool === "draw" && !canvasOnlyMode
                ? { bottom: "calc(var(--studio-draw-options-height, 3.75rem) + 1.25rem)" }
                : undefined
            }
            aria-label={localizeText(t, "도구 빠른 실행", "studio.canvas.openQuickStart")}
            aria-expanded={showQuickStart}
            title={localizeText(t, "도구 빠른 실행", "studio.canvas.openQuickStart")}
          >
            <CircleHelp size={16} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className={cn(
              "absolute bottom-3 right-14 z-30 hidden size-9 place-items-center rounded-lg border border-line bg-panel/90 text-sm text-fg-2 shadow-md backdrop-blur transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:grid",
              canvasOnlyMode && "!hidden"
            )}
            style={
              tool === "draw" && !canvasOnlyMode
                ? { bottom: "calc(var(--studio-draw-options-height, 3.75rem) + 1.25rem)" }
                : undefined
            }
            aria-label={t("studio.shortcuts.row.view.help")}
            title={t("studio.shortcuts.row.view.help")}
          >
            <Keyboard size={16} aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => openFeatureTutorial(null)}
            className={cn(
              "absolute bottom-3 right-[6.5rem] z-30 hidden size-9 place-items-center rounded-lg border border-line bg-panel/90 text-fg-2 shadow-md backdrop-blur transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:grid",
              canvasOnlyMode && "!hidden"
            )}
            style={
              tool === "draw" && !canvasOnlyMode
                ? { bottom: "calc(var(--studio-draw-options-height, 3.75rem) + 1.25rem)" }
                : undefined
            }
            aria-label={t("studio.mainMenu.item.view.feature-tutorials")}
            aria-expanded={tutorialHubOpen}
            title={t("studio.mainMenu.item.view.feature-tutorials")}
          >
            <BookOpen size={15} aria-hidden />
          </button>

          {tutorialHubOpen && (
            <Suspense fallback={null}>
              <StudioFeatureTutorialHub
                open={tutorialHubOpen}
                onClose={() => setTutorialHubOpen(false)}
                initialTutorialId={tutorialInitialId}
                onTryAction={handleTutorialTry}
              />
            </Suspense>
          )}

          {shortcutsOpen ? (
            <Suspense fallback={null}>
              <StudioShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} shortcuts={appSettings.shortcuts} />
            </Suspense>
          ) : null}
          {appSettingsOpen ? (
            <Suspense fallback={null}>
              <StudioAppSettingsPanel
                open={appSettingsOpen}
                settings={appSettings}
                initialTab={appSettingsInitialTab}
                persistenceState={appSettingsPersistenceState}
                onClose={() => {
                  const restoreMoreToolsFocus = appSettingsInitialTab === "toolbar";
                  setAppSettingsOpen(false);
                  setAppSettingsInitialTab("general");
                  if (restoreMoreToolsFocus) {
                    requestAnimationFrame(() => {
                      document
                        .querySelector<HTMLElement>('[aria-label="더보기 · 툴바 설정"]')
                        ?.focus();
                    });
                  }
                }}
                onChange={commitAppSettings}
                onRetryPersistence={retryAppSettingsPersistence}
                onResetAll={() => {
                  const next = resetStudioAppSettings(studioAppSettingsStorage());
                  commitAppSettings(next);
                }}
              />
            </Suspense>
          ) : null}
          {historyPanelOpen && (
            <Suspense fallback={null}>
              <StudioHistoryPanel
                history={pagesHistory}
                currentIndex={pagesHi}
                onJumpTo={jumpToHistoryIndex}
                onClose={() => setHistoryPanelOpen(false)}
                onDesignateBrushSource={
                  !masterEditMode && selected?.type === "image" ? designateHistoryBrushSource : undefined
                }
                brushSourceIndex={historyBrushSourceIndex}
                brushSourceAvailability={
                  !masterEditMode && selected?.type === "image"
                    ? computeHistoryBrushAvailability(pagesHistory, activePage.id, selected.id)
                    : undefined
                }
              />
            </Suspense>
          )}
          {frameAnimOpen && frameAnimEl && (
            <Suspense fallback={null}>
              <StudioFrameAnimationPanel
                element={frameAnimEl}
                title={title}
                onClose={() => {
                  setFrameAnimOpen(false);
                  setFrameAnimTargetId(null);
                }}
                onFramesChange={(frames) => patchEl(frameAnimEl.id, { frames })}
                onSettingsChange={(patch) => patchEl(frameAnimEl.id, patch)}
                onActiveFrameChange={(frameId) => {
                  const frame = frameAnimEl.frames?.find((f) => f.id === frameId);
                  if (!frame) return;
                  patchElCoalesced(frameAnimEl.id, { activeFrameId: frameId, src: frame.src }, `frame-nav-${frameAnimEl.id}`);
                }}
                onCaptureFrame={() => void captureAnimFrame(frameAnimEl.id)}
                  captureDisabledReason={
                    frameAnimEl.rotation
                      ? localizeText(t, "회전이 0°인 셀만 프레임을 캡처할 수 있어요.", "studio.canvas.frameAnimationRotateOnly")
                      : (frameAnimEl.frames?.length ?? 0) >= MAX_ANIM_FRAMES
                        ? localizeText(t, "프레임은 최대 60장까지 만들 수 있어요.", "studio.canvas.frameAnimationFrameLimit")
                        : null
                  }
                onRemoveAnimation={() => {
                  patchEl(frameAnimEl.id, { frames: undefined, frameFps: undefined, frameLoop: undefined, activeFrameId: undefined });
                  setFrameAnimOpen(false);
                  setFrameAnimTargetId(null);
                }}
                onionSkin={onionSkin}
                onOnionSkinChange={setOnionSkin}
              />
            </Suspense>
          )}
          {timelineOpen && (
            <Suspense fallback={null}>
              <StudioAnimTimelinePanel
                doc={animTimeline}
                rows={elements
                  .slice()
                  .reverse() // FRONT 먼저 — 레이어 패널과 동일 표시 순서
                  .map((el) => ({
                    id: el.id,
                    label: elementLabel(el),
                    eligible: el.type === "image" && !((el as ImageEl).frames && (el as ImageEl).frames!.length > 1),
                    hidden: isEffectivelyHidden(el, groups),
                    locked: isEffectivelyLocked(el, groups),
                  }))}
                playhead={timelinePlayhead}
                playing={timelinePlaying}
                focusedTrackId={timelineFocusedTrackId}
                onionSkin={onionSkin}
                onOnionSkinChange={setOnionSkin}
                onClose={() => setTimelineOpen(false)}
                onDocChange={(next) => updateActivePage({ animTimeline: next })}
                onScrub={(frameIndex) => {
                  setTimelinePlayhead(frameIndex);
                  // 주의: zOrderIds는 반드시 "뒤집지 않은" elements(BACK→FRONT) — 렌더 루프의 실제
                  // 페인트 순서와 일치해야 한다. rows 표시용으로 reverse()한 배열을 여기 넣으면 안 된다.
                  const composite = resolveTimelineComposite(
                    animTimeline,
                    elements.map((e) => e.id),
                    frameIndex
                  );
                  if (composite.size === 0) return;
                  commitCoalesced(
                    elements.map((e) => (composite.has(e.id) ? ({ ...e, src: composite.get(e.id)!.src } as El) : e)),
                    "timeline-scrub"
                  );
                }}
                onTogglePlay={() => setTimelinePlaying((v) => !v)}
                onFocusTrack={setTimelineFocusedTrackId}
                onAddKeyframe={(trackId) => void captureTimelineKeyframe(trackId, timelinePlayhead)}
                onRemoveKeyframe={(trackId, frameIndex) =>
                  updateActivePage({ animTimeline: removeKeyframe(animTimeline, trackId, frameIndex) })
                }
                onMoveKeyframe={(trackId, from, to) =>
                  updateActivePage({ animTimeline: moveKeyframe(animTimeline, trackId, from, to) })
                }
                onRemoveTrack={(trackId) => updateActivePage({ animTimeline: removeTrack(animTimeline, trackId) })}
              />
            </Suspense>
          )}
          {dialogueBatchOpen && (
            <Suspense fallback={null}>
              <StudioDialogueBatchPanel
                pages={pages}
                currentPageId={activePage.id}
                selectedId={selectedId}
                selectedIds={marqueeIds.length > 0 ? marqueeIds : selectedId ? [selectedId] : []}
                mobileKeyboardInset={mobileKeyboardInset}
                onClose={() => setDialogueBatchOpen(false)}
                onSelectElement={selectDialogueElement}
                onPatchText={patchDialogueText}
                onApplyReplace={applyDialogueReplacePlan}
                onSplitText={splitDialogueText}
                onMergeWithNext={mergeDialogueTextWithNext}
                onTransferElement={transferDialogueText}
                onConvertTextToBubble={convertDialogueTextToBubble}
                onConvertTextsToBubbles={convertDialogueTextsToBubbles}
                onApplyFormat={applyDialogueMultiFormat}
                onApplyDialogueRuby={applyDialogueRuby}
                onClearDialogueRuby={clearDialogueRuby}
                onImportInterchange={importDialogueInterchange}
              />
            </Suspense>
          )}
          {dialogueTranslateOpen && (
            <Suspense fallback={null}>
              <StudioDialogueTranslatePanel
                pages={pages}
                configured={textAiConfigured}
                providerLabel={activeServerAiProviderLabel}
                activeLocale={activeDialogueLocale}
                availableLocales={dialogueLocalesForPages(pages)}
                coverageFor={(locale) => dialogueTranslationCoverage(pages, locale)}
                targetLocale={translateTargetLocale}
                onTargetLocaleChange={setTranslateTargetLocale}
                glossary={translateGlossary}
                onGlossaryChange={setTranslateGlossary}
                busy={translateBusy}
                progress={translateProgress}
                error={translateError}
                draft={translateDraft}
                onGenerate={() => void executeGenerateTranslations()}
                onDraftChange={patchTranslateDraft}
                onApplyDraft={applyTranslationDraft}
                onDiscardDraft={() => setTranslateDraft(null)}
                onSwitchLocale={switchToDialogueLocale}
                onClose={() => setDialogueTranslateOpen(false)}
                workScope={workId ?? authorizedWorkAssetScopeId ?? undefined}
              />
            </Suspense>
          )}
          {masterPanelOpen && (
            <Suspense fallback={null}>
              <StudioMasterPagePanel
                editMode={masterEditMode}
                masterCount={master.elements.length}
                pages={pages}
                currentPageId={activePage.id}
                onToggleEditMode={() => {
                  if (collaborationDocumentLocked) {
                    setError(collaborationLockMessage());
                    return;
                  }
                  // 모드 전환 시 선택을 비운다 — 이전 모드의 요소 id 가 남으면 좌표계가 어긋난다.
                  setMasterEditMode((v) => !v);
                  setSelectedId(null);
                  setMarqueeIds([]);
                }}
                onToggleHideMaster={(pageId) => commitPages(togglePageHideMaster(pages, pageId))}
                onClearMaster={() => {
                  if (collaborationDocumentLocked) {
                    setError(collaborationLockMessage());
                    return;
                  }
                  setMaster(createEmptyDocumentMaster<El>());
                  setSharedDocumentNotice(null);
                  setSelectedId(null);
                  setMarqueeIds([]);
                }}
                onClose={() => {
                  // 패널 규약: 닫으면 마스터 편집 모드도 함께 종료(모드만 남아 헤매는 상태 방지).
                  setMasterPanelOpen(false);
                  setMasterEditMode(false);
                  setSelectedId(null);
                  setMarqueeIds([]);
                }}
              />
            </Suspense>
          )}

          {/* 생성형 AI 최초 사용 고지(정책 필수) — 확인을 누르면 1회 저장 후 생성을 이어서 실행한다.
              스크림 클릭(자기 자신 대상일 때만)·Esc 로 닫히고, 포커스는 기본 확인 버튼이 받는다. */}
          {aiNoticeOpen && (
            <AiAssetNotice onCancel={cancelAiNotice} onAcknowledge={acknowledgeAiNotice} />
          )}

          <StudioPageSequenceStrip
            open={pageSequenceOpen && !canvasOnlyMode && !mobileImmersive}
            pages={pages.map((page, index) => ({
              id: page.id,
              label: pageDisplayName(page, index),
              thumbnailUrl: null,
            }))}
            currentPageId={activePage.id}
            onSelectPage={(pageId) => {
              if (!setCurrentPageId(pageId)) return;
              setSelectedId(null);
              setMarqueeIds([]);
            }}
            onAddPage={collaborationDocumentLocked ? undefined : addPage}
            onClose={() => setPageSequenceOpen(false)}
          />

          {/* 캔버스 보기 컨트롤 — −/=, End 및 Ctrl/Cmd+휠과 같은 보기 상태를 공유한다. */}
          <div
            className={cn(
              "absolute bottom-3 left-3 z-30 hidden items-center gap-0.5 rounded-full border border-line bg-panel/95 p-0.5 shadow-lg backdrop-blur",
              canvasOnlyMode && "lg:flex"
            )}
          >
            <StudioViewInputModeControls
              compact
              wheelMode={appSettings.mouse.wheel}
              zoomLocked={zoomLocked}
              onToggleWheelMode={toggleWheelCanvasMode}
              onToggleZoomLock={() => setZoomLocked((current) => !current)}
            />
            <StudioToolHintTarget
              hint={STUDIO_VIEW_ACTION_HINTS.zoomOut}
              unavailableReason={zoomOutUnavailableReason}
              preferredSide="top"
            >
              <button
                type="button"
                onClick={() => {
                  if (!viewTransformSuppressed && !zoomLocked && !zoomOutAtLimit) {
                    setZoom((current) => stepStudioViewZoom(current, -1));
                  }
                }}
                aria-disabled={viewTransformSuppressed || zoomLocked || zoomOutAtLimit ? true : undefined}
                className={cn(
                  "grid size-7 place-items-center rounded-full text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  (viewTransformSuppressed || zoomLocked || zoomOutAtLimit) && "cursor-not-allowed opacity-40"
                )}
                aria-label={t("studio.shortcuts.row.view.zoomOut")}
              >
                <Minus className="size-3.5" aria-hidden />
              </button>
            </StudioToolHintTarget>
            <StudioToolHintTarget
              hint={STUDIO_VIEW_ACTION_HINTS.actualSize}
              unavailableReason={viewBusyReason ?? zoomLockedReason}
              preferredSide="top"
            >
              <button
                type="button"
                onClick={() => {
                  if (!viewTransformSuppressed && !zoomLocked) setActualPixelView();
                }}
                aria-disabled={viewTransformSuppressed || zoomLocked ? true : undefined}
                className={cn(
                  "min-h-7 min-w-[3.25rem] rounded-full px-1 text-center text-xs font-semibold tabular-nums text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  (viewTransformSuppressed || zoomLocked) && "cursor-not-allowed opacity-40"
                )}
                aria-label={localizeText(t, "실제 픽셀 100% 보기", "studio.canvas.actualPixelAria")}
              >
                {Math.round(effScale * 100)}%
              </button>
            </StudioToolHintTarget>
            <StudioToolHintTarget
              hint={STUDIO_VIEW_ACTION_HINTS.zoomIn}
              unavailableReason={zoomInUnavailableReason}
              preferredSide="top"
            >
              <button
                type="button"
                onClick={() => {
                  if (!viewTransformSuppressed && !zoomLocked && !zoomInAtLimit) {
                    setZoom((current) => stepStudioViewZoom(current, 1));
                  }
                }}
                aria-disabled={viewTransformSuppressed || zoomLocked || zoomInAtLimit ? true : undefined}
                className={cn(
                  "grid size-7 place-items-center rounded-full text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                  (viewTransformSuppressed || zoomLocked || zoomInAtLimit) && "cursor-not-allowed opacity-40"
                )}
                aria-label={t("studio.shortcuts.row.view.zoomIn")}
              >
                <Plus className="size-3.5" aria-hidden />
              </button>
            </StudioToolHintTarget>
          </div>

          {/* 텍스트 인라인 편집 — canvasFlipH(거울상)나 세로쓰기 요소는 캔버스 실시간 오버레이가
              안전하게 다룰 수 없어 예전 중앙 모달로 폴백한다(StudioTextEditOverlay 상단 주석 참고).
              이 폴백은 zoomHostRef 좌표계가 필요 없는 단순 중앙 모달이라 여기(줌 프레임 밖)에 둔다. */}
          {editingFallbackToModal ? (
            <Suspense fallback={null}>
              <StudioTextEditFallbackModal
                key={editing!.id}
                elementId={editing!.id}
                elementById={elementById}
                onCommit={commitEditText}
                onCancel={cancelEditText}
              />
            </Suspense>
          ) : null}
        </div>
  );
});
