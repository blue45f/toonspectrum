import { describe, expect, it } from "vitest";

import { STUDIO_PRODUCTION_CATEGORIES, STUDIO_PRODUCTION_TOOLS, studioProductionTool } from "./studio-production-toolchain";
import {
  categoryEnglish,
  commercialUseLabel,
  countToolStates,
  deploymentLabel,
  maturityLabel,
  resolveStudioToolState,
  TOOL_STATE_ORDER,
} from "./studio-production-toolchain-labels";

import type { StudioToonBridgeToolProbe } from "./studio-toonbridge-client";

function probe(toolId: string, state: StudioToonBridgeToolProbe["state"]): StudioToonBridgeToolProbe {
  return { toolId, state, version: null, executable: state === "available", reason: "probe" };
}

describe("production toolchain labels", () => {
  it("gives every catalog value a readable Korean and English label", () => {
    for (const tool of STUDIO_PRODUCTION_TOOLS) {
      expect(deploymentLabel(tool.deployment).ko).not.toContain("-");
      expect(maturityLabel(tool.maturity).en.length).toBeGreaterThan(3);
      const commercial = commercialUseLabel(tool.commercialUse);
      expect(commercial.ko).not.toBe(tool.commercialUse);
    }
    for (const category of STUDIO_PRODUCTION_CATEGORIES) {
      expect(categoryEnglish(category.id, category.name)).not.toBe(category.name);
    }
    expect(commercialUseLabel("future-value")).toEqual({ ko: "future-value", en: "future-value" });
  });

  it("resolves tool state with the profile boundary before any probe", () => {
    const mixbox = studioProductionTool("mixbox");
    const tesseract = studioProductionTool("tesseract");
    const nextcloud = studioProductionTool("nextcloud");
    if (!mixbox || !tesseract || !nextcloud) throw new Error("catalog fixture missing");

    expect(resolveStudioToolState(mixbox, "open", probe("mixbox", "available"))).toBe("blocked");
    expect(resolveStudioToolState(tesseract, "open", undefined)).toBe("unchecked");
    expect(resolveStudioToolState(tesseract, "open", probe("tesseract", "missing"))).toBe("missing");
    expect(resolveStudioToolState(tesseract, "open", probe("tesseract", "available"))).toBe("available");
    expect(resolveStudioToolState(nextcloud, "open", undefined)).toBe("connector");
    expect(resolveStudioToolState(mixbox, "research-nc", undefined)).toBe("blocked");
  });

  it("counts every state even when some are absent", () => {
    expect(countToolStates(["available", "missing", "missing", "unchecked"])).toEqual({ available: 1, connector: 0, manual: 0, unchecked: 1, missing: 2, blocked: 0 });
    expect(TOOL_STATE_ORDER).toHaveLength(6);
  });
});
