import { useLayoutEffect, useRef, useState } from "react";

import { characterFrameRect } from "./character-shaper-framing";

import type { CharacterOutputFraming } from "./character-shaper-framing";
import type { CSSProperties } from "react";

interface SurfaceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function sameRect(left: SurfaceRect | null, right: SurfaceRect): boolean {
  return left !== null
    && Math.abs(left.x - right.x) < 0.25
    && Math.abs(left.y - right.y) < 0.25
    && Math.abs(left.width - right.width) < 0.25
    && Math.abs(left.height - right.height) < 0.25;
}

/** DOM-only annotations align to the rendered WebGL canvas and never enter scene capture. */
export function CharacterShaperCompositionGuide({ framing }: { readonly framing: CharacterOutputFraming }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [surface, setSurface] = useState<SurfaceRect | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    if (!root || !host) return;
    let observedCanvas: HTMLCanvasElement | null = null;
    let resize: ResizeObserver | null = null;
    const update = () => {
      const canvas = host.querySelector<HTMLCanvasElement>("canvas");
      if (!canvas) return;
      if (observedCanvas !== canvas) {
        if (observedCanvas) resize?.unobserve(observedCanvas);
        observedCanvas = canvas;
        resize?.observe(canvas);
      }
      const hostBounds = host.getBoundingClientRect();
      const canvasBounds = canvas.getBoundingClientRect();
      const next = {
        x: canvasBounds.left - hostBounds.left,
        y: canvasBounds.top - hostBounds.top,
        width: canvasBounds.width,
        height: canvasBounds.height,
      };
      if (next.width > 0 && next.height > 0) setSurface((current) => sameRect(current, next) ? current : next);
    };
    if (typeof ResizeObserver === "function") {
      resize = new ResizeObserver(update);
      resize.observe(host);
    }
    const mutations = typeof MutationObserver === "function" ? new MutationObserver(update) : null;
    mutations?.observe(host, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    update();
    const frame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(update) : null;
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      mutations?.disconnect();
      resize?.disconnect();
    };
  }, []);
  const enabled = framing.aspect !== "viewport" || framing.guide !== "none" || framing.safeArea;
  const rect = surface ? characterFrameRect(surface.width, surface.height, framing.aspect) : null;
  const divisions = framing.guide === "thirds" ? [1 / 3, 2 / 3] : framing.guide === "center" ? [0.5] : [];
  const rootStyle: CSSProperties | undefined = surface ? {
    left: surface.x,
    top: surface.y,
    width: surface.width,
    height: surface.height,
  } : undefined;
  const frameStyle: CSSProperties | undefined = rect ? {
    position: "absolute",
    left: `${rect.x * 100}%`,
    top: `${rect.y * 100}%`,
    width: `${rect.width * 100}%`,
    height: `${rect.height * 100}%`,
    boxShadow: framing.aspect === "viewport" ? undefined : "0 0 0 100vmax rgb(0 0 0 / 0.42)",
  } : undefined;

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      className="pointer-events-none absolute z-10 overflow-hidden"
      data-character-composition-guide={framing.aspect}
      style={rootStyle}
    >
      {enabled && frameStyle ? <div style={frameStyle} className="border border-white/80" data-character-output-frame="true">
        {divisions.map((fraction) => <div key={`v${fraction}`} className="absolute inset-y-0 border-l border-white/55" style={{ left: `${fraction * 100}%` }} />)}
        {divisions.map((fraction) => <div key={`h${fraction}`} className="absolute inset-x-0 border-t border-white/55" style={{ top: `${fraction * 100}%` }} />)}
        {framing.safeArea ? <div className="absolute inset-[5%] border border-dashed border-white/75" data-character-safe-area="true" /> : null}
      </div> : null}
    </div>
  );
}
