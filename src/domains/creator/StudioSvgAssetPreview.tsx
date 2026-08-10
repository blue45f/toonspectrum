import { useEffect, useRef, useState, type ReactElement } from "react";

import { svgToDataUrl } from "./studio-characters";
import {
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

function decisionLabel(decision: StudioSvgProductDecision | null): string {
  if (!decision) return "브라우저 SVG 미리보기";
  switch (decision.providerId) {
    case "vello-svg-native":
      return "Vello SVG 품질 검증 미리보기";
    case "skia-canvaskit-scene-ir":
      return "편집 가능한 SceneIR 미리보기";
    case "resvg-wasm":
      return "resvg 기준 미리보기";
    case "browser-native-svg":
      return "원본 SVG 보존 미리보기";
    case "rejected":
      return "안전하지 않거나 지원되지 않는 SVG";
  }
}

/**
 * Bounded product island for catalog SVG thumbnails.
 *
 * The original SVG image remains mounted until a complete routed frame is
 * ready. Vello uses its deterministic CPU sibling here, so this interactive
 * caller never invokes the GPU pixel-readback evidence API.
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
  const [decision, setDecision] = useState<StudioSvgProductDecision | null>(null);
  const [painted, setPainted] = useState(false);
  const [resolveMs, setResolveMs] = useState<number | null>(null);

  useEffect(() => {
    if (!requested || decision) return;
    let live = true;
    const cancel = schedulePreview(() => {
      const started = performance.now();
      void tournament.resolve({
        assetId,
        svg,
        width,
        height,
        trust: "bundled-catalog",
      }).then((next) => {
        if (!live) return;
        setResolveMs(performance.now() - started);
        setDecision(next);
      }).catch(() => {
        // Keep the original SVG image visible if an unexpected provider bug
        // escapes the router's explicit fallback decisions.
        if (live) setResolveMs(performance.now() - started);
      });
    });
    return () => {
      live = false;
      cancel();
    };
  }, [assetId, decision, height, requested, svg, tournament, width]);

  useEffect(() => {
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
      return;
    }
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
  }, [decision]);

  const providerId = painted
    ? decision?.providerId ?? "browser-native-svg"
    : decision?.providerId === "rejected"
      ? "rejected"
      : "browser-native-svg";
  const rejected = providerId === "rejected";

  return (
    <span
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      data-studio-svg-product-preview="true"
      data-studio-svg-preview-provider={providerId}
      data-studio-svg-preview-route={decision?.route ?? "pending"}
      data-studio-svg-preview-visual-gate={
        decision?.visualGate ? String(decision.visualGate.pass) : "not-run"
      }
      data-studio-svg-preview-mismatch-pct={decision?.visualGate?.mismatchPct ?? ""}
      data-studio-svg-preview-gpu-readback-bytes={
        decision?.interactiveGpuReadbackBytes ?? 0
      }
      data-studio-svg-preview-resolve-ms={resolveMs?.toFixed(3) ?? ""}
      title={decision?.reasons.join(" · ") || undefined}
    >
      <img
        src={svgToDataUrl(svg)}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={
          `h-full w-full object-contain transition-transform group-hover:scale-105 ${
            painted || rejected ? "invisible" : "visible"
          }`
        }
      />
      <canvas
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
        {requested ? decisionLabel(decision) : "SVG 미리보기 대기"}
      </span>
    </span>
  );
}
