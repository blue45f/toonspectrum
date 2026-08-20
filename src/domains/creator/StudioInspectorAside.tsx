import {
  AlignCenter,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Boxes,
  ChevronRight,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Italic,
  Loader2,
  PaintBucket,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Suspense, memo, useEffect, useMemo, useState } from "react";

import { isStudioAiConfigured, type StudioAiSettings } from "./ai/studio-ai-client";
import { type StudioBg3dSceneDocument } from "./bg3d/studio-bg3d-scene-document";
import {
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsPresetId,
} from "./brush/studio-brush-dynamics";
import {
  type DeletedBrushRecord,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./brush/studio-brush-library";
import { STUDIO_DRAW_SHAPE_PICKER_KINDS } from "./brush/studio-draw-hud";
import { adjustStudioBrushSize, STUDIO_BRUSH_OPACITY_RANGE, STUDIO_BRUSH_SIZE_RANGE } from "./brush/studio-draw-ux";
import { toggleStudioDrawingPalette, type StudioDrawingPaletteLayout } from "./brush/studio-drawing-palettes";
import { normalizeShapeParams, normalizeStrokeStyle } from "./brush/studio-stroke-shapes";
import {
  STUDIO_SUB_TOOL_PALETTE_DEFAULT_CATEGORY_ID,
  studioSubToolPaletteCategoryById,
  studioSubToolPaletteCategoryIdForBrushId,
  studioSubToolPalettePresetById,
} from "./brush/studio-sub-tool-palette-data";
import { StudioSubToolPalette } from "./brush/StudioSubToolPalette";
import { type FilterMaskPaintMode } from "./filter/studio-filter-mask";
import { STUDIO_LAYER_BORDER_EFFECT_OPEN_EVENT } from "./layer/studio-layer-border-effect";
import { type LayerMaskPaintMode } from "./layer/studio-layer-mask";
import {
  type StudioLayerColor,
  type StudioLayerNavigatorItem,
  type StudioLayerRole,
} from "./layer/studio-layer-navigator";
import { StudioLayerBorderEffectPanel } from "./layer/StudioLayerBorderEffectPanel";
import { hasCustomBubbleShape } from "./lettering/studio-bubble-custom-shape";
import { normalizeExtraTails } from "./lettering/studio-bubble-path";
import { normalizeTextPath, type TextPathConfig } from "./lettering/studio-text-path";
import { type ImageFilterFields } from "./render/studio-konva-filter-fields";
import { summarizeStudioRasterPreparationSources } from "./render/studio-raster-edit-preparation";
import {
  resolveStudioRasterToolAvailability,
  type StudioRasterToolAvailabilityContext,
  type StudioRasterToolId,
} from "./render/studio-raster-tool-availability";
import {
  localizeStudioInspectorRasterPolicy,
  localizeStudioRasterToolAvailability,
} from "./render/studio-raster-tool-reason-localization";
import { type StudioAdvancedFillPreview } from "./studio-advanced-fill-preview";
import { DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS, type StudioAdvancedFillSettings } from "./studio-advanced-fill-settings";
import { CANVAS_W, type BgPreset, type TemplateSpec } from "./studio-assets";
import { preloadStudioBackground3D } from "./studio-background-3d-loader";
import { parseStudio3dTool } from "./studio-background-3d-metadata";
import { BRAND_KIT_FONTS, DEFAULT_BRAND_KIT_FONT } from "./studio-brand-kit";
import { BRUSH_PRESETS, type BrushPreset } from "./studio-brush";
import { type ColorRangeSample } from "./studio-color-range";
import {
  applyCropAspect,
  cropAspectRatio,
  initialCropRect,
  isCropRectNoop,
  type CropAspectId,
  type CropRect,
} from "./studio-crop";
import {
  type DodgeBurnMode,
  type DodgeBurnRange,
  type DodgeBurnSpongeMode,
} from "./studio-dodge-burn";
import { type DrawMode, type DrawShapeKind, type StudioMenu, type Tool } from "./studio-editor-tool-model";
import { type StudioEffectFavoriteState, type StudioEffectId } from "./studio-effect-favorites";
import { containingPanel, elBounds } from "./studio-element-geometry";
import { elementLabel } from "./studio-element-label";
import {
  type BubbleEl,
  type DrawEl,
  type El,
  type FocusLinesEl,
  type ImageEl,
  type SpeedLinesEl,
  type StickerEl,
  type TextEl,
} from "./studio-element-model";
import { type StudioExtendedBlendModeId } from "./studio-extended-blend";
import {
  resolveStudioFigmaSelectionLayoutMetrics,
  selectStudioFigmaDesignTargets,
  type StudioFigmaSelectionLayoutPatch,
} from "./studio-figma-selection-ux";
import { legacyTextGradientToSpec } from "./studio-gradient-engine";
import { type HealCloneMode } from "./studio-heal-clone";
import { openStudioHelpCenter } from "./studio-help-center-channel";
import { uid } from "./studio-id";
import {
  resolveStudioInspectorContentMode,
  resolveStudioInspectorInteractionPolicy,
} from "./studio-inspector-interaction-policy";
import { normalizeStudioInspectorLayout, type StudioImageInspectorSection, type StudioInspectorLayout } from "./studio-inspector-layout";
import { resolveStudioInspectorRasterToolPolicy } from "./studio-inspector-raster-tool-policy";
import {
  executeStudioInspectorArmedChange,
  executeStudioInspectorArmedToggle,
  executeStudioInspectorRouteTransition,
  studioInspectorTransientOwners,
  type StudioInspectorTransientState,
} from "./studio-inspector-tool-transition";
import { type StudioIsometricPrimitiveSpec } from "./studio-isometric-primitive-contract";
import {
  groupOfItem,
  isEffectivelyHidden,
  isEffectivelyLocked,
  type LayerGroup,
} from "./studio-layers";
import { LIQUIFY_RADIUS_RANGE, LIQUIFY_STRENGTH_RANGE, type StudioLiquifyMode } from "./studio-liquify-contract";
import { type MagicResizePreset, type MagicResizeStrategy } from "./studio-magic-resize";
import {
  studioMobileSheetSizeStyle,
  type StudioMobileSheetSnap,
} from "./studio-mobile-sheet-snap";
import { type NodeEditHandle, type NodeEditTool } from "./studio-node-edit";
import { type PageGrade } from "./studio-page-grade";
import {
  StudioAdvancedRulerPanel,
  StudioAiColorizePanel,
  StudioBrushLibraryPanel,
  StudioBrushStudio,
  StudioBubbleAnchorPanel,
  StudioBubbleTailControls,
  StudioColorPalettePanel,
  StudioCropPanel,
  StudioCustomFontsPanel,
  StudioAutoColorHintsPanel,
  StudioDrawingPaletteStack,
  StudioFloodFillPanel,
  StudioGradientEnginePanel,
  StudioFilterMaskPanel,
  StudioHealClonePanel,
  StudioHistoryBrushPanel,
  StudioImageAdjustmentsPanel,
  StudioIsometricGridPanel,
  StudioLayerMaskPanel,
  StudioLayerNavigator,
  StudioLineCleanupPanel,
  StudioLiquifyPanel,
  StudioPatternFillPanel,
  StudioPerspectivePanel,
  StudioPuppetWarpPanel,
  StudioQuickMaskPanel,
  StudioQuickShapePanel,
  StudioSelectionToolsPanel,
  StudioShapePickerGrid,
  StudioSmudgePanel,
  StudioDodgeBurnPanel,
  StudioWetMixPanel,
  StudioExtendedBlendPanel,
  StudioPathBooleanPanel,
  StudioStrokeShapePanel,
  StudioTextEffectPanel,
  StudioTextPathPanel,
} from "./studio-page-lazy-ui";
import { type PageState } from "./studio-page-state";
import { type StudioPathBooleanOp } from "./studio-path-boolean";
import { type VanishingPoint } from "./studio-perspective-guide";
import { type PixelSelectionHistoryOperation } from "./studio-pixel-selection-history";
import { StudioPresetFontPreload } from "./studio-preset-font-loading";
import {
  isPuppetWarpNoop,
  removePuppetPin,
  resetPuppetPinPositions,
  type PuppetPin,
} from "./studio-puppet-warp";
import { type QuickMaskBrushMode } from "./studio-quick-mask";
import { QUICKSHAPE_KIND_LABELS } from "./studio-quickshape-labels";
import {
  DEFAULT_STUDIO_SKETCH_STYLE,
  studioSketchStyleOfElement,
} from "./studio-rough-shape";
import {
  emptyPixelSelection,
  expandContractSelection,
  flipSelection,
  removeLastSubpath,
  rotateSelection,
  scaleSelection,
  selectAllPixels,
  isSelectionUsable,
  setSelectionFeather,
  toggleSelectionInvert,
  translateSelection,
  type PixelSelection,
  type PolyLassoSession,
  type SelPoint,
  type SelectionAdjustPlan,
  type SelectionContentTransform,
  type SelectionOperationMode,
  type SelectionToolKind,
} from "./studio-selection-tools";
import { normalizeSkewPatch } from "./studio-skew";
import { type StudioViewRotation } from "./studio-view-controls";
import { STUDIO_WORKSPACE_RIGHT_PANEL_WIDTH } from "./studio-workspaces";
import { StudioBgRemoveButton } from "./StudioBgRemoveButton";
import { StudioCommandSearchHost } from "./StudioCommandSearchHost";
import { StudioFigmaDesignPanel } from "./StudioFigmaDesignPanel";
import {
  StudioHokusaiNaturalMediaInspectorMount,
  type StudioHokusaiNaturalMediaReplaceHandler,
} from "./StudioHokusaiNaturalMediaInspectorMount";
import { StudioInspectorBubbleAppearanceControls } from "./StudioInspectorBubbleAppearanceControls";
import { StudioInspectorBubbleShapeControls } from "./StudioInspectorBubbleShapeControls";
import { StudioInspectorCanvasControls } from "./StudioInspectorCanvasControls";
import { StudioInspectorDrawModeControls } from "./StudioInspectorDrawModeControls";
import { StudioInspectorFocusSpeedFrameControls } from "./StudioInspectorFocusSpeedFrameControls";
import { StudioInspectorFreehandPathControls } from "./StudioInspectorFreehandPathControls";
import { StudioInspectorNavigator } from "./StudioInspectorNavigator";
import { StudioInspectorSection } from "./StudioInspectorSection";
import { StudioInspectorSelectionStrokeControls } from "./StudioInspectorSelectionStrokeControls";
import {
  StudioInspectorBrushCatalogButton,
  StudioInspectorCurrentBrushSummary,
  StudioInspectorDisabledReasons,
  StudioInspectorDrawColorControls,
  StudioInspectorMutationLockNotice,
  StudioInspectorPageGradeSurface,
  StudioInspectorPublishPanel,
} from "./StudioInspectorUtilityPanels";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import { StudioLineCorrectionControls } from "./StudioLineCorrectionControls";
import { StudioMagicWandPanel } from "./StudioMagicWandPanel";
import { StudioMinimapViewportBox } from "./StudioMinimapViewportBox";
import { StudioMobileSheetHandle } from "./StudioMobileSheetHandle";
import { StudioProceduralArtisticBrushInspectorSection } from "./StudioProceduralArtisticBrushInspectorSection";
import {
  StudioInspectorFilterLauncher,
  StudioInspectorPixelSelectionLauncher,
  StudioRasterToolRecoveryPanel,
  type StudioInspectorPixelSelectionToolId,
  type StudioRasterRecoveryRequest,
} from "./StudioRasterToolRecoveryPanel";
import { StudioSkewPanel } from "./StudioSkewPanel";
import { useStudioRasterSourcePresentation } from "./use-studio-raster-source-presentation";

import type {
  StudioBrushDefaultRestoreDirection,
  StudioBrushDefaultRestoreTransaction,
} from "./brush/studio-brush-default-restore";
import type { StudioBrushEngineProgramSet } from "./brush/studio-brush-engine-program-set";
import type { StudioFilterKind } from "./filter/studio-filter-menu"; // keep type-only: inline `import { type X }` still emits a live import and drags the filter pack into launch
import type { StudioLayerNavigatorAction } from "./layer/StudioLayerNavigator";
import type {
  StudioAdvancedRuler,
  StudioAdvancedRulerDocument,
} from "./studio-advanced-ruler-document";
import type { StudioScrollViewportStore } from "./studio-scroll-viewport-store";
import type { StudioMobileSheet } from "./StudioMobileEditingDock";

import { buttonClass } from "@/components/ui/button-utils";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface StudioInspectorAsideHandlers {
  activateCanvasTool: (tool: "select" | "draw", drawMode?: DrawMode) => void;
  activatePixelSelectionToolFromInspector: (
    kind: StudioInspectorPixelSelectionToolId,
  ) => void;
  addProceduralArtisticBrushRaster: (src: string, width: number, height: number, name: string, targetPageId: string, targetMasterEditMode: boolean) => boolean;
  replaceDrawWithHokusaiNaturalMedia: StudioHokusaiNaturalMediaReplaceHandler;
  addAdvancedRuler: (type: StudioAdvancedRuler["type"]) => void;
  addBubbleShapePointFromInspector: () => void;
  addFilterMask: (fill: FilterMaskPaintMode) => void;
  addLayerGroup: (seedElId?: string) => void;
  addLayerMask: (fill: LayerMaskPaintMode) => void;
  createLayerMaskFromSelection: (outside: boolean) => void;
  addVanishingPointHandler: () => void;
  alignSelected: (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "distributeH" | "distributeV") => void;
  zoomToSelection: () => void;
  flipSelected: (axis: "horizontal" | "vertical") => void;
  applyFigmaSelectionLayoutPatch: (patch: StudioFigmaSelectionLayoutPatch) => void;
  announceDrawingShortcut: (message: string) => void;
  applyBgPreset: (p: BgPreset) => void;
  /** 엔진 조합 변경 — 브러시 스튜디오의 조합 탭이 호출한다. */
  onBrushEngineProgramsChange?: (next: StudioBrushEngineProgramSet | null) => void;
  applyBrushDefaultRestoreTransaction: (
    transaction: StudioBrushDefaultRestoreTransaction,
    direction: StudioBrushDefaultRestoreDirection,
  ) => void;
  /**
   * CSP식 서브 도구 팔레트가 코어 카탈로그 프리셋을 원자적으로 적용할 때 쓴다.
   * StudioPage의 `applyBuiltInBrushPreset`(카탈로그 선택 → 도구 전환까지 한 트랜잭션)을
   * 그대로 배선한다 — 미배선 시 팔레트는 렌더되지 않는다(반쪽 동작 금지).
   */
  applyBuiltInBrushPreset?: (preset: BrushPreset) => void;
  applyContentAwareFill: () => Promise<void>;
  extractPixelSelectionToLayer: (mode: "copy" | "cut") => Promise<void>;
  applyCropToSelectedImage: () => Promise<void>;
  applyDynamicsPreset: (id: StudioBrushDynamicsPresetId, settings: NormalizedStudioBrushDynamicsSettings) => void;
  applyMagicResizePreset: (preset: MagicResizePreset) => void;
  applyPageGrade: (grade: PageGrade) => void;
  applyPixelSelectionAdjust: (plan: SelectionAdjustPlan) => Promise<void>;
  applyPixelSelectionContentTransform: (transform: SelectionContentTransform) => Promise<void>;
  applyPuppetWarpToSelectedImage: () => Promise<void>;
  applySavedBrush: (saved: StudioSavedBrush) => void;
  assignElementToGroup: (elId: string, groupId: string | undefined) => void;
  changeDrawingPaletteLayout: (next: StudioDrawingPaletteLayout) => void;
  changeInspectorLayout: (next: StudioInspectorLayout) => void;
  clearHealCloneSource: () => void;
  clearPolyLassoDraft: () => void;
  commit: (nextElements: El[], extraPatch?: Partial<Omit<PageState, "id" | "elements">>, targetPageId?: string) => boolean;
  createEditableRasterCopyForInspector: (resumeToolId?: StudioRasterToolId) => Promise<void>;
  deleteFilterMask: () => void;
  deleteLayerMask: () => void;
  detachBubbleAnchor: () => void;
  disarmAllPixelTools: () => void;
  duplicateSelected: () => void;
  ensureRecentColorsLoaded: () => void;
  ensureWebtoonGuidesLoaded: () => void;
  fitBubbleToText: () => Promise<void>;
  fitSelectedToFrame: () => Promise<void>;
  handleLayerNavigatorAction: (action: StudioLayerNavigatorAction) => void;
  invertFilterMask: () => void;
  invertLayerMask: () => void;
  insertIsometricPrimitive: (spec: StudioIsometricPrimitiveSpec) => Promise<void>;
  insertIsometricSolid: () => void;
  patchAdvancedRuler: (id: string, patch: Partial<StudioAdvancedRuler>) => void;
  moveVanishingPointById: (id: string, x: number, y: number) => void;
  previewVanishingPointById: (id: string, x: number, y: number) => void;
  setPerspectiveEyeLevelY: (y: number) => void;
  previewPerspectiveEyeLevelY: (y: number) => void;
  setPerspectiveLockHorizon: (next: boolean) => void;
  alignPerspectiveToEyeLevel: () => void;
  previewIsometricOrigin: (x: number, y: number) => void;
  commitIsometricOrigin: (x: number, y: number) => void;
  onColorizeSelected: () => void;
  onMinimapClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMinimapKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  openBrushCatalog: (trigger: HTMLButtonElement) => void;
  openFeatureTutorial: (tutorialId?: string | null) => void;
  openImagePastePicker: () => void;
  openStudioLayerLift: () => void;
  openStudioFilter: (kind: StudioFilterKind) => void;
  patchEl: (id: string, patch: Partial<El>) => void;
  patchPageGrade: (patch: Partial<PageGrade>) => void;
  queueBrushDelete: (deleted: DeletedBrushRecord) => void;
  regenerateTemplate: (tpl: TemplateSpec, gutter: number, currentEls?: El[]) => ((ImageEl & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean; layerRole?: StudioLayerRole; layerColor?: StudioLayerColor; emeresSourceId?: string; }) | (TextEl & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean; layerRole?: StudioLayerRole; layerColor?: StudioLayerColor; emeresSourceId?: string; }) | (BubbleEl & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean; layerRole?: StudioLayerRole; layerColor?: StudioLayerColor; emeresSourceId?: string; }) | (StickerEl & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean; layerRole?: StudioLayerRole; layerColor?: StudioLayerColor; emeresSourceId?: string; }) | (DrawEl & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean; layerRole?: StudioLayerRole; layerColor?: StudioLayerColor; emeresSourceId?: string; }) | (FocusLinesEl & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean; layerRole?: StudioLayerRole; layerColor?: StudioLayerColor; emeresSourceId?: string; }) | (SpeedLinesEl & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean; layerRole?: StudioLayerRole; layerColor?: StudioLayerColor; emeresSourceId?: string; }) | { id: `${string}-${string}-${string}-${string}-${string}`; type: "frame"; x: number; y: number; width: number; height: number; })[];
  rememberColor: (c: string) => void;
  rememberEffectRecent: (effectId: StudioEffectId) => void;
  removeSelected: () => void;
  removeAdvancedRuler: (id: string) => void;
  removeBubbleShapePointFromInspector: () => void;
  removeVanishingPointHandler: (id: string) => void;
  reorder: (dir: "front" | "back" | "forward" | "backward") => void;
  resetIsometricOrigin: () => void;
  resetPageGrade: () => void;
  selectLayersFromNavigator: (ids: readonly string[]) => void;
  selectAdvancedRuler: (id: string | null) => void;
  setActiveAdvancedRuler: (id: string | null) => void;
  setBg: (newBg: string | ((prev: string) => string)) => void;
  setBgGrad: (newGrad: string[] | null | ((prev: string[] | null) => string[] | null)) => void;
  setCanvasH: (newH: number | ((prev: number) => number)) => void;
  setPaperGrainKind: (kind: import("./brush/studio-paper-texture").PaperGrainKind) => void;
  setPaperGrainVisible: (visible: boolean) => void;
  applyPaperTintBackground: () => void;
  setDescription: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<string>>>[0]) => void;
  setDrawingPaletteDragging: (dragging: boolean) => void;
  setIsometricAngleDegClamped: (next: number) => void;
  setIsometricCellSizeClamped: (next: number) => void;
  previewIsometricAngleDegClamped: (next: number) => void;
  previewIsometricCellSizeClamped: (next: number) => void;
  setPanelGutter: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<number>>>[0]) => void;
  setTagsText: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<string>>>[0]) => void;
  setTitle: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<string>>>[0]) => void;
  setWebtoonTheme: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<"classic" | "soft" | "vivid">>>[0]) => void;
  splitFrameSelected: (orientation: "horizontal" | "vertical") => void;
  stopTimeline: () => void;
  startEditText: (id: string) => void;
  toggleAdvancedFill: () => void;
  toggleBubbleAnchorPick: () => void;
  toggleLiquifyTool: () => void;
  toggleSmudgeTool: () => void;
  toggleDodgeBurnTool: () => void;
  toggleWetMixTool: () => void;
  toggleEffectFavorite: (effectId: StudioEffectId) => void;
  toggleIsometricGridActive: () => void;
  toggleFilterMaskEnabled: () => void;
  toggleLayerMaskEnabled: () => void;
  toggleLocalHidden: (id: string) => void;
  toggleLayerSolo: (id: string) => void;
  updateAdvancedFillSettings: (next: StudioAdvancedFillSettings) => void;
}

