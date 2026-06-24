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
  Smile,
  Sparkles,
  Square,
  Star as StarIcon,
  Trash2,
  Type as TypeIcon,
  Undo2,
  Search,
  X,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Stage, Layer, Rect, Text as KText, TextPath as KTextPath, Image as KImage, Line, Group, Star, Ellipse, Circle as KCircle, Path, Transformer, Shape, Arrow, RegularPolygon } from "react-konva/lib/ReactKonvaCore";
import { useNavigate, useSearchParams } from "react-router-dom";


import { ClipMaskGroup } from "./ClipMaskGroup";
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
import { bubblePathData, type BubbleTailSpec } from "./studio-bubble-path";
import { svgToDataUrl } from "./studio-characters";
import {
  type ExportFormat,
} from "./studio-export";
import { GRADIENT_PRESETS, gradientToBgGrad } from "./studio-gradients";
import { createCanvasImageElement } from "./studio-image-placement";
import {
  hasActiveImageFilters,
  imageFilterCacheKey,
  type ImageFilterFields,
} from "./studio-konva-filter-fields";
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
import { resizableNodeProps, textNodeProps } from "./studio-node-props";
import {
  isDefaultPageGrade,
  normalizePageGrade,
  pageGradeToCssFilter,
  vignetteCss,
  drawVignette,
  type PageGrade,
} from "./studio-page-grade";
import { buildTextPathData, normalizeTextPath, isFlatTextPath, type TextPathConfig } from "./studio-text-path";
import {
  DEFAULT_WATERMARK,
  normalizeWatermark,
  shouldDrawWatermark,
  watermarkPlacement,
  type WatermarkSettings,
} from "./studio-watermark";

import type { StudioAsset } from "./studio-asset-library";
import type { AutoAdjust } from "./studio-auto-adjust";
import type { BlurFx } from "./studio-blur";
import type { ChannelMixer } from "./studio-channel-mixer";
import type { Clarity } from "./studio-clarity";
import type { StudioClip } from "./studio-clips";
import type { ColorBalance } from "./studio-color-balance";
import type { CurvePoint } from "./studio-curves";
import type { Detail } from "./studio-detail";
import type { Distort } from "./studio-distort";
import type { Glow } from "./studio-glow";
import type { GradientMap } from "./studio-gradient-map";
import type { Grain } from "./studio-grain";
import type { Halftone } from "./studio-halftone";
import type { Light } from "./studio-light";
import type { Outline } from "./studio-outline";
import type { PanelLayoutPreset } from "./studio-panel-layouts";
import type { PhotoFilter } from "./studio-photo-filter";
import type { SceneSeed, SceneTemplate } from "./studio-scene-templates";
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
} from "@/src/infrastructure/creator-client";
import type Konva from "konva";

import { scheduleIdle } from "@/components/auth/schedule-idle";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { useIsMobile } from "@/components/use-media-query";
import { useResizable } from "@/components/use-resizable";
import { cn } from "@/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";

const KonvaRuntime = KonvaCore as unknown as typeof Konva;
KonvaRuntime.Filters = KonvaRuntime.Filters ?? {};

const StudioImageAdjustmentsPanel = lazy(() =>
  import("./StudioImageAdjustmentsPanel").then((mod) => ({ default: mod.StudioImageAdjustmentsPanel }))
);
const StudioPageGradePanel = lazy(() =>
  import("./StudioPageGradePanel").then((mod) => ({ default: mod.StudioPageGradePanel }))
);
const StudioBubbleStylePresetPanel = lazy(() =>
  import("./StudioBubbleStylePresetPanel").then((mod) => ({ default: mod.StudioBubbleStylePresetPanel }))
);
const StudioShortcutsHelp = lazy(() =>
  import("./StudioShortcutsHelp").then((mod) => ({ default: mod.StudioShortcutsHelp }))
);
const StudioStickerGrid = lazy(() =>
  import("./studio-sticker-grid").then((mod) => ({ default: mod.StudioStickerGrid }))
);
const StudioTextEffectPanel = lazy(() =>
  import("./StudioTextEffectPanel").then((mod) => ({ default: mod.StudioTextEffectPanel }))
);
const StudioTextPathPanel = lazy(() =>
  import("./StudioTextPathPanel").then((mod) => ({ default: mod.StudioTextPathPanel }))
);
const StudioTonePanel = lazy(() =>
  import("./StudioTonePanel").then((mod) => ({ default: mod.StudioTonePanel }))
);
const StudioVrmPoser = lazy(() => import("./StudioVrmPoser").then((mod) => ({ default: mod.StudioVrmPoser })));

