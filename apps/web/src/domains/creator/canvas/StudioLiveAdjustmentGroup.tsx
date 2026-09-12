import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Group } from "react-konva/lib/ReactKonvaCore";

import { computeFilterMaskCoverage, shouldApplyFilterMask } from "../filter/studio-filter-mask";
import { acknowledgeStudioRasterImagePresentationDraw, registerStudioMountedRasterImagePresentation } from "../render/studio-raster-image-presentation";
import { refreshStudioRasterPresentationCaches, registerStudioRasterCapturePreparation, registerStudioRasterPresentationCache } from "../render/studio-raster-presentation-cache";
import type { StudioLiveAdjustmentElement } from "../studio-live-adjustment";
import { publishStudioLiveAdjustmentStatus } from "../studio-live-adjustment-status";

import type Konva from "konva";
import type { StudioAdjustmentLayerMask } from "../studio-adjustment-layer-runtime";

type Runtime = typeof import("../studio-adjustment-layer-runtime");
type MaskSource = { image: HTMLImageElement; luminance: boolean };
let nextRequest = 0;

async function decodeMask(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener("abort", abort); };
    const abort = () => { cleanup(); image.removeAttribute("src"); reject(signal.reason); };
    image.onload = () => { cleanup(); resolve(image); };
    image.onerror = () => { cleanup(); reject(new Error("보정 레이어 마스크를 불러오지 못했어요.")); };
    if (signal.aborted) { abort(); return; }
    signal.addEventListener("abort", abort, { once: true });
    image.src = src;
  });
}

async function loadMaskSources(element: StudioLiveAdjustmentElement, signal: AbortSignal): Promise<MaskSource[]> {
  const sources = [
    ...(shouldApplyFilterMask(element) ? [{ src: element.filterMaskSrc, luminance: true }] : []),
    ...(element.maskSrc && element.maskEnabled !== false ? [{ src: element.maskSrc, luminance: false }] : []),
  ];
  const result: MaskSource[] = [];
  for (const source of sources) {
    if (!source.src) throw new Error("보정 마스크 복원이 아직 끝나지 않았어요.");
    const image = await decodeMask(source.src, signal);
    signal.throwIfAborted();
    result.push({ image, luminance: source.luminance });
  }
  return result;
}

/** Reproject original masks at output density, rather than magnifying a 1x mask buffer. */
function renderMask(element: StudioLiveAdjustmentElement, sources: readonly MaskSource[], width: number, height: number, density: number): StudioAdjustmentLayerMask | undefined {
  if (!sources.length) return;
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (const source of sources) {
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    try {
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("보정 마스크 캔버스를 만들지 못했어요.");
      if (density !== 1) context.scale(density, density);
      context.translate(element.x, element.y); context.rotate(element.rotation * Math.PI / 180);
      if (element.flipped) { context.translate(element.width, 0); context.scale(-1, 1); }
      if (element.flippedY) { context.translate(0, element.height); context.scale(1, -1); }
      context.drawImage(source.image, 0, 0, element.width, element.height);
      const rgba = context.getImageData(0, 0, width, height).data;
      const coverage = source.luminance ? computeFilterMaskCoverage(rgba, width, height)?.data : undefined;
      for (let index = 0; index < data.length; index++) data[index] = data[index]! * (coverage ? coverage[index]! : rgba[index * 4 + 3]!) / 255;
    } finally { canvas.width = 0; canvas.height = 0; }
  }
  return { id: element.id + ":mask", revision: ++nextRequest, width, height, data };
}