interface StudioInspectorAsideProps {
  activeSavedBrushId: string | null;
  advancedRulers: StudioAdvancedRulerDocument;
  activeSurfaceReviewLocked: boolean;
  advancedFillActive: boolean;
  advancedFillBusy: boolean;
  advancedFillPreview: StudioAdvancedFillPreview | null;
  advancedFillReferenceLayerCount: number;
  advancedFillSettings: StudioAdvancedFillSettings;
  advancedFillStatus: string | null;
  advancedFillUnsupportedReason: string | null;
  advancedFillVisibleRasterCount: number;
  aiColorizeBusy: boolean;
  aiColorizeError: string | null;
  aiColorizePrompt: string;
  aiSettings: StudioAiSettings;
  bg: string;
  bgGrad: string[] | null;
  brush: string;
  brushDynamics: NormalizedStudioBrushDynamicsSettings;
  brushOpacity: number;
  bubbleAnchorPickActive: boolean;
  bubbleShapeArmed: boolean;
  bubbleShapeEditActive: boolean;
  bubbleShapeHandles: NodeEditHandle[];
  bubbleShapeSelectedPointIndex: number | null;
  canvasFlipH: boolean;
  canvasH: number;
  canvasRotation: StudioViewRotation;
  collaborationDocumentLocked: boolean;
  paperGrainKind: import("./brush/studio-paper-texture").PaperGrainKind;
  paperGrainVisible: boolean;
  color: string;
  colorRangeFuzziness: number;
  colorRangePickActive: boolean;
  colorRangePreviewEnabled: boolean;
  colorRangeSamples: readonly ColorRangeSample[];
  quickMaskActive: boolean;
  quickMaskBrushMode: QuickMaskBrushMode;
  quickMaskHardness: number;
  quickMaskOpacity: number;
  quickMaskRadius: number;
  quickMaskTintColor: string;
  quickMaskTintOpacity: number;
  cropAspect: CropAspectId;
  cropBusy: boolean;
  cropRect: CropRect | null;
  currentBrushSnapshot: StudioBrushSnapshot;
  currentPageId: string;
  currentTemplate: TemplateSpec | null;
  description: string;
  drawMode: DrawMode;
  drawShape: DrawShapeKind;
  drawingPaletteCancelEpoch: number;
  drawingPaletteLayout: StudioDrawingPaletteLayout;
  effectFavoriteState: StudioEffectFavoriteState;
  effScale: number;
  elementById: Map<string, El>;
  elements: El[];
  eyedropperActive: boolean;
  filterClipboard: Partial<ImageFilterFields> | null;
  gridSize: number;
  groups: LayerGroup[];
  healCloneAligned: boolean;
  healCloneBusy: boolean;
  healCloneHardness: number;
  healCloneOpacity: number;
  healCloneRadius: number;
  healCloneSourceAnchor: SelPoint | null;
  healCloneTool: HealCloneMode | null;
  historyBrushActive: boolean;
  historyBrushBusy: boolean;
  historyBrushHardness: number;
  historyBrushOpacity: number;
  historyBrushRadius: number;
  historyBrushSourceSrc: string | null;
  historyPanelOpen: boolean;
  inspectorLayout: StudioInspectorLayout;
  isMobile: boolean;
  isometricAngleDeg: number;
  isometricCellSize: number;
  isometricGridActive: boolean;
  isometricOriginX: number;
  isometricOriginY: number;
  filterMaskBusy: boolean;
  filterMaskHardness: number;
  filterMaskPaintActive: boolean;
  filterMaskPaintMode: FilterMaskPaintMode;
  filterMaskRadius: number;
  filterMaskStrength: number;
  selectedImageHasActiveFilters: boolean;
  layerMaskBusy: boolean;
  layerMaskHardness: number;
  layerMaskPaintActive: boolean;
  layerMaskPaintMode: LayerMaskPaintMode;
  layerMaskRadius: number;
  layerMaskStrength: number;
  layerNavigatorItems: StudioLayerNavigatorItem[];
  localHiddenElementIds: ReadonlySet<string>;
  soloLayerId: string | null;
  liquifyActive: boolean;
  liquifyBusy: boolean;
  liquifyMode: StudioLiquifyMode;
  liquifyRadius: number;
  liquifyStrength: number;
  liveDraftShapeKind: DrawShapeKind | "freehand" | null | undefined;
  magicResizeStrategy: MagicResizeStrategy;
  marqueeIds: string[];
  masterEditMode: boolean;
  mobileKeyboardInset: number;
  mobileInspectorSnap: StudioMobileSheetSnap;
  mobileSheet: StudioMobileSheet;
  nodeEditHandles: NodeEditHandle[];
  nodeEditTool: NodeEditTool | null;
  nodeSmoothStrength: number;
  pageGrade: PageGrade;
  pageGradeActive: boolean;
  pageGradePanelOpen: boolean;
  panelGutter: number;
  panelSplitActive: boolean;
  panelSplitHint: string | null;
  panelSplitRatio: number;
  perspectiveRulerActive: boolean;
  perspectiveEyeLevelY: number | null;
  perspectiveLockHorizon: boolean;
  pixelBrushRadius: number;
  pixelBusy: boolean;
  pixelCombine: SelectionOperationMode;
  pixelForceCircle: boolean;
  pixelMagneticLasso: boolean;
  onTogglePixelMagneticLasso: () => void;
  pixelSel: PixelSelection | null;
  pixelSelectionCanRedo: boolean; pixelSelectionCanUndo: boolean;
  pixelTool: SelectionToolKind | "wand" | null;
  polyLassoSession: PolyLassoSession | null;
  postCorrection: number;
  preserveCorners: boolean;
  pressureCurve: number;
  pressureMinSize?: number;
  setPressureMinSize?: (value: number) => void;
  propsSheetRef: import("react").RefObject<HTMLElement | null>;
  puppetWarpActive: boolean;
  puppetWarpBusy: boolean;
  puppetWarpPins: PuppetPin[];
  quickShapeActive: boolean;
  recentColors: string[];
  rightResize: import("@/components/use-resizable").Resizable;
  savedBrushes: StudioSavedBrush[];
  /** Page-owned product authority shared with imports and the mobile projection. */
  openBrushLibraryRepository?: () => Promise<
    import("./brush/studio-brush-library-sqlite-repository").ProductBrushLibraryRepository
  >;
  saving: boolean;
  studioFilterPreparationBusy: boolean;
  studioLayerLiftDisabledReason: string | null;
  /**
   * Live canvas scroll offset. The minimap viewport box tracks the scroll at
   * frame rate, so it subscribes to this store instead of re-rendering the whole
   * aside from a `StudioPage` state value once per pan frame.
   */
  scrollViewportStore: StudioScrollViewportStore;
  selected: El | null;
  selectedBg3dEditSource: { readonly scene?: StudioBg3dSceneDocument; readonly legacyDataUrl?: string; } | null;
  selectedBubbleTailGeometry: import( "./lettering/studio-bubble-custom-shape").BubbleShapeGeometry | null;
  selectedContentMutationLocked: boolean;
  selectedId: string | null;
  selectedRasterSource: string | null;
  selectedWorkAssetDestructiveEditReason: string | null;
  setSelectedId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  autoColorScribbleCanvasArmed?: boolean;
  setAutoColorScribbleCanvasArmed?: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  autoColorCanvasSeedHit?: { x: number; y: number; nonce: number } | null;
  setAutoColorCanvasSeedHit?: import("react").Dispatch<
    import("react").SetStateAction<{ x: number; y: number; nonce: number } | null>
  >;
  autoColorCanvasSeedHits?: readonly { x: number; y: number; nonce: number }[] | null;
  setAutoColorCanvasSeedHits?: import("react").Dispatch<
    import("react").SetStateAction<readonly { x: number; y: number; nonce: number }[] | null>
  >;
  onAutoColorPlanImageSize?: (size: { width: number; height: number } | null) => void;
  setAdvancedFillPreview: import("react").Dispatch<import("react").SetStateAction<StudioAdvancedFillPreview | null>>;
  setAdvancedFillStatus: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setAiColorizePrompt: import("react").Dispatch<import("react").SetStateAction<string>>;
  setBg3dInitialDataUrl: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
  setBg3dInitialElementId: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
  setBg3dInitialScene: import("react").Dispatch<import("react").SetStateAction<StudioBg3dSceneDocument | undefined>>;
  setBg3dOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setBrushDynamics: import("react").Dispatch<import("react").SetStateAction<NormalizedStudioBrushDynamicsSettings>>;
  setBrushOpacity: import("react").Dispatch<import("react").SetStateAction<number>>;
  setBubbleShapeEditActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setColor: import("react").Dispatch<import("react").SetStateAction<string>>;
  setCropAspect: import("react").Dispatch<import("react").SetStateAction<CropAspectId>>;
  setCropRect: import("react").Dispatch<import("react").SetStateAction<CropRect | null>>;
  setDrawShape: import("react").Dispatch<import("react").SetStateAction<DrawShapeKind>>;
  setEyedropperActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setFilterClipboard: import("react").Dispatch<import("react").SetStateAction<Partial<ImageFilterFields> | null>>;
  setGridSize: import("react").Dispatch<import("react").SetStateAction<number>>;
  setHealCloneAligned: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setHealCloneHardness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setHealCloneOpacity: import("react").Dispatch<import("react").SetStateAction<number>>;
  setHealCloneRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setHealCloneTool: import("react").Dispatch<import("react").SetStateAction<HealCloneMode | null>>;
  setHistoryBrushActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setHistoryBrushHardness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setHistoryBrushOpacity: import("react").Dispatch<import("react").SetStateAction<number>>;
  setHistoryBrushRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setHistoryBrushSourceIndex: import("react").Dispatch<import("react").SetStateAction<number | null>>;
  setHistoryBrushSourceSrc: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setHistoryPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setFilterMaskHardness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setFilterMaskPaintActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setFilterMaskPaintMode: import("react").Dispatch<import("react").SetStateAction<FilterMaskPaintMode>>;
  setFilterMaskRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setFilterMaskStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setLayerMaskHardness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setLayerMaskPaintActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setLayerMaskPaintMode: import("react").Dispatch<import("react").SetStateAction<LayerMaskPaintMode>>;
  setLayerMaskRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setLayerMaskStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setLiquifyRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setLiquifyMode: import("react").Dispatch<import("react").SetStateAction<StudioLiquifyMode>>;
  setLiquifyStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setMagicResizeStrategy: import("react").Dispatch<import("react").SetStateAction<MagicResizeStrategy>>;
  setMenu: import("react").Dispatch<import("react").SetStateAction<StudioMenu | null>>;
  setMobileInspectorSnap: import("react").Dispatch<import("react").SetStateAction<StudioMobileSheetSnap>>;
  setMobileSheet: import("react").Dispatch<import("react").SetStateAction<StudioMobileSheet>>;
  setNodeEditTool: import("react").Dispatch<import("react").SetStateAction<NodeEditTool | null>>;
  setNodeSmoothStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPageGradePanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPanelSplitActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPanelSplitHint: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setPanelSplitRatio: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPerspectiveRulerActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPixelBrushRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPixelCombine: import("react").Dispatch<
    import("react").SetStateAction<SelectionOperationMode>
  >;
  setPixelForceCircle: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  commitPixelSelectionState: (update: PixelSelection | null | ((current: PixelSelection | null) => PixelSelection | null), operation: PixelSelectionHistoryOperation, coalesceKey?: string) => boolean;
  resetPixelSelectionState: (selection: PixelSelection | null) => void;
  undoPixelSelectionState: () => void;
  redoPixelSelectionState: () => void;
  runColorRangeApply: (opts?: { fuzziness?: number; coalesceKey?: string }) => Promise<void>;
  applyExtendedBlendMergeDown: () => Promise<void>;
  setExtendedBlendMode: import("react").Dispatch<import("react").SetStateAction<StudioExtendedBlendModeId>>;
  setExtendedBlendOpacity: import("react").Dispatch<import("react").SetStateAction<number>>;
  applyPathBooleanCombine: (op: StudioPathBooleanOp) => void;
  applyPaperVectorRefinement: (operation: "simplify" | "smooth") => void;
  cancelPaperVectorRefinement: () => void;
  enterQuickMask: () => void;
  commitQuickMask: () => void;
  exitQuickMask: () => void;
  invertQuickMask: () => void;
  onQuickMaskTintColorChange: (color: string) => void;
  onQuickMaskTintOpacityChange: (value: number) => void;
  setQuickMaskBrushMode: import("react").Dispatch<import("react").SetStateAction<QuickMaskBrushMode>>;
  setQuickMaskRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setQuickMaskHardness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setQuickMaskOpacity: import("react").Dispatch<import("react").SetStateAction<number>>;
  setColorRangeFuzziness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setColorRangePickActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setColorRangePreviewEnabled: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setColorRangeSamples: import("react").Dispatch<import("react").SetStateAction<ColorRangeSample[]>>;
  setPixelTool: import("react").Dispatch<import("react").SetStateAction<SelectionToolKind | "wand" | null>>;
  setPoserInitialDataUrl: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
  setPoserInitialElementId: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
  setPoserVrmOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPostCorrection: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPreserveCorners: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPressureCurve: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPuppetWarpActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPuppetWarpPins: import("react").Dispatch<import("react").SetStateAction<PuppetPin[]>>;
  setQuickShapeActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setRightPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setSavedBrushes: import("react").Dispatch<import("react").SetStateAction<StudioSavedBrush[]>>;
  setShapeFill: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setSharedDocumentNotice: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setShowAlignmentGuides: (visible: boolean) => void;
  setShowGrid: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setShowWebtoonGuides: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setSmudgeRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSmudgeStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setDodgeBurnExposure: import("react").Dispatch<import("react").SetStateAction<number>>;
  setDodgeBurnHardness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setDodgeBurnMode: import("react").Dispatch<import("react").SetStateAction<DodgeBurnMode>>;
  setDodgeBurnRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setDodgeBurnRange: import("react").Dispatch<import("react").SetStateAction<DodgeBurnRange>>;
  setDodgeBurnSponge: import("react").Dispatch<import("react").SetStateAction<DodgeBurnSpongeMode>>;
  setWetMixHardness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setWetMixPickup: import("react").Dispatch<import("react").SetStateAction<number>>;
  setWetMixRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setWetMixStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setWetMixWetness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSnapEnabled: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setStabilizer: import("react").Dispatch<import("react").SetStateAction<number>>;
  setStabilizerMode: import("react").Dispatch<import("react").SetStateAction<"standard" | "adaptive" | "precision">>;
  setStampTuning: import("react").Dispatch<import("react").SetStateAction<{ flow: number; hardness: number; minSize: number; } | null>>;
  setStrokeWidth: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryCenterX: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryCenterY: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryRadialCount: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryType: (value: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope" | "silk") => void;
  setTiltEnabled: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTipAngle: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTipRoundness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTool: import("react").Dispatch<import("react").SetStateAction<Tool>>;
  setUserGuides: import("react").Dispatch<import("react").SetStateAction<{ id: string; type: "v" | "h"; pos: number; }[]>>;
  setUseVelocityPressure: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setVelocitySensitivity: import("react").Dispatch<import("react").SetStateAction<number>>;
  setWandTolerance: import("react").Dispatch<import("react").SetStateAction<number>>;
  shapeFill: boolean;
  showAlignmentGuides: boolean;
  showGrid: boolean;
  showWebtoonGuides: boolean;
  smudgeActive: boolean;
  smudgeBusy: boolean;
  smudgeRadius: number;
  smudgeStrength: number;
  extendedBlendBusy: boolean;
  extendedBlendMode: StudioExtendedBlendModeId;
  extendedBlendOpacity: number;
  extendedBlendUnavailableReason: string | null;
  pathBooleanBusy: boolean;
  pathBooleanUnavailableReason: string | null;
  paperVectorRefinementBusy: boolean;
  paperVectorRefinementUnavailableReason: string | null;
  dodgeBurnActive: boolean;
  dodgeBurnBusy: boolean;
  dodgeBurnExposure: number;
  dodgeBurnHardness: number;
  dodgeBurnMode: DodgeBurnMode;
  dodgeBurnRadius: number;
  dodgeBurnRange: DodgeBurnRange;
  dodgeBurnSponge: DodgeBurnSpongeMode;
  wetMixActive: boolean;
  wetMixBusy: boolean;
  wetMixHardness: number;
  wetMixPickup: number;
  wetMixRadius: number;
  wetMixStrength: number;
  wetMixWetness: number;
  snapEnabled: boolean;
  stabilizer: number;
  stabilizerMode: "standard" | "adaptive" | "precision";
  stampTuning: { flow: number; hardness: number; minSize: number; } | null;
  strokeWidth: number;
  symmetryCenterX: number;
  symmetryCenterY: number;
  symmetryRadialCount: number;
  symmetryType: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope" | "silk";
  tagsText: string;
  timelinePlaying: boolean;
  tiltEnabled: boolean;
  tipAngle: number;
  tipRoundness: number;
  title: string;
  titleInputRef: import("react").RefObject<HTMLInputElement | null>;
  tool: Tool;
  userGuides: { id: string; type: "v" | "h"; pos: number; }[];
  useVelocityPressure: boolean;
  vanishingPoints: VanishingPoint[];
  velocitySensitivity: number;
  visibleRightPanelOpen: boolean;
  wandTolerance: number;
  webtoonGuides: typeof import("./studio-webtoon-guides") | null;
  webtoonTheme: "classic" | "soft" | "vivid";
  stableHandlers: StudioInspectorAsideHandlers;
}

/** CSP식 크기 프리셋 후보 — 렌더 시 STUDIO_BRUSH_SIZE_RANGE로 클램프한 뒤 중복은 하나로 합친다. */
const STUDIO_BRUSH_SIZE_PRESETS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 50, 80, 100] as const;
/** 그리드에 노출하는 "최근 크기" 최대 개수. */
const STUDIO_BRUSH_SIZE_RECENT_LIMIT = 4;

/**
 * CSP식 클릭 크기 프리셋 그리드 — 크기 슬라이더 옆의 보조 진입점.
 * 순수 표현 컴포넌트: 값 소유는 부모(strokeWidth)에 있고, 커밋은 onCommit 한 곳으로만
 * 나간다. 범위 밖 프리셋(예: max 80에서 100)은 클램프 후 중복 제거되어 버튼이 겹치지 않는다.
 */
