import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";


import {
  isStudioWebGpuCanvasActive,
  routeStudioWebGpuCanvasRequest,
  StudioWebGpuEngine,
  type StudioGpuBackend,
  type StudioGpuFrameReadbackRequest,
  type StudioGpuFrameReadbackResult,
  type StudioGpuFrameReceipt,
  type StudioGpuStroke,
  type StudioGpuViewTransform,
} from "./studio-webgpu-engine";
import {
  sameStudioGpuStrokes,
  snapshotStudioGpuStrokes,
} from "./studio-webgpu-stroke";

import type { StudioWebGpuSurfaceBounds } from "./studio-webgpu-viewport";

import { cn } from "@/lib/utils";

const EMPTY_STROKES: readonly StudioGpuStroke[] = Object.freeze([]);

export interface StudioWebGpuCanvasProps extends StudioGpuViewTransform {
  readonly className?: string;
  /** Logical document coordinates, independent of CSS zoom and device pixel ratio. */
  readonly width: number;
  readonly height: number;
  /**
   * Optional CSS bounds inside the scaled document. Supplying these keeps the presentation and
   * backing surfaces viewport-sized while `width`/`height` continue to describe document space.
   */
  readonly surfaceBounds?: StudioWebGpuSurfaceBounds;
  /**
   * Ordered operations composited inside this surface. `erase` strokes destination-out only pixels
   * produced by earlier strokes in this array; they intentionally cannot punch through DOM/Konva
   * content below the transparent canvas.
   */
  readonly strokes?: readonly StudioGpuStroke[];
  /** Must match the parent's authoritative-canvas handoff state for an atomic show/hide commit. */
  readonly frameAuthorized?: boolean;
  /**
   * Stroke-scoped live-ink pinning: while true, presentation does not wait for per-frame
   * receipts. A trailing frame only ever shows a valid prefix of the pinned stroke, so the
   * overlay may lag input by a frame but can never alternate with the Konva draft. Receipts
   * remain the sole authority for readback capture and committed handoff.
   */
  readonly pinnedVisible?: boolean;
  /**
   * Initialize the GPU device on mount instead of on the first non-empty stroke feed, so the
   * backend is already resolved when the first stroke starts (live-ink pinning decides its
   * renderer at stroke start and never mid-stroke).
   */
  readonly eagerInitialize?: boolean;
  readonly onBackendChange?: (backend: StudioGpuBackend) => void;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
  /** A matching receipt is the only safe signal for hiding the authoritative Konva preview. */
  readonly onFrameReady?: (receipt: StudioGpuFrameReceipt) => void;
  readonly onFrameInvalid?: () => void;
}

export interface StudioWebGpuCanvasHandle {
  /** Captures only the exact receipt-authorized frame; stale or unavailable frames are rejected. */
  readonly captureFrame: (
    request: StudioGpuFrameReadbackRequest
  ) => Promise<StudioGpuFrameReadbackResult>;
  /**
   * Stroke-pinned imperative feed: updates the engine without a parent React render. The pinned
   * live-ink path calls this once per pointer frame so a 30k-line parent never re-renders per
   * point; the declarative `strokes` prop remains authoritative outside a pinned stroke.
   */
  readonly syncPinnedStrokes: (strokes: readonly StudioGpuStroke[]) => void;
}

interface LatestCanvasProps {
  width: number;
  height: number;
  strokes: readonly StudioGpuStroke[];
  scaleX: number | undefined;
  scaleY: number | undefined;
  offsetX: number | undefined;
  offsetY: number | undefined;
  flipX: boolean | undefined;
  surfaceLeft: number | undefined;
  surfaceTop: number | undefined;
  surfaceWidth: number | undefined;
  surfaceHeight: number | undefined;
}

function sameCanvasRequest(left: LatestCanvasProps, right: LatestCanvasProps): boolean {
  return Object.is(left.width, right.width)
    && Object.is(left.height, right.height)
    && Object.is(left.scaleX, right.scaleX)
    && Object.is(left.scaleY, right.scaleY)
    && Object.is(left.offsetX, right.offsetX)
    && Object.is(left.offsetY, right.offsetY)
    && left.flipX === right.flipX
    && Object.is(left.surfaceLeft, right.surfaceLeft)
    && Object.is(left.surfaceTop, right.surfaceTop)
    && Object.is(left.surfaceWidth, right.surfaceWidth)
    && Object.is(left.surfaceHeight, right.surfaceHeight)
    && sameStudioGpuStrokes(left.strokes, right.strokes);
}

function snapshotCanvasRequest(request: LatestCanvasProps): LatestCanvasProps {
  return {
    ...request,
    strokes: snapshotStudioGpuStrokes(request.strokes),
  };
}

