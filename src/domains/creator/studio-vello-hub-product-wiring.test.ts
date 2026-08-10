import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const viewportSource = readFileSync(
  new URL("./StudioCanvasViewport.tsx", import.meta.url),
  "utf8",
);
const canvasTargetSource = readFileSync(
  new URL("./studio-vello-hub-canvas-target.ts", import.meta.url),
  "utf8",
);
const verifierSource = readFileSync(
  new URL("../../../scripts/verify-studio-vello-candidate.mts", import.meta.url),
  "utf8",
);

describe("VelloHub /studio product wiring", () => {
  it("mounts the hub from the real StudioCanvasViewport call site", () => {
    expect(viewportSource).toContain(
      'import {\n  StudioVelloHubSurface,',
    );
    expect(viewportSource).toContain("<StudioVelloHubSurface");
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
    expect(canvasTargetSource).toContain('secondary.style.display = "none"');
    expect(canvasTargetSource).toContain("holdLastGood(reason)");
    expect(canvasTargetSource).not.toContain("getImageData(");
    expect(canvasTargetSource).not.toContain("readPixels");
  });

  it("does not grant Vello document or pointer authority", () => {
    expect(canvasTargetSource).toContain('canvas.style.pointerEvents = "none"');
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
