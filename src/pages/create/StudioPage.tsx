import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Konva from "konva";
import { Stage, Layer, Rect, Text as KText, Image as KImage, Line, Group, Star, Ellipse, Transformer } from "react-konva";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Image as ImageIcon,
  ImagePlus,
  Box,
  LayoutTemplate,
  Loader2,
  MessageCircle,
  MousePointer2,
  Pencil,
  Redo2,
  Smile,
  Sparkles,
  Trash2,
  Type as TypeIcon,
  Undo2,
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
import { FX_OVERLAYS } from "./studio-fx-assets";

const Studio3DPoser = lazy(() => import("./Studio3DPoser").then((mod) => ({ default: mod.Studio3DPoser })));
const StudioVrmPoser = lazy(() => import("./StudioVrmPoser").then((mod) => ({ default: mod.StudioVrmPoser })));

type Tool = "select" | "draw";

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
}
interface FrameEl {
  id: string;
  type: "frame";
  x: number;
  y: number;
  width: number;
  height: number;
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
  points: number[];
  stroke: string;
  strokeWidth: number;
}
type El = ImageEl | TextEl | BubbleEl | StickerEl | DrawEl | FrameEl;

const uid = () => crypto.randomUUID();

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
  const [menu, setMenu] = useState<null | "template" | "bubble" | "sticker" | "char" | "bgScene">(null);
  const [bgGrad, setBgGrad] = useState<string[] | null>(null);
  const [charPick, setCharPick] = useState<string>(CHARACTERS[0]?.id ?? "");
  const [poser3dOpen, setPoser3dOpen] = useState(false);
  const [poserVrmOpen, setPoserVrmOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const drawingRef = useRef<DrawEl | null>(null);
  const [draft, setDraft] = useState<DrawEl | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  // 기존 작품 로드(편집 모드).
  useEffect(() => {
    if (!workId) return;
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
      .catch((e) => alive && setError(e instanceof Error ? e.message : "불러오기 실패"));
    return () => {
      alive = false;
    };
  }, [workId]);

  // 트랜스포머를 선택 노드에 부착.
  useEffect(() => {
    const tr = trRef.current;
    if (!tr) return;
    const node = selectedId && tool === "select" ? nodeRefs.current[selectedId] : null;
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
  function removeSelected() {
    if (!selectedId) return;
    commit(elements.filter((e) => e.id !== selectedId));
    setSelectedId(null);
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
    addEl({
      id: uid(),
      type: "bubble",
      variant,
      text: variant === "box" ? "내레이션" : variant === "shout" ? "!!" : "대사를 입력",
      x: CANVAS_W / 2 - 130,
      y: canvasH / 2 - 70,
      width: 260,
      height: 140,
      fill: variant === "shout" ? "#fff6d6" : variant === "scared" ? "#f5f3ff" : "#ffffff",
      textFill: "#111111",
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
  function addCharacter(svg: string, w: number, h: number) {
    setMenu(null);
    addEl(
      createCanvasImageElement({
        id: uid(),
        src: svgToDataUrl(svg),
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

  // 펜(자유 드로잉) — 진행 중 선은 draft 로만 렌더, 끝나면 히스토리에 커밋.
  function onStageDown(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool === "draw") {
      const pos = e.target.getStage()?.getRelativePointerPosition();
      if (!pos) return;
      const line: DrawEl = { id: uid(), type: "draw", points: [pos.x, pos.y], stroke: color, strokeWidth };
      drawingRef.current = line;
      setDraft(line);
      return;
    }
    // 선택 모드: 빈 영역 클릭 시 선택 해제.
    if (e.target === e.target.getStage() || e.target.name() === "bg") setSelectedId(null);
  }
  function onStageMove(e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    if (tool !== "draw" || !drawingRef.current) return;
    const pos = e.target.getStage()?.getRelativePointerPosition();
    if (!pos) return;
    const next = { ...drawingRef.current, points: [...drawingRef.current.points, pos.x, pos.y] };
    drawingRef.current = next;
    setDraft(next);
  }
  function onStageUp() {
    if (drawingRef.current && drawingRef.current.points.length >= 4) {
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
    if (editing) patchEl(editing.id, { text: editing.value } as Partial<El>);
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
        <span className="mx-0.5 h-5 w-px bg-line" />
        <button type="button" onClick={() => setTool("select")} className={toolBtn(tool === "select")} aria-pressed={tool === "select"}>
          <MousePointer2 size={14} /> 선택
        </button>
        <button type="button" onClick={() => setTool("draw")} className={toolBtn(tool === "draw")} aria-pressed={tool === "draw"}>
          <Pencil size={14} /> 펜
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
                      onClick={() => addCharacter(ex.svg, c.width, c.height)}
                      className="overflow-hidden rounded-lg border border-line bg-card p-1 hover:border-accent/50"
                    >
                      <img src={svgToDataUrl(ex.svg)} alt={ex.label} className="h-14 w-full object-contain" />
                      <span className="block text-center text-[0.6rem] text-fg-3">{ex.label}</span>
                    </button>
                  ));
                })()}
              </div>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setPoser3dOpen(true)} className={toolBtn(false)}>
          <Box size={14} /> 3D 캐릭터
        </button>
        <button type="button" onClick={() => setPoserVrmOpen(true)} className={toolBtn(false)}>
          <Sparkles size={14} /> VRM 캐릭터 (고화질)
        </button>
        <div className="relative">
          <button type="button" onClick={() => setMenu(menu === "bgScene" ? null : "bgScene")} className={toolBtn(menu === "bgScene")}>
            <ImageIcon size={14} /> 배경 씬
          </button>
          {menu === "bgScene" && (
            <div className="absolute left-0 top-full z-30 mt-1 w-80 rounded-xl border border-line bg-panel p-2 shadow-lg">
              <p className="mb-1.5 text-[0.66rem] font-medium text-fg-3">2D 배경 씬</p>
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
            <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-xl border border-line bg-panel p-2 shadow-lg">
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
              <p className="mb-1 text-[0.66rem] font-medium text-fg-3">스티커</p>
              <div className="grid grid-cols-8 gap-1 mb-2">
                {EFFECT_EMOJIS.map((em) => (
                  <button key={em} type="button" onClick={() => addSticker(em)} className="rounded-md p-1 text-lg hover:bg-raised">
                    {em}
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
          <label className="inline-flex items-center gap-1.5 text-xs text-fg-3">
            굵기
            <input type="range" min={1} max={40} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-20" />
          </label>
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
                const draggable = tool === "select";
                const onSelect = () => tool === "select" && setSelectedId(el.id);
                const setRef = (n: Konva.Node | null) => {
                  nodeRefs.current[el.id] = n;
                };
                if (el.type === "image")
                  return (
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
                  let fStroke = "#16100c";
                  let fStrokeW = 3;
                  let fRadius = 4;
                  let fShadowColor = undefined;
                  let fShadowBlur = 0;
                  let fShadowOpacity = 0;
                  let fShadowOffset = undefined;

                  if (webtoonTheme === "soft") {
                    fStroke = "#222222";
                    fStrokeW = 1.8;
                    fRadius = 0;
                  } else if (webtoonTheme === "vivid") {
                    fStroke = "#3a3a3a";
                    fStrokeW = 1.2;
                    fRadius = 6;
                    fShadowColor = "black";
                    fShadowBlur = 5;
                    fShadowOpacity = 0.08;
                    fShadowOffset = { x: 1, y: 2 };
                  }

                  return (
                    <Rect
                      key={el.id}
                      ref={setRef}
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      height={el.height}
                      fill="#ffffff"
                      stroke={fStroke}
                      strokeWidth={fStrokeW}
                      cornerRadius={fRadius}
                      shadowColor={fShadowColor}
                      shadowBlur={fShadowBlur}
                      shadowOpacity={fShadowOpacity}
                      shadowOffset={fShadowOffset}
                      draggable={draggable}
                      onMouseDown={onSelect}
                      onTap={onSelect}
                      onDragEnd={(e) => patchEl(el.id, { x: e.target.x(), y: e.target.y() })}
                      onTransformEnd={(e) => {
                        const node = e.target;
                        const w = Math.max(40, node.width() * node.scaleX());
                        const h = Math.max(40, node.height() * node.scaleY());
                        node.scaleX(1);
                        node.scaleY(1);
                        patchEl(el.id, { x: node.x(), y: node.y(), width: w, height: h });
                      }}
                    />
                  );
                }
                if (el.type === "draw")
                  return (
                    <Line
                      key={el.id}
                      points={el.points}
                      stroke={el.stroke}
                      strokeWidth={el.strokeWidth}
                      lineCap="round"
                      lineJoin="round"
                      tension={0.4}
                      listening={false}
                    />
                  );
                if (el.type === "text")
                  return (
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

                return (
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
                        <Ellipse x={el.width * 0.26} y={el.height + 12} radiusX={13} radiusY={10} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
                        <Ellipse x={el.width * 0.16} y={el.height + 32} radiusX={8} radiusY={7} fill={el.fill} stroke={bStroke} strokeWidth={bStrokeW} />
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
                        <Line
                          points={bTailPoints}
                          closed
                          fill={el.fill}
                          stroke={bStroke}
                          strokeWidth={bStrokeW}
                          dash={[8, 5]}
                        />
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
                        <Line
                          points={[
                            el.width * 0.32, el.height - 2,
                            el.width * 0.26, el.height + 22,
                            el.width * 0.45, el.height - 2
                          ]}
                          closed
                          fill={el.fill === "#ffffff" ? "#f5f3ff" : el.fill}
                          stroke="#7c3aed"
                          strokeWidth={2}
                        />
                      </>
                    ) : el.variant === "box" ? (
                      <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={3} stroke={bStroke} strokeWidth={bStrokeW} />
                    ) : (
                      <>
                        <Rect width={el.width} height={el.height} fill={el.fill} cornerRadius={bRadius} stroke={bStroke} strokeWidth={bStrokeW} />
                        <Line
                          points={bTailPoints}
                          closed
                          fill={el.fill}
                          stroke={bStroke}
                          strokeWidth={bStrokeW}
                        />
                      </>
                    )}
                    <KText
                      text={el.text}
                      width={el.width - 36}
                      height={el.height - 24}
                      x={18}
                      y={12}
                      fontSize={24}
                      fill={el.textFill}
                      align="center"
                      verticalAlign="middle"
                    />
                  </Group>
                );
              })}
              {draft && (
                <Line points={draft.points} stroke={draft.stroke} strokeWidth={draft.strokeWidth} lineCap="round" lineJoin="round" tension={0.4} listening={false} />
              )}
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
                <button type="button" onClick={removeSelected} className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-bad" })}>
                  <Trash2 size={14} /> 삭제
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-panel/40 p-3">
            <p className="mb-2 text-xs font-semibold text-fg-3">게시 정보</p>
            <input
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
        {poser3dOpen ? (
          <Studio3DPoser
            open
            onClose={() => setPoser3dOpen(false)}
            onInsert={addRenderedImage}
          />
        ) : null}

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