/** The retained source children keep hit testing and document identity; only their cache is filtered. */
export function StudioLiveAdjustmentGroup({ element, width, height, sourceIds, cacheKey, composite = "source-over", pixelRatio = 1, instanceId, asMask = false, children }: {
  element: StudioLiveAdjustmentElement; width: number; height: number;
  sourceIds: readonly string[]; cacheKey: string; composite?: string; children: ReactNode;
  pixelRatio?: number; instanceId?: string; asMask?: boolean;
}) {
  const ref = useRef<Konva.Group>(null);
  const inputsRef = useRef({ element, sourceIds });
  inputsRef.current = { element, sourceIds };
  const previewDensity = Math.max(1, Math.ceil(pixelRatio));
  useLayoutEffect(() => {
    const { element, sourceIds } = inputsRef.current;
    const node = ref.current;
    const layer = node?.getLayer();
    if (!node || !layer) return;
    const controller = new AbortController();
    const identity = { elementId: element.id, src: element.src, requestKey: `adjustment:${++nextRequest}` };
    const unregisterPresentation = registerStudioMountedRasterImagePresentation(identity);
    let runtime: Runtime | undefined;
    let maskSources: MaskSource[] = [];
    let settled = false;
    let ready = false;
    let revision = 0;
    let density = previewDensity;
    const publish: typeof publishStudioLiveAdjustmentStatus = (id, status) => {
      // A clipping-mask copy has its own capture fence, but must not overwrite the source UI state.
      if (!asMask) publishStudioLiveAdjustmentStatus(id, status);
    };
    const fail = (error: unknown) => {
      ready = false;
      publish(element.id, { state: "error", message: error instanceof Error ? error.message : "보정 레이어를 계산하지 못했어요." });
    };
    publish(element.id, { state: "loading" });
    const recache = () => {
      if (controller.signal.aborted) return false;
      // Child image receipts may install while this module/mask loads. This graph's own fence
      // stays pending, and its eventual cache rebuild also refreshes every outer cache owner.
      if (!settled) return true;
      if (!runtime) return false;
      ready = false;
      try {
        const source = { revision: ++revision, width: width * density, height: height * density, renderKinds: ["group" as const] };
        const plan = runtime.createStudioLiveAdjustmentPlan(element, sourceIds, maskSources.length > 0);
        // Admission precedes allocation at every density, including high-resolution export.
        runtime.createStudioAdjustmentLayerRuntimeRecipe({ plan, source });
        const mask = renderMask(element, maskSources, source.width, source.height, density);
        const recipe = runtime.createStudioAdjustmentLayerRuntimeRecipe({ plan, source, masks: mask ? [mask] : [] });
        node.filters([(imageData) => {
          try {
            const result = runtime!.executeStudioAdjustmentLayerRuntimeSync(recipe, { ...source, imageData }, { masks: mask ? [mask] : [], signal: controller.signal });
            imageData.data.set(result.imageData.data);
            ready = true;
            publish(element.id, { state: "ready" });
          } catch (error) { fail(error); }
        }]);
        node.clearCache();
        node.cache({ x: 0, y: 0, width, height, pixelRatio: density, hitCanvasPixelRatio: 1 });
        // The tiny public capture forces the complete filter program without another page buffer.
        const probe = node.toCanvas({ x: 0, y: 0, width: 1, height: 1, pixelRatio: 1 });
        probe.width = 0; probe.height = 0;
        layer.batchDraw();
        return ready;
      } catch (error) { fail(error); return false; }
    };
    const unregisterCache = registerStudioRasterPresentationCache(node, recache);
    const unregisterCapture = registerStudioRasterCapturePreparation(node, (requestedDensity) => {
      if (!settled || !runtime || !ready) throw new Error("보정 레이어 준비가 끝나지 않아 출력하지 않았어요.");
      const previous = density;
      const target = Math.max(1, Math.ceil(requestedDensity));
      if (target === previous) return () => undefined;
      const restore = () => {
        density = previous;
        if (!recache() || !refreshStudioRasterPresentationCaches(node)) throw new Error("보정 레이어 화면 캐시를 복원하지 못했어요.");
      };
      density = target;
      if (!recache() || !refreshStudioRasterPresentationCaches(node)) {
        try { restore(); } catch { /* The capture remains blocked even if restoration fails. */ }
        throw new Error("요청한 출력 배율에서 보정 레이어를 계산하지 못했어요. 출력 배율을 낮춰 주세요.");
      }
      return restore;
    });
    const afterDraw = () => {
      if (ready && !controller.signal.aborted && node.getLayer() === layer && node.isVisible()) acknowledgeStudioRasterImagePresentationDraw(identity);
    };
    layer.on("draw.studioLiveAdjustment", afterDraw);
    void import("../studio-adjustment-layer-runtime").then(async (loaded) => {
      if (controller.signal.aborted) return undefined;
      // Zoom/DPR must not make a previously renderable long page exceed the preview budget.
      // Export density is admitted independently below and never silently reduced.
      const limits = loaded.STUDIO_ADJUSTMENT_LAYER_RUNTIME_LIMITS;
      const previewPixelBudget = Math.min(limits.maxPixels, Math.floor(limits.maxWorkingBytes / 20));
      density = Math.min(density, 2, Math.max(1, Math.floor(Math.sqrt(previewPixelBudget / (width * height)))));
      loaded.createStudioAdjustmentLayerRuntimeRecipe({
        plan: loaded.createStudioLiveAdjustmentPlan(element, sourceIds, false),
        source: { revision: 0, width: width * density, height: height * density, renderKinds: ["group"] },
      });
      return { loaded, sources: await loadMaskSources(element, controller.signal) };
    }).then((result) => {
      if (!result || controller.signal.aborted) return;
      runtime = result.loaded; maskSources = result.sources; settled = true;
      if (recache() && refreshStudioRasterPresentationCaches(node)) layer.batchDraw();
    }).catch((error: unknown) => { if (!controller.signal.aborted) { settled = true; fail(error); } });
    return () => {
      controller.abort(); unregisterCapture(); unregisterCache(); unregisterPresentation();
      layer.off("draw.studioLiveAdjustment", afterDraw);
      node.clearCache(); node.filters([]);
      publish(element.id, undefined);
    };
  }, [cacheKey, height, width, previewDensity, asMask]);
  return <Group id={instanceId ?? element.id} ref={ref} listening={!asMask} globalCompositeOperation={composite as GlobalCompositeOperation}>{children}</Group>;
}
