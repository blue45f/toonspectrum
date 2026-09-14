import { describe, expect, it } from "vitest";

import {
  STUDIO_IMMERSIVE_STAGES,
  STUDIO_IMMERSIVE_STARTER_KITS,
  STUDIO_IMMERSIVE_WORKFLOWS,
  auditStudioImmersiveCatalog,
} from "./studio-immersive-workflows";

describe("Studio immersive production catalog", () => {
  it("keeps every workflow and starter kit internally valid", () => {
    expect(auditStudioImmersiveCatalog()).toEqual([]);
    expect(STUDIO_IMMERSIVE_WORKFLOWS.length).toBeGreaterThanOrEqual(9);
    expect(STUDIO_IMMERSIVE_STARTER_KITS.length).toBeGreaterThanOrEqual(6);
  });

  it("covers the complete production flow with real internal destinations", () => {
    const stages = new Set(STUDIO_IMMERSIVE_WORKFLOWS.map((workflow) => workflow.stage));
    expect(stages).toEqual(new Set(STUDIO_IMMERSIVE_STAGES.map((stage) => stage.id)));
    for (const workflow of STUDIO_IMMERSIVE_WORKFLOWS) {
      expect(workflow.href).toMatch(/^\//u);
      expect(workflow.href).not.toContain("TODO");
      expect(workflow.titleKo.length).toBeGreaterThan(2);
      expect(workflow.descriptionEn.length).toBeGreaterThan(12);
    }
  });

  it("preserves a standard 2D path alongside AR and VR destinations", () => {
    const ids = new Set(STUDIO_IMMERSIVE_WORKFLOWS.map((workflow) => workflow.id));
    expect(ids.has("expressive-ink")).toBe(true);
    expect(ids.has("ar-proof")).toBe(true);
    expect(ids.has("vr-reader")).toBe(true);
    expect(ids.has("delivery")).toBe(true);
  });
});
