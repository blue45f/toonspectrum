import { isStudioStrokePaintModelCompatible } from "../brush/studio-stroke-paint-model";
import type { SkiaDocumentItem } from "@toonspectrum/studio-engine-skia";
import type { SceneNodeIR } from "@toonspectrum/studio-project-model";
import { isDirectLiveDraftEl, resolveStudioCausalInkDrawContract } from "../brush/studio-draw-rendering";
import { resolveStudioBrushRenderFamily } from "../studio-brush";
import { planStudioCausalInk } from "../studio-causal-ink";
import type { DrawEl, El, FrameEl } from "../studio-element-model";
import { createStudioPanelResolver } from "../studio-element-geometry";
import { isStudioVelloDocumentVectorElement, lowerStudioElementsToRenderScene, parseSupportedCssColorToIR } from "./studio-document-scene-lower";

export interface StudioSkiaDocumentPlan {
  readonly supported: boolean;
  readonly items: readonly SkiaDocumentItem[];
  readonly ownedDocumentIds: readonly string[];
  readonly reason: string | null;
}

export function isStudioSkiaCausalInk(element: El): element is DrawEl & El {
  if (element.type !== "draw" || (element.mode !== "pen" && element.mode !== "eraser") || !isDirectLiveDraftEl(element)) return false;
  const family = resolveStudioBrushRenderFamily(element.brush ?? "pen");
  return (element.mode === "eraser" || family === "pen" || family === "marker")
    && (element.sampleSpacing !== undefined || element.pressureModel !== undefined)
    && !element.fill && !element.gradient && !element.pattern && !element.outlineStroke
    && (element.paintModel === undefined || isStudioStrokePaintModelCompatible(element))
    && !element.brushEnginePrograms?.material && !element.sketch?.enabled
    && (!element.symmetry || element.symmetry.type === "none")
    && !element.maskEnabled && !element.maskSrc && !element.clipBelow && !element.alphaLocked
    && (!element.blendMode || element.blendMode === "source-over");
}

export type StudioSkiaFrameTheme = "classic" | "soft" | "vivid";

function isStudioSkiaDocumentFrame(element: El): boolean {
  return element.type === "frame"
    && !element.bg
    && (element.opacity === undefined || element.opacity === 1)
    && Number.isFinite(element.x) && Number.isFinite(element.y)
    && Number.isFinite(element.width) && element.width > 0
    && Number.isFinite(element.height) && element.height > 0
    && (!element.points || (element.points.length >= 6 && element.points.length % 2 === 0 && element.points.every(Number.isFinite)))
    && (!element.bgColor || parseSupportedCssColorToIR(element.bgColor) !== null)
    && (!element.stroke || parseSupportedCssColorToIR(element.stroke) !== null);
}

export function isStudioSkiaDocumentElement(element: El): boolean {
  return isStudioSkiaCausalInk(element) || isStudioVelloDocumentVectorElement(element) || isStudioSkiaDocumentFrame(element);
}

function framePanel(element: FrameEl & El, theme: StudioSkiaFrameTheme): NonNullable<SkiaDocumentItem["panel"]> {
  const vivid = theme === "vivid"; const soft = theme === "soft";
  const strokeWidth = element.strokeWidth ?? (vivid ? 1.2 : soft ? 1.8 : 3);
  return {
    x: element.x, y: element.y, width: element.width, height: element.height,
    fill: parseSupportedCssColorToIR(element.bgColor ?? "#ffffff")!,
    stroke: parseSupportedCssColorToIR(element.stroke ?? (vivid ? "#3a3a3a" : soft ? "#222222" : "#16100c"))!,
    strokeWidth, radius: vivid ? 6 : soft ? 0 : 4, dashed: element.dashStyle === "dashed",
    ...(element.points ? { points: [...element.points] } : {}),
    ...(vivid ? { shadow: { blur: 5, opacity: 0.08, x: 1, y: 2 } } : {}),
  };
}

