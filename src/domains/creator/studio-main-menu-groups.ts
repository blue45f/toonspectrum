import {
  ArrowDownToLine,
  ArrowUpToLine,
  Bookmark,
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  ClipboardCheck,
  ClipboardPaste,
  Command,
  Contrast,
  Copy,
  Crop,
  Download,
  Droplet,
  Droplets,
  Eraser,
  Focus,
  FileUp,
  Files,
  FlipHorizontal2,
  Folder,
  GanttChartSquare,
  Grid2x2,
  Grid3x3,
  History as HistoryIcon,
  ImagePlus,
  Images,
  Lasso,
  Layers,
  LayoutGrid,
  LayoutTemplate,
  Maximize2,
  MessageCircle,
  Minimize2,
  Minus,
  Mountain,
  Package,
  PaintBucket,
  Paintbrush,
  Palette,
  Pencil,
  PersonStanding,
  PictureInPicture2,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Ruler,
  ScanLine,
  Scissors,
  Settings2,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Square,
  Sun,
  Trash2,
  Triangle,
  Tv,
  Type as TypeIcon,
  Undo2,
  Upload,
  WandSparkles,
  Wind,
  X,
  Zap,
} from "lucide-react";

import { STUDIO_EDIT_MENU_COMMANDS } from "./studio-edit-controls";

import type { CvdMode } from "./studio-color-vision-model";
import type { DrawMode, StudioMenu } from "./studio-editor-tool-model";
import type {
  StudioFilterDraft,
  StudioFilterKind,
} from "./studio-filter-menu";
import type { StudioMainMenuGroup } from "./studio-main-menu-model";
import type { StudioUiDensityMode } from "./studio-ui-density";
import type { StudioViewRotation } from "./studio-view-controls";

type StudioSaveMode = "draft" | "published";
type StudioPastePlacement = "cascade" | "in-place";
type StudioLayerReorder = "front" | "forward" | "back" | "backward";
type StudioCanvasRotationDirection = "left" | "right";
type StudioAppSettingsTab = "general" | "other";

export interface StudioMainMenuEditAvailability {
  undoDisabled: boolean;
  redoDisabled: boolean;
  cutDisabled: boolean;
  copyDisabled: boolean;
  pasteDisabled: boolean;
  selectAllDisabled: boolean;
  deselectDisabled: boolean;
  invertSelectionDisabled: boolean;
  clearSelectionDisabled: boolean;
  duplicateDisabled: boolean;
  reorderDisabled: boolean;
  cropLayerDisabled: boolean;
}

export interface StudioMainMenuBuilderState {
  sharedNonOwnerSave: boolean;
  saving: boolean;
  collaborationDocumentLocked: boolean;
  hasWorkId: boolean;
  projectArchiveBusy: boolean;
  interchangeImportBusy: boolean;
  psdImportBusy: boolean;
  edit: StudioMainMenuEditAvailability;
  filterDisabled: boolean;
  filterUnavailableReason: string | null;
  viewTransformSuppressed: boolean;
  canvasFlipH: boolean;
  canvasRotation: StudioViewRotation;
  fullscreen: boolean;
  canvasRulersVisible: boolean;
  colorVisionMode: CvdMode;
  referencePanelOpen: boolean;
  pageSequenceOpen: boolean;
  hasSavedView: boolean;
  perspectiveRulerActive: boolean;
  hasLocallyHiddenLayers: boolean;
  quickAccessPaletteOpen: boolean;
  quickAccessPaletteLoading: boolean;
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  lastFilterDraft: StudioFilterDraft | null;
}

