import {
  Bookmark,
  Boxes,
  CheckCircle2,
  ChevronDown,
  Clapperboard,
  ClipboardCheck,
  Droplets,
  Eraser,
  Film,
  Folder,
  GanttChartSquare,
  Grid2x2,
  History as HistoryIcon,
  Image as ImageIcon,
  ImagePlus,
  Images,
  LayoutGrid,
  LayoutTemplate,
  Library,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Mountain,
  MousePointer2,
  Package,
  PaintBucket,
  Palette,
  Pencil,
  PenTool,
  PictureInPicture2,
  Plus,
  Redo2,
  ScanLine,
  Search,
  Settings2,
  Shapes,
  Smartphone,
  Sparkles,
  SquareSplitHorizontal,
  Sticker as StickerIcon,
  Trash2,
  Type as TypeIcon,
  Undo2,
  UsersRound,
  Video,
  WandSparkles,
  Wind,
  X,
} from "lucide-react";
import { Suspense, memo } from "react";

import {
  pushStudioAiRecentPrompt,
  type StudioAiAssistToolId,
  type StudioAiRecentPromptsState,
} from "./studio-ai-assist-ux";
import {
  isStudioAiConfigured,
  type StudioAiImageSize,
  type StudioAiSettings,
  type StudioTextAiProvenance,
  type StudioTextAiTransport,
} from "./studio-ai-client";
import {
  CANVAS_W,
  TEMPLATES,
  groupBubbleVariants,
  groupTemplates,
  type BubbleVariant,
  type TemplateSpec,
} from "./studio-assets";
import { svgToDataUrl } from "./studio-characters";
import {
  StudioFloatingToolPopover,
  StudioMenuPopoverHeader,
  StudioMenuSubtabs,
  StudioQuickActionsBar,
  StudioToolbarCluster,
  StudioToolbarDivider,
} from "./studio-chrome-ui";
import {
  StudioAiAssistHub,
  StudioAiBackgroundPanel,
  StudioAiCharacterConsistencyPanel,
  StudioAiCompositionPanel,
  StudioAssetMenuPanel,
  StudioBackgroundPanel,
  StudioBrandKitPanel,
  StudioCanvasResizer,
  StudioCollagePanel,
  StudioDialogueSuggestPanel,
  StudioElementsPanel,
  StudioEmeresLibraryPanel,
  StudioIntegrationsSettingsPanel,
  StudioPaletteLibraryPanel,
  StudioPaletteSuggestPanel,
  StudioRasterAssetGrid,
  StudioStickerGrid,
  StudioStockImagePanel,
  StudioTonePanel,
  preloadStudioAssetMenuPanel,
  preloadStudioIntegrationsSettingsPanel,
  preloadStudioPaletteLibraryPanel,
  preloadStudioReferencePanel,
  preloadStudioStockImagePanel,
} from "./studio-page-lazy-ui";
import { studioToolButtonClass } from "./studio-panel-ui";
import { hasSameCategorySiblings } from "./studio-similar-style";
import { studioUiDensityAllows } from "./studio-ui-density";
import {
  STUDIO_VIEW_ZOOM_MAX,
  STUDIO_VIEW_ZOOM_MIN,
  clampStudioViewZoom,
} from "./studio-view-controls";
import { StudioBubbleVariantGlyph } from "./StudioBubbleVariantGlyph";
import {
  StudioColorBlindPreviewToggle,
  type CvdMode,
} from "./StudioColorBlindPreview";
import { LazyStudioColorPopover } from "./StudioLazyColorPopover";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";

import type {
  StudioAiObservableResult,
  StudioAiPendingOperationInput,
} from "./studio-ai-provenance-recorder";
import type {
  StudioAssetFavoriteId,
  StudioAssetFavoriteState,
} from "./studio-asset-favorites";
import type { StudioAsset } from "./studio-asset-library";
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
import { resolveAssetUrl } from "@/src/catalog-static";

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

const FX_PICKER_SECTIONS: { id: FxPickerSection; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "raster", label: "장면 소품" },
  { id: "sfx", label: "효과음" },
  { id: "emoji", label: "이모지" },
  { id: "comic", label: "만화 스티커" },
  { id: "creature", label: "동물·캐릭터" },
  { id: "prop", label: "소품·오브젝트" },
  { id: "lines", label: "선 효과" },
  { id: "overlay", label: "특수 효과" },
];

const TEMPLATE_GROUPS = groupTemplates(TEMPLATES);

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