type StudioAssetMenuPanelModule = { default: ComponentType<StudioAssetMenuPanelProps> };
let studioAssetMenuPanelPromise: Promise<StudioAssetMenuPanelModule> | null = null;

function loadStudioAssetMenuPanel(): Promise<StudioAssetMenuPanelModule> {
  studioAssetMenuPanelPromise ??= import("./StudioAssetMenuPanel").then((mod) => ({
    default: mod.StudioAssetMenuPanel,
  }));
  return studioAssetMenuPanelPromise;
}

const StudioAssetMenuPanel = lazy(loadStudioAssetMenuPanel);

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

const StudioExportMenuPanel = lazy(loadStudioExportMenuPanel);

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

const StudioColorPopoverContent = lazy(loadStudioColorPopover);

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
export type El = (ImageEl | TextEl | BubbleEl | StickerEl | DrawEl | FrameEl | FocusLinesEl | SpeedLinesEl) & { name?: string; hidden?: boolean; locked?: boolean; noClip?: boolean; opacity?: number; blendMode?: string; lockAspect?: boolean; groupId?: string; clipBelow?: boolean };
type StudioMenu = "template" | "bubble" | "sticker" | "char" | "bgScene" | "asset" | "emeres" | "tone" | "scene" | "clip";
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

function studioElementIdOf(node: Konva.Node | null): string | null {
  let current: Konva.Node | null = node;
  while (current) {
    const id = current.getAttr("studioElementId");
    if (typeof id === "string" && id) return id;
    current = current.getParent();
  }
  return null;
}

// 두 사각형이 겹치는지(마퀴 다중선택 판정).
function rectsIntersect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
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
const WATERMARK_KEY = "toonspectrum-studio-watermark";

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
              stroke={stroke}
              strokeWidth={strokeWidth}
              opacity={opacity}
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
              sides={6}
              radius={Math.max(0.1, Math.min(box.width, box.height) / 2)}
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
}

