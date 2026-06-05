import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Konva from "konva";
import { Stage, Layer, Rect, Text as KText, Image as KImage, Line, Group, Star, Ellipse, Path, Transformer } from "react-konva";
import {
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Eraser,
  Eye,
  EyeOff,
  Image as ImageIcon,
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
  Plus,
  Redo2,
  Send,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Square,
  Trash2,
  Type as TypeIcon,
  Undo2,
  X,
} from "lucide-react";
import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createWork, getWork, getCurrentUserId, updateWork } from "@/src/lib/creator-client";
import {
  BG_PRESETS,
  BUBBLE_VARIANTS,
  CANVAS_W,
  EFFECT_EMOJIS,
  SFX_PRESETS,
  TEMPLATES,
  type BgPreset,
  type BubbleVariant,
  type TemplateSpec,
} from "./studio-assets";
import { CHARACTERS, svgToDataUrl } from "./studio-characters";
import { createCanvasImageElement } from "./studio-image-placement";
import { BG_SCENES } from "./studio-bg-scenes";
import { COMIC_VECTOR_STICKERS, FX_OVERLAYS } from "./studio-fx-assets";

const StudioVrmPoser = lazy(() => import("./StudioVrmPoser").then((mod) => ({ default: mod.StudioVrmPoser })));

type Tool = "select" | "draw";
type DrawMode = "pen" | "eraser" | "shape";
type DrawShapeKind = "line" | "rect" | "ellipse";

interface ImageEl {
  id: string;
  type: "image";
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
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
  font?: string; // 말풍선 글꼴(미설정 시 기본 고딕)
  fontSize?: number; // 말풍선 글자 크기(미설정 시 24)
}
interface FrameEl {
  id: string;
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
  bg?: string;
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
}
// 인터섹션으로 모든 요소 변형에 레이어 메타(표시/숨김·잠금)를 부여.
type El = (ImageEl | TextEl | BubbleEl | StickerEl | DrawEl | FrameEl) & { hidden?: boolean; locked?: boolean; noClip?: boolean };
type StudioMenu = "template" | "bubble" | "sticker" | "char" | "bgScene";

const uid = () => crypto.randomUUID();

// 요소의 대략적 바운딩 박스(중심·크기 판정용).
function elBounds(el: El): { x: number; y: number; w: number; h: number } {
  if (el.type === "draw") {
    const xs = el.points.filter((_, i) => i % 2 === 0);
    const ys = el.points.filter((_, i) => i % 2 === 1);
    if (!xs.length) return { x: 0, y: 0, w: 0, h: 0 };
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
    default:
      return "요소";
  }
}
const BRUSH_WIDTH_PRESETS = [2, 6, 12, 24, 36];
const DRAW_COLOR_SWATCHES = ["#16100c", "#f8f2df", "#f45d48", "#ff9f1c", "#ffd84d", "#56c271", "#2f9bff", "#7c5cfc", "#ff6fb1", "#8a5a44"];
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

