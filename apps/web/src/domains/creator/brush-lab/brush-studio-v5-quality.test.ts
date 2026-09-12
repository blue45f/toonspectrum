import { describe, expect, it } from "vitest";

import {
  BRUSH_QUALITY_CATALOG,
  BRUSH_QUALITY_PROVIDERS,
  analyzeBrushQualityPolicy,
  compileBrushQualityExecutionPlan,
  createBrushQualityPolicy,
  normalizeBrushQualityPolicy,
  optimizeBrushQualityPolicy,
  toggleBrushQualityPhysics,
} from "./brush-studio-v5-quality";

describe("Brush Studio quality authority", () => {
  it("ships the same 48 materially distinct product brushes as the normal picker", () => {
    expect(BRUSH_QUALITY_CATALOG).toHaveLength(48);
    expect(new Set(BRUSH_QUALITY_CATALOG.map((entry) => entry.id)).size).toBe(
      48,
    );
    expect(
      new Set(BRUSH_QUALITY_CATALOG.map((entry) => entry.group)).size,
    ).toBe(8);
    expect(
      BRUSH_QUALITY_CATALOG.filter((entry) => entry.quick).length,
    ).toBeGreaterThanOrEqual(20);
  });

  it("registers every specialist provider once", () => {
    expect(BRUSH_QUALITY_PROVIDERS).toHaveLength(18);
    expect(
      new Set(BRUSH_QUALITY_PROVIDERS.map((entry) => entry.id)).size,
    ).toBe(18);
    expect(
      BRUSH_QUALITY_PROVIDERS.some((entry) => entry.id === "inkwash"),
    ).toBe(true);
    expect(
      BRUSH_QUALITY_PROVIDERS.some(
        (entry) => entry.id === "pigment-painter",
      ),
    ).toBe(true);
    expect(
      BRUSH_QUALITY_PROVIDERS.some((entry) => entry.id === "open-km"),
    ).toBe(true);
  });

  it("keeps predicted input outside canonical execution", () => {
    const plan = compileBrushQualityExecutionPlan(createBrushQualityPolicy());
    const preview = plan.filter(
      (pass) => pass.phase === "hover" || pass.phase === "preview",
    );
    expect(preview.length).toBeGreaterThan(0);
    expect(preview.every((pass) => pass.canonical === false)).toBe(true);
    expect(
      plan
        .filter((pass) => pass.phase === "commit")
        .every((pass) => pass.canonical),
    ).toBe(true);
  });

  it("fails closed when prediction is allowed to mutate canonical state", () => {
    const base = createBrushQualityPolicy();
    const analysis = analyzeBrushQualityPolicy(
      normalizeBrushQualityPolicy({
        ...base,
        input: { ...base.input, predictionPreviewOnly: false },
      }),
    );
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.map((entry) => entry.id)).toContain(
      "prediction-authority",
    );
  });

  it("adds the Inkwash authority for wet flow", () => {
    const wet = toggleBrushQualityPhysics(
      createBrushQualityPolicy(),
      "wet-flow",
    );
    const optimized = optimizeBrushQualityPolicy(wet);
    expect(optimized.providers).toContain("inkwash");
    expect(
      compileBrushQualityExecutionPlan(optimized).some(
        (pass) => pass.provider === "inkwash" && pass.phase === "settle",
      ),
    ).toBe(true);
  });

  it("gates Mixbox until a distinctiveness receipt is approved", () => {
    const base = createBrushQualityPolicy();
    const blocked = normalizeBrushQualityPolicy({
      ...base,
      pigment: {
        ...base.pigment,
        provider: "mixbox",
        allowMixboxWhenDistinct: false,
      },
    });
    expect(
      analyzeBrushQualityPolicy(blocked).issues.map((entry) => entry.id),
    ).toContain("mixbox-gate");

    const approved = normalizeBrushQualityPolicy({
      ...blocked,
      pigment: {
        ...blocked.pigment,
        allowMixboxWhenDistinct: true,
      },
    });
    const analysis = analyzeBrushQualityPolicy(approved);
    expect(analysis.issues.map((entry) => entry.id)).not.toContain(
      "mixbox-gate",
    );
    expect(
      analysis.executionPlan.some((pass) => pass.provider === "mixbox"),
    ).toBe(true);
  });

  it("requires deterministic document-space patterns", () => {
    const base = createBrushQualityPolicy();
    const policy = normalizeBrushQualityPolicy({
      ...base,
      pattern: {
        ...base.pattern,
        space: "document",
        grammar: "blue-noise",
        motif: "leaf",
        deterministic: false,
      },
    });
    const analysis = analyzeBrushQualityPolicy(policy);
    expect(analysis.valid).toBe(false);
    expect(analysis.issues.map((entry) => entry.id)).toContain(
      "pattern-determinism",
    );
  });

  it("normalizes hostile imported values", () => {
    const policy = normalizeBrushQualityPolicy({
      goal: "unknown",
      input: {
        pressureOnset: -10,
        pressureSaturation: 9,
        pressureGamma: 100,
      },
      simulation: {
        pressureIterations: 999,
        bristleStrands: -1,
        particleCount: 999999,
        physics: ["wet-flow", "unknown"],
      },
      output: { tileSize: 999, liveScale: 8, exportScale: -3 },
      providers: ["native-webgpu", "unknown", "native-webgpu"],
    });
    expect(policy.goal).toBe("balanced");
    expect(policy.input.pressureOnset).toBe(0);
    expect(policy.input.pressureSaturation).toBe(1);
    expect(policy.input.pressureGamma).toBe(3);
    expect(policy.simulation.pressureIterations).toBe(40);
    expect(policy.simulation.bristleStrands).toBe(8);
    expect(policy.simulation.particleCount).toBe(4096);
    expect(policy.simulation.physics).toEqual(["wet-flow"]);
    expect(policy.output.tileSize).toBe(128);
    expect(policy.output.liveScale).toBe(1);
    expect(policy.output.exportScale).toBe(1);
    expect(policy.providers).toEqual(["native-webgpu"]);
  });

  it("optimizes responsive quality into a bounded live budget", () => {
    const base = createBrushQualityPolicy();
    const optimized = optimizeBrushQualityPolicy(
      normalizeBrushQualityPolicy({
        ...base,
        goal: "responsive",
        simulation: {
          ...base.simulation,
          pressureIterations: 40,
          bristleStrands: 256,
          bristleContactIterations: 12,
        },
      }),
    );
    expect(optimized.output.liveScale).toBe(0.5);
    expect(optimized.simulation.pressureIterations).toBeLessThanOrEqual(12);
    expect(optimized.simulation.bristleStrands).toBeLessThanOrEqual(48);
    expect(
      optimized.simulation.bristleContactIterations,
    ).toBeLessThanOrEqual(4);
  });
});
