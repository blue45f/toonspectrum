import { useLayoutEffect, useRef, type ReactNode } from "react";
import { Group } from "react-konva/lib/ReactKonvaCore";

import { computeFilterMaskCoverage, shouldApplyFilterMask } from "../filter/studio-filter-mask";
import { acknowledgeStudioRasterImagePresentationDraw, registerStudioMountedRasterImagePresentation } from "../render/studio-raster-image-presentation";
import { refreshStudioRasterPresentationCaches, registerStudioRasterPresentationCache } from "../render/studio-raster-presentation-cache";
import { createStudioLiveAdjustmentPlan, type StudioLiveAdjustmentElement } from "../studio-live-adjustment";
import { publishStudioLiveAdjustmentStatus } from "../studio-live-adjustment-status";

import type Konva from "konva";
import type { StudioAdjustmentLayerMask } from "../studio-adjustment-layer-runtime";

type Runtime = typeof import("../studio-adjustment-layer-runtime");
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

async function loadMask(element: StudioLiveAdjustmentElement, width: number, height: number, signal: AbortSignal): Promise<StudioAdjustmentLayerMask | undefined> {
  const sources = [
    ...(shouldApplyFilterMask(element) ? [{ src: element.filterMaskSrc, luminance: true }] : []),
    ...(element.maskSrc && element.maskEnabled !== false ? [{ src: element.maskSrc, luminance: false }] : []),
  ];
  if (!sources.length) return;
  const data = new Uint8ClampedArray(width * height).fill(255);
  for (const source of sources) {
    if (!source.src) throw new Error("보정 마스크 복원이 아직 끝나지 않았어요.");
    const image = await decodeMask(source.src, signal);
    if (signal.aborted) throw signal.reason;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("보정 마스크 캔버스를 만들지 못했어요.");
    context.translate(element.x, element.y); context.rotate(element.rotation * Math.PI / 180);
    if (element.flipped) { context.translate(element.width, 0); context.scale(-1, 1); }
    if (element.flippedY) { context.translate(0, element.height); context.scale(1, -1); }
    context.drawImage(image, 0, 0, element.width, element.height);
    const rgba = context.getImageData(0, 0, width, height).data;
    const coverage = source.luminance ? computeFilterMaskCoverage(rgba, width, height)?.data : undefined;
    for (let index = 0; index < data.length; index++) data[index] = data[index]! * (coverage ? coverage[index]! : rgba[index * 4 + 3]!) / 255;
    canvas.width = 0; canvas.height = 0;
  }
  return { id: element.id + ":mask", revision: ++nextRequest, width, height, data };
}

/** The retained source children keep hit testing and document identity; only their cache is filtered. */
export function StudioLiveAdjustmentGroup({ element, width, height, sourceIds, cacheKey, composite = "source-over", children }: {
  element: StudioLiveAdjustmentElement; width: number; height: number;
  sourceIds: readonly string[]; cacheKey: string; composite?: string; children: ReactNode;
}) {
  const ref = useRef<Konva.Group>(null);
  const inputsRef = useRef({ element, sourceIds });
  inputsRef.current = { element, sourceIds };
  useLayoutEffect(() => {
    const { element, sourceIds } = inputsRef.current;
    const node = ref.current;
    const layer = node?.getLayer();
    if (!node || !layer) return;
    const controller = new AbortController();
    const identity = { elementId: element.id, src: element.src, requestKey: `adjustment:${++nextRequest}` };
    const unregisterPresentation = registerStudioMountedRasterImagePresentation(identity);
    let runtime: Runtime | undefined;
    let mask: StudioAdjustmentLayerMask | undefined;
    let settled = false;
    let ready = false;
    let revision = 0;
    const fail = (error: unknown) => {
      ready = false;
      publishStudioLiveAdjustmentStatus(element.id, { state: "error", message: error instanceof Error ? error.message : "보정 레이어를 계산하지 못했어요." });
    };
    publishStudioLiveAdjustmentStatus(element.id, { state: "loading" });
    const recache = () => {
      if (controller.signal.aborted) return false;
      // Child image receipts may install while this module/mask loads. This graph's own fence
      // stays pending, and its eventual cache rebuild also refreshes every outer cache owner.
      if (!settled) return true;
      if (!runtime) return false;
      ready = false;
      try {
        const plan = createStudioLiveAdjustmentPlan(element, sourceIds, Boolean(mask));
        const source = { revision: ++revision, width, height, renderKinds: ["group" as const] };
        const recipe = runtime.createStudioAdjustmentLayerRuntimeRecipe({ plan, source, masks: mask ? [mask] : [] });
        node.filters([(imageData) => {
          try {
            const result = runtime!.executeStudioAdjustmentLayerRuntimeSync(recipe, { ...source, imageData }, { masks: mask ? [mask] : [], signal: controller.signal });
            imageData.data.set(result.imageData.data);
            ready = true;
            publishStudioLiveAdjustmentStatus(element.id, { state: "ready" });
          } catch (error) { fail(error); }
        }]);
        node.clearCache();
        node.cache({ x: 0, y: 0, width, height, pixelRatio: 1, hitCanvasPixelRatio: 1 });
        // Public capture forces the complete cached filter program now, before a child's receipt.
        // The tiny destination avoids allocating another full-page surface or baking viewport zoom.
        const probe = node.toCanvas({ x: 0, y: 0, width: 1, height: 1, pixelRatio: 1 });
        probe.width = 0; probe.height = 0;
        layer.batchDraw();
        return ready;
      } catch (error) { fail(error); return false; }
    };
    const unregisterCache = registerStudioRasterPresentationCache(node, recache);
    const afterDraw = () => {
      if (ready && !controller.signal.aborted && node.getLayer() === layer && node.isVisible()) acknowledgeStudioRasterImagePresentationDraw(identity);
    };
    layer.on("draw.studioLiveAdjustment", afterDraw);
    void import("../studio-adjustment-layer-runtime").then(async (loaded) => {
      if (controller.signal.aborted) return undefined;
      // Validate the full working-memory budget before allocating or decoding a mask surface.
      loaded.createStudioAdjustmentLayerRuntimeRecipe({
        plan: createStudioLiveAdjustmentPlan(element, sourceIds, false),
        source: { revision: 0, width, height, renderKinds: ["group"] },
      });
      return { loaded, loadedMask: await loadMask(element, width, height, controller.signal) };
    }).then((result) => {
        if (!result) return;
        const { loaded, loadedMask } = result;
        if (controller.signal.aborted) return;
        runtime = loaded; mask = loadedMask; settled = true;
        if (recache() && refreshStudioRasterPresentationCaches(node)) layer.batchDraw();
      }).catch((error: unknown) => { if (!controller.signal.aborted) { settled = true; fail(error); } });
    return () => {
      controller.abort(); unregisterCache(); unregisterPresentation();
      layer.off("draw.studioLiveAdjustment", afterDraw);
      node.clearCache(); node.filters([]);
      publishStudioLiveAdjustmentStatus(element.id, undefined);
    };
  }, [cacheKey, height, width]);
  return <Group id={element.id} ref={ref} globalCompositeOperation={composite as GlobalCompositeOperation}>{children}</Group>;
}
