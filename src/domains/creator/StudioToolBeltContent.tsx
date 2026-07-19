import {
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Eraser,
  Film,
  Folder,
  GanttChartSquare,
  History as HistoryIcon,
  ImagePlus,
  LayoutGrid,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Mountain,
  MousePointer2,
  PaintBucket,
  Palette,
  Pencil,
  PictureInPicture2,
  Plus,
  Redo2,
  Smartphone,
  SquareSplitHorizontal,
  Type as TypeIcon,
  Undo2,
  UsersRound,
  Video,
  WandSparkles,
} from "lucide-react";
import { Suspense, memo } from "react";

import { CANVAS_W } from "./studio-assets";
import {
  StudioFloatingToolPopover,
  StudioQuickActionsBar,
  StudioToolbarCluster,
  StudioToolbarDivider,
} from "./studio-chrome-ui";
import {
  preloadStudioAssetMenuPanel,
  preloadStudioPaletteLibraryPanel,
  preloadStudioReferencePanel,
} from "./studio-page-lazy-ui";
import { studioToolButtonClass } from "./studio-panel-ui";
import {
  LazyStudioAiToolPopoverBody,
  LazyStudioAssetToolPopoverBody,
  LazyStudioBubbleToolPopoverBody,
  LazyStudioSceneToolPopoverBody,
  LazyStudioStyleToolPopoverBody,
  preloadStudioAiToolPopoverBody,
  preloadStudioAssetToolPopoverBody,
  preloadStudioBubbleToolPopoverBody,
  preloadStudioSceneToolPopoverBody,
  preloadStudioStyleToolPopoverBody,
} from "./studio-tool-belt-lazy-ui";
import { studioUiDensityAllows } from "./studio-ui-density";
import {
  STUDIO_VIEW_ZOOM_MAX,
  STUDIO_VIEW_ZOOM_MIN,
  clampStudioViewZoom,
} from "./studio-view-controls";
import {
  StudioColorBlindPreviewToggle,
  type CvdMode,
} from "./StudioColorBlindPreview";
import { LazyStudioColorPopover } from "./StudioLazyColorPopover";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";

import type {
  StudioAiAssistToolId,
  StudioAiRecentPromptsState,
} from "./studio-ai-assist-ux";
import type {
  StudioAiImageSize,
  StudioAiSettings,
  StudioTextAiProvenance,
  StudioTextAiTransport,
} from "./studio-ai-client";
import type {
  StudioAiObservableResult,
  StudioAiPendingOperationInput,
} from "./studio-ai-provenance-recorder";
import type {
  StudioAssetFavoriteId,
  StudioAssetFavoriteState,
} from "./studio-asset-favorites";
import type { StudioAsset } from "./studio-asset-library";
import type { BubbleVariant, TemplateSpec } from "./studio-assets";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { BrandKit } from "./studio-brand-kit";
import type { StudioClip } from "./studio-clips";
import type { DialogueSuggestionCandidate } from "./studio-dialogue-suggest";
import type { DrawMode, StudioMenu, Tool } from "./studio-editor-tool-model";
import type { El, ImageEl } from "./studio-element-model";
import type { StudioEmeresLibraryItem } from "./studio-emeres-library";
import type {
  MagicResizePreset,
  MagicResizeStrategy,
} from "./studio-magic-resize";
import type { PageState } from "./studio-page-state";
import type { PaletteSuggestion } from "./studio-palette-suggest";
import type { PanelLayoutPreset } from "./studio-panel-layouts";
import type { StudioPublishAiProvenance } from "./studio-publish-preflight";
import type { StudioRasterAsset } from "./studio-raster-assets";
import type { SceneTemplate } from "./studio-scene-templates";
import type {
  StudioServerAiProviderPreference,
  StudioServerAiStatus,
} from "./studio-server-ai-client";
import type { SfxPreset } from "./studio-sfx-presets";
import type { StudioSharedDocument } from "./studio-shared-document-client";
import type { StudioStockPhoto } from "./studio-stock-image-client";
import type { StudioToolbarGroupId } from "./studio-toolbar-groups";
import type {
  StudioAssetSortOrder,
  StudioAssetTab,
} from "./StudioAssetMenuPanel";
import type {
  GeneratedAssetQuality,
  GeneratedAssetSize,
  SharedAsset,
} from "@/src/infrastructure/creator-client";

import { cn } from "@/lib/utils";

const toolBtn = (active: boolean) => studioToolButtonClass(active, { dense: true });

// Group popovers stay viewport-fixed because the desktop ToolBelt is an inert zero-size host.
const groupPopoverClass = (width: "w-72" | "w-80") =>
  cn(
    "fixed inset-x-2 top-[6.5rem] z-[70] max-h-[min(78dvh,36rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-2xl lg:inset-x-auto lg:left-3 lg:w-auto lg:max-w-[min(28rem,calc(100vw-1.5rem))]",
    width === "w-72" ? "lg:w-72" : "lg:w-80"
  );

export type StudioBgScene = {
  id: string;
  label: string;
  genre: string;
  svg?: string;
  imgSrc?: string;
};

export type StudioFxAsset = {
  id: string;
  label: string;
  svg: string;
  width: number;
  height: number;
};

export type StudioEmeresTemplate = {
  id: string;
  label: string;
  category: string;
  svg: string;
  width: number;
  height: number;
  tip: string;
};