/** Original dabs/pressure/paint identity are reused, not substituted with an approximate brush. */
export function compileStudioSkiaDocumentItem(element: El, frameTheme: StudioSkiaFrameTheme = "classic"): SkiaDocumentItem | null {
  if (isStudioSkiaCausalInk(element)) {
    if (element.points.length < 2 || element.points.length % 2 || !element.points.every(Number.isFinite)) return null;
    const contract = resolveStudioCausalInkDrawContract(element);
    const color = parseSupportedCssColorToIR(contract.strokeColor);
    if (!color || !Number.isFinite(contract.strokeWidth)) return null;
    const plan = planStudioCausalInk({ points: contract.points, pressures: contract.pressures,
      minDistance: contract.minDistance, size: contract.strokeWidth, pressureModel: contract.pressureModel });
    if (!plan.complete) return null;
    const dabs = new Float32Array(plan.dabs.length * 3);
    plan.dabs.forEach((dab, index) => { dabs[index * 3] = dab.x; dabs[index * 3 + 1] = dab.y; dabs[index * 3 + 2] = dab.radius; });
    return { id: element.id, revision: element, ink: {
      dabs, color, opacity: contract.opacity, union: contract.paintModel !== undefined, erase: element.mode === "eraser",
      ...(contract.nib ? { nib: contract.nib } : {}),
    } };
  }
  if (element.type === "frame") {
    if (!isStudioSkiaDocumentFrame(element)) return null;
    return { id: element.id, revision: { element, frameTheme }, panel: framePanel(element, frameTheme) };
  }
  if (!isStudioVelloDocumentVectorElement(element)) return null;
  const nodes = lowerStudioElementsToRenderScene([element], { width: 1, height: 1 }).nodes;
  if (nodes.some((node) => !["fill-path", "stroke-path", "group"].includes(node.kind))) return null;
  return { id: element.id, revision: element, nodes: nodes as SceneNodeIR[] };
}

/** One cache per editor: unchanged strokes are not replanned after every commit or camera move. */
export function createStudioSkiaDocumentProjector() {
  type CachedProjection = { element: El; panel: FrameEl | null; theme: StudioSkiaFrameTheme | null; item: SkiaDocumentItem };
  let compiled = new Map<string, CachedProjection>();
  const inkBudget = 64 * 1024 * 1024;
  return {
    clear() { compiled.clear(); },
    project(elements: readonly El[], frameTheme: StudioSkiaFrameTheme = "classic"): StudioSkiaDocumentPlan {
      const unsupportedFrame = elements.find((element) => element.type === "frame" && !element.hidden && !isStudioSkiaDocumentFrame(element));
      if (unsupportedFrame) {
        return { supported: false, items: [], ownedDocumentIds: [], reason: `unsupported-frame:${unsupportedFrame.id}` };
      }
      const resolvePanel = createStudioPanelResolver(elements);
      const items: SkiaDocumentItem[] = [];
      const next = new Map<string, CachedProjection>();
      let inkBytes = 0;
      const ids = new Set<string>();
      for (const element of elements) {
        if (element.hidden || (element.opacity ?? 1) <= 0) continue;
        if (ids.has(element.id)) return { supported: false, items: [], ownedDocumentIds: [], reason: "duplicate-document-id" };
        ids.add(element.id);
        const panel = element.type === "frame" || element.noClip ? null : resolvePanel(element);
        const theme = element.type === "frame" ? frameTheme : null;
        let entry = compiled.get(element.id);
        if (entry?.element !== element || entry.panel !== panel || entry.theme !== theme) entry = undefined;
        if (!entry) {
          const result = compileStudioSkiaDocumentItem(element, frameTheme);
          if (!result) return { supported: false, items: [], ownedDocumentIds: [], reason: `unsupported-element:${element.id}` };
          const item = panel
            ? { ...result, revision: { element, panel }, clip: { x: panel.x, y: panel.y, width: panel.width, height: panel.height } }
            : result;
          entry = { element, panel, theme, item };
        }
        inkBytes += entry.item.ink?.dabs.byteLength ?? 0;
        if (inkBytes > inkBudget) return { supported: false, items: [], ownedDocumentIds: [], reason: "GPU ink projection memory budget exceeded" };
        next.set(element.id, entry); items.push(entry.item);
      }
      compiled = next;
      return { supported: true, items, ownedDocumentIds: items.map((item) => item.id), reason: null };
    },
  };
}