function measuredCssSize(element: HTMLElement | null, logicalWidth: number, logicalHeight: number) {
  const bounds = element?.getBoundingClientRect();
  return {
    width: bounds && bounds.width > 0 ? bounds.width : logicalWidth,
    height: bounds && bounds.height > 0 ? bounds.height : logicalHeight,
  };
}

function devicePixelRatio(): number {
  return typeof globalThis.devicePixelRatio === "number" && Number.isFinite(globalThis.devicePixelRatio)
    ? globalThis.devicePixelRatio
    : 1;
}

export const StudioWebGpuCanvas = forwardRef<StudioWebGpuCanvasHandle, StudioWebGpuCanvasProps>(
function StudioWebGpuCanvas({
  className,
  width,
  height,
  surfaceBounds,
  strokes = EMPTY_STROKES,
  frameAuthorized = false,
  pinnedVisible = false,
  eagerInitialize = false,
  scaleX,
  scaleY,
  offsetX,
  offsetY,
  flipX,
  onBackendChange,
  onDeviceLost,
  onFrameReady,
  onFrameInvalid,
}: StudioWebGpuCanvasProps, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  // Mount-time decision by contract: toggling eager initialization after mount has no meaning
  // (the device either already initialized or will on the first stroke feed).
  const eagerInitializeRef = useRef(eagerInitialize);
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StudioWebGpuEngine | null>(null);
  const callbacksRef = useRef({ onBackendChange, onDeviceLost, onFrameReady, onFrameInvalid });
  const requestSequenceRef = useRef(0);
  const desiredRequestIdRef = useRef("frame:0");
  const lastIssuedRequestRef = useRef<LatestCanvasProps | null>(null);
  const issueLatestRequestRef = useRef<(() => void) | null>(null);
  const latestRef = useRef<LatestCanvasProps>({
    width,
    height,
    strokes,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    flipX,
    surfaceLeft: surfaceBounds?.left,
    surfaceTop: surfaceBounds?.top,
    surfaceWidth: surfaceBounds?.width,
    surfaceHeight: surfaceBounds?.height,
  });

  callbacksRef.current = { onBackendChange, onDeviceLost, onFrameReady, onFrameInvalid };
  latestRef.current = {
    width,
    height,
    strokes,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    flipX,
    surfaceLeft: surfaceBounds?.left,
    surfaceTop: surfaceBounds?.top,
    surfaceWidth: surfaceBounds?.width,
    surfaceHeight: surfaceBounds?.height,
  };

  useImperativeHandle(ref, () => ({
    captureFrame: (request) => engineRef.current?.captureFrame(request) ?? Promise.resolve({
      status: "rejected",
      reason: "frame-unavailable",
    }),
    syncPinnedStrokes: (strokes) => {
      const latest = { ...latestRef.current, strokes };
      latestRef.current = latest;
      // 레이아웃 이펙트의 중복 발행 비교 기준도 갱신한다 — 다음 부모 렌더(스트로크 경계)에서
      // props(EMPTY)와 달라졌음을 감지해 정상적으로 EMPTY 프레임을 재발행하게 된다.
      lastIssuedRequestRef.current = snapshotCanvasRequest(latest);
      const requestId = `frame:${requestSequenceRef.current + 1}`;
      requestSequenceRef.current += 1;
      desiredRequestIdRef.current = requestId;
      issueLatestRequestRef.current?.();
    },
  }), []);

  useEffect(() => {
    const canvas = gpuCanvasRef.current;
    const fallbackCanvas = fallbackCanvasRef.current;
    if (!canvas || !fallbackCanvas) return;

    let mounted = true;
    let initializationRequested = false;
    const engine = new StudioWebGpuEngine({
      canvas,
      fallbackCanvas,
      // This component is the display-only live-draft path. Avoid one viewport-sized immutable
      // texture plus a texture copy per pointer frame; direct engine users keep readback by default.
      retainReadbackSnapshot: false,
      onBackendChange: (backend) => callbacksRef.current.onBackendChange?.(backend),
      onDeviceLost: (info) => callbacksRef.current.onDeviceLost?.(info),
      onFrameInvalid: () => callbacksRef.current.onFrameInvalid?.(),
      onFrameReady: (receipt) => {
        if (receipt.requestId !== desiredRequestIdRef.current) return;
        callbacksRef.current.onFrameReady?.(receipt);
      },
    });
    engineRef.current = engine;
    // Resizing an active engine historically renders its last (initially blank) operation set.
    // Suspend first so an empty Studio page neither paints a blank frame nor starts WebGPU.
    engine.suspend(desiredRequestIdRef.current);
    callbacksRef.current.onBackendChange?.(engine.getBackend());

    const syncViewport = (observedWidth?: number, observedHeight?: number) => {
      const latest = latestRef.current;
      const measured = measuredCssSize(
        rootRef.current,
        latest.surfaceWidth ?? latest.width,
        latest.surfaceHeight ?? latest.height
      );
      engine.resize({
        logicalWidth: latest.width,
        logicalHeight: latest.height,
        cssWidth: observedWidth && observedWidth > 0 ? observedWidth : measured.width,
        cssHeight: observedHeight && observedHeight > 0 ? observedHeight : measured.height,
        dpr: devicePixelRatio(),
        scaleX: latest.scaleX,
        scaleY: latest.scaleY,
        offsetX: latest.offsetX,
        offsetY: latest.offsetY,
        flipX: latest.flipX,
      });
    };

    const issueLatestRequest = () => {
      const latest = latestRef.current;
      const requestId = desiredRequestIdRef.current;
      routeStudioWebGpuCanvasRequest({
        engine,
        strokes: latest.strokes,
        requestId,
        syncViewport,
        requestInitialization: () => {
          if (initializationRequested) return;
          initializationRequested = true;
          void engine.initialize().then(() => {
            if (!mounted || engineRef.current !== engine) return;
            const current = latestRef.current;
            routeStudioWebGpuCanvasRequest({
              engine,
              strokes: current.strokes,
              requestId: desiredRequestIdRef.current,
              syncViewport,
              // This initialization attempt already selected WebGPU or the Canvas2D fallback.
              requestInitialization: () => undefined,
            });
          });
        },
      });
    };
    issueLatestRequestRef.current = issueLatestRequest;
    issueLatestRequest();

    // Live-ink pinning decides its renderer at stroke start; resolving the backend at mount keeps
    // the very first stroke of a session from silently landing on the not-yet-initialized path.
    if (eagerInitializeRef.current && !initializationRequested) {
      initializationRequested = true;
      void engine.initialize().then(() => {
        if (!mounted || engineRef.current !== engine) return;
        const current = latestRef.current;
        routeStudioWebGpuCanvasRequest({
          engine,
          strokes: current.strokes,
          requestId: desiredRequestIdRef.current,
          syncViewport,
          requestInitialization: () => undefined,
        });
      });
    }

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          const entry = entries[0];
          if (!entry) return;
          syncViewport(entry.contentRect.width, entry.contentRect.height);
        });
    if (resizeObserver && rootRef.current) resizeObserver.observe(rootRef.current);
    const handleWindowResize = () => syncViewport();
    globalThis.addEventListener?.("resize", handleWindowResize, { passive: true });

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      globalThis.removeEventListener?.("resize", handleWindowResize);
      if (issueLatestRequestRef.current === issueLatestRequest) {
        issueLatestRequestRef.current = null;
      }
      if (engineRef.current === engine) engineRef.current = null;
      engine.dispose();
    };
  }, []);

  // Invalidate the old authority first, then resize and render under a new request identity in the
  // same layout phase. This semantic comparison deliberately avoids a hash collision becoming an
  // authority decision and also tolerates parents rebuilding equivalent stroke arrays.
  useLayoutEffect(() => {
    const latest = latestRef.current;
    if (lastIssuedRequestRef.current && sameCanvasRequest(lastIssuedRequestRef.current, latest)) {
      return;
    }
    lastIssuedRequestRef.current = snapshotCanvasRequest(latest);
    const requestId = `frame:${requestSequenceRef.current + 1}`;
    requestSequenceRef.current += 1;
    desiredRequestIdRef.current = requestId;
    callbacksRef.current.onFrameInvalid?.();
    issueLatestRequestRef.current?.();
  });

  // 파인된 스트로크는 임페러티브 피드로만 흐르므로 strokes prop 이 비어 있어도 표시 대상이다.
  const presentationActive = isStudioWebGpuCanvasActive(strokes) || pinnedVisible;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cn(
        "overflow-hidden",
        surfaceBounds ? "absolute" : "relative h-full w-full",
        ((!frameAuthorized && !pinnedVisible) || !presentationActive) && "invisible",
        className
      )}
      style={surfaceBounds ? {
        left: surfaceBounds.left,
        top: surfaceBounds.top,
        width: surfaceBounds.width,
        height: surfaceBounds.height,
      } : undefined}
      data-studio-gpu-compositor="true"
      data-studio-gpu-active={presentationActive ? "true" : "false"}
      data-studio-gpu-readback="disabled"
      data-studio-gpu-frame-authorized={frameAuthorized ? "true" : "false"}
      data-studio-gpu-pinned={pinnedVisible ? "true" : "false"}
      data-studio-gpu-surface-width={surfaceBounds?.width}
      data-studio-gpu-surface-height={surfaceBounds?.height}
    >
      <canvas
        ref={gpuCanvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        data-studio-gpu-surface="webgpu"
      />
      <canvas
        ref={fallbackCanvasRef}
        className="pointer-events-none absolute inset-0 block h-full w-full"
        data-studio-gpu-surface="canvas2d"
      />
    </div>
  );
});

StudioWebGpuCanvas.displayName = "StudioWebGpuCanvas";
