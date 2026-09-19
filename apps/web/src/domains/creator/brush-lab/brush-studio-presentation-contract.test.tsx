// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { BRUSH_STUDIO_V6_NODES, BRUSH_STUDIO_V6_RECIPES, brushStudioV6Node } from "./brush-studio-v6-engine";
import { planBrushStudioV6ProviderRuntime } from "./brush-studio-v6-provider-runtime";
import { StudioBrushV6ProviderPlan } from "./StudioBrushV6ProviderPlan";
import { StudioPigmentComparison } from "./pigment/StudioPigmentComparison";

afterEach(cleanup);

describe("version-free presentation with stable execution identity", () => {
  it("shows provider names without exposing or mutating revision identifiers", () => {
    const plan = planBrushStudioV6ProviderRuntime([
      brushStudioV6Node("pigment-spectral-js"), brushStudioV6Node("pigment-mixbox"),
    ]);
    const before = JSON.stringify(plan);
    expect(plan.valid).toBe(true);
    expect(plan.bindings).toEqual(expect.arrayContaining([
      expect.objectContaining({ providerId: "spectral-js-v3", version: "3.0.0" }),
      expect.objectContaining({ providerId: "mixbox-js-v2", version: "2.0.0" }),
    ]));
    const { container } = render(<StudioBrushV6ProviderPlan plan={plan} />);
    expect(screen.getByRole("heading", { name: "Spectral.js · 분광 K/S" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Mixbox" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/spectral-js-v3|mixbox-js-v2|3\.0\.0|2\.0\.0/u);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it("keeps named library selection while hiding package versions", () => {
    const { container } = render(<StudioPigmentComparison primary="#002185" secondary="#fcd200"
      node="pigment-spectral-js" secondaryActive onSelect={() => undefined} />);
    expect(screen.getByRole("button", { name: "Spectral.js 선택" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Mixbox 선택" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Spectral\.js 3|Mixbox 2/u);
  });

  it("uses material families rather than implementation generations", () => {
    for (const recipe of BRUSH_STUDIO_V6_RECIPES) {
      expect(recipe.group).not.toMatch(/\bV\d+(?:\.\d+)*\b/u);
    }
    for (const node of BRUSH_STUDIO_V6_NODES) {
      expect(node.description).not.toMatch(/\bV[567]\b/u);
    }
    // Historical IDs remain resolvable; presentation changes do not migrate formats.
    expect(BRUSH_STUDIO_V6_RECIPES.some((recipe) => recipe.id === "v7-washi-sumi-fiber")).toBe(true);
  });
});
