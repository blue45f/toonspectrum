import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readStudioCanvasViewportStack } from "../canvas/read-studio-canvas-viewport-stack";



const viewportSource = readStudioCanvasViewportStack(import.meta.url, "../canvas/");
const canvasTargetSource = readFileSync(
  new URL("./studio-vello-hub-canvas-target.ts", import.meta.url),
  "utf8",
);
const verifierSource = readFileSync(
  new URL("../../../../scripts/verify-studio-vello-candidate.mts", import.meta.url),
  "utf8",
);

describe("VelloHub /studio product wiring", () => {
  it("mounts the hub from the real StudioCanvasViewport call site", () => {
    expect(viewportSource).toContain(
      'import { StudioRenderSurface } from "../render/StudioRenderSurface"',
    );
    expect(viewportSource).toContain("<StudioRenderSurface");
    expect(viewportSource).toContain("elements={elements}");
    expect(viewportSource).toContain(
      "documentTransform={pixiSceneDocumentTransform}",
    );
    expect(viewportSource).toContain("isPenDown={readVelloHubPenDown}");
    expect(viewportSource).toContain("() => drawingRef.current !== null");
    expect(viewportSource).toContain(
      'data-studio-vello-hub-authority={velloHubAuthority.status}',
    );
  });

  it("keeps one selection-island owner and enables Pixi only on explicit fallback", () => {
    expect(viewportSource).toContain(
      '!velloHubCapability.enabled\n              || velloHubAuthority.status === "fallback"',
    );
    expect(canvasTargetSource).toContain(
      'dataset.studioVelloHubPrimary = "true"',
    );
    expect(canvasTargetSource).toContain("holdLastGood(reason)");
    expect(canvasTargetSource).not.toContain("getImageData(");
    expect(canvasTargetSource).not.toContain("readPixels");
    expect(canvasTargetSource).toContain("One visible canvas");
    expect(canvasTargetSource).toContain("studio-frame-graph-retained");
    expect(canvasTargetSource).toContain("requestAnimationFrame");
    expect(canvasTargetSource).not.toContain('style.zIndex = "6"');
  });

  it("gives FrameGraph document pixels while Konva keeps pointer routing", () => {
    expect(canvasTargetSource).toContain('canvas.style.pointerEvents = "none"');
    expect(viewportSource).toContain("data-studio-frame-graph-document");
    expect(viewportSource).toContain("frameGraphOwnsDocumentPixels");
    expect(viewportSource).toContain("<Stage");
    expect(viewportSource).toContain("onPointerDown={onStageDown}");
    expect(viewportSource).toContain("onPointerMove={onStageMove}");
    expect(viewportSource).toContain("onPointerUp={onStageUp}");
  });

  it("verifies the bounded product seam instead of enforcing blanket research-only", () => {
    expect(verifierSource).toContain("STUDIO_VELLO_HUB_PRODUCT_CAPABILITY");
    expect(verifierSource).toContain("product seam active:");
    expect(verifierSource).not.toContain(
      "Vello must remain research-only until every promotion gate passes",
    );
    expect(verifierSource).not.toContain(
      "Vello runtime activation is forbidden by the current evidence",
    );
  });
});
