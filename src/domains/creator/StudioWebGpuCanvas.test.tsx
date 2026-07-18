import { readFileSync } from "node:fs";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { resolveStudioWebGpuCanvasStrokes } from "./studio-webgpu-canvas-authority";
import {
  isStudioWebGpuCanvasActive,
  routeStudioWebGpuCanvasRequest,
} from "./studio-webgpu-engine";
import { StudioWebGpuCanvas } from "./StudioWebGpuCanvas";

const supportedStroke = {
  id: "preview-stroke",
  points: [10, 10, 40, 40],
  color: "#7c5cff",
  size: 8,
} as const;

const webGpuCanvasSource = readFileSync(
  new URL("./StudioWebGpuCanvas.tsx", import.meta.url),
  "utf8",
);

describe("StudioWebGpuCanvas", () => {
  it("keeps pinned strokes authoritative across parent renders until the pin is released", () => {
    const initialDeclarative = [supportedStroke] as const;
    const pinned = [{
      ...supportedStroke,
      id: "pinned-live-stroke",
      points: [10, 10, 80, 90],
    }] as const;

    expect(resolveStudioWebGpuCanvasStrokes(initialDeclarative, pinned)).toBe(pinned);

    // StudioPage normally re-renders this child with a shared declarative EMPTY list while the
    // imperative live-ink feed is pinned. That render must not suspend or replace the pinned feed.
    const declarativeAfterParentRender = [] as const;
    expect(resolveStudioWebGpuCanvasStrokes(declarativeAfterParentRender, pinned)).toBe(pinned);

    // Releasing authority restores the newest declarative value, not the value from pin start.
    expect(resolveStudioWebGpuCanvasStrokes(declarativeAfterParentRender, null))
      .toBe(declarativeAfterParentRender);
  });

  it("treats an empty pinned feed as an authoritative clear rather than a released pin", () => {
    const declarative = [supportedStroke] as const;
    const pinnedClear = [] as const;

    expect(resolveStudioWebGpuCanvasStrokes(declarative, pinnedClear)).toBe(pinnedClear);
    expect(resolveStudioWebGpuCanvasStrokes(declarative, null)).toBe(declarative);
  });

  it("renders transparent WebGPU and Canvas2D surfaces without an unsupported warning overlay", () => {
    const html = renderToStaticMarkup(
      <StudioWebGpuCanvas
        width={800}
        height={1_200}
        strokes={[supportedStroke]}
      />
    );

    expect(html).toContain('data-studio-gpu-compositor="true"');
    expect(html).toContain('data-studio-gpu-active="true"');
    expect(html).toContain('data-studio-gpu-readback="disabled"');
    expect(html).toContain('data-studio-gpu-frame-authorized="false"');
    expect(html).toContain("invisible");
    expect(html).toContain('data-studio-gpu-surface="webgpu"');
    expect(html).toContain('data-studio-gpu-surface="canvas2d"');
    expect(html).not.toContain("WebGPU 미지원");
    expect(html).not.toContain("Fallback");
  });

  it("shows the compositor only when the parent authorizes the matching frame receipt", () => {
    const html = renderToStaticMarkup(
      <StudioWebGpuCanvas
        width={800}
        height={1_200}
        strokes={[supportedStroke]}
        frameAuthorized
      />
    );

    expect(html).toContain('data-studio-gpu-frame-authorized="true"');
    expect(html).not.toContain("invisible");
  });

  it("renders a bounded viewport surface instead of a full-height document surface", () => {
    const html = renderToStaticMarkup(
      <StudioWebGpuCanvas
        width={800}
        height={12_000}
        surfaceBounds={{ left: 120, top: 4_800, width: 640, height: 720 }}
        scaleX={1.875}
        scaleY={25}
        offsetX={-150}
        offsetY={-80_000}
        strokes={[supportedStroke]}
        frameAuthorized
      />
    );

    expect(html).toContain('data-studio-gpu-surface-width="640"');
    expect(html).toContain('data-studio-gpu-surface-height="720"');
    expect(html).toContain("left:120px");
    expect(html).toContain("top:4800px");
    expect(html).toContain("width:640px");
    expect(html).toContain("height:720px");
    expect(html).not.toContain("height:12000px");
    expect(html).toContain('class="overflow-hidden absolute"');
  });

  it("keeps empty and unsupported operation sets inactive", () => {
    expect(isStudioWebGpuCanvasActive([])).toBe(false);
    expect(isStudioWebGpuCanvasActive([supportedStroke])).toBe(true);
    expect(isStudioWebGpuCanvasActive([{
      ...supportedStroke,
      points: [10, 10, Number.NaN, 40],
    }])).toBe(false);

    const emptyHtml = renderToStaticMarkup(
      <StudioWebGpuCanvas width={800} height={1_200} frameAuthorized />
    );
    expect(emptyHtml).toContain('data-studio-gpu-active="false"');
    expect(emptyHtml).toContain("invisible");
  });

  it("routes inactive frames only to suspension and warms the engine on the first valid frame", () => {
    const engine = {
      suspend: vi.fn(),
      render: vi.fn(),
    };
    const syncViewport = vi.fn();
    const requestInitialization = vi.fn();

    expect(routeStudioWebGpuCanvasRequest({
      engine,
      strokes: [],
      requestId: "frame:empty",
      syncViewport,
      requestInitialization,
    })).toBe("suspended");
    expect(engine.suspend).toHaveBeenCalledWith("frame:empty");
    expect(engine.render).not.toHaveBeenCalled();
    expect(syncViewport).not.toHaveBeenCalled();
    expect(requestInitialization).not.toHaveBeenCalled();

    expect(routeStudioWebGpuCanvasRequest({
      engine,
      strokes: [supportedStroke],
      requestId: "frame:active",
      syncViewport,
      requestInitialization,
    })).toBe("active");
    expect(syncViewport).toHaveBeenCalledTimes(1);
    expect(engine.render).toHaveBeenCalledWith([supportedStroke], "frame:active");
    expect(requestInitialization).toHaveBeenCalledTimes(1);
  });

  it("exposes allocation/reuse metrics imperatively without adding render subscriptions", () => {
    expect(webGpuCanvasSource).toContain(
      "readonly getPerformanceMetrics: () => StudioGpuPerformanceMetrics",
    );
    expect(webGpuCanvasSource).toContain(
      "engineRef.current?.getPerformanceMetrics() ?? EMPTY_PERFORMANCE_METRICS",
    );
    expect(webGpuCanvasSource).not.toContain("setPerformanceMetrics");
  });
});
