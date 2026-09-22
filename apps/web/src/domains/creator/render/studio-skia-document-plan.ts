import { isStudioStrokePaintModelCompatible } from "../brush/studio-stroke-paint-model";
import type { SkiaDocumentItem } from "@toonspectrum/studio-engine-skia";
import type { SceneNodeIR } from "@toonspectrum/studio-project-model";
import { isDirectLiveDraftEl, resolveStudioCausalInkDrawContract } from "../brush/studio-draw-rendering";
import { resolveStudioBrushRenderFamily } from "../studio-brush";
import { planStudioCausalInk } from "../studio-causal-ink";
import type { DrawEl, El, FrameEl, ImageEl, TextEl } from "../studio-element-model";
import { createStudioPanelResolver } from "../studio-element-geometry";
import { skewDegToKonva } from "../studio-skew";
import { isStudioStandardBlendMode } from "../studio-standard-blend";
import { hasActiveImageFilters } from "./studio-konva-filter-fields";
import { resolveStudioSkiaDocumentFontSource } from "./studio-skia-document-font-contract";
import { requiresStudioSkiaSpecialistRaster } from "./studio-skia-specialist-raster";
import type { StudioSkiaPreparedImageProjection } from "./studio-skia-specialist-document-projection";
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

const STUDIO_SKIA_STRONG_RTL_TEXT = /[\u0590-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/u;

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

function isStudioSkiaDocumentText(element: El): element is TextEl & El {
  if (element.type !== "text" || !element.text || element.text.length > 200_000
    || STUDIO_SKIA_STRONG_RTL_TEXT.test(element.text)) return false;
  if (element.vertical || element.textPath || element.rubySpans?.length || element.rangeFormats?.length) return false;
  if (element.fillType === "gradient" || element.gradient || element.gradientColorStart || element.gradientColorEnd) return false;
  if (element.stroke && (element.strokeWidth ?? 0) > 0) return false;
  if (element.shadowColor && (element.shadowOpacity ?? 0) > 0) return false;
  if (element.stickyNotePresetId || element.stickyNoteFill) return false;
  if ((element.skewX ?? 0) !== 0 || (element.skewY ?? 0) !== 0) return false;
  const opacity = element.opacity ?? 1;
  const lineHeight = element.lineHeight ?? 1;
  const letterSpacing = element.letterSpacing ?? 0;
  return [
    element.x,
    element.y,
    element.width,
    element.fontSize,
    element.rotation,
    opacity,
    lineHeight,
    letterSpacing,
  ].every(Number.isFinite)
    && element.width > 0
    && element.fontSize > 0
    && opacity >= 0
    && opacity <= 1
    && lineHeight > 0
    && parseSupportedCssColorToIR(element.fill) !== null;
}

function resolveImageBlendMode(
  value: string | undefined,
): NonNullable<SkiaDocumentItem["image"]>["blendMode"] | null {
  if (!value || value === "normal" || value === "source-over") {
    return "source-over";
  }
  if (!isStudioStandardBlendMode(value)) return null;
  return value === "normal" ? "source-over" : value;
}

function resolveImageShadow(
  element: ImageEl & El,
): NonNullable<NonNullable<SkiaDocumentItem["image"]>["shadow"]> | null | undefined {
  if (!element.shadowColor || (element.shadowOpacity ?? 1) <= 0) {
    return undefined;
  }
  const color = parseSupportedCssColorToIR(element.shadowColor);
  const blur = element.shadowBlur ?? 0;
  const offsetX = element.shadowOffsetX ?? 0;
  const offsetY = element.shadowOffsetY ?? 0;
  const opacity = element.shadowOpacity ?? 1;
  if (!color
    || [blur, offsetX, offsetY, opacity].some((value) => !Number.isFinite(value))
    || blur < 0
    || opacity < 0
    || opacity > 1) {
    return null;
  }
  return { color, blur, offsetX, offsetY, opacity };
}

function isStudioSkiaDocumentImage(element: El): element is ImageEl & El {
  if (element.type !== "image" || !element.src || element.isAnimatedGif || (element.frames?.length ?? 0) > 1) return false;
  if (element.filterPageComposite || element.adjustmentLayer || hasActiveImageFilters(element)) return false;
  if (element.filterMaskSrc || element.filterMaskEnabled || element.maskSrc || element.maskEnabled
    || element.clipBelow || element.alphaLocked) return false;
  const blendMode = resolveImageBlendMode(element.blendMode);
  const shadow = resolveImageShadow(element);
  const opacity = element.opacity ?? 1;
  const cornerRadius = element.cornerRadius ?? 0;
  const skewX = element.skewX ?? 0;
  const skewY = element.skewY ?? 0;
  return blendMode !== null
    && shadow !== null
    && [
      element.x,
      element.y,
      element.width,
      element.height,
      element.rotation,
      opacity,
      cornerRadius,
      skewX,
      skewY,
    ].every(Number.isFinite)
    && element.width > 0
    && element.height > 0
    && opacity >= 0
    && opacity <= 1
    && cornerRadius >= 0
    && Math.abs(skewX) <= 60
    && Math.abs(skewY) <= 60
    && element.src.length <= 48 * 1024 * 1024
    && /^(?:data:image\/(?:png|jpeg);base64,|blob:|https?:\/\/|\/)/iu.test(element.src);
}

function isStudioSkiaSpecialistDocumentImage(element: El): boolean {
  if (!requiresStudioSkiaSpecialistRaster(element)
    || element.filterPageComposite
    || element.adjustmentLayer
    || element.clipBelow
    || element.alphaLocked) return false;
  const blendMode = resolveImageBlendMode(element.blendMode);
  const shadow = resolveImageShadow(element);
  const opacity = element.opacity ?? 1;
  const cornerRadius = element.cornerRadius ?? 0;
  const skewX = element.skewX ?? 0;
  const skewY = element.skewY ?? 0;
  return blendMode !== null
    && shadow !== null
    && [
      element.x,
      element.y,
      element.width,
      element.height,
      element.rotation,
      opacity,
      cornerRadius,
      skewX,
      skewY,
    ].every(Number.isFinite)
    && element.width > 0
    && element.height > 0
    && opacity >= 0
    && opacity <= 1
    && cornerRadius >= 0
    && Math.abs(skewX) <= 60
    && Math.abs(skewY) <= 60
    && element.src.length <= 48 * 1024 * 1024
    && /^(?:data:image\/(?:png|jpeg|webp|gif);base64,|blob:|https?:\/\/|\/)/iu.test(element.src);
}

export function isStudioSkiaDocumentElement(element: El): boolean {
  return isStudioSkiaCausalInk(element)
    || isStudioVelloDocumentVectorElement(element)
    || isStudioSkiaDocumentFrame(element)
    || isStudioSkiaDocumentText(element)
    || isStudioSkiaDocumentImage(element)
    || isStudioSkiaSpecialistDocumentImage(element);
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
export function compileStudioSkiaDocumentItem(
  element: El,
  frameTheme: StudioSkiaFrameTheme = "classic",
  preparedImage?: StudioSkiaPreparedImageProjection,
): SkiaDocumentItem | null {
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
  if (isStudioSkiaDocumentText(element)) {
    const color = parseSupportedCssColorToIR(element.fill);
    if (!color) return null;
    const style = element.fontStyle ?? "bold";
    const weight = style.includes("bold") ? 700 : 400;
    return {
      id: element.id,
      revision: element,
      text: {
        text: element.text,
        x: element.x,
        y: element.y,
        width: element.width,
        fontSize: element.fontSize,
        rotation: element.rotation,
        opacity: element.opacity ?? 1,
        color,
        align: element.align ?? "left",
        letterSpacing: element.letterSpacing ?? 0,
        lineHeight: element.lineHeight ?? 1,
        weight,
        italic: style.includes("italic"),
        font: resolveStudioSkiaDocumentFontSource(element.font, weight),
      },
    };
  }
  if (isStudioSkiaSpecialistDocumentImage(element)) {
    if (!preparedImage) return null;
    const imageElement = element as ImageEl & El;
    const blendMode = resolveImageBlendMode(imageElement.blendMode);
    const shadow = resolveImageShadow(imageElement);
    if (!blendMode || shadow === null) return null;
    return {
      id: imageElement.id,
      revision: { element: imageElement, specialistRasterKey: preparedImage.key },
      image: {
        src: preparedImage.src,
        x: imageElement.x,
        y: imageElement.y,
        width: imageElement.width,
        height: imageElement.height,
        rotation: imageElement.rotation,
        opacity: imageElement.opacity ?? 1,
        flipX: Boolean(imageElement.flipped),
        flipY: Boolean(imageElement.flippedY),
        skewX: skewDegToKonva(imageElement.skewX ?? 0),
        skewY: skewDegToKonva(imageElement.skewY ?? 0),
        cornerRadius: 0,
        rasterBounds: preparedImage.rasterBounds,
        blendMode,
        ...(shadow ? { shadow } : {}),
      },
    };
  }
  if (isStudioSkiaDocumentImage(element)) {
    const blendMode = resolveImageBlendMode(element.blendMode);
    const shadow = resolveImageShadow(element);
    if (!blendMode || shadow === null) return null;
    return {
      id: element.id,
      revision: element,
      image: {
        src: element.src,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        rotation: element.rotation,
        opacity: element.opacity ?? 1,
        flipX: Boolean(element.flipped),
        flipY: Boolean(element.flippedY),
        skewX: skewDegToKonva(element.skewX ?? 0),
        skewY: skewDegToKonva(element.skewY ?? 0),
        cornerRadius: element.cornerRadius ?? 0,
        blendMode,
        ...(shadow ? { shadow } : {}),
      },
    };
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
  type CachedProjection = {
    element: El;
    panel: FrameEl | null;
    theme: StudioSkiaFrameTheme | null;
    preparedImageKey: string | null;
    item: SkiaDocumentItem;
  };
  let compiled = new Map<string, CachedProjection>();
  const inkBudget = 64 * 1024 * 1024;
  return {
    clear() { compiled.clear(); },
    project(
      elements: readonly El[],
      frameTheme: StudioSkiaFrameTheme = "classic",
      preparedImages: ReadonlyMap<string, StudioSkiaPreparedImageProjection> = new Map(),
    ): StudioSkiaDocumentPlan {
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
        const preparedImage = preparedImages.get(element.id);
        const preparedImageKey = preparedImage?.key ?? null;
        let entry = compiled.get(element.id);
        if (entry?.element !== element
          || entry.panel !== panel
          || entry.theme !== theme
          || entry.preparedImageKey !== preparedImageKey) entry = undefined;
        if (!entry) {
          const result = compileStudioSkiaDocumentItem(element, frameTheme, preparedImage);
          if (!result) return { supported: false, items: [], ownedDocumentIds: [], reason: `unsupported-element:${element.id}` };
          const item = panel
            ? {
                ...result,
                revision: { element, panel, preparedImageKey },
                clip: { x: panel.x, y: panel.y, width: panel.width, height: panel.height },
              }
            : result;
          entry = { element, panel, theme, preparedImageKey, item };
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
