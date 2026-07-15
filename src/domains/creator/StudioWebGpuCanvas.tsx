import { useEffect, useLayoutEffect, useRef } from "react";

import {
  StudioWebGpuEngine,
  type StudioGpuBackend,
  type StudioGpuFrameReceipt,
  type StudioGpuStroke,
  type StudioGpuViewTransform,
} from "./studio-webgpu-engine";

import { cn } from "@/lib/utils";

const EMPTY_STROKES: readonly StudioGpuStroke[] = Object.freeze([]);

export interface StudioWebGpuCanvasProps extends StudioGpuViewTransform {
  readonly className?: string;
  /** Logical document coordinates, independent of CSS zoom and device pixel ratio. */
  readonly width: number;
  readonly height: number;
  /**
   * Ordered operations composited inside this surface. `erase` strokes destination-out only pixels
   * produced by earlier strokes in this array; they intentionally cannot punch through DOM/Konva
   * content below the transparent canvas.
   */
  readonly strokes?: readonly StudioGpuStroke[];
  /** Must match the parent's authoritative-canvas handoff state for an atomic show/hide commit. */
  readonly frameAuthorized?: boolean;
  readonly onBackendChange?: (backend: StudioGpuBackend) => void;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
  /** A matching receipt is the only safe signal for hiding the authoritative Konva preview. */
  readonly onFrameReady?: (receipt: StudioGpuFrameReceipt) => void;
  readonly onFrameInvalid?: () => void;
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
}

function sameNumberArray(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => Object.is(value, right[index]));
}

function sameStroke(left: StudioGpuStroke, right: StudioGpuStroke): boolean {
  return left.id === right.id
    && left.color === right.color
    && Object.is(left.size, right.size)
    && Object.is(left.opacity, right.opacity)
    && left.composite === right.composite
    && left.orderKey === right.orderKey
    && sameNumberArray(left.points, right.points)
    && sameNumberArray(left.pressures, right.pressures);
}

function sameCanvasRequest(left: LatestCanvasProps, right: LatestCanvasProps): boolean {
  return Object.is(left.width, right.width)
    && Object.is(left.height, right.height)
    && Object.is(left.scaleX, right.scaleX)
    && Object.is(left.scaleY, right.scaleY)
    && Object.is(left.offsetX, right.offsetX)
    && Object.is(left.offsetY, right.offsetY)
    && left.flipX === right.flipX
    && left.strokes.length === right.strokes.length
    && left.strokes.every((stroke, index) => sameStroke(stroke, right.strokes[index]!));
}

function snapshotCanvasRequest(request: LatestCanvasProps): LatestCanvasProps {
  return {
    ...request,
    strokes: request.strokes.map((stroke) => ({
      ...stroke,
      points: [...stroke.points],
      pressures: stroke.pressures ? [...stroke.pressures] : undefined,
    })),
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

export function StudioWebGpuCanvas({
  className,
  width,
  height,
  strokes = EMPTY_STROKES,
  frameAuthorized = false,
  scaleX,
  scaleY,
  offsetX,
  offsetY,
  flipX,
  onBackendChange,
  onDeviceLost,
  onFrameReady,
  onFrameInvalid,
}: StudioWebGpuCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StudioWebGpuEngine | null>(null);
  const callbacksRef = useRef({ onBackendChange, onDeviceLost, onFrameReady, onFrameInvalid });
  const requestSequenceRef = useRef(0);
  const desiredRequestIdRef = useRef("frame:0");
  const lastIssuedRequestRef = useRef<LatestCanvasProps | null>(null);
  const latestRef = useRef<LatestCanvasProps>({
    width,
    height,
    strokes,
    scaleX,
    scaleY,
    offsetX,
    offsetY,
    flipX,
  });

  callbacksRef.current = { onBackendChange, onDeviceLost, onFrameReady, onFrameInvalid };
  latestRef.current = { width, height, strokes, scaleX, scaleY, offsetX, offsetY, flipX };

  useEffect(() => {
    const canvas = gpuCanvasRef.current;
    const fallbackCanvas = fallbackCanvasRef.current;
    if (!canvas || !fallbackCanvas) return;

    let active = true;
    const engine = new StudioWebGpuEngine({
      canvas,
      fallbackCanvas,
      onBackendChange: (backend) => callbacksRef.current.onBackendChange?.(backend),
      onDeviceLost: (info) => callbacksRef.current.onDeviceLost?.(info),
      onFrameInvalid: () => callbacksRef.current.onFrameInvalid?.(),
      onFrameReady: (receipt) => {
        if (receipt.requestId !== desiredRequestIdRef.current) return;
        callbacksRef.current.onFrameReady?.(receipt);
      },
    });
    engineRef.current = engine;
    callbacksRef.current.onBackendChange?.(engine.getBackend());

    const syncViewport = (observedWidth?: number, observedHeight?: number) => {
      const latest = latestRef.current;
      const measured = measuredCssSize(rootRef.current, latest.width, latest.height);
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

    syncViewport();
    engine.render(latestRef.current.strokes, desiredRequestIdRef.current);
    void engine.initialize().then(() => {
      if (!active) {
        engine.dispose();
        return;
      }
      syncViewport();
      engine.render(latestRef.current.strokes, desiredRequestIdRef.current);
    });

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
      active = false;
      resizeObserver?.disconnect();
      globalThis.removeEventListener?.("resize", handleWindowResize);
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
    const engine = engineRef.current;
    if (!engine) return;
    const measured = measuredCssSize(rootRef.current, latest.width, latest.height);
    engine.resize({
      logicalWidth: latest.width,
      logicalHeight: latest.height,
      cssWidth: measured.width,
      cssHeight: measured.height,
      dpr: devicePixelRatio(),
      scaleX: latest.scaleX,
      scaleY: latest.scaleY,
      offsetX: latest.offsetX,
      offsetY: latest.offsetY,
      flipX: latest.flipX,
    });
    engine.render(latest.strokes, requestId);
  });

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cn(
        "relative h-full w-full overflow-hidden",
        !frameAuthorized && "invisible",
        className
      )}
      data-studio-gpu-compositor="true"
      data-studio-gpu-frame-authorized={frameAuthorized ? "true" : "false"}
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
}
