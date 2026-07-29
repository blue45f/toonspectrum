import { useLayoutEffect, useRef, useState } from "react";

import {
  StudioCanonicalVNextDryMediaPresentationController,
  type StudioCanonicalVNextDryMediaFinalParityResult,
} from "./studio-canonical-vnext-dry-media-presentation-controller";
import { compileStudioCanonicalVNextDryMediaProductFrame } from "./studio-canonical-vnext-dry-media-product-adapter";
import {
  createStudioEngineWebGpuPresentationSurface,
  type StudioEngineWebGpuPresentationLayout,
  type StudioEngineWebGpuPresentationSurface,
} from "./studio-engine-webgpu-presentation-surface";
import {
  createStudioEngineWebGpuTexturedBrushRuntime,
  type StudioEngineWebGpuTexturedBrushRuntime,
} from "./studio-engine-webgpu-textured-brush-runtime";
import { resolveStudioLiveSurfaceDevicePixelRatio } from "./studio-low-latency-canvas";

import type { DrawEl } from "./studio-element-model";
import type { StudioWebGpuSurfaceBounds } from "./studio-webgpu-viewport";

import { cn } from "@/lib/utils";

export const STUDIO_CANONICAL_VNEXT_DRY_MEDIA_CANVAS_VERSION = 1 as const;

export interface StudioCanonicalVNextDryMediaCanvasAuthority {
  readonly kind: "studio-canonical-vnext-dry-media-canvas-authority";
  readonly version: typeof STUDIO_CANONICAL_VNEXT_DRY_MEDIA_CANVAS_VERSION;
  readonly element: DrawEl;
  readonly layoutKey: string;
  readonly canonicalPlanHash: string;
  readonly dynamicPlanDigest: `sha256:${string}`;
  readonly sourceDabCount: number;
  readonly texturedDabCount: number;
  readonly laneCount: 3 | 5;
  readonly parityReceipt: Extract<
    StudioCanonicalVNextDryMediaFinalParityResult,
    { readonly status: "completed" }
  >["receipt"];
}

export interface StudioCanonicalVNextDryMediaCanvasProps {
  readonly className?: string;
  readonly element: DrawEl | null;
  readonly layoutKey: string;
  readonly visible: boolean;
  readonly surfaceBounds: StudioWebGpuSurfaceBounds;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly documentScale: number;
  readonly flipX: boolean;
  readonly onAuthorityChange: (
    authority: StudioCanonicalVNextDryMediaCanvasAuthority | null,
  ) => void;
}

interface LayoutEpochs {
  presentation: number;
  resize: number;
  viewport: number;
  flip: number;
  resizeSignature: string | null;
  viewportSignature: string | null;
  flipSignature: string | null;
}

interface DryMediaGpuResources {
  readonly device: GPUDevice;
  readonly surface: StudioEngineWebGpuPresentationSurface;
  readonly runtime: StudioEngineWebGpuTexturedBrushRuntime;
  readonly controller: StudioCanonicalVNextDryMediaPresentationController;
  readonly epochs: LayoutEpochs;
  tail: Promise<void>;
}

interface DryMediaRecoveryScope {
  readonly element: DrawEl | null;
  readonly layoutKey: string;
  readonly surfaceLeft: number;
  readonly surfaceTop: number;
  readonly surfaceWidth: number;
  readonly surfaceHeight: number;
  readonly documentWidth: number;
  readonly documentHeight: number;
  readonly documentScale: number;
  readonly flipX: boolean;
}

const STUDIO_CANONICAL_VNEXT_DRY_MEDIA_RECOVERY_DELAYS_MS = [32, 160] as const;

function isSameRecoveryScope(
  left: DryMediaRecoveryScope,
  right: DryMediaRecoveryScope,
): boolean {
  return (
    left.element === right.element
    && left.layoutKey === right.layoutKey
    && left.surfaceLeft === right.surfaceLeft
    && left.surfaceTop === right.surfaceTop
    && left.surfaceWidth === right.surfaceWidth
    && left.surfaceHeight === right.surfaceHeight
    && left.documentWidth === right.documentWidth
    && left.documentHeight === right.documentHeight
    && left.documentScale === right.documentScale
    && left.flipX === right.flipX
  );
}

function preferredCanvasFormat(gpu: GPU): "bgra8unorm" | "rgba8unorm" | null {
  const format = gpu.getPreferredCanvasFormat();
  return format === "bgra8unorm" || format === "rgba8unorm" ? format : null;
}

function surfaceDevicePixelRatio(width: number, height: number): number {
  const native = Number(globalThis.devicePixelRatio);
  return resolveStudioLiveSurfaceDevicePixelRatio({
    cssWidth: width,
    cssHeight: height,
    devicePixelRatio: Number.isFinite(native) && native > 0 ? native : 1,
  });
}