export const StudioToolBeltContent = memo(function StudioToolBeltContent({
  activePage,
  activeServerAiProviderLabel,
  activeSurfaceReviewLocked,
  activeToolbarGroup,
  advancedFillActive,
  advancedFillUnsupportedReason,
  aiAssistTool,
  aiBgBusy,
  aiBgError,
  aiBgPrompt,
  aiBgSize,
  aiCharacterBusy,
  aiCharacterError,
  aiCharacterPrompt,
  aiCompositionDraft,
  aiDialogueSuggestBusy,
  aiDialogueSuggestCandidates,
  aiDialogueSuggestError,
  aiDialogueSuggestIncludeContext,
  aiDialogueSuggestSituation,
  aiPaletteSuggestBusy,
  aiPaletteSuggestError,
  aiPaletteSuggestion,
  aiPaletteSuggestMood,
  aiPaletteSuggestSavedMsg,
  aiRecentPrompts,
  aiSettings,
  assetFavoriteOnly,
  assetFavoriteState,
  assetGenerating,
  assetPrompt,
  assetPromptName,
  assetPromptQuality,
  assetPromptSize,
  assets,
  assetSearchQuery,
  assetsLoading,
  assetSortOrder,
  assetTab,
  bg,
  bgGrad,
  bgSceneGenreFilter,
  bgSceneSearchQuery,
  bgSceneSectionsFiltered,
  builtinRasterBusyId,
  canvasH,
  canvasOnlyMode,
  clips,
  collaborationDocumentLocked,
  collaborationLockMessage,
  color,
  colorBlindPreview,
  commentsOpen,
  configuredServerAiProviders,
  continuityOpen,
  dialogueScript,
  drawMode,
  elements,
  emeresCategoryFilter,
  emeresFlatCatalog,
  emeresSearchQuery,
  emeresSectionsFiltered,
  emeresSimilarAnchor,
  emeresSimilarSiblings,
  emeresTab,
  emeresUnderlayCount,
  frameAnimOpen,
  frameAnimTargetId,
  fxComicFiltered,
  fxCreatureFiltered,
  fxEmojisFiltered,
  fxLinePresetsFiltered,
  fxOverlaysFiltered,
  fxPickerHasResults,
  fxPickerSection,
  fxPropFiltered,
  fxQuery,
  fxRasterFiltered,
  fxSearchQuery,
  fxSectionVisible,
  fxSfxFiltered,
  hi,
  history,
  historyPanelOpen,
  isFullscreen,
  leftPanelOpen,
  magicResizeStrategy,
  masterEditMode,
  maximized,
  menu,
  menuRef,
  openStudioCommentCount,
  pageEditLocked,
  pageReviewOpen,
  panelLayoutPresets,
  panelLayoutsError,
  panelLayoutsLoading,
  poserVrmOpen,
  presentationPanelsHidden,
  publishingId,
  rasterFavoriteOnly,
  recentColors,
  referencePanelOpen,
  renamingAssetId,
  renamingAssetName,
  rightPanelOpen,
  sceneSimilarAnchor,
  sceneSimilarSiblings,
  sceneTemplates,
  sceneTemplatesError,
  sceneTemplatesLoading,
  selected,
  serverAiProvider,
  serverAiStatus,
  setAiAssistTool,
  setAiBgPrompt,
  setAiBgSize,
  setAiCharacterPrompt,
  setAiCompositionDraft,
  setAiDialogueSuggestIncludeContext,
  setAiDialogueSuggestSituation,
  setAiPaletteSuggestMood,
  setAiRecentPrompts,
  setAssetFavoriteOnly,
  setAssetPrompt,
  setAssetPromptName,
  setAssetPromptQuality,
  setAssetPromptSize,
  setAssetSearchQuery,
  setAssetSortOrder,
  setAssetTab,
  setBg3dInitialDataUrl,
  setBg3dInitialElementId,
  setBg3dInitialScene,
  setBg3dOpen,
  setBgSceneGenreFilter,
  setBgSceneSearchQuery,
  setColor,
  setColorBlindPreview,
  setCommentsOpen,
  setContinuityOpen,
  setDialogueBatchOpen,
  setDialogueScript,
  setDialogueTranslateOpen,
  setDrawMode,
  setEmeresCategoryFilter,
  setEmeresSearchQuery,
  setEmeresSimilarAnchorId,
  setEmeresTab,
  setFxPickerSection,
  setFxSearchQuery,
  setHistoryPanelOpen,
  setLeftPanelOpen,
  setMagicResizeStrategy,
  setMenu,
  setPageReviewOpen,
  setPoserVrmOpen,
  setRasterFavoriteOnly,
  setReferencePanelOpen,
  setRenamingAssetId,
  setRenamingAssetName,
  setRightPanelOpen,
  setScale,
  setScenarioOpen,
  setSceneSimilarAnchorId,
  setScrollPreviewOpen,
  setStoryboardGridOpen,
  setTeamPanelOpen,
  setTimelapseOpen,
  setTimelineOpen,
  setToneSearchQuery,
  setTool,
  setZoom,
  sfxError,
  sfxLoading,
  sfxPacks,
  shared,
  sharedDocument,
  sharedError,
  sharedLoading,
  studioBgSceneAssetsError,
  studioBgSceneAssetsLoaded,
  studioBgSceneAssetsLoading,
  studioEmeresAssetsError,
  studioEmeresAssetsLoaded,
  studioEmeresAssetsLoading,
  studioOptionalAssets,
  studioSfx,
  studioStickerAssetsError,
  studioStickerAssetsLoaded,
  studioStickerAssetsLoading,
  teamPanelOpen,
  textAiConfigured,
  textAiTransport,
  timelineOpen,
  toneSearchQuery,
  tool,
  uiDensityMode,
  visibleLeftPanelOpen,
  visibleRightPanelOpen,
  wrapRef,
  zoom,
  stableHandlers,
}: StudioToolBeltContentProps) {
  const {
    addBgScene,
    addBubble,
    addBuiltinRasterAsset,
    addCatalogElement,
    addDiagonalSplit,
    addDialogueBubbles,
    addDialogueSuggestionToScript,
    addEmeresLibraryItem,
    addEmeresTemplate,
    addFocusLines,
    addFrame,
    addFxOverlay,
    addRenderedImage,
    addSceneTemplate,
    addSfxPreset,
    addSpeedLines,
    addSticker,
    addText,
    addTone,
    announceDrawingShortcut,
    applyAiAssistPresetPrompt,
    applyBrandKitFont,
    applyBrandKitLogo,
    applyCollage,
    applyMagicResizePreset,
    applyPanelLayout,
    applyStudioBackgroundFill,
    applyTemplate,
    beginTrackedStudioAiOperation,
    deleteClip,
    ensureRecentColorsLoaded,
    enterCanvasOnlyMode,
    executeSuggestColorPalette,
    executeSuggestDialogueLines,
    insertAiCompositionNote,
    insertClip,
    insertDialogueSuggestionToSelected,
    insertStockImage,
    onDeleteAsset,
    onDeleteSharedAsset,
    onGenerateAiBackground,
    onGenerateAiCharacter,
    onGenerateAsset,
    onPickImage,
    onShareAsset,
    onUploadAsset,
    onUseSharedAsset,
    openFeatureTutorial,
    pendingTextAiProviderContext,
    redo,
    rememberColor,
    removeEmeresUnderlays,
    resetView,
    saveSelectionAsClip,
    saveSuggestedPaletteToLibrary,
    setCanvasH,
    settleTrackedTextAiOperation,
    toggleAdvancedFill,
    toggleAssetFavorite,
    toggleFullscreen,
    toggleMaximize,
    toggleSelectedFrameDiagonal,
    undo,
    updateAiSettings,
    updateServerAiProvider,
    handleRenameAsset,
    loadSharedAssets,
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
            onMouseEnter={preloadStudioAssetMenuPanel}
            onFocus={preloadStudioAssetMenuPanel}
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
              <StudioMenuPopoverHeader
                icon={Folder}
                title="템플릿 · 에셋"
                description="컷 템플릿·콜라주·요소·장면·클립·효과·내 에셋을 한 메뉴에서 고릅니다."
              />
              <StudioMenuSubtabs
                aria-label="에셋 메뉴 구역"
                activeId={menu}
                onSelect={(id) => {
                  if (id === "asset") preloadStudioAssetMenuPanel();
                  setMenu(id as StudioMenu);
                }}
                items={[
                  { id: "template", label: "템플릿", icon: LayoutTemplate, title: "캔버스·컷 레이아웃 템플릿" },
                  { id: "collage", label: "콜라주", icon: Grid2x2, title: "이미지 콜라주 배치" },
                  { id: "elements", label: "요소", icon: Shapes, title: "도형·장식 요소" },
                  { id: "emeres", label: "이메레스", icon: PenTool, title: "스케치 밑그림 틀" },
                  { id: "scene", label: "장면", icon: Clapperboard, title: "장면 템플릿" },
                  { id: "clip", label: "클립", icon: Bookmark, title: "저장된 클립" },
                  { id: "sticker", label: "효과", icon: StickerIcon, title: "만화 효과·스티커" },
                  { id: "asset", label: "내 에셋", icon: Library, title: "업로드·생성한 에셋" },
                ]}
              />
              {menu === "template" && (
                <div className="grid gap-1.5 lg:max-h-80 lg:overflow-y-auto lg:pr-1">
                  <p className="px-1 text-[0.66rem] font-medium text-fg-3">캔버스 템플릿</p>
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
                        onClick={() => void applyPanelLayout(layout)}
                        className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-raised"
                      >
                        <span className="font-medium text-fg">{layout.label}</span>
                        <span className="text-fg-3">{layout.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {menu === "collage" && (
                <Suspense fallback={<StudioPanelLoading label="콜라주 패널을 여는 중..." />}>
                  <StudioCollagePanel
                    canvasW={CANVAS_W}
                    availableImages={elements
                      .filter((el): el is ImageEl => el.type === "image" && !el.hidden)
                      .map((el) => ({
                        id: el.id,
                        width: el.width,
                        height: el.height,
                      }))}
                    onApply={applyCollage}
                  />
                </Suspense>
              )}
              {menu === "elements" && (
                <Suspense fallback={<StudioPanelLoading label="요소 패널을 여는 중..." />}>
                  <StudioElementsPanel
                    onAdd={(item) => {
                      addCatalogElement(item);
                    }}
                  />
                </Suspense>
              )}
              {menu === "emeres" && (
                <>
                  <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">이메레스 · 스케치 밑그림 틀</p>
                  <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                    선택한 틀이 반투명·잠금 밑그림으로 깔리고 펜 모드로 바뀌어요. 그 위에 따라 그린 뒤, 레이어 패널에서 밑그림을 숨기거나 지우세요.
                  </p>
                  {emeresUnderlayCount > 0 && (
                    <button
                      type="button"
                      onClick={removeEmeresUnderlays}
                      className="mb-2 flex w-full items-center justify-center gap-1 rounded-lg border border-bad/40 py-1 text-[0.64rem] font-semibold text-bad transition-colors hover:bg-bad/10"
                    >
                      <Trash2 size={11} /> 밑그림 전부 지우기 ({emeresUnderlayCount})
                    </button>
                  )}
                  <div className="mb-2 flex rounded-lg border border-line bg-card p-0.5">
                    {(["catalog", "mine"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setEmeresTab(tab)}
                        aria-pressed={emeresTab === tab}
                        className={cn(
                          "flex-1 rounded-md py-1 text-[0.64rem] font-semibold transition-colors",
                          emeresTab === tab ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
                        )}
                      >
                        {tab === "catalog" ? "기본 틀" : "내가 만든 틀"}
                      </button>
                    ))}
                  </div>
                  {emeresTab === "catalog" ? (
                    <>
                      {emeresSimilarAnchor && (
                        <div id="emeres-similar-strip" className="mb-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="truncate text-[0.66rem] font-semibold text-fg-2">
                              &ldquo;{emeresSimilarAnchor.label}&rdquo;과(와) 비슷한 스타일
                            </p>
                            <button
                              type="button"
                              onClick={() => setEmeresSimilarAnchorId(null)}
                              aria-label="비슷한 스타일 닫기"
                              className="shrink-0 p-0.5 text-fg-3 hover:text-fg-2"
                            >
                              <X size={12} />
                            </button>
                          </div>
                          {emeresSimilarSiblings.length === 0 ? (
                            <p className="text-[0.64rem] text-fg-3">같은 카테고리의 다른 틀이 없어요.</p>
                          ) : (
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {emeresSimilarSiblings.map((sib) => (
                                <button
                                  key={sib.id}
                                  type="button"
                                  title={`${sib.label} — ${sib.tip}`}
                                  onClick={() => addEmeresTemplate(sib)}
                                  className="w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-card p-1 hover:border-accent/50"
                                >
                                  <div className="flex h-12 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.96_0.006_78)]">
                                    <img src={svgToDataUrl(sib.svg)} alt={sib.label} className="h-full w-full object-contain" />
                                  </div>
                                  <span className="mt-0.5 block truncate text-center text-[0.58rem] text-fg-3">{sib.label}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
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
                                <div
                                  key={t.id}
                                  className="group relative overflow-hidden rounded-lg border border-line bg-card p-1 text-left hover:border-accent/50"
                                >
                                  <button type="button" title={`${t.label} — ${t.tip}`} onClick={() => addEmeresTemplate(t)} className="block w-full">
                                    <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.96_0.006_78)] p-1">
                                      <img src={svgToDataUrl(t.svg)} alt={t.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
                                    </div>
                                    <span className="mt-1 block truncate text-center text-[0.66rem] font-medium text-fg-2">{t.label}</span>
                                  </button>
                                  {hasSameCategorySiblings(emeresFlatCatalog, t.id) && (
                                    <button
                                      type="button"
                                      onClick={() => setEmeresSimilarAnchorId(t.id)}
                                      aria-controls="emeres-similar-strip"
                                      className="mt-0.5 block w-full truncate text-center text-[0.6rem] font-medium text-accent hover:underline"
                                    >
                                      비슷한 스타일 더보기
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <Suspense fallback={<StudioPanelLoading label="내가 만든 틀을 여는 중..." />}>
                      <StudioEmeresLibraryPanel onPickItem={addEmeresLibraryItem} />
                    </Suspense>
                  )}
                </>
              )}
              {menu === "scene" && (
                <>
                  <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">장면 템플릿 · 한 번에 깔기</p>
                  <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                    프레임·말풍선·효과를 미리 조합한 연출을 한 번에 추가해요. 추가한 뒤 대사와 위치만 다듬으면 끝나요.
                  </p>
                  {sceneSimilarAnchor && (
                    <div id="scene-similar-strip" className="mb-2 rounded-lg border border-accent/30 bg-accent/5 p-2">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-[0.66rem] font-semibold text-fg-2">
                          &ldquo;{sceneSimilarAnchor.label}&rdquo;과(와) 비슷한 장면
                        </p>
                        <button
                          type="button"
                          onClick={() => setSceneSimilarAnchorId(null)}
                          aria-label="비슷한 스타일 닫기"
                          className="shrink-0 p-0.5 text-fg-3 hover:text-fg-2"
                        >
                          <X size={12} />
                        </button>
                      </div>
                      {sceneSimilarSiblings.length === 0 ? (
                        <p className="text-[0.64rem] text-fg-3">같은 카테고리의 다른 장면 템플릿이 없어요.</p>
                      ) : (
                        <div className="grid gap-1">
                          {sceneSimilarSiblings.map((sib) => (
                            <button
                              key={sib.id}
                              type="button"
                              onClick={() => void addSceneTemplate(sib)}
                              className="rounded-lg border border-line bg-card px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-raised"
                            >
                              <span className="block text-xs font-semibold text-fg">{sib.label}</span>
                              <span className="block text-[0.68rem] text-fg-3">{sib.description}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
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
                              <div
                                key={t.id}
                                className="rounded-lg border border-line bg-card px-2 py-1.5 transition-colors hover:border-accent/50 hover:bg-raised"
                              >
                                <button type="button" onClick={() => void addSceneTemplate(t)} className="block w-full text-left">
                                  <span className="block text-xs font-semibold text-fg">{t.label}</span>
                                  <span className="block text-[0.68rem] text-fg-3">{t.description}</span>
                                </button>
                                {hasSameCategorySiblings(sceneTemplates.templates, t.id) && (
                                  <button
                                    type="button"
                                    onClick={() => setSceneSimilarAnchorId(t.id)}
                                    aria-controls="scene-similar-strip"
                                    className="mt-1 block text-[0.62rem] font-medium text-accent hover:underline"
                                  >
                                    비슷한 스타일 더보기
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
              {menu === "clip" && (
                <>
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
                </>
              )}
              {menu === "sticker" && (
                <>
                  <button
                    type="button"
                    onClick={() => setMenu("elements")}
                    className="mb-2 flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 py-2 text-left text-xs hover:border-accent/40 hover:bg-raised"
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                      <Shapes size={13} className="text-accent" aria-hidden />
                      도형 · 프레임 · 배지 요소
                    </span>
                    <span className="text-[0.62rem] text-fg-3">요소 탭 →</span>
                  </button>
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" />
                    <input
                      type="text"
                      placeholder="효과 검색..."
                      value={fxSearchQuery}
                      onChange={(e) => setFxSearchQuery(e.target.value)}
                      className="min-h-11 w-full rounded-lg border border-line bg-card py-1 pl-8 pr-11 text-xs placeholder:text-fg-3 outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent/40"
                    />
                    {fxSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setFxSearchQuery("")}
                        aria-label="검색어 지우기" className="absolute right-0 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-lg text-fg-3 transition-colors hover:bg-raised hover:text-fg-2"
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
                          "min-h-8 rounded-full border px-2 text-[0.66rem] font-medium transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3",
                          fxPickerSection === section.id ? "border-accent bg-accent text-white" : "border-line bg-card text-fg-3 hover:bg-raised"
                        )}
                      >
                        {section.label}
                      </button>
                    ))}
                  </div>
                  {fxSectionVisible("raster") && fxRasterFiltered.length > 0 && (
                    <Suspense fallback={<StudioPanelLoading label="장면 소품을 여는 중..." />}>
                      <StudioRasterAssetGrid
                        assets={fxRasterFiltered}
                        busyId={builtinRasterBusyId}
                        onAdd={(asset) => void addBuiltinRasterAsset(asset)}
                        favoriteState={assetFavoriteState}
                        favoriteOnly={rasterFavoriteOnly}
                        setFavoriteOnly={setRasterFavoriteOnly}
                        onToggleFavorite={toggleAssetFavorite}
                      />
                    </Suspense>
                  )}
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
                            className="min-h-9 rounded-md border border-line px-2 text-xs font-bold text-fg hover:bg-raised pointer-coarse:min-h-11"
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
                          <button
                            key={em}
                            type="button"
                            onClick={() => addSticker(em)}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                "application/json-insert",
                                JSON.stringify({ kind: "sticker", emoji: em })
                              );
                              event.dataTransfer.effectAllowed = "copy";
                            }}
                            title="클릭해 추가하거나 캔버스로 끌어다 원하는 위치에 놓으세요"
                            className="grid size-9 place-items-center rounded-md text-lg hover:bg-raised pointer-coarse:size-11"
                          >
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
                            className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-xs font-semibold hover:border-accent/50 hover:bg-raised"
                          >
                            {preset.id === "focus" ? <ScanLine size={15} aria-hidden /> : <Wind size={15} aria-hidden />}
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
                </>
              )}
              {menu === "asset" && (
                <Suspense fallback={<StudioPanelLoading label="에셋 보관함을 여는 중..." />}>
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
                    favoriteState={assetFavoriteState}
                    favoriteOnly={assetFavoriteOnly}
                    setFavoriteOnly={setAssetFavoriteOnly}
                    onToggleFavorite={toggleAssetFavorite}
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
              <StudioMenuPopoverHeader
                icon={Mountain}
                title="배경 편집"
                description="채우기·캔버스 크기, 2D 씬, 톤, 3D를 한곳에서 고르세요."
              />
              <StudioMenuSubtabs
                aria-label="배경 메뉴 구역"
                activeId={
                  menu === "bgScene" || menu === "tone" || menu === "bgFill" ? menu : "bgFill"
                }
                onSelect={(id) => {
                  if (id === "bg3d") {
                    setBg3dInitialScene(undefined);
                    setBg3dInitialDataUrl(undefined);
                    setBg3dInitialElementId(undefined);
                    setBg3dOpen(true);
                    setMenu(null);
                    return;
                  }
                  setMenu(id as StudioMenu);
                }}
                items={[
                  { id: "bgFill", label: "편집", icon: Droplets, title: "채우기·크기·비율 리사이저" },
                  { id: "bgScene", label: "씬", icon: ImageIcon, title: "2D 배경 씬" },
                  { id: "tone", label: "톤", icon: Grid2x2, title: "만화 스크린톤" },
                  { id: "bg3d", label: "3D", icon: Boxes, title: "3D 배경 블록아웃" },
                ]}
              />
              {menu === "bgFill" && (
                <Suspense fallback={<StudioPanelLoading label="배경 편집기를 여는 중..." />}>
                  <StudioBackgroundPanel
                    canvasW={CANVAS_W}
                    canvasH={canvasH}
                    currentBg={bg}
                    currentBgGrad={bgGrad}
                    onApply={(payload) => {
                      void applyStudioBackgroundFill(payload);
                    }}
                    sizeSlot={
                      <StudioCanvasResizer
                        canvasW={CANVAS_W}
                        canvasH={canvasH}
                        strategy={magicResizeStrategy}
                        onStrategyChange={setMagicResizeStrategy}
                        disabled={masterEditMode}
                        onSetHeight={(height) => {
                          if (masterEditMode) return;
                          setCanvasH(height);
                          announceDrawingShortcut(`캔버스 높이 ${height}px`);
                        }}
                        onMagicResizePreset={(preset) => {
                          applyMagicResizePreset(preset);
                          announceDrawingShortcut(`${preset.label} 규격 적용`);
                        }}
                      />
                    }
                  />
                </Suspense>
              )}
              {menu === "bgScene" && (
                <>
                  <div className="mb-2 flex items-start gap-2 rounded-xl border border-line bg-card px-2.5 py-2">
                    <ImageIcon size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[0.72rem] font-bold text-fg">2D 배경 씬</p>
                      <p className="text-[0.62rem] leading-snug text-fg-3">
                        탭하면 모든 패널에 깔려요. 한 컷만 바꾸려면 그 패널을 먼저 선택한 뒤 골라 주세요.
                      </p>
                    </div>
                  </div>
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
                            bgSceneGenreFilter === genre ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-3 hover:bg-raised"
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
                </>
              )}
              {menu === "tone" && (
                <>
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
                </>
              )}
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
            onPointerEnter={preloadStudioPaletteLibraryPanel}
            onPointerDown={preloadStudioPaletteLibraryPanel}
            onFocus={preloadStudioPaletteLibraryPanel}
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
              <StudioMenuPopoverHeader
                icon={Palette}
                title="스타일"
                description="팔레트와 브랜드 킷으로 작품 톤을 고정합니다."
              />
              <StudioMenuSubtabs
                aria-label="스타일 메뉴 구역"
                activeId={menu === "palette" || menu === "brandKit" ? menu : "palette"}
                onSelect={(id) => setMenu(id as StudioMenu)}
                items={[
                  { id: "palette", label: "팔레트", icon: Palette, title: "색상 팔레트 저장·가져오기(.gpl)·내보내기" },
                  { id: "brandKit", label: "브랜드 킷", icon: Package, title: "팔레트·글꼴·로고를 묶은 브랜드 킷 저장·적용" },
                ]}
              />
              {menu === "palette" && (
                <Suspense fallback={<StudioPanelLoading label="팔레트 라이브러리를 여는 중..." />}>
                  <StudioPaletteLibraryPanel
                    onPickColor={(hex) => setColor(hex)}
                    seedColors={recentColors}
                  />
                </Suspense>
              )}
              {menu === "brandKit" && (
                <Suspense fallback={<StudioPanelLoading label="브랜드 킷 패널을 여는 중..." />}>
                  <StudioBrandKitPanel
                    onPickColor={(hex) => setColor(hex)}
                    canApplyFont={!!selected && (selected.type === "text" || selected.type === "bubble")}
                    onApplyFont={applyBrandKitFont}
                    onApplyLogo={applyBrandKitLogo}
                  />
                </Suspense>
              )}
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
              <StudioMenuPopoverHeader
                icon={WandSparkles}
                title="AI 연동"
                description="초안·스톡·시나리오를 연결하고, 키 설정은 연동 탭에서 관리합니다."
                className="shrink-0"
              />
              <StudioMenuSubtabs
                aria-label="AI 메뉴 구역"
                className="shrink-0"
                activeId={
                  menu === "aiAssist" || menu === "stockImage" || menu === "integrations"
                    ? menu
                    : "aiAssist"
                }
                onSelect={(id) => {
                  if (id === "scenario") {
                    if (masterEditMode) return;
                    setScenarioOpen(true);
                    setMenu(null);
                    return;
                  }
                  if (id === "stockImage") preloadStudioStockImagePanel();
                  if (id === "integrations") preloadStudioIntegrationsSettingsPanel();
                  setMenu(id as StudioMenu);
                }}
                items={[
                  { id: "aiAssist", label: "어시스트", icon: Sparkles, title: "BYOK 배경·캐릭터·구도 제안" },
                  { id: "scenario", label: "시나리오", icon: Clapperboard, disabled: masterEditMode, title: masterEditMode ? "마스터 편집 중에는 사용할 수 없어요" : "시나리오 설계" },
                  { id: "stockImage", label: "스톡", icon: Images, title: "Unsplash 무료 사진" },
                  { id: "integrations", label: "설정", icon: Settings2, title: "API 키·연동 설정" },
                ]}
              />
              {menu === "aiAssist" && (
                <div className="flex min-h-0 flex-1 flex-col">
                <Suspense fallback={<StudioPanelLoading label="AI 어시스트 패널을 여는 중..." />}>
                  <StudioAiAssistHub
                    className="min-h-0 flex-1"
                    activeTool={aiAssistTool}
                    onToolChange={setAiAssistTool}
                    imageConfigured={isStudioAiConfigured(aiSettings)}
                    textConfigured={textAiConfigured}
                    connectionOk={textAiConfigured || isStudioAiConfigured(aiSettings)}
                    connectionLabel={
                      textAiConfigured
                        ? textAiTransport.mode === "server"
                          ? `${activeServerAiProviderLabel} 연결됨`
                          : "내 API 연결됨"
                        : isStudioAiConfigured(aiSettings)
                          ? "이미지 API 연결됨"
                          : serverAiStatus?.configured
                            ? "로그인 또는 API 키 필요"
                            : "API 키 등록 필요"
                    }
                    onOpenSettings={() => {
                      preloadStudioIntegrationsSettingsPanel();
                      setMenu("integrations");
                    }}
                    onPreloadSettings={preloadStudioIntegrationsSettingsPanel}
                    recentState={aiRecentPrompts}
                    onApplyPresetPrompt={applyAiAssistPresetPrompt}
                    providerSlot={
                      textAiTransport.mode === "server" && configuredServerAiProviders.length > 0 ? (
                        <div className="rounded-xl border border-line bg-card/35 p-2.5">
                          <label className="flex items-center justify-between gap-2 text-xs font-semibold text-fg-2">
                            <span>텍스트 AI 제공자</span>
                            <select
                              value={serverAiProvider}
                              onChange={(event) =>
                                updateServerAiProvider(event.target.value as StudioServerAiProviderPreference)
                              }
                              className="min-h-11 min-w-0 rounded-lg border border-line bg-panel px-2 text-xs text-fg outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/25"
                              aria-label="서버 텍스트 AI 제공자"
                            >
                              <option value="auto">자동 전환</option>
                              <option
                                value="zai"
                                disabled={!configuredServerAiProviders.some((provider) => provider.id === "zai")}
                              >
                                Z.ai
                              </option>
                              <option
                                value="deepseek"
                                disabled={!configuredServerAiProviders.some((provider) => provider.id === "deepseek")}
                              >
                                DeepSeek
                              </option>
                            </select>
                          </label>
                          <p className="mt-1.5 text-[0.65rem] leading-relaxed text-fg-3">
                            잔액·패키지 한도 소진 시 다른 제공자로 전환합니다. 일반 오류는 이중 과금을 막기 위해
                            자동 재전송하지 않아요.
                          </p>
                        </div>
                      ) : null
                    }
                    toolPanel={
                      <>
                        {aiAssistTool === "background" ? (
                          <StudioAiBackgroundPanel
                            configured={isStudioAiConfigured(aiSettings)}
                            prompt={aiBgPrompt}
                            onPromptChange={setAiBgPrompt}
                            size={aiBgSize}
                            onSizeChange={setAiBgSize}
                            busy={aiBgBusy}
                            error={aiBgError}
                            onGenerate={onGenerateAiBackground}
                          />
                        ) : null}
                        {aiAssistTool === "character" ? (
                          <StudioAiCharacterConsistencyPanel
                            configured={isStudioAiConfigured(aiSettings)}
                            hasReference={selected?.type === "image"}
                            referenceThumbnail={selected?.type === "image" ? selected.src : null}
                            prompt={aiCharacterPrompt}
                            onPromptChange={setAiCharacterPrompt}
                            busy={aiCharacterBusy}
                            error={aiCharacterError}
                            onGenerate={() => {
                              const prompt = aiCharacterPrompt.trim();
                              if (prompt) {
                                setAiRecentPrompts(
                                  pushStudioAiRecentPrompt(globalThis.localStorage, "character", prompt)
                                );
                              }
                              onGenerateAiCharacter();
                            }}
                          />
                        ) : null}
                        {aiAssistTool === "composition" ? (
                          <StudioAiCompositionPanel
                            settings={aiSettings}
                            transport={textAiTransport}
                            configured={textAiConfigured}
                            sceneText={aiCompositionDraft}
                            onSceneTextChange={setAiCompositionDraft}
                            onInsertAsNote={insertAiCompositionNote}
                            onOperationStart={(prompt) => {
                              setAiRecentPrompts(
                                pushStudioAiRecentPrompt(globalThis.localStorage, "composition", prompt)
                              );
                              const provider = pendingTextAiProviderContext();
                              return beginTrackedStudioAiOperation("composition", {
                                kind: "text",
                                task: "composition",
                                provider: provider.provider,
                                model: provider.model,
                                transport: provider.transport,
                                promptVersion: 1,
                                prompt,
                                target: { pageId: activePage.id },
                                references: [],
                              });
                            }}
                            onOperationSettled={({ operationId, result, textProvenance }) => {
                              settleTrackedTextAiOperation(operationId, result, textProvenance);
                            }}
                          />
                        ) : null}
                        {aiAssistTool === "dialogue" ? (
                          <StudioDialogueSuggestPanel
                            configured={textAiConfigured}
                            situationText={aiDialogueSuggestSituation}
                            onSituationTextChange={setAiDialogueSuggestSituation}
                            hasContext={activePage.elements.some(
                              (el) => (el.type === "bubble" || el.type === "text") && el.text.trim().length > 0
                            )}
                            includeContext={aiDialogueSuggestIncludeContext}
                            onIncludeContextChange={setAiDialogueSuggestIncludeContext}
                            busy={aiDialogueSuggestBusy}
                            error={aiDialogueSuggestError}
                            candidates={aiDialogueSuggestCandidates}
                            onGenerate={() => {
                              const prompt = aiDialogueSuggestSituation.trim();
                              if (prompt) {
                                setAiRecentPrompts(
                                  pushStudioAiRecentPrompt(globalThis.localStorage, "dialogue", prompt)
                                );
                              }
                              void executeSuggestDialogueLines();
                            }}
                            canInsertToSelected={
                              !!selected && (selected.type === "bubble" || selected.type === "text")
                            }
                            onAddToScript={addDialogueSuggestionToScript}
                            onInsertToSelected={insertDialogueSuggestionToSelected}
                          />
                        ) : null}
                        {aiAssistTool === "palette" ? (
                          <StudioPaletteSuggestPanel
                            configured={textAiConfigured}
                            moodText={aiPaletteSuggestMood}
                            onMoodTextChange={setAiPaletteSuggestMood}
                            busy={aiPaletteSuggestBusy}
                            error={aiPaletteSuggestError}
                            suggestion={aiPaletteSuggestion}
                            savedMessage={aiPaletteSuggestSavedMsg}
                            onGenerate={() => {
                              const prompt = aiPaletteSuggestMood.trim();
                              if (prompt) {
                                setAiRecentPrompts(
                                  pushStudioAiRecentPrompt(globalThis.localStorage, "palette", prompt)
                                );
                              }
                              void executeSuggestColorPalette();
                            }}
                            onSaveToLibrary={saveSuggestedPaletteToLibrary}
                          />
                        ) : null}
                      </>
                    }
                  />
                </Suspense>
                </div>
              )}
              {menu === "stockImage" && (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <Suspense fallback={<StudioPanelLoading label="스톡 사진 패널을 여는 중..." />}>
                    <StudioStockImagePanel
                      onInsert={insertStockImage}
                      onOpenSettings={() => {
                        preloadStudioIntegrationsSettingsPanel();
                        setMenu("integrations");
                      }}
                    />
                  </Suspense>
                </div>
              )}
              {menu === "integrations" && (
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <Suspense fallback={<StudioPanelLoading label="연동 설정 패널을 여는 중..." />}>
                    <StudioIntegrationsSettingsPanel aiSettings={aiSettings} onAiSettingsChange={updateAiSettings} />
                  </Suspense>
                </div>
              )}
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
              <div className="relative overflow-hidden border-b border-line/50 bg-gradient-to-br from-accent-soft/35 via-card/60 to-panel px-3 pb-3 pt-3">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-4 -top-6 size-20 rounded-full bg-accent/10 blur-2xl"
                />
                <div className="relative flex items-start gap-2.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent shadow-[inset_0_1px_0_oklch(0.95_0.02_85_/_0.12)]">
                    <MessageCircle size={18} aria-hidden strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[0.9rem] font-semibold tracking-tight text-fg">말풍선 골라 넣기</p>
                    <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                      장면에 맞는 목소리를 고르면 돼요. 대충 골라도 나중에 바꿀 수 있어요.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setMenu(null);
                        openFeatureTutorial("bubble");
                      }}
                      className="mt-1.5 text-[0.65rem] font-medium text-accent/90 underline-offset-2 transition-colors hover:text-accent hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      말풍선 튜토리얼 보기
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 p-2.5" role="menu" aria-label="말풍선 종류">
                {groupBubbleVariants().map((section) => (
                  <div key={section.group}>
                    <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[0.62rem] font-semibold text-fg-3">
                      <span className="inline-block size-1 rounded-full bg-accent/55" aria-hidden />
                      {section.group}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                      {section.variants.map((v) => (
                        <button
                          key={v.id}
                          type="button"
                          role="menuitem"
                          onClick={() => addBubble(v.id)}
                          // 클릭=중앙/패널 규칙, 드래그=캔버스 드롭 지점 배치(onWrapDrop 이 처리).
                          draggable
                          onDragStart={(event) => {
                            event.dataTransfer.setData(
                              "application/json-insert",
                              JSON.stringify({ kind: "bubble", variant: v.id })
                            );
                            event.dataTransfer.effectAllowed = "copy";
                          }}
                          title={`${v.label} — 클릭해 추가하거나 캔버스로 끌어다 원하는 위치에 놓으세요`}
                          className="group flex min-h-[5.75rem] flex-col rounded-2xl border border-line/55 bg-gradient-to-b from-card/90 to-canvas/30 p-2 text-left shadow-[inset_0_1px_0_oklch(0.95_0.02_85_/_0.04)] transition-[border-color,background,transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:border-accent/40 hover:bg-raised/80 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:translate-y-0"
                        >
                          <span className="flex h-12 items-center justify-center rounded-xl bg-canvas/45 ring-1 ring-line/35 transition-colors group-hover:bg-accent-soft/25 group-hover:ring-accent/20">
                            <StudioBubbleVariantGlyph
                              variant={v.id}
                              className="h-10 w-full text-fg-2 transition-colors duration-200 group-hover:text-accent"
                            />
                          </span>
                          <span className="mt-1.5 block text-[0.78rem] font-semibold tracking-tight text-fg">
                            {v.label}
                          </span>
                          <span className="mt-0.5 block text-[0.6rem] leading-snug text-fg-3">{v.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 border-t border-line/50 bg-canvas/25 px-2.5 py-2.5">
                <div>
                  <p className="text-[0.72rem] font-semibold text-fg-2">대사를 한 번에</p>
                  <p className="mt-0.5 text-[0.64rem] leading-snug text-fg-3">
                    한 줄에 한 마디. <span className="text-fg-2">이름: 대사</span>면 화자 자동,
                    <span className="text-fg-2"> (지문)</span>은 나레이션.
                  </p>
                </div>
                <textarea
                  value={dialogueScript}
                  onChange={(e) => setDialogueScript(e.target.value)}
                  placeholder={"민수: 안녕?\n지영: 오랜만이야\n(잠시 후)"}
                  spellCheck
                  rows={4}
                  className="w-full resize-y rounded-xl border border-line/60 bg-card/80 px-2.5 py-2 text-[0.7rem] leading-relaxed text-fg outline-none transition-colors placeholder:text-fg-3/80 focus:border-accent/45 focus:bg-card"
                />
                <button
                  type="button"
                  onClick={() => void addDialogueBubbles()}
                  disabled={!dialogueScript.trim()}
                  className={cn(
                    "w-full rounded-xl py-2 text-xs font-semibold transition-[opacity,transform,background] duration-150",
                    dialogueScript.trim()
                      ? "bg-accent text-on-accent shadow-sm hover:opacity-95 active:scale-[0.99]"
                      : "cursor-not-allowed bg-card text-fg-3 ring-1 ring-line/50"
                  )}
                >
                  말풍선으로 한 번에 넣기
                </button>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setDialogueBatchOpen(true);
                    }}
                    className="rounded-xl border border-line/60 bg-card/70 py-1.5 text-[0.7rem] font-medium text-fg-2 transition-colors hover:bg-raised"
                  >
                    배치 대사 편집
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null);
                      setDialogueBatchOpen(false);
                      setDialogueTranslateOpen(true);
                    }}
                    className="rounded-xl border border-line/60 bg-card/70 py-1.5 text-[0.7rem] font-medium text-fg-2 transition-colors hover:bg-raised"
                  >
                    번역 (내 API 키)
                  </button>
                </div>
              </div>
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
