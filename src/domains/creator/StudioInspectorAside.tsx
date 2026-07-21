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
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  FlipHorizontal2,
  FlipVertical2,
  Italic,
  Loader2,
  MousePointer2,
  PaintBucket,
  Paintbrush,
  Pipette,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Suspense, memo, useEffect, useState } from "react";

import { type StudioAdvancedFillPreview } from "./studio-advanced-fill-preview";
import { DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS, type StudioAdvancedFillSettings } from "./studio-advanced-fill-settings";
import { isStudioAiConfigured, type StudioAiSettings } from "./studio-ai-client";
import { CANVAS_W, type BgPreset, type TemplateSpec } from "./studio-assets";
import { preloadStudioBackground3D } from "./studio-background-3d-loader";
import { parseStudio3dTool } from "./studio-background-3d-metadata";
import { type StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { BRUSH_PRESETS } from "./studio-brush";
import {
  type NormalizedStudioBrushDynamicsSettings,
  type StudioBrushDynamicsPresetId,
} from "./studio-brush-dynamics";
import {
  type DeletedBrushRecord,
  type StudioBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import { hasCustomBubbleShape } from "./studio-bubble-custom-shape";
import { normalizeExtraTails } from "./studio-bubble-path";
import {
  applyCropAspect,
  cropAspectRatio,
  initialCropRect,
  isCropRectNoop,
  type CropAspectId,
  type CropRect,
} from "./studio-crop";
import { DRAW_COLOR_SWATCHES } from "./studio-draw-color-swatches";
import { STUDIO_DRAW_SHAPE_PICKER_KINDS } from "./studio-draw-hud";
import { STUDIO_BRUSH_OPACITY_RANGE, STUDIO_BRUSH_SIZE_RANGE } from "./studio-draw-ux";
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
import { legacyTextGradientToSpec } from "./studio-gradient-engine";
import { type HealCloneMode } from "./studio-heal-clone";
import { uid } from "./studio-id";
import { type StudioImageInspectorSection, type StudioInspectorLayout } from "./studio-inspector-layout";
import { type StudioIsometricPrimitiveSpec } from "./studio-isometric-primitive-contract";
import { type ImageFilterFields } from "./studio-konva-filter-fields";
import { type LayerMaskPaintMode } from "./studio-layer-mask";
import {
  type StudioLayerColor,
  type StudioLayerNavigatorItem,
  type StudioLayerRole,
} from "./studio-layer-navigator";
import { groupOfItem, isEffectivelyHidden, type LayerGroup } from "./studio-layers";
import { LIQUIFY_RADIUS_RANGE, LIQUIFY_STRENGTH_RANGE, type StudioLiquifyMode } from "./studio-liquify-contract";
import { type MagicResizePreset, type MagicResizeStrategy } from "./studio-magic-resize";
import {
  studioMobileSheetSizeStyle,
  type StudioMobileSheetSnap,
} from "./studio-mobile-sheet-snap";
import { isPressureWidthBrush, type NodeEditHandle, type NodeEditTool } from "./studio-node-edit";
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
  StudioFloodFillPanel,
  StudioGradientEnginePanel,
  StudioHealClonePanel,
  StudioHistoryBrushPanel,
  StudioImageAdjustmentsPanel,
  StudioIsometricGridPanel,
  StudioLayerMaskPanel,
  StudioLayerNavigator,
  StudioLiquifyPanel,
  StudioPageGradePanel,
  StudioPatternFillPanel,
  StudioPerspectivePanel,
  StudioPuppetWarpPanel,
  StudioQuickShapePanel,
  StudioSelectionToolsPanel,
  StudioShapePickerGrid,
  StudioSmudgePanel,
  StudioStrokeShapePanel,
  StudioTextEffectPanel,
  StudioTextPathPanel,
} from "./studio-page-lazy-ui";
import { type PageState } from "./studio-page-state";
import { type VanishingPoint } from "./studio-perspective-guide";
import { type PixelSelectionHistoryOperation } from "./studio-pixel-selection-history";
import {
  isPuppetWarpNoop,
  removePuppetPin,
  resetPuppetPinPositions,
  type PuppetPin,
} from "./studio-puppet-warp";
import { QUICKSHAPE_KIND_LABELS } from "./studio-quickshape-labels";
import {
  emptyPixelSelection,
  expandContractSelection,
  flipSelection,
  removeLastSubpath,
  rotateSelection,
  scaleSelection,
  selectAllPixels,
  setSelectionFeather,
  toggleSelectionInvert,
  translateSelection,
  type PixelSelection,
  type PolyLassoSession,
  type SelPoint,
  type SelectionAdjustPlan,
  type SelectionCombineMode,
  type SelectionContentTransform,
  type SelectionToolKind,
} from "./studio-selection-tools";
import { normalizeSkewPatch } from "./studio-skew";
import { normalizeShapeParams, normalizeStrokeStyle } from "./studio-stroke-shapes";
import { normalizeTextPath, type TextPathConfig } from "./studio-text-path";
import { projectStudioViewRectToDocumentRect, type StudioViewRotation } from "./studio-view-controls";
import { StudioBgRemoveButton } from "./StudioBgRemoveButton";
import { StudioInspectorBubbleAppearanceControls } from "./StudioInspectorBubbleAppearanceControls";
import { StudioInspectorBubbleShapeControls } from "./StudioInspectorBubbleShapeControls";
import { StudioInspectorCanvasControls } from "./StudioInspectorCanvasControls";
import { StudioInspectorDrawModeControls } from "./StudioInspectorDrawModeControls";
import { StudioInspectorFocusSpeedFrameControls } from "./StudioInspectorFocusSpeedFrameControls";
import { StudioInspectorNavigator } from "./StudioInspectorNavigator";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import { StudioLineCleanupPanel } from "./StudioLineCleanupPanel";
import { StudioLineCorrectionControls } from "./StudioLineCorrectionControls";
import { StudioMagicWandPanel } from "./StudioMagicWandPanel";
import { StudioMobileSheetHandle } from "./StudioMobileSheetHandle";
import { StudioNodeEditPanel } from "./StudioNodeEditPanel";
import { StudioSkewPanel } from "./StudioSkewPanel";

import type {
  StudioAdvancedRuler,
  StudioAdvancedRulerDocument,
} from "./studio-advanced-ruler-document";
import type { StudioLayerNavigatorAction } from "./StudioLayerNavigator";
import type { StudioMobileSheet } from "./StudioMobileEditingDock";

import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";

export interface StudioInspectorAsideHandlers {
  addAdvancedRuler: (type: StudioAdvancedRuler["type"]) => void;
  addBubbleShapePointFromInspector: () => void;
  addLayerGroup: (seedElId?: string) => void;
  addLayerMask: (fill: LayerMaskPaintMode) => void;
  addVanishingPointHandler: () => void;
  alignSelected: (mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "distributeH" | "distributeV") => void;
  announceDrawingShortcut: (message: string) => void;
  applyBgPreset: (p: BgPreset) => void;
  applyContentAwareFill: () => Promise<void>;
  applyCropToSelectedImage: () => Promise<void>;
  applyDynamicsPreset: (id: StudioBrushDynamicsPresetId, settings: NormalizedStudioBrushDynamicsSettings) => void;
  applyMagicResizePreset: (preset: MagicResizePreset) => void;
  applyPageGrade: (grade: PageGrade) => void;
  applyPixelSelectionAdjust: (plan: SelectionAdjustPlan) => Promise<void>;
  applyPixelSelectionContentTransform: (transform: SelectionContentTransform) => Promise<void>;
  applyPuppetWarpToSelectedImage: () => Promise<void>;
  applySavedBrush: (saved: StudioSavedBrush) => void;
  assignElementToGroup: (elId: string, groupId: string | undefined) => void;
  changeInspectorLayout: (next: StudioInspectorLayout) => void;
  clearHealCloneSource: () => void;
  clearPolyLassoDraft: () => void;
  commit: (nextElements: El[], extraPatch?: Partial<Omit<PageState, "id" | "elements">>, targetPageId?: string) => boolean;
  deleteLayerMask: () => void;
  detachBubbleAnchor: () => void;
  disarmAllPixelTools: () => void;
  duplicateSelected: () => void;
  ensureRecentColorsLoaded: () => void;
  ensureWebtoonGuidesLoaded: () => void;
  fitBubbleToText: () => Promise<void>;
  fitSelectedToFrame: () => Promise<void>;
  handleLayerNavigatorAction: (action: StudioLayerNavigatorAction) => void;
  invertLayerMask: () => void;
  insertIsometricPrimitive: (spec: StudioIsometricPrimitiveSpec) => Promise<void>;
  insertIsometricSolid: () => void;
  patchAdvancedRuler: (id: string, patch: Partial<StudioAdvancedRuler>) => void;
  moveVanishingPointById: (id: string, x: number, y: number) => void;
  previewVanishingPointById: (id: string, x: number, y: number) => void;
  previewIsometricOrigin: (x: number, y: number) => void;
  commitIsometricOrigin: (x: number, y: number) => void;
  onColorizeSelected: () => void;
  onMinimapClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMinimapKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  openFeatureTutorial: (tutorialId?: string | null) => void;
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
  setDescription: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<string>>>[0]) => void;
  setIsometricAngleDegClamped: (next: number) => void;
  setIsometricCellSizeClamped: (next: number) => void;
  previewIsometricAngleDegClamped: (next: number) => void;
  previewIsometricCellSizeClamped: (next: number) => void;
  setPanelGutter: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<number>>>[0]) => void;
  setTagsText: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<string>>>[0]) => void;
  setTitle: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<string>>>[0]) => void;
  setWebtoonTheme: (next: Parameters<import("react").Dispatch<import("react").SetStateAction<"classic" | "soft" | "vivid">>>[0]) => void;
  splitFrameSelected: (orientation: "horizontal" | "vertical") => void;
  startEditText: (id: string) => void;
  toggleAdvancedFill: () => void;
  toggleBubbleAnchorPick: () => void;
  toggleLiquifyTool: () => void;
  toggleSmudgeTool: () => void;
  toggleEffectFavorite: (effectId: StudioEffectId) => void;
  toggleIsometricGridActive: () => void;
  toggleLayerMaskEnabled: () => void;
  toggleLocalHidden: (id: string) => void;
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
  color: string;
  cropAspect: CropAspectId;
  cropBusy: boolean;
  cropRect: CropRect | null;
  currentBrushSnapshot: StudioBrushSnapshot;
  currentPageId: string;
  currentTemplate: TemplateSpec | null;
  description: string;
  drawMode: DrawMode;
  drawShape: DrawShapeKind;
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
  layerMaskBusy: boolean;
  layerMaskHardness: number;
  layerMaskPaintActive: boolean;
  layerMaskPaintMode: LayerMaskPaintMode;
  layerMaskRadius: number;
  layerMaskStrength: number;
  layerNavigatorItems: StudioLayerNavigatorItem[];
  /** "나만 숨기기" — 문서(CRDT)에 없는, 이 클라이언트에서만 켠 로컬 숨김 대상. */
  localHiddenElementIds: ReadonlySet<string>;
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
  pixelBrushRadius: number;
  pixelBusy: boolean;
  pixelCombine: SelectionCombineMode;
  pixelSel: PixelSelection | null;
  pixelSelectionCanRedo: boolean; pixelSelectionCanUndo: boolean;
  pixelTool: SelectionToolKind | "wand" | null;
  polyLassoSession: PolyLassoSession | null;
  postCorrection: number;
  preserveCorners: boolean;
  pressureCurve: number;
  propsSheetRef: import("react").RefObject<HTMLElement | null>;
  puppetWarpActive: boolean;
  puppetWarpBusy: boolean;
  puppetWarpPins: PuppetPin[];
  quickShapeActive: boolean;
  recentColors: string[];
  rightResize: import("@/components/use-resizable").Resizable;
  savedBrushes: StudioSavedBrush[];
  saving: boolean;
  scrollPos: { left: number; top: number; width: number; height: number; scrollWidth: number; scrollHeight: number; };
  selected: El | null;
  selectedBg3dEditSource: { readonly scene?: StudioBg3dSceneDocument; readonly legacyDataUrl?: string; } | null;
  selectedBubbleTailGeometry: import("./studio-bubble-custom-shape").BubbleShapeGeometry | null;
  selectedContentMutationLocked: boolean;
  selectedId: string | null;
  selectedReadableImageSource: string | null;
  selectedWorkAssetDestructiveEditReason: string | null;
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
  setDrawMode: import("react").Dispatch<import("react").SetStateAction<DrawMode>>;
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
  setMobileSheet: import("react").Dispatch<import("react").SetStateAction<StudioMobileSheet>>;
  setNodeEditTool: import("react").Dispatch<import("react").SetStateAction<NodeEditTool | null>>;
  setNodeSmoothStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPageGradePanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPanelSplitActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPanelSplitHint: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setPanelSplitRatio: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPerspectiveRulerActive: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPixelBrushRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setPixelCombine: import("react").Dispatch<import("react").SetStateAction<SelectionCombineMode>>;
  setPixelForceCircle: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  commitPixelSelectionState: (update: PixelSelection | null | ((current: PixelSelection | null) => PixelSelection | null), operation: PixelSelectionHistoryOperation, coalesceKey?: string) => boolean;
  resetPixelSelectionState: (selection: PixelSelection | null) => void;
  undoPixelSelectionState: () => void;
  redoPixelSelectionState: () => void;
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
  setShowGrid: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setShowWebtoonGuides: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setSmudgeRadius: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSmudgeStrength: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSnapEnabled: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setStabilizer: import("react").Dispatch<import("react").SetStateAction<number>>;
  setStabilizerMode: import("react").Dispatch<import("react").SetStateAction<"standard" | "adaptive" | "precision">>;
  setStampTuning: import("react").Dispatch<import("react").SetStateAction<{ flow: number; hardness: number; minSize: number; } | null>>;
  setStrokeWidth: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryCenterX: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryCenterY: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryRadialCount: import("react").Dispatch<import("react").SetStateAction<number>>;
  setSymmetryType: import("react").Dispatch<import("react").SetStateAction<"none" | "vertical" | "horizontal" | "radial" | "kaleidoscope">>;
  setTiltEnabled: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTipAngle: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTipRoundness: import("react").Dispatch<import("react").SetStateAction<number>>;
  setTool: import("react").Dispatch<import("react").SetStateAction<Tool>>;
  setUserGuides: import("react").Dispatch<import("react").SetStateAction<{ id: string; type: "v" | "h"; pos: number; }[]>>;
  setUseVelocityPressure: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setVelocitySensitivity: import("react").Dispatch<import("react").SetStateAction<number>>;
  setWandTolerance: import("react").Dispatch<import("react").SetStateAction<number>>;
  shapeFill: boolean;
  showGrid: boolean;
  showWebtoonGuides: boolean;
  smudgeActive: boolean;
  smudgeBusy: boolean;
  smudgeRadius: number;
  smudgeStrength: number;
  snapEnabled: boolean;
  stabilizer: number;
  stabilizerMode: "standard" | "adaptive" | "precision";
  stampTuning: { flow: number; hardness: number; minSize: number; } | null;
  strokeWidth: number;
  symmetryCenterX: number;
  symmetryCenterY: number;
  symmetryRadialCount: number;
  symmetryType: "none" | "vertical" | "horizontal" | "radial" | "kaleidoscope";
  tagsText: string;
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
  color,
  cropAspect,
  cropBusy,
  cropRect,
  currentBrushSnapshot,
  currentPageId,
  currentTemplate,
  description,
  drawMode,
  drawShape,
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
  layerMaskBusy,
  layerMaskHardness,
  layerMaskPaintActive,
  layerMaskPaintMode,
  layerMaskRadius,
  layerMaskStrength,
  layerNavigatorItems,
  localHiddenElementIds,
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
  pixelBrushRadius,
  pixelBusy,
  pixelCombine,
  pixelSel,
  pixelSelectionCanRedo,
  pixelSelectionCanUndo,
  pixelTool,
  polyLassoSession,
  postCorrection,
  preserveCorners,
  pressureCurve,
  propsSheetRef,
  puppetWarpActive,
  puppetWarpBusy,
  puppetWarpPins,
  quickShapeActive,
  recentColors,
  rightResize,
  savedBrushes,
  saving,
  scrollPos,
  selected,
  selectedBg3dEditSource,
  selectedBubbleTailGeometry,
  selectedContentMutationLocked,
  selectedId,
  selectedReadableImageSource,
  selectedWorkAssetDestructiveEditReason,
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
  setDrawMode,
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
  setShowGrid,
  setShowWebtoonGuides,
  setSmudgeRadius,
  setSmudgeStrength,
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
  showGrid,
  showWebtoonGuides,
  smudgeActive,
  smudgeBusy,
  smudgeRadius,
  smudgeStrength,
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
    addAdvancedRuler,
    addBubbleShapePointFromInspector,
    addLayerGroup,
    addLayerMask,
    addVanishingPointHandler,
    alignSelected,
    announceDrawingShortcut,
    applyBgPreset,
    applyContentAwareFill,
    applyCropToSelectedImage,
    applyDynamicsPreset,
    applyMagicResizePreset,
    applyPageGrade,
    applyPixelSelectionAdjust,
    applyPixelSelectionContentTransform,
    applyPuppetWarpToSelectedImage,
    applySavedBrush,
    assignElementToGroup,
    changeInspectorLayout,
    clearHealCloneSource,
    clearPolyLassoDraft,
    commit,
    deleteLayerMask,
    detachBubbleAnchor,
    disarmAllPixelTools,
    duplicateSelected,
    ensureRecentColorsLoaded,
    ensureWebtoonGuidesLoaded,
    fitBubbleToText,
    fitSelectedToFrame,
    handleLayerNavigatorAction,
    invertLayerMask,
    insertIsometricPrimitive,
    insertIsometricSolid,
    patchAdvancedRuler,
    moveVanishingPointById,
    previewVanishingPointById,
    previewIsometricOrigin,
    commitIsometricOrigin,
    onColorizeSelected,
    onMinimapClick,
    onMinimapKeyDown,
    openFeatureTutorial,
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
    setDescription,
    setIsometricAngleDegClamped,
    setIsometricCellSizeClamped,
    previewIsometricAngleDegClamped,
    previewIsometricCellSizeClamped,
    setPanelGutter,
    setTagsText,
    setTitle,
    setWebtoonTheme,
    splitFrameSelected,
    startEditText,
    toggleAdvancedFill,
    toggleBubbleAnchorPick,
    toggleLiquifyTool,
    toggleSmudgeTool,
    toggleEffectFavorite,
    toggleIsometricGridActive,
    toggleLayerMaskEnabled,
    toggleLocalHidden,
    updateAdvancedFillSettings,
  } = stableHandlers;
  const [activatedImageInspectorTabs, setActivatedImageInspectorTabs] = useState<
    ReadonlySet<StudioImageInspectorSection>
  >(() => new Set());
  const [mobileInspectorSnap, setMobileInspectorSnap] =
    useState<StudioMobileSheetSnap>("medium");
  const safeMobileKeyboardInset = Number.isFinite(mobileKeyboardInset)
    ? Math.max(0, Math.round(mobileKeyboardInset))
    : 0;
  const activeImageInspectorTab =
    inspectorLayout.primary === "properties" && selected?.type === "image"
      ? inspectorLayout.image
      : null;

  useEffect(() => {
    if (!activeImageInspectorTab) return;
    setActivatedImageInspectorTabs((current) => {
      if (current.has(activeImageInspectorTab)) return current;
      const next = new Set(current);
      next.add(activeImageInspectorTab);
      return next;
    });
  }, [activeImageInspectorTab]);

  const shouldMountImageInspectorTab = (tab: StudioImageInspectorSection) =>
    activeImageInspectorTab === tab || activatedImageInspectorTabs.has(tab);
  const activeInspectorBrushName =
    BRUSH_PRESETS.find((preset) => preset.id === brush)?.name ?? brush;
  const minimapViewportRect = projectStudioViewRectToDocumentRect({
    documentWidth: CANVAS_W,
    documentHeight: canvasH,
    canvasFlipH,
    canvasRotation,
    x: scrollPos.left / effScale,
    y: scrollPos.top / effScale,
    width: scrollPos.width / effScale,
    height: scrollPos.height / effScale,
  });
  const drawingAssistControlsDisabled = activeSurfaceReviewLocked || saving || masterEditMode;
  const drawingAssistDisabledReason = masterEditMode
    ? "마스터 편집을 마친 뒤 페이지 드로잉 가이드를 조정할 수 있어요."
    : saving
      ? "저장이 끝난 뒤 드로잉 가이드를 조정할 수 있어요."
      : collaborationDocumentLocked
        ? "공동 문서 편집 권한이 없어 드로잉 가이드가 잠겼어요."
        : activeSurfaceReviewLocked
          ? "검토 잠금을 해제한 뒤 드로잉 가이드를 조정할 수 있어요."
          : undefined;
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
            // 모바일: 하단에서 올라오는 바텀시트
            "fixed inset-x-0 bottom-0 z-[60] overflow-y-auto rounded-t-3xl border border-line bg-panel p-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl transition-[transform,height,max-height] duration-300 ease-out motion-reduce:transition-none",
            // 데스크톱: 뷰포트 높이 엣지 도크 — 메뉴바+툴벨트 높이만 빼고 캔버스와 나란히 채움.
            "lg:static lg:z-auto lg:max-h-none lg:min-h-0 lg:flex-none lg:self-stretch lg:overflow-y-auto lg:rounded-none lg:border lg:border-y-0 lg:border-r-0 lg:border-line lg:bg-panel/50 lg:p-2 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "props" ? "translate-y-0" : "translate-y-full",
            !visibleRightPanelOpen && "lg:hidden",
            inspectorLayout.primary === "layers" && "overflow-hidden lg:overflow-hidden"
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
              : { width: rightResize.width, minWidth: 240 }
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
          <StudioInspectorNavigator
            layout={inspectorLayout}
            selectedType={selected?.type ?? null}
            selectionLabel={selected ? elementLabel(selected) : null}
            drawing={selected === null && tool === "draw"}
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
            onChange={changeInspectorLayout}
          />

          <StudioInspectorCanvasControls
            background={bg}
            canvasHeight={canvasH}
            controlsDisabled={collaborationDocumentLocked}
            gridSize={gridSize}
            hidden={
              inspectorLayout.primary !== "document" ||
              inspectorLayout.document !== "canvas"
            }
            magicResizeStrategy={magicResizeStrategy}
            masterEditMode={masterEditMode}
            panelGutter={panelGutter}
            showGrid={showGrid}
            showWebtoonGuides={showWebtoonGuides}
            snapEnabled={snapEnabled}
            templateGutterAvailable={
              currentTemplate !== null && currentTemplate.id !== "blank"
            }
            userGuides={userGuides}
            webtoonGuides={webtoonGuides}
            webtoonTheme={webtoonTheme}
            onAddUserGuide={(type) => {
              setUserGuides((current) => [
                ...current,
                {
                  id: uid(),
                  type,
                  pos: type === "v" ? CANVAS_W / 2 : canvasH / 2,
                },
              ]);
            }}
            onApplyBackgroundPreset={applyBgPreset}
            onApplyMagicResizePreset={applyMagicResizePreset}
            onBackgroundChange={setBg}
            onCanvasHeightDelta={(delta) => setCanvasH((height) => height + delta)}
            onClearUserGuides={() => setUserGuides([])}
            onDeleteUserGuide={(id) => {
              setUserGuides((current) => current.filter((guide) => guide.id !== id));
            }}
            onGradientChange={setBgGrad}
            onGridSizeChange={setGridSize}
            onMagicResizeStrategyChange={setMagicResizeStrategy}
            onMoveUserGuide={(id, pos) => {
              setUserGuides((current) =>
                current.map((guide) => (guide.id === id ? { ...guide, pos } : guide))
              );
            }}
            onOpenBackgroundEditor={() => setMenu("bgFill")}
            onPanelGutterChange={(nextGutter) => {
              if (collaborationDocumentLocked) return;
              setPanelGutter(nextGutter);
              setSharedDocumentNotice(null);
              if (currentTemplate) {
                const nextElements = regenerateTemplate(currentTemplate, nextGutter);
                commit(nextElements);
              }
            }}
            onShowGridChange={setShowGrid}
            onShowWebtoonGuidesChange={(visible) => {
              if (visible) ensureWebtoonGuidesLoaded();
              setShowWebtoonGuides(visible);
            }}
            onSnapEnabledChange={setSnapEnabled}
            onWarmWebtoonGuides={ensureWebtoonGuidesLoaded}
            onWebtoonThemeChange={(theme) => {
              if (collaborationDocumentLocked) return;
              setWebtoonTheme(theme);
              setSharedDocumentNotice(null);
            }}
          />
          {/* 페이지 전체 색보정(그레이드) — 무드 프리셋 + 밝기/대비/채도/색조/세피아/흑백/비네트 */}
          <div
            role="tabpanel"
            aria-label="페이지 색보정"
            hidden={
              inspectorLayout.primary !== "document" ||
              inspectorLayout.document !== "grade"
            }
            className="rounded-xl border border-line bg-panel/40 p-3"
          >
            {pageGradePanelOpen ? (
              <>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPageGradePanelOpen(false)}
                    className="inline-flex items-center gap-0.5 rounded text-[0.68rem] text-fg-3 transition-colors hover:text-fg"
                    title="색보정 패널 접기"
                  >
                    접기 <ChevronUp size={13} />
                  </button>
                </div>
                <Suspense fallback={<StudioPanelLoading label="색보정 패널을 여는 중..." />}>
                  <StudioPageGradePanel
                    grade={pageGrade}
                    onPatch={patchPageGrade}
                    onApplyPreset={applyPageGrade}
                    onReset={resetPageGrade}
                  />
                </Suspense>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPageGradePanelOpen(true)}
                aria-expanded={false}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-line/70 bg-card/65 px-3 py-2 text-left transition-colors hover:bg-raised"
              >
                <span className="min-w-0">
                  <span className="block text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">페이지 색보정</span>
                  <span className="mt-0.5 block text-xs text-fg-2">
                    {pageGradeActive ? "보정 적용됨" : "무드 프리셋·밝기·대비"}
                  </span>
                </span>
                <ChevronDown size={14} className="shrink-0 text-fg-3" />
              </button>
            )}
          </div>

          {selected && (
            <div
              role="tabpanel"
              aria-label="선택 요소 속성"
              hidden={inspectorLayout.primary !== "properties"}
              className="rounded-xl border border-line bg-panel/40 p-3"
            >
              <Suspense fallback={<StudioPanelLoading label="속성 패널을 여는 중..." />}>
                <p className="mb-2 text-xs font-semibold text-fg-3">선택한 요소</p>
              {selected.type === "draw" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 색상
                    <input
                      type="color"
                      value={selected.stroke || "#16100c"}
                      aria-label="선 색상"
                      onChange={(e) => patchEl(selected.id, { stroke: e.target.value } as Partial<El>)}
                      className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                    />
                  </div>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 두께
                    <span className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={1}
                        max={48}
                        value={selected.strokeWidth ?? 3}
                        onChange={(e) => patchEl(selected.id, { strokeWidth: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.strokeWidth ?? 3}px</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    불투명도
                    <span className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={selected.opacity ?? 1}
                        onChange={(e) => patchEl(selected.id, { opacity: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.opacity ?? 1) * 100)}%</span>
                    </span>
                  </label>

                  {/* 채우기 가능 도형(rect/ellipse/star/triangle/polygon) 색상·그라데이션·패턴 조절.
                      우선순위: 패턴 > 그라데이션 > 단색. 그라데이션 렌더는 rect/ellipse/star만 지원해 그 3종에만 노출. */}
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

                  {/* 선 스타일(점선/선 끝/화살촉) + 도형 파라미터(별/다각형/모서리) — 도형·선 전용 */}
                  {selected.kind && selected.kind !== "freehand" && (
                    <div className="mt-2.5 border-t border-line/40 pt-2.5">
                      <Suspense fallback={<StudioPanelLoading label="선 스타일 패널을 여는 중..." />}>
                        <StudioStrokeShapePanel
                          kind={selected.kind}
                          strokeStyle={normalizeStrokeStyle(selected.strokeStyle)}
                          shapeParams={normalizeShapeParams(selected.shapeParams)}
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
                        />
                      </Suspense>
                    </div>
                  )}

                  {(selected.kind ?? "freehand") === "freehand" && (
                    <div className="mt-2.5 border-t border-line/40 pt-2.5">
                      <StudioNodeEditPanel
                        active={nodeEditTool !== null}
                        tool={nodeEditTool ?? "move"}
                        handleCount={nodeEditHandles.length}
                        widthModeSupported={isPressureWidthBrush(selected.brush, selected.mode)}
                        smoothStrength={nodeSmoothStrength}
                        onSmoothStrengthChange={setNodeSmoothStrength}
                        onToggle={() => {
                          if (nodeEditTool) {
                            setNodeEditTool(null);
                            return;
                          }
                          disarmAllPixelTools();
                          setNodeEditTool("move");
                        }}
                        onToolChange={(t) => setNodeEditTool(t)}
                      />
                    </div>
                  )}
                </div>
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
                <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">채우기 스타일</p>
                  
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
                      
                      {/* 시작/종료/방향 레거시 컨트롤은 멀티스톱 엔진 패널로 대체 */}
                    </div>
                  )}
                </div>
              )}
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
                  mutationLocked={selectedContentMutationLocked}
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
              {(selected.type === "text" || selected.type === "bubble") && (
                <>
                  <div className="mt-2">
                    <p className="mb-1 text-[0.66rem] font-medium text-fg-3">글꼴</p>
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: "고딕", v: "Pretendard, sans-serif" },
                        { label: "명조", v: "'Nanum Myeongjo', serif" },
                        { label: "둥근만화", v: "'Jua', sans-serif" },
                        { label: "타이틀/굵은", v: "'Black Han Sans', sans-serif" },
                        { label: "손글씨", v: "'Gaegu', cursive" },
                        { label: "펜글씨", v: "'Nanum Pen Script', cursive" },
                        { label: "아기자기", v: "'Gamja Flower', cursive" },
                        { label: "붓글씨/고풍", v: "'Yeon Sung', cursive" },
                        { label: "분노/공포", v: "'East Sea Dokdo', cursive" },
                      ].map((f) => (
                        <button
                          key={f.label}
                          type="button"
                          onClick={() => patchEl(selected.id, { font: f.v } as Partial<El>)}
                          style={{ fontFamily: f.v }}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs",
                            (selected.font ?? "Pretendard, sans-serif") === f.v
                              ? "border-accent/60 bg-accent-soft/50 text-fg"
                              : "border-line text-fg-2 hover:bg-raised"
                          )}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
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

                  {/* 정렬 및 스타일 설정 */}
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
                        {/* Bold / Italic Toggle Buttons */}
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
              {/* 곡선 텍스트 — 아치/물결/원형 경로(Konva TextPath). */}
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
              {selected.type !== "frame" && containingPanel(selected, elements) && (
                <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
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
              {(selected.type === "text" || selected.type === "bubble") && (
                <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2">
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

              {(selected.type === "image" || selected.type === "bubble") && (
                <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                  비율 잠금 (변형 시 종횡비 유지)
                  <input
                    type="checkbox"
                    checked={!!selected.lockAspect}
                    onChange={(e) => patchEl(selected.id, { lockAspect: e.target.checked } as Partial<El>)}
                    className="size-4 accent-accent cursor-pointer"
                  />
                </label>
              )}

              {/* 클리핑 마스크 — 바로 아래 레이어 영역으로 잘라낸다(채색·톤을 밑그림 안에 가두기). */}
              <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2" title="바로 아래 레이어의 영역 안으로만 보이게 잘라냅니다(채색·톤 가두기).">
                아래 레이어에 클리핑
                <input
                  type="checkbox"
                  checked={!!selected.clipBelow}
                  onChange={(e) => patchEl(selected.id, { clipBelow: e.target.checked } as Partial<El>)}
                  className="size-4 accent-accent cursor-pointer"
                />
              </label>

              {/* 레이어 그룹 지정 */}
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

              {/* 직접 좌표 및 크기 조정 (코미포 스타일) */}
              {selected.type !== "draw" && (
                <div className="mt-3 border-t border-line/50 pt-3 space-y-2">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">위치 및 크기</p>
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
              )}

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

              {(selected.type === "focusLines"
                || selected.type === "speedLines"
                || selected.type === "frame") ? (
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
                    setPanelSplitActive((active) => {
                      const next = !active;
                      if (next) disarmAllPixelTools();
                      return next;
                    });
                  }}
                  onPanelGutterChange={(value) => {
                    if (collaborationDocumentLocked) return;
                    setPanelGutter(value);
                    setSharedDocumentNotice(null);
                  }}
                />
              ) : null}

              {selected.type === "image" && (
                <>
                  {selectedWorkAssetDestructiveEditReason ? (
                    <p
                      role="status"
                      className="rounded-lg border border-accent/35 bg-accent/10 px-3 py-2 text-xs leading-relaxed text-fg-2"
                    >
                      {selectedWorkAssetDestructiveEditReason}
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
                      {/* 주요 색상 추출 — 스와치를 누르면 브러시·도형 색(전역 color 상태)으로 지정된다. */}
                      {selectedReadableImageSource ? (
                        <StudioColorPalettePanel
                          src={selectedReadableImageSource}
                          onPickColor={(hex) => setColor(hex)}
                        />
                      ) : null}
                    </Suspense>
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
                    selectedIsReference={selected.fillReference === true}
                    targetUnsupportedReason={advancedFillUnsupportedReason}
                    statusMessage={advancedFillStatus}
                    diagnostics={advancedFillPreview?.diagnostics}
                    onToggleActive={toggleAdvancedFill}
                    onFillColorChange={setColor}
                    onSettingsChange={updateAdvancedFillSettings}
                    onToggleSelectedReference={() => {
                      setAdvancedFillPreview(null);
                      patchEl(selected.id, { fillReference: !selected.fillReference } as Partial<El>);
                      setAdvancedFillStatus(
                        selected.fillReference
                          ? "채우기 참조 지정을 해제했습니다."
                          : "이 래스터를 채우기 참조 선화로 지정했습니다.",
                      );
                    }}
                    onResetSettings={() =>
                      updateAdvancedFillSettings({ ...DEFAULT_STUDIO_ADVANCED_FILL_SETTINGS })
                    }
                  />
                  {!selectedWorkAssetDestructiveEditReason ? (
                    <StudioLineCleanupPanel
                      src={selected.src}
                      onResult={(dataUrl) => patchEl(selected.id, { src: dataUrl })}
                    />
                  ) : null}
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("quick") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "quick"}>
                    <Suspense fallback={<StudioPanelLoading label="이미지 보정을 여는 중..." />}>
                    <StudioImageAdjustmentsPanel
                      selected={selected}
                      filterClipboard={filterClipboard}
                      onSetFilterClipboard={setFilterClipboard}
                      onPatch={(patch) => patchEl(selected.id, patch)}
                      effectFavoriteState={effectFavoriteState}
                      onToggleEffectFavorite={toggleEffectFavorite}
                      onRememberEffectRecent={rememberEffectRecent}
                    />
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("retouch") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "retouch"}>
                    <Suspense fallback={<StudioPanelLoading label="선택·리터치 도구를 여는 중..." />}>
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
                      if (t) disarmAllPixelTools();
                      // 원형 선택은 ellipse + forceCircle 조합이다. 리터치 패널의 일반
                      // 타원을 다시 고를 때 이전 원형 제약이 새 세션으로 새지 않게 한다.
                      setPixelForceCircle(false);
                      setPixelTool(t);
                    }}
                    onCombineModeChange={setPixelCombine}
                    onFeatherChange={(px) => commitPixelSelectionState((selection) => selection ? setSelectionFeather(selection, px) : selection, "feather", "feather")}
                    onToggleInvert={() => commitPixelSelectionState((selection) => toggleSelectionInvert(selection ?? emptyPixelSelection()), "invert")}
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
                      const aspect =
                        selected?.type === "image" && selected.width > 0
                          ? selected.height / selected.width
                          : 1;
                      commitPixelSelectionState((selection) => rotateSelection(selection, degrees, { aspect }) ?? selection, "transform");
                    }}
                    onFlip={(axis) => commitPixelSelectionState((selection) => flipSelection(selection, axis) ?? selection, "transform")}
                    onTranslate={(dx, dy) => commitPixelSelectionState((selection) => translateSelection(selection, dx, dy) ?? selection, "move")}
                    onScale={(factor) => {
                      const aspect =
                        selected?.type === "image" && selected.width > 0
                          ? selected.height / selected.width
                          : 1;
                      commitPixelSelectionState((selection) => scaleSelection(selection, factor, { aspect }) ?? selection, "transform");
                    }}
                    onContentTransform={(t) => void applyPixelSelectionContentTransform(t)}
                    onApplyAdjust={(plan) => void applyPixelSelectionAdjust(plan)}
                    onContentAwareFill={() => void applyContentAwareFill()}
                  />
                  <StudioMagicWandPanel
                    active={pixelTool === "wand"}
                    tolerance={wandTolerance}
                    busy={pixelBusy}
                    onToggleActive={() => {
                      const next = pixelTool === "wand" ? null : "wand";
                      if (next) disarmAllPixelTools();
                      setPixelTool(next);
                    }}
                    onToleranceChange={setWandTolerance}
                  />
                  <StudioSmudgePanel
                    active={smudgeActive}
                    radius={smudgeRadius}
                    strength={smudgeStrength}
                    busy={smudgeBusy}
                    onToggleActive={toggleSmudgeTool}
                    onRadiusChange={setSmudgeRadius}
                    onStrengthChange={setSmudgeStrength}
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
                    onToggleActive={() =>
                      setHistoryBrushActive((v) => {
                        const next = !v;
                        if (next) {
                          disarmAllPixelTools();
                          return true;
                        }
                        return false;
                      })
                    }
                    onRadiusChange={setHistoryBrushRadius}
                    onHardnessChange={setHistoryBrushHardness}
                    onOpacityChange={setHistoryBrushOpacity}
                    onClearSource={() => {
                      setHistoryBrushSourceIndex(null);
                      setHistoryBrushSourceSrc(null);
                    }}
                      onOpenHistoryPanel={historyPanelOpen ? undefined : () => setHistoryPanelOpen(true)}
                    />
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("mask") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "mask"}>
                    <Suspense fallback={<StudioPanelLoading label="레이어 마스크를 여는 중..." />}>
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
                    onDeleteMask={deleteLayerMask}
                    onToggleEnabled={toggleLayerMaskEnabled}
                    onInvert={invertLayerMask}
                    onTogglePaintActive={() =>
                      setLayerMaskPaintActive((v) => {
                        const next = !v;
                        if (next) disarmAllPixelTools();
                        return next;
                      })
                    }
                    onPaintModeChange={setLayerMaskPaintMode}
                    onRadiusChange={setLayerMaskRadius}
                    onHardnessChange={setLayerMaskHardness}
                      onStrengthChange={setLayerMaskStrength}
                    />
                    </Suspense>
                  </div>
                  ) : null}
                  {shouldMountImageInspectorTab("transform") ? (
                  <div className="space-y-3" hidden={activeImageInspectorTab !== "transform"}>
                    <Suspense fallback={<StudioPanelLoading label="이미지 변형 도구를 여는 중..." />}>
                    {/* 이미지 크롭 — 캔버스 위 크롭 rect 를 조절해 원본 해상도로 자른다. */}
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
                      // 크롭 진입 — 스테이지 제스처가 겹치지 않게 다른 무장 도구를 함께 끈다.
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
                  {/* 퍼펫 워프 — 핀을 놓고 드래그해 이미지를 관절 인형처럼 변형. 적용 전까지는 오버레이
                      미리보기만 갱신되고 원본 픽셀은 그대로다. */}
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
                <button type="button" onClick={duplicateSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="복제 (⌘J)">
                  <Copy size={14} />
                </button>
                <button type="button" onClick={removeSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-bad" })} title="삭제 (Delete)">
                  <Trash2 size={14} /> 삭제
                </button>
                </div>
              </Suspense>
            </div>
          )}

          {selected === null && tool === "draw" && (
            <div
              role="tabpanel"
              aria-label="그리기 도구 설정"
              hidden={inspectorLayout.primary !== "properties"}
              className="space-y-3 rounded-xl border border-line bg-panel/40 p-3"
            >
              <StudioInspectorDrawModeControls
                drawMode={drawMode}
                onDrawModeChange={setDrawMode}
                onDrawShapeChange={setDrawShape}
                onStrokeWidthChange={setStrokeWidth}
                onSymmetryChange={setSymmetryType}
              />

              {/* 기본 프리셋 탐색은 하단 도크 한 곳에만 둔다. 인스펙터는 현재 상태와
                  사용자 저장 브러시·고급 동역학에 집중해 긴 중복 메뉴를 만들지 않는다. */}
              {drawMode === "pen" && inspectorLayout.primary === "properties" ? (
                <section
                  aria-label="현재 기본 프리셋 요약"
                  data-studio-inspector-brush-summary="true"
                  className="rounded-xl border border-line/70 bg-card/65 p-2.5"
                >
                  <div className="flex min-h-11 items-center gap-2">
                    <span
                      aria-hidden
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-line/70 shadow-inner"
                      style={{ backgroundColor: color }}
                    >
                      <Paintbrush className="size-4 text-white mix-blend-difference" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.58rem] font-semibold text-fg-3">현재 기본 프리셋</span>
                      <span className="block truncate text-xs font-bold text-fg">
                        {activeInspectorBrushName}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-[0.62rem] tabular-nums text-fg-3">
                      <span className="block">{strokeWidth}px</span>
                      <span className="block">{Math.round(brushOpacity * 100)}%</span>
                    </span>
                  </div>
                  <p className="mt-1.5 border-t border-line/45 pt-1.5 text-[0.62rem] leading-relaxed text-fg-3">
                    기본 프리셋 변경은 캔버스 하단 브러시 도크에서 할 수 있어요.
                  </p>
                </section>
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
                      "grid size-9 place-items-center rounded-lg border transition-colors",
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

              {/* 색상 선택 (지우개 아닐 때) */}
              {drawMode !== "eraser" && (
                <div className="space-y-1.5 pt-1.5 border-t border-line/35">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.66rem] font-medium text-fg-3">색상</p>
                    <button
                      type="button"
                      onClick={() => {
                        const next = !eyedropperActive;
                        if (next) disarmAllPixelTools();
                        setEyedropperActive(next);
                      }}
                      aria-pressed={eyedropperActive}
                      title="스포이드 — 캔버스를 클릭해 그 지점의 색을 그대로 가져와요 (펜 도구 중엔 Alt+클릭으로도 가능)"
                      className={cn(
                        "grid size-5 place-items-center rounded border transition-colors",
                        eyedropperActive ? "border-accent bg-accent/15 text-accent" : "border-line text-fg-3 hover:bg-raised"
                      )}
                    >
                      <Pipette className="size-3" aria-hidden />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {DRAW_COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setColor(swatch)}
                        className={cn(
                          "size-5 rounded border transition-transform hover:scale-110",
                          color.toLowerCase() === swatch.toLowerCase() ? "ring-2 ring-accent ring-offset-1 ring-offset-panel" : "border-line/60"
                        )}
                        style={{ background: swatch }}
                        title={swatch}
                      />
                    ))}
                    {/* 커스텀 컬러 */}
                    <label
                      className="relative flex items-center justify-center cursor-pointer size-5 rounded border border-line shadow-sm overflow-hidden"
                      title="사용자 정의 색상"
                      style={{ background: color }}
                    >
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => setColor(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer size-full"
                      />
                      <span className="text-[8px] mix-blend-difference text-white font-bold select-none">C</span>
                    </label>
                  </div>
                </div>
              )}

              {/* 크기 슬라이더 */}
              <div className="space-y-1.5 pt-1.5 border-t border-line/35">
                {drawMode !== "pixel" ? (
                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    <span>크기</span>
                    <span className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={STUDIO_BRUSH_SIZE_RANGE.min}
                        max={STUDIO_BRUSH_SIZE_RANGE.max}
                        value={strokeWidth}
                        onChange={(e) => setStrokeWidth(Number(e.target.value))}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{strokeWidth}px</span>
                    </span>
                  </label>
                ) : null}

                {/* 투명도 슬라이더 */}
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  <span>투명도</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={STUDIO_BRUSH_OPACITY_RANGE.min * 100}
                      max={STUDIO_BRUSH_OPACITY_RANGE.max * 100}
                      step={5}
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

                {drawMode !== "pixel" ? (
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
                ) : null}

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
                          disarmAllPixelTools();
                          setTool("draw");
                          setDrawMode("pen");
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

                {drawMode !== "shape" && drawMode !== "pixel" ? (
                  <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-raised/35 motion-reduce:animate-none" aria-hidden />}>
                    <StudioBrushStudio
                      brushId={brush}
                      strokeWidth={strokeWidth}
                      color={color}
                      settings={brushDynamics}
                      onSettingsChange={setBrushDynamics}
                      onSelectDynamicsPreset={applyDynamicsPreset}
                      useVelocityPressure={useVelocityPressure}
                      onUseVelocityPressureChange={setUseVelocityPressure}
                      velocitySensitivity={velocitySensitivity}
                      onVelocitySensitivityChange={setVelocitySensitivity}
                      pressureCurve={pressureCurve}
                      onPressureCurveChange={setPressureCurve}
                      tiltEnabled={tiltEnabled}
                      onTiltEnabledChange={setTiltEnabled}
                      tipAngle={tipAngle}
                      onTipAngleChange={setTipAngle}
                      tipRoundness={tipRoundness}
                      onTipRoundnessChange={setTipRoundness}
                    />
                  </Suspense>
                ) : null}

                {/* 대칭 그리기 자 (Symmetry Ruler) — RAW 픽셀 입력에는 적용하지 않는다. */}
                {drawMode !== "pixel" ? (
                  <div className="pt-2.5 border-t border-line/35 space-y-2">
                  <p className="text-xs font-semibold text-fg-3">대칭 자 (Symmetry)</p>
                  
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
                ) : null}
                <Suspense fallback={null}>
                  <StudioPerspectivePanel
                    active={perspectiveRulerActive}
                    points={vanishingPoints}
                    disabled={drawingAssistControlsDisabled}
                    disabledReason={drawingAssistDisabledReason}
                    onToggleActive={() => {
                      setPerspectiveRulerActive((active) => !active);
                    }}
                    onAddPoint={addVanishingPointHandler}
                    onRemovePoint={removeVanishingPointHandler}
                    onPreviewPoint={previewVanishingPointById}
                    onCommitPoint={moveVanishingPointById}
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
              </div>
            </div>
          )}

          {inspectorLayout.primary === "properties" && selected === null && tool !== "draw" ? (
            <div
              role="tabpanel"
              aria-label="선택 요소 속성"
              className="rounded-xl border border-line bg-panel/40 px-4 py-8 text-center"
            >
              <div className="mx-auto mb-2 grid size-11 place-items-center rounded-xl border border-line bg-card text-fg-3">
                <MousePointer2 size={20} aria-hidden />
              </div>
              <p className="text-xs font-semibold text-fg-2 text-pretty">편집할 요소를 선택하세요</p>
              <p className="mx-auto mt-1.5 max-w-[30ch] text-[0.68rem] leading-relaxed text-fg-3 text-pretty">
                캔버스에서 프레임·말풍선·획을 고르면 여기에 기본·전문 설정이 나타납니다. 펜 도구(B)로 바로 그릴 수도 있어요.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-[0.62rem] text-fg-3">
                <span className="rounded-full border border-line bg-card px-2 py-1 font-semibold">레이어 탭 · 순서</span>
                <span className="rounded-full border border-line bg-card px-2 py-1 font-semibold">검색 · 채우기/마스크</span>
                <span className="rounded-full border border-line bg-card px-2 py-1 font-semibold">게시 · 내보내기</span>
              </div>
            </div>
          ) : null}

          <div
            role="tabpanel"
            aria-label="레이어"
            hidden={inspectorLayout.primary !== "layers"}
            className="h-[min(31rem,54dvh)] min-h-72 lg:h-[calc(100dvh-28rem)] lg:min-h-72 [&>section]:h-full"
          >
            {inspectorLayout.primary === "layers" ? (
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
                  readOnly={activeSurfaceReviewLocked}
                  groupingDisabled={masterEditMode}
                  localHiddenIds={localHiddenElementIds}
                  onToggleLocalHidden={toggleLocalHidden}
                  onSelectionChange={selectLayersFromNavigator}
                  onAction={handleLayerNavigatorAction}
                />
              </Suspense>
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

                {/* Render scroll window box — 액센트 프레임 + 바깥 영역 딤(오버플로 히든 활용) */}
                {scrollPos.scrollWidth > 0 && (
                  <div
                    className="pointer-events-none absolute rounded-[2px] border border-accent shadow-[0_0_0_240px_oklch(0.1_0.01_70/0.35)]"
                    style={{
                      left: `${(minimapViewportRect.x / CANVAS_W) * 100}%`,
                      top: `${(minimapViewportRect.y / canvasH) * 100}%`,
                      width: `${(minimapViewportRect.width / CANVAS_W) * 100}%`,
                      height: `${(minimapViewportRect.height / canvasH) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <div
            role="tabpanel"
            aria-label="게시 정보"
            hidden={inspectorLayout.primary !== "publish"}
            className="rounded-xl border border-line bg-panel/40 p-3"
          >
            <p className="mb-2 text-xs font-semibold text-fg-3">게시 정보</p>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSharedDocumentNotice(null);
              }}
              aria-label="게시 제목 (필수)"
              placeholder="제목 *"
              maxLength={80}
              spellCheck
              readOnly={collaborationDocumentLocked || saving}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent read-only:cursor-default read-only:text-fg-2"
            />
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setSharedDocumentNotice(null);
              }}
              aria-label="게시 설명 (선택)"
              placeholder="설명 (선택)"
              spellCheck
              rows={2}
              readOnly={collaborationDocumentLocked || saving}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent read-only:cursor-default read-only:text-fg-2"
            />
            <input
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                setSharedDocumentNotice(null);
              }}
              aria-label="게시 태그 (쉼표로 구분, 선택)"
              placeholder="태그 (쉼표로 구분)"
              readOnly={collaborationDocumentLocked || saving}
              className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg focus-visible:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent read-only:cursor-default read-only:text-fg-2"
            />
          </div>
        </aside>
  );
});
