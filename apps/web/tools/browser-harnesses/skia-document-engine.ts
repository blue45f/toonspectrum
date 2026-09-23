import { createSkiaDocumentRenderer, type SkiaDocumentFrame } from "@toonspectrum/studio-engine-skia";

import { drawLiveFreehandDraftToContext } from "../../src/domains/creator/brush/studio-draw-rendering";
import { loadStudioSkiaDocumentFontData } from "../../src/domains/creator/render/studio-skia-document-font-source";
import { createStudioSkiaDocumentProjector } from "../../src/domains/creator/render/studio-skia-document-plan";
import { projectStudioSkiaLiveTransformElements } from "../../src/domains/creator/render/studio-skia-live-transform-projection";
import { createStudioLiveTransformDraftStore } from "../../src/domains/creator/studio-live-transform-draft-store";

import type { DrawEl, El } from "../../src/domains/creator/studio-element-model";
import type { StudioLiveTransformDraftClaim } from "../../src/domains/creator/studio-live-transform-draft-store";
import type Konva from "konva";

type StudioTextElement = Extract<El, { readonly type: "text" }>;

let gpu = document.querySelector<HTMLCanvasElement>("#gpu")!;
const reference = document.querySelector<HTMLCanvasElement>("#reference")!;
const createEngine = (canvas: HTMLCanvasElement) => createSkiaDocumentRenderer(canvas, {
  loadFontData: loadStudioSkiaDocumentFontData,
});
let engine = createEngine(gpu);
let viewport = { width: 640, height: 480, dpr: 1 };
const projector = createStudioSkiaDocumentProjector();
const transformStore = createStudioLiveTransformDraftStore();
const transformScope = "page:skia-browser-harness";
let transformClaim: StudioLiveTransformDraftClaim | null = null;
let transformTerminal: DrawEl | null = null;
let transformProjectionToken = "base";
let strokes: El[] = [];
let panel: El | null = null;
let rasterElement: El | null = null;
let rasterImage: HTMLImageElement | null = null;
let textElement: StudioTextElement | null = null;
let items: SkiaDocumentFrame["items"] = [];
let camera: SkiaDocumentFrame["camera"] = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, rotation: 0 };
const pen = (index: number): El => {
  const x = 30 + (index % 20) * 27; const y = 30 + (Math.floor(index / 20) % 14) * 28;
  return { id: `ink-${index}`, type: "draw", kind: "freehand", mode: "pen", brush: "pen",
    points: [x, y, x + 6, y + 10, x + 16, y + 5], pressures: [0.2, 0.65, 1],
    stroke: index % 2 ? "#2266bb" : "#db3344", strokeWidth: 9, sampleSpacing: 0,
    pressureModel: "linear-residual-path-v3", paintModel: "layered-flow-v1", opacity: 0.65,
  } as El;
};
function drawReference() {
  reference.width = Math.ceil(viewport.width * viewport.dpr); reference.height = Math.ceil(viewport.height * viewport.dpr);
  const context = reference.getContext("2d")!;
  context.setTransform(1, 0, 0, 1, 0, 0); context.clearRect(0, 0, reference.width, reference.height);
  context.scale(viewport.dpr, viewport.dpr);
  context.translate(camera.offsetX, camera.offsetY); context.rotate(camera.rotation * Math.PI / 180);
  context.scale(camera.scaleX, camera.scaleY);
  context.beginPath(); context.rect(0, 0, 640, 480); context.clip();
  if (panel?.type === "frame") {
    context.save(); context.translate(panel.x, panel.y);
    const points = panel.points;
    context.beginPath();
    if (points?.length) {
      context.moveTo(points[0]!, points[1]!);
      for (let i = 2; i < points.length; i += 2) context.lineTo(points[i]!, points[i + 1]!);
      context.closePath();
    } else context.rect(0, 0, panel.width, panel.height);
    context.clip();
    context.fillStyle = panel.bgColor ?? "#ffffff"; context.fill();
    const width = panel.strokeWidth ?? 3;
    if (width > 0) {
      context.strokeStyle = panel.stroke ?? "#16100c"; context.lineWidth = width;
      context.setLineDash(panel.dashStyle === "dashed" ? [10, 5] : []);
      if (!points?.length && "roundRect" in context) {
        context.beginPath(); context.roundRect(width / 2, width / 2, panel.width - width, panel.height - width, Math.max(0, 4 - width / 2));
      }
      context.stroke();
    }
    context.restore();
  }
  if (rasterElement?.type === "image" && rasterImage) {
    context.save();
    context.globalAlpha = rasterElement.opacity ?? 1;
    context.translate(rasterElement.x, rasterElement.y);
    context.rotate(rasterElement.rotation * Math.PI / 180);
    context.translate(rasterElement.flipped ? rasterElement.width : 0, rasterElement.flippedY ? rasterElement.height : 0);
    context.scale(rasterElement.flipped ? -1 : 1, rasterElement.flippedY ? -1 : 1);
    context.drawImage(rasterImage, 0, 0, rasterElement.width, rasterElement.height);
    context.restore();
  }
  const currentTextElement = textElement;
  if (currentTextElement) {
    context.save();
    context.globalAlpha = currentTextElement.opacity ?? 1;
    context.fillStyle = currentTextElement.fill;
    context.translate(currentTextElement.x, currentTextElement.y);
    context.rotate(currentTextElement.rotation * Math.PI / 180);
    context.font = `${currentTextElement.fontStyle ?? "bold"} ${currentTextElement.fontSize}px Pretendard`;
    context.textBaseline = "top";
    context.textAlign = currentTextElement.align ?? "left";
    const alignedX = currentTextElement.align === "center"
      ? currentTextElement.width / 2
      : currentTextElement.align === "right" ? currentTextElement.width : 0;
    const letterContext = context as CanvasRenderingContext2D & { letterSpacing: string };
    letterContext.letterSpacing = `${currentTextElement.letterSpacing ?? 0}px`;
    const lineHeight = currentTextElement.fontSize * (currentTextElement.lineHeight ?? 1);
    currentTextElement.text.split("\n").forEach((line, index) => {
      context.fillText(line, alignedX, index * lineHeight, currentTextElement.width);
    });
    context.restore();
  }
  for (const element of strokes) {
    if (panel?.type === "frame" && !element.noClip) {
      context.save(); context.beginPath(); context.rect(panel.x, panel.y, panel.width, panel.height); context.clip();
      drawLiveFreehandDraftToContext(context as unknown as Konva.Context, element as DrawEl); context.restore();
    } else drawLiveFreehandDraftToContext(context as unknown as Konva.Context, element as DrawEl);
  }
}
const projectedElements = (): El[] => [
  ...(panel ? [panel] : []),
  ...(rasterElement ? [rasterElement] : []),
  ...(textElement ? [textElement] : []),
  ...strokes,
];

