import type { StudioSkiaCameraSource } from "./studio-skia-camera-source";
import { useLayoutEffect, useRef, useState } from "react";
import type { SkiaDocumentRenderer } from "@toonspectrum/studio-engine-skia";
import { createStudioSkiaDocumentProjector } from "./studio-skia-document-plan";
import type { StudioRenderSurfaceAuthority, StudioRenderSurfaceProps } from "./StudioRenderSurface";

export const STUDIO_SKIA_DOCUMENT_BACKEND = "skia-canvaskit-document-webgl2" as const;
/** Receipt-gated direct GPU display. Existing document, input, Undo and storage stay authoritative. */
export function StudioSkiaDocumentSurface({ enabled, mountParent, width, height, documentWidth,
  documentHeight, dpr = 1, elements, sceneRevision, documentTransform, onAuthorityChange, visible, beforePublish, cameraSource,
}: StudioRenderSurfaceProps & { readonly visible: boolean; readonly beforePublish?: (signal: AbortSignal) => Promise<void>; readonly cameraSource?: StudioSkiaCameraSource }) {
  const sink = useRef(onAuthorityChange);
  sink.current = onAuthorityChange;
  const latest = useRef({ width, height, documentWidth, documentHeight, dpr, elements, sceneRevision, documentTransform, beforePublish, cameraSource, visible });
  latest.current = { width, height, documentWidth, documentHeight, dpr, elements, sceneRevision, documentTransform, beforePublish, cameraSource, visible };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SkiaDocumentRenderer | null>(null);
  const projectorRef = useRef(createStudioSkiaDocumentProjector());
  const generation = useRef(0); const revision = useRef(0);
  const submitted = useRef<((cameraOnly?: boolean) => void) | null>(null);
  const receipt = useRef<object | null>(null);
  const sourceHiddenReceipt = useRef<object | null>(null);
  const [completedRevision, setCompletedRevision] = useState<object | null>(null);
  const report = (status: StudioRenderSurfaceAuthority["status"], frame: object, ids: readonly string[], reason: string | null = null) => {
    sink.current?.({ status, backendId: status === "disabled" || status === "legacy" ? null : STUDIO_SKIA_DOCUMENT_BACKEND, decision: null,
      sceneRevision: frame, ownedDocumentIds: ids, reason, visibleCanvasCount: status === "active" ? 1 : 0 });
  };
  useLayoutEffect(() => {
    const current = canvasRef.current;
    if (!current) return;
    if (!enabled || !visible || receipt.current !== sceneRevision) { sourceHiddenReceipt.current = null; current.style.visibility = "hidden"; return; }
    if (current.style.visibility === "visible") return;
    const publish = latest.current.beforePublish;
    if (!publish) { sourceHiddenReceipt.current = sceneRevision; current.style.visibility = "visible"; return; }
    // Parent opacity is committed, but the old canvas bitmap is not transparent until its
    // next draw. Wait for that paint before revealing GPU pixels to avoid double compositing.
    const controller = new AbortController();
    const expectedRequest = revision.current;
    void Promise.resolve().then(() => publish(controller.signal)).then(() => {
      if (!controller.signal.aborted && expectedRequest === revision.current && canvasRef.current === current && latest.current.visible
        && latest.current.sceneRevision === sceneRevision && receipt.current === sceneRevision) {
        sourceHiddenReceipt.current = sceneRevision;
        current.style.visibility = "visible";
      }
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || canvasRef.current !== current) return;
      receipt.current = null; current.style.visibility = "hidden";
      report("unavailable", sceneRevision, [], cause instanceof Error ? cause.message : String(cause));
    });
    return () => controller.abort();
  }, [enabled, visible, sceneRevision, mountParent, completedRevision]);
  useLayoutEffect(() => {
    if (!enabled) { report("disabled", latest.current.sceneRevision, []); return; }
    if (!mountParent) { report("starting", latest.current.sceneRevision, [], "awaiting-host"); return; }
    const scope = ++generation.current;
    const projector = projectorRef.current;
    let alive = true;
    const canvas = mountParent.ownerDocument.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.studioSkiaDocumentSurface = "true";
    canvas.style.cssText = "position:absolute;left:0;top:0;pointer-events:none;visibility:hidden;background:transparent";
    const content = mountParent.querySelector(".konvajs-content");
    if (!content) { report("unavailable", latest.current.sceneRevision, [], "document-host-not-ready"); return; }
    content.insertBefore(canvas, content.children[1] ?? null);
    canvasRef.current = canvas;
    let runtime: SkiaDocumentRenderer | null = null;
    let pendingFence: AbortController | null = null;
    let cameraFrame = 0;
    const submit = (cameraOnly = false) => {
      if (!runtime || !alive || generation.current !== scope) return;
      pendingFence?.abort();
      const controller = new AbortController(); pendingFence = controller;
      const state = latest.current; const request = ++revision.current;
      canvas.dataset.studioSkiaRequest = String(request);
      canvas.dataset.studioSkiaPhase = "rendering";
      const continuing = cameraOnly && receipt.current === state.sceneRevision && sourceHiddenReceipt.current === state.sceneRevision && state.visible;
      let plan;
      try { plan = projector.project(state.elements); }
      catch (cause) { report("unavailable", state.sceneRevision, [], cause instanceof Error ? cause.message : String(cause)); return; }
      if (!plan.supported) {
        receipt.current = null; canvas.style.visibility = "hidden";
        report("legacy", state.sceneRevision, [], plan.reason); return;
      }
      canvas.style.width = `${state.width}px`; canvas.style.height = `${state.height}px`;
      const camera = state.cameraSource?.read() ?? state.documentTransform ?? { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, rotation: 0 };
      if (!continuing) report("starting", state.sceneRevision, plan.ownedDocumentIds);
      const displayed = continuing ? Promise.resolve() : Promise.resolve().then(() => state.beforePublish?.(controller.signal));
      void Promise.all([runtime.present({ revision: state.sceneRevision, items: plan.items,
        width: state.width, height: state.height, documentWidth: state.documentWidth,
        documentHeight: state.documentHeight, dpr: state.dpr, camera }), displayed]).then(([result]) => {
        if (!alive || generation.current !== scope || request !== revision.current) return;
        if (result.status === "presented" && result.revision !== state.sceneRevision) {
          receipt.current = null; canvas.style.visibility = "hidden";
          report("unavailable", state.sceneRevision, [], "GPU receipt does not match the requested document revision");
          return;
        }
        if (result.status === "presented") {
          receipt.current = state.sceneRevision;
          canvas.dataset.studioSkiaPhase = "presented";
          setCompletedRevision(state.sceneRevision);
          canvas.dataset.studioSkiaCompiledItems = String(result.stats.compiledItems);
          canvas.dataset.studioSkiaCachedItems = String(result.stats.cachedItems);
          canvas.dataset.studioSkiaCompiledBatches = String(result.stats.compiledBatches);
          canvas.dataset.studioSkiaPictureBytes = String(result.stats.pictureBytes);
          canvas.dataset.studioSkiaReadbacks = "0";
          if (continuing && latest.current.visible) canvas.style.visibility = "visible";
          else report("active", state.sceneRevision, plan.ownedDocumentIds);
        } else if (result.status === "unavailable") {
          receipt.current = null; canvas.style.visibility = "hidden";
          report("unavailable", state.sceneRevision, plan.ownedDocumentIds, result.reason);
        }
      }).catch((cause: unknown) => {
        if (!alive || controller.signal.aborted || request !== revision.current) return;
        receipt.current = null; canvas.style.visibility = "hidden";
        report("unavailable", state.sceneRevision, [], cause instanceof Error ? cause.message : String(cause));
      });
    };
    const cameraChanged = () => {
      if (!alive || !runtime) return;
      canvas.style.visibility = "hidden";
      revision.current += 1; pendingFence?.abort();
      cancelAnimationFrame(cameraFrame);
      cameraFrame = requestAnimationFrame(() => submit(true));
    };
    const unsubscribeCamera = cameraSource?.subscribe(cameraChanged);
    submitted.current = submit;
    report("starting", latest.current.sceneRevision, []);
    void import("@toonspectrum/studio-engine-skia").then((module) => {
      if (!alive || generation.current !== scope) return;
      runtime = module.createSkiaDocumentRenderer(canvas, { onContextLost: () => {
        if (!alive || generation.current !== scope) return;
        revision.current += 1; pendingFence?.abort();
        receipt.current = null; canvas.style.visibility = "hidden";
        report("unavailable", latest.current.sceneRevision, [], "GPU context lost; current document was not changed");
      } });
      rendererRef.current = runtime; submit();
    }).catch((cause: unknown) => {
      if (alive && generation.current === scope) report("unavailable", latest.current.sceneRevision, [], cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      alive = false; unsubscribeCamera?.(); cancelAnimationFrame(cameraFrame); pendingFence?.abort(); submitted.current = null; receipt.current = null; sourceHiddenReceipt.current = null;
      runtime?.dispose(); rendererRef.current = null;
      canvas.remove(); if (canvasRef.current === canvas) canvasRef.current = null;
      projector.clear();
    };
  }, [enabled, mountParent, cameraSource]);
  useLayoutEffect(() => {
    if (canvasRef.current) canvasRef.current.style.visibility = "hidden";
    submitted.current?.();
  }, [sceneRevision, width, height, documentWidth, documentHeight, dpr, documentTransform, elements]);
  return null;
}