function StudioDrawNode({ el }: { el: DrawEl }) {
  const kind = el.kind ?? "freehand";
  const composite = el.mode === "eraser" ? "destination-out" : "source-over";
  const opacity = el.opacity ?? 1;
  const stroke = el.mode === "eraser" ? "#16100c" : el.stroke;
  const strokeWidth = Math.max(1, el.strokeWidth);

  if (kind === "rect") {
    const box = drawBounds(el.points);
    return (
      <Rect
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
    const box = drawBounds(el.points);
    return (
      <Ellipse
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

  return (
    <Line
      points={el.points}
      stroke={stroke}
      strokeWidth={strokeWidth}
      opacity={opacity}
      lineCap="round"
      lineJoin="round"
      tension={kind === "freehand" ? 0.4 : 0}
      globalCompositeOperation={composite}
      listening={false}
    />
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

// 비동기 로드가 필요한 이미지 노드 — src 가 바뀌면 다시 로드한다.
function UrlImage({
  el,
  draggable,
  innerRef,
  onSelect,
  onChange,
}: {
  el: ImageEl;
  draggable: boolean;
  innerRef: (n: Konva.Image | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<ImageEl>) => void;
}) {
  const [img, setImg] = useState<HTMLImageElement>();
  useEffect(() => {
    const im = new window.Image();
    im.src = el.src;
    im.onload = () => setImg(im);
    return () => {
      im.onload = null;
    };
  }, [el.src]);
  if (!img) return null;
  return (
    <KImage
      ref={innerRef}
      image={img}
      x={el.x}
      y={el.y}
      width={el.width}
      height={el.height}
      rotation={el.rotation}
      draggable={draggable}
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
}: {
  el: FrameEl;
  theme: "classic" | "soft" | "vivid";
  draggable: boolean;
  innerRef: (n: Konva.Node | null) => void;
  onSelect: () => void;
  onChange: (patch: Partial<FrameEl>) => void;
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

  let fStroke = "#16100c";
  let fStrokeW = 3;
  let fRadius = 4;
  let fShadowColor = undefined;
  let fShadowBlur = 0;
  let fShadowOpacity = 0;
  let fShadowOffset = undefined;

  if (theme === "soft") {
    fStroke = "#222222";
    fStrokeW = 1.8;
    fRadius = 0;
  } else if (theme === "vivid") {
    fStroke = "#3a3a3a";
    fStrokeW = 1.2;
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
      <Rect width={el.width} height={el.height} fill="#ffffff" />
      {img && fit ? (
        <KImage
          image={img}
          x={fit.x}
          y={fit.y}
          width={fit.width}
          height={fit.height}
        />
      ) : null}
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
      />
    </Group>
  );
}

export function StudioPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const workId = params.get("id");
  const linkedTitleId = params.get("titleId");
  const loggedIn = !!getCurrentUserId();

  // 편집 문서 상태(요소 배열은 히스토리로 관리해 실행취소/다시실행 지원).
  const [history, setHistory] = useState<El[][]>([[]]);
  const [hi, setHi] = useState(0);
  const elements = history[hi];
  const [bg, setBg] = useState("#ffffff");
  const [canvasH, setCanvasH] = useState(1080);
  const [webtoonTheme, setWebtoonTheme] = useState<"classic" | "soft" | "vivid">("soft");

  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [color, setColor] = useState("#7c5cfc");
  const [strokeWidth, setStrokeWidth] = useState(6);
  const [drawMode, setDrawMode] = useState<DrawMode>("pen");
  const [brushOpacity, setBrushOpacity] = useState(1);
  const [drawShape, setDrawShape] = useState<DrawShapeKind>("line");
  const [shapeFill, setShapeFill] = useState(false);
  const [drawAdvancedOpen, setDrawAdvancedOpen] = useState(false);
  const [menu, setMenu] = useState<null | StudioMenu>(null);
  const [bgGrad, setBgGrad] = useState<string[] | null>(null);
  const [charPick, setCharPick] = useState<string>(CHARACTERS[0]?.id ?? "");
  const [poserVrmOpen, setPoserVrmOpen] = useState(false);
  const [quickStartDismissed, setQuickStartDismissed] = useState(readQuickStartDismissed);
  const [quickStartOpen, setQuickStartOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workHydrated, setWorkHydrated] = useState(!workId);

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

  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const nodeRefs = useRef<Record<string, Konva.Node | null>>({});
  const publishRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef<DrawEl | null>(null);
  const [draft, setDraft] = useState<DrawEl | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;
  const showQuickStart = quickStartOpen || (workHydrated && elements.length === 0 && !quickStartDismissed);

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
        const doc = w.doc as { elements?: El[]; bg?: string; bgGrad?: string[] | null; height?: number; webtoonTheme?: "classic" | "soft" | "vivid" };
        if (doc?.elements) setHistory([doc.elements]);
        if (doc?.bg) setBg(doc.bg);
        if (doc?.bgGrad) setBgGrad(doc.bgGrad);
        if (doc?.height) setCanvasH(doc.height);
        if (doc?.webtoonTheme) setWebtoonTheme(doc.webtoonTheme);
        setHi(0);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "불러오기 실패"))
      .finally(() => {
        if (alive) setWorkHydrated(true);
      });
    return () => {
      alive = false;
    };
  }, [workId]);

  // 트랜스포머를 선택 노드에 부착.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const selLocked = elements.find((e) => e.id === selectedId)?.locked;
    const node = selectedId && tool === "select" && !selLocked ? nodeRefs.current[selectedId] : null;
    tr.nodes(node ? [node] : []);
    tr.getLayer()?.batchDraw();
  }, [selectedId, tool, elements]);

  // 요소 변경을 히스토리에 커밋.
  function commit(next: El[]) {
    const h = history.slice(0, hi + 1);
    h.push(next);
    setHistory(h);
    setHi(h.length - 1);
  }
  function patchEl(id: string, patch: Partial<El>) {
    commit(elements.map((e) => (e.id === id ? ({ ...e, ...patch } as El) : e)));
  }
  function addEl(el: El) {
    commit([...elements, el]);
    setSelectedId(el.id);
    setTool("select");
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
    const character = CHARACTERS[0];
    const expression = character?.expressions.find((ex) => ex.id === "happy") ?? character?.expressions[0];
    const sample: El[] = [...frames];

    if (firstFrame && character && expression) {
      const scaleToFrame = Math.min(1.18, (firstFrame.width * 0.4) / character.width, (firstFrame.height - 72) / character.height);
      const width = Math.round(character.width * scaleToFrame);
      const height = Math.round(character.height * scaleToFrame);
      sample.push({
        id: uid(),
        type: "image",
        src: svgToDataUrl(expression.svg),
        x: firstFrame.x + 70,
        y: firstFrame.y + firstFrame.height - height - 26,
        width,
        height,
        rotation: 0,
      });
      sample.push({
        id: uid(),
        type: "bubble",
        variant: "speech",
        text: "오늘은 여기서 시작해요.",
        x: firstFrame.x + firstFrame.width - 314,
        y: firstFrame.y + 58,
        width: 270,
        height: 118,
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
    if (selected.type === "draw") {
      patchEl(selected.id, { points: selected.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) } as Partial<El>);
    } else {
      patchEl(selected.id, { x: selected.x + dx, y: selected.y + dy } as Partial<El>);
    }
  }
  // 들어간 패널 중앙(없으면 캔버스 중앙)으로 가로/세로 정렬.
  function centerSelected(axis: "h" | "v") {
    if (!selected || selected.locked) return;
    const b = elBounds(selected);
    const frame = containingPanel(selected, elements);
    const ox = frame ? frame.x : 0;
    const ow = frame ? frame.width : CANVAS_W;
    const oy = frame ? frame.y : 0;
    const oh = frame ? frame.height : canvasH;
    const targetX = ox + (ow - b.w) / 2;
    const targetY = oy + (oh - b.h) / 2;
    const dx = axis === "h" ? targetX - b.x : 0;
    const dy = axis === "v" ? targetY - b.y : 0;
    if (selected.type === "draw") {
      patchEl(selected.id, { points: selected.points.map((v, i) => v + (i % 2 === 0 ? dx : dy)) } as Partial<El>);
    } else {
      patchEl(selected.id, (axis === "h" ? { x: targetX } : { y: targetY }) as Partial<El>);
    }
  }
  function reorder(dir: "front" | "back") {
    if (!selectedId) return;
    const idx = elements.findIndex((e) => e.id === selectedId);
    if (idx < 0) return;
    const next = [...elements];
    const [el] = next.splice(idx, 1);
    if (dir === "front") next.push(el);
    else next.unshift(el);
    commit(next);
  }
  const undo = () => setHi((i) => Math.max(0, i - 1));
  const redo = () => setHi((i) => Math.min(history.length - 1, i + 1));

  // 키보드 단축키: ⌘Z 실행취소 · ⌘⇧Z/⌘Y 다시실행 · ⌘D 복제 · Delete/Backspace 삭제 · Esc 선택해제.
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
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        setSelectedId(null);
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

  function addText() {
    addEl({
      id: uid(),
      type: "text",
      text: "텍스트",
      x: CANVAS_W / 2 - 110,
      y: canvasH / 2 - 24,
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

    addEl({
      id: uid(),
      type: "bubble",
      variant,
      text,
      x: CANVAS_W / 2 - width / 2,
      y: canvasH / 2 - height / 2,
      width,
      height,
      fill,
      textFill,
      rotation: 0,
    });
  }
  function addSticker(emoji: string) {
    setMenu(null);
    addEl({ id: uid(), type: "sticker", text: emoji, x: CANVAS_W / 2 - 40, y: canvasH / 2 - 40, fontSize: 96, rotation: 0 });
  }
  function addSfx(text: string, fill: string) {
    setMenu(null);
    addEl({
      id: uid(),
      type: "text",
      text,
      x: CANVAS_W / 2 - 80,
      y: canvasH / 2 - 50,
      width: 220,
      fontSize: 88,
      fill,
      stroke: "#16100c",
      strokeWidth: 7,
      rotation: -6,
    });
  }
  function addCharacter(svgOrSrc: string, w: number, h: number) {
    setMenu(null);
    const src = svgOrSrc.startsWith("/assets/") || svgOrSrc.includes(".png")
      ? svgOrSrc
      : svgToDataUrl(svgOrSrc);
    addEl(
      createCanvasImageElement({
        id: uid(),
        src,
        canvasWidth: CANVAS_W,
        canvasHeight: canvasH,
        sourceWidth: w,
        sourceHeight: h,
        horizontalInset: 140,
      })
    );
  }
  function addBgScene(bg: typeof BG_SCENES[number]) {
    setMenu(null);
    const src = bg.imgSrc || svgToDataUrl(bg.svg || "");
    if (selected?.type === "frame") {
      patchEl(selected.id, { bg: src } as Partial<El>);
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
  function applyTemplate(tpl: TemplateSpec) {
    setMenu(null);
    if (elements.length > 0 && !window.confirm("기존 작업을 지우고 템플릿을 적용할까요?")) return;
    setCanvasH(tpl.canvasH);
    setBg("#ffffff");
    setBgGrad(null);
    commit(
      tpl.frames.map((f) => ({ id: uid(), type: "frame" as const, x: f.x, y: f.y, width: f.width, height: f.height }))
    );
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
    if (tool === "draw") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      setSelectedId(null);
      const common = {
        id: uid(),
        type: "draw" as const,
        stroke: color,
        strokeWidth,
        opacity: brushOpacity,
      };
      const next: DrawEl =
        drawMode === "shape"
          ? {
              ...common,
              kind: drawShape,
              mode: "pen",
              points: [pos.x, pos.y, pos.x, pos.y],
              fill: shapeFill && drawShape !== "line" ? color : undefined,
            }
          : {
              ...common,
              kind: "freehand",
              mode: drawMode,
              points: [pos.x, pos.y],
            };
      drawingRef.current = next;
      setDraft(next);
      return;
    }
    // 선택 모드: 빈 영역 클릭 시 선택 해제.
    if (e.target === e.target.getStage() || e.target.name() === "bg") setSelectedId(null);
  }
  function onStageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool !== "draw" || !drawingRef.current) return;
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const current = drawingRef.current;
    const next =
      (current.kind ?? "freehand") === "freehand"
        ? { ...current, points: [...current.points, pos.x, pos.y] }
        : { ...current, points: [current.points[0] ?? pos.x, current.points[1] ?? pos.y, pos.x, pos.y] };
    drawingRef.current = next;
    setDraft(next);
  }
  function onStageUp() {
    if (drawingRef.current && isCompleteDrawOp(drawingRef.current)) {
      commit([...elements, drawingRef.current]);
    }
    drawingRef.current = null;
    setDraft(null);
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
    // 트랜스포머가 캡처되지 않도록 한 프레임 양보.
    await new Promise((r) => setTimeout(r, 60));
    try {
      const stage = stageRef.current;
      if (!stage) throw new Error("캔버스를 찾을 수 없어요.");
      const full = stage.toDataURL({ pixelRatio: 1 / scale });
      const cover = await downscaleDataUrl(full, 480);
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
        pages: [full],
        doc: { width: CANVAS_W, height: canvasH, bg, bgGrad, elements, webtoonTheme } as Record<string, unknown>,
        status,
      };
      const work = workId ? await updateWork(workId, payload) : await createWork(payload);
      navigate(`/create/${work.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했어요.");
      setSaving(false);
    }
  }

  const toolBtn = (active: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
      active ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
    );

  async function handleDownload() {
    setSelectedId(null);
    await new Promise((r) => setTimeout(r, 60));
    const stage = stageRef.current;
    if (!stage) return;
    const full = stage.toDataURL({ pixelRatio: 1 / scale });
    const link = document.createElement("a");
    link.href = full;
    link.download = `${title.trim() || "toonspectrum-comic"}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
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
          <button type="button" onClick={handleDownload} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1.5" })}>
            <Download size={14} /> 다운로드
          </button>
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
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === "template" ? null : "template")} className={toolBtn(menu === "template")}>
            <LayoutTemplate size={14} /> 템플릿
          </button>
          {menu === "template" && (
            <div className="absolute left-0 top-full z-30 mt-1 grid w-64 gap-1 rounded-xl border border-line bg-panel p-2 shadow-lg">
              {TEMPLATES.map((t) => (
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
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === "char" ? null : "char")} className={toolBtn(menu === "char")}>
            <Smile size={14} /> 캐릭터
          </button>
          {menu === "char" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-72 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <div className="mb-2 flex flex-wrap gap-1">
                {CHARACTERS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharPick(c.id)}
                    className={cn(
                      "rounded-lg border px-2 py-1 text-xs",
                      charPick === c.id ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line text-fg-2 hover:bg-raised"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1">
                {(() => {
                  const c = CHARACTERS.find((x) => x.id === charPick) ?? CHARACTERS[0];
                  if (!c) return null;
                  return c.expressions.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      title={ex.label}
                      onClick={() => addCharacter(ex.imgSrc || ex.svg, c.width, c.height)}
                      className="overflow-hidden rounded-lg border border-line bg-card p-1 hover:border-accent/50"
                    >
                      <img src={ex.imgSrc || svgToDataUrl(ex.svg)} alt={ex.label} className="h-14 w-full object-contain" />
                      <span className="block text-center text-[0.6rem] text-fg-3">{ex.label}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setPoserVrmOpen(true)} className={toolBtn(false)}>
          <Sparkles size={14} /> VRM 3D 캐릭터 (고화질)
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === "bgScene" ? null : "bgScene")} className={toolBtn(menu === "bgScene")}>
            <ImageIcon size={14} /> 배경 씬
          </button>
          {menu === "bgScene" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">2D 배경 씬</p>
              <p className="mb-2 rounded-lg border border-line bg-card px-2 py-1.5 text-[0.66rem] leading-snug text-fg-3">
                패널을 선택하고 배경을 누르면 그 컷 안에 들어갑니다.
              </p>
              <div className="grid grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {BG_SCENES.map((bg) => (
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
          )}
        </div>
        <button type="button" onClick={addText} className={toolBtn(false)}>
          <TypeIcon size={14} /> 텍스트
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === "bubble" ? null : "bubble")} className={toolBtn(menu === "bubble")}>
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
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === "sticker" ? null : "sticker")} className={toolBtn(menu === "sticker")}>
            <Sparkles size={14} /> 효과
          </button>
          {menu === "sticker" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <p className="mb-1 text-[0.66rem] font-medium text-fg-3">효과음</p>
              <div className="mb-2 flex flex-wrap gap-1">
                {SFX_PRESETS.map((s) => (
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
              <p className="mb-1 text-[0.66rem] font-medium text-fg-3">이모지</p>
              <div className="grid grid-cols-8 gap-1 mb-2">
                {EFFECT_EMOJIS.map((em) => (
                  <button key={em} type="button" onClick={() => addSticker(em)} className="rounded-md p-1 text-lg hover:bg-raised">
                    {em}
                  </button>
                ))}
              </div>
              <p className="mb-1 mt-2 text-[0.66rem] font-medium text-fg-3 border-t border-line pt-2">만화 스티커</p>
              <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto pr-1">
                {COMIC_VECTOR_STICKERS.map((sticker) => (
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
              <p className="mb-1 mt-2 text-[0.66rem] font-medium text-fg-3 border-t border-line pt-2">만화 특수 효과</p>
              <div className="grid grid-cols-4 gap-1 max-h-40 overflow-y-auto pr-1">
                {FX_OVERLAYS.map((fx) => (
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
            </div>
          )}
        </div>
        <label className={cn(toolBtn(false), "cursor-pointer")}>
          <ImagePlus size={14} /> 이미지
          <input type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        </label>
        <span className="mx-0.5 h-5 w-px bg-line" />
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-3">
          색
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent" />
        </label>
        {tool === "draw" && (
          <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-xl border border-line/70 bg-card/65 px-2 py-1">
            {drawMode !== "eraser" && (
              <div className="flex items-center gap-1" aria-label="빠른 색상">
                {DRAW_COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    title={swatch}
                    aria-label={`색상 ${swatch}`}
                    className={cn(
                      "size-6 rounded-md border transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      color.toLowerCase() === swatch.toLowerCase() ? "border-accent ring-2 ring-accent/35" : "border-line"
                    )}
                    style={{ background: swatch }}
                  />
                ))}
              </div>
            )}
            <div className="mx-0.5 h-5 w-px bg-line" />
            <div className="flex items-center gap-1" aria-label="브러시 굵기 프리셋">
              {BRUSH_WIDTH_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setStrokeWidth(preset)}
                  title={`굵기 ${preset}px`}
                  aria-label={`굵기 ${preset}px`}
                  className={cn(
                    "grid size-7 place-items-center rounded-md border text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                    strokeWidth === preset ? "border-accent/60 bg-accent-soft text-fg" : "border-line"
                  )}
                >
                  <span className="block w-4 rounded-full bg-current" style={{ height: Math.max(2, Math.min(9, preset / 4)) }} />
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-fg-3">
              <span className="numeral w-8 text-right text-[0.66rem] text-fg-2">{strokeWidth}px</span>
              <input type="range" min={1} max={48} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-24" />
            </label>
            <button
              type="button"
              onClick={() => setDrawAdvancedOpen((open) => !open)}
              className={cn(toolBtn(drawAdvancedOpen || drawMode === "shape"), "h-8 px-2")}
              aria-expanded={drawAdvancedOpen}
            >
              <SlidersHorizontal size={14} /> 고급
              <ChevronDown size={13} className={cn("transition-transform", drawAdvancedOpen && "rotate-180")} />
            </button>
            {drawAdvancedOpen && (
              <div className="flex basis-full flex-wrap items-center gap-2 border-t border-line/70 pt-1.5">
                <label className="inline-flex items-center gap-1.5 text-xs text-fg-3">
                  불투명도
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={Math.round(brushOpacity * 100)}
                    onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
                    className="w-24"
                  />
                  <span className="numeral w-8 text-right text-[0.66rem] text-fg-2">{Math.round(brushOpacity * 100)}%</span>
                </label>
                <div className="mx-0.5 h-5 w-px bg-line" />
                <span className="text-xs text-fg-3">도형</span>
                {([
                  { kind: "line" as const, label: "선", icon: Minus },
                  { kind: "rect" as const, label: "사각형", icon: Square },
                  { kind: "ellipse" as const, label: "타원", icon: Circle },
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
                      className={cn(toolBtn(active), "h-8 px-2")}
                      aria-pressed={active}
                      title={item.label}
                    >
                      <Icon size={14} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <label
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors",
                    drawShape === "line" ? "border-line bg-card text-fg-3 opacity-55" : shapeFill ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={shapeFill}
                    disabled={drawShape === "line"}
                    onChange={(e) => setShapeFill(e.target.checked)}
                    className="size-3 accent-[var(--color-accent)]"
                  />
                  <PaintBucket size={13} aria-hidden />
                  채우기
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
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        {/* 캔버스 */}
        <div ref={wrapRef} className="relative overflow-hidden rounded-2xl border border-line bg-[repeating-conic-gradient(#0000000a_0deg_90deg,transparent_90deg_180deg)] [background-size:24px_24px]">
          <Stage
            ref={stageRef}
            width={CANVAS_W * scale}
            height={canvasH * scale}
            scaleX={scale}
            scaleY={scale}
            onMouseDown={onStageDown}
            onMouseMove={onStageMove}
            onMouseUp={onStageUp}
            onTouchStart={onStageDown}
            onTouchMove={onStageMove}
            onTouchEnd={onStageUp}
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
              {elements.map((el) => {
                if (el.hidden) return null; // 숨긴 레이어는 렌더/내보내기에서 제외
                const draggable = tool === "select" && !el.locked;
                const onSelect = () => tool === "select" && !el.locked && setSelectedId(el.id);
                const setRef = (n: Konva.Node | null) => {
                  nodeRefs.current[el.id] = n;
                };
                // 패널 내부 콘텐츠 클리핑: 들어간 패널 영역으로 잘라낸다(noClip이면 해제).
                const clipFrame = el.noClip ? null : containingPanel(el, elements);
                const wrapClip = (node: ReactNode) =>
                  clipFrame ? (
                    <Group key={el.id} clipX={clipFrame.x} clipY={clipFrame.y} clipWidth={clipFrame.width} clipHeight={clipFrame.height}>
                      {node}
                    </Group>
                  ) : (
                    node
                  );
                if (el.type === "image")
                  return wrapClip(
                    <UrlImage
                      key={el.id}
                      el={el}
                      draggable={draggable}
                      innerRef={setRef}
                      onSelect={onSelect}
                      onChange={(patch) => patchEl(el.id, patch)}
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
                    />
                  );
                }
                if (el.type === "draw")
                  return wrapClip(<StudioDrawNode key={el.id} el={el} />);
                if (el.type === "text")
                  return wrapClip(
                    <KText
                      key={el.id}
                      ref={setRef}
                      text={el.text}
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      fontSize={el.fontSize}
                      fill={el.fill}
                      stroke={el.stroke}
                      strokeWidth={el.strokeWidth ?? 0}
                      fillAfterStrokeEnabled
                      lineJoin="round"
                      rotation={el.rotation}
                      fontFamily={el.font ?? "Pretendard, sans-serif"}
                      fontStyle="bold"
                      draggable={draggable}
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
                  return (
                    <KText
                      key={el.id}
                      ref={setRef}
                      text={el.text}
                      x={el.x}
                      y={el.y}
                      fontSize={el.fontSize}
                      rotation={el.rotation}
                      draggable={draggable}
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
                let bStroke = "#16100c";
                let bStrokeW = 3;
                let bRadius = 18;
                let bShadowColor = undefined;
                let bShadowBlur = 0;
                let bShadowOpacity = 0;
                let bShadowOffset = undefined;
                let bTailPoints = [el.width * 0.3, el.height - 3, el.width * 0.22, el.height + 30, el.width * 0.47, el.height - 3];

                if (webtoonTheme === "soft") {
                  bStroke = "#2d2d2d";
                  bStrokeW = 1.8;
                  bRadius = 24;
                  bTailPoints = [el.width * 0.4, el.height - 2, el.width * 0.35, el.height + 20, el.width * 0.52, el.height - 2];
                } else if (webtoonTheme === "vivid") {
                  bStroke = "#444444";
                  bStrokeW = 1.0;
                  bRadius = Math.min(el.width, el.height) / 2;
                  bShadowColor = "black";
                  bShadowBlur = 8;
                  bShadowOpacity = 0.12;
                  bShadowOffset = { x: 2, y: 3 };
                  bTailPoints = [el.width * 0.45, el.height - 2, el.width * 0.45, el.height + 16, el.width * 0.55, el.height - 2];
                }

                // 말풍선 꼬리 방향: 기본 왼쪽, "right"는 x를 좌우 반전, "none"은 숨김.
                const tailDir = el.tail ?? "left";
                const showTail = tailDir !== "none";
                const flipTailX = (pts: number[]) =>
                  tailDir === "right" ? pts.map((v, i) => (i % 2 === 0 ? el.width - v : v)) : pts;
                const speechTailPts = flipTailX(bTailPoints);
                const scaredTailPts = flipTailX([el.width * 0.32, el.height - 2, el.width * 0.26, el.height + 22, el.width * 0.45, el.height - 2]);
                const thoughtBigX = tailDir === "right" ? el.width * 0.74 : el.width * 0.26;
                const thoughtSmallX = tailDir === "right" ? el.width * 0.84 : el.width * 0.16;

                return wrapClip(
                  <Group
                    key={el.id}
                    ref={setRef}
                    x={el.x}
                    y={el.y}
                    rotation={el.rotation}
                    draggable={draggable}
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
                        {showTail && (
                          <>
                            <Ellipse x={thoughtBigX} y={el.height + 12} radiusX={13} radiusY={10} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                            <Ellipse x={thoughtSmallX} y={el.height + 32} radiusX={8} radiusY={7} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                          </>
                        )}
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
                          fill={el.fill === "#ffffff" ? "#f5f3ff" : el.fill}
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
                            fill={el.fill === "#ffffff" ? "#f5f3ff" : el.fill}
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
                            points={
                              tailDir === "right"
                                ? [el.width - 1, 14, el.width + 10, 20, el.width - 1, 26]
                                : [1, 14, -10, 20, 1, 26]
                            }
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
                      text={el.text}
                      width={el.width - 36}
                      height={el.height - 24}
                      x={18}
                      y={12}
                      fontSize={el.fontSize ?? 24}
                      fontFamily={el.font ?? "Pretendard, sans-serif"}
                      fill={el.textFill}
                      align="center"
                      verticalAlign="middle"
                    />
                  </Group>
                );
              })}
              {draft && <StudioDrawNode el={draft} />}
              <Transformer
                ref={trRef}
                rotateEnabled
                keepRatio={selected?.type === "text" || selected?.type === "sticker"}
                enabledAnchors={
                  selected?.type === "text" || selected?.type === "sticker"
                    ? ["top-left", "top-right", "bottom-left", "bottom-right"]
                    : ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right", "top-center", "bottom-center"]
                }
                boundBoxFunc={(oldBox, newBox) => (newBox.width < 24 || newBox.height < 24 ? oldBox : newBox)}
              />
            </Layer>
          </Stage>

          {showQuickStart && (
            <QuickStartPanel
              onDismiss={dismissQuickStart}
              onExample={startFromExample}
              onOpenTemplate={() => openQuickStartMenu("template")}
              onOpenCharacter={() => openQuickStartMenu("char")}
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

          {/* 텍스트 인라인 편집 오버레이 */}
          {editing && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-6">
              <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-4">
                <p className="mb-2 text-sm font-medium text-fg">텍스트 편집</p>
                <textarea
                  autoFocus
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
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

          {selected && (
            <div className="rounded-2xl border border-line bg-panel/40 p-3">
              <p className="mb-2 text-xs font-semibold text-fg-3">선택한 요소</p>
              {(selected.type === "text" || selected.type === "bubble") && (
                <label className="flex items-center justify-between gap-2 text-sm text-fg-2">
                  글자색
                  <input
                    type="color"
                    value={selected.type === "text" ? selected.fill : selected.textFill}
                    onChange={(e) => patchEl(selected.id, (selected.type === "text" ? { fill: e.target.value } : { textFill: e.target.value }) as Partial<El>)}
                    className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent"
                  />
                </label>
              )}
              {selected.type === "bubble" && (
                <label className="mt-2 flex items-center justify-between gap-2 text-sm text-fg-2">
                  말풍선색
                  <input type="color" value={selected.fill} onChange={(e) => patchEl(selected.id, { fill: e.target.value } as Partial<El>)} className="h-7 w-7 cursor-pointer rounded border border-line bg-transparent" />
                </label>
              )}
              {selected.type === "bubble" && selected.variant !== "shout" && selected.variant !== "box" && (
                <div className="mt-2">
                  <p className="mb-1 text-[0.66rem] font-medium text-fg-3">꼬리 방향</p>
                  <div className="flex gap-1">
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
                          "rounded-md border px-2 py-1 text-xs",
                          (selected.tail ?? "left") === t.v
                            ? "border-accent/60 bg-accent-soft/50 text-fg"
                            : "border-line text-fg-2 hover:bg-raised"
                        )}
                      >
                        {t.label}
                      </button>
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
                        { label: "손글씨", v: "'Gaegu', cursive" },
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
                </>
              )}
              {selected.type === "text" && (
                <div className="mt-2">
                  <p className="mb-1 text-[0.66rem] font-medium text-fg-3">외곽선</p>
                  <div className="flex gap-1">
                    {[
                      { label: "없음", v: null },
                      { label: "흰색", v: "#ffffff" },
                      { label: "검정", v: "#16100c" },
                    ].map((o) => {
                      const hasOutline = !!selected.stroke && !!selected.strokeWidth;
                      const active = o.v === null ? !hasOutline : hasOutline && selected.stroke === o.v;
                      return (
                        <button
                          key={o.label}
                          type="button"
                          onClick={() =>
                            patchEl(
                              selected.id,
                              (o.v === null
                                ? { stroke: undefined, strokeWidth: 0 }
                                : { stroke: o.v, strokeWidth: Math.max(3, Math.round(selected.fontSize * 0.08)) }) as Partial<El>
                            )
                          }
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs",
                            active ? "border-accent/60 bg-accent-soft/50 text-fg" : "border-line text-fg-2 hover:bg-raised"
                          )}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
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
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(selected.type === "text" || selected.type === "bubble" || selected.type === "sticker") && (
                  <button type="button" onClick={() => startEditText(selected.id)} className={buttonClass({ size: "sm", variant: "quiet" })}>
                    글자 편집
                  </button>
                )}
                <button type="button" onClick={() => reorder("front")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="맨 앞으로">
                  <ArrowUpToLine size={14} />
                </button>
                <button type="button" onClick={() => reorder("back")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="맨 뒤로">
                  <ArrowDownToLine size={14} />
                </button>
                <button type="button" onClick={() => centerSelected("h")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="가로 가운데 정렬">
                  <AlignHorizontalJustifyCenter size={14} />
                </button>
                <button type="button" onClick={() => centerSelected("v")} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1" })} title="세로 가운데 정렬">
                  <AlignVerticalJustifyCenter size={14} />
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

          {elements.length > 0 && (
            <div className="rounded-2xl border border-line bg-panel/40 p-3">
              <p className="mb-2 text-xs font-semibold text-fg-3">레이어 ({elements.length})</p>
              <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                {elements.map((_, ri) => {
                  const i = elements.length - 1 - ri; // 위(앞) 레이어부터 표시
                  const el = elements[i];
                  return (
                    <li
                      key={el.id}
                      className={cn(
                        "flex items-center gap-1 rounded-lg border px-1.5 py-1",
                        el.id === selectedId ? "border-accent/60 bg-accent-soft/40" : "border-line"
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
                        {elementLabel(el)}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const willLock = !el.locked;
                          patchEl(el.id, { locked: willLock } as Partial<El>);
                          if (willLock && selectedId === el.id) setSelectedId(null);
                        }}
                        className={cn(
                          "grid size-6 place-items-center rounded hover:bg-raised",
                          el.locked ? "text-accent" : "text-fg-3"
                        )}
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
                })}
              </ul>
            </div>
          )}

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
    </Container>
  );
}