export function StudioPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: session } = useSession();
  const workId = params.get("id");
  const remixId = params.get("remix");
  const linkedTitleId = params.get("titleId");
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
  const pageGradeActive = !isDefaultPageGrade(pageGrade);
  // 레이어 그룹(폴더) — 과거 저장본 호환 위해 미설정 시 빈 배열.
  const groups = activePage.groups ?? [];
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
  // 대사 일괄 입력(말풍선 메뉴) — 여러 줄 스크립트를 화자별 말풍선으로 한 번에.
  const [dialogueScript, setDialogueScript] = useState("");
  // 캔버스 넓게 쓰기 — 좌측 페이지 목록·우측 속성 패널을 접어 캔버스 폭을 키운다(데스크톱).
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  // 모바일(<lg) 레이아웃: 양쪽 패널을 바텀시트로 띄워 캔버스를 화면 폭에 꽉 채운다.
  const isMobile = useIsMobile();
  // 모바일에서 열려 있는 바텀시트(페이지 목록 / 속성). null=캔버스 전체.
  const [mobileSheet, setMobileSheet] = useState<null | "pages" | "props">(null);
  const pagesSheetRef = useRef<HTMLDivElement>(null);
  const propsSheetRef = useRef<HTMLElement>(null);
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
      const sheet = mobileSheet === "pages" ? pagesSheetRef.current : propsSheetRef.current;
      sheet?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [mobileSheet, isMobile]);
  // 데스크톱: 캔버스와 도구 패널 너비를 드래그(또는 키보드)로 조절하는 스플리터.
  const leftResize = useResizable({ initial: 176, min: 132, max: 320, edge: "right", storageKey: "studio:leftW" });
  const rightResize = useResizable({ initial: 304, min: 248, max: 560, edge: "left", storageKey: "studio:rightW" });
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
  // 최대화 상태에서 ESC로 빠져나오기.
  useEffect(() => {
    if (!maximized || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
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
  const [quickStartDismissed, setQuickStartDismissed] = useState(readQuickStartDismissed);
  const [quickStartOpen, setQuickStartOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, [pages, title, description, tagsText, webtoonTheme, panelGutter, workHydrated, autosaveChecked, hasAutosave]);

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
  const contextMenuEl = contextMenu.elId ? (elementById.get(contextMenu.elId) ?? null) : null;
  const showQuickStart = !menu && (quickStartOpen || (workHydrated && elements.length === 0 && !quickStartDismissed));

  // 삭제된 요소의 노드 참조가 nodeRefs에 남지 않도록 정리(누수 방지).
  useEffect(() => {
    const ids = new Set(elements.map((e) => e.id));
    for (const id of Object.keys(nodeRefs.current)) {
      if (!ids.has(id)) delete nodeRefs.current[id];
    }
  }, [elements]);

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
  }, [workId, remixId]);

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
        setStudioOptionalAssets((prev) => ({
          ...prev,
          bgSceneSections: bgScenes.bgSceneSections([...bgScenes.BG_SCENES, ...bgScenesExtra.BG_SCENES_EXTRA]),
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
          : studioOptionalAssets.bgSceneSections.filter((group) => group.genre === bgSceneGenreFilter),
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
  function startFromExample() {
    if (elements.length > 0 && !globalThis.confirm("기존 작업을 지우고 예시를 불러올까요?")) return;

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
    if (marqueeIds.length > 0) {
      const dl = new Set(marqueeIds);
      commit(elements.filter((e) => !(dl.has(e.id) && !e.locked)));
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
        if (selectedEls.length < 3) return; // 3개 미만은 분배 NOP
        if (mode === "distributeH") {
          const sorted = [...boundsList].sort((a, b) => (a.b.x + a.b.w / 2) - (b.b.x + b.b.w / 2));
          const leftEl = sorted[0]!;
          const rightEl = sorted[sorted.length - 1]!;
          const startX = leftEl.b.x + leftEl.b.w / 2;
          const endX = rightEl.b.x + rightEl.b.w / 2;
          const step = (endX - startX) / (sorted.length - 1);

          const next = elements.map((el) => {
            if (!marqueeIds.includes(el.id) || el.locked) return el;
            const sortedIdx = sorted.findIndex((item) => item.el.id === el.id);
            if (sortedIdx === 0 || sortedIdx === sorted.length - 1) return el; // 양 끝은 고정
            const item = sorted[sortedIdx]!;
            const targetCenterX = startX + sortedIdx * step;
            const currentCenterX = item.b.x + item.b.w / 2;
            const dx = targetCenterX - currentCenterX;

            return el.type === "draw"
              ? ({ ...el, points: el.points.map((v, i) => v + (i % 2 === 0 ? dx : 0)) } as El)
              : ({ ...el, x: (el as { x: number }).x + dx } as El);
          });
          commit(next);
        } else {
          const sorted = [...boundsList].sort((a, b) => (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2));
          const topEl = sorted[0]!;
          const bottomEl = sorted[sorted.length - 1]!;
          const startY = topEl.b.y + topEl.b.h / 2;
          const endY = bottomEl.b.y + bottomEl.b.h / 2;
          const step = (endY - startY) / (sorted.length - 1);

          const next = elements.map((el) => {
            if (!marqueeIds.includes(el.id) || el.locked) return el;
            const sortedIdx = sorted.findIndex((item) => item.el.id === el.id);
            if (sortedIdx === 0 || sortedIdx === sorted.length - 1) return el; // 양 끝은 고정
            const item = sorted[sortedIdx]!;
            const targetCenterY = startY + sortedIdx * step;
            const currentCenterY = item.b.y + item.b.h / 2;
            const dy = targetCenterY - currentCenterY;

            return el.type === "draw"
              ? ({ ...el, points: el.points.map((v, i) => v + (i % 2 === 0 ? 0 : dy)) } as El)
              : ({ ...el, y: (el as { y: number }).y + dy } as El);
          });
          commit(next);
        }
        return;
      }

      // Normal alignment (relative to selection bounding box)
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      boundsList.forEach(({ b }) => {
        minX = Math.min(minX, b.x);
        maxX = Math.max(maxX, b.x + b.w);
        minY = Math.min(minY, b.y);
        maxY = Math.max(maxY, b.y + b.h);
      });

      const totalW = maxX - minX;
      const totalH = maxY - minY;

      const next = elements.map((el) => {
        if (!marqueeIds.includes(el.id) || el.locked) return el;
        const b = elBounds(el);
        let dx = 0;
        let dy = 0;
        if (mode === "left") dx = minX - b.x;
        else if (mode === "right") dx = maxX - b.w - b.x;
        else if (mode === "hcenter") dx = minX + (totalW - b.w) / 2 - b.x;
        else if (mode === "top") dy = minY - b.y;
        else if (mode === "bottom") dy = maxY - b.h - b.y;
        else if (mode === "vcenter") dy = minY + (totalH - b.h) / 2 - b.y;

        if (dx === 0 && dy === 0) return el;
        return el.type === "draw"
          ? ({ ...el, points: el.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) } as El)
          : ({ ...el, x: (el as { x: number }).x + dx, y: (el as { y: number }).y + dy } as El);
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
      } else if ((e.key === "Delete" || e.key === "Backspace") && (selectedId || marqueeIds.length > 0)) {
        e.preventDefault();
        removeSelected();
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
    globalThis.addEventListener("paste", onPaste);
    return () => globalThis.removeEventListener("paste", onPaste);
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
  // 장면 템플릿 삽입 — 프레임·말풍선·효과를 한 번에 깐다(코미포/툰스푼 "한 번에" 발상).
  // 시드는 [0,720] 폭 안에서 좌상단 원점 기준 배치되므로 originX=0(전폭), originY는 현재 보기 부근.
  function addSceneTemplate(template: SceneTemplate) {
    setMenu(null);
    const [, cy] = spawnCenter();
    const originY = Math.max(20, Math.round(cy - 240));
    const newEls = template.build(0, originY).map((s: SceneSeed): El => ({ ...s, id: uid() }));
    commit([...elements, ...newEls]);
    setTool("select");
  }
  // 대사 스크립트 일괄 삽입 — 여러 줄을 화자별 좌/우 말풍선으로 자동 배치(웹툰 제작 시간 단축).
  async function addDialogueBubbles() {
    if (!dialogueScript.trim()) return;
    const { dialogueToBubbles } = await import("./studio-dialogue");
    const seeds = dialogueToBubbles(dialogueScript, { canvasWidth: CANVAS_W, startY: 80 });
    if (seeds.length === 0) return;
    const newEls = seeds.map((s): El => ({ ...s, id: uid() }));
    commit([...elements, ...newEls]);
    setDialogueScript("");
    setMenu(null);
    setTool("select");
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
  // 코미Po!식 정형 컷 레이아웃 — 패널 프레임(+말풍선 시드)을 한 번에 배치.
  function applyPanelLayout(layout: PanelLayoutPreset) {
    setMenu(null);
    if (elements.length > 0 && !globalThis.confirm("기존 작업을 지우고 컷 템플릿을 적용할까요?")) return;
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

  // 그림판 — 진행 중 선/도형은 draft 로만 렌더, 끝나면 히스토리에 커밋.
  function onStageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (e.target.name() === "symmetry-handle" || e.target.name() === "guide-line-handle") {
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
      setDraft(next);
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
  function onStageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    // 마퀴 드래그 중이면 선택 박스를 갱신한다.
    if (marqueeStartRef.current) {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (pos) {
        const s = marqueeStartRef.current;
        scheduleMarqueeRect({
          x: Math.min(s.x, pos.x),
          y: Math.min(s.y, pos.y),
          w: Math.abs(pos.x - s.x),
          h: Math.abs(pos.y - s.y),
        });
      }
      return;
    }
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
      const rawPressure = (e.evt as { pressure?: number }).pressure;
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
    scheduleDraft(next);
  }
  function onStageUp() {
    // 마퀴 드래그 종료: 박스와 겹치는(숨김·아닌) 요소를 한꺼번에 선택.
    if (marqueeStartRef.current) {
      const rect = pendingMarqueeRectRef.current ?? marqueeRect;
      marqueeStartRef.current = null;
      clearMarqueePreview();
      if (rect && rect.w > 3 && rect.h > 3) {
        const ids = elements.filter((el) => !el.hidden && rectsIntersect(rect, elBounds(el))).map((el) => el.id);
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
    if (dx !== 0) node.x(node.x() + dx);
    if (dy !== 0) node.y(node.y() + dy);
    applyGuides(gx != null ? [gx] : [], gy != null ? [gy] : []);
  }
  function onStageDragEnd() {
    applyGuides([], []);
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
          currentPageId,
          webtoonTheme,
          panelGutter,
        } as Record<string, unknown>,
        status,
        remixFromId: (!workId && remixId) ? remixId : undefined,
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

  const toolBtn = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
      active ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
    );

  // 모바일 하단 도구막대 버튼 — 아이콘 + 작은 라벨 세로 스택.
  const mobileBarBtn = (active: boolean) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1 text-[0.62rem] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
      active ? "bg-accent-soft/60 text-accent" : "text-fg-2 hover:bg-raised"
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
    <div
      ref={studioRootRef}
      className={cn(
        isFullscreen && "min-h-screen overflow-y-auto bg-canvas",
        maximized && "fixed inset-0 z-[60] overflow-y-auto bg-canvas"
      )}
    >
    <Container size="wide" className={cn("py-6", !(isFullscreen || maximized) && "xl:max-w-[1600px] 2xl:max-w-[1880px]", (isFullscreen || maximized) && "max-w-none", maximized && "px-3 py-3")}>
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
              {TEMPLATE_GROUPS.map((group) => (
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
                {studioEmeresAssetsLoading && !studioEmeresAssetsLoaded && (
                  <p className="rounded-lg border border-line bg-card px-2 py-2 text-xs text-fg-3">이메레스 틀을 불러오는 중...</p>
                )}
                {studioEmeresAssetsError && (
                  <p className="rounded-lg border border-bad/40 bg-bad/10 px-2 py-2 text-xs text-bad">{studioEmeresAssetsError}</p>
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
        <div ref={menu === "scene" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "scene" ? null : "scene")} aria-haspopup="menu" aria-expanded={menu === "scene"} className={toolBtn(menu === "scene")}>
            <Sparkles size={14} /> 장면
          </button>
          {menu === "scene" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-line bg-panel p-2 shadow-lg">
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
                      <p className="mb-1 px-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-fg-3">{cat.label}</p>
                      <div className="grid gap-1">
                        {items.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => addSceneTemplate(t)}
                            className="rounded-lg border border-line bg-card px-2 py-1.5 text-left transition-colors hover:border-accent/50 hover:bg-raised"
                          >
                            <span className="block text-xs font-semibold text-fg">{t.label}</span>
                            <span className="block text-[0.62rem] text-fg-3">{t.description}</span>
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
            <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">재사용 클립 보관함</p>
              <button
                type="button"
                onClick={() => void saveSelectionAsClip()}
                disabled={!selected}
                className={cn(
                  "mb-2 w-full rounded-lg py-1.5 text-xs font-semibold transition-colors",
                  selected ? "bg-accent text-on-accent hover:opacity-90" : "cursor-not-allowed bg-card text-fg-4"
                )}
                title={selected ? "선택한 요소(그룹)를 클립으로 저장" : "먼저 캔버스에서 요소를 선택하세요"}
              >
                + 선택을 클립으로 저장
              </button>
              {clips.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
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
                        <span className="ml-1 text-[0.6rem] text-fg-4">{(c.els as unknown[]).length}개</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteClip(c.id)}
                        aria-label={`${c.name} 클립 삭제`}
                        className="shrink-0 text-fg-4 transition-colors hover:text-bad"
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
        <button type="button" onClick={addText} className={toolBtn(false)}>
          <TypeIcon size={14} /> 텍스트
        </button>
        <div ref={menu === "bubble" ? menuRef : undefined} className="relative">
          <button type="button" onClick={() => setMenu(menu === "bubble" ? null : "bubble")} aria-haspopup="menu" aria-expanded={menu === "bubble"} className={toolBtn(menu === "bubble")}>
            <MessageCircle size={14} /> 말풍선
          </button>
          {menu === "bubble" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-line bg-panel p-2 shadow-lg">
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
                <p className="mb-1.5 text-[0.6rem] leading-snug text-fg-4">
                  한 줄에 한 대사. <span className="text-fg-3">이름: 대사</span>로 화자 지정(좌/우 자동), <span className="text-fg-3">(지문)</span>은 나레이션.
                </p>
                <textarea
                  value={dialogueScript}
                  onChange={(e) => setDialogueScript(e.target.value)}
                  placeholder={"민수: 안녕?\n지영: 오랜만이야\n(잠시 후)"}
                  rows={4}
                  className="w-full resize-y rounded-lg border border-line bg-card px-2 py-1.5 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent/50"
                />
                <button
                  type="button"
                  onClick={() => void addDialogueBubbles()}
                  disabled={!dialogueScript.trim()}
                  className={cn(
                    "mt-1.5 w-full rounded-lg py-1.5 text-xs font-semibold transition-colors",
                    dialogueScript.trim() ? "bg-accent text-on-accent hover:opacity-90" : "cursor-not-allowed bg-card text-fg-4"
                  )}
                >
                  말풍선으로 한 번에 넣기
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
                  <p className="mt-1 text-[0.6rem] text-fg-4 leading-normal">다른 검색어로 찾아보세요.</p>
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
          <div className="flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-line/70 bg-card/65 px-3 py-1.5 shadow-md">
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
                          active ? "bg-accent text-accent-fg shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg"
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
        </div>
      </div>

      <div className="flex flex-col gap-4 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:flex-row lg:pb-0">
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
            <span className="text-[0.62rem] font-semibold [writing-mode:vertical-rl]">페이지</span>
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
            "fixed inset-x-0 bottom-0 z-50 max-h-[72vh] overflow-y-auto rounded-t-3xl bg-panel pb-[calc(4rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out",
            // 데스크톱: 인라인 컬럼(드래그로 너비 조절)
            "lg:static lg:z-auto lg:max-h-none lg:flex-shrink-0 lg:overflow-visible lg:rounded-2xl lg:bg-panel/20 lg:pb-3 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "pages" ? "translate-y-0" : "translate-y-full",
            !leftPanelOpen && "lg:hidden"
          )}
          style={isMobile ? undefined : { width: leftResize.width }}
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
              onClick={addPage}
              className="flex items-center gap-1 rounded bg-accent px-2 py-1 text-[10px] font-semibold text-on-accent hover:bg-accent-hover"
            >
              <Plus size={10} /> 추가
            </button>
          </div>
          <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[56vh] lg:max-h-[calc(100dvh-24rem)] pr-1">
            {pages.map((p, idx) => {
              const isActive = p.id === currentPageId;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${idx + 1}페이지 선택`}
                  aria-pressed={isActive}
                  onClick={() => setCurrentPageId(p.id)}
                  onKeyDown={(e) => {
                    // 카드 자체에 포커스가 있을 때만 활성화(중첩 버튼의 키 입력은 방해하지 않음).
                    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      setCurrentPageId(p.id);
                    }
                  }}
                  className={cn(
                    "flex w-full cursor-pointer flex-col gap-1 rounded-xl border p-2 transition-all hover:bg-raised/50",
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

        {/* 중앙: 캔버스 영역 */}
        <div className="relative flex-1 min-w-0">
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
                      className="rounded px-1.5 py-0.5 hover:bg-raised text-[0.6rem] font-bold text-fg-3 hover:text-fg cursor-pointer"
                      title="가로 간격 동일하게 정렬"
                    >
                      가로 분배
                    </button>
                    <button
                      type="button"
                      onClick={() => alignSelected("distributeV")}
                      className="rounded px-1.5 py-0.5 hover:bg-raised text-[0.6rem] font-bold text-fg-3 hover:text-fg cursor-pointer"
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

          {/* 고정높이 스크롤 뷰포트: 줌·긴 캔버스 시 내부 스크롤, 컨트롤은 바깥에 고정 */}
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 마우스 핸들러는 클릭이 아니라 스페이스+드래그 패닝/에셋 드롭 전용이며, 실제 상호작용은 내부 Konva Stage가 담당하고 키보드 패닝은 document keydown(Space)에서 처리한다 */}
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
                // 한 요소를 렌더하는 함수. opts.asMask=클리핑 마스크의 베이스 사본(비상호작용),
                // opts.compositeOverride=알파 클리핑 자식의 "source-in" 합성.
                const renderEl = (el: El, idx: number, opts: { asMask?: boolean; compositeOverride?: string } = {}) => {
                const locked = isEffectivelyLocked(el, groups);
                const draggable = !opts.asMask && tool === "select" && !locked;
                // 잠긴 요소(이메레스 밑그림 등)도 선택 모드에선 클릭 선택 허용 — 삭제/잠금해제 가능하게.
                // 이동·변형은 여전히 막힘(draggable=false·트랜스포머 미부착). 드로잉 모드(tool!=="select")엔 무영향.
                const onSelect = opts.asMask ? () => {} : () => tool === "select" && setSelectedId(el.id);
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
                      studioElementId={el.id}
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
                const speechPathData = bubblePathData(el.width, el.height, bRadius, bubbleTailSpec);
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
            <span className="text-[0.62rem] font-semibold [writing-mode:vertical-rl]">속성</span>
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
            "fixed inset-x-0 bottom-0 z-50 max-h-[82vh] overflow-y-auto rounded-t-3xl border border-line bg-panel p-3 pb-[calc(4rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out",
            // 데스크톱: 인라인 컬럼(드래그로 너비 조절)
            "lg:static lg:z-auto lg:max-h-none lg:flex-shrink-0 lg:overflow-visible lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:transition-none lg:translate-y-0",
            mobileSheet === "props" ? "translate-y-0" : "translate-y-full",
            !rightPanelOpen && "lg:hidden"
          )}
          style={isMobile ? undefined : { width: rightResize.width }}
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
              className="inline-flex items-center gap-0.5 rounded text-[0.62rem] text-fg-3 transition-colors hover:text-fg"
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
                <div className="rounded-md border border-line bg-card px-2 py-1.5 text-[0.62rem] leading-snug text-fg-3">
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
            {pageGradePanelOpen ? (
              <>
                <div className="mb-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setPageGradePanelOpen(false)}
                    className="inline-flex items-center gap-0.5 rounded text-[0.62rem] text-fg-3 transition-colors hover:text-fg"
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

              {selected.type === "image" && (
                <StudioImageAdjustmentsPanel
                  selected={selected}
                  filterClipboard={filterClipboard}
                  onSetFilterClipboard={setFilterClipboard}
                  onPatch={(patch) => patchEl(selected.id, patch)}
                />
              )}

              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line/50 pt-3">
                {(selected.type === "text" || selected.type === "bubble" || selected.type === "sticker") && (
                  <button type="button" onClick={() => startEditText(selected.id)} className={buttonClass({ size: "sm", variant: "quiet" })}>
                    글자 편집
                  </button>
                )}
                {selected.type === "image" && (
                  <>
                    {selected.src?.includes("#") && (
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
                            const name = globalThis.prompt("그룹 이름", node.group.name);
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

        {/* 모바일 하단 도구막대 — 패널 토글·추가·줌을 한 손에 */}
        {isMobile && (
          <nav
            aria-label="스튜디오 모바일 도구막대"
            className="fixed inset-x-0 bottom-0 z-[55] flex items-stretch gap-0.5 border-t border-line bg-panel/95 px-1 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur lg:hidden"
          >
            <button
              type="button"
              onClick={() => setMobileSheet((s) => (s === "pages" ? null : "pages"))}
              aria-pressed={mobileSheet === "pages"}
              className={mobileBarBtn(mobileSheet === "pages")}
            >
              <Files size={18} />
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
              <Plus size={18} />
              <span>추가</span>
            </button>
            <div className="flex flex-[1.4] items-center justify-center gap-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => clampZoom(z - 0.25))}
                disabled={zoom <= ZOOM_MIN}
                className="grid size-9 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised disabled:opacity-40"
                aria-label="축소"
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                onClick={() => setZoom(1)}
                className="min-w-[2.7rem] rounded-lg px-1 py-1.5 text-center text-[0.7rem] font-semibold tabular-nums text-fg transition-colors hover:bg-raised"
                aria-label="확대·축소 100%로 맞춤"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => clampZoom(z + 0.25))}
                disabled={zoom >= ZOOM_MAX}
                className="grid size-9 place-items-center rounded-lg text-fg-2 transition-colors hover:bg-raised disabled:opacity-40"
                aria-label="확대"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMobileSheet((s) => (s === "props" ? null : "props"))}
              aria-pressed={mobileSheet === "props"}
              className={mobileBarBtn(mobileSheet === "props")}
            >
              <SlidersHorizontal size={18} />
              <span>속성</span>
            </button>
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
              {contextMenuEl?.type === "image" && contextMenuEl.src?.includes("#") && (
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
