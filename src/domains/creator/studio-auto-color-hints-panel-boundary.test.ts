/**
 * Structural boundary: auto-color hints panel is exportable glue, not a StudioPage rewrite.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { planStudioAutoColorHints } from "./studio-auto-color-hints";
import {
  createStudioAutoColorHintsDemoRequest,
  planStudioAutoColorHintsDemo,
  summarizeStudioAutoColorHintPlan,
} from "./studio-auto-color-hints-summary";
import { StudioAutoColorHintsPanel } from "./StudioAutoColorHintsPanel";

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("studio auto-color hints panel export boundary", () => {
  it("exports panel + pure planner + Korean summary helpers", () => {
    expect(typeof StudioAutoColorHintsPanel).toBe("function");
    expect(typeof planStudioAutoColorHints).toBe("function");
    expect(typeof createStudioAutoColorHintsDemoRequest).toBe("function");
    expect(typeof planStudioAutoColorHintsDemo).toBe("function");
    expect(typeof summarizeStudioAutoColorHintPlan).toBe("function");
  });

  it("demo plan integrates pure planner without worker or page mutation", () => {
    const plan = planStudioAutoColorHintsDemo();
    const summary = summarizeStudioAutoColorHintPlan(plan);
    expect(plan.engine).toBe("connected-region-hints");
    expect(summary.regionCount).toBe(plan.diagnostics.componentCount);
    expect(summary.copyText).toContain("계획");
    expect(summary.copyText).toContain("고급 채우기");
  });

  it("keeps StudioPage free of auto-color panel surgery and mounts via inspector + lazy-ui", () => {
    const page = readSource("./StudioPage.tsx");
    const inspector = readSource("./StudioInspectorAside.tsx");
    const lazyUi = readSource("./studio-page-lazy-ui.ts");
    const panel = readSource("./StudioAutoColorHintsPanel.tsx");

    // Page must not grow a binary rewrite for this thin path.
    expect(page).not.toContain("StudioAutoColorHintsPanel");
    expect(page).not.toContain("planStudioAutoColorHints(");
    expect(page).not.toContain("runStudioAutoColorHintsWorker");

    // Panel is a leaf.
    expect(panel).not.toContain("./StudioPage");
    expect(panel).not.toContain("applyAdvancedFillPreview");
    expect(panel).toContain('data-studio-auto-color-hints-panel="true"');

    // Product path: lazy-ui registers the panel; inspector fill-tab mounts it (demo fixture).
    expect(lazyUi).toContain('import("./StudioAutoColorHintsPanel")');
    expect(lazyUi).toMatch(/const StudioAutoColorHintsPanel = lazyRetry\(/u);
    expect(lazyUi).toContain("StudioAutoColorHintsPanel,");
    expect(inspector).toContain('StudioAutoColorHintsPanel,');
    expect(inspector).toContain('from "./studio-page-lazy-ui"');
    expect(inspector).toContain("<StudioAutoColorHintsPanel");
    // Guard against a second heavy page-level glue site.
    expect(inspector.match(/<StudioAutoColorHintsPanel\b/gu)).toHaveLength(1);
  });
});