export interface StudioMainMenuEditorActions {
  copyImageToClipboard: () => unknown;
  save: (mode: StudioSaveMode) => unknown;
  exportProject: () => unknown;
  exportProjectArchive: () => unknown;
  undo: () => unknown;
  redo: () => unknown;
  cutSelectedElements: () => unknown;
  copySelectedElements: () => unknown;
  pasteElements: (placement: StudioPastePlacement) => unknown;
  openImagePastePicker: () => unknown;
  selectAll: () => unknown;
  deselect: () => unknown;
  invertSelection: () => unknown;
  clearSelection: () => unknown;
  duplicateSelected: () => unknown;
  reorder: (placement: StudioLayerReorder) => unknown;
  openSelectedLayerCrop: () => unknown;
  addText: () => unknown;
  addPage: () => unknown;
  toggleHorizontalCanvasView: () => unknown;
  rotateCanvasView: (direction: StudioCanvasRotationDirection) => unknown;
  resetCanvasViewRotation: () => unknown;
  fitCanvasToWidth: () => unknown;
  setActualPixelView: () => unknown;
  toggleFullscreen: () => unknown;
  toggleCanvasRulers: () => unknown;
  setColorVisionMode: (mode: CvdMode) => unknown;
  saveCurrentStudioView: () => unknown;
  restoreSavedStudioView: () => unknown;
  togglePerspectiveGuideView: () => unknown;
  showAllLocallyHiddenLayers: () => unknown;
  setStudioUiDensity: (mode: StudioUiDensityMode) => unknown;
  enterCanvasOnlyMode: () => unknown;
  openFeatureTutorial: () => unknown;
  openStudioFilter: (
    kind: StudioFilterKind,
    draft?: StudioFilterDraft,
  ) => unknown;
  toggleAdvancedFill: () => unknown;
}

export interface StudioMainMenuUiActions {
  openExportDownload: () => unknown;
  requestProjectImport: () => unknown;
  requestInterchangeImport: () => unknown;
  requestPsdImport: () => unknown;
  openProjectTools: () => unknown;
  toggleHistoryPanel: () => unknown;
  openAppSettings: (tab?: StudioAppSettingsTab) => unknown;
  openStudioMenu: (menu: StudioMenu) => unknown;
  openAssetMenu: () => unknown;
  requestImageInsert: () => unknown;
  openMannequinPoser: () => unknown;
  openVrmPoser: () => unknown;
  openBackground3d: () => unknown;
  openReferencePanel: () => unknown;
  stepZoom: (direction: -1 | 1) => unknown;
  toggleReferencePanel: () => unknown;
  togglePageSequence: () => unknown;
  openProductionInsights: () => unknown;
  collapseSidePanels: () => unknown;
  openToolsCompanion: () => unknown;
  toggleQuickAccessPalette: () => unknown;
  toggleLeftPanel: () => unknown;
  toggleRightPanel: () => unknown;
  openShortcuts: () => unknown;
  selectDrawMode: (mode: Extract<DrawMode, "pen" | "eraser">) => unknown;
  enableSmartShape: () => unknown;
}

export interface BuildStudioMainMenuGroupsInput {
  state: StudioMainMenuBuilderState;
  editor: StudioMainMenuEditorActions;
  ui: StudioMainMenuUiActions;
}

/**
 * Builds the product menu catalogue from render-safe state and injected commands.
 * Browser/React state mutations stay at the editor-page composition boundary.
 */