export type StudioOptionalAssetPacks = {
  bgSceneSections: Array<{ genre: string; scenes: StudioBgScene[] }>;
  bgSceneGenreGroups: Array<{ genre: string; scenes: StudioBgScene[] }>;
  comicVectorStickers: StudioFxAsset[];
  creatureStickers: StudioFxAsset[];
  propStickers: StudioFxAsset[];
  fxOverlays: StudioFxAsset[];
  emeresSections: Array<{ category: string; templates: StudioEmeresTemplate[] }>;
  emeresUnderlayOpacity: number;
};

export type StudioSceneTemplatePacks = {
  categories: Array<{ id: string; label: string }>;
  templates: SceneTemplate[];
};

export type StudioSfxPacks = {
  categories: Array<{ id: SfxPreset["category"]; label: string }>;
  presets: SfxPreset[];
};

export type FxPickerSection =
  | "all"
  | "raster"
  | "sfx"
  | "emoji"
  | "comic"
  | "creature"
  | "prop"
  | "lines"
  | "overlay";

export interface StudioToolBeltContentHandlers {
  openFrameAnimationForSelected: () => void;
  addBgScene: (bg: StudioBgScene) => void;
  addBubble: (variant: BubbleVariant, at?: { x: number; y: number; }) => void;
  addBuiltinRasterAsset: (asset: StudioRasterAsset) => Promise<void>;
  addCatalogElement: (item: { svg: string; width: number; height: number; label: string; }) => void;
  addDiagonalSplit: () => void;
  addDialogueBubbles: () => Promise<void>;
  addDialogueSuggestionToScript: (candidate: DialogueSuggestionCandidate) => void;
  addEmeresLibraryItem: (item: StudioEmeresLibraryItem) => void;
  addEmeresTemplate: (t: StudioEmeresTemplate) => void;
  addFocusLines: () => void;
  addFrame: () => void;
  addFxOverlay: (svgMarkup: string, w: number, h: number) => void;
  addRenderedImage: (
    src: string,
    width: number,
    height: number,
    aiProvenance?: StudioPublishAiProvenance,
    isAnimatedGif?: boolean,
    elementPatch?: Partial<ImageEl> & { name?: string }
  ) => void;
  addSceneTemplate: (template: SceneTemplate) => Promise<void>;
  addSfxPreset: (preset: SfxPreset) => Promise<void>;
  addSpeedLines: () => void;
  addSticker: (emoji: string, at?: { x: number; y: number; }) => void;
  addText: (at?: { x: number; y: number; }) => void;
  addTone: (svg: string) => Promise<void>;
  announceDrawingShortcut: (message: string) => void;
  applyAiAssistPresetPrompt: (tool: StudioAiAssistToolId, prompt: string) => void;
  applyBrandKitFont: (font: string) => void;
  applyBrandKitLogo: (kit: BrandKit) => void;
  applyCollage: (payload: { canvasH: number; canvasBg: string; frames: readonly { x: number; y: number; width: number; height: number; bg: string; stroke: string; strokeWidth: number; name: string; groupId: string; }[]; groupId: string; imagePlacements: readonly { imageId: string; slotIndex: number; x: number; y: number; width: number; height: number; }[]; replaceExisting: boolean; }) => void;
  applyMagicResizePreset: (preset: MagicResizePreset) => void;
  applyPanelLayout: (layout: PanelLayoutPreset) => Promise<void>;
  applyStudioBackgroundFill: (payload: { kind: "solid" | "gradient" | "svg"; color?: string; stops?: string[]; direction?: "vertical" | "horizontal"; svg?: string; width?: number; height?: number; label?: string; presetId?: string; }) => Promise<void>;
  applyTemplate: (tpl: TemplateSpec) => void;
  beginTrackedStudioAiOperation: (scope: string, input: Omit<StudioAiPendingOperationInput, "id">) => string;
  deleteClip: (id: string) => Promise<void>;
  ensureRecentColorsLoaded: () => void;
  enterCanvasOnlyMode: () => void;
  executeSuggestColorPalette: () => Promise<void>;
  executeSuggestDialogueLines: () => Promise<void>;
  handleRenameAsset: (id: string) => Promise<void>;
  insertAiCompositionNote: (text: string) => void;
  insertClip: (clip: StudioClip) => void;
  insertDialogueSuggestionToSelected: (candidate: DialogueSuggestionCandidate) => void;
  insertStockImage: (photo: StudioStockPhoto, dataUrl: string, width: number, height: number) => void;
  loadSharedAssets: () => Promise<void>;
  onDeleteAsset: (id: string) => Promise<void>;
  onDeleteSharedAsset: (id: string) => Promise<void>;
  onGenerateAiBackground: () => void;
  onGenerateAiCharacter: () => void;
  onGenerateAsset: () => Promise<void>;
  onPickImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onShareAsset: (asset: StudioAsset) => Promise<void>;
  onUploadAsset: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onUseSharedAsset: (asset: SharedAsset) => void;
  openFeatureTutorial: (tutorialId?: string | null) => void;
  pendingTextAiProviderContext: () => import("./studio-ai-provenance-recorder").StudioAiOperationProviderContext;
  redo: () => void;
  rememberColor: (c: string) => void;
  removeEmeresUnderlays: () => void;
  resetView: () => void;
  saveSelectionAsClip: () => Promise<void>;
  saveSuggestedPaletteToLibrary: (suggestion: PaletteSuggestion) => void;
  setCanvasH: (newH: number | ((prev: number) => number)) => void;
  settleTrackedTextAiOperation: (operationId: string, result: StudioAiObservableResult, textProvenance?: StudioTextAiProvenance, aborted?: boolean) => void;
  toggleAdvancedFill: () => void;
  toggleAssetFavorite: (id: StudioAssetFavoriteId) => void;
  toggleFullscreen: () => void;
  toggleMaximize: () => void;
  toggleSelectedFrameDiagonal: () => void;
  undo: () => void;
  updateAiSettings: (next: StudioAiSettings) => void;
  updateServerAiProvider: (next: StudioServerAiProviderPreference) => void;
}

