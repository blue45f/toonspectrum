import { describe, expect, it } from "vitest";

import {
  STUDIO_DRAWING_LIBRARY_STRATEGIES,
  STUDIO_DRAWING_LIBRARY_STRATEGY_VERSION,
  listStudioDrawingLibraryStrategiesByLayer,
  resolveStudioDrawingLibraryStrategy,
  validateStudioDrawingLibraryStrategies,
} from "./studio-drawing-library-strategy";

describe("studio drawing library strategy", () => {
  it("records exactly ten bounded specialist decisions without canonical authority", () => {
    expect(STUDIO_DRAWING_LIBRARY_STRATEGIES).toHaveLength(10);
    expect(
      new Set(STUDIO_DRAWING_LIBRARY_STRATEGIES.map(({ id }) => id)).size
    ).toBe(10);
    for (const entry of STUDIO_DRAWING_LIBRARY_STRATEGIES) {
      expect(entry.registryVersion).toBe(
        STUDIO_DRAWING_LIBRARY_STRATEGY_VERSION
      );
      expect(entry.canonicalAuthority).toBe(false);
      expect(entry.license.length).toBeGreaterThan(0);
      expect(entry.maintenanceNote.length).toBeGreaterThan(0);
      expect(entry.riskNotes.length).toBeGreaterThan(0);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.riskNotes)).toBe(true);
    }
    expect(validateStudioDrawingLibraryStrategies()).toEqual({
      valid: true,
      duplicateIds: [],
      conflictingCanonicalAuthorityIds: [],
    });
  });

  it("encodes the approved runtime, isolated, benchmark and rejection roles", () => {
    expect(resolveStudioDrawingLibraryStrategy("perfect-freehand")).toMatchObject({
      productLayer: "live-stroke-geometry",
      decision: "runtime-pressure-outline",
      runtimeInstallation: "installed-active",
      license: "MIT",
    });
    expect(resolveStudioDrawingLibraryStrategy("lazy-brush")).toMatchObject({
      productLayer: "input-stabilization",
      decision: "opt-in-input-stabilizer",
      runtimeInstallation: "installed-opt-in",
    });
    expect(resolveStudioDrawingLibraryStrategy("roughjs")).toMatchObject({
      productLayer: "rough-shape-rendering",
      decision: "runtime-rough-shape-renderer",
    });
    const p5Brush = resolveStudioDrawingLibraryStrategy("p5-brush");
    expect(p5Brush).toMatchObject({
      productLayer: "settled-procedural-raster",
      decision: "isolated-settled-only-provider",
      runtimeInstallation: "installed-isolated-provider",
    });
    expect(p5Brush?.maintenanceNote).toContain("2.2.1-adapter.3");
    expect(p5Brush?.maintenanceNote).toContain("watercolor fills");
    expect(p5Brush?.maintenanceNote).toContain("flat washes");
    expect(p5Brush?.riskNotes).toContain(
      "Composited fills use a stricter eight-frame resident-memory admission budget.",
    );
    expect(resolveStudioDrawingLibraryStrategy("konva")).toMatchObject({
      productLayer: "object-selection-overlay",
      decision: "runtime-object-selection-overlay",
    });
    expect(resolveStudioDrawingLibraryStrategy("paper")).toMatchObject({
      productLayer: "vector-geometry",
      decision: "isolated-vector-geometry-provider",
    });
    expect(resolveStudioDrawingLibraryStrategy("fabric")).toMatchObject({
      productLayer: "scene-model",
      decision: "rejected-duplicate-scene-model",
      runtimeInstallation: "not-installed-rejected",
    });
  });

  it("keeps Signature Pad, Atrament and Croquis as non-installed benchmark oracles", () => {
    const benchmarkIds = listStudioDrawingLibraryStrategiesByLayer(
      "quality-benchmark"
    ).map(({ id }) => id);
    expect(benchmarkIds).toEqual(["signature-pad", "atrament", "croquis"]);
    for (const id of benchmarkIds) {
      expect(resolveStudioDrawingLibraryStrategy(id)).toMatchObject({
        decision: "benchmark-oracle-only",
        runtimeInstallation: "not-installed-benchmark-only",
        canonicalAuthority: false,
      });
    }
    expect(resolveStudioDrawingLibraryStrategy("croquis")?.packageName).toBe(
      "croquis.js"
    );
  });

  it("resolves by id, lists immutable layer snapshots and rejects unknown ids", () => {
    expect(resolveStudioDrawingLibraryStrategy("paper")?.packageName).toBe(
      "paper"
    );
    expect(resolveStudioDrawingLibraryStrategy("missing")).toBeNull();
    expect(resolveStudioDrawingLibraryStrategy(null)).toBeNull();

    const layer = listStudioDrawingLibraryStrategiesByLayer(
      "input-stabilization"
    );
    expect(layer.map(({ id }) => id)).toEqual(["lazy-brush"]);
    expect(Object.isFrozen(layer)).toBe(true);
  });

  it("reports duplicate ids and any attempted external canonical authority", () => {
    const validation = validateStudioDrawingLibraryStrategies([
      { id: "perfect-freehand", canonicalAuthority: false },
      { id: "perfect-freehand", canonicalAuthority: false },
      { id: "rogue-scene-engine", canonicalAuthority: true },
      { id: "unknown-authority", canonicalAuthority: "yes" },
    ]);
    expect(validation).toEqual({
      valid: false,
      duplicateIds: ["perfect-freehand"],
      conflictingCanonicalAuthorityIds: [
        "rogue-scene-engine",
        "unknown-authority",
      ],
    });
  });
});