async function createResources(
  canvas: HTMLCanvasElement,
  onDeviceLost: (info: GPUDeviceLostInfo) => void,
): Promise<DryMediaGpuResources | null> {
  const gpu = navigator.gpu;
  if (!gpu) return null;
  const context = canvas.getContext("webgpu") as GPUCanvasContext | null;
  const canvasFormat = preferredCanvasFormat(gpu);
  if (!context || !canvasFormat) return null;
  const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  const surfaceResult = createStudioEngineWebGpuPresentationSurface({
    device,
    context,
    canvas,
    canvasFormat,
    initialDeviceEpoch: 1,
    ownsDevice: false,
    onDeviceLost,
  });
  if (surfaceResult.status !== "ready") {
    device.destroy();
    return null;
  }
  const runtimeResult = createStudioEngineWebGpuTexturedBrushRuntime({
    device,
    initialDeviceEpoch: 1,
    presentationOnly: true,
    ownsDevice: false,
    onDeviceLost,
  });
  if (runtimeResult.status !== "ready") {
    surfaceResult.surface.dispose();
    device.destroy();
    return null;
  }
  return {
    device,
    surface: surfaceResult.surface,
    runtime: runtimeResult.runtime,
    controller: new StudioCanonicalVNextDryMediaPresentationController({
      surface: surfaceResult.surface,
      runtime: runtimeResult.runtime,
    }),
    epochs: {
      presentation: 0,
      resize: 0,
      viewport: 0,
      flip: 0,
      resizeSignature: null,
      viewportSignature: null,
      flipSignature: null,
    },
    tail: Promise.resolve(),
  };
}

function configureSurface(
  resources: DryMediaGpuResources,
  input: Pick<
    StudioCanonicalVNextDryMediaCanvasProps,
    | "surfaceBounds"
    | "documentWidth"
    | "documentHeight"
    | "documentScale"
    | "flipX"
  >,
): boolean {
  const { surfaceBounds } = input;
  if (
    !Number.isFinite(surfaceBounds.left)
    || !Number.isFinite(surfaceBounds.top)
    || !Number.isFinite(surfaceBounds.width)
    || !Number.isFinite(surfaceBounds.height)
    || surfaceBounds.width <= 0
    || surfaceBounds.height <= 0
    || !Number.isFinite(input.documentWidth)
    || !Number.isFinite(input.documentHeight)
    || input.documentWidth <= 0
    || input.documentHeight <= 0
    || !Number.isFinite(input.documentScale)
    || input.documentScale <= 0
  ) return false;
  const dpr = surfaceDevicePixelRatio(surfaceBounds.width, surfaceBounds.height);
  const resizeSignature = [
    surfaceBounds.width,
    surfaceBounds.height,
    dpr,
  ].join(":");
  const viewportSignature = [
    input.documentWidth,
    input.documentHeight,
    input.documentScale,
    surfaceBounds.left,
    surfaceBounds.top,
  ].join(":");
  const flipSignature = input.flipX ? "flip-x" : "normal";
  const epochs = resources.epochs;
  const first = epochs.presentation === 0;
  const resizeChanged = first || epochs.resizeSignature !== resizeSignature;
  const viewportChanged = first || epochs.viewportSignature !== viewportSignature;
  const flipChanged = first || epochs.flipSignature !== flipSignature;
  if (resizeChanged) epochs.resize += 1;
  if (viewportChanged) epochs.viewport += 1;
  if (flipChanged) epochs.flip += 1;
  if (resizeChanged || viewportChanged || flipChanged) epochs.presentation += 1;
  epochs.resizeSignature = resizeSignature;
  epochs.viewportSignature = viewportSignature;
  epochs.flipSignature = flipSignature;
  const layout: StudioEngineWebGpuPresentationLayout = {
    presentationEpoch: epochs.presentation,
    resizeEpoch: epochs.resize,
    viewportEpoch: epochs.viewport,
    flipEpoch: epochs.flip,
    cssWidth: surfaceBounds.width,
    cssHeight: surfaceBounds.height,
    dpr,
    viewport: {
      logicalWidth: input.documentWidth,
      logicalHeight: input.documentHeight,
      scaleX: input.documentScale,
      scaleY: input.documentScale,
      offsetX: -surfaceBounds.left,
      offsetY: -surfaceBounds.top,
      flipX: input.flipX,
      flipY: false,
    },
  };
  const configured = resources.surface.configure(layout);
  return configured.status === "ready" || configured.status === "unchanged";
}

function disposeResources(resources: DryMediaGpuResources | null): void {
  if (!resources) return;
  resources.surface.dispose();
  resources.runtime.dispose();
  resources.device.destroy();
}

