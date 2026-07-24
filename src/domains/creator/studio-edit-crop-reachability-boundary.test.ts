import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

/**
 * Reachability contract (2026-07-24): Edit → 레이어 자르기 must stay aligned with the
 * left-rail Crop button and keyboard C, which both route through ensurePixelToolTarget
 * (sole editable image auto-select / arm-anytime). Requiring selectedImage alone left the
 * menu item hard-disabled while the rail/keyboard still worked.
 */
describe("Studio edit crop reachability boundary", () => {
  it("derives cropLayerDisabled from pixelToolTargetAvailable, not selectedImage alone", () => {
    const controls = source("./studio-edit-controls.ts");
    expect(controls).toContain("pixelToolTargetAvailable: boolean");
    expect(controls).toContain(
      "cropLayerDisabled: input.mutationLocked || !input.pixelToolTargetAvailable",
    );
    expect(controls).not.toMatch(
      /cropLayerDisabled:\s*!input\.selectedImage\s*\|\|\s*input\.selectedContentMutationLocked/u,
    );
  });

  it("wires StudioPage ensurePixelToolTarget availability into the edit menu matrix", () => {
    const page = source("./StudioPage.tsx");
    expect(page).toContain("function ensurePixelToolTarget(toolLabel: string)");
    expect(page).toContain("function openSelectedLayerCrop()");
    expect(page).toContain('const target = ensurePixelToolTarget("레이어 자르기")');
    expect(page).toContain("pixelToolTargetAvailable,");
    expect(page).toContain("resolveStudioEditAvailability({");
    // The availability object must pass the rail gate rather than re-deriving selectedImage.
    const availabilityStart = page.indexOf("resolveStudioEditAvailability({");
    const availabilityEnd = page.indexOf("});", availabilityStart);
    const availability = page.slice(availabilityStart, availabilityEnd);
    expect(availability).toContain("pixelToolTargetAvailable");
    expect(availability).toContain("selectedImage: selected?.type === \"image\"");
  });

  it("keeps the left rail Crop button on the same availability gate", () => {
    const rail = source("./StudioLeftToolRail.tsx");
    expect(rail).toContain("disabled={!pixelToolTargetAvailable}");
    expect(rail).toContain("onClick={openSelectedLayerCrop}");
  });
});