export function StudioBrushSizePresetGrid({
  activeSize,
  recentSizes,
  onCommit,
}: {
  activeSize: number;
  recentSizes: readonly number[];
  onCommit: (size: number) => void;
}) {
  const presetSizes = [
    ...new Set(STUDIO_BRUSH_SIZE_PRESETS.map((size) => adjustStudioBrushSize(size, 0))),
  ];
  const recentOnly = [
    ...new Set(recentSizes.map((size) => adjustStudioBrushSize(size, 0))),
  ]
    .filter((size) => !presetSizes.includes(size))
    .slice(0, STUDIO_BRUSH_SIZE_RECENT_LIMIT);
  const sizeButtonClass = (active: boolean) =>
    cn(
      "h-7 min-w-7 rounded-md border px-1 text-[0.68rem] tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
      active
        ? "border-accent/60 bg-accent-soft/50 font-semibold text-accent"
        : "border-line bg-card text-fg-2 hover:bg-raised"
    );
  return (
    <div className="space-y-1" role="group" aria-label="브러시 크기 프리셋">
      <div className="grid grid-cols-6 gap-1">
        {presetSizes.map((size) => (
          <button
            key={size}
            type="button"
            aria-pressed={activeSize === size}
            aria-label={`브러시 크기 ${size}px`}
            title={`${size}px`}
            onClick={() => onCommit(size)}
            className={sizeButtonClass(activeSize === size)}
          >
            {size}
          </button>
        ))}
      </div>
      {recentOnly.length > 0 && (
        <div className="flex items-center gap-1">
          <span className="text-[0.62rem] text-fg-3">최근</span>
          <span className="flex flex-wrap gap-1">
            {recentOnly.map((size) => (
              <button
                key={size}
                type="button"
                aria-pressed={activeSize === size}
                aria-label={`최근 브러시 크기 ${size}px`}
                title={`${size}px`}
                onClick={() => onCommit(size)}
                className={sizeButtonClass(activeSize === size)}
              >
                {size}
              </button>
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

export const StudioInspectorAside = memo(function StudioInspectorAside({
  activeSavedBrushId,
  advancedRulers,
  activeSurfaceReviewLocked,
  advancedFillActive,
  advancedFillBusy,
  advancedFillPreview,
  advancedFillReferenceLayerCount,
  advancedFillSettings,
  advancedFillStatus,
  advancedFillUnsupportedReason,
  advancedFillVisibleRasterCount,
  aiColorizeBusy,
  aiColorizeError,
  aiColorizePrompt,
  aiSettings,
  bg,
  bgGrad,
  brush,
  brushDynamics,
  brushOpacity,
  bubbleAnchorPickActive,
  bubbleShapeArmed,
  bubbleShapeEditActive,
  bubbleShapeHandles,
  bubbleShapeSelectedPointIndex,
  canvasFlipH,
  canvasH,
  canvasRotation,
  collaborationDocumentLocked,
  paperGrainKind,
  paperGrainVisible,
  color,
  colorRangeFuzziness,
  colorRangePickActive,
  colorRangePreviewEnabled,
  colorRangeSamples,
  quickMaskActive,
  quickMaskBrushMode,
  quickMaskHardness,
  quickMaskOpacity,
  quickMaskRadius,
  quickMaskTintColor,
  quickMaskTintOpacity,
  cropAspect,
  cropBusy,
  cropRect,
  currentBrushSnapshot,
  currentPageId,
  currentTemplate,
  description,
  drawMode,
  drawShape,
  drawingPaletteCancelEpoch,
  drawingPaletteLayout,
  effectFavoriteState,
  effScale,
  elementById,
  elements,
  eyedropperActive,
  filterClipboard,
  gridSize,
  groups,
  healCloneAligned,
  healCloneBusy,
  healCloneHardness,
  healCloneOpacity,
  healCloneRadius,
  healCloneSourceAnchor,
  healCloneTool,
  historyBrushActive,
  historyBrushBusy,
  historyBrushHardness,
  historyBrushOpacity,
  historyBrushRadius,
  historyBrushSourceSrc,
  historyPanelOpen,
  inspectorLayout,
  isMobile,
  isometricAngleDeg,
  isometricCellSize,
  isometricGridActive,
  isometricOriginX,
  isometricOriginY,
  filterMaskBusy,
  filterMaskHardness,
  filterMaskPaintActive,
  filterMaskPaintMode,
  filterMaskRadius,
  filterMaskStrength,
  selectedImageHasActiveFilters,
  layerMaskBusy,
  layerMaskHardness,
  layerMaskPaintActive,
  layerMaskPaintMode,
  layerMaskRadius,
  layerMaskStrength,
  layerNavigatorItems,
  localHiddenElementIds,
  soloLayerId,
  liquifyActive,
  liquifyBusy,
  liquifyMode,
  liquifyRadius,
  liquifyStrength,
  liveDraftShapeKind,
  magicResizeStrategy,
  marqueeIds,
  masterEditMode,
  mobileKeyboardInset,
  mobileInspectorSnap,
  mobileSheet,
  nodeEditHandles,
  nodeEditTool,
  nodeSmoothStrength,
  pageGrade,
  pageGradeActive,
  pageGradePanelOpen,
  panelGutter,
  panelSplitActive,
  panelSplitHint,
  panelSplitRatio,
  perspectiveRulerActive,
  perspectiveEyeLevelY,
  perspectiveLockHorizon,
  pixelBrushRadius,
  pixelBusy,
  pixelCombine,
  pixelForceCircle,
  pixelMagneticLasso,
  onTogglePixelMagneticLasso,
  pixelSel,
  pixelSelectionCanRedo,
  pixelSelectionCanUndo,
  pixelTool,
  polyLassoSession,
  postCorrection,
  preserveCorners,
  pressureCurve,
  pressureMinSize,
  setPressureMinSize,
  propsSheetRef,
  puppetWarpActive,
  puppetWarpBusy,
  puppetWarpPins,
  quickShapeActive,
  recentColors,
  rightResize,
  savedBrushes,
  openBrushLibraryRepository,
  saving,
  studioFilterPreparationBusy,
  studioLayerLiftDisabledReason,
  scrollViewportStore,
  selected,
  selectedBg3dEditSource,
  selectedBubbleTailGeometry,
  selectedContentMutationLocked,
  selectedId,
  selectedRasterSource,
  selectedWorkAssetDestructiveEditReason,
  setSelectedId,
  autoColorScribbleCanvasArmed = false,
  setAutoColorScribbleCanvasArmed,
  autoColorCanvasSeedHit = null,
  setAutoColorCanvasSeedHit,
  autoColorCanvasSeedHits = null,
  setAutoColorCanvasSeedHits,
  onAutoColorPlanImageSize,
  setAdvancedFillPreview,
  setAdvancedFillStatus,
  setAiColorizePrompt,
  setBg3dInitialDataUrl,
  setBg3dInitialElementId,
  setBg3dInitialScene,
  setBg3dOpen,
  setBrushDynamics,
  setBrushOpacity,
  setBubbleShapeEditActive,
  setColor,
  setCropAspect,
  setCropRect,
  setDrawShape,
  setEyedropperActive,
  setFilterClipboard,
  setGridSize,
  setHealCloneAligned,
  setHealCloneHardness,
  setHealCloneOpacity,
  setHealCloneRadius,
  setHealCloneTool,
  setHistoryBrushActive,
  setHistoryBrushHardness,
  setHistoryBrushOpacity,
  setHistoryBrushRadius,
  setHistoryBrushSourceIndex,
  setHistoryBrushSourceSrc,
  setHistoryPanelOpen,
  setFilterMaskHardness,
  setFilterMaskPaintActive,
  setFilterMaskPaintMode,
  setFilterMaskRadius,
  setFilterMaskStrength,
  setLayerMaskHardness,
  setLayerMaskPaintActive,
  setLayerMaskPaintMode,
  setLayerMaskRadius,
  setLayerMaskStrength,
  setLiquifyRadius,
  setLiquifyMode,
  setLiquifyStrength,
  setMagicResizeStrategy,
  setMenu,
  setMobileInspectorSnap,
  setMobileSheet,
  setNodeEditTool,
  setNodeSmoothStrength,
  setPageGradePanelOpen,
  setPanelSplitActive,
  setPanelSplitHint,
  setPanelSplitRatio,
  setPerspectiveRulerActive,
  setPixelBrushRadius,
  setPixelCombine,
  setPixelForceCircle,
  commitPixelSelectionState, resetPixelSelectionState, undoPixelSelectionState, redoPixelSelectionState,
  runColorRangeApply,
  applyExtendedBlendMergeDown,
  setExtendedBlendMode,
  setExtendedBlendOpacity,
  applyPathBooleanCombine,
  applyPaperVectorRefinement,
  cancelPaperVectorRefinement,
  enterQuickMask,
  commitQuickMask,
  exitQuickMask,
  invertQuickMask,
  onQuickMaskTintColorChange,
  onQuickMaskTintOpacityChange,
  setQuickMaskBrushMode,
  setQuickMaskRadius,
  setQuickMaskHardness,
  setQuickMaskOpacity,
  setColorRangeFuzziness,
  setColorRangePreviewEnabled,
  setColorRangeSamples,
  setPixelTool,
  setPoserInitialDataUrl,
  setPoserInitialElementId,
  setPoserVrmOpen,
  setPostCorrection,
  setPreserveCorners,
  setPressureCurve,
  setPuppetWarpActive,
  setPuppetWarpPins,
  setQuickShapeActive,
  setRightPanelOpen,
  setSavedBrushes,
  setShapeFill,
  setSharedDocumentNotice,
  setShowAlignmentGuides,
  setShowGrid,
  setShowWebtoonGuides,
  setSmudgeRadius,
  setSmudgeStrength,
  setDodgeBurnExposure,
  setDodgeBurnHardness,
  setDodgeBurnMode,
  setDodgeBurnRadius,
  setDodgeBurnRange,
  setDodgeBurnSponge,
  setWetMixHardness,
  setWetMixPickup,
  setWetMixRadius,
  setWetMixStrength,
  setWetMixWetness,
  setSnapEnabled,
  setStabilizer,
  setStabilizerMode,
  setStampTuning,
  setStrokeWidth,
  setSymmetryCenterX,
  setSymmetryCenterY,
  setSymmetryRadialCount,
  setSymmetryType,
  setTiltEnabled,
  setTipAngle,
  setTipRoundness,
  setTool,
  setUserGuides,
  setUseVelocityPressure,
  setVelocitySensitivity,
  setWandTolerance,
  shapeFill,
  showAlignmentGuides,
  showGrid,
  showWebtoonGuides,
  smudgeActive,
  smudgeBusy,
  smudgeRadius,
  smudgeStrength,
  extendedBlendBusy,
  extendedBlendMode,
  extendedBlendOpacity,
  extendedBlendUnavailableReason,
  pathBooleanBusy,
  pathBooleanUnavailableReason,
  paperVectorRefinementBusy,
  paperVectorRefinementUnavailableReason,
  dodgeBurnActive,
  dodgeBurnBusy,
  dodgeBurnExposure,
  dodgeBurnHardness,
  dodgeBurnMode,
  dodgeBurnRadius,
  dodgeBurnRange,
  dodgeBurnSponge,
  wetMixActive,
  wetMixBusy,
  wetMixHardness,
  wetMixPickup,
  wetMixRadius,
  wetMixStrength,
  wetMixWetness,
  snapEnabled,
  stabilizer,
  stabilizerMode,
  stampTuning,
  strokeWidth,
  symmetryCenterX,
  symmetryCenterY,
  symmetryRadialCount,
  symmetryType,
  tagsText,
  timelinePlaying,
  tiltEnabled,
  tipAngle,
  tipRoundness,
  title,
  titleInputRef,
  tool,
  userGuides,
  useVelocityPressure,
  vanishingPoints,
  velocitySensitivity,
  visibleRightPanelOpen,
  wandTolerance,
  webtoonGuides,
  webtoonTheme,
  stableHandlers,
}: StudioInspectorAsideProps) {
  const {
    activateCanvasTool,
    activatePixelSelectionToolFromInspector,
    addProceduralArtisticBrushRaster,
    replaceDrawWithHokusaiNaturalMedia,
    addAdvancedRuler,
    addBubbleShapePointFromInspector,
    addFilterMask,
    addLayerGroup,
    addLayerMask,
    createLayerMaskFromSelection,
    addVanishingPointHandler,
    alignSelected,
    zoomToSelection,
    flipSelected,
    applyFigmaSelectionLayoutPatch,
    announceDrawingShortcut,
    applyBgPreset,
    onBrushEngineProgramsChange,
    applyBrushDefaultRestoreTransaction,
    applyBuiltInBrushPreset,
    applyContentAwareFill,
    extractPixelSelectionToLayer,
    applyCropToSelectedImage,
    applyDynamicsPreset,
    applyMagicResizePreset,
    applyPageGrade,
    applyPixelSelectionAdjust,
    applyPixelSelectionContentTransform,
    applyPuppetWarpToSelectedImage,
    applySavedBrush,
    assignElementToGroup,
    changeDrawingPaletteLayout,
    changeInspectorLayout,
    clearHealCloneSource,
    clearPolyLassoDraft,
    commit,
    createEditableRasterCopyForInspector,
    deleteFilterMask,
    deleteLayerMask,
    detachBubbleAnchor,
    disarmAllPixelTools,
    duplicateSelected,
    ensureRecentColorsLoaded,
    ensureWebtoonGuidesLoaded,
    fitBubbleToText,
    fitSelectedToFrame,
    handleLayerNavigatorAction,
    invertFilterMask,
    invertLayerMask,
    insertIsometricPrimitive,
    insertIsometricSolid,
    patchAdvancedRuler,
    moveVanishingPointById,
    previewVanishingPointById,
    setPerspectiveEyeLevelY,
    previewPerspectiveEyeLevelY,
    setPerspectiveLockHorizon,
    alignPerspectiveToEyeLevel,
    previewIsometricOrigin,
    commitIsometricOrigin,
    onColorizeSelected,
    onMinimapClick,
    onMinimapKeyDown,
    openBrushCatalog,
    openFeatureTutorial,
    openImagePastePicker,
    openStudioLayerLift,
    openStudioFilter,
    patchEl,
    patchPageGrade,
    queueBrushDelete,
    regenerateTemplate,
    rememberColor,
    rememberEffectRecent,
    removeSelected,
    removeAdvancedRuler,
    removeBubbleShapePointFromInspector,
    removeVanishingPointHandler,
    reorder,
    resetIsometricOrigin,
    resetPageGrade,
    selectLayersFromNavigator,
    selectAdvancedRuler,
    setActiveAdvancedRuler,
    setBg,
    setBgGrad,
    setCanvasH,
    setPaperGrainKind,
    setPaperGrainVisible,
    applyPaperTintBackground,
    setDescription,
    setDrawingPaletteDragging,
    setIsometricAngleDegClamped,
    setIsometricCellSizeClamped,
    previewIsometricAngleDegClamped,
    previewIsometricCellSizeClamped,
    setPanelGutter,
    setTagsText,
    setTitle,
    setWebtoonTheme,
    splitFrameSelected,
    stopTimeline,
    startEditText,
    toggleAdvancedFill,
    toggleBubbleAnchorPick,
    toggleLiquifyTool,
    toggleSmudgeTool,
    toggleDodgeBurnTool,
    toggleWetMixTool,
    toggleEffectFavorite,
    toggleFilterMaskEnabled,
    toggleIsometricGridActive,
    toggleLayerMaskEnabled,
    toggleLocalHidden,
    toggleLayerSolo,
    updateAdvancedFillSettings,
  } = stableHandlers;
  const t = useT(); // 래스터 도구 사유·라벨을 화면 경계에서 로케일로 옮길 때 쓴다.
  const selectedRasterPresentation = useStudioRasterSourcePresentation(
    selectedRasterSource,
    { consumer: "studio-inspector-selected-image" },
  );
  const selectedReadableImageSource = selectedRasterPresentation.src;
  const [activatedImageInspectorTabs, setActivatedImageInspectorTabs] = useState<
    ReadonlySet<StudioImageInspectorSection>
  >(() => new Set());
  // 서브 도구 팔레트의 "탐색 중" 탭. 적용된 브러시의 분류와 별개로, 아티스트가 다른 탭을
  // 둘러보는 상태만 기억한다(적용 자체는 activateCanvasTool + applyBuiltInBrushPreset 경유).
  const [subToolPaletteBrowsedCategory, setSubToolPaletteBrowsedCategory] = useState<
    string | null
  >(null);
  // CSP식 크기 프리셋 그리드의 "최근 크기" — 슬라이더/그리드 커밋의 마지막 고유값만
  // 컴포넌트 상태로 기억한다(별도 영속화 없음). 표시 개수 제한은 그리드가 담당한다.
  const [recentBrushSizes, setRecentBrushSizes] = useState<readonly number[]>([]);
  const rememberRecentBrushSize = (size: number) => {
    const next = adjustStudioBrushSize(size, 0);
    setRecentBrushSizes((prev) =>
      prev[0] === next ? prev : [next, ...prev.filter((s) => s !== next)].slice(0, 8)
    );
  };
  const commitBrushSizePreset = (size: number) => {
    const next = adjustStudioBrushSize(size, 0);
    setStrokeWidth(next);
    rememberRecentBrushSize(next);
  };
  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)
    ? Math.max(0, Math.round(mobileKeyboardInset))
    : 0;
  const inspectorContentMode = resolveStudioInspectorContentMode({
    tool,
    hasSelection: selected !== null || marqueeIds.length > 0,
  });
  const inspectorDrawing = inspectorContentMode === "drawing";
  const selectedSupportsImageInspectorTabs =
    !inspectorDrawing && (selected?.type === "image" || selected?.type === "draw");
  const activeImageInspectorTab =
    inspectorLayout.primary === "properties" && !inspectorDrawing
      ? inspectorLayout.image
      : null;
  const imageInspectorRouteWithoutImageSelection =
    activeImageInspectorTab !== null &&
    !selectedSupportsImageInspectorTabs;
  const inspectorTransientState: StudioInspectorTransientState = {
    advancedFillActive,
    advancedFillBusy,
    advancedFillPreviewActive: advancedFillPreview !== null,
    autoColorScribbleArmed: autoColorScribbleCanvasArmed,
    pixelToolActive: pixelTool !== null,
    polyLassoSessionActive: polyLassoSession !== null,
    colorRangePickActive,
    quickMaskActive,
    smudgeActive,
    dodgeBurnActive,
    wetMixActive,
    liquifyActive,
    healCloneActive: healCloneTool !== null,
    historyBrushActive,
    layerMaskPaintActive,
    filterMaskPaintActive,
    cropActive: cropRect !== null,
    puppetWarpActive,
    eyedropperActive,
    quickShapeActive,
    nodeEditActive: nodeEditTool !== null,
    bubbleAnchorPickActive,
    bubbleShapeEditActive,
    panelSplitActive,
  };
  const inspectorTransientOwners =
    studioInspectorTransientOwners(inspectorTransientState);
  const inspectorInteractionPolicy = resolveStudioInspectorInteractionPolicy({
    saving,
    collaborationDocumentLocked,
    activeSurfaceReviewLocked,
    selectedContentMutationLocked,
    masterEditMode,
  });
  const marqueeSelectionMutationLocked = marqueeIds.some((id) => {
    const element = elementById.get(id);
    return element ? isEffectivelyLocked(element, groups) : false;
  });
  const pathBooleanInspectorUnavailableReason =
    inspectorInteractionPolicy.global.reason ??
    (marqueeSelectionMutationLocked
      ? "선택한 도형 레이어의 잠금을 해제한 뒤 결합할 수 있어요."
      : pathBooleanUnavailableReason);
  const normalizedPageBackground = bg.trim().toLowerCase();
  const hasAuthoredPageBackground =
    (bgGrad?.length ?? 0) > 0 ||
    ![
      "",
      "#fff",
      "#ffffff",
      "rgb(255, 255, 255)",
      "rgba(255, 255, 255, 1)",
      "transparent",
      "white",
    ].includes(normalizedPageBackground);
  const rasterPreparationSummary = useMemo(() => {
    if (inspectorDrawing || inspectorLayout.primary !== "properties") return null;
    return summarizeStudioRasterPreparationSources({
      width: CANVAS_W,
      height: canvasH,
      elements,
      groups,
      theme: webtoonTheme,
      bg,
      bgGrad,
      hasPageBackground: hasAuthoredPageBackground,
    });
  }, [
    bg,
    bgGrad,
    canvasH,
    elements,
    groups,
    hasAuthoredPageBackground,
    inspectorDrawing,
    inspectorLayout.primary,
    webtoonTheme,
  ]);
  const rasterDocumentMutationBlockedReason =
    inspectorInteractionPolicy.page.reason ||
    (selected?.type !== "image"
      ? inspectorInteractionPolicy.selection.reason
      : undefined) ||
    (selected?.type !== "image" && localHiddenElementIds.size > 0
      ? "‘나만 숨기기’ 레이어를 다시 표시한 뒤 페이지 합성 복사본을 만들 수 있어요."
      : null);
  const selectedRasterAnimated =
    selected?.type === "image" &&
    (selected.isAnimatedGif || (selected.frames?.length ?? 0) > 1);
  const rasterToolContext: StudioRasterToolAvailabilityContext = {
    documentMutationBlockedReason: rasterDocumentMutationBlockedReason,
    timelinePlaying,
    selectedType: selected?.type ?? null,
    selectedHidden: selected
      ? localHiddenElementIds.has(selected.id) || isEffectivelyHidden(selected, groups)
      : false,
    selectedMutationBlockedReason:
      selected?.type === "image"
        ? selectedWorkAssetDestructiveEditReason ??
          inspectorInteractionPolicy.selection.reason ??
          null
        : null,
    selectedMutationRecovery: selectedWorkAssetDestructiveEditReason ? "copy" : "unlock",
    selectedAnimated: selectedRasterAnimated,
    visibleEditableRasterCount: rasterPreparationSummary?.visibleUnlockedRasterCount ?? 0,
    visibleVectorDrawCount: rasterPreparationSummary?.visibleVectorDrawCount ?? 0,
    exactRenderableVisibleCount: rasterPreparationSummary?.exactRenderableVisibleCount ?? 0,
    unsupportedVisibleCount: rasterPreparationSummary?.unsupportedVisibleCount ?? 0,
    hiddenContentCount:
      (rasterPreparationSummary?.hiddenContentCount ?? 0) + localHiddenElementIds.size,
    hasPageBackground: rasterPreparationSummary?.hasPageBackground ?? true,
    hasPixelSelection: isSelectionUsable(pixelSel),
    hasCloneSource: healCloneSourceAnchor !== null,
    hasHistorySource: historyBrushSourceSrc !== null,
    hasPuppetDisplacement: !isPuppetWarpNoop(puppetWarpPins),
    hasCropChange: cropRect !== null && !isCropRectNoop(cropRect),
  };
  const lockedCompositeSourceReason =
    (rasterPreparationSummary?.lockedVisibleSourceIds.length ?? 0) > 0
      ? "페이지 합성본으로 바꿀 표시 레이어 중 잠긴 레이어가 있습니다. 해당 레이어의 잠금을 해제한 뒤 다시 시도하세요."
      : null;
  const activeInspectorPixelSelectionTool: StudioInspectorPixelSelectionToolId | null =
    colorRangePickActive
      ? "color-range"
      : pixelTool === "ellipse"
        ? pixelForceCircle
          ? "circle"
          : "ellipse"
        : pixelTool;
  const rasterAvailability = (
    id: Parameters<typeof resolveStudioRasterToolAvailability>[0],
    busy = false,
  ) =>
    resolveStudioRasterToolAvailability(id, {
      ...rasterToolContext,
      documentMutationBlockedReason:
        rasterToolContext.documentMutationBlockedReason ??
        (id === "filter" || id === "paint-bucket"
          ? null
          : lockedCompositeSourceReason),
      busy,
    });
  const rasterAvailabilityForTab = (
    tab: StudioImageInspectorSection,
  ) => {
    switch (tab) {
      case "quick":
        return [rasterAvailability("filter", studioFilterPreparationBusy)];
      case "fill":
        return [rasterAvailability("paint-bucket", advancedFillBusy)];
      case "retouch":
        return [
          rasterAvailability("pixel-marquee", pixelBusy),
          rasterAvailability("smudge", smudgeBusy),
          rasterAvailability("dodge-burn", dodgeBurnBusy),
          rasterAvailability("wet-mix", wetMixBusy),
          rasterAvailability("liquify", liquifyBusy),
          rasterAvailability("heal", healCloneBusy),
        ];
      case "mask":
        return [rasterAvailability("layer-mask", layerMaskBusy || filterMaskBusy)];
      case "transform":
        return [
          rasterAvailability("crop", cropBusy),
          rasterAvailability("pixel-transform", pixelBusy),
          rasterAvailability("puppet-warp", puppetWarpBusy),
      ];
    }
  };
  const activeImageRasterAvailability = activeImageInspectorTab
    ? rasterAvailabilityForTab(activeImageInspectorTab)[0]
    : null;
  // 사유·라벨은 저자형 한국어로 만들고 **화면 경계에서만** 옮긴다(필터 사유와 같은 관례) — 한국어이거나 표에 없으면 원문 그대로.
  const activeImageRasterPolicy = activeImageRasterAvailability
    ? localizeStudioInspectorRasterPolicy(
        resolveStudioInspectorRasterToolPolicy(activeImageRasterAvailability),
        t,
      )
    : null;
  const editableRasterCandidates = elements.filter(
    (element): element is ImageEl =>
      element.type === "image" &&
      !localHiddenElementIds.has(element.id) &&
      !isEffectivelyHidden(element, groups) &&
      !isEffectivelyLocked(element, groups),
  );
  const handleRasterRecovery = (request: StudioRasterRecoveryRequest): void => {
    switch (request.action.id) {
      case "select-only-raster-layer": {
        if (editableRasterCandidates.length === 1) {
          selectLayersFromNavigator([editableRasterCandidates[0]!.id]);
          announceDrawingShortcut(`${request.toolId} 대상 이미지 레이어를 선택했어요`);
          return;
        }
        disarmAllPixelTools();
        changeInspectorLayout({ ...inspectorLayout, primary: "layers" });
        return;
      }
      case "select-raster-layer":
      case "show-hidden-layers":
      case "resolve-document-lock":
        disarmAllPixelTools();
        changeInspectorLayout({ ...inspectorLayout, primary: "layers" });
        return;
      case "show-selected-layer":
        if (selected && localHiddenElementIds.has(selected.id)) {
          toggleLocalHidden(selected.id);
          announceDrawingShortcut("나만 숨긴 선택 레이어를 다시 표시했어요");
          return;
        }
        if (selected && selected.hidden === true) {
          patchEl(selected.id, { hidden: false } as Partial<El>);
          announceDrawingShortcut("선택 레이어를 표시했어요");
          return;
        }
        disarmAllPixelTools();
        changeInspectorLayout({ ...inspectorLayout, primary: "layers" });
        return;
      case "unlock-selected-layer":
        if (selected && selected.locked === true) {
          patchEl(selected.id, { locked: false } as Partial<El>);
          announceDrawingShortcut("선택 레이어 잠금을 해제했어요");
          return;
        }
        disarmAllPixelTools();
        changeInspectorLayout({ ...inspectorLayout, primary: "layers" });
        return;
      case "create-editable-raster-copy":
      case "create-selected-static-copy":
        void createEditableRasterCopyForInspector(request.toolId);
        return;
      case "add-or-import-content":
        openImagePastePicker();
        return;
      case "stop-timeline":
        stopTimeline();
        return;
      case "make-pixel-selection":
        disarmAllPixelTools();
        setTool("select");
        setPixelForceCircle(false);
        setPixelTool("rect");
        changeInspectorLayout({ ...inspectorLayout, primary: "properties", image: "retouch" });
        return;
      case "pick-clone-source":
        disarmAllPixelTools();
        setTool("select");
        setHealCloneTool("clone");
        changeInspectorLayout({ ...inspectorLayout, primary: "properties", image: "retouch" });
        return;
      case "pick-history-source":
        setHistoryPanelOpen(true);
        return;
      case "move-puppet-pin":
      case "adjust-crop-area":
        changeInspectorLayout({ ...inspectorLayout, primary: "properties", image: "transform" });
        return;
      case "retry-when-idle":
        announceDrawingShortcut("현재 작업이 끝나면 같은 도구를 다시 눌러 주세요");
        return;
    }
  };

  useEffect(() => {
    if (!activeImageInspectorTab) return;
    setActivatedImageInspectorTabs((current) => {
      if (current.has(activeImageInspectorTab)) return current;
      const next = new Set(current);
      next.add(activeImageInspectorTab);
      return next;
    });
  }, [activeImageInspectorTab]);

  // 메뉴 '레이어 ▸ 경계 효과…'의 열기 신호 — 호스트 시임(StudioPage) 없이
  // studio-companion-add-text와 같은 창 이벤트 브리지로 받아 레이어 탭을 연다(2026-08-20).
  useEffect(() => {
    const openLayerBorderEffectPanel = () => {
      changeInspectorLayout({ ...inspectorLayout, primary: "layers" });
    };
    window.addEventListener(STUDIO_LAYER_BORDER_EFFECT_OPEN_EVENT, openLayerBorderEffectPanel);
    return () => {
      window.removeEventListener(STUDIO_LAYER_BORDER_EFFECT_OPEN_EVENT, openLayerBorderEffectPanel);
    };
  }, [inspectorLayout, changeInspectorLayout]);

  const shouldMountImageInspectorTab = (tab: StudioImageInspectorSection) =>
    activeImageInspectorTab === tab || activatedImageInspectorTabs.has(tab);
  const activeInspectorBrushId = currentBrushSnapshot.sourcePresetId ?? brush;
  const activeInspectorBrushName =
    currentBrushSnapshot.sourcePresetName
    ?? BRUSH_PRESETS.find((preset) => preset.id === brush)?.name
    ?? brush;
  // 표시 중인 서브 도구 탭 — 탐색 중이면 그 탭, 아니면 적용된 브러시의 소속 분류,
  // 팔레트 밖 브러시면 지우개 모드에 한해 지우개 탭, 그 외엔 기본 탭.
  const subToolPaletteCategory =
    subToolPaletteBrowsedCategory
    ?? studioSubToolPaletteCategoryIdForBrushId(activeInspectorBrushId)
    ?? (drawMode === "eraser" ? "eraser" : STUDIO_SUB_TOOL_PALETTE_DEFAULT_CATEGORY_ID);
  const canvasControlsDisabled = inspectorInteractionPolicy.page.disabled;
  const drawingAssistControlsDisabled = inspectorInteractionPolicy.page.disabled;
  const drawingAssistDisabledReason = inspectorInteractionPolicy.page.reason;
  const rightPanelDisabledReasons = inspectorInteractionPolicy.reasons;
  const withCanvasControlsGuard = <TArgs extends readonly unknown[]>(callback: (...args: TArgs) => void) =>
    (...args: TArgs) => {
      if (canvasControlsDisabled) return;
      callback(...args);
    };
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
          <div className="hidden items-center justify-between gap-1 lg:flex">
            <span className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-fg-3">인스펙터</span>
            <button
              type="button"
              onClick={() => setRightPanelOpen(false)}
              className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[0.65rem] text-fg-3 transition-colors hover:bg-raised hover:text-fg"
              title="속성 패널 접기"
            >
              접기 <ChevronRight size={12} />
            </button>
          </div>
          {/*
            통합 Command Search 진입점. 감사 §2.8 이 센 네 개의 부분 검색창을
            대신하고, 인스펙터가 접은 Advanced 컨트롤의 대체 도달 경로이기도
            하다(F1).
          */}
          {/* 명령 검색 결과를 실제 도움말 목적지에 연결해 클릭·Enter no-op을 막는다. */}
          <StudioCommandSearchHost
            hideTrigger={isMobile}
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
          {/* Outside the `selected` branch on purpose: a marquee selection has no single
              `selected` element, and position/flip/frame are exactly what it needs. */}
          {inspectorContentMode === "selection" && (
            <div hidden={inspectorLayout.primary !== "properties"}>
              <StudioFigmaDesignPanel
                metrics={resolveStudioFigmaSelectionLayoutMetrics(
                  selectStudioFigmaDesignTargets(elements, marqueeIds, selected),
                )}
                disabled={inspectorInteractionPolicy.selection.disabled}
                onChange={applyFigmaSelectionLayoutPatch}
                onZoomToSelection={zoomToSelection}
                onFlipHorizontal={() => flipSelected("horizontal")}
                onFlipVertical={() => flipSelected("vertical")}
              />
            </div>
          )}

          {inspectorContentMode === "selection" && selected && (
            <div
              role="tabpanel"
              aria-label="선택 요소 속성"
              data-testid="studio-inspector-context-selection"
              hidden={inspectorLayout.primary !== "properties"}
              className="rounded-xl border border-line bg-panel/40 p-3"
            >
              <StudioInspectorMutationLockNotice
                gate={inspectorInteractionPolicy.selection}
                hasActiveSession={inspectorTransientOwners.length > 0}
                onExit={disarmAllPixelTools}
              />
              {inspectorInteractionPolicy.selection.disabled && activeImageInspectorTab ? (
                <div className="mb-3">
                  <StudioRasterToolRecoveryPanel
                    entries={rasterAvailabilityForTab(activeImageInspectorTab).map((entry) =>
                      localizeStudioRasterToolAvailability(entry, t),
                    )}
                    busy={studioFilterPreparationBusy}
                    onRecover={handleRasterRecovery}
                  />
                </div>
              ) : null}
              {paperVectorRefinementBusy && inspectorInteractionPolicy.selection.disabled ? (
                <button
                  type="button"
                  aria-label="잠긴 경로 정리 취소"
                  onClick={cancelPaperVectorRefinement}
                  className="mb-3 min-h-11 w-full rounded-lg border border-danger/35 bg-danger/10 px-3 py-2 text-xs font-semibold text-danger"
                >
                  경로 정리 취소
                </button>
              ) : null}
              <fieldset
                disabled={inspectorInteractionPolicy.selection.disabled}
                title={inspectorInteractionPolicy.selection.reason}
                className="m-0 min-w-0 border-0 p-0 disabled:[&_button]:cursor-not-allowed disabled:[&_button]:opacity-50 disabled:[&_input]:cursor-not-allowed disabled:[&_input]:opacity-55 disabled:[&_select]:cursor-not-allowed disabled:[&_select]:opacity-55 disabled:[&_textarea]:cursor-not-allowed disabled:[&_textarea]:opacity-55"
              >
                <legend className="sr-only">선택 요소 편집 설정</legend>
                <Suspense fallback={<StudioPanelLoading label="속성 패널을 여는 중..." />}>
                <p className="mb-2 text-xs font-semibold text-fg-3">선택한 요소</p>

              {selected.type === "draw" && (
                <StudioInspectorSection sectionId="element.shape-style" loadingLabel="도형 스타일을 여는 중...">
                <div className="space-y-3">
                  <StudioInspectorSelectionStrokeControls
                    selected={selected}
                    patchEl={patchEl}
                  />
                  {(selected.kind === "rect" ||
                    selected.kind === "ellipse" ||
                    selected.kind === "star" ||
                    selected.kind === "triangle" ||
                    selected.kind === "polygon") && (
                    <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
                      <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">채우기</p>
                      <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        채우기 색상
                        <input
                          type="color"
                          value={selected.fill || "#ffffff"}
                          aria-label="채우기 색상"
                          onChange={(e) => patchEl(selected.id, { fill: e.target.value } as Partial<El>)}
                          className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                        />
                      </div>
                      {(selected.kind === "rect" || selected.kind === "ellipse" || selected.kind === "star") && (
                        <StudioGradientEnginePanel
                          value={selected.gradient ?? null}
                          onChange={(spec) => patchEl(selected.id, { gradient: spec ?? undefined } as Partial<El>)}
                          title="그라데이션 채우기"
                        />
                      )}
                      <div className="border-t border-line/40 pt-2.5">
                        <StudioPatternFillPanel
                          value={selected.pattern ?? null}
                          onChange={(spec) => patchEl(selected.id, { pattern: spec ?? undefined } as Partial<El>)}
                        />
                      </div>
                    </div>
                  )}
                  {selected.kind && selected.kind !== "freehand" && (
                    <div className="mt-2.5 border-t border-line/40 pt-2.5">
                      <Suspense fallback={<StudioPanelLoading label="선 스타일 패널을 여는 중..." />}>
                        <StudioStrokeShapePanel
                          kind={selected.kind}
                          strokeStyle={normalizeStrokeStyle(selected.strokeStyle)}
                          shapeParams={normalizeShapeParams(selected.shapeParams)}
                          sketch={studioSketchStyleOfElement(selected) ?? DEFAULT_STUDIO_SKETCH_STYLE}
                          onPatchStrokeStyle={(patch) =>
                            patchEl(selected.id, {
                              strokeStyle: { ...normalizeStrokeStyle(selected.strokeStyle), ...patch },
                            } as Partial<El>)
                          }
                          onPatchShapeParams={(patch) =>
                            patchEl(selected.id, {
                              shapeParams: { ...normalizeShapeParams(selected.shapeParams), ...patch },
                            } as Partial<El>)
                          }
                          onPatchSketch={(patch) =>
                            patchEl(selected.id, {
                              sketch: {
                                ...(studioSketchStyleOfElement(selected) ?? DEFAULT_STUDIO_SKETCH_STYLE),
                                ...patch,
                              },
                            } as Partial<El>)
                          }
                        />
                      </Suspense>
                    </div>
                  )}
                  {(selected.kind ?? "freehand") === "freehand" && (
                    <StudioInspectorFreehandPathControls
                      selected={selected} nodeEditTool={nodeEditTool} nodeEditHandleCount={nodeEditHandles.length} nodeSmoothStrength={nodeSmoothStrength}
                      refinementBusy={paperVectorRefinementBusy} refinementUnavailableReason={paperVectorRefinementUnavailableReason}
                      currentColor={color} documentWidth={CANVAS_W} documentHeight={canvasH}
                      pageId={currentPageId} masterEditMode={masterEditMode}
                      locks={{ collaboration: collaborationDocumentLocked,
                        surfaceReview: activeSurfaceReviewLocked,
                        selectedContent: selectedContentMutationLocked }}
                      onToggleNodeEdit={() => {
                        if (nodeEditTool) { setNodeEditTool(null); return; }
                        disarmAllPixelTools(); setNodeEditTool("move");
                      }}
                      onNodeEditToolChange={setNodeEditTool} onNodeSmoothStrengthChange={setNodeSmoothStrength}
                      onRequestSelectStroke={() => {
                        setNodeEditTool(null); disarmAllPixelTools(); setTool("select");
                        announceDrawingShortcut("경로를 정리할 자유곡선 선화를 선택하세요 · Esc로 취소");
                      }}
                      onRefine={applyPaperVectorRefinement} onCancelRefinement={cancelPaperVectorRefinement}
                      onReplace={replaceDrawWithHokusaiNaturalMedia}
                    />
                  )}
                </div>
                </StudioInspectorSection>
              )}

              {(selected.type === "text" || selected.type === "bubble") && (
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  글자색
                  <input
                    type="color"
                    value={(selected.type === "text" ? selected.fill : selected.textFill) || "#16100c"}
                    onChange={(e) => patchEl(selected.id, (selected.type === "text" ? { fill: e.target.value } : { textFill: e.target.value }) as Partial<El>)}
                    className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                  />
                </label>
              )}

              {selected.type === "text" && (
                <StudioInspectorSection sectionId="element.text-fill" loadingLabel="글자 채우기 스타일을 여는 중...">
                <div className="space-y-2.5">

                  <div className="flex gap-1.5 bg-card rounded-lg p-0.5 border border-line">
                    {[
                      { label: "단색 채우기", v: "solid" },
                      { label: "그라데이션", v: "gradient" }
                    ].map((mode) => (
                      <button
                        key={mode.v}
                        type="button"
                        onClick={() => patchEl(selected.id, { fillType: mode.v as "solid" | "gradient" } as Partial<El>)}
                        className={cn(
                          "flex-1 rounded py-1 text-[0.68rem] font-semibold transition-colors",
                          (selected.fillType ?? "solid") === mode.v
                            ? "bg-accent text-on-accent"
                            : "text-fg-2 hover:bg-raised"
                        )}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>

                  {(selected.fillType ?? "solid") === "gradient" && (
                    <div className="space-y-2 pt-1">
                      <StudioGradientEnginePanel
                        value={selected.gradient ?? legacyTextGradientToSpec(selected.gradientColorStart, selected.gradientColorEnd, selected.gradientDirection)}
                        onChange={(spec) => patchEl(selected.id, { gradient: spec ?? undefined } as Partial<El>)}
                        allowClear={false}
                        title="그라데이션 편집"
                      />

                    </div>
                  )}
                </div>
                </StudioInspectorSection>
              )}
              {selected.type === "bubble" && (
                <StudioInspectorSection sectionId="element.bubble" loadingLabel="말풍선 설정을 여는 중...">
              {selected.type === "bubble" && (
                <StudioInspectorBubbleAppearanceControls
                  recentColors={recentColors}
                  selected={selected}
                  webtoonTheme={webtoonTheme}
                  onEnsureRecentColorsLoaded={ensureRecentColorsLoaded}
                  onPatch={(patch) => patchEl(selected.id, patch as Partial<El>)}
                  onRememberColor={rememberColor}
                />
              )}
              {selected.type === "bubble" && (
                <StudioInspectorBubbleShapeControls
                  active={bubbleShapeArmed}
                  editActive={bubbleShapeEditActive}
                  mutationLocked={inspectorInteractionPolicy.selection.disabled}
                  onAddPoint={addBubbleShapePointFromInspector}
                  onDisarmPixelTools={disarmAllPixelTools}
                  onPatch={(patch) => patchEl(selected.id, patch as Partial<El>)}
                  onRemovePoint={removeBubbleShapePointFromInspector}
                  onSetEditActive={setBubbleShapeEditActive}
                  pointCount={bubbleShapeHandles.length}
                  selected={selected}
                  selectedPointIndex={bubbleShapeSelectedPointIndex}
                  webtoonTheme={webtoonTheme}
                />
              )}
              {selected.type === "bubble" &&
                selected.variant !== "shout" &&
                selected.variant !== "box" &&
                !hasCustomBubbleShape(selected.customShapePoints) && (
                <Suspense fallback={null}>
                  <StudioBubbleTailControls
                    tail={selected.tail ?? "left"}
                    direction={selected.tailDirection ?? "bottom"}
                    ratio={selected.tailXRatio ?? 0.35}
                    length={selected.tailHeight ?? 30}
                    base={selectedBubbleTailGeometry?.tailSpec?.base ?? selected.tailBase ?? 18}
                    bend={selected.tailBend ?? 0}
                    extraTails={normalizeExtraTails(selected.extraTails)}
                    anchored={Boolean(selected.tailAnchorId || selected.tailAnchorPoint)}
                    allowMultiple={selected.variant !== "double"}
                    onPatchPrimary={(patch) => patchEl(selected.id, patch as Partial<El>)}
                    onChangeExtraTails={(tails) =>
                      patchEl(selected.id, {
                        extraTails: tails.length > 0 ? [...tails] : undefined,
                      } as Partial<El>)
                    }
                  />
                </Suspense>
              )}
              {selected.type === "bubble" &&
                selected.variant !== "shout" &&
                selected.variant !== "box" &&
                !hasCustomBubbleShape(selected.customShapePoints) &&
                (selected.tail ?? "left") !== "none" && (
                <Suspense fallback={null}>
                  <StudioBubbleAnchorPanel
                    anchorId={selected.tailAnchorId ?? null}
                    anchorPoint={selected.tailAnchorPoint ?? null}
                    anchorTargetLabel={
                      selected.tailAnchorId
                        ? (() => {
                            const t = elementById.get(selected.tailAnchorId);
                            return t ? elementLabel(t) : null;
                          })()
                        : null
                    }
                    pickActive={bubbleAnchorPickActive}
                    onTogglePick={toggleBubbleAnchorPick}
                    onDetach={detachBubbleAnchor}
                  />
                </Suspense>
              )}
                </StudioInspectorSection>
              )}
              {(selected.type === "text" || selected.type === "bubble") && (
                <StudioInspectorSection sectionId="element.typography" loadingLabel="타이포그래피를 여는 중...">
              {(selected.type === "text" || selected.type === "bubble") && (
                <>
                  <div className="mt-2">
                    <p className="mb-1 text-[0.66rem] font-medium text-fg-3">글꼴</p>
                    <StudioPresetFontPreload />
                    <div className="flex flex-wrap gap-1">
                      {BRAND_KIT_FONTS.map((f) => (
                        <button
                          key={f.label}
                          type="button"
                          onClick={() => patchEl(selected.id, { font: f.value } as Partial<El>)}
                          style={{ fontFamily: f.value }}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs",
                            (selected.font ?? DEFAULT_BRAND_KIT_FONT) === f.value
                              ? "border-accent/60 bg-accent-soft/50 text-fg"
                              : "border-line text-fg-2 hover:bg-raised"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 border-t border-line/30 pt-3">
                    <StudioCustomFontsPanel
                      canApplyFont
                      onApplyFont={(font) => patchEl(selected.id, { font } as Partial<El>)}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                    글자 크기
                    <div className="flex items-center gap-1">
                      {[-4, 4].map((d) => (
                        <button
                          key={d}
                          type="button"
                          aria-label={d < 0 ? "글자 작게" : "글자 크게"}
                          onClick={() => {
                            const cur = selected.type === "text" ? selected.fontSize : selected.fontSize ?? 24;
                            patchEl(selected.id, { fontSize: Math.max(12, Math.min(96, cur + d)) } as Partial<El>);
                          }}
                          className="grid size-7 place-items-center rounded-md border border-line text-fg-2 hover:bg-raised"
                        >
                          {d < 0 ? "−" : "+"}
                        </button>
                      ))}
                      <span className="w-7 text-center text-xs tabular-nums text-fg-3">
                        {selected.type === "text" ? selected.fontSize : selected.fontSize ?? 24}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-4 border-t border-line/30 pt-2.5">
                    <div>
                      <p className="mb-1 text-[0.66rem] font-medium text-fg-3">정렬</p>
                      <div className="flex gap-0.5 rounded-lg border border-line bg-panel p-0.5">
                        {(["left", "center", "right"] as const).map((a) => {
                          const active = (selected.align ?? (selected.type === "text" ? "left" : "center")) === a;
                          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
                          return (
                            <button
                              key={a}
                              type="button"
                              onClick={() => patchEl(selected.id, { align: a } as Partial<El>)}
                              className={cn(
                                "grid size-7 place-items-center rounded transition-colors cursor-pointer",
                                active ? "bg-accent text-on-accent shadow-sm" : "text-fg-3 hover:bg-raised hover:text-fg-2"
                              )}
                              title={`${a === "left" ? "왼쪽" : a === "center" ? "가운데" : "오른쪽"} 정렬`}
                            >
                              <Icon size={14} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[0.66rem] font-medium text-fg-3">스타일</p>
                      <div className="flex gap-0.5 rounded-lg border border-line bg-panel p-0.5">
                        {(() => {
                          const fsVal = selected.fontStyle ?? "bold";
                          const isBold = fsVal.includes("bold");
                          const isItalic = fsVal.includes("italic");
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  let nextStyle: "normal" | "bold" | "italic" | "bold italic";
                                  if (isBold) {
                                    nextStyle = isItalic ? "italic" : "normal";
                                  } else {
                                    nextStyle = isItalic ? "bold italic" : "bold";
                                  }
                                  patchEl(selected.id, { fontStyle: nextStyle } as Partial<El>);
                                }}
                                className={cn(
                                  "grid size-7 place-items-center rounded transition-colors cursor-pointer",
                                  isBold ? "bg-accent/20 text-accent font-bold border border-accent/35" : "text-fg-3 hover:bg-raised hover:text-fg-2"
                                )}
                                title="굵게"
                              >
                                <Bold size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  let nextStyle: "normal" | "bold" | "italic" | "bold italic";
                                  if (isItalic) {
                                    nextStyle = isBold ? "bold" : "normal";
                                  } else {
                                    nextStyle = isBold ? "bold italic" : "italic";
                                  }
                                  patchEl(selected.id, { fontStyle: nextStyle } as Partial<El>);
                                }}
                                className={cn(
                                  "grid size-7 place-items-center rounded transition-colors cursor-pointer",
                                  isItalic ? "bg-accent/20 text-accent font-bold border border-accent/35" : "text-fg-3 hover:bg-raised hover:text-fg-2"
                                )}
                                title="기울임꼴"
                              >
                                <Italic size={14} />
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </>
              )}
              {selected.type === "text" && (
                <div className="mt-2.5 border-t border-line/40 pt-2.5">
                  <Suspense fallback={<StudioPanelLoading label="글자 효과 패널을 여는 중..." />}>
                    <StudioTextEffectPanel onApply={(patch) => patchEl(selected.id, patch as Partial<El>)} />
                  </Suspense>
                </div>
              )}
              {selected.type === "text" && (
                <div className="mt-2.5 border-t border-line/40 pt-2.5">
                  <Suspense fallback={<StudioPanelLoading label="곡선 텍스트 패널을 여는 중..." />}>
                    <StudioTextPathPanel
                      value={normalizeTextPath(selected.textPath)}
                      onPatch={(patch: Partial<TextPathConfig>) =>
                        patchEl(selected.id, {
                          textPath: normalizeTextPath({ ...normalizeTextPath(selected.textPath), ...patch }),
                        } as Partial<El>)
                      }
                      onApplyPreset={(v: TextPathConfig) => patchEl(selected.id, { textPath: v } as Partial<El>)}
                      onReset={() => patchEl(selected.id, { textPath: undefined } as Partial<El>)}
                    />
                  </Suspense>
                </div>
              )}
              {selected.type === "text" && (
                <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">글자 외곽선 (Border)</p>

                  <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    외곽선 사용
                    <input
                      type="checkbox"
                      checked={!!selected.stroke}
                      aria-label="글자 외곽선 사용"
                      onChange={(e) => {
                        const hasStroke = e.target.checked;
                        patchEl(selected.id, {
                          stroke: hasStroke ? (selected.stroke || "#ffffff") : undefined,
                          strokeWidth: hasStroke ? (selected.strokeWidth || 3) : 0,
                        } as Partial<El>);
                      }}
                      className="size-4 accent-accent cursor-pointer"
                    />
                  </div>

                  {!!selected.stroke && (
                    <>
                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        외곽선 색상
                        <input
                          type="color"
                          value={selected.stroke || "#ffffff"}
                          onChange={(e) => patchEl(selected.id, { stroke: e.target.value } as Partial<El>)}
                          className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        외곽선 두께
                        <span className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.5}
                            max={16}
                            step={0.5}
                            value={selected.strokeWidth ?? 3}
                            onChange={(e) => patchEl(selected.id, { strokeWidth: Number(e.target.value) } as Partial<El>)}
                            className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                          />
                          <span className="w-8 text-right text-xs tabular-nums text-fg-3">{(selected.strokeWidth ?? 3).toFixed(1)}px</span>
                        </span>
                      </label>
                    </>
                  )}
                </div>
              )}
              {selected.type === "text" && (
                <div className="mt-3 space-y-2">
                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    자간
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={-2}
                        max={12}
                        step={0.5}
                        value={selected.letterSpacing ?? 0}
                        onChange={(e) => patchEl(selected.id, { letterSpacing: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                      />
                      <span className="w-7 text-right text-xs tabular-nums text-fg-3">{selected.letterSpacing ?? 0}</span>
                    </span>
                  </label>
                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    행간
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.8}
                        max={2}
                        step={0.1}
                        value={selected.lineHeight ?? 1}
                        onChange={(e) => patchEl(selected.id, { lineHeight: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                      />
                      <span className="w-7 text-right text-xs tabular-nums text-fg-3">{(selected.lineHeight ?? 1).toFixed(1)}</span>
                    </span>
                  </label>
                </div>
              )}
              {selected.type === "text" && (
                <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">글자 그림자 (Shadow)</p>

                  <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    그림자 사용
                    <input
                      type="checkbox"
                      checked={!!selected.shadowColor}
                      aria-label="글자 그림자 사용"
                      onChange={(e) => {
                        const hasShadow = e.target.checked;
                        patchEl(selected.id, {
                          shadowColor: hasShadow ? (selected.shadowColor || "#000000") : undefined,
                          shadowBlur: hasShadow ? (selected.shadowBlur || 5) : undefined,
                          shadowOffsetX: hasShadow ? (selected.shadowOffsetX || 3) : undefined,
                          shadowOffsetY: hasShadow ? (selected.shadowOffsetY || 3) : undefined,
                          shadowOpacity: hasShadow ? (selected.shadowOpacity || 0.6) : undefined,
                        } as Partial<El>);
                      }}
                      className="size-4 accent-accent cursor-pointer"
                    />
                  </div>

                  {!!selected.shadowColor && (
                    <>
                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        그림자 색상
                        <input
                          type="color"
                          value={selected.shadowColor || "#000000"}
                          onChange={(e) => patchEl(selected.id, { shadowColor: e.target.value } as Partial<El>)}
                          className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                        />
                      </label>

                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        흐림 정도 (Blur)
                        <span className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={20}
                            step={1}
                            value={selected.shadowBlur ?? 5}
                            onChange={(e) => patchEl(selected.id, { shadowBlur: Number(e.target.value) } as Partial<El>)}
                            className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                          />
                          <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowBlur ?? 5}px</span>
                        </span>
                      </label>

                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        가로 오프셋 (X)
                        <span className="flex items-center gap-2">
                          <input
                            type="range"
                            min={-15}
                            max={15}
                            step={1}
                            value={selected.shadowOffsetX ?? 3}
                            onChange={(e) => patchEl(selected.id, { shadowOffsetX: Number(e.target.value) } as Partial<El>)}
                            className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                          />
                          <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowOffsetX ?? 3}px</span>
                        </span>
                      </label>

                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        세로 오프셋 (Y)
                        <span className="flex items-center gap-2">
                          <input
                            type="range"
                            min={-15}
                            max={15}
                            step={1}
                            value={selected.shadowOffsetY ?? 3}
                            onChange={(e) => patchEl(selected.id, { shadowOffsetY: Number(e.target.value) } as Partial<El>)}
                            className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                          />
                          <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowOffsetY ?? 3}px</span>
                        </span>
                      </label>

                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        불투명도
                        <span className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0.1}
                            max={1}
                            step={0.05}
                            value={selected.shadowOpacity ?? 0.6}
                            onChange={(e) => patchEl(selected.id, { shadowOpacity: Number(e.target.value) } as Partial<El>)}
                            className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                          />
                          <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.shadowOpacity ?? 0.6) * 100)}%</span>
                        </span>
                      </label>
                    </>
                  )}
                </div>
              )}
                </StudioInspectorSection>
              )}
              {/* 안이 전부 비면 헤더만 남으므로, 하나라도 그려질 때만 섹션을 낸다. */}
              {selected.type !== "frame" &&
                (selected.type === "image" ||
                  selected.type === "bubble" ||
                  containingPanel(selected, elements)) && (
              <StudioInspectorSection sectionId="element.constraints" loadingLabel="배치 제약을 여는 중...">
              {containingPanel(selected, elements) && (
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  패널 안에 가두기
                  <input
                    type="checkbox"
                    checked={!selected.noClip}
                    onChange={(e) => patchEl(selected.id, { noClip: !e.target.checked } as Partial<El>)}
                    className="size-4 accent-accent"
                  />
                </label>
              )}
              {selected.type === "image" && (
                <button
                  type="button"
                  onClick={() => void fitSelectedToFrame()}
                  className="mt-2 w-full rounded-lg border border-line bg-card py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised"
                  title="이미지를 패널(없으면 캔버스)에 비율 유지하며 꽉 채웁니다"
                >
                  {containingPanel(selected, elements) ? "패널에 꽉 채우기" : "캔버스에 꽉 채우기"}
                </button>
              )}
              {(selected.type === "image" || selected.type === "bubble") && (
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  비율 잠금 (변형 시 종횡비 유지)
                  <input
                    type="checkbox"
                    checked={!!selected.lockAspect}
                    onChange={(e) => patchEl(selected.id, { lockAspect: e.target.checked } as Partial<El>)}
                    className="size-4 accent-accent cursor-pointer"
                  />
                </label>
              )}
              </StudioInspectorSection>
              )}
              {(selected.type === "text" || selected.type === "bubble") && (
                <StudioInspectorSection sectionId="element.text-align" loadingLabel="글자 정렬을 여는 중...">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    글자 정렬
                    <div className="flex gap-1">
                      {[
                        { label: "왼쪽", v: "left" },
                        { label: "가운데", v: "center" },
                        { label: "오른쪽", v: "right" },
                      ].map((a) => (
                        <button
                          key={a.v}
                          type="button"
                          onClick={() => patchEl(selected.id, { align: a.v } as Partial<El>)}
                          className={cn(
                            "rounded-md border px-2.5 py-0.5 text-xs",
                            (selected.align ?? "center") === a.v
                              ? "border-accent/60 bg-accent-soft/50 text-fg"
                              : "border-line text-fg-2 hover:bg-raised"
                          )}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2 cursor-pointer">
                    세로 쓰기 (세로 연출)
                    <input
                      type="checkbox"
                      checked={!!selected.vertical}
                      onChange={(e) => patchEl(selected.id, { vertical: e.target.checked } as Partial<El>)}
                      className="size-4 accent-accent"
                    />
                  </label>
                  {selected.type === "bubble" && (
                    <button
                      type="button"
                      onClick={() => void fitBubbleToText()}
                      className="w-full rounded-lg border border-line bg-card py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised"
                      title="말풍선 높이를 대사 길이에 맞춥니다"
                    >
                      높이를 텍스트에 맞춤
                    </button>
                  )}
                </div>
                </StudioInspectorSection>
              )}
              {selected.type !== "frame" && (
                <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                  불투명도
                  <span className="flex items-center gap-2">
                    <input
                      type="range"
                      min={10}
                      max={100}
                      value={Math.round((selected.opacity ?? 1) * 100)}
                      onChange={(e) => patchEl(selected.id, { opacity: Number(e.target.value) / 100 } as Partial<El>)}
                      className="w-28 accent-accent cursor-pointer"
                    />
                    <span className="w-9 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.opacity ?? 1) * 100)}%</span>
                  </span>
                </label>
              )}

              <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2" title="바로 아래 레이어의 영역 안으로만 보이게 잘라냅니다(채색·톤 가두기).">
                아래 레이어에 클리핑
                <input
                  type="checkbox"
                  checked={!!selected.clipBelow}
                  onChange={(e) => patchEl(selected.id, { clipBelow: e.target.checked } as Partial<El>)}
                  className="size-4 accent-accent cursor-pointer"
                />
              </label>

              <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                그룹
                <select
                  value={groupOfItem(selected, groups)?.id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__new__") addLayerGroup(selected.id);
                    else assignElementToGroup(selected.id, v || undefined);
                  }}
                  className="rounded border border-line bg-card px-2 py-1 text-xs text-fg focus-visible:outline focus-visible:outline-accent cursor-pointer max-w-[8.5rem] truncate"
                >
                  <option value="">그룹 없음</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                  <option value="__new__">+ 새 그룹</option>
                </select>
              </label>

              {selected.type !== "frame" && (
                <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                  혼합 모드 (Blend)
                  <select
                    value={selected.blendMode || "source-over"}
                    onChange={(e) => patchEl(selected.id, { blendMode: e.target.value } as Partial<El>)}
                    className="rounded border border-line bg-card px-2 py-1 text-xs text-fg focus-visible:outline focus-visible:outline-accent cursor-pointer"
                  >
                    <option value="source-over">보통 (Normal)</option>
                    <option value="multiply">곱하기 (Multiply)</option>
                    <option value="screen">스크린 (Screen)</option>
                    <option value="overlay">오버레이 (Overlay)</option>
                    <option value="darken">어둡게 (Darken)</option>
                    <option value="lighten">밝게 (Lighten)</option>
                    <option value="color-dodge">색상 닷지 (Color Dodge)</option>
                    <option value="color-burn">색상 번 (Color Burn)</option>
                    <option value="hard-light">하드 라이트 (Hard Light)</option>
                    <option value="soft-light">소프트 라이트 (Soft Light)</option>
                    <option value="difference">차이 (Difference)</option>
                    <option value="exclusion">제외 (Exclusion)</option>
                    <option value="hue">색조 (Hue)</option>
                    <option value="saturation">채도 (Saturation)</option>
                    <option value="color">색상 (Color)</option>
                    <option value="luminosity">광도 (Luminosity)</option>
                  </select>
                </label>
              )}

              {selected.type === "image" && (
                <StudioInspectorSection sectionId="element.blend-extended" loadingLabel="확장 블렌드를 여는 중...">
                <Suspense fallback={null}>
                  <StudioExtendedBlendPanel
                    mode={extendedBlendMode}
                    opacity={extendedBlendOpacity}
                    busy={extendedBlendBusy}
                    unavailableReason={
                      inspectorInteractionPolicy.selection.reason ??
                      extendedBlendUnavailableReason
                    }
                    onModeChange={setExtendedBlendMode}
                    onOpacityChange={setExtendedBlendOpacity}
                    onApply={() => void applyExtendedBlendMergeDown()}
                  />
                </Suspense>
                </StudioInspectorSection>
              )}

              {selected.type !== "draw" && (
                <StudioInspectorSection sectionId="element.layout" loadingLabel="배치를 여는 중...">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[0.66rem] text-fg-3">가로 위치 (X)</span>
                      <input
                        type="number"
                        value={Math.round(selected.x)}
                        onChange={(e) => patchEl(selected.id, { x: Number(e.target.value) } as Partial<El>)}
                        className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[0.66rem] text-fg-3">세로 위치 (Y)</span>
                      <input
                        type="number"
                        value={Math.round(selected.y)}
                        onChange={(e) => patchEl(selected.id, { y: Number(e.target.value) } as Partial<El>)}
                        className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                      />
                    </label>
                    {(selected.type === "image" || selected.type === "bubble" || selected.type === "frame" || selected.type === "text") && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[0.66rem] text-fg-3">너비 (Width)</span>
                        <input
                          type="number"
                          value={Math.round(selected.width)}
                          onChange={(e) => patchEl(selected.id, { width: Math.max(10, Number(e.target.value)) } as Partial<El>)}
                          className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                        />
                      </label>
                    )}
                    {(selected.type === "image" || selected.type === "bubble" || selected.type === "frame") && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[0.66rem] text-fg-3">높이 (Height)</span>
                        <input
                          type="number"
                          value={Math.round(selected.height)}
                          onChange={(e) => patchEl(selected.id, { height: Math.max(10, Number(e.target.value)) } as Partial<El>)}
                          className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                        />
                      </label>
                    )}
                    {(selected.type === "image" || selected.type === "text" || selected.type === "bubble" || selected.type === "sticker") && (
                      <label className="flex flex-col gap-0.5 col-span-2">
                        <span className="text-[0.66rem] text-fg-3">회전 (Rotation)</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={-180}
                            max={180}
                            value={Math.round(selected.rotation ?? 0)}
                            onChange={(e) => patchEl(selected.id, { rotation: Number(e.target.value) } as Partial<El>)}
                            className="flex-1 accent-accent"
                          />
                          <input
                            type="number"
                            value={Math.round(selected.rotation ?? 0)}
                            onChange={(e) => patchEl(selected.id, { rotation: Number(e.target.value) } as Partial<El>)}
                            className="w-14 rounded border border-line bg-canvas/50 px-1 py-0.5 text-center text-xs text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                          />
                        </div>
                      </label>
                    )}
                  </div>
                </div>
                {/* 기울이기(Skew) — 이미지/텍스트/스티커 자유 변형. 도 단위 저장, Konva 렌더 시 tangent 변환(studio-skew). */}
                {(selected.type === "image" || selected.type === "text" || selected.type === "sticker") && (
                  <div className="mt-3 border-t border-line/50 pt-3">
                    <StudioSkewPanel
                      value={{ skewX: selected.skewX, skewY: selected.skewY }}
                      onPatch={(patch) => patchEl(selected.id, normalizeSkewPatch(patch) as Partial<El>)}
                      onReset={() => patchEl(selected.id, { skewX: undefined, skewY: undefined } as Partial<El>)}
                    />
                  </div>
                )}
                </StudioInspectorSection>
              )}

              {(selected.type === "focusLines"
                || selected.type === "speedLines"
                || selected.type === "frame") ? (
                <StudioInspectorSection sectionId="element.effect-lines" loadingLabel="집중선·속도선을 여는 중...">
                <StudioInspectorFocusSpeedFrameControls
                  selected={selected}
                  panelGutter={panelGutter}
                  panelSplitActive={panelSplitActive}
                  panelSplitHint={panelSplitHint}
                  panelSplitRatio={panelSplitRatio}
                  onPatch={(patch) => patchEl(selected.id, patch)}
                  onPanelSplitRatioChange={setPanelSplitRatio}
                  onSplitFrame={splitFrameSelected}
                  onTogglePanelSplit={() => {
                    setPanelSplitHint(null);
                    executeStudioInspectorArmedToggle(panelSplitActive, {
                      disarm: disarmAllPixelTools,
                      setActive: setPanelSplitActive,
                    });
                  }}
                  onPanelGutterChange={(value) => {
                    if (collaborationDocumentLocked) return;
                    setPanelGutter(value);
                    setSharedDocumentNotice(null);
                  }}
                />
                </StudioInspectorSection>
              ) : null}

              {(selected.type === "image" || selected.type === "draw") && (
                <>
                  {selected.type === "image" && (
                    <>
                      {selectedWorkAssetDestructiveEditReason ? (
                        <p
                          role="status"
                          className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-fg-2"
                        >
                          {selectedWorkAssetDestructiveEditReason} 원본을 바꾸지 않는 새 채색 레이어 생성은
                          계속 사용할 수 있어요.
                        </p>
                      ) : null}
                      {shouldMountImageInspectorTab("quick") ? (
                      <div className="space-y-3" hidden={activeImageInspectorTab !== "quick"}>
                        <Suspense fallback={<StudioPanelLoading label="빠른 이미지 도구를 여는 중..." />}>
                          {!selectedWorkAssetDestructiveEditReason ? (
                            <>
                              <StudioBgRemoveButton
                                src={selected.src}
                                onResult={(dataUrl) => patchEl(selected.id, { src: dataUrl })}
                                onOpenLayerLift={openStudioLayerLift}
                                layerLiftDisabledReason={studioLayerLiftDisabledReason}
                              />
                              <StudioAiColorizePanel
                                configured={isStudioAiConfigured(aiSettings)}
                                prompt={aiColorizePrompt}
                                onPromptChange={setAiColorizePrompt}
                                busy={aiColorizeBusy}
                                error={aiColorizeError}
                                onColorize={onColorizeSelected}
                              />
                            </>
                          ) : null}
                          {selected.stockImageCredit && (
                            <p className="rounded-md border border-line bg-card/50 px-2 py-1 text-[0.6rem] leading-relaxed text-fg-3">
                              출처:{" "}
                              <a
                                href={selected.stockImageCredit.photographerProfileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-fg-2"
                              >
                                {selected.stockImageCredit.photographerName}
                              </a>{" "}
                              ·{" "}
                              <a
                                href={selected.stockImageCredit.unsplashPhotoPageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline hover:text-fg-2"
                              >
                                Unsplash
                              </a>
                            </p>
                          )}
                          {selectedReadableImageSource ? (
                            <StudioColorPalettePanel
                              src={selectedReadableImageSource}
                              onPickColor={(hex) => setColor(hex)}
                            />
                          ) : null}
                        </Suspense>
                      </div>
                      ) : null}
                    </>
                  )}
                  {shouldMountImageInspectorTab("fill") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "fill"}>
                    <Suspense fallback={<StudioPanelLoading label="채우기·선화 도구를 여는 중..." />}>
                      <StudioFloodFillPanel
                        active={advancedFillActive}
                        busy={advancedFillBusy}
                        fillColor={color}
                        settings={advancedFillSettings}
                        referenceLayerCount={advancedFillReferenceLayerCount}
                        visibleRasterCount={advancedFillVisibleRasterCount}
                        selectedIsReference={selected?.type === "image" ? selected.fillReference === true : false}
                        targetUnsupportedReason={
                          inspectorInteractionPolicy.selection.reason ??
                          advancedFillUnsupportedReason ??
                          (!rasterAvailability("paint-bucket").entry.enabled
                            ? rasterAvailability("paint-bucket").entry.reason
                            : null)
                        }
                        statusMessage={advancedFillStatus}
                        diagnostics={advancedFillPreview?.diagnostics}
                        onToggleActive={toggleAdvancedFill}
                        onFillColorChange={setColor}
                        onSettingsChange={updateAdvancedFillSettings}
                        onToggleSelectedReference={() => {
                          if (selected?.type === "image") {
                            setAdvancedFillPreview(null);
                            patchEl(selected.id, { fillReference: !selected.fillReference } as Partial<El>);
                            setAdvancedFillStatus(
                              selected.fillReference
                                ? "채우기 참조 지정을 해제했습니다."
                                : "이 래스터를 채우기 참조 선화로 지정했습니다.",
                            );
                          }
                        }}
                        onResetSettings={() =>
                          updateAdvancedFillSettings({ ...DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS })
                        }
                      />
                      {rasterAvailability("paint-bucket").entry.mode !== "direct-raster" ? (
                        <StudioRasterToolRecoveryPanel
                          entries={[rasterAvailability("paint-bucket", advancedFillBusy)]}
                          onRecover={handleRasterRecovery}
                        />
                      ) : null}
                      {selected.type === "image" ? (
                        <>
                          {selectedReadableImageSource ? (
                          <StudioAutoColorHintsPanel
                            imageSrc={selectedReadableImageSource}
                            scribbleCanvasArmed={autoColorScribbleCanvasArmed}
                            onScribbleCanvasArmedChange={
                              setAutoColorScribbleCanvasArmed
                                ? (next) =>
                                    executeStudioInspectorArmedChange(next, {
                                      disarm: disarmAllPixelTools,
                                      setActive: setAutoColorScribbleCanvasArmed,
                                    })
                                : undefined
                            }
                            canvasSeedHit={autoColorCanvasSeedHit}
                            canvasSeedHits={autoColorCanvasSeedHits}
                            onCanvasSeedHitConsumed={() => {
                              setAutoColorCanvasSeedHit?.(null);
                              setAutoColorCanvasSeedHits?.(null);
                            }}
                            onPlanImageSize={onAutoColorPlanImageSize}
                            onRun={async (request) => {
                              const { runStudioAutoColorHintsWorker } = await import("./studio-auto-color-hints-worker-client"
                              );
                              return runStudioAutoColorHintsWorker(request);
                            }}
                            onApplyResult={
                              selectedWorkAssetDestructiveEditReason
                                ? undefined
                                : (dataUrl) => patchEl(selected.id, { src: dataUrl })
                            }
                            onApplyNewLayer={
                              ({ dataUrl, name }) => {
                                if (selected.type !== "image") return;
                                const paintEl = {
                                  id: uid(),
                                  type: "image" as const,
                                  src: dataUrl,
                                  x: selected.x,
                                  y: selected.y,
                                  width: selected.width,
                                  height: selected.height,
                                  rotation: selected.rotation ?? 0,
                                  opacity: 1,
                                  name: name || "채색",
                                  groupId: selected.groupId,
                                };
                                const index = elements.findIndex((el) => el.id === selected.id);
                                const insertAt = index >= 0 ? index + 1 : elements.length;
                                const next = [
                                  ...elements.slice(0, insertAt),
                                  paintEl,
                                  ...elements.slice(insertAt),
                                ];
                                if (!commit(next as typeof elements)) return;
                                setSelectedId(paintEl.id);
                              }
                            }
                          />
                          ) : (
                            <p
                              role="status"
                              className="rounded-lg border border-line bg-card/50 px-3 py-2 text-xs text-fg-3"
                            >
                              검증된 이미지 바이트를 준비하는 중입니다.
                            </p>
                          )}
                          {!selectedWorkAssetDestructiveEditReason ? (
                            <StudioLineCleanupPanel
                              src={selected.src}
                              onResult={(dataUrl) => patchEl(selected.id, { src: dataUrl })}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("quick") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "quick"}>
                    <Suspense fallback={<StudioPanelLoading label="이미지 보정을 여는 중..." />}>
                      <StudioInspectorFilterLauncher
                        availability={rasterAvailability("filter", studioFilterPreparationBusy)}
                        busy={studioFilterPreparationBusy}
                        onRecover={handleRasterRecovery}
                        onSelect={openStudioFilter}
                      />
                      {selected.type === "image" &&
                      rasterAvailability("filter").entry.enabled ? (
                        <StudioImageAdjustmentsPanel
                          selected={selected}
                          filterClipboard={filterClipboard}
                          onSetFilterClipboard={setFilterClipboard}
                          onPatch={(patch) => patchEl(selected.id, patch)}
                          effectFavoriteState={effectFavoriteState}
                          onToggleEffectFavorite={toggleEffectFavorite}
                          onRememberEffectRecent={rememberEffectRecent}
                        />
                      ) : null}
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("retouch") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "retouch"}>
                    <Suspense fallback={<StudioPanelLoading label="선택·리터치 도구를 여는 중..." />}>
                      {selected.type === "image" &&
                      rasterAvailability("pixel-marquee").entry.enabled ? (
                      <>
                        <StudioInspectorPixelSelectionLauncher
                          availability={rasterAvailability("pixel-marquee")}
                          activeTool={activeInspectorPixelSelectionTool}
                          busy={pixelBusy}
                          heading="정원 마퀴"
                          toolIds={["circle"]}
                          onPickTool={activatePixelSelectionToolFromInspector}
                          onRecover={handleRasterRecovery}
                        />
                        {/* 픽셀 선택 도구 — 사각/타원/자유·다각형 올가미/브러시 + 결합/페더/확장·축소. */}
                        <StudioSelectionToolsPanel
                          selection={pixelSel}
                          activeTool={pixelTool === "wand" ? null : pixelTool}
                          combineMode={pixelCombine}
                          busy={pixelBusy}
                          brushRadius={pixelBrushRadius}
                          polyLassoPointCount={polyLassoSession?.points.length ?? 0}
                          onBrushRadiusChange={setPixelBrushRadius}
                          onPickTool={(t) => {
                            clearPolyLassoDraft();
                            if (t) {
                              activatePixelSelectionToolFromInspector(t);
                              return;
                            }
                            disarmAllPixelTools();
                          }}
                          onCombineModeChange={setPixelCombine}
                          onFeatherChange={(px) => commitPixelSelectionState((selection) => selection ? setSelectionFeather(selection, px) : selection, "feather", "feather")}
                          onToggleInvert={() => commitPixelSelectionState((selection) => toggleSelectionInvert(selection ?? emptyPixelSelection()), "invert")}
                          magneticLasso={pixelMagneticLasso}
                          onToggleMagnetic={onTogglePixelMagneticLasso}
                          canUndoSelection={pixelSelectionCanUndo}
                          canRedoSelection={pixelSelectionCanRedo}
                          onUndoSelection={undoPixelSelectionState}
                          onRedoSelection={redoPixelSelectionState}
                          onUndoSubpath={() => commitPixelSelectionState((selection) => selection ? removeLastSubpath(selection) : selection, "remove-subpath")}
                          onClearSelection={() => {
                            clearPolyLassoDraft();
                            commitPixelSelectionState(null, "clear");
                          }}
                          onSelectAll={() => {
                            clearPolyLassoDraft();
                            commitPixelSelectionState((selection) => selectAllPixels(selection), "select-all");
                          }}
                          onExpand={(amount) => commitPixelSelectionState((selection) => expandContractSelection(selection, amount), "transform")}
                          onContract={(amount) => commitPixelSelectionState((selection) => expandContractSelection(selection, -amount), "transform")}
                          onRotate={(degrees) => {
                            const aspect = selected.width > 0
                              ? selected.height / selected.width
                              : 1;
                            commitPixelSelectionState((selection) => rotateSelection(selection, degrees, { aspect }) ?? selection, "transform");
                          }}
                          onFlip={(axis) => commitPixelSelectionState((selection) => flipSelection(selection, axis) ?? selection, "transform")}
                          onTranslate={(dx, dy) => commitPixelSelectionState((selection) => translateSelection(selection, dx, dy) ?? selection, "move")}
                          onScale={(factor) => {
                            const aspect = selected.width > 0
                              ? selected.height / selected.width
                              : 1;
                            commitPixelSelectionState((selection) => scaleSelection(selection, factor, { aspect }) ?? selection, "transform");
                          }}
                          onContentTransform={(t) => void applyPixelSelectionContentTransform(t)}
                          onApplyAdjust={(plan) => void applyPixelSelectionAdjust(plan)}
                          onContentAwareFill={() => void applyContentAwareFill()}
                          onCopyToNewLayer={() => void extractPixelSelectionToLayer("copy")}
                          onCutToNewLayer={() => void extractPixelSelectionToLayer("cut")}
                          colorRangeSamples={colorRangeSamples}
                          colorRangeFuzziness={colorRangeFuzziness}
                          colorRangePickArmed={colorRangePickActive}
                          colorRangePreviewEnabled={colorRangePreviewEnabled}
                          onColorRangeTogglePick={() => {
                            activatePixelSelectionToolFromInspector("color-range");
                          }}
                          onColorRangeFuzzinessChange={setColorRangeFuzziness}
                          onColorRangeFuzzinessCommit={(v) => {
                            setColorRangeFuzziness(v);
                            if (colorRangePreviewEnabled) void runColorRangeApply({ fuzziness: v, coalesceKey: "color-range-preview" });
                          }}
                          onColorRangeTogglePreview={() => {
                            const next = !colorRangePreviewEnabled;
                            setColorRangePreviewEnabled(next);
                            if (next) void runColorRangeApply({ coalesceKey: "color-range-preview" });
                          }}
                          onColorRangeRemoveSample={(i) => setColorRangeSamples((prev) => prev.filter((_, idx) => idx !== i))}
                          onColorRangeClearSamples={() => setColorRangeSamples([])}
                          onColorRangeApply={() => void runColorRangeApply()}
                        />
                        <StudioMagicWandPanel
                          active={pixelTool === "wand"}
                          tolerance={wandTolerance}
                          busy={pixelBusy}
                          onToggleActive={() => {
                            activatePixelSelectionToolFromInspector("wand");
                          }}
                          onToleranceChange={setWandTolerance}
                        />
                        <StudioQuickMaskPanel
                          active={quickMaskActive}
                          brushMode={quickMaskBrushMode}
                          radiusPx={quickMaskRadius}
                          hardness={quickMaskHardness}
                          opacity={quickMaskOpacity}
                          tintColor={quickMaskTintColor}
                          tintOpacity={quickMaskTintOpacity}
                          onEnter={enterQuickMask}
                          onCommit={commitQuickMask}
                          onCancel={exitQuickMask}
                          onBrushModeChange={setQuickMaskBrushMode}
                          onRadiusChange={setQuickMaskRadius}
                          onHardnessChange={setQuickMaskHardness}
                          onOpacityChange={setQuickMaskOpacity}
                          onInvert={invertQuickMask}
                          onTintColorChange={onQuickMaskTintColorChange}
                          onTintOpacityChange={onQuickMaskTintOpacityChange}
                        />
                        <StudioSmudgePanel
                          active={smudgeActive}
                          radius={smudgeRadius}
                          strength={smudgeStrength}
                          busy={smudgeBusy}
                          onToggleActive={toggleSmudgeTool}
                          onRadiusChange={setSmudgeRadius}
                          onStrengthChange={setSmudgeStrength}
                          onOpenTutorial={() => openFeatureTutorial("smudge")}
                        />
                        <StudioDodgeBurnPanel
                          active={dodgeBurnActive}
                          mode={dodgeBurnMode}
                          range={dodgeBurnRange}
                          sponge={dodgeBurnSponge}
                          radiusPx={dodgeBurnRadius}
                          hardness={dodgeBurnHardness}
                          exposure={dodgeBurnExposure}
                          busy={dodgeBurnBusy}
                          onToggleActive={toggleDodgeBurnTool}
                          onModeChange={setDodgeBurnMode}
                          onRangeChange={setDodgeBurnRange}
                          onSpongeChange={setDodgeBurnSponge}
                          onRadiusChange={setDodgeBurnRadius}
                          onHardnessChange={setDodgeBurnHardness}
                          onExposureChange={setDodgeBurnExposure}
                          onOpenTutorial={() => openFeatureTutorial("dodge-burn")}
                        />
                        <StudioWetMixPanel
                          active={wetMixActive}
                          radius={wetMixRadius}
                          strength={wetMixStrength}
                          wetness={wetMixWetness}
                          pickup={wetMixPickup}
                          hardness={wetMixHardness}
                          paintColor={color}
                          busy={wetMixBusy}
                          onToggleActive={toggleWetMixTool}
                          onRadiusChange={setWetMixRadius}
                          onStrengthChange={setWetMixStrength}
                          onWetnessChange={setWetMixWetness}
                          onPickupChange={setWetMixPickup}
                          onHardnessChange={setWetMixHardness}
                          onOpenTutorial={() => openFeatureTutorial("wet-mix")}
                        />
                        <StudioLiquifyPanel
                          active={liquifyActive}
                          mode={liquifyMode}
                          radius={Math.min(LIQUIFY_RADIUS_RANGE.max, Math.max(LIQUIFY_RADIUS_RANGE.min, liquifyRadius))}
                          strength={Math.min(LIQUIFY_STRENGTH_RANGE.max, Math.max(LIQUIFY_STRENGTH_RANGE.min, liquifyStrength))}
                          busy={liquifyBusy}
                          onToggleActive={toggleLiquifyTool}
                          onModeChange={setLiquifyMode}
                          onRadiusChange={setLiquifyRadius}
                          onStrengthChange={setLiquifyStrength}
                          onOpenTutorial={() => openFeatureTutorial("liquify")}
                        />
                        <StudioHealClonePanel
                          mode={healCloneTool}
                          radiusPx={healCloneRadius}
                          hardness={healCloneHardness}
                          opacity={healCloneOpacity}
                          aligned={healCloneAligned}
                          hasSource={healCloneSourceAnchor !== null}
                          busy={healCloneBusy}
                          onPickMode={(mode) => {
                            const next = healCloneTool === mode ? null : mode;
                            if (next) {
                              disarmAllPixelTools();
                              resetPixelSelectionState(null); // 픽셀 선택 영역이 남아있으면 heal/clone 오버레이와 시각적으로 겹쳐 헷갈린다.
                            }
                            setHealCloneTool(next);
                          }}
                          onRadiusChange={setHealCloneRadius}
                          onHardnessChange={setHealCloneHardness}
                          onOpacityChange={setHealCloneOpacity}
                          onAlignedChange={setHealCloneAligned}
                          onClearSource={clearHealCloneSource}
                        />
                        <StudioHistoryBrushPanel
                          active={historyBrushActive}
                          radiusPx={historyBrushRadius}
                          hardness={historyBrushHardness}
                          opacity={historyBrushOpacity}
                          hasSource={historyBrushSourceSrc !== null}
                          busy={historyBrushBusy}
                          onToggleActive={() => {
                            executeStudioInspectorArmedToggle(historyBrushActive, {
                              disarm: disarmAllPixelTools,
                              setActive: setHistoryBrushActive,
                            });
                          }}
                          onRadiusChange={setHistoryBrushRadius}
                          onHardnessChange={setHistoryBrushHardness}
                          onOpacityChange={setHistoryBrushOpacity}
                          onClearSource={() => {
                            setHistoryBrushSourceIndex(null);
                            setHistoryBrushSourceSrc(null);
                          }}
                          onOpenHistoryPanel={historyPanelOpen ? undefined : () => setHistoryPanelOpen(true)}
                        />
                      </>
                      ) : (
                        <>
                          <StudioInspectorPixelSelectionLauncher
                            availability={rasterAvailability("pixel-marquee")}
                            activeTool={activeInspectorPixelSelectionTool}
                            busy={pixelBusy}
                            onPickTool={activatePixelSelectionToolFromInspector}
                            onRecover={handleRasterRecovery}
                          />
                          <StudioRasterToolRecoveryPanel
                            entries={[
                              rasterAvailability("smudge", smudgeBusy),
                              rasterAvailability("dodge-burn", dodgeBurnBusy),
                              rasterAvailability("wet-mix", wetMixBusy),
                              rasterAvailability("liquify", liquifyBusy),
                              rasterAvailability("heal", healCloneBusy),
                            ]}
                            busy={studioFilterPreparationBusy}
                            onRecover={handleRasterRecovery}
                          />
                        </>
                      )}
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("mask") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "mask"}>
                    <Suspense fallback={<StudioPanelLoading label="레이어 마스크를 여는 중..." />}>
                      {selected.type === "image" &&
                      rasterAvailability("layer-mask").entry.enabled ? (
                        <>
                          <StudioLayerMaskPanel
                            hasMask={!!selected.maskSrc}
                            enabled={selected.maskEnabled !== false}
                            paintActive={layerMaskPaintActive}
                            paintMode={layerMaskPaintMode}
                            radiusPx={layerMaskRadius}
                            hardness={layerMaskHardness}
                            strength={layerMaskStrength}
                            maskThumbnailSrc={selected.maskSrc ?? null}
                            busy={layerMaskBusy}
                            onAddMask={addLayerMask}
                            onCreateFromSelection={createLayerMaskFromSelection}
                            hasUsableSelection={isSelectionUsable(pixelSel)}
                            onDeleteMask={deleteLayerMask}
                            onToggleEnabled={toggleLayerMaskEnabled}
                            onInvert={invertLayerMask}
                            onTogglePaintActive={() => {
                              executeStudioInspectorArmedToggle(layerMaskPaintActive, {
                                disarm: disarmAllPixelTools,
                                setActive: setLayerMaskPaintActive,
                              });
                            }}
                            onPaintModeChange={setLayerMaskPaintMode}
                            onRadiusChange={setLayerMaskRadius}
                            onHardnessChange={setLayerMaskHardness}
                            onStrengthChange={setLayerMaskStrength}
                          />
                          <StudioFilterMaskPanel
                            hasMask={!!selected.filterMaskSrc}
                            enabled={selected.filterMaskEnabled !== false}
                            hasActiveFilters={selectedImageHasActiveFilters}
                            paintActive={filterMaskPaintActive}
                            paintMode={filterMaskPaintMode}
                            radiusPx={filterMaskRadius}
                            hardness={filterMaskHardness}
                            strength={filterMaskStrength}
                            maskThumbnailSrc={selected.filterMaskSrc ?? null}
                            busy={filterMaskBusy}
                            onAddMask={addFilterMask}
                            onDeleteMask={deleteFilterMask}
                            onToggleEnabled={toggleFilterMaskEnabled}
                            onInvert={invertFilterMask}
                            onTogglePaintActive={() => {
                              executeStudioInspectorArmedToggle(filterMaskPaintActive, {
                                disarm: disarmAllPixelTools,
                                setActive: setFilterMaskPaintActive,
                              });
                            }}
                            onPaintModeChange={setFilterMaskPaintMode}
                            onRadiusChange={setFilterMaskRadius}
                            onHardnessChange={setFilterMaskHardness}
                            onStrengthChange={setFilterMaskStrength}
                          />
                        </>
                      ) : (
                        <StudioRasterToolRecoveryPanel
                          entries={[
                            rasterAvailability("layer-mask", layerMaskBusy || filterMaskBusy),
                          ]}
                          onRecover={handleRasterRecovery}
                        />
                      )}
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("transform") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "transform"}>
                    <Suspense fallback={<StudioPanelLoading label="이미지 변형 도구를 여는 중..." />}>
                      {selected.type === "image" &&
                      rasterAvailability("crop").entry.enabled ? (
                        <>
                          <StudioCropPanel
                            active={!!cropRect}
                            aspect={cropAspect}
                            busy={cropBusy}
                            canApply={!!cropRect && !isCropRectNoop(cropRect)}
                            onToggle={() => {
                              if (cropRect) {
                                setCropRect(null);
                                return;
                              }
                              disarmAllPixelTools();
                              resetPixelSelectionState(null);
                              setCropRect(initialCropRect());
                            }}
                            onAspectChange={(id) => {
                              setCropAspect(id);
                              const ratio = cropAspectRatio(id);
                              if (ratio !== null && selected.height > 0) {
                                setCropRect((r) => (r ? applyCropAspect(r, ratio, selected.width / selected.height) : r));
                              }
                            }}
                            onReset={() => setCropRect(initialCropRect())}
                            onApply={() => void applyCropToSelectedImage()}
                            onCancel={() => setCropRect(null)}
                          />
                          <StudioPuppetWarpPanel
                            active={puppetWarpActive}
                            pins={puppetWarpPins}
                            busy={puppetWarpBusy}
                            canApply={!isPuppetWarpNoop(puppetWarpPins)}
                            onToggle={() => {
                              if (puppetWarpActive) {
                                setPuppetWarpActive(false);
                                setPuppetWarpPins([]);
                                return;
                              }
                              disarmAllPixelTools();
                              setPuppetWarpActive(true);
                            }}
                            onRemovePin={(id) => setPuppetWarpPins((pins) => removePuppetPin(pins, id))}
                            onResetPositions={() => setPuppetWarpPins((pins) => resetPuppetPinPositions(pins))}
                            onApply={() => void applyPuppetWarpToSelectedImage()}
                            onCancel={() => {
                              setPuppetWarpActive(false);
                              setPuppetWarpPins([]);
                            }}
                          />
                        </>
                      ) : (
                        <StudioRasterToolRecoveryPanel
                          entries={[
                            rasterAvailability("crop", cropBusy),
                            rasterAvailability("pixel-transform", pixelBusy),
                            rasterAvailability("puppet-warp", puppetWarpBusy),
                          ]}
                          busy={studioFilterPreparationBusy}
                          onRecover={handleRasterRecovery}
                        />
                      )}
                    </Suspense>
                  </div>
                  ) : null}
                </>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/50 pt-3">
                {(selected.type === "text" || selected.type === "bubble" || selected.type === "sticker") && (
                  <button type="button" onClick={() => startEditText(selected.id)} className={buttonClass({ size: "sm", variant: "quiet" })}>
                    글자 편집
                  </button>
                )}
              </div>
              <StudioInspectorSection sectionId="element.order-align" loadingLabel="정렬·순서를 여는 중...">
                <div className="flex flex-wrap gap-1.5">
                {selected.type === "image" && (
                  <>
                    {(selected.vrmScene || parseStudio3dTool(selected.src) === "vrm-poser") && (
                      <button
                        type="button"
                        onClick={() => {
                          setPoserInitialDataUrl(selected.src);
                          setPoserInitialElementId(selected.id);
                          setPoserVrmOpen(true);
                        }}
                        className={buttonClass({ size: "sm", variant: "solid", className: "gap-1 font-semibold" })}
                        title="3D 캐릭터 재편집"
                      >
                        <Sparkles size={14} /> 3D 재편집
                      </button>
                    )}
                    {selectedBg3dEditSource && (
                      <button
                        type="button"
                        onClick={() => {
                          setBg3dInitialScene(selectedBg3dEditSource.scene);
                          setBg3dInitialDataUrl(selectedBg3dEditSource.legacyDataUrl);
                          setBg3dInitialElementId(selected.id);
                          setBg3dOpen(true);
                        }}
                        onPointerEnter={preloadStudioBackground3D}
                        onPointerDown={preloadStudioBackground3D}
                        onFocus={preloadStudioBackground3D}
                        className={buttonClass({ size: "sm", variant: "solid", className: "gap-1 font-semibold" })}
                        title="3D 배경 재편집"
                      >
                        <Boxes size={14} /> 배경 재편집
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => patchEl(selected.id, { flipped: !selected.flipped } as Partial<El>)}
                      className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
                      title="좌우 반전"
                    >
                      <FlipHorizontal2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => patchEl(selected.id, {flippedY: !selected.flippedY} as Partial<El>)}
                      className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })}
                      title="상하 반전"
                    >
                      <FlipVertical2 size={14} />
                    </button>
                  </>
                )}
                <button type="button" onClick={() => reorder("front")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="맨 앞으로">
                  <ArrowUpToLine size={14} />
                </button>
                <button type="button" onClick={() => reorder("back")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="맨 뒤로">
                  <ArrowDownToLine size={14} />
                </button>
                <button type="button" onClick={() => alignSelected("left")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="왼쪽 정렬">
                  <AlignStartVertical size={14} />
                </button>
                <button type="button" onClick={() => alignSelected("hcenter")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="가로 가운데 정렬">
                  <AlignHorizontalJustifyCenter size={14} />
                </button>
                <button type="button" onClick={() => alignSelected("right")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="오른쪽 정렬">
                  <AlignEndVertical size={14} />
                </button>
                <button type="button" onClick={() => alignSelected("top")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="위쪽 정렬">
                  <AlignStartHorizontal size={14} />
                </button>
                <button type="button" onClick={() => alignSelected("vcenter")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="세로 가운데 정렬">
                  <AlignVerticalJustifyCenter size={14} />
                </button>
                <button type="button" onClick={() => alignSelected("bottom")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="아래쪽 정렬">
                  <AlignEndHorizontal size={14} />
                </button>
                </div>
              </StudioInspectorSection>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <button type="button" onClick={duplicateSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="복제 (⌘J)">
                  <Copy size={14} />
                </button>
                <button type="button" onClick={removeSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-bad" })} title="삭제 (Delete)">
                  <Trash2 size={14} /> 삭제
                </button>
                </div>
                </Suspense>
              </fieldset>
            </div>
          )}

          {inspectorContentMode === "selection" && marqueeIds.length === 2 && (
            <div
              role="tabpanel"
              aria-label="도형 결합"
              hidden={inspectorLayout.primary !== "properties"}
              className="rounded-xl border border-line bg-panel/40 p-3"
            >
              <Suspense fallback={null}>
                <StudioPathBooleanPanel
                  busy={pathBooleanBusy}
                  unavailableReason={pathBooleanInspectorUnavailableReason}
                  onApply={(op) => applyPathBooleanCombine(op)}
                />
              </Suspense>
            </div>
          )}

          {inspectorContentMode === "empty" && (
            <div
              role="tabpanel"
              aria-label="시작 안내"
              data-testid="studio-inspector-empty-coach"
              hidden={inspectorLayout.primary !== "properties"}
              className="rounded-xl border border-line bg-panel/40 p-3"
            >
              <p className="text-xs font-bold tracking-tight text-fg">캔버스에서 바로 시작</p>
              <p className="mt-1 text-[0.7rem] leading-snug text-fg-3">
                빈 화면에 그려도 됩니다. 선택 후 모서리 핸들로 크기를 조절하고, 자르기는 레이어에서 바로 열 수 있어요.
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-label="펜으로 그리기"
                  className="min-h-11 rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg transition-colors hover:border-accent/70"
                  onClick={() => {
                    activateCanvasTool("draw", "pen");
                    setEyedropperActive(false);
                    announceDrawingShortcut("펜 · 캔버스에 바로 그려 보세요");
                  }}
                >
                  펜으로 그리기
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">단축키 B</span>
                </button>
                <button
                  type="button"
                  aria-label="선택 도구"
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
                  onClick={() => {
                    disarmAllPixelTools();
                    setTool("select");
                    setEyedropperActive(false);
                    announceDrawingShortcut("선택 · 클릭하거나 드래그해 고르세요");
                  }}
                >
                  선택 도구
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">단축키 V</span>
                </button>
                <button
                  type="button"
                  aria-label="레이어 패널 열기"
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
                  onClick={() => {
                    changeInspectorLayout({ ...inspectorLayout, primary: "layers" });
                  }}
                >
                  레이어 패널
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">순서·표시</span>
                </button>
                <button
                  type="button"
                  aria-label="기능 튜토리얼 열기"
                  className="min-h-11 rounded-lg border border-line bg-card px-2.5 py-2 text-left text-[0.72rem] font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-fg"
                  onClick={() => {
                    openFeatureTutorial(null);
                  }}
                >
                  기능 튜토리얼
                  <span className="mt-0.5 block text-[0.62rem] font-medium text-fg-3">따라 하기</span>
                </button>
              </div>
            </div>
          )}

          {inspectorContentMode === "drawing" && (
            <div
              role="tabpanel"
              aria-label="그리기 도구 설정"
              data-testid="studio-inspector-context-drawing-panel"
              hidden={inspectorLayout.primary !== "properties"}
              className="min-h-0 lg:flex lg:flex-1 lg:flex-col"
            >
              <Suspense
                fallback={
                  <StudioPanelLoading label="서브 도구와 도구 속성을 여는 중..." />
                }
              >
                <StudioDrawingPaletteStack
                  cancelEpoch={drawingPaletteCancelEpoch}
                  layout={drawingPaletteLayout}
                  mobileHeaderAction={
                    isMobile ? (
                      <StudioInspectorBrushCatalogButton
                        onOpen={openBrushCatalog}
                      />
                    ) : undefined
                  }
                  mobilePrimaryPaletteId={
                    isMobile ? "tool-properties" : undefined
                  }
                  onLayoutChange={changeDrawingPaletteLayout}
                  onDraggingChange={setDrawingPaletteDragging}
                  subTools={
                  <>
              <StudioInspectorDrawModeControls
                drawMode={drawMode}
                onDrawModeChange={(next) => {
                  activateCanvasTool("draw", next);
                }}
                onDrawShapeChange={setDrawShape}
                onStrokeWidthChange={setStrokeWidth}
                onSymmetryChange={setSymmetryType}
              />

              {/* CSP식 서브 도구 팔레트 — 코어 카탈로그의 선별 매핑(분류 탭 + 서브 도구
                  리스트)만 노출한다. 분류 탭 활성화는 DrawModeControls와 동일한 도구 전환
                  경로(activateCanvasTool)를 타고, 서브 도구 적용은 StudioPage의
                  applyBuiltInBrushPreset 트랜잭션 하나로 끝난다(핸들러 미배선 시 미노출). */}
              {applyBuiltInBrushPreset && (drawMode === "pen" || drawMode === "eraser") ? (
                <StudioSubToolPalette
                  activeCategory={subToolPaletteCategory}
                  activeSubToolId={activeInspectorBrushId}
                  onCategoryChange={(category) => {
                    setSubToolPaletteBrowsedCategory(category);
                    const nextDrawMode =
                      studioSubToolPaletteCategoryById(category)?.drawMode;
                    if (nextDrawMode) activateCanvasTool("draw", nextDrawMode);
                  }}
                  onSelectSubTool={(subToolId) => {
                    const preset = studioSubToolPalettePresetById(subToolId);
                    if (!preset) return;
                    applyBuiltInBrushPreset(preset);
                    setSubToolPaletteBrowsedCategory(null);
                  }}
                />
              ) : null}

              {/* 기본 프리셋 "전체" 탐색은 하단 도크 한 곳에만 둔다. 인스펙터의 서브 도구
                  팔레트는 선별 매핑만 다루고, 그 외에는 현재 상태와 사용자 저장 브러시·고급
                  동역학에 집중해 긴 중복 메뉴를 만들지 않는다. */}
              {drawMode === "pen" && inspectorLayout.primary === "properties" ? (
                <StudioInspectorCurrentBrushSummary
                  brushId={activeInspectorBrushId}
                  brushName={activeInspectorBrushName}
                  color={color}
                  opacity={brushOpacity}
                  stabilizer={stabilizer}
                  stabilizerMode={stabilizerMode}
                  strokeWidth={strokeWidth}
                  tipAngle={tipAngle}
                  tipRoundness={tipRoundness}
                  onOpenBrushCatalog={openBrushCatalog}
                />
              ) : null}

              {/* 저장된 브러시 라이브러리 — ibisPaint 브러시/머티리얼 라이브러리 대응.
                  펜 모드 전용(저장 대상이 펜 설정 스냅샷이므로 drawMode==="pen"일 때만 노출). */}
              {drawMode === "pen" && (
                <Suspense fallback={null}>
                  <StudioBrushLibraryPanel
                    currentSnapshot={currentBrushSnapshot}
                    brushes={savedBrushes}
                    activeBrushId={activeSavedBrushId}
                    onBrushesChange={setSavedBrushes}
                    onApplyBrush={applySavedBrush}
                    onBrushDeleted={queueBrushDelete}
                    {...(openBrushLibraryRepository
                      ? { repositoryFactory: openBrushLibraryRepository }
                      : {})}
                  />
                </Suspense>
              )}

              {/* 도형 모드 — Photopea/Canva visual shape picker */}
              {drawMode === "shape" && (
                <div className="space-y-1.5">
                  <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">
                    도형 종류
                  </p>
                  <Suspense fallback={<div className="h-20 rounded-xl bg-raised/40" aria-hidden />}>
                    <StudioShapePickerGrid
                      activeKind={drawShape}
                      filled={shapeFill}
                      onSelect={(kind) => setDrawShape(kind as DrawShapeKind)}
                      kinds={STUDIO_DRAW_SHAPE_PICKER_KINDS}
                    />
                  </Suspense>
                  <button
                    type="button"
                    aria-pressed={shapeFill}
                    disabled={drawShape === "line" || drawShape === "arrow"}
                    title="채우기"
                    aria-label="도형 채우기"
                    onClick={() => setShapeFill((v) => !v)}
                    className={cn(
                      "grid size-11 place-items-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:size-9",
                      drawShape === "line" || drawShape === "arrow"
                        ? "cursor-not-allowed border-line bg-card text-fg-3 opacity-50"
                        : shapeFill
                          ? "border-accent/60 bg-accent-soft/50 text-accent"
                          : "border-line bg-card text-fg-2 hover:bg-raised"
                    )}
                  >
                    <PaintBucket size={15} aria-hidden />
                  </button>
                </div>
              )}
                  </>
                }
                  toolProperties={
                  <>

              {drawMode !== "eraser" && (
                <StudioInspectorDrawColorControls
                  color={color}
                  eyedropperActive={eyedropperActive}
                  onColorChange={setColor}
                  onEyedropperToggle={() => {
                    const next = !eyedropperActive;
                    if (next) disarmAllPixelTools();
                    setEyedropperActive(next);
                  }}
                />
              )}

              {/* 크기 슬라이더 */}
              <div className="space-y-1.5 pt-1.5 border-t border-line/35">
                {drawMode !== "pixel" ? (
                  <div className="space-y-1.5">
                    <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                      <span>크기</span>
                      <span className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min={STUDIO_BRUSH_SIZE_RANGE.min}
                          max={STUDIO_BRUSH_SIZE_RANGE.max}
                          value={strokeWidth}
                          onChange={(e) => setStrokeWidth(Number(e.target.value))}
                          onPointerUp={(e) => rememberRecentBrushSize(Number(e.currentTarget.value))}
                          className="w-24 accent-accent cursor-pointer"
                        />
                        <span className="w-8 text-right text-xs tabular-nums text-fg-3">{strokeWidth}px</span>
                      </span>
                    </label>
                    {/* CSP식 클릭 크기 프리셋 — 슬라이더와 같은 strokeWidth 하나만 갱신한다.
                        브러시 `[`·`]` 단축키(brush.size-decrease/increase)와 공존. */}
                    <StudioBrushSizePresetGrid
                      activeSize={strokeWidth}
                      recentSizes={recentBrushSizes}
                      onCommit={commitBrushSizePreset}
                    />
                  </div>
                ) : null}

                {/* 불투명도 슬라이더 — 요소 인스펙터와 같은 명칭을 쓴다(V5 §15 "모드가 달라도 동일 명칭"). */}
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  <span>불투명도</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={STUDIO_BRUSH_OPACITY_RANGE.min * 100}
                      max={STUDIO_BRUSH_OPACITY_RANGE.max * 100}
                      step={1}
                      value={Math.round(brushOpacity * 100)}
                      onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                      className="w-24 accent-accent cursor-pointer"
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round(brushOpacity * 100)}%</span>
                  </span>
                </label>

                {/* 스탬프 브러시 세부 조절(흐름·경도·최소 굵기) — 스탬프 계열 선택 시에만 노출 */}
                {drawMode !== "pixel" && stampTuning
                  ? (
                    [
                      { key: "flow", label: "흐름" },
                      { key: "hardness", label: "경도" },
                      { key: "minSize", label: "최소 굵기" },
                    ] as const
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="flex items-center justify-between gap-2 text-sm text-fg-2"
                    >
                      <span>{item.label}</span>
                      <span className="flex items-center gap-1.5">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          value={Math.round(stampTuning[item.key] * 100)}
                          onChange={(e) =>
                            setStampTuning({
                              ...stampTuning,
                              [item.key]: Number(e.target.value) / 100,
                            })}
                          className="w-24 accent-accent cursor-pointer"
                        />
                        <span className="w-8 text-right text-xs tabular-nums text-fg-3">
                          {Math.round(stampTuning[item.key] * 100)}%
                        </span>
                      </span>
                    </label>
                  ))
                  : null}

                {drawMode === "pen" && (
                  <Suspense fallback={null}>
                    <StudioQuickShapePanel
                      active={quickShapeActive}
                      matchedKindLabel={
                        tool === "draw" && liveDraftShapeKind && liveDraftShapeKind !== "freehand"
                          ? (QUICKSHAPE_KIND_LABELS[liveDraftShapeKind] ?? null)
                          : null
                      }
                      onOpenTutorial={() => openFeatureTutorial("smart-shape")}
                      onToggleActive={() => {
                        const next = !quickShapeActive;
                        if (next) {
                          activateCanvasTool("draw", "pen");
                          setEyedropperActive(false);
                          announceDrawingShortcut("스마트 도형 켜짐 · 그려서 손을 떼면 다듬어요");
                        } else {
                          announceDrawingShortcut("스마트 도형 꺼짐");
                        }
                        setQuickShapeActive(next);
                      }}
                    />
                  </Suspense>
                )}

                {drawMode !== "pixel" ? (
                  <StudioInspectorSection sectionId="tool.line-correction" loadingLabel="선 보정을 여는 중...">
                    <StudioLineCorrectionControls
                      stabilizer={stabilizer}
                      onStabilizerChange={setStabilizer}
                      mode={stabilizerMode}
                      onModeChange={setStabilizerMode}
                      postCorrection={postCorrection}
                      onPostCorrectionChange={setPostCorrection}
                      preserveCorners={preserveCorners}
                      onPreserveCornersChange={setPreserveCorners}
                    />
                  </StudioInspectorSection>
                ) : null}

                {drawMode !== "shape" && drawMode !== "pixel" ? (
                  <StudioInspectorSection sectionId="tool.brush-studio" loadingLabel="브러시 스튜디오를 여는 중...">
                  <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-raised/35 motion-reduce:animate-none" aria-hidden />}>
                    <StudioBrushStudio
                      brushId={brush}
                      strokeWidth={strokeWidth}
                      color={color}
                      currentSnapshot={currentBrushSnapshot}
                      savedBrushBaseline={
                        activeSavedBrushId
                          ? savedBrushes.find((candidate) => candidate.id === activeSavedBrushId)
                            ?? null
                          : null
                      }
                      settings={brushDynamics}
                      onSettingsChange={setBrushDynamics}
                      onSelectDynamicsPreset={applyDynamicsPreset}
                      useVelocityPressure={useVelocityPressure}
                      onUseVelocityPressureChange={setUseVelocityPressure}
                      velocitySensitivity={velocitySensitivity}
                      onVelocitySensitivityChange={setVelocitySensitivity}
                      pressureCurve={pressureCurve}
                      onPressureCurveChange={setPressureCurve}
                      pressureMinSize={pressureMinSize ?? 0}
                      onPressureMinSizeChange={setPressureMinSize ?? (() => undefined)}
                      tiltEnabled={tiltEnabled}
                      onTiltEnabledChange={setTiltEnabled}
                      tipAngle={tipAngle}
                      onTipAngleChange={setTipAngle}
                      tipRoundness={tipRoundness}
                      onTipRoundnessChange={setTipRoundness}
                      onRestoreDefaults={applyBrushDefaultRestoreTransaction}
                      onEngineProgramsChange={onBrushEngineProgramsChange}
                    />
                  </Suspense>
                  </StudioInspectorSection>
                ) : null}
                <StudioInspectorSection sectionId="tool.brush-engines" loadingLabel="브러시 엔진을 여는 중...">
                <StudioHokusaiNaturalMediaInspectorMount
                  visible={drawMode !== "shape" && drawMode !== "pixel"}
                  selected={selected} currentColor={color}
                  documentWidth={CANVAS_W} documentHeight={canvasH}
                  pageId={currentPageId} masterEditMode={masterEditMode}
                  locks={{ collaboration: collaborationDocumentLocked,
                    surfaceReview: activeSurfaceReviewLocked,
                    selectedContent: selectedContentMutationLocked }}
                  onRequestSelectStroke={() => {
                    disarmAllPixelTools();
                    setTool("select");
                    announceDrawingShortcut("캔버스에서 변환할 자유곡선 선화를 선택하세요");
                  }}
                  onReplace={replaceDrawWithHokusaiNaturalMedia}
                />
                {drawMode !== "shape" && drawMode !== "pixel" ? (
                  <StudioProceduralArtisticBrushInspectorSection key={`${currentPageId}:${masterEditMode ? "master" : "page"}`} currentColor={color} canvasHeight={canvasH} pageId={currentPageId} masterEditMode={masterEditMode} disabled={collaborationDocumentLocked || activeSurfaceReviewLocked} disabledReason={collaborationDocumentLocked ? "협업 문서 잠금을 해제한 뒤 절차적 질감을 만들 수 있어요." : activeSurfaceReviewLocked ? "표면 리뷰를 마친 뒤 절차적 질감을 만들 수 있어요." : null} onInsert={addProceduralArtisticBrushRaster} />
                ) : null}
                </StudioInspectorSection>
                {/* 대칭 그리기 자 (Symmetry Ruler) — RAW 픽셀 입력에는 적용하지 않는다. */}
                {drawMode !== "pixel" ? (
                  <StudioInspectorSection sectionId="tool.symmetry" loadingLabel="대칭 자를 여는 중...">
                  <div className="space-y-2">

                  <div className="grid grid-cols-5 gap-1">
                    {([
                      { id: "none", label: "없음" },
                      { id: "vertical", label: "세로" },
                      { id: "horizontal", label: "가로" },
                      { id: "radial", label: "방사" },
                      { id: "kaleidoscope", label: "만화경" },
                    ] as const).map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSymmetryType(type.id)}
                        className={cn(
                          "rounded py-1 text-[0.68rem] font-semibold border transition-colors cursor-pointer",
                          symmetryType === type.id
                            ? "border-accent bg-accent/15 text-accent"
                            : "border-line text-fg-2 hover:bg-raised"
                        )}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>

                  {symmetryType !== "none" && (
                    <div className="space-y-2 pl-1.5 border-l border-line/50 ml-1 py-1 animate-fade-in">
                      {(symmetryType === "radial" || symmetryType === "kaleidoscope") && (
                        <label className="flex items-center justify-between gap-2 text-xs text-fg-3">
                          <span>갈래 수</span>
                          <select
                            value={symmetryRadialCount}
                            onChange={(e) => setSymmetryRadialCount(Number(e.target.value))}
                            className="rounded border border-line bg-card px-1 py-0.5 text-xs text-fg focus-visible:outline focus-visible:outline-accent"
                          >
                            {[4, 6, 8, 12, 16].map((num) => (
                              <option key={num} value={num}>
                                {num}방향
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      <div className="flex gap-2">
                        <label className="flex-1 flex flex-col gap-0.5 text-[0.68rem] text-fg-3">
                          <span>중앙 X</span>
                          <input
                            type="number"
                            value={Math.round(symmetryCenterX)}
                            onChange={(e) => setSymmetryCenterX(Number(e.target.value))}
                            className="w-full rounded border border-line bg-card px-1 py-0.5 text-[0.65rem] text-fg focus-visible:outline focus-visible:outline-accent"
                          />
                        </label>
                        <label className="flex-1 flex flex-col gap-0.5 text-[0.68rem] text-fg-3">
                          <span>중앙 Y</span>
                          <input
                            type="number"
                            value={Math.round(symmetryCenterY)}
                            onChange={(e) => setSymmetryCenterY(Number(e.target.value))}
                            className="w-full rounded border border-line bg-card px-1 py-0.5 text-[0.65rem] text-fg focus-visible:outline focus-visible:outline-accent"
                          />
                        </label>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSymmetryCenterX(CANVAS_W / 2);
                          setSymmetryCenterY(canvasH / 2);
                        }}
                        className="w-full rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised transition-colors cursor-pointer"
                      >
                        대칭축 중앙 정렬
                      </button>
                    </div>
                  )}
                  </div>
                  </StudioInspectorSection>
                ) : null}
                <StudioInspectorSection sectionId="tool.rulers" loadingLabel="자·가이드를 여는 중...">
                <Suspense fallback={null}>
                  <StudioPerspectivePanel
                    active={perspectiveRulerActive}
                    points={vanishingPoints}
                    eyeLevelY={perspectiveEyeLevelY}
                    lockHorizon={perspectiveLockHorizon}
                    canvasHeight={canvasH}
                    disabled={drawingAssistControlsDisabled}
                    disabledReason={drawingAssistDisabledReason}
                    onToggleActive={() => {
                      setPerspectiveRulerActive((active) => !active);
                    }}
                    onAddPoint={addVanishingPointHandler}
                    onRemovePoint={removeVanishingPointHandler}
                    onPreviewPoint={previewVanishingPointById}
                    onCommitPoint={moveVanishingPointById}
                    onToggleLockHorizon={setPerspectiveLockHorizon}
                    onCommitEyeLevelY={setPerspectiveEyeLevelY}
                    onPreviewEyeLevelY={previewPerspectiveEyeLevelY}
                    onAlignToEyeLevel={alignPerspectiveToEyeLevel}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <StudioIsometricGridPanel
                    active={isometricGridActive}
                    config={{
                      angleDeg: isometricAngleDeg,
                      cellSize: isometricCellSize,
                      originX: isometricOriginX,
                      originY: isometricOriginY,
                    }}
                    disabled={drawingAssistControlsDisabled}
                    disabledReason={drawingAssistDisabledReason}
                    onToggleActive={toggleIsometricGridActive}
                    onPreviewAngle={previewIsometricAngleDegClamped}
                    onCommitAngle={setIsometricAngleDegClamped}
                    onPreviewCellSize={previewIsometricCellSizeClamped}
                    onCommitCellSize={setIsometricCellSizeClamped}
                    onPreviewOrigin={previewIsometricOrigin}
                    onCommitOrigin={commitIsometricOrigin}
                    onResetOrigin={resetIsometricOrigin}
                    onInsertPrimitive={insertIsometricPrimitive}
                    onInsertSolid={insertIsometricSolid}
                  />
                </Suspense>
                <Suspense fallback={null}>
                  <StudioAdvancedRulerPanel
                    document={advancedRulers}
                    groups={groups}
                    canvasWidth={CANVAS_W}
                    canvasHeight={canvasH}
                    disabled={drawingAssistControlsDisabled}
                    disabledReason={drawingAssistDisabledReason}
                    onAdd={addAdvancedRuler}
                    onPatch={patchAdvancedRuler}
                    onRemove={removeAdvancedRuler}
                    onSelect={selectAdvancedRuler}
                    onSetActiveSnap={setActiveAdvancedRuler}
                  />
                </Suspense>
                </StudioInspectorSection>
              </div>
                  </>
                }
                />
              </Suspense>
            </div>
          )}

          {imageInspectorRouteWithoutImageSelection ? (
            <div
              role="tabpanel"
              aria-label="전문 픽셀 도구"
              hidden={inspectorLayout.primary !== "properties"}
              className="space-y-3 rounded-xl border border-line bg-panel/40 p-3"
            >
              {shouldMountImageInspectorTab("quick") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "quick"}>
                  <StudioInspectorFilterLauncher
                    availability={rasterAvailability("filter", studioFilterPreparationBusy)}
                    busy={studioFilterPreparationBusy}
                    onRecover={handleRasterRecovery}
                    onSelect={openStudioFilter}
                  />
                </div>
              ) : null}
              {shouldMountImageInspectorTab("fill") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "fill"}>
                  <Suspense fallback={<StudioPanelLoading label="채우기·선화 도구를 여는 중..." />}>
                    <StudioFloodFillPanel
                      active={advancedFillActive}
                      busy={advancedFillBusy}
                      fillColor={color}
                      settings={advancedFillSettings}
                      referenceLayerCount={advancedFillReferenceLayerCount}
                      visibleRasterCount={advancedFillVisibleRasterCount}
                      selectedIsReference={false}
                      canToggleSelectedReference={false}
                      targetUnsupportedReason={
                        inspectorInteractionPolicy.page.reason ??
                        advancedFillUnsupportedReason ??
                        (!rasterAvailability("paint-bucket", advancedFillBusy).entry.enabled
                          ? rasterAvailability("paint-bucket", advancedFillBusy).entry.reason
                          : null)
                      }
                      statusMessage={advancedFillStatus}
                      diagnostics={advancedFillPreview?.diagnostics}
                      onToggleActive={toggleAdvancedFill}
                      onFillColorChange={setColor}
                      onSettingsChange={updateAdvancedFillSettings}
                      onToggleSelectedReference={() => undefined}
                      onResetSettings={() =>
                        updateAdvancedFillSettings({ ...DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS })
                      }
                    />
                    {rasterAvailability("paint-bucket", advancedFillBusy).entry.mode !==
                    "direct-raster" ? (
                      <StudioRasterToolRecoveryPanel
                        entries={[rasterAvailability("paint-bucket", advancedFillBusy)]}
                        onRecover={handleRasterRecovery}
                      />
                    ) : null}
                  </Suspense>
                </div>
              ) : null}
              {shouldMountImageInspectorTab("retouch") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "retouch"}>
                  <StudioInspectorPixelSelectionLauncher
                    availability={rasterAvailability("pixel-marquee")}
                    activeTool={activeInspectorPixelSelectionTool}
                    busy={pixelBusy}
                    onPickTool={activatePixelSelectionToolFromInspector}
                    onRecover={handleRasterRecovery}
                  />
                  <StudioRasterToolRecoveryPanel
                    entries={[
                      rasterAvailability("smudge", smudgeBusy),
                      rasterAvailability("dodge-burn", dodgeBurnBusy),
                      rasterAvailability("wet-mix", wetMixBusy),
                      rasterAvailability("liquify", liquifyBusy),
                      rasterAvailability("heal", healCloneBusy),
                    ]}
                    busy={studioFilterPreparationBusy}
                    onRecover={handleRasterRecovery}
                  />
                </div>
              ) : null}
              {shouldMountImageInspectorTab("mask") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "mask"}>
                  <StudioRasterToolRecoveryPanel
                    entries={[
                      rasterAvailability("layer-mask", layerMaskBusy || filterMaskBusy),
                    ]}
                    onRecover={handleRasterRecovery}
                  />
                </div>
              ) : null}
              {shouldMountImageInspectorTab("transform") ? (
                <div className="space-y-3" hidden={activeImageInspectorTab !== "transform"}>
                  <StudioRasterToolRecoveryPanel
                    entries={[
                      rasterAvailability("crop", cropBusy),
                      rasterAvailability("pixel-transform", pixelBusy),
                      rasterAvailability("puppet-warp", puppetWarpBusy),
                    ]}
                    busy={studioFilterPreparationBusy}
                    onRecover={handleRasterRecovery}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

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
});
