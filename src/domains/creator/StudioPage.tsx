import KonvaCore from "konva/lib/Core";
import "konva/lib/shapes/Circle";
import "konva/lib/shapes/Ellipse";
import "konva/lib/shapes/Image";
import "konva/lib/shapes/Line";
import "konva/lib/shapes/Path";
import "konva/lib/shapes/Rect";
import "konva/lib/shapes/Star";
import "konva/lib/shapes/Text";
import "konva/lib/shapes/TextPath";
import "konva/lib/shapes/Transformer";
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  ArrowDownToLine,
  ArrowUpToLine,
  ArrowRight,
  Boxes,
  Music4,
  Package,
  Pipette,
  PictureInPicture2,
  UserRound,
  Video,
  Triangle,
  Hexagon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  ChevronUp,
  Circle,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  Files,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  FlipHorizontal2,
  FlipVertical2,
  Folder,
  FolderPlus,
  FolderMinus,
  Upload,
  Image as ImageIcon,
  Bookmark,
  Download,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  Lock,
  LockOpen,
  MessageCircle,
  Minus,
  MousePointer2,
  PaintBucket,
  Pencil,
  PenTool,
  Plus,
  Redo2,
  Send,
  SlidersHorizontal,
  Grid2x2,
  Grid2x2Check,
  Grid2x2X,
  Smile,
  Sparkles,
  Square,
  Star as StarIcon,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Search,
  X,
  Layers,
  LayoutGrid,
  Palette,
  Hand,
  Film,
  GanttChartSquare,
  History as HistoryIcon,
} from "lucide-react";
import { Fragment, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Stage, Layer, Rect, Text as KText, TextPath as KTextPath, Image as KImage, Line, Group, Star, Ellipse, Circle as KCircle, Path, Transformer, Shape, Arrow, RegularPolygon } from "react-konva/lib/ReactKonvaCore";
import { useNavigate, useSearchParams } from "react-router-dom";


import { ClipMaskGroup } from "./ClipMaskGroup";
import { canAlphaLock, compositeAlphaLocked, shouldClipToExistingAlpha } from "./studio-alpha-lock";
import {
  clampGlobalFrameIndex,
  globalFrameIndexAtElapsed,
  hasTrack,
  moveKeyframe,
  normalizeAnimationTimelineDoc,
  removeKeyframe,
  removeTrack,
  resolveTimelineComposite,
  setKeyframe,
  type AnimationTimelineDoc,
} from "./studio-anim-tracks";
import {
  BG_PRESETS,
  BUBBLE_VARIANTS,
  CANVAS_W,
  EFFECT_EMOJIS,
  TEMPLATES,
  filterAssetsByLabel,
  filterBgSceneSections,
  groupTemplates,
  type BgPreset,
  type BubbleVariant,
  type TemplateSpec,
  type FrameSpec,
} from "./studio-assets";
import { parseStudio3dTool } from "./studio-background-3d-primitives";
import { BRAND_KIT_LOGO_MASTER_ID, placeBrandKitLogo, type BrandKit } from "./studio-brand-kit";
import {
  BRUSH_PRESETS,
  gpenSegmentWidths,
  processFreehandPoints,
  processPencilPoints,
  screentoneDotRadius,
  screentoneDotsForStroke,
  shouldAppendStrokePoint,
  smoothStrokePoints,
  stabilizePoint,
  STABILIZER_MAX,
} from "./studio-brush";
import { resolveAnchorTargetPoint, computeBubbleAnchorTail, type AnchorTargetBounds } from "./studio-bubble-anchor";
import { BUBBLE_MAX_TAILS, bubblePathData, bubblePathDataMulti, normalizeExtraTails, type BubbleTailSpec } from "./studio-bubble-path";
import { svgToDataUrl } from "./studio-characters";
import { COLOR_WHEEL_LONG_PRESS_MS, clampWheelCenter, selectWheelColors, shouldCancelLongPress } from "./studio-color-wheel";
import { assembleComipoPage, type ComipoAssemblySeed } from "./studio-comipo-assembly";
import {
  runStudioPageAddDialogueBubbles,
  runStudioPageAddSceneTemplate,
  studioSpawnCenter,
  type StudioElementLike,
  type StudioPageInsertState,
  type StudioPageSelectedFrame,
} from "./studio-comipo-shipped";
import {
  applyCropAspect,
  beginCropDrag,
  cropAspectRatio,
  cropHandlePoints,
  cropHitTolerance,
  cropRectLocalPx,
  cropShadeRects,
  cropThirdsLines,
  hitTestCropHandle,
  initialCropRect,
  isCropRectNoop,
  planCropApply,
  updateCropDrag,
  type CropAspectId,
  type CropDragSession,
  type CropRect,
} from "./studio-crop";
import {
  applyDialogueTextEdit,
  applyReplacePlanToPages,
  type DialogueReplacePlan,
} from "./studio-dialogue-batch";
import {
  type ExportFormat,
} from "./studio-export";
import { pickColorFromImageData } from "./studio-eyedropper";
import {
  clampFrameIndex,
  DEFAULT_FRAME_FPS,
  DEFAULT_ONION_SKIN,
  frameIndexOf,
  insertFrame,
  MAX_ANIM_FRAMES,
  onionSkinLayers,
  type OnionSkinLayer,
  type OnionSkinSettings,
  type StudioAnimFrame,
} from "./studio-frame-animation";
import {
  estimateTextGradientBBox,
  konvaGradientProps,
  legacyTextGradientToSpec,
  type StudioGradientSpec,
} from "./studio-gradient-engine";
import { GRADIENT_PRESETS, gradientToBgGrad } from "./studio-gradients";
import {
  bakeHealCloneStrokeToCanvas,
  computeHealCloneSourceOffset,
  healCloneSourcePoint,
  planHealCloneDabs,
  HEAL_CLONE_HARDNESS_DEFAULT,
  HEAL_CLONE_OPACITY_DEFAULT,
  HEAL_CLONE_RADIUS_DEFAULT,
  type HealCloneMode,
} from "./studio-heal-clone";
import { createCanvasImageElement } from "./studio-image-placement";
import {
  clampIsometricAngleDeg,
  clampIsometricCellSize,
  defaultIsometricOrigin,
  DEFAULT_ISOMETRIC_ANGLE_DEG,
  DEFAULT_ISOMETRIC_CELL_SIZE,
  resolveIsometricAxisRay,
  snapStrokePointToIsometricGrid,
  type IsometricAxisRay,
} from "./studio-isometric-grid";
import {
  hasActiveImageFilters,
  imageFilterCacheKey,
  type ImageFilterFields,
} from "./studio-konva-filter-fields";
import {
  bakeLayerMaskStroke,
  canLayerMask,
  createLayerMaskCanvas,
  hasLayerMask,
  invertLayerMaskAlpha,
  shouldApplyLayerMask,
  LAYER_MASK_BRUSH_HARDNESS_DEFAULT,
  LAYER_MASK_BRUSH_RADIUS_DEFAULT,
  LAYER_MASK_BRUSH_STRENGTH_DEFAULT,
  type LayerMaskPaintMode,
} from "./studio-layer-mask";
import {
  createLayerGroup,
  groupOfItem,
  isEffectivelyHidden,
  isEffectivelyLocked,
  setItemGroup,
  ungroupItems,
  buildLayerTree,
  type LayerGroup,
} from "./studio-layers";
import {
  computeMagicResize,
  presetCanvasSize,
  MAGIC_RESIZE_DEFAULT_STRATEGY,
  type MagicResizePreset,
  type MagicResizeStrategy,
} from "./studio-magic-resize";
import {
  applyMagicWandRegionToSelection,
  flipNormalizedPoint,
  MAGIC_WAND_TOLERANCE_DEFAULT,
  magicWandScanFromImage,
} from "./studio-magic-wand";
import {
  MASTER_EDIT_GHOST_OPACITY,
  composeMasterRenderElements,
  composeThumbPage,
  createEmptyDocumentMaster,
  normalizeDocumentMaster,
  serializeDocumentMaster,
  togglePageHideMaster,
  withMasterElements,
  type DocumentMaster,
} from "./studio-master-page";
import {
  beginNodeDrag,
  decimateStrokeHandles,
  hitTestNodeHandle,
  isNodeEditableKind,
  isPressureWidthBrush,
  NODE_EDIT_DEFAULT_MAX_HANDLES,
  NODE_EDIT_DEFAULT_MIN_SPACING_PX,
  NODE_EDIT_WIDTH_DRAG_RANGE_PX,
  pressureAt,
  updateNodeDragMove,
  updateNodeDragWidth,
  withPointMoved,
  withPressureEdited,
  type NodeDragSession,
  type NodeEditHandle,
  type NodeEditTool,
} from "./studio-node-edit";
import { resizableNodeProps, textNodeProps } from "./studio-node-props";
import {
  isDefaultPageGrade,
  normalizePageGrade,
  pageGradeToCssFilter,
  vignetteCss,
  drawVignette,
  type PageGrade,
} from "./studio-page-grade";
import {
  PAGE_NAME_MAX,
  PAGE_NOTE_MAX,
  autoPageName,
  buildClipboardPayload,
  collectCopyElements,
  pageDisplayName,
  parseClipboardPayload,
  planClipboardPaste,
  readClipboardFallback,
  serializeClipboardPayload,
  withPageMeta,
  writeClipboardFallback,
} from "./studio-page-meta";
import {
  appendPageState,
  applyBackgroundToAllPages,
  applyGradeToAllPages,
  clearPage,
  duplicateMirroredPage,
  duplicatePageState,
  executeDeletePageTransition,
  insertBlankPageAt,
  movePage as movePagePure,
  reorderPages,
} from "./studio-pages";
import { shotTagBadgeText, shotTagBadgeTitle, withShotTag } from "./studio-panel-shot-tags";
import {
  beginPanelSplitDrag,
  planPanelSplit,
  previewPanelSplit,
  type PanelSplitLine,
  type PanelSplitPreview,
} from "./studio-panel-split";
import {
  konvaPatternProps,
  loadPatternTileImage,
  patternDataUrl,
  type StudioPatternSpec,
} from "./studio-pattern-fill";
import {
  addVanishingPoint,
  defaultVanishingPointPosition,
  moveVanishingPoint,
  removeVanishingPoint,
  resolvePerspectiveRay,
  snapStrokePointToPerspective,
  type PerspectiveRay,
  type VanishingPoint,
} from "./studio-perspective-guide";
import { exportPagePsd, type PsdExportEl, type PsdExportResult } from "./studio-psd-export";
import {
  anchorQuickShapePoints,
  classifyQuickShape,
  regularizeQuickShapePoints,
  QUICKSHAPE_LOCK_HOLD_MS,
  QUICKSHAPE_STILL_RADIUS_PX,
  type QuickShapeKind,
} from "./studio-quickshape";
import {
  computeAlignDeltas,
  computeDistributeDeltas,
  normalizeMarqueeRect,
  selectIdsByMarquee,
  unionBounds,
} from "./studio-selection";
import {
  appendBrushPoint,
  applySelectionAdjustToCanvas,
  beginSelectionDrag,
  brushStrokePreview,
  buildSelectionMaskPlan,
  canvasPointToNormalized,
  commitSelectionDrag,
  emptyPixelSelection,
  isSelectionAdjustNoop,
  isSelectionUsable,
  marchingAntsPasses,
  normalizedPointToCanvas,
  planSelectionAdjust,
  rasterizeSelectionMask,
  removeLastSubpath,
  SELECTION_BRUSH_RADIUS_DEFAULT,
  setSelectionFeather,
  subpathOutlinePoints,
  toggleSelectionInvert,
  updateSelectionDrag,
  type PixelSelection,
  type SelectionAdjustPlan,
  type SelectionCombineMode,
  type SelectionDragState,
  type SelectionFrame,
  type SelectionToolKind,
  type SelPoint,
} from "./studio-selection-tools";
import { normalizeSkewPatch, toKonvaSkewAttrs } from "./studio-skew";
import {
  EMPTY_SMART_GUIDE_OVERLAY,
  SMART_GUIDE_EPSILON,
  SMART_SNAP_THRESHOLD,
  buildSmartGuideOverlay,
  computeSmartSnap,
  smartGuideOverlaysEqual,
  type GuideBox,
  type SmartGuideOverlay,
} from "./studio-smart-guides";
import { SMUDGE_RADIUS_DEFAULT, SMUDGE_STRENGTH_DEFAULT, smudgeStrokeImage } from "./studio-smudge";
import {
  DEFAULT_SHAPE_PARAMS,
  effectiveCornerRadius,
  lineArrowHeadGeoms,
  normalizeShapeParams,
  normalizeStrokeStyle,
  strokeDashArray,
  type ShapeParams,
  type StrokeStyle,
} from "./studio-stroke-shapes";
import { exportPageToSvg, type SvgExportEl, type SvgExportResult } from "./studio-svg-export";
import { buildTextPathData, normalizeTextPath, isFlatTextPath, type TextPathConfig } from "./studio-text-path";
import {
  DEFAULT_WATERMARK,
  normalizeWatermark,
  shouldDrawWatermark,
  watermarkPlacement,
  type WatermarkSettings,
} from "./studio-watermark";
import { StudioBgRemoveButton } from "./StudioBgRemoveButton";
import {
  colorBlindFilterStyle,
  StudioColorBlindFilterDefs,
  StudioColorBlindPreviewToggle,
  type CvdMode,
} from "./StudioColorBlindPreview";
import { StudioColorPalettePanel } from "./StudioColorPalettePanel";
import { StudioFloodFillPanel } from "./StudioFloodFillPanel";
import { StudioHealCloneOverlay } from "./StudioHealCloneOverlay";
import { StudioIsometricGridOverlay } from "./StudioIsometricGridOverlay";
import { StudioLayerMaskOverlay } from "./StudioLayerMaskOverlay";
import { StudioLineCleanupPanel } from "./StudioLineCleanupPanel";
import { StudioMagicResizePanel } from "./StudioMagicResizePanel";
import { StudioMagicWandPanel } from "./StudioMagicWandPanel";
import { StudioNodeEditPanel } from "./StudioNodeEditPanel";
import { StudioPageThumbnail, useStudioPageDnd } from "./StudioPageThumbnails";
import { StudioPaletteLibraryPanel } from "./StudioPaletteLibraryPanel";
import { StudioPanelSplitOverlay, StudioPanelSplitPanel } from "./StudioPanelSplitTool";
import { StudioPerspectiveOverlay } from "./StudioPerspectiveOverlay";
import { StudioPublishContextBanner, type PublishContext } from "./StudioPublishContextBanner";
import { StudioSkewPanel } from "./StudioSkewPanel";
import { StudioUploadPublish } from "./StudioUploadPublish";

import type { StudioAsset } from "./studio-asset-library";
import type { AutoAdjust } from "./studio-auto-adjust";
import type { BlurFx } from "./studio-blur";
import type { ChannelMixer } from "./studio-channel-mixer";
import type { Clarity } from "./studio-clarity";
import type { StudioClip } from "./studio-clips";
import type { ColorBalance } from "./studio-color-balance";
import type { ColorToAlpha } from "./studio-color-to-alpha";
import type { CurvePoint } from "./studio-curves";
import type { Detail } from "./studio-detail";
import type { Distort } from "./studio-distort";
import type { Glow } from "./studio-glow";
import type { GradientMap } from "./studio-gradient-map";
import type { Grain } from "./studio-grain";
import type { Halftone } from "./studio-halftone";
import type { Light } from "./studio-light";
import type { MotionCutImage } from "./studio-motion-export";
import type { Outline } from "./studio-outline";
import type { PanelLayoutPreset } from "./studio-panel-layouts";
import type { PhotoFilter } from "./studio-photo-filter";
import type { SceneTemplate } from "./studio-scene-templates";
import type { SelectiveHsl } from "./studio-selective-hsl";
import type { SfxPreset } from "./studio-sfx-presets";
import type { Sketch } from "./studio-sketch";
import type { Stylize } from "./studio-stylize";
import type { Vibrance } from "./studio-vibrance";
import type {
  StudioAssetMenuPanelProps,
  StudioAssetSortOrder,
  StudioAssetTab,
} from "./StudioAssetMenuPanel";
import type { StudioColorPopoverProps } from "./StudioColorPopover";
import type { StudioExportMenuPanelProps } from "./StudioExportMenuPanel";
import type {
  GeneratedAssetQuality,
  GeneratedAssetSize,
  SharedAsset,
  WorkDetail,
} from "@/src/infrastructure/creator-client";
import type Konva from "konva";

import { scheduleIdle } from "@/components/auth/schedule-idle";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { useIsMobile } from "@/components/use-media-query";
import { useResizable } from "@/components/use-resizable";
import { lazyRetry } from "@/lib/lazy-retry";
import { cn } from "@/lib/utils";
import { resolveAssetUrl } from "@/src/catalog-static";
import { useSession } from "@/src/compat/auth-session-store";

const KonvaRuntime = KonvaCore as unknown as typeof Konva;
KonvaRuntime.Filters = KonvaRuntime.Filters ?? {};

// lazyRetry: 이 세션 안에 배포가 잦으면 이미 열린 스튜디오 탭의 lazy import가 옛 청크 해시로
// 404 나기 쉽다(예: "3D 배경 삽입 시 오류") — 1회 자동 새로고침으로 복구한다(lib/lazy-retry.ts).
const StudioImageAdjustmentsPanel = lazyRetry(
  () => import("./StudioImageAdjustmentsPanel").then((mod) => ({ default: mod.StudioImageAdjustmentsPanel })),
  "StudioImageAdjustmentsPanel"
);
const StudioPageGradePanel = lazyRetry(
  () => import("./StudioPageGradePanel").then((mod) => ({ default: mod.StudioPageGradePanel })),
  "StudioPageGradePanel"
);
const StudioBubbleStylePresetPanel = lazyRetry(
  () => import("./StudioBubbleStylePresetPanel").then((mod) => ({ default: mod.StudioBubbleStylePresetPanel })),
  "StudioBubbleStylePresetPanel"
);
const StudioDialogueBatchPanel = lazyRetry(
  () => import("./StudioDialogueBatchPanel").then((mod) => ({ default: mod.StudioDialogueBatchPanel })),
  "StudioDialogueBatchPanel"
);
const StudioHistoryPanel = lazyRetry(
  () => import("./StudioHistoryPanel").then((mod) => ({ default: mod.StudioHistoryPanel })),
  "StudioHistoryPanel"
);
const StudioFrameAnimationPanel = lazyRetry(
  () => import("./StudioFrameAnimationPanel").then((mod) => ({ default: mod.StudioFrameAnimationPanel })),
  "StudioFrameAnimationPanel"
);
const StudioAnimTimelinePanel = lazyRetry(
  () => import("./StudioAnimTimelinePanel").then((mod) => ({ default: mod.StudioAnimTimelinePanel })),
  "StudioAnimTimelinePanel"
);
const StudioMasterPagePanel = lazyRetry(
  () => import("./StudioMasterPagePanel").then((mod) => ({ default: mod.StudioMasterPagePanel })),
  "StudioMasterPagePanel"
);
const StudioStoryboardGridPanel = lazyRetry(
  () => import("./StudioStoryboardGridPanel").then((mod) => ({ default: mod.StudioStoryboardGridPanel })),
  "StudioStoryboardGridPanel"
);
const StudioShortcutsHelp = lazyRetry(
  () => import("./StudioShortcutsHelp").then((mod) => ({ default: mod.StudioShortcutsHelp })),
  "StudioShortcutsHelp"
);
const StudioStickerGrid = lazyRetry(
  () => import("./studio-sticker-grid").then((mod) => ({ default: mod.StudioStickerGrid })),
  "StudioStickerGrid"
);
const StudioTextEffectPanel = lazyRetry(
  () => import("./StudioTextEffectPanel").then((mod) => ({ default: mod.StudioTextEffectPanel })),
  "StudioTextEffectPanel"
);
const StudioGradientEnginePanel = lazyRetry(
  () => import("./StudioGradientEnginePanel").then((mod) => ({ default: mod.StudioGradientEnginePanel })),
  "StudioGradientEnginePanel"
);
const StudioPatternFillPanel = lazyRetry(
  () => import("./StudioPatternFillPanel").then((mod) => ({ default: mod.StudioPatternFillPanel })),
  "StudioPatternFillPanel"
);
const StudioTextPathPanel = lazyRetry(
  () => import("./StudioTextPathPanel").then((mod) => ({ default: mod.StudioTextPathPanel })),
  "StudioTextPathPanel"
);
const StudioTonePanel = lazyRetry(
  () => import("./StudioTonePanel").then((mod) => ({ default: mod.StudioTonePanel })),
  "StudioTonePanel"
);
const StudioStrokeShapePanel = lazyRetry(
  () => import("./StudioStrokeShapePanel").then((mod) => ({ default: mod.StudioStrokeShapePanel })),
  "StudioStrokeShapePanel"
);
const StudioSelectionToolsPanel = lazyRetry(
  () => import("./StudioSelectionToolsPanel").then((mod) => ({ default: mod.StudioSelectionToolsPanel })),
  "StudioSelectionToolsPanel"
);
const StudioCropPanel = lazyRetry(
  () => import("./StudioCropPanel").then((mod) => ({ default: mod.StudioCropPanel })),
  "StudioCropPanel"
);
const StudioPerspectivePanel = lazyRetry(
  () => import("./StudioPerspectivePanel").then((mod) => ({ default: mod.StudioPerspectivePanel })),
  "StudioPerspectivePanel"
);
const StudioIsometricGridPanel = lazyRetry(
  () => import("./StudioIsometricGridPanel").then((mod) => ({ default: mod.StudioIsometricGridPanel })),
  "StudioIsometricGridPanel"
);
const StudioVrmPoser = lazyRetry(
  () => import("./StudioVrmPoser").then((mod) => ({ default: mod.StudioVrmPoser })),
  "StudioVrmPoser"
);
const StudioBackground3D = lazyRetry(
  () => import("./StudioBackground3D").then((mod) => ({ default: mod.StudioBackground3D })),
  "StudioBackground3D"
);
const StudioVrmCreator = lazyRetry(
  () => import("./StudioVrmCreator").then((mod) => ({ default: mod.StudioVrmCreator })),
  "StudioVrmCreator"
);
const StudioTimelapsePanel = lazyRetry(
  () => import("./StudioTimelapsePanel").then((mod) => ({ default: mod.StudioTimelapsePanel })),
  "StudioTimelapsePanel"
);
const WorkFxPanel = lazyRetry(
  () => import("./WorkFxPanel").then((mod) => ({ default: mod.WorkFxPanel })),
  "WorkFxPanel"
);
const StudioBrandKitPanel = lazyRetry(
  () => import("./StudioBrandKitPanel").then((mod) => ({ default: mod.StudioBrandKitPanel })),
  "StudioBrandKitPanel"
);
const StudioBubbleAnchorPanel = lazyRetry(
  () => import("./StudioBubbleAnchorPanel").then((mod) => ({ default: mod.StudioBubbleAnchorPanel })),
  "StudioBubbleAnchorPanel"
);
const StudioSmudgePanel = lazyRetry(
  () => import("./StudioSmudgePanel").then((mod) => ({ default: mod.StudioSmudgePanel })),
  "StudioSmudgePanel"
);
const StudioHealClonePanel = lazyRetry(
  () => import("./StudioHealClonePanel").then((mod) => ({ default: mod.StudioHealClonePanel })),
  "StudioHealClonePanel"
);
const StudioLayerMaskPanel = lazyRetry(
  () => import("./StudioLayerMaskPanel").then((mod) => ({ default: mod.StudioLayerMaskPanel })),
  "StudioLayerMaskPanel"
);
const StudioQuickShapePanel = lazyRetry(
  () => import("./StudioQuickShapePanel").then((mod) => ({ default: mod.StudioQuickShapePanel })),
  "StudioQuickShapePanel"
);
const StudioBrushLibraryPanel = lazyRetry(
  () => import("./StudioBrushLibraryPanel").then((mod) => ({ default: mod.StudioBrushLibraryPanel })),
  "StudioBrushLibraryPanel"
);
function loadStudioReferencePanel() {
  return import("./StudioReferencePanel").then((mod) => ({ default: mod.StudioReferencePanel }));
}
const StudioReferencePanel = lazyRetry(loadStudioReferencePanel, "StudioReferencePanel");
function preloadStudioReferencePanel(): void {
  void loadStudioReferencePanel();
}
function loadStudioColorWheelOverlay() {
  return import("./StudioColorWheelOverlay").then((mod) => ({ default: mod.StudioColorWheelOverlay }));
}
const StudioColorWheelOverlay = lazyRetry(loadStudioColorWheelOverlay, "StudioColorWheelOverlay");

type StudioAssetMenuPanelModule = { default: ComponentType<StudioAssetMenuPanelProps> };
let studioAssetMenuPanelPromise: Promise<StudioAssetMenuPanelModule> | null = null;

function loadStudioAssetMenuPanel(): Promise<StudioAssetMenuPanelModule> {
  studioAssetMenuPanelPromise ??= import("./StudioAssetMenuPanel").then((mod) => ({
    default: mod.StudioAssetMenuPanel,
  }));
  return studioAssetMenuPanelPromise;
}

const StudioAssetMenuPanel = lazyRetry(loadStudioAssetMenuPanel, "StudioAssetMenuPanel");

function preloadStudioAssetMenuPanel(): void {
  void loadStudioAssetMenuPanel();
}

type StudioExportMenuPanelModule = { default: ComponentType<StudioExportMenuPanelProps> };
let studioExportMenuPanelPromise: Promise<StudioExportMenuPanelModule> | null = null;

function loadStudioExportMenuPanel(): Promise<StudioExportMenuPanelModule> {
  studioExportMenuPanelPromise ??= import("./StudioExportMenuPanel").then((mod) => ({
    default: mod.StudioExportMenuPanel,
  }));
  return studioExportMenuPanelPromise;
}

const StudioExportMenuPanel = lazyRetry(loadStudioExportMenuPanel, "StudioExportMenuPanel");

function preloadStudioExportMenuPanel(): void {
  void loadStudioExportMenuPanel();
}

type StudioWebtoonGuidesModule = typeof import("./studio-webtoon-guides");
let studioWebtoonGuidesPromise: Promise<StudioWebtoonGuidesModule> | null = null;

function loadStudioWebtoonGuides(): Promise<StudioWebtoonGuidesModule> {
  studioWebtoonGuidesPromise ??= import("./studio-webtoon-guides").catch((error) => {
    studioWebtoonGuidesPromise = null;
    throw error;
  });
  return studioWebtoonGuidesPromise;
}

type LazyStudioColorPopoverProps = Omit<StudioColorPopoverProps, "initialOpen"> & {
  onLoadRecentColors?: () => void;
};
type StudioColorPopoverModule = { default: ComponentType<StudioColorPopoverProps> };

let studioColorPopoverPromise: Promise<StudioColorPopoverModule> | null = null;

function loadStudioColorPopover(): Promise<StudioColorPopoverModule> {
  studioColorPopoverPromise ??= import("./StudioColorPopover").then((mod) => ({
    default: mod.StudioColorPopover,
  }));
  return studioColorPopoverPromise;
}

const StudioColorPopoverContent = lazyRetry(loadStudioColorPopover, "StudioColorPopover");

function preloadStudioColorPopover(): void {
  void loadStudioColorPopover();
}

function StudioColorPopoverFallback({
  value,
  title,
  className,
  onWarm,
  onActivate,
  busy = false,
}: Pick<LazyStudioColorPopoverProps, "value" | "title" | "className"> & {
  onWarm?: () => void;
  onActivate?: () => void;
  busy?: boolean;
}) {
  const warm = () => {
    preloadStudioColorPopover();
    onWarm?.();
  };

  return (
    <span className={className ? `relative inline-block ${className}` : "relative inline-block"}>
      <button
        type="button"
        aria-label={title ?? "색상 선택"}
        aria-expanded={false}
        aria-busy={busy || undefined}
        title={title ?? "색상 선택"}
        onClick={onActivate}
        onFocus={warm}
        onMouseEnter={warm}
        className="h-7 w-7 rounded border border-line cursor-pointer"
        style={{ background: value }}
      />
    </span>
  );
}

function LazyStudioColorPopover({ onLoadRecentColors, ...props }: LazyStudioColorPopoverProps) {
  const [activated, setActivated] = useState(false);
  const activate = () => {
    onLoadRecentColors?.();
    setActivated(true);
  };

  if (!activated) {
    return <StudioColorPopoverFallback {...props} onWarm={onLoadRecentColors} onActivate={activate} />;
  }

  return (
    <Suspense fallback={<StudioColorPopoverFallback {...props} busy />}>
      <StudioColorPopoverContent {...props} initialOpen />
    </Suspense>
  );
}

function StudioPanelLoading({ label = "패널을 여는 중..." }: { label?: string }) {
  return (
    <div className="rounded-lg border border-line bg-card/70 px-3 py-2 text-xs text-fg-3">
      {label}
    </div>
  );
}

// 캔버스와 도구 패널 사이의 드래그 스플리터(데스크톱). 너비를 끌어서 조절, 더블클릭=기본값, ←/→=미세조절.
function PanelResizeHandle({
  handleProps,
  dragging,
  label,
}: {
  handleProps: Record<string, unknown>;
  dragging: boolean;
  label: string;
}) {
  return (
    <div
      {...handleProps}
      aria-label={label}
      title={`${label} — 드래그·더블클릭(기본)·←/→`}
      className={cn(
        "group relative hidden w-2 shrink-0 cursor-col-resize select-none items-center justify-center self-stretch rounded-full transition-colors lg:flex",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        dragging ? "bg-accent/25" : "hover:bg-accent/15"
      )}
    >
      <span
        className={cn(
          "h-10 w-1 rounded-full transition-colors",
          dragging ? "bg-accent" : "bg-line group-hover:bg-accent/60"
        )}
      />
    </div>
  );
}

type Tool = "select" | "draw";
type DrawMode = "pen" | "eraser" | "shape";
type DrawShapeKind = "line" | "rect" | "ellipse" | "star" | "arrow" | "triangle" | "polygon";
const QUICKSHAPE_KIND_LABELS: Record<string, string> = {
  line: "선",
  rect: "사각형",
  ellipse: "타원",
  triangle: "삼각형",
  polygon: "다각형",
};

export interface ImageEl {
  id: string;
  type: "image";
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity?: number; // 불투명도(흐린 배경 캐릭터·페이드 등). 미설정=1.
  flipped?: boolean; // 좌우 반전(캐릭터 미러링).
  flippedY?: boolean; // 상하 반전
  blur?: number;
  brightness?: number;
  contrast?: number;
  grayscale?: boolean;
  sepia?: boolean;
  screentone?: boolean;
  lineart?: boolean;
  chromatic?: number;
  posterize?: number;
  noise?: number;
  // 포토샵급 보정 — Konva HSL/내장 필터 + studio-filters 커스텀 픽셀 필터로 적용.
  saturation?: number; // 채도(-1..1, Konva HSL)
  hue?: number; // 색조 회전(-180..180°)
  temperature?: number; // 색온도(-100..100, 따뜻/차갑게)
  sharpen?: number; // 선명도(0..1, 언샤프 마스크)
  pixelate?: number; // 픽셀화(0..40)
  invert?: boolean; // 색 반전
  inkThreshold?: number; // 먹선 임계(0..1, 순흑/순백)
  duotoneShadow?: string; // 듀오톤 어두운 색
  duotoneHighlight?: string; // 듀오톤 밝은 색
  // 레벨 보정(Levels) — 입력/출력 검정·흰점 + 감마.
  levelsBlack?: number;
  levelsWhite?: number;
  levelsGamma?: number;
  levelsOutBlack?: number;
  levelsOutWhite?: number;
  // 레이어 스타일(그림자/글로우/둥근 모서리) — Konva.Image 네이티브 속성.
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  cornerRadius?: number;
  // 톤 커브(Curves) + 컬러 밸런스(Color Balance) + 채널 믹서(Channel Mixer) + 선택 색상(HSL) + 생동감(Vibrance).
  curve?: CurvePoint[];
  colorBalance?: ColorBalance;
  channelMixer?: ChannelMixer;
  selectiveHsl?: SelectiveHsl;
  vibrance?: Vibrance;
  gradientMap?: GradientMap;
  photoFilter?: PhotoFilter;
  colorToAlpha?: ColorToAlpha; // 색상 투명화 — 키 색상을 알파로 punching(studio-color-to-alpha)
  autoAdjust?: AutoAdjust;
  clarity?: Clarity;
  outline?: Outline;
  glow?: Glow;
  halftone?: Halftone;
  grain?: Grain;
  blurFx?: BlurFx;
  distort?: Distort;
  stylize?: Stylize;
  light?: Light;
  sketch?: Sketch;
  detail?: Detail;
  // 기울이기(Skew) — 도 단위(-60..60). 0(항등)은 저장하지 않는다(studio-skew 직렬화 규약).
  skewX?: number;
  skewY?: number;
  // 프레임별 셀 애니메이션 — 있으면 이 이미지는 "애니메이션 셀"이다.
  // src는 항상 frames 중 현재 표시 프레임의 src와 동일하게 유지한다.
  frames?: StudioAnimFrame[];
  frameFps?: number; // 재생 속도(기본 12) — durationMs 미설정 프레임에 적용.
  frameLoop?: boolean; // 반복 재생(기본 true).
  activeFrameId?: string; // 현재 편집/표시 중인 프레임(패널이 열려 있을 때의 탐색 위치).
}
interface TextEl {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fill: string;
  rotation: number;
  font?: string; // 글꼴(웹툰 대사용)
  stroke?: string; // 효과음(SFX) 외곽선
  strokeWidth?: number;
  letterSpacing?: number; // 자간(px)
  lineHeight?: number; // 행간(배수)
  vertical?: boolean;
  align?: "left" | "center" | "right";
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  fillType?: "solid" | "gradient";
  gradientColorStart?: string;
  gradientColorEnd?: string;
  gradientDirection?: "vertical" | "horizontal";
  gradient?: StudioGradientSpec; // 멀티스톱 그라데이션(엔진) — 있으면 위 2색 레거시 필드보다 우선.
  textPath?: TextPathConfig; // 곡선 텍스트(아치/물결/원) — 미설정/none이면 직선.
  skewX?: number; // 가로 기울임(도, -60..60) — studio-skew 직렬화 규약. 미설정=0.
  skewY?: number; // 세로 기울임(도) — studio-skew 직렬화 규약. 미설정=0.
}
interface BubbleEl {
  id: string;
  type: "bubble";
  variant: BubbleVariant; // speech | thought | shout | box
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  textFill: string;
  rotation: number;
  tail?: "left" | "right" | "none"; // 말풍선 꼬리 방향(화자 쪽). shout/box는 무시.
  tailDirection?: "bottom" | "top" | "left" | "right"; // 말풍선 꼬리 방향(상하좌우).
  extraTails?: BubbleTailSpec[]; // 추가 꼬리(두 화자 동시 대사) — 주 꼬리 외 최대 2개. studio-bubble-path 정규화 규약.
  font?: string; // 말풍선 글꼴(미설정 시 기본 고딕)
  fontSize?: number; // 말풍선 글자 크기(미설정 시 24)
  lineHeight?: number; // 행간(배수, 미설정 시 1.1)
  vertical?: boolean;
  align?: "left" | "center" | "right";
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  tailXRatio?: number;
  tailHeight?: number;
  /** 꼬리 자동 부착 대상 요소 id. 설정되면 매 커밋마다 대상의 중심점을 향해 tailDirection/
   *  tailXRatio/tailHeight 가 자동 재계산된다(studio-bubble-anchor.ts). 대상이 삭제되면
   *  자동으로 지워진다(마지막 tail 값은 그대로 남아 수동 모드로 복귀). tailAnchorPoint 와
   *  상호배타 — 패널이 하나를 설정할 때 다른 하나를 undefined 로 같이 patch 한다. */
  tailAnchorId?: string;
  /** 꼬리 자동 부착 대상 고정 좌표(페이지/캔버스 좌표, el.x/y 와 동일 원점). tailAnchorId 가
   *  없을 때만 의미가 있다 — 말풍선이 움직이면 이 좌표를 향한 각도가 재계산된다(좌표 자체는
   *  고정, 저절로 움직이지 않는다). */
  tailAnchorPoint?: { x: number; y: number };
  stroke?: string;
  strokeWidth?: number;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
}
interface FrameEl {
  id: string;
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
  bg?: string;
  bgColor?: string;
  stroke?: string;
  strokeWidth?: number;
  dashStyle?: "solid" | "dashed";
  // 사선/비정형 패널 — 프레임 로컬좌표(x,y 기준) 쿼드 폴리곤 [x0,y0,x1,y1,x2,y2,x3,y3].
  // 있으면 사각형 대신 이 폴리곤으로 클립·채움·테두리를 그린다.
  points?: number[];
}
interface StickerEl {
  id: string;
  type: "sticker";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
  skewX?: number; // 가로 기울임(도, -60..60) — studio-skew 직렬화 규약. 미설정=0.
  skewY?: number; // 세로 기울임(도) — studio-skew 직렬화 규약. 미설정=0.
}
interface DrawEl {
  id: string;
  type: "draw";
  kind?: "freehand" | DrawShapeKind;
  mode?: "pen" | "eraser";
  points: number[];
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  fill?: string;
  gradient?: StudioGradientSpec; // 도형 채우기 그라데이션(멀티스톱) — 미설정이면 fill 단색.
  // 도형 채우기 패턴 — 우선순위: 패턴 > 그라데이션 > fill 단색. 타일 로드 전엔 아래 채우기가 폴백.
  pattern?: StudioPatternSpec;
  brush?: string;
  pressures?: number[];
  // 스트로크 스타일(점선/선 끝/화살촉) — 도형·선 전용. 미설정 시 기본(실선·둥근 끝).
  strokeStyle?: StrokeStyle;
  // 도형 파라미터(별 꼭짓점/다각형 변/모서리 반경) — 미설정 시 기존 하드코딩과 동일한 기본값.
  shapeParams?: ShapeParams;
  symmetry?: {
    type: "none" | "vertical" | "horizontal" | "radial";
    centerX: number;
    centerY: number;
    radialCount?: number;
  };
}
interface FocusLinesEl {
  id: string;
  type: "focusLines";
  x: number;
  y: number;
  width: number;
  height: number;
  lineCount: number;
  innerRadius: number;
  outerRadius: number;
  stroke: string;
  strokeWidth: number;
  noise: number;
  rotation: number;
  opacity?: number;
  centerXRatio?: number;
  centerYRatio?: number;
}
interface SpeedLinesEl {
  id: string;
  type: "speedLines";
  x: number;
  y: number;
  width: number;
  height: number;
  lineCount: number;
  direction: "horizontal" | "vertical";
  stroke: string;
  strokeWidth: number;
  noise?: number;
  rotation: number;
  opacity?: number;
}
// 인터섹션으로 모든 요소 변형에 레이어 메타(표시/숨김·잠금)를 부여.
export type El = (ImageEl | TextEl | BubbleEl | StickerEl | DrawEl | FrameEl | FocusLinesEl | SpeedLinesEl) & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean; alphaLocked?: boolean; maskSrc?: string; maskEnabled?: boolean };
type StudioMenu = "template" | "bubble" | "sticker" | "char" | "bgScene" | "asset" | "emeres" | "tone" | "scene" | "clip" | "palette" | "brandKit";
type StudioBgScene = { id: string; label: string; genre: string; svg?: string; imgSrc?: string };
type StudioFxAsset = { id: string; label: string; svg: string; width: number; height: number };
// 이메레스(스케치 밑그림 틀) — studio-emeres-templates 모듈과 구조 호환되는 로컬 타입.
type StudioEmeresTemplate = { id: string; label: string; category: string; svg: string; width: number; height: number; tip: string };
type StudioOptionalAssetPacks = {
  bgSceneSections: Array<{ genre: string; scenes: StudioBgScene[] }>;
  // 장르 필터 전용 — bgSceneSections는 imgSrc(고품질 일러스트) 씬을 전부 "추천"으로 묶어내서
  // 특정 장르로 필터링하면 그 장르의 일러스트가 안 보이는 문제가 있었다(전체 보기에서만 노출).
  // 이 목록은 장르별로 실제 genre 기준 그룹핑해(일러스트 포함, groupBgScenes가 각 그룹 내 imgSrc 우선 정렬)
  // 장르 칩을 눌러도 해당 장르의 AI/일러스트 배경이 정상적으로 보이게 한다.
  bgSceneGenreGroups: Array<{ genre: string; scenes: StudioBgScene[] }>;
  comicVectorStickers: StudioFxAsset[];
  creatureStickers: StudioFxAsset[];
  propStickers: StudioFxAsset[];
  fxOverlays: StudioFxAsset[];
  emeresSections: Array<{ category: string; templates: StudioEmeresTemplate[] }>;
  emeresUnderlayOpacity: number;
};
type StudioSceneTemplatePacks = {
  categories: Array<{ id: string; label: string }>;
  templates: SceneTemplate[];
};
type StudioSfxPacks = {
  categories: Array<{ id: SfxPreset["category"]; label: string }>;
  presets: SfxPreset[];
};

const uid = () => crypto.randomUUID();
const EMPTY_STUDIO_OPTIONAL_ASSETS: StudioOptionalAssetPacks = {
  bgSceneSections: [],
  bgSceneGenreGroups: [],
  comicVectorStickers: [],
  creatureStickers: [],
  propStickers: [],
  fxOverlays: [],
  emeresSections: [],
  emeresUnderlayOpacity: 0.42,
};
const EMPTY_STUDIO_SCENE_TEMPLATE_PACKS: StudioSceneTemplatePacks = {
  categories: [],
  templates: [],
};
const EMPTY_STUDIO_SFX_PACKS: StudioSfxPacks = {
  categories: [],
  presets: [],
};

// 효과 피커 카테고리 칩 — 클릭 시 해당 섹션만 보여줘 7개 섹션 스크롤 없이 점프한다.
type FxPickerSection = "all" | "sfx" | "emoji" | "comic" | "creature" | "prop" | "lines" | "overlay";
const FX_PICKER_SECTIONS: { id: FxPickerSection; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "sfx", label: "효과음" },
  { id: "emoji", label: "이모지" },
  { id: "comic", label: "만화 스티커" },
  { id: "creature", label: "동물·캐릭터" },
  { id: "prop", label: "소품·오브젝트" },
  { id: "lines", label: "선 효과" },
  { id: "overlay", label: "특수 효과" },
];

// 만화 선 효과(집중선·속도선) — 효과 피커 검색이 라벨로 거를 수 있게 데이터로 둔다.
const FX_LINE_PRESETS: { id: "focus" | "speed"; label: string }[] = [
  { id: "focus", label: "🔆 집중선 생성" },
  { id: "speed", label: "💨 속도선 생성" },
];
const EMPTY_EFFECT_EMOJIS: string[] = [];
const EMPTY_FX_LINE_PRESETS: typeof FX_LINE_PRESETS = [];

const TEMPLATE_GROUPS = groupTemplates(TEMPLATES);
const BUBBLE_VARIANT_BY_ID = new Map(BUBBLE_VARIANTS.map((variant) => [variant.id, variant] as const));

function filterSfxPresets(presets: SfxPreset[], query: string): SfxPreset[] {
  const normalizedQuery = query.replace(/\s+/g, "").toLowerCase();
  if (!normalizedQuery) return presets;
  return presets.filter((preset) => {
    const label = preset.label.replace(/\s+/g, "").toLowerCase();
    const text = preset.text.replace(/\s+/g, "").toLowerCase();
    return label.includes(normalizedQuery) || text.includes(normalizedQuery);
  });
}

// 스튜디오 전용 구글폰트 7종(글꼴 패널·말풍선 프리셋용) — 전 페이지 렌더 차단 경로(index.html)에는
// 전역 폰트(Space Grotesk·Nanum Myeongjo)만 남기고, 이 7종은 스튜디오 마운트 시에만 주입한다.
const STUDIO_FONTS_LINK_ID = "studio-google-fonts";
const STUDIO_FONTS_CSS2_URL =
  "https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=East+Sea+Dokdo&family=Gaegu:wght@400;700&family=Gamja+Flower&family=Jua&family=Nanum+Pen+Script&family=Yeon+Sung&display=swap";

// 요소의 대략적 바운딩 박스(중심·크기 판정용).
function elBounds(el: El): { x: number; y: number; w: number; h: number } {
  if (el.type === "draw") {
    const x0 = el.points[0] ?? 0;
    const y0 = el.points[1] ?? 0;
    let minX = x0;
    let minY = y0;
    let maxX = x0;
    let maxY = y0;
    for (let i = 2; i < el.points.length; i += 2) {
      const x = el.points[i] ?? maxX;
      const y = el.points[i + 1] ?? maxY;
      if (x < minX) minX = x;
      else if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      else if (y > maxY) maxY = y;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }
  if (el.type === "text") return { x: el.x, y: el.y, w: el.width, h: el.fontSize * 1.4 };
  if (el.type === "sticker") return { x: el.x, y: el.y, w: el.fontSize, h: el.fontSize };
  return { x: el.x, y: el.y, w: el.width, h: el.height }; // image · bubble · frame
}

// 부착된 말풍선(tailAnchorId/tailAnchorPoint)의 꼬리 방향/비율/길이를 매 커밋마다 다시
// 계산한다. commit()/commitCoalesced() 가 pagesHistory 에 넣기 직전(+ masterEditMode 분기
// 이전)의 nextElements 에 적용한다 — patchEl 뿐 아니라 정렬/분배/넛지/복제/클립삽입처럼
// commit()/commitCoalesced() 를 직접 호출하는 모든 경로를 한 곳에서 커버한다(따로따로
// 훅을 심을 필요 없음).
//
// "대상 삭제됨"과 "말풍선 bounds 일시적 비정상(리사이즈 중 등)"을 구분해야 하므로
// resolveAnchorTargetPoint 와 computeBubbleAnchorTail 을 따로 호출한다(전자가 null이면
// tailAnchorId 를 지우고 마지막 tail 값은 보존, 후자가 null이면 이번 커밋은 건드리지
// 않고 다음 커밋에 재시도).
function applyBubbleAnchors(nextElements: El[]): El[] {
  const boundsById = new Map<string, AnchorTargetBounds>();
  for (const e of nextElements) boundsById.set(e.id, elBounds(e));

  let changed = false;
  const out = nextElements.map((e) => {
    if (e.type !== "bubble" || (!e.tailAnchorId && !e.tailAnchorPoint)) return e;

    const point = resolveAnchorTargetPoint(e, (id) => (id === e.id ? null : (boundsById.get(id) ?? null)));
    if (!point) {
      // tailAnchorId 가 가리키는 대상이 사라짐(또는 자기 자신을 가리키는 방어 케이스) — 해제.
      if (!e.tailAnchorId) return e; // tailAnchorPoint 만 있으면 point 는 항상 성공하므로 여기 안 옴.
      changed = true;
      return { ...e, tailAnchorId: undefined } as El;
    }
    const patch = computeBubbleAnchorTail(e, point);
    if (!patch) return e; // 말풍선 bounds 일시 비정상 — 건드리지 않고 다음 커밋 재시도.
    changed = true;
    return { ...e, ...patch } as El;
  });
  return changed ? out : nextElements;
}

function studioElementIdOf(node: Konva.Node | null): string | null {
  let current: Konva.Node | null = node;
  while (current) {
    const id = current.getAttr("studioElementId");
    if (typeof id === "string" && id) return id;
    current = current.getParent();
  }
  return null;
}

// 요소가 "들어가야 할" 패널(중심이 패널 안 + 패널보다 크게 넘치지 않음). 없으면 null.
// 전체 배경처럼 패널보다 훨씬 큰 요소는 제외해 백드롭이 한 칸에 갇히지 않게 한다.
function containingPanel(el: El, all: El[]): FrameEl | null {
  if (el.type === "frame") return null;
  const b = elBounds(el);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  let best: FrameEl | null = null;
  let bestArea = Infinity;
  for (const f of all) {
    if (f.type !== "frame" || f.hidden) continue;
    if (cx < f.x || cx > f.x + f.width || cy < f.y || cy > f.y + f.height) continue;
    if (b.w > f.width * 1.4 || b.h > f.height * 1.4) continue;
    const area = f.width * f.height;
    if (area < bestArea) {
      bestArea = area;
      best = f;
    }
  }
  return best;
}

// 레이어 목록용 라벨(아이콘 + 이름).
function elementLabel(el: El): string {
  if (el.name) return el.name;
  switch (el.type) {
    case "text":
      return `T ${el.text.slice(0, 14).trim() || "텍스트"}`;
    case "bubble": {
      const v = BUBBLE_VARIANT_BY_ID.get(el.variant);
      return `${v?.sample ?? "💬"} ${v?.label ?? "말풍선"}`;
    }
    case "sticker":
      return `${el.text} 스티커`;
    case "draw":
      return "✏️ 그림";
    case "frame":
      return "▢ 패널";
    case "image":
      return "🖼️ 이미지";
    case "focusLines":
      return "🔆 집중선";
    case "speedLines":
      return "💨 속도선";
    default:
      return "요소";
  }
}
const DRAW_COLOR_SWATCHES = ["#16100c", "#71717a", "#f8f2df", "#ff3b30", "#ff9500", "#ffcc00", "#4caf50", "#2196f3", "#9c27b0", "#ff6fb1", "#8a5a44", "#ffffff"];
const QUICK_START_DISMISSED_KEY = "toonspectrum-studio-quick-start-dismissed";
// 모바일 첫 사용 안내(하단 도구막대 + 두 손가락 이동/확대) 1회만 노출.
const MOBILE_HINT_DISMISSED_KEY = "toonspectrum-studio-mobile-hint-dismissed";
const WATERMARK_KEY = "toonspectrum-studio-watermark";
// 생성형 AI(이미지 생성) 최초 사용 고지 — 정책상 사용자가 처음 쓸 때 "생성형 AI를 활용한다"는
// 사실을 인지하도록 알려야 한다(앱인토스 서비스 오픈 정책). 1회 확인하면 localStorage 에 저장.
const AI_ASSET_NOTICE_ACK_KEY = "toonspectrum-studio-ai-notice-ack";

function readAiNoticeAck() {
  if (typeof window === "undefined") return false;
  try {
    return globalThis.localStorage.getItem(AI_ASSET_NOTICE_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

function storeAiNoticeAck() {
  if (typeof window === "undefined") return;
  try {
    globalThis.localStorage.setItem(AI_ASSET_NOTICE_ACK_KEY, "1");
  } catch {
    // localStorage 사용 불가(시크릿/임베드) 시에도 동작은 유지(고지는 패널 안내문이 담당).
  }
}

// 내보내기 캔버스에 워터마크/서명을 합성한다(출력 픽셀에 직접 그림). 켜짐+텍스트가 있을 때만.
function drawWatermarkOnCanvas(canvas: HTMLCanvasElement, s: WatermarkSettings) {
  if (!shouldDrawWatermark(s)) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const pl = watermarkPlacement(canvas.width, canvas.height, s);
  const text = s.text.trim();
  ctx.save();
  ctx.globalAlpha = Math.min(1, Math.max(0, s.opacity));
  ctx.font = `700 ${pl.fontPx}px "Pretendard", system-ui, sans-serif`;
  ctx.textAlign = pl.textAlign;
  ctx.textBaseline = pl.textBaseline;
  // 밝은 배경·어두운 배경 어디서나 보이도록 어두운 외곽선 + 흰 채움.
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1.5, pl.fontPx * 0.09);
  ctx.strokeStyle = "rgba(0,0,0,0.72)";
  ctx.strokeText(text, pl.x, pl.y);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, pl.x, pl.y);
  ctx.restore();
}
const QUICK_SAMPLE_CANVAS_H = 1120;
const QUICK_SAMPLE_MARGIN = 24;

function readQuickStartDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return globalThis.localStorage.getItem(QUICK_START_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function storeQuickStartDismissed() {
  if (typeof window === "undefined") return;
  try {
    globalThis.localStorage.setItem(QUICK_START_DISMISSED_KEY, "1");
  } catch {
    // localStorage may be unavailable in private or embedded browser contexts.
  }
}

function readMobileHintDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return globalThis.localStorage.getItem(MOBILE_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function storeMobileHintDismissed() {
  if (typeof window === "undefined") return;
  try {
    globalThis.localStorage.setItem(MOBILE_HINT_DISMISSED_KEY, "1");
  } catch {
    // localStorage may be unavailable in private or embedded browser contexts.
  }
}

function createQuickSampleFrames(): FrameEl[] {
  const height = Math.round((QUICK_SAMPLE_CANVAS_H - QUICK_SAMPLE_MARGIN * 3) / 2);
  return [0, 1].map((idx) => ({
    id: uid(),
    type: "frame" as const,
    x: QUICK_SAMPLE_MARGIN,
    y: QUICK_SAMPLE_MARGIN + idx * (height + QUICK_SAMPLE_MARGIN),
    width: CANVAS_W - QUICK_SAMPLE_MARGIN * 2,
    height,
  }));
}

function QuickStartPanel({
  onDismiss,
  onExample,
  onOpenTemplate,
  onOpenCharacter,
  onOpenBubble,
  onOpenPublish,
}: {
  onDismiss: () => void;
  onExample: () => void;
  onOpenTemplate: () => void;
  onOpenCharacter: () => void;
  onOpenBubble: () => void;
  onOpenPublish: () => void;
}) {
  const steps = [
    {
      label: "① 템플릿 고르기",
      hint: "컷 모양부터 잡으면 시작이 쉬워요.",
      icon: LayoutTemplate,
      onClick: onOpenTemplate,
    },
    {
      label: "② 캐릭터 넣기",
      hint: "2D 캐릭터를 바로 넣고, VRM도 쓸 수 있어요.",
      icon: Smile,
      onClick: onOpenCharacter,
    },
    {
      label: "③ 말풍선·대사",
      hint: "대사는 더블클릭해서 바꿔요.",
      icon: MessageCircle,
      onClick: onOpenBubble,
    },
    {
      label: "④ 게시하기",
      hint: "제목을 적고 작품으로 올려요.",
      icon: Send,
      onClick: onOpenPublish,
    },
  ];

  return (
    <div className="absolute inset-x-2 top-2 z-20 mx-auto max-h-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-2xl border border-line bg-panel/95 p-3 text-fg shadow-xl backdrop-blur sm:top-6 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold">빠른 시작</p>
          <p className="mt-1 max-w-[46ch] text-xs leading-relaxed text-fg-3">처음이라면 예시를 불러오거나, 아래 순서대로 하나씩 눌러보세요.</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="grid size-8 shrink-0 place-items-center rounded-lg border border-line text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          aria-label="빠른 시작 닫기"
          title="닫기"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={onExample}
          className={cn(
            buttonClass({ size: "sm", variant: "solid" }),
            "min-h-10 justify-center gap-1.5 px-3 text-sm sm:min-w-36"
          )}
        >
          <Sparkles size={15} aria-hidden />
          예시로 시작
        </button>
        <p className="text-xs leading-relaxed text-fg-3">2컷 템플릿, 캐릭터, 말풍선을 한 번에 넣어요.</p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <button
              key={step.label}
              type="button"
              onClick={step.onClick}
              className="group flex min-h-[4.75rem] items-center gap-3 rounded-xl border border-line bg-card px-3 py-3 text-left transition-colors hover:border-accent/60 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon size={18} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-fg">{step.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-fg-3">{step.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function drawBounds(points: number[]) {
  const [x1 = 0, y1 = 0, x2 = x1, y2 = y1] = points;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

function isCompleteDrawOp(el: DrawEl) {
  const kind = el.kind ?? "freehand";
  if (kind === "freehand") return el.points.length >= 4;
  const box = drawBounds(el.points);
  if (kind === "line") return Math.hypot((el.points[2] ?? 0) - (el.points[0] ?? 0), (el.points[3] ?? 0) - (el.points[1] ?? 0)) >= 3;
  return box.width >= 3 && box.height >= 3;
}

function getSymmetricPoints(
  points: number[],
  symmetry: { type: "none" | "vertical" | "horizontal" | "radial"; centerX: number; centerY: number; radialCount?: number } | undefined
): number[][] {
  if (!symmetry || symmetry.type === "none" || points.length === 0) {
    return [points];
  }
  
  const result: number[][] = [points];
  const cx = symmetry.centerX;
  const cy = symmetry.centerY;
  
  if (symmetry.type === "vertical") {
    const mirrored: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (x !== undefined && y !== undefined) {
        mirrored.push(cx * 2 - x, y);
      }
    }
    result.push(mirrored);
  } else if (symmetry.type === "horizontal") {
    const mirrored: number[] = [];
    for (let i = 0; i < points.length; i += 2) {
      const x = points[i];
      const y = points[i + 1];
      if (x !== undefined && y !== undefined) {
        mirrored.push(x, cy * 2 - y);
      }
    }
    result.push(mirrored);
  } else if (symmetry.type === "radial") {
    const count = symmetry.radialCount ?? 4;
    for (let s = 1; s < count; s++) {
      const angle = (s * 2 * Math.PI) / count;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotated: number[] = [];
      for (let i = 0; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i + 1];
        if (x !== undefined && y !== undefined) {
          const dx = x - cx;
          const dy = y - cy;
          rotated.push(cx + dx * cos - dy * sin, cy + dx * sin + dy * cos);
        }
      }
      result.push(rotated);
    }
  }
  
  return result;
}

// 패턴 채우기 타일 이미지 훅 — 패턴 스펙의 SVG 타일(data URL)을 HTMLImage로 비동기 로드한다.
// UrlImage의 effect 로드 방식을 훅으로 컴포넌트화한 것. 타일 src는 patternId/색에만
// 의존하므로(배율은 fillPatternScale로 적용) 배율 조절로는 재로드되지 않는다.
// 로드 전/실패 시 null → konvaPatternProps가 no-op이 되어 fill/그라데이션 폴백 유지.
function usePatternFillImage(pattern: StudioPatternSpec | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const tileSrc = pattern ? patternDataUrl(pattern) : null;
  useEffect(() => {
    if (!tileSrc) {
      setImage(null);
      return;
    }
    let active = true;
    loadPatternTileImage(tileSrc, () => new globalThis.Image())
      .then((img) => {
        if (active) setImage(img);
      })
      .catch(() => {
        if (active) setImage(null);
      });
    return () => {
      active = false;
    };
  }, [tileSrc]);
  return image;
}

function StudioDrawNode({ el }: { el: DrawEl }) {
  const kind = el.kind ?? "freehand";
  // 패턴 채우기 타일(로드 전 null) — 우선순위: 패턴 > 그라데이션 > 단색(fillPriority).
  const patternImage = usePatternFillImage(el.pattern);
  const composite = el.mode === "eraser" ? "destination-out" : "source-over";
  const opacity = el.opacity ?? 1;
  const stroke = el.mode === "eraser" ? "#16100c" : el.stroke;
  const strokeWidth = Math.max(1, el.strokeWidth);
  // 스트로크 스타일(점선/선 끝) + 도형 파라미터 — 미설정 요소는 기본값으로 정규화된다.
  const strokeStyle = normalizeStrokeStyle(el.strokeStyle);
  const shapeParams = normalizeShapeParams(el.shapeParams);
  const shapeDash = strokeDashArray(strokeStyle.dash, strokeWidth);

  const symmetricVariations = getSymmetricPoints(el.points, el.symmetry);

  return (
    <>
      {symmetricVariations.map((points, index) => {
        if (kind === "rect") {
          const box = drawBounds(points);
          return (
            <Rect
              key={index}
              x={box.x}
              y={box.y}
              width={Math.max(0.1, box.width)}
              height={Math.max(0.1, box.height)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: 0, y: 0, width: Math.max(0.1, box.width), height: Math.max(0.1, box.height) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              cornerRadius={effectiveCornerRadius(box.width, box.height, shapeParams.cornerRadius)}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "ellipse") {
          const box = drawBounds(points);
          return (
            <Ellipse
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              radiusX={Math.max(0.1, box.width / 2)}
              radiusY={Math.max(0.1, box.height / 2)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: -box.width / 2, y: -box.height / 2, width: Math.max(0.1, box.width), height: Math.max(0.1, box.height) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "star") {
          const box = drawBounds(points);
          return (
            <Star
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              numPoints={shapeParams.starPoints}
              innerRadius={Math.max(0.1, (Math.min(box.width, box.height) / 2) * shapeParams.starInnerRatio)}
              outerRadius={Math.max(0.1, Math.min(box.width, box.height) / 2)}
              fill={el.fill}
              {...konvaGradientProps(el.gradient, { x: -Math.min(box.width, box.height) / 2, y: -Math.min(box.width, box.height) / 2, width: Math.max(0.1, Math.min(box.width, box.height)), height: Math.max(0.1, Math.min(box.width, box.height)) })}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "arrow") {
          return (
            <Arrow
              key={index}
              points={points}
              pointerLength={Math.max(8, strokeWidth * 2)}
              pointerWidth={Math.max(8, strokeWidth * 2)}
              fill={stroke}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineCap={strokeStyle.lineCap}
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "triangle") {
          const box = drawBounds(points);
          return (
            <RegularPolygon
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              sides={3}
              radius={Math.max(0.1, Math.min(box.width, box.height) / 2)}
              fill={el.fill}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "polygon") {
          const box = drawBounds(points);
          return (
            <RegularPolygon
              key={index}
              x={box.x + box.width / 2}
              y={box.y + box.height / 2}
              sides={shapeParams.polygonSides}
              radius={Math.max(0.1, Math.min(box.width, box.height) / 2)}
              fill={el.fill}
              {...konvaPatternProps(el.pattern, patternImage)}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              dash={shapeDash}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        if (kind === "freehand") {
          const brush = el.brush ?? "pen";

          if (brush === "brush" && el.mode !== "eraser") {
            const smoothed = processFreehandPoints(points);
            return (
              <Shape
                key={index}
                sceneFunc={(context, shape) => {
                  if (smoothed.length < 2) return;
                  context.beginPath();
                  const angle = -Math.PI / 6;
                  const dx = (strokeWidth / 2) * Math.cos(angle);
                  const dy = (strokeWidth / 2) * Math.sin(angle);

                  if (smoothed.length === 2) {
                    const x0 = smoothed[0]!;
                    const y0 = smoothed[1]!;
                    context.moveTo(x0 - dx, y0 - dy);
                    context.lineTo(x0 + dx, y0 + dy);
                  } else {
                    for (let i = 0; i < smoothed.length - 2; i += 2) {
                      const x0 = smoothed[i]!;
                      const y0 = smoothed[i + 1]!;
                      const x1 = smoothed[i + 2]!;
                      const y1 = smoothed[i + 3]!;
                      
                      context.moveTo(x0 - dx, y0 - dy);
                      context.lineTo(x0 + dx, y0 + dy);
                      context.lineTo(x1 + dx, y1 + dy);
                      context.lineTo(x1 - dx, y1 - dy);
                      context.closePath();
                    }
                  }
                  context.fillStrokeShape(shape);
                }}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brush === "gpen" && el.mode !== "eraser") {
            // G펜: 필압(또는 속도 기반 의사 필압)에 따라 굵기가 변하고 양 끝이 가늘어지는 만화 잉크 선.
            const smoothed = processFreehandPoints(points);
            const segmentCount = Math.floor(smoothed.length / 2);
            const rawPressures = el.pressures ?? [];
            const sampled = Array.from({ length: segmentCount }, (_, i) => {
              if (rawPressures.length === 0) return 0.6;
              const idx = segmentCount <= 1 ? 0 : Math.round((i / (segmentCount - 1)) * (rawPressures.length - 1));
              return rawPressures[idx] ?? 0.6;
            });
            const widths = gpenSegmentWidths(sampled, strokeWidth);
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  for (let i = 2; i < smoothed.length; i += 2) {
                    const x0 = smoothed[i - 2]!;
                    const y0 = smoothed[i - 1]!;
                    const x1 = smoothed[i]!;
                    const y1 = smoothed[i + 1]!;
                    const w = widths[Math.floor(i / 2)] ?? strokeWidth;
                    context.beginPath();
                    context.moveTo(x0, y0);
                    context.lineTo(x1, y1);
                    context.lineWidth = w;
                    context.lineCap = "round";
                    context.lineJoin = "round";
                    context.strokeStyle = stroke;
                    context.stroke();
                  }
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brush === "screentone" && el.mode !== "eraser") {
            // 스크린톤: 전역 격자에 정렬된 망점 도트를 스트로크 경로에 찍는다(겹쳐도 패턴 유지).
            const pitch = Math.max(3, strokeWidth * 0.42);
            const radius = Math.max(2, strokeWidth / 2);
            const dots = screentoneDotsForStroke(points, radius, pitch);
            const dotR = screentoneDotRadius(pitch);
            return (
              <Shape
                key={index}
                sceneFunc={(context, shape) => {
                  context.beginPath();
                  for (let i = 0; i < dots.length; i += 2) {
                    context.moveTo(dots[i]! + dotR, dots[i + 1]!);
                    context.arc(dots[i]!, dots[i + 1]!, dotR, 0, Math.PI * 2);
                  }
                  context.fillStrokeShape(shape);
                }}
                fill={stroke}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brush === "pencil" && el.mode !== "eraser") {
            const jittered = processPencilPoints(points);
            return (
              <Line
                key={index}
                points={jittered}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                lineCap="round"
                lineJoin="round"
                tension={0.2}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          if (brush === "highlighter" && el.mode !== "eraser") {
            const smoothed = processFreehandPoints(points);
            return (
              <Line
                key={index}
                points={smoothed}
                stroke={stroke}
                strokeWidth={strokeWidth}
                opacity={opacity}
                lineCap="square"
                lineJoin="miter"
                tension={0.4}
                globalCompositeOperation="multiply"
                listening={false}
              />
            );
          }

          // Default "pen" or "marker" or "eraser"
          const smoothed = processFreehandPoints(points);
          const pressures = el.pressures;
          if (pressures && pressures.length > 0 && smoothed.length >= 4) {
            return (
              <Shape
                key={index}
                sceneFunc={(context) => {
                  if (smoothed.length < 4) return;
                  for (let i = 2; i < smoothed.length; i += 2) {
                    const x0 = smoothed[i - 2]!;
                    const y0 = smoothed[i - 1]!;
                    const x1 = smoothed[i]!;
                    const y1 = smoothed[i + 1]!;
                    
                    const idx = Math.floor(i / 2);
                    const p = pressures[idx] ?? 0.5;
                    const w = Math.max(0.5, strokeWidth * (0.3 + p * 1.4));
                    
                    context.beginPath();
                    context.moveTo(x0, y0);
                    context.lineTo(x1, y1);
                    
                    context.lineWidth = w;
                    context.lineCap = "round";
                    context.lineJoin = "round";
                    context.strokeStyle = stroke;
                    context.stroke();
                  }
                }}
                opacity={opacity}
                globalCompositeOperation={composite}
                listening={false}
              />
            );
          }

          return (
            <Line
              key={index}
              points={smoothed}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              lineCap="round"
              lineJoin="round"
              tension={0.4}
              globalCompositeOperation={composite}
              listening={false}
            />
          );
        }

        // 직선("line") — 점선/선 끝 스타일 + 시작/끝 화살촉(삼각형·점)을 함께 그린다.
        const lineHeads = lineArrowHeadGeoms(points, strokeStyle, strokeWidth);
        return (
          <Group key={index} opacity={opacity} listening={false}>
            <Line
              points={points}
              stroke={stroke}
              strokeWidth={strokeWidth}
              dash={shapeDash}
              lineCap={strokeStyle.lineCap}
              lineJoin="round"
              globalCompositeOperation={composite}
              listening={false}
            />
            {lineHeads.map((head, headIndex) =>
              head.kind === "dot" ? (
                <KCircle
                  key={headIndex}
                  x={head.cx}
                  y={head.cy}
                  radius={head.r}
                  fill={stroke}
                  globalCompositeOperation={composite}
                  listening={false}
                />
              ) : (
                <Line
                  key={headIndex}
                  points={head.points}
                  closed
                  fill={stroke}
                  lineJoin="round"
                  globalCompositeOperation={composite}
                  listening={false}
                />
              )
            )}
          </Group>
        );
      })}
    </>
  );
}

function PoserLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>포저를 여는 중</span>
      </div>
    </div>
  );
}

function Bg3DLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>3D 배경 도구를 여는 중</span>
      </div>
    </div>
  );
}

function TimelapseLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>타임랩스 도구를 여는 중</span>
      </div>
    </div>
  );
}

function StoryboardGridLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>스토리보드 그리드를 여는 중</span>
      </div>
    </div>
  );
}

/**
 * 생성형 AI(이미지 생성) 최초 사용 고지 다이얼로그(앱인토스 서비스 오픈 정책 필수).
 * 사용자가 처음 "생성"을 누를 때 1회 노출하고, 확인하면 곧바로 생성을 이어서 실행한다.
 * a11y: role=dialog + aria-modal, Esc 닫기, 진입 시 기본(확인) 버튼 포커스, 스크림 클릭으로 닫기.
 */
function AiAssetNotice({ onCancel, onAcknowledge }: { onCancel: () => void; onAcknowledge: () => void }) {
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

  return (
    <div
      role="presentation"
      onClick={(e) => {
        // 스크림(다이얼로그 바깥) 클릭일 때만 닫는다 — 내부 클릭은 currentTarget 이 아니라 무시.
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-[70] grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm"
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
            생성형 AI 이미지 안내
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-fg-2">
          이 기능은 <span className="font-semibold text-accent">생성형 AI(OpenAI)</span>로 이미지를 만들어요. 만들어진
          결과물에는 <span className="font-semibold">AI</span> 배지가 표시돼요.
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-fg-3">
          <li>타인의 저작물·캐릭터, 실존 인물의 얼굴은 생성하지 않아요.</li>
          <li>AI 결과물은 부정확하거나 의도와 다를 수 있어요.</li>
          <li>만든 이미지의 사용 책임은 본인에게 있어요.</li>
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line bg-card px-3 py-2 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
          >
            취소
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onAcknowledge}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
          >
            이해했어요, 생성하기
          </button>
        </div>
      </div>
    </div>
  );
}

// data-URL 이미지를 maxDim 이하로 축소해 전송 크기를 제한한다.
function downscaleImageFile(file: File, maxDim = 1280, quality = 0.85) {
  return new Promise<{ src: string; width: number; height: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.onload = () => {
      const img = new globalThis.Image();
      img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        resolve({ src: canvas.toDataURL("image/webp", quality), width, height });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function downscaleDataUrl(dataUrl: string, maxW: number, quality = 0.72) {
  return new Promise<string>((resolve) => {
    const img = new globalThis.Image();
    img.onerror = () => resolve(dataUrl);
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/webp", quality));
    };
    img.src = dataUrl;
  });
}

// 픽셀 선택 편집용 오프스크린 캔버스 팩토리 — studio-selection-tools 의 SelectionCanvasFactory
// 구조에 맞는 실제 DOM 캔버스를 만든다(2D 컨텍스트를 못 얻으면 null → 코어가 중단 신호로 처리).
function createPixelEditCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
}

// 픽셀 편집용 원본 이미지 로드 — data: URL 이 아니면 CORS 를 요청해 캔버스 오염(taint)으로
// toDataURL 이 막히는 것을 피한다(업로드/에셋은 대부분 data: 라 영향 없음).
function loadPixelEditImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new globalThis.Image();
    if (!src.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("이미지 원본을 불러오지 못했습니다."));
    img.src = src;
  });
}

function coverFitRect(containerW: number, containerH: number, imageW: number, imageH: number) {
  if (imageW <= 0 || imageH <= 0) {
    return { x: 0, y: 0, width: containerW, height: containerH };
  }
  const scale = Math.max(containerW / imageW, containerH / imageH);
  const width = imageW * scale;
  const height = imageH * scale;
  return {
    x: (containerW - width) / 2,
    y: (containerH - height) / 2,
    width,
    height,
  };
}

// 내보내기 캔버스에 페이지 색보정(그레이드)을 픽셀로 합성한다.
// 미리보기는 CSS filter로 보여주지만 Stage.toCanvas는 원본 픽셀을 캡처하므로,
// CSS와 동일한 filter 문자열을 2D 컨텍스트에 적용한 새 캔버스로 다시 그린 뒤 비네트를 얹는다.
// 보정이 기본값이면 원본 캔버스를 그대로 돌려준다(추가 메모리 0).
function bakeGradeIntoCanvas(src: HTMLCanvasElement, grade: PageGrade): HTMLCanvasElement {
  if (isDefaultPageGrade(grade)) return src;
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d");
  if (!ctx) return src;
  const css = pageGradeToCssFilter(grade);
  if (css) ctx.filter = css;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  drawVignette(ctx, out.width, out.height, grade.vignette);
  return out;
}

const IMAGE_FILTER_BUILD_CACHE_LIMIT = 200;
type StudioKonvaFiltersModule = typeof import("./studio-konva-filters");
type ImageFilterBuild = ReturnType<StudioKonvaFiltersModule["buildImageFilters"]>;
const EMPTY_IMAGE_FILTER_BUILD: ImageFilterBuild = { filters: [], attrs: {}, cachePad: 0 };
const imageFilterBuildCache = new Map<string, ImageFilterBuild>();
let studioKonvaFiltersPromise: Promise<StudioKonvaFiltersModule> | null = null;

function loadStudioKonvaFilters(): Promise<StudioKonvaFiltersModule> {
  if (!studioKonvaFiltersPromise) {
    studioKonvaFiltersPromise = import("./studio-konva-filters")
      .then((mod) => {
        mod.registerStudioKonvaFilters(KonvaRuntime);
        return mod;
      })
      .catch((error) => {
        studioKonvaFiltersPromise = null;
        throw error;
      });
  }
  return studioKonvaFiltersPromise;
}

function cachedBuildImageFilters(el: ImageEl, key: string, mod: StudioKonvaFiltersModule): ImageFilterBuild {
  const cached = imageFilterBuildCache.get(key);
  if (cached) return cached;
  const built = mod.buildImageFilters(el, KonvaRuntime);
  if (imageFilterBuildCache.size >= IMAGE_FILTER_BUILD_CACHE_LIMIT) {
    const oldest = imageFilterBuildCache.keys().next().value;
    if (oldest) imageFilterBuildCache.delete(oldest);
  }
  imageFilterBuildCache.set(key, built);
  return built;
}

// 픽셀 선택 마칭앤츠 오버레이 — 자체 RAF 로 대시 오프셋만 갱신해 StudioPage 전체 리렌더 없이
// 자기 자신(전용 Layer 안 소수 노드)만 다시 그린다. 오프셋은 경과시간의 순수 함수(결정적).
function StudioSelectionAntsOverlay({
  selection,
  drag,
  frame,
  scale,
}: {
  selection: PixelSelection | null;
  drag: SelectionDragState | null;
  frame: SelectionFrame;
  scale: number;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      // 50ms(20fps) 양자화 — 같은 값이면 setState 가 리렌더를 건너뛴다(고전 마칭앤츠 감성 + 절전).
      setElapsedMs(Math.floor((now - start) / 50) * 50);
      raf = globalThis.requestAnimationFrame(tick);
    };
    raf = globalThis.requestAnimationFrame(tick);
    return () => globalThis.cancelAnimationFrame(raf);
  }, []);

  const passes = marchingAntsPasses(elapsedMs, scale);
  const size = { width: frame.width, height: frame.height };
  // 브러시 드래그는 마칭앤츠 폴리곤이 아니라 반투명 라운드 획(미리보기=마스크 결과 일치)으로 그린다.
  const brushDrag = drag?.tool === "brush" ? brushStrokePreview(drag.points, drag.brushRadius, size) : null;
  const dragPoints =
    drag && drag.tool !== "brush" && drag.points.length >= 2
      ? subpathOutlinePoints({ mode: drag.mode, points: drag.points }, size)
      : null;
  const dragStroke = drag?.mode === "subtract" ? "rgba(244, 63, 94, 0.55)" : "rgba(124, 92, 252, 0.5)";
  const dragFill = drag?.mode === "subtract" ? "rgba(244, 63, 94, 0.12)" : "rgba(124, 92, 252, 0.10)";
  return (
    <Group x={frame.x} y={frame.y} rotation={frame.rotation ?? 0} listening={false}>
      {selection?.subpaths.map((sp, i) => {
        // 브러시 서브패스는 라운드 획으로(닫힌 폴리곤 앤츠는 궤적을 왜곡).
        if (sp.kind === "brush") {
          const stroke = brushStrokePreview(sp.points, sp.radius, size);
          if (!stroke) return null;
          return passes.map((pass, j) => (
            <Line
              key={`ants-brush-${i}-${j}`}
              points={stroke.points}
              stroke={pass.stroke}
              strokeWidth={stroke.strokeWidth}
              lineCap="round"
              lineJoin="round"
              opacity={j === 0 ? 0.9 : 0.5}
            />
          ));
        }
        const pts = subpathOutlinePoints(sp, size);
        return passes.map((pass, j) => (
          <Line
            key={`ants-${i}-${j}`}
            points={pts}
            closed
            stroke={pass.stroke}
            strokeWidth={pass.strokeWidth}
            dash={pass.dash ?? undefined}
            dashOffset={pass.dashOffset}
          />
        ));
      })}
      {/* 반전 선택은 이미지 테두리에도 앤츠를 둘러 "바깥이 선택됨"을 표시한다. */}
      {selection?.invert &&
        passes.map((pass, j) => (
          <Rect
            key={`ants-inv-${j}`}
            x={0}
            y={0}
            width={frame.width}
            height={frame.height}
            stroke={pass.stroke}
            strokeWidth={pass.strokeWidth}
            dash={pass.dash ?? undefined}
            dashOffset={pass.dashOffset}
          />
        ))}
      {/* 진행 중 브러시 드래그 — 반투명 라운드 획(결과 마스크와 동일 도형). */}
      {brushDrag && (
        <Line points={brushDrag.points} stroke={dragStroke} strokeWidth={brushDrag.strokeWidth} lineCap="round" lineJoin="round" />
      )}
      {/* 진행 중 폴리곤 드래그 미리보기 — 합치기=보라, 빼기=적색 반투명 채움 + 앤츠 외곽선. */}
      {dragPoints && (
        <>
          <Line points={dragPoints} closed fill={dragFill} />
          {passes.map((pass, j) => (
            <Line
              key={`ants-drag-${j}`}
              points={dragPoints}
              closed
              stroke={pass.stroke}
              strokeWidth={pass.strokeWidth}
              dash={pass.dash ?? undefined}
              dashOffset={pass.dashOffset}
            />
          ))}
        </>
      )}
    </Group>
  );
}

// 크롭 오버레이 — 크롭 모드 중 이미지 위에 크롭 rect(바깥 어둡게 마스킹 + 3분할선 + 8핸들)를
// 그린다. 기하는 studio-crop 순수 헬퍼가 계산하고 여기서는 Konva 노드로 그리기만 한다.
// listening=false — 포인터는 Stage 핸들러(onStageDown/Move/Up)가 히트테스트로 처리한다.
function StudioCropOverlay({ rect, frame, scale }: { rect: CropRect; frame: SelectionFrame; scale: number }) {
  const size = { width: frame.width, height: frame.height };
  const border = cropRectLocalPx(rect, size);
  const handleSide = 9 / scale; // 화면 9px 사각 핸들
  return (
    <Group x={frame.x} y={frame.y} rotation={frame.rotation ?? 0} listening={false}>
      {cropShadeRects(rect, size).map((s, i) => (
        <Rect key={`crop-shade-${i}`} x={s.x} y={s.y} width={s.w} height={s.h} fill="rgba(9, 9, 11, 0.55)" />
      ))}
      {cropThirdsLines(rect, size).map((pts, i) => (
        <Line key={`crop-third-${i}`} points={pts} stroke="rgba(255, 255, 255, 0.4)" strokeWidth={1 / scale} />
      ))}
      {/* 이중 테두리 — 어두운 밑줄 + 흰 실선이라 어떤 배경에서도 보인다. */}
      <Rect
        x={border.x}
        y={border.y}
        width={border.w}
        height={border.h}
        stroke="rgba(24, 24, 27, 0.6)"
        strokeWidth={3 / scale}
      />
      <Rect x={border.x} y={border.y} width={border.w} height={border.h} stroke="#ffffff" strokeWidth={1.5 / scale} />
      {cropHandlePoints(rect, size).map((hd) => (
        <Rect
          key={`crop-handle-${hd.id}`}
          x={hd.x - handleSide / 2}
          y={hd.y - handleSide / 2}
          width={handleSide}
          height={handleSide}
          fill="#ffffff"
          stroke="#18181b"
          strokeWidth={1 / scale}
          cornerRadius={2 / scale}
        />
      ))}
    </Group>
  );
}

// 벡터 노드 편집 핸들 — 이동 모드는 흰 원, 굵기 모드는 필압에 비례해 커지는 보라 원(굵기를
// 시각적으로 미리 보여준다). 드래그 중인 핸들은 항상 보라로 강조.
function StudioNodeEditOverlay({
  handles,
  tool,
  pressures,
  scale,
  activeHandleIndex,
}: {
  handles: NodeEditHandle[];
  tool: NodeEditTool;
  pressures: number[] | undefined;
  scale: number;
  activeHandleIndex: number | null;
}) {
  return (
    <Group listening={false}>
      {handles.map((h) => {
        const isActive = activeHandleIndex === h.pointIndex;
        const r = tool === "width" ? (4 + pressureAt(pressures, h.pointIndex) * 8) / scale : 5 / scale;
        return (
          <KCircle
            key={h.pointIndex}
            x={h.x}
            y={h.y}
            radius={r}
            fill={tool === "width" || isActive ? "#7c5cfc" : "#ffffff"}
            stroke="#18181b"
            strokeWidth={1.25 / scale}
          />
        );
      })}
    </Group>
  );
}

// 프레임 애니메이션 어니언스킨 — 이전/다음 프레임을 옅게 겹쳐 그린다. Transformer/포인터가 절대
// 이걸 붙잡지 않도록 항상 listening=false, nodeRefs에도 등록하지 않는다(선택 불가능한 참고선).
function OnionSkinImage({ el, layer }: { el: ImageEl; layer: OnionSkinLayer }) {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    const im = new globalThis.Image();
    im.onload = () => setImg(im);
    im.src = layer.frame.src;
    return () => {
      im.onload = null;
    };
  }, [layer.frame.src]);
  if (!img) return null;
  return (
    <Group opacity={layer.opacity} listening={false}>
      <KImage image={img} x={el.x} y={el.y} width={el.width} height={el.height} listening={false} />
      {layer.tint !== "none" && (
        <Rect
          x={el.x}
          y={el.y}
          width={el.width}
          height={el.height}
          fill={layer.tint === "prev" ? "#ef4444" : "#3b82f6"}
          opacity={0.55}
          globalCompositeOperation="source-atop"
          listening={false}
        />
      )}
    </Group>
  );
}

// 비동기 로드가 필요한 이미지 노드 — src 가 바뀌면 다시 로드한다.
function UrlImage({
  el,
  draggable,
  innerRef,
  onSelect,
  onChange,
  dragBoundFunc,
}: {
  el: ImageEl;
  draggable: boolean;
  innerRef: (n: Konva.Image | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<ImageEl>) => void;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
}) {
  const [img, setImg] = useState<HTMLImageElement>();
  const [displayImg, setDisplayImg] = useState<CanvasImageSource>();
  const [filterModule, setFilterModule] = useState<StudioKonvaFiltersModule | null>(null);
  const imageRef = useRef<Konva.Image | null>(null);

  useEffect(() => {
    const im = new globalThis.Image();
    im.src = el.src;
    im.onload = () => setImg(im);
    return () => {
      im.onload = null;
      im.onerror = null;
    };
  }, [el.src]);

  useEffect(() => {
    if (!img) {
      setDisplayImg(undefined);
      return;
    }
    const scaleX = el.flipped ? -1 : 1;
    const scaleY = el.flippedY ? -1 : 1;
    if (scaleX === 1 && scaleY === 1) {
      setDisplayImg(img);
      return;
    }
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const cx = c.getContext("2d");
    if (cx) {
      cx.translate(scaleX === -1 ? w : 0, scaleY === -1 ? h : 0);
      cx.scale(scaleX, scaleY);
      cx.drawImage(img, 0, 0);
      setDisplayImg(c);
    } else {
      setDisplayImg(img);
    }
  }, [img, el.flipped, el.flippedY]);

  const hasFilters = hasActiveImageFilters(el);
  const filterCacheKey = imageFilterCacheKey(el);
  useEffect(() => {
    if (!hasFilters || filterModule) return;
    let active = true;
    loadStudioKonvaFilters()
      .then((mod) => {
        if (active) setFilterModule(mod);
      })
      .catch((error) => {
        console.error("Failed to load studio image filters:", error);
      });
    return () => {
      active = false;
    };
  }, [filterModule, hasFilters]);

  // 보정값 → Konva 필터 배열 + 노드 속성. 캐시 의존성은 직렬화 키로 비교(좌표 드래그 시 재캐시 방지).
  const built = hasFilters && filterModule
    ? cachedBuildImageFilters(el, filterCacheKey, filterModule)
    : EMPTY_IMAGE_FILTER_BUILD;
  // react-konva filters prop 타입(Konva.NodeConfig["filters"])과 맞춘다.
  const filters: NonNullable<Konva.NodeConfig["filters"]> =
    built.filters as NonNullable<Konva.NodeConfig["filters"]>;
  const filterAttrs = built.attrs;
  const cachePad = built.cachePad; // 테두리(outline)가 실루엣 밖으로 자라도록 캐시에 추가할 여백(px).

  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    if (displayImg) {
      node.clearCache();
      if (hasFilters && filterModule) {
        // 테두리가 있으면 offset만큼 캐시 캔버스를 키워 실루엣 바깥에 테두리를 그릴 자리를 만든다.
        node.cache(cachePad > 0 ? { offset: cachePad } : undefined);
      }
      node.getLayer()?.batchDraw();
    }
  }, [displayImg, el.width, el.height, filterCacheKey, hasFilters, filterModule, cachePad]);

  if (!displayImg) return null;

  return (
    <KImage
      studioElementId={el.id}
      ref={(n) => {
        imageRef.current = n;
        innerRef(n);
      }}
      image={displayImg}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      opacity={el.opacity ?? 1}
      filters={filters}
      {...filterAttrs}
      shadowColor={el.shadowColor}
      shadowEnabled={!!el.shadowColor}
      shadowBlur={el.shadowBlur ?? 0}
      shadowOffsetX={el.shadowOffsetX ?? 0}
      shadowOffsetY={el.shadowOffsetY ?? 0}
      shadowOpacity={el.shadowOpacity ?? 1}
      cornerRadius={el.cornerRadius ?? 0}
      {...toKonvaSkewAttrs(el)}
      {...resizableNodeProps<Partial<ImageEl>>({ draggable, dragBoundFunc, onSelect, onChange })}
    />
  );
}

function FramePanel({
  el,
  theme,
  draggable,
  innerRef,
  onSelect,
  onChange,
  dragBoundFunc,
}: {
  el: FrameEl;
  theme: "classic" | "soft" | "vivid";
  draggable: boolean;
  innerRef: (n: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<FrameEl>) => void;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!el.bg) {
      setImg(null);
      return;
    }
    let alive = true;
    const im = new globalThis.Image();
    im.onload = () => {
      if (alive) setImg(im);
    };
    im.onerror = () => {
      if (alive) setImg(null);
    };
    im.src = el.bg;
    return () => {
      alive = false;
      im.onload = null;
      im.onerror = null;
    };
  }, [el.bg]);

  let fStroke = el.stroke ?? "#16100c";
  let fStrokeW = el.strokeWidth ?? 3;
  let fRadius = 4;
  let fShadowColor = undefined;
  let fShadowBlur = 0;
  let fShadowOpacity = 0;
  let fShadowOffset = undefined;

  if (theme === "soft") {
    fStroke = el.stroke ?? "#222222";
    fStrokeW = el.strokeWidth ?? 1.8;
    fRadius = 0;
  } else if (theme === "vivid") {
    fStroke = el.stroke ?? "#3a3a3a";
    fStrokeW = el.strokeWidth ?? 1.2;
    fRadius = 6;
    fShadowColor = "black";
    fShadowBlur = 5;
    fShadowOpacity = 0.08;
    fShadowOffset = { x: 1, y: 2 };
  }

  const fit = img ? coverFitRect(el.width, el.height, img.naturalWidth || img.width, img.naturalHeight || img.height) : null;
  const borderInset = fStrokeW / 2;
  // 사선/비정형 패널: 쿼드(8수) 폴리곤이면 폴리곤 클립·채움·테두리로 그린다.
  const poly = el.points && el.points.length >= 6 ? el.points : null;
  const clipProps = poly
    ? {
        clipFunc: (ctx: Konva.Context) => {
          ctx.beginPath();
          ctx.moveTo(poly[0], poly[1]);
          for (let i = 2; i < poly.length; i += 2) ctx.lineTo(poly[i], poly[i + 1]);
          ctx.closePath();
        },
      }
    : { clipX: 0, clipY: 0, clipWidth: el.width, clipHeight: el.height };

  return (
    <Group
      studioElementId={el.id}
      ref={innerRef}
      x={el.x}
      y={el.y}
      {...clipProps}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Group;
        const sx = node.scaleX();
        const sy = node.scaleY();
        const w = Math.max(40, el.width * sx);
        const h = Math.max(40, el.height * sy);
        node.scaleX(1);
        node.scaleY(1);
        // 폴리곤도 같은 비율로 스케일해 형태 유지.
        const patch: Partial<FrameEl> = { x: node.x(), y: node.y(), width: w, height: h };
        if (poly) patch.points = poly.map((v, i) => v * (i % 2 === 0 ? sx : sy));
        onChange(patch);
      }}
    >
      {poly ? (
        <Line points={poly} closed fill={el.bgColor ?? "#ffffff"} />
      ) : (
        <Rect width={el.width} height={el.height} fill={el.bgColor ?? "#ffffff"} />
      )}
      {img && fit ? (
        <KImage
          image={img}
          x={fit.x}
          y={fit.y}
          width={fit.width}
          height={fit.height}
        />
      ) : null}
      {fStrokeW > 0 &&
        (poly ? (
          <Line
            points={poly}
            closed
            stroke={fStroke}
            strokeWidth={fStrokeW}
            shadowColor={fShadowColor}
            shadowBlur={fShadowBlur}
            shadowOpacity={fShadowOpacity}
            shadowOffset={fShadowOffset}
            dash={el.dashStyle === "dashed" ? [10, 5] : undefined}
          />
        ) : (
          <Rect
            x={borderInset}
            y={borderInset}
            width={Math.max(0, el.width - fStrokeW)}
            height={Math.max(0, el.height - fStrokeW)}
            stroke={fStroke}
            strokeWidth={fStrokeW}
            cornerRadius={Math.max(0, fRadius - borderInset)}
            shadowColor={fShadowColor}
            shadowBlur={fShadowBlur}
            shadowOpacity={fShadowOpacity}
            shadowOffset={fShadowOffset}
            dash={el.dashStyle === "dashed" ? [10, 5] : undefined}
          />
        ))}
    </Group>
  );
}

function seededRandom(seedStr: string) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = seedStr.charCodeAt(i) + ((hash << 5) - hash);
  }
  return () => {
    const x = Math.sin(hash++) * 10000;
    return x - Math.floor(x);
  };
}

function formatVerticalText(text: string): string {
  const lines = text.split("\n");
  const maxLen = Math.max(...lines.map((l) => l.length));
  const resultLines: string[] = [];
  for (let charIdx = 0; charIdx < maxLen; charIdx++) {
    const rowChars: string[] = [];
    for (let lineIdx = lines.length - 1; lineIdx >= 0; lineIdx--) {
      const char = lines[lineIdx]?.[charIdx] ?? "　";
      rowChars.push(char);
    }
    resultLines.push(rowChars.join("  "));
  }
  return resultLines.join("\n");
}

function FocusLinesNode({
  el,
  draggable,
  innerRef,
  onSelect,
  onChange,
  dragBoundFunc,
}: {
  el: FocusLinesEl;
  draggable: boolean;
  innerRef: (n: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<FocusLinesEl>) => void;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
}) {
  const count = el.lineCount ?? 80;
  const innerR = el.innerRadius ?? 120;
  const outerR = el.outerRadius ?? 600;
  const noise = el.noise ?? 24;

  return (
    <Shape
      studioElementId={el.id}
      ref={innerRef}
      sceneFunc={(context, shape) => {
        context.beginPath();
        const cx = el.width * (el.centerXRatio ?? 0.5);
        const cy = el.height * (el.centerYRatio ?? 0.5);
        const rand = seededRandom(el.id);
        for (let i = 0; i < count; i++) {
          const angle = (i * 2 * Math.PI) / count;
          const nStart = (rand() - 0.5) * noise;
          const nEnd = (rand() - 0.5) * noise;
          const rStart = Math.max(1, innerR + nStart);
          const rEnd = Math.max(rStart + 10, outerR + nEnd);

          const x1 = cx + rStart * Math.cos(angle);
          const y1 = cy + rStart * Math.sin(angle);
          const x2 = cx + rEnd * Math.cos(angle);
          const y2 = cy + rEnd * Math.sin(angle);

          context.moveTo(x1, y1);
          context.lineTo(x2, y2);
        }
        context.fillStrokeShape(shape);
      }}
      hitFunc={(context, shape) => {
        // 가는 선이라 빈 곳 클릭이 안 잡히는 문제 해결 — 전체 박스를 클릭 영역으로.
        context.beginPath();
        context.rect(0, 0, el.width, el.height);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      stroke={el.stroke ?? "#000000"}
      strokeWidth={el.strokeWidth ?? 2.5}
      rotation={el.rotation ?? 0}
      opacity={el.opacity ?? 1}
      {...resizableNodeProps<Partial<FocusLinesEl>>({ draggable, dragBoundFunc, onSelect, onChange })}
    />
  );
}

function SpeedLinesNode({
  el,
  draggable,
  innerRef,
  onSelect,
  onChange,
  dragBoundFunc,
}: {
  el: SpeedLinesEl;
  draggable: boolean;
  innerRef: (n: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<SpeedLinesEl>) => void;
  dragBoundFunc?: (pos: Konva.Vector2d) => Konva.Vector2d;
}) {
  const count = el.lineCount ?? 60;
  const dir = el.direction ?? "horizontal";

  return (
    <Shape
      studioElementId={el.id}
      ref={innerRef}
      sceneFunc={(context, shape) => {
        context.beginPath();
        const rand = seededRandom(el.id);
        const w = el.width;
        const h = el.height;
        if (dir === "horizontal") {
          for (let i = 0; i < count; i++) {
            const y = rand() * h;
            const len = w * (0.2 + rand() * 0.8);
            const xStart = rand() > 0.5 ? 0 : w - len;
            context.moveTo(xStart, y);
            context.lineTo(xStart + len, y);
          }
        } else {
          for (let i = 0; i < count; i++) {
            const x = rand() * w;
            const len = h * (0.2 + rand() * 0.8);
            const yStart = rand() > 0.5 ? 0 : h - len;
            context.moveTo(x, yStart);
            context.lineTo(x, yStart + len);
          }
        }
        context.fillStrokeShape(shape);
      }}
      hitFunc={(context, shape) => {
        // 가는 선이라 빈 곳 클릭이 안 잡히는 문제 해결 — 전체 박스를 클릭 영역으로.
        context.beginPath();
        context.rect(0, 0, el.width, el.height);
        context.closePath();
        context.fillStrokeShape(shape);
      }}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      stroke={el.stroke ?? "#000000"}
      strokeWidth={el.strokeWidth ?? 2.5}
      rotation={el.rotation ?? 0}
      opacity={el.opacity ?? 1}
      {...resizableNodeProps<Partial<SpeedLinesEl>>({ draggable, dragBoundFunc, onSelect, onChange })}
    />
  );
}

// 캔버스 줌 한계와 클램프(0.05 단위 반올림으로 깔끔한 퍼센트 유지).
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 5;
function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 20) / 20));
}

interface PageState {
  id: string;
  elements: El[];
  bg: string;
  bgGrad: string[] | null;
  canvasH: number;
  grade?: PageGrade; // 페이지 전체 색보정(밝기/대비/채도/색조/세피아/흑백/비네트). 미설정=보정 없음.
  groups?: LayerGroup[]; // 레이어 그룹(폴더). 미설정=그룹 없음.
  animTimeline?: AnimationTimelineDoc; // 다중 레이어 타임라인(studio-anim-tracks). 미설정=타임라인 없음(기존 문서 100% 호환).
  name?: string; // 페이지 이름(스트립 표시) — studio-page-meta 관리. 미설정=자동 이름("1페이지").
  note?: string; // 콘티 메모 — 미설정=없음. 빈 값 저장 시 키 제거로 레거시 직렬화 형태 유지.
  hideMaster?: boolean; // 이 페이지에서 문서 마스터(공통 요소) 숨김 — studio-master-page. 미설정=표시(해제 시 키 제거).
  shotType?: string; // 샷 타입(클로즈업/와이드 등) — studio-panel-shot-tags 관리. 미설정=태그 없음(빈 값 저장 시 키 제거).
  cameraAngle?: string; // 카메라 앵글(로우/하이/더치 등) — studio-panel-shot-tags 관리. 미설정=태그 없음(빈 값 저장 시 키 제거).
}

export function StudioPage() {
  const [params] = useSearchParams();
  if (params.get("mode") === "upload") {
    return <StudioUploadPublish />;
  }
  return <StudioCuttoonEditor />;
}

function StudioCuttoonEditor() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: session } = useSession();
  const workId = params.get("id");
  const remixId = params.get("remix");
  const linkedTitleId = params.get("titleId");
  const linkedSeriesId = params.get("seriesId");
  const linkedChallengeId = params.get("challengeId");
  const studioAuthUserId = session?.user?.id ?? null;
  const loggedIn = Boolean(studioAuthUserId);

  // 편집 문서 상태(페이지 리스트를 히스토리로 관리하여 페이지 생성/삭제/이동도 undo/redo 지원)
  const [pagesHistory, setPagesHistory] = useState<PageState[][]>([
    [
      {
        id: uid(),
        elements: [],
        bg: "#ffffff",
        bgGrad: null,
        canvasH: 1080,
      },
    ],
  ]);
  const [pagesHi, setPagesHi] = useState(0);
  const pages = pagesHistory[pagesHi];

  const [currentPageId, setCurrentPageId] = useState<string>(pages[0]?.id || "");

  // ── 문서 마스터(공통 요소 레이어) — 모든 페이지에 깔리는 로고/워터마크/코너 장식(studio-master-page) ──
  // pagesHistory 와 분리된 문서 레벨 상태 — 마스터 편집은 페이지 실행취소 히스토리에 포함되지 않는다(패널 고지).
  const [master, setMaster] = useState<DocumentMaster<El>>(() => createEmptyDocumentMaster<El>());
  const [masterEditMode, setMasterEditMode] = useState(false);
  const [masterPanelOpen, setMasterPanelOpen] = useState(false);
  // 페이지 캔버스/썸네일에 깔 마스터 합성 목록(숨김 제외 · 잠금/노클립 강제 · 비상호작용).
  const masterRenderEls = composeMasterRenderElements(master);
  const activePageIndex = Math.max(0, pages.findIndex((p) => p.id === currentPageId));
  const activePage = pages[activePageIndex] || pages[0] || {
    id: currentPageId,
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1080,
  };

  // 마스터 편집 모드에서는 편집 대상(선택·레이어 패널·속성·commit)이 문서 마스터 요소로 바뀐다(studio-master-page 규약).
  const elements = masterEditMode ? master.elements : activePage.elements;
  const bg = activePage.bg;
  const bgGrad = activePage.bgGrad;
  const canvasH = activePage.canvasH;
  // 현재 페이지의 색보정(과거 저장본 안전 정규화) + 미리보기용 CSS filter 문자열.
  const pageGrade = normalizePageGrade(activePage.grade);
  const pageGradeCss = pageGradeToCssFilter(pageGrade);
  const pageGradeActive = !isDefaultPageGrade(pageGrade);
  // 레이어 그룹(폴더) — 과거 저장본 호환 위해 미설정 시 빈 배열.
  const groups = activePage.groups ?? [];
  const animTimeline = normalizeAnimationTimelineDoc(activePage.animTimeline);
  const elementById = new Map<string, El>();
  for (const element of elements) elementById.set(element.id, element);

  const hi = pagesHi;
  const history = pagesHistory;

  // 연속 동작(방향키 미세이동 등)을 한 번의 실행취소로 합치기 위한 키.
  const coalesceKeyRef = useRef<string | null>(null);
  const [webtoonTheme, setWebtoonTheme] = useState<"classic" | "soft" | "vivid">("soft");

  // 페이지 단위 백그라운드 및 크기 수정 헬퍼
  const setBg = (newBg: string | ((prev: string) => string)) => {
    const val = typeof newBg === "function" ? newBg(activePage.bg) : newBg;
    updateActivePage({ bg: val });
  };
  const setBgGrad = (newGrad: string[] | null | ((prev: string[] | null) => string[] | null)) => {
    const val = typeof newGrad === "function" ? newGrad(activePage.bgGrad) : newGrad;
    updateActivePage({ bgGrad: val });
  };
  const setCanvasH = (newH: number | ((prev: number) => number)) => {
    const val = typeof newH === "function" ? newH(activePage.canvasH) : newH;
    updateActivePage({ canvasH: val });
  };

  function updateActivePage(patch: Partial<Omit<PageState, "id">>) {
    // 마스터 편집 모드의 요소 배열 쓰기(그룹 지정 등)가 페이지 요소를 덮어쓰는 사고를 차단한다(마스터는 그룹 미지원).
    if (masterEditMode && "elements" in patch) return;
    const nextPages = pages.map((p) => (p.id === activePage.id ? { ...p, ...patch } : p));
    commitPages(nextPages);
  }
  // ── 페이지 색보정(그레이드) ──────────────────────────────────────────────
  const patchPageGrade = (patch: Partial<PageGrade>) =>
    updateActivePage({ grade: normalizePageGrade({ ...pageGrade, ...patch }) });
  const applyPageGrade = (grade: PageGrade) => updateActivePage({ grade: normalizePageGrade(grade) });
  const resetPageGrade = () => updateActivePage({ grade: undefined });

  // 줌/팬 드래그 상태
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ scrollLeft: 0, scrollTop: 0, clientX: 0, clientY: 0 });

  // 색맹 시뮬레이션 미리보기 — Stage 에만 SVG feColorMatrix filter 로 라이브 근사(el 데이터 변경 없음).
  const [colorBlindPreview, setColorBlindPreview] = useState<CvdMode>("none");

  // 그리드 스냅 상태
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(40);
  // 웹툰 표준폭 가이드(네이버 690·카카오 720…)·세이프영역 표시 토글.
  const [showWebtoonGuides, setShowWebtoonGuides] = useState(false);
  const [webtoonGuides, setWebtoonGuides] = useState<StudioWebtoonGuidesModule | null>(null);
  const ensureWebtoonGuidesLoaded = () => {
    if (webtoonGuides) return;
    void loadStudioWebtoonGuides()
      .then(setWebtoonGuides)
      .catch((err) => {
        console.error("Failed to load studio webtoon guides:", err);
      });
  };
  // 매직 리사이즈 — 선택한 재배치 전략(기본: 정규화 중심 유지). undo/redo 대상 아님(원근자
  // 소실점과 같은 이유로, 이건 "다음 클릭에 어떤 전략을 쓸지"를 고르는 도구 설정일 뿐 —
  // 실제 커밋 대상은 applyMagicResizePreset이 만드는 elements/canvasH 쪽이다).
  const [magicResizeStrategy, setMagicResizeStrategy] = useState<MagicResizeStrategy>(MAGIC_RESIZE_DEFAULT_STRATEGY);
  // 대사 일괄 입력(말풍선 메뉴) — 여러 줄 스크립트를 화자별 말풍선으로 한 번에.
  const [dialogueScript, setDialogueScript] = useState("");
  // 배치된 대사 일괄 편집 패널(코미포식) — 목록 인라인 수정·찾아바꾸기·클릭 선택.
  const [dialogueBatchOpen, setDialogueBatchOpen] = useState(false);
  // 작업 내역(히스토리) 패널 — 단계 목록 클릭으로 특정 시점 점프(포토샵 히스토리식).
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  // 캔버스 넓게 쓰기 — 좌측 페이지 목록·우측 속성 패널을 접어 캔버스 폭을 키운다(데스크톱).
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // 모바일(<lg) 레이아웃: 양쪽 패널을 바텀시트로 띄워 캔버스를 화면 폭에 꽉 채운다.
  const isMobile = useIsMobile();
  // 모바일에서 열려 있는 바텀시트(페이지 목록 / 속성 / 브러시 설정). null=캔버스 전체.
  const [mobileSheet, setMobileSheet] = useState<null | "pages" | "props" | "draw">(null);
  const pagesSheetRef = useRef<HTMLDivElement>(null);
  const propsSheetRef = useRef<HTMLElement>(null);
  const drawSheetRef = useRef<HTMLDivElement>(null);
  const sheetReturnFocusRef = useRef<HTMLElement | null>(null);
  // 데스크톱으로 넘어가면 열린 바텀시트를 닫아 다시 모바일로 줄였을 때 시트가 떠 있지 않게 한다.
  useEffect(() => {
    if (!isMobile) setMobileSheet(null);
  }, [isMobile]);
  // 바텀시트 a11y: 열리면 시트 내부(닫기 버튼)로 포커스를 옮기고, 닫히면 트리거로 되돌린다.
  useEffect(() => {
    if (!isMobile) return;
    if (!mobileSheet) {
      sheetReturnFocusRef.current?.focus?.();
      sheetReturnFocusRef.current = null;
      return;
    }
    sheetReturnFocusRef.current = document.activeElement as HTMLElement | null;
    const id = requestAnimationFrame(() => {
      const sheet =
        mobileSheet === "pages"
          ? pagesSheetRef.current
          : mobileSheet === "draw"
            ? drawSheetRef.current
            : propsSheetRef.current;
      sheet?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [mobileSheet, isMobile]);
  // 데스크톱: 캔버스와 도구 패널 너비를 드래그(또는 키보드)로 조절하는 스플리터.
  const leftResize = useResizable({ initial: 176, min: 132, max: 360, edge: "right", storageKey: "studio:leftW" });
  const rightResize = useResizable({ initial: 304, min: 248, max: 720, edge: "left", storageKey: "studio:rightW" });
  const [pageGradePanelOpen, setPageGradePanelOpen] = useState(false);
  const [menu, setMenu] = useState<null | StudioMenu>(null);
  // 모니터 전체화면(Fullscreen API) — 창작 스튜디오만 스크린 전체로.
  const [isFullscreen, setIsFullscreen] = useState(false);
  // 브라우저 창 최대화 — OS 전체화면이 아니라 브라우저 뷰포트(탭 유지)를 꽉 채운다.
  const [maximized, setMaximized] = useState(false);
  // 재사용 클립 보관함 — 선택 요소(그룹)를 저장해 다른 컷·회차에서 다시 꺼내 쓴다.
  const [clips, setClips] = useState<StudioClip[]>([]);

  useEffect(() => {
    if (pageGradeActive) setPageGradePanelOpen(true);
  }, [pageGradeActive]);

  // 템플릿 및 여백 관리 상태
  const [currentTemplate, setCurrentTemplate] = useState<TemplateSpec | null>(null);
  const [panelGutter, setPanelGutter] = useState(24);
  const [panelSplitRatio, setPanelSplitRatio] = useState(50);

  // 우클릭 컨텍스트 메뉴 상태
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    elId: string | null;
  }>({ visible: false, x: 0, y: 0, elId: null });

  // 미니맵 스크롤 정보 상태
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0, width: 0, height: 0, scrollWidth: 0, scrollHeight: 0 });
  const scrollRafRef = useRef<number | null>(null);
  const updateScrollPosRef = useRef<() => void>(() => {});

  // 임시저장 복구 여부 상태
  const [hasAutosave, setHasAutosave] = useState(false);
  const [autosaveChecked, setAutosaveChecked] = useState(Boolean(workId));

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // PPT식 드래그 다중선택 — 빈 영역에서 사각형을 끌어 겹치는 요소를 한꺼번에 선택.
  const [marqueeIds, setMarqueeIds] = useState<string[]>([]);
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  // 다중선택 그룹 이동 — 끄는 노드의 시작·직전 위치로 나머지 선택 노드에 이동량을 함께 적용.
  const groupDragRef = useRef<{ id: string; x0: number; y0: number; lastX: number; lastY: number } | null>(null);
  // 단일 선택이 생기면 마퀴 다중선택은 해제(상호 배타).
  useEffect(() => {
    if (selectedId) setMarqueeIds([]);
  }, [selectedId]);
  // 필터 클립보드 — "필터 복사"로 담아 다른 요소에 "붙여넣기"(웹툰 컷 간 룩 통일용).
  const [filterClipboard, setFilterClipboard] = useState<Partial<ImageFilterFields> | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [color, setColor] = useState("#7c5cfc");
  // 최근 사용 색(색상 팝오버 공용) — 색상 선택기를 실제로 열 때만 복원해 초기 Studio 진입을 가볍게 유지한다.
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const recentColorsLoadRef = useRef<Promise<void> | null>(null);
  const ensureRecentColorsLoaded = () => {
    if (recentColorsLoadRef.current) return;
    recentColorsLoadRef.current = import("./studio-color-utils")
      .then(({ readRecentColors }) => {
        setRecentColors(readRecentColors(globalThis.localStorage));
      })
      .catch((err) => {
        recentColorsLoadRef.current = null;
        console.error("Failed to load studio recent colors:", err);
      });
  };
  // 저장된 클립 복원 — 클립 메뉴를 열 때만 모듈/localStorage를 읽어 초기 스튜디오 로드를 가볍게 유지한다.
  useEffect(() => {
    if (menu !== "clip") return;
    if (clipsLoadRef.current) return;

    let alive = true;
    clipsLoadRef.current = import("./studio-clips")
      .then(({ listClips }) => {
        if (!alive) return;
        setClips(listClips(globalThis.localStorage));
      })
      .catch((err) => {
        console.error("Failed to load studio clips:", err);
        clipsLoadRef.current = null;
      });
    return () => {
      alive = false;
    };
  }, [menu]);
  // 전체화면 상태 동기화 — ESC 등으로 빠져나가도 토글 상태가 맞도록 이벤트로 추적.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => {
      const fs = document.fullscreenElement === studioRootRef.current;
      setIsFullscreen(fs);
      // 전체화면이면 좌우 패널을 접어 캔버스가 화면 폭을 최대한 쓰게 한다(빠져나오면 복원).
      setLeftPanelOpen(!fs);
      setRightPanelOpen(!fs);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  function toggleFullscreen() {
    if (typeof document === "undefined") return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void studioRootRef.current?.requestFullscreen?.();
    }
  }
  // 브라우저 창 최대화 토글 — 켜면 좌우 패널을 접어 캔버스를 뷰포트 폭에 꽉 채운다(복원 시 펼침).
  function toggleMaximize() {
    const next = !maximized;
    setMaximized(next);
    setLeftPanelOpen(!next);
    setRightPanelOpen(!next);
  }
  // 최대화 상태에서 ESC로 빠져나오기 — 버튼으로 끌 때(toggleMaximize)와 동일하게 접어둔 좌우
  // 패널도 함께 복원해야 한다. 이걸 빠뜨리면 ESC로 나온 뒤 패널이 계속 접힌 채로 남는다.
  useEffect(() => {
    if (!maximized || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMaximized(false);
        setLeftPanelOpen(true);
        setRightPanelOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);
  const rememberColor = (c: string) => {
    void import("./studio-color-utils")
      .then(({ pushRecentColor, storeRecentColors }) => {
        setRecentColors((prev) => {
          const next = pushRecentColor(prev, c);
          if (next === prev) return prev;
          storeRecentColors(globalThis.localStorage, next);
          return next;
        });
      })
      .catch((err) => {
        console.error("Failed to store studio recent color:", err);
      });
  };
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [drawMode, setDrawMode] = useState<DrawMode>("pen");
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [brush, setBrush] = useState<string>("pen");
  const [drawShape, setDrawShape] = useState<DrawShapeKind>("line");
  const [shapeFill, setShapeFill] = useState(false);
  const [stabilizer, setStabilizer] = useState<number>(6);
  const [pressureCurve, setPressureCurve] = useState<number>(1.0);
  const [useVelocityPressure, setUseVelocityPressure] = useState<boolean>(true);
  const [velocitySensitivity, setVelocitySensitivity] = useState<number>(0.65);
  const [symmetryType, setSymmetryType] = useState<"none" | "vertical" | "horizontal" | "radial">("none");
  const [symmetryCenterX, setSymmetryCenterX] = useState<number>(400);
  const [symmetryCenterY, setSymmetryCenterY] = useState<number>(540);
  const [symmetryRadialCount, setSymmetryRadialCount] = useState<number>(6);
  const [perspectiveRulerActive, setPerspectiveRulerActive] = useState(false);
  const [quickShapeActive, setQuickShapeActive] = useState(false); // 기본 꺼짐
  const [vanishingPoints, setVanishingPoints] = useState<VanishingPoint[]>([]);
  const [isometricGridActive, setIsometricGridActive] = useState(false);
  const [isometricAngleDeg, setIsometricAngleDeg] = useState<number>(DEFAULT_ISOMETRIC_ANGLE_DEG);
  const [isometricCellSize, setIsometricCellSize] = useState<number>(DEFAULT_ISOMETRIC_CELL_SIZE);
  const [isometricOriginX, setIsometricOriginX] = useState<number>(() => CANVAS_W / 2);
  const [isometricOriginY, setIsometricOriginY] = useState<number>(() => canvasH / 2);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [bubbleAnchorPickActive, setBubbleAnchorPickActive] = useState(false);
  const [drawAdvancedOpen, setDrawAdvancedOpen] = useState(false);
  const [studioOptionalAssets, setStudioOptionalAssets] = useState<StudioOptionalAssetPacks>(
    EMPTY_STUDIO_OPTIONAL_ASSETS
  );
  const [studioBgSceneAssetsLoaded, setStudioBgSceneAssetsLoaded] = useState(false);
  const [studioBgSceneAssetsLoading, setStudioBgSceneAssetsLoading] = useState(false);
  const [studioBgSceneAssetsError, setStudioBgSceneAssetsError] = useState<string | null>(null);
  const [studioStickerAssetsLoaded, setStudioStickerAssetsLoaded] = useState(false);
  const [studioStickerAssetsLoading, setStudioStickerAssetsLoading] = useState(false);
  const [studioStickerAssetsError, setStudioStickerAssetsError] = useState<string | null>(null);
  const [studioEmeresAssetsLoaded, setStudioEmeresAssetsLoaded] = useState(false);
  const [studioEmeresAssetsLoading, setStudioEmeresAssetsLoading] = useState(false);
  const [studioEmeresAssetsError, setStudioEmeresAssetsError] = useState<string | null>(null);
  const [panelLayoutPresets, setPanelLayoutPresets] = useState<PanelLayoutPreset[]>([]);
  const [panelLayoutsLoading, setPanelLayoutsLoading] = useState(false);
  const [panelLayoutsError, setPanelLayoutsError] = useState<string | null>(null);
  const [sceneTemplatePacks, setSceneTemplatePacks] = useState<StudioSceneTemplatePacks | null>(null);
  const [sceneTemplatesLoading, setSceneTemplatesLoading] = useState(false);
  const [sceneTemplatesError, setSceneTemplatesError] = useState<string | null>(null);
  const [sfxPacks, setSfxPacks] = useState<StudioSfxPacks | null>(null);
  const [sfxLoading, setSfxLoading] = useState(false);
  const [sfxError, setSfxError] = useState<string | null>(null);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  // 에셋 공유(커뮤니티): 탭·목록·로딩/에러·공유 진행 상태
  const [assetTab, setAssetTab] = useState<StudioAssetTab>("mine");
  const [shared, setShared] = useState<SharedAsset[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [poserVrmOpen, setPoserVrmOpen] = useState(false);
  const [poserInitialDataUrl, setPoserInitialDataUrl] = useState<string | undefined>(undefined);
  const [poserInitialElementId, setPoserInitialElementId] = useState<string | undefined>(undefined);
  const [bg3dOpen, setBg3dOpen] = useState(false);
  const [bg3dInitialDataUrl, setBg3dInitialDataUrl] = useState<string | undefined>(undefined);
  const [bg3dInitialElementId, setBg3dInitialElementId] = useState<string | undefined>(undefined);
  const [vrmCreatorOpen, setVrmCreatorOpen] = useState(false);
  // 게시된 작품(workId 존재)을 스튜디오에서 다시 열었을 때만 채워진다 — WorkDetail.pages(렌더링된
  // 컷 이미지)가 있어야 컷별 연출(WorkFxPanel)의 "컷 이미지 클릭해 마크 찍기" UI가 성립하므로,
  // 아직 게시 전(pages 없음)인 신규 작품에는 이 패널을 노출하지 않는다.
  const [loadedWork, setLoadedWork] = useState<WorkDetail | null>(null);
  const [fxPanelOpen, setFxPanelOpen] = useState(false);
  const [referencePanelOpen, setReferencePanelOpen] = useState(false);
  const [timelapseOpen, setTimelapseOpen] = useState(false);
  const [storyboardGridOpen, setStoryboardGridOpen] = useState(false);
  const [timelapseCapturing, setTimelapseCapturing] = useState(false);
  const timelapseOriginalHiRef = useRef(0);
  // frameAnimTargetId는 selectedId와 별개로 추적한다(bg3dInitialElementId/poserInitialElementId와
  // 동일한 이유) — 패널이 열린 채로 캔버스의 다른 요소를 클릭해도 패널이 사라지지 않는다.
  const [frameAnimOpen, setFrameAnimOpen] = useState(false);
  const [frameAnimTargetId, setFrameAnimTargetId] = useState<string | null>(null);
  const [onionSkin, setOnionSkin] = useState<OnionSkinSettings>(DEFAULT_ONION_SKIN);
  const capturedElementIdsRef = useRef<Set<string>>(new Set());
  const frameAnimTarget = frameAnimTargetId ? elementById.get(frameAnimTargetId) : null;
  const frameAnimEl = frameAnimTarget && frameAnimTarget.type === "image" ? (frameAnimTarget as ImageEl) : null;
  // 대상 요소가 삭제되거나(다른 페이지 이동 포함, elementById가 활성 페이지 기준이라 자동 반영)
  // 사라지면 패널을 자동으로 닫는다.
  useEffect(() => {
    if (frameAnimOpen && frameAnimTargetId && !frameAnimTarget) {
      setFrameAnimOpen(false);
      setFrameAnimTargetId(null);
    }
  }, [frameAnimOpen, frameAnimTargetId, frameAnimTarget]);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelinePlayhead, setTimelinePlayhead] = useState(0);
  const [timelinePlaying, setTimelinePlaying] = useState(false);
  const [timelineFocusedTrackId, setTimelineFocusedTrackId] = useState<string | null>(null);
  // 재생 중에만 의미 있는 ephemeral 미리보기 프레임 — 커밋되지 않는다(§3.10, 재생은 비파괴 미리보기).
  const [timelinePreviewFrame, setTimelinePreviewFrame] = useState(0);
  // 페이지 전환 시 재생헤드/재생상태 초기화 — frameAnimTarget 소멸 감시 이펙트와 같은 이유:
  // 다른 페이지의 타임라인 좌표를 계속 들고 있으면 혼란스럽다.
  useEffect(() => {
    setTimelinePlayhead(0);
    setTimelinePlaying(false);
    setTimelineFocusedTrackId(null);
  }, [activePage.id]);
  // frameCount가 줄어들면(다른 세션/undo로) 재생헤드를 범위 안으로 당긴다.
  useEffect(() => {
    setTimelinePlayhead((p) => clampGlobalFrameIndex(animTimeline.frameCount, p));
  }, [animTimeline.frameCount]);
  // 패널을 닫아도(토글 버튼 재클릭·Escape 등 모든 닫기 경로 공통) 재생 중이던 상태가 rAF 루프와
  // 함께 백그라운드에 계속 남지 않도록 강제 정지한다 — 개별 onClose/토글 콜백마다 정지를 챙기면
  // 새 닫기 경로가 추가될 때 빠뜨리기 쉬우므로, "닫힘"이라는 단일 상태 변화 지점에서 일괄 처리한다.
  useEffect(() => {
    if (!timelineOpen) setTimelinePlaying(false);
  }, [timelineOpen]);
  // 재생 루프 — 커밋 없이 timelinePreviewFrame 만 rAF 로 갱신한다(undo 히스토리 오염 방지).
  // idx가 직전 틱과 같으면 setState를 스킵 — 프레임 슬롯이 넓거나(저-fps 애니메이션) 디스플레이
  // 주사율이 애니메이션 fps보다 훨씬 높을 때 매 rAF 틱마다 불필요하게 StudioPage 전체를 리렌더하는
  // 것을 막는다(idx가 안 바뀌면 timelineComposite/renderEl 결과도 안 바뀌므로 리렌더가 무의미하다).
  useEffect(() => {
    if (!timelinePlaying) return;
    const start = performance.now();
    let raf = 0;
    let lastIdx = -1;
    const tick = () => {
      const elapsed = performance.now() - start;
      const idx = globalFrameIndexAtElapsed(animTimeline, elapsed, true);
      if (idx !== lastIdx) {
        lastIdx = idx;
        setTimelinePreviewFrame(idx);
      }
      raf = globalThis.requestAnimationFrame(tick);
    };
    raf = globalThis.requestAnimationFrame(tick);
    return () => globalThis.cancelAnimationFrame(raf);
  }, [timelinePlaying, animTimeline]);
  const [quickStartDismissed, setQuickStartDismissed] = useState(readQuickStartDismissed);
  const [quickStartOpen, setQuickStartOpen] = useState(false);
  const [mobileHintDismissed, setMobileHintDismissed] = useState(readMobileHintDismissed);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishContext, setPublishContext] = useState<PublishContext>({});
  const [workHydrated, setWorkHydrated] = useState(!workId);
  const sceneTemplates = sceneTemplatePacks ?? EMPTY_STUDIO_SCENE_TEMPLATE_PACKS;
  const studioSfx = sfxPacks ?? EMPTY_STUDIO_SFX_PACKS;
  const studioOptionalAssetsMountedRef = useRef(true);
  const bgSceneAssetsLoadRef = useRef<Promise<void> | null>(null);
  const stickerAssetsLoadRef = useRef<Promise<void> | null>(null);
  const emeresAssetsLoadRef = useRef<Promise<void> | null>(null);
  const panelLayoutsLoadRef = useRef<Promise<void> | null>(null);
  const sceneTemplatesLoadRef = useRef<Promise<void> | null>(null);
  const sfxLoadRef = useRef<Promise<void> | null>(null);
  const clipsLoadRef = useRef<Promise<void> | null>(null);

  // 표시용 스케일(컨테이너 폭에 맞춤).
  const wrapRef = useRef<HTMLDivElement>(null);
  const studioRootRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = wrapRef.current;
    // 컨테이너 폭에 맞춰 캔버스를 채운다. 전체화면이면 초광폭 모니터도 채우게 상한을 4배로 올린다.
    // ResizeObserver로 패널 접기·전체화면 등 레이아웃 변화까지 감지(예전엔 window resize만 들어 접어도 안 넓어졌다).
    const cap = isFullscreen || maximized ? 4 : 2.5;
    const measure = () => {
      const w = (el ?? wrapRef.current)?.clientWidth ?? CANVAS_W;
      setScale(Math.min(cap, Math.max(0.1, w / CANVAS_W)));
    };
    measure();
    let ro: ResizeObserver | null = null;
    if (el && typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    globalThis.addEventListener("resize", measure);
    return () => {
      ro?.disconnect();
      globalThis.removeEventListener("resize", measure);
    };
  }, [isFullscreen, maximized]);

  // 사용자 줌(폭맞춤 스케일에 곱함). effScale로 Stage·내보내기 해상도를 함께 보정.
  const [zoom, setZoom] = useState(1);
  // 핀치 줌 제스처가 최신 zoom을 stale 없이 읽도록 ref로 동기화.
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  const effScale = scale * zoom;
  const snapBoundFunc = (pos: { x: number; y: number }) => {
    if (!snapEnabled) return pos;
    const stage = stageRef.current;
    if (!stage) return pos;
    const transform = stage.getAbsoluteTransform().copy().invert();
    const localPos = transform.point(pos);
    const snappedLocalX = Math.round(localPos.x / gridSize) * gridSize;
    const snappedLocalY = Math.round(localPos.y / gridSize) * gridSize;
    return stage.getAbsoluteTransform().point({ x: snappedLocalX, y: snappedLocalY });
  };
  // ⌘/Ctrl + 휠로 줌(네이티브 비-passive 리스너 — preventDefault로 브라우저 줌 차단).
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z + (e.deltaY < 0 ? 0.15 : -0.15)));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  // 모바일 핀치 줌 — 두 손가락 거리 변화를 zoom에 반영(한 손가락 스크롤=네이티브 패닝은 그대로).
  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    // 정확히 두 손가락일 때만 기준선을 잡는다. 손가락 수가 바뀌면(예: 2→3→2) 기준선을 버려
    // 다음 두-손가락 프레임에서 새로 잡게 해 줌이 튀지 않도록 한다.
    const arm = (e: TouchEvent) => {
      if (e.touches.length === 2 && !stageRef.current?.isDragging()) {
        pinchStartDist = dist(e.touches);
        pinchStartZoom = zoomRef.current;
      } else {
        pinchStartDist = 0;
      }
    };
    const onTouchStart = arm;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || stageRef.current?.isDragging()) {
        pinchStartDist = 0; // 요소 드래그 중이거나 두 손가락이 아니면 핀치 비활성
        return;
      }
      if (pinchStartDist === 0) {
        // 두 손가락이 막 모인 첫 프레임 — 기준선만 잡고 이번 프레임은 줌하지 않는다.
        pinchStartDist = dist(e.touches);
        pinchStartZoom = zoomRef.current;
        return;
      }
      e.preventDefault(); // 브라우저 페이지 줌 차단
      setZoom(clampZoom(pinchStartZoom * (dist(e.touches) / pinchStartDist)));
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length !== 2) pinchStartDist = 0;
    };
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  // Space 키 누름에 따른 화면 팬(Pan) 모드 활성화 리스너
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || editing) return;
      if (e.code === "Space" && !isSpacePressed) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
        setIsPanning(false);
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("keyup", handleKeyUp);
    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSpacePressed, editing]);

  // 미니맵용 스크롤 좌표 추적 리스너. scroll은 빈번하므로 rAF로 묶고 동일값이면 렌더를 생략한다.
  useEffect(() => {
    updateScrollPosRef.current = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = globalThis.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        const wrap = wrapRef.current;
        if (!wrap) return;
        const next = {
          left: wrap.scrollLeft,
          top: wrap.scrollTop,
          width: wrap.clientWidth,
          height: wrap.clientHeight,
          scrollWidth: wrap.scrollWidth,
          scrollHeight: wrap.scrollHeight,
        };
        setScrollPos((prev) =>
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.height === next.height &&
          prev.scrollWidth === next.scrollWidth &&
          prev.scrollHeight === next.scrollHeight
            ? prev
            : next
        );
      });
    };
  });
  const updateScrollPos = () => updateScrollPosRef.current();

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onScroll = () => updateScrollPosRef.current();
    const onResize = () => updateScrollPosRef.current();
    wrap.addEventListener("scroll", onScroll, { passive: true });
    globalThis.addEventListener("resize", onResize);
    const timer = globalThis.setTimeout(onResize, 150);
    return () => {
      wrap.removeEventListener("scroll", onScroll);
      globalThis.removeEventListener("resize", onResize);
      globalThis.clearTimeout(timer);
      if (scrollRafRef.current !== null) {
        globalThis.cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    updateScrollPosRef.current();
  }, [canvasH, effScale, leftPanelOpen, rightPanelOpen, isFullscreen, maximized]);

  // 오토세이브 임시저장 리스너 (디바운스 1.5초)
  useEffect(() => {
    if (!workHydrated) return;
    if (!autosaveChecked) return;
    // 복구 배너가 떠 있는 동안(복구/비우기 결정 전)은 저장하지 않는다 — 가드가 없으면
    // 재진입 1.5초 뒤 빈 초기 상태가 직전 작업을 덮어써 "복구하기"가 빈 캔버스를 복원한다.
    if (hasAutosave) return;
    // 빈 문서(요소·게시 정보 모두 없음)는 저장하지 않는다 — 의미 없는 복구 배너를 막고,
    // 직전 작업 백업이 빈 상태로 교체되는 것도 방지한다.
    const hasContent =
      pages.some((p) => p.elements.length > 0) ||
      master.elements.length > 0 ||
      title.trim() !== "" ||
      description.trim() !== "" ||
      tagsText.trim() !== "";
    if (!hasContent) return;
    const timer = setTimeout(() => {
      try {
        const payload = {
          pagesList: pages,
          master: serializeDocumentMaster(master),
          title,
          description,
          tagsText,
          webtoonTheme,
          panelGutter,
        };
        localStorage.setItem("toonspectrum-studio-autosave", JSON.stringify(payload));
      } catch (e) {
        console.error("Auto-save failed:", e);
      }
    }, 1500);
    return () => clearTimeout(timer);
  }, [pages, master, title, description, tagsText, webtoonTheme, panelGutter, workHydrated, autosaveChecked, hasAutosave]);

  // 복구 여부를 정하지 않은 채 캔버스 편집을 시작하면(undo 히스토리 누적) 배너를 닫고
  // 자동 저장을 재개한다 — 배너를 무시한 새 작업이 저장되지 않는 공백을 막는다.
  useEffect(() => {
    if (hasAutosave && pagesHistory.length > 1) setHasAutosave(false);
  }, [hasAutosave, pagesHistory]);

  // 로드 시 임시저장 확인 리스너 — 실제 내용이 있는 백업만 복구 배너를 띄운다.
  // (요소·게시 정보가 전부 빈 백업은 복구 가치가 없고, 과거 버전이 남긴 빈 페이로드도 거른다.)
  useEffect(() => {
    if (!workId) {
      setAutosaveChecked(false);
      return scheduleIdle(() => {
        try {
          const saved = localStorage.getItem("toonspectrum-studio-autosave");
          if (saved) {
            const parsed: {
              pagesList?: { elements?: unknown[] }[];
              master?: { elements?: unknown[] };
              title?: string;
              description?: string;
              tagsText?: string;
            } = JSON.parse(saved);
            const hasContent =
              Array.isArray(parsed.pagesList) &&
              parsed.pagesList.length > 0 &&
              (parsed.pagesList.some((p) => (p?.elements?.length ?? 0) > 0) ||
                (parsed.master?.elements?.length ?? 0) > 0 ||
                (parsed.title ?? "").trim() !== "" ||
                (parsed.description ?? "").trim() !== "" ||
                (parsed.tagsText ?? "").trim() !== "");
            if (hasContent) setHasAutosave(true);
          }
        } catch {
          // 무시
        } finally {
          setAutosaveChecked(true);
        }
      });
    }
    setAutosaveChecked(true);
  }, [workId]);

  function restoreAutosave() {
    try {
      const saved = localStorage.getItem("toonspectrum-studio-autosave");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.pagesList && parsed.pagesList.length > 0) {
          setPagesHistory([parsed.pagesList]);
          setPagesHi(0);
          setCurrentPageId(parsed.pagesList[0].id);
        }
        if (parsed.title) setTitle(parsed.title);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.tagsText) setTagsText(parsed.tagsText);
        if (parsed.webtoonTheme) setWebtoonTheme(parsed.webtoonTheme);
        if (parsed.panelGutter) setPanelGutter(parsed.panelGutter);
        // 문서 마스터 복구 — 백업에 없으면 빈 마스터(하위호환).
        setMaster(normalizeDocumentMaster(parsed.master) as DocumentMaster<El>);
        setHasAutosave(false);
      }
    } catch {
      setError("임시저장 복구에 실패했어요.");
    }
  }

  function clearAutosave() {
    try {
      localStorage.removeItem("toonspectrum-studio-autosave");
      setHasAutosave(false);
    } catch {
      // 무시
    }
  }

  // 화면 드래그 스크롤 핸들러 (Space + Drag)
  const onWrapMouseDown = (e: React.MouseEvent) => {
    if (!isSpacePressed) return;
    setIsPanning(true);
    const wrap = wrapRef.current;
    if (!wrap) return;
    panStartRef.current = {
      scrollLeft: wrap.scrollLeft,
      scrollTop: wrap.scrollTop,
      clientX: e.clientX,
      clientY: e.clientY,
    };
  };

  const onWrapMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const dx = e.clientX - panStartRef.current.clientX;
    const dy = e.clientY - panStartRef.current.clientY;
    wrap.scrollLeft = panStartRef.current.scrollLeft - dx;
    wrap.scrollTop = panStartRef.current.scrollTop - dy;
  };

  const onWrapMouseUp = () => {
    setIsPanning(false);
  };

  const onMinimapClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const mWidth = rect.width;
    const mHeight = rect.height;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const targetX = (mx / mWidth) * (CANVAS_W * effScale) - wrap.clientWidth / 2;
    const targetY = (my / mHeight) * (canvasH * effScale) - wrap.clientHeight / 2;
    wrap.scrollLeft = targetX;
    wrap.scrollTop = targetY;
    updateScrollPos();
  };

  const onWrapDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onWrapDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const wrap = wrapRef.current;
    if (!wrap) return;
    // 이벤트 풀링/await 후 무효화 대비 — 좌표·파일·데이터를 동기적으로 먼저 캡처.
    const cx = e.clientX;
    const cy = e.clientY;
    const imageFile = e.dataTransfer.files
      ? Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"))
      : undefined;
    const assetData = e.dataTransfer.getData("application/json-asset");

    // 드롭 지점(스테이지 좌표) → 거기에 중앙을 맞춰 배치한다.
    const placeAt = (src: string, width: number, height: number) => {
      const rect = wrap.getBoundingClientRect();
      const x = (cx - rect.left + wrap.scrollLeft) / effScale;
      const y = (cy - rect.top + wrap.scrollTop) / effScale;
      const fit = Math.min(1, (CANVAS_W - 80) / width);
      const targetW = Math.round(width * fit);
      const targetH = Math.round(height * fit);
      setError(null);
      addEl({ id: uid(), type: "image", src, x: x - targetW / 2, y: y - targetH / 2, width: targetW, height: targetH, rotation: 0 });
    };

    // 1) 외부 이미지 파일 드롭(데스크톱에서 끌어다 놓기) — ⌘V 붙여넣기와 동일하게 추가.
    if (imageFile) {
      try {
        const { src, width, height } = await downscaleImageFile(imageFile);
        placeAt(src, width, height);
      } catch (err) {
        setError(err instanceof Error ? err.message : "이미지를 추가하지 못했어요.");
      }
      return;
    }

    // 2) 내부 에셋 패널에서 드래그한 경우.
    if (!assetData) return;
    try {
      const { src, width, height } = JSON.parse(assetData);
      placeAt(src, width, height);
    } catch (err) {
      console.error("Drop asset failed:", err);
    }
  };

  // 우클릭 컨텍스트 메뉴 바깥 클릭시 닫기
  useEffect(() => {
    const handleCloseMenu = () => {
      if (contextMenu.visible) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    globalThis.addEventListener("click", handleCloseMenu);
    return () => globalThis.removeEventListener("click", handleCloseMenu);
  }, [contextMenu.visible]);

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({});
  const publishRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<DrawEl | null>(null);
  const perspectiveRayRef = useRef<PerspectiveRay | null>(null);
  const isometricAxisRayRef = useRef<IsometricAxisRay | null>(null);
  const quickShapeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const quickShapeStillSinceRef = useRef<number>(0);
  const quickShapeStillAnchorRef = useRef<{ x: number; y: number } | null>(null);
  const quickShapeConvertedRef = useRef<boolean>(false); // 이 스트로크가 QuickShape 로 변환됐는지
  const quickShapeLockedRef = useRef<boolean>(false); // 2단계(정비율 고정)를 이미 적용했는지
  // 브러시 커서 프리뷰(Konva 노드 직접 갱신 — hover 리렌더 방지).
  const brushCursorRef = useRef<Konva.Circle>(null);
  const [draft, setDraft] = useState<DrawEl | null>(null);
  const draftRafRef = useRef<number | null>(null);
  const pendingDraftRef = useRef<DrawEl | null>(null);
  const marqueeRafRef = useRef<number | null>(null);
  const pendingMarqueeRectRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  // 드래그 중 표시할 정렬 가이드(스테이지 좌표; 캔버스/패널 중심·가장자리에 스냅).
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  // 스냅 가이드 갱신 — 값이 같으면 같은 참조를 유지해 드래그 매 프레임마다 StudioPage 전체가
  // 리렌더되지 않게 한다(성능: 드래그 중 가이드는 대부분 그대로라 리렌더를 크게 줄인다).
  const applyGuides = (x: number[], y: number[]) => {
    setGuides((prev) =>
      prev.x.length === x.length &&
      prev.y.length === y.length &&
      prev.x.every((v, i) => v === x[i]) &&
      prev.y.every((v, i) => v === y[i])
        ? prev
        : { x, y }
    );
  };
  // 요소 간 스마트 가이드 오버레이(정렬 선분 + 균등 간격 배지) — 값이 같으면 참조를 유지해
  // 드래그 매 프레임 리렌더를 억제한다(applyGuides와 같은 패턴).
  const [smartGuides, setSmartGuides] = useState<SmartGuideOverlay>(EMPTY_SMART_GUIDE_OVERLAY);
  const applySmartGuides = (next: SmartGuideOverlay) => {
    setSmartGuides((prev) => (smartGuideOverlaysEqual(prev, next) ? prev : next));
  };
  const scheduleDraft = (next: DrawEl | null) => {
    pendingDraftRef.current = next;
    if (draftRafRef.current !== null) return;
    draftRafRef.current = globalThis.requestAnimationFrame(() => {
      draftRafRef.current = null;
      setDraft(pendingDraftRef.current);
    });
  };
  const clearDraftPreview = () => {
    pendingDraftRef.current = null;
    if (draftRafRef.current !== null) {
      globalThis.cancelAnimationFrame(draftRafRef.current);
      draftRafRef.current = null;
    }
    setDraft(null);
  };
  const scheduleMarqueeRect = (next: { x: number; y: number; w: number; h: number } | null) => {
    pendingMarqueeRectRef.current = next;
    if (marqueeRafRef.current !== null) return;
    marqueeRafRef.current = globalThis.requestAnimationFrame(() => {
      marqueeRafRef.current = null;
      setMarqueeRect(pendingMarqueeRectRef.current);
    });
  };
  const clearMarqueePreview = () => {
    pendingMarqueeRectRef.current = null;
    if (marqueeRafRef.current !== null) {
      globalThis.cancelAnimationFrame(marqueeRafRef.current);
      marqueeRafRef.current = null;
    }
    setMarqueeRect(null);
  };
  useEffect(
    () => () => {
      if (draftRafRef.current !== null) globalThis.cancelAnimationFrame(draftRafRef.current);
      if (marqueeRafRef.current !== null) globalThis.cancelAnimationFrame(marqueeRafRef.current);
    },
    []
  );
  // ── 픽셀 선택 도구(포토샵식 마퀴/올가미) — studio-selection-tools 통합 상태 ──
  // 선택 영역·도구는 "이미지 요소 1개"에 귀속된다(요소가 바뀌면 아래 effect 가 해제).
  const [pixelSel, setPixelSel] = useState<PixelSelection | null>(null);
  // "wand"는 이 파일에서만 쓰는 로컬 확장 — StudioSelectionToolsPanel의 activeTool prop은 여전히
  // SelectionToolKind만 받으므로(export 자체는 안 건드림), 그 패널에 넘길 때는 wand를 null로 좁힌다.
  const [pixelTool, setPixelTool] = useState<SelectionToolKind | "wand" | null>(null);
  const [pixelCombine, setPixelCombine] = useState<SelectionCombineMode>("add");
  const [pixelBusy, setPixelBusy] = useState(false);
  // 브러시 선택 반경(캔버스 표시 px) — 드래그 시작 시 요소 폭으로 나눠 정규화 반경으로 넘긴다.
  const [pixelBrushRadius, setPixelBrushRadius] = useState(SELECTION_BRUSH_RADIUS_DEFAULT);
  const [wandTolerance, setWandTolerance] = useState(MAGIC_WAND_TOLERANCE_DEFAULT);
  const pixelWandRunIdRef = useRef(0);
  const [smudgeActive, setSmudgeActive] = useState(false);
  const [smudgeRadius, setSmudgeRadius] = useState(SMUDGE_RADIUS_DEFAULT);
  const [smudgeStrength, setSmudgeStrength] = useState(SMUDGE_STRENGTH_DEFAULT); // %
  const [smudgeBusy, setSmudgeBusy] = useState(false);
  const smudgeDragRef = useRef<{ elId: string; frame: SelectionFrame; points: SelPoint[] } | null>(null);
  const smudgeCursorRef = useRef<Konva.Circle>(null);
  // 진행 중 드래그 — ref 가 원본(포인터 이벤트마다 갱신), 미리보기 상태는 RAF 로 합쳐 반영(마퀴와
  // 동일 패턴). frame 은 드래그 시작 시점 스냅샷 — 제스처 중 좌표 변환이 흔들리지 않는다.
  const pixelDragRef = useRef<{ elId: string; frame: SelectionFrame; drag: SelectionDragState } | null>(null);
  const pixelDragRafRef = useRef<number | null>(null);
  const pendingPixelDragRef = useRef<SelectionDragState | null>(null);
  const [pixelDragPreview, setPixelDragPreview] = useState<SelectionDragState | null>(null);
  const schedulePixelDragPreview = (next: SelectionDragState | null) => {
    pendingPixelDragRef.current = next;
    if (pixelDragRafRef.current !== null) return;
    pixelDragRafRef.current = globalThis.requestAnimationFrame(() => {
      pixelDragRafRef.current = null;
      setPixelDragPreview(pendingPixelDragRef.current);
    });
  };
  const clearPixelDragPreview = () => {
    pendingPixelDragRef.current = null;
    if (pixelDragRafRef.current !== null) {
      globalThis.cancelAnimationFrame(pixelDragRafRef.current);
      pixelDragRafRef.current = null;
    }
    setPixelDragPreview(null);
  };
  useEffect(
    () => () => {
      if (pixelDragRafRef.current !== null) globalThis.cancelAnimationFrame(pixelDragRafRef.current);
    },
    []
  );
  // 선택 요소가 바뀌면 픽셀 선택·진행 중 드래그·busy 를 해제한다(선택 영역은 이미지 1개 귀속).
  useEffect(() => {
    void selectedId; // 값 자체는 안 쓰지만 "바뀌면 초기화"를 위해 의존성으로 구독한다.
    pixelDragRef.current = null;
    pendingPixelDragRef.current = null;
    if (pixelDragRafRef.current !== null) {
      globalThis.cancelAnimationFrame(pixelDragRafRef.current);
      pixelDragRafRef.current = null;
    }
    setPixelDragPreview(null);
    setPixelSel(null);
    setPixelBusy(false);
    pixelWandRunIdRef.current += 1; // 요소가 바뀌면 진행 중인 매직완드 스캔 결과를 무효화한다.
  }, [selectedId]);
  // ── 이미지 크롭 도구 — studio-crop 통합 상태 ──
  // cropRect(정규화 0..1)가 null 이 아니면 크롭 모드. 크롭 rect 는 이미지 요소 1개에 귀속된다.
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [cropAspect, setCropAspect] = useState<CropAspectId>("free");
  const [cropBusy, setCropBusy] = useState(false);
  // 진행 중 크롭 드래그 — ref 가 원본(포인터마다 갱신), rect 상태 반영은 RAF 로 합친다
  // (픽셀 선택 미리보기와 동일 패턴). frame 은 드래그 시작 시점 스냅샷.
  const cropDragRef = useRef<{ elId: string; frame: SelectionFrame; session: CropDragSession } | null>(null);
  const cropRafRef = useRef<number | null>(null);
  const pendingCropRectRef = useRef<CropRect | null>(null);
  const scheduleCropRect = (next: CropRect) => {
    pendingCropRectRef.current = next;
    if (cropRafRef.current !== null) return;
    cropRafRef.current = globalThis.requestAnimationFrame(() => {
      cropRafRef.current = null;
      if (pendingCropRectRef.current) setCropRect(pendingCropRectRef.current);
    });
  };
  // 드래그 종료 시 RAF 대기분을 즉시 반영 — 마지막 이동이 유실되지 않는다.
  const flushCropRect = () => {
    if (cropRafRef.current !== null) {
      globalThis.cancelAnimationFrame(cropRafRef.current);
      cropRafRef.current = null;
    }
    if (pendingCropRectRef.current) {
      setCropRect(pendingCropRectRef.current);
      pendingCropRectRef.current = null;
    }
  };
  useEffect(
    () => () => {
      if (cropRafRef.current !== null) globalThis.cancelAnimationFrame(cropRafRef.current);
    },
    []
  );
  // ── 패널 손그림 컷(임의 각도 절단선) — studio-panel-split 통합 상태. 크롭과 동일한
  // 드래그 세션+RAF 스로틀 패턴이지만, 대상은 이미지가 아니라 선택된 FrameEl.
  const [panelSplitActive, setPanelSplitActive] = useState(false);
  const [panelSplitHint, setPanelSplitHint] = useState<string | null>(null);
  const [panelSplitPreview, setPanelSplitPreview] = useState<PanelSplitPreview | null>(null);
  const panelSplitDragRef = useRef<{ targetFrameId: string; start: { x: number; y: number } } | null>(null);
  // previewPanelSplit 의 반환값은 계산에 쓰인 line 을 보존하지 않으므로, pointerup 에서
  // planPanelSplit 을 다시 부르려면 마지막 드래그 line 을 따로 기억해둬야 한다.
  const panelSplitLastLineRef = useRef<PanelSplitLine | null>(null);
  const panelSplitRafRef = useRef<number | null>(null);
  const pendingPanelSplitPreviewRef = useRef<PanelSplitPreview | null>(null);
  const schedulePanelSplitPreview = (next: PanelSplitPreview | null) => {
    pendingPanelSplitPreviewRef.current = next;
    if (panelSplitRafRef.current !== null) return;
    panelSplitRafRef.current = globalThis.requestAnimationFrame(() => {
      panelSplitRafRef.current = null;
      setPanelSplitPreview(pendingPanelSplitPreviewRef.current);
    });
  };
  const flushPanelSplitPreview = () => {
    if (panelSplitRafRef.current !== null) {
      globalThis.cancelAnimationFrame(panelSplitRafRef.current);
      panelSplitRafRef.current = null;
    }
    setPanelSplitPreview(pendingPanelSplitPreviewRef.current);
  };
  useEffect(
    () => () => {
      if (panelSplitRafRef.current !== null) globalThis.cancelAnimationFrame(panelSplitRafRef.current);
    },
    []
  );
  // ── 벡터 노드 편집(자유선 점 이동·굵기) — studio-node-edit 통합 상태 ──
  const [nodeEditTool, setNodeEditTool] = useState<NodeEditTool | null>(null);
  const nodeEditDragRef = useRef<{ elId: string; session: NodeDragSession } | null>(null);
  const nodeEditRafRef = useRef<number | null>(null);
  const pendingNodeEditDraftRef = useRef<{ elId: string; points: number[]; pressures: number[] } | null>(null);
  const [nodeEditDraft, setNodeEditDraft] = useState<{ elId: string; points: number[]; pressures: number[] } | null>(null);
  const scheduleNodeEditDraft = (next: { elId: string; points: number[]; pressures: number[] }) => {
    pendingNodeEditDraftRef.current = next;
    if (nodeEditRafRef.current !== null) return;
    nodeEditRafRef.current = globalThis.requestAnimationFrame(() => {
      nodeEditRafRef.current = null;
      if (pendingNodeEditDraftRef.current) setNodeEditDraft(pendingNodeEditDraftRef.current);
    });
  };
  useEffect(() => () => {
    if (nodeEditRafRef.current !== null) globalThis.cancelAnimationFrame(nodeEditRafRef.current);
  }, []);
  useEffect(() => {
    void selectedId;
    nodeEditDragRef.current = null;
    pendingNodeEditDraftRef.current = null;
    if (nodeEditRafRef.current !== null) {
      globalThis.cancelAnimationFrame(nodeEditRafRef.current);
      nodeEditRafRef.current = null;
    }
    setNodeEditDraft(null);
    setNodeEditTool(null);
  }, [selectedId]);
  // ── 복구 브러시/도장(heal/clone) — studio-heal-clone 통합 상태 ──
  // 모드(healCloneTool)는 pixelTool과 동일하게 요소가 바뀌어도 유지(사용자 선호), 소스 앵커/
  // 오프셋은 pixelSel과 동일하게 "이미지 요소 1개 귀속"이라 요소가 바뀌면 해제한다.
  const [healCloneTool, setHealCloneTool] = useState<HealCloneMode | null>(null);
  const [healCloneRadius, setHealCloneRadius] = useState(HEAL_CLONE_RADIUS_DEFAULT);
  const [healCloneHardness, setHealCloneHardness] = useState(HEAL_CLONE_HARDNESS_DEFAULT);
  const [healCloneOpacity, setHealCloneOpacity] = useState(HEAL_CLONE_OPACITY_DEFAULT);
  const [healCloneAligned, setHealCloneAligned] = useState(true);
  const [healCloneSourceAnchor, setHealCloneSourceAnchor] = useState<SelPoint | null>(null);
  const [healCloneBusy, setHealCloneBusy] = useState(false);
  // aligned 모드에서 스트로크를 넘어 유지되는 오프셋(정규화). React 상태가 아님 — 표시에 안 쓰인다.
  const healCloneOffsetRef = useRef<SelPoint | null>(null);
  // 진행 중 드래그 — pixelDragRef와 동일 패턴(frame은 드래그 시작 스냅샷, radiusNorm도 함께 스냅샷
  // 해서 move 중 selected를 다시 읽지 않는다).
  const healCloneDragRef = useRef<{
    elId: string;
    frame: SelectionFrame;
    offset: SelPoint;
    radiusNorm: number;
    points: SelPoint[];
  } | null>(null);
  const healCloneRafRef = useRef<number | null>(null);
  const pendingHealCloneDragRef = useRef<{ points: SelPoint[] } | null>(null);
  const [healCloneDragPreview, setHealCloneDragPreview] = useState<{ points: SelPoint[] } | null>(null);
  // 브러시 원/소스 크로스헤어 호버 커서 — brushCursorRef(펜 도구)와 동일 기법: ref 직접 갱신,
  // React 리렌더 없음. 드래그 중에도(스트로크 반경 원이 그대로 따라오게) 계속 갱신한다.
  const healCloneCursorRef = useRef<Konva.Circle>(null);
  const healCloneSourceCursorRef = useRef<Konva.Circle>(null);
  const scheduleHealCloneDragPreview = (next: { points: SelPoint[] } | null) => {
    pendingHealCloneDragRef.current = next;
    if (healCloneRafRef.current !== null) return;
    healCloneRafRef.current = globalThis.requestAnimationFrame(() => {
      healCloneRafRef.current = null;
      setHealCloneDragPreview(pendingHealCloneDragRef.current);
    });
  };
  const clearHealCloneDragPreview = () => {
    pendingHealCloneDragRef.current = null;
    if (healCloneRafRef.current !== null) {
      globalThis.cancelAnimationFrame(healCloneRafRef.current);
      healCloneRafRef.current = null;
    }
    setHealCloneDragPreview(null);
  };
  useEffect(() => () => {
    if (healCloneRafRef.current !== null) globalThis.cancelAnimationFrame(healCloneRafRef.current);
  }, []);
  // 선택 요소가 바뀌면 소스 앵커·진행 중 드래그·busy를 해제(모드는 유지 — pixelTool과 동일 정책).
  useEffect(() => {
    void selectedId;
    healCloneDragRef.current = null;
    clearHealCloneDragPreview();
    setHealCloneSourceAnchor(null);
    healCloneOffsetRef.current = null;
    setHealCloneBusy(false);
  }, [selectedId]);
  // ── 레이어 마스크 브러시 — studio-layer-mask 통합 상태 ──
  // paintActive/paintMode/radius/hardness/strength는 pixelTool과 동일하게 요소가 바뀌어도 유지.
  const [layerMaskPaintActive, setLayerMaskPaintActive] = useState(false);
  const [layerMaskPaintMode, setLayerMaskPaintMode] = useState<LayerMaskPaintMode>("reveal");
  const [layerMaskRadius, setLayerMaskRadius] = useState(LAYER_MASK_BRUSH_RADIUS_DEFAULT);
  const [layerMaskHardness, setLayerMaskHardness] = useState(LAYER_MASK_BRUSH_HARDNESS_DEFAULT);
  const [layerMaskStrength, setLayerMaskStrength] = useState(LAYER_MASK_BRUSH_STRENGTH_DEFAULT);
  const [layerMaskBusy, setLayerMaskBusy] = useState(false);
  // 진행 중 드래그 — healCloneDragRef와 동일 패턴(frame은 드래그 시작 스냅샷).
  const layerMaskDragRef = useRef<{ elId: string; frame: SelectionFrame; points: SelPoint[] } | null>(null);
  const layerMaskRafRef = useRef<number | null>(null);
  const pendingLayerMaskDragRef = useRef<{ points: SelPoint[] } | null>(null);
  const [layerMaskDragPreview, setLayerMaskDragPreview] = useState<{ points: SelPoint[] } | null>(null);
  // 브러시 반경 호버 커서 — smudgeCursorRef와 동일 기법(ref 직접 갱신, React 리렌더 없음).
  const layerMaskCursorRef = useRef<Konva.Circle>(null);
  const scheduleLayerMaskDragPreview = (next: { points: SelPoint[] } | null) => {
    pendingLayerMaskDragRef.current = next;
    if (layerMaskRafRef.current !== null) return;
    layerMaskRafRef.current = globalThis.requestAnimationFrame(() => {
      layerMaskRafRef.current = null;
      setLayerMaskDragPreview(pendingLayerMaskDragRef.current);
    });
  };
  const clearLayerMaskDragPreview = () => {
    pendingLayerMaskDragRef.current = null;
    if (layerMaskRafRef.current !== null) {
      globalThis.cancelAnimationFrame(layerMaskRafRef.current);
      layerMaskRafRef.current = null;
    }
    setLayerMaskDragPreview(null);
  };
  useEffect(() => () => {
    if (layerMaskRafRef.current !== null) globalThis.cancelAnimationFrame(layerMaskRafRef.current);
  }, []);
  // 선택 요소가 바뀌면 진행 중 드래그·busy를 해제(모드/브러시 설정은 유지 — heal-clone과 동일 정책).
  useEffect(() => {
    void selectedId;
    layerMaskDragRef.current = null;
    clearLayerMaskDragPreview();
    setLayerMaskBusy(false);
  }, [selectedId]);
  // 선택 요소가 바뀌면 크롭 모드·진행 중 드래그·busy 를 해제한다(크롭 rect 는 이미지 1개 귀속).
  useEffect(() => {
    void selectedId; // "바뀌면 초기화"를 위해 의존성으로 구독.
    cropDragRef.current = null;
    pendingCropRectRef.current = null;
    if (cropRafRef.current !== null) {
      globalThis.cancelAnimationFrame(cropRafRef.current);
      cropRafRef.current = null;
    }
    setCropRect(null);
    setCropBusy(false);
  }, [selectedId]);
  // 색상 휠(롱프레스 팝업 원형 퀵픽) — 10번째 armed 상태. center 는 뷰포트 clientX/clientY
  // 기준(캔버스 정규화 좌표 아님 — StudioColorWheelOverlay 가 fixed 오버레이라서).
  const [colorWheelOpen, setColorWheelOpen] = useState(false);
  const [colorWheelCenter, setColorWheelCenter] = useState<{ x: number; y: number } | null>(null);
  // 롱프레스 판정용 — pointerdown 지점(취소 임계값 비교)과 대기 중인 타이머 id.
  const colorWheelPressRef = useRef<{ x: number; y: number } | null>(null);
  const colorWheelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [userGuides, setUserGuides] = useState<{ id: string; type: "v" | "h"; pos: number }[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  // 내보내기 옵션(배율·포맷·투명 배경) — 다운로드 버튼 옆 팝오버에서 조정.
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  // 배율은 플랫폼 규격(폭 690·800·1440…)에 맞추면 소수가 될 수 있어 number로 둔다.
  const [exportScale, setExportScale] = useState<number>(2);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportTransparent, setExportTransparent] = useState(false);
  // 선택한 플랫폼 내보내기 규격(없으면 null = 자유 배율).
  const [exportPresetId, setExportPresetId] = useState<string | null>(null);
  // 내보내기 워터마크/서명 — 세션 넘어 유지되게 localStorage에 저장.
  const [watermark, setWatermarkState] = useState<WatermarkSettings>(DEFAULT_WATERMARK);
  const watermarkLoadedRef = useRef(false);
  const ensureWatermarkLoaded = () => {
    if (watermarkLoadedRef.current) return watermark;
    watermarkLoadedRef.current = true;
    try {
      const raw = globalThis.localStorage.getItem(WATERMARK_KEY);
      const next = raw ? normalizeWatermark(JSON.parse(raw)) : DEFAULT_WATERMARK;
      setWatermarkState(next);
      return next;
    } catch {
      // 접근/파싱 불가면 기본값 유지.
      return watermark;
    }
  };
  const setWatermark = (next: WatermarkSettings) => {
    watermarkLoadedRef.current = true;
    setWatermarkState(next);
    try {
      globalThis.localStorage.setItem(WATERMARK_KEY, JSON.stringify(next));
    } catch {
      // 저장 불가(시크릿/임베드)는 무시 — 이번 세션엔 적용됨.
    }
  };
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 내보내기 옵션 팝오버 바깥 클릭시 닫기
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    globalThis.addEventListener("pointerdown", handlePointerDown);
    return () => globalThis.removeEventListener("pointerdown", handlePointerDown);
  }, [exportMenuOpen]);

  // QuickShape 정지-감지 인터벌 — 언마운트 시(다른 페이지 이동 등) 타이머 잔존 방지.
  useEffect(() => {
    return () => {
      if (quickShapeTimerRef.current !== null) globalThis.clearInterval(quickShapeTimerRef.current);
    };
  }, []);

  // 툴바 드롭다운(템플릿·배경 씬·말풍선·효과·내 에셋) 바깥 클릭시 닫기.
  // ref는 열린 메뉴의 래퍼(트리거+드롭다운)에만 붙는다 — 한 번에 하나만 열리므로 ref 하나로 충분.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    globalThis.addEventListener("pointerdown", handlePointerDown);
    return () => globalThis.removeEventListener("pointerdown", handlePointerDown);
  }, [menu]);

  const selected = selectedId ? (elementById.get(selectedId) ?? null) : null;
  // 픽셀 선택 도구가 실제로 무장된 상태(이미지 요소 선택 + 도구 on).
  // 무장 중엔 캔버스 드래그를 픽셀 선택으로 가로채므로 요소 드래그/클릭 선택 전환을 함께 잠근다.
  const pixelToolArmed = pixelTool !== null && selected?.type === "image";
  // 마칭앤츠 오버레이용 프레임/선택 — 이미지 요소가 아닐 땐 null(오버레이 미마운트).
  const pixelOverlayFrame: SelectionFrame | null =
    selected?.type === "image"
      ? { x: selected.x, y: selected.y, width: selected.width, height: selected.height, rotation: selected.rotation }
      : null;
  const pixelOverlaySel = pixelSel && (pixelSel.subpaths.length > 0 || pixelSel.invert) ? pixelSel : null;
  // 크롭 모드 무장(이미지 요소 선택 + 크롭 rect 존재) — 무장 중엔 스테이지 드래그를 크롭 rect
  // 조작으로 가로채고, 요소 드래그/클릭 선택 전환을 함께 잠근다(픽셀 선택 도구와 동일 정책).
  const cropArmed = cropRect !== null && selected?.type === "image";
  // 패널 손그림 컷 무장(패널 선택 + 도구 on, 잠긴 패널은 제외) — 크롭·픽셀 선택과 동일한 정책.
  const panelSplitArmed = panelSplitActive && selected?.type === "frame" && !selected.locked;
  // 벡터 노드 편집 무장(자유선 요소 선택 + 도구 on) — crop/pixel-select 와 동일한 정책.
  const nodeEditArmed = nodeEditTool !== null && selected?.type === "draw" && isNodeEditableKind(selected.kind);
  const nodeEditHandles: NodeEditHandle[] =
    nodeEditArmed && selected?.type === "draw"
      ? decimateStrokeHandles(nodeEditDraft?.elId === selected.id ? nodeEditDraft.points : selected.points, {
          minSpacingPx: NODE_EDIT_DEFAULT_MIN_SPACING_PX / effScale,
          maxHandles: NODE_EDIT_DEFAULT_MAX_HANDLES,
        })
      : [];
  const smudgeArmed = smudgeActive && selected?.type === "image";
  const healCloneArmed = healCloneTool !== null && selected?.type === "image";
  const layerMaskPaintArmed = layerMaskPaintActive && selected?.type === "image";
  const contextMenuEl = contextMenu.elId ? (elementById.get(contextMenu.elId) ?? null) : null;
  const showQuickStart = !menu && (quickStartOpen || (workHydrated && elements.length === 0 && !quickStartDismissed));

  // 삭제된 요소의 노드 참조가 nodeRefs에 남지 않도록 정리(누수 방지).
  useEffect(() => {
    const ids = new Set(elements.map((e) => e.id));
    for (const id of Object.keys(nodeRefs.current)) {
      if (!ids.has(id)) delete nodeRefs.current[id];
    }
  }, [elements]);

  // 내보내기·게시 캡처가 시작되면 마스터 편집 모드를 자동 종료한다 — 캡처 화면은 항상
  // "페이지 요소 + 마스터 합성"이어야 하고, 마스터 편집 화면(고스트 포함)이 찍히면 안 된다.
  useEffect(() => {
    if (isExporting) setMasterEditMode(false);
  }, [isExporting]);

  // 기존 작품 로드 또는 리믹스 대상 로드.
  useEffect(() => {
    const targetId = workId || remixId;
    if (!targetId) {
      setWorkHydrated(true);
      return;
    }
    setWorkHydrated(false);
    let alive = true;
    import("@/src/infrastructure/creator-client")
      .then(({ getWork }) => getWork(targetId))
      .then((w) => {
        if (!alive) return;
        // 리믹스는 새 작품으로 저장되는 별개 문서라 원본의 컷별 연출(fx) 설정을 승계하지 않는다.
        if (!remixId) setLoadedWork(w);
        if (remixId) {
          setTitle(w.title + " (리믹스)");
          setDescription(
            `이 작품은 ${w.author.name} 작가님의 '${w.title}' 작품을 리믹스(이어서 편집)한 작품입니다.\n\n${w.description}`
          );
          const rawTags = w.tags ?? [];
          const combinedTags = rawTags.includes("리믹스") ? rawTags : [...rawTags, "리믹스"];
          setTagsText(combinedTags.join(", "));
        } else {
          setTitle(w.title);
          setDescription(w.description);
          setTagsText((w.tags ?? []).join(", "));
        }
        const doc = w.doc as {
          elements?: El[];
          bg?: string;
          bgGrad?: string[] | null;
          height?: number;
          webtoonTheme?: "classic" | "soft" | "vivid";
          pagesList?: PageState[];
          currentPageId?: string;
          panelGutter?: number;
          master?: unknown; // 문서 마스터(공통 요소) — studio-master-page 옵셔널 규약(과거 문서 미존재 허용).
        };
        if (doc?.pagesList && doc.pagesList.length > 0) {
          setPagesHistory([doc.pagesList]);
          setPagesHi(0);
          setCurrentPageId(doc.currentPageId || doc.pagesList[0].id);
        } else {
          const legacyPage: PageState = {
            id: uid(),
            elements: doc?.elements || [],
            bg: doc?.bg || "#ffffff",
            bgGrad: doc?.bgGrad || null,
            canvasH: doc?.height || 1080,
          };
          setPagesHistory([[legacyPage]]);
          setPagesHi(0);
          setCurrentPageId(legacyPage.id);
        }
        // 문서 마스터(공통 요소) — 과거 문서(master 미존재)는 빈 마스터로(하위호환). 리믹스도 마스터를 승계한다.
        setMaster(normalizeDocumentMaster(doc?.master) as DocumentMaster<El>);
        if (doc?.webtoonTheme) setWebtoonTheme(doc.webtoonTheme);
        if (doc?.panelGutter) setPanelGutter(doc.panelGutter);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => {
        if (alive) setWorkHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [workId, remixId]);

  // 시리즈·챌린지 딥링크로 들어온 경우 게시 맥락 배너를 채운다.
  useEffect(() => {
    if (!linkedSeriesId && !linkedChallengeId) {
      setPublishContext({});
      return;
    }
    let alive = true;
    const controller = new AbortController();
    async function loadPublishContext() {
      const next: PublishContext = {};
      if (linkedSeriesId) {
        try {
          const { getSeries } = await import("@/src/infrastructure/creator-client");
          const series = await getSeries(linkedSeriesId, controller.signal);
          if (!alive) return;
          const maxEpisode = series.episodeList.reduce(
            (max, episode) => Math.max(max, episode.episodeNo ?? 0),
            0
          );
          next.series = {
            id: series.id,
            title: series.title,
            nextEpisodeNo: maxEpisode + 1,
          };
        } catch {
          // 맥락 로드 실패 시 배너만 생략.
        }
      }
      if (linkedChallengeId) {
        try {
          const { getChallenge } = await import("@/src/infrastructure/creator-client");
          const challenge = await getChallenge(linkedChallengeId, controller.signal);
          if (!alive) return;
          next.challenge = {
            id: challenge.id,
            title: challenge.title,
            theme: challenge.theme,
          };
        } catch {
          // 맥락 로드 실패 시 배너만 생략.
        }
      }
      if (alive) setPublishContext(next);
    }
    void loadPublishContext();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [linkedSeriesId, linkedChallengeId]);

  useEffect(() => {
    studioOptionalAssetsMountedRef.current = true;
    return () => {
      studioOptionalAssetsMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (menu !== "template") return;
    if (panelLayoutPresets.length > 0 || panelLayoutsLoadRef.current) return;

    setPanelLayoutsLoading(true);
    setPanelLayoutsError(null);
    panelLayoutsLoadRef.current = import("./studio-panel-layouts")
      .then((mod) => {
        if (!studioOptionalAssetsMountedRef.current) return;
        setPanelLayoutPresets(mod.PANEL_LAYOUTS);
      })
      .catch((err) => {
        console.error("Failed to load studio panel layouts:", err);
        panelLayoutsLoadRef.current = null;
        if (studioOptionalAssetsMountedRef.current) {
          setPanelLayoutsError("컷 레이아웃을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (studioOptionalAssetsMountedRef.current) {
          setPanelLayoutsLoading(false);
        }
      });
  }, [menu, panelLayoutPresets.length]);

  useEffect(() => {
    if (menu !== "scene") return;
    if (sceneTemplatePacks || sceneTemplatesLoadRef.current) return;

    setSceneTemplatesLoading(true);
    setSceneTemplatesError(null);
    sceneTemplatesLoadRef.current = import("./studio-scene-templates")
      .then((mod) => {
        if (!studioOptionalAssetsMountedRef.current) return;
        setSceneTemplatePacks({
          categories: mod.SCENE_TEMPLATE_CATEGORIES,
          templates: mod.SCENE_TEMPLATES,
        });
      })
      .catch((err) => {
        console.error("Failed to load studio scene templates:", err);
        sceneTemplatesLoadRef.current = null;
        if (studioOptionalAssetsMountedRef.current) {
          setSceneTemplatesError("장면 템플릿을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (studioOptionalAssetsMountedRef.current) {
          setSceneTemplatesLoading(false);
        }
      });
  }, [menu, sceneTemplatePacks]);

  useEffect(() => {
    if (menu !== "sticker") return;
    if (sfxPacks || sfxLoadRef.current) return;

    setSfxLoading(true);
    setSfxError(null);
    sfxLoadRef.current = import("./studio-sfx-presets")
      .then((mod) => {
        if (!studioOptionalAssetsMountedRef.current) return;
        setSfxPacks({
          categories: mod.SFX_CATEGORIES,
          presets: mod.SFX_LIBRARY,
        });
      })
      .catch((err) => {
        console.error("Failed to load studio SFX presets:", err);
        sfxLoadRef.current = null;
        if (studioOptionalAssetsMountedRef.current) {
          setSfxError("효과음 프리셋을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (studioOptionalAssetsMountedRef.current) {
          setSfxLoading(false);
        }
      });
  }, [menu, sfxPacks]);

  useEffect(() => {
    if (menu !== "bgScene") return;
    if (studioBgSceneAssetsLoaded || bgSceneAssetsLoadRef.current) return;

    setStudioBgSceneAssetsLoading(true);
    setStudioBgSceneAssetsError(null);
    bgSceneAssetsLoadRef.current = Promise.all([
      import("./studio-bg-scenes"),
      import("./studio-bg-scenes-extra"),
    ])
      .then(([bgScenes, bgScenesExtra]) => {
        if (!studioOptionalAssetsMountedRef.current) return;
        const allScenes = [...bgScenes.BG_SCENES, ...bgScenesExtra.BG_SCENES_EXTRA];
        setStudioOptionalAssets((prev) => ({
          ...prev,
          bgSceneSections: bgScenes.bgSceneSections(allScenes),
          bgSceneGenreGroups: bgScenes.groupBgScenes(allScenes),
        }));
        setStudioBgSceneAssetsLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load studio background scenes:", err);
        bgSceneAssetsLoadRef.current = null;
        if (studioOptionalAssetsMountedRef.current) {
          setStudioBgSceneAssetsError("배경 씬을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (studioOptionalAssetsMountedRef.current) {
          setStudioBgSceneAssetsLoading(false);
        }
      });
  }, [menu, studioBgSceneAssetsLoaded]);

  useEffect(() => {
    if (menu !== "sticker") return;
    if (studioStickerAssetsLoaded || stickerAssetsLoadRef.current) return;

    setStudioStickerAssetsLoading(true);
    setStudioStickerAssetsError(null);
    stickerAssetsLoadRef.current = Promise.all([
      import("./studio-fx-assets"),
      import("./studio-creature-stickers"),
      import("./studio-prop-stickers"),
    ])
      .then(([fxAssets, creatureAssets, propAssets]) => {
        if (!studioOptionalAssetsMountedRef.current) return;
        setStudioOptionalAssets((prev) => ({
          ...prev,
          comicVectorStickers: fxAssets.COMIC_VECTOR_STICKERS,
          creatureStickers: creatureAssets.CREATURE_STICKERS,
          propStickers: propAssets.PROP_STICKERS,
          fxOverlays: fxAssets.FX_OVERLAYS,
        }));
        setStudioStickerAssetsLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load studio sticker assets:", err);
        stickerAssetsLoadRef.current = null;
        if (studioOptionalAssetsMountedRef.current) {
          setStudioStickerAssetsError("스티커 에셋을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (studioOptionalAssetsMountedRef.current) {
          setStudioStickerAssetsLoading(false);
        }
      });
  }, [menu, studioStickerAssetsLoaded]);

  useEffect(() => {
    if (menu !== "emeres") return;
    if (studioEmeresAssetsLoaded || emeresAssetsLoadRef.current) return;

    setStudioEmeresAssetsLoading(true);
    setStudioEmeresAssetsError(null);
    emeresAssetsLoadRef.current = import("./studio-emeres-templates")
      .then((emeres) => {
        if (!studioOptionalAssetsMountedRef.current) return;
        setStudioOptionalAssets((prev) => ({
          ...prev,
          emeresSections: emeres.emeresSections(),
          emeresUnderlayOpacity: emeres.EMERES_DEFAULT_OPACITY,
        }));
        setStudioEmeresAssetsLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load studio emeres templates:", err);
        emeresAssetsLoadRef.current = null;
        if (studioOptionalAssetsMountedRef.current) {
          setStudioEmeresAssetsError("이메레스 틀을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (studioOptionalAssetsMountedRef.current) {
          setStudioEmeresAssetsLoading(false);
        }
      });
  }, [menu, studioEmeresAssetsLoaded]);

  const shouldLoadStudioFonts =
    menu === "bubble" || elements.some((el) => el.type === "text" || el.type === "bubble");

  // 스튜디오 전용 구글폰트 로드 — 텍스트/말풍선을 쓰기 전에는 stylesheet를 주입하지 않는다.
  // 한 번 로드한 뒤에는 id 가드로 중복 주입을 막고 폰트 캐시는 유지한다. Konva 캔버스 텍스트는 DOM과
  // 달리 폰트 스왑을 스스로 감지하지 못하므로, 폰트가 도착하는 시점에 스테이지를 한 번씩 다시 그린다.
  useEffect(() => {
    if (!shouldLoadStudioFonts) return;
    if (!document.getElementById(STUDIO_FONTS_LINK_ID)) {
      const link = document.createElement("link");
      link.id = STUDIO_FONTS_LINK_ID;
      link.rel = "stylesheet";
      link.href = STUDIO_FONTS_CSS2_URL;
      document.head.appendChild(link);
    }
    const redrawStage = () => stageRef.current?.batchDraw();
    let mounted = true;
    // 진행 중이던 로드(전역 폰트 포함)가 정리된 뒤 일회 보정 — 이미 캐시돼 있으면 즉시 실행된다.
    document.fonts.ready.then(() => {
      if (mounted) redrawStage();
    });
    // display=swap 특성상 폰트는 실제 사용 시점(글꼴 패널 노출 등)에 늦게 도착할 수 있다 — 도착할 때마다 보정.
    document.fonts.addEventListener("loadingdone", redrawStage);
    return () => {
      mounted = false;
      document.fonts.removeEventListener("loadingdone", redrawStage);
    };
  }, [shouldLoadStudioFonts]);

  // 커스텀 에셋 라이브러리 목록 불러오기 및 관리
  const loadAssetsList = async () => {
    setAssetsLoading(true);
    try {
      const { listAssets } = await import("./studio-asset-library");
      const list = await listAssets();
      setAssets(list);
    } catch (err) {
      console.error("Failed to load custom assets:", err);
      setAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  };

  useEffect(() => {
    if (menu === "asset") {
      loadAssetsList();
    }
  }, [menu]);

  async function onUploadAsset(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { src, width, height } = await downscaleImageFile(file);
      const { saveAsset } = await import("./studio-asset-library");
      await saveAsset({ name: file.name, dataUrl: src, width, height });
      await loadAssetsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "에셋 업로드 실패");
    } finally {
      e.target.value = "";
    }
  }

  async function onDeleteAsset(id: string) {
    try {
      const { deleteAsset } = await import("./studio-asset-library");
      await deleteAsset(id);
      await loadAssetsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "에셋 삭제 실패");
    }
  }

  // 에셋 라이브러리 고도화 상태 및 함수
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [assetSortOrder, setAssetSortOrder] = useState<StudioAssetSortOrder>("newest");
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renamingAssetName, setRenamingAssetName] = useState("");
  const [assetPrompt, setAssetPrompt] = useState("");
  const [assetPromptName, setAssetPromptName] = useState("");
  const [assetPromptSize, setAssetPromptSize] = useState<GeneratedAssetSize>("1024x1024");
  const [assetPromptQuality, setAssetPromptQuality] = useState<GeneratedAssetQuality>("medium");
  const [assetGenerating, setAssetGenerating] = useState(false);
  // 생성형 AI 최초 사용 고지 모달(정책 필수). 미확인 상태에서 '생성'을 누르면 먼저 띄운다.
  const [aiNoticeOpen, setAiNoticeOpen] = useState(false);

  async function handleRenameAsset(id: string) {
    if (!renamingAssetName.trim()) return;
    try {
      const { renameAsset } = await import("./studio-asset-library");
      await renameAsset(id, renamingAssetName);
      setRenamingAssetId(null);
      await loadAssetsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "에셋 이름 변경 실패");
    }
  }

  async function onGenerateAsset() {
    const prompt = assetPrompt.trim();
    if (!prompt || assetGenerating) return;
    if (!studioAuthUserId) {
      setError("AI 에셋을 생성하려면 로그인이 필요해요.");
      return;
    }
    // 생성형 AI 최초 사용 고지(정책 필수) — 아직 확인 전이면 먼저 안내 모달을 띄우고 생성은 보류한다.
    if (!readAiNoticeAck()) {
      setAiNoticeOpen(true);
      return;
    }
    setAssetGenerating(true);
    setError(null);
    try {
      const [{ generateAsset }, { saveAsset }] = await Promise.all([
        import("@/src/infrastructure/creator-client"),
        import("./studio-asset-library"),
      ]);
      const generated = await generateAsset({
        prompt,
        name: assetPromptName.trim() || undefined,
        size: assetPromptSize,
        quality: assetPromptQuality,
      });
      const saved = await saveAsset({
        // 결과물이 생성형 AI 산출물임을 라이브러리에서도 식별할 수 있게 kind 로 표시(라벨/배지용).
        name: generated.name,
        dataUrl: generated.dataUrl,
        width: generated.width,
        height: generated.height,
        kind: "ai",
      });
      setAssetPrompt("");
      setAssetPromptName("");
      await loadAssetsList();
      addRenderedImage(saved.dataUrl, saved.width, saved.height);
      setMenu(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 에셋 생성 실패");
    } finally {
      setAssetGenerating(false);
    }
  }

  // 사용자가 최초 사용 고지를 확인하면 저장하고, 곧바로 생성을 이어서 실행한다.
  function acknowledgeAiNotice() {
    storeAiNoticeAck();
    setAiNoticeOpen(false);
    void onGenerateAsset();
  }

  // 효과·배경 씬 피커 검색/카테고리 점프 상태 (React Compiler가 파생값을 자동 메모이즈)
  const [fxSearchQuery, setFxSearchQuery] = useState("");
  const [fxPickerSection, setFxPickerSection] = useState<FxPickerSection>("all");
  const [toneSearchQuery, setToneSearchQuery] = useState("");
  const [bgSceneSearchQuery, setBgSceneSearchQuery] = useState("");
  const [bgSceneGenreFilter, setBgSceneGenreFilter] = useState("all");

  const fxMenuOpen = menu === "sticker";
  const bgSceneMenuOpen = menu === "bgScene";
  const emeresMenuOpen = menu === "emeres";
  const fxQuery = fxMenuOpen ? fxSearchQuery.trim().toLowerCase() : "";
  const fxSectionVisible = (section: Exclude<FxPickerSection, "all">) =>
    fxPickerSection === "all" || fxPickerSection === section;
  const fxSfxFiltered = fxMenuOpen ? filterSfxPresets(studioSfx.presets, fxSearchQuery) : EMPTY_STUDIO_SFX_PACKS.presets;
  const fxEmojisFiltered = fxMenuOpen && !fxQuery ? EFFECT_EMOJIS : EMPTY_EFFECT_EMOJIS; // 이모지는 라벨이 없어 검색 중에는 제외
  const fxComicFiltered = fxMenuOpen
    ? filterAssetsByLabel(studioOptionalAssets.comicVectorStickers, fxSearchQuery)
    : EMPTY_STUDIO_OPTIONAL_ASSETS.comicVectorStickers;
  const fxCreatureFiltered = fxMenuOpen
    ? filterAssetsByLabel(studioOptionalAssets.creatureStickers, fxSearchQuery)
    : EMPTY_STUDIO_OPTIONAL_ASSETS.creatureStickers;
  const fxPropFiltered = fxMenuOpen
    ? filterAssetsByLabel(studioOptionalAssets.propStickers, fxSearchQuery)
    : EMPTY_STUDIO_OPTIONAL_ASSETS.propStickers;
  const fxLinePresetsFiltered = fxMenuOpen ? filterAssetsByLabel(FX_LINE_PRESETS, fxSearchQuery) : EMPTY_FX_LINE_PRESETS;
  const fxOverlaysFiltered = fxMenuOpen
    ? filterAssetsByLabel(studioOptionalAssets.fxOverlays, fxSearchQuery)
    : EMPTY_STUDIO_OPTIONAL_ASSETS.fxOverlays;
  const fxPickerHasResults = fxMenuOpen && (
    (fxSectionVisible("sfx") && fxSfxFiltered.length > 0) ||
    (fxSectionVisible("emoji") && fxEmojisFiltered.length > 0) ||
    (fxSectionVisible("comic") && fxComicFiltered.length > 0) ||
    (fxSectionVisible("creature") && fxCreatureFiltered.length > 0) ||
    (fxSectionVisible("prop") && fxPropFiltered.length > 0) ||
    (fxSectionVisible("lines") && fxLinePresetsFiltered.length > 0) ||
    (fxSectionVisible("overlay") && fxOverlaysFiltered.length > 0)
  );

  const bgSceneSectionsFiltered = bgSceneMenuOpen
    ? filterBgSceneSections(
        bgSceneGenreFilter === "all"
          ? studioOptionalAssets.bgSceneSections
          : studioOptionalAssets.bgSceneGenreGroups.filter((group) => group.genre === bgSceneGenreFilter),
        bgSceneSearchQuery
      )
    : EMPTY_STUDIO_OPTIONAL_ASSETS.bgSceneSections;

  // 이메레스(스케치 밑그림) 피커 검색/카테고리 상태
  const [emeresSearchQuery, setEmeresSearchQuery] = useState("");
  const [emeresCategoryFilter, setEmeresCategoryFilter] = useState("all");
  const emeresSectionsFiltered = emeresMenuOpen
    ? studioOptionalAssets.emeresSections
        .filter((section) => emeresCategoryFilter === "all" || section.category === emeresCategoryFilter)
        .map((section) => ({ ...section, templates: filterAssetsByLabel(section.templates, emeresSearchQuery) }))
        .filter((section) => section.templates.length > 0)
    : EMPTY_STUDIO_OPTIONAL_ASSETS.emeresSections;

  // ── 커뮤니티 공유 에셋 ────────────────────────────────────────────────
  const loadSharedAssets = async () => {
    setSharedLoading(true);
    setSharedError(null);
    try {
      const { listSharedAssets } = await import("@/src/infrastructure/creator-client");
      setShared(await listSharedAssets({ limit: 60 }));
    } catch (err) {
      setSharedError(err instanceof Error ? err.message : "공유 에셋을 불러오지 못했어요.");
      setShared([]);
    } finally {
      setSharedLoading(false);
    }
  };

  useEffect(() => {
    if (menu === "asset" && assetTab === "community") loadSharedAssets();
  }, [menu, assetTab]);

  // 내 로컬 에셋을 커뮤니티에 공유(로그인 필요)
  async function onShareAsset(asset: StudioAsset) {
    if (!studioAuthUserId) {
      setError("에셋을 공유하려면 로그인이 필요해요.");
      return;
    }
    setPublishingId(asset.id);
    try {
      const { publishAsset } = await import("@/src/infrastructure/creator-client");
      await publishAsset({ name: asset.name, dataUrl: asset.dataUrl, width: asset.width, height: asset.height });
      setAssetTab("community");
      await loadSharedAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "에셋을 공유하지 못했어요.");
    } finally {
      setPublishingId(null);
    }
  }

  // 커뮤니티 에셋을 캔버스에 삽입(다운로드 카운트 증가)
  function onUseSharedAsset(asset: SharedAsset) {
    addRenderedImage(asset.dataUrl, asset.width, asset.height);
    void import("@/src/infrastructure/creator-client").then(({ markSharedAssetUsed }) => markSharedAssetUsed(asset.id));
    setMenu(null);
  }

  async function onDeleteSharedAsset(id: string) {
    try {
      const { deleteSharedAsset } = await import("@/src/infrastructure/creator-client");
      await deleteSharedAsset(id);
      await loadSharedAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공유 에셋을 삭제하지 못했어요.");
    }
  }

  // 트랜스포머를 선택 노드(또는 마퀴 다중선택 노드들)에 부착.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const lookup = new Map<string, El>();
    for (const element of elements) lookup.set(element.id, element);
    if (tool !== "select") {
      tr.nodes([]);
    } else if (marqueeIds.length > 0) {
      const nodes = marqueeIds
        .filter((id) => !lookup.get(id)?.locked)
        .map((id) => nodeRefs.current[id])
        .filter((n): n is Konva.Node => !!n);
      tr.nodes(nodes);
    } else {
      const selLocked = selectedId ? lookup.get(selectedId)?.locked : false;
      const node = selectedId && !selLocked ? nodeRefs.current[selectedId] : null;
      tr.nodes(node ? [node] : []);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, marqueeIds, tool, elements]);

  // 요소 변경을 히스토리에 커밋. (마스터 편집 모드에서는 문서 마스터로 커밋 — 히스토리 미포함, 패널에서 고지)
  // extraPatch — 레이어 삭제 시 elements 와 animTimeline(트랙 정리)을 원자적(단일 undo 스텝)으로
  // 함께 커밋하기 위한 옵셔널 2번째 파라미터(하위호환 — 기존 15곳 이상의 commit(nextElements)
  // 단일 인자 호출은 전부 그대로 동작한다). extraPatch 스프레드 뒤에 elements 를 마지막에 둬서
  // extraPatch 에 실수로 elements 가 섞여도 항상 nextElements 가 이긴다.
  function commit(nextElements: El[], extraPatch?: Partial<Omit<PageState, "id" | "elements">>) {
    const resolved = applyBubbleAnchors(nextElements);
    if (masterEditMode) {
      setMaster((m) => withMasterElements(m, resolved)); // extraPatch는 마스터엔 개념 없음 — 무시
      return;
    }
    coalesceKeyRef.current = null; // 일반 커밋은 합치기 체인을 끊는다.
    const nextPages = pages.map((p) => (p.id === activePage.id ? { ...p, ...extraPatch, elements: resolved } : p));
    const h = pagesHistory.slice(0, pagesHi + 1);
    h.push(nextPages);
    setPagesHistory(h);
    setPagesHi(h.length - 1);
  }
  // 같은 key의 연속 동작이면 새 히스토리 항목 대신 최상단을 교체(undo 1회로 합침).
  function commitCoalesced(nextElements: El[], key: string) {
    const resolved = applyBubbleAnchors(nextElements);
    if (masterEditMode) {
      // 마스터 편집은 히스토리 밖이라 합치기(coalesce) 개념이 없다 — 마스터로 바로 커밋.
      setMaster((m) => withMasterElements(m, resolved));
      return;
    }
    const nextPages = pages.map((p) => (p.id === activePage.id ? { ...p, elements: resolved } : p));
    if (coalesceKeyRef.current === key && pagesHi === pagesHistory.length - 1) {
      setPagesHistory((h) => {
        const c = h.slice();
        c[pagesHi] = nextPages;
        return c;
      });
    } else {
      const h = pagesHistory.slice(0, pagesHi + 1);
      h.push(nextPages);
      setPagesHistory(h);
      setPagesHi(h.length - 1);
      coalesceKeyRef.current = key;
    }
  }
  // 전체 페이지 상태를 직접 커밋하는 헬퍼 (페이지 추가/삭제/이동용)
  function commitPages(nextPages: PageState[]) {
    coalesceKeyRef.current = null;
    const h = pagesHistory.slice(0, pagesHi + 1);
    h.push(nextPages);
    setPagesHistory(h);
    setPagesHi(h.length - 1);
  }
  function patchEl(id: string, patch: Partial<El>) {
    commit(elements.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)));
  }
  // 매직 리사이즈 — 프리셋을 누르면 폭(CANVAS_W)은 그대로 두고 높이만 목표 비율로 바꾼 뒤,
  // studio-magic-resize로 요소 배열을 재배치한다. commit()의 2번째 인자(extraPatch)로 canvasH를
  // 함께 넘겨 "요소 갱신 + 캔버스 높이 변경"을 단일 undo 스텝으로 원자적 커밋한다(레이어 삭제 시
  // elements+animTimeline을 함께 커밋하는 기존 관례와 동일 패턴).
  function applyMagicResizePreset(preset: MagicResizePreset) {
    if (masterEditMode) return; // 문서 마스터는 페이지별 canvasH 개념이 없어 대상 밖.
    const from = { width: CANVAS_W, height: canvasH };
    const to = presetCanvasSize(preset, CANVAS_W);
    if (to.height === canvasH) return; // 이미 같은 높이 — 빈 undo 스텝을 만들지 않는다.
    const nextElements = computeMagicResize(elements, from, to, magicResizeStrategy);
    commit(nextElements as El[], { canvasH: to.height });
  }
  // 캔버스 제스처를 무장(armed)해 가로채는 도구 11종을 한꺼번에 끈다. 새 도구 하나를 켤 때마다
  // 나머지 10개를 개별적으로 끄는 코드를 매번 대칭으로 맞추는 대신 이 함수 하나만 먼저 호출하면
  // 된다 — 개별 상호배제 누락이 이 세션에서 실제 버그로 여러 번 재발했다(예: eyedropper/
  // bubbleAnchorPick/quickShape 토글이 다른 armed 도구를 안 껐고, pixelTool도 crop을 안 껐음).
  function disarmAllPixelTools() {
    setCropRect(null);
    setPixelTool(null);
    setPanelSplitActive(false);
    setNodeEditTool(null);
    setSmudgeActive(false);
    setHealCloneTool(null);
    setEyedropperActive(false);
    setBubbleAnchorPickActive(false);
    setQuickShapeActive(false);
    setColorWheelOpen(false);
    setLayerMaskPaintActive(false);
  }
  // pointerdown/pointermove 이벤트(마우스/터치 유니언)에서 뷰포트 기준 client 좌표를 뽑는다.
  // Stage 이벤트는 마우스/터치 둘 다 이 유니언 타입으로 온다.
  function getClientPointFromKonvaEvent(evt: MouseEvent | TouchEvent): { x: number; y: number } | null {
    if ("clientX" in evt) return { x: evt.clientX, y: evt.clientY };
    const touch = evt.touches[0] ?? evt.changedTouches[0];
    return touch ? { x: touch.clientX, y: touch.clientY } : null;
  }
  // 색상 휠 열기 — 롱프레스 타이머가 실제로 발화했을 때만 onStageDown 이 호출한다. 이 시점까지
  // 다른 제스처가 조금이라도 진행됐을 수 있으니(예: 마퀴 시작 좌표) 되돌린다.
  function openColorWheelAt(clientX: number, clientY: number) {
    disarmAllPixelTools();
    ensureRecentColorsLoaded();
    marqueeStartRef.current = null;
    clearMarqueePreview();
    const vw = typeof window === "undefined" ? clientX : window.innerWidth;
    const vh = typeof window === "undefined" ? clientY : window.innerHeight;
    setColorWheelCenter(clampWheelCenter(clientX, clientY, vw, vh));
    setColorWheelOpen(true);
  }
  function toggleBubbleAnchorPick() {
    setBubbleAnchorPickActive((v) => {
      const next = !v;
      if (next) {
        disarmAllPixelTools();
        return true;
      }
      return false;
    });
  }
  function detachBubbleAnchor() {
    if (!selected || selected.type !== "bubble") return;
    setBubbleAnchorPickActive(false);
    patchEl(selected.id, { tailAnchorId: undefined, tailAnchorPoint: undefined } as Partial<El>);
  }
  // 원근자 — 소실점은 undo/redo(commit) 대상이 아니다(가이드 도구 상태, 그리기 결과물이 아님).
  function addVanishingPointHandler() {
    setVanishingPoints((prev) => {
      const pos = defaultVanishingPointPosition(prev, CANVAS_W, canvasH);
      return addVanishingPoint(prev, { id: uid(), x: pos.x, y: pos.y });
    });
  }
  function removeVanishingPointHandler(id: string) {
    setVanishingPoints((prev) => removeVanishingPoint(prev, id));
  }
  function moveVanishingPointById(id: string, x: number, y: number) {
    setVanishingPoints((prev) => moveVanishingPoint(prev, id, x, y));
  }
  // 아이소메트릭 그리드 — 원근자와 마찬가지로 undo/redo 대상 아님(가이드 도구 상태).
  // 원근자와 동시에 켜지면 펜/직선 스냅이 어느 쪽을 따를지 모호해지므로 상호 배타적으로 만든다
  // (한쪽을 켜면 다른 쪽을 끈다).
  function toggleIsometricGridActive() {
    setIsometricGridActive((v) => {
      const next = !v;
      if (next) setPerspectiveRulerActive(false);
      return next;
    });
  }
  function setIsometricAngleDegClamped(next: number) {
    setIsometricAngleDeg(clampIsometricAngleDeg(next));
  }
  function setIsometricCellSizeClamped(next: number) {
    setIsometricCellSize(clampIsometricCellSize(next));
  }
  function resetIsometricOrigin() {
    const origin = defaultIsometricOrigin(CANVAS_W, canvasH);
    setIsometricOriginX(origin.x);
    setIsometricOriginY(origin.y);
  }

  // patchEl과 동일하지만 commitCoalesced를 써서 연속 호출을 undo 1스텝으로 합친다(프레임 탐색 전용).
  function patchElCoalesced(id: string, patch: Partial<El>, key: string) {
    commitCoalesced(elements.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)), key);
  }
  // 브랜드 킷 — 제목/본문 글꼴을 현재 선택된 텍스트/말풍선 요소에 적용.
  // selected가 없거나 text/bubble이 아니면 아무 것도 하지 않는다(패널의 canApplyFont로 사전 방지되지만 방어적으로 재확인).
  function applyBrandKitFont(font: string) {
    if (!selected || (selected.type !== "text" && selected.type !== "bubble")) return;
    patchEl(selected.id, { font } as Partial<El>);
  }
  // 브랜드 킷 — 로고를 문서 마스터에 적용(추가 또는 같은 자리 교체).
  // BRAND_KIT_LOGO_MASTER_ID 고정 id로 기존 브랜드 킷 로고 요소를 찾아 위치·크기를 그대로
  // 재사용하고(사용자가 마스터 편집 모드에서 옮겨둔 걸 존중), 없으면 placeBrandKitLogo로
  // 우하단에 새로 배치한다. locked/noClip은 여기서 설정하지 않는다 — composeMasterRenderElements가
  // 페이지 렌더 시에만 강제하며, 여기서 미리 잠그면 마스터 편집 모드에서 이 요소를 옮길 수 없게 된다.
  function applyBrandKitLogo(kit: BrandKit) {
    if (!kit.logo) return;
    const existing = master.elements.find((e) => e.id === BRAND_KIT_LOGO_MASTER_ID);
    const box =
      existing && existing.type === "image"
        ? { x: existing.x, y: existing.y, width: existing.width, height: existing.height, rotation: existing.rotation }
        : placeBrandKitLogo(CANVAS_W, canvasH, kit.logo.width, kit.logo.height);
    const logoEl: El = { id: BRAND_KIT_LOGO_MASTER_ID, type: "image", src: kit.logo.dataUrl, ...box };
    setMaster(withMasterElements(master, [...master.elements.filter((e) => e.id !== BRAND_KIT_LOGO_MASTER_ID), logoEl]));
  }
  // 현재 캔버스 내용을 elId 이미지 요소의 새 프레임으로 캡처.
  async function captureAnimFrame(elId: string) {
    const el = elementById.get(elId);
    if (!el || el.type !== "image") return;
    if (el.rotation) {
      setError("회전이 0°인 셀만 프레임을 캡처할 수 있어요.");
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    setSelectedId(null); // Transformer 핸들 캡처 방지(handleSave와 동일 관행)
    await new Promise((r) => setTimeout(r, 60)); // 재렌더 대기(handleSave와 동일 관행)
    const src = stage.toDataURL({ x: el.x, y: el.y, width: el.width, height: el.height, pixelRatio: 2 / effScale });
    const newFrameId = uid();
    // 마지막 캡처 이후 새로 추가된 "draw" 타입 요소 중 캡처 bbox와 겹치는 것만 스트로크로 간주해
    // 소거한다(텍스트/말풍선/스티커 등 다른 새 요소는 건드리지 않는다 — flatten은 펜 스크래치만 소비).
    const bbox = { x: el.x, y: el.y, w: el.width, h: el.height };
    const overlaps = (b: { x: number; y: number; w: number; h: number }) =>
      b.x < bbox.x + bbox.w && b.x + b.w > bbox.x && b.y < bbox.y + bbox.h && b.y + b.h > bbox.y;
    const newStrokeIds = new Set(
      elements
        .filter((e) => e.type === "draw" && !capturedElementIdsRef.current.has(e.id) && overlaps(elBounds(e)))
        .map((e) => e.id)
    );
    const kept = elements.filter((e) => !newStrokeIds.has(e.id));
    const next = kept.map((e) =>
      e.id === elId
        ? ({
            ...e,
            frames: insertFrame((e as ImageEl).frames ?? [], { id: newFrameId, src }, (e as ImageEl).activeFrameId ?? null),
            activeFrameId: newFrameId,
            src,
          } as El)
        : e
    );
    commit(next);
    capturedElementIdsRef.current = new Set(next.map((e) => e.id));
  }
  // 다중 레이어 타임라인 키프레임 캡처 — captureAnimFrame과 거의 동일하되, 겹치는 draw 스트로크
  // "소거" 로직은 의도적으로 생략한다(어떤 draw 스트로크가 이 특정 트랙 소속인지 다중 트랙에서는
  // 불명확 — 잘못 지우면 다른 레이어용 낙서를 날릴 위험). 순수하게 그 순간 그 bbox 스냅샷만 찍는다.
  async function captureTimelineKeyframe(trackId: string, frameIndex: number) {
    const el = elementById.get(trackId);
    if (!el || el.type !== "image") return; // 패널이 이미 막지만 방어적으로 재확인
    if (el.rotation) {
      setError("회전이 0°인 레이어만 키프레임을 캡처할 수 있어요.");
      return;
    }
    const stage = stageRef.current;
    if (!stage) return;
    setSelectedId(null); // Transformer 핸들 캡처 방지(captureAnimFrame과 동일 관행)
    await new Promise((r) => setTimeout(r, 60)); // 재렌더 대기(동일 관행)
    const b = elBounds(el);
    const src = stage.toDataURL({ x: b.x, y: b.y, width: b.w, height: b.h, pixelRatio: 2 / effScale });
    updateActivePage({ animTimeline: setKeyframe(animTimeline, trackId, frameIndex, { id: uid(), src }) });
  }
  function addEl(el: El) {
    commit([...elements, el]);
    setSelectedId(el.id);
    setTool("select");
  }
  // ── 레이어 그룹(폴더) ─────────────────────────────────────────────────────
  // 그룹 목록·요소 groupId를 한 번에 커밋(원자적). seedElId가 있으면 새 그룹에 그 요소를 넣는다.
  function addLayerGroup(seedElId?: string) {
    const g = createLayerGroup(uid(), `그룹 ${groups.length + 1}`);
    const nextElements = seedElId ? (setItemGroup(elements, seedElId, g.id) as El[]) : elements;
    updateActivePage({ groups: [...groups, g], elements: nextElements });
  }
  function groupSelectedElements() {
    if (marqueeIds.length < 2) return;
    const groupId = uid();
    const g = createLayerGroup(groupId, `그룹 ${groups.length + 1}`);
    const nextElements = elements.map((el) => {
      if (marqueeIds.includes(el.id)) {
        return { ...el, groupId } as El;
      }
      return el;
    });
    updateActivePage({ groups: [...groups, g], elements: nextElements });
    setSelectedId(null);
    setMarqueeIds([]);
  }
  function renameLayerGroup(groupId: string, name: string) {
    updateActivePage({ groups: groups.map((g) => (g.id === groupId ? { ...g, name } : g)) });
  }
  function toggleGroupFlag(groupId: string, flag: "hidden" | "locked" | "collapsed") {
    updateActivePage({ groups: groups.map((g) => (g.id === groupId ? { ...g, [flag]: !g[flag] } : g)) });
  }
  // 그룹 해제: 멤버 groupId 제거 + 그룹 자체 삭제(요소는 보존).
  function deleteLayerGroup(groupId: string) {
    updateActivePage({
      elements: ungroupItems(elements, groupId) as El[],
      groups: groups.filter((g) => g.id !== groupId),
    });
  }
  // 요소를 그룹에 넣기/빼기(연속성 유지). groupId=undefined면 그룹에서 제거.
  function assignElementToGroup(elId: string, groupId: string | undefined) {
    updateActivePage({ elements: setItemGroup(elements, elId, groupId) as El[] });
  }
  // 레이어 패널 한 행(요소). dimmed=소속 그룹이 숨김/잠금이라 흐리게.
  const layerRow = (el: El, dimmed: boolean) => {
    const i = elements.indexOf(el);
    return (
      <li
        key={el.id}
        className={cn(
          "flex items-center gap-1 rounded-lg border px-1.5 py-1",
          el.id === selectedId ? "border-accent/60 bg-accent-soft/40" : "border-line",
          dimmed && "opacity-50"
        )}
      >
        <button
          type="button"
          onClick={() => {
            setTool("select");
            setSelectedId(el.id);
          }}
          onDoubleClick={() => {
            const newName = globalThis.prompt("레이어 이름 변경", el.name || elementLabel(el));
            if (newName !== null) {
              patchEl(el.id, { name: newName.trim() } as Partial<El>);
            }
          }}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-xs select-none",
            el.hidden ? "text-fg-3/50 line-through" : el.locked ? "text-fg-3" : "text-fg-2"
          )}
          title={el.locked ? `${elementLabel(el)} (잠김) · 더블클릭하여 이름 변경` : `${elementLabel(el)} · 더블클릭하여 이름 변경`}
        >
          {el.clipBelow ? "⤵ " : ""}
          {canLayerMask(el) && hasLayerMask(el) ? (el.maskEnabled === false ? "▢ " : "▣ ") : ""}
          {elementLabel(el)}
        </button>
        <button
          type="button"
          onClick={() => {
            const willLock = !el.locked;
            patchEl(el.id, { locked: willLock } as Partial<El>);
            if (willLock && selectedId === el.id) setSelectedId(null);
          }}
          className={cn("grid size-6 place-items-center rounded hover:bg-raised", el.locked ? "text-accent" : "text-fg-3")}
          aria-label={el.locked ? "레이어 잠금 해제" : "레이어 잠금"}
          title={el.locked ? "잠금 해제" : "잠금"}
        >
          {el.locked ? <Lock size={13} /> : <LockOpen size={13} />}
        </button>
        {canAlphaLock(el) && (
          <button
            type="button"
            onClick={() => patchEl(el.id, { alphaLocked: !el.alphaLocked } as Partial<El>)}
            className={cn("grid size-6 place-items-center rounded hover:bg-raised", el.alphaLocked ? "text-accent" : "text-fg-3")}
            aria-label={el.alphaLocked ? "알파 락 해제" : "알파 락"}
            title={el.alphaLocked ? "알파 락 해제 — 투명 영역도 다시 칠할 수 있어요" : "알파 락 — 켜면 이 레이어의 불투명한 부분에만 칠해져요"}
          >
            {el.alphaLocked ? <Grid2x2Check size={13} /> : <Grid2x2X size={13} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => patchEl(el.id, { hidden: !el.hidden } as Partial<El>)}
          className="grid size-6 place-items-center rounded text-fg-3 hover:bg-raised"
          aria-label={el.hidden ? "레이어 표시" : "레이어 숨김"}
          title={el.hidden ? "표시" : "숨김"}
        >
          {el.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
        <button
          type="button"
          onClick={() => moveLayer(el.id, "up")}
          disabled={i === elements.length - 1}
          className="grid size-6 place-items-center rounded text-fg-3 hover:bg-raised disabled:opacity-30"
          aria-label="위로"
          title="위로"
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          onClick={() => moveLayer(el.id, "down")}
          disabled={i === 0}
          className="grid size-6 place-items-center rounded text-fg-3 hover:bg-raised disabled:opacity-30"
          aria-label="아래로"
          title="아래로"
        >
          <ChevronDown size={13} />
        </button>
        <button
          type="button"
          onClick={() => removeById(el.id)}
          className="grid size-6 place-items-center rounded text-bad hover:bg-raised"
          aria-label="레이어 삭제"
          title="삭제"
        >
          <Trash2 size={13} />
        </button>
      </li>
    );
  };

  // ── 페이지 관련 명령 조작 (pure studio-pages로 위임 — 동일 동작 유지 + 고도화) ──────────────────────────────────────────────
  function addPage() {
    // thin wrapper over pure shipped command + commit (behavior unchanged)
    const baseH = activePage.canvasH || 1080;
    const { nextPages, newPageId } = appendPageState(pages, uid, baseH);
    commitPages(nextPages);
    setCurrentPageId(newPageId);
  }
  function insertPageBefore(pageId: string) {
    const idx = findPageIndexInPages(pageId);
    if (idx < 0) return;
    const baseH = pages[idx]?.canvasH || 1080;
    const nextPages = insertBlankPageAt(pages, idx, uid, baseH);
    commitPages(nextPages);
    // 새로 삽입된 것을 활성으로
    const inserted = nextPages[idx];
    if (inserted) setCurrentPageId(inserted.id);
  }
  function insertPageAfter(pageId: string) {
    const idx = findPageIndexInPages(pageId);
    if (idx < 0) return;
    const baseH = pages[idx]?.canvasH || 1080;
    const nextPages = insertBlankPageAt(pages, idx + 1, uid, baseH);
    commitPages(nextPages);
    const inserted = nextPages[idx + 1];
    if (inserted) setCurrentPageId(inserted.id);
  }
  function duplicatePage(pageId: string) {
    const pageToDup = pages.find((p) => p.id === pageId);
    if (!pageToDup) return;
    const newPage = duplicatePageState(pageToDup, uid);
    const idx = pages.findIndex((p) => p.id === pageId);
    const nextPages = [...pages];
    nextPages.splice(idx + 1, 0, newPage);
    commitPages(nextPages);
    setCurrentPageId(newPage.id);
  }
  function duplicatePageMirrored(pageId: string) {
    const pageToDup = pages.find((p) => p.id === pageId);
    if (!pageToDup) return;
    const mir = duplicateMirroredPage(pageToDup, uid, CANVAS_W);
    const idx = pages.findIndex((p) => p.id === pageId);
    const nextPages = [...pages];
    nextPages.splice(idx + 1, 0, mir);
    commitPages(nextPages);
    setCurrentPageId(mir.id);
  }
  function deletePage(pageId: string) {
    if (pages.length <= 1) return;
    // thin wrapper over pure shipped transition + commit (behavior unchanged)
    const { nextPages, nextActiveId } = executeDeletePageTransition(pages, pageId, currentPageId);
    commitPages(nextPages);
    if (currentPageId === pageId && nextActiveId) {
      const found = nextPages.find((p) => p.id === nextActiveId);
      if (found) setCurrentPageId(found.id);
      else if (nextPages[0]) setCurrentPageId(nextPages[0].id);
    }
  }
  function movePageUp(pageId: string) {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx <= 0) return; // boundary early return (prevents redundant history like pre-refactor)
    const nextPages = movePagePure(pages, pageId, -1);
    commitPages(nextPages);
  }
  function movePageDown(pageId: string) {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1 || idx >= pages.length - 1) return; // boundary early return
    const nextPages = movePagePure(pages, pageId, 1);
    commitPages(nextPages);
  }
  function clearPageFor(pageId: string) {
    const target = pages.find((p) => p.id === pageId);
    if (!target || target.elements.length === 0) return; // no-op guard, no history pollution
    const nextPages = clearPage(pages, pageId);
    commitPages(nextPages);
  }
  function applyGradeToAll() {
    const cur = JSON.stringify(activePage.grade ?? null);
    const allSame = pages.every((p) => JSON.stringify(p.grade ?? null) === cur);
    if (allSame) return; // no-op guard
    const nextPages = applyGradeToAllPages(pages, activePage.grade);
    commitPages(nextPages);
  }
  function applyBgToAll() {
    const curBg = activePage.bg;
    const curGrad = JSON.stringify(activePage.bgGrad ?? null);
    const allSame = pages.every((p) => p.bg === curBg && JSON.stringify(p.bgGrad ?? null) === curGrad);
    if (allSame) return; // no-op guard
    const nextPages = applyBackgroundToAllPages(pages, activePage.bg, activePage.bgGrad);
    commitPages(nextPages);
  }
  // helper for index (pure not needed for this thin wrapper)
  function findPageIndexInPages(pageId: string) {
    return pages.findIndex((p) => p.id === pageId);
  }
  // Arbitrary reorder using the pure (high-value; addresses gap)
  function movePageToTop(pageId: string) {
    const from = findPageIndexInPages(pageId);
    if (from <= 0) return;
    const nextPages = reorderPages(pages, from, 0);
    commitPages(nextPages);
  }
  function movePageToBottom(pageId: string) {
    const from = findPageIndexInPages(pageId);
    const last = pages.length - 1;
    if (from < 0 || from === last) return;
    const nextPages = reorderPages(pages, from, last);
    commitPages(nextPages);
  }
  // 페이지 스트립 드래그 재배열(PPT식) — 슬롯 계산·상태는 useStudioPageDnd, 실제 재배치는 reorderPages 재사용.
  // 키보드/터치 대체 수단은 위의 이동 버튼(movePage*)이 그대로 유지된다(a11y).
  const pageDnd = useStudioPageDnd(pages.length, (from, to) => {
    commitPages(reorderPages(pages, from, to));
  });
  function addRenderedImage(src: string, width: number, height: number) {
    setError(null);
    addEl(
      createCanvasImageElement({
        id: uid(),
        src,
        canvasWidth: CANVAS_W,
        canvasHeight: canvasH,
        sourceWidth: width,
        sourceHeight: height,
      })
    );
  }
  function splitFrameSelected(orientation: "horizontal" | "vertical") {
    if (!selected || selected.type !== "frame") return;
    const f = selected as FrameEl;
    const ratio = panelSplitRatio / 100;
    const gutter = panelGutter;

    let f1: FrameEl;
    let f2: FrameEl;

    if (orientation === "horizontal") {
      const availableH = f.height - gutter;
      const h1 = Math.round(availableH * ratio);
      const h2 = Math.round(availableH * (1 - ratio));
      f1 = {
        id: uid(),
        type: "frame",
        x: f.x,
        y: f.y,
        width: f.width,
        height: h1,
        bg: f.bg,
      };
      f2 = {
        id: uid(),
        type: "frame",
        x: f.x,
        y: f.y + h1 + gutter,
        width: f.width,
        height: h2,
        bg: f.bg,
      };
    } else {
      const availableW = f.width - gutter;
      const w1 = Math.round(availableW * ratio);
      const w2 = Math.round(availableW * (1 - ratio));
      f1 = {
        id: uid(),
        type: "frame",
        x: f.x,
        y: f.y,
        width: w1,
        height: f.height,
        bg: f.bg,
      };
      f2 = {
        id: uid(),
        type: "frame",
        x: f.x + w1 + gutter,
        y: f.y,
        width: w2,
        height: f.height,
        bg: f.bg,
      };
    }

    const nextElements = elements.filter((e) => e.id !== f.id);
    commit([...nextElements, f1, f2]);
    setSelectedId(f1.id);
  }
  function addFocusLines() {
    addEl({
      id: uid(),
      type: "focusLines",
      x: 100,
      y: 100,
      width: 360,
      height: 360,
      lineCount: 80,
      innerRadius: 100,
      outerRadius: 360,
      stroke: "#16100c",
      strokeWidth: 2.5,
      noise: 20,
      rotation: 0,
    });
  }
  function addSpeedLines() {
    addEl({
      id: uid(),
      type: "speedLines",
      x: 50,
      y: 200,
      width: 500,
      height: 180,
      lineCount: 50,
      direction: "horizontal",
      stroke: "#16100c",
      strokeWidth: 2.5,
      rotation: 0,
    });
  }
  function dismissQuickStart() {
    setQuickStartOpen(false);
    setQuickStartDismissed(true);
    storeQuickStartDismissed();
  }
  function dismissMobileHint() {
    setMobileHintDismissed(true);
    storeMobileHintDismissed();
  }
  // 모바일 첫 사용 안내를 띄울지: 모바일 + 미해제 + 하이드레이션 완료 + 빠른시작 패널이 떠 있지 않을 때만.
  const showMobileHint = isMobile && !mobileHintDismissed && workHydrated && !showQuickStart;
  function openQuickStartMenu(nextMenu: Extract<StudioMenu, "template" | "char" | "bubble">) {
    setTool("select");
    setSelectedId(null);
    setMenu(nextMenu);
    dismissQuickStart();
  }
  function openPublishStep() {
    setTool("select");
    setMenu(null);
    dismissQuickStart();
    globalThis.requestAnimationFrame(() => {
      publishRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleInputRef.current?.focus({ preventScroll: true });
    });
  }
  function comipoSeedsToEls(seeds: ComipoAssemblySeed[]): El[] {
    return seeds.map((seed) => {
      const id = uid();
      if (seed.type === "frame") {
        return {
          id,
          type: "frame" as const,
          x: seed.x,
          y: seed.y,
          width: seed.width,
          height: seed.height,
          stroke: "stroke" in seed ? seed.stroke : undefined,
          strokeWidth: "strokeWidth" in seed ? seed.strokeWidth : undefined,
          bgColor: "bgColor" in seed ? seed.bgColor : undefined,
        };
      }
      if (seed.type === "bubble") {
        return {
          id,
          type: "bubble" as const,
          variant: seed.variant,
          text: seed.text,
          x: seed.x,
          y: seed.y,
          width: seed.width,
          height: seed.height,
          fill: seed.fill,
          textFill: seed.textFill,
          rotation: seed.rotation,
          tail: "tail" in seed ? seed.tail : undefined,
          tailDirection: "tailDirection" in seed ? seed.tailDirection : undefined,
          align: "align" in seed ? seed.align : undefined,
        };
      }
      if (seed.type === "text") {
        return {
          id,
          type: "text" as const,
          text: seed.text,
          x: seed.x,
          y: seed.y,
          width: seed.width,
          fontSize: seed.fontSize,
          fill: seed.fill,
          rotation: seed.rotation,
          font: seed.font,
          stroke: seed.stroke,
          strokeWidth: seed.strokeWidth,
          align: seed.align,
          fontStyle: seed.fontStyle,
        };
      }
      if (seed.type === "focusLines") {
        return {
          id,
          type: "focusLines" as const,
          x: seed.x,
          y: seed.y,
          width: seed.width,
          height: seed.height,
          lineCount: seed.lineCount,
          innerRadius: seed.innerRadius,
          outerRadius: seed.outerRadius,
          stroke: seed.stroke,
          strokeWidth: seed.strokeWidth,
          noise: seed.noise,
          rotation: seed.rotation,
        };
      }
      return {
        id,
        type: "speedLines" as const,
        x: seed.x,
        y: seed.y,
        width: seed.width,
        height: seed.height,
        lineCount: seed.lineCount,
        direction: seed.direction,
        stroke: seed.stroke,
        strokeWidth: seed.strokeWidth,
        rotation: seed.rotation,
      };
    });
  }
  function startFromExample() {
    if (elements.length > 0 && !globalThis.confirm("기존 작업을 지우고 예시를 불러올까요?")) return;

    const assembled = assembleComipoPage({
      layoutId: "layout_talk_2_bubbles",
      sceneTemplateId: "confession",
      dialogueScript: "민수: 스튜디오에 오신 걸 환영해요!\n지영: 3D 캐릭터·말풍선·컷 템플릿을 바로 써 보세요.",
    });
    if (!assembled) {
      setCanvasH(QUICK_SAMPLE_CANVAS_H);
      setBg("#ffffff");
      setBgGrad(null);
      setWebtoonTheme("soft");
      setTool("select");
      setMenu(null);
      setSelectedId(null);
      commit([...createQuickSampleFrames()]);
      dismissQuickStart();
      return;
    }
    if (!assembled.composable) {
      setError("예시 페이지를 조립하지 못했습니다. 레이아웃을 다시 시도해 주세요.");
      return;
    }
    const sample: El[] = comipoSeedsToEls(assembled.seeds);

    setCanvasH(assembled.canvasH);
    setBg("#ffffff");
    setBgGrad(null);
    setWebtoonTheme("soft");
    setTool("select");
    setMenu(null);
    setSelectedId(null);
    commit(sample);
    dismissQuickStart();
  }
  function removeById(id: string) {
    commit(
      elements.filter((e) => e.id !== id),
      hasTrack(animTimeline, id) ? { animTimeline: removeTrack(animTimeline, id) } : undefined
    );
    if (selectedId === id) setSelectedId(null);
  }
  function removeSelected() {
    if (marqueeIds.length > 0) {
      const dl = new Set(marqueeIds);
      const trackedDeleted = [...dl].filter((id) => hasTrack(animTimeline, id));
      commit(
        elements.filter((e) => !(dl.has(e.id) && !e.locked)),
        trackedDeleted.length > 0
          ? { animTimeline: trackedDeleted.reduce((d, id) => removeTrack(d, id), animTimeline) }
          : undefined
      );
      setMarqueeIds([]);
      return;
    }
    // 잠금이어도 '선택 후 명시적 삭제'는 허용(이메레스 밑그림 등). 잠금은 이동/변형만 막는다.
    if (!selectedId) return;
    removeById(selectedId);
  }
  function moveLayer(id: string, dir: "up" | "down") {
    const idx = elements.findIndex((e) => e.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx + 1 : idx - 1; // up = 앞으로(위 레이어)
    if (swap < 0 || swap >= elements.length) return;
    const next = [...elements];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    commit(next);
  }
  function duplicateSelected() {
    if (marqueeIds.length > 0) {
      const mv = new Set(marqueeIds);
      const copies: El[] = [];
      const newIds: string[] = [];
      for (const e of elements) {
        if (!mv.has(e.id)) continue;
        const id = uid();
        newIds.push(id);
        copies.push(
          e.type === "draw"
            ? { ...e, id, points: e.points.map((v) => v + 16), hidden: false, locked: false }
            : ({ ...e, id, x: (e as { x: number }).x + 16, y: (e as { y: number }).y + 16, hidden: false, locked: false } as El)
        );
      }
      if (copies.length) {
        commit([...elements, ...copies]);
        setMarqueeIds(newIds);
        setSelectedId(null);
        setTool("select");
      }
      return;
    }
    if (!selected) return;
    const copy: El =
      selected.type === "draw"
        ? { ...selected, id: uid(), points: selected.points.map((v) => v + 16), hidden: false, locked: false }
        : ({ ...selected, id: uid(), x: selected.x + 16, y: selected.y + 16, hidden: false, locked: false } as El);
    commit([...elements, copy]);
    setSelectedId(copy.id);
    setTool("select");
  }
  function nudgeSelected(dx: number, dy: number) {
    if (marqueeIds.length > 0) {
      const mv = new Set(marqueeIds);
      const next = elements.map((e) =>
        !(mv.has(e.id) && !e.locked)
          ? e
          : e.type === "draw"
            ? ({ ...e, points: e.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) } as El)
            : ({ ...e, x: (e as { x: number }).x + dx, y: (e as { y: number }).y + dy } as El)
      );
      commitCoalesced(next, "nudge-multi");
      return;
    }
    if (!selected || selected.locked) return;
    const id = selected.id;
    const next = elements.map((e) =>
      e.id !== id
        ? e
        : e.type === "draw"
          ? ({ ...e, points: e.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) } as El)
          : ({ ...e, x: (e as { x: number }).x + dx, y: (e as { y: number }).y + dy } as El)
    );
    commitCoalesced(next, `nudge:${id}`); // 연속 방향키는 한 번의 실행취소로 합침
  }
  // 들어간 패널 중앙(없으면 캔버스 중앙)으로 가로/세로 정렬.
  // 선택 요소를 들어있는 패널(없으면 캔버스) 기준으로 정렬. 좌·가로중앙·우 / 상·세로중앙·하 / 다중 분배.
  function alignSelected(mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom" | "distributeH" | "distributeV") {
    if (marqueeIds.length > 1) {
      const selectedEls = elements.filter((el) => marqueeIds.includes(el.id) && !el.locked);
      if (selectedEls.length === 0) return;

      const boundsList = selectedEls.map((el) => ({ el, b: elBounds(el) }));

      if (mode === "distributeH" || mode === "distributeV") {
        const bounds = boundsList.map(({ b }) => b);
        const deltas = computeDistributeDeltas(bounds, mode);
        if (!deltas) return;
        const deltaById = new Map(selectedEls.map((el, index) => [el.id, deltas[index]!]));
        const next = elements.map((el) => {
          if (!marqueeIds.includes(el.id) || el.locked) return el;
          const delta = deltaById.get(el.id);
          if (!delta || (delta.dx === 0 && delta.dy === 0)) return el;
          return el.type === "draw"
            ? ({
                ...el,
                points: el.points.map((v, i) => v + (i % 2 === 0 ? delta.dx : delta.dy)),
              } as El)
            : ({ ...el, x: (el as { x: number }).x + delta.dx, y: (el as { y: number }).y + delta.dy } as El);
        });
        commit(next);
        return;
      }

      const bounds = boundsList.map(({ b }) => b);
      const box = unionBounds(bounds);
      const deltas = computeAlignDeltas(bounds, mode, box);
      const deltaById = new Map(selectedEls.map((el, index) => [el.id, deltas[index]!]));
      const next = elements.map((el) => {
        if (!marqueeIds.includes(el.id) || el.locked) return el;
        const delta = deltaById.get(el.id);
        if (!delta || (delta.dx === 0 && delta.dy === 0)) return el;
        return el.type === "draw"
          ? ({
              ...el,
              points: el.points.map((v, i) => v + (i % 2 === 0 ? delta.dx : delta.dy)),
            } as El)
          : ({ ...el, x: (el as { x: number }).x + delta.dx, y: (el as { y: number }).y + delta.dy } as El);
      });
      commit(next);
      return;
    }

    if (!selected || selected.locked) return;
    if (mode === "distributeH" || mode === "distributeV") return;
    const b = elBounds(selected);
    const frame = containingPanel(selected, elements);
    const ox = frame ? frame.x : 0;
    const ow = frame ? frame.width : CANVAS_W;
    const oy = frame ? frame.y : 0;
    const oh = frame ? frame.height : canvasH;
    let dx = 0;
    let dy = 0;
    if (mode === "left") dx = ox - b.x;
    else if (mode === "right") dx = ox + ow - b.w - b.x;
    else if (mode === "hcenter") dx = ox + (ow - b.w) / 2 - b.x;
    else if (mode === "top") dy = oy - b.y;
    else if (mode === "bottom") dy = oy + oh - b.h - b.y;
    else if (mode === "vcenter") dy = oy + (oh - b.h) / 2 - b.y;
    if (dx === 0 && dy === 0) return;
    if (selected.type === "draw") {
      patchEl(selected.id, { points: selected.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) } as Partial<El>);
    } else {
      patchEl(selected.id, { x: b.x + dx, y: b.y + dy } as Partial<El>);
    }
  }
  function reorder(dir: "front" | "back" | "forward" | "backward") {
    if (!selectedId) return;
    const idx = elements.findIndex((e) => e.id === selectedId);
    if (idx < 0) return;
    const next = [...elements];
    const [el] = next.splice(idx, 1);
    if (dir === "front") next.push(el);
    else if (dir === "back") next.unshift(el);
    else if (dir === "forward") {
      const targetIdx = Math.min(next.length, idx + 1);
      next.splice(targetIdx, 0, el);
    } else if (dir === "backward") {
      const targetIdx = Math.max(0, idx - 1);
      next.splice(targetIdx, 0, el);
    }
    commit(next);
  }
  // 마스터 편집 모드에서는 페이지 히스토리 이동을 잠근다 — 마스터 편집은 히스토리 미포함이라 화면과 어긋난다.
  const undo = () => {
    if (masterEditMode) return;
    setPagesHi((i) => Math.max(0, i - 1));
  };
  const redo = () => {
    if (masterEditMode) return;
    setPagesHi((i) => Math.min(pagesHistory.length - 1, i + 1));
  };
  // 히스토리 목록 점프 — undo/redo 와 동일하게 pagesHi 인덱스만 이동(스냅샷 배열은 그대로 유지).
  const jumpToHistoryIndex = (index: number) => {
    if (masterEditMode) return;
    setPagesHi(Math.max(0, Math.min(pagesHistory.length - 1, index)));
  };

  // 키보드 단축키: ⌘Z 실행취소 · ⌘⇧Z/⌘Y 다시실행 · ⌘D 복제 · Delete/Backspace 삭제 · Esc 메뉴 닫기/선택해제.
  // 최신 클로저를 ref로 흘려 리스너 재등록 없이(빈 deps) 항상 현재 상태를 참조.
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    shortcutRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || editing) return;
      if (timelapseCapturing) return; // 타임랩스 캡처 중엔 ⌘Z 등 전역 단축키를 막는다(pagesHi 임시 점유 보호)
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      } else if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicateSelected();
      } else if (mod && (e.key === "c" || e.key === "C") && !e.shiftKey && !e.altKey) {
        // 요소 복사(⌘C): 선택이 있을 때만 가로챈다 — 없으면 브라우저 기본 복사 유지.
        if (copySelectedElements()) e.preventDefault();
      } else if (mod && e.key === "]") {
        e.preventDefault();
        reorder("front");
      } else if (mod && e.key === "[") {
        e.preventDefault();
        reorder("back");
      } else if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        setZoom((z) => clampZoom(z + 0.25));
      } else if (mod && e.key === "-") {
        e.preventDefault();
        setZoom((z) => clampZoom(z - 0.25));
      } else if (mod && e.key === "0") {
        e.preventDefault();
        setZoom(1);
      } else if ((e.key === "Delete" || e.key === "Backspace") && (selectedId || marqueeIds.length > 0)) {
        e.preventDefault();
        // 픽셀 선택이 살아 있으면 요소 삭제 대신 선택 영역 픽셀 삭제(포토샵과 동일한 기대).
        if (selected?.type === "image" && isSelectionUsable(pixelSel) && !pixelBusy) {
          void applyPixelSelectionAdjust(planSelectionAdjust("delete"));
        } else {
          removeSelected();
        }
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (mobileSheet) setMobileSheet(null);
        else if (shortcutsOpen) setShortcutsOpen(false);
        else if (menu) {
          // 위 레이어부터 닫기: 단축키 오버레이 → 열린 툴바 드롭다운 → 선택해제.
          // 포커스가 드롭다운 안이면 언마운트로 잃어버리므로 트리거(래퍼 첫 버튼)로 복귀.
          menuRef.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
          setMenu(null);
        } else if (cropRect) {
          // 크롭 모드를 먼저 종료(영역 폐기) — 다음 Esc 가 픽셀 선택/요소 선택을 해제한다.
          setCropRect(null);
        } else if (panelSplitActive) {
          setPanelSplitActive(false);
          setPanelSplitHint(null);
        } else if (nodeEditTool) {
          setNodeEditTool(null);
        } else if (healCloneTool) {
          setHealCloneTool(null);
          healCloneDragRef.current = null;
          clearHealCloneDragPreview();
        } else if (smudgeActive) {
          setSmudgeActive(false);
        } else if (layerMaskPaintActive) {
          setLayerMaskPaintActive(false);
          layerMaskDragRef.current = null;
          clearLayerMaskDragPreview();
        } else if (pixelTool || pixelSel) {
          // 픽셀 선택 도구/영역을 먼저 해제 — 다음 Esc 가 요소 선택을 해제한다.
          setPixelTool(null);
          setPixelSel(null);
        } else {
          setSelectedId(null);
          setMarqueeIds([]);
        }
      } else if ((selectedId || marqueeIds.length > 0) && e.key.startsWith("Arrow")) {
        // 방향키 미세이동: 1px, Shift 동반 시 10px.
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === "ArrowLeft") nudgeSelected(-step, 0);
        else if (e.key === "ArrowRight") nudgeSelected(step, 0);
        else if (e.key === "ArrowUp") nudgeSelected(0, -step);
        else if (e.key === "ArrowDown") nudgeSelected(0, step);
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcutRef.current(e);
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  }, []);

  // ── 페이지 메타(이름·콘티 메모) + 요소 클립보드(⌘C/⌘V) ──────────────────────
  // 메타 편집 중인 페이지 id(스트립 인라인 편집). 커밋은 blur/Enter에서 1회 —
  // withPageMeta가 실질 무변화 시 원본 참조를 돌려줘 undo 히스토리 오염을 막는다.
  const [metaEditPageId, setMetaEditPageId] = useState<string | null>(null);
  function commitPageMeta(pageId: string, patch: { name?: string | null; note?: string | null }) {
    const next = withPageMeta(pages, pageId, patch);
    if (next !== pages) commitPages(next);
  }
  // 샷 타입/카메라 앵글 태그 커밋 — commitPageMeta와 동일 계약(무변화 시 withShotTag가
  // 원본 참조를 돌려주므로 그때만 undo 히스토리에 push한다).
  function commitShotTag(pageId: string, patch: { shotType?: string | null; cameraAngle?: string | null }) {
    const next = withShotTag(pages, pageId, patch);
    if (next !== pages) commitPages(next);
  }
  // 연속 붙여넣기 캐스케이드(PPT식 계단 배치) 카운터 — 페이로드·대상 페이지 조합별로 초기화.
  const pasteSeqRef = useRef<{ key: string; count: number }>({ key: "", count: 0 });
  // 선택 요소 복사(⌘C): 시스템 클립보드는 best-effort, localStorage 폴백은 항상 기록해 ⌘V를 보장.
  function copySelectedElements(): boolean {
    const members = collectCopyElements(elements, selectedId, marqueeIds);
    if (members.length === 0) return false;
    const payload = buildClipboardPayload(members, { canvasW: CANVAS_W, canvasH, pageId: activePage.id });
    writeClipboardFallback(globalThis.localStorage, payload);
    void navigator.clipboard?.writeText(serializeClipboardPayload(payload)).catch(() => {});
    pasteSeqRef.current = { key: "", count: 0 };
    return true;
  }

  // 클립보드 이미지 붙여넣기(⌘V): 스크린샷·외부 그림을 바로 캔버스에 추가.
  // shortcutRef와 같은 방식으로 최신 상태/함수를 ref로 흘린다.
  const pasteRef = useRef<(e: ClipboardEvent) => void>(() => {});
  useEffect(() => {
    pasteRef.current = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || editing) return;
      // 스튜디오 요소 붙여넣기: 복사 페이로드(텍스트) 우선. 이미지가 없을 때만 localStorage 폴백
      // (시스템 클립보드 기록이 차단된 환경) — 외부에서 복사한 이미지 붙여넣기는 그대로 존중한다.
      const elementPayload =
        parseClipboardPayload(e.clipboardData?.getData("text/plain")) ??
        (Array.from(e.clipboardData?.items ?? []).some((it) => it.type.startsWith("image/"))
          ? null
          : readClipboardFallback(globalThis.localStorage));
      if (elementPayload) {
        const samePage = elementPayload.source.pageId === activePage.id;
        const seqKey = `${elementPayload.copiedAt}:${activePage.id}`;
        if (pasteSeqRef.current.key !== seqKey) pasteSeqRef.current = { key: seqKey, count: 0 };
        pasteSeqRef.current.count += 1;
        const plan = planClipboardPaste(
          elementPayload,
          { canvasW: CANVAS_W, canvasH, pageId: activePage.id },
          uid,
          samePage ? { offsetSteps: pasteSeqRef.current.count } : undefined
        );
        if (plan) {
          e.preventDefault();
          commit([...elements, ...(plan.els as unknown as El[])]);
          setMarqueeIds(plan.ids.length > 1 ? plan.ids : []);
          setSelectedId(plan.ids.length === 1 ? plan.ids[0] : null);
          setTool("select");
          return;
        }
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        void (async () => {
          try {
            const { src, width, height } = await downscaleImageFile(file);
            addRenderedImage(src, width, height);
          } catch (err) {
            setError(err instanceof Error ? err.message : "이미지 붙여넣기 실패");
          }
        })();
        return;
      }
    };
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => pasteRef.current(e);
    globalThis.addEventListener("paste", onPaste);
    return () => globalThis.removeEventListener("paste", onPaste);
  }, []);

  function studioInsertState(): StudioPageInsertState {
    const selectedFrame: StudioPageSelectedFrame | null =
      selected?.type === "frame"
        ? {
            type: "frame",
            x: selected.x,
            y: selected.y,
            width: selected.width,
            height: selected.height,
          }
        : null;
    return {
      elements: elements as StudioElementLike[],
      canvasH,
      canvasW: CANVAS_W,
      selected: selectedFrame,
    };
  }
  // 새 요소를 놓을 중심: 패널이 선택돼 있으면 그 칸 중앙, 아니면 캔버스 중앙.
  function spawnCenter(): [number, number] {
    return studioSpawnCenter(studioInsertState());
  }
  function addText() {
    const [cx, cy] = spawnCenter();
    addEl({
      id: uid(),
      type: "text",
      text: "텍스트",
      x: cx - 110,
      y: cy - 24,
      width: 220,
      fontSize: 40,
      fill: color,
      rotation: 0,
    });
  }
  function addBubble(variant: BubbleVariant) {
    setMenu(null);
    let fill = "#ffffff";
    let textFill = "#111111";
    let text = "대사를 입력";
    let width = 260;
    let height = 140;

    if (variant === "shout") {
      fill = "#fff6d6";
      text = "!!";
    } else if (variant === "scared") {
      fill = "#f5f3ff";
    } else if (variant === "box") {
      text = "내레이션";
    } else if (variant === "system") {
      fill = "#0a0f24";
      textFill = "#38bdf8";
      text = "[ SYSTEM ]\n상태가 업데이트 되었습니다.";
      width = 280;
      height = 150;
    } else if (variant === "angry") {
      fill = "#1f0305";
      textFill = "#ef4444";
      text = "크아아악!!";
    } else if (variant === "phone") {
      fill = "#fee500";
      textFill = "#1c1c1c";
    } else if (variant === "heart") {
      fill = "#fff1f2";
      textFill = "#e11d48";
      text = "두근..🩷";
      width = 200;
      height = 180;
    }

    const [cx, cy] = spawnCenter();
    addEl({
      id: uid(),
      type: "bubble",
      variant,
      text,
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      fill,
      textFill,
      rotation: 0,
    });
  }
  function addSticker(emoji: string) {
    setMenu(null);
    const [cx, cy] = spawnCenter();
    addEl({ id: uid(), type: "sticker", text: emoji, x: cx - 40, y: cy - 40, fontSize: 96, rotation: 0 });
  }
  // 효과음 프리셋 삽입 — studio-sfx-presets의 무드별 스타일(색·외곽선·그라디언트·기울기)을
  // 그대로 적용한다. 위치만 중앙으로 잡고 나머지 시각 필드는 createSfxTextConfig가 채운다.
  async function addSfxPreset(preset: SfxPreset) {
    setMenu(null);
    const [cx, cy] = spawnCenter();
    const { createSfxTextConfig } = await import("./studio-sfx-presets");
    addEl({ id: uid(), type: "text", ...createSfxTextConfig(preset, cx - 110, cy - 50) });
  }
  function addBgScene(bg: StudioBgScene) {
    setMenu(null);
    // 토스 WebView(교차 출처)에서 root-relative /assets 가 404 → resolveAssetUrl 로 배포 오리진에 절대화.
    // svgToDataUrl 결과(data: URL)나 웹(동일 출처)에선 무변경(no-op).
    const src = resolveAssetUrl(bg.imgSrc || svgToDataUrl(bg.svg || ""));
    if (selected?.type === "frame") {
      patchEl(selected.id, { bg: src } as Partial<El>);
      setTool("select");
      return;
    }
    // 패널이 있으면 한 번 클릭으로 모든 패널에 배경을 깔아 바로 웹툰 느낌(쉽게). 개별 변경은 패널 선택 후.
    const frames = elements.filter((e) => e.type === "frame");
    if (frames.length > 0) {
      commit(elements.map((e) => (e.type === "frame" ? ({ ...e, bg: src } as El) : e)));
      setTool("select");
      return;
    }
    const el = createCanvasImageElement({
      id: uid(),
      src,
      canvasWidth: CANVAS_W,
      canvasHeight: canvasH,
      sourceWidth: 720,
      sourceHeight: 1080,
      horizontalInset: 0,
      minY: 0,
    });
    commit([el, ...elements]);
    setSelectedId(el.id);
    setTool("select");
  }
  function addFrame() {
    const margin = 24;
    const frames = elements.filter((e): e is FrameEl => e.type === "frame");
    const bottomFrame = frames.reduce<FrameEl | null>(
      (best, frame) => (!best || frame.y + frame.height > best.y + best.height ? frame : best),
      null
    );
    const height = Math.min(480, Math.max(220, Math.round(bottomFrame?.height ?? 360)));
    const y = bottomFrame ? bottomFrame.y + bottomFrame.height + margin : margin;
    const frame: FrameEl = {
      id: uid(),
      type: "frame",
      x: margin,
      y,
      width: CANVAS_W - margin * 2,
      height,
    };
    setCanvasH((h) => Math.max(h, y + height + margin));
    addEl(frame);
  }
  // 사선 2분할 컷 — 기울어진 분할선으로 두 패널을 깐다(역동적 만화 연출).
  function addDiagonalSplit() {
    const margin = 24;
    const w = CANVAS_W - margin * 2;
    const frames = elements.filter((e): e is FrameEl => e.type === "frame");
    const bottomFrame = frames.reduce<FrameEl | null>(
      (best, f) => (!best || f.y + f.height > best.y + best.height ? f : best),
      null
    );
    const top = bottomFrame ? bottomFrame.y + bottomFrame.height + margin : margin;
    const h = 440;
    const g = 18; // 사선 거터
    const t1 = Math.round(h * 0.6); // 좌측 분할 y
    const t2 = Math.round(h * 0.4); // 우측 분할 y(위로 기울어짐)
    const upper: FrameEl = {
      id: uid(),
      type: "frame",
      x: margin,
      y: top,
      width: w,
      height: t1,
      points: [0, 0, w, 0, w, t2, 0, t1],
    };
    const lowerY = top + t2 + g;
    const lowerH = h - (t2 + g);
    const lower: FrameEl = {
      id: uid(),
      type: "frame",
      x: margin,
      y: lowerY,
      width: w,
      height: lowerH,
      points: [0, t1 - t2, w, 0, w, lowerH, 0, lowerH],
    };
    setCanvasH((hh) => Math.max(hh, top + h + margin));
    commit([...elements, upper, lower]);
    setTool("select");
  }
  // 선택한 사각형 프레임을 평행사변형(사선)으로 ↔ 사각형으로 토글.
  function toggleSelectedFrameDiagonal() {
    if (!selected || selected.type !== "frame") return;
    if (selected.points) {
      patchEl(selected.id, { points: undefined } as Partial<El>);
    } else {
      const skew = Math.round(selected.width * 0.14);
      patchEl(selected.id, {
        points: [skew, 0, selected.width, 0, selected.width - skew, selected.height, 0, selected.height],
      } as Partial<El>);
    }
  }
  // 선택 이미지를 들어있는 패널(없으면 캔버스)에 꽉 채운다(cover) — 드롭 후 수동 리사이즈 제거.
  async function fitSelectedToFrame() {
    if (!selected || selected.type !== "image" || selected.locked) return;
    const frame = containingPanel(selected, elements);
    const target = frame
      ? { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
      : { x: 0, y: 0, width: CANVAS_W, height: canvasH };
    const { coverFitInFrame } = await import("./studio-fit");
    patchEl(selected.id, coverFitInFrame({ width: selected.width, height: selected.height }, target));
  }
  // 선택 말풍선 높이를 대사 길이에 자동으로 맞춘다.
  async function fitBubbleToText() {
    if (!selected || selected.type !== "bubble" || selected.locked) return;
    const { estimateBubbleHeight } = await import("./studio-fit");
    const h = estimateBubbleHeight(selected.text, selected.width, selected.fontSize ?? 24, selected.lineHeight ?? 1.2);
    patchEl(selected.id, { height: h });
  }
  function addFxOverlay(svgMarkup: string, w: number, h: number) {
    setMenu(null);
    addEl(
      createCanvasImageElement({
        id: uid(),
        src: svgToDataUrl(svgMarkup),
        canvasWidth: CANVAS_W,
        canvasHeight: canvasH,
        sourceWidth: w,
        sourceHeight: h,
        horizontalInset: 100,
      })
    );
  }
  // 만화 스크린톤 — 톤 SVG를 이미지 엘리먼트로 추가(이미지 머신 재사용: 패널 클립·필터·변형).
  // 패널이 선택돼 있으면 그 칸을 덮도록(클립되어 깔끔히 채움), 아니면 기본 크기로 중앙 배치.
  async function addTone(svg: string) {
    setMenu(null);
    const { TONE_DEFAULT_SIZE, toneDataUrl } = await import("./studio-tones");
    const src = toneDataUrl(svg);
    if (selected?.type === "frame") {
      addEl({ id: uid(), type: "image", src, x: selected.x, y: selected.y, width: selected.width, height: selected.height, rotation: 0, opacity: 0.9 });
    } else {
      const w = TONE_DEFAULT_SIZE.width;
      const h = TONE_DEFAULT_SIZE.height;
      addEl({ id: uid(), type: "image", src, x: Math.round((CANVAS_W - w) / 2), y: Math.max(24, Math.round(canvasH / 2 - h / 2)), width: w, height: h, rotation: 0, opacity: 0.9 });
    }
  }
  // 이메레스(툰스푼 스타일) — 스케치 밑그림을 반투명+잠금 레이어로 깔고 바로 펜 모드로 전환.
  // 패널이 선택돼 있으면 그 칸 안에 맞춰 넣고, 아니면 캔버스 중앙에 배치한다.
  function addEmeresTemplate(t: StudioEmeresTemplate) {
    setMenu(null);
    const src = svgToDataUrl(t.svg);
    const opacity = studioOptionalAssets.emeresUnderlayOpacity;
    let el: El;
    if (selected?.type === "frame") {
      const fit = Math.min(selected.width / t.width, selected.height / t.height) * 0.94;
      const w = Math.round(t.width * fit);
      const h = Math.round(t.height * fit);
      el = {
        id: uid(),
        type: "image",
        src,
        x: Math.round(selected.x + (selected.width - w) / 2),
        y: Math.round(selected.y + (selected.height - h) / 2),
        width: w,
        height: h,
        rotation: 0,
        opacity,
        locked: true,
      };
    } else {
      el = {
        ...createCanvasImageElement({
          id: uid(),
          src,
          canvasWidth: CANVAS_W,
          canvasHeight: canvasH,
          sourceWidth: t.width,
          sourceHeight: t.height,
          horizontalInset: 80,
        }),
        opacity,
        locked: true,
      };
    }
    commit([...elements, el]);
    setSelectedId(null);
    setTool("draw");
    setDrawMode("pen");
  }
  // 장면 템플릿 삽입 — runStudioPageAddSceneTemplate 단일 shipped 경로.
  function addSceneTemplate(template: SceneTemplate) {
    setMenu(null);
    const result = runStudioPageAddSceneTemplate(studioInsertState(), template.id, uid);
    if (!result.ok) {
      setError("장면을 이 컷에 맞출 수 없습니다.");
      return;
    }
    commit(result.elements as El[]);
    setTool("select");
  }
  // 대사 스크립트 일괄 삽입 — runStudioPageAddDialogueBubbles 단일 shipped 경로.
  function addDialogueBubbles() {
    if (!dialogueScript.trim()) return;
    const result = runStudioPageAddDialogueBubbles(studioInsertState(), dialogueScript, uid);
    if (!result.ok) {
      setError("대사를 컷 안에 배치하지 못했습니다. 대사 길이를 줄여 보세요.");
      return;
    }
    commit(result.elements as El[]);
    setDialogueScript("");
    setMenu(null);
    setTool("select");
  }

  // 배치된 대사 일괄 편집 — 순수 헬퍼가 무변경이면 입력 배열을 그대로 돌려주므로 참조 비교로 빈 커밋을 막는다.
  function patchDialogueText(pageId: string, elId: string, text: string) {
    const next = applyDialogueTextEdit(pages, pageId, elId, text);
    if (next !== pages) commitPages(next as PageState[]);
  }
  // 찾아바꾸기 일괄 적용 — 여러 페이지를 한 번에 바꿔도 히스토리 1개(실행취소 1회).
  function applyDialogueReplacePlan(plan: DialogueReplacePlan) {
    const next = applyReplacePlanToPages(pages, plan);
    if (next !== pages) commitPages(next as PageState[]);
  }
  // 목록 클릭 → 캔버스 선택(다른 페이지면 전환). 마퀴 해제는 기존 selectedId 이펙트가 처리한다.
  function selectDialogueElement(pageId: string, elId: string) {
    if (pageId !== activePage.id) setCurrentPageId(pageId);
    setTool("select");
    setSelectedId(elId);
  }
  // 요소 평행이동(draw는 points, 그 외는 x/y) — 클립 정규화·삽입용.
  function shiftEl(el: El, dx: number, dy: number): El {
    return el.type === "draw"
      ? ({ ...el, points: el.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) } as El)
      : ({ ...el, x: (el as { x: number }).x + dx, y: (el as { y: number }).y + dy } as El);
  }
  // 선택 요소(그룹이면 그룹 전체)를 원점 기준으로 정규화해 재사용 클립으로 저장.
  async function saveSelectionAsClip() {
    if (!selected) return;
    const members = selected.groupId
      ? elements.filter((e) => e.groupId === selected.groupId)
      : [selected];
    const minX = Math.min(...members.map((m) => elBounds(m).x));
    const minY = Math.min(...members.map((m) => elBounds(m).y));
    const els = members.map((m) => shiftEl(m, -minX, -minY));
    const fallbackName =
      members.length > 1 ? "내 장면 클립" : selected.type === "bubble" ? "말풍선 클립" : "내 클립";
    const name = globalThis.prompt("클립 이름을 정해주세요", fallbackName)?.trim();
    if (!name) return;
    try {
      const { saveClip } = await import("./studio-clips");
      setClips(saveClip(globalThis.localStorage, { id: uid(), name, createdAt: Date.now(), els }));
    } catch (err) {
      console.error("Failed to save studio clip:", err);
      setError("클립을 저장하지 못했습니다.");
    }
    setMenu("clip");
  }
  // 클립을 캔버스에 삽입 — 새 id·새 그룹으로 화면 중앙 부근에 배치.
  function insertClip(clip: StudioClip) {
    const [cx, cy] = spawnCenter();
    const groupMap = new Map<string, string>();
    const newEls = (clip.els as El[]).map((e) => {
      let groupId = e.groupId;
      if (groupId) {
        if (!groupMap.has(groupId)) groupMap.set(groupId, uid());
        groupId = groupMap.get(groupId);
      }
      return { ...shiftEl(e, cx - 120, cy - 120), id: uid(), groupId, hidden: false, locked: false };
    });
    if (newEls.length === 0) return;
    commit([...elements, ...newEls]);
    setMenu(null);
    setTool("select");
  }
  async function deleteClip(id: string) {
    try {
      const { removeClip } = await import("./studio-clips");
      setClips(removeClip(globalThis.localStorage, id));
    } catch (err) {
      console.error("Failed to delete studio clip:", err);
      setError("클립을 삭제하지 못했습니다.");
    }
  }
  function regenerateTemplate(tpl: TemplateSpec, gutter: number, currentEls: El[] = elements) {
    let nextFrames: FrameSpec[] = [];
    if (tpl.id === "blank") {
      nextFrames = [];
    } else if (tpl.id === "grid4") {
      nextFrames = [
        { x: gutter, y: gutter, width: (CANVAS_W - gutter * 3) / 2, height: (1080 - gutter * 3) / 2 },
        { x: gutter * 2 + (CANVAS_W - gutter * 3) / 2, y: gutter, width: (CANVAS_W - gutter * 3) / 2, height: (1080 - gutter * 3) / 2 },
        { x: gutter, y: gutter * 2 + (1080 - gutter * 3) / 2, width: (CANVAS_W - gutter * 3) / 2, height: (1080 - gutter * 3) / 2 },
        { x: gutter * 2 + (CANVAS_W - gutter * 3) / 2, y: gutter * 2 + (1080 - gutter * 3) / 2, width: (CANVAS_W - gutter * 3) / 2, height: (1080 - gutter * 3) / 2 },
      ];
    } else {
      const isStack = tpl.id.startsWith("webtoon") || tpl.id === "strip4" || tpl.id === "single";
      const isGrid = tpl.id.startsWith("grid");
      if (isStack) {
        const count = tpl.frames.length || 1;
        const h = Math.round((tpl.canvasH - gutter * (count + 1)) / count);
        nextFrames = Array.from({ length: count }, (_, i) => ({
          x: gutter,
          y: gutter + i * (h + gutter),
          width: CANVAS_W - gutter * 2,
          height: h,
        }));
      } else if (isGrid) {
        const cols = 2;
        const rows = tpl.id === "grid6" ? 3 : 4;
        const w = (CANVAS_W - gutter * (cols + 1)) / cols;
        const h = (tpl.canvasH - gutter * (rows + 1)) / rows;
        nextFrames = Array.from({ length: rows * cols }, (_, i) => {
          const col = i % cols;
          const row = Math.floor(i / cols);
          return {
            x: gutter + col * (w + gutter),
            y: gutter + row * (h + gutter),
            width: w,
            height: h,
          };
        });
      }
    }

    const nonFrames = currentEls.filter((el) => el.type !== "frame");
    const newFrames = nextFrames.map((f) => ({
      id: uid(),
      type: "frame" as const,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    }));

    return [...newFrames, ...nonFrames];
  }

  function applyTemplate(tpl: TemplateSpec) {
    setMenu(null);
    if (elements.length > 0 && !globalThis.confirm("기존 작업을 지우고 템플릿을 적용할까요?")) return;
    setCanvasH(tpl.canvasH);
    setBg("#ffffff");
    setBgGrad(null);
    setCurrentTemplate(tpl);
    const nextEls = regenerateTemplate(tpl, panelGutter, []);
    commit(nextEls);
    setSelectedId(null);
  }
  // 코미Po!식 정형 컷 레이아웃 — assembleComipoPage 로 프레임·대사를 충돌 없이 배치.
  function applyPanelLayout(layout: PanelLayoutPreset) {
    setMenu(null);
    if (elements.length > 0 && !globalThis.confirm("기존 작업을 지우고 컷 템플릿을 적용할까요?")) return;
    const assembled = assembleComipoPage({
      layoutId: layout.id,
      dialogueScript: dialogueScript.trim() || undefined,
    });
    if (!assembled?.composable) {
      setError("컷 템플릿을 배치하지 못했습니다. 대사 길이를 줄이거나 레이아웃을 바꿔 보세요.");
      return;
    }
    setCanvasH(assembled.canvasH);
    setBg("#ffffff");
    setBgGrad(null);
    setCurrentTemplate(null);
    commit(comipoSeedsToEls(assembled.seeds));
    setSelectedId(null);
  }
  function applyBgPreset(p: BgPreset) {
    if (p.grad) setBgGrad(p.grad);
    else if (p.fill) {
      setBg(p.fill);
      setBgGrad(null);
    }
  }
  async function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { src, width, height } = await downscaleImageFile(file);
      const fit = Math.min(1, (CANVAS_W - 80) / width);
      setError(null);
      addEl({
        id: uid(),
        type: "image",
        src,
        x: (CANVAS_W - width * fit) / 2,
        y: 80,
        width: Math.round(width * fit),
        height: Math.round(height * fit),
        rotation: 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 추가 실패");
    }
  }

  // 매직완드 — 클릭 지점과 이어진(허용오차 이내) 영역을 윤곽 추적해 PixelSelection으로 변환한다.
  // studio-flood-fill의 BFS 스캔을 studio-magic-wand가 재사용하되 "칠하기" 대신 "선택"을 만든다.
  async function runMagicWandSelect(pos: { x: number; y: number }, frame: SelectionFrame) {
    if (pixelBusy || selected?.type !== "image") return;
    const target = selected;
    const p = { x: (pos.x - frame.x) / frame.width, y: (pos.y - frame.y) / frame.height };
    const runId = ++pixelWandRunIdRef.current;
    setPixelBusy(true);
    try {
      const region = await magicWandScanFromImage(target.src, p.x, p.y, wandTolerance, {
        flipX: target.flipped,
        flipY: target.flippedY,
      });
      if (runId !== pixelWandRunIdRef.current) return; // 그사이 요소가 바뀌었거나 새 스캔이 시작됨.
      setPixelSel((prev) => applyMagicWandRegionToSelection(prev, region, pixelCombine));
    } catch (err) {
      if (runId === pixelWandRunIdRef.current) {
        setError(err instanceof Error ? err.message : "이 지점에서 선택할 영역을 찾지 못했어요.");
      }
    } finally {
      if (runId === pixelWandRunIdRef.current) setPixelBusy(false);
    }
  }

  // ── 픽셀 선택 한정 조정 적용(밝기/색조/삭제) — 원본 픽셀에 굽는 파괴적 작업 ──
  // 원본 자연 해상도로 마스크를 래스터해 합성하고, 결과를 data URL 로 교체(patchEl)해
  // 일반 요소 편집과 같은 히스토리 1항목(⌘Z 복구 가능)으로 남긴다. 선택 영역은 유지되어
  // 같은 영역에 조정을 연달아 가할 수 있다(포토샵 대화상자와 동일).
  async function applyPixelSelectionAdjust(plan: SelectionAdjustPlan) {
    if (pixelBusy || isSelectionAdjustNoop(plan)) return;
    if (selected?.type !== "image" || !pixelSel || !isSelectionUsable(pixelSel)) return;
    const target = selected; // await 사이 선택 변경에 흔들리지 않게 스냅샷.
    const sel = pixelSel;
    setPixelBusy(true);
    try {
      const img = await loadPixelEditImage(target.src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      // 페더는 캔버스 표시 px 기준 → 원본 px 환산 배율. 선택은 화면(반전 표시) 기준으로
      // 그려지므로 원본 픽셀 좌표로 되반전(flipX/flipY)해 마스크를 만든다.
      const maskPlan = buildSelectionMaskPlan(sel, w, h, {
        featherScale: target.width > 0 ? w / target.width : 1,
        flipX: target.flipped,
        flipY: target.flippedY,
      });
      if (!maskPlan) return;
      const mask = rasterizeSelectionMask(maskPlan, createPixelEditCanvas);
      const out = mask && applySelectionAdjustToCanvas(img, w, h, mask, plan, createPixelEditCanvas);
      if (!out) throw new Error("조정 캔버스를 만들지 못했습니다.");
      // 팩토리가 HTMLCanvasElement 만 만들므로 구조 타입 → DOM 타입 복원은 안전하다.
      // PNG: 삭제(투명)·페더의 알파를 보존하는 무손실 포맷.
      const src = (out as HTMLCanvasElement).toDataURL("image/png");
      patchEl(target.id, { src } as Partial<El>);
      setError(null);
    } catch (err) {
      console.error("Failed to apply pixel selection adjust:", err);
      setError(err instanceof Error ? err.message : "선택 영역 조정에 실패했습니다.");
    } finally {
      setPixelBusy(false);
    }
  }

  // 문지르기 브러시 — 누적된 정규화 좌표 스트로크로 픽셀을 재인코딩한다.
  async function applySmudgeStroke(elId: string, points: SelPoint[]) {
    if (smudgeBusy) return;
    const target = elementById.get(elId);
    if (!target || target.type !== "image") return;
    setSmudgeBusy(true);
    try {
      const radiusNorm = smudgeRadius / Math.max(1, target.width);
      const src = await smudgeStrokeImage(target.src, points, radiusNorm, smudgeStrength / 100, {
        flipX: target.flipped,
        flipY: target.flippedY,
      });
      if (src !== target.src) patchEl(target.id, { src } as Partial<El>);
      setError(null);
    } catch (err) {
      console.error("Failed to apply smudge stroke:", err);
      setError(err instanceof Error ? err.message : "문지르기를 적용하지 못했습니다.");
    } finally {
      setSmudgeBusy(false);
    }
  }

  // ── 레이어 마스크 브러시 스트로크 굽기 — 스트로크 종료마다 자동 실행(붓처럼 즉시 반영).
  // heal-clone과 동일하게 target은 elementById에서 다시 읽는다(await 사이 selected가 바뀌어도
  // 정확한 요소에 적용된다). 기존 el.src는 절대 patchEl하지 않는다 — maskSrc만 바뀐다(비파괴).
  async function bakeLayerMaskPaintStroke(session: { elId: string; frame: SelectionFrame; points: SelPoint[] }) {
    const target = elementById.get(session.elId);
    if (!target || target.type !== "image") return;
    setLayerMaskBusy(true);
    try {
      const img = await loadPixelEditImage(target.src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = target.width > 0 ? w / target.width : 1;
      const flipX = target.flipped ?? false;
      const flipY = target.flippedY ?? false;
      const pixelPoints = session.points.map((p) => {
        const unflipped = flipNormalizedPoint(p, flipX, flipY);
        return { x: unflipped.x * w, y: unflipped.y * h };
      });
      const radiusPx = Math.max(1, layerMaskRadius * scale);
      const existingMask = target.maskSrc ? await loadPixelEditImage(target.maskSrc) : null;
      const out = bakeLayerMaskStroke(
        existingMask,
        w,
        h,
        { points: pixelPoints, radiusPx, hardness: layerMaskHardness, strength: layerMaskStrength, mode: layerMaskPaintMode },
        createPixelEditCanvas
      );
      if (!out) throw new Error("마스크 결과를 만들지 못했습니다.");
      const maskSrc = (out as HTMLCanvasElement).toDataURL("image/png");
      patchEl(target.id, { maskSrc, maskEnabled: true } as Partial<El>);
      setError(null);
    } catch (err) {
      console.error("Failed to bake layer mask stroke:", err);
      setError(err instanceof Error ? err.message : "마스크 적용에 실패했습니다.");
    } finally {
      setLayerMaskBusy(false);
    }
  }
  // ── 레이어 마스크 즉시 실행(굽기) 액션 4개 — 전부 patchEl 1회로 히스토리 1건. ──
  function addLayerMask(fill: LayerMaskPaintMode) {
    if (selected?.type !== "image" || !canLayerMask(selected)) return;
    const target = selected;
    void (async () => {
      const img = await loadPixelEditImage(target.src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const out = createLayerMaskCanvas(w, h, fill, createPixelEditCanvas);
      if (!out) return;
      patchEl(target.id, { maskSrc: (out as HTMLCanvasElement).toDataURL("image/png"), maskEnabled: true } as Partial<El>);
    })();
  }
  function deleteLayerMask() {
    if (selected?.type !== "image") return;
    patchEl(selected.id, { maskSrc: undefined, maskEnabled: undefined } as Partial<El>);
  }
  function toggleLayerMaskEnabled() {
    if (selected?.type !== "image") return;
    patchEl(selected.id, { maskEnabled: selected.maskEnabled === false } as Partial<El>);
  }
  function invertLayerMask() {
    if (selected?.type !== "image" || !selected.maskSrc) return;
    const target = selected;
    void (async () => {
      const img = await loadPixelEditImage(target.src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const maskImg = await loadPixelEditImage(target.maskSrc!);
      const out = invertLayerMaskAlpha(maskImg, w, h, createPixelEditCanvas);
      if (!out) return;
      patchEl(target.id, { maskSrc: (out as HTMLCanvasElement).toDataURL("image/png") } as Partial<El>);
    })();
  }

  // ── 복구 브러시/도장 스트로크 굽기 — 스트로크 종료마다 자동 실행(별도 "적용" 버튼 없음, 붓처럼
  // 즉시 반영). 원본 자연 해상도로 dab 목록을 계산해 굽고, 결과를 data URL로 교체(patchEl)해
  // 히스토리 1건(⌘Z 1회)으로 남긴다. target은 elementById에서 다시 읽는다(session.elId 기준) —
  // await 사이 selected가 바뀌어도 정확한 요소에 적용된다.
  async function bakeHealCloneDragStroke(session: {
    elId: string;
    frame: SelectionFrame;
    offset: SelPoint;
    radiusNorm: number;
    points: SelPoint[];
  }) {
    const target = elementById.get(session.elId);
    if (!target || target.type !== "image") return;
    setHealCloneBusy(true);
    try {
      const img = await loadPixelEditImage(target.src);
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const dabs = planHealCloneDabs(session.points, session.offset, w, h, {
        flipX: target.flipped,
        flipY: target.flippedY,
      });
      if (dabs.length === 0) return;
      const radiusPxDevice = healCloneRadius * (target.width > 0 ? w / target.width : 1);
      const out = bakeHealCloneStrokeToCanvas(
        img,
        w,
        h,
        dabs,
        { radiusPx: radiusPxDevice, hardness: healCloneHardness, opacity: healCloneOpacity },
        healCloneTool ?? "clone",
        createPixelEditCanvas
      );
      if (!out) throw new Error("복구 브러시 결과를 만들지 못했습니다.");
      const src = (out as HTMLCanvasElement).toDataURL("image/png");
      patchEl(target.id, { src } as Partial<El>);
      setError(null);
    } catch (err) {
      console.error("Failed to bake heal/clone stroke:", err);
      setError(err instanceof Error ? err.message : "복구 브러시 적용에 실패했습니다.");
    } finally {
      setHealCloneBusy(false);
    }
  }

  // ── 페인트 통 결과 커밋 — 알파 락이면 편집 전 알파 모양 밖으로 못 나가게 오려낸 뒤 반영 ──
  // floodFillImage 자체는 알파를 안 건드리지만(색만 칠함) 반투명 안티앨리어싱 가장자리로 색이
  // 스며나가는 걸 막아 "이 레이어의 지금 모양 밖으로는 절대 안 나간다"를 보장한다. 잠금이 아니면
  // 기존과 완전히 동일하게(추가 로드/합성 없이) 그대로 커밋한다.
  async function commitFloodFillResult(dataUrl: string) {
    if (selected?.type !== "image") return; // 방어적 — 페인트 통 패널은 이미지 선택 시에만 렌더된다.
    const target = selected;
    if (!shouldClipToExistingAlpha(target)) {
      patchEl(target.id, { src: dataUrl } as Partial<El>);
      return;
    }
    const beforeSrc = target.src; // 이번 편집 전(잠긴 채 유지돼야 할) 알파 모양의 원본.
    try {
      const [original, edited] = await Promise.all([loadPixelEditImage(beforeSrc), loadPixelEditImage(dataUrl)]);
      const w = original.naturalWidth || original.width;
      const h = original.naturalHeight || original.height;
      const out = compositeAlphaLocked(original, edited, w, h, createPixelEditCanvas);
      const src = out ? (out as HTMLCanvasElement).toDataURL("image/png") : dataUrl;
      patchEl(target.id, { src } as Partial<El>);
    } catch (err) {
      console.error("Failed to apply alpha-locked composite:", err);
      patchEl(target.id, { src: dataUrl } as Partial<El>); // 합성 실패 시 잠금 없이 원래 결과라도 반영.
    }
  }

  // ── 이미지 크롭 적용 — 원본 자연 해상도로 잘라 data URL 교체(파괴적, 히스토리 1건) ──
  // 크롭 후에도 화면상 위치가 유지되도록 src 와 요소 프레임(x/y/width/height)을 한 번의
  // patchEl 로 함께 갱신한다(⌘Z 1회로 원복). 반전(flipX/flipY)·회전 보정은 planCropApply 가 담당.
  async function applyCropToSelectedImage() {
    if (cropBusy || !cropRect) return;
    if (selected?.type !== "image") return;
    if (isCropRectNoop(cropRect)) {
      setCropRect(null); // 전체 영역 = 자를 것 없음 → 모드만 종료.
      return;
    }
    const target = selected; // await 사이 선택 변경에 흔들리지 않게 스냅샷.
    const rect = cropRect;
    setCropBusy(true);
    try {
      const img = await loadPixelEditImage(target.src);
      const plan = planCropApply({
        rect,
        natural: { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height },
        frame: { x: target.x, y: target.y, width: target.width, height: target.height, rotation: target.rotation },
        flipX: target.flipped,
        flipY: target.flippedY,
      });
      if (!plan) throw new Error("크롭 영역을 계산하지 못했습니다.");
      const out = createPixelEditCanvas(plan.source.sw, plan.source.sh);
      if (!out) throw new Error("크롭 캔버스를 만들지 못했습니다.");
      out.ctx.drawImage(
        img,
        plan.source.sx,
        plan.source.sy,
        plan.source.sw,
        plan.source.sh,
        0,
        0,
        plan.source.sw,
        plan.source.sh
      );
      // PNG: 투명 배경(누끼·스티커) 알파를 보존하는 무손실 포맷.
      const src = out.canvas.toDataURL("image/png");
      patchEl(target.id, {
        src,
        x: plan.el.x,
        y: plan.el.y,
        width: plan.el.width,
        height: plan.el.height,
        // 크롭은 자연 해상도 자체를 바꾸므로 기존 maskSrc(구 해상도 기준)는 정렬이 깨진다 —
        // 잘못 정렬된 채 남기는 것보다 지우는 편이 안전(재작업 필요, 알려진 한계).
        maskSrc: target.maskSrc ? undefined : target.maskSrc,
        maskEnabled: target.maskSrc ? undefined : target.maskEnabled,
      } as Partial<El>);
      setCropRect(null);
      setError(null);
    } catch (err) {
      console.error("Failed to apply image crop:", err);
      setError(err instanceof Error ? err.message : "이미지 크롭에 실패했습니다.");
    } finally {
      setCropBusy(false);
    }
  }

  // 그림판 — 진행 중 선/도형은 draft 로만 렌더, 끝나면 히스토리에 커밋.
  // 스테이지를 실제 합성 픽셀 그대로 렌더해 클릭 지점 색을 뽑는다(이미지 요소 하나의 "주요 색상"이
  // 아니라, 여러 레이어가 겹친 화면 그대로의 정확한 색 — CSP/Photoshop 스포이드와 동일한 개념).
  function pickCanvasColorAt(pos: { x: number; y: number }): string | null {
    const stage = stageRef.current;
    if (!stage) return null;
    const canvas = stage.toCanvas({ pixelRatio: 1 / effScale });
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return pickColorFromImageData(data, width, height, pos.x, pos.y);
  }
  // QuickShape — 손그림 스트로크가 잠시 멈추면(1단계) 완벽한 도형으로 자동 인식하고, 계속 멈춰
  // 있으면(2단계) 정비율(정사각형/정원 등)로 고정한다. setInterval 콜백은 스트로크 시작 시점의
  // tool/drawMode 클로저를 그대로 쓴다(짧은 제스처 도중 도구 전환은 드물어 v1에서는 감내).
  function startQuickShapeTracking(pos: { x: number; y: number }) {
    quickShapeConvertedRef.current = false;
    quickShapeLockedRef.current = false;
    quickShapeStillAnchorRef.current = pos;
    // 이 함수는 onStageDown(포인터 이벤트 핸들러) 안에서만 호출된다 — 렌더 경로가 아니다.
    // react-hooks/purity 는 setInterval 콜백(runQuickShapeTick)으로 전달되는 함수를 보수적으로
    // "렌더 중 호출 가능"으로 오판하는데, 실제로는 아래 setInterval 자체가 이 함수 호출 시점
    // 이후에만 등록되는 진짜 타이머 콜백이라 안전하다.
    // eslint-disable-next-line react-hooks/purity
    quickShapeStillSinceRef.current = performance.now();
    if (quickShapeTimerRef.current !== null) globalThis.clearInterval(quickShapeTimerRef.current);
    quickShapeTimerRef.current = globalThis.setInterval(runQuickShapeTick, 80);
  }
  function stopQuickShapeTracking() {
    if (quickShapeTimerRef.current !== null) {
      globalThis.clearInterval(quickShapeTimerRef.current);
      quickShapeTimerRef.current = null;
    }
    quickShapeStillAnchorRef.current = null;
    quickShapeConvertedRef.current = false;
    quickShapeLockedRef.current = false;
  }
  function noteQuickShapePointerMoved(pos: { x: number; y: number }) {
    const anchor = quickShapeStillAnchorRef.current;
    if (!anchor) return; // 무장 안 됨 — 저비용 no-op
    const radius = QUICKSHAPE_STILL_RADIUS_PX / effScale;
    if (Math.hypot(pos.x - anchor.x, pos.y - anchor.y) > radius) {
      quickShapeStillAnchorRef.current = pos;
      // onStageMove(포인터 이벤트 핸들러) 안에서만 호출된다 — 위 startQuickShapeTracking 과 동일 근거.
      // eslint-disable-next-line react-hooks/purity
      quickShapeStillSinceRef.current = performance.now();
    }
  }
  // globalThis.setInterval 콜백으로만 등록된다(startQuickShapeTracking 참고) — 렌더 경로가 아니다.
  function runQuickShapeTick() {
    const current = drawingRef.current;
    const anchor = quickShapeStillAnchorRef.current;
    if (!current || !anchor || tool !== "draw" || drawMode !== "pen") {
      stopQuickShapeTracking();
      return;
    }
    // eslint-disable-next-line react-hooks/purity
    const elapsed = performance.now() - quickShapeStillSinceRef.current;

    if (!quickShapeConvertedRef.current) {
      if ((current.kind ?? "freehand") !== "freehand") return; // 방어적
      const match = classifyQuickShape(current.points, elapsed);
      if (!match) return;
      const anchored = anchorQuickShapePoints(match.kind, match.points, anchor);
      let next: DrawEl = {
        ...current,
        kind: match.kind,
        brush: undefined,
        pressures: undefined,
        fill: undefined,
        points: anchored,
        shapeParams:
          match.polygonSides !== undefined
            ? { ...DEFAULT_SHAPE_PARAMS, polygonSides: match.polygonSides }
            : undefined,
      };
      quickShapeConvertedRef.current = true;
      if (elapsed >= QUICKSHAPE_LOCK_HOLD_MS) {
        next = { ...next, points: regularizeQuickShapePoints(match.kind, anchored) };
        quickShapeLockedRef.current = true;
      }
      drawingRef.current = next;
      scheduleDraft(next);
      return;
    }

    if (!quickShapeLockedRef.current && elapsed >= QUICKSHAPE_LOCK_HOLD_MS) {
      const kind = current.kind as QuickShapeKind;
      const locked = regularizeQuickShapePoints(kind, current.points as [number, number, number, number]);
      const next = { ...current, points: locked };
      drawingRef.current = next;
      quickShapeLockedRef.current = true;
      scheduleDraft(next);
    }
  }
  function onStageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (e.target.name() === "symmetry-handle" || e.target.name() === "guide-line-handle" || e.target.name() === "vp-handle") {
      return;
    }
    // 색상 휠 롱프레스 무장 — 조건을 전부 만족할 때만 타이머를 건다. 이 블록은 return하지
    // 않는다(관찰만 함) — 아래 기존 분기들(스포이드/크롭/드로잉/마퀴 등)은 오늘과 동일하게
    // 그대로 실행된다. 타이머가 실제로 발화(450ms 정지 유지)했을 때만 openColorWheelAt 이
    // disarmAllPixelTools 로 그 사이 진행된 제스처(마퀴 시작 등)를 되돌린다.
    if (
      tool === "select" &&
      !isSpacePressed &&
      !cropRect &&
      !panelSplitActive &&
      !nodeEditTool &&
      !smudgeActive &&
      !healCloneTool &&
      !eyedropperActive &&
      !bubbleAnchorPickActive &&
      !pixelTool &&
      !quickShapeActive &&
      !colorWheelOpen &&
      recentColors.length > 0 &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      if (clientPoint) {
        colorWheelPressRef.current = clientPoint;
        colorWheelTimerRef.current = setTimeout(() => {
          colorWheelTimerRef.current = null;
          openColorWheelAt(clientPoint.x, clientPoint.y);
        }, COLOR_WHEEL_LONG_PRESS_MS);
      }
    }
    // 스포이드: 토글 버튼으로 무장했거나(한 번 뽑으면 자동 해제), 펜 도구 중 Alt 를 누른 momentary
    // 방식(CSP/Photoshop 관례) — 다른 어떤 캔버스 제스처보다 항상 최우선으로 가로챈다.
    if (eyedropperActive || (tool === "draw" && e.evt.altKey && !healCloneArmed)) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const hex = pickCanvasColorAt(pos);
        if (hex) setColor(hex);
      }
      if (eyedropperActive) setEyedropperActive(false);
      return;
    }
    // 말풍선 꼬리 자동 부착 — 대상 픽커 무장 중: 다음 클릭으로 부착 대상(요소 또는 빈 좌표)을
    // 고른다. 스포이드와 동일하게 항상 1회성으로 해제.
    if (bubbleAnchorPickActive) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      setBubbleAnchorPickActive(false);
      if (pos && selected?.type === "bubble") {
        const clickedId = studioElementIdOf(e.target);
        if (clickedId && clickedId === selected.id) {
          setError("말풍선 자기 자신은 부착 대상으로 고를 수 없어요.");
        } else if (clickedId) {
          patchEl(selected.id, { tailAnchorId: clickedId, tailAnchorPoint: undefined } as Partial<El>);
        } else {
          patchEl(selected.id, { tailAnchorPoint: { x: pos.x, y: pos.y }, tailAnchorId: undefined } as Partial<El>);
        }
      }
      return;
    }
    // 크롭 모드 무장 중: 스테이지 드래그를 크롭 rect 조작(핸들 리사이즈/이동)으로 가로챈다.
    // 아래 픽셀 선택보다 먼저 검사한다 — 크롭 진입 시 픽셀 도구를 끄지만, 혹시 겹치면 크롭 우선.
    // 트랜스포머 앵커·Space 팬은 픽셀 선택과 동일하게 예외(크롭 rect 는 정규화라 리사이즈를 따라간다).
    if (
      cropRect &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      const handle = hitTestCropHandle(p, cropRect, cropHitTolerance(frame, 14 / effScale));
      if (handle) {
        cropDragRef.current = { elId: selected.id, frame, session: beginCropDrag(cropRect, handle, p) };
      }
      return; // 핸들 밖이어도 크롭 모드 중엔 마퀴·드로잉 등 다른 스테이지 제스처를 막는다.
    }
    // 패널 손그림 컷 무장 중: 스테이지 드래그를 절단선 그리기로 가로챈다. FrameEl 은 회전이
    // 없으므로(항상 캔버스 절대좌표) crop 처럼 정규화 좌표 변환이 필요 없다.
    if (panelSplitArmed && !isSpacePressed && !(e.target.getParent() instanceof KonvaRuntime.Transformer)) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      panelSplitDragRef.current = beginPanelSplitDrag(selected.id, { x: pos.x, y: pos.y });
      panelSplitLastLineRef.current = null;
      setPanelSplitHint(null);
      return; // 크롭/픽셀 선택과 동일하게 다른 스테이지 제스처(마퀴·드로잉 등)를 막는다.
    }
    // 벡터 노드 편집 무장 중: 핸들 히트테스트 후 드래그 세션을 연다. 무장 중엔 핸들 밖 클릭도
    // 마퀴 등 다른 제스처를 막는다 — crop/pixel 과 동일 정책.
    if (
      nodeEditArmed &&
      selected?.type === "draw" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const tolerance = 14 / effScale; // 화면 14px, crop 의 hitTolerance 관례와 동일
      const hitIdx = hitTestNodeHandle(pos, nodeEditHandles, tolerance);
      if (hitIdx !== null) {
        const session = beginNodeDrag(selected.points, selected.pressures, hitIdx, nodeEditTool!, pos);
        if (session) nodeEditDragRef.current = { elId: selected.id, session };
      }
      return;
    }
    // 문지르기 브러시 무장 중: 스테이지 드래그를 문지르기 스트로크 좌표 누적으로 가로챈다.
    if (
      smudgeArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      smudgeDragRef.current = { elId: selected.id, frame, points: [canvasPointToNormalized(pos.x, pos.y, frame)] };
      return;
    }
    // 레이어 마스크 브러시 무장 중: 스테이지 드래그를 마스크 스트로크 좌표 누적으로 가로챈다.
    // maskSrc가 아직 없어도 드래그를 시작할 수 있다(bakeLayerMaskStroke가 없으면 "전체 보임"
    // 흰 마스크를 자동으로 베이스 삼는다 — Photoshop이 마스크 없는 레이어에 처음 브러시를 대면
    // 자동으로 흰 마스크를 추가하는 관례와 동일).
    if (
      layerMaskPaintArmed &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      layerMaskDragRef.current = { elId: selected.id, frame, points: [p] };
      scheduleLayerMaskDragPreview({ points: [p] });
      return;
    }
    // 복구 브러시/도장 무장 중: Alt(Option)+클릭은 소스 앵커 지정, 일반 드래그는 페인트 스트로크.
    // crop/픽셀 선택과 동일한 정책 — 무장 중엔 다른 캔버스 제스처를 막는다. healCloneBusy 가드는
    // 직전 스트로크의 비동기 굽기가 끝나기 전에 새 스트로크를 시작해 patchEl 갱신이 서로를 덮어쓰는
    // (lost-update) 경쟁을 막는다.
    if (
      healCloneArmed &&
      !healCloneBusy &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      const p = canvasPointToNormalized(pos.x, pos.y, frame);
      if (e.evt.altKey) {
        setHealCloneSourceAnchor(p);
        healCloneOffsetRef.current = null; // 새 앵커 지정 시 정렬 오프셋을 다음 스트로크에서 재계산.
        return;
      }
      if (!healCloneSourceAnchor) return; // 패널 상태 문구가 이미 "Alt+클릭으로 지정" 안내 중.
      const offset =
        healCloneAligned && healCloneOffsetRef.current
          ? healCloneOffsetRef.current
          : computeHealCloneSourceOffset(healCloneSourceAnchor, p);
      healCloneOffsetRef.current = offset;
      const radiusNorm = healCloneRadius / Math.max(1, selected.width);
      healCloneDragRef.current = { elId: selected.id, frame, offset, radiusNorm, points: [p] };
      scheduleHealCloneDragPreview({ points: [p] });
      return;
    }
    // 픽셀 선택 도구 무장 중: 스테이지 드래그를 픽셀 선택 그리기로 가로챈다(요소 이동·마퀴·
    // 드로잉보다 우선). 트랜스포머 앵커는 예외(선택이 정규화 좌표라 리사이즈/회전을 따라간다),
    // Space 팬도 예외. 시작점은 이미지 밖이어도 된다(rect/ellipse 는 0..1 로 클램프).
    if (
      pixelTool &&
      selected?.type === "image" &&
      !isSpacePressed &&
      !(e.target.getParent() instanceof KonvaRuntime.Transformer)
    ) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const frame: SelectionFrame = {
        x: selected.x,
        y: selected.y,
        width: selected.width,
        height: selected.height,
        rotation: selected.rotation,
      };
      if (pixelTool === "wand") {
        void runMagicWandSelect(pos, frame);
        return;
      }
      // 브러시는 캔버스 px 반경을 요소 폭 기준 정규화 반경으로 넘긴다(다른 도구는 무시됨).
      const brushRadiusNorm = pixelBrushRadius / Math.max(1, selected.width);
      const drag = beginSelectionDrag(pixelTool, pixelCombine, canvasPointToNormalized(pos.x, pos.y, frame), brushRadiusNorm);
      pixelDragRef.current = { elId: selected.id, frame, drag };
      schedulePixelDragPreview(drag);
      return;
    }
    if (tool === "draw") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      setSelectedId(null);
      
      const rawPressure = (e.evt as { pressure?: number }).pressure;
      const hasHardwarePressure = typeof rawPressure === "number" && rawPressure > 0 && rawPressure !== 0.5;
      const basePressure = hasHardwarePressure ? rawPressure : 0.8;
      const pressure = Math.pow(basePressure, pressureCurve);

      const common = {
        id: uid(),
        type: "draw" as const,
        stroke: color,
        strokeWidth,
        opacity: brushOpacity,
        brush: drawMode === "pen" ? brush : undefined,
        symmetry: symmetryType !== "none" ? {
          type: symmetryType,
          centerX: symmetryCenterX,
          centerY: symmetryCenterY,
          radialCount: symmetryRadialCount,
        } : undefined,
      };
      const next: DrawEl =
        drawMode === "shape"
          ? {
              ...common,
              kind: drawShape,
              mode: "pen",
              points: [pos.x, pos.y, pos.x, pos.y],
              fill: shapeFill && drawShape !== "line" ? color : undefined,
              pressures: [pressure, pressure],
            }
          : {
              ...common,
              kind: "freehand",
              mode: drawMode,
              points: [pos.x, pos.y],
              pressures: [pressure],
            };
      drawingRef.current = next;
      perspectiveRayRef.current = null; // 새 스트로크마다 원근 락을 다시 잡는다(첫 move에서 재계산).
      isometricAxisRayRef.current = null; // 새 스트로크마다 아이소메트릭 축 락도 다시 잡는다.
      setDraft(next);
      if (drawMode === "pen" && quickShapeActive) startQuickShapeTracking({ x: pos.x, y: pos.y });
      else stopQuickShapeTracking(); // 방어적 — 이전 스트로크 타이머 잔존 방지
      return;
    }
    // 선택 모드: 빈 영역에서 드래그하면 마퀴(PPT식 박스) 다중선택, 그냥 클릭이면 선택 해제.
    if (e.target === e.target.getStage() || e.target.name() === "bg") {
      setSelectedId(null);
      setMarqueeIds([]);
      if (!isSpacePressed) {
        const pos = e.target.getStage()?.getRelativePointerPosition();
        if (pos) {
          marqueeStartRef.current = { x: pos.x, y: pos.y };
          clearMarqueePreview();
        }
      }
    }
  }
  // 복구 브러시/도장 호버 커서(브러시 원 + 소스 크로스헤어) — brushCursorRef 와 동일하게
  // ref 를 직접 갱신해 리렌더 없이 따라오게 한다. 드래그 중에도 계속 호출된다.
  function updateHealCloneCursorNodes(destNorm: SelPoint, frame: SelectionFrame) {
    const cursor = healCloneCursorRef.current;
    const srcCursor = healCloneSourceCursorRef.current;
    if (!cursor) return;
    const destCanvas = normalizedPointToCanvas(destNorm, frame);
    cursor.position(destCanvas);
    cursor.radius(healCloneRadius / effScale);
    if (!cursor.visible()) cursor.visible(true);
    if (srcCursor) {
      if (healCloneOffsetRef.current) {
        const srcNorm = healCloneSourcePoint(healCloneOffsetRef.current, destNorm);
        srcCursor.position(normalizedPointToCanvas(srcNorm, frame));
        if (!srcCursor.visible()) srcCursor.visible(true);
      } else {
        srcCursor.visible(false);
      }
    }
    cursor.getLayer()?.batchDraw();
  }
  function onStageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    // 색상 휠 롱프레스 타이머가 아직 대기 중인데 임계값(6px) 넘게 움직였으면 드래그/클릭으로
    // 보고 취소한다. colorWheelOpen 이 이미 true 인 동안은 오버레이가 캔버스를 덮어 이 핸들러
    // 자체가 더 안 불리므로 별도 가드가 필요 없다.
    if (colorWheelTimerRef.current && colorWheelPressRef.current) {
      const clientPoint = getClientPointFromKonvaEvent(e.evt);
      if (clientPoint) {
        const dx = clientPoint.x - colorWheelPressRef.current.x;
        const dy = clientPoint.y - colorWheelPressRef.current.y;
        if (shouldCancelLongPress(dx, dy)) {
          clearTimeout(colorWheelTimerRef.current);
          colorWheelTimerRef.current = null;
        }
      }
    }
    // 크롭 드래그 중이면 rect 를 갱신한다(시작 시점 스냅샷 기준 — 증분 오차 없음, RAF 합침).
    if (cropDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = cropDragRef.current;
        const next = updateCropDrag(session.session, canvasPointToNormalized(pos.x, pos.y, session.frame), {
          ratio: cropAspectRatio(cropAspect),
          frameAspect: session.frame.height > 0 ? session.frame.width / session.frame.height : 1,
        });
        scheduleCropRect(next);
      }
      return;
    }
    // 패널 손그림 컷 드래그 중이면 절단선 미리보기를 갱신한다.
    if (panelSplitDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      const session = panelSplitDragRef.current;
      const frame = elements.find((el) => el.id === session.targetFrameId);
      if (pos && frame && frame.type === "frame") {
        const line: PanelSplitLine = { a: session.start, b: { x: pos.x, y: pos.y } };
        panelSplitLastLineRef.current = line;
        const preview = previewPanelSplit({ frame, line, gutterPx: panelGutter });
        schedulePanelSplitPreview(preview);
      }
      return;
    }
    // 벡터 노드 편집 드래그 중이면 점 위치/굵기 초안을 갱신한다. 매 틱마다 커밋된 el.points/
    // pressures 기준으로 재계산한다(직전 draft 가 아니라) — updateNodeDragMove 의 "시작 스냅샷+델타"
    // 설계와 일치, crop 의 updateCropDrag 와 동일한 무누적오차 패턴.
    if (nodeEditDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const { elId, session } = nodeEditDragRef.current;
        const el = elementById.get(elId);
        if (el && el.type === "draw") {
          if (session.tool === "move") {
            const { x, y } = updateNodeDragMove(session, pos);
            scheduleNodeEditDraft({
              elId,
              points: withPointMoved(el.points, session.pointIndex, x, y),
              pressures: el.pressures ?? [],
            });
          } else {
            const pressure = updateNodeDragWidth(session, pos, NODE_EDIT_WIDTH_DRAG_RANGE_PX / effScale);
            scheduleNodeEditDraft({
              elId,
              points: el.points,
              pressures: withPressureEdited(el.pressures, Math.floor(el.points.length / 2), session.pointIndex, pressure),
            });
          }
        }
      }
      return;
    }
    // 픽셀 선택 드래그 중이면 궤적/박스를 갱신한다(시작 시점 프레임 스냅샷 기준 좌표 변환).
    // 올가미는 최소 간격 미만이면 같은 상태를 돌려주므로 그때는 RAF 예약도 건너뛴다.
    if (pixelDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = pixelDragRef.current;
        const next = updateSelectionDrag(session.drag, canvasPointToNormalized(pos.x, pos.y, session.frame));
        if (next !== session.drag) {
          session.drag = next;
          schedulePixelDragPreview(next);
        }
      }
      return;
    }
    // 문지르기 드래그 중이면 좌표를 누적한다(최소 간격 미만은 스킵 — 과밀 포인트 방지).
    if (smudgeDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = smudgeDragRef.current;
        const next = canvasPointToNormalized(pos.x, pos.y, session.frame);
        const last = session.points[session.points.length - 1];
        if (!last || Math.hypot(next.x - last.x, next.y - last.y) >= 0.002) session.points.push(next);
      }
      return;
    }
    // 레이어 마스크 브러시 드래그 중이면 좌표를 누적한다(브러시 간격 기반 최소 거리 필터 —
    // heal-clone과 동일한 appendBrushPoint 재사용).
    if (layerMaskDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = layerMaskDragRef.current;
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        const radiusNorm = layerMaskRadius / Math.max(1, session.frame.width);
        const nextPoints = appendBrushPoint(session.points, p, radiusNorm);
        if (nextPoints !== session.points) {
          session.points = nextPoints;
          scheduleLayerMaskDragPreview({ points: nextPoints });
        }
      }
      return;
    }
    // 복구 브러시/도장 드래그 중이면 좌표를 누적한다(브러시 간격 기반 최소 거리 필터).
    if (healCloneDragRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const session = healCloneDragRef.current;
        const p = canvasPointToNormalized(pos.x, pos.y, session.frame);
        updateHealCloneCursorNodes(p, session.frame);
        const nextPoints = appendBrushPoint(session.points, p, session.radiusNorm);
        if (nextPoints !== session.points) {
          session.points = nextPoints;
          scheduleHealCloneDragPreview({ points: nextPoints });
        }
      }
      return;
    }
    // 마퀴 드래그 중이면 선택 박스를 갱신한다.
    if (marqueeStartRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const s = marqueeStartRef.current;
        scheduleMarqueeRect(normalizeMarqueeRect(s.x, s.y, pos.x, pos.y));
      }
      return;
    }
    // 커서 프리뷰: 드로잉/문지르기/복구브러시 세 무장 상태는 disarmAllPixelTools로 서로
    // 상호배제되지만 tool("select"|"draw")은 독립된 축이라(이미지 선택 + 스머지 켬 + tool="draw"가
    // 동시에 성립 가능), 셋 다 조건이 참일 수 있는 경우를 else if 로 묶어 한 프레임에 커서 하나만
    // (그리고 batchDraw 한 번만) 갱신되게 한다 — onStageDown 의 armed 우선순위(smudge/healClone이
    // draw 브러시보다 우선)와 동일 순서.
    if (smudgeArmed) {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      const cursorNode = smudgeCursorRef.current;
      if (cursorPos && cursorNode) {
        cursorNode.position(cursorPos);
        if (!cursorNode.visible()) cursorNode.visible(true);
        cursorNode.getLayer()?.batchDraw();
      }
    } else if (layerMaskPaintArmed) {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      const cursorNode = layerMaskCursorRef.current;
      if (cursorPos && cursorNode) {
        cursorNode.position(cursorPos);
        if (!cursorNode.visible()) cursorNode.visible(true);
        cursorNode.getLayer()?.batchDraw();
      }
    } else if (healCloneArmed && selected?.type === "image") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const frame: SelectionFrame = {
          x: selected.x,
          y: selected.y,
          width: selected.width,
          height: selected.height,
          rotation: selected.rotation,
        };
        updateHealCloneCursorNodes(canvasPointToNormalized(pos.x, pos.y, frame), frame);
      }
    } else if (tool === "draw") {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      const cursorNode = brushCursorRef.current;
      if (cursorPos && cursorNode) {
        cursorNode.position(cursorPos);
        if (!cursorNode.visible()) cursorNode.visible(true);
        cursorNode.getLayer()?.batchDraw();
      }
    }
    if (tool !== "draw" || !drawingRef.current) return;
    const kind = drawingRef.current.kind ?? "freehand";
    if (drawMode === "pen") {
      // QuickShape 정지-감지용 포인터 위치 — freehand 누적 경로와 도형-드래그 경로 둘 다에서
      // 실행돼야 하므로 kind 분기 이전에 넣는다(각 분기가 이후 자체적으로 위치를 다시 얻는 것과
      // 별개 — getRelativePointerPosition 은 가벼운 조회라 중복 호출 비용은 무시할 만하다).
      const qsPos = e.target.getStage()?.getRelativePointerPosition();
      if (qsPos) noteQuickShapePointerMoved(qsPos);
    }
    if (kind === "freehand") {
      const stage = e.target.getStage();
      if (!stage) return;
      // getCoalescedEvents 로 브라우저가 병합해 버렸던 실제 하드웨어 포인터 이벤트들을 복원한다.
      // 빠르게 움직일수록 pointermove 는 한 프레임에 하나만 오지만, 그사이 실제로는 펜/마우스가
      // 여러 지점을 지나쳤다 — 그 중간점들을 다시 스트로크에 반영하면 빠른 스트로크가 각지지
      // 않고 매끈해진다(네이티브 저지연 엔진과의 격차를 좁히는 유의미한 최적화). 미지원 브라우저
      // (Safari 등)는 getCoalescedEvents 자체가 없으므로 현재 이벤트 하나만 처리해 기존과 동일.
      const nativeEvt = e.evt as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
      const coalesced = typeof nativeEvt.getCoalescedEvents === "function" ? nativeEvt.getCoalescedEvents() : [];
      const events = coalesced.length > 0 ? coalesced : [nativeEvt];
      for (const ev of events) {
        // Konva 는 Stage 컨테이너 rect 기준 clientX/clientY 로 좌표를 계산한다 — coalesced 이벤트도
        // 같은 브라우저 좌표계이므로 이 공개 API로 임시 포인터 위치를 갱신해 재사용할 수 있다.
        stage.setPointersPositions(ev);
        const p = stage.getRelativePointerPosition();
        if (p) appendFreehandStrokePoint(p, (ev as { pressure?: number }).pressure);
      }
      // 마지막으로 실제(최신) 이벤트 기준 포인터 위치로 stage 를 복원 — 브러시 커서 등 다른 로직이
      // 이 틱 이후 stage.getPointerPosition() 을 참조해도 어긋나지 않는다.
      stage.setPointersPositions(nativeEvt);
      return;
    }
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const current = drawingRef.current;
    const x0 = current.points[0] ?? pos.x;
    const y0 = current.points[1] ?? pos.y;
    let x1 = pos.x;
    let y1 = pos.y;
    // 원근자: 직선 도구에서만, Shift 스냅과는 배타적(Shift가 우선 — 수평/수직/45°는 사용자의
    // 명시적 의도이므로 원근 락보다 존중한다).
    if (perspectiveRulerActive && kind === "line" && !e.evt.shiftKey && vanishingPoints.length > 0) {
      if (!perspectiveRayRef.current) {
        perspectiveRayRef.current = resolvePerspectiveRay(vanishingPoints, x0, y0, x1, y1);
      }
      [x1, y1] = snapStrokePointToPerspective(x1, y1, perspectiveRayRef.current);
    } else if (isometricGridActive && kind === "line" && !e.evt.shiftKey) {
      // 아이소메트릭 그리드: 원근자와 동일한 우선순위 관례(Shift가 최우선). 축 방향은 원점과
      // 무관하게 고정이라 원근자의 vanishingPoints.length > 0 같은 가드는 필요 없다.
      if (!isometricAxisRayRef.current) {
        isometricAxisRayRef.current = resolveIsometricAxisRay(isometricAngleDeg, x0, y0, x1, y1);
      }
      [x1, y1] = snapStrokePointToIsometricGrid(x1, y1, isometricAxisRayRef.current);
    }
    // Shift: 정사각형/정원/정별, 선은 수평·수직·45° 스냅.
    if (e.evt.shiftKey) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      if (kind === "line") {
        if (Math.abs(dx) > Math.abs(dy) * 2) y1 = y0;
        else if (Math.abs(dy) > Math.abs(dx) * 2) x1 = x0;
        else {
          const s = Math.max(Math.abs(dx), Math.abs(dy));
          x1 = x0 + Math.sign(dx || 1) * s;
          y1 = y0 + Math.sign(dy || 1) * s;
        }
      } else {
        const s = Math.max(Math.abs(dx), Math.abs(dy));
        x1 = x0 + Math.sign(dx || 1) * s;
        y1 = y0 + Math.sign(dy || 1) * s;
      }
    }
    const next = { ...current, points: [x0, y0, x1, y1] };
    drawingRef.current = next;
    scheduleDraft(next);
  }
  // 자유선 스트로크에 점 하나를 추가한다(압력 계산 + 원근 스냅 + 손떨림 보정 + 최소간격 필터) —
  // onStageMove 에서 getCoalescedEvents 로 얻은 이벤트마다 이 함수를 반복 호출해 여러 점을
  // 한 번에 누적한다(단일 pointermove 당 한 번 호출해도 기존과 동일하게 동작).
  function appendFreehandStrokePoint(pos: { x: number; y: number }, rawPressure: number | undefined) {
    const current = drawingRef.current;
    if (!current) return;
    const hasHardwarePressure = typeof rawPressure === "number" && rawPressure > 0 && rawPressure !== 0.5;

    let pressure: number;
    if (hasHardwarePressure && !useVelocityPressure) {
      pressure = Math.pow(rawPressure, pressureCurve);
    } else if (useVelocityPressure && current.points.length >= 2) {
      const lastX = current.points[current.points.length - 2]!;
      const lastY = current.points[current.points.length - 1]!;
      const dx = pos.x - lastX;
      const dy = pos.y - lastY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const maxDist = 28;
      const speedRatio = Math.min(1, dist / maxDist);
      const factor = velocitySensitivity * 0.75;
      const base = 1.0 - speedRatio * factor;
      pressure = Math.pow(base, pressureCurve);
    } else {
      const base = typeof rawPressure === "number" && rawPressure > 0 ? rawPressure : 0.5;
      pressure = Math.pow(base, pressureCurve);
    }

    let targetX = pos.x;
    let targetY = pos.y;
    if (perspectiveRulerActive && current.mode !== "eraser" && vanishingPoints.length > 0) {
      // 스트로크 시작점 기준으로 소실점 하나를 골라(가장 가까운 방향) 락을 걸고, 이후 포인트를
      // 그 직선 위로 투영한다. 락은 onStageDown/onStageUp에서 스트로크 경계마다 초기화된다.
      if (!perspectiveRayRef.current) {
        const startX = current.points[0] ?? pos.x;
        const startY = current.points[1] ?? pos.y;
        perspectiveRayRef.current = resolvePerspectiveRay(vanishingPoints, startX, startY, pos.x, pos.y);
      }
      [targetX, targetY] = snapStrokePointToPerspective(targetX, targetY, perspectiveRayRef.current);
    } else if (isometricGridActive && current.mode !== "eraser") {
      if (!isometricAxisRayRef.current) {
        const startX = current.points[0] ?? pos.x;
        const startY = current.points[1] ?? pos.y;
        isometricAxisRayRef.current = resolveIsometricAxisRay(isometricAngleDeg, startX, startY, pos.x, pos.y);
      }
      [targetX, targetY] = snapStrokePointToIsometricGrid(targetX, targetY, isometricAxisRayRef.current);
    }
    if (stabilizer > 0 && current.points.length >= 2) {
      // 손떨림 보정 1단계: 입력 시점 끌림 보정(순수 함수, studio-brush) — 원근 투영 다음 단계.
      const lastX = current.points[current.points.length - 2]!;
      const lastY = current.points[current.points.length - 1]!;
      [targetX, targetY] = stabilizePoint(lastX, lastY, targetX, targetY, stabilizer);
    }

    const lastX = current.points[current.points.length - 2] ?? targetX;
    const lastY = current.points[current.points.length - 1] ?? targetY;
    if (!shouldAppendStrokePoint(lastX, lastY, targetX, targetY)) return;
    const next: DrawEl = {
      ...current,
      points: [...current.points, targetX, targetY],
      pressures: current.pressures ? [...current.pressures, pressure] : [pressure],
    };
    drawingRef.current = next;
    scheduleDraft(next);
  }
  function onStageUp() {
    stopQuickShapeTracking(); // 무조건 실행 — 어느 분기로 빠지든 인터벌이 새지 않게 한다.
    // 색상 휠 롱프레스 타이머가 아직 안 터졌는데 포인터를 뗐다 — 평범한 클릭/드래그였다는 뜻이니
    // 타이머만 정리한다(이미 열려 있었다면 오버레이가 이벤트를 가로채서 애초에 여기까지 안 온다).
    if (colorWheelTimerRef.current) {
      clearTimeout(colorWheelTimerRef.current);
      colorWheelTimerRef.current = null;
    }
    // 크롭 드래그 종료 — 마지막 RAF 대기분을 반영하고 세션만 닫는다(rect 는 적용 전까지 유지).
    if (cropDragRef.current) {
      cropDragRef.current = null;
      flushCropRect();
      return;
    }
    // 패널 손그림 컷 드래그 종료 — 마지막 절단선으로 실제 분할을 확정한다. 도구는 계속 무장된
    // 채로 둔다(크롭과 달리 의도적 — 연속으로 여러 컷을 이어서 그릴 수 있게).
    if (panelSplitDragRef.current) {
      const session = panelSplitDragRef.current;
      panelSplitDragRef.current = null;
      flushPanelSplitPreview();
      const line = panelSplitLastLineRef.current;
      const frame = elements.find((el) => el.id === session.targetFrameId);
      if (line && frame && frame.type === "frame") {
        const plan = planPanelSplit({ frame, line, gutterPx: panelGutter });
        if (plan) {
          // frame 을 먼저 펼치고 plan.shape* 로 덮어써야 shapeA/B 의 항상-존재하는 points 키(뒤집힌
          // 사각형일 때도 undefined 로 명시)가 원본 frame 의 남은 points 를 확실히 지운다.
          const shapeA = { ...frame, ...plan.shapeA, id: uid() };
          const shapeB = { ...frame, ...plan.shapeB, id: uid() };
          commit([...elements.filter((e) => e.id !== frame.id), shapeA, shapeB]);
          setSelectedId(shapeA.id);
        } else {
          setPanelSplitHint(
            panelSplitPreview
              ? "여백을 적용하면 한쪽 칸이 너무 작아져요. 여백을 줄이거나 더 넓게 갈라보세요."
              : "선이 패널을 가로지르지 않았어요. 패널 양쪽 변을 관통하도록 다시 그어보세요."
          );
        }
      }
      panelSplitLastLineRef.current = null;
      setPanelSplitPreview(null);
      return;
    }
    // 벡터 노드 편집 드래그 종료 — 커밋은 이 pointerup 틱에서 바로 일어나므로(리렌더를 기다리는
    // crop 의 "적용" 버튼과 다름) nodeEditDraft state 가 아니라 항상-최신인 ref 를 읽는다. state 를
    // 읽으면 React 의 비동기 업데이트 때문에 드래그의 마지막 프레임을 놓칠 수 있다.
    if (nodeEditDragRef.current) {
      const { elId } = nodeEditDragRef.current;
      nodeEditDragRef.current = null;
      if (nodeEditRafRef.current !== null) {
        globalThis.cancelAnimationFrame(nodeEditRafRef.current);
        nodeEditRafRef.current = null;
      }
      const finalDraft = pendingNodeEditDraftRef.current;
      pendingNodeEditDraftRef.current = null;
      setNodeEditDraft(null);
      if (finalDraft && finalDraft.elId === elId && elementById.get(elId)?.type === "draw") {
        patchEl(elId, { points: finalDraft.points, pressures: finalDraft.pressures } as Partial<El>);
      }
      return;
    }
    // 픽셀 선택 드래그 종료: 의미 있는 면적이면 서브패스로 결합(찰나 클릭은 변화 없음 = null).
    if (pixelDragRef.current) {
      const session = pixelDragRef.current;
      pixelDragRef.current = null;
      clearPixelDragPreview();
      setPixelSel((prev) => commitSelectionDrag(prev, session.drag) ?? prev);
      return;
    }
    // 문지르기 드래그 종료 — 누적된 좌표로 실제 픽셀 스트로크를 적용한다.
    if (smudgeDragRef.current) {
      const session = smudgeDragRef.current;
      smudgeDragRef.current = null;
      if (session.points.length >= 2) void applySmudgeStroke(session.elId, session.points);
      return;
    }
    // 레이어 마스크 브러시 드래그 종료 — 누적된 좌표로 실제 마스크 스트로크를 굽는다.
    if (layerMaskDragRef.current) {
      const session = layerMaskDragRef.current;
      layerMaskDragRef.current = null;
      clearLayerMaskDragPreview();
      if (session.points.length > 0) void bakeLayerMaskPaintStroke(session);
      return;
    }
    // 복구 브러시/도장 드래그 종료 — 누적된 좌표로 dab 목록을 계산해 굽는다.
    if (healCloneDragRef.current) {
      const session = healCloneDragRef.current;
      healCloneDragRef.current = null;
      clearHealCloneDragPreview();
      if (session.points.length > 0) void bakeHealCloneDragStroke(session);
      return;
    }
    // 마퀴 드래그 종료: 박스와 겹치는(숨김·아닌) 요소를 한꺼번에 선택.
    if (marqueeStartRef.current) {
      const rect = pendingMarqueeRectRef.current ?? marqueeRect;
      marqueeStartRef.current = null;
      clearMarqueePreview();
      if (rect && rect.w > 3 && rect.h > 3) {
        const ids = selectIdsByMarquee(
          elements,
          (el) => elBounds(el),
          rect,
          { include: (el) => !el.hidden }
        );
        setMarqueeIds(ids);
        setSelectedId(null);
      }
      return;
    }
    if (drawingRef.current && isCompleteDrawOp(drawingRef.current)) {
      let finished = drawingRef.current;
      // 손떨림 보정 2단계: 프리핸드 스트로크 확정 시 이동평균 스무딩(점 개수·필압 정렬 보존).
      if ((finished.kind ?? "freehand") === "freehand" && stabilizer > 0) {
        finished = { ...finished, points: smoothStrokePoints(finished.points, stabilizer) };
      }
      commit([...elements, finished]);
    }
    drawingRef.current = null;
    perspectiveRayRef.current = null;
    isometricAxisRayRef.current = null;
    clearDraftPreview();
  }
  // 포인터가 캔버스를 벗어나면 브러시 커서 프리뷰를 숨긴다.
  function hideBrushCursor() {
    const cursorNode = brushCursorRef.current;
    if (cursorNode && cursorNode.visible()) {
      cursorNode.visible(false);
      cursorNode.getLayer()?.batchDraw();
    }
  }
  function hideSmudgeCursor() {
    const cursorNode = smudgeCursorRef.current;
    if (cursorNode && cursorNode.visible()) {
      cursorNode.visible(false);
      cursorNode.getLayer()?.batchDraw();
    }
  }
  function hideHealCloneCursors() {
    const cursor = healCloneCursorRef.current;
    const srcCursor = healCloneSourceCursorRef.current;
    if (cursor?.visible()) cursor.visible(false);
    if (srcCursor?.visible()) srcCursor.visible(false);
    cursor?.getLayer()?.batchDraw();
  }
  function hideLayerMaskCursor() {
    const cursorNode = layerMaskCursorRef.current;
    if (cursorNode && cursorNode.visible()) {
      cursorNode.visible(false);
      cursorNode.getLayer()?.batchDraw();
    }
  }

  // 드래그 중 정렬 스냅: 요소의 좌/중앙/우(상/중앙/하) 가장자리를 캔버스·들어있는 패널의
  // 같은 기준선에 끌어붙이고, 맞은 기준선을 가이드로 그린다. (Stage로 버블된 단일 핸들러)
  function onStageDragMove(e: Konva.KonvaEventObject<DragEvent>) {
    const node = e.target;
    const stage = node.getStage();
    if (!node || node === stage) return;
    if (node.getParent() instanceof KonvaRuntime.Transformer) return; // 트랜스포머 앵커(리사이즈)는 제외
    const layer = node.getLayer();
    if (!layer) return;

    // 다중선택 그룹 이동: 끄는 노드(좌표형)의 이동량을 나머지 선택 노드에 실시간 적용(draw·잠금 제외).
    const draggedId = studioElementIdOf(node);
    if (draggedId && marqueeIds.length > 1 && marqueeIds.includes(draggedId)) {
      const draggedEl = elementById.get(draggedId);
      if (draggedEl && draggedEl.type !== "draw" && !draggedEl.locked) {
        const g = groupDragRef.current;
        if (!g || g.id !== draggedId) {
          groupDragRef.current = { id: draggedId, x0: node.x(), y0: node.y(), lastX: node.x(), lastY: node.y() };
        } else {
          const ddx = node.x() - g.lastX;
          const ddy = node.y() - g.lastY;
          if (ddx !== 0 || ddy !== 0) {
            for (const id of marqueeIds) {
              if (id === draggedId) continue;
              const oel = elementById.get(id);
              if (!oel || oel.type === "draw" || oel.locked) continue;
              const other = nodeRefs.current[id];
              if (other) {
                other.x(other.x() + ddx);
                other.y(other.y() + ddy);
              }
            }
            g.lastX = node.x();
            g.lastY = node.y();
          }
        }
      }
    }

    if (!snapEnabled) {
      applyGuides([], []);
      applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
      return;
    }

    const box = node.getClientRect({ relativeTo: layer });
    const snap = 8 / effScale; // 화면상 ~8px

    // 스냅 기준선: 캔버스 가장자리·중앙 + (있으면)들어있는 패널 가장자리·중앙
    const vLines = [0, CANVAS_W / 2, CANVAS_W];
    const hLines = [0, canvasH / 2, canvasH];

    // 작가 수동 가이드선 추가
    for (const guide of userGuides) {
      if (guide.type === "v") vLines.push(guide.pos);
      else hLines.push(guide.pos);
    }

    if (showGrid) {
      for (let x = gridSize; x < CANVAS_W; x += gridSize) {
        if (Math.abs(x - CANVAS_W / 2) > 1) vLines.push(x);
      }
      for (let y = gridSize; y < canvasH; y += gridSize) {
        if (Math.abs(y - canvasH / 2) > 1) hLines.push(y);
      }
    }
    let panel: FrameEl | null = null;
    const boxCenterX = box.x + box.width / 2;
    const boxCenterY = box.y + box.height / 2;
    for (const candidate of elements) {
      if (
        candidate.type === "frame" &&
        !candidate.hidden &&
        boxCenterX >= candidate.x &&
        boxCenterX <= candidate.x + candidate.width &&
        boxCenterY >= candidate.y &&
        boxCenterY <= candidate.y + candidate.height
      ) {
        panel = candidate;
        break;
      }
    }
    if (panel) {
      vLines.push(panel.x, panel.x + panel.width / 2, panel.x + panel.width);
      hLines.push(panel.y, panel.y + panel.height / 2, panel.y + panel.height);
    }

    const edgesX = [box.x, box.x + box.width / 2, box.x + box.width];
    const edgesY = [box.y, box.y + box.height / 2, box.y + box.height];
    let dx = 0;
    let gx: number | null = null;
    let bestX = snap;
    for (const line of vLines)
      for (const edge of edgesX) {
        const dist = Math.abs(line - edge);
        if (dist < bestX) {
          bestX = dist;
          dx = line - edge;
          gx = line;
        }
      }
    let dy = 0;
    let gy: number | null = null;
    let bestY = snap;
    for (const line of hLines)
      for (const edge of edgesY) {
        const dist = Math.abs(line - edge);
        if (dist < bestY) {
          bestY = dist;
          dy = line - edge;
          gy = line;
        }
      }
    // ── 요소 간 스마트 가이드(PPT급): 엣지/센터 정렬 + 균등 간격 스냅 ──
    // 다른 요소들의 bbox를 O(n)으로 모아(숨김·함께 끌리는 다중선택군 제외) 후보를 구하고,
    // 축별로 캔버스/그리드 라인 스냅과 요소 스냅 중 더 가까운 쪽을 채택한다(동률이면 요소 우선).
    let smartOthers: GuideBox[] | null = null;
    if (draggedId) {
      const groupDragging = marqueeIds.length > 1 && marqueeIds.includes(draggedId);
      smartOthers = [];
      for (const el of elements) {
        if (el.id === draggedId || isEffectivelyHidden(el, groups)) continue;
        if (groupDragging && marqueeIds.includes(el.id)) continue;
        const otherNode = nodeRefs.current[el.id];
        if (otherNode) {
          const r = otherNode.getClientRect({ relativeTo: layer });
          smartOthers.push({ id: el.id, x: r.x, y: r.y, width: r.width, height: r.height });
        } else {
          const r = elBounds(el);
          smartOthers.push({ id: el.id, x: r.x, y: r.y, width: r.w, height: r.h });
        }
      }
      const movingBox: GuideBox = { id: draggedId, x: box.x, y: box.y, width: box.width, height: box.height };
      const smart = computeSmartSnap(movingBox, smartOthers, { threshold: SMART_SNAP_THRESHOLD / effScale });
      if (smart.x && smart.x.dist <= bestX) {
        dx = smart.x.delta;
        gx = null;
      }
      if (smart.y && smart.y.dist <= bestY) {
        dy = smart.y.delta;
        gy = null;
      }
    }
    if (dx !== 0) node.x(node.x() + dx);
    if (dy !== 0) node.y(node.y() + dy);
    // 스냅 확정 위치 기준으로 요소 정렬 선분·균등 간격 배지를 그린다(그리드/캔버스 스냅
    // 결과가 우연히 요소와 정렬된 경우도 함께 드러난다 — PPT 동작).
    if (smartOthers && draggedId) {
      const movedBox: GuideBox = { id: draggedId, x: box.x + dx, y: box.y + dy, width: box.width, height: box.height };
      applySmartGuides(buildSmartGuideOverlay(movedBox, smartOthers, { epsilon: SMART_GUIDE_EPSILON / effScale }));
    } else {
      applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
    }
    applyGuides(gx != null ? [gx] : [], gy != null ? [gy] : []);
  }
  function onStageDragEnd() {
    applyGuides([], []);
    applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY);
    // 그룹 이동 확정: 끈 노드의 총 이동량(delta)을 선택된 좌표형 요소 모두에 한 번에 커밋.
    const g = groupDragRef.current;
    groupDragRef.current = null;
    if (g && marqueeIds.length > 1) {
      const dnode = nodeRefs.current[g.id];
      if (dnode) {
        const dx = dnode.x() - g.x0;
        const dy = dnode.y() - g.y0;
        if (dx !== 0 || dy !== 0) {
          const mv = new Set(marqueeIds);
          const next = elements.map((el) =>
            !mv.has(el.id) || el.locked || el.type === "draw"
              ? el
              : ({ ...el, x: (el as { x: number }).x + dx, y: (el as { y: number }).y + dy } as El)
          );
          commit(next);
        }
      }
    }
  }

  function startEditText(id: string) {
    const el = elementById.get(id);
    if (!el || (el.type !== "text" && el.type !== "bubble" && el.type !== "sticker")) return;
    setEditing({ id, value: el.text });
  }




  function commitEditText() {
    if (editing) {
      const el = elementById.get(editing.id);
      // 말풍선은 텍스트가 넘치지 않게 높이를 자동 확장(수동으로 키운 크기는 보존).
      let height: number | undefined;
      if (el && el.type === "bubble") {
        const measure = new KonvaRuntime.Text({
          text: editing.value || " ",
          width: el.width - 36,
          fontSize: el.fontSize ?? 24,
          fontFamily: el.font ?? "Pretendard, sans-serif",
          align: "center",
          lineHeight: el.lineHeight ?? 1.1,
        });
        height = Math.max(el.height, Math.ceil(measure.height()) + 28);
        measure.destroy();
      }
      patchEl(editing.id, { text: editing.value, ...(height !== undefined ? { height } : {}) } as Partial<El>);
    }
    setEditing(null);
  }

  async function handleSave(status: "published" | "draft") {
    if (!loggedIn) {
      setError("로그인 후 게시할 수 있어요.");
      return;
    }
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    setSelectedId(null);
    setIsExporting(true);
    // 트랜스포머가 캡처되지 않도록 한 프레임 양보.
    await new Promise((r) => setTimeout(r, 60));
    try {
      const stage = stageRef.current;
      if (!stage) throw new Error("캔버스를 찾을 수 없어요.");

      const pageImages: string[] = [];
      const originalPageId = currentPageId;

      for (const page of pages) {
        setCurrentPageId(page.id);
        // React-Konva의 상태 반영 및 렌더링 주기를 대기
        await new Promise((r) => setTimeout(r, 120));
        const dataUrl = stage.toDataURL({ pixelRatio: 1 / effScale });
        pageImages.push(dataUrl);
      }

      // 복구
      setCurrentPageId(originalPageId);
      await new Promise((r) => setTimeout(r, 60));

      const cover = await downscaleDataUrl(pageImages[0] || "", 480);
      const tags = tagsText
        .split(/[,\s]+/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 8);
      const payload = {
        title: title.trim(),
        description: description.trim(),
        tags,
        format: "cuttoon" as const,
        titleId: linkedTitleId ?? undefined,
        cover,
        pages: pageImages,
        doc: {
          width: CANVAS_W,
          pagesList: pages,
          // 문서 마스터(공통 요소) — 비어 있으면 undefined 로 JSON 에서 키가 떨어진다(하위호환).
          master: serializeDocumentMaster(master),
          currentPageId,
          webtoonTheme,
          panelGutter,
        } as Record<string, unknown>,
        status,
        remixFromId: (!workId && remixId) ? remixId : undefined,
        seriesId: linkedSeriesId ?? undefined,
        challengeId: linkedChallengeId ?? undefined,
      };
      const { createWork, updateWork } = await import("@/src/infrastructure/creator-client");
      const work = workId ? await updateWork(workId, payload) : await createWork(payload);
      
      try {
        localStorage.removeItem("toonspectrum-studio-autosave");
      } catch {
        // 무시
      }

      setSaving(false);
      setIsExporting(false);
      navigate(`/create/${work.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
      setSaving(false);
      setIsExporting(false);
    }
  }

  // 터치 기기(작은 폰)에서는 도구 버튼을 키워 thumb 로 누르기 쉽게 한다(pointer-coarse: h-10).
  // 데스크톱(fine pointer)은 기존 컴팩트 h-9 유지 — 정밀 조작·공간 효율.
  const toolBtn = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors pointer-coarse:h-10 pointer-coarse:px-3 pointer-coarse:text-[0.8125rem]",
      active ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
    );

  // 모바일 하단 보조 막대 버튼(페이지/추가/속성/줌) — 아이콘 + 작은 라벨 세로 스택.
  const mobileBarBtn = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[0.68rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
      active ? "bg-accent-soft/60 text-accent" : "text-fg-2 hover:bg-raised"
    );

  // 모바일 하단 '드로잉 도구' 버튼 — 한 손 조작용 큰 터치 타깃(>=44px). 활성 도구는 감귤색으로 또렷하게.
  const mobileDrawToolBtn = (active: boolean) =>
    cn(
      "flex min-h-[2.875rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1 text-[0.66rem] font-semibold leading-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
      active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised active:bg-raised"
    );

  async function handleDownload() {
    const watermarkForExport = ensureWatermarkLoaded();
    setExportMenuOpen(false);
    setSelectedId(null);
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 60));
    const stage = stageRef.current;
    if (!stage) {
      setIsExporting(false);
      return;
    }
    // 투명 내보내기: 배경 사각형을 잠시 숨겨 콘텐츠만 추출(에셋 제작용). PNG·WebP만 알파 지원, JPG는 불가.
    const transparent = exportTransparent && exportFormat !== "jpg";
    const bgNode = transparent ? stage.findOne(".bg") : null;
    if (bgNode) {
      bgNode.hide();
      stage.batchDraw();
    }
    // 선택 배율로 내보내기(기본 2× — 720→1440px 폭). dataURL 대신 캔버스→Blob으로 대형 출력 메모리 절감.
    const rawCanvas = stage.toCanvas({ pixelRatio: exportScale / effScale });
    // 미리보기에 적용된 페이지 색보정을 출력 픽셀에도 동일하게 합성(WYSIWYG).
    const canvas = bakeGradeIntoCanvas(rawCanvas, pageGrade);
    if (bgNode) {
      bgNode.show();
      stage.batchDraw();
    }
    drawWatermarkOnCanvas(canvas, watermarkForExport);
    setIsExporting(false);
    try {
      const { canvasToBlob, downloadBlob, exportMimeType, exportQuality, pageExportFileName } = await import("./studio-export");
      const blob = await canvasToBlob(canvas, exportMimeType(exportFormat), exportQuality(exportFormat));
      downloadBlob(blob, pageExportFileName(title, exportFormat, transparent));
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 내보내기에 실패했어요.");
    }
  }

  // 현재 페이지를 클립보드에 이미지(PNG)로 복사 — 색보정 합성 후 ClipboardItem으로 기록.
  async function handleCopyToClipboard() {
    const watermarkForExport = ensureWatermarkLoaded();
    setExportMenuOpen(false);
    setSelectedId(null);
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 60));
    const stage = stageRef.current;
    if (!stage) {
      setIsExporting(false);
      return;
    }
    const rawCanvas = stage.toCanvas({ pixelRatio: exportScale / effScale });
    const canvas = bakeGradeIntoCanvas(rawCanvas, pageGrade);
    drawWatermarkOnCanvas(canvas, watermarkForExport);
    setIsExporting(false);
    try {
      const { copyCanvasToClipboard } = await import("./studio-export");
      await copyCanvasToClipboard(canvas);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "클립보드 복사에 실패했어요.");
    }
  }

  async function handleDownloadAll(spacing = 24) {
    const watermarkForExport = ensureWatermarkLoaded();
    setExportMenuOpen(false);
    const {
      MAX_CANVAS_DIM,
      canvasToBlob,
      downloadBlob,
      exportMimeType,
      exportQuality,
      maxFittingScale,
      splitPagesForExport,
      stripExportFileName,
      stripTotalHeight,
    } = await import("./studio-export");
    // 합성 전 캔버스 한계 가드: 총 높이×배율이 한계를 넘으면 빈 PNG가 조용히 저장되므로
    // 분할 저장 또는 배율 자동 하향 중 하나를 먼저 고른다.
    const pageHeights = pages.map((p) => p.canvasH);
    let scale: number = exportScale;
    let wantSplit = false;
    if (stripTotalHeight(pageHeights, spacing, scale) > MAX_CANVAS_DIM) {
      const fitScale = maxFittingScale(pageHeights, spacing, scale);
      const plannedParts = splitPagesForExport(pageHeights, spacing, scale).length;
      if (fitScale !== null) {
        wantSplit = globalThis.confirm(
          `${scale}×로 한 장에 합치면 브라우저 캔버스 한계(약 ${MAX_CANVAS_DIM.toLocaleString()}px)를 넘어요.\n` +
            `확인: ${plannedParts}개 파일로 나눠 저장 / 취소: ${fitScale}×로 낮춰 한 파일로 저장`
        );
        if (!wantSplit) scale = fitScale;
      } else {
        if (
          !globalThis.confirm(
            `페이지가 길어 ${scale}× 한 파일로는 저장할 수 없어요.\n${plannedParts}개 파일로 나눠 저장할까요?`
          )
        ) {
          return;
        }
        wantSplit = true;
      }
    }

    setSelectedId(null);
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 60));
    const originalPageId = currentPageId;
    const pageCanvases: HTMLCanvasElement[] = [];

    try {
      // 모든 페이지를 순회하며 렌더링하고 캔버스로 캡처(dataURL 미사용 — 대형 출력 메모리 절감)
      for (const page of pages) {
        setCurrentPageId(page.id);
        // React 렌더링 및 Konva 업데이트 대기
        await new Promise((resolve) => setTimeout(resolve, 180));

        const stage = stageRef.current;
        if (!stage) continue;

        // 페이지별 색보정을 캡처 픽셀에 합성(스트립 각 칸이 미리보기와 동일하게 보이도록).
        const rawPageCanvas = stage.toCanvas({ pixelRatio: scale / effScale });
        pageCanvases.push(bakeGradeIntoCanvas(rawPageCanvas, normalizePageGrade(page.grade)));
      }
    } finally {
      // 원래 선택 페이지 복구
      setCurrentPageId(originalPageId);
      setIsExporting(false);
    }

    if (pageCanvases.length === 0) return;

    // 분할 시 실제 캡처된 픽셀 높이로 다시 묶는다(이미 배율이 반영된 값이라 scale=1).
    const chunks = wantSplit
      ? splitPagesForExport(pageCanvases.map((c) => c.height), spacing * scale, 1)
      : [pageCanvases.map((_, i) => i)];

    try {
      for (let c = 0; c < chunks.length; c++) {
        const chunk = chunks[c];
        // 긴 스크롤 웹툰 합성용 캔버스 생성
        const compositeCanvas = document.createElement("canvas");
        const width = pageCanvases[chunk[0]].width;
        let totalHeight = 0;
        for (let i = 0; i < chunk.length; i++) {
          totalHeight += pageCanvases[chunk[i]].height;
          if (i < chunk.length - 1) totalHeight += spacing * scale; // 고해상도 배율 보정
        }

        compositeCanvas.width = width;
        compositeCanvas.height = totalHeight;

        const ctx = compositeCanvas.getContext("2d");
        if (!ctx) return;

        // 전체 흰색 배경
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, totalHeight);

        let currentY = 0;
        for (const idx of chunk) {
          ctx.drawImage(pageCanvases[idx], 0, currentY);
          currentY += pageCanvases[idx].height + spacing * scale;
        }

        // 워터마크/서명을 합성한 뒤 파일 저장(분할 시 -1of2 식 접미사)
        drawWatermarkOnCanvas(compositeCanvas, watermarkForExport);
        const blob = await canvasToBlob(
          compositeCanvas,
          exportMimeType(exportFormat),
          exportQuality(exportFormat)
        );
        downloadBlob(blob, stripExportFileName(title, exportFormat, { index: c, total: chunks.length }));
        // 연속 다운로드가 브라우저에서 차단되지 않게 한 박자 쉼
        if (c < chunks.length - 1) await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 내보내기에 실패했어요.");
    }
  }

  // 플랫폼 규격 슬라이스 내보내기용 페이지 캡처 — handleDownload/handleDownloadAll과 같은
  // 캡처 경로(stage.toCanvas + 색보정 합성)를 재사용한다. 리샘플·분할·저장은 내보내기 패널
  // (exportPresetSlices)이 수행하고, 워터마크도 슬라이스 단위로 그쪽에서 찍는다(중복 방지).
  async function handleCapturePagesForPreset(scope: "current" | "all"): Promise<HTMLCanvasElement[]> {
    setSelectedId(null);
    setIsExporting(true);
    await new Promise((r) => setTimeout(r, 60));
    const captured: HTMLCanvasElement[] = [];
    try {
      if (scope === "current" || pages.length <= 1) {
        const stage = stageRef.current;
        if (stage) {
          const raw = stage.toCanvas({ pixelRatio: exportScale / effScale });
          captured.push(bakeGradeIntoCanvas(raw, pageGrade));
        }
      } else {
        const originalPageId = currentPageId;
        try {
          for (const page of pages) {
            setCurrentPageId(page.id);
            // React 렌더링 및 캔버스 업데이트 대기(기존 handleDownloadAll과 동일 리듬)
            await new Promise((resolve) => setTimeout(resolve, 180));
            const stage = stageRef.current;
            if (!stage) continue;
            const raw = stage.toCanvas({ pixelRatio: exportScale / effScale });
            captured.push(bakeGradeIntoCanvas(raw, normalizePageGrade(page.grade)));
          }
        } finally {
          setCurrentPageId(originalPageId);
        }
      }
    } finally {
      setIsExporting(false);
    }
    return captured;
  }

  // 타임랩스 — pagesHi를 히스토리 인덱스로 스크러빙하며 각 단계를 캡처(handleSave와 동일한 렌더
  // 대기 리듬). 녹화가 끝나면 원래 보고 있던 히스토리 위치로 되돌린다.
  async function captureTimelapseStep(historyIndex: number, targetWidth: number): Promise<MotionCutImage> {
    setPagesHi(historyIndex);
    await new Promise((r) => setTimeout(r, 120));
    const stage = stageRef.current;
    if (!stage) throw new Error("캔버스를 찾을 수 없어요.");
    const pixelRatio = targetWidth / CANVAS_W / effScale;
    const canvas = stage.toCanvas({ pixelRatio });
    return { source: canvas, width: canvas.width, height: canvas.height };
  }

  function handleTimelapseRecordingStart() {
    timelapseOriginalHiRef.current = pagesHi;
    setTimelapseCapturing(true);
  }

  function handleTimelapseRecordingEnd() {
    setPagesHi(timelapseOriginalHiRef.current);
    setTimelapseCapturing(false);
  }

  // 현재 페이지 → 벡터 SVG 직렬화(요소 데이터 필요라 여기서 조립). 다운로드·고지는 내보내기 패널이 담당.
  function exportCurrentPageToSvg(): SvgExportResult {
    return exportPageToSvg({
      width: CANVAS_W,
      height: canvasH,
      bg,
      bgGrad,
      transparentBg: exportTransparent,
      elements: elements as unknown as readonly SvgExportEl[],
      groups,
      theme: webtoonTheme,
    });
  }

  // 현재 페이지 → 요소별 레이어를 가진 PSD. exportPagePsd 는 숨김 요소를 스스로 거르지 않으므로
  // (숨긴 요소는 렌더 시점에 Konva 노드 자체가 없어 캡처가 불가능 — 모듈 JSDoc 계약) 여기서
  // isEffectivelyHidden 기준으로 미리 걸러 넘긴다.
  function exportCurrentPageToPsd(): Promise<PsdExportResult> {
    const visible = elements.filter((el) => !isEffectivelyHidden(el, groups));
    return exportPagePsd(stageRef.current as unknown as Konva.Stage, visible as unknown as PsdExportEl[], CANVAS_W, canvasH, effScale, {
      scale: exportScale,
      background: { color: bg, gradient: bgGrad },
    });
  }

  // 스튜디오 프로젝트 내보내기 (.json)
  function handleExportProject() {
    const projectData = {
      version: "1.0",
      title: title,
      linkedTitleId: linkedTitleId,
      pages: pages,
      // 문서 마스터(공통 요소) — 비어 있으면 undefined 로 키가 떨어진다(과거 파일과 동일 형태).
      master: serializeDocumentMaster(master),
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.trim() || "toonspectrum-studio-project"}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // 스튜디오 프로젝트 불러오기 (.json)
  function handleImportProject(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const projectData = JSON.parse(text);
        
        if (!projectData.pages || !Array.isArray(projectData.pages)) {
          alert("올바르지 않은 프로젝트 파일 형식입니다.");
          return;
        }

        // 히스토리에 새 페이지 상태 추가하여 undo/redo와 호환되게 함
        const nextHistory = pagesHistory.slice(0, pagesHi + 1);
        nextHistory.push(projectData.pages);
        setPagesHistory(nextHistory);
        setPagesHi(nextHistory.length - 1);

        if (projectData.title) {
          setTitle(projectData.title);
        }
        // 프로젝트 파일의 문서 마스터 복원(없으면 빈 마스터로 교체 — 문서 단위 일관성).
        setMaster(normalizeDocumentMaster(projectData.master) as DocumentMaster<El>);
        alert("프로젝트 불러오기가 완료되었습니다!");
      } catch (err) {
        console.error(err);
        alert("프로젝트 파일을 읽는 도중 오류가 발생했습니다.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div
      ref={studioRootRef}
      className={cn(
        isFullscreen && "min-h-screen overflow-y-auto bg-canvas",
        maximized && "fixed inset-0 z-[60] overflow-y-auto bg-canvas"
      )}
    >
    <Container size="wide" className={cn("py-3 lg:py-6", !(isFullscreen || maximized) && "xl:max-w-[1700px] 2xl:max-w-[2200px]", (isFullscreen || maximized) && "max-w-none", maximized && "px-3 py-3")}>
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3 lg:mb-4">
        <div>
          {/* 모바일: 제목 축소 + 설명문 숨김(캔버스 세로 공간 확보). 데스크톱은 기존 그대로. */}
          <h1 className="text-lg font-bold tracking-tight lg:text-2xl">창작 스튜디오</h1>
          <p className="mt-1 hidden text-sm text-fg-3 lg:block">
            이미지·말풍선·스티커·펜으로 컷툰을 만들고 창작 게시판에 올려보세요.
            {linkedTitleId && <span className="ml-1 text-accent">· 웹툰 팬 창작으로 연결됨</span>}
          </p>
        </div>
        {/* 모바일: 액션 버튼을 한 줄 가로 스크롤로 압축(모든 기능 유지하되 세로를 잡아먹지 않게). 데스크톱은 wrap. */}
        <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:max-w-none lg:flex-wrap lg:overflow-visible">
          <div ref={exportMenuRef} className="relative flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => handleDownload()}
              className={buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5 pr-2" })}
              title={`현재 페이지를 ${exportScale}× ${exportFormat.toUpperCase()}로 다운로드${exportTransparent && exportFormat === "png" ? " (투명 배경)" : ""}`}
            >
              <Download size={14} /> 다운로드
              <span className="text-[10px] font-semibold tabular-nums text-fg-3">
                {exportScale}× {exportFormat.toUpperCase()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                preloadStudioExportMenuPanel();
                ensureWatermarkLoaded();
                setExportMenuOpen((open) => !open);
              }}
              onMouseEnter={preloadStudioExportMenuPanel}
              onFocus={preloadStudioExportMenuPanel}
              aria-expanded={exportMenuOpen}
              aria-label="내보내기 옵션"
              className={buttonClass({ size: "sm", variant: "quiet", className: "px-1.5" })}
              title="내보내기 옵션 (배율·포맷·투명 배경)"
            >
              <ChevronDown size={13} className={cn("transition-transform", exportMenuOpen && "rotate-180")} />
            </button>
            {exportMenuOpen && (
              <Suspense
                fallback={
                  <div className="fixed inset-x-2 top-48 z-30 max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-xl border border-line bg-panel p-3 text-xs text-fg-3 shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-72 sm:max-h-none sm:overflow-visible">
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
                  pageCount={pages.length}
                  pageLabels={pages.map((p, idx) => pageDisplayName(p, idx))}
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
              </Suspense>
            )}
          </div>
          {pages.length > 1 && (
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
          <button type="button" onClick={handleExportProject} className={buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5" })} title="편집 중인 모든 레이아웃과 요소를 .json 파일로 PC에 저장">
            <Download size={14} /> 백업 (.json)
          </button>
          <label className={cn(buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5" }), "cursor-pointer")} title="백업해둔 .json 파일을 불러와 작업을 이어함">
            <Upload size={14} /> 복구 (.json)
            <input type="file" accept=".json" className="hidden" onChange={handleImportProject} />
          </label>
          {loadedWork ? (
            <button
              type="button"
              onClick={() => setFxPanelOpen(true)}
              className={buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap gap-1.5" })}
              title="이미 게시된 이 작품의 배경음악·스크롤 모션·컷별 애니메이션 연출을 설정합니다"
            >
              <Music4 size={14} /> 애니메이션 연출
            </button>
          ) : null}
          <button type="button" onClick={() => handleSave("draft")} disabled={saving} className={buttonClass({ size: "sm", variant: "quiet", className: "shrink-0 whitespace-nowrap" })}>
            임시저장
          </button>
          <button type="button" onClick={() => handleSave("published")} disabled={saving} className={buttonClass({ size: "sm", variant: "solid", className: "shrink-0 whitespace-nowrap gap-1.5" })}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {workId ? "수정 게시" : "게시하기"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>
      )}
      {!loggedIn && (
        <div className="mb-3 rounded-xl border border-line bg-card/60 px-3 py-2 text-sm text-fg-2">
          만든 작품을 게시하려면 로그인이 필요해요. (편집은 로그인 없이도 가능)
        </div>
      )}
      <StudioPublishContextBanner context={publishContext} />

      {/* 툴바 */}
      {/* 데스크톱: wrap 유지(아래로 열리는 팝오버가 가로 스크롤 컨테이너에 잘리지 않도록).
          모바일: 한 줄 가로 스크롤로 압축해 캔버스 세로 공간을 확보한다(여러 줄 wrap이 화면을 잡아먹지 않게).
          이때 각 메뉴 팝오버는 모바일에서 fixed 로 뜨므로 overflow 스크롤에 잘리지 않는다(아래 메뉴들 참조). */}
      {/* 모바일은 backdrop-blur 를 빼고 불투명 bg-panel 을 쓴다 — backdrop-filter 는 fixed 자식의 containing block 을 만들어
          메뉴 팝오버(fixed)가 이 가로 스크롤 도구막대 안에 갇혀(overflow 클리핑) 안 보이게 되기 때문. 데스크톱은 기존 blur 유지. */}
      <div className="sticky top-2 z-30 mb-3 flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-2xl border border-line bg-panel p-2 [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:z-20 lg:flex-wrap lg:overflow-visible lg:bg-panel/80 lg:backdrop-blur">
        {/* 모바일: 가로 스크롤 가능 힌트(좌측 페이드). 데스크톱에선 숨김. */}
        <span aria-hidden className="pointer-events-none sticky left-0 -ml-2 h-9 w-2 shrink-0 self-stretch bg-gradient-to-r from-panel/80 to-transparent lg:hidden" />
        <div ref={menu === "template" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "template" ? null : "template")} aria-haspopup="menu" aria-expanded={menu === "template"} className={toolBtn(menu === "template")}>
            <LayoutTemplate size={14} /> 템플릿
          </button>
          {menu === "template" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 grid max-h-[calc(100dvh-9.5rem)] w-auto gap-1.5 overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-80 lg:w-64 lg:max-w-[calc(100vw-1.5rem)] lg:shadow-lg">
              {TEMPLATE_GROUPS.map((group) => (
                <div key={group.group} className="grid gap-1">
                  <p className="px-1 text-[0.66rem] font-semibold uppercase tracking-wide text-fg-3">{group.group}</p>
                  {group.templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-raised"
                    >
                      <span className="font-medium text-fg">{t.label}</span>
                      <span className="text-fg-3">{t.hint}</span>
                    </button>
                  ))}
                </div>
              ))}
              {/* 코미Po!식 정형 컷 레이아웃 — 프레임(+말풍선)을 한 번에 배치 */}
              <div className="grid gap-1 border-t border-line pt-1.5">
                <p className="px-1 text-[0.66rem] font-semibold uppercase tracking-wide text-fg-3">컷 템플릿 · 정형 레이아웃</p>
                {panelLayoutsLoading && panelLayoutPresets.length === 0 && (
                  <p className="rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">컷 레이아웃을 불러오는 중...</p>
                )}
                {panelLayoutsError && (
                  <p className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">{panelLayoutsError}</p>
                )}
                {panelLayoutPresets.map((layout) => (
                  <button
                    key={layout.id}
                    type="button"
                    onClick={() => applyPanelLayout(layout)}
                    className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-raised"
                  >
                    <span className="font-medium text-fg">{layout.label}</span>
                    <span className="text-fg-3">{layout.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <button type="button" onClick={addFrame} className={toolBtn(false)}>
          <Plus size={14} /> + 패널 추가
        </button>
        <button type="button" onClick={addDiagonalSplit} className={toolBtn(false)} title="기울어진 분할선의 두 패널을 한 번에 추가">
          <span className="text-[13px] leading-none">◩</span> 사선 컷
        </button>
        {selected?.type === "frame" && (
          <button
            type="button"
            onClick={toggleSelectedFrameDiagonal}
            className={toolBtn(Boolean(selected.points))}
            title="선택한 패널을 사선(평행사변형)↔사각형으로"
          >
            <span className="text-[13px] leading-none">◪</span> {selected.points ? "직선화" : "사선화"}
          </button>
        )}
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button type="button" onClick={() => setTool("select")} className={toolBtn(tool === "select")} aria-pressed={tool === "select"}>
          <MousePointer2 size={14} /> 선택
        </button>
        <button
          type="button"
          onClick={() => {
            setTool("draw");
            setDrawMode("pen");
            setMenu(null);
          }}
          className={toolBtn(tool === "draw" && drawMode === "pen")}
          aria-pressed={tool === "draw" && drawMode === "pen"}
        >
          <Pencil size={14} /> 펜
        </button>
        <button
          type="button"
          onClick={() => {
            setTool("draw");
            setDrawMode("eraser");
            setMenu(null);
          }}
          className={toolBtn(tool === "draw" && drawMode === "eraser")}
          aria-pressed={tool === "draw" && drawMode === "eraser"}
        >
          <Eraser size={14} /> 지우개
        </button>
        <button
          type="button"
          onClick={() => {
            if (!selected || selected.type !== "image") return;
            if (!selected.frames || selected.frames.length === 0) {
              const firstId = uid();
              patchEl(selected.id, {
                frames: [{ id: firstId, src: selected.src }],
                frameFps: DEFAULT_FRAME_FPS,
                frameLoop: true,
                activeFrameId: firstId,
              });
            }
            capturedElementIdsRef.current = new Set(elements.map((e) => e.id));
            setFrameAnimTargetId(selected.id);
            setFrameAnimOpen((v) => (frameAnimTargetId === selected.id ? !v : true));
          }}
          disabled={selected?.type !== "image"}
          className={cn(toolBtn(frameAnimOpen && frameAnimTargetId === selected?.id), "disabled:opacity-40")}
          title={selected?.type !== "image" ? "이미지를 선택하면 프레임 애니메이션을 만들 수 있어요" : "선택한 이미지를 프레임별로 그려 애니메이션으로 만들기"}
        >
          <Film size={14} /> 프레임 애니메이션
        </button>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button
          type="button"
          onClick={() => setPoserVrmOpen(true)}
          className={cn(toolBtn(poserVrmOpen), "text-accent border border-accent/20 bg-accent-soft/30 hover:bg-accent-soft/50")}
          title="3D 캐릭터 생성 및 포즈 설정"
        >
          <Sparkles size={14} /> 3D 캐릭터
        </button>
        <button
          type="button"
          onClick={() => setVrmCreatorOpen(true)}
          className={cn(toolBtn(vrmCreatorOpen), "text-accent border border-accent/20 bg-accent-soft/30 hover:bg-accent-soft/50")}
          title="무료 베이스 캐릭터를 골라 색상·의상·체형을 커스터마이즈해 내 캐릭터 만들기"
        >
          <UserRound size={14} /> 캐릭터 만들기
        </button>
        <button
          type="button"
          onClick={() => setBg3dOpen(true)}
          className={cn(toolBtn(bg3dOpen), "text-accent border border-accent/20 bg-accent-soft/30 hover:bg-accent-soft/50")}
          title="3D 배경 블록아웃 만들기"
        >
          <Boxes size={14} /> 3D 배경
        </button>
        <button
          type="button"
          onClick={() => setReferencePanelOpen((v) => !v)}
          onMouseEnter={preloadStudioReferencePanel}
          onFocus={preloadStudioReferencePanel}
          className={cn(toolBtn(referencePanelOpen), "text-accent border border-accent/20 bg-accent-soft/30 hover:bg-accent-soft/50")}
          aria-pressed={referencePanelOpen}
          title="참고 이미지 패널 — 그리는 동안 옆에 이미지를 띄워두기"
        >
          <PictureInPicture2 size={14} /> 참고 이미지
        </button>
        <div ref={menu === "bgScene" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "bgScene" ? null : "bgScene")} aria-haspopup="menu" aria-expanded={menu === "bgScene"} className={toolBtn(menu === "bgScene")}>
            <ImageIcon size={14} /> 배경 씬
          </button>
          {menu === "bgScene" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-80 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">2D 배경 씬</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                배경을 누르면 모든 패널에 적용돼요. 특정 컷만 바꾸려면 그 패널을 먼저 선택하세요.
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
                <input
                  type="text"
                  placeholder="배경 씬 검색..."
                  value={bgSceneSearchQuery}
                  onChange={(e) => setBgSceneSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
                />
                {bgSceneSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setBgSceneSearchQuery("")}
                    aria-label="검색어 지우기" className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-fg-3 hover:text-fg-2 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {studioOptionalAssets.bgSceneSections.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {["all", ...studioOptionalAssets.bgSceneSections.map((group) => group.genre)].map((genre) => (
                    <button
                      key={genre}
                      type="button"
                      onClick={() => setBgSceneGenreFilter(genre)}
                      aria-pressed={bgSceneGenreFilter === genre}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.66rem] font-medium transition-colors",
                        bgSceneGenreFilter === genre ? "border-accent bg-accent text-white" : "border-line bg-card text-fg-3 hover:bg-raised"
                      )}
                    >
                      {genre === "all" ? "전체" : genre}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                {studioBgSceneAssetsLoading && !studioBgSceneAssetsLoaded && (
                  <p className="rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">배경 씬을 불러오는 중...</p>
                )}
                {studioBgSceneAssetsError && (
                  <p className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">
                    {studioBgSceneAssetsError}
                  </p>
                )}
                {studioOptionalAssets.bgSceneSections.length > 0 && bgSceneSectionsFiltered.length === 0 && (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                    <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
                    <p className="mt-1 text-[0.66rem] text-fg-3 leading-normal">다른 검색어로 찾아보세요.</p>
                  </div>
                )}
                {bgSceneSectionsFiltered.map((group) => (
                  <div key={group.genre}>
                    <p className="mb-1 px-0.5 text-[0.66rem] font-semibold uppercase tracking-wide text-fg-3">{group.genre}</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {group.scenes.map((bg) => (
                        <button
                          key={bg.id}
                          type="button"
                          title={bg.label}
                          onClick={() => addBgScene(bg)}
                          className="group relative overflow-hidden rounded-lg border border-line bg-card p-1 text-left hover:border-accent/50"
                        >
                          <div className="h-16 w-full overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                            <img src={resolveAssetUrl(bg.imgSrc || svgToDataUrl(bg.svg || ""))} alt={bg.label} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                          <span className="block text-center text-[0.66rem] text-fg-2 font-medium mt-1 truncate">{bg.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div ref={menu === "tone" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "tone" ? null : "tone")} aria-haspopup="menu" aria-expanded={menu === "tone"} className={toolBtn(menu === "tone")}>
            <Grid2x2 size={14} /> 톤
          </button>
          {menu === "tone" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-80 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">만화 스크린톤</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                톤을 누르면 캔버스에 깔려요. 패널을 먼저 선택하면 그 칸을 덮고, 망점 크기는 칸에 맞춰 일정하게 유지됩니다.
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
                <input
                  type="text"
                  placeholder="톤 검색 (망점·선·교차선...)"
                  value={toneSearchQuery}
                  onChange={(e) => setToneSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
                />
                {toneSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setToneSearchQuery("")}
                    aria-label="검색어 지우기" className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-fg-3 hover:text-fg-2 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto pr-1">
                <Suspense fallback={<StudioPanelLoading label="톤 패널을 여는 중..." />}>
                  <StudioTonePanel onPick={(svg) => void addTone(svg)} query={toneSearchQuery} />
                </Suspense>
              </div>
            </div>
          )}
        </div>
        <div ref={menu === "emeres" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "emeres" ? null : "emeres")} aria-haspopup="menu" aria-expanded={menu === "emeres"} className={toolBtn(menu === "emeres")}>
            <PenTool size={14} /> 이메레스
          </button>
          {menu === "emeres" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-80 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">이메레스 · 스케치 밑그림 틀</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                선택한 틀이 반투명·잠금 밑그림으로 깔리고 펜 모드로 바뀌어요. 그 위에 따라 그린 뒤, 레이어 패널에서 밑그림을 숨기거나 지우세요.
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
                <input
                  type="text"
                  placeholder="이메레스 검색..."
                  value={emeresSearchQuery}
                  onChange={(e) => setEmeresSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
                />
                {emeresSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setEmeresSearchQuery("")}
                    aria-label="검색어 지우기" className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-fg-3 hover:text-fg-2 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {studioOptionalAssets.emeresSections.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1">
                  {["all", ...studioOptionalAssets.emeresSections.map((section) => section.category)].map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setEmeresCategoryFilter(category)}
                      aria-pressed={emeresCategoryFilter === category}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[0.66rem] font-medium transition-colors",
                        emeresCategoryFilter === category ? "border-accent bg-accent text-white" : "border-line bg-card text-fg-3 hover:bg-raised"
                      )}
                    >
                      {category === "all" ? "전체" : category}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                {studioEmeresAssetsLoading && !studioEmeresAssetsLoaded && (
                  <p className="rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">이메레스 틀을 불러오는 중...</p>
                )}
                {studioEmeresAssetsError && (
                  <p className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">{studioEmeresAssetsError}</p>
                )}
                {studioOptionalAssets.emeresSections.length > 0 && emeresSectionsFiltered.length === 0 && (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                    <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
                    <p className="mt-1 text-[0.66rem] text-fg-3 leading-normal">다른 검색어로 찾아보세요.</p>
                  </div>
                )}
                {emeresSectionsFiltered.map((section) => (
                  <div key={section.category}>
                    <p className="mb-1 px-0.5 text-[0.66rem] font-semibold uppercase tracking-wide text-fg-3">{section.category}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {section.templates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          title={`${t.label} — ${t.tip}`}
                          onClick={() => addEmeresTemplate(t)}
                          className="group relative overflow-hidden rounded-lg border border-line bg-card p-1 text-left hover:border-accent/50"
                        >
                          <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.96_0.006_78)] p-1">
                            <img src={svgToDataUrl(t.svg)} alt={t.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
                          </div>
                          <span className="mt-1 block truncate text-center text-[0.66rem] font-medium text-fg-2">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div ref={menu === "scene" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "scene" ? null : "scene")} aria-haspopup="menu" aria-expanded={menu === "scene"} className={toolBtn(menu === "scene")}>
            <Sparkles size={14} /> 장면
          </button>
          {menu === "scene" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-72 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">장면 템플릿 · 한 번에 깔기</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                프레임·말풍선·효과를 미리 조합한 연출을 한 번에 추가해요. 추가한 뒤 대사와 위치만 다듬으면 끝나요.
              </p>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {sceneTemplatesLoading && sceneTemplates.templates.length === 0 && (
                  <p className="rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">장면 템플릿을 불러오는 중...</p>
                )}
                {sceneTemplatesError && (
                  <p className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">{sceneTemplatesError}</p>
                )}
                {sceneTemplates.categories.map((cat) => {
                  const items = sceneTemplates.templates.filter((template) => template.category === cat.id);
                  if (items.length === 0) return null;
                  return (
                    <div key={cat.id}>
                      <p className="mb-1 px-0.5 text-[0.66rem] font-semibold uppercase tracking-wide text-fg-3">{cat.label}</p>
                      <div className="grid gap-1">
                        {items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => addSceneTemplate(t)}
                            className="rounded-lg border border-line bg-card px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-raised"
                          >
                            <span className="block text-xs font-semibold text-fg">{t.label}</span>
                            <span className="block text-[0.68rem] text-fg-3">{t.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <div ref={menu === "clip" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "clip" ? null : "clip")} aria-haspopup="menu" aria-expanded={menu === "clip"} className={toolBtn(menu === "clip")}>
            <Bookmark size={14} /> 클립
          </button>
          {menu === "clip" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-64 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">재사용 클립 보관함</p>
              <button
                type="button"
                onClick={() => void saveSelectionAsClip()}
                disabled={!selected}
                className={cn(
                  "mb-2 w-full rounded-lg py-1.5 text-xs font-semibold transition-colors",
                  selected ? "bg-accent text-on-accent hover:opacity-90" : "cursor-not-allowed bg-card text-fg-3"
                )}
                title={selected ? "선택한 요소(그룹)를 클립으로 저장" : "먼저 캔버스에서 요소를 선택하세요"}
              >
                + 선택을 클립으로 저장
              </button>
              {clips.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-3">
                  저장된 클립이 없어요. 포즈 캐릭터나 말풍선 세트를 저장해 다른 컷·회차에서 재사용하세요.
                </p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {clips.map((c) => (
                    <div key={c.id} className="flex items-center gap-1 rounded-lg border border-line bg-card px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => insertClip(c)}
                        className="min-w-0 flex-1 truncate text-left text-xs font-medium text-fg transition-colors hover:text-accent"
                        title="이 클립을 캔버스에 넣기"
                      >
                        {c.name}
                        <span className="ml-1 text-[0.66rem] text-fg-3">{(c.els as unknown[]).length}개</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteClip(c.id)}
                        aria-label={`${c.name} 클립 삭제`}
                        className="shrink-0 text-fg-3 transition-colors hover:text-bad"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div ref={menu === "palette" ? menuRef : undefined} className="relative">
          <button
            type="button"
            onClick={() => setMenu(menu === "palette" ? null : "palette")}
            aria-haspopup="menu"
            aria-expanded={menu === "palette"}
            className={toolBtn(menu === "palette")}
            title="색상 팔레트 저장·가져오기(.gpl)·내보내기"
          >
            <Palette size={14} /> 팔레트
          </button>
          {menu === "palette" && <StudioPaletteLibraryPanel onPickColor={(hex) => setColor(hex)} seedColors={recentColors} />}
        </div>
        <div ref={menu === "brandKit" ? menuRef : undefined} className="relative">
          <button
            type="button"
            onClick={() => setMenu(menu === "brandKit" ? null : "brandKit")}
            aria-haspopup="menu"
            aria-expanded={menu === "brandKit"}
            className={toolBtn(menu === "brandKit")}
            title="팔레트·글꼴·로고를 묶은 브랜드 킷 저장·적용"
          >
            <Package size={14} /> 브랜드 킷
          </button>
          {menu === "brandKit" && (
            <Suspense fallback={null}>
              <StudioBrandKitPanel
                onPickColor={(hex) => setColor(hex)}
                canApplyFont={!!selected && (selected.type === "text" || selected.type === "bubble")}
                onApplyFont={applyBrandKitFont}
                onApplyLogo={applyBrandKitLogo}
              />
            </Suspense>
          )}
        </div>
        <button type="button" onClick={addText} className={toolBtn(false)}>
          <TypeIcon size={14} /> 텍스트
        </button>
        <div ref={menu === "bubble" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "bubble" ? null : "bubble")} aria-haspopup="menu" aria-expanded={menu === "bubble"} className={toolBtn(menu === "bubble")}>
            <MessageCircle size={14} /> 말풍선
          </button>
          {menu === "bubble" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-64 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
              <div className="grid gap-1">
                {BUBBLE_VARIANTS.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => addBubble(v.id)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-raised"
                  >
                    <span className="text-base">{v.sample}</span>
                    <span className="font-medium text-fg">{v.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 border-t border-line pt-2">
                <p className="mb-1 text-[0.66rem] font-medium text-fg-3">대사 한 번에</p>
                <p className="mb-1.5 text-[0.66rem] leading-snug text-fg-3">
                  한 줄에 한 대사. <span className="text-fg-3">이름: 대사</span>로 화자 지정(좌/우 자동), <span className="text-fg-3">(지문)</span>은 나레이션.
                </p>
                <textarea
                  value={dialogueScript}
                  onChange={(e) => setDialogueScript(e.target.value)}
                  placeholder={"민수: 안녕?\n지영: 오랜만이야\n(잠시 후)"}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-line bg-card px-2 py-1.5 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/50"
                />
                <button
                  type="button"
                  onClick={() => void addDialogueBubbles()}
                  disabled={!dialogueScript.trim()}
                  className={cn(
                    "mt-1.5 w-full rounded-lg py-1.5 text-xs font-semibold transition-colors",
                    dialogueScript.trim() ? "bg-accent text-on-accent hover:opacity-90" : "cursor-not-allowed bg-card text-fg-3"
                  )}
                >
                  말풍선으로 한 번에 넣기
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null);
                    setDialogueBatchOpen(true);
                  }}
                  className="mt-1.5 w-full rounded-lg border border-line bg-card py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
                >
                  배치된 대사 일괄 편집…
                </button>
              </div>
            </div>
          )}
        </div>
        <div ref={menu === "sticker" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "sticker" ? null : "sticker")} aria-haspopup="menu" aria-expanded={menu === "sticker"} className={toolBtn(menu === "sticker")}>
            <Sparkles size={14} /> 효과
          </button>
          {menu === "sticker" && (
            <div className="fixed inset-x-2 top-[4.5rem] z-30 max-h-[calc(100dvh-9.5rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-xl lg:absolute lg:inset-x-auto lg:left-0 lg:top-full lg:mt-1 lg:max-h-none lg:w-80 lg:max-w-[calc(100vw-1.5rem)] lg:overflow-visible lg:shadow-lg">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
                <input
                  type="text"
                  placeholder="효과 검색..."
                  value={fxSearchQuery}
                  onChange={(e) => setFxSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder:text-fg-3 outline-none focus:border-accent focus:ring-1 focus:ring-accent/40 transition-colors"
                />
                {fxSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setFxSearchQuery("")}
                    aria-label="검색어 지우기" className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-fg-3 hover:text-fg-2 transition-colors"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              <div className="mb-2 flex flex-wrap gap-1">
                {FX_PICKER_SECTIONS.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setFxPickerSection(section.id)}
                    aria-pressed={fxPickerSection === section.id}
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-[0.66rem] font-medium transition-colors",
                      fxPickerSection === section.id ? "border-accent bg-accent text-white" : "border-line bg-card text-fg-3 hover:bg-raised"
                    )}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
              {sfxLoading && !sfxPacks && fxSectionVisible("sfx") && (
                <p className="mb-2 rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">효과음을 불러오는 중...</p>
              )}
              {sfxError && fxSectionVisible("sfx") && (
                <p className="mb-2 rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">{sfxError}</p>
              )}
              {fxSectionVisible("sfx") && fxSfxFiltered.length > 0 && (
                <>
                  <p className="mb-1 text-[0.66rem] font-medium text-fg-3">효과음</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {fxSfxFiltered.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => void addSfxPreset(s)}
                        title={`${s.label} · ${studioSfx.categories.find((category) => category.id === s.category)?.label ?? ""}`}
                        className="rounded-md border border-line px-2 py-1 text-xs font-bold text-fg hover:bg-raised"
                      >
                        {s.text}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {fxSectionVisible("emoji") && fxEmojisFiltered.length > 0 && (
                <>
                  <p className="mb-1 text-[0.66rem] font-medium text-fg-3">이모지</p>
                  <div className="grid grid-cols-8 gap-1 mb-2">
                    {fxEmojisFiltered.map((em) => (
                      <button key={em} type="button" onClick={() => addSticker(em)} className="rounded-md p-1 text-lg hover:bg-raised">
                        {em}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {studioStickerAssetsLoading && !studioStickerAssetsLoaded && (
                <p className="mb-2 rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">스티커 에셋을 불러오는 중...</p>
              )}
              {studioStickerAssetsError && (
                <p className="mb-2 rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">
                  {studioStickerAssetsError}
                </p>
              )}
              <Suspense fallback={<StudioPanelLoading label="스티커 패널을 여는 중..." />}>
                {fxSectionVisible("comic") && fxComicFiltered.length > 0 && (
                  <StudioStickerGrid title="만화 스티커" items={fxComicFiltered} onAdd={addFxOverlay} />
                )}
                {fxSectionVisible("creature") && fxCreatureFiltered.length > 0 && (
                  <StudioStickerGrid title="동물·캐릭터" items={fxCreatureFiltered} onAdd={addFxOverlay} />
                )}
                {fxSectionVisible("prop") && fxPropFiltered.length > 0 && (
                  <StudioStickerGrid title="소품·오브젝트" items={fxPropFiltered} onAdd={addFxOverlay} />
                )}
              </Suspense>
              {fxSectionVisible("lines") && fxLinePresetsFiltered.length > 0 && (
                <>
                  <p className="mb-1 mt-2 text-[0.66rem] font-medium text-fg-3 border-t border-line pt-2">만화 선 효과</p>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    {fxLinePresetsFiltered.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          if (preset.id === "focus") addFocusLines();
                          else addSpeedLines();
                          setMenu(null);
                        }}
                        className="flex items-center justify-center gap-1 rounded-lg border border-line bg-card py-2 text-xs font-semibold hover:border-accent/50 hover:bg-raised"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {fxSectionVisible("overlay") && fxOverlaysFiltered.length > 0 && (
                <>
                  <p className="mb-1 mt-2 text-[0.66rem] font-medium text-fg-3 border-t border-line pt-2">만화 특수 효과</p>
                  <div className="grid grid-cols-4 gap-1 max-h-40 overflow-y-auto pr-1">
                    {fxOverlaysFiltered.map((fx) => (
                      <button
                        key={fx.id}
                        type="button"
                        title={fx.label}
                        onClick={() => addFxOverlay(fx.svg, fx.width, fx.height)}
                        className="group flex flex-col items-center justify-center rounded-lg border border-line bg-card p-1 hover:border-accent/50"
                      >
                        <div className="h-10 w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800 rounded flex items-center justify-center p-0.5">
                          <img src={svgToDataUrl(fx.svg)} alt={fx.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
                        </div>
                        <span className="block text-center text-[0.55rem] text-fg-3 mt-0.5 truncate w-full">{fx.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {!fxPickerHasResults && fxQuery !== "" && (
                <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                  <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
                  <p className="mt-1 text-[0.66rem] text-fg-3 leading-normal">다른 검색어로 찾아보세요.</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div ref={menu === "asset" ? menuRef : undefined} className="relative">
          <button
            type="button"
            onClick={() => {
              preloadStudioAssetMenuPanel();
              setMenu(menu === "asset" ? null : "asset");
            }}
            onMouseEnter={preloadStudioAssetMenuPanel}
            onFocus={preloadStudioAssetMenuPanel}
            aria-haspopup="menu"
            aria-expanded={menu === "asset"}
            className={toolBtn(menu === "asset")}
          >
            <Folder size={14} /> 내 에셋
          </button>
          {menu === "asset" && (
            <Suspense
              fallback={
                <div className="fixed inset-x-2 top-48 z-30 max-h-[calc(100dvh-13rem)] overflow-y-auto rounded-xl border border-line bg-panel p-3 text-xs text-fg-3 shadow-lg sm:absolute sm:left-0 sm:right-auto sm:top-full sm:mt-1 sm:w-80 sm:max-h-none sm:overflow-visible">
                  에셋 보관함을 여는 중...
                </div>
              }
            >
              <StudioAssetMenuPanel
                assetTab={assetTab}
                setAssetTab={setAssetTab}
                onUploadAsset={onUploadAsset}
                assetPrompt={assetPrompt}
                setAssetPrompt={setAssetPrompt}
                assetPromptName={assetPromptName}
                setAssetPromptName={setAssetPromptName}
                assetPromptSize={assetPromptSize}
                setAssetPromptSize={setAssetPromptSize}
                assetPromptQuality={assetPromptQuality}
                setAssetPromptQuality={setAssetPromptQuality}
                assetGenerating={assetGenerating}
                onGenerateAsset={onGenerateAsset}
                assetSearchQuery={assetSearchQuery}
                setAssetSearchQuery={setAssetSearchQuery}
                assetSortOrder={assetSortOrder}
                setAssetSortOrder={setAssetSortOrder}
                assets={assets}
                assetsLoading={assetsLoading}
                renamingAssetId={renamingAssetId}
                setRenamingAssetId={setRenamingAssetId}
                renamingAssetName={renamingAssetName}
                setRenamingAssetName={setRenamingAssetName}
                handleRenameAsset={handleRenameAsset}
                onUseLocalAsset={(asset) => {
                  addRenderedImage(asset.dataUrl, asset.width, asset.height);
                  setMenu(null);
                }}
                onShareAsset={onShareAsset}
                onDeleteAsset={onDeleteAsset}
                publishingId={publishingId}
                shared={shared}
                sharedLoading={sharedLoading}
                sharedError={sharedError}
                loadSharedAssets={loadSharedAssets}
                onUseSharedAsset={onUseSharedAsset}
                onDeleteSharedAsset={onDeleteSharedAsset}
              />
            </Suspense>
          )}
        </div>
        <label className={cn(toolBtn(false), "cursor-pointer")} title="이미지 추가 (⌘V로 클립보드 이미지 붙여넣기 가능)">
          <ImagePlus size={14} /> 이미지
          <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </label>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <span className="inline-flex items-center gap-1.5 text-xs text-fg-3">
          색
          <LazyStudioColorPopover
            value={color}
            onChange={setColor}
            recentColors={recentColors}
            onUseColor={rememberColor}
            onLoadRecentColors={ensureRecentColorsLoaded}
            title="브러시·도형 색상"
          />
        </span>
        {tool === "draw" && (
          // 모바일: 이 인라인 브러시 바는 하단 드로잉 도구막대 + "브러시" 시트가 대체하므로 숨긴다(가로 스크롤 폭 절약·캔버스 우선).
          <div className="hidden max-w-full flex-wrap items-center gap-2 rounded-xl border border-line/70 bg-card/65 px-3 py-1.5 shadow-md lg:flex">
            {/* Brush Presets Group — 펜 전용. 지우개/도형에선 invisible로 '같은 너비·높이'를 유지해
                상위 스티키 툴바의 줄바꿈이 변하지 않게 한다(펜↔지우개 전환 시 캔버스 점프 방지).
                visibility:hidden이라 탭 포커스에서도 제외됨. */}
            {tool === "draw" && (
              <>
                <div
                  className={cn(
                    "flex items-center gap-1 bg-panel/30 rounded-lg p-0.5 border border-line/40",
                    drawMode !== "pen" && "invisible pointer-events-none"
                  )}
                  aria-label="브러시 프리셋"
                  aria-hidden={drawMode !== "pen"}
                >
                  {BRUSH_PRESETS.map((p) => {
                    const active = brush === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setBrush(p.id);
                          setStrokeWidth(p.defaultWidth);
                          setBrushOpacity(p.defaultOpacity);
                          if (p.defaultColor) {
                            setColor(p.defaultColor);
                          }
                        }}
                        className={cn(
                          "h-7 px-2 text-xs font-semibold rounded-md transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                          active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <div className={cn("mx-0.5 h-5 w-px bg-line/60", drawMode !== "pen" && "invisible")} />
              </>
            )}

            {/* Colors Group — 지우개에선 색이 의미 없지만 invisible로 너비·높이를 유지(툴바 점프 방지). */}
            {tool === "draw" && (
              <>
                <div
                  className={cn("flex items-center gap-1", drawMode === "eraser" && "invisible pointer-events-none")}
                  aria-label="브러시 색상 설정"
                  aria-hidden={drawMode === "eraser"}
                >
                  <div className="flex items-center gap-0.5" aria-label="빠른 색상">
                    {DRAW_COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setColor(swatch)}
                        title={swatch}
                        aria-label={`색상 ${swatch}`}
                        className={cn(
                          "size-5 rounded transition-transform hover:scale-110 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                          color.toLowerCase() === swatch.toLowerCase() ? "ring-2 ring-accent ring-offset-1 ring-offset-panel" : "border border-line/60"
                        )}
                        style={{ background: swatch }}
                      />
                    ))}
                  </div>
                  <div className="mx-0.5 h-4 w-px bg-line/60" />
                  <label
                    className="relative flex items-center justify-center cursor-pointer size-6 rounded-md border border-line shadow-sm overflow-hidden"
                    title="사용자 정의 색상"
                    style={{ background: color }}
                  >
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer size-full"
                    />
                    <span className="text-[9px] mix-blend-difference text-white font-bold select-none">C</span>
                  </label>
                </div>
                <div className={cn("mx-0.5 h-5 w-px bg-line/60", drawMode === "eraser" && "invisible")} />
              </>
            )}

            {/* Size & Opacity Controls */}
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-fg-3 font-medium">
                <span className="select-none">크기</span>
                <input
                  type="range"
                  min={1}
                  max={48}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="w-20 sm:w-24 accent-accent cursor-pointer"
                />
                <span className="numeral w-8 text-right text-[10px] text-fg-2 font-mono">{strokeWidth}px</span>
              </label>

              <label className="inline-flex items-center gap-1.5 text-xs text-fg-3 font-medium">
                <span className="select-none">투명도</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round(brushOpacity * 100)}
                  onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                  className="w-20 sm:w-24 accent-accent cursor-pointer"
                />
                <span className="numeral w-8 text-right text-[10px] text-fg-2 font-mono">{Math.round(brushOpacity * 100)}%</span>
              </label>
            </div>

            <div className="mx-0.5 h-5 w-px bg-line/60" />

            {/* Shapes Toggle Button */}
            <button
              type="button"
              onClick={() => setDrawAdvancedOpen((open) => !open)}
              className={cn(
                "h-8 px-2.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                drawAdvancedOpen || drawMode === "shape" ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2 hover:bg-raised"
              )}
              aria-expanded={drawAdvancedOpen}
            >
              <SlidersHorizontal size={14} />
              <span>도형 도구</span>
              <ChevronDown size={13} className={cn("transition-transform", drawAdvancedOpen && "rotate-180")} />
            </button>

            {/* Shapes Options Dropdown */}
            {drawAdvancedOpen && (
              <div className="flex basis-full flex-wrap items-center gap-2 border-t border-line/70 pt-2 mt-1">
                <span className="text-xs text-fg-3 font-semibold select-none">도형 모양:</span>
                {([
                  { kind: "line" as const, label: "선", icon: Minus },
                  { kind: "rect" as const, label: "사각형", icon: Square },
                  { kind: "ellipse" as const, label: "타원", icon: Circle },
                  { kind: "star" as const, label: "별", icon: StarIcon },
                  { kind: "arrow" as const, label: "화살표", icon: ArrowRight },
                  { kind: "triangle" as const, label: "삼각형", icon: Triangle },
                  { kind: "polygon" as const, label: "다각형", icon: Hexagon },
                ]).map((item) => {
                  const Icon = item.icon;
                  const active = tool === "draw" && drawMode === "shape" && drawShape === item.kind;
                  return (
                    <button
                      key={item.kind}
                      type="button"
                      onClick={() => {
                        setTool("draw");
                        setDrawMode("shape");
                        setDrawShape(item.kind);
                        setMenu(null);
                      }}
                      className={cn(
                        "h-8 px-2.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                        active ? "border-accent bg-accent-soft text-fg" : "border-line text-fg-2 hover:bg-raised"
                      )}
                      aria-pressed={active}
                      title={item.label}
                    >
                      <Icon size={13} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <div className="mx-1 h-4 w-px bg-line/60" />
                <label
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors cursor-pointer",
                    drawShape === "line"
                      ? "border-line bg-card text-fg-3 opacity-50 cursor-not-allowed"
                      : shapeFill
                      ? "border-accent/60 bg-accent-soft/50 text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={shapeFill}
                    disabled={drawShape === "line"}
                    onChange={(e) => setShapeFill(e.target.checked)}
                    className="size-3.5 accent-[var(--color-accent)] cursor-pointer disabled:cursor-not-allowed"
                  />
                  <PaintBucket size={13} aria-hidden />
                  <span className="font-semibold select-none">채우기</span>
                </label>
              </div>
            )}
          </div>
        )}
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button type="button" onClick={undo} disabled={hi === 0} className={cn(toolBtn(false), "disabled:opacity-40")} title="실행취소">
          <Undo2 size={14} />
        </button>
        <button type="button" onClick={redo} disabled={hi >= history.length - 1} className={cn(toolBtn(false), "disabled:opacity-40")} title="다시실행">
          <Redo2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => setHistoryPanelOpen((v) => !v)}
          aria-pressed={historyPanelOpen}
          aria-label="작업 내역 (히스토리)"
          className={toolBtn(historyPanelOpen)}
          title="작업 내역 (히스토리)"
        >
          <HistoryIcon size={14} />
        </button>
        <button
          type="button"
          onClick={() => setTimelapseOpen(true)}
          disabled={masterEditMode}
          aria-label="타임랩스 녹화 (그리기 과정 영상화)"
          className={cn(toolBtn(false), "disabled:opacity-40")}
          title={masterEditMode ? "마스터 편집 중에는 사용할 수 없어요" : "타임랩스 녹화 (그리기 과정 영상화)"}
        >
          <Video size={14} />
        </button>
        <button
          type="button"
          onClick={() => setStoryboardGridOpen(true)}
          aria-label="스토리보드 그리드 보기 (전체 페이지 한눈에 비교)"
          className={toolBtn(false)}
          title="스토리보드 그리드 보기 — 전체 페이지를 격자로 한눈에 비교"
        >
          <LayoutGrid size={14} />
        </button>
        <button
          type="button"
          onClick={() => setTimelineOpen((v) => !v)}
          disabled={masterEditMode}
          aria-pressed={timelineOpen}
          aria-label="다중 레이어 타임라인"
          className={cn(toolBtn(timelineOpen), "disabled:opacity-40")}
          title={masterEditMode ? "마스터 편집 중에는 사용할 수 없어요" : "다중 레이어 타임라인"}
        >
          <GanttChartSquare size={14} />
        </button>
        <span className="mx-0.5 hidden h-5 w-px bg-line lg:block" />
        {/* 줌·화면 맞춤·전체화면 — 모바일은 하단 도구막대가 대체하므로 숨김 */}
        <div className="hidden items-center gap-1 lg:flex">
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z - 0.1))}
            disabled={zoom <= ZOOM_MIN}
            className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
            title="축소"
          >
            <Minus size={12} />
          </button>
          <span className="text-[10px] font-bold text-fg-3 w-10 text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => clampZoom(z + 0.1))}
            disabled={zoom >= ZOOM_MAX}
            className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
            title="확대"
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setZoom(1);
            }}
            className={cn(toolBtn(false), "h-8 text-[10px] font-semibold px-2")}
            title="화면 100% 맞춤"
          >
            100%
          </button>
          <button
            type="button"
            onClick={() => {
              const wrap = wrapRef.current;
              if (wrap) {
                const w = wrap.clientWidth;
                setScale(Math.min(isFullscreen ? 4 : 2.5, Math.max(0.1, w / CANVAS_W)));
                setZoom(1);
              }
            }}
            className={cn(toolBtn(false), "h-8 text-[10px] font-semibold px-2")}
            title="너비에 맞춤"
          >
            맞춤
          </button>
          <button
            type="button"
            onClick={() => {
              const anyOpen = leftPanelOpen || rightPanelOpen;
              setLeftPanelOpen(!anyOpen);
              setRightPanelOpen(!anyOpen);
            }}
            aria-pressed={!leftPanelOpen && !rightPanelOpen}
            className={cn(toolBtn(!leftPanelOpen && !rightPanelOpen), "hidden h-8 gap-1 px-2 text-[10px] font-semibold lg:inline-flex")}
            title="집중 모드 — 좌우 패널을 접어 캔버스를 넓게 사용"
          >
            <Maximize2 size={12} /> 넓게
          </button>
          <button
            type="button"
            onClick={toggleMaximize}
            aria-pressed={maximized}
            className={cn(toolBtn(maximized), "h-8 px-2 text-[10px] font-semibold")}
            title="브라우저 맞춤 — 브라우저 창을 꽉 채워 작업 (ESC로 복원)"
          >
            {maximized ? "복원" : "브라우저 맞춤"}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            className={cn(toolBtn(isFullscreen), "h-8 px-2 text-[10px] font-semibold")}
            title="전체화면 — 창작 스튜디오를 모니터 전체로 (ESC로 종료)"
          >
            {isFullscreen ? "창 모드" : "전체화면"}
          </button>
          <span className="mx-0.5 h-5 w-px bg-line" />
          <StudioColorBlindPreviewToggle value={colorBlindPreview} onChange={setColorBlindPreview} />
        </div>
      </div>

      <div className="flex flex-col gap-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:flex-row lg:pb-0">
        {/* 모바일 바텀시트 백드롭 — 탭하면 닫힘 */}
        {isMobile && mobileSheet && (
          <button
            type="button"
            aria-label="패널 닫기"
            onClick={() => setMobileSheet(null)}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm lg:hidden"
          />
        )}
        {/* 왼쪽: 페이지 목록 사이드바 (접으면 얇은 레일로) */}
        {!leftPanelOpen && (
          <button
            type="button"
            onClick={() => setLeftPanelOpen(true)}
            className="hidden w-7 flex-shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-panel/20 py-3 text-fg-3 transition-colors hover:bg-raised lg:flex"
            title="페이지 목록 펼치기"
          >
            <ChevronRight size={14} />
            <span className="text-[0.68rem] font-semibold [writing-mode:vertical-rl]">페이지</span>
          </button>
        )}
        <div
          ref={pagesSheetRef}
          role={isMobile ? "dialog" : undefined}
          aria-modal={isMobile && mobileSheet === "pages" ? true : undefined}
          aria-label={isMobile ? "페이지 목록" : undefined}
          inert={isMobile && mobileSheet !== "pages" ? true : undefined}
          className={cn(
            "flex flex-col gap-2 border border-line p-3",
            // 모바일: 하단에서 올라오는 바텀시트
            "fixed inset-x-0 bottom-0 z-50 max-h-[72vh] overflow-y-auto rounded-t-3xl bg-panel pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out",
            // 데스크톱: 인라인 컬럼(드래그로 너비 조절)
            "lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-2xl lg:bg-panel/20 lg:pb-3 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "pages" ? "translate-y-0" : "translate-y-full",
            !leftPanelOpen && "lg:hidden"
          )}
          style={isMobile ? undefined : { width: leftResize.width, minWidth: 132 }}
        >
          {/* 모바일 시트 손잡이 */}
          <div className="mx-auto -mt-1 mb-1 h-1 w-10 shrink-0 rounded-full bg-line lg:hidden" />
          <div className="flex items-center justify-between border-b border-line/50 pb-2">
            <span className="flex items-center gap-1 text-xs font-bold text-fg-2">
              <button
                type="button"
                onClick={() => setLeftPanelOpen(false)}
                className="hidden text-fg-3 transition-colors hover:text-fg lg:inline-flex"
                title="페이지 목록 접기"
              >
                <ChevronLeft size={13} />
              </button>
              페이지 목록
              <button
                type="button"
                onClick={() => setMobileSheet(null)}
                className="ml-1 rounded p-0.5 text-fg-3 hover:bg-raised lg:hidden"
                aria-label="페이지 시트 닫기"
                data-autofocus
              >
                <X size={14} />
              </button>
            </span>
            <button
              type="button"
              data-testid="studio-add-page"
              onClick={addPage}
              className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-semibold text-on-accent hover:bg-accent-hover"
            >
              <Plus size={10} /> 추가
            </button>
            <button
              type="button"
              onClick={applyGradeToAll}
              className="rounded border border-line px-1.5 py-0.5 text-[10px] text-fg-3 hover:bg-raised"
              title="현재 페이지의 색보정을 모든 페이지에 적용"
            >
              그레이드 전체
            </button>
            <button
              type="button"
              onClick={applyBgToAll}
              className="rounded border border-line px-1.5 py-0.5 text-[10px] text-fg-3 hover:bg-raised"
              title="현재 페이지의 배경을 모든 페이지에 적용"
            >
              배경 전체
            </button>
            <button
              type="button"
              onClick={() => setMasterPanelOpen((v) => !v)}
              aria-pressed={masterPanelOpen}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                masterEditMode
                  ? "border-accent bg-accent-soft/50 text-accent"
                  : masterPanelOpen
                    ? "border-accent/60 text-fg-2 hover:bg-raised"
                    : "border-line text-fg-3 hover:bg-raised"
              )}
              title="마스터 페이지(모든 페이지 공통 요소) 관리"
            >
              마스터{master.elements.length > 0 ? ` ${master.elements.length}` : ""}
            </button>
          </div>
          <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[56vh] lg:max-h-[calc(100dvh-24rem)] pr-1">
            {pages.map((p, idx) => {
              const isActive = p.id === currentPageId;
              const dropIndicator = pageDnd.indicatorFor(idx);
              return (
                <div
                  key={p.id}
                  data-testid="studio-page-item"
                  {...pageDnd.itemProps(idx)}
                  title="드래그하여 순서 변경"
                  className={cn(
                    "relative flex w-full flex-col gap-1 rounded-xl border p-2 transition-all hover:bg-raised/50",
                    isActive ? "border-accent bg-accent-soft/40" : "border-line bg-card",
                    pageDnd.dragIndex === idx && "opacity-50"
                  )}
                >
                  {/* 페이지 선택 — 접근성: 카드를 role=button 으로 만들면 내부 액션 버튼(편집·이동)이
                      중첩 인터랙티브가 되어 위반이므로, 카드 전체를 덮는 "늘린 버튼"으로 선택을 처리하고
                      액션 버튼은 z-index 로 그 위에 띄운다. 카드 div 는 드래그 정렬(draggable) 컨테이너로 유지. */}
                  <button
                    type="button"
                    onClick={() => setCurrentPageId(p.id)}
                    aria-label={`${pageDisplayName(p, idx)} 선택`}
                    aria-pressed={isActive}
                    className="absolute inset-0 z-10 cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  />
                  {/* 드롭 삽입선(PPT식) — 카드 위/아래 절반 판정 결과 시각화. overflow 클리핑 없게 카드 가장자리에 겹쳐 그린다. */}
                  {dropIndicator && (
                    <span
                      aria-hidden
                      className={cn(
                        "pointer-events-none absolute inset-x-1 z-10 h-[3px] rounded-full bg-accent",
                        dropIndicator === "before" ? "top-0" : "bottom-0"
                      )}
                    />
                  )}
                  <div className="flex items-center justify-between gap-1">
                    <span className="min-w-0 truncate text-[10px] font-bold text-fg-2" title={pageDisplayName(p, idx)}>
                      {pageDisplayName(p, idx)}
                    </span>
                    {shotTagBadgeText(p) ? (
                      <span
                        className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[8px] font-semibold text-accent"
                        title={shotTagBadgeTitle(p) ?? undefined}
                      >
                        {shotTagBadgeText(p)}
                      </span>
                    ) : null}
                    {/* 액션 버튼은 늘린 선택 버튼(z-10) 위로 띄운다. */}
                    <div className="relative z-20 flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMetaEditPageId((v) => (v === p.id ? null : p.id));
                        }}
                        className={cn("rounded p-0.5 hover:bg-raised", metaEditPageId === p.id ? "text-accent" : "text-fg-3")}
                        title="이름·콘티 메모 편집"
                        aria-label={`${pageDisplayName(p, idx)} 이름·콘티 메모 편집`}
                        aria-expanded={metaEditPageId === p.id}
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageUp(p.id);
                        }}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-fg-3 hover:bg-raised disabled:opacity-30"
                        title="위로 이동"
                        aria-label="위로 이동"
                      >
                        <ChevronUp size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageDown(p.id);
                        }}
                        disabled={idx === pages.length - 1}
                        className="rounded p-0.5 text-fg-3 hover:bg-raised disabled:opacity-30"
                        title="아래로 이동"
                        aria-label="아래로 이동"
                      >
                        <ChevronDown size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageToTop(p.id);
                        }}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-fg-3 hover:bg-raised disabled:opacity-30"
                        title="맨 위로"
                        aria-label="맨 위로 이동"
                      >
                        <span aria-hidden="true">⇧</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageToBottom(p.id);
                        }}
                        disabled={idx === pages.length - 1}
                        className="rounded p-0.5 text-fg-3 hover:bg-raised disabled:opacity-30"
                        title="맨 아래로"
                        aria-label="맨 아래로 이동"
                      >
                        <span aria-hidden="true">⇩</span>
                      </button>
                    </div>
                  </div>
                  {/* 실내용 미니 썸네일 — 마스터 요소를 페이지 요소 아래에 합성해 경량 SVG 프록시로 축소 렌더.
                      마스터 없음/페이지 숨김이면 원본 page 를 동일 참조로 넘겨 RC 메모이제이션을 보존한다. */}
                  <StudioPageThumbnail page={composeThumbPage(master, p)} />
                  {metaEditPageId === p.id ? (
                    // 인라인 편집 입력은 늘린 선택 버튼(z-10) 위로 올려 포커스·타이핑을 받게 한다.
                    <div className="relative z-20 flex flex-col gap-1 pt-1">
                      <input
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- 연필 버튼 클릭으로만 열리는 인라인 편집 — 열릴 때 이름란 포커스가 올바른 패턴(기존 텍스트 편집 모달과 동일)
                        autoFocus
                        type="text"
                        defaultValue={p.name ?? ""}
                        placeholder={autoPageName(idx)}
                        maxLength={PAGE_NAME_MAX}
                        aria-label="페이지 이름"
                        className="w-full rounded border border-line bg-card px-1.5 py-1 text-[10px] font-semibold text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            commitPageMeta(p.id, { name: e.currentTarget.value });
                            setMetaEditPageId(null);
                          } else if (e.key === "Escape") {
                            setMetaEditPageId(null);
                          }
                        }}
                        onBlur={(e) => commitPageMeta(p.id, { name: e.target.value })}
                      />
                      <textarea
                        rows={2}
                        defaultValue={p.note ?? ""}
                        placeholder="콘티 메모 (장면·대사 아이디어)"
                        maxLength={PAGE_NOTE_MAX}
                        aria-label="콘티 메모"
                        className="w-full resize-none rounded border border-line bg-card px-1.5 py-1 text-[9px] leading-tight text-fg placeholder:text-fg-3 focus:border-accent focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                        onBlur={(e) => commitPageMeta(p.id, { note: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMetaEditPageId(null);
                        }}
                        className="self-end rounded bg-accent px-2 py-0.5 text-[9px] font-semibold text-on-accent hover:bg-accent-hover"
                      >
                        완료
                      </button>
                    </div>
                  ) : p.note ? (
                    <p className="line-clamp-2 whitespace-pre-wrap text-[9px] leading-tight text-fg-3" title={p.note}>
                      {p.note}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        insertPageBefore(p.id);
                      }}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised"
                      title="이 앞에 빈 페이지 삽입"
                    >
                      <Plus size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        insertPageAfter(p.id);
                      }}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised"
                      title="이 뒤에 빈 페이지 삽입"
                    >
                      <Plus size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicatePage(p.id);
                      }}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised"
                      title="페이지 복제"
                    >
                      <Copy size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicatePageMirrored(p.id);
                      }}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised"
                      title="미러 복제 (좌우 반전)"
                    >
                      <FlipHorizontal2 size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearPageFor(p.id);
                      }}
                      className="rounded p-0.5 text-fg-3 hover:bg-raised"
                      title="이 페이지 내용 비우기"
                    >
                      <Eraser size={10} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (pages.length <= 1) return;
                        if (globalThis.confirm(`${idx + 1}페이지를 삭제할까요?`)) {
                          deletePage(p.id);
                        }
                      }}
                      disabled={pages.length <= 1}
                      className="rounded p-0.5 text-bad hover:bg-bad-soft/20 disabled:opacity-30"
                      title="페이지 삭제"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 페이지 목록 ↔ 캔버스 너비 스플리터(데스크톱) */}
        {leftPanelOpen && (
          <PanelResizeHandle handleProps={leftResize.handleProps} dragging={leftResize.dragging} label="페이지 목록 너비 조절" />
        )}

        {/* 중앙: 캔버스 영역 (editor shell) */}
        <div className="relative flex-1 min-w-0 lg:min-w-[22rem]" data-studio-logical-w={CANVAS_W}>
          {/* 임시저장 복구 배너 */}
          {hasAutosave && (
            <div className="mb-3 flex items-center justify-between rounded-xl border border-warning/30 bg-warning-soft/20 p-2.5 text-xs text-warning">
              <span className="flex items-center gap-1.5 font-medium">
                ⚠️ 이전에 작성 중이던 임시저장 데이터가 있습니다.
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={restoreAutosave}
                  className="rounded bg-accent/20 px-2 py-1 font-bold text-accent hover:bg-accent/30"
                >
                  복구하기
                </button>
                <button
                  type="button"
                  onClick={clearAutosave}
                  className="rounded bg-line px-2 py-1 font-medium text-fg-3 hover:bg-raised"
                >
                  비우기
                </button>
              </div>
            </div>
          )}

          {/* 마퀴 다중선택 액션바 */}
          {marqueeIds.length > 0 && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft/30 px-3 py-1.5 text-xs">
              <span className="font-semibold text-accent">{marqueeIds.length}개 선택됨</span>
              <span className="text-fg-3">· 방향키로 이동 · 모서리로 크기·회전</span>
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                {marqueeIds.length >= 2 && (
                  <button
                    type="button"
                    onClick={groupSelectedElements}
                    className="flex items-center gap-1 rounded-md border border-line bg-card px-2 py-1 font-semibold text-fg-2 transition-colors hover:bg-raised cursor-pointer"
                    title="그룹화"
                  >
                    <FolderPlus size={13} />
                    <span>그룹화</span>
                  </button>
                )}
                <div className="h-4 w-px bg-line/60 mx-1" />
                <div className="inline-flex gap-0.5 rounded-md border border-line bg-card/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => alignSelected("left")}
                    className="rounded p-1 hover:bg-raised text-fg-3 hover:text-fg cursor-pointer"
                    title="왼쪽 정렬"
                  >
                    <AlignLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("hcenter")}
                    className="rounded p-1 hover:bg-raised text-fg-3 hover:text-fg cursor-pointer"
                    title="가로 가운데 정렬"
                  >
                    <AlignCenter size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("right")}
                    className="rounded p-1 hover:bg-raised text-fg-3 hover:text-fg cursor-pointer"
                    title="오른쪽 정렬"
                  >
                    <AlignRight size={13} />
                  </button>
                </div>
                <div className="inline-flex gap-0.5 rounded-md border border-line bg-card/50 p-0.5">
                  <button
                    type="button"
                    onClick={() => alignSelected("top")}
                    className="rounded px-1.5 py-0.5 hover:bg-raised text-[0.66rem] font-bold text-fg-3 hover:text-fg cursor-pointer"
                    title="위쪽 정렬"
                  >
                    상
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("vcenter")}
                    className="rounded px-1.5 py-0.5 hover:bg-raised text-[0.66rem] font-bold text-fg-3 hover:text-fg cursor-pointer"
                    title="세로 가운데 정렬"
                  >
                    중
                  </button>
                  <button
                    type="button"
                    onClick={() => alignSelected("bottom")}
                    className="rounded px-1.5 py-0.5 hover:bg-raised text-[0.66rem] font-bold text-fg-3 hover:text-fg cursor-pointer"
                    title="아래쪽 정렬"
                  >
                    하
                  </button>
                </div>
                {marqueeIds.length >= 3 && (
                  <div className="inline-flex gap-0.5 rounded-md border border-line bg-card/50 p-0.5">
                    <button
                      type="button"
                      onClick={() => alignSelected("distributeH")}
                      className="rounded px-1.5 py-0.5 hover:bg-raised text-[0.66rem] font-bold text-fg-3 hover:text-fg cursor-pointer"
                      title="가로 간격 동일하게 정렬"
                    >
                      가로 분배
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelected("distributeV")}
                      className="rounded px-1.5 py-0.5 hover:bg-raised text-[0.66rem] font-bold text-fg-3 hover:text-fg cursor-pointer"
                      title="세로 간격 동일하게 정렬"
                    >
                      세로 분배
                    </button>
                  </div>
                )}
                <div className="h-4 w-px bg-line/60 mx-1" />
                <button
                  type="button"
                  onClick={duplicateSelected}
                  className="rounded-md border border-line bg-card px-2 py-1 font-semibold text-fg-2 transition-colors hover:bg-raised cursor-pointer"
                >
                  복제
                </button>
                <button
                  type="button"
                  onClick={removeSelected}
                  className="rounded-md border border-line bg-card px-2 py-1 font-semibold text-bad transition-colors hover:bg-raised cursor-pointer"
                >
                  삭제
                </button>
                <button
                  type="button"
                  onClick={() => setMarqueeIds([])}
                  className="rounded-md border border-line bg-card px-2 py-1 font-semibold text-fg-2 transition-colors hover:bg-raised cursor-pointer"
                >
                  해제
                </button>
              </div>
            </div>
          )}

          {/* 색맹 시뮬레이션용 숨김 SVG filter defs — filter id 는 문서 전역 참조라 위치 무관, 정적이라 무조건 마운트 */}
          <StudioColorBlindFilterDefs />
          {/* 고정높이 스크롤 뷰포트: 줌·긴 캔버스 시 내부 스크롤, 컨트롤은 바깥에 고정 */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 마우스 핸들러는 클릭이 아니라 스페이스+드래그 패닝/에셋 드롭 전용이며 실제 상호작용은 내부 Konva Stage + document keydown(Space) 이 담당한다 */}
          <div
            ref={wrapRef}
            // 스크롤 뷰포트를 키보드 포커스 가능하게 해 방향키 스크롤 허용(WCAG scrollable-region) — focusable 은 의도적.
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            role="group"
            aria-label="작업 캔버스 — 포커스 후 방향키로 스크롤"
            onMouseDown={onWrapMouseDown}
            onMouseMove={onWrapMouseMove}
            onMouseUp={onWrapMouseUp}
            onMouseLeave={onWrapMouseUp}
            onDragOver={onWrapDragOver}
            onDrop={onWrapDrop}
            className={cn(
              // 모바일: 상단 도구막대 1줄 + 하단 도구막대만 차감해 캔버스를 최대한 키운다(작은 폰에서 '그릴 면적' 우선).
              // 데스크톱(lg): 좌/우 패널·줌 컨트롤이 있는 기존 레이아웃이라 21rem 차감 유지.
              "max-h-[calc(100dvh-13rem)] min-h-[15rem] overflow-auto rounded-2xl border border-line bg-[repeating-conic-gradient(#0000000a_0deg_90deg,transparent_90deg_180deg)] [background-size:24px_24px] outline-none transition-all focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent lg:max-h-[calc(100dvh-21rem)] lg:min-h-[20rem]",
              isSpacePressed ? (isPanning ? "cursor-grabbing select-none" : "cursor-grab select-none") : ""
            )}
          >
          {/* 페이지 색보정 미리보기: Stage에 CSS filter, 그 위에 비네트 오버레이(내보내기 때 픽셀로 합성) */}
          {/* 색맹 시뮬레이션은 이미 색보정된 결과 위에 적용되도록 pageGradeCss 뒤에 이어 붙인다(filter 리스트는 좌→우로 순차 적용). */}
          <div className="relative" style={{ width: CANVAS_W * effScale, height: canvasH * effScale }}>
          <div style={{ filter: [pageGradeCss, colorBlindFilterStyle(colorBlindPreview).filter].filter(Boolean).join(" ") || undefined }}>
          <Stage
            ref={stageRef}
            width={CANVAS_W * effScale}
            height={canvasH * effScale}
            scaleX={effScale}
            scaleY={effScale}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onMouseLeave={() => {
              hideBrushCursor();
              hideSmudgeCursor();
              hideHealCloneCursors();
              hideLayerMaskCursor();
            }}
            onDragMove={onStageDragMove}
            onDragEnd={onStageDragEnd}
            onContextMenu={(e) => {
              e.evt.preventDefault();
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
                    setSelectedId(elId);
                    setTool("select");
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
                fillLinearGradientColorStops={bgGrad ? [0, bgGrad[0], 1, bgGrad[1]] : undefined}
              />
            </Layer>
            <Layer>
              {showGrid && (
                <Group listening={false}>
                  {Array.from({ length: Math.ceil(CANVAS_W / gridSize) }).map((_, i) => (
                    <Line
                      key={`grid-v-${i}`}
                      points={[i * gridSize, 0, i * gridSize, canvasH]}
                      stroke="rgba(124, 92, 252, 0.12)"
                      strokeWidth={1 / effScale}
                    />
                  ))}
                  {Array.from({ length: Math.ceil(canvasH / gridSize) }).map((_, i) => (
                    <Line
                      key={`grid-h-${i}`}
                      points={[0, i * gridSize, CANVAS_W, i * gridSize]}
                      stroke="rgba(124, 92, 252, 0.12)"
                      strokeWidth={1 / effScale}
                    />
                  ))}
                </Group>
              )}
              {showWebtoonGuides &&
                webtoonGuides &&
                (() => {
                  const safe = webtoonGuides.safeAreaMargin(CANVAS_W);
                  return (
                    <Group listening={false}>
                      {/* 세이프영역(모바일 뷰어에서 잘릴 수 있는 양옆 여백) 음영 */}
                      <Rect x={0} y={0} width={safe.left} height={canvasH} fill="rgba(255, 90, 90, 0.06)" />
                      <Rect x={CANVAS_W - safe.right} y={0} width={safe.right} height={canvasH} fill="rgba(255, 90, 90, 0.06)" />
                      {/* 플랫폼 표준 연재폭 가이드선 */}
                      {webtoonGuides.webtoonWidthGuides(CANVAS_W).map((g) => (
                        <Line
                          key={`wg-${g.pos}-${g.label}`}
                          points={[g.pos, 0, g.pos, canvasH]}
                          stroke="rgba(70, 150, 255, 0.55)"
                          strokeWidth={1 / effScale}
                          dash={[6 / effScale, 6 / effScale]}
                        />
                      ))}
                    </Group>
                  );
                })()}
              {(() => {
                // 다중 레이어 타임라인 재생 미리보기 — 재생 중에만 계산(커밋 없이 렌더 시점 override).
                // 정지 상태(timelinePlaying=false)면 항상 null이라 기존 렌더 경로와 100% 동일.
                const timelineComposite = timelinePlaying
                  ? resolveTimelineComposite(animTimeline, elements.map((e) => e.id), timelinePreviewFrame)
                  : null;
                // 한 요소를 렌더하는 함수. opts.asMask=클리핑 마스크의 베이스 사본(비상호작용),
                // opts.compositeOverride=알파 클리핑 자식의 "source-in" 합성.
                const renderEl = (el: El, idx: number, opts: { asMask?: boolean; compositeOverride?: string } = {}) => {
                const locked = isEffectivelyLocked(el, groups);
                // 픽셀 선택/크롭/패널 컷/노드 편집/문지르기/복구브러시 무장 중엔 요소 드래그를 잠근다 — 캔버스 드래그가 도구 조작으로 간다.
                const draggable =
                  !opts.asMask &&
                  tool === "select" &&
                  !locked &&
                  !pixelToolArmed &&
                  !cropArmed &&
                  !panelSplitArmed &&
                  !nodeEditArmed &&
                  !smudgeArmed &&
                  !healCloneArmed &&
                  !layerMaskPaintArmed;
                // 잠긴 요소(이메레스 밑그림 등)도 선택 모드에선 클릭 선택 허용 — 삭제/잠금해제 가능하게.
                // 이동·변형은 여전히 막힘(draggable=false·트랜스포머 미부착). 드로잉 모드(tool!=="select")엔 무영향.
                // 무장 중 클릭 선택 전환도 잠근다 — 제스처 도중 대상 이미지가 바뀌면 선택 좌표계가 깨진다.
                const onSelect = opts.asMask
                  ? () => {}
                  : () =>
                      tool === "select" &&
                      !pixelToolArmed &&
                      !cropArmed &&
                      !panelSplitArmed &&
                      !nodeEditArmed &&
                      !smudgeArmed &&
                      !healCloneArmed &&
                      !layerMaskPaintArmed &&
                      setSelectedId(el.id);
                const setRef = opts.asMask
                  ? () => {}
                  : (n: Konva.Node | null) => {
                      nodeRefs.current[el.id] = n;
                    };
                // 패널 내부 콘텐츠 클리핑(들어간 패널 영역). 아래 레이어 클리핑 마스크는 ClipMaskGroup이 알파로 처리한다.
                const panelClip = el.noClip ? null : containingPanel(el, elements);
                const clip = panelClip
                  ? { x: panelClip.x, y: panelClip.y, width: panelClip.width, height: panelClip.height }
                  : null;
                const wrapClip = (node: ReactNode) => {
                  const composite = (opts.compositeOverride ??
                    (el.blendMode || "source-over")) as NonNullable<
                    Konva.NodeConfig["globalCompositeOperation"]
                  >;
                  return clip ? (
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
                  const effectiveEl = timelineOverride ? ({ ...el, src: timelineOverride.src } as ImageEl) : el;
                  return wrapClip(
                    <Fragment key={el.id}>
                      {onion.map((layer) => (
                        <OnionSkinImage key={`onion-${el.id}-${layer.frame.id}`} el={el} layer={layer} />
                      ))}
                      <UrlImage
                        el={effectiveEl}
                        draggable={draggable}
                        innerRef={setRef}
                        onSelect={onSelect}
                        onChange={(patch) => patchEl(el.id, patch)}
                        dragBoundFunc={snapBoundFunc}
                      />
                    </Fragment>
                  );
                }
                if (el.type === "frame") {
                  return (
                    <FramePanel
                      key={el.id}
                      el={el}
                      theme={webtoonTheme}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch as Partial<El>)}
                      dragBoundFunc={snapBoundFunc}
                    />
                  );
                }
                if (el.type === "focusLines")
                  return wrapClip(
                    <FocusLinesNode
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch)}
                      dragBoundFunc={snapBoundFunc}
                    />
                  );
                if (el.type === "speedLines")
                  return wrapClip(
                    <SpeedLinesNode
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch)}
                      dragBoundFunc={snapBoundFunc}
                    />
                  );
                if (el.type === "draw") {
                  // 노드 편집 드래그 중엔 커밋 전 초안을 얕게 병합해 그대로 넘긴다 — StudioDrawNode
                  // 는 points/pressures 로부터 매끈화·굵기를 재계산하므로 별도 로직 중복 없이
                  // "라이브 리셰이프"가 커밋될 최종 결과와 픽셀 단위로 동일하게 미리보기된다.
                  const liveEl =
                    nodeEditDraft?.elId === el.id ? { ...el, points: nodeEditDraft.points, pressures: nodeEditDraft.pressures } : el;
                  return wrapClip(<StudioDrawNode key={el.id} el={liveEl} />);
                }
                if (el.type === "text" && el.textPath && !isFlatTextPath(normalizeTextPath(el.textPath)))
                  return wrapClip(
                    <KTextPath
                      studioElementId={el.id}
                      key={el.id}
                      ref={setRef}
                      text={el.text}
                      x={el.x}
                      y={el.y}
                      data={buildTextPathData(normalizeTextPath(el.textPath), el.width, el.fontSize)}
                      fontSize={el.fontSize}
                      fill={el.fillType === "gradient" ? undefined : el.fill}
                      {...(el.fillType === "gradient"
                        ? konvaGradientProps(
                            el.gradient ?? legacyTextGradientToSpec(el.gradientColorStart, el.gradientColorEnd, el.gradientDirection),
                            // 곡선 텍스트 로컬 bbox 근사 — baseline(fontSize×1.4) 중심으로 위아래 글자 폭 커버.
                            { x: 0, y: 0, width: Math.max(1, el.width), height: el.fontSize * 2.8 }
                          )
                        : {})}
                      stroke={el.stroke}
                      strokeWidth={el.strokeWidth ?? 0}
                      fillAfterStrokeEnabled
                      lineJoin="round"
                      rotation={el.rotation}
                      opacity={el.opacity ?? 1}
                      fontFamily={el.font ?? "Pretendard, sans-serif"}
                      fontStyle={el.fontStyle ?? "bold"}
                      align={el.align ?? "left"}
                      letterSpacing={el.letterSpacing ?? 0}
                      shadowColor={el.shadowColor}
                      shadowBlur={el.shadowBlur}
                      shadowOffsetX={el.shadowOffsetX}
                      shadowOffsetY={el.shadowOffsetY}
                      shadowOpacity={el.shadowOpacity}
                      shadowEnabled={!!el.shadowColor && (el.shadowOpacity ?? 0) > 0}
                      {...toKonvaSkewAttrs(el)}
                      {...textNodeProps<Partial<El>>({ id: el.id, draggable, dragBoundFunc: snapBoundFunc, onSelect, onEdit: startEditText, onPatch: patchEl })}
                      onTransformEnd={(e) => {
                        const node = e.target;
                        const fs = Math.max(10, Math.round(el.fontSize * node.scaleX()));
                        node.scaleX(1);
                        node.scaleY(1);
                        patchEl(el.id, { x: node.x(), y: node.y(), fontSize: fs, rotation: node.rotation() });
                      }}
                    />
                  );
                if (el.type === "text")
                  return wrapClip(
                    <KText
                      studioElementId={el.id}
                      key={el.id}
                      ref={setRef}
                      text={el.vertical ? formatVerticalText(el.text) : el.text}
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      fontSize={el.fontSize}
                      fill={el.fillType === "gradient" ? undefined : el.fill}
                      {...(el.fillType === "gradient"
                        ? konvaGradientProps(
                            el.gradient ?? legacyTextGradientToSpec(el.gradientColorStart, el.gradientColorEnd, el.gradientDirection),
                            estimateTextGradientBBox({
                              width: el.width,
                              text: el.vertical ? formatVerticalText(el.text) : el.text,
                              fontSize: el.fontSize,
                              lineHeight: el.lineHeight ?? 1,
                            })
                          )
                        : {})}
                      stroke={el.stroke}
                      strokeWidth={el.strokeWidth ?? 0}
                      fillAfterStrokeEnabled
                      lineJoin="round"
                      rotation={el.rotation}
                      opacity={el.opacity ?? 1}
                      fontFamily={el.font ?? "Pretendard, sans-serif"}
                      fontStyle={el.fontStyle ?? "bold"}
                      align={el.align ?? "left"}
                      letterSpacing={el.letterSpacing ?? 0}
                      lineHeight={el.lineHeight ?? 1}
                      shadowColor={el.shadowColor}
                      shadowBlur={el.shadowBlur}
                      shadowOffsetX={el.shadowOffsetX}
                      shadowOffsetY={el.shadowOffsetY}
                      shadowOpacity={el.shadowOpacity}
                      shadowEnabled={!!el.shadowColor && (el.shadowOpacity ?? 0) > 0}
                      {...toKonvaSkewAttrs(el)}
                      {...textNodeProps<Partial<El>>({ id: el.id, draggable, dragBoundFunc: snapBoundFunc, onSelect, onEdit: startEditText, onPatch: patchEl })}
                      onTransformEnd={(e) => {
                        const node = e.target as Konva.Text;
                        const fs = Math.max(10, Math.round(el.fontSize * node.scaleX()));
                        const w = Math.max(40, node.width() * node.scaleX());
                        node.scaleX(1);
                        node.scaleY(1);
                        patchEl(el.id, { x: node.x(), y: node.y(), fontSize: fs, width: w, rotation: node.rotation() });
                      }}
                    />
                  );
                if (el.type === "sticker")
                  return wrapClip(
                    <KText
                      studioElementId={el.id}
                      key={el.id}
                      ref={setRef}
                      text={el.text}
                      x={el.x}
                      y={el.y}
                      fontSize={el.fontSize}
                      rotation={el.rotation}
                      opacity={el.opacity ?? 1}
                      {...toKonvaSkewAttrs(el)}
                      {...textNodeProps<Partial<El>>({ id: el.id, draggable, dragBoundFunc: snapBoundFunc, onSelect, onEdit: startEditText, onPatch: patchEl })}
                      onTransformEnd={(e) => {
                        const node = e.target as Konva.Text;
                        const fs = Math.max(16, Math.round(el.fontSize * node.scaleX()));
                        node.scaleX(1);
                        node.scaleY(1);
                        patchEl(el.id, { x: node.x(), y: node.y(), fontSize: fs, rotation: node.rotation() });
                      }}
                    />
                  );
                // bubble
                // 외곽선 두께: 사용자 지정 우선, 없으면 말풍선 평균크기 3단계(작을수록 가늘게).
                const avgSize = (el.width + el.height) / 2;
                let bStroke = el.stroke ?? "#1f1a16"; // 순흑 대신 따뜻한 잉크색
                let bStrokeW = el.strokeWidth ?? (avgSize < 300 ? 2.5 : avgSize < 500 ? 3 : 3.5);
                let bRadius = 18;
                // 그림자: 사용자 지정 없으면 테마별 기본값(종이 위에 살짝 뜬 미세 그림자).
                let bShadowColor = el.shadowColor !== undefined ? el.shadowColor : "rgba(0, 0, 0, 0.2)";
                let bShadowBlur = el.shadowBlur !== undefined ? el.shadowBlur : 5;
                let bShadowOpacity = el.shadowOpacity !== undefined ? el.shadowOpacity : 0.16;
                let bShadowOffset = el.shadowOffsetX !== undefined && el.shadowOffsetY !== undefined
                  ? { x: el.shadowOffsetX, y: el.shadowOffsetY }
                  : { x: 1, y: 2 };
                const tXRatio = el.tailXRatio ?? 0.35;
                const tHeight = el.tailHeight ?? 30;
                const tailDir = el.tail ?? "left";
                const tailDirection = el.tailDirection ?? "bottom";
                const showTail = tailDir !== "none";

                // 테마별 파라미터 사전 계산
                let tHeightWithTheme = tHeight;
                let borderRatio = 0.08;

                if (webtoonTheme === "soft") {
                  bStroke = el.stroke ?? "#2d2d2d";
                  bStrokeW = el.strokeWidth ?? (avgSize < 300 ? 1.5 : avgSize < 500 ? 1.8 : 2);
                  bRadius = 24;
                  tHeightWithTheme = tHeight - 10;
                  borderRatio = 0.08;
                  if (el.shadowColor === undefined) {
                    bShadowColor = "rgba(0, 0, 0, 0.1)";
                    bShadowBlur = 5;
                    bShadowOpacity = 0.16;
                    bShadowOffset = { x: 1, y: 2 };
                  }
                } else if (webtoonTheme === "vivid") {
                  bStroke = el.stroke ?? "#444444";
                  bStrokeW = el.strokeWidth ?? (avgSize < 300 ? 1.2 : avgSize < 500 ? 1.5 : 1.8);
                  bRadius = Math.min(el.width, el.height) / 2;
                  tHeightWithTheme = tHeight - 14;
                  borderRatio = 0.06;
                  if (el.shadowColor === undefined) {
                    bShadowColor = "black";
                    bShadowBlur = 8;
                    bShadowOpacity = 0.16;
                    bShadowOffset = { x: 2, y: 3 };
                  }
                }

                const flipTailX = (pts: number[]) => {
                  if (tailDir !== "right") return pts;
                  if (tailDirection === "bottom" || tailDirection === "top") {
                    return pts.map((v, i) => (i % 2 === 0 ? el.width - v : v));
                  }
                  return pts;
                };

                // 본체+꼬리를 단일 path로(이음새 없는 매끈한 말풍선). 위치는 기존 tXRatio/flip을 보존.
                // 꼬리 길이·밑동을 말풍선 최소변 기준으로 정규화 — 작은 말풍선의 과대 꼬리/큰 말풍선의 빈약 꼬리 방지.
                const tailIsVertical = tailDirection === "bottom" || tailDirection === "top";
                const bMinDim = Math.min(el.width, el.height);
                const bTailLen = Math.max(bMinDim * 0.12, Math.min(Math.max(8, tHeightWithTheme), bMinDim * 0.3));
                const bTailBase = Math.max(bMinDim * 0.1, (tailIsVertical ? el.width : el.height) * borderRatio * 1.8);
                const bubbleTailSpec: BubbleTailSpec | null = showTail
                  ? {
                      direction: tailDirection,
                      ratio: tailDir === "right" && tailIsVertical ? 1 - tXRatio : tXRatio,
                      length: bTailLen,
                      base: bTailBase,
                      side: "center",
                    }
                  : null;
                // 추가 꼬리(두 화자 동시 대사)가 있으면 다중 꼬리 워커로 — 없으면 기존 단일 경로 바이트 동일 유지.
                const bubbleExtraTails = normalizeExtraTails(el.extraTails);
                const speechPathData =
                  bubbleExtraTails.length > 0
                    ? bubblePathDataMulti(el.width, el.height, bRadius, [
                        ...(bubbleTailSpec ? [bubbleTailSpec] : []),
                        ...bubbleExtraTails,
                      ])
                    : bubblePathData(el.width, el.height, bRadius, bubbleTailSpec);
                // 타이포: 한글 가독성을 위한 테마별 줄간격 + 약한 자간(세로쓰기는 넉넉히).
                const bubbleLineHeight =
                  el.lineHeight ?? (el.vertical ? 1.4 : webtoonTheme === "soft" ? 1.35 : webtoonTheme === "vivid" ? 1.2 : 1.25);
                const bubbleLetterSpacing = webtoonTheme === "vivid" ? 0 : 0.3;
                // 안쪽 여백: 글자 크기 비례(좌우 대칭, 상<하로 시각 중심 보정).
                const bFs = el.fontSize ?? 24;
                const bHPad = Math.max(12, Math.round(bFs * 0.6));
                const bVPadTop = Math.max(8, Math.round(bFs * 0.48));
                const bVPadBot = Math.max(10, Math.round(bFs * 0.64));

                let baseScaredTailPts: number[] = [];
                if (tailDirection === "bottom") {
                  baseScaredTailPts = [el.width * 0.32, el.height - 2, el.width * 0.26, el.height + 22, el.width * 0.45, el.height - 2];
                } else if (tailDirection === "top") {
                  baseScaredTailPts = [el.width * 0.32, 2, el.width * 0.26, -22, el.width * 0.45, 2];
                } else if (tailDirection === "left") {
                  baseScaredTailPts = [2, el.height * 0.32, -22, el.height * 0.26, 2, el.height * 0.45];
                } else if (tailDirection === "right") {
                  baseScaredTailPts = [el.width - 2, el.height * 0.32, el.width + 22, el.height * 0.26, el.width - 2, el.height * 0.45];
                }
                const scaredTailPts = flipTailX(baseScaredTailPts);

                const thoughtBigX = tailDir === "right" ? el.width * 0.74 : el.width * 0.26;
                const thoughtSmallX = tailDir === "right" ? el.width * 0.84 : el.width * 0.16;

                // 생각 말풍선 꼬리: 큰→중간→작은 3단 구름방울(코미포식). 외곽선은 본체보다 살짝 얇게.
                const thoughtSW = bStrokeW * 0.8;
                const tBubble = (x: number, y: number, rx: number, ry: number, key: string) => (
                  <Ellipse key={key} x={x} y={y} radiusX={rx} radiusY={ry} fill={el.fill} stroke={bStroke} strokeWidth={thoughtSW} />
                );
                let thoughtEllipses = null;
                if (showTail) {
                  if (tailDirection === "bottom") {
                    thoughtEllipses = (
                      <>
                        {tBubble(thoughtBigX, el.height + 14, 14, 11, "a")}
                        {tBubble(thoughtBigX, el.height + 32, 10, 8, "b")}
                        {tBubble(thoughtSmallX, el.height + 54, 6, 5, "c")}
                      </>
                    );
                  } else if (tailDirection === "top") {
                    thoughtEllipses = (
                      <>
                        {tBubble(thoughtBigX, -14, 14, 11, "a")}
                        {tBubble(thoughtBigX, -32, 10, 8, "b")}
                        {tBubble(thoughtSmallX, -54, 6, 5, "c")}
                      </>
                    );
                  } else if (tailDirection === "left") {
                    const bigY = tailDir === "right" ? el.height * 0.74 : el.height * 0.26;
                    const smallY = tailDir === "right" ? el.height * 0.84 : el.height * 0.16;
                    thoughtEllipses = (
                      <>
                        {tBubble(-14, bigY, 11, 14, "a")}
                        {tBubble(-32, bigY, 8, 10, "b")}
                        {tBubble(-54, smallY, 5, 6, "c")}
                      </>
                    );
                  } else if (tailDirection === "right") {
                    const bigY = tailDir === "right" ? el.height * 0.74 : el.height * 0.26;
                    const smallY = tailDir === "right" ? el.height * 0.84 : el.height * 0.16;
                    thoughtEllipses = (
                      <>
                        {tBubble(el.width + 14, bigY, 11, 14, "a")}
                        {tBubble(el.width + 32, bigY, 8, 10, "b")}
                        {tBubble(el.width + 54, smallY, 5, 6, "c")}
                      </>
                    );
                  }
                }

                let phoneTailPts = tailDir === "right"
                  ? [el.width - 1, 14, el.width + 10, 20, el.width - 1, 26]
                  : [1, 14, -10, 20, 1, 26];

                if (showTail) {
                  if (tailDirection === "bottom") {
                    phoneTailPts = tailDir === "right"
                      ? [el.width - 26, el.height - 1, el.width - 20, el.height + 10, el.width - 14, el.height - 1]
                      : [14, el.height - 1, 20, el.height + 10, 26, el.height - 1];
                  } else if (tailDirection === "top") {
                    phoneTailPts = tailDir === "right"
                      ? [el.width - 26, 1, el.width - 20, -10, el.width - 14, 1]
                      : [14, 1, 20, -10, 26, 1];
                  } else if (tailDirection === "left") {
                    phoneTailPts = [1, el.height * 0.35, -10, el.height * 0.45, 1, el.height * 0.55];
                  } else if (tailDirection === "right") {
                    phoneTailPts = [el.width - 1, el.height * 0.35, el.width + 10, el.height * 0.45, el.width - 1, el.height * 0.55];
                  }
                }

                let lx = el.width * tXRatio;
                let ly = el.height + bTailLen;

                if (tailDirection === "bottom") {
                  const ratio = tailDir === "right" ? 1 - tXRatio : tXRatio;
                  lx = el.width * ratio;
                  ly = el.height + bTailLen;
                } else if (tailDirection === "top") {
                  const ratio = tailDir === "right" ? 1 - tXRatio : tXRatio;
                  lx = el.width * ratio;
                  ly = -bTailLen;
                } else if (tailDirection === "left") {
                  lx = -bTailLen;
                  ly = el.height * tXRatio;
                } else if (tailDirection === "right") {
                  lx = el.width + bTailLen;
                  ly = el.height * tXRatio;
                }

                const tailHandle = selectedId === el.id && showTail && !isExporting && (
                  <KCircle
                    x={lx}
                    y={ly}
                    radius={6 / effScale}
                    fill="#ffcc00"
                    stroke="#1f1a16"
                    strokeWidth={1.5 / effScale}
                    draggable
                    onDragMove={(e) => {
                      e.cancelBubble = true;
                      const node = e.target;
                      const dx = node.x();
                      const dy = node.y();

                      const dTop = Math.abs(dy);
                      const dBot = Math.abs(dy - el.height);
                      const dLeft = Math.abs(dx);
                      const dRight = Math.abs(dx - el.width);
                      const minDist = Math.min(dTop, dBot, dLeft, dRight);

                      let newDir: "bottom" | "top" | "left" | "right" = "bottom";
                      let ratio = tXRatio;
                      let len = tHeight;

                      if (minDist === dBot) {
                        newDir = "bottom";
                        const rawRatio = dx / el.width;
                        ratio = Math.max(0.15, Math.min(0.85, rawRatio));
                        len = Math.max(8, Math.min(150, dy - el.height));
                      } else if (minDist === dTop) {
                        newDir = "top";
                        const rawRatio = dx / el.width;
                        ratio = Math.max(0.15, Math.min(0.85, rawRatio));
                        len = Math.max(8, Math.min(150, -dy));
                      } else if (minDist === dLeft) {
                        newDir = "left";
                        const rawRatio = dy / el.height;
                        ratio = Math.max(0.15, Math.min(0.85, rawRatio));
                        len = Math.max(8, Math.min(150, -dx));
                      } else if (minDist === dRight) {
                        newDir = "right";
                        const rawRatio = dy / el.height;
                        ratio = Math.max(0.15, Math.min(0.85, rawRatio));
                        len = Math.max(8, Math.min(150, dx - el.width));
                      }

                      if (tailDir === "right" && (newDir === "bottom" || newDir === "top")) {
                        ratio = 1 - ratio;
                      }

                      patchEl(el.id, {
                        tailDirection: newDir,
                        tailXRatio: Math.round(ratio * 100) / 100,
                        tailHeight: Math.round(len),
                      });
                    }}
                    onDragEnd={(e) => {
                      e.cancelBubble = true;
                      e.target.x(lx);
                      e.target.y(ly);
                      e.target.getLayer()?.batchDraw();
                    }}
                  />
                );

                return wrapClip(
                  <Group
                    studioElementId={el.id}
                    key={el.id}
                    ref={setRef}
                    x={el.x}
                    y={el.y}
                    rotation={el.rotation}
                    opacity={el.opacity ?? 1}
                    draggable={draggable}
                    dragBoundFunc={snapBoundFunc}
                    shadowColor={bShadowColor}
                    shadowBlur={bShadowBlur}
                    shadowOpacity={bShadowOpacity}
                    shadowOffset={bShadowOffset}
                    onMouseDown={onSelect}
                    onTap={onSelect}
                    onDblClick={() => startEditText(el.id)}
                    onDblTap={() => startEditText(el.id)}
                    onDragEnd={(e) => patchEl(el.id, { x: e.target.x(), y: e.target.y() })}
                    onTransformEnd={(e) => {
                      const node = e.target as Konva.Group;
                      const w = Math.max(60, el.width * node.scaleX());
                      const h = Math.max(50, el.height * node.scaleY());
                      node.scaleX(1);
                      node.scaleY(1);
                      patchEl(el.id, { x: node.x(), y: node.y(), width: w, height: h, rotation: node.rotation() });
                    }}
                  >
                    {el.variant === "shout" ? (
                      <Star
                        x={el.width / 2}
                        y={el.height / 2}
                        numPoints={20}
                        innerRadius={36}
                        outerRadius={68}
                        scaleX={el.width / 136}
                        scaleY={el.height / 136}
                        fill={el.fill}
                        stroke={bStroke}
                        strokeWidth={bStrokeW}
                        lineJoin="round"
                      />
                    ) : el.variant === "thought" ? (
                      <>
                        <Rect
                          width={el.width}
                          height={el.height}
                          fill={el.fill}
                          cornerRadius={Math.min(el.width, el.height) / 2}
                          stroke={bStroke}
                          strokeWidth={bStrokeW}
                        />
                        {thoughtEllipses}
                      </>
                    ) : el.variant === "whisper" ? (
                      <Path
                        data={speechPathData}
                        fill={el.fill}
                        stroke={bStroke}
                        strokeWidth={bStrokeW}
                        lineJoin="round"
                        lineCap="round"
                        dash={[8, 5]}
                      />
                    ) : el.variant === "scared" ? (
                      <>
                        <Rect
                          width={el.width}
                          height={el.height}
                          fill={el.fill === "transparent" ? "transparent" : (el.fill === "#ffffff" ? "#f5f3ff" : el.fill)}
                          cornerRadius={14}
                          stroke="#7c3aed"
                          strokeWidth={2}
                          shadowColor="#7c3aed"
                          shadowBlur={6}
                          shadowOpacity={0.16}
                        />
                        {showTail && (
                          <Line
                            points={scaredTailPts}
                            closed
                            fill={el.fill === "transparent" ? "transparent" : (el.fill === "#ffffff" ? "#f5f3ff" : el.fill)}
                            stroke="#7c3aed"
                            strokeWidth={2}
                          />
                        )}
                      </>
                    ) : el.variant === "system" ? (
                      <>
                        <Rect
                          width={el.width}
                          height={el.height}
                          fill="#0a0f24"
                          opacity={0.88}
                          cornerRadius={4}
                          stroke="#0ea5e9"
                          strokeWidth={2.5}
                          shadowColor="#0ea5e9"
                          shadowBlur={8}
                          shadowOpacity={0.4}
                        />
                        <Rect
                          x={4}
                          y={4}
                          width={el.width - 8}
                          height={el.height - 8}
                          fill="transparent"
                          cornerRadius={2}
                          stroke="#38bdf8"
                          strokeWidth={1}
                          opacity={0.5}
                        />
                      </>
                    ) : el.variant === "angry" ? (
                      <Star
                        x={el.width / 2}
                        y={el.height / 2}
                        numPoints={22}
                        innerRadius={28}
                        outerRadius={64}
                        scaleX={el.width / 160}
                        scaleY={el.height / 160}
                        fill={el.fill}
                        stroke={webtoonTheme === "soft" ? "#dc2626" : webtoonTheme === "vivid" ? "#7f1d1d" : "#991b1b"}
                        strokeWidth={Math.max(bStrokeW, 3.5)}
                        lineJoin="round"
                      />
                    ) : el.variant === "phone" ? (
                      <>
                        <Rect
                          width={el.width}
                          height={el.height}
                          fill={el.fill}
                          cornerRadius={webtoonTheme === "soft" ? 10 : webtoonTheme === "vivid" ? 6 : 8}
                          stroke={bStroke}
                          strokeWidth={bStrokeW}
                        />
                        {showTail && (
                          <Line
                            points={phoneTailPts}
                            closed
                            fill={el.fill}
                            stroke={bStroke}
                            strokeWidth={bStrokeW}
                          />
                        )}
                      </>
                    ) : el.variant === "heart" ? (
                      <Path
                        data="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41 0.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                        fill={el.fill}
                        stroke={bStroke}
                        strokeWidth={bStrokeW}
                        scaleX={el.width / 24}
                        scaleY={el.height / 24}
                      />
                    ) : el.variant === "box" ? (
                      <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={webtoonTheme === "soft" ? 6 : webtoonTheme === "vivid" ? 3 : 4} stroke={bStroke} strokeWidth={bStrokeW} />
                    ) : (
                      <Path
                        data={speechPathData}
                        fill={el.fill}
                        stroke={bStroke}
                        strokeWidth={bStrokeW}
                        lineJoin="round"
                        lineCap="round"
                      />
                    )}
                    <KText
                      text={el.vertical ? formatVerticalText(el.text) : el.text}
                      width={Math.max(8, el.width - bHPad * 2)}
                      height={Math.max(8, el.height - (bVPadTop + bVPadBot))}
                      x={bHPad}
                      y={bVPadTop}
                      fontSize={bFs}
                      fontFamily={el.font ?? "Pretendard, sans-serif"}
                      fontStyle={el.fontStyle ?? "bold"}
                      fill={el.textFill}
                      align={el.align ?? "center"}
                      verticalAlign="middle"
                      lineHeight={bubbleLineHeight}
                      letterSpacing={bubbleLetterSpacing}
                    />
                    {tailHandle}
                  </Group>
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
                    {activePage.elements
                      .filter((pel) => !isEffectivelyHidden(pel, activePage.groups ?? []))
                      .map((pel, pIdx) => renderEl(pel, pIdx, { asMask: true }))}
                  </Group>
                ) : null;
                const mainEls = elements.map((el, idx) => {
                  if (isEffectivelyHidden(el, groups)) return null; // 숨긴 레이어/그룹은 렌더·내보내기에서 제외
                  const base = el.clipBelow && idx > 0 ? elements[idx - 1] : null;
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
                  if (base && !isEffectivelyHidden(base, groups)) {
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
                    {pageGhost}
                  </>
                );
              })()}
              {draft && <StudioDrawNode el={draft} />}
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
                boundBoxFunc={(oldBox, newBox) => (newBox.width < 24 || newBox.height < 24 ? oldBox : newBox)}
              />
              {/* 잠긴 선택 요소는 트랜스포머가 안 붙으므로 점선 박스로 '선택됨'을 표시(삭제·잠금해제 안내). */}
              {selected && selected.locked && marqueeIds.length === 0 && tool === "select" && !isExporting && (() => {
                const sb = elBounds(selected);
                return (
                  <Rect
                    x={sb.x}
                    y={sb.y}
                    width={sb.w}
                    height={sb.h}
                    rotation={(selected as { rotation?: number }).rotation ?? 0}
                    stroke="#7c5cff"
                    strokeWidth={1.5 / effScale}
                    dash={[7 / effScale, 4 / effScale]}
                    listening={false}
                  />
                );
              })()}
            </Layer>
            {/* 브러시 커서 프리뷰: 드로잉 모드에서 포인터를 따라다니는 브러시 크기 원 */}
            {!isExporting && tool === "draw" && (
              <Layer listening={false}>
                <KCircle
                  ref={brushCursorRef}
                  visible={false}
                  radius={Math.max(1.5, (drawMode === "shape" ? 6 : strokeWidth) / 2)}
                  stroke={drawMode === "eraser" ? "#71717a" : color}
                  strokeWidth={1.25 / effScale}
                  dash={drawMode === "eraser" ? [4 / effScale, 3 / effScale] : undefined}
                  opacity={0.9}
                />
              </Layer>
            )}
            {!isExporting && smudgeArmed && (
              <Layer listening={false}>
                <KCircle
                  ref={smudgeCursorRef}
                  visible={false}
                  radius={Math.max(1.5, smudgeRadius)}
                  stroke="#7c5cff"
                  strokeWidth={1.25 / effScale}
                  dash={[3 / effScale, 3 / effScale]}
                  opacity={0.9}
                />
              </Layer>
            )}
            {!isExporting && layerMaskPaintArmed && (
              <Layer listening={false}>
                <KCircle
                  ref={layerMaskCursorRef}
                  visible={false}
                  radius={Math.max(1.5, layerMaskRadius)}
                  stroke="#eab308"
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
            {!isExporting && marqueeRect && (
              <Layer listening={false}>
                <Rect
                  x={marqueeRect.x}
                  y={marqueeRect.y}
                  width={marqueeRect.w}
                  height={marqueeRect.h}
                  fill="rgba(90,140,255,0.12)"
                  stroke="rgba(90,140,255,0.85)"
                  strokeWidth={1 / effScale}
                  dash={[4 / effScale, 4 / effScale]}
                />
              </Layer>
            )}
            {/* 픽셀 선택 마칭앤츠 — 전용 레이어라 RAF 틱마다 이 레이어만 다시 그린다. */}
            {!isExporting && pixelOverlayFrame && (pixelOverlaySel || pixelDragPreview) && (
              <Layer listening={false}>
                <StudioSelectionAntsOverlay
                  selection={pixelOverlaySel}
                  drag={pixelDragPreview}
                  frame={pixelOverlayFrame}
                  scale={effScale}
                />
              </Layer>
            )}
            {/* 크롭 오버레이 — 크롭 모드 중 크롭 rect(바깥 어둡게 + 3분할선 + 8핸들). */}
            {!isExporting && cropRect && pixelOverlayFrame && (
              <Layer listening={false}>
                <StudioCropOverlay rect={cropRect} frame={pixelOverlayFrame} scale={effScale} />
              </Layer>
            )}
            {/* 패널 손그림 컷 오버레이 — 드래그 중 절단선 미리보기(유효/무효 색 구분). */}
            {!isExporting && panelSplitPreview && (
              <Layer listening={false}>
                <StudioPanelSplitOverlay preview={panelSplitPreview} gutterPx={panelGutter} scale={effScale} />
              </Layer>
            )}
            {/* 벡터 노드 편집 오버레이 — 자유선 점 핸들. */}
            {!isExporting && nodeEditArmed && selected?.type === "draw" && (
              <Layer listening={false}>
                <StudioNodeEditOverlay
                  handles={nodeEditHandles}
                  tool={nodeEditTool!}
                  pressures={nodeEditDraft?.elId === selected.id ? nodeEditDraft.pressures : selected.pressures}
                  scale={effScale}
                  activeHandleIndex={nodeEditDragRef.current?.session.pointIndex ?? null}
                />
              </Layer>
            )}
            {!isExporting && healCloneArmed && pixelOverlayFrame && (healCloneSourceAnchor || healCloneDragPreview) && (
              <Layer listening={false}>
                <StudioHealCloneOverlay
                  frame={pixelOverlayFrame}
                  scale={effScale}
                  sourceAnchor={healCloneSourceAnchor}
                  drag={healCloneDragPreview}
                  radiusPx={healCloneRadius}
                  mode={healCloneTool ?? "clone"}
                />
              </Layer>
            )}
            {!isExporting && layerMaskPaintArmed && pixelOverlayFrame && (
              <Layer listening={false}>
                <StudioLayerMaskOverlay
                  frame={pixelOverlayFrame}
                  scale={effScale}
                  drag={layerMaskDragPreview}
                  radiusPx={layerMaskRadius}
                  mode={layerMaskPaintMode}
                />
              </Layer>
            )}
            {!isExporting && (guides.x.length > 0 || guides.y.length > 0) && (
              <Layer listening={false}>
                {guides.x.map((gx) => (
                  <Line
                    key={`gx-${gx}`}
                    points={[gx, 0, gx, canvasH]}
                    stroke="#f43f5e"
                    strokeWidth={1 / effScale}
                    dash={[5 / effScale, 4 / effScale]}
                  />
                ))}
                {guides.y.map((gy) => (
                  <Line
                    key={`gy-${gy}`}
                    points={[0, gy, CANVAS_W, gy]}
                    stroke="#f43f5e"
                    strokeWidth={1 / effScale}
                    dash={[5 / effScale, 4 / effScale]}
                  />
                ))}
              </Layer>
            )}
            
            {/* 요소 간 스마트 가이드: 정렬 선분(로즈) + 균등 간격 배지(보라) */}
            {!isExporting && (smartGuides.segments.length > 0 || smartGuides.spacings.length > 0) && (
              <Layer listening={false}>
                {smartGuides.segments.map((seg, i) => (
                  <Line
                    key={`sgseg-${i}`}
                    points={seg.axis === "v" ? [seg.pos, seg.from, seg.pos, seg.to] : [seg.from, seg.pos, seg.to, seg.pos]}
                    stroke="#f43f5e"
                    strokeWidth={1 / effScale}
                    dash={seg.kind === "center" ? [7 / effScale, 3 / effScale] : undefined}
                  />
                ))}
                {smartGuides.spacings.map((sp, i) => (
                  <Group key={`sgsp-${i}`}>
                    {sp.spans.map((span, j) => (
                      <Group key={`sgsp-${i}-${j}`}>
                        <Line
                          points={sp.axis === "x" ? [span.from, sp.at, span.to, sp.at] : [sp.at, span.from, sp.at, span.to]}
                          stroke="#8b5cf6"
                          strokeWidth={1.5 / effScale}
                        />
                        <Line
                          points={
                            sp.axis === "x"
                              ? [span.from, sp.at - 5 / effScale, span.from, sp.at + 5 / effScale]
                              : [sp.at - 5 / effScale, span.from, sp.at + 5 / effScale, span.from]
                          }
                          stroke="#8b5cf6"
                          strokeWidth={1.5 / effScale}
                        />
                        <Line
                          points={
                            sp.axis === "x"
                              ? [span.to, sp.at - 5 / effScale, span.to, sp.at + 5 / effScale]
                              : [sp.at - 5 / effScale, span.to, sp.at + 5 / effScale, span.to]
                          }
                          stroke="#8b5cf6"
                          strokeWidth={1.5 / effScale}
                        />
                        <KText
                          x={sp.axis === "x" ? (span.from + span.to) / 2 - 24 / effScale : sp.at + 6 / effScale}
                          y={sp.axis === "x" ? sp.at + 6 / effScale : (span.from + span.to) / 2 - 6 / effScale}
                          width={48 / effScale}
                          align={sp.axis === "x" ? "center" : "left"}
                          text={`${Math.round(sp.gap)}`}
                          fontSize={12 / effScale}
                          fontStyle="bold"
                          fill="#8b5cf6"
                        />
                      </Group>
                    ))}
                  </Group>
                ))}
              </Layer>
            )}

            {/* 작가 수동 가이드선 */}
            {!isExporting && userGuides.length > 0 && (
              <Layer>
                {userGuides.map((g) => (
                  <Group key={`user-guide-${g.id}`}>
                    <Line
                      points={g.type === "v" ? [g.pos, 0, g.pos, canvasH] : [0, g.pos, CANVAS_W, g.pos]}
                      stroke="#0ea5e9"
                      strokeWidth={1.5 / effScale}
                      dash={[8 / effScale, 5 / effScale]}
                      listening={false}
                    />
                    <Line
                      points={g.type === "v" ? [g.pos, 0, g.pos, canvasH] : [0, g.pos, CANVAS_W, g.pos]}
                      stroke="transparent"
                      strokeWidth={12 / effScale}
                      draggable={true}
                      name="guide-line-handle"
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = g.type === "v" ? "ew-resize" : "ns-resize";
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "default";
                      }}
                      onDragMove={(e) => {
                        const node = e.target;
                        if (g.type === "v") {
                          node.y(0);
                          const offset = node.x();
                          const updatedPos = Math.max(0, Math.min(CANVAS_W, g.pos + offset));
                          setUserGuides((prev) =>
                            prev.map((item) => (item.id === g.id ? { ...item, pos: updatedPos } : item))
                          );
                          node.x(0);
                        } else {
                          node.x(0);
                          const offset = node.y();
                          const updatedPos = Math.max(0, Math.min(canvasH, g.pos + offset));
                          setUserGuides((prev) =>
                            prev.map((item) => (item.id === g.id ? { ...item, pos: updatedPos } : item))
                          );
                          node.y(0);
                        }
                      }}
                    />
                  </Group>
                ))}
              </Layer>
            )}

            {/* 대칭자 가이드선 */}
            {!isExporting && tool === "draw" && symmetryType !== "none" && (
              <Layer>
                {symmetryType === "vertical" && (
                  <>
                    <Line
                      points={[symmetryCenterX, 0, symmetryCenterX, canvasH]}
                      stroke="#0ea5e9"
                      strokeWidth={1.5 / effScale}
                      dash={[6 / effScale, 4 / effScale]}
                      listening={false}
                    />
                    <KCircle
                      x={symmetryCenterX}
                      y={symmetryCenterY}
                      radius={7 / effScale}
                      fill="#0ea5e9"
                      stroke="#ffffff"
                      strokeWidth={2 / effScale}
                      draggable={true}
                      name="symmetry-handle"
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "ew-resize";
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "default";
                      }}
                      onDragMove={(e) => {
                        const node = e.target;
                        node.y(symmetryCenterY); // Restrict Y
                        const newX = Math.max(0, Math.min(CANVAS_W, node.x()));
                        setSymmetryCenterX(newX);
                      }}
                    />
                  </>
                )}
                {symmetryType === "horizontal" && (
                  <>
                    <Line
                      points={[0, symmetryCenterY, CANVAS_W, symmetryCenterY]}
                      stroke="#0ea5e9"
                      strokeWidth={1.5 / effScale}
                      dash={[6 / effScale, 4 / effScale]}
                      listening={false}
                    />
                    <KCircle
                      x={symmetryCenterX}
                      y={symmetryCenterY}
                      radius={7 / effScale}
                      fill="#0ea5e9"
                      stroke="#ffffff"
                      strokeWidth={2 / effScale}
                      draggable={true}
                      name="symmetry-handle"
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "ns-resize";
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "default";
                      }}
                      onDragMove={(e) => {
                        const node = e.target;
                        node.x(symmetryCenterX); // Restrict X
                        const newY = Math.max(0, Math.min(canvasH, node.y()));
                        setSymmetryCenterY(newY);
                      }}
                    />
                  </>
                )}
                {symmetryType === "radial" && (
                  <>
                    <Ellipse
                      x={symmetryCenterX}
                      y={symmetryCenterY}
                      radiusX={6 / effScale}
                      radiusY={6 / effScale}
                      stroke="#0ea5e9"
                      strokeWidth={1.5 / effScale}
                      listening={false}
                    />
                    {Array.from({ length: symmetryRadialCount }).map((_, idx) => {
                      const angle = (idx * 2 * Math.PI) / symmetryRadialCount;
                      const len = Math.max(CANVAS_W, canvasH) * 1.5;
                      return (
                        <Line
                          key={`radial-${idx}`}
                          points={[
                            symmetryCenterX,
                            symmetryCenterY,
                            symmetryCenterX + len * Math.cos(angle),
                            symmetryCenterY + len * Math.sin(angle),
                          ]}
                          stroke="#0ea5e9"
                          strokeWidth={1 / effScale}
                          dash={[4 / effScale, 4 / effScale]}
                          opacity={0.7}
                          listening={false}
                        />
                      );
                    })}
                    <KCircle
                      x={symmetryCenterX}
                      y={symmetryCenterY}
                      radius={8 / effScale}
                      fill="#0ea5e9"
                      stroke="#ffffff"
                      strokeWidth={2 / effScale}
                      draggable={true}
                      name="symmetry-handle"
                      onMouseEnter={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "move";
                      }}
                      onMouseLeave={(e) => {
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = "default";
                      }}
                      onDragMove={(e) => {
                        const node = e.target;
                        const newX = Math.max(0, Math.min(CANVAS_W, node.x()));
                        const newY = Math.max(0, Math.min(canvasH, node.y()));
                        setSymmetryCenterX(newX);
                        setSymmetryCenterY(newY);
                      }}
                    />
                  </>
                )}
              </Layer>
            )}
            {!isExporting && tool === "draw" && perspectiveRulerActive && vanishingPoints.length > 0 && (
              <Layer>
                <StudioPerspectiveOverlay
                  points={vanishingPoints}
                  canvasWidth={CANVAS_W}
                  canvasHeight={canvasH}
                  effScale={effScale}
                  onMovePoint={moveVanishingPointById}
                />
              </Layer>
            )}
            {!isExporting && tool === "draw" && isometricGridActive && (
              <Layer>
                <StudioIsometricGridOverlay
                  config={{
                    angleDeg: isometricAngleDeg,
                    cellSize: isometricCellSize,
                    originX: isometricOriginX,
                    originY: isometricOriginY,
                  }}
                  canvasWidth={CANVAS_W}
                  canvasHeight={canvasH}
                  effScale={effScale}
                  onMoveOrigin={(x, y) => {
                    setIsometricOriginX(x);
                    setIsometricOriginY(y);
                  }}
                />
              </Layer>
            )}
          </Stage>
          </div>
          {pageGrade.vignette > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: vignetteCss(pageGrade.vignette) }}
            />
          )}
          </div>
          </div>

          {showQuickStart && (
            <QuickStartPanel
              onDismiss={dismissQuickStart}
              onExample={startFromExample}
              onOpenTemplate={() => openQuickStartMenu("template")}
              onOpenCharacter={() => {
                dismissQuickStart();
                setPoserVrmOpen(true);
              }}
              onOpenBubble={() => openQuickStartMenu("bubble")}
              onOpenPublish={openPublishStep}
            />
          )}

          <button
            type="button"
            onClick={() => setQuickStartOpen(true)}
            className="absolute bottom-3 right-3 z-30 hidden size-10 place-items-center rounded-full border border-line bg-panel/95 text-sm font-bold text-fg shadow-lg backdrop-blur transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:grid"
            aria-label="빠른 시작 도움말 열기"
            aria-expanded={showQuickStart}
            title="빠른 시작"
          >
            ?
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="absolute bottom-3 right-16 z-30 hidden size-10 place-items-center rounded-full border border-line bg-panel/95 text-base text-fg shadow-lg backdrop-blur transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:grid"
            aria-label="키보드 단축키 보기"
            title="키보드 단축키 (?)"
          >
            ⌨
          </button>

          {shortcutsOpen && (
            <Suspense fallback={null}>
              <StudioShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
            </Suspense>
          )}
          {historyPanelOpen && (
            <Suspense fallback={null}>
              <StudioHistoryPanel
                history={pagesHistory}
                currentIndex={pagesHi}
                onJumpTo={jumpToHistoryIndex}
                onClose={() => setHistoryPanelOpen(false)}
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
                    ? "회전이 0°인 셀만 프레임을 캡처할 수 있어요."
                    : (frameAnimEl.frames?.length ?? 0) >= MAX_ANIM_FRAMES
                      ? "프레임은 최대 60장까지 만들 수 있어요."
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
                    hidden: !!el.hidden,
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
                onClose={() => setDialogueBatchOpen(false)}
                onSelectElement={selectDialogueElement}
                onPatchText={patchDialogueText}
                onApplyReplace={applyDialogueReplacePlan}
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
                  // 모드 전환 시 선택을 비운다 — 이전 모드의 요소 id 가 남으면 좌표계가 어긋난다.
                  setMasterEditMode((v) => !v);
                  setSelectedId(null);
                  setMarqueeIds([]);
                }}
                onToggleHideMaster={(pageId) => commitPages(togglePageHideMaster(pages, pageId))}
                onClearMaster={() => {
                  setMaster(createEmptyDocumentMaster<El>());
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
            <AiAssetNotice onCancel={() => setAiNoticeOpen(false)} onAcknowledge={acknowledgeAiNotice} />
          )}

          {/* 캔버스 줌 컨트롤 — ⌘± / ⌘0 단축키 또는 ⌘+휠과 동일 동작 (모바일은 하단 도구막대로 대체) */}
          <div className="absolute bottom-3 left-3 z-30 hidden items-center gap-0.5 rounded-full border border-line bg-panel/95 p-0.5 shadow-lg backdrop-blur lg:flex">
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z - 0.25))}
              disabled={zoom <= ZOOM_MIN}
              className="grid size-7 place-items-center rounded-full text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="축소"
              title="축소 (⌘−)"
            >
              <Minus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              className="min-w-[3.25rem] rounded-full px-1 text-center text-xs font-semibold tabular-nums text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="확대·축소 100%로 맞춤"
              title="100%로 맞춤 (⌘0)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => clampZoom(z + 0.25))}
              disabled={zoom >= ZOOM_MAX}
              className="grid size-7 place-items-center rounded-full text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="확대"
              title="확대 (⌘+)"
            >
              <Plus className="size-3.5" />
            </button>
          </div>

          {/* 텍스트 인라인 편집 오버레이 */}
          {editing && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6">
              <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-4">
                <p className="mb-2 text-sm font-medium text-fg">텍스트 편집</p>
                <textarea
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- 텍스트 편집 모달은 사용자 액션으로만 열리며, 열릴 때 입력란에 포커스를 주는 것이 올바른 모달 a11y 패턴
                  autoFocus
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditing(null);
                    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      commitEditText();
                    }
                  }}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-line bg-card p-2 text-sm text-fg outline-none focus:border-accent"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" onClick={() => setEditing(null)} className={buttonClass({ size: "sm", variant: "quiet" })}>
                    취소
                  </button>
                  <button type="button" onClick={commitEditText} className={buttonClass({ size: "sm", variant: "solid" })}>
                    적용
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 캔버스 ↔ 속성 패널 너비 스플리터(데스크톱) */}
        {rightPanelOpen && (
          <PanelResizeHandle handleProps={rightResize.handleProps} dragging={rightResize.dragging} label="속성 패널 너비 조절" />
        )}

        {/* 사이드: 속성 + 게시 정보 (접으면 얇은 레일로) */}
        {!rightPanelOpen && (
          <button
            type="button"
            onClick={() => setRightPanelOpen(true)}
            className="hidden w-7 flex-shrink-0 flex-col items-center gap-2 rounded-2xl border border-line bg-panel/40 py-3 text-fg-3 transition-colors hover:bg-raised lg:flex"
            title="속성 패널 펼치기"
          >
            <ChevronLeft size={14} />
            <span className="text-[0.68rem] font-semibold [writing-mode:vertical-rl]">속성</span>
          </button>
        )}
        <aside
          ref={propsSheetRef}
          role={isMobile ? "dialog" : undefined}
          aria-modal={isMobile && mobileSheet === "props" ? true : undefined}
          aria-label={isMobile ? "속성" : undefined}
          inert={isMobile && mobileSheet !== "props" ? true : undefined}
          className={cn(
            "flex flex-col gap-4",
            // 모바일: 하단에서 올라오는 바텀시트
            "fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-y-auto rounded-t-3xl border border-line bg-panel p-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out",
            // 데스크톱: 인라인 컬럼(드래그로 너비 조절)
            "lg:static lg:z-auto lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "props" ? "translate-y-0" : "translate-y-full",
            !rightPanelOpen && "lg:hidden"
          )}
          style={isMobile ? undefined : { width: rightResize.width, minWidth: 248 }}
        >
          {/* 모바일 시트 손잡이 + 닫기 */}
          <div className="flex items-center justify-between lg:hidden">
            <div className="mx-auto h-1 w-10 rounded-full bg-line" />
            <button
              type="button"
              onClick={() => setMobileSheet(null)}
              className="absolute right-3 rounded p-1 text-fg-3 hover:bg-raised"
              aria-label="속성 시트 닫기"
              data-autofocus
            >
              <X size={16} />
            </button>
          </div>
          <div className="hidden justify-end lg:flex">
            <button
              type="button"
              onClick={() => setRightPanelOpen(false)}
              className="inline-flex items-center gap-0.5 rounded text-[0.68rem] text-fg-3 transition-colors hover:text-fg"
              title="속성 패널 접기"
            >
              접기 <ChevronRight size={13} />
            </button>
          </div>
          <div className="rounded-2xl border border-line bg-panel/40 p-3">
            <p className="mb-2 text-xs font-semibold text-fg-3">캔버스</p>
            <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
              배경색
              <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent" />
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {BG_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyBgPreset(p)}
                  title={p.label}
                  aria-label={`배경 ${p.label}`}
                  className="h-6 w-6 rounded-md border border-line"
                  style={{ background: p.grad ? `linear-gradient(${p.grad[0]}, ${p.grad[1]})` : p.fill }}
                />
              ))}
            </div>
            {/* 그라디언트 배경 프리셋 — 세로 그라데이션으로 페이지 배경을 칠한다(웹툰 시간대·무드). */}
            <div className="mt-2">
              <p className="mb-1 text-[0.68rem] font-medium text-fg-3">그라디언트 배경</p>
              <div className="flex flex-wrap gap-1.5">
                {GRADIENT_PRESETS.map((g) => {
                  const [c0, c1] = gradientToBgGrad(g);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setBgGrad(gradientToBgGrad(g))}
                      title={g.tip}
                      aria-label={`그라디언트 ${g.label}`}
                      className="h-6 w-6 rounded-md border border-line"
                      style={{ background: `linear-gradient(${c0}, ${c1})` }}
                    />
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 text-sm text-fg-2">
              <span>높이</span>
              <span className="flex items-center gap-1">
                <button type="button" aria-label="높이 240px 줄이기" onClick={() => setCanvasH((h) => Math.max(480, h - 240))} className="rounded border border-line px-2 text-fg-2 hover:bg-raised">
                  −
                </button>
                <span className="numeral w-12 text-center text-xs" aria-label={`높이 ${canvasH}px`}>{canvasH}</span>
                <button type="button" aria-label="높이 240px 늘리기" onClick={() => setCanvasH((h) => Math.min(6000, h + 240))} className="rounded border border-line px-2 text-fg-2 hover:bg-raised">
                  +
                </button>
              </span>
            </div>
            {!masterEditMode && (
              <div className="mt-3">
                <StudioMagicResizePanel
                  currentSize={{ width: CANVAS_W, height: canvasH }}
                  strategy={magicResizeStrategy}
                  onStrategyChange={setMagicResizeStrategy}
                  onApplyPreset={applyMagicResizePreset}
                />
              </div>
            )}
            <label className="mt-3 flex items-center justify-between gap-2 text-sm text-fg-2">
              패널 여백 (Gutter)
              <span className="flex items-center gap-1.5">
                <input
                  type="range"
                  min={8}
                  max={48}
                  step={2}
                  value={panelGutter}
                  onChange={(e) => {
                    const nextGutter = Number(e.target.value);
                    setPanelGutter(nextGutter);
                    if (currentTemplate) {
                      const nextEls = regenerateTemplate(currentTemplate, nextGutter);
                      commit(nextEls);
                    }
                  }}
                  className="w-24 accent-accent cursor-pointer"
                  disabled={!currentTemplate || currentTemplate.id === "blank"}
                />
                <span className="w-5 text-right text-xs tabular-nums text-fg-3">{panelGutter}</span>
              </span>
            </label>
            <div className="mt-3 border-t border-line/50 pt-2 space-y-2">
              <label className="flex items-center justify-between text-xs text-fg-2">
                정렬 가이드 (스냅)
                <input
                  type="checkbox"
                  checked={snapEnabled}
                  onChange={(e) => setSnapEnabled(e.target.checked)}
                  className="size-3.5 accent-accent"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-fg-2">
                그리드 격자 표시
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="size-3.5 accent-accent"
                  />
                  {showGrid && (
                    <select
                      value={gridSize}
                      onChange={(e) => setGridSize(Number(e.target.value))}
                      className="rounded border border-line bg-card px-1 py-0.5 text-[10px]"
                    >
                      {[20, 30, 40, 50, 60, 80].map((sz) => (
                        <option key={sz} value={sz}>{sz}px</option>
                      ))}
                    </select>
                  )}
                </div>
              </label>

              <label className="flex items-center justify-between text-xs text-fg-2">
                웹툰 규격 가이드
                <input
                  type="checkbox"
                  checked={showWebtoonGuides}
                  onChange={(e) => {
                    if (e.target.checked) ensureWebtoonGuidesLoaded();
                    setShowWebtoonGuides(e.target.checked);
                  }}
                  onPointerEnter={ensureWebtoonGuidesLoaded}
                  onFocus={ensureWebtoonGuidesLoaded}
                  className="size-3.5 accent-accent"
                />
              </label>
              {showWebtoonGuides && (
                <div className="rounded-md border border-line bg-card px-2 py-1.5 text-[0.68rem] leading-snug text-fg-3">
                  {webtoonGuides
                    ? (() => {
                        const len = webtoonGuides.episodeLengthLabel(canvasH);
                        return (
                          <>
                            <span className="font-semibold text-fg-2">{len.label}</span> · {len.tier}
                            <br />
                            파란 점선 = 플랫폼 표준폭(네이버 690·카카오 720), 붉은 음영 = 세이프영역.
                          </>
                        );
                      })()
                    : "웹툰 규격 가이드를 여는 중..."}
                </div>
              )}

              {/* 작가 가이드선 (Artist Guidelines) */}
              <div className="pt-2 border-t border-line/35 space-y-2">
                <p className="text-[0.65rem] font-bold text-fg-2">스냅 가이드선</p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setUserGuides((prev) => [
                        ...prev,
                        { id: uid(), type: "v", pos: 400 },
                      ]);
                    }}
                    className="flex-1 rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg hover:bg-raised transition-colors cursor-pointer"
                  >
                    + 세로 가이드
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUserGuides((prev) => [
                        ...prev,
                        { id: uid(), type: "h", pos: canvasH / 2 },
                      ]);
                    }}
                    className="flex-1 rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg hover:bg-raised transition-colors cursor-pointer"
                  >
                    + 가로 가이드
                  </button>
                </div>

                {userGuides.length > 0 && (
                  <div className="space-y-1.5 rounded-lg border border-line bg-card/30 p-2 max-h-40 overflow-y-auto">
                    {userGuides.map((guide, idx) => (
                      <div key={guide.id} className="flex items-center justify-between gap-1.5 text-[0.65rem]">
                        <span className="text-fg-2 font-medium">
                          {guide.type === "v" ? "세로" : "가로"} #{idx + 1} ({Math.round(guide.pos)}px)
                        </span>
                        <div className="flex items-center gap-1">
                          <input
                            type="range"
                            min={0}
                            max={guide.type === "v" ? 800 : canvasH}
                            value={guide.pos}
                            onChange={(e) => {
                              const pos = Number(e.target.value);
                              setUserGuides((prev) =>
                                prev.map((g) => (g.id === guide.id ? { ...g, pos } : g))
                              );
                            }}
                            className="w-16 h-2 accent-accent cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setUserGuides((prev) => prev.filter((g) => g.id !== guide.id));
                            }}
                            className="text-[9px] text-bad hover:underline ml-1 cursor-pointer"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setUserGuides([])}
                      className="w-full text-center text-[9px] text-bad-light hover:underline pt-1 border-t border-line/30 cursor-pointer"
                    >
                      모든 가이드 삭제
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 border-t border-line pt-3">
              <span className="text-[0.66rem] font-semibold text-fg-3 block mb-1.5">만화/웹툰 연출 스타일</span>
              <div className="grid grid-cols-3 gap-1 bg-card rounded-lg p-0.5 border border-line">
                {(["classic", "soft", "vivid"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setWebtoonTheme(style)}
                    className={cn(
                      "rounded py-1 text-[0.66rem] font-semibold transition-colors",
                      webtoonTheme === style
                        ? "bg-accent text-on-accent"
                        : "text-fg-2 hover:bg-raised"
                    )}
                  >
                    {style === "classic" ? "출판만화" : style === "soft" ? "소프트" : "비비드"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 페이지 전체 색보정(그레이드) — 무드 프리셋 + 밝기/대비/채도/색조/세피아/흑백/비네트 */}
          <div className="rounded-2xl border border-line bg-panel/40 p-3">
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
            <div className="rounded-2xl border border-line bg-panel/40 p-3">
              <Suspense fallback={<StudioPanelLoading label="속성 패널을 여는 중..." />}>
                <p className="mb-2 text-xs font-semibold text-fg-3">선택한 요소</p>
              {selected.type === "draw" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 색상
                    <input
                      type="color"
                      value={selected.stroke || "#16100c"}
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
                <>
                  <Suspense fallback={<StudioPanelLoading label="말풍선 스타일을 여는 중..." />}>
                    <StudioBubbleStylePresetPanel
                      selected={selected}
                      onApplyPreset={(patch) => patchEl(selected.id, patch as Partial<El>)}
                    />
                  </Suspense>

                  <div className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                    배경 투명
                    <input
                      type="checkbox"
                      checked={selected.fill === "transparent"}
                      onChange={(e) => {
                        patchEl(selected.id, {
                          fill: e.target.checked ? "transparent" : "#ffffff",
                        } as Partial<El>);
                      }}
                      className="size-4 accent-accent cursor-pointer"
                    />
                  </div>

                  {selected.fill !== "transparent" && (
                    <span className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                      말풍선색
                      <LazyStudioColorPopover
                        value={selected.fill}
                        onChange={(c) => patchEl(selected.id, { fill: c } as Partial<El>)}
                        recentColors={recentColors}
                        onUseColor={rememberColor}
                        onLoadRecentColors={ensureRecentColorsLoaded}
                        title="말풍선 색상"
                      />
                    </span>
                  )}

                  <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
                    <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">테두리 설정</p>

                    <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                      테두리 커스텀
                      <input
                        type="checkbox"
                        checked={!!selected.stroke}
                        onChange={(e) => {
                          const hasStroke = e.target.checked;
                          patchEl(selected.id, {
                            stroke: hasStroke ? (selected.stroke || "#16100c") : undefined,
                            strokeWidth: hasStroke ? (selected.strokeWidth || 3) : undefined,
                          } as Partial<El>);
                        }}
                        className="size-4 accent-accent cursor-pointer"
                      />
                    </div>

                    {!!selected.stroke && (
                      <>
                        <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                          테두리 색상
                          <input
                            type="color"
                            value={selected.stroke || "#16100c"}
                            onChange={(e) => patchEl(selected.id, { stroke: e.target.value } as Partial<El>)}
                            className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                          테두리 두께
                          <span className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0.5}
                              max={12}
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

                  <div className="mt-2.5 border-t border-line/40 pt-2.5 space-y-2.5">
                    <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">말풍선 그림자 (Shadow)</p>

                    <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                      그림자 사용
                      <input
                        type="checkbox"
                        checked={selected.shadowColor !== undefined}
                        onChange={(e) => {
                          const hasShadow = e.target.checked;
                          patchEl(selected.id, {
                            shadowColor: hasShadow ? (selected.shadowColor || "#000000") : undefined,
                            shadowBlur: hasShadow ? (selected.shadowBlur || 6) : undefined,
                            shadowOffsetX: hasShadow ? (selected.shadowOffsetX || 2) : undefined,
                            shadowOffsetY: hasShadow ? (selected.shadowOffsetY || 3) : undefined,
                            shadowOpacity: hasShadow ? (selected.shadowOpacity || 0.15) : undefined,
                          } as Partial<El>);
                        }}
                        className="size-4 accent-accent cursor-pointer"
                      />
                    </div>

                    {selected.shadowColor !== undefined && (
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
                              max={24}
                              step={1}
                              value={selected.shadowBlur ?? 6}
                              onChange={(e) => patchEl(selected.id, { shadowBlur: Number(e.target.value) } as Partial<El>)}
                              className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                            />
                            <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowBlur ?? 6}px</span>
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
                              value={selected.shadowOffsetX ?? 2}
                              onChange={(e) => patchEl(selected.id, { shadowOffsetX: Number(e.target.value) } as Partial<El>)}
                              className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                            />
                            <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.shadowOffsetX ?? 2}px</span>
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
                              min={0.05}
                              max={1}
                              step={0.05}
                              value={selected.shadowOpacity ?? 0.15}
                              onChange={(e) => patchEl(selected.id, { shadowOpacity: Number(e.target.value) } as Partial<El>)}
                              className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                            />
                            <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.shadowOpacity ?? 0.15) * 100)}%</span>
                          </span>
                        </label>
                      </>
                    )}
                  </div>
                </>
              )}
              {selected.type === "bubble" && selected.variant !== "shout" && selected.variant !== "box" && (
                <div className="mt-2.5 border-t border-line/40 pt-2.5">
                  <p className="mb-1 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">꼬리 위치 & 방향</p>
                  
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between text-xs text-fg-2">
                      <span>꼬리 대칭 방향</span>
                      <div className="flex gap-1 bg-card rounded-lg p-0.5 border border-line">
                        {[
                          { label: "왼쪽", v: "left" },
                          { label: "오른쪽", v: "right" },
                          { label: "없음", v: "none" },
                        ].map((t) => (
                          <button
                            key={t.v}
                            type="button"
                            onClick={() => patchEl(selected.id, { tail: t.v } as Partial<El>)}
                            className={cn(
                              "rounded px-2 py-0.5 text-[0.68rem] font-medium transition-colors cursor-pointer",
                              (selected.tail ?? "left") === t.v
                                ? "bg-accent text-on-accent shadow-sm font-semibold"
                                : "text-fg-2 hover:bg-raised"
                            )}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {(selected.tail ?? "left") !== "none" && (
                      <div className="flex items-center justify-between text-xs text-fg-2">
                        <span>말풍선 부착면</span>
                        <div className="flex gap-1 bg-card rounded-lg p-0.5 border border-line">
                          {[
                            { label: "위", v: "top" },
                            { label: "아래", v: "bottom" },
                            { label: "왼쪽", v: "left" },
                            { label: "오른쪽", v: "right" },
                          ].map((td) => (
                            <button
                              key={td.v}
                              type="button"
                              onClick={() => patchEl(selected.id, { tailDirection: td.v as "top" | "bottom" | "left" | "right" } as Partial<El>)}
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[0.68rem] font-medium transition-colors cursor-pointer",
                                (selected.tailDirection ?? "bottom") === td.v
                                  ? "bg-accent text-on-accent shadow-sm font-semibold"
                                  : "text-fg-2 hover:bg-raised"
                              )}
                            >
                              {td.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {selected.type === "bubble" && selected.variant !== "shout" && selected.variant !== "box" && (selected.tail ?? "left") !== "none" && (
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
              {selected.type === "bubble" && selected.variant !== "shout" && selected.variant !== "box" && (selected.tail ?? "left") !== "none" && (
                <div className="mt-3 space-y-2 border-t border-line/40 pt-2.5">
                  {!!(selected.tailAnchorId || selected.tailAnchorPoint) && (
                    <p className="text-[0.68rem] text-fg-3">
                      자동 부착 중에는 위 '꼬리 자동 부착' 패널에서 해제해야 조절할 수 있어요.
                    </p>
                  )}
                  <label
                    className={cn(
                      "flex items-center justify-between gap-2 text-sm text-fg-2",
                      !!(selected.tailAnchorId || selected.tailAnchorPoint) && "pointer-events-none opacity-40"
                    )}
                  >
                    {(selected.tailDirection === "left" || selected.tailDirection === "right") ? "꼬리 세로 위치" : "꼬리 가로 위치"}
                    <span className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={0.1}
                        max={0.9}
                        step={0.05}
                        value={selected.tailXRatio ?? 0.35}
                        disabled={!!(selected.tailAnchorId || selected.tailAnchorPoint)}
                        onChange={(e) => patchEl(selected.id, { tailXRatio: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.tailXRatio ?? 0.35) * 100)}%</span>
                    </span>
                  </label>
                  <label
                    className={cn(
                      "flex items-center justify-between gap-2 text-sm text-fg-2",
                      !!(selected.tailAnchorId || selected.tailAnchorPoint) && "pointer-events-none opacity-40"
                    )}
                  >
                    꼬리 길이
                    <span className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={10}
                        max={80}
                        step={2}
                        value={selected.tailHeight ?? 30}
                        disabled={!!(selected.tailAnchorId || selected.tailAnchorPoint)}
                        onChange={(e) => patchEl(selected.id, { tailHeight: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.tailHeight ?? 30}px</span>
                    </span>
                  </label>

                  {/* 추가 꼬리 — 두 화자 동시 대사(합창) 말풍선. 주 꼬리 외 최대 2개. */}
                  <div className="mt-2 border-t border-line/40 pt-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[0.72rem] font-semibold text-fg-2">추가 꼬리 (동시 대사)</p>
                      <button
                        type="button"
                        disabled={normalizeExtraTails(selected.extraTails).length >= BUBBLE_MAX_TAILS - 1}
                        onClick={() =>
                          patchEl(selected.id, {
                            extraTails: [
                              ...normalizeExtraTails(selected.extraTails),
                              { direction: "bottom", ratio: 0.75, length: 26, base: 18, side: "center" },
                            ],
                          } as Partial<El>)
                        }
                        className="rounded-lg border border-line bg-card px-2 py-1 text-[0.72rem] font-medium text-fg-2 hover:bg-raised disabled:opacity-40"
                      >
                        + 꼬리 추가
                      </button>
                    </div>
                    {normalizeExtraTails(selected.extraTails).map((extraTail, extraIdx) => (
                      <div key={extraIdx} className="mt-1.5 flex items-center gap-1.5">
                        <select
                          value={extraTail.direction}
                          aria-label={`추가 꼬리 ${extraIdx + 1} 방향`}
                          onChange={(e) => {
                            const next = normalizeExtraTails(selected.extraTails);
                            next[extraIdx] = { ...next[extraIdx], direction: e.target.value as BubbleTailSpec["direction"] };
                            patchEl(selected.id, { extraTails: next } as Partial<El>);
                          }}
                          className="rounded border border-line bg-card px-1.5 py-1 text-[0.72rem] text-fg cursor-pointer"
                        >
                          <option value="bottom">아래</option>
                          <option value="top">위</option>
                          <option value="left">왼쪽</option>
                          <option value="right">오른쪽</option>
                        </select>
                        <input
                          type="range"
                          min={0.1}
                          max={0.9}
                          step={0.05}
                          value={extraTail.ratio}
                          aria-label={`추가 꼬리 ${extraIdx + 1} 위치`}
                          onChange={(e) => {
                            const next = normalizeExtraTails(selected.extraTails);
                            next[extraIdx] = { ...next[extraIdx], ratio: Number(e.target.value) };
                            patchEl(selected.id, { extraTails: next } as Partial<El>);
                          }}
                          className="h-2 flex-1 accent-accent cursor-pointer"
                        />
                        <button
                          type="button"
                          aria-label={`추가 꼬리 ${extraIdx + 1} 제거`}
                          onClick={() => {
                            const next = normalizeExtraTails(selected.extraTails).filter((_, i) => i !== extraIdx);
                            patchEl(selected.id, { extraTails: next.length ? next : undefined } as Partial<El>);
                          }}
                          className="rounded p-1 text-fg-3 hover:bg-raised hover:text-bad"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
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
                        className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[0.66rem] text-fg-3">세로 위치 (Y)</span>
                      <input
                        type="number"
                        value={Math.round(selected.y)}
                        onChange={(e) => patchEl(selected.id, { y: Number(e.target.value) } as Partial<El>)}
                        className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                    </label>
                    {(selected.type === "image" || selected.type === "bubble" || selected.type === "frame" || selected.type === "text") && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[0.66rem] text-fg-3">너비 (Width)</span>
                        <input
                          type="number"
                          value={Math.round(selected.width)}
                          onChange={(e) => patchEl(selected.id, { width: Math.max(10, Number(e.target.value)) } as Partial<El>)}
                          className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
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
                          className="rounded border border-line bg-canvas/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
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
                            className="w-14 rounded border border-line bg-canvas/50 px-1 py-0.5 text-center text-xs text-fg focus:border-accent focus:outline-none"
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

              {/* 집중선 및 속도선 선 효과 설정 */}
              {selected.type === "focusLines" && (
                <div className="mt-3 space-y-3 border-t border-line/50 pt-3">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">집중선 설정</p>

                  <div className="space-y-1 rounded-lg border border-line bg-card/45 p-2">
                    <p className="text-[0.66rem] font-semibold text-fg-3">집중선 프리셋</p>
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      {[
                        { label: "기본 집중선", config: { lineCount: 80, innerRadius: 100, outerRadius: 400, noise: 20, strokeWidth: 2.5 } },
                        { label: "강렬한 스릴러", config: { lineCount: 160, innerRadius: 80, outerRadius: 500, noise: 40, strokeWidth: 4.5 } },
                        { label: "미세 집중선", config: { lineCount: 140, innerRadius: 120, outerRadius: 400, noise: 10, strokeWidth: 1.2 } },
                        { label: "방사형 어둠", config: { lineCount: 180, innerRadius: 155, outerRadius: 320, noise: 30, strokeWidth: 6.0 } },
                      ].map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => patchEl(selected.id, p.config as Partial<El>)}
                          className="rounded-md border border-line bg-panel py-0.5 text-center text-[0.65rem] text-fg-2 hover:bg-raised hover:text-fg font-medium transition-colors"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 개수
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={10}
                        max={200}
                        step={5}
                        value={selected.lineCount ?? 80}
                        onChange={(e) => patchEl(selected.id, { lineCount: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.lineCount ?? 80}</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    내부 반경
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={300}
                        step={5}
                        value={selected.innerRadius ?? 100}
                        onChange={(e) => patchEl(selected.id, { innerRadius: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.innerRadius ?? 100}px</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    외부 반경
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={100}
                        max={800}
                        step={10}
                        value={selected.outerRadius ?? 400}
                        onChange={(e) => patchEl(selected.id, { outerRadius: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.outerRadius ?? 400}px</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    지터 노이즈
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={2}
                        value={selected.noise ?? 20}
                        onChange={(e) => patchEl(selected.id, { noise: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.noise ?? 20}</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 색상
                    <input
                      type="color"
                      value={selected.stroke ?? "#000000"}
                      onChange={(e) => patchEl(selected.id, { stroke: e.target.value } as Partial<El>)}
                      className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 두께
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={selected.strokeWidth ?? 2.5}
                        onChange={(e) => patchEl(selected.id, { strokeWidth: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{(selected.strokeWidth ?? 2.5).toFixed(1)}</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    초점 가로 위치
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selected.centerXRatio ?? 0.5}
                        onChange={(e) => patchEl(selected.id, { centerXRatio: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.centerXRatio ?? 0.5) * 100)}%</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    초점 세로 위치
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={selected.centerYRatio ?? 0.5}
                        onChange={(e) => patchEl(selected.id, { centerYRatio: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.centerYRatio ?? 0.5) * 100)}%</span>
                    </span>
                  </label>
                </div>
              )}

              {selected.type === "speedLines" && (
                <div className="mt-3 space-y-3 border-t border-line/50 pt-3">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">속도선 설정</p>

                  <div className="space-y-1 rounded-lg border border-line bg-card/45 p-2">
                    <p className="text-[0.66rem] font-semibold text-fg-3">속도선 프리셋</p>
                    <div className="mt-1 grid grid-cols-2 gap-1.5">
                      {[
                        { label: "가로 질주", config: { direction: "horizontal", lineCount: 50, strokeWidth: 2.5 } },
                        { label: "세로 낙하", config: { direction: "vertical", lineCount: 60, strokeWidth: 3.5 } },
                        { label: "미세 속도선", config: { lineCount: 100, strokeWidth: 1.2 } },
                        { label: "강한 폭발선", config: { lineCount: 35, strokeWidth: 6.0 } },
                      ].map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => patchEl(selected.id, p.config as Partial<El>)}
                          className="rounded-md border border-line bg-panel py-0.5 text-center text-[0.65rem] text-fg-2 hover:bg-raised hover:text-fg font-medium transition-colors"
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    방향
                    <div className="flex gap-1">
                      {[
                        { label: "가로", v: "horizontal" },
                        { label: "세로", v: "vertical" },
                      ].map((d) => (
                        <button
                          key={d.v}
                          type="button"
                          onClick={() => patchEl(selected.id, { direction: d.v } as Partial<El>)}
                          className={cn(
                            "rounded-md border px-2.5 py-0.5 text-xs",
                            (selected.direction ?? "horizontal") === d.v
                              ? "border-accent/60 bg-accent-soft/50 text-fg"
                              : "border-line text-fg-2 hover:bg-raised"
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 개수
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={10}
                        max={150}
                        step={5}
                        value={selected.lineCount ?? 50}
                        onChange={(e) => patchEl(selected.id, { lineCount: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.lineCount ?? 50}</span>
                    </span>
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 색상
                    <input
                      type="color"
                      value={selected.stroke ?? "#000000"}
                      onChange={(e) => patchEl(selected.id, { stroke: e.target.value } as Partial<El>)}
                      className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    선 두께
                    <span className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0.5}
                        max={10}
                        step={0.5}
                        value={selected.strokeWidth ?? 2.5}
                        onChange={(e) => patchEl(selected.id, { strokeWidth: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{(selected.strokeWidth ?? 2.5).toFixed(1)}</span>
                    </span>
                  </label>
                </div>
              )}

              {selected.type === "frame" && (
                <div className="mt-3 space-y-3 border-t border-line/50 pt-3">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">패널 컷 분할</p>
                  <label className="block">
                    <span className="flex items-center justify-between text-xs text-fg-2 mb-1.5">
                      <span>분할 비율</span>
                      <span className="numeral text-fg-3">{panelSplitRatio}% / {100 - panelSplitRatio}%</span>
                    </span>
                    <input
                      type="range"
                      aria-label="분할 비율"
                      min={20}
                      max={80}
                      step={5}
                      className="w-full accent-accent cursor-pointer"
                      value={panelSplitRatio}
                      onChange={(e) => setPanelSplitRatio(Number(e.target.value))}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => splitFrameSelected("vertical")}
                      className={cn(buttonClass({ size: "sm", variant: "solid" }), "min-h-9 w-full justify-center text-xs")}
                    >
                      세로로 분할
                    </button>
                    <button
                      type="button"
                      onClick={() => splitFrameSelected("horizontal")}
                      className={cn(buttonClass({ size: "sm", variant: "solid" }), "min-h-9 w-full justify-center text-xs")}
                    >
                      가로로 분할
                    </button>
                  </div>

                  <StudioPanelSplitPanel
                    active={panelSplitActive}
                    gutterPx={panelGutter}
                    hint={panelSplitHint}
                    onToggle={() => {
                      setPanelSplitHint(null);
                      setPanelSplitActive((v) => {
                        const next = !v;
                        if (next) {
                          disarmAllPixelTools();
                          return true;
                        }
                        return false;
                      });
                    }}
                    onGutterChange={setPanelGutter}
                  />

                  <div className="mt-3.5 border-t border-line/40 pt-2.5 space-y-2.5">
                    <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">패널 배경 및 테두리</p>

                    <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                      배경색
                      <input
                        type="color"
                        value={selected.bgColor || "#ffffff"}
                        onChange={(e) => patchEl(selected.id, { bgColor: e.target.value } as Partial<El>)}
                        className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                      />
                    </label>

                    <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                      테두리 커스텀
                      <input
                        type="checkbox"
                        checked={!!selected.stroke}
                        onChange={(e) => {
                          const hasStroke = e.target.checked;
                          patchEl(selected.id, {
                            stroke: hasStroke ? (selected.stroke || "#16100c") : undefined,
                            strokeWidth: hasStroke ? (selected.strokeWidth || 3) : undefined,
                          } as Partial<El>);
                        }}
                        className="size-4 accent-accent cursor-pointer"
                      />
                    </div>

                    {!!selected.stroke && (
                      <>
                        <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                          테두리 색상
                          <input
                            type="color"
                            value={selected.stroke || "#16100c"}
                            onChange={(e) => patchEl(selected.id, { stroke: e.target.value } as Partial<El>)}
                            className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                          />
                        </label>

                        <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                          테두리 두께
                          <span className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0}
                              max={16}
                              step={0.5}
                              value={selected.strokeWidth ?? 3}
                              onChange={(e) => patchEl(selected.id, { strokeWidth: Number(e.target.value) } as Partial<El>)}
                              className="w-24 accent-accent cursor-pointer sm:w-28 h-2"
                            />
                            <span className="w-8 text-right text-xs tabular-nums text-fg-3">{(selected.strokeWidth ?? 3).toFixed(1)}px</span>
                          </span>
                        </label>

                        <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                          <span>테두리 스타일</span>
                          <div className="flex gap-1 bg-card rounded-lg p-0.5 border border-line w-28">
                            {[
                              { label: "실선", v: "solid" },
                              { label: "점선", v: "dashed" }
                            ].map((style) => (
                              <button
                                key={style.v}
                                type="button"
                                onClick={() => patchEl(selected.id, { dashStyle: style.v as "solid" | "dashed" } as Partial<El>)}
                                className={cn(
                                  "flex-1 rounded py-0.5 text-[0.66rem] font-semibold transition-colors",
                                  (selected.dashStyle ?? "solid") === style.v
                                    ? "bg-accent text-on-accent"
                                    : "text-fg-2 hover:bg-raised"
                                )}
                              >
                                {style.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {selected.type === "image" && (
                <>
                  <StudioBgRemoveButton
                    src={selected.src}
                    onResult={(dataUrl) => patchEl(selected.id, { src: dataUrl })}
                  />
                  {/* 주요 색상 추출 — 스와치를 누르면 브러시·도형 색(전역 color 상태)으로 지정된다. */}
                  <StudioColorPalettePanel src={selected.src} onPickColor={(hex) => setColor(hex)} />
                  <StudioFloodFillPanel
                    src={selected.src}
                    onResult={(dataUrl) => void commitFloodFillResult(dataUrl)}
                  />
                  <StudioLineCleanupPanel
                    src={selected.src}
                    onResult={(dataUrl) => patchEl(selected.id, { src: dataUrl })}
                  />
                  <StudioImageAdjustmentsPanel
                    selected={selected}
                    filterClipboard={filterClipboard}
                    onSetFilterClipboard={setFilterClipboard}
                    onPatch={(patch) => patchEl(selected.id, patch)}
                  />
                  {/* 픽셀 선택 도구 — 이미지 안쪽 영역을 사각/타원/올가미/브러시로 선택해 부분 조정/삭제. */}
                  <StudioSelectionToolsPanel
                    selection={pixelSel}
                    activeTool={pixelTool === "wand" ? null : pixelTool}
                    combineMode={pixelCombine}
                    busy={pixelBusy}
                    brushRadius={pixelBrushRadius}
                    onBrushRadiusChange={setPixelBrushRadius}
                    onPickTool={(t) => {
                      if (t) disarmAllPixelTools();
                      setPixelTool(t);
                    }}
                    onCombineModeChange={setPixelCombine}
                    onFeatherChange={(px) => setPixelSel((s) => (s ? setSelectionFeather(s, px) : s))}
                    onToggleInvert={() => setPixelSel((s) => toggleSelectionInvert(s ?? emptyPixelSelection()))}
                    onUndoSubpath={() => setPixelSel((s) => (s ? removeLastSubpath(s) : s))}
                    onClearSelection={() => setPixelSel(null)}
                    onApplyAdjust={(plan) => void applyPixelSelectionAdjust(plan)}
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
                    onToggleActive={() =>
                      setSmudgeActive((v) => {
                        const next = !v;
                        if (next) {
                          disarmAllPixelTools();
                          return true;
                        }
                        return false;
                      })
                    }
                    onRadiusChange={setSmudgeRadius}
                    onStrengthChange={setSmudgeStrength}
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
                        setPixelSel(null); // 픽셀 선택 영역이 남아있으면 heal/clone 오버레이와 시각적으로 겹쳐 헷갈린다.
                      }
                      setHealCloneTool(next);
                    }}
                    onRadiusChange={setHealCloneRadius}
                    onHardnessChange={setHealCloneHardness}
                    onOpacityChange={setHealCloneOpacity}
                    onAlignedChange={setHealCloneAligned}
                    onClearSource={() => {
                      setHealCloneSourceAnchor(null);
                      healCloneOffsetRef.current = null;
                    }}
                  />
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
                      setPixelSel(null);
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
                    {parseStudio3dTool(selected.src) === "vrm-poser" && (
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
                    {parseStudio3dTool(selected.src) === "bg3d" && (
                      <button
                        type="button"
                        onClick={() => {
                          setBg3dInitialDataUrl(selected.src);
                          setBg3dInitialElementId(selected.id);
                          setBg3dOpen(true);
                        }}
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
                <button type="button" onClick={duplicateSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="복제 (⌘D)">
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
            <div className="rounded-2xl border border-line bg-panel/40 p-3 space-y-3">
              <p className="text-xs font-semibold text-fg-3">그리기 도구 설정</p>
              
              {/* 모드 선택: 펜 / 지우개 / 도형 */}
              <div className="flex gap-1 bg-card rounded-lg p-0.5 border border-line">
                {[
                  { label: "펜", v: "pen" },
                  { label: "지우개", v: "eraser" },
                  { label: "도형", v: "shape" },
                ].map((mode) => (
                  <button
                    key={mode.v}
                    type="button"
                    onClick={() => {
                      setDrawMode(mode.v as "pen" | "eraser" | "shape");
                      if (mode.v === "shape") {
                        setDrawShape("line");
                      }
                    }}
                    className={cn(
                      "flex-1 rounded py-1 text-[0.68rem] font-semibold transition-colors",
                      drawMode === mode.v
                        ? "bg-accent text-on-accent"
                        : "text-fg-2 hover:bg-raised"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {/* 지우개가 아닐 때 브러시 종류 선택 */}
              {drawMode === "pen" && (
                <div className="space-y-1">
                  <p className="text-[0.66rem] font-medium text-fg-3">브러시 프리셋</p>
                  <div className="grid grid-cols-2 gap-1">
                    {BRUSH_PRESETS.map((p) => {
                      const active = brush === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setBrush(p.id);
                            setStrokeWidth(p.defaultWidth);
                            setBrushOpacity(p.defaultOpacity);
                            if (p.defaultColor) {
                              setColor(p.defaultColor);
                            }
                          }}
                          className={cn(
                            "rounded border py-1 text-xs transition-colors",
                            active
                              ? "border-accent bg-accent-soft/30 text-accent font-semibold"
                              : "border-line text-fg-2 hover:bg-raised"
                          )}
                        >
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 저장된 브러시 라이브러리 — ibisPaint 브러시/머티리얼 라이브러리 대응.
                  펜 모드 전용(저장 대상이 펜 설정 스냅샷이므로 drawMode==="pen"일 때만 노출). */}
              {drawMode === "pen" && (
                <Suspense fallback={null}>
                  <StudioBrushLibraryPanel
                    currentSnapshot={{
                      brushId: brush,
                      strokeWidth,
                      brushOpacity,
                      color,
                      stabilizer,
                      pressureCurve,
                      useVelocityPressure,
                      velocitySensitivity,
                    }}
                    onApplyBrush={(saved) => {
                      setBrush(saved.brushId);
                      setStrokeWidth(saved.strokeWidth);
                      setBrushOpacity(saved.brushOpacity);
                      setColor(saved.color);
                      setStabilizer(saved.stabilizer);
                      setPressureCurve(saved.pressureCurve);
                      setUseVelocityPressure(saved.useVelocityPressure);
                      setVelocitySensitivity(saved.velocitySensitivity);
                    }}
                  />
                </Suspense>
              )}

              {/* 도형 모드일 때 도형 선택 */}
              {drawMode === "shape" && (
                <div className="space-y-1">
                  <p className="text-[0.66rem] font-medium text-fg-3">도형 종류</p>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      { kind: "line" as const, label: "선" },
                      { kind: "rect" as const, label: "사각형" },
                      { kind: "ellipse" as const, label: "타원" },
                      { kind: "star" as const, label: "별" },
                      { kind: "arrow" as const, label: "화살표" },
                      { kind: "triangle" as const, label: "삼각형" },
                      { kind: "polygon" as const, label: "다각형" },
                    ]).map((item) => {
                      const active = drawShape === item.kind;
                      return (
                        <button
                          key={item.kind}
                          type="button"
                          onClick={() => setDrawShape(item.kind)}
                          className={cn(
                            "rounded border py-1 text-xs transition-colors",
                            active
                              ? "border-accent bg-accent-soft/30 text-accent font-semibold"
                              : "border-line text-fg-2 hover:bg-raised"
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
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
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  <span>크기</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={1}
                      max={48}
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      className="w-24 accent-accent cursor-pointer"
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-fg-3">{strokeWidth}px</span>
                  </span>
                </label>

                {/* 투명도 슬라이더 */}
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  <span>투명도</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={Math.round(brushOpacity * 100)}
                      onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                      className="w-24 accent-accent cursor-pointer"
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round(brushOpacity * 100)}%</span>
                  </span>
                </label>

                {/* 손떨림 보정 (Stabilizer) — 0(끔)~10(최대). 입력 끌림 + 확정 시 이동평균 스무딩 */}
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2 pt-1.5 border-t border-line/35">
                  <span title="선화를 보정하여 부드러운 드로잉을 지원합니다. (0=끔 ~ 10=최대, 그리는 중 끌림 + 선 확정 시 스무딩)">손떨림 보정</span>
                  <span className="flex items-center gap-1.5">
                    <input
                      type="range"
                      min={0}
                      max={STABILIZER_MAX}
                      step={1}
                      value={stabilizer}
                      onChange={(e) => setStabilizer(Number(e.target.value))}
                      className="w-24 accent-accent cursor-pointer"
                    />
                    <span className="w-8 text-right text-xs tabular-nums text-fg-3">{stabilizer}</span>
                  </span>
                </label>

                {drawMode === "pen" && (
                  <Suspense fallback={null}>
                    <StudioQuickShapePanel
                      active={quickShapeActive}
                      matchedKindLabel={
                        tool === "draw" && draft && draft.kind && draft.kind !== "freehand"
                          ? (QUICKSHAPE_KIND_LABELS[draft.kind] ?? null)
                          : null
                      }
                      onToggleActive={() => {
                        const next = !quickShapeActive;
                        if (next) disarmAllPixelTools();
                        setQuickShapeActive(next);
                      }}
                    />
                  </Suspense>
                )}

                {/* 속도 기반 필압 (Velocity Pressure) */}
                <div className="pt-1.5 border-t border-line/35 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-fg-2" title="드로잉 속도에 감응하여 선 굵기를 시뮬레이션합니다.">속도 감응형 필압</span>
                    <input
                      type="checkbox"
                      checked={useVelocityPressure}
                      onChange={(e) => setUseVelocityPressure(e.target.checked)}
                      className="accent-accent size-4 cursor-pointer rounded"
                    />
                  </div>

                  {useVelocityPressure && (
                    <div className="space-y-2 pl-1.5 border-l border-line/50 ml-1 py-1">
                      <label className="flex items-center justify-between gap-2 text-xs text-fg-3">
                        <span>감도 조절</span>
                        <span className="flex items-center gap-1.5">
                          <input
                            type="range"
                            min={0.1}
                            max={1.0}
                            step={0.05}
                            value={velocitySensitivity}
                            onChange={(e) => setVelocitySensitivity(Number(e.target.value))}
                            className="w-20 accent-accent cursor-pointer"
                          />
                          <span className="w-8 text-right tabular-nums">{Math.round(velocitySensitivity * 100)}%</span>
                        </span>
                      </label>
                    </div>
                  )}

                  <label className="flex items-center justify-between gap-2 text-xs text-fg-3">
                    <span title="필압 변화 민감도를 설정합니다.">필압 곡선</span>
                    <select
                      value={Math.abs(pressureCurve - 1.0) < 0.05 ? "linear" : Math.abs(pressureCurve - 1.8) < 0.05 ? "soft" : "hard"}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "linear") setPressureCurve(1.0);
                        else if (val === "soft") setPressureCurve(1.8);
                        else if (val === "hard") setPressureCurve(0.65);
                      }}
                      className="rounded border border-line bg-card px-1.5 py-0.5 text-xs text-fg focus-visible:outline focus-visible:outline-accent"
                    >
                      <option value="linear">기본 (선형)</option>
                      <option value="soft">부드럽게 (Soft)</option>
                      <option value="hard">단단하게 (Hard)</option>
                    </select>
                  </label>
                </div>

                {/* 대칭 그리기 자 (Symmetry Ruler) */}
                <div className="pt-2.5 border-t border-line/35 space-y-2">
                  <p className="text-xs font-semibold text-fg-3">대칭 자 (Symmetry)</p>
                  
                  <div className="grid grid-cols-4 gap-1">
                    {([
                      { id: "none", label: "없음" },
                      { id: "vertical", label: "세로" },
                      { id: "horizontal", label: "가로" },
                      { id: "radial", label: "방사" },
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
                      {symmetryType === "radial" && (
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
                          setSymmetryCenterX(400);
                          setSymmetryCenterY(canvasH / 2);
                        }}
                        className="w-full rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised transition-colors cursor-pointer"
                      >
                        대칭축 중앙 정렬
                      </button>
                    </div>
                  )}
                </div>
                <Suspense fallback={null}>
                  <StudioPerspectivePanel
                    active={perspectiveRulerActive}
                    points={vanishingPoints}
                    onToggleActive={() => {
                      // 아이소메트릭 그리드와 상호 배타(toggleIsometricGridActive와 대칭).
                      setPerspectiveRulerActive((v) => {
                        const next = !v;
                        if (next) setIsometricGridActive(false);
                        return next;
                      });
                    }}
                    onAddPoint={addVanishingPointHandler}
                    onRemovePoint={removeVanishingPointHandler}
                    onMovePoint={moveVanishingPointById}
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
                    onToggleActive={toggleIsometricGridActive}
                    onChangeAngle={setIsometricAngleDegClamped}
                    onChangeCellSize={setIsometricCellSizeClamped}
                    onResetOrigin={resetIsometricOrigin}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {elements.length > 0 && (
            <div className="rounded-2xl border border-line bg-panel/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-fg-3">레이어 ({elements.length})</p>
                <button
                  type="button"
                  onClick={() => addLayerGroup(selectedId ?? undefined)}
                  className="flex items-center gap-1 rounded-md border border-line bg-card px-1.5 py-0.5 text-[0.66rem] text-fg-2 hover:bg-raised transition-colors"
                  title="새 레이어 그룹(폴더). 선택한 레이어가 있으면 그 안에 넣어요."
                >
                  <FolderPlus size={12} /> 그룹
                </button>
              </div>
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                {buildLayerTree(elements.slice().reverse(), groups).map((node) =>
                  node.kind === "group" ? (
                    <li key={node.group.id} className="rounded-lg border border-line/70 bg-card/30">
                      <div className="flex items-center gap-1 px-1.5 py-1">
                        <button
                          type="button"
                          onClick={() => toggleGroupFlag(node.group.id, "collapsed")}
                          className="grid size-5 place-items-center rounded text-fg-3 hover:bg-raised"
                          aria-label={node.group.collapsed ? "그룹 펼치기" : "그룹 접기"}
                          title={node.group.collapsed ? "펼치기" : "접기"}
                        >
                          {node.group.collapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const name = globalThis.prompt("그룹 이름", node.group.name);
                            if (name != null && name.trim()) renameLayerGroup(node.group.id, name.trim());
                          }}
                          className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-[0.7rem] font-semibold text-fg-2"
                          title="이름 변경"
                        >
                          <Folder size={12} className="shrink-0 text-accent" />
                          <span className="truncate">{node.group.name}</span>
                          <span className="shrink-0 text-fg-3">({node.items.length})</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleGroupFlag(node.group.id, "hidden")}
                          className="grid size-6 place-items-center rounded text-fg-3 hover:bg-raised"
                          aria-label={node.group.hidden ? "그룹 표시" : "그룹 숨김"}
                          title={node.group.hidden ? "표시" : "숨김"}
                        >
                          {node.group.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleGroupFlag(node.group.id, "locked")}
                          className={cn("grid size-6 place-items-center rounded hover:bg-raised", node.group.locked ? "text-accent" : "text-fg-3")}
                          aria-label={node.group.locked ? "그룹 잠금 해제" : "그룹 잠금"}
                          title={node.group.locked ? "잠금 해제" : "잠금"}
                        >
                          {node.group.locked ? <Lock size={13} /> : <LockOpen size={13} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLayerGroup(node.group.id)}
                          className="grid size-6 place-items-center rounded text-fg-3 hover:bg-raised"
                          aria-label="그룹 해제"
                          title="그룹 해제 (레이어는 보존)"
                        >
                          <FolderMinus size={13} />
                        </button>
                      </div>
                      {!node.group.collapsed && (
                        <ul className="flex flex-col gap-1 border-t border-line/40 px-1.5 py-1 pl-3">
                          {node.items.map((el) => layerRow(el, !!node.group.hidden || !!node.group.locked))}
                        </ul>
                      )}
                    </li>
                  ) : (
                    layerRow(node.item, false)
                  )
                )}
              </ul>
            </div>
          )}

          {/* 미니맵 / 네비게이터 */}
          <div className="rounded-2xl border border-line bg-panel/40 p-3">
            <p className="mb-2 text-xs font-semibold text-fg-3 uppercase tracking-wider">미니맵 / 네비게이터</p>
            <div className="flex justify-center bg-canvas/30 rounded-xl p-2 border border-line/50">
              <div
                role="button"
                tabIndex={0}
                aria-label="미니맵: 클릭한 위치로 캔버스 이동, 방향키로 스크롤"
                onClick={onMinimapClick}
                onKeyDown={(e) => {
                  const wrap = wrapRef.current;
                  if (!wrap) return;
                  const stepX = wrap.clientWidth / 4;
                  const stepY = wrap.clientHeight / 4;
                  if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    wrap.scrollLeft -= stepX;
                  } else if (e.key === "ArrowRight") {
                    e.preventDefault();
                    wrap.scrollLeft += stepX;
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    wrap.scrollTop -= stepY;
                  } else if (e.key === "ArrowDown") {
                    e.preventDefault();
                    wrap.scrollTop += stepY;
                  } else {
                    return;
                  }
                  updateScrollPos();
                }}
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
                {/* Render panels/frames */}
                {elements.map((el) => {
                  if (isEffectivelyHidden(el, groups)) return null;
                  const bounds = elBounds(el);
                  const pctX = (bounds.x / CANVAS_W) * 100;
                  const pctY = (bounds.y / canvasH) * 100;
                  const pctW = (bounds.w / CANVAS_W) * 100;
                  const pctH = (bounds.h / canvasH) * 100;

                  let colorClass = "bg-accent/40";
                  if (el.type === "frame") colorClass = "border border-red-500/50 bg-red-500/10";
                  else if (el.type === "text") colorClass = "bg-orange-500/50";
                  else if (el.type === "bubble") colorClass = "bg-yellow-500/50";
                  else if (el.type === "draw") colorClass = "bg-green-500/30";

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
                })}

                {/* Render scroll window box */}
                {scrollPos.scrollWidth > 0 && (
                  <div
                    className="absolute border-2 border-red-500 pointer-events-none bg-red-500/5"
                    style={{
                      left: `${(scrollPos.left / (CANVAS_W * effScale)) * 100}%`,
                      top: `${(scrollPos.top / (canvasH * effScale)) * 100}%`,
                      width: `${(scrollPos.width / (CANVAS_W * effScale)) * 100}%`,
                      height: `${(scrollPos.height / (canvasH * effScale)) * 100}%`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          <div ref={publishRef} className="rounded-2xl border border-line bg-panel/40 p-3">
            <p className="mb-2 text-xs font-semibold text-fg-3">게시 정보</p>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="게시 제목 (필수)"
              placeholder="제목 *"
              maxLength={80}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-label="게시 설명 (선택)"
              placeholder="설명 (선택)"
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              aria-label="게시 태그 (쉼표로 구분, 선택)"
              placeholder="태그 (쉼표로 구분)"
              className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
          </div>
        </aside>

        {/* 모바일 첫 사용 안내 — 하단 도구막대 + 두 손가락 이동/확대를 한 줄로. 1회만, 시트가 떠 있지 않을 때만. */}
        {showMobileHint && !mobileSheet && (
          <div
            role="status"
            className="fixed inset-x-3 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-[53] mx-auto flex max-w-[32rem] items-start gap-2.5 rounded-2xl border border-accent/30 bg-panel/95 p-3 shadow-2xl backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-300 lg:hidden"
          >
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
              <Hand size={15} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.8rem] font-semibold text-fg">한 손으로 그려보세요</p>
              <p className="mt-0.5 text-[0.72rem] leading-snug text-fg-3">
                아래 막대에서 <span className="font-medium text-fg-2">펜·지우개·도형</span>을 고르고,{" "}
                <span className="font-medium text-fg-2">브러시</span>를 눌러 굵기·색을 바꿔요. 두 손가락으로 화면을 밀면 이동·확대돼요.
              </p>
            </div>
            <button
              type="button"
              onClick={dismissMobileHint}
              className="grid size-7 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised"
              aria-label="안내 닫기"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        )}

        {/* 모바일 브러시 설정 시트 — 드로잉 도크 바로 위에 떠서 도구를 보며 굵기·색·프리셋·도형을 조절한다.
            도크(z-55)는 가리지 않게 그 위쪽에 앉히고, 캔버스는 계속 보이게 반투명 배경. 데스크톱엔 인라인 브러시 바가 있으므로 모바일 전용. */}
        {isMobile && (
          <div
            ref={drawSheetRef}
            role="dialog"
            aria-label="브러시 설정"
            aria-modal={false}
            className={cn(
              "fixed inset-x-0 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-[54] mx-auto max-h-[44vh] max-w-[34rem] overflow-y-auto rounded-2xl border border-line bg-panel/95 p-3 shadow-2xl backdrop-blur transition-all duration-200 ease-out lg:hidden",
              mobileSheet === "draw"
                ? "pointer-events-auto translate-y-0 opacity-100"
                : "pointer-events-none translate-y-3 opacity-0"
            )}
            inert={mobileSheet === "draw" ? undefined : true}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-fg">
                {drawMode === "eraser" ? "지우개" : drawMode === "shape" ? "도형" : "브러시"} 설정
              </p>
              <button
                type="button"
                onClick={() => setMobileSheet(null)}
                className="grid size-8 place-items-center rounded-lg text-fg-3 hover:bg-raised"
                aria-label="브러시 설정 닫기"
                data-autofocus
              >
                <X size={16} aria-hidden />
              </button>
            </div>

            {/* 모드 전환 — 시트 안에서도 펜↔지우개↔도형 빠르게 */}
            <div className="mb-2.5 grid grid-cols-3 gap-1 rounded-xl border border-line bg-card/60 p-1">
              {([
                { v: "pen" as const, label: "펜", icon: Pencil },
                { v: "eraser" as const, label: "지우개", icon: Eraser },
                { v: "shape" as const, label: "도형", icon: Square },
              ]).map((m) => {
                const Icon = m.icon;
                const active = drawMode === m.v;
                return (
                  <button
                    key={m.v}
                    type="button"
                    onClick={() => {
                      setTool("draw");
                      setDrawMode(m.v);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "flex min-h-[2.25rem] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors",
                      active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised"
                    )}
                  >
                    <Icon size={15} aria-hidden /> {m.label}
                  </button>
                );
              })}
            </div>

            {/* 펜 프리셋 — 가로 스크롤 칩(굵기·투명도·색 기본값 적용) */}
            {drawMode === "pen" && (
              <div className="mb-2.5">
                <p className="mb-1 text-[0.7rem] font-medium text-fg-3">브러시</p>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {BRUSH_PRESETS.map((p) => {
                    const active = brush === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setBrush(p.id);
                          setStrokeWidth(p.defaultWidth);
                          setBrushOpacity(p.defaultOpacity);
                          if (p.defaultColor) setColor(p.defaultColor);
                        }}
                        aria-pressed={active}
                        className={cn(
                          "min-h-[2.25rem] shrink-0 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition-colors",
                          active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 색상 — 지우개에선 의미 없으니 숨김 */}
            {drawMode !== "eraser" && (
              <div className="mb-2.5">
                <p className="mb-1 text-[0.7rem] font-medium text-fg-3">색상</p>
                <div className="flex flex-wrap items-center gap-2">
                  {DRAW_COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      aria-label={`색상 ${swatch}`}
                      aria-pressed={color.toLowerCase() === swatch.toLowerCase()}
                      className={cn(
                        "size-8 rounded-lg transition-transform active:scale-95",
                        color.toLowerCase() === swatch.toLowerCase()
                          ? "ring-2 ring-accent ring-offset-2 ring-offset-panel"
                          : "border border-line/60"
                      )}
                      style={{ background: swatch }}
                    />
                  ))}
                  <label
                    className="relative grid size-8 cursor-pointer place-items-center overflow-hidden rounded-lg border border-line shadow-sm"
                    title="사용자 정의 색상"
                    style={{ background: color }}
                  >
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="absolute inset-0 size-full cursor-pointer opacity-0"
                    />
                    <Palette size={14} className="text-white mix-blend-difference" aria-hidden />
                  </label>
                </div>
              </div>
            )}

            {/* 굵기 + 투명도 — 큰 터치 슬라이더 */}
            <div className="space-y-2.5">
              <label className="block">
                <span className="mb-1 flex items-center justify-between text-[0.7rem] font-medium text-fg-3">
                  <span>{drawMode === "eraser" ? "지우개 굵기" : "굵기"}</span>
                  <span className="tabular-nums text-fg-2">{strokeWidth}px</span>
                </span>
                <input
                  type="range"
                  min={1}
                  max={48}
                  value={strokeWidth}
                  onChange={(e) => setStrokeWidth(Number(e.target.value))}
                  className="h-6 w-full accent-accent"
                  aria-label="브러시 굵기"
                />
              </label>
              {drawMode !== "eraser" && (
                <label className="block">
                  <span className="mb-1 flex items-center justify-between text-[0.7rem] font-medium text-fg-3">
                    <span>투명도</span>
                    <span className="tabular-nums text-fg-2">{Math.round(brushOpacity * 100)}%</span>
                  </span>
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round(brushOpacity * 100)}
                    onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                    className="h-6 w-full accent-accent"
                    aria-label="브러시 투명도"
                  />
                </label>
              )}
            </div>

            {/* 도형 모양 + 채우기 — 도형 모드에서만 */}
            {drawMode === "shape" && (
              <div className="mt-2.5 border-t border-line/60 pt-2.5">
                <p className="mb-1 text-[0.7rem] font-medium text-fg-3">도형 모양</p>
                <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {([
                    { kind: "line" as const, label: "선", icon: Minus },
                    { kind: "rect" as const, label: "사각형", icon: Square },
                    { kind: "ellipse" as const, label: "타원", icon: Circle },
                    { kind: "star" as const, label: "별", icon: StarIcon },
                    { kind: "arrow" as const, label: "화살표", icon: ArrowRight },
                    { kind: "triangle" as const, label: "삼각형", icon: Triangle },
                    { kind: "polygon" as const, label: "다각형", icon: Hexagon },
                  ]).map((item) => {
                    const Icon = item.icon;
                    const active = drawShape === item.kind;
                    return (
                      <button
                        key={item.kind}
                        type="button"
                        onClick={() => {
                          setTool("draw");
                          setDrawMode("shape");
                          setDrawShape(item.kind);
                        }}
                        aria-pressed={active}
                        title={item.label}
                        className={cn(
                          "flex min-h-[2.25rem] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition-colors",
                          active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
                        )}
                      >
                        <Icon size={14} aria-hidden /> {item.label}
                      </button>
                    );
                  })}
                </div>
                <label
                  className={cn(
                    "mt-2 flex min-h-[2.5rem] items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors",
                    drawShape === "line"
                      ? "cursor-not-allowed border-line bg-card text-fg-3 opacity-50"
                      : shapeFill
                        ? "border-accent/60 bg-accent-soft/50 text-fg"
                        : "border-line bg-card text-fg-2"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={shapeFill}
                    disabled={drawShape === "line"}
                    onChange={(e) => setShapeFill(e.target.checked)}
                    className="size-4 accent-[var(--color-accent)]"
                  />
                  <PaintBucket size={15} aria-hidden />
                  채우기
                </label>
              </div>
            )}
          </div>
        )}

        {/* 모바일 하단 드로잉 도크 — 한 손으로 그리기 위한 핵심 도구를 thumb 사정권에.
            1행: 그리기 도구(선택·펜·지우개·도형·실행취소·다시·브러시). 2행: 보조 내비(페이지·추가·속성·줌). */}
        {isMobile && (
          <nav
            aria-label="스튜디오 모바일 도구막대"
            className="fixed inset-x-0 bottom-0 z-[55] flex flex-col gap-1 border-t border-line bg-panel/95 px-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
          >
            {/* 1행: 핵심 드로잉 도구 (>=44px 터치 타깃, 활성 도구 감귤색) */}
            <div className="flex items-stretch gap-1">
              <button
                type="button"
                onClick={() => {
                  setTool("select");
                  setMenu(null);
                  setMobileSheet(null);
                }}
                aria-pressed={tool === "select"}
                className={mobileDrawToolBtn(tool === "select")}
              >
                <MousePointer2 size={19} aria-hidden />
                <span>선택</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  // 펜이 이미 활성이면 같은 버튼으로 브러시 설정 시트를 연다(굵기·색·프리셋).
                  if (tool === "draw" && drawMode === "pen") {
                    setMobileSheet((s) => (s === "draw" ? null : "draw"));
                    return;
                  }
                  setTool("draw");
                  setDrawMode("pen");
                  setMenu(null);
                  setMobileSheet(null);
                }}
                aria-pressed={tool === "draw" && drawMode === "pen"}
                className={mobileDrawToolBtn(tool === "draw" && drawMode === "pen")}
              >
                <Pencil size={19} aria-hidden />
                <span>펜</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTool("draw");
                  setDrawMode("eraser");
                  setMenu(null);
                  setMobileSheet(null);
                }}
                aria-pressed={tool === "draw" && drawMode === "eraser"}
                className={mobileDrawToolBtn(tool === "draw" && drawMode === "eraser")}
              >
                <Eraser size={19} aria-hidden />
                <span>지우개</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  // 도형이 이미 활성이면 같은 버튼으로 도형/색 설정 시트를 연다.
                  if (tool === "draw" && drawMode === "shape") {
                    setMobileSheet((s) => (s === "draw" ? null : "draw"));
                    return;
                  }
                  setTool("draw");
                  setDrawMode("shape");
                  setMenu(null);
                  setMobileSheet(null);
                }}
                aria-pressed={tool === "draw" && drawMode === "shape"}
                className={mobileDrawToolBtn(tool === "draw" && drawMode === "shape")}
              >
                <Square size={18} aria-hidden />
                <span>도형</span>
              </button>
              <span aria-hidden className="my-1 w-px self-stretch bg-line/70" />
              <button
                type="button"
                onClick={undo}
                disabled={hi === 0}
                className={cn(mobileDrawToolBtn(false), "disabled:opacity-35")}
                aria-label="실행취소"
              >
                <Undo2 size={19} aria-hidden />
                <span>되돌리기</span>
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={hi >= history.length - 1}
                className={cn(mobileDrawToolBtn(false), "disabled:opacity-35")}
                aria-label="다시실행"
              >
                <Redo2 size={19} aria-hidden />
                <span>다시</span>
              </button>
              <span aria-hidden className="my-1 w-px self-stretch bg-line/70" />
              <button
                type="button"
                onClick={() => {
                  // 브러시 설정 시트(굵기·색·프리셋·도형). 드로잉 도구가 아니면 펜으로 전환해 바로 그릴 수 있게.
                  if (tool !== "draw") {
                    setTool("draw");
                    setDrawMode("pen");
                    setMenu(null);
                  }
                  setMobileSheet((s) => (s === "draw" ? null : "draw"));
                }}
                aria-pressed={mobileSheet === "draw"}
                aria-label="브러시 설정 (굵기·색·프리셋)"
                className={mobileDrawToolBtn(mobileSheet === "draw")}
              >
                <span
                  aria-hidden
                  className="size-[19px] rounded-full border-2 border-current"
                  style={drawMode === "eraser" ? undefined : { backgroundColor: color, borderColor: "rgba(255,255,255,0.45)" }}
                />
                <span>브러시</span>
              </button>
            </div>

            {/* 2행: 보조 내비 — 페이지·추가·속성(레이어)·줌 */}
            <div className="flex items-stretch gap-0.5 border-t border-line/60 pt-1">
              <button
                type="button"
                onClick={() => setMobileSheet((s) => (s === "pages" ? null : "pages"))}
                aria-pressed={mobileSheet === "pages"}
                className={mobileBarBtn(mobileSheet === "pages")}
              >
                <Files size={17} aria-hidden />
                <span>페이지</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileSheet(null);
                  setQuickStartOpen(true);
                }}
                className={mobileBarBtn(false)}
              >
                <Plus size={17} aria-hidden />
                <span>추가</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileSheet((s) => (s === "props" ? null : "props"))}
                aria-pressed={mobileSheet === "props"}
                className={mobileBarBtn(mobileSheet === "props")}
              >
                <Layers size={17} aria-hidden />
                <span>속성·레이어</span>
              </button>
              <div className="flex flex-[1.3] items-center justify-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setZoom((z) => clampZoom(z - 0.25))}
                  disabled={zoom <= ZOOM_MIN}
                  className="grid size-10 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised disabled:opacity-40"
                  aria-label="축소"
                >
                  <Minus size={16} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // 너비 맞춤: 컨테이너 폭에 캔버스를 다시 채운다(줌 100% 복귀가 아니라 '폭맞춤'이 작은 폰에 자연스럽다).
                    const wrap = wrapRef.current;
                    if (wrap) setScale(Math.min(2.5, Math.max(0.1, wrap.clientWidth / CANVAS_W)));
                    setZoom(1);
                  }}
                  className="min-w-[2.6rem] rounded-lg px-1 py-2 text-center text-[0.7rem] font-semibold tabular-nums text-fg transition-colors hover:bg-raised"
                  aria-label="화면 폭에 맞춤"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={() => setZoom((z) => clampZoom(z + 0.25))}
                  disabled={zoom >= ZOOM_MAX}
                  className="grid size-10 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised disabled:opacity-40"
                  aria-label="확대"
                >
                  <Plus size={16} aria-hidden />
                </button>
              </div>
            </div>
          </nav>
        )}
      </div>

      <Suspense fallback={<PoserLoadingOverlay />}>
        {poserVrmOpen ? (
          <StudioVrmPoser
            open
            initialDataUrl={poserInitialDataUrl}
            onClose={() => {
              setPoserVrmOpen(false);
              setPoserInitialDataUrl(undefined);
              setPoserInitialElementId(undefined);
            }}
            onInsert={(src, w, h) => {
              if (poserInitialElementId) {
                const targetEl = elementById.get(poserInitialElementId);
                if (targetEl && targetEl.type === "image") {
                  const targetWidth = targetEl.width;
                  const targetHeight = Math.round(targetWidth * (h / w));
                  patchEl(poserInitialElementId, {
                    src,
                    height: targetHeight,
                  });
                } else {
                  patchEl(poserInitialElementId, { src });
                }
              } else {
                addRenderedImage(src, w, h);
              }
            }}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<Bg3DLoadingOverlay />}>
        {bg3dOpen ? (
          <StudioBackground3D
            open
            initialDataUrl={bg3dInitialDataUrl}
            onClose={() => {
              setBg3dOpen(false);
              setBg3dInitialDataUrl(undefined);
              setBg3dInitialElementId(undefined);
            }}
            onInsert={(src, w, h) => {
              if (bg3dInitialElementId) {
                const targetEl = elementById.get(bg3dInitialElementId);
                if (targetEl && targetEl.type === "image") {
                  const targetWidth = targetEl.width;
                  const targetHeight = Math.round(targetWidth * (h / w));
                  patchEl(bg3dInitialElementId, {
                    src,
                    height: targetHeight,
                  });
                } else {
                  patchEl(bg3dInitialElementId, { src });
                }
              } else {
                addRenderedImage(src, w, h);
              }
            }}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<PoserLoadingOverlay />}>
        {vrmCreatorOpen ? (
          <StudioVrmCreator
            open
            onClose={() => setVrmCreatorOpen(false)}
            onInsert={(src, w, h) => addRenderedImage(src, w, h)}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<TimelapseLoadingOverlay />}>
        {timelapseOpen ? (
          <StudioTimelapsePanel
            open
            onClose={() => setTimelapseOpen(false)}
            pageId={activePage.id}
            history={pagesHistory.slice(0, pagesHi + 1)}
            title={title}
            masterEditMode={masterEditMode}
            captureStep={captureTimelapseStep}
            onRecordingStart={handleTimelapseRecordingStart}
            onRecordingEnd={handleTimelapseRecordingEnd}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<StoryboardGridLoadingOverlay />}>
        {storyboardGridOpen ? (
          <StudioStoryboardGridPanel
            open
            onClose={() => setStoryboardGridOpen(false)}
            pages={pages.map((p) => composeThumbPage(master, p))}
            currentPageId={currentPageId}
            dnd={pageDnd}
            onSelectPage={(id) => {
              setCurrentPageId(id);
              setStoryboardGridOpen(false);
            }}
            onAddPage={addPage}
            onDuplicatePage={duplicatePage}
            onDeletePage={deletePage}
            canDelete={pages.length > 1}
            onShotTagChange={(pageId, patch) => commitShotTag(pageId, patch)}
          />
        ) : null}
      </Suspense>

      {fxPanelOpen && loadedWork ? (
        <div
          aria-modal="true"
          role="dialog"
          className="fixed inset-0 z-[80] grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-3 backdrop-blur-sm"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <div className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-3">
              <h2 className="text-sm font-bold text-fg">애니메이션 연출</h2>
              <button
                type="button"
                aria-label="닫기"
                title="닫기"
                className="grid size-8 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent"
                onClick={() => setFxPanelOpen(false)}
              >
                <X size={15} aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <Suspense fallback={<div className="py-8 text-center text-xs text-fg-3">불러오는 중…</div>}>
                <WorkFxPanel work={loadedWork} onUpdated={(doc) => setLoadedWork((prev) => (prev ? { ...prev, doc } : prev))} />
              </Suspense>
            </div>
          </div>
        </div>
      ) : null}

      <Suspense fallback={null}>
        {referencePanelOpen ? <StudioReferencePanel open onClose={() => setReferencePanelOpen(false)} /> : null}
      </Suspense>

      <Suspense fallback={null}>
        {colorWheelOpen ? (
          <StudioColorWheelOverlay
            open={colorWheelOpen}
            center={colorWheelCenter}
            colors={selectWheelColors(recentColors)}
            onSelect={(c) => {
              setColor(c);
              rememberColor(c);
            }}
            onClose={() => setColorWheelOpen(false)}
          />
        ) : null}
      </Suspense>

      {contextMenu.visible && (
        // onClick은 사용자 액션이 아니라 window의 바깥-클릭 닫기로의 버블링만 막는 용도(stopPropagation)이며, 실제 동작은 내부 <button> 메뉴 항목이 담당하는 false positive다.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[140px] rounded-lg border border-line bg-panel p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.elId ? (
            <>
              {contextMenuEl?.type === "image" && parseStudio3dTool(contextMenuEl.src) === "vrm-poser" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setPoserInitialDataUrl(contextMenuEl.src);
                      setPoserInitialElementId(contextMenuEl.id);
                      setPoserVrmOpen(true);
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-semibold text-accent hover:bg-raised"
                  >
                    <Sparkles size={12} />
                    3D 캐릭터 편집
                  </button>
                  <div className="my-1 h-px bg-line" />
                </>
              )}
              {contextMenuEl?.type === "image" && parseStudio3dTool(contextMenuEl.src) === "bg3d" && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setBg3dInitialDataUrl(contextMenuEl.src);
                      setBg3dInitialElementId(contextMenuEl.id);
                      setBg3dOpen(true);
                      setContextMenu((prev) => ({ ...prev, visible: false }));
                    }}
                    className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs font-semibold text-accent hover:bg-raised"
                  >
                    <Boxes size={12} />
                    3D 배경 편집
                  </button>
                  <div className="my-1 h-px bg-line" />
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  duplicateSelected();
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                <Copy size={12} />
                복제하기 (⌘D)
              </button>
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                onClick={() => {
                  reorder("front");
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                <ArrowUpToLine size={12} />
                맨 앞으로
              </button>
              <button
                type="button"
                onClick={() => {
                  reorder("forward");
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                <ChevronUp size={12} />
                한 단계 앞으로
              </button>
              <button
                type="button"
                onClick={() => {
                  reorder("backward");
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                <ChevronDown size={12} />
                한 단계 뒤로
              </button>
              <button
                type="button"
                onClick={() => {
                  reorder("back");
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                <ArrowDownToLine size={12} />
                맨 뒤로
              </button>
              <div className="my-1 h-px bg-line" />
              <button
                type="button"
                onClick={() => {
                  if (contextMenuEl) patchEl(contextMenuEl.id, { locked: !contextMenuEl.locked });
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                {contextMenuEl?.locked ? <LockOpen size={12} /> : <Lock size={12} />}
                {contextMenuEl?.locked ? "잠금 해제" : "위치 잠금"}
              </button>
              <button
                type="button"
                onClick={() => {
                  removeSelected();
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-bad hover:bg-bad-soft/30"
              >
                <Trash2 size={12} />
                삭제하기
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  addPage();
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                <Plus size={12} />
                새 페이지 추가
              </button>
            </>
          )}
        </div>
      )}
    </Container>
    </div>
  );
}
