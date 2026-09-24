import type {
  ThorvgMountedSurface,
  ThorvgSurfaceReceipt,
} from "@toonspectrum/studio-engine-thorvg/runtime";
import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

import { svgToDataUrl } from "./studio-characters";
import { planStudioSvgProductProvider } from "./studio-svg-product-provider-plan";
import {
  STUDIO_SVG_PRODUCT_SELECTED_PROVIDER_ID,
  studioSvgProductTournament,
  type StudioSvgProductDecision,
  type StudioSvgProductTournament,
} from "./studio-svg-vello-product-router";

export interface StudioSvgAssetPreviewProps {
  readonly assetId: string;
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly requested: boolean;
  readonly tournament?: Pick<StudioSvgProductTournament, "resolve">;
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function schedulePreview(task: () => void): () => void {
  const host = globalThis.window as IdleWindow | undefined;
  if (host?.requestIdleCallback) {
    const handle = host.requestIdleCallback(task, { timeout: 1_000 });
    return () => host.cancelIdleCallback?.(handle);
  }
  const handle = globalThis.setTimeout(task, 0);
  return () => globalThis.clearTimeout(handle);
}

function decisionLabel(
  decision: StudioSvgProductDecision | null,
  thorvgReceipt: ThorvgSurfaceReceipt | null,
): string {
  if (thorvgReceipt) return `ThorVG ${thorvgReceipt.backend.toUpperCase()} SVG 미리보기`;
  if (!decision) return "SVG 미리보기 준비 중";
  switch (decision.providerId) {
    case "vello-svg-native":
      return "Vello SVG 미리보기";
    case "rejected":
      return "안전하지 않거나 지원되지 않는 SVG";
  }
}

function browserVectorCapability(): { webgpu: boolean; webgl2: boolean } {
  return {
    webgpu:
      typeof globalThis.navigator !== "undefined"
      && "gpu" in globalThis.navigator,
    webgl2: typeof globalThis.WebGL2RenderingContext !== "undefined",
  };
}

/**
 * Bounded product island for catalog SVG thumbnails.
 *
 * Provider selection completes before rendering: the strict path subset stays
 * on Vello while a safe, feature-rich asset is assigned to one ThorVG backend.
 * A selected provider failure is visible and never retries another engine.
 */
export function StudioSvgAssetPreview({
  assetId,
  svg,
  width,
  height,
  requested,
  tournament = studioSvgProductTournament,
}: StudioSvgAssetPreviewProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thorvgSurfaceRef = useRef<ThorvgMountedSurface | null>(null);
  const plan = useMemo(
    () => planStudioSvgProductProvider(
      svg,
      width,
      height,
      browserVectorCapability(),
    ),
    [height, svg, width],
  );
  const [decision, setDecision] = useState<StudioSvgProductDecision | null>(null);
  const [thorvgReceipt, setThorvgReceipt] = useState<ThorvgSurfaceReceipt | null>(null);
  const [painted, setPainted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resolveMs, setResolveMs] = useState<number | null>(null);

  useEffect(() => {
    thorvgSurfaceRef.current?.destroy();
    thorvgSurfaceRef.current = null;
    setDecision(null);
    setThorvgReceipt(null);
    setPainted(false);
    setFailed(false);
    setResolveMs(null);
  }, [assetId, height, plan.providerId, svg, width]);

  useEffect(() => {
    if (
      !requested
      || plan.route !== "vello-native"
      || decision
      || failed
    ) return;
    let live = true;
    const cancel = schedulePreview(() => {
      const started = performance.now();
      void tournament.resolve({
        assetId,
        svg,
        width,
        height,
        trust: "bundled-catalog",
        selectedProviderId: STUDIO_SVG_PRODUCT_SELECTED_PROVIDER_ID,
      }).then((next) => {
        if (!live) return;
        setResolveMs(performance.now() - started);
        setDecision(next);
      }).catch(() => {
        if (!live) return;
        setResolveMs(performance.now() - started);
        setFailed(true);
      });
    });
    return () => {
      live = false;
      cancel();
    };
  }, [
    assetId,
    decision,
    failed,
    height,
    plan.route,
    requested,
    svg,
    tournament,
    width,
  ]);

  useEffect(() => {
    if (
      !requested
      || plan.route !== "thorvg-specialist"
      || failed
      || thorvgReceipt
    ) return;
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    let live = true;
    let mounted: ThorvgMountedSurface | null = null;
    const started = performance.now();
    void import("@toonspectrum/studio-engine-thorvg/runtime")
      .then(({ mountThorvgAsset }) => mountThorvgAsset({
        canvas: canvasElement,
        kind: "svg",
        source: svg,
        width,
        height,
        backend: plan.backend,
      }))
      .then((surface) => {
      if (!live) {
        surface.destroy();
        return;
      }
      mounted = surface;
      thorvgSurfaceRef.current = surface;
      setResolveMs(performance.now() - started);
      setThorvgReceipt(surface.receipt);
      setPainted(true);
    }).catch(() => {
      if (!live) return;
      setResolveMs(performance.now() - started);
      setFailed(true);
    });
    return () => {
      live = false;
      mounted?.destroy();
      if (thorvgSurfaceRef.current === mounted) {
        thorvgSurfaceRef.current = null;
      }
    };
  }, [
    failed,
    height,
    plan,
    requested,
    svg,
    thorvgReceipt,
    width,
  ]);

  useEffect(() => {
    if (plan.route !== "vello-native") return;
    const canvas = canvasRef.current;
    const pixels = decision?.pixels;
    if (!canvas || !pixels) {
      setPainted(false);
      return;
    }
    const context = canvas.getContext("2d");
    const ImageDataConstructor = globalThis.ImageData;
    if (!context || !ImageDataConstructor) {
      setPainted(false);
      setFailed(true);
      return;
    }
    try {
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      context.putImageData(
        new ImageDataConstructor(
          new Uint8ClampedArray(pixels.bytes),
          pixels.width,
          pixels.height,
        ),
        0,
        0,
      );
      setPainted(true);
    } catch {
      setPainted(false);
      setFailed(true);
    }
  }, [decision, plan.route]);

  useEffect(() => () => {
    thorvgSurfaceRef.current?.destroy();
    thorvgSurfaceRef.current = null;
  }, []);

  const providerId = painted
    ? thorvgReceipt?.activeProviderId
      ?? decision?.providerId
      ?? plan.providerId
    : plan.route === "rejected" || decision?.providerId === "rejected"
      ? "rejected"
      : failed
        ? "unavailable"
        : "pending";
  const rejected = providerId === "rejected" || providerId === "unavailable";
  const sourcePlaceholderVisible = !requested && !painted && !rejected;
  const route = rejected
    ? "fail-closed"
    : painted
      ? plan.route
      : "pending";
  const title = plan.route === "rejected"
    ? plan.reason
    : decision?.reasons.join(" · ");

  return (
    <span
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      data-studio-svg-product-preview="true"
      data-studio-svg-preview-provider={providerId}
      data-studio-svg-preview-route={route}
      data-studio-svg-preview-gpu-readback-bytes={
        thorvgReceipt?.cpuReadbackBytes
        ?? decision?.interactiveGpuReadbackBytes
        ?? 0
      }
      data-studio-svg-preview-resolve-ms={resolveMs?.toFixed(3) ?? ""}
      title={title || undefined}
    >
      <img
        src={svgToDataUrl(svg)}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        data-studio-svg-source-placeholder={sourcePlaceholderVisible ? "visible" : "hidden"}
        className={
          `h-full w-full object-contain transition-transform group-hover:scale-105 ${
            sourcePlaceholderVisible ? "visible" : "invisible"
          }`
        }
      />
      <canvas
        key={plan.providerId}
        ref={canvasRef}
        aria-hidden
        className={
          `absolute inset-0 h-full w-full object-contain transition-transform group-hover:scale-105 ${
            painted ? "visible" : "invisible"
          }`
        }
      />
      {rejected ? (
        <span className="absolute inset-0 grid place-items-center text-[0.55rem] font-semibold text-bad">
          SVG 확인 필요
        </span>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {failed
          ? `선택한 ${plan.providerId} SVG 미리보기를 사용할 수 없음`
          : requested
            ? decisionLabel(decision, thorvgReceipt)
            : "SVG 미리보기 대기"}
      </span>
    </span>
  );
}
