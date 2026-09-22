import { createSkiaDocumentRenderer, type SkiaDocumentFrame } from "@toonspectrum/studio-engine-skia";

import { drawLiveFreehandDraftToContext } from "../../src/domains/creator/brush/studio-draw-rendering";
import { createStudioSkiaDocumentProjector } from "../../src/domains/creator/render/studio-skia-document-plan";

import type { DrawEl, El } from "../../src/domains/creator/studio-element-model";
import type Konva from "konva";

let gpu = document.querySelector<HTMLCanvasElement>("#gpu")!;
const reference = document.querySelector<HTMLCanvasElement>("#reference")!;
let engine = createSkiaDocumentRenderer(gpu);
let viewport = { width: 640, height: 480, dpr: 1 };
const projector = createStudioSkiaDocumentProjector();
let strokes: El[] = [];
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
  for (const element of strokes) drawLiveFreehandDraftToContext(context as unknown as Konva.Context, element as DrawEl);
}
async function present() {
  if (strokes.length <= 280) drawReference();
  const result = await engine.present({ revision: {}, items, width: viewport.width, height: viewport.height,
    documentWidth: 640, documentHeight: 480, dpr: viewport.dpr, camera });
  document.querySelector("#result")!.textContent = JSON.stringify(result);
  return result;
}
const api = {
  async load(count: number, brush = "pen") {
    strokes = Array.from({ length: count }, (_, index) => ({ ...pen(index), brush } as El));
    const plan = projector.project(strokes);
    if (!plan.supported) throw new Error(plan.reason ?? "Unsupported fixture");
    items = plan.items; if (count <= 280) drawReference();
    return present();
  },
  async camera(next: typeof camera) { camera = next; if (strokes.length <= 280) drawReference(); return present(); },
  async append() {
    strokes = [...strokes, pen(strokes.length)]; items = projector.project(strokes).items;
    return present();
  },
  async erase() {
    const eraser = { ...pen(strokes.length), id: `eraser-${strokes.length}`, mode: "eraser", brush: "eraser", paintModel: undefined,
      points: [35, 38, 300, 38], pressures: [0.5, 0.5], strokeWidth: 15, opacity: 0.65 } as El;
    strokes = [...strokes, eraser]; items = projector.project(strokes).items; return present();
  },
  async undo() { strokes = strokes.slice(0, -1); items = projector.project(strokes).items; return present(); },
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
    gpu.replaceWith(replacement); gpu = replacement; engine = createSkiaDocumentRenderer(gpu);
    return present();
  },
  async interleavedSurface() {
    const other = document.createElement("canvas"); document.body.append(other);
    const renderer = createSkiaDocumentRenderer(other);
    try {
      const result = await renderer.present({ revision: {}, items, ...viewport, documentWidth: 640, documentHeight: 480, camera });
      if (result.status !== "presented") throw new Error("Second GPU context failed");
      return await api.append();
    } finally { renderer.dispose(); other.remove(); }
  },

  destroy() { engine.dispose(); projector.clear(); },
  pixels() { return { gpu: gpu.toDataURL(), reference: reference.toDataURL() }; },
};
declare global { interface Window { skiaEngineQA: typeof api } }
window.skiaEngineQA = api;
void api.load(80).catch((cause: unknown) => { document.querySelector("#result")!.textContent = String(cause); });

// This fixture intentionally keeps CPU reference readback outside the product renderer.
