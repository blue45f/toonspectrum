import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const studioPageSource = readFileSync(
  new URL("./StudioPage.tsx", import.meta.url),
  "utf8",
);
const viewportSource = readFileSync(
  new URL("./StudioCanvasViewport.tsx", import.meta.url),
  "utf8",
);
const hostSource = readFileSync(
  new URL("./StudioLiveInkHosts.tsx", import.meta.url),
  "utf8",
);
const lazyUiSource = readFileSync(
  new URL("./studio-page-lazy-ui.ts", import.meta.url),
  "utf8",
);
const overlaySource = readFileSync(
  new URL("./studio-live-wet-ink-overlay.ts", import.meta.url),
  "utf8",
);

describe("live wet-ink product boundary", () => {
  it("mounts independent active/settled native surfaces through the lazy viewport host", () => {
    expect(hostSource).toContain("StudioLiveWetInkOverlayHost");
    expect(hostSource).toContain('data-studio-live-wet-ink-active="true"');
    expect(hostSource).toContain('data-studio-live-wet-ink-settled="true"');
    expect(lazyUiSource).toContain("mod.StudioLiveWetInkOverlayHost");
    expect(viewportSource).toContain(
      "liveWetInkOverlayRenderer: import(\"./studio-live-wet-ink-overlay\")",
    );
    expect(viewportSource).toContain(
      "<StudioLiveWetInkOverlayHost",
    );
  });

  it("owns begin/append/end and every destructive pointer/page lifecycle explicitly", () => {
    expect(studioPageSource).toContain(
      "liveWetInkOverlayRendererRef.current.begin(next",
    );
    expect(studioPageSource).toContain(
      "renderer.appendFrom(next,",
    );
    expect(studioPageSource).toContain(
      "const seal = renderer.end(finalWetInkStroke",
    );
    expect(studioPageSource).toContain(
      "liveWetInkOverlayRendererRef.current.resetActive()",
    );
    expect(studioPageSource).toContain(
      "liveWetInkOverlayRendererRef.current.clear()",
    );
    expect(studioPageSource).toContain(
      "pageEpoch: currentPageId",
    );
  });

  it("uses the committed wet-ink runtime as its exact pointer-up handoff authority", () => {
    expect(overlaySource).toContain("planStudioWetInkBrushReplay");
    expect(overlaySource).toContain('phase: "live"');
    expect(overlaySource).toContain("fieldDigest: exact.value.fieldDigest");
    expect(overlaySource).toContain("revision: exact.value.revision");
    expect(overlaySource).toContain("seed: exact.value.seed");
    expect(overlaySource).toContain("consumeStudioWetInkDirtyBounds");
  });
});