export interface StudioToolBeltContentProps {
  activePage: PageState;
  activeServerAiProviderLabel: string;
  activeSurfaceReviewLocked: boolean;
  activeToolbarGroup: StudioToolbarGroupId | null;
  advancedFillActive: boolean;
  advancedFillUnsupportedReason: string | null;
  aiAssistTool: StudioAiAssistToolId;
  aiBgBusy: boolean;
  aiBgError: string | null;
  aiBgPrompt: string;
  aiBgSize: StudioAiImageSize;
  aiCharacterBusy: boolean;
  aiCharacterError: string | null;
  aiCharacterPrompt: string;
  aiCompositionDraft: string;
  aiDialogueSuggestBusy: boolean;
  aiDialogueSuggestCandidates: DialogueSuggestionCandidate[] | null;
  aiDialogueSuggestError: string | null;
  aiDialogueSuggestIncludeContext: boolean;
  aiDialogueSuggestSituation: string;
  aiPaletteSuggestBusy: boolean;
  aiPaletteSuggestError: string | null;
  aiPaletteSuggestion: PaletteSuggestion | null;
  aiPaletteSuggestMood: string;
  aiPaletteSuggestSavedMsg: string | null;
  aiRecentPrompts: StudioAiRecentPromptsState;
  aiSettings: StudioAiSettings;
  assetFavoriteOnly: boolean;
  assetFavoriteState: StudioAssetFavoriteState;
  assetGenerating: boolean;
  assetPrompt: string;
  assetPromptName: string;
  assetPromptQuality: GeneratedAssetQuality;
  assetPromptSize: GeneratedAssetSize;
  assets: StudioAsset[];
  assetSearchQuery: string;
  assetsLoading: boolean;
  assetSortOrder: StudioAssetSortOrder;
  assetTab: StudioAssetTab;
  bg: string;
  bgGrad: string[] | null;
  bgSceneGenreFilter: string;
  bgSceneSearchQuery: string;
  bgSceneSectionsFiltered: { genre: string; scenes: StudioBgScene[]; }[];
  builtinRasterBusyId: string | null;
  canvasH: number;
  canvasOnlyMode: boolean;
  clips: StudioClip[];
  collaborationDocumentLocked: boolean;
  collaborationLockMessage: () => string;
  color: string;
  colorBlindPreview: CvdMode;
  commentsOpen: boolean;
  configuredServerAiProviders: { id: import("./studio-server-ai-client").StudioServerAiProvider; label: string; configured: boolean; model: string; }[];
  continuityOpen: boolean;
  dialogueScript: string;
  drawMode: DrawMode;
  elements: El[];
  emeresCategoryFilter: string;
  emeresFlatCatalog: StudioEmeresTemplate[];
  emeresSearchQuery: string;
  emeresSectionsFiltered: { category: string; templates: StudioEmeresTemplate[]; }[];
  emeresSimilarAnchor: StudioEmeresTemplate | null;
  emeresSimilarSiblings: StudioEmeresTemplate[];
  emeresTab: "mine" | "catalog";
  emeresUnderlayCount: number;
  frameAnimOpen: boolean;
  frameAnimTargetId: string | null;
  fxComicFiltered: StudioFxAsset[];
  fxCreatureFiltered: StudioFxAsset[];
  fxEmojisFiltered: string[];
  fxLinePresetsFiltered: { id: "focus" | "speed"; label: string; }[];
  fxOverlaysFiltered: StudioFxAsset[];
  fxPickerHasResults: boolean;
  fxPickerSection: FxPickerSection;
  fxPropFiltered: StudioFxAsset[];
  fxQuery: string;
  fxRasterFiltered: readonly StudioRasterAsset[];
  fxSearchQuery: string;
  fxSectionVisible: (section: Exclude<FxPickerSection, "all">) => boolean;
  fxSfxFiltered: SfxPreset[];
  hi: number;
  history: PageState[][];
  historyPanelOpen: boolean;
  isFullscreen: boolean;
  leftPanelOpen: boolean;
  magicResizeStrategy: MagicResizeStrategy;
  masterEditMode: boolean;
  maximized: boolean;
  menu: StudioMenu | null;
  menuRef: import("react").RefObject<HTMLDivElement | null>;
  openStudioCommentCount: number;
  pageEditLocked: boolean;
  pageReviewOpen: boolean;
  panelLayoutPresets: PanelLayoutPreset[];
  panelLayoutsError: string | null;
  panelLayoutsLoading: boolean;
  poserVrmOpen: boolean;
  presentationPanelsHidden: boolean;
  publishingId: string | null;
  rasterFavoriteOnly: boolean;
  recentColors: string[];
  referencePanelOpen: boolean;
  renamingAssetId: string | null;
  renamingAssetName: string;
  rightPanelOpen: boolean;
  sceneSimilarAnchor: SceneTemplate | null;
  sceneSimilarSiblings: SceneTemplate[];
  sceneTemplates: StudioSceneTemplatePacks;
  sceneTemplatesError: string | null;
  sceneTemplatesLoading: boolean;
  selected: El | null;
  serverAiProvider: StudioServerAiProviderPreference;
  serverAiStatus: StudioServerAiStatus | null;
  setAiAssistTool: import("react").Dispatch<import("react").SetStateAction<StudioAiAssistToolId>>;
  setAiBgPrompt: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAiBgSize: import("react").Dispatch<import("react").SetStateAction<StudioAiImageSize>>;
  setAiCharacterPrompt: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAiCompositionDraft: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAiDialogueSuggestIncludeContext: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setAiDialogueSuggestSituation: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAiPaletteSuggestMood: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAiRecentPrompts: import("react").Dispatch<import("react").SetStateAction<StudioAiRecentPromptsState>>;
  setAssetFavoriteOnly: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setAssetPrompt: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAssetPromptName: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAssetPromptQuality: import("react").Dispatch<import("react").SetStateAction<GeneratedAssetQuality>>;
  setAssetPromptSize: import("react").Dispatch<import("react").SetStateAction<GeneratedAssetSize>>;
  setAssetSearchQuery: import("react").Dispatch<import("react").SetStateAction<string>>;
  setAssetSortOrder: import("react").Dispatch<import("react").SetStateAction<StudioAssetSortOrder>>;
  setAssetTab: import("react").Dispatch<import("react").SetStateAction<StudioAssetTab>>;
  setBg3dInitialDataUrl: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
  setBg3dInitialElementId: import("react").Dispatch<import("react").SetStateAction<string | undefined>>;
  setBg3dInitialScene: import("react").Dispatch<import("react").SetStateAction<StudioBg3dSceneDocument | undefined>>;
  setBg3dOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setBgSceneGenreFilter: import("react").Dispatch<import("react").SetStateAction<string>>;
  setBgSceneSearchQuery: import("react").Dispatch<import("react").SetStateAction<string>>;
  setColor: import("react").Dispatch<import("react").SetStateAction<string>>;
  setColorBlindPreview: import("react").Dispatch<import("react").SetStateAction<CvdMode>>;
  setCommentsOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setContinuityOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setDialogueBatchOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setDialogueScript: import("react").Dispatch<import("react").SetStateAction<string>>;
  setDialogueTranslateOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setDrawMode: import("react").Dispatch<import("react").SetStateAction<DrawMode>>;
  setEmeresCategoryFilter: import("react").Dispatch<import("react").SetStateAction<string>>;
  setEmeresSearchQuery: import("react").Dispatch<import("react").SetStateAction<string>>;
  setEmeresSimilarAnchorId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setEmeresTab: import("react").Dispatch<import("react").SetStateAction<"mine" | "catalog">>;
  setFxPickerSection: import("react").Dispatch<import("react").SetStateAction<FxPickerSection>>;
  setFxSearchQuery: import("react").Dispatch<import("react").SetStateAction<string>>;
  setHistoryPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setLeftPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setMagicResizeStrategy: import("react").Dispatch<import("react").SetStateAction<MagicResizeStrategy>>;
  setMenu: import("react").Dispatch<import("react").SetStateAction<StudioMenu | null>>;
  setPageReviewOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPoserVrmOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setRasterFavoriteOnly: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setReferencePanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setRenamingAssetId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setRenamingAssetName: import("react").Dispatch<import("react").SetStateAction<string>>;
  setRightPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setScale: import("react").Dispatch<import("react").SetStateAction<number>>;
  setScenarioOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setSceneSimilarAnchorId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setScrollPreviewOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setStoryboardGridOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTeamPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTimelapseOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTimelineOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setToneSearchQuery: import("react").Dispatch<import("react").SetStateAction<string>>;
  setTool: import("react").Dispatch<import("react").SetStateAction<Tool>>;
  setZoom: import("react").Dispatch<import("react").SetStateAction<number>>;
  sfxError: string | null;
  sfxLoading: boolean;
  sfxPacks: StudioSfxPacks | null;
  shared: SharedAsset[];
  sharedDocument: StudioSharedDocument | null;
  sharedError: string | null;
  sharedLoading: boolean;
  studioBgSceneAssetsError: string | null;
  studioBgSceneAssetsLoaded: boolean;
  studioBgSceneAssetsLoading: boolean;
  studioEmeresAssetsError: string | null;
  studioEmeresAssetsLoaded: boolean;
  studioEmeresAssetsLoading: boolean;
  studioOptionalAssets: StudioOptionalAssetPacks;
  studioSfx: StudioSfxPacks;
  studioStickerAssetsError: string | null;
  studioStickerAssetsLoaded: boolean;
  studioStickerAssetsLoading: boolean;
  teamPanelOpen: boolean;
  textAiConfigured: boolean;
  textAiTransport: StudioTextAiTransport;
  timelineOpen: boolean;
  toneSearchQuery: string;
  tool: Tool;
  uiDensityMode: "focus" | "simple" | "full";
  visibleLeftPanelOpen: boolean;
  visibleRightPanelOpen: boolean;
  wrapRef: import("react").RefObject<HTMLDivElement | null>;
  zoom: number;
  stableHandlers: StudioToolBeltContentHandlers;
}

