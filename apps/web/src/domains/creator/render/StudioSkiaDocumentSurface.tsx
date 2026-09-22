import type { StudioSkiaCameraSource } from "./studio-skia-camera-source";
import {
  planStudioSkiaRetainedCameraTranslation,
  type StudioSkiaDocumentCamera,
} from "./studio-skia-camera-continuity";
import { useLayoutEffect, useRef, useState } from "react";
import type { SkiaDocumentRenderer } from "@toonspectrum/studio-engine-skia";
import type { StudioSkiaDocumentPresentationCandidate } from "../studio-skia-committed-ink-bridge";
import type { StudioLiveTransformDraftStore } from "../studio-live-transform-draft-store";
import { createStudioSkiaDocumentProjector } from "./studio-skia-document-plan";
import { projectStudioSkiaLiveTransformElements } from "./studio-skia-live-transform-projection";
import {
  createStudioSkiaSpecialistDocumentProjectionCache,
  prepareStudioSkiaSpecialistDocumentProjection,
  type StudioSkiaSpecialistDocumentProjection,
} from "./studio-skia-specialist-document-projection";
import {
  requiresStudioSkiaSpecialistRaster,
  STUDIO_SKIA_SPECIALIST_RASTER_ANIMATION_INTERVAL_MS,
} from "./studio-skia-specialist-raster";
import type { StudioSkiaSpecialistRasterCache } from "./studio-skia-specialist-raster-cache";
import type { StudioRenderSurfaceAuthority, StudioRenderSurfaceProps } from "./StudioRenderSurface";

export const STUDIO_SKIA_DOCUMENT_BACKEND = "skia-canvaskit-document-webgl2" as const;

interface StudioSkiaSpecialistProjectionState {
  readonly elements: StudioRenderSurfaceProps["elements"] | null;
  readonly liveFrameRevision: number;
  readonly projection: StudioSkiaSpecialistDocumentProjection | null;
  readonly error: string | null;
  readonly ready: boolean;
}

function clearRetainedCameraTranslation(canvas: HTMLCanvasElement): void {
  canvas.style.transform = "";
  delete canvas.dataset.studioSkiaCameraBridge;
}

