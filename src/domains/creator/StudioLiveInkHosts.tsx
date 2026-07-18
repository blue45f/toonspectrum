/**
 * Small DOM hosts for live drawing surfaces and the frame-local pressure HUD.
 * Loaded beside the canvas so their React wiring stays out of route bootstrap.
 */
import {
  Suspense,
  memo,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import { StudioHudPill } from "./studio-chrome-ui";
import { studioPressureHudRatio } from "./studio-draw-hud";

import type {
  StudioLiveInkOverlayRenderer,
  StudioLiveInkPredictionRenderer,
  StudioLiveInkSurface,
} from "./studio-live-ink-overlay";
import type { StudioLiveStampOverlayRenderer } from "./studio-live-stamp-overlay";

import { lazyRetry } from "@/lib/lazy-retry";

const StudioPressureHudMeter = lazyRetry(
  () => import("./studio-creative-visuals").then((mod) => ({ default: mod.StudioPressureHudMeter })),
  "StudioPressureHudMeter"
);

export interface StudioLivePressureStore {
  value: number | null;
  listeners: Set<() => void>;
}

export const StudioLiveInkOverlayHost = memo(function StudioLiveInkOverlayHost({
  renderer,
  left,
  top,
  width,
  height,
  documentScale,
  documentWidth,
  flipX,
}: StudioLiveInkSurface & { renderer: StudioLiveInkOverlayRenderer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    renderer.attach(canvasRef.current);
    return () => renderer.attach(null);
  }, [renderer]);
  useLayoutEffect(() => {
    renderer.setSurface({ left, top, width, height, documentScale, documentWidth, flipX });
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-studio-live-ink-overlay="true"
      className="pointer-events-none absolute z-10"
      style={{ left, top, width, height }}
    />
  );
});

export const StudioLiveStampOverlayHost = memo(function StudioLiveStampOverlayHost({
  renderer,
  left,
  top,
  width,
  height,
  documentScale,
  documentWidth,
  flipX,
}: StudioLiveInkSurface & { renderer: StudioLiveStampOverlayRenderer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    renderer.attach(canvasRef.current);
    return () => renderer.attach(null);
  }, [renderer]);
  useLayoutEffect(() => {
    renderer.setSurface({ left, top, width, height, documentScale, documentWidth, flipX });
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-studio-live-stamp-overlay="true"
      className="pointer-events-none absolute z-10"
      style={{ left, top, width, height }}
    />
  );
});

export const StudioLiveInkPredictionHost = memo(function StudioLiveInkPredictionHost({
  renderer,
  left,
  top,
  width,
  height,
  documentScale,
  documentWidth,
  flipX,
}: StudioLiveInkSurface & { renderer: StudioLiveInkPredictionRenderer }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    renderer.attach(canvasRef.current);
    return () => renderer.attach(null);
  }, [renderer]);
  useLayoutEffect(() => {
    renderer.setSurface({ left, top, width, height, documentScale, documentWidth, flipX });
  });
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-studio-live-ink-prediction="true"
      className="pointer-events-none absolute z-[11]"
      style={{ left, top, width, height }}
    />
  );
});

export function StudioLivePressureHudPill({ store }: { store: StudioLivePressureStore }) {
  const pressure = useSyncExternalStore(
    (onStoreChange) => {
      store.listeners.add(onStoreChange);
      return () => store.listeners.delete(onStoreChange);
    },
    () => store.value
  );
  const ratio = studioPressureHudRatio(pressure);
  if (ratio === null) return null;
  return (
    <StudioHudPill title="실시간 필압" accent>
      <Suspense fallback={null}>
        <StudioPressureHudMeter ratio={ratio} />
      </Suspense>
    </StudioHudPill>
  );
}