export const StudioToolBeltContent = memo(function StudioToolBeltContent(
  props: StudioToolBeltContentProps
) {
  const {
    activeSurfaceReviewLocked,
    activeToolbarGroup,
    advancedFillActive,
    advancedFillUnsupportedReason,
    canvasOnlyMode,
    collaborationDocumentLocked,
    collaborationLockMessage,
    color,
    colorBlindPreview,
    commentsOpen,
    continuityOpen,
    drawMode,
    frameAnimOpen,
    frameAnimTargetId,
    hi,
    history,
    historyPanelOpen,
    isFullscreen,
    leftPanelOpen,
    masterEditMode,
    maximized,
    menu,
    menuRef,
    openStudioCommentCount,
    pageEditLocked,
    pageReviewOpen,
    poserVrmOpen,
    presentationPanelsHidden,
    recentColors,
    referencePanelOpen,
    rightPanelOpen,
    selected,
    setColor,
    setColorBlindPreview,
    setCommentsOpen,
    setContinuityOpen,
    setDrawMode,
    setHistoryPanelOpen,
    setLeftPanelOpen,
    setMenu,
    setPageReviewOpen,
    setPoserVrmOpen,
    setReferencePanelOpen,
    setRightPanelOpen,
    setScale,
    setScrollPreviewOpen,
    setStoryboardGridOpen,
    setTeamPanelOpen,
    setTimelapseOpen,
    setTimelineOpen,
    setTool,
    setZoom,
    sharedDocument,
    teamPanelOpen,
    timelineOpen,
    tool,
    uiDensityMode,
    visibleLeftPanelOpen,
    visibleRightPanelOpen,
    wrapRef,
    zoom,
    stableHandlers,
  } = props;
  const {
    addDiagonalSplit,
    addFrame,
    addText,
    ensureRecentColorsLoaded,
    enterCanvasOnlyMode,
    onPickImage,
    redo,
    rememberColor,
    resetView,
    toggleAdvancedFill,
    toggleFullscreen,
    toggleMaximize,
    toggleSelectedFrameDiagonal,
    undo,
    openFrameAnimationForSelected,
  } = stableHandlers;
  return (
    <>
        {/* 모바일: 가로 스크롤 가능 힌트(좌측 페이드). 데스크톱에선 숨김. */}
        <span aria-hidden className="pointer-events-none sticky left-0 -ml-1 h-8 w-2 shrink-0 self-stretch bg-gradient-to-r from-panel to-transparent lg:hidden" />
        {/* Quick Actions — undo/redo/history always near the left of the top bar */}
        {studioUiDensityAllows(uiDensityMode, "quick-actions") ? (
          <StudioQuickActionsBar>
            <button
              type="button"
              onClick={undo}
              disabled={hi === 0 || collaborationDocumentLocked}
              className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
              title="실행취소 (⌘Z)"
              aria-label="실행취소"
            >
              <Undo2 size={15} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={hi >= history.length - 1 || collaborationDocumentLocked}
              className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
              title="다시실행 (⌘⇧Z)"
              aria-label="다시실행"
            >
              <Redo2 size={15} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => setHistoryPanelOpen((v) => !v)}
              aria-pressed={historyPanelOpen}
              className={cn(toolBtn(historyPanelOpen), "h-8 px-1.5")}
              title="작업 내역"
              aria-label="작업 내역"
            >
              <HistoryIcon size={15} strokeWidth={1.75} />
            </button>
          </StudioQuickActionsBar>
        ) : null}
        <StudioToolbarDivider />
        {/* Main-menu can open these groups even when density hides the belt trigger — keep host mounted.
            트리거만 sr-hide: 클러스터 전체에 lg:sr-only 를 주면 fixed 팝오버까지 잘려 메뉴가 안 보인다. */}
        {(studioUiDensityAllows(uiDensityMode, "toolbar-assets") || activeToolbarGroup === "assetGroup") ? (
        <StudioToolbarCluster
          label="에셋 라이브러리"
          className={cn(!studioUiDensityAllows(uiDensityMode, "toolbar-assets") && "border-0 bg-transparent p-0 shadow-none")}
        >
        <div ref={activeToolbarGroup === "assetGroup" ? menuRef : undefined} className="relative">
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
            title="템플릿 · 콜라주 · 요소 · 장면 · 클립 · 효과 · 내 에셋"
          >
            <Folder size={15} aria-hidden /> 템플릿·에셋
            <ChevronDown size={12} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "assetGroup" && "rotate-180")} />
          </button>
          <StudioFloatingToolPopover
            open={activeToolbarGroup === "assetGroup"}
            id="asset-group"
            className={cn(groupPopoverClass("w-80"), "lg:w-[22rem] lg:max-w-[min(24rem,calc(100vw-1.5rem))]")}
          >
            <Suspense fallback={<StudioPanelLoading label="에셋 메뉴를 여는 중..." />}>
              <LazyStudioAssetToolPopoverBody toolBelt={props} />
            </Suspense>
          </StudioFloatingToolPopover>
        </div>
        </StudioToolbarCluster>
        ) : null}

        {studioUiDensityAllows(uiDensityMode, "toolbar-cut") ? (
        <>
        <StudioToolbarDivider label="컷" />
        <StudioToolbarCluster label="컷 배치">
        <button type="button" onClick={addFrame} className={toolBtn(false)} title="새 패널 프레임 추가">
          <Plus size={15} aria-hidden /> 패널
        </button>
        <button type="button" onClick={addDiagonalSplit} className={toolBtn(false)} title="기울어진 분할선의 두 패널을 한 번에 추가">
          <SquareSplitHorizontal size={15} aria-hidden /> 사선 컷
        </button>
        {selected?.type === "frame" && (
          <button
            type="button"
            onClick={toggleSelectedFrameDiagonal}
            className={toolBtn(Boolean(selected.points))}
            title="선택한 패널을 사선(평행사변형)↔사각형으로"
          >
            <SquareSplitHorizontal size={15} aria-hidden className="opacity-90" />
            {selected.points ? "직선화" : "사선화"}
          </button>
        )}
        </StudioToolbarCluster>
        </>
        ) : null}

        {/* 모바일 가로 벨트: 데스크톱은 좌측 세로 레일로 이동 (lg:hidden). */}
        {studioUiDensityAllows(uiDensityMode, "toolbar-draw") ? (
        <>
        <StudioToolbarDivider label="도구" className="lg:hidden" />
        <StudioToolbarCluster label="그리기 도구" className="lg:hidden">
        <button type="button" onClick={() => setTool("select")} className={toolBtn(tool === "select")} aria-pressed={tool === "select"} title="선택 (V)">
          <MousePointer2 size={15} aria-hidden /> 선택
        </button>
        <button
          type="button"
          disabled={activeSurfaceReviewLocked}
          title={activeSurfaceReviewLocked ? "편집 잠금을 해제한 뒤 펜을 사용할 수 있어요" : "펜 (B)"}
          onClick={() => {
            setTool("draw");
            setDrawMode("pen");
            setMenu(null);
          }}
          className={cn(toolBtn(tool === "draw" && drawMode === "pen"), "disabled:cursor-not-allowed disabled:opacity-40")}
          aria-pressed={tool === "draw" && drawMode === "pen"}
        >
          <Pencil size={15} aria-hidden /> 펜
        </button>
        <button
          type="button"
          disabled={activeSurfaceReviewLocked}
          title={activeSurfaceReviewLocked ? "편집 잠금을 해제한 뒤 지우개를 사용할 수 있어요" : "지우개 (E)"}
          onClick={() => {
            setTool("draw");
            setDrawMode("eraser");
            setMenu(null);
          }}
          className={cn(toolBtn(tool === "draw" && drawMode === "eraser"), "disabled:cursor-not-allowed disabled:opacity-40")}
          aria-pressed={tool === "draw" && drawMode === "eraser"}
        >
          <Eraser size={15} aria-hidden /> 지우개
        </button>
        <button
          type="button"
          onClick={toggleAdvancedFill}
          disabled={!advancedFillActive && advancedFillUnsupportedReason !== null}
          className={cn(toolBtn(advancedFillActive), "disabled:cursor-not-allowed disabled:opacity-40")}
          aria-pressed={advancedFillActive}
          title={advancedFillUnsupportedReason ?? "선택 래스터의 닫힌 영역을 참조 경계로 채우기 (G)"}
        >
          <PaintBucket size={15} aria-hidden /> 채우기
        </button>
        <button
          type="button"
          onClick={openFrameAnimationForSelected}
          disabled={selected?.type !== "image"}
          className={cn(toolBtn(frameAnimOpen && frameAnimTargetId === selected?.id), "disabled:opacity-40")}
          title={selected?.type !== "image" ? "이미지를 선택하면 프레임 애니메이션을 만들 수 있어요" : "선택한 이미지를 프레임별로 그려 애니메이션으로 만들기"}
        >
          <Film size={15} aria-hidden /> 프레임
        </button>
        </StudioToolbarCluster>
        </>
        ) : null}

        {studioUiDensityAllows(uiDensityMode, "toolbar-reference") ? (
        <>
        <StudioToolbarDivider label="참조" />
        <StudioToolbarCluster label="참조·3D">
        <button
          type="button"
          onClick={() => setPoserVrmOpen(true)}
          className={cn(toolBtn(poserVrmOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
          title="무료 베이스 캐릭터를 골라 포즈·표정·의상·색상까지 만들고 투명 배경으로 추가하기"
        >
          <UsersRound size={15} aria-hidden /> 3D 캐릭터
        </button>
        <button
          type="button"
          onClick={() => setReferencePanelOpen((v) => !v)}
          onMouseEnter={preloadStudioReferencePanel}
          onFocus={preloadStudioReferencePanel}
          className={cn(toolBtn(referencePanelOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
          aria-pressed={referencePanelOpen}
          title="참고 이미지 패널 — 그리는 동안 옆에 이미지를 띄워두기"
        >
          <PictureInPicture2 size={15} aria-hidden /> 참고
        </button>
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
            <Mountain size={15} aria-hidden /> 배경
            <ChevronDown size={12} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "bgGroup" && "rotate-180")} />
          </button>
          <StudioFloatingToolPopover
            open={activeToolbarGroup === "bgGroup"}
            id="bg-group"
            className={groupPopoverClass("w-80")}
          >
            <Suspense fallback={<StudioPanelLoading label="배경 메뉴를 여는 중..." />}>
              <LazyStudioSceneToolPopoverBody toolBelt={props} />
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
            title="색상 팔레트 · 브랜드 킷(글꼴·로고)"
          >
            <Palette size={15} aria-hidden /> 스타일
            <ChevronDown size={12} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "styleGroup" && "rotate-180")} />
          </button>
          <StudioFloatingToolPopover
            open={activeToolbarGroup === "styleGroup"}
            id="style-group"
            className={groupPopoverClass("w-72")}
          >
            <Suspense fallback={<StudioPanelLoading label="스타일 메뉴를 여는 중..." />}>
              <LazyStudioStyleToolPopoverBody toolBelt={props} />
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
            title="AI 어시스트 · 시나리오 설계 · 스톡 사진 · 연동 설정 — Z.ai/DeepSeek 서버 텍스트 또는 내 API 연동"
          >
            <WandSparkles size={15} aria-hidden /> AI
            <ChevronDown size={12} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "aiGroup" && "rotate-180")} />
          </button>
          <StudioFloatingToolPopover
            open={activeToolbarGroup === "aiGroup"}
            id="ai-group"
            className={cn(
              groupPopoverClass("w-80"),
              // Fixed flex column: nested max-heights previously clipped generate buttons.
              "flex h-[min(78dvh,36rem)] max-h-[min(78dvh,36rem)] flex-col overflow-hidden lg:w-96 lg:max-w-[min(24rem,calc(100vw-1.5rem))]"
            )}
          >
            <Suspense fallback={<StudioPanelLoading label="AI 메뉴를 여는 중..." />}>
              <LazyStudioAiToolPopoverBody toolBelt={props} />
            </Suspense>
          </StudioFloatingToolPopover>
        </div>
        </StudioToolbarCluster>
        </>
        ) : null}

        {/* 삽입 코어 — 밀도 모드와 무관하게 항상 노출(텍스트·말풍선은 예전에 AI 클러스터에 묶여
            simple/focus 에서 통째로 사라지던 회귀를 분리). */}
        {studioUiDensityAllows(uiDensityMode, "toolbar-insert") ? (
        <>
        <StudioToolbarDivider label="삽입" />
        <StudioToolbarCluster label="삽입·대사">
        <button
          type="button"
          onClick={() => addText()}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData("application/json-insert", JSON.stringify({ kind: "text" }));
            event.dataTransfer.effectAllowed = "copy";
          }}
          className={toolBtn(false)}
          title="텍스트 넣기 — 클릭해 추가하거나 캔버스로 끌어다 원하는 위치에 놓으세요"
        >
          <TypeIcon size={14} aria-hidden /> 텍스트
        </button>
        <div ref={menu === "bubble" ? menuRef : undefined} className="relative">
          <button
            type="button"
            onClick={() => setMenu(menu === "bubble" ? null : "bubble")}
            onPointerEnter={preloadStudioBubbleToolPopoverBody}
            onPointerDown={preloadStudioBubbleToolPopoverBody}
            onFocus={preloadStudioBubbleToolPopoverBody}
            aria-haspopup="menu"
            aria-expanded={menu === "bubble"}
            className={toolBtn(menu === "bubble")}
            title="말풍선 라이브러리"
          >
            <MessageCircle size={14} aria-hidden /> 말풍선
          </button>
          <StudioFloatingToolPopover
            open={menu === "bubble"}
            id="bubble-menu"
            className="fixed inset-x-2 top-[4.5rem] z-[70] max-h-[calc(100dvh-13rem)] w-auto overflow-y-auto rounded-2xl border border-line/70 bg-panel p-0 shadow-xl lg:inset-x-auto lg:left-3 lg:top-[4.5rem] lg:max-h-[min(42rem,calc(100dvh-7rem))] lg:w-[22rem] lg:max-w-[calc(100vw-1.5rem)]"
          >
            <Suspense fallback={<StudioPanelLoading label="말풍선 메뉴를 여는 중..." />}>
              <LazyStudioBubbleToolPopoverBody toolBelt={props} />
            </Suspense>
          </StudioFloatingToolPopover>
        </div>
        <label className={cn(toolBtn(false), "cursor-pointer")} title="이미지 추가 (⌘V로 클립보드 이미지 붙여넣기 가능)">
          <ImagePlus size={15} aria-hidden /> 이미지
          <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </label>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-xs text-fg-2 pointer-coarse:h-11">
          <Palette size={14} aria-hidden className="text-fg-3" />
          <span className="sr-only sm:not-sr-only sm:inline">색</span>
          <LazyStudioColorPopover
            value={color}
            onChange={setColor}
            recentColors={recentColors}
            onUseColor={rememberColor}
            onLoadRecentColors={ensureRecentColorsLoaded}
            title="브러시·도형 색상"
          />
        </span>
        </StudioToolbarCluster>
        </>
        ) : null}
        {/* 펜 옵션은 캔버스 하단 StudioDrawOptionsBar 한 곳에서만 제공합니다. */}
        <span className="mx-0.5 h-5 w-px bg-line" />
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
          onClick={() => setPageReviewOpen(true)}
          aria-pressed={pageReviewOpen}
          aria-label="페이지 검토와 편집 잠금"
          className={toolBtn(pageReviewOpen || pageEditLocked)}
          title={pageEditLocked ? "현재 페이지가 검토 잠금 상태예요" : "페이지별 승인 상태·담당·메모와 편집 잠금 관리"}
        >
          <ClipboardCheck size={14} />
        </button>
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
          className={cn(toolBtn(commentsOpen), "relative disabled:cursor-not-allowed disabled:opacity-50")}
          title={
            collaborationDocumentLocked && !sharedDocument?.capabilities.view
              ? collaborationLockMessage()
              : sharedDocument?.access === "view"
                ? `팀 댓글 열람 · 위치 이동${openStudioCommentCount > 0 ? ` · 열림 ${openStudioCommentCount}개` : ""}`
                : `페이지·컷·요소에 ${sharedDocument ? "팀 댓글 남기기 · 서버 동기화" : "문서 댓글 남기기 · 프로젝트 저장"}${
                  openStudioCommentCount > 0 ? ` · 열림 ${openStudioCommentCount}개` : ""
                }`
          }
        >
          <MessageCircle size={14} />
          {openStudioCommentCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-accent px-1 text-[0.58rem] font-bold leading-4 text-on-accent">
              {openStudioCommentCount > 99 ? "99+" : openStudioCommentCount}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => {
            setCommentsOpen(false);
            setTeamPanelOpen(true);
          }}
          aria-pressed={teamPanelOpen}
          aria-label="팀 작업 공간"
          className={toolBtn(teamPanelOpen)}
          title="작품 팀원 초대·역할·서버 권한 관리"
        >
          <UsersRound size={14} />
        </button>
        <button
          type="button"
          onClick={() => setContinuityOpen(true)}
          aria-pressed={continuityOpen}
          aria-label="이야기 연속성 검사"
          className={toolBtn(continuityOpen)}
          title="캐릭터 바이블과 장면 비트의 인물·장소·시간·의상·소품 연속성 검사"
        >
          <CheckCircle2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => setScrollPreviewOpen(true)}
          aria-label="세로 스크롤 미리보기 (모바일 폭으로 이어서 확인)"
          className={toolBtn(false)}
          title="세로 스크롤 미리보기 — 실제 독자처럼 좁은 폭에서 이어서 확인"
        >
          <Smartphone size={14} />
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
        {/* 줌·화면 맞춤·캔버스 최대화 — 모바일은 하단 도구막대가 대체 */}
        <StudioToolbarCluster label="화면·캔버스" className="ml-auto hidden lg:flex">
          <button
            type="button"
            onClick={() => setZoom((z) => clampStudioViewZoom(z - 0.1))}
            disabled={zoom <= STUDIO_VIEW_ZOOM_MIN}
            className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
            title="축소"
            aria-label="축소"
          >
            <Minus size={13} strokeWidth={1.75} />
          </button>
          <span className="w-9 text-center text-[0.62rem] font-bold tabular-nums text-fg-3">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => clampStudioViewZoom(z + 0.1))}
            disabled={zoom >= STUDIO_VIEW_ZOOM_MAX}
            className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
            title="확대"
            aria-label="확대"
          >
            <Plus size={13} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => {
              setScale(1);
              setZoom(1);
            }}
            className={cn(toolBtn(false), "h-8 px-1.5 text-[0.62rem] font-semibold")}
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
            className={cn(toolBtn(false), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            title="너비에 맞춤"
          >
            맞춤
          </button>
          <button
            type="button"
            onClick={resetView}
            className={cn(toolBtn(false), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            title="화면 리셋 — 줌·좌우 반전·스크롤 위치를 기본값으로 (Shift+0)"
          >
            리셋
          </button>
          <StudioToolbarDivider />
          <button
            type="button"
            onClick={() => {
              const anyOpen = leftPanelOpen || rightPanelOpen;
              setLeftPanelOpen(!anyOpen);
              setRightPanelOpen(!anyOpen);
            }}
            disabled={presentationPanelsHidden}
            aria-pressed={!visibleLeftPanelOpen && !visibleRightPanelOpen}
            className={cn(
              toolBtn(!visibleLeftPanelOpen && !visibleRightPanelOpen),
              "h-8 gap-1 px-1.5 text-[0.62rem] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
            )}
            title={
              presentationPanelsHidden
                ? "전체화면·브라우저 맞춤에서는 작업공간 패널을 임시로 숨깁니다"
                : "집중 모드 — 좌우 패널을 접어 캔버스를 넓게 사용"
            }
          >
            <Maximize2 size={13} strokeWidth={1.75} /> 넓게
          </button>
          <button
            type="button"
            onClick={toggleMaximize}
            aria-pressed={maximized}
            className={cn(toolBtn(maximized), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            title="브라우저 맞춤 — 브라우저 창을 꽉 채워 작업 (ESC로 복원)"
          >
            {maximized ? "복원" : "맞춤창"}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-pressed={isFullscreen}
            className={cn(toolBtn(isFullscreen), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            title="전체화면 (ESC로 종료)"
          >
            {isFullscreen ? "창" : "전체"}
          </button>
          <button
            type="button"
            onClick={enterCanvasOnlyMode}
            aria-pressed={canvasOnlyMode}
            className={cn(toolBtn(canvasOnlyMode), "h-8 gap-1 px-1.5 text-[0.62rem] font-semibold")}
            title="캔버스만 보기 — 제목·툴바·양쪽 패널을 잠시 숨기고 Esc로 복원"
          >
            <Minimize2 size={13} strokeWidth={1.75} /> 캔버스
          </button>
          <StudioColorBlindPreviewToggle value={colorBlindPreview} onChange={setColorBlindPreview} />
        </StudioToolbarCluster>
    </>
  );
});
