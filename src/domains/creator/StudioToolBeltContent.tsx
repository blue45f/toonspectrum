import {
  Boxes,
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
  PersonStanding,
  Smartphone,
  SquareSplitHorizontal,
  Type as TypeIcon,
  Undo2,
  UsersRound,
  Video,
  WandSparkles,
} from "lucide-react";
import { Suspense, memo, type ComponentProps } from "react";

import {
  StudioFloatingToolPopover,
  StudioQuickActionsBar,
  StudioToolbarCluster,
  StudioToolbarDivider,
  STUDIO_ICON_SIZE,
  STUDIO_ICON_STROKE,
} from "./studio-chrome-ui";
import { writeStudioInsertDragPayload } from "./studio-insert-drag-writer";
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
import { studioToolHintFromLabel, type StudioToolHintSpec } from "./studio-tool-hints";
import { studioUiDensityAllows } from "./studio-ui-density";
import { STUDIO_VIEW_ACTION_HINTS } from "./studio-view-action-hints";
import {
  STUDIO_VIEW_ZOOM_MAX,
  STUDIO_VIEW_ZOOM_MIN,
  stepStudioViewZoom,
} from "./studio-view-controls";
import { LazyStudioColorPopover } from "./StudioLazyColorPopover";
import { StudioPanelLoading } from "./StudioLazySurfaceFallback";
import { StudioToolHintTarget } from "./StudioToolHint";

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
  StudioAssetShareOptions,
  StudioAssetSortOrder,
  StudioAssetTab,
} from "./StudioAssetMenuPanel";
import type { CreatorAssetReportReason } from "@/lib/creator-asset-contract";
import type {
  GeneratedAssetQuality,
  GeneratedAssetSize,
  SharedAssetCatalogItem,
} from "@/src/infrastructure/creator-client";

import { cn } from "@/lib/utils";

const STUDIO_CANVAS_IMAGE_ACCEPT =
  "image/*,.bmp,.dib,.tga,.icb,.vda,.vst,.ppm,.pam,.qoi,.tif,.tiff";

const toolBtn = (active: boolean) => studioToolButtonClass(active, { dense: true });

/** Icon-only belt buttons: keep the 44px touch-target contract on coarse pointers
 *  (the dense px-3 padding alone leaves a 14–15px glyph at ~40px width). */
const iconToolBtnTouch = "pointer-coarse:min-w-11 pointer-coarse:justify-center";

// Group popovers stay viewport-fixed because the desktop ToolBelt is an inert zero-size host.
const groupPopoverClass = (width: "w-72" | "w-80") =>
  cn(
    "fixed inset-x-2 top-[6.5rem] z-[70] max-h-[min(78dvh,36rem)] w-auto overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-2xl lg:inset-x-auto lg:left-3 lg:w-auto lg:max-w-[min(28rem,calc(100vw-1.5rem))]",
    width === "w-72" ? "lg:w-72" : "lg:w-80"
  );

type StudioToolBeltHintTargetProps = Omit<
  ComponentProps<typeof StudioToolHintTarget>,
  "preferredSide"
>;

/**
 * The ToolBelt is anchored to the top edge, so all coaches should open below
 * their controls. Keeping the shared target here also gives every action the
 * same single-open, keyboard, touch-hold, and disabled-state behavior.
 */
function StudioToolBeltHintTarget(props: StudioToolBeltHintTargetProps) {
  return <StudioToolHintTarget preferredSide="bottom" {...props} />;
}

