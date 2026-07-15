import { useEffect, useLayoutEffect, useRef } from "react";

import {
  StudioWebGpuEngine,
  type StudioGpuBackend,
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
  readonly onBackendChange?: (backend: StudioGpuBackend) => void;
  readonly onDeviceLost?: (info: GPUDeviceLostInfo) => void;
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
  scaleX,
  scaleY,
  offsetX,
  offsetY,
  flipX,
  onBackendChange,
  onDeviceLost,
}: StudioWebGpuCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const gpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StudioWebGpuEngine | null>(null);
  const callbacksRef = useRef({ onBackendChange, onDeviceLost });
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

  callbacksRef.current = { onBackendChange, onDeviceLost };
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
    engine.render(latestRef.current.strokes);
    void engine.initialize().then(() => {
      if (!active) {
        engine.dispose();
        return;
      }
      syncViewport();
      engine.render(latestRef.current.strokes);
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

  // The authoritative Konva draft is hidden in the same React commit. Draw/clear the transparent
  // GPU handoff before paint so the user never sees a blank or double-dark transition frame.
  useLayoutEffect(() => {
    engineRef.current?.render(strokes);
  }, [strokes]);

  useLayoutEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const measured = measuredCssSize(rootRef.current, width, height);
    engine.resize({
      logicalWidth: width,
      logicalHeight: height,
      cssWidth: measured.width,
      cssHeight: measured.height,
      dpr: devicePixelRatio(),
      scaleX,
      scaleY,
      offsetX,
      offsetY,
      flipX,
    });
  }, [flipX, height, offsetX, offsetY, scaleX, scaleY, width]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className={cn("relative h-full w-full overflow-hidden", className)}
      data-studio-gpu-compositor="true"
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
