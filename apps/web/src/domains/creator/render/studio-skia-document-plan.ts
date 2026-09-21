import { isStudioStrokePaintModelCompatible } from "../brush/studio-stroke-paint-model";
import type { SkiaDocumentItem } from "@toonspectrum/studio-engine-skia";
import type { SceneNodeIR } from "@toonspectrum/studio-project-model";
import { isDirectLiveDraftEl, resolveStudioCausalInkDrawContract } from "../brush/studio-draw-rendering";
import { resolveStudioBrushRenderFamily } from "../studio-brush";
import { planStudioCausalInk } from "../studio-causal-ink";
import type { DrawEl, El } from "../studio-element-model";
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

export function isStudioSkiaDocumentElement(element: El): boolean {
  return isStudioSkiaCausalInk(element) || isStudioVelloDocumentVectorElement(element);
}

/** Original dabs/pressure/paint identity are reused, not substituted with an approximate brush. */
export function compileStudioSkiaDocumentItem(element: El): SkiaDocumentItem | null {
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
  if (!isStudioVelloDocumentVectorElement(element)) return null;
  const nodes = lowerStudioElementsToRenderScene([element], { width: 1, height: 1 }).nodes;
  if (nodes.some((node) => !["fill-path", "stroke-path", "group"].includes(node.kind))) return null;
  return { id: element.id, revision: element, nodes: nodes as SceneNodeIR[] };
}

/** One cache per editor: unchanged strokes are not replanned after every commit or camera move. */
export function createStudioSkiaDocumentProjector() {
  let compiled = new Map<string, SkiaDocumentItem>();
  const inkBudget = 64 * 1024 * 1024;
  return {
    clear() { compiled.clear(); },
    project(elements: readonly El[]): StudioSkiaDocumentPlan {
      // Transparent frame paint still clips its children in the authoritative document.
      if (elements.some((element) => element.type === "frame" && !element.hidden)) {
        return { supported: false, items: [], ownedDocumentIds: [], reason: "frame-clip-requires-compatibility" };
      }
      const items: SkiaDocumentItem[] = [];
      const next = new Map<string, SkiaDocumentItem>();
      let inkBytes = 0;
      const ids = new Set<string>();
      for (const element of elements) {
        if (element.hidden || (element.opacity ?? 1) <= 0) continue;
        if (ids.has(element.id)) return { supported: false, items: [], ownedDocumentIds: [], reason: "duplicate-document-id" };
        ids.add(element.id);
        let item = compiled.get(element.id);
        if (item?.revision !== element) item = undefined;
        if (!item) {
          const result = compileStudioSkiaDocumentItem(element);
          if (!result) return { supported: false, items: [], ownedDocumentIds: [], reason: `unsupported-element:${element.id}` };
          item = result;
        }
        inkBytes += item.ink?.dabs.byteLength ?? 0;
        if (inkBytes > inkBudget) return { supported: false, items: [], ownedDocumentIds: [], reason: "GPU ink projection memory budget exceeded" };
        next.set(element.id, item); items.push(item);
      }
      compiled = next;
      return { supported: true, items, ownedDocumentIds: items.map((item) => item.id), reason: null };
    },
  };
}
