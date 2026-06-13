import { lazy, Suspense, useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Konva from "konva";

import { Stage, Layer, Rect, Text as KText, TextPath as KTextPath, Image as KImage, Line, Group, Star, Ellipse, Circle as KCircle, Path, Transformer, Shape } from "react-konva";
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Eraser,
  Eye,
  EyeOff,
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
  Download,
  Share2,
  Globe,
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
  Smile,
  Sparkles,
  Square,
  Star as StarIcon,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Search,
  Check,
  X,
} from "lucide-react";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  createWork,
  getWork,
  getCurrentUserId,
  updateWork,
  listSharedAssets,
  publishAsset,
  generateAsset,
  deleteSharedAsset,
  markSharedAssetUsed,
  type GeneratedAssetQuality,
  type GeneratedAssetSize,
  type SharedAsset,
} from "@/src/lib/creator-client";
import {
  BRUSH_PRESETS,
  gpenSegmentWidths,
  processFreehandPoints,
  processPencilPoints,
  screentoneDotRadius,
  screentoneDotsForStroke,
  smoothStrokePoints,
  stabilizePoint,
  STABILIZER_MAX,
} from "./studio-brush";
import { PANEL_LAYOUTS, type PanelLayoutPreset } from "./studio-panel-layouts";
import {
  BG_PRESETS,
  BUBBLE_VARIANTS,
  BUBBLE_STYLE_PRESETS,
  CANVAS_W,
  EFFECT_EMOJIS,
  SFX_PRESETS,
  TEMPLATES,
  filterAssetsByLabel,
  filterBgSceneSections,
  groupTemplates,
  type BgPreset,
  type BubbleVariant,
  type TemplateSpec,
  type FrameSpec,
} from "./studio-assets";
import { svgToDataUrl } from "./studio-characters";
import { StudioShortcutsHelp } from "./StudioShortcutsHelp";
import { createCanvasImageElement } from "./studio-image-placement";
import {
  EXPORT_SCALES,
  EXPORT_FORMATS,
  MAX_CANVAS_DIM,
  canvasToBlob,
  canCopyImageToClipboard,
  copyCanvasToClipboard,
  downloadBlob,
  exportFormatLabel,
  exportMimeType,
  exportQuality,
  maxFittingScale,
  pageExportFileName,
  splitPagesForExport,
  stripExportFileName,
  stripTotalHeight,
  type ExportFormat,
  type ExportScale,
} from "./studio-export";
import {
  saveAsset,
  listAssets,
  deleteAsset,
  renameAsset,
  type StudioAsset,
} from "./studio-asset-library";
import {
  registerStudioKonvaFilters,
  buildImageFilters,
  hasActiveImageFilters,
  imageFilterCacheKey,
} from "./studio-konva-filters";
import {
  isDefaultPageGrade,
  normalizePageGrade,
  pageGradeToCssFilter,
  vignetteCss,
  drawVignette,
  type PageGrade,
} from "./studio-filters";
import {
  readRecentColors,
  storeRecentColors,
  pushRecentColor,
} from "./studio-color-palettes";
import { StudioImageFilterPanel } from "./StudioImageFilterPanel";
import { StudioPageGradePanel } from "./StudioPageGradePanel";
import { StudioColorPopover } from "./StudioColorPopover";
import { TONE_DEFAULT_SIZE, toneDataUrl } from "./studio-tones";
import { GRADIENT_PRESETS, gradientToBgGrad } from "./studio-gradients";
import { StudioTonePanel } from "./StudioTonePanel";
import { StudioTextEffectPanel } from "./StudioTextEffectPanel";
import { normalizeLevels, type LevelsParams } from "./studio-levels";
import { StudioLevelsPanel } from "./StudioLevelsPanel";
import { type LayerStylePatch } from "./studio-layer-styles";
import { StudioLayerStylePanel } from "./StudioLayerStylePanel";
import { normalizeCurve, type CurvePoint } from "./studio-curves";
import { normalizeColorBalance, type ColorBalance } from "./studio-color-balance";
import { normalizeChannelMixer, type ChannelMixer } from "./studio-channel-mixer";
import { normalizeSelectiveHsl, type SelectiveHsl } from "./studio-selective-hsl";
import { normalizeVibrance, type Vibrance } from "./studio-vibrance";
import { normalizeGradientMap, type GradientMap } from "./studio-gradient-map";
import { normalizePhotoFilter, type PhotoFilter } from "./studio-photo-filter";
import { normalizeAutoAdjust, type AutoAdjust } from "./studio-auto-adjust";
import { normalizeClarity, type Clarity } from "./studio-clarity";
import { normalizeOutline, type Outline } from "./studio-outline";
import { normalizeGlow, type Glow } from "./studio-glow";
import { normalizeHalftone, type Halftone } from "./studio-halftone";
import { normalizeGrain, type Grain } from "./studio-grain";
import { normalizeBlurFx, type BlurFx } from "./studio-blur";
import { normalizeDistort, type Distort } from "./studio-distort";
import { normalizeStylize, type Stylize } from "./studio-stylize";
import { normalizeLight, type Light } from "./studio-light";
import { buildTextPathData, normalizeTextPath, isFlatTextPath, type TextPathConfig } from "./studio-text-path";
import { StudioTextPathPanel } from "./StudioTextPathPanel";
import { StudioCurvePanel } from "./StudioCurvePanel";
import { StudioColorBalancePanel } from "./StudioColorBalancePanel";
import { StudioChannelMixerPanel } from "./StudioChannelMixerPanel";
import { StudioSelectiveHslPanel } from "./StudioSelectiveHslPanel";
import { StudioVibrancePanel } from "./StudioVibrancePanel";
import { StudioGradientMapPanel } from "./StudioGradientMapPanel";
import { StudioPhotoFilterPanel } from "./StudioPhotoFilterPanel";
import { StudioAutoAdjustPanel } from "./StudioAutoAdjustPanel";
import { StudioClarityPanel } from "./StudioClarityPanel";
import { StudioOutlinePanel } from "./StudioOutlinePanel";
import { StudioGlowPanel } from "./StudioGlowPanel";
import { StudioHalftonePanel } from "./StudioHalftonePanel";
import { StudioGrainPanel } from "./StudioGrainPanel";
import { StudioBlurPanel } from "./StudioBlurPanel";
import { StudioDistortPanel } from "./StudioDistortPanel";
import { StudioStylizePanel } from "./StudioStylizePanel";
import { StudioLightPanel } from "./StudioLightPanel";
import { ClipMaskGroup } from "./ClipMaskGroup";
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

// 커스텀 Konva 픽셀 필터(스크린톤/선화/색수차/포스터/노이즈 + 색온도/샤픈/먹선/듀오톤)를 한 번 등록.
registerStudioKonvaFilters(Konva);

const StudioVrmPoser = lazy(() => import("./StudioVrmPoser").then((mod) => ({ default: mod.StudioVrmPoser })));

type Tool = "select" | "draw";
type DrawMode = "pen" | "eraser" | "shape";
type DrawShapeKind = "line" | "rect" | "ellipse" | "star";