function disposeResourcesAfterTail(resources: DryMediaGpuResources | null): void {
  if (!resources) return;
  void resources.tail.finally(() => disposeResources(resources));
}

export function StudioCanonicalVNextDryMediaCanvas({
  className,
  element,
  layoutKey,
  visible,
  surfaceBounds,
  documentWidth,
  documentHeight,
  documentScale,
  flipX,
  onAuthorityChange,
}: StudioCanonicalVNextDryMediaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onAuthorityChange);
  const resourcesRef = useRef<DryMediaGpuResources | null>(null);
  const resourcesPromiseRef = useRef<Promise<DryMediaGpuResources | null> | null>(
    null,
  );
  const recoveryAttemptsRef = useRef(0);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryScopeRef = useRef<DryMediaRecoveryScope | null>(null);
  const recoveryScheduleRef = useRef<() => void>(() => undefined);
  const resourceGenerationRef = useRef(0);
  const jobEpochRef = useRef(0);
  const compileEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const surfaceLeft = surfaceBounds.left;
  const surfaceTop = surfaceBounds.top;
  const surfaceWidth = surfaceBounds.width;
  const surfaceHeight = surfaceBounds.height;

  useLayoutEffect(() => {
    callbackRef.current = onAuthorityChange;
  }, [onAuthorityChange]);

  const scheduleBoundedRecovery = () => {
    const scope = recoveryScopeRef.current;
    if (
      !mountedRef.current
      || !scope?.element
      || !navigator.gpu
      || recoveryTimerRef.current !== null
      || recoveryAttemptsRef.current
        >= STUDIO_CANONICAL_VNEXT_DRY_MEDIA_RECOVERY_DELAYS_MS.length
    ) return;
    const attempt = recoveryAttemptsRef.current;
    recoveryAttemptsRef.current += 1;
    recoveryTimerRef.current = setTimeout(() => {
      recoveryTimerRef.current = null;
      if (
        mountedRef.current
        && recoveryScopeRef.current === scope
      ) setRecoveryEpoch((epoch) => epoch + 1);
    }, STUDIO_CANONICAL_VNEXT_DRY_MEDIA_RECOVERY_DELAYS_MS[attempt]);
  };

  useLayoutEffect(() => {
    recoveryScheduleRef.current = scheduleBoundedRecovery;
  });

  const revokeImmediately = (reason: string) => {
    if (canvasRef.current) {
      canvasRef.current.dataset.studioCanonicalVnextDryMediaState = "fallback";
      canvasRef.current.dataset.studioCanonicalVnextDryMediaReason = reason;
    }
    /*
     * Visibility is parent-owned. Emitting null lets the viewport restore the retained Konva
     * DrawEl and hide this specialist canvas in one React commit, avoiding a child-first blank
     * frame during resize, device loss, or a failed receipt.
     */
    callbackRef.current(null);
  };

  useLayoutEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      jobEpochRef.current += 1;
      resourceGenerationRef.current += 1;
      callbackRef.current(null);
      if (recoveryTimerRef.current !== null) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      const resources = resourcesRef.current;
      resourcesRef.current = null;
      resourcesPromiseRef.current = null;
      disposeResourcesAfterTail(resources);
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const jobEpoch = ++jobEpochRef.current;
    const controller = new AbortController();
    const nextRecoveryScope: DryMediaRecoveryScope = {
      element,
      layoutKey,
      surfaceLeft,
      surfaceTop,
      surfaceWidth,
      surfaceHeight,
      documentWidth,
      documentHeight,
      documentScale,
      flipX,
    };
    if (
      !recoveryScopeRef.current
      || !isSameRecoveryScope(recoveryScopeRef.current, nextRecoveryScope)
    ) {
      if (recoveryTimerRef.current !== null) {
        clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = null;
      }
      recoveryAttemptsRef.current = 0;
      recoveryScopeRef.current = nextRecoveryScope;
    }

    const relinquishResources = () => {
      resourceGenerationRef.current += 1;
      const resources = resourcesRef.current;
      resourcesRef.current = null;
      resourcesPromiseRef.current = null;
      disposeResourcesAfterTail(resources);
    };

    const rejectAndRelease = (reason: string) => {
      revokeImmediately(reason);
      relinquishResources();
    };

    revokeImmediately(element ? "awaiting-receipt" : "no-candidate");
    if (!canvas || !element) {
      /*
       * The shared RGBA16F surface can be tens or hundreds of MiB at tablet resolutions. No
       * eligible selected DrawEl means there is no specialist owner, so release immediately
       * instead of retaining that allocation behind an invisible canvas.
       */
      relinquishResources();
      return () => controller.abort();
    }

    const ensureResources = async () => {
      if (resourcesRef.current) return resourcesRef.current;
      const existing = resourcesPromiseRef.current;
      if (existing) return existing;

      const generation = resourceGenerationRef.current + 1;
      resourceGenerationRef.current = generation;
      const pending = createResources(canvas, () => {
        if (
          !mountedRef.current
          || resourceGenerationRef.current !== generation
        ) return;
        jobEpochRef.current += 1;
        rejectAndRelease("device-lost");
        recoveryScheduleRef.current();
      });
      resourcesPromiseRef.current = pending;

      const resources = await pending.catch(() => null);

      const ownsPending =
        resourcesPromiseRef.current === pending
        && resourceGenerationRef.current === generation;
      if (
        !mountedRef.current
        || !ownsPending
        || canvasRef.current !== canvas
      ) {
        disposeResourcesAfterTail(resources);
        return null;
      }
      resourcesPromiseRef.current = null;
      resourcesRef.current = resources;
      return resources;
    };

    void (async () => {
      const resources = await ensureResources();
      if (
        !resources
        || controller.signal.aborted
        || jobEpoch !== jobEpochRef.current
      ) {
        if (
          !controller.signal.aborted
          && jobEpoch === jobEpochRef.current
        ) {
          revokeImmediately("webgpu-unavailable");
          scheduleBoundedRecovery();
        }
        return;
      }
      const run = async () => {
        if (
          controller.signal.aborted
          || jobEpoch !== jobEpochRef.current
        ) return;
        if (!configureSurface(resources, {
          surfaceBounds: {
            left: surfaceLeft,
            top: surfaceTop,
            width: surfaceWidth,
            height: surfaceHeight,
          },
          documentWidth,
          documentHeight,
          documentScale,
          flipX,
        })) {
          rejectAndRelease("surface-config-rejected");
          return;
        }
        compileEpochRef.current += 1;
        const compiled =
          await compileStudioCanonicalVNextDryMediaProductFrame({
            element,
            sessionEpoch: 1,
            strokeEpoch: compileEpochRef.current,
            commandSequence: compileEpochRef.current,
            signal: controller.signal,
          });
        if (
          compiled.status !== "ready"
          || controller.signal.aborted
          || jobEpoch !== jobEpochRef.current
        ) {
          if (
            !controller.signal.aborted
            && jobEpoch === jobEpochRef.current
          ) {
            rejectAndRelease(
              compiled.status === "ready"
                ? "stale-compile"
                : [
                    "compile",
                    compiled.reason,
                    compiled.detail,
                  ].filter(Boolean).join(":"),
            );
          }
          return;
        }
        const parity = await resources.controller.presentFinalLiveAndCommit(
          compiled.frame,
          controller.signal,
        );
        if (
          parity.status !== "completed"
          || controller.signal.aborted
          || jobEpoch !== jobEpochRef.current
        ) {
          if (
            !controller.signal.aborted
            && jobEpoch === jobEpochRef.current
          ) {
            rejectAndRelease(
              parity.status === "completed"
                ? "stale-presentation"
                : `presentation:${parity.reason}`,
            );
          }
          return;
        }
        canvas.dataset.studioCanonicalVnextDryMediaState = "authorized";
        delete canvas.dataset.studioCanonicalVnextDryMediaReason;
        recoveryAttemptsRef.current = 0;
        if (recoveryTimerRef.current !== null) {
          clearTimeout(recoveryTimerRef.current);
          recoveryTimerRef.current = null;
        }
        callbackRef.current(Object.freeze({
          kind: "studio-canonical-vnext-dry-media-canvas-authority",
          version: STUDIO_CANONICAL_VNEXT_DRY_MEDIA_CANVAS_VERSION,
          element,
          layoutKey,
          canonicalPlanHash: compiled.frame.canonicalPlanHash,
          dynamicPlanDigest: compiled.dynamicPlanDigest,
          sourceDabCount: compiled.sourceDabCount,
          texturedDabCount: compiled.texturedDabCount,
          laneCount: compiled.laneCount,
          parityReceipt: parity.receipt,
        }));
      };
      const queued = resources.tail.then(run, run);
      resources.tail = queued.then(
        () => undefined,
        () => undefined,
      );
      await queued;
    })();

    return () => controller.abort();
  }, [
    documentHeight,
    documentScale,
    documentWidth,
    element,
    flipX,
    layoutKey,
    recoveryEpoch,
    surfaceHeight,
    surfaceLeft,
    surfaceTop,
    surfaceWidth,
  ]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-studio-canonical-vnext-dry-media="true"
      data-studio-canonical-vnext-dry-media-authorized={
        visible ? "true" : "false"
      }
      className={cn("pointer-events-none absolute z-[12]", className)}
      style={{
        left: surfaceLeft,
        top: surfaceTop,
        width: surfaceWidth,
        height: surfaceHeight,
        visibility: visible ? "visible" : "hidden",
      }}
    />
  );
}