function applyRetainedCameraTranslation(
  canvas: HTMLCanvasElement,
  presented: StudioSkiaDocumentCamera | null,
  next: StudioSkiaDocumentCamera | null,
): boolean {
  const translation = planStudioSkiaRetainedCameraTranslation(presented, next);
  if (!translation) return false;
  const { x, y } = translation;
  canvas.style.transform = x === 0 && y === 0
    ? ""
    : `translate3d(${x}px, ${y}px, 0)`;
  canvas.dataset.studioSkiaCameraBridge = "retained-translation";
  return true;
}
/** Receipt-gated direct GPU display. Existing document, input, Undo and storage stay authoritative. */
export function StudioSkiaDocumentSurface({ enabled, mountParent, width, height, documentWidth,
  documentHeight, dpr = 1, elements, sceneRevision, documentTransform, onAuthorityChange,
  visible, beforePublish, cameraSource, frameTheme = "classic",
  canPublishOverSettledInk, onVisiblePresentation,
  liveTransformDraftStore, liveTransformDraftScope,
}: StudioRenderSurfaceProps & {
  readonly visible: boolean;
  readonly liveTransformDraftStore?: StudioLiveTransformDraftStore;
  readonly liveTransformDraftScope?: string;
  readonly beforePublish?: (signal: AbortSignal) => Promise<void>;
  readonly cameraSource?: StudioSkiaCameraSource;
  readonly frameTheme?: "classic" | "soft" | "vivid";
  readonly canPublishOverSettledInk?: (
    candidate: StudioSkiaDocumentPresentationCandidate
  ) => boolean;
  readonly onVisiblePresentation?: (
    presentation: StudioSkiaDocumentPresentationCandidate
  ) => void;
}) {
  const sink = useRef(onAuthorityChange);
  sink.current = onAuthorityChange;
  const [liveFrameRevision, setLiveFrameRevision] = useState(0);
  const latest = useRef({ width, height, documentWidth, documentHeight, dpr, elements,
    sceneRevision, documentTransform, beforePublish, cameraSource, visible, frameTheme,
    canPublishOverSettledInk, onVisiblePresentation, liveTransformDraftStore,
    liveTransformDraftScope, liveFrameRevision });
  latest.current = { width, height, documentWidth, documentHeight, dpr, elements,
    sceneRevision, documentTransform, beforePublish, cameraSource, visible, frameTheme,
    canPublishOverSettledInk, onVisiblePresentation, liveTransformDraftStore,
    liveTransformDraftScope, liveFrameRevision };
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SkiaDocumentRenderer | null>(null);
  const projectorRef = useRef(createStudioSkiaDocumentProjector());
  const specialistCacheRef = useRef<StudioSkiaSpecialistRasterCache | null>(null);
  const specialistStateRef = useRef<StudioSkiaSpecialistProjectionState>({
    elements: null,
    liveFrameRevision: -1,
    projection: null,
    error: null,
    ready: false,
  });
  const specialistPreparationGeneration = useRef(0);
  const [specialistPresentationRevision, setSpecialistPresentationRevision] = useState(0);
  const generation = useRef(0); const revision = useRef(0);
  const submitted = useRef<((cameraOnly?: boolean, refreshOnly?: boolean) => void) | null>(null);
  const receipt = useRef<object | null>(null);
  const receiptOwnedDocumentIds = useRef<readonly string[]>([]);
  const sourceHiddenReceipt = useRef<object | null>(null);
  const visiblePresentationReceipt = useRef<object | null>(null);
  const [completedRevision, setCompletedRevision] = useState<object | null>(null);
  const report = (status: StudioRenderSurfaceAuthority["status"], frame: object, ids: readonly string[], reason: string | null = null) => {
    sink.current?.({ status, backendId: status === "disabled" || status === "legacy" ? null : STUDIO_SKIA_DOCUMENT_BACKEND, decision: null,
      sceneRevision: frame, ownedDocumentIds: ids, reason, visibleCanvasCount: status === "active" ? 1 : 0 });
  };
  useLayoutEffect(() => {
    const preparationGeneration = ++specialistPreparationGeneration.current;
    const controller = new AbortController();
    let cache = specialistCacheRef.current;
    if (!cache || cache.snapshot().disposed) {
      cache = createStudioSkiaSpecialistDocumentProjectionCache();
      specialistCacheRef.current = cache;
    }
    const previous = specialistStateRef.current.projection;
    const hasCandidates = elements.some(requiresStudioSkiaSpecialistRaster);
    specialistStateRef.current = {
      elements,
      liveFrameRevision,
      projection: previous,
      error: null,
      ready: false,
    };
    if (!hasCandidates) {
      previous?.release({ invalidateLiveFrames: true });
      specialistStateRef.current = {
        elements,
        liveFrameRevision,
        projection: null,
        error: null,
        ready: true,
      };
      return () => controller.abort();
    }
    void prepareStudioSkiaSpecialistDocumentProjection(elements, {
      cache,
      liveFrameRevision,
      signal: controller.signal,
    }).then((projection) => {
      if (
        controller.signal.aborted
        || preparationGeneration !== specialistPreparationGeneration.current
      ) {
        projection.release({ invalidateLiveFrames: true });
        return;
      }
      previous?.release({ invalidateLiveFrames: true });
      specialistStateRef.current = {
        elements,
        liveFrameRevision,
        projection,
        error: null,
        ready: true,
      };
      setSpecialistPresentationRevision((value) => value + 1);
    }).catch((cause: unknown) => {
      if (
        controller.signal.aborted
        || preparationGeneration !== specialistPreparationGeneration.current
      ) return;
      previous?.release({ invalidateLiveFrames: true });
      specialistStateRef.current = {
        elements,
        liveFrameRevision,
        projection: null,
        error: cause instanceof Error ? cause.message : String(cause),
        ready: true,
      };
      setSpecialistPresentationRevision((value) => value + 1);
    });
    return () => controller.abort();
  }, [elements, liveFrameRevision]);

  useLayoutEffect(() => {
    const hasLiveFrame = elements.some((element) =>
      element.type === "image" && element.isAnimatedGif === true && !element.hidden
    );
    if (!enabled || !visible || !hasLiveFrame) return;
    const interval = window.setInterval(() => {
      setLiveFrameRevision((value) =>
        value >= Number.MAX_SAFE_INTEGER - 1 ? 0 : value + 1
      );
    }, STUDIO_SKIA_SPECIALIST_RASTER_ANIMATION_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [elements, enabled, visible]);

  useLayoutEffect(() => () => {
    specialistPreparationGeneration.current += 1;
    specialistStateRef.current.projection?.release({ invalidateLiveFrames: true });
    specialistStateRef.current = {
      elements: null,
      liveFrameRevision: -1,
      projection: null,
      error: null,
      ready: false,
    };
    specialistCacheRef.current?.dispose();
    specialistCacheRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const current = canvasRef.current;
    if (!current) return;
    const announceVisiblePresentation = () => {
      if (visiblePresentationReceipt.current === sceneRevision) return;
      visiblePresentationReceipt.current = sceneRevision;
      latest.current.onVisiblePresentation?.({
        sceneRevision,
        ownedDocumentIds: receiptOwnedDocumentIds.current,
      });
    };
    const transformSnapshot = latest.current.liveTransformDraftStore?.getSnapshot() ?? null;
    const pendingGpuTransformHandoff =
      transformSnapshot !== null
      && transformSnapshot.scope === latest.current.liveTransformDraftScope
      && transformSnapshot.phase === "handoff"
      && receipt.current !== null
      && sourceHiddenReceipt.current === receipt.current;
    if (!enabled || !visible) {
      sourceHiddenReceipt.current = null;
      visiblePresentationReceipt.current = null;
      clearRetainedCameraTranslation(current);
      current.style.visibility = "hidden";
      return;
    }
    if (receipt.current !== sceneRevision) {
      if (!pendingGpuTransformHandoff) {
        sourceHiddenReceipt.current = null;
        visiblePresentationReceipt.current = null;
        clearRetainedCameraTranslation(current);
        current.style.visibility = "hidden";
      }
      return;
    }
    if (current.style.visibility === "visible") {
      announceVisiblePresentation();
      return;
    }
    const publish = latest.current.beforePublish;
    if (!publish) {
      sourceHiddenReceipt.current = sceneRevision;
      current.style.visibility = "visible";
      announceVisiblePresentation();
      return;
    }
    // Parent ownership is committed, but the old canvas bitmap is not transparent until its next
    // draw. The retained live-ink FIFO stays visible until this exact GPU canvas is revealed.
    const controller = new AbortController();
    const expectedRequest = revision.current;
    void Promise.resolve().then(() => publish(controller.signal)).then(() => {
      if (!controller.signal.aborted && expectedRequest === revision.current && canvasRef.current === current && latest.current.visible
        && latest.current.sceneRevision === sceneRevision && receipt.current === sceneRevision) {
        sourceHiddenReceipt.current = sceneRevision;
        current.style.visibility = "visible";
        announceVisiblePresentation();
      }
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || canvasRef.current !== current) return;
      receipt.current = null;
      receiptOwnedDocumentIds.current = [];
      visiblePresentationReceipt.current = null;
      clearRetainedCameraTranslation(current);
      current.style.visibility = "hidden";
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
    let presentedCamera: StudioSkiaDocumentCamera | null = null;
    let liveTransformProjectionToken = "base";
    const submit = (cameraOnly = false, refreshOnly = false) => {
      if (!runtime || !alive || generation.current !== scope) return;
      pendingFence?.abort();
      const controller = new AbortController(); pendingFence = controller;
      const state = latest.current; const request = ++revision.current;
      canvas.dataset.studioSkiaRequest = String(request);
      canvas.dataset.studioSkiaPhase = "rendering";
      const transformSnapshot = state.liveTransformDraftStore?.getSnapshot() ?? null;
      const transformHandoffContinuing =
        transformSnapshot !== null
        && transformSnapshot.scope === state.liveTransformDraftScope
        && transformSnapshot.phase === "handoff"
        && receipt.current !== null
        && sourceHiddenReceipt.current === receipt.current
        && state.visible;
      const continuing = transformHandoffContinuing || (
        (cameraOnly || refreshOnly)
        && receipt.current === state.sceneRevision
        && sourceHiddenReceipt.current === state.sceneRevision
        && state.visible
      );
      const transformProjection = projectStudioSkiaLiveTransformElements(
        state.elements,
        transformSnapshot,
        state.liveTransformDraftScope ?? "",
      );
      const projectionToken = transformProjection.token;
      liveTransformProjectionToken = projectionToken;
      const requiresSpecialistProjection = transformProjection.elements.some((element) =>
        !element.hidden
        && (element.opacity ?? 1) > 0
        && requiresStudioSkiaSpecialistRaster(element)
      );
      const specialistState = specialistStateRef.current;
      if (requiresSpecialistProjection && (
        !specialistState.ready
        || specialistState.elements !== state.elements
        || specialistState.liveFrameRevision !== state.liveFrameRevision
      )) {
        report("starting", state.sceneRevision, [], "preparing-specialist-raster");
        return;
      }
      if (requiresSpecialistProjection && specialistState.error) {
        receipt.current = null;
        receiptOwnedDocumentIds.current = [];
        visiblePresentationReceipt.current = null;
        presentedCamera = null;
        clearRetainedCameraTranslation(canvas);
        canvas.style.visibility = "hidden";
        report("legacy", state.sceneRevision, [], specialistState.error);
        return;
      }
      let plan;
      try {
        plan = projector.project(
          transformProjection.elements,
          state.frameTheme,
          specialistState.projection?.sources,
        );
      } catch (cause) {
        report("unavailable", state.sceneRevision, [], cause instanceof Error ? cause.message : String(cause));
        return;
      }
      if (!plan.supported) {
        receipt.current = null;
        receiptOwnedDocumentIds.current = [];
        visiblePresentationReceipt.current = null;
        presentedCamera = null;
        clearRetainedCameraTranslation(canvas);
        canvas.style.visibility = "hidden";
        report("legacy", state.sceneRevision, [], plan.reason); return;
      }
      const presentationCandidate = {
        sceneRevision: state.sceneRevision,
        ownedDocumentIds: plan.ownedDocumentIds,
      } satisfies StudioSkiaDocumentPresentationCandidate;
      const publishOverSettledInk = !continuing
        && state.canPublishOverSettledInk?.(presentationCandidate) === true;
      canvas.dataset.studioSkiaSourceFence = publishOverSettledInk
        ? "settled-ink"
        : continuing ? "camera" : "compatibility";
      canvas.style.width = `${state.width}px`; canvas.style.height = `${state.height}px`;
      const camera = state.cameraSource?.read() ?? state.documentTransform ?? { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, rotation: 0 };
      if (!continuing) report("starting", state.sceneRevision, plan.ownedDocumentIds);
      const displayed = continuing || publishOverSettledInk
        ? Promise.resolve()
        : Promise.resolve().then(() => state.beforePublish?.(controller.signal));
      void Promise.all([runtime.present({ revision: state.sceneRevision, items: plan.items,
        width: state.width, height: state.height, documentWidth: state.documentWidth,
        documentHeight: state.documentHeight, dpr: state.dpr, camera }), displayed]).then(([result]) => {
        if (!alive || generation.current !== scope) return;
        if (request !== revision.current) {
          // A continuous scroll can supersede a camera-only request after CanvasKit has already
          // flushed it. Rebase only when the projection token still matches; a stale transform
          // ownership frame must be hidden instead of replacing newer document pixels.
          if (result.status === "presented" && result.revision === state.sceneRevision) {
            presentedCamera = camera;
            const current = latest.current;
            const retained = cameraOnly
              && projectionToken === liveTransformProjectionToken
              && current.visible
              && receipt.current === current.sceneRevision
              && sourceHiddenReceipt.current === current.sceneRevision
              && canvas.style.visibility === "visible"
              && applyRetainedCameraTranslation(
                canvas,
                presentedCamera,
                current.cameraSource?.read() ?? null,
              );
            if (!retained) {
              clearRetainedCameraTranslation(canvas);
              canvas.style.visibility = "hidden";
            }
          }
          return;
        }
        if (result.status === "presented" && result.revision !== state.sceneRevision) {
          receipt.current = null;
          receiptOwnedDocumentIds.current = [];
          visiblePresentationReceipt.current = null;
          presentedCamera = null;
          clearRetainedCameraTranslation(canvas);
          canvas.style.visibility = "hidden";
          report("unavailable", state.sceneRevision, [], "GPU receipt does not match the requested document revision");
          return;
        }
        if (result.status === "presented") {
          presentedCamera = camera;
          clearRetainedCameraTranslation(canvas);
          receipt.current = state.sceneRevision;
          receiptOwnedDocumentIds.current = plan.ownedDocumentIds;
          visiblePresentationReceipt.current = null;
          canvas.dataset.studioSkiaPhase = "presented";
          setCompletedRevision(state.sceneRevision);
          canvas.dataset.studioSkiaCompiledItems = String(result.stats.compiledItems);
          canvas.dataset.studioSkiaCachedItems = String(result.stats.cachedItems);
          canvas.dataset.studioSkiaCompiledBatches = String(result.stats.compiledBatches);
          canvas.dataset.studioSkiaPictureBytes = String(result.stats.pictureBytes);
          canvas.dataset.studioSkiaReadbacks = "0";
          if (continuing && latest.current.visible) canvas.style.visibility = "visible";
          if (!continuing || transformHandoffContinuing) {
            report("active", state.sceneRevision, plan.ownedDocumentIds);
          }
        } else if (result.status === "unsupported") {
          receipt.current = null;
          receiptOwnedDocumentIds.current = [];
          visiblePresentationReceipt.current = null;
          presentedCamera = null;
          clearRetainedCameraTranslation(canvas);
          canvas.style.visibility = "hidden";
          report("legacy", state.sceneRevision, [], result.reason);
        } else if (result.status === "unavailable") {
          receipt.current = null;
          receiptOwnedDocumentIds.current = [];
          visiblePresentationReceipt.current = null;
          presentedCamera = null;
          clearRetainedCameraTranslation(canvas);
          canvas.style.visibility = "hidden";
          report("unavailable", state.sceneRevision, plan.ownedDocumentIds, result.reason);
        }
      }).catch((cause: unknown) => {
        if (!alive || controller.signal.aborted || request !== revision.current) return;
        receipt.current = null;
        receiptOwnedDocumentIds.current = [];
        visiblePresentationReceipt.current = null;
        presentedCamera = null;
        clearRetainedCameraTranslation(canvas);
        canvas.style.visibility = "hidden";
        report("unavailable", state.sceneRevision, [], cause instanceof Error ? cause.message : String(cause));
      });
    };
    const cameraChanged = () => {
      if (!alive || !runtime) return;
      const state = latest.current;
      const retained = state.visible
        && receipt.current === state.sceneRevision
        && sourceHiddenReceipt.current === state.sceneRevision
        && canvas.style.visibility === "visible"
        && applyRetainedCameraTranslation(
          canvas,
          presentedCamera,
          state.cameraSource?.read() ?? null,
        );
      if (!retained) {
        clearRetainedCameraTranslation(canvas);
        canvas.style.visibility = "hidden";
      }
      revision.current += 1; pendingFence?.abort();
      cancelAnimationFrame(cameraFrame);
      cameraFrame = requestAnimationFrame(() => submit(true));
    };
    const unsubscribeCamera = cameraSource?.subscribe(cameraChanged);
    const syncLiveTransformProjection = () => {
      const state = latest.current;
      const next = projectStudioSkiaLiveTransformElements(
        state.elements,
        state.liveTransformDraftStore?.getSnapshot() ?? null,
        state.liveTransformDraftScope ?? "",
      );
      if (next.token === liveTransformProjectionToken) return;
      if (!runtime) {
        liveTransformProjectionToken = next.token;
        return;
      }
      // The exact transform lane already owns the moving source. Keep the source-hidden GPU
      // receipt visible while submitting only the ownership transition; the projection token
      // prevents a superseded camera frame from replacing newer document pixels.
      submit(true);
    };
    const unsubscribeLiveTransform = liveTransformDraftStore?.subscribe(
      syncLiveTransformProjection,
    ) ?? (() => undefined);
    submitted.current = submit;
    report("starting", latest.current.sceneRevision, []);
    void Promise.all([
      import("@toonspectrum/studio-engine-skia"),
      import("./studio-skia-document-font-source"),
    ]).then(([module, fontSource]) => {
      if (!alive || generation.current !== scope) return;
      runtime = module.createSkiaDocumentRenderer(canvas, {
        loadFontData: fontSource.loadStudioSkiaDocumentFontData,
        onContextLost: () => {
        if (!alive || generation.current !== scope) return;
        revision.current += 1; pendingFence?.abort();
        receipt.current = null;
        receiptOwnedDocumentIds.current = [];
        visiblePresentationReceipt.current = null;
        presentedCamera = null;
        clearRetainedCameraTranslation(canvas);
        canvas.style.visibility = "hidden";
        report("unavailable", latest.current.sceneRevision, [], "GPU context lost; current document was not changed");
      } });
      rendererRef.current = runtime; submit();
    }).catch((cause: unknown) => {
      if (alive && generation.current === scope) report("unavailable", latest.current.sceneRevision, [], cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      alive = false; unsubscribeCamera?.(); unsubscribeLiveTransform();
      cancelAnimationFrame(cameraFrame); pendingFence?.abort();
      submitted.current = null;
      receipt.current = null;
      receiptOwnedDocumentIds.current = [];
      sourceHiddenReceipt.current = null;
      visiblePresentationReceipt.current = null;
      runtime?.dispose(); rendererRef.current = null;
      canvas.remove(); if (canvasRef.current === canvas) canvasRef.current = null;
      projector.clear();
    };
  }, [
    enabled,
    mountParent,
    cameraSource,
    liveTransformDraftScope,
    liveTransformDraftStore,
  ]);
  useLayoutEffect(() => {
    const state = latest.current;
    const snapshot = state.liveTransformDraftStore?.getSnapshot() ?? null;
    const keepVisibleForHandoff =
      snapshot !== null
      && snapshot.scope === state.liveTransformDraftScope
      && snapshot.phase === "handoff"
      && receipt.current !== null
      && sourceHiddenReceipt.current === receipt.current
      && state.visible;
    const current = canvasRef.current;
    if (current && !keepVisibleForHandoff) {
      clearRetainedCameraTranslation(current);
      current.style.visibility = "hidden";
    }
    submitted.current?.();
  }, [sceneRevision, width, height, documentWidth, documentHeight, dpr, elements, frameTheme]);
  useLayoutEffect(() => {
    submitted.current?.(false, true);
  }, [specialistPresentationRevision]);

  useLayoutEffect(() => {
    if (cameraSource) return;
    const state = latest.current;
    const snapshot = state.liveTransformDraftStore?.getSnapshot() ?? null;
    const keepVisibleForHandoff =
      snapshot !== null
      && snapshot.scope === state.liveTransformDraftScope
      && snapshot.phase === "handoff"
      && receipt.current !== null
      && sourceHiddenReceipt.current === receipt.current
      && state.visible;
    const current = canvasRef.current;
    if (current && !keepVisibleForHandoff) {
      clearRetainedCameraTranslation(current);
      current.style.visibility = "hidden";
    }
    submitted.current?.();
  }, [cameraSource, documentTransform]);
  return null;
}
