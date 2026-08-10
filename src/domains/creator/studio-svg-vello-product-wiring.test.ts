import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("/studio SVG product wiring boundary", () => {
  it("connects the live asset popover to the routed Elements preview", () => {
    const popover = read("./StudioAssetToolPopoverBody.tsx");
    const elements = read("./StudioElementsPanel.tsx");
    const preview = read("./StudioSvgAssetPreview.tsx");

    expect(popover).toContain("<StudioElementsPanel");
    expect(popover).toContain("addCatalogElement(item)");
    expect(elements).toContain("<StudioSvgAssetPreview");
    expect(elements).toContain("onPointerEnter={() => setPreviewRequested(true)}");
    expect(preview).toContain("tournament.resolve({");
    expect(preview).toContain('trust: "bundled-catalog"');
    expect(preview).toContain("data-studio-svg-preview-provider");
  });

  it("keeps the original SVG as placement authority and excludes GPU readback", () => {
    const page = read("./StudioPage.tsx");
    const elements = read("./StudioElementsPanel.tsx");
    const router = read("./studio-svg-vello-product-router.ts");

    expect(elements).toContain("onPick(item)");
    expect(elements).toContain("src: svgToDataUrl(item.svg)");
    expect(page).toContain("function addCatalogElement");
    expect(page).toContain("src: svgToDataUrl(item.svg)");
    expect(router).toContain("renderSvgToPixelsVelloCpu");
    expect(router).not.toContain("renderSvgToPixelsVelloGpu");
    expect(router).toContain("interactiveGpuReadbackBytes: 0");
  });
});