interface ImageEl {
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
  textPath?: TextPathConfig; // 곡선 텍스트(아치/물결/원) — 미설정/none이면 직선.
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
  font?: string; // 말풍선 글꼴(미설정 시 기본 고딕)
  fontSize?: number; // 말풍선 글자 크기(미설정 시 24)
  lineHeight?: number; // 행간(배수, 미설정 시 1.1)
  vertical?: boolean;
  align?: "left" | "center" | "right";
  fontStyle?: "normal" | "bold" | "italic" | "bold italic";
  tailXRatio?: number;
  tailHeight?: number;
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
}
interface StickerEl {
  id: string;
  type: "sticker";
  text: string;
  x: number;
  y: number;
  fontSize: number;
  rotation: number;
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
  brush?: string;
  pressures?: number[];
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
type El = (ImageEl | TextEl | BubbleEl | StickerEl | DrawEl | FrameEl | FocusLinesEl | SpeedLinesEl) & { hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean };
type StudioMenu = "template" | "bubble" | "sticker" | "char" | "bgScene" | "asset" | "emeres" | "tone";
type StudioBgScene = { id: string; label: string; genre: string; svg?: string; imgSrc?: string };
type StudioFxAsset = { id: string; label: string; svg: string; width: number; height: number };
// 이메레스(스케치 밑그림 틀) — studio-emeres-templates 모듈과 구조 호환되는 로컬 타입.
type StudioEmeresTemplate = { id: string; label: string; category: string; svg: string; width: number; height: number; tip: string };
type StudioOptionalAssetPacks = {
  bgSceneSections: Array<{ genre: string; scenes: StudioBgScene[] }>;
  comicVectorStickers: StudioFxAsset[];
  creatureStickers: StudioFxAsset[];
  propStickers: StudioFxAsset[];
  fxOverlays: StudioFxAsset[];
  emeresSections: Array<{ category: string; templates: StudioEmeresTemplate[] }>;
  emeresUnderlayOpacity: number;
};

const uid = () => crypto.randomUUID();
const EMPTY_STUDIO_OPTIONAL_ASSETS: StudioOptionalAssetPacks = {
  bgSceneSections: [],
  comicVectorStickers: [],
  creatureStickers: [],
  propStickers: [],
  fxOverlays: [],
  emeresSections: [],
  emeresUnderlayOpacity: 0.42,
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

// 스튜디오 전용 구글폰트 7종(글꼴 패널·말풍선 프리셋용) — 전 페이지 렌더 차단 경로(index.html)에는
// 전역 폰트(Space Grotesk·Nanum Myeongjo)만 남기고, 이 7종은 스튜디오 마운트 시에만 주입한다.
const STUDIO_FONTS_LINK_ID = "studio-google-fonts";
const STUDIO_FONTS_CSS2_URL =
  "https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=East+Sea+Dokdo&family=Gaegu:wght@400;700&family=Gamja+Flower&family=Jua&family=Nanum+Pen+Script&family=Yeon+Sung&display=swap";

// 요소의 대략적 바운딩 박스(중심·크기 판정용).
function elBounds(el: El): { x: number; y: number; w: number; h: number } {
  if (el.type === "draw") {
    const xs = el.points.filter((_, i) => i % 2 === 0);
    const ys = el.points.filter((_, i) => i % 2 === 1);
    if (!xs.length || !ys.length) return { x: xs[0] ?? 0, y: ys[0] ?? 0, w: 0, h: 0 };
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }
  if (el.type === "text") return { x: el.x, y: el.y, w: el.width, h: el.fontSize * 1.4 };
  if (el.type === "sticker") return { x: el.x, y: el.y, w: el.fontSize, h: el.fontSize };
  return { x: el.x, y: el.y, w: el.width, h: el.height }; // image · bubble · frame
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
  switch (el.type) {
    case "text":
      return `T ${el.text.slice(0, 14).trim() || "텍스트"}`;
    case "bubble": {
      const v = BUBBLE_VARIANTS.find((b) => b.id === el.variant);
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
const QUICK_SAMPLE_CANVAS_H = 1120;
const QUICK_SAMPLE_MARGIN = 24;

function readQuickStartDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(QUICK_START_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function storeQuickStartDismissed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUICK_START_DISMISSED_KEY, "1");
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

function StudioDrawNode({ el }: { el: DrawEl }) {
  const kind = el.kind ?? "freehand";
  const composite = el.mode === "eraser" ? "destination-out" : "source-over";
  const opacity = el.opacity ?? 1;
  const stroke = el.mode === "eraser" ? "#16100c" : el.stroke;
  const strokeWidth = Math.max(1, el.strokeWidth);

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
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
              cornerRadius={3}
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
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
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
              numPoints={5}
              innerRadius={Math.max(0.1, Math.min(box.width, box.height) / 4)}
              outerRadius={Math.max(0.1, Math.min(box.width, box.height) / 2)}
              fill={el.fill}
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
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

        return (
          <Line
            key={index}
            points={points}
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

// data-URL 이미지를 maxDim 이하로 축소해 전송 크기를 제한한다.
function downscaleImageFile(file: File, maxDim = 1280, quality = 0.85) {
  return new Promise<{ src: string; width: number; height: number }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.onload = () => {
      const img = new window.Image();
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
    const img = new window.Image();
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
  const imageRef = useRef<Konva.Image | null>(null);

  useEffect(() => {
    const im = new window.Image();
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
  // 보정값 → Konva 필터 배열 + 노드 속성. 캐시 의존성은 직렬화 키로 비교(좌표 드래그 시 재캐시 방지).
  const built = buildImageFilters(el, Konva);
  // react-konva filters prop 타입과 느슨하게 맞춘다(기존 코드와 동일하게 any 배열).
  const filters: any[] = built.filters;
  const filterAttrs = built.attrs;
  const cachePad = built.cachePad; // 테두리(outline)가 실루엣 밖으로 자라도록 캐시에 추가할 여백(px).
  const filterCacheKey = imageFilterCacheKey(el);

  useEffect(() => {
    const node = imageRef.current;
    if (!node) return;
    if (displayImg) {
      node.clearCache();
      if (hasFilters) {
        // 테두리가 있으면 offset만큼 캐시 캔버스를 키워 실루엣 바깥에 테두리를 그릴 자리를 만든다.
        node.cache(cachePad > 0 ? { offset: cachePad } : undefined);
      }
      node.getLayer()?.batchDraw();
    }
  }, [displayImg, el.width, el.height, filterCacheKey, hasFilters, cachePad]);

  if (!displayImg) return null;

  return (
    <KImage
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
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target;
        const w = Math.max(20, node.width() * node.scaleX());
        const h = Math.max(20, node.height() * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
        onChange({ x: node.x(), y: node.y(), width: w, height: h, rotation: node.rotation() });
      }}
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
    const im = new window.Image();
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

  return (
    <Group
      ref={innerRef}
      x={el.x}
      y={el.y}
      clipX={0}
      clipY={0}
      clipWidth={el.width}
      clipHeight={el.height}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target as Konva.Group;
        const w = Math.max(40, el.width * node.scaleX());
        const h = Math.max(40, el.height * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
        onChange({ x: node.x(), y: node.y(), width: w, height: h });
      }}
    >
      <Rect width={el.width} height={el.height} fill={el.bgColor ?? "#ffffff"} />
      {img && fit ? (
        <KImage
          image={img}
          x={fit.x}
          y={fit.y}
          width={fit.width}
          height={fit.height}
        />
      ) : null}
      {fStrokeW > 0 && (
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
      )}
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
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      stroke={el.stroke ?? "#000000"}
      strokeWidth={el.strokeWidth ?? 2.5}
      rotation={el.rotation ?? 0}
      opacity={el.opacity ?? 1}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target;
        const w = Math.max(20, node.width() * node.scaleX());
        const h = Math.max(20, node.height() * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
        onChange({ x: node.x(), y: node.y(), width: w, height: h, rotation: node.rotation() });
      }}
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
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      stroke={el.stroke ?? "#000000"}
      strokeWidth={el.strokeWidth ?? 2.5}
      rotation={el.rotation ?? 0}
      opacity={el.opacity ?? 1}
      draggable={draggable}
      dragBoundFunc={dragBoundFunc}
      onMouseDown={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
      onTransformEnd={(e) => {
        const node = e.target;
        const w = Math.max(20, node.width() * node.scaleX());
        const h = Math.max(20, node.height() * node.scaleY());
        node.scaleX(1);
        node.scaleY(1);
        onChange({ x: node.x(), y: node.y(), width: w, height: h, rotation: node.rotation() });
      }}
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
}

export function StudioPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const workId = params.get("id");
  const linkedTitleId = params.get("titleId");
  const loggedIn = !!getCurrentUserId();

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
  const activePageIndex = Math.max(0, pages.findIndex((p) => p.id === currentPageId));
  const activePage = pages[activePageIndex] || pages[0] || {
    id: currentPageId,
    elements: [],
    bg: "#ffffff",
    bgGrad: null,
    canvasH: 1080,
  };

  const elements = activePage.elements;
  const bg = activePage.bg;
  const bgGrad = activePage.bgGrad;
  const canvasH = activePage.canvasH;
  // 현재 페이지의 색보정(과거 저장본 안전 정규화) + 미리보기용 CSS filter 문자열.
  const pageGrade = normalizePageGrade(activePage.grade);
  const pageGradeCss = pageGradeToCssFilter(pageGrade);
  // 레이어 그룹(폴더) — 과거 저장본 호환 위해 미설정 시 빈 배열.
  const groups = activePage.groups ?? [];

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

  // 그리드 스냅 상태
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  const [gridSize, setGridSize] = useState(40);

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

  // 임시저장 복구 여부 상태
  const [hasAutosave, setHasAutosave] = useState(false);

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [color, setColor] = useState("#7c5cfc");
  // 최근 사용 색(색상 팝오버 공용) — 마운트 시 localStorage에서 복원, 선택 시 앞으로 갱신.
  const [recentColors, setRecentColors] = useState<string[]>([]);
  useEffect(() => {
    try {
      setRecentColors(readRecentColors(window.localStorage));
    } catch {
      // localStorage 접근 불가(시크릿/임베드)면 빈 목록 유지.
    }
  }, []);
  const rememberColor = (c: string) => {
    setRecentColors((prev) => {
      const next = pushRecentColor(prev, c);
      try {
        storeRecentColors(window.localStorage, next);
      } catch {
        // 저장 실패는 무시(보조 기능).
      }
      return next;
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
  const [drawAdvancedOpen, setDrawAdvancedOpen] = useState(false);
  const [menu, setMenu] = useState<null | StudioMenu>(null);
  const [studioOptionalAssetPacks, setStudioOptionalAssetPacks] = useState<StudioOptionalAssetPacks | null>(null);
  const [studioOptionalAssetsLoading, setStudioOptionalAssetsLoading] = useState(false);
  const [studioOptionalAssetsError, setStudioOptionalAssetsError] = useState<string | null>(null);
  const [assets, setAssets] = useState<StudioAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  // 에셋 공유(커뮤니티): 탭·목록·로딩/에러·공유 진행 상태
  const [assetTab, setAssetTab] = useState<"mine" | "community">("mine");
  const [shared, setShared] = useState<SharedAsset[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedError, setSharedError] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [poserVrmOpen, setPoserVrmOpen] = useState(false);
  const [quickStartDismissed, setQuickStartDismissed] = useState(readQuickStartDismissed);
  const [quickStartOpen, setQuickStartOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workHydrated, setWorkHydrated] = useState(!workId);
  const studioOptionalAssets = studioOptionalAssetPacks ?? EMPTY_STUDIO_OPTIONAL_ASSETS;
  const studioOptionalAssetsMountedRef = useRef(true);
  const studioOptionalAssetsLoadRef = useRef<Promise<void> | null>(null);

  // 표시용 스케일(컨테이너 폭에 맞춤).
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const measure = () => {
      const w = wrapRef.current?.clientWidth ?? CANVAS_W;
      setScale(Math.min(1, w / CANVAS_W));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // 사용자 줌(폭맞춤 스케일에 곱함). effScale로 Stage·내보내기 해상도를 함께 보정.
  const [zoom, setZoom] = useState(1);
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
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isSpacePressed, editing]);

  // 미니맵용 스크롤 좌표 추적 리스너
  const updateScrollPos = () => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    setScrollPos({
      left: wrap.scrollLeft,
      top: wrap.scrollTop,
      width: wrap.clientWidth,
      height: wrap.clientHeight,
      scrollWidth: wrap.scrollWidth,
      scrollHeight: wrap.scrollHeight,
    });
  };

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.addEventListener("scroll", updateScrollPos);
    window.addEventListener("resize", updateScrollPos);
    const timer = setTimeout(updateScrollPos, 150);
    return () => {
      wrap.removeEventListener("scroll", updateScrollPos);
      window.removeEventListener("resize", updateScrollPos);
      clearTimeout(timer);
    };
  }, [elements, canvasH, scale, zoom]);

  // 오토세이브 임시저장 리스너 (디바운스 1.5초)
  useEffect(() => {
    if (!workHydrated) return;
    // 복구 배너가 떠 있는 동안(복구/비우기 결정 전)은 저장하지 않는다 — 가드가 없으면
    // 재진입 1.5초 뒤 빈 초기 상태가 직전 작업을 덮어써 "복구하기"가 빈 캔버스를 복원한다.
    if (hasAutosave) return;
    // 빈 문서(요소·게시 정보 모두 없음)는 저장하지 않는다 — 의미 없는 복구 배너를 막고,
    // 직전 작업 백업이 빈 상태로 교체되는 것도 방지한다.
    const hasContent =
      pages.some((p) => p.elements.length > 0) ||
      title.trim() !== "" ||
      description.trim() !== "" ||
      tagsText.trim() !== "";
    if (!hasContent) return;
    const timer = setTimeout(() => {
      try {
        const payload = {
          pagesList: pages,
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
  }, [pages, title, description, tagsText, webtoonTheme, panelGutter, workHydrated, hasAutosave]);

  // 복구 여부를 정하지 않은 채 캔버스 편집을 시작하면(undo 히스토리 누적) 배너를 닫고
  // 자동 저장을 재개한다 — 배너를 무시한 새 작업이 저장되지 않는 공백을 막는다.
  useEffect(() => {
    if (hasAutosave && pagesHistory.length > 1) setHasAutosave(false);
  }, [hasAutosave, pagesHistory]);

  // 로드 시 임시저장 확인 리스너 — 실제 내용이 있는 백업만 복구 배너를 띄운다.
  // (요소·게시 정보가 전부 빈 백업은 복구 가치가 없고, 과거 버전이 남긴 빈 페이로드도 거른다.)
  useEffect(() => {
    if (!workId) {
      try {
        const saved = localStorage.getItem("toonspectrum-studio-autosave");
        if (saved) {
          const parsed: {
            pagesList?: { elements?: unknown[] }[];
            title?: string;
            description?: string;
            tagsText?: string;
          } = JSON.parse(saved);
          const hasContent =
            Array.isArray(parsed.pagesList) &&
            parsed.pagesList.length > 0 &&
            (parsed.pagesList.some((p) => (p?.elements?.length ?? 0) > 0) ||
              (parsed.title ?? "").trim() !== "" ||
              (parsed.description ?? "").trim() !== "" ||
              (parsed.tagsText ?? "").trim() !== "");
          if (hasContent) setHasAutosave(true);
        }
      } catch {
        // 무시
      }
    }
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
    window.addEventListener("click", handleCloseMenu);
    return () => window.removeEventListener("click", handleCloseMenu);
  }, [contextMenu.visible]);

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({});
  const publishRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<DrawEl | null>(null);
  // 브러시 커서 프리뷰(Konva 노드 직접 갱신 — hover 리렌더 방지).
  const brushCursorRef = useRef<Konva.Circle>(null);
  const [draft, setDraft] = useState<DrawEl | null>(null);
  // 드래그 중 표시할 정렬 가이드(스테이지 좌표; 캔버스/패널 중심·가장자리에 스냅).
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [userGuides, setUserGuides] = useState<{ id: string; type: "v" | "h"; pos: number }[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  // 내보내기 옵션(배율·포맷·투명 배경) — 다운로드 버튼 옆 팝오버에서 조정.
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportScale, setExportScale] = useState<ExportScale>(2);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportTransparent, setExportTransparent] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // 내보내기 옵션 팝오버 바깥 클릭시 닫기
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [exportMenuOpen]);

  // 툴바 드롭다운(템플릿·배경 씬·말풍선·효과·내 에셋) 바깥 클릭시 닫기.
  // ref는 열린 메뉴의 래퍼(트리거+드롭다운)에만 붙는다 — 한 번에 하나만 열리므로 ref 하나로 충분.
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [menu]);

  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const showQuickStart = quickStartOpen || (workHydrated && elements.length === 0 && !quickStartDismissed);

  // 삭제된 요소의 노드 참조가 nodeRefs에 남지 않도록 정리(누수 방지).
  useEffect(() => {
    const ids = new Set(elements.map((e) => e.id));
    for (const id of Object.keys(nodeRefs.current)) {
      if (!ids.has(id)) delete nodeRefs.current[id];
    }
  }, [elements]);

  // 기존 작품 로드(편집 모드).
  useEffect(() => {
    if (!workId) {
      setWorkHydrated(true);
      return;
    }
    setWorkHydrated(false);
    let alive = true;
    getWork(workId)
      .then((w) => {
        if (!alive) return;
        setTitle(w.title);
        setDescription(w.description);
        setTagsText((w.tags ?? []).join(", "));
        const doc = w.doc as {
          elements?: El[];
          bg?: string;
          bgGrad?: string[] | null;
          height?: number;
          webtoonTheme?: "classic" | "soft" | "vivid";
          pagesList?: PageState[];
          currentPageId?: string;
          panelGutter?: number;
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
  }, [workId]);

  useEffect(() => {
    studioOptionalAssetsMountedRef.current = true;
    return () => {
      studioOptionalAssetsMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (menu !== "bgScene" && menu !== "sticker" && menu !== "emeres") return;
    if (studioOptionalAssetPacks || studioOptionalAssetsLoadRef.current) return;

    setStudioOptionalAssetsLoading(true);
    setStudioOptionalAssetsError(null);
    studioOptionalAssetsLoadRef.current = Promise.all([
      import("./studio-bg-scenes"),
      import("./studio-bg-scenes-extra"),
      import("./studio-fx-assets"),
      import("./studio-creature-stickers"),
      import("./studio-prop-stickers"),
      import("./studio-emeres-templates"),
    ])
      .then(([bgScenes, bgScenesExtra, fxAssets, creatureAssets, propAssets, emeres]) => {
        if (!studioOptionalAssetsMountedRef.current) return;
        setStudioOptionalAssetPacks({
          bgSceneSections: bgScenes.bgSceneSections([...bgScenes.BG_SCENES, ...bgScenesExtra.BG_SCENES_EXTRA]),
          comicVectorStickers: fxAssets.COMIC_VECTOR_STICKERS,
          creatureStickers: creatureAssets.CREATURE_STICKERS,
          propStickers: propAssets.PROP_STICKERS,
          fxOverlays: fxAssets.FX_OVERLAYS,
          emeresSections: emeres.emeresSections(),
          emeresUnderlayOpacity: emeres.EMERES_DEFAULT_OPACITY,
        });
      })
      .catch((err) => {
        console.error("Failed to load studio optional asset packs:", err);
        studioOptionalAssetsLoadRef.current = null;
        if (studioOptionalAssetsMountedRef.current) {
          setStudioOptionalAssetsError("스튜디오 에셋을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (studioOptionalAssetsMountedRef.current) {
          setStudioOptionalAssetsLoading(false);
        }
      });
  }, [menu, studioOptionalAssetPacks]);

  // 스튜디오 전용 구글폰트 로드 — 스타일시트는 마운트 시 1회 주입하고 언마운트 후에도 남긴다
  // (재진입 시 id 가드로 중복 주입 방지·폰트 캐시 유지). konva 캔버스 텍스트는 DOM과 달리
  // 폰트 스왑을 스스로 감지하지 못하므로, 폰트가 도착하는 시점에 스테이지를 한 번씩 다시 그린다.
  useEffect(() => {
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
  }, []);

  // 커스텀 에셋 라이브러리 목록 불러오기 및 관리
  const loadAssetsList = async () => {
    setAssetsLoading(true);
    try {
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
      await deleteAsset(id);
      await loadAssetsList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "에셋 삭제 실패");
    }
  }

  // 에셋 라이브러리 고도화 상태 및 함수
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [assetSortOrder, setAssetSortOrder] = useState<"newest" | "name" | "size">("newest");
  const [renamingAssetId, setRenamingAssetId] = useState<string | null>(null);
  const [renamingAssetName, setRenamingAssetName] = useState("");
  const [assetPrompt, setAssetPrompt] = useState("");
  const [assetPromptName, setAssetPromptName] = useState("");
  const [assetPromptSize, setAssetPromptSize] = useState<GeneratedAssetSize>("1024x1024");
  const [assetPromptQuality, setAssetPromptQuality] = useState<GeneratedAssetQuality>("medium");
  const [assetGenerating, setAssetGenerating] = useState(false);

  async function handleRenameAsset(id: string) {
    if (!renamingAssetName.trim()) return;
    try {
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
    if (!getCurrentUserId()) {
      setError("AI 에셋을 생성하려면 로그인이 필요해요.");
      return;
    }
    setAssetGenerating(true);
    setError(null);
    try {
      const generated = await generateAsset({
        prompt,
        name: assetPromptName.trim() || undefined,
        size: assetPromptSize,
        quality: assetPromptQuality,
      });
      const saved = await saveAsset({
        name: generated.name,
        dataUrl: generated.dataUrl,
        width: generated.width,
        height: generated.height,
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

  const filteredAssets = useMemo(() => {
    let list = [...assets];
    if (assetSearchQuery.trim()) {
      const query = assetSearchQuery.toLowerCase();
      list = list.filter((asset) => asset.name.toLowerCase().includes(query));
    }
    if (assetSortOrder === "newest") {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else if (assetSortOrder === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "ko", { sensitivity: "base" }));
    } else if (assetSortOrder === "size") {
      list.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    }
    return list;
  }, [assets, assetSearchQuery, assetSortOrder]);

  const filteredShared = useMemo(() => {
    let list = [...shared];
    if (assetSearchQuery.trim()) {
      const query = assetSearchQuery.toLowerCase();
      list = list.filter((asset) => asset.name.toLowerCase().includes(query));
    }
    if (assetSortOrder === "newest") {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (assetSortOrder === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name, "ko", { sensitivity: "base" }));
    } else if (assetSortOrder === "size") {
      list.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    }
    return list;
  }, [shared, assetSearchQuery, assetSortOrder]);

  // 효과·배경 씬 피커 검색/카테고리 점프 상태 (React Compiler가 파생값을 자동 메모이즈)
  const [fxSearchQuery, setFxSearchQuery] = useState("");
  const [fxPickerSection, setFxPickerSection] = useState<FxPickerSection>("all");
  const [toneSearchQuery, setToneSearchQuery] = useState("");
  const [bgSceneSearchQuery, setBgSceneSearchQuery] = useState("");
  const [bgSceneGenreFilter, setBgSceneGenreFilter] = useState("all");

  const fxQuery = fxSearchQuery.trim().toLowerCase();
  const fxSectionVisible = (section: Exclude<FxPickerSection, "all">) =>
    fxPickerSection === "all" || fxPickerSection === section;
  const fxSfxFiltered = fxQuery ? SFX_PRESETS.filter((s) => s.text.toLowerCase().includes(fxQuery)) : SFX_PRESETS;
  const fxEmojisFiltered = fxQuery ? [] : EFFECT_EMOJIS; // 이모지는 라벨이 없어 검색 중에는 제외
  const fxComicFiltered = filterAssetsByLabel(studioOptionalAssets.comicVectorStickers, fxSearchQuery);
  const fxCreatureFiltered = filterAssetsByLabel(studioOptionalAssets.creatureStickers, fxSearchQuery);
  const fxPropFiltered = filterAssetsByLabel(studioOptionalAssets.propStickers, fxSearchQuery);
  const fxLinePresetsFiltered = filterAssetsByLabel(FX_LINE_PRESETS, fxSearchQuery);
  const fxOverlaysFiltered = filterAssetsByLabel(studioOptionalAssets.fxOverlays, fxSearchQuery);
  const fxPickerHasResults =
    (fxSectionVisible("sfx") && fxSfxFiltered.length > 0) ||
    (fxSectionVisible("emoji") && fxEmojisFiltered.length > 0) ||
    (fxSectionVisible("comic") && fxComicFiltered.length > 0) ||
    (fxSectionVisible("creature") && fxCreatureFiltered.length > 0) ||
    (fxSectionVisible("prop") && fxPropFiltered.length > 0) ||
    (fxSectionVisible("lines") && fxLinePresetsFiltered.length > 0) ||
    (fxSectionVisible("overlay") && fxOverlaysFiltered.length > 0);

  const bgSceneSectionsFiltered = filterBgSceneSections(
    bgSceneGenreFilter === "all"
      ? studioOptionalAssets.bgSceneSections
      : studioOptionalAssets.bgSceneSections.filter((group) => group.genre === bgSceneGenreFilter),
    bgSceneSearchQuery
  );

  // 이메레스(스케치 밑그림) 피커 검색/카테고리 상태
  const [emeresSearchQuery, setEmeresSearchQuery] = useState("");
  const [emeresCategoryFilter, setEmeresCategoryFilter] = useState("all");
  const emeresSectionsFiltered = studioOptionalAssets.emeresSections
    .filter((section) => emeresCategoryFilter === "all" || section.category === emeresCategoryFilter)
    .map((section) => ({ ...section, templates: filterAssetsByLabel(section.templates, emeresSearchQuery) }))
    .filter((section) => section.templates.length > 0);

  // ── 커뮤니티 공유 에셋 ────────────────────────────────────────────────
  const loadSharedAssets = async () => {
    setSharedLoading(true);
    setSharedError(null);
    try {
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
    if (!getCurrentUserId()) {
      setError("에셋을 공유하려면 로그인이 필요해요.");
      return;
    }
    setPublishingId(asset.id);
    try {
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
    markSharedAssetUsed(asset.id);
    setMenu(null);
  }

  async function onDeleteSharedAsset(id: string) {
    try {
      await deleteSharedAsset(id);
      await loadSharedAssets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "공유 에셋을 삭제하지 못했어요.");
    }
  }

  // 트랜스포머를 선택 노드에 부착.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const selLocked = elements.find((e) => e.id === selectedId)?.locked;
    const node = selectedId && tool === "select" && !selLocked ? nodeRefs.current[selectedId] : null;
    if (node) {
      tr.nodes([node]);
    } else {
      tr.nodes([]);
    }
    tr.getLayer()?.batchDraw();
  }, [selectedId, tool, elements]);

  // 요소 변경을 히스토리에 커밋.
  function commit(nextElements: El[]) {
    coalesceKeyRef.current = null; // 일반 커밋은 합치기 체인을 끊는다.
    const nextPages = pages.map((p) => (p.id === activePage.id ? { ...p, elements: nextElements } : p));
    const h = pagesHistory.slice(0, pagesHi + 1);
    h.push(nextPages);
    setPagesHistory(h);
    setPagesHi(h.length - 1);
  }
  // 같은 key의 연속 동작이면 새 히스토리 항목 대신 최상단을 교체(undo 1회로 합침).
  function commitCoalesced(nextElements: El[], key: string) {
    const nextPages = pages.map((p) => (p.id === activePage.id ? { ...p, elements: nextElements } : p));
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
          disabled={el.locked}
          onClick={() => {
            setTool("select");
            setSelectedId(el.id);
          }}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-xs disabled:cursor-default",
            el.hidden ? "text-fg-3/50 line-through" : el.locked ? "text-fg-3" : "text-fg-2"
          )}
          title={elementLabel(el)}
        >
          {el.clipBelow ? "⤵ " : ""}
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

  // ── 페이지 관련 명령 조작 ──────────────────────────────────────────────
  function addPage() {
    const newPage: PageState = {
      id: uid(),
      elements: [],
      bg: "#ffffff",
      bgGrad: null,
      canvasH: 1080,
    };
    const nextPages = [...pages, newPage];
    commitPages(nextPages);
    setCurrentPageId(newPage.id);
  }
  function duplicatePage(pageId: string) {
    const pageToDup = pages.find((p) => p.id === pageId);
    if (!pageToDup) return;
    const newPage: PageState = {
      ...pageToDup,
      id: uid(),
      elements: pageToDup.elements.map((el) => ({ ...el, id: uid() })),
    };
    const idx = pages.findIndex((p) => p.id === pageId);
    const nextPages = [...pages];
    nextPages.splice(idx + 1, 0, newPage);
    commitPages(nextPages);
    setCurrentPageId(newPage.id);
  }
  function deletePage(pageId: string) {
    if (pages.length <= 1) return;
    const nextPages = pages.filter((p) => p.id !== pageId);
    commitPages(nextPages);
    if (currentPageId === pageId) {
      const idx = pages.findIndex((p) => p.id === pageId);
      const nextActive = pages[idx - 1] || pages[idx + 1] || pages[0];
      setCurrentPageId(nextActive.id);
    }
  }
  function movePageUp(pageId: string) {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx <= 0) return;
    const nextPages = [...pages];
    const temp = nextPages[idx];
    nextPages[idx] = nextPages[idx - 1];
    nextPages[idx - 1] = temp;
    commitPages(nextPages);
  }
  function movePageDown(pageId: string) {
    const idx = pages.findIndex((p) => p.id === pageId);
    if (idx === -1 || idx >= pages.length - 1) return;
    const nextPages = [...pages];
    const temp = nextPages[idx];
    nextPages[idx] = nextPages[idx + 1];
    nextPages[idx + 1] = temp;
    commitPages(nextPages);
  }
  function addRenderedImage(src: string, width: number, height: number) {
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
    window.requestAnimationFrame(() => {
      publishRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      titleInputRef.current?.focus({ preventScroll: true });
    });
  }
  function startFromExample() {
    if (elements.length > 0 && !window.confirm("기존 작업을 지우고 예시를 불러올까요?")) return;

    const frames = createQuickSampleFrames();
    const firstFrame = frames[0];
    const sample: El[] = [...frames];

    if (firstFrame) {
      sample.push({
        id: uid(),
        type: "bubble",
        variant: "speech",
        text: "상단의 '3D 캐릭터' 버튼을 눌러 다양한 3D 모델을 추가하고 포즈를 취해보세요!",
        x: firstFrame.x + 30,
        y: firstFrame.y + 40,
        width: 300,
        height: 120,
        fill: "#ffffff",
        textFill: "#111111",
        rotation: 0,
      });
    }

    setCanvasH(QUICK_SAMPLE_CANVAS_H);
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
    commit(elements.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }
  function removeSelected() {
    if (!selectedId || selected?.locked) return;
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
  // 선택 요소를 들어있는 패널(없으면 캔버스) 기준으로 정렬. 좌·가로중앙·우 / 상·세로중앙·하.
  function alignSelected(mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom") {
    if (!selected || selected.locked) return;
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
  const undo = () => setPagesHi((i) => Math.max(0, i - 1));
  const redo = () => setPagesHi((i) => Math.min(pagesHistory.length - 1, i + 1));

  // 키보드 단축키: ⌘Z 실행취소 · ⌘⇧Z/⌘Y 다시실행 · ⌘D 복제 · Delete/Backspace 삭제 · Esc 메뉴 닫기/선택해제.
  // 최신 클로저를 ref로 흘려 리스너 재등록 없이(빈 deps) 항상 현재 상태를 참조.
  const shortcutRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    shortcutRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || editing) return;
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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      } else if (e.key === "Escape") {
        if (shortcutsOpen) setShortcutsOpen(false);
        else if (menu) {
          // 위 레이어부터 닫기: 단축키 오버레이 → 열린 툴바 드롭다운 → 선택해제.
          // 포커스가 드롭다운 안이면 언마운트로 잃어버리므로 트리거(래퍼 첫 버튼)로 복귀.
          menuRef.current?.querySelector<HTMLButtonElement>(":scope > button")?.focus();
          setMenu(null);
        } else setSelectedId(null);
      } else if (selectedId && e.key.startsWith("Arrow")) {
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 클립보드 이미지 붙여넣기(⌘V): 스크린샷·외부 그림을 바로 캔버스에 추가.
  // shortcutRef와 같은 방식으로 최신 상태/함수를 ref로 흘린다.
  const pasteRef = useRef<(e: ClipboardEvent) => void>(() => {});
  useEffect(() => {
    pasteRef.current = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (typing || editing) return;
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
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // 새 요소를 놓을 중심: 패널이 선택돼 있으면 그 칸 중앙, 아니면 캔버스 중앙.
  function spawnCenter(): [number, number] {
    if (selected?.type === "frame") return [selected.x + selected.width / 2, selected.y + selected.height / 2];
    return [CANVAS_W / 2, canvasH / 2];
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
  function addSfx(text: string, fill: string) {
    setMenu(null);
    const [cx, cy] = spawnCenter();
    addEl({
      id: uid(),
      type: "text",
      text,
      x: cx - 80,
      y: cy - 50,
      width: 220,
      fontSize: 88,
      fill,
      stroke: "#16100c",
      strokeWidth: 7,
      rotation: -6,
    });
  }
  function addBgScene(bg: StudioBgScene) {
    setMenu(null);
    const src = bg.imgSrc || svgToDataUrl(bg.svg || "");
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
  function addTone(svg: string) {
    setMenu(null);
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
    if (elements.length > 0 && !window.confirm("기존 작업을 지우고 템플릿을 적용할까요?")) return;
    setCanvasH(tpl.canvasH);
    setBg("#ffffff");
    setBgGrad(null);
    setCurrentTemplate(tpl);
    const nextEls = regenerateTemplate(tpl, panelGutter, []);
    commit(nextEls);
    setSelectedId(null);
  }
  // 코미Po!식 정형 컷 레이아웃 — 패널 프레임(+말풍선 시드)을 한 번에 배치.
  function applyPanelLayout(layout: PanelLayoutPreset) {
    setMenu(null);
    if (elements.length > 0 && !window.confirm("기존 작업을 지우고 컷 템플릿을 적용할까요?")) return;
    setCanvasH(layout.canvasH);
    setBg("#ffffff");
    setBgGrad(null);
    setCurrentTemplate(null);
    const frames: El[] = layout.frames.map((f) => ({
      id: uid(),
      type: "frame" as const,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
    }));
    const bubbles: El[] = (layout.bubbles ?? []).map((b) => ({
      id: uid(),
      type: "bubble" as const,
      variant: b.variant,
      text: b.text,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      fill: "#ffffff",
      textFill: "#16100c",
      rotation: 0,
    }));
    commit([...frames, ...bubbles]);
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

  // 그림판 — 진행 중 선/도형은 draft 로만 렌더, 끝나면 히스토리에 커밋.
  function onStageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (e.target.name() === "symmetry-handle" || e.target.name() === "guide-line-handle") {
      return;
    }
    if (tool === "draw") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      setSelectedId(null);
      
      const rawPressure = (e.evt as any).pressure;
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
      setDraft(next);
      return;
    }
    // 선택 모드: 빈 영역 클릭 시 선택 해제.
    if (e.target === e.target.getStage() || e.target.name() === "bg") setSelectedId(null);
  }
  function onStageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    // 브러시 커서 프리뷰: 드로잉 모드에선 포인터 위치에 브러시 크기 원을 따라 그린다.
    // (React 상태를 거치지 않고 Konva 노드를 직접 갱신 — hover 중 리렌더 없음)
    if (tool === "draw") {
      const cursorPos = e.target.getStage()?.getRelativePointerPosition();
      const cursorNode = brushCursorRef.current;
      if (cursorPos && cursorNode) {
        cursorNode.position(cursorPos);
        if (!cursorNode.visible()) cursorNode.visible(true);
        cursorNode.getLayer()?.batchDraw();
      }
    }
    if (tool !== "draw" || !drawingRef.current) return;
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const current = drawingRef.current;
    const kind = current.kind ?? "freehand";
    let next: DrawEl;
    if (kind === "freehand") {
      const rawPressure = (e.evt as any).pressure;
      const hasHardwarePressure = typeof rawPressure === "number" && rawPressure > 0 && rawPressure !== 0.5;
      
      let pressure = 0.5;
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
      if (stabilizer > 0 && current.points.length >= 2) {
        // 손떨림 보정 1단계: 입력 시점 끌림 보정(순수 함수, studio-brush).
        const lastX = current.points[current.points.length - 2]!;
        const lastY = current.points[current.points.length - 1]!;
        [targetX, targetY] = stabilizePoint(lastX, lastY, pos.x, pos.y, stabilizer);
      }

      next = { 
        ...current, 
        points: [...current.points, targetX, targetY],
        pressures: current.pressures ? [...current.pressures, pressure] : [pressure]
      };
    } else {
      const x0 = current.points[0] ?? pos.x;
      const y0 = current.points[1] ?? pos.y;
      let x1 = pos.x;
      let y1 = pos.y;
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
      next = { ...current, points: [x0, y0, x1, y1] };
    }
    drawingRef.current = next;
    setDraft(next);
  }
  function onStageUp() {
    if (drawingRef.current && isCompleteDrawOp(drawingRef.current)) {
      let finished = drawingRef.current;
      // 손떨림 보정 2단계: 프리핸드 스트로크 확정 시 이동평균 스무딩(점 개수·필압 정렬 보존).
      if ((finished.kind ?? "freehand") === "freehand" && stabilizer > 0) {
        finished = { ...finished, points: smoothStrokePoints(finished.points, stabilizer) };
      }
      commit([...elements, finished]);
    }
    drawingRef.current = null;
    setDraft(null);
  }
  // 포인터가 캔버스를 벗어나면 브러시 커서 프리뷰를 숨긴다.
  function hideBrushCursor() {
    const cursorNode = brushCursorRef.current;
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
    if (node.getParent() instanceof Konva.Transformer) return; // 트랜스포머 앵커(리사이즈)는 제외
    const layer = node.getLayer();
    if (!layer) return;

    if (!snapEnabled) {
      setGuides({ x: [], y: [] });
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
    const panel = elements.find(
      (p): p is FrameEl =>
        p.type === "frame" &&
        !p.hidden &&
        box.x + box.width / 2 >= p.x &&
        box.x + box.width / 2 <= p.x + p.width &&
        box.y + box.height / 2 >= p.y &&
        box.y + box.height / 2 <= p.y + p.height,
    );
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
    if (dx !== 0) node.x(node.x() + dx);
    if (dy !== 0) node.y(node.y() + dy);
    setGuides({ x: gx != null ? [gx] : [], y: gy != null ? [gy] : [] });
  }
  function onStageDragEnd() {
    setGuides({ x: [], y: [] });
  }

  function startEditText(id: string) {
    const el = elements.find((e) => e.id === id);
    if (!el || (el.type !== "text" && el.type !== "bubble" && el.type !== "sticker")) return;
    setEditing({ id, value: el.text });
  }




  function commitEditText() {
    if (editing) {
      const el = elements.find((e) => e.id === editing.id);
      // 말풍선은 텍스트가 넘치지 않게 높이를 자동 확장(수동으로 키운 크기는 보존).
      let height: number | undefined;
      if (el && el.type === "bubble") {
        const measure = new Konva.Text({
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
          currentPageId,
          webtoonTheme,
          panelGutter,
        } as Record<string, unknown>,
        status,
      };
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

  const toolBtn = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
      active ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
    );

  async function handleDownload() {
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
    setIsExporting(false);
    try {
      const blob = await canvasToBlob(canvas, exportMimeType(exportFormat), exportQuality(exportFormat));
      downloadBlob(blob, pageExportFileName(title, exportFormat, transparent));
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 내보내기에 실패했어요.");
    }
  }

  // 현재 페이지를 클립보드에 이미지(PNG)로 복사 — 색보정 합성 후 ClipboardItem으로 기록.
  async function handleCopyToClipboard() {
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
    setIsExporting(false);
    try {
      await copyCanvasToClipboard(canvas);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "클립보드 복사에 실패했어요.");
    }
  }

  async function handleDownloadAll(spacing = 24) {
    setExportMenuOpen(false);
    // 합성 전 캔버스 한계 가드: 총 높이×배율이 한계를 넘으면 빈 PNG가 조용히 저장되므로
    // 분할 저장 또는 배율 자동 하향 중 하나를 먼저 고른다.
    const pageHeights = pages.map((p) => p.canvasH);
    let scale: number = exportScale;
    let wantSplit = false;
    if (stripTotalHeight(pageHeights, spacing, scale) > MAX_CANVAS_DIM) {
      const fitScale = maxFittingScale(pageHeights, spacing, scale);
      const plannedParts = splitPagesForExport(pageHeights, spacing, scale).length;
      if (fitScale !== null) {
        wantSplit = window.confirm(
          `${scale}×로 한 장에 합치면 브라우저 캔버스 한계(약 ${MAX_CANVAS_DIM.toLocaleString()}px)를 넘어요.\n` +
            `확인: ${plannedParts}개 파일로 나눠 저장 / 취소: ${fitScale}×로 낮춰 한 파일로 저장`
        );
        if (!wantSplit) scale = fitScale;
      } else {
        if (
          !window.confirm(
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

        // 파일 저장(분할 시 -1of2 식 접미사)
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

  // 스튜디오 프로젝트 내보내기 (.json)
  function handleExportProject() {
    const projectData = {
      version: "1.0",
      title: title,
      linkedTitleId: linkedTitleId,
      pages: pages,
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
    <Container size="wide" className="py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">창작 스튜디오</h1>
          <p className="mt-1 text-sm text-fg-3">
            이미지·말풍선·스티커·펜으로 컷툰을 만들고 창작 게시판에 올려보세요.
            {linkedTitleId && <span className="ml-1 text-accent">· 웹툰 팬 창작으로 연결됨</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div ref={exportMenuRef} className="relative flex items-center">
            <button
              type="button"
              onClick={() => handleDownload()}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5 pr-2" })}
              title={`현재 페이지를 ${exportScale}× ${exportFormat.toUpperCase()}로 다운로드${exportTransparent && exportFormat === "png" ? " (투명 배경)" : ""}`}
            >
              <Download size={14} /> 다운로드
              <span className="text-[10px] font-semibold tabular-nums text-fg-3">
                {exportScale}× {exportFormat.toUpperCase()}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setExportMenuOpen((open) => !open)}
              aria-expanded={exportMenuOpen}
              aria-label="내보내기 옵션"
              className={buttonClass({ size: "sm", variant: "quiet", className: "px-1.5" })}
              title="내보내기 옵션 (배율·포맷·투명 배경)"
            >
              <ChevronDown size={13} className={cn("transition-transform", exportMenuOpen && "rotate-180")} />
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-xl border border-line bg-panel p-3 shadow-xl">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg-2">배율</span>
                  <div className="flex items-center gap-1">
                    {EXPORT_SCALES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setExportScale(s)}
                        aria-pressed={exportScale === s}
                        className={cn(
                          "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                          exportScale === s ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
                        )}
                      >
                        {s}×
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-fg-2">포맷</span>
                  <div className="flex items-center gap-1">
                    {EXPORT_FORMATS.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setExportFormat(f)}
                        aria-pressed={exportFormat === f}
                        className={cn(
                          "h-7 rounded-lg border px-2.5 text-xs font-semibold transition-colors",
                          exportFormat === f ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
                        )}
                      >
                        {exportFormatLabel(f)}
                      </button>
                    ))}
                  </div>
                </div>
                <label
                  className={cn(
                    "mt-2.5 flex items-center gap-1.5 text-xs",
                    exportFormat === "jpg" ? "cursor-not-allowed text-fg-3 opacity-50" : "cursor-pointer text-fg-2"
                  )}
                  title={exportFormat === "jpg" ? "JPG는 투명도를 지원하지 않아요" : "배경 없이 투명하게 내보내기"}
                >
                  <input
                    type="checkbox"
                    checked={exportTransparent && exportFormat !== "jpg"}
                    disabled={exportFormat === "jpg"}
                    onChange={(e) => setExportTransparent(e.target.checked)}
                    className="size-3.5 accent-[var(--color-accent)] cursor-pointer disabled:cursor-not-allowed"
                  />
                  투명 배경 (PNG·WebP)
                </label>
                {canCopyImageToClipboard() && (
                  <button
                    type="button"
                    onClick={handleCopyToClipboard}
                    disabled={isExporting}
                    className={cn(
                      "mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card py-1.5 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised disabled:opacity-50",
                    )}
                    title="현재 페이지를 클립보드에 이미지로 복사 (붙여넣기로 바로 사용)"
                  >
                    <Copy size={13} /> 클립보드로 복사
                  </button>
                )}
                <p className="mt-2 text-[10px] tabular-nums text-fg-3">
                  출력 폭 {(CANVAS_W * exportScale).toLocaleString()}px
                  {(() => {
                    const q = exportQuality(exportFormat);
                    return q !== undefined ? ` · 품질 ${Math.round(q * 100)}%` : "";
                  })()}
                </p>
              </div>
            )}
          </div>
          {pages.length > 1 && (
            <button
              type="button"
              onClick={() => handleDownloadAll(24)}
              className={buttonClass({
                size: "sm",
                variant: "quiet",
                className: "gap-1.5 bg-accent/10 text-accent hover:bg-accent/20 border-accent/25 border",
              })}
              title="모든 페이지를 긴 세로 스크롤 웹툰으로 이어 붙여 다운로드 (내보내기 옵션의 배율·포맷 적용)"
            >
              <Download size={14} /> 웹툰 연합 스크롤
            </button>
          )}
          <button type="button" onClick={handleExportProject} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })} title="편집 중인 모든 레이아웃과 요소를 .json 파일로 PC에 저장">
            <Download size={14} /> 백업 (.json)
          </button>
          <label className={cn(buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" }), "cursor-pointer")} title="백업해둔 .json 파일을 불러와 작업을 이어함">
            <Upload size={14} /> 복구 (.json)
            <input type="file" accept=".json" className="hidden" onChange={handleImportProject} />
          </label>
          <button type="button" onClick={() => handleSave("draft")} disabled={saving} className={buttonClass({ size: "sm", variant: "quiet" })}>
            임시저장
          </button>
          <button type="button" onClick={() => handleSave("published")} disabled={saving} className={buttonClass({ size: "sm", variant: "solid", className: "gap-1.5" })}>
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

      {/* 툴바 */}
      <div className="sticky top-2 z-20 mb-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-panel/80 p-2 backdrop-blur">
        <div ref={menu === "template" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "template" ? null : "template")} aria-haspopup="menu" aria-expanded={menu === "template"} className={toolBtn(menu === "template")}>
            <LayoutTemplate size={14} /> 템플릿
          </button>
          {menu === "template" && (
            <div className="absolute left-0 top-full z-30 mt-1 grid max-h-80 w-64 gap-1.5 overflow-y-auto rounded-xl border border-line bg-panel p-2 shadow-lg">
              {groupTemplates(TEMPLATES).map((group) => (
                <div key={group.group} className="grid gap-1">
                  <p className="px-1 text-[0.6rem] font-semibold uppercase tracking-wide text-fg-3">{group.group}</p>
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
                <p className="px-1 text-[0.6rem] font-semibold uppercase tracking-wide text-fg-3">컷 템플릿 · 정형 레이아웃</p>
                {PANEL_LAYOUTS.map((layout) => (
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
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button
          type="button"
          onClick={() => setPoserVrmOpen(true)}
          className={cn(toolBtn(poserVrmOpen), "text-accent border border-accent/20 bg-accent-soft/30 hover:bg-accent-soft/50")}
          title="3D 캐릭터 생성 및 포즈 설정"
        >
          <Sparkles size={14} /> 3D 캐릭터
        </button>
        <div ref={menu === "bgScene" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "bgScene" ? null : "bgScene")} aria-haspopup="menu" aria-expanded={menu === "bgScene"} className={toolBtn(menu === "bgScene")}>
            <ImageIcon size={14} /> 배경 씬
          </button>
          {menu === "bgScene" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">2D 배경 씬</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                배경을 누르면 모든 패널에 적용돼요. 특정 컷만 바꾸려면 그 패널을 먼저 선택하세요.
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" />
                <input
                  type="text"
                  placeholder="배경 씬 검색..."
                  value={bgSceneSearchQuery}
                  onChange={(e) => setBgSceneSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder-fg-4 outline-none focus:border-accent transition-colors"
                />
                {bgSceneSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setBgSceneSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-2 transition-colors"
                  >
                    <X size={10} />
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
                        "rounded-full border px-2 py-0.5 text-[0.6rem] font-medium transition-colors",
                        bgSceneGenreFilter === genre ? "border-accent bg-accent text-white" : "border-line bg-card text-fg-3 hover:bg-raised"
                      )}
                    >
                      {genre === "all" ? "전체" : genre}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                {studioOptionalAssetsLoading && !studioOptionalAssetPacks && (
                  <p className="rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">배경 씬을 불러오는 중...</p>
                )}
                {studioOptionalAssetsError && (
                  <p className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">
                    {studioOptionalAssetsError}
                  </p>
                )}
                {studioOptionalAssets.bgSceneSections.length > 0 && bgSceneSectionsFiltered.length === 0 && (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                    <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
                    <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">다른 검색어로 찾아보세요.</p>
                  </div>
                )}
                {bgSceneSectionsFiltered.map((group) => (
                  <div key={group.genre}>
                    <p className="mb-1 px-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-fg-3">{group.genre}</p>
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
                            <img src={bg.imgSrc || svgToDataUrl(bg.svg || "")} alt={bg.label} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                          </div>
                          <span className="block text-center text-[0.6rem] text-fg-2 font-medium mt-1 truncate">{bg.label}</span>
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
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">만화 스크린톤</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                톤을 누르면 캔버스에 깔려요. 패널을 먼저 선택하면 그 칸을 덮고, 망점 크기는 칸에 맞춰 일정하게 유지됩니다.
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" />
                <input
                  type="text"
                  placeholder="톤 검색 (망점·선·교차선...)"
                  value={toneSearchQuery}
                  onChange={(e) => setToneSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder-fg-4 outline-none focus:border-accent transition-colors"
                />
                {toneSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setToneSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-2 transition-colors"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto pr-1">
                <StudioTonePanel onPick={(svg) => addTone(svg)} query={toneSearchQuery} />
              </div>
            </div>
          )}
        </div>
        <div ref={menu === "emeres" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "emeres" ? null : "emeres")} aria-haspopup="menu" aria-expanded={menu === "emeres"} className={toolBtn(menu === "emeres")}>
            <PenTool size={14} /> 이메레스
          </button>
          {menu === "emeres" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">이메레스 · 스케치 밑그림 틀</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                선택한 틀이 반투명·잠금 밑그림으로 깔리고 펜 모드로 바뀌어요. 그 위에 따라 그린 뒤, 레이어 패널에서 밑그림을 숨기거나 지우세요.
              </p>
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" />
                <input
                  type="text"
                  placeholder="이메레스 검색..."
                  value={emeresSearchQuery}
                  onChange={(e) => setEmeresSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder-fg-4 outline-none focus:border-accent transition-colors"
                />
                {emeresSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setEmeresSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-2 transition-colors"
                  >
                    <X size={10} />
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
                        "rounded-full border px-2 py-0.5 text-[0.6rem] font-medium transition-colors",
                        emeresCategoryFilter === category ? "border-accent bg-accent text-white" : "border-line bg-card text-fg-3 hover:bg-raised"
                      )}
                    >
                      {category === "all" ? "전체" : category}
                    </button>
                  ))}
                </div>
              )}
              <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
                {studioOptionalAssetsLoading && !studioOptionalAssetPacks && (
                  <p className="rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">이메레스 틀을 불러오는 중...</p>
                )}
                {studioOptionalAssetsError && (
                  <p className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">{studioOptionalAssetsError}</p>
                )}
                {studioOptionalAssets.emeresSections.length > 0 && emeresSectionsFiltered.length === 0 && (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                    <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
                    <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">다른 검색어로 찾아보세요.</p>
                  </div>
                )}
                {emeresSectionsFiltered.map((section) => (
                  <div key={section.category}>
                    <p className="mb-1 px-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-fg-3">{section.category}</p>
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
                          <span className="mt-1 block truncate text-center text-[0.6rem] font-medium text-fg-2">{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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
            <div className="absolute left-0 top-full z-30 mt-1 grid w-44 gap-1 rounded-xl border border-line bg-panel p-2 shadow-lg">
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
          )}
        </div>
        <div ref={menu === "sticker" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "sticker" ? null : "sticker")} aria-haspopup="menu" aria-expanded={menu === "sticker"} className={toolBtn(menu === "sticker")}>
            <Sparkles size={14} /> 효과
          </button>
          {menu === "sticker" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" />
                <input
                  type="text"
                  placeholder="효과 검색..."
                  value={fxSearchQuery}
                  onChange={(e) => setFxSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder-fg-4 outline-none focus:border-accent transition-colors"
                />
                {fxSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setFxSearchQuery("")}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-2 transition-colors"
                  >
                    <X size={10} />
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
                      "rounded-full border px-2 py-0.5 text-[0.6rem] font-medium transition-colors",
                      fxPickerSection === section.id ? "border-accent bg-accent text-white" : "border-line bg-card text-fg-3 hover:bg-raised"
                    )}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
              {fxSectionVisible("sfx") && fxSfxFiltered.length > 0 && (
                <>
                  <p className="mb-1 text-[0.66rem] font-medium text-fg-3">효과음</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {fxSfxFiltered.map((s) => (
                      <button
                        key={s.text}
                        type="button"
                        onClick={() => addSfx(s.text, s.fill)}
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
              {studioOptionalAssetsLoading && !studioOptionalAssetPacks && (
                <p className="mb-2 rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">스티커 에셋을 불러오는 중...</p>
              )}
              {studioOptionalAssetsError && (
                <p className="mb-2 rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">
                  {studioOptionalAssetsError}
                </p>
              )}
              {fxSectionVisible("comic") && fxComicFiltered.length > 0 && (
                <>
                  <p className="mb-1 mt-2 text-[0.66rem] font-medium text-fg-3 border-t border-line pt-2">만화 스티커</p>
                  <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {fxComicFiltered.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        title={sticker.label}
                        onClick={() => addFxOverlay(sticker.svg, sticker.width, sticker.height)}
                        className="group flex flex-col items-center justify-center rounded-lg border border-line bg-card p-1 hover:border-accent/50"
                      >
                        <div className="flex h-12 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.94_0.01_78)] p-1">
                          <img src={svgToDataUrl(sticker.svg)} alt={sticker.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
                        </div>
                        <span className="mt-0.5 block w-full truncate text-center text-[0.55rem] text-fg-3">{sticker.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {fxSectionVisible("creature") && fxCreatureFiltered.length > 0 && (
                <>
                  <p className="mb-1 mt-2 text-[0.66rem] font-medium text-fg-3 border-t border-line pt-2">동물·캐릭터</p>
                  <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {fxCreatureFiltered.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        title={sticker.label}
                        onClick={() => addFxOverlay(sticker.svg, sticker.width, sticker.height)}
                        className="group flex flex-col items-center justify-center rounded-lg border border-line bg-card p-1 hover:border-accent/50"
                      >
                        <div className="flex h-12 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.94_0.01_78)] p-1">
                          <img src={svgToDataUrl(sticker.svg)} alt={sticker.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
                        </div>
                        <span className="mt-0.5 block w-full truncate text-center text-[0.55rem] text-fg-3">{sticker.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {fxSectionVisible("prop") && fxPropFiltered.length > 0 && (
                <>
                  <p className="mb-1 mt-2 text-[0.66rem] font-medium text-fg-3 border-t border-line pt-2">소품·오브젝트</p>
                  <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                    {fxPropFiltered.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        title={sticker.label}
                        onClick={() => addFxOverlay(sticker.svg, sticker.width, sticker.height)}
                        className="group flex flex-col items-center justify-center rounded-lg border border-line bg-card p-1 hover:border-accent/50"
                      >
                        <div className="flex h-12 w-full items-center justify-center overflow-hidden rounded bg-[oklch(0.94_0.01_78)] p-1">
                          <img src={svgToDataUrl(sticker.svg)} alt={sticker.label} className="h-full w-full object-contain transition-transform group-hover:scale-105" />
                        </div>
                        <span className="mt-0.5 block w-full truncate text-center text-[0.55rem] text-fg-3">{sticker.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
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
                  <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">다른 검색어로 찾아보세요.</p>
                </div>
              )}
            </div>
          )}
        </div>
        <div ref={menu === "asset" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "asset" ? null : "asset")} aria-haspopup="menu" aria-expanded={menu === "asset"} className={toolBtn(menu === "asset")}>
            <Folder size={14} /> 내 에셋
          </button>
          {menu === "asset" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-3 shadow-lg">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
                  <button
                    type="button"
                    onClick={() => setAssetTab("mine")}
                    className={cn(
                      "rounded-md px-2 py-1 text-[0.65rem] font-semibold transition-colors",
                      assetTab === "mine" ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
                    )}
                  >
                    내 에셋
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssetTab("community")}
                    className={cn(
                      "flex items-center gap-1 rounded-md px-2 py-1 text-[0.65rem] font-semibold transition-colors",
                      assetTab === "community" ? "bg-accent text-white" : "text-fg-3 hover:bg-raised"
                    )}
                  >
                    <Globe size={11} /> 커뮤니티
                  </button>
                </div>
                {assetTab === "mine" && (
                  <label className="flex items-center gap-1 cursor-pointer rounded-lg bg-accent px-2 py-1 text-[0.65rem] font-medium text-white hover:bg-accent/90 transition-colors">
                    <ImagePlus size={12} /> 업로드
                    <input type="file" accept="image/*" className="hidden" onChange={onUploadAsset} />
                  </label>
                )}
              </div>

              {assetTab === "mine" && (
                <div className="mb-2 rounded-lg border border-line bg-card/70 p-2">
                  <div className="mb-1.5 flex items-center gap-1 text-[0.65rem] font-semibold text-fg-2">
                    <Sparkles size={12} className="text-accent" />
                    AI 에셋 생성
                  </div>
                  <textarea
                    value={assetPrompt}
                    onChange={(e) => setAssetPrompt(e.target.value.slice(0, 1000))}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void onGenerateAsset();
                    }}
                    placeholder="예: 비 오는 골목 배경, 마법 소품, 놀란 표정 캐릭터"
                    rows={2}
                    className="h-14 w-full resize-none rounded-md border border-line bg-panel px-2 py-1 text-[0.65rem] leading-snug text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent"
                  />
                  <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1.5">
                    <input
                      type="text"
                      value={assetPromptName}
                      onChange={(e) => setAssetPromptName(e.target.value.slice(0, 60))}
                      placeholder="이름"
                      className="min-w-0 rounded-md border border-line bg-panel px-2 py-1 text-[0.65rem] text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={onGenerateAsset}
                      disabled={!assetPrompt.trim() || assetGenerating}
                      className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-[0.65rem] font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-55"
                    >
                      {assetGenerating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                      생성
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    <select
                      value={assetPromptSize}
                      onChange={(e) => setAssetPromptSize(e.target.value as GeneratedAssetSize)}
                      className="rounded-md border border-line bg-panel px-1.5 py-1 text-[0.6rem] text-fg-2 outline-none focus:border-accent"
                    >
                      <option value="1024x1024">정사각</option>
                      <option value="1536x1024">가로 배경</option>
                      <option value="1024x1536">세로 컷</option>
                    </select>
                    <select
                      value={assetPromptQuality}
                      onChange={(e) => setAssetPromptQuality(e.target.value as GeneratedAssetQuality)}
                      className="rounded-md border border-line bg-panel px-1.5 py-1 text-[0.6rem] text-fg-2 outline-none focus:border-accent"
                    >
                      <option value="low">빠르게</option>
                      <option value="medium">표준</option>
                      <option value="high">고품질</option>
                      <option value="auto">자동</option>
                    </select>
                  </div>
                </div>
              )}

              {/* 검색 및 정렬 필터 */}
              <div className="mb-2 flex items-center gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" />
                  <input
                    type="text"
                    placeholder="에셋 검색..."
                    value={assetSearchQuery}
                    onChange={(e) => setAssetSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-line bg-card py-1 pl-6 pr-5 text-[0.65rem] placeholder-fg-4 outline-none focus:border-accent transition-colors"
                  />
                  {assetSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAssetSearchQuery("")}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-fg-4 hover:text-fg-2 transition-colors"
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
                <select
                  value={assetSortOrder}
                  onChange={(e) => setAssetSortOrder(e.target.value as any)}
                  className="rounded-lg border border-line bg-card px-1.5 py-1 text-[0.65rem] text-fg-2 outline-none focus:border-accent transition-colors cursor-pointer"
                >
                  <option value="newest">최신순</option>
                  <option value="name">이름순</option>
                  <option value="size">크기순</option>
                </select>
              </div>

              {assetTab === "mine" ? (
                assetsLoading ? (
                  <div className="flex h-32 items-center justify-center text-fg-3">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : assets.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                    <p className="text-xs text-fg-3">업로드한 에셋이 없습니다 …</p>
                    <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">자주 쓰는 이미지를 업로드해 편리하게 사용해 보세요.</p>
                  </div>
                ) : filteredAssets.length === 0 ? (
                  <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                    <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
                    <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">다른 검색어로 찾아보세요.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                    {filteredAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="group relative flex flex-col items-center rounded-lg border border-line bg-card p-1.5 hover:border-accent/50 cursor-grab active:cursor-grabbing"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(
                            "application/json-asset",
                            JSON.stringify({ src: asset.dataUrl, width: asset.width, height: asset.height })
                          );
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            addRenderedImage(asset.dataUrl, asset.width, asset.height);
                            setMenu(null);
                          }}
                          className="w-full h-16 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center cursor-pointer"
                          title={asset.name}
                        >
                          <img src={asset.dataUrl} alt={asset.name} className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105" />
                        </button>
                        {renamingAssetId === asset.id ? (
                          <div className="mt-1 flex w-full items-center gap-0.5">
                            <input
                              type="text"
                              value={renamingAssetName}
                              onChange={(e) => setRenamingAssetName(e.target.value)}
                              className="w-full min-w-0 rounded border border-accent bg-panel px-1 py-0.5 text-[0.55rem] text-fg-1 outline-none"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleRenameAsset(asset.id);
                                } else if (e.key === "Escape") {
                                  setRenamingAssetId(null);
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => handleRenameAsset(asset.id)}
                              className="rounded bg-accent p-0.5 text-white hover:bg-accent/90 shrink-0"
                              title="확인"
                            >
                              <Check size={8} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingAssetId(null)}
                              className="rounded bg-line p-0.5 text-fg-3 hover:bg-raised shrink-0"
                              title="취소"
                            >
                              <X size={8} />
                            </button>
                          </div>
                        ) : (
                          <span
                            className="mt-1 block w-full truncate text-center text-[0.6rem] font-medium text-fg-2 cursor-text"
                            title={asset.name}
                            onDoubleClick={() => {
                              setRenamingAssetId(asset.id);
                              setRenamingAssetName(asset.name);
                            }}
                          >
                            {asset.name}
                          </span>
                        )}
                        <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setRenamingAssetId(asset.id);
                              setRenamingAssetName(asset.name);
                            }}
                            className="flex size-5 items-center justify-center rounded bg-black/60 text-white hover:bg-accent"
                            title="이름 변경"
                          >
                            <Pencil size={10} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onShareAsset(asset)}
                            disabled={publishingId === asset.id}
                            className="flex size-5 items-center justify-center rounded bg-black/60 text-white hover:bg-accent disabled:opacity-50"
                            title="커뮤니티에 공유"
                          >
                            {publishingId === asset.id ? <Loader2 size={10} className="animate-spin" /> : <Share2 size={10} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteAsset(asset.id)}
                            className="flex size-5 items-center justify-center rounded bg-black/60 text-white hover:bg-red-500"
                            title="삭제"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : sharedLoading ? (
                <div className="flex h-32 items-center justify-center text-fg-3">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : sharedError ? (
                <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                  <p className="text-xs text-fg-3">{sharedError}</p>
                  <button type="button" onClick={loadSharedAssets} className="mt-2 rounded-md border border-line px-2 py-1 text-[0.6rem] text-fg-2 hover:bg-raised">
                    다시 시도
                  </button>
                </div>
              ) : shared.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                  <p className="text-xs text-fg-3">아직 공유된 에셋이 없어요.</p>
                  <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">내 에셋 탭에서 공유 버튼을 눌러 첫 에셋을 올려보세요.</p>
                </div>
              ) : filteredShared.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center rounded-lg border border-dashed border-line p-4 text-center">
                  <p className="text-xs text-fg-3">검색 결과가 없습니다.</p>
                  <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">다른 검색어로 찾아보세요.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                  {filteredShared.map((asset) => (
                    <div
                      key={asset.id}
                      className="group relative flex flex-col items-center rounded-lg border border-line bg-card p-1.5 hover:border-accent/50 cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/json-asset",
                          JSON.stringify({ src: asset.dataUrl, width: asset.width, height: asset.height })
                        );
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onUseSharedAsset(asset)}
                        className="w-full h-16 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center cursor-pointer"
                        title={`${asset.name} · ${asset.author.name}`}
                      >
                        <img src={asset.dataUrl} alt={asset.name} className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105" />
                      </button>
                      <span className="mt-1 block w-full truncate text-center text-[0.6rem] font-medium text-fg-2" title={asset.name}>
                        {asset.name}
                      </span>
                      <span className="block w-full truncate text-center text-[0.55rem] text-fg-4">{asset.author.name}</span>
                      {asset.isOwner && (
                        <button
                          type="button"
                          onClick={() => onDeleteSharedAsset(asset.id)}
                          className="absolute right-1 top-1 flex size-5 items-center justify-center rounded bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                          title="공유 취소(삭제)"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <label className={cn(toolBtn(false), "cursor-pointer")} title="이미지 추가 (⌘V로 클립보드 이미지 붙여넣기 가능)">
          <ImagePlus size={14} /> 이미지
          <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </label>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <span className="inline-flex items-center gap-1.5 text-xs text-fg-3">
          색
          <StudioColorPopover
            value={color}
            onChange={setColor}
            recentColors={recentColors}
            onUseColor={rememberColor}
            title="브러시·도형 색상"
          />
        </span>
        {tool === "draw" && (
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line/70 bg-card/65 px-3 py-1.5 shadow-md">
            {/* Brush Presets Group */}
            {drawMode === "pen" && (
              <>
                <div className="flex items-center gap-1 bg-panel/30 rounded-lg p-0.5 border border-line/40" aria-label="브러시 프리셋">
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
                          active ? "bg-accent text-accent-fg shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg"
                        )}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                <div className="mx-0.5 h-5 w-px bg-line/60" />
              </>
            )}

            {/* Colors Group */}
            {drawMode !== "eraser" && (
              <>
                <div className="flex items-center gap-1" aria-label="브러시 색상 설정">
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
                          color.toLowerCase() === swatch.toLowerCase() ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : "border border-line/60"
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
                <div className="mx-0.5 h-5 w-px bg-line/60" />
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
        <span className="mx-0.5 h-5 w-px bg-line" />
        <div className="flex items-center gap-1">
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
                setScale(Math.min(1, w / CANVAS_W));
                setZoom(1);
              }
            }}
            className={cn(toolBtn(false), "h-8 text-[10px] font-semibold px-2")}
            title="너비에 맞춤"
          >
            맞춤
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* 왼쪽: 페이지 목록 사이드바 */}
        <div className="w-full lg:w-44 flex-shrink-0 flex flex-col gap-2 rounded-2xl border border-line bg-panel/20 p-3">
          <div className="flex items-center justify-between border-b border-line/50 pb-2">
            <span className="text-xs font-bold text-fg-2">페이지 목록</span>
            <button
              type="button"
              onClick={addPage}
              className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-semibold text-on-accent hover:bg-accent-hover"
            >
              <Plus size={10} /> 추가
            </button>
          </div>
          <div className="flex flex-row lg:flex-col gap-1.5 overflow-x-auto lg:overflow-y-auto max-h-[80px] lg:max-h-[calc(100dvh-24rem)] pr-1">
            {pages.map((p, idx) => {
              const isActive = p.id === currentPageId;
              return (
                <div
                  key={p.id}
                  onClick={() => setCurrentPageId(p.id)}
                  className={cn(
                    "flex min-w-[100px] lg:min-w-0 lg:w-full cursor-pointer flex-col gap-1 rounded-xl border p-2 transition-all hover:bg-raised/50",
                    isActive ? "border-accent bg-accent-soft/40" : "border-line bg-card"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10px] font-bold text-fg-2">{idx + 1}페이지</span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          movePageUp(p.id);
                        }}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-fg-3 hover:bg-raised disabled:opacity-30"
                        title="위로 이동"
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
                      >
                        <ChevronDown size={10} />
                      </button>
                    </div>
                  </div>
                  {/* 미니 미리보기 박스 */}
                  <div
                    style={{
                      height: "48px",
                      background: p.bgGrad ? `linear-gradient(${p.bgGrad[0]}, ${p.bgGrad[1]})` : p.bg,
                    }}
                    className="relative rounded border border-line/60 overflow-hidden"
                  >
                    {/* Render panels in thumbnail */}
                    {p.elements.filter(el => el.type === "frame").map((el) => {
                      const bounds = elBounds(el);
                      return (
                        <div
                          key={`thumb-frame-${el.id}`}
                          className="absolute border border-red-500/30 bg-red-500/5 pointer-events-none"
                          style={{
                            left: `${(bounds.x / CANVAS_W) * 100}%`,
                            top: `${(bounds.y / p.canvasH) * 100}%`,
                            width: `${(bounds.w / CANVAS_W) * 100}%`,
                            height: `${(bounds.h / p.canvasH) * 100}%`,
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-end gap-1.5 pt-1">
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
                        if (pages.length <= 1) return;
                        if (window.confirm(`${idx + 1}페이지를 삭제할까요?`)) {
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

        {/* 중앙: 캔버스 영역 */}
        <div className="flex-1 min-w-0">
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

          {/* 고정높이 스크롤 뷰포트: 줌·긴 캔버스 시 내부 스크롤, 컨트롤은 바깥에 고정 */}
          <div
            ref={wrapRef}
            onMouseDown={onWrapMouseDown}
            onMouseMove={onWrapMouseMove}
            onMouseUp={onWrapMouseUp}
            onMouseLeave={onWrapMouseUp}
            onDragOver={onWrapDragOver}
            onDrop={onWrapDrop}
            className={cn(
              "max-h-[calc(100dvh-21rem)] min-h-[20rem] overflow-auto rounded-2xl border border-line bg-[repeating-conic-gradient(#0000000a_0deg_90deg,transparent_90deg_180deg)] [background-size:24px_24px] transition-all",
              isSpacePressed ? (isPanning ? "cursor-grabbing select-none" : "cursor-grab select-none") : ""
            )}
          >
          {/* 페이지 색보정 미리보기: Stage에 CSS filter, 그 위에 비네트 오버레이(내보내기 때 픽셀로 합성) */}
          <div className="relative" style={{ width: CANVAS_W * effScale, height: canvasH * effScale }}>
          <div style={pageGradeCss ? { filter: pageGradeCss } : undefined}>
          <Stage
            ref={stageRef}
            width={CANVAS_W * effScale}
            height={canvasH * effScale}
            scaleX={effScale}
            scaleY={effScale}
            onPointerDown={onStageDown}
            onPointerMove={onStageMove}
            onPointerUp={onStageUp}
            onMouseLeave={hideBrushCursor}
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
                  const elId = Object.keys(nodeRefs.current).find((key) => {
                    const node = nodeRefs.current[key];
                    return node && (node === shape || shape.isAncestorOf(node));
                  });
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
            <Layer>
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
              {(() => {
                // 한 요소를 렌더하는 함수. opts.asMask=클리핑 마스크의 베이스 사본(비상호작용),
                // opts.compositeOverride=알파 클리핑 자식의 "source-in" 합성.
                const renderEl = (el: El, idx: number, opts: { asMask?: boolean; compositeOverride?: string } = {}) => {
                const locked = isEffectivelyLocked(el, groups);
                const draggable = !opts.asMask && tool === "select" && !locked;
                const onSelect = opts.asMask ? () => {} : () => tool === "select" && !locked && setSelectedId(el.id);
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
                  const composite = opts.compositeOverride ?? ((el.blendMode as any) || "source-over");
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
                if (el.type === "image")
                  return wrapClip(
                    <UrlImage
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch)}
                      dragBoundFunc={snapBoundFunc}
                    />
                  );
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
                if (el.type === "draw")
                  return wrapClip(<StudioDrawNode key={el.id} el={el} />);
                if (el.type === "text" && el.textPath && !isFlatTextPath(normalizeTextPath(el.textPath)))
                  return wrapClip(
                    <KTextPath
                      key={el.id}
                      ref={setRef}
                      text={el.text}
                      x={el.x}
                      y={el.y}
                      data={buildTextPathData(normalizeTextPath(el.textPath), el.width, el.fontSize)}
                      fontSize={el.fontSize}
                      fill={el.fillType === "gradient" ? (el.gradientColorStart ?? "#ff3b30") : el.fill}
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
                      draggable={draggable}
                      dragBoundFunc={snapBoundFunc}
                      onMouseDown={onSelect}
                      onTap={onSelect}
                      onDblClick={() => startEditText(el.id)}
                      onDblTap={() => startEditText(el.id)}
                      onDragEnd={(e) => patchEl(el.id, { x: e.target.x(), y: e.target.y() })}
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
                      key={el.id}
                      ref={setRef}
                      text={el.vertical ? formatVerticalText(el.text) : el.text}
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      fontSize={el.fontSize}
                      fill={el.fillType === "gradient" ? undefined : el.fill}
                      fillLinearGradientStartPoint={el.fillType === "gradient" ? { x: 0, y: 0 } : undefined}
                      fillLinearGradientEndPoint={el.fillType === "gradient" ? (el.gradientDirection === "horizontal" ? { x: el.width, y: 0 } : { x: 0, y: el.fontSize * 1.3 }) : undefined}
                      fillLinearGradientColorStops={el.fillType === "gradient" ? [0, el.gradientColorStart ?? "#ff3b30", 1, el.gradientColorEnd ?? "#ffcc00"] : undefined}
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
                      draggable={draggable}
                      dragBoundFunc={snapBoundFunc}
                      onMouseDown={onSelect}
                      onTap={onSelect}
                      onDblClick={() => startEditText(el.id)}
                      onDblTap={() => startEditText(el.id)}
                      onDragEnd={(e) => patchEl(el.id, { x: e.target.x(), y: e.target.y() })}
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
                      key={el.id}
                      ref={setRef}
                      text={el.text}
                      x={el.x}
                      y={el.y}
                      fontSize={el.fontSize}
                      rotation={el.rotation}
                      opacity={el.opacity ?? 1}
                      draggable={draggable}
                      dragBoundFunc={snapBoundFunc}
                      onMouseDown={onSelect}
                      onTap={onSelect}
                      onDblClick={() => startEditText(el.id)}
                      onDblTap={() => startEditText(el.id)}
                      onDragEnd={(e) => patchEl(el.id, { x: e.target.x(), y: e.target.y() })}
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
                let bStroke = el.stroke ?? "#16100c";
                let bStrokeW = el.strokeWidth ?? 3;
                let bRadius = 18;
                let bShadowColor = el.shadowColor !== undefined ? el.shadowColor : undefined;
                let bShadowBlur = el.shadowBlur !== undefined ? el.shadowBlur : 0;
                let bShadowOpacity = el.shadowOpacity !== undefined ? el.shadowOpacity : 0;
                let bShadowOffset = el.shadowOffsetX !== undefined && el.shadowOffsetY !== undefined
                  ? { x: el.shadowOffsetX, y: el.shadowOffsetY }
                  : undefined;
                const tXRatio = el.tailXRatio ?? 0.35;
                const tHeight = el.tailHeight ?? 30;
                const tailDir = el.tail ?? "left";
                const tailDirection = el.tailDirection ?? "bottom";
                const showTail = tailDir !== "none";

                // 테마별 파라미터 사전 계산
                let themeOffset = 3;
                let tHeightWithTheme = tHeight;
                let borderRatio = 0.08;

                if (webtoonTheme === "soft") {
                  bStroke = el.stroke ?? "#2d2d2d";
                  bStrokeW = el.strokeWidth ?? 1.8;
                  bRadius = 24;
                  themeOffset = 2;
                  tHeightWithTheme = tHeight - 10;
                  borderRatio = 0.08;
                } else if (webtoonTheme === "vivid") {
                  bStroke = el.stroke ?? "#444444";
                  bStrokeW = el.strokeWidth ?? 1.0;
                  bRadius = Math.min(el.width, el.height) / 2;
                  if (el.shadowColor === undefined) {
                    bShadowColor = "black";
                    bShadowBlur = 8;
                    bShadowOpacity = 0.12;
                    bShadowOffset = { x: 2, y: 3 };
                  }
                  themeOffset = 2;
                  tHeightWithTheme = tHeight - 14;
                  borderRatio = 0.06;
                }

                // tailDirection에 따른 bTailPoints 좌표 계산
                let bTailPoints: number[] = [];
                if (tailDirection === "bottom") {
                  bTailPoints = [
                    el.width * Math.max(0.1, tXRatio - borderRatio),
                    el.height - themeOffset,
                    el.width * tXRatio,
                    el.height + tHeightWithTheme,
                    el.width * Math.min(0.9, tXRatio + borderRatio),
                    el.height - themeOffset
                  ];
                } else if (tailDirection === "top") {
                  bTailPoints = [
                    el.width * Math.max(0.1, tXRatio - borderRatio),
                    themeOffset,
                    el.width * tXRatio,
                    -tHeightWithTheme,
                    el.width * Math.min(0.9, tXRatio + borderRatio),
                    themeOffset
                  ];
                } else if (tailDirection === "left") {
                  bTailPoints = [
                    themeOffset,
                    el.height * Math.max(0.1, tXRatio - borderRatio),
                    -tHeightWithTheme,
                    el.height * tXRatio,
                    themeOffset,
                    el.height * Math.min(0.9, tXRatio + borderRatio)
                  ];
                } else if (tailDirection === "right") {
                  bTailPoints = [
                    el.width - themeOffset,
                    el.height * Math.max(0.1, tXRatio - borderRatio),
                    el.width + tHeightWithTheme,
                    el.height * tXRatio,
                    el.width - themeOffset,
                    el.height * Math.min(0.9, tXRatio + borderRatio)
                  ];
                }

                const flipTailX = (pts: number[]) => {
                  if (tailDir !== "right") return pts;
                  if (tailDirection === "bottom" || tailDirection === "top") {
                    return pts.map((v, i) => (i % 2 === 0 ? el.width - v : v));
                  }
                  return pts;
                };

                const speechTailPts = flipTailX(bTailPoints);

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

                let thoughtEllipses = null;
                if (showTail) {
                  if (tailDirection === "bottom") {
                    thoughtEllipses = (
                      <>
                        <Ellipse x={thoughtBigX} y={el.height + 12} radiusX={13} radiusY={10} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                        <Ellipse x={thoughtSmallX} y={el.height + 32} radiusX={8} radiusY={7} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                      </>
                    );
                  } else if (tailDirection === "top") {
                    thoughtEllipses = (
                      <>
                        <Ellipse x={thoughtBigX} y={-12} radiusX={13} radiusY={10} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                        <Ellipse x={thoughtSmallX} y={-32} radiusX={8} radiusY={7} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                      </>
                    );
                  } else if (tailDirection === "left") {
                    const bigY = tailDir === "right" ? el.height * 0.74 : el.height * 0.26;
                    const smallY = tailDir === "right" ? el.height * 0.84 : el.height * 0.16;
                    thoughtEllipses = (
                      <>
                        <Ellipse x={-12} y={bigY} radiusX={10} radiusY={13} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                        <Ellipse x={-32} y={smallY} radiusX={7} radiusY={8} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                      </>
                    );
                  } else if (tailDirection === "right") {
                    const bigY = tailDir === "right" ? el.height * 0.74 : el.height * 0.26;
                    const smallY = tailDir === "right" ? el.height * 0.84 : el.height * 0.16;
                    thoughtEllipses = (
                      <>
                        <Ellipse x={el.width + 12} y={bigY} radiusX={10} radiusY={13} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                        <Ellipse x={el.width + 32} y={smallY} radiusX={7} radiusY={8} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
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

                return wrapClip(
                  <Group
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
                        numPoints={18}
                        innerRadius={44}
                        outerRadius={62}
                        scaleX={el.width / 124}
                        scaleY={el.height / 124}
                        fill={el.fill}
                        stroke={bStroke}
                        strokeWidth={bStrokeW}
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
                      <>
                        <Rect
                          width={el.width}
                          height={el.height}
                          fill={el.fill}
                          cornerRadius={bRadius}
                          stroke={bStroke}
                          strokeWidth={bStrokeW}
                          dash={[8, 5]}
                        />
                        {showTail && (
                          <Line
                            points={speechTailPts}
                            closed
                            fill={el.fill}
                            stroke={bStroke}
                            strokeWidth={bStrokeW}
                            dash={[8, 5]}
                          />
                        )}
                      </>
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
                        numPoints={14}
                        innerRadius={36}
                        outerRadius={58}
                        scaleX={el.width / 116}
                        scaleY={el.height / 116}
                        fill={el.fill}
                        stroke="#dc2626"
                        strokeWidth={3.5}
                      />
                    ) : el.variant === "phone" ? (
                      <>
                        <Rect
                          width={el.width}
                          height={el.height}
                          fill={el.fill}
                          cornerRadius={12}
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
                      <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={3} stroke={bStroke} strokeWidth={bStrokeW} />
                    ) : (
                      <>
                        <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={bRadius} stroke={bStroke} strokeWidth={bStrokeW} />
                        {showTail && (
                          <Line
                            points={speechTailPts}
                            closed
                            fill={el.fill}
                            stroke={bStroke}
                            strokeWidth={bStrokeW}
                          />
                        )}
                      </>
                    )}
                    <KText
                      text={el.vertical ? formatVerticalText(el.text) : el.text}
                      width={el.width - 36}
                      height={el.height - 24}
                      x={18}
                      y={12}
                      fontSize={el.fontSize ?? 24}
                      fontFamily={el.font ?? "Pretendard, sans-serif"}
                      fontStyle={el.fontStyle ?? "bold"}
                      fill={el.textFill}
                      align={el.align ?? "center"}
                      verticalAlign="middle"
                      lineHeight={el.lineHeight ?? 1.1}
                    />
                  </Group>
                );
                };
                return elements.map((el, idx) => {
                  if (isEffectivelyHidden(el, groups)) return null; // 숨긴 레이어/그룹은 렌더·내보내기에서 제외
                  const base = el.clipBelow && idx > 0 ? elements[idx - 1] : null;
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
                    ].join("|");
                    return (
                      <ClipMaskGroup key={el.id} cacheKey={ck}>
                        {renderEl(base, idx - 1, { asMask: true })}
                        {renderEl(el, idx, { compositeOverride: "source-in" })}
                      </ClipMaskGroup>
                    );
                  }
                  return renderEl(el, idx);
                });
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
            className="absolute bottom-3 right-3 z-30 grid size-10 place-items-center rounded-full border border-line bg-panel/95 text-sm font-bold text-fg shadow-lg backdrop-blur transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="빠른 시작 도움말 열기"
            aria-expanded={showQuickStart}
            title="빠른 시작"
          >
            ?
          </button>

          <button
            type="button"
            onClick={() => setShortcutsOpen(true)}
            className="absolute bottom-3 right-16 z-30 grid size-10 place-items-center rounded-full border border-line bg-panel/95 text-base text-fg shadow-lg backdrop-blur transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            aria-label="키보드 단축키 보기"
            title="키보드 단축키 (?)"
          >
            ⌨
          </button>

          <StudioShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

          {/* 캔버스 줌 컨트롤 — ⌘± / ⌘0 단축키 또는 ⌘+휠과 동일 동작 */}
          <div className="absolute bottom-3 left-3 z-30 flex items-center gap-0.5 rounded-full border border-line bg-panel/95 p-0.5 shadow-lg backdrop-blur">
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

        {/* 사이드: 속성 + 게시 정보 */}
        <aside className="flex flex-col gap-4">
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
              <p className="mb-1 text-[0.62rem] font-medium text-fg-3">그라디언트 배경</p>
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
            <label className="mt-3 flex items-center justify-between gap-2 text-sm text-fg-2">
              높이
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => setCanvasH((h) => Math.max(480, h - 240))} className="rounded border border-line px-2 text-fg-2 hover:bg-raised">
                  −
                </button>
                <span className="numeral w-12 text-center text-xs">{canvasH}</span>
                <button type="button" onClick={() => setCanvasH((h) => Math.min(6000, h + 240))} className="rounded border border-line px-2 text-fg-2 hover:bg-raised">
                  +
                </button>
              </span>
            </label>
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
                    className="flex-1 rounded border border-line bg-card py-1 text-[0.62rem] font-semibold text-fg hover:bg-raised transition-colors cursor-pointer"
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
                    className="flex-1 rounded border border-line bg-card py-1 text-[0.62rem] font-semibold text-fg hover:bg-raised transition-colors cursor-pointer"
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
                      "rounded py-1 text-[0.6rem] font-semibold transition-colors",
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
            <StudioPageGradePanel
              grade={pageGrade}
              onPatch={patchPageGrade}
              onApplyPreset={applyPageGrade}
              onReset={resetPageGrade}
            />
          </div>

          {selected && (
            <div className="rounded-2xl border border-line bg-panel/40 p-3">
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

                  {/* 도형 타입(rect, ellipse, star)일 경우 채우기 색상 조절 */}
                  {(selected.kind === "rect" || selected.kind === "ellipse" || selected.kind === "star") && (
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
                          "flex-1 rounded py-1 text-[0.62rem] font-semibold transition-colors",
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
                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        시작 색상
                        <input
                          type="color"
                          value={selected.gradientColorStart || "#ff3b30"}
                          onChange={(e) => patchEl(selected.id, { gradientColorStart: e.target.value } as Partial<El>)}
                          className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                        />
                      </label>
                      
                      <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        종료 색상
                        <input
                          type="color"
                          value={selected.gradientColorEnd || "#ffcc00"}
                          onChange={(e) => patchEl(selected.id, { gradientColorEnd: e.target.value } as Partial<El>)}
                          className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                        />
                      </label>

                      <div className="flex items-center justify-between gap-2 text-sm text-fg-2">
                        <span>그라데이션 방향</span>
                        <div className="flex gap-1 bg-card rounded-lg p-0.5 border border-line w-28">
                          {[
                            { label: "가로", v: "horizontal" },
                            { label: "세로", v: "vertical" }
                          ].map((dir) => (
                            <button
                              key={dir.v}
                              type="button"
                              onClick={() => patchEl(selected.id, { gradientDirection: dir.v as "horizontal" | "vertical" } as Partial<El>)}
                              className={cn(
                                "flex-1 rounded py-0.5 text-[0.6rem] font-semibold transition-colors",
                                (selected.gradientDirection ?? "vertical") === dir.v
                                  ? "bg-accent text-on-accent"
                                  : "text-fg-2 hover:bg-raised"
                              )}
                            >
                              {dir.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              {selected.type === "bubble" && (
                <>
                  <div className="mt-2.5 pb-2.5 border-b border-line/40">
                    <p className="mb-2 text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">스타일 프리셋</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {BUBBLE_STYLE_PRESETS.map((p) => {
                        const isMatch =
                          selected.fill === p.fill &&
                          selected.textFill === p.textFill &&
                          (p.stroke ? selected.stroke === p.stroke : !selected.stroke) &&
                          (p.strokeWidth ? selected.strokeWidth === p.strokeWidth : true);
                        
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              patchEl(selected.id, {
                                fill: p.fill,
                                textFill: p.textFill,
                                stroke: p.stroke,
                                strokeWidth: p.strokeWidth,
                                shadowColor: p.shadowColor,
                                shadowBlur: p.shadowBlur,
                                shadowOffsetX: p.shadowOffsetX,
                                shadowOffsetY: p.shadowOffsetY,
                                shadowOpacity: p.shadowOpacity,
                                font: p.font ?? selected.font,
                              } as Partial<El>);
                            }}
                            className={cn(
                              "flex flex-col items-start p-1.5 rounded-lg border text-left transition-all hover:bg-raised/70 cursor-pointer",
                              isMatch
                                ? "border-accent bg-accent-soft/40 shadow-sm"
                                : "border-line bg-card"
                            )}
                            title={p.description}
                          >
                            <span className="text-[0.65rem] font-semibold text-fg mb-1">{p.label}</span>
                            <div className="flex items-center gap-1 w-full mt-auto">
                              <span
                                className="size-3.5 rounded-full border border-line shadow-sm flex items-center justify-center text-[8px] font-bold"
                                style={{
                                  backgroundColor: p.fill === "transparent" ? "transparent" : p.fill,
                                  color: p.textFill,
                                  borderColor: p.stroke || "rgba(0,0,0,0.15)",
                                  borderWidth: p.stroke ? "1.5px" : "1px"
                                }}
                              >
                                가
                              </span>
                              <span className="text-[0.55rem] text-fg-3 truncate">{p.description}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

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
                      <StudioColorPopover
                        value={selected.fill}
                        onChange={(c) => patchEl(selected.id, { fill: c } as Partial<El>)}
                        recentColors={recentColors}
                        onUseColor={rememberColor}
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
                              className="w-20 accent-accent cursor-pointer sm:w-24"
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
                              className="w-20 accent-accent cursor-pointer sm:w-24"
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
                              className="w-20 accent-accent cursor-pointer sm:w-24"
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
                              className="w-20 accent-accent cursor-pointer sm:w-24"
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
                              className="w-20 accent-accent cursor-pointer sm:w-24"
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
                              "rounded px-2 py-0.5 text-[0.62rem] font-medium transition-colors cursor-pointer",
                              (selected.tail ?? "left") === t.v
                                ? "bg-accent text-accent-fg shadow-sm font-semibold"
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
                                "rounded px-1.5 py-0.5 text-[0.62rem] font-medium transition-colors cursor-pointer",
                                (selected.tailDirection ?? "bottom") === td.v
                                  ? "bg-accent text-accent-fg shadow-sm font-semibold"
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
                <div className="mt-3 space-y-2 border-t border-line/40 pt-2.5">
                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    {(selected.tailDirection === "left" || selected.tailDirection === "right") ? "꼬리 세로 위치" : "꼬리 가로 위치"}
                    <span className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={0.1}
                        max={0.9}
                        step={0.05}
                        value={selected.tailXRatio ?? 0.35}
                        onChange={(e) => patchEl(selected.id, { tailXRatio: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{Math.round((selected.tailXRatio ?? 0.35) * 100)}%</span>
                    </span>
                  </label>
                  <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                    꼬리 길이
                    <span className="flex items-center gap-1.5">
                      <input
                        type="range"
                        min={10}
                        max={80}
                        step={2}
                        value={selected.tailHeight ?? 30}
                        onChange={(e) => patchEl(selected.id, { tailHeight: Number(e.target.value) } as Partial<El>)}
                        className="w-24 accent-accent cursor-pointer"
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-fg-3">{selected.tailHeight ?? 30}px</span>
                    </span>
                  </label>
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
                                active ? "bg-accent text-accent-fg shadow-sm" : "text-fg-3 hover:bg-raised hover:text-fg-2"
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
                                  let nextStyle: "normal" | "bold" | "italic" | "bold italic" = "normal";
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
                                  let nextStyle: "normal" | "bold" | "italic" | "bold italic" = "normal";
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
                  <StudioTextEffectPanel onApply={(patch) => patchEl(selected.id, patch as Partial<El>)} />
                </div>
              )}
              {/* 곡선 텍스트 — 아치/물결/원형 경로(Konva TextPath). */}
              {selected.type === "text" && (
                <div className="mt-2.5 border-t border-line/40 pt-2.5">
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
                            className="w-20 accent-accent cursor-pointer sm:w-24"
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
                        className="w-20 accent-accent cursor-pointer sm:w-24"
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
                        className="w-20 accent-accent cursor-pointer sm:w-24"
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
                            className="w-20 accent-accent cursor-pointer sm:w-24"
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
                            className="w-20 accent-accent cursor-pointer sm:w-24"
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
                            className="w-20 accent-accent cursor-pointer sm:w-24"
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
                            className="w-20 accent-accent cursor-pointer sm:w-24"
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
                  </select>
                </label>
              )}

              {/* 직접 좌표 및 크기 조정 (코미포 스타일) */}
              {selected.type !== "draw" && (
                <div className="mt-3 border-t border-line/50 pt-3 space-y-2">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">위치 및 크기</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[0.6rem] text-fg-3">가로 위치 (X)</span>
                      <input
                        type="number"
                        value={Math.round(selected.x)}
                        onChange={(e) => patchEl(selected.id, { x: Number(e.target.value) } as Partial<El>)}
                        className="rounded border border-line bg-background/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[0.6rem] text-fg-3">세로 위치 (Y)</span>
                      <input
                        type="number"
                        value={Math.round(selected.y)}
                        onChange={(e) => patchEl(selected.id, { y: Number(e.target.value) } as Partial<El>)}
                        className="rounded border border-line bg-background/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
                      />
                    </label>
                    {(selected.type === "image" || selected.type === "bubble" || selected.type === "frame" || selected.type === "text") && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[0.6rem] text-fg-3">너비 (Width)</span>
                        <input
                          type="number"
                          value={Math.round(selected.type === "text" ? selected.width : selected.width)}
                          onChange={(e) => patchEl(selected.id, { width: Math.max(10, Number(e.target.value)) } as Partial<El>)}
                          className="rounded border border-line bg-background/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
                        />
                      </label>
                    )}
                    {(selected.type === "image" || selected.type === "bubble" || selected.type === "frame") && (
                      <label className="flex flex-col gap-0.5">
                        <span className="text-[0.6rem] text-fg-3">높이 (Height)</span>
                        <input
                          type="number"
                          value={Math.round(selected.height)}
                          onChange={(e) => patchEl(selected.id, { height: Math.max(10, Number(e.target.value)) } as Partial<El>)}
                          className="rounded border border-line bg-background/50 px-2 py-0.5 text-xs text-fg focus:border-accent focus:outline-none"
                        />
                      </label>
                    )}
                    {(selected.type === "image" || selected.type === "text" || selected.type === "bubble" || selected.type === "sticker") && (
                      <label className="flex flex-col gap-0.5 col-span-2">
                        <span className="text-[0.6rem] text-fg-3">회전 (Rotation)</span>
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
                            className="w-14 rounded border border-line bg-background/50 px-1 py-0.5 text-center text-xs text-fg focus:border-accent focus:outline-none"
                          />
                        </div>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* 집중선 및 속도선 선 효과 설정 */}
              {selected.type === "focusLines" && (
                <div className="mt-3 space-y-3 border-t border-line/50 pt-3">
                  <p className="text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider">집중선 설정</p>

                  <div className="space-y-1 rounded-lg border border-line bg-card/45 p-2">
                    <p className="text-[0.6rem] font-semibold text-fg-3">집중선 프리셋</p>
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
                    <p className="text-[0.6rem] font-semibold text-fg-3">속도선 프리셋</p>
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
                              className="w-20 accent-accent cursor-pointer sm:w-24"
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
                                  "flex-1 rounded py-0.5 text-[0.6rem] font-semibold transition-colors",
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

              {/* 이미지 필터 효과 — 원클릭 프리셋 + 보정 슬라이더(StudioImageFilterPanel) */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioImageFilterPanel
                    values={selected}
                    onPatch={(patch) => patchEl(selected.id, patch as Partial<El>)}
                  />
                </div>
              )}
              {/* 레벨 보정(Levels) — 입력/출력 검정·흰점 + 감마. ImageEl의 levels* 필드와 매핑. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioLevelsPanel
                    value={normalizeLevels({
                      blackPoint: selected.levelsBlack,
                      whitePoint: selected.levelsWhite,
                      gamma: selected.levelsGamma,
                      outBlack: selected.levelsOutBlack,
                      outWhite: selected.levelsOutWhite,
                    })}
                    onPatch={(patch) =>
                      patchEl(selected.id, {
                        ...(patch.blackPoint !== undefined ? { levelsBlack: patch.blackPoint } : {}),
                        ...(patch.whitePoint !== undefined ? { levelsWhite: patch.whitePoint } : {}),
                        ...(patch.gamma !== undefined ? { levelsGamma: patch.gamma } : {}),
                        ...(patch.outBlack !== undefined ? { levelsOutBlack: patch.outBlack } : {}),
                        ...(patch.outWhite !== undefined ? { levelsOutWhite: patch.outWhite } : {}),
                      } as Partial<El>)
                    }
                    onApplyPreset={(p: LevelsParams) =>
                      patchEl(selected.id, {
                        levelsBlack: p.blackPoint,
                        levelsWhite: p.whitePoint,
                        levelsGamma: p.gamma,
                        levelsOutBlack: p.outBlack,
                        levelsOutWhite: p.outWhite,
                      } as Partial<El>)
                    }
                    onReset={() =>
                      patchEl(selected.id, {
                        levelsBlack: undefined,
                        levelsWhite: undefined,
                        levelsGamma: undefined,
                        levelsOutBlack: undefined,
                        levelsOutWhite: undefined,
                      } as Partial<El>)
                    }
                  />
                </div>
              )}
              {/* 레이어 스타일 — 드롭 섀도/글로우/둥근 모서리(Konva.Image 네이티브). */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioLayerStylePanel
                    values={selected as LayerStylePatch}
                    onPatch={(patch) => patchEl(selected.id, patch as Partial<El>)}
                  />
                </div>
              )}
              {/* 톤 커브 (Curves) — 점 드래그로 임의 톤 곡선을 만든다. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioCurvePanel
                    points={normalizeCurve(selected.curve)}
                    onChange={(pts: CurvePoint[]) => patchEl(selected.id, { curve: pts } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { curve: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 컬러 밸런스 — 그림자/중간톤/하이라이트별 색 이동(시네마틱 톤). */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioColorBalancePanel
                    value={normalizeColorBalance(selected.colorBalance)}
                    onPatch={(patch: Partial<ColorBalance>) =>
                      patchEl(selected.id, {
                        colorBalance: normalizeColorBalance({ ...normalizeColorBalance(selected.colorBalance), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(balance: ColorBalance) => patchEl(selected.id, { colorBalance: balance } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { colorBalance: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 채널 믹서 — RGB 채널 재조합(흑백 변환·채널 스왑·적외선). */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioChannelMixerPanel
                    value={normalizeChannelMixer(selected.channelMixer)}
                    onPatch={(patch: Partial<ChannelMixer>) =>
                      patchEl(selected.id, {
                        channelMixer: normalizeChannelMixer({ ...normalizeChannelMixer(selected.channelMixer), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(mixer: ChannelMixer) => patchEl(selected.id, { channelMixer: mixer } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { channelMixer: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 선택 색상(HSL) — 특정 색 대역의 색조/채도/명도 조정. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioSelectiveHslPanel
                    value={normalizeSelectiveHsl(selected.selectiveHsl)}
                    onPatch={(patch: Partial<SelectiveHsl>) =>
                      patchEl(selected.id, {
                        selectiveHsl: normalizeSelectiveHsl({ ...normalizeSelectiveHsl(selected.selectiveHsl), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: SelectiveHsl) => patchEl(selected.id, { selectiveHsl: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { selectiveHsl: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 생동감(Vibrance) — 저채도 우선 채도 보정 + 전체 채도. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioVibrancePanel
                    value={normalizeVibrance(selected.vibrance)}
                    onPatch={(patch: Partial<Vibrance>) =>
                      patchEl(selected.id, {
                        vibrance: normalizeVibrance({ ...normalizeVibrance(selected.vibrance), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Vibrance) => patchEl(selected.id, { vibrance: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { vibrance: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 포토 필터 — 따뜻/차가운 색 오버레이(광도 유지). */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioPhotoFilterPanel
                    value={normalizePhotoFilter(selected.photoFilter)}
                    onPatch={(patch: Partial<PhotoFilter>) =>
                      patchEl(selected.id, {
                        photoFilter: normalizePhotoFilter({ ...normalizePhotoFilter(selected.photoFilter), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: PhotoFilter) => patchEl(selected.id, { photoFilter: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { photoFilter: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 그라디언트 맵 — 휘도를 멀티스톱 색 그라디언트로 매핑. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioGradientMapPanel
                    value={normalizeGradientMap(selected.gradientMap)}
                    onApplyPreset={(m: GradientMap) => patchEl(selected.id, { gradientMap: m } as Partial<El>)}
                    onEditStopColor={(i: number, color: string) => {
                      const cur = normalizeGradientMap(selected.gradientMap);
                      const stops = cur.stops.map((s, j) => (j === i ? { ...s, color } : s));
                      patchEl(selected.id, { gradientMap: normalizeGradientMap({ stops }) } as Partial<El>);
                    }}
                    onReset={() => patchEl(selected.id, { gradientMap: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 자동 보정 — 히스토그램 기반 원클릭 대비/톤/색/화이트밸런스. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioAutoAdjustPanel
                    value={normalizeAutoAdjust(selected.autoAdjust)}
                    onPatch={(patch: Partial<AutoAdjust>) =>
                      patchEl(selected.id, {
                        autoAdjust: normalizeAutoAdjust({ ...normalizeAutoAdjust(selected.autoAdjust), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: AutoAdjust) => patchEl(selected.id, { autoAdjust: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { autoAdjust: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 선명도/디테일 — 로컬 대비(클래리티) + 안개 제거. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioClarityPanel
                    value={normalizeClarity(selected.clarity)}
                    onPatch={(patch: Partial<Clarity>) =>
                      patchEl(selected.id, {
                        clarity: normalizeClarity({ ...normalizeClarity(selected.clarity), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Clarity) => patchEl(selected.id, { clarity: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { clarity: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 글로우/블룸 — 밝은 영역의 빛 번짐. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioGlowPanel
                    value={normalizeGlow(selected.glow)}
                    onPatch={(patch: Partial<Glow>) =>
                      patchEl(selected.id, {
                        glow: normalizeGlow({ ...normalizeGlow(selected.glow), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Glow) => patchEl(selected.id, { glow: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { glow: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 스티커 테두리 — 실루엣 바깥 색 외곽선(투명 배경 캐릭터용). */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioOutlinePanel
                    value={normalizeOutline(selected.outline)}
                    onPatch={(patch: Partial<Outline>) =>
                      patchEl(selected.id, {
                        outline: normalizeOutline({ ...normalizeOutline(selected.outline), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Outline) => patchEl(selected.id, { outline: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { outline: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 컬러 하프톤 — CMYK 망점 인쇄 룩. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioHalftonePanel
                    value={normalizeHalftone(selected.halftone)}
                    onPatch={(patch: Partial<Halftone>) =>
                      patchEl(selected.id, {
                        halftone: normalizeHalftone({ ...normalizeHalftone(selected.halftone), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Halftone) => patchEl(selected.id, { halftone: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { halftone: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 그레인/텍스처 — 필름 그레인·종이·주사선 오버레이. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioGrainPanel
                    value={normalizeGrain(selected.grain)}
                    onPatch={(patch: Partial<Grain>) =>
                      patchEl(selected.id, {
                        grain: normalizeGrain({ ...normalizeGrain(selected.grain), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Grain) => patchEl(selected.id, { grain: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { grain: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 흐림 갤러리 — 가우시안·모션·스핀·줌 블러. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioBlurPanel
                    value={normalizeBlurFx(selected.blurFx)}
                    onPatch={(patch: Partial<BlurFx>) =>
                      patchEl(selected.id, {
                        blurFx: normalizeBlurFx({ ...normalizeBlurFx(selected.blurFx), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: BlurFx) => patchEl(selected.id, { blurFx: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { blurFx: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 기하 왜곡 — 비틀기·물결·핀치·웨이브. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioDistortPanel
                    value={normalizeDistort(selected.distort)}
                    onPatch={(patch: Partial<Distort>) =>
                      patchEl(selected.id, {
                        distort: normalizeDistort({ ...normalizeDistort(selected.distort), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Distort) => patchEl(selected.id, { distort: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { distort: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 스타일라이즈 — 엠보스·외곽선·솔라리·유화. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioStylizePanel
                    value={normalizeStylize(selected.stylize)}
                    onPatch={(patch: Partial<Stylize>) =>
                      patchEl(selected.id, {
                        stylize: normalizeStylize({ ...normalizeStylize(selected.stylize), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Stylize) => patchEl(selected.id, { stylize: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { stylize: undefined } as Partial<El>)}
                  />
                </div>
              )}
              {/* 조명 효과 — 렌즈 플레어·라이트릭·햇살·광선. */}
              {selected.type === "image" && (
                <div className="mt-3 border-t border-line/50 pt-3">
                  <StudioLightPanel
                    value={normalizeLight(selected.light)}
                    onPatch={(patch: Partial<Light>) =>
                      patchEl(selected.id, {
                        light: normalizeLight({ ...normalizeLight(selected.light), ...patch }),
                      } as Partial<El>)
                    }
                    onApplyPreset={(v: Light) => patchEl(selected.id, { light: v } as Partial<El>)}
                    onReset={() => patchEl(selected.id, { light: undefined } as Partial<El>)}
                  />
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/50 pt-3">
                {(selected.type === "text" || selected.type === "bubble" || selected.type === "sticker") && (
                  <button type="button" onClick={() => startEditText(selected.id)} className={buttonClass({ size: "sm", variant: "quiet" })}>
                    글자 편집
                  </button>
                )}
                {selected.type === "image" && (
                  <>
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
                      onClick={() => patchEl(selected.id, { flippedY: !selected.flippedY } as Partial<El>)}
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
                      "flex-1 rounded py-1 text-[0.62rem] font-semibold transition-colors",
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
                  <p className="text-[0.66rem] font-medium text-fg-3">색상</p>
                  <div className="flex flex-wrap gap-1">
                    {DRAW_COLOR_SWATCHES.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setColor(swatch)}
                        className={cn(
                          "size-5 rounded border transition-transform hover:scale-110",
                          color.toLowerCase() === swatch.toLowerCase() ? "ring-2 ring-accent ring-offset-1 ring-offset-background" : "border-line/60"
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
                      value={pressureCurve === 1.0 ? "linear" : pressureCurve === 1.8 ? "soft" : "hard"}
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
                    {[
                      { id: "none", label: "없음" },
                      { id: "vertical", label: "세로" },
                      { id: "horizontal", label: "가로" },
                      { id: "radial", label: "방사" },
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setSymmetryType(type.id as any)}
                        className={cn(
                          "rounded py-1 text-[0.62rem] font-semibold border transition-colors cursor-pointer",
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
                        <label className="flex-1 flex flex-col gap-0.5 text-[0.62rem] text-fg-3">
                          <span>중앙 X</span>
                          <input
                            type="number"
                            value={Math.round(symmetryCenterX)}
                            onChange={(e) => setSymmetryCenterX(Number(e.target.value))}
                            className="w-full rounded border border-line bg-card px-1 py-0.5 text-[0.65rem] text-fg focus-visible:outline focus-visible:outline-accent"
                          />
                        </label>
                        <label className="flex-1 flex flex-col gap-0.5 text-[0.62rem] text-fg-3">
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
                        className="w-full rounded border border-line bg-card py-1 text-[0.62rem] font-semibold text-fg-2 hover:bg-raised transition-colors cursor-pointer"
                      >
                        대칭축 중앙 정렬
                      </button>
                    </div>
                  )}
                </div>
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
                  className="flex items-center gap-1 rounded-md border border-line bg-card px-1.5 py-0.5 text-[0.6rem] text-fg-2 hover:bg-raised transition-colors"
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
                            const name = window.prompt("그룹 이름", node.group.name);
                            if (name != null && name.trim()) renameLayerGroup(node.group.id, name.trim());
                          }}
                          className="flex min-w-0 flex-1 items-center gap-1 truncate text-left text-[0.7rem] font-semibold text-fg-2"
                          title="이름 변경"
                        >
                          <Folder size={12} className="shrink-0 text-accent" />
                          <span className="truncate">{node.group.name}</span>
                          <span className="shrink-0 text-fg-4">({node.items.length})</span>
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
            <div className="flex justify-center bg-background/30 rounded-xl p-2 border border-line/50">
              <div
                onClick={onMinimapClick}
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
              placeholder="제목 *"
              maxLength={80}
              className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="설명 (선택)"
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="태그 (쉼표로 구분)"
              className="mt-2 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-fg outline-none focus:border-accent"
            />
          </div>
        </aside>
      </div>

      <Suspense fallback={<PoserLoadingOverlay />}>
        {poserVrmOpen ? (
          <StudioVrmPoser
            open
            onClose={() => setPoserVrmOpen(false)}
            onInsert={addRenderedImage}
          />
        ) : null}
      </Suspense>

      {contextMenu.visible && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          className="fixed z-50 min-w-[140px] rounded-lg border border-line bg-panel p-1 shadow-xl animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.elId ? (
            <>
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
                  const el = elements.find((e) => e.id === contextMenu.elId);
                  if (el) patchEl(el.id, { locked: !el.locked });
                  setContextMenu((prev) => ({ ...prev, visible: false }));
                }}
                className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-fg hover:bg-raised"
              >
                {elements.find((e) => e.id === contextMenu.elId)?.locked ? <LockOpen size={12} /> : <Lock size={12} />}
                {elements.find((e) => e.id === contextMenu.elId)?.locked ? "잠금 해제" : "위치 잠금"}
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
  );
}