const TOOL_BELT_HINTS = {
  undo: studioToolHintFromLabel(
    "실행취소",
    "가장 최근 편집 작업을 한 단계 되돌립니다.",
    "⌘Z"
  ),
  redo: studioToolHintFromLabel(
    "다시실행",
    "실행취소로 되돌린 작업을 한 단계 다시 적용합니다.",
    "⌘⇧Z"
  ),
  history: studioToolHintFromLabel(
    "작업 내역",
    "편집 기록을 열어 이전 작업 지점을 확인하고 원하는 상태로 이동합니다.",
    undefined,
    "history"
  ),
  assets: studioToolHintFromLabel(
    "템플릿·에셋",
    "템플릿, 콜라주, 장면, 클립, 효과와 내 에셋을 한곳에서 찾아 캔버스에 추가합니다.",
    undefined,
    "assets"
  ),
  panelAdd: studioToolHintFromLabel(
    "패널 추가",
    "현재 페이지에 새 사각 패널을 추가해 다음 컷을 배치합니다.",
    undefined,
    "panel-layout",
    "add"
  ),
  panelSplit: studioToolHintFromLabel(
    "사선 컷 추가",
    "기울어진 경계로 나뉜 두 패널을 한 번에 추가합니다.",
    undefined,
    "panel-layout",
    "split-diagonal"
  ),
  panelDiagonalize: studioToolHintFromLabel(
    "패널 사선화",
    "선택한 사각 패널을 평행사변형 형태의 사선 패널로 바꿉니다.",
    undefined,
    "panel-layout",
    "diagonalize"
  ),
  panelStraighten: studioToolHintFromLabel(
    "패널 직선화",
    "선택한 사선 패널을 다시 사각 패널로 바꿉니다.",
    undefined,
    "panel-layout",
    "straighten"
  ),
  select: studioToolHintFromLabel(
    "선택",
    "캔버스 요소를 선택해 이동하거나 크기와 속성을 편집합니다.",
    "V"
  ),
  pen: studioToolHintFromLabel(
    "펜",
    "현재 브러시와 필압 설정으로 자유롭게 선을 그립니다.",
    "B"
  ),
  eraser: studioToolHintFromLabel(
    "지우개",
    "현재 획을 브러시 크기와 필압에 맞춰 지웁니다.",
    "E"
  ),
  fill: studioToolHintFromLabel(
    "고급 채우기",
    "선택한 래스터의 닫힌 영역을 참조 경계로 인식해 현재 색으로 채웁니다.",
    "G"
  ),
  frameAnimation: studioToolHintFromLabel(
    "프레임 애니메이션",
    "선택한 이미지에 프레임을 쌓아 셀 애니메이션을 만듭니다."
  ),
  character3d: studioToolHintFromLabel(
    "3D 캐릭터",
    "베이스 캐릭터를 고른 뒤 포즈, 표정, 의상과 색상을 조정해 투명 배경 이미지로 추가합니다.",
    undefined,
    "character-3d"
  ),
  mannequin3d: studioToolHintFromLabel(
    "3D 데생 인형",
    "모델 파일 없이 체형을 조절하고 포즈를 잡아 드로잉 참고 이미지로 캡처합니다.",
    undefined,
    "mannequin-3d"
  ),
  bg3d: studioToolHintFromLabel(
    "3D 배경",
    "3D 오브젝트와 씬을 배치하고 카메라 앵글을 조절해 웹툰 배경 이미지를 추출합니다.",
    undefined,
    "background-library"
  ),
  reference: studioToolHintFromLabel(
    "참고 이미지",
    "그리는 동안 캔버스 옆에 참고 이미지를 고정해 형태와 색을 비교합니다."
  ),
  background: studioToolHintFromLabel(
    "배경·장면",
    "배경 채우기, 장면 템플릿, 톤과 3D 배경을 찾아 현재 페이지에 적용합니다.",
    undefined,
    "background-library"
  ),
  style: studioToolHintFromLabel(
    "스타일",
    "색상 팔레트와 브랜드 킷의 글꼴·로고를 작품 전체에 일관되게 적용합니다.",
    undefined,
    "style-library"
  ),
  ai: studioToolHintFromLabel(
    "AI 어시스트",
    "장면 구성, 대사, 팔레트, 이미지 생성과 AI 연동 설정을 한곳에서 엽니다.",
    undefined,
    "ai-assist"
  ),
  text: studioToolHintFromLabel(
    "텍스트",
    "클릭하면 텍스트를 추가하고, 끌어 놓으면 원하는 캔버스 위치에 바로 배치합니다."
  ),
  bubble: studioToolHintFromLabel(
    "말풍선",
    "말풍선 라이브러리에서 형태를 골라 대사와 함께 캔버스에 배치합니다.",
    undefined,
    "bubble",
    "open-library",
  ),
  image: studioToolHintFromLabel(
    "이미지 추가",
    "기기의 이미지 파일을 가져옵니다. 클립보드 이미지는 ⌘V 또는 Ctrl+V로 붙여넣을 수 있어요."
  ),
  timelapse: studioToolHintFromLabel(
    "타임랩스 녹화",
    "그리기 과정을 기록해 작업 흐름을 타임랩스 영상으로 만듭니다.",
    undefined,
    "timelapse"
  ),
  storyboard: studioToolHintFromLabel(
    "스토리보드 그리드",
    "모든 페이지를 격자로 펼쳐 컷 흐름, 밀도와 장면 전환을 한눈에 비교합니다.",
    undefined,
    "storyboard-grid"
  ),
  review: studioToolHintFromLabel(
    "페이지 검토",
    "페이지별 승인 상태, 담당자와 메모를 관리하고 검토 중 편집을 잠급니다.",
    undefined,
    "review-workflow"
  ),
  team: studioToolHintFromLabel(
    "팀 작업 공간",
    "작품 팀원을 초대하고 역할, 권한과 공동 작업 상태를 관리합니다.",
    undefined,
    "team-collaboration"
  ),
  continuity: studioToolHintFromLabel(
    "이야기 연속성 검사",
    "캐릭터 바이블과 장면 비트를 비교해 인물, 장소, 시간, 의상과 소품의 불일치를 찾습니다.",
    undefined,
    "continuity-check"
  ),
  scrollPreview: studioToolHintFromLabel(
    "세로 스크롤 미리보기",
    "페이지를 모바일 독자 폭으로 이어 붙여 컷 간격과 읽기 흐름을 확인합니다.",
    undefined,
    "vertical-preview"
  ),
  timeline: studioToolHintFromLabel(
    "다중 레이어 타임라인",
    "레이어별 키프레임과 재생 구간을 시간축에서 편집합니다.",
    undefined,
    "timeline"
  ),
  zoomOut: STUDIO_VIEW_ACTION_HINTS.zoomOut,
  zoomIn: STUDIO_VIEW_ACTION_HINTS.zoomIn,
  actualSize: STUDIO_VIEW_ACTION_HINTS.actualSize,
  fitWidth: STUDIO_VIEW_ACTION_HINTS.fitWidth,
  resetView: STUDIO_VIEW_ACTION_HINTS.reset,
  workspaceFocus: studioToolHintFromLabel(
    "집중 모드",
    "좌우 속성 패널을 함께 접어 캔버스를 더 넓게 사용합니다.",
    undefined,
    "workspace-focus"
  ),
  workspaceRestore: studioToolHintFromLabel(
    "작업 패널 열기",
    "접어 둔 좌우 속성 패널을 다시 열어 편집 도구와 설정을 표시합니다.",
    undefined,
    "workspace-focus",
    "restore"
  ),
  maximizeWindow: studioToolHintFromLabel(
    "브라우저 맞춤",
    "사이트 헤더와 주변 영역을 숨기고 브라우저 창 전체를 편집기에 사용합니다. Esc로 복원할 수 있어요.",
    undefined,
    "fullscreen",
    "maximize-window"
  ),
  restoreWindow: studioToolHintFromLabel(
    "브라우저 맞춤 종료",
    "편집기 주변의 사이트 헤더와 영역을 다시 표시해 일반 화면으로 돌아갑니다.",
    "Esc",
    "fullscreen",
    "restore-window"
  ),
  fullscreen: studioToolHintFromLabel(
    "전체화면",
    "브라우저의 전체화면 모드로 전환해 편집 공간을 최대화합니다. Esc로 종료할 수 있어요.",
    "F11",
    "fullscreen",
    "fullscreen"
  ),
  exitFullscreen: studioToolHintFromLabel(
    "전체화면 종료",
    "브라우저 전체화면을 종료하고 이전 편집기 크기로 돌아갑니다.",
    "F11",
    "fullscreen",
    "exit-fullscreen"
  ),
  canvasOnly: studioToolHintFromLabel(
    "캔버스만 보기",
    "제목, 툴바와 양쪽 패널을 잠시 숨겨 캔버스에만 집중합니다. Esc로 복원할 수 있어요.",
    undefined,
    "fullscreen",
    "canvas-only"
  ),
} satisfies Record<string, StudioToolHintSpec>;

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
  /**
   * 선택/그리기 전환의 단일 정본. 진행 중인 획 취소 → 픽셀 도구 disarm(스포이드 포함) →
   * tool/drawMode 커밋을 한 순서로 수행한다. 도구 벨트가 setTool/setDrawMode를 직접 만지면
   * 같은 명령이 진입점마다 다른 부수효과를 갖게 되므로 항상 이 핸들러를 거친다.
   */
  activatePrimaryCanvasTool: (tool: "select" | "draw", drawMode?: DrawMode) => void;
  openFrameAnimationForSelected: () => void;
  addBgScene: (bg: StudioBgScene) => void;
  addBubble: (
    variant: BubbleVariant,
    at?: { x: number; y: number; },
    editImmediately?: boolean
  ) => void;
  addBuiltinRasterAsset: (asset: StudioRasterAsset) => Promise<void>;
  addCatalogElement: (item: { svg: string; width: number; height: number; label: string; }) => void;
  /**
   * Elements 3D rail: open BG3D / VRM with a one-shot template·primitive·prop seed.
   * Host owns seed state so drag/drop and click share one entry.
   */
  openStudioObjectInsert: (request: {
    readonly openTarget: "bg3d-editor" | "vrm-poser" | "bg3d-templates";
    readonly sourceId: string;
  }) => void;
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
  ) => boolean;
  addSceneTemplate: (template: SceneTemplate) => Promise<void>;
  addSfxPreset: (preset: SfxPreset) => Promise<void>;
  addSpeedLines: () => void;
  addSticker: (emoji: string, at?: { x: number; y: number; }) => void;
  addText: (at?: { x: number; y: number; }, editImmediately?: boolean) => void;
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
  disarmAllPixelTools: () => void;
  ensureRecentColorsLoaded: () => void;
  enterCanvasOnlyMode: () => void;
  executeSuggestColorPalette: () => Promise<void>;
  executeSuggestDialogueLines: () => Promise<void>;
  fitCanvasToWidth: () => void;
  handleRenameAsset: (id: string) => Promise<void>;
  insertAiCompositionNote: (text: string) => void;
  insertClip: (clip: StudioClip) => void;
  insertDialogueSuggestionToSelected: (candidate: DialogueSuggestionCandidate) => void;
  insertStockImage: (photo: StudioStockPhoto, dataUrl: string, width: number, height: number) => void;
  loadSharedAssets: () => Promise<void>;
  loadMoreSharedAssets: () => Promise<void>;
  onDeleteAsset: (id: string) => Promise<void>;
  onDeleteSharedAsset: (id: string) => Promise<void>;
  onReportSharedAsset: (asset: SharedAssetCatalogItem, reason: CreatorAssetReportReason, details: string) => Promise<void>;
  onGenerateAiBackground: () => void;
  onGenerateAiCharacter: () => void;
  onGenerateAsset: () => Promise<void>;
  onPickImage: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onShareAsset: (asset: StudioAsset, options: StudioAssetShareOptions) => Promise<void>;
  onUploadAsset: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onUseSharedAsset: (asset: SharedAssetCatalogItem) => Promise<void>;
  openFeatureTutorial: (tutorialId?: string | null) => void;
  pendingTextAiProviderContext: () => import("./studio-ai-provenance-recorder").StudioAiOperationProviderContext;
  redo: () => void;
  rememberColor: (c: string) => void;
  removeEmeresUnderlays: () => void;
  resetView: () => void;
  setActualPixelView: () => void;
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
  bg3dOpen: boolean;
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
  magicResizeStrategy: MagicResizeStrategy;
  masterEditMode: boolean;
  maximized: boolean;
  menu: StudioMenu | null;
  menuRef: import("react").RefObject<HTMLDivElement | null>;
  openStudioCommentCount: number;
  pageEditLocked: boolean;
  pageReviewOpen: boolean;
  mannequinPoserOpen: boolean;
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
  setLeftPanelOpen?: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setMagicResizeStrategy: import("react").Dispatch<import("react").SetStateAction<MagicResizeStrategy>>;
  setMenu: import("react").Dispatch<import("react").SetStateAction<StudioMenu | null>>;
  setMannequinPoserOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPageReviewOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setPoserVrmOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setRasterFavoriteOnly: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setReferencePanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setRenamingAssetId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setRenamingAssetName: import("react").Dispatch<import("react").SetStateAction<string>>;
  setScale: import("react").Dispatch<import("react").SetStateAction<number>>;
  setScenarioOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setSceneSimilarAnchorId: import("react").Dispatch<import("react").SetStateAction<string | null>>;
  setScrollPreviewOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setStoryboardGridOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setRightPanelOpen?: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTeamPanelOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTimelapseOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setTimelineOpen: import("react").Dispatch<import("react").SetStateAction<boolean>>;
  setToneSearchQuery: import("react").Dispatch<import("react").SetStateAction<string>>;
  setTool: import("react").Dispatch<import("react").SetStateAction<Tool>>;
  setZoom: import("react").Dispatch<import("react").SetStateAction<number>>;
  sfxError: string | null;
  sfxLoading: boolean;
  sfxPacks: StudioSfxPacks | null;
  shared: SharedAssetCatalogItem[];
  sharedDocument: StudioSharedDocument | null;
  sharedError: string | null;
  sharedHasMore: boolean;
  sharedLoading: boolean;
  sharedLoadingMore: boolean;
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
  toggleWorkspaceWideMode: () => void;
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
    bg3dOpen,
    canvasOnlyMode,
    collaborationDocumentLocked,
    collaborationLockMessage,
    color,
    commentsOpen,
    continuityOpen,
    drawMode,
    frameAnimOpen,
    frameAnimTargetId,
    hi,
    history,
    historyPanelOpen,
    isFullscreen,
    masterEditMode,
    maximized,
    menu,
    menuRef,
    openStudioCommentCount,
    pageEditLocked,
    mannequinPoserOpen,
    pageReviewOpen,
    poserVrmOpen,
    presentationPanelsHidden,
    recentColors,
    referencePanelOpen,
    selected,
    setBg3dOpen,
    setColor,
    setCommentsOpen,
    setContinuityOpen,
    setHistoryPanelOpen,
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
    setZoom,
    sharedDocument,
    teamPanelOpen,
    timelineOpen,
    tool,
    uiDensityMode,
    visibleLeftPanelOpen,
    visibleRightPanelOpen,
    toggleWorkspaceWideMode,
    zoom,
    stableHandlers,
  } = props;
  const isWorkspaceWideMode = !visibleLeftPanelOpen && !visibleRightPanelOpen;
  const {
    activatePrimaryCanvasTool,
    addDiagonalSplit,
    addFrame,
    addText,
    ensureRecentColorsLoaded,
    enterCanvasOnlyMode,
    fitCanvasToWidth,
    onPickImage,
    redo,
    rememberColor,
    resetView,
    setActualPixelView,
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
            <StudioToolBeltHintTarget
              hint={TOOL_BELT_HINTS.undo}
              disabled={hi === 0 || collaborationDocumentLocked}
              unavailableReason={
                collaborationDocumentLocked
                  ? collaborationLockMessage()
                  : hi === 0
                    ? "되돌릴 이전 작업이 없습니다."
                    : undefined
              }
            >
              <button
                type="button"
                onClick={undo}
                disabled={hi === 0 || collaborationDocumentLocked}
                className={cn(toolBtn(false), iconToolBtnTouch, "h-8 px-1.5 disabled:opacity-40")}
                aria-label="실행취소"
              >
                <Undo2 size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget
              hint={TOOL_BELT_HINTS.redo}
              disabled={hi >= history.length - 1 || collaborationDocumentLocked}
              unavailableReason={
                collaborationDocumentLocked
                  ? collaborationLockMessage()
                  : hi >= history.length - 1
                    ? "다시 적용할 작업이 없습니다."
                    : undefined
              }
            >
              <button
                type="button"
                onClick={redo}
                disabled={hi >= history.length - 1 || collaborationDocumentLocked}
                className={cn(toolBtn(false), iconToolBtnTouch, "h-8 px-1.5 disabled:opacity-40")}
                aria-label="다시실행"
              >
                <Redo2 size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
              </button>
            </StudioToolBeltHintTarget>
            <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.history}>
              <button
                type="button"
                onClick={() => setHistoryPanelOpen((v) => !v)}
                aria-pressed={historyPanelOpen}
                className={cn(toolBtn(historyPanelOpen), iconToolBtnTouch, "h-8 px-1.5")}
                aria-label="작업 내역"
              >
                <HistoryIcon size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
              </button>
            </StudioToolBeltHintTarget>
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
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.assets}>
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
              <Folder size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 템플릿·에셋
              <ChevronDown size={STUDIO_ICON_SIZE.subtab} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "assetGroup" && "rotate-180")} />
            </button>
          </StudioToolBeltHintTarget>
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
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.panelAdd}>
          <button type="button" onClick={addFrame} className={toolBtn(false)}>
            <Plus size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 패널
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.panelSplit}>
          <button type="button" onClick={addDiagonalSplit} className={toolBtn(false)}>
            <SquareSplitHorizontal size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 사선 컷
          </button>
        </StudioToolBeltHintTarget>
        {selected?.type === "frame" && (
          <StudioToolBeltHintTarget
            hint={selected.points ? TOOL_BELT_HINTS.panelStraighten : TOOL_BELT_HINTS.panelDiagonalize}
          >
            <button
              type="button"
              onClick={toggleSelectedFrameDiagonal}
              className={toolBtn(Boolean(selected.points))}
            >
              <SquareSplitHorizontal size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className="opacity-90" />
              {selected.points ? "직선화" : "사선화"}
            </button>
          </StudioToolBeltHintTarget>
        )}
        </StudioToolbarCluster>
        </>
        ) : null}

        {/* 모바일 가로 벨트: 데스크톱은 좌측 세로 레일로 이동 (lg:hidden). */}
        {studioUiDensityAllows(uiDensityMode, "toolbar-draw") ? (
        <>
        <StudioToolbarDivider label="도구" className="lg:hidden" />
        <StudioToolbarCluster label="그리기 도구" className="lg:hidden">
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.select}>
          <button
            type="button"
            onClick={() => {
              activatePrimaryCanvasTool("select");
              setMenu(null);
            }}
            className={toolBtn(tool === "select")}
            aria-pressed={tool === "select"}
          >
            <MousePointer2 size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 선택
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget
          hint={TOOL_BELT_HINTS.pen}
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
            <Pencil size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 펜
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget
          hint={TOOL_BELT_HINTS.eraser}
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
            <Eraser size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 지우개
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget
          hint={TOOL_BELT_HINTS.fill}
          unavailableReason={advancedFillUnsupportedReason
            ? `${advancedFillUnsupportedReason} 채우기를 누르면 안전한 단일 래스터 후보를 찾거나 필요한 조건을 안내합니다.`
            : undefined}
        >
          <button
            type="button"
            onClick={toggleAdvancedFill}
            className={toolBtn(advancedFillActive)}
            aria-pressed={advancedFillActive}
          >
            <PaintBucket size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 채우기
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget
          hint={TOOL_BELT_HINTS.frameAnimation}
          disabled={selected?.type !== "image"}
          unavailableReason={selected?.type !== "image" ? "애니메이션으로 만들 이미지를 먼저 선택하세요." : undefined}
        >
          <button
            type="button"
            onClick={openFrameAnimationForSelected}
            disabled={selected?.type !== "image"}
            className={cn(toolBtn(frameAnimOpen && frameAnimTargetId === selected?.id), "disabled:opacity-40")}
          >
            <Film size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 프레임
          </button>
        </StudioToolBeltHintTarget>
        </StudioToolbarCluster>
        </>
        ) : null}

        {studioUiDensityAllows(uiDensityMode, "toolbar-reference") ? (
        <>
        <StudioToolbarDivider label="참조" />
        <StudioToolbarCluster label="참조·3D">
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.character3d}>
          <button
            type="button"
            onClick={() => setPoserVrmOpen(true)}
            className={cn(toolBtn(poserVrmOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
          >
            <UsersRound size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 3D 캐릭터
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.mannequin3d}>
          <button
            type="button"
            onClick={() => setMannequinPoserOpen(true)}
            className={cn(toolBtn(mannequinPoserOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
          >
            <PersonStanding size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 3D 데생 인형
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.bg3d}>
          <button
            type="button"
            onClick={() => setBg3dOpen(true)}
            className={cn(toolBtn(bg3dOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
          >
            <Boxes size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 3D 배경
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.reference}>
          <button
            type="button"
            onClick={() => setReferencePanelOpen((v) => !v)}
            onMouseEnter={preloadStudioReferencePanel}
            onFocus={preloadStudioReferencePanel}
            className={cn(toolBtn(referencePanelOpen), "border-accent/25 bg-accent-soft/25 text-accent hover:bg-accent-soft/40")}
            aria-pressed={referencePanelOpen}
          >
            <PictureInPicture2 size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 참고
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
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.background}>
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
              <Mountain size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 배경
              <ChevronDown size={STUDIO_ICON_SIZE.subtab} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "bgGroup" && "rotate-180")} />
            </button>
          </StudioToolBeltHintTarget>
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
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.style}>
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
              <Palette size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 스타일
              <ChevronDown size={STUDIO_ICON_SIZE.subtab} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "styleGroup" && "rotate-180")} />
            </button>
          </StudioToolBeltHintTarget>
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
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.ai}>
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
              <WandSparkles size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> AI
              <ChevronDown size={STUDIO_ICON_SIZE.subtab} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className={cn("transition-transform duration-150", activeToolbarGroup === "aiGroup" && "rotate-180")} />
            </button>
          </StudioToolBeltHintTarget>
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
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.text}>
          <button
            type="button"
            onClick={() => addText()}
            draggable
            onDragStart={(event) => {
              writeStudioInsertDragPayload(event.dataTransfer, { kind: "text" });
            }}
            className={toolBtn(false)}
          >
            <TypeIcon size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 텍스트
          </button>
        </StudioToolBeltHintTarget>
        <div ref={menu === "bubble" ? menuRef : undefined} className="relative">
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.bubble}>
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
              <MessageCircle size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 말풍선
            </button>
          </StudioToolBeltHintTarget>
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
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.image}>
          <label
            className={cn(
              toolBtn(false),
              "cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
            )}
          >
            <ImagePlus size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 이미지
            <input
              type="file"
              accept={STUDIO_CANVAS_IMAGE_ACCEPT}
              className="sr-only"
              onChange={onPickImage}
            />
          </label>
        </StudioToolBeltHintTarget>
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-2 text-xs text-fg-2 pointer-coarse:h-11">
          <Palette size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden className="text-fg-3" />
          <span className="sr-only sm:not-sr-only sm:inline">색</span>
          <LazyStudioColorPopover
            value={color}
            onChange={setColor}
            recentColors={recentColors}
            onUseColor={rememberColor}
            onLoadRecentColors={ensureRecentColorsLoaded}
            label="브러시·도형 색상"
            purpose="brush-shape"
          />
        </span>
        </StudioToolbarCluster>
        </>
        ) : null}
        {/* 펜 옵션은 캔버스 하단 StudioDrawOptionsBar 한 곳에서만 제공합니다. */}
        <span className="mx-0.5 h-5 w-px bg-line" />
        <StudioToolBeltHintTarget
          hint={TOOL_BELT_HINTS.timelapse}
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
            <Video size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.storyboard}>
          <button
            type="button"
            onClick={() => setStoryboardGridOpen(true)}
            aria-label="스토리보드 그리드 보기"
            className={cn(toolBtn(false), iconToolBtnTouch)}
          >
            <LayoutGrid size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget
          hint={
            pageEditLocked
              ? { ...TOOL_BELT_HINTS.review, tip: "현재 페이지가 검토 잠금 상태예요." }
              : TOOL_BELT_HINTS.review
          }
        >
          <button
            type="button"
            onClick={() => setPageReviewOpen(true)}
            aria-pressed={pageReviewOpen}
            aria-label={pageEditLocked ? "페이지 검토, 현재 편집 잠금" : "페이지 검토와 편집 잠금"}
            className={cn(toolBtn(pageReviewOpen || pageEditLocked), iconToolBtnTouch)}
          >
            <ClipboardCheck size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
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
            className={cn(toolBtn(commentsOpen), iconToolBtnTouch, "relative disabled:cursor-not-allowed disabled:opacity-50")}
          >
            <MessageCircle size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
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
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.team}>
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
            <UsersRound size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} className="shrink-0 text-accent" aria-hidden />
            <span className="hidden sm:inline font-semibold text-[0.7rem] text-accent">팀 & 실시간 공유</span>
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.continuity}>
          <button
            type="button"
            onClick={() => setContinuityOpen(true)}
            aria-pressed={continuityOpen}
            aria-label="이야기 연속성 검사"
            className={cn(toolBtn(continuityOpen), iconToolBtnTouch)}
          >
            <CheckCircle2 size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.scrollPreview}>
          <button
            type="button"
            onClick={() => setScrollPreviewOpen(true)}
            aria-label="세로 스크롤 미리보기"
            className={cn(toolBtn(false), iconToolBtnTouch)}
          >
            <Smartphone size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
          </button>
        </StudioToolBeltHintTarget>
        <StudioToolBeltHintTarget
          hint={TOOL_BELT_HINTS.timeline}
          disabled={masterEditMode}
          unavailableReason={masterEditMode ? "마스터 편집 중에는 타임라인을 열 수 없습니다." : undefined}
        >
          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            disabled={masterEditMode}
            aria-pressed={timelineOpen}
            aria-label="다중 레이어 타임라인"
            className={cn(toolBtn(timelineOpen), iconToolBtnTouch, "disabled:opacity-40")}
          >
            <GanttChartSquare size={STUDIO_ICON_SIZE.toolCompact} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
          </button>
        </StudioToolBeltHintTarget>
        <span className="mx-0.5 hidden h-5 w-px bg-line lg:block" />
        {/* 줌·화면 맞춤·캔버스 최대화 — 모바일은 하단 도구막대가 대체 */}
        <StudioToolbarCluster label="화면·캔버스" className="ml-auto hidden lg:flex">
          <StudioToolBeltHintTarget
            hint={TOOL_BELT_HINTS.zoomOut}
            disabled={zoom <= STUDIO_VIEW_ZOOM_MIN}
            unavailableReason={zoom <= STUDIO_VIEW_ZOOM_MIN ? "최소 축소 배율에 도달했습니다." : undefined}
          >
            <button
              type="button"
              onClick={() => setZoom((current) => stepStudioViewZoom(current, -1))}
              disabled={zoom <= STUDIO_VIEW_ZOOM_MIN}
              className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
              aria-label="축소"
            >
              <Minus size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
            </button>
          </StudioToolBeltHintTarget>
          <span className="w-9 text-center text-[0.62rem] font-bold tabular-nums text-fg-3">
            {Math.round(zoom * 100)}%
          </span>
          <StudioToolBeltHintTarget
            hint={TOOL_BELT_HINTS.zoomIn}
            disabled={zoom >= STUDIO_VIEW_ZOOM_MAX}
            unavailableReason={zoom >= STUDIO_VIEW_ZOOM_MAX ? "최대 확대 배율에 도달했습니다." : undefined}
          >
            <button
              type="button"
              onClick={() => setZoom((current) => stepStudioViewZoom(current, 1))}
              disabled={zoom >= STUDIO_VIEW_ZOOM_MAX}
              className={cn(toolBtn(false), "h-8 px-1.5 disabled:opacity-40")}
              aria-label="확대"
            >
              <Plus size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
            </button>
          </StudioToolBeltHintTarget>
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.actualSize}>
            <button
              type="button"
              onClick={setActualPixelView}
              className={cn(toolBtn(false), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            >
              100%
            </button>
          </StudioToolBeltHintTarget>
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.fitWidth}>
            <button
              type="button"
              onClick={fitCanvasToWidth}
              className={cn(toolBtn(false), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            >
              맞춤
            </button>
          </StudioToolBeltHintTarget>
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.resetView}>
            <button
              type="button"
              onClick={resetView}
              className={cn(toolBtn(false), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            >
              리셋
            </button>
          </StudioToolBeltHintTarget>
          <StudioToolbarDivider />
          <StudioToolBeltHintTarget
            hint={
              isWorkspaceWideMode
                ? TOOL_BELT_HINTS.workspaceRestore
                : TOOL_BELT_HINTS.workspaceFocus
            }
            disabled={presentationPanelsHidden}
            unavailableReason={
              presentationPanelsHidden
                ? "전체화면·브라우저 맞춤에서는 작업 패널을 임시로 숨깁니다."
                : undefined
            }
          >
            <button
              type="button"
              onClick={toggleWorkspaceWideMode}
              disabled={presentationPanelsHidden}
              aria-pressed={isWorkspaceWideMode}
              className={cn(
                toolBtn(isWorkspaceWideMode),
                "h-8 gap-1 px-1.5 text-[0.62rem] font-semibold disabled:cursor-not-allowed disabled:opacity-45"
              )}
            >
              <Maximize2 size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
              <span>{isWorkspaceWideMode ? "패널 펼치기" : "패널 접어 넓게"}</span>
            </button>
          </StudioToolBeltHintTarget>
          <StudioToolBeltHintTarget
            hint={maximized ? TOOL_BELT_HINTS.restoreWindow : TOOL_BELT_HINTS.maximizeWindow}
          >
            <button
              type="button"
              onClick={toggleMaximize}
              aria-pressed={maximized}
              className={cn(toolBtn(maximized), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            >
              {maximized ? "복원" : "맞춤창"}
            </button>
          </StudioToolBeltHintTarget>
          <StudioToolBeltHintTarget
            hint={isFullscreen ? TOOL_BELT_HINTS.exitFullscreen : TOOL_BELT_HINTS.fullscreen}
          >
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-pressed={isFullscreen}
              className={cn(toolBtn(isFullscreen), "h-8 px-1.5 text-[0.62rem] font-semibold")}
            >
              {isFullscreen ? "창" : "전체"}
            </button>
          </StudioToolBeltHintTarget>
          <StudioToolBeltHintTarget hint={TOOL_BELT_HINTS.canvasOnly}>
            <button
              type="button"
              onClick={enterCanvasOnlyMode}
              aria-pressed={canvasOnlyMode}
              className={cn(toolBtn(canvasOnlyMode), "h-8 gap-1 px-1.5 text-[0.62rem] font-semibold")}
            >
              <Minimize2 size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden /> 캔버스
            </button>
          </StudioToolBeltHintTarget>
        </StudioToolbarCluster>
    </>
  );
});