export function buildStudioMainMenuGroups({
  state,
  editor,
  ui,
}: BuildStudioMainMenuGroupsInput): StudioMainMenuGroup[] {
  const filterUnavailableReason = state.filterDisabled
    ? state.filterUnavailableReason ?? "현재 편집 상태에서는 필터를 적용할 수 없습니다."
    : undefined;
  return [
    {
      id: "file",
      label: "파일",
      items: [
        {
          id: "export",
          label: "내보내기 / 다운로드",
          icon: Download,
          onSelect: () => {
            ui.openExportDownload();
          },
        },
        {
          id: "copy-image",
          label: "이미지를 클립보드로",
          icon: Copy,
          onSelect: () => {
            void editor.copyImageToClipboard();
          },
          separatorAfter: true,
        },
        {
          id: "save-draft",
          label: state.sharedNonOwnerSave ? "공동 저장" : "임시저장",
          icon: Bookmark,
          shortcut: "⌘S",
          disabled: state.saving || state.collaborationDocumentLocked,
          onSelect: () => {
            void editor.save("draft");
          },
        },
        {
          id: "publish",
          label: state.hasWorkId ? "수정 게시" : "게시",
          icon: Upload,
          disabled:
            state.saving ||
            state.collaborationDocumentLocked ||
            state.sharedNonOwnerSave,
          separatorAfter: true,
          onSelect: () => {
            void editor.save("published");
          },
        },
        {
          id: "export-json",
          label: "백업 (.json)",
          icon: Download,
          onSelect: () => {
            editor.exportProject();
          },
        },
        {
          id: "export-archive",
          label: "아카이브 백업",
          icon: Package,
          disabled: state.projectArchiveBusy,
          onSelect: () => {
            void editor.exportProjectArchive();
          },
        },
        {
          id: "import-json",
          label: "프로젝트 가져오기…",
          icon: FileUp,
          disabled: state.collaborationDocumentLocked,
          onSelect: () => {
            ui.requestProjectImport();
          },
        },
        {
          id: "import-psd",
          label: "PSD 가져오기…",
          icon: FileUp,
          disabled: state.psdImportBusy || state.collaborationDocumentLocked,
          onSelect: () => {
            ui.requestPsdImport();
          },
        },
        {
          id: "import-ora-cbz",
          label: "ORA / CBZ 가져오기…",
          icon: Package,
          disabled: state.interchangeImportBusy || state.collaborationDocumentLocked,
          separatorAfter: true,
          onSelect: () => {
            ui.requestInterchangeImport();
          },
        },
        {
          id: "project",
          label: "프로젝트 도구…",
          icon: Folder,
          onSelect: () => {
            ui.openProjectTools();
          },
        },
      ],
    },
    {
      id: "edit",
      label: "편집",
      items: [
        {
          ...STUDIO_EDIT_MENU_COMMANDS.undo,
          icon: Undo2,
          disabled: state.edit.undoDisabled,
          onSelect: () => {
            editor.undo();
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS.redo,
          icon: Redo2,
          disabled: state.edit.redoDisabled,
          onSelect: () => {
            editor.redo();
          },
          separatorAfter: true,
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS.cut,
          icon: Scissors,
          disabled: state.edit.cutDisabled,
          onSelect: () => {
            editor.cutSelectedElements();
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS.copy,
          icon: Copy,
          disabled: state.edit.copyDisabled,
          onSelect: () => {
            editor.copySelectedElements();
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS.paste,
          icon: ClipboardPaste,
          disabled: state.edit.pasteDisabled,
          onSelect: () => {
            void editor.pasteElements("cascade");
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["paste-in-place"],
          icon: ClipboardCheck,
          disabled: state.edit.pasteDisabled,
          onSelect: () => {
            void editor.pasteElements("in-place");
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["paste-file"],
          icon: ImagePlus,
          disabled: state.edit.pasteDisabled,
          onSelect: () => {
            editor.openImagePastePicker();
          },
          separatorAfter: true,
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["select-all"],
          icon: LayoutGrid,
          disabled: state.edit.selectAllDisabled,
          onSelect: () => {
            editor.selectAll();
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS.deselect,
          icon: X,
          disabled: state.edit.deselectDisabled,
          onSelect: () => {
            editor.deselect();
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["invert-selection"],
          icon: Lasso,
          disabled: state.edit.invertSelectionDisabled,
          onSelect: () => {
            editor.invertSelection();
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["clear-selection"],
          icon: Trash2,
          danger: true,
          disabled: state.edit.clearSelectionDisabled,
          onSelect: () => {
            editor.clearSelection();
          },
          separatorAfter: true,
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS.duplicate,
          icon: Files,
          disabled: state.edit.duplicateDisabled,
          onSelect: () => {
            editor.duplicateSelected();
          },
          separatorAfter: true,
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["bring-front"],
          icon: ArrowUpToLine,
          disabled: state.edit.reorderDisabled,
          onSelect: () => {
            editor.reorder("front");
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["bring-forward"],
          icon: ChevronUp,
          disabled: state.edit.reorderDisabled,
          onSelect: () => {
            editor.reorder("forward");
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["send-back"],
          icon: ArrowDownToLine,
          disabled: state.edit.reorderDisabled,
          onSelect: () => {
            editor.reorder("back");
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["send-backward"],
          icon: ChevronDown,
          disabled: state.edit.reorderDisabled,
          onSelect: () => {
            editor.reorder("backward");
          },
          separatorAfter: true,
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["crop-layer"],
          icon: Crop,
          disabled: state.edit.cropLayerDisabled,
          onSelect: () => {
            editor.openSelectedLayerCrop();
          },
          separatorAfter: true,
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS.history,
          icon: HistoryIcon,
          onSelect: () => {
            ui.toggleHistoryPanel();
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["pen-pressure"],
          icon: SlidersHorizontal,
          onSelect: () => {
            ui.openAppSettings("other");
          },
        },
        {
          ...STUDIO_EDIT_MENU_COMMANDS["app-settings"],
          icon: Settings2,
          onSelect: () => {
            ui.openAppSettings("general");
          },
        },
      ],
    },
    {
      id: "insert",
      label: "삽입",
      items: [
        {
          id: "template",
          label: "템플릿 · 에셋",
          icon: LayoutTemplate,
          onSelect: () => {
            ui.openAssetMenu();
          },
        },
        {
          id: "collage",
          label: "콜라주",
          icon: Grid2x2,
          onSelect: () => {
            ui.openStudioMenu("collage");
          },
        },
        {
          id: "elements",
          label: "요소 · 도형",
          icon: Shapes,
          onSelect: () => {
            ui.openStudioMenu("elements");
          },
        },
        {
          id: "bubble",
          label: "말풍선",
          icon: MessageCircle,
          onSelect: () => {
            ui.openStudioMenu("bubble");
          },
        },
        {
          id: "text",
          label: "텍스트",
          icon: TypeIcon,
          onSelect: () => {
            editor.addText();
          },
        },
        {
          id: "image",
          label: "이미지…",
          icon: ImagePlus,
          separatorAfter: true,
          onSelect: () => {
            ui.requestImageInsert();
          },
        },
        {
          id: "mannequin3d",
          label: "3D 데생 인형",
          icon: PersonStanding,
          onSelect: () => {
            ui.openMannequinPoser();
          },
        },
        {
          id: "char",
          label: "3D 캐릭터",
          icon: Sparkles,
          onSelect: () => {
            ui.openVrmPoser();
          },
        },
        {
          id: "bg3d",
          label: "3D 배경",
          icon: Boxes,
          onSelect: () => {
            ui.openBackground3d();
          },
        },
        {
          id: "ref",
          label: "참고 이미지",
          icon: PictureInPicture2,
          onSelect: () => {
            ui.openReferencePanel();
          },
        },
        {
          id: "page",
          label: "새 페이지",
          icon: Plus,
          disabled: state.collaborationDocumentLocked,
          onSelect: () => {
            editor.addPage();
          },
        },
      ],
    },
    {
      id: "view",
      label: "보기",
      items: [
        {
          id: "zoom-in",
          label: "확대",
          icon: Plus,
          shortcut: "=",
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            ui.stepZoom(1);
          },
        },
        {
          id: "zoom-out",
          label: "축소",
          icon: Minus,
          shortcut: "-",
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            ui.stepZoom(-1);
          },
        },
        {
          id: "flip-horizontal",
          label: "수평 반전",
          icon: FlipHorizontal2,
          shortcut: "H",
          checked: state.canvasFlipH,
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.toggleHorizontalCanvasView();
          },
        },
        {
          id: "rotate-left",
          label: "왼쪽으로 90° 회전",
          icon: RotateCcw,
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.rotateCanvasView("left");
          },
        },
        {
          id: "rotate-right",
          label: "오른쪽으로 90° 회전",
          icon: RotateCw,
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.rotateCanvasView("right");
          },
        },
        {
          id: "reset-rotation",
          label: `보기 회전 초기화 (${state.canvasRotation}°)`,
          icon: HistoryIcon,
          disabled: state.viewTransformSuppressed || state.canvasRotation === 0,
          separatorAfter: true,
          onSelect: () => {
            editor.resetCanvasViewRotation();
          },
        },
        {
          id: "fit",
          label: "화면에 맞게 조정",
          icon: ScanLine,
          shortcut: "Home",
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.fitCanvasToWidth();
          },
        },
        {
          id: "actual-pixels",
          label: "실제 픽셀 (100%)",
          icon: Maximize2,
          shortcut: "End",
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.setActualPixelView();
          },
          separatorAfter: true,
        },
        {
          id: "canvas-rulers",
          label: "캔버스 px 눈금자",
          icon: Ruler,
          shortcut: "⌥⌘R",
          checked: state.canvasRulersVisible,
          onSelect: () => {
            editor.toggleCanvasRulers();
          },
        },
        {
          id: "fullscreen",
          label: "전체화면",
          icon: state.fullscreen ? Minimize2 : Maximize2,
          shortcut: "F11",
          checked: state.fullscreen,
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.toggleFullscreen();
          },
        },
        ...(
          [
            { id: "original", label: "색각 검수 · 원본", mode: "none" as const },
            { id: "grayscale", label: "색각 검수 · 흑백 명암", mode: "grayscale" as const, shortcut: "Q" },
            { id: "protanopia", label: "색각 검수 · 1형 적록", mode: "protanopia" as const },
            { id: "deuteranopia", label: "색각 검수 · 2형 적록", mode: "deuteranopia" as const },
            { id: "tritanopia", label: "색각 검수 · 3형 청황", mode: "tritanopia" as const },
          ] as const
        ).map(({ id, label, mode, ...shortcut }) => ({
          id: `color-vision-${id}`,
          label,
          icon: Palette,
          hintKey: `color-vision:${mode}` as const,
          ...shortcut,
          checked: state.colorVisionMode === mode,
          selectionRole: "radio" as const,
          disabled: state.viewTransformSuppressed,
          unavailableReason: state.viewTransformSuppressed
            ? "보기 변환이 잠긴 동안에는 색각 검수 모드를 바꿀 수 없습니다."
            : undefined,
          separatorAfter: mode === "tritanopia",
          onSelect: () => {
            editor.setColorVisionMode(mode);
          },
        })),
        {
          id: "reference-window",
          label: "참고 이미지 창 열기",
          icon: PictureInPicture2,
          checked: state.referencePanelOpen,
          onSelect: () => {
            ui.toggleReferencePanel();
          },
          separatorAfter: true,
        },
        {
          id: "page-sequence",
          label: state.pageSequenceOpen ? "페이지 시퀀스 닫기" : "페이지 시퀀스 열기",
          icon: Clapperboard,
          checked: state.pageSequenceOpen,
          onSelect: () => {
            ui.togglePageSequence();
          },
          separatorAfter: true,
        },
        {
          id: "save-current-view",
          label: "현재 보기 저장",
          icon: Bookmark,
          shortcut: "⇧S",
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.saveCurrentStudioView();
          },
        },
        {
          id: "restore-view",
          label: "보기 복원",
          icon: HistoryIcon,
          shortcut: "⇧Z",
          disabled: state.viewTransformSuppressed || !state.hasSavedView,
          onSelect: () => {
            editor.restoreSavedStudioView();
          },
          separatorAfter: true,
        },
        {
          id: "perspective-guide",
          label: "원근 도우미 보기",
          icon: Triangle,
          shortcut: "⇧G",
          checked: state.perspectiveRulerActive,
          disabled: state.viewTransformSuppressed,
          onSelect: () => {
            editor.togglePerspectiveGuideView();
          },
        },
        {
          id: "reset-local-visibility",
          label: "나만 숨긴 레이어 모두 표시",
          icon: Layers,
          disabled: !state.hasLocallyHiddenLayers,
          onSelect: () => {
            editor.showAllLocallyHiddenLayers();
          },
        },
        {
          id: "production-insights",
          label: "제작 인사이트…",
          icon: GanttChartSquare,
          onSelect: () => {
            ui.openProductionInsights();
          },
          separatorAfter: true,
        },
        {
          id: "density-focus",
          label: "슈퍼심플 레이아웃",
          icon: Minimize2,
          onSelect: () => {
            editor.setStudioUiDensity("focus");
            ui.collapseSidePanels();
          },
        },
        {
          id: "density-full",
          label: "전체 레이아웃",
          icon: LayoutGrid,
          onSelect: () => {
            editor.setStudioUiDensity("full");
          },
        },
        {
          id: "wide",
          label: "패널 접어 넓게",
          icon: Maximize2,
          onSelect: () => {
            ui.collapseSidePanels();
          },
        },
        {
          id: "tools-companion",
          label: "멀티 디스플레이 작업공간…",
          icon: PictureInPicture2,
          onSelect: () => {
            ui.openToolsCompanion();
          },
        },
        {
          id: "canvas-only",
          label: "캔버스만",
          icon: Square,
          shortcut: "`",
          onSelect: () => {
            editor.enterCanvasOnlyMode();
          },
          separatorAfter: true,
        },
        {
          id: "quick-access-palette",
          label: state.quickAccessPaletteLoading
            ? "빠른 액세스 불러오는 중…"
            : state.quickAccessPaletteOpen
              ? "빠른 액세스 팔레트 숨기기"
              : "빠른 액세스 팔레트 표시",
          icon: Command,
          shortcut: "⇧Q",
          checked: state.quickAccessPaletteOpen,
          disabled: state.quickAccessPaletteLoading,
          separatorAfter: true,
          onSelect: ui.toggleQuickAccessPalette,
        },
        {
          id: "left-panel",
          label: state.leftPanelOpen ? "왼쪽 패널 숨기기" : "왼쪽 패널 보이기",
          icon: Layers,
          onSelect: () => {
            ui.toggleLeftPanel();
          },
        },
        {
          id: "right-panel",
          label: state.rightPanelOpen ? "속성 패널 숨기기" : "속성 패널 보이기",
          icon: SlidersHorizontal,
          onSelect: () => {
            ui.toggleRightPanel();
          },
        },
        {
          id: "feature-tutorials",
          label: "기능 튜토리얼",
          icon: BookOpen,
          onSelect: () => {
            editor.openFeatureTutorial();
          },
        },
        {
          id: "shortcuts",
          label: "단축키 도움말",
          icon: Command,
          shortcut: "?",
          onSelect: () => {
            ui.openShortcuts();
          },
        },
        {
          id: "app-settings",
          label: "애플리케이션 설정",
          icon: Settings2,
          onSelect: () => {
            ui.openAppSettings();
          },
        },
      ],
    },
    {
      id: "filter",
      label: "필터",
      items: [
        {
          id: "last-filter",
          label: state.lastFilterDraft ? "마지막 필터 다시 열기" : "마지막 필터…",
          icon: HistoryIcon,
          disabled: !state.lastFilterDraft || state.filterDisabled,
          unavailableReason: state.filterDisabled
            ? filterUnavailableReason
            : !state.lastFilterDraft
              ? "아직 다시 열 수 있는 필터 설정이 없습니다."
              : undefined,
          separatorAfter: true,
          onSelect: () => {
            if (state.lastFilterDraft) {
              editor.openStudioFilter(
                state.lastFilterDraft.kind,
                state.lastFilterDraft,
              );
            }
          },
        },
        {
          id: "gaussian-blur",
          label: "가우시안 블러",
          icon: Droplets,
          shortcut: "⌘⇧1",
          disabled: state.filterDisabled,
          unavailableReason: filterUnavailableReason,
          onSelect: () => {
            editor.openStudioFilter("gaussian-blur");
          },
        },
        {
          id: "motion-blur",
          label: "모션 블러",
          icon: Wind,
          shortcut: "⌘⇧2",
          disabled: state.filterDisabled,
          unavailableReason: filterUnavailableReason,
          onSelect: () => {
            editor.openStudioFilter("motion-blur");
          },
        },
        {
          id: "hue-saturation-brightness",
          label: "색조 / 채도 / 밝기",
          icon: Palette,
          shortcut: "⌘⇧3",
          disabled: state.filterDisabled,
          unavailableReason: filterUnavailableReason,
          onSelect: () => {
            editor.openStudioFilter("hue-saturation-brightness");
          },
        },
        {
          id: "brightness-contrast",
          label: "명도 / 대비",
          icon: SlidersHorizontal,
          shortcut: "⌘⇧4",
          disabled: state.filterDisabled,
          unavailableReason: filterUnavailableReason,
          onSelect: () => {
            editor.openStudioFilter("brightness-contrast");
          },
        },
        {
          id: "color-curves",
          label: "색상 커브",
          icon: GanttChartSquare,
          shortcut: "⌘⇧5",
          disabled: state.filterDisabled,
          unavailableReason: filterUnavailableReason,
          separatorAfter: true,
          onSelect: () => {
            editor.openStudioFilter("color-curves");
          },
        },
        // 필터 팩 15종 — 라벨은 다이얼로그(STUDIO_FILTER_PACK_DEFS)와 동일 문구를 하드코딩한다.
        // (value import 시 필터 엔진 체인이 첫 청크에 딸려오므로 기존 5개 항목과 같은 방식.)
        ...([
          { id: "mosaic", label: "모자이크 / 픽셀화", icon: Grid3x3 },
          { id: "radial-blur", label: "방사형 블러", icon: RotateCw },
          { id: "zoom-blur", label: "줌 블러", icon: Maximize2 },
          { id: "chromatic-aberration", label: "색수차", icon: Copy },
          { id: "glitch", label: "글리치", icon: Zap },
          { id: "scanline", label: "스캔라인 (CRT)", icon: Tv },
          { id: "vignette", label: "비네트", icon: Focus, separatorAfter: true },
          { id: "lens-flare", label: "렌즈 플레어", icon: Sun },
          { id: "emboss", label: "엠보스", icon: Layers },
          { id: "solarize", label: "솔라라이즈", icon: Contrast },
          { id: "threshold", label: "한계값 (흑백 2값)", icon: SlidersHorizontal },
          { id: "oil-paint", label: "유화", icon: Paintbrush },
          { id: "surface-blur", label: "표면 블러", icon: Droplets },
          { id: "duotone", label: "세피아 / 듀오톤", icon: Palette, separatorAfter: true },
          { id: "noise-add", label: "노이즈 추가", icon: Droplet },
        ] as const).map(({ id, label, icon, ...rest }) => ({
          id,
          label,
          icon,
          ...("separatorAfter" in rest && rest.separatorAfter ? { separatorAfter: true } : {}),
          disabled: state.filterDisabled,
          unavailableReason: filterUnavailableReason,
          onSelect: () => {
            editor.openStudioFilter(id as StudioFilterKind);
          },
        })),
      ],
    },
    {
      id: "draw",
      label: "그리기",
      items: [
        {
          id: "pen",
          label: "펜",
          icon: Pencil,
          shortcut: "B",
          onSelect: () => {
            ui.selectDrawMode("pen");
          },
        },
        {
          id: "eraser",
          label: "지우개",
          icon: Eraser,
          shortcut: "E",
          onSelect: () => {
            ui.selectDrawMode("eraser");
          },
        },
        {
          id: "fill",
          label: "채우기",
          icon: PaintBucket,
          shortcut: "G",
          onSelect: () => {
            editor.toggleAdvancedFill();
          },
        },
        {
          id: "smart-shape",
          label: "스마트 도형",
          icon: Shapes,
          onSelect: () => {
            ui.enableSmartShape();
          },
          separatorAfter: true,
        },
        {
          id: "bg",
          label: "배경 · 톤",
          icon: Mountain,
          onSelect: () => {
            ui.openStudioMenu("bgFill");
          },
        },
        {
          id: "style",
          label: "팔레트 · 브랜드",
          icon: Palette,
          onSelect: () => {
            ui.openStudioMenu("palette");
          },
        },
      ],
    },
    {
      id: "ai",
      label: "AI",
      items: [
        {
          id: "ai-assist",
          label: "AI 어시스트",
          icon: WandSparkles,
          onSelect: () => {
            ui.openStudioMenu("aiAssist");
          },
        },
        {
          id: "stock",
          label: "스톡 이미지",
          icon: Images,
          onSelect: () => {
            ui.openStudioMenu("stockImage");
          },
        },
        {
          id: "integrations",
          label: "연동 설정",
          icon: Settings2,
          onSelect: () => {
            ui.openStudioMenu("integrations");
          },
        },
      ],
    },
  ];
}