async function present() {
  if (strokes.length <= 280) drawReference();
  const result = await engine.present({ revision: {}, items, width: viewport.width, height: viewport.height,
    documentWidth: 640, documentHeight: 480, dpr: viewport.dpr, camera });
  document.querySelector("#result")!.textContent = JSON.stringify(result);
  return result;
}
function releaseTransformFixture() {
  transformClaim?.release();
  transformClaim = null;
  transformTerminal = null;
  transformProjectionToken = "base";
  transformStore.releaseScope(transformScope);
}
function transformProjection() {
  const projection = projectStudioSkiaLiveTransformElements(
    projectedElements(),
    transformStore.getSnapshot(),
    transformScope,
  );
  const plan = projector.project(projection.elements);
  if (!plan.supported) throw new Error(plan.reason ?? "Unsupported transform fixture");
  return { projection, plan };
}
const api = {
  async load(count: number, brush = "pen") {
    releaseTransformFixture();
    panel = null; rasterElement = null; rasterImage = null; textElement = null;
    strokes = Array.from({ length: count }, (_, index) => ({ ...pen(index), brush } as El));
    const plan = projector.project(strokes);
    if (!plan.supported) throw new Error(plan.reason ?? "Unsupported fixture");
    items = plan.items; if (count <= 280) drawReference();
    return present();
  },
  async panel() {
    rasterElement = null; rasterImage = null; textElement = null;
    panel = { id: "panel", type: "frame", x: 90, y: 70, width: 180, height: 120,
      bgColor: "#f4f0e8", stroke: "#16100c", strokeWidth: 3 } as El;
    strokes = [{ ...pen(0), id: "panel-ink", points: [40, 100, 140, 95, 320, 100],
      pressures: [0.5, 0.8, 0.5], strokeWidth: 14 } as El];
    const plan = projector.project(projectedElements(), "classic");
    if (!plan.supported) throw new Error(plan.reason ?? "Unsupported panel fixture");
    items = plan.items; drawReference();
    return present();
  },
  async image() {
    panel = null; textElement = null; strokes = [];
    const source = document.createElement("canvas");
    source.width = 24; source.height = 16;
    const sourceContext = source.getContext("2d")!;
    sourceContext.fillStyle = "#ee3344"; sourceContext.fillRect(0, 0, 12, 16);
    sourceContext.fillStyle = "#2288dd"; sourceContext.fillRect(12, 0, 12, 8);
    sourceContext.fillStyle = "#55aa44"; sourceContext.fillRect(12, 8, 12, 8);
    const src = source.toDataURL("image/png");
    rasterImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("fixture image decode failed")); image.src = src;
    });
    rasterElement = { id: "raster", type: "image", src, x: 120, y: 90, width: 180, height: 120,
      rotation: 12, opacity: 0.8, flipped: true, flippedY: false } as El;
    const plan = projector.project(projectedElements());
    if (!plan.supported) throw new Error(plan.reason ?? "Unsupported image fixture");
    items = plan.items; drawReference();
    return present();
  },
  async text() {
    panel = null; rasterElement = null; rasterImage = null; strokes = [];
    await document.fonts.load("italic 700 28px Pretendard", "안녕하세요 GPU 텍스트");
    textElement = {
      id: "text",
      type: "text",
      text: "안녕하세요 GPU\n문단 렌더링",
      x: 120,
      y: 100,
      width: 320,
      fontSize: 28,
      fill: "#224466",
      font: "Pretendard, sans-serif",
      fontStyle: "bold italic",
      align: "center",
      letterSpacing: 1.5,
      lineHeight: 1.25,
      rotation: 8,
      opacity: 0.8,
    } as StudioTextElement;
    const plan = projector.project(projectedElements());
    if (!plan.supported) throw new Error(plan.reason ?? "Unsupported text fixture");
    items = plan.items; drawReference();
    return present();
  },
  async camera(next: typeof camera) { camera = next; if (strokes.length <= 280) drawReference(); return present(); },
  async append() {
    strokes = [...strokes, pen(strokes.length)]; items = projector.project(projectedElements()).items;
    return present();
  },
  async beginTransform() {
    releaseTransformFixture();
    const source = strokes[0];
    if (source?.type !== "draw") throw new Error("Transform fixture requires a draw source");
    transformClaim = transformStore.claim(transformScope, [source.id]);
    if (!transformClaim) throw new Error("Transform fixture claim failed");
    transformTerminal = { ...source, points: source.points.map((value, index) => value + (index % 2 ? 18 : 32)) };
    transformClaim.present([{ element: transformTerminal, clip: null }]);
    const { projection, plan } = transformProjection();
    transformProjectionToken = projection.token;
    items = plan.items;
    const result = await present();
    return { result, token: projection.token, sourceId: source.id };
  },
  moveTransform(delta = 8) {
    if (!transformClaim || !transformTerminal) throw new Error("Transform fixture is not active");
    transformTerminal = {
      ...transformTerminal,
      points: transformTerminal.points.map((value, index) => value + (index % 2 ? delta / 2 : delta)),
    };
    transformClaim.present([{ element: transformTerminal, clip: null }]);
    const projection = projectStudioSkiaLiveTransformElements(
      projectedElements(),
      transformStore.getSnapshot(),
      transformScope,
    );
    const submitted = projection.token !== transformProjectionToken;
    if (submitted) {
      const plan = projector.project(projection.elements);
      if (!plan.supported) throw new Error(plan.reason ?? "Unsupported transform fixture");
      items = plan.items;
      transformProjectionToken = projection.token;
    }
    return { token: projection.token, submitted, revision: transformStore.getSnapshot()?.revision ?? null };
  },
  async handoffTransform() {
    if (!transformClaim || !transformTerminal) throw new Error("Transform fixture is not active");
    const claim = transformClaim;
    const terminal = transformTerminal;
    if (!claim.handoff([terminal], () => undefined)) throw new Error("Transform fixture handoff failed");
    strokes = strokes.map((element) => element.id === terminal.id ? terminal : element);
    const { projection, plan } = transformProjection();
    if (projection.token !== "base") throw new Error("Authoritative transform did not restore the base projection");
    items = plan.items;
    transformProjectionToken = projection.token;
    const result = await present();
    const acknowledged = transformStore.acknowledgeAuthoritative(transformScope, strokes);
    transformClaim = null;
    transformTerminal = null;
    return { result, token: projection.token, acknowledged };
  },
  async erase() {
    const eraser = { ...pen(strokes.length), id: `eraser-${strokes.length}`, mode: "eraser", brush: "eraser", paintModel: undefined,
      points: [35, 38, 300, 38], pressures: [0.5, 0.5], strokeWidth: 15, opacity: 0.65 } as El;
    strokes = [...strokes, eraser]; items = projector.project(projectedElements()).items; return present();
  },
  async undo() { strokes = strokes.slice(0, -1); items = projector.project(projectedElements()).items; return present(); },
  async redraw() { return present(); },
  async resize(width: number, height: number, dpr = 1) { viewport = { width, height, dpr }; return present(); },
  async loseContext() {
    const extension = gpu.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Device-loss injection unavailable");
    const lost = new Promise<void>((resolve) => gpu.addEventListener("webglcontextlost", () => resolve(), { once: true }));
    extension.loseContext(); await lost; return present();
  },
  async recover() {
    engine.dispose();
    const replacement = gpu.cloneNode(false) as HTMLCanvasElement;
    gpu.replaceWith(replacement); gpu = replacement; engine = createEngine(gpu);
    return present();
  },
  async interleavedSurface() {
    const other = document.createElement("canvas"); document.body.append(other);
    const renderer = createEngine(other);
    try {
      const result = await renderer.present({ revision: {}, items, ...viewport, documentWidth: 640, documentHeight: 480, camera });
      if (result.status !== "presented") throw new Error("Second GPU context failed");
      return await api.append();
    } finally { renderer.dispose(); other.remove(); }
  },

  destroy() { releaseTransformFixture(); engine.dispose(); projector.clear(); },
  pixels() { return { gpu: gpu.toDataURL(), reference: reference.toDataURL() }; },
};
declare global { interface Window { skiaEngineQA: typeof api } }
window.skiaEngineQA = api;
void api.load(80).catch((cause: unknown) => { document.querySelector("#result")!.textContent = String(cause); });

// This fixture intentionally keeps CPU reference readback outside the product renderer.
