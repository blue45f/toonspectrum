import { describe, expect, it } from "vitest";

import { createBrushQualityPolicy, normalizeBrushQualityPolicy } from "./brush-studio-v5-quality";
import {
  brushRuntimeCapabilityFingerprint,
  compileBrushRuntimeProgram,
  createCertifiedBrushRuntimeCapabilities,
} from "./brush-studio-v5-runtime-compiler";
import {
  BRUSH_STUDIO_V5_BENCHMARK_SCHEMA_VERSION,
  brushRuntimeProviderEvidence,
  type BrushRuntimeBenchmarkReceipt,
  type BrushRuntimeCapabilities,
} from "./brush-studio-v5-runtime-types";

function benchmark(capabilities: BrushRuntimeCapabilities): BrushRuntimeBenchmarkReceipt {
  return {
    schemaVersion: BRUSH_STUDIO_V5_BENCHMARK_SCHEMA_VERSION,
    measuredAt: "2026-09-09T00:00:00.000Z",
    capabilityFingerprint: brushRuntimeCapabilityFingerprint(capabilities),
    iterations: 7,
    cpuDabMillionMarksPerSecond: 24,
    eventLoopP50Ms: 0.6,
    eventLoopP95Ms: 1.8,
    webgpuDispatchP50Ms: 0.45,
    webgpuDispatchP95Ms: 0.9,
    webgpuWorkItems: 262_144,
    checksum: 0x12345678,
    stable: true,
  };
}

function compileProduct(overrides: Parameters<typeof normalizeBrushQualityPolicy>[0]) {
  const capabilities = createCertifiedBrushRuntimeCapabilities();
  return compileBrushRuntimeProgram(normalizeBrushQualityPolicy(overrides), {
    capabilities,
    benchmark: benchmark(capabilities),
    strictProduct: true,
  });
}

describe("Brush Studio V5 runtime certification", () => {
  it("isolates predicted samples from every canonical pass", () => {
    const capabilities = createCertifiedBrushRuntimeCapabilities();
    const program = compileBrushRuntimeProgram(createBrushQualityPolicy(), {
      capabilities,
      benchmark: benchmark(capabilities),
    });
    expect(program.fields.find((field) => field.id === "samples.predicted")?.canonical).toBe(false);
    expect(program.passes.some((pass) => pass.acceptsPredicted)).toBe(true);
    expect(program.passes.filter((pass) => pass.canonical).every((pass) => !pass.acceptsPredicted && !pass.reads.includes("samples.predicted"))).toBe(true);
    expect(program.gates.map((entry) => entry.id).some((id) => id.startsWith("prediction-leak"))).toBe(false);
  });

  it("compiles Living Ink into explicit mobile/fixed, wet, velocity and pressure fields", () => {
    const base = createBrushQualityPolicy();
    const program = compileProduct({
      ...base,
      simulation: { ...base.simulation, physics: ["porous-paper", "wet-flow"], pressureIterations: 22 },
      pigment: { ...base.pigment, provider: "inkwash-density" },
      providers: ["native-webgpu", "inkwash"],
    });
    const fieldIds = program.fields.map((field) => field.id);
    expect(fieldIds).toEqual(expect.arrayContaining(["pigment.mobile", "pigment.fixed", "wetness", "velocity", "pressure", "divergence", "curl"]));
    const pressurePass = program.passes.find((pass) => pass.id === "wet.pressure-jacobi");
    expect(pressurePass?.repeat).toBe(22);
    expect(program.passes.find((pass) => pass.id === "wet.transport")?.haloPx).toBe(3);
    expect(program.gates.filter((entry) => entry.severity === "error")).toEqual([]);
  });

  it("fails closed when a descriptor-only pigment provider is selected", () => {
    const base = createBrushQualityPolicy();
    const program = compileProduct({
      ...base,
      pigment: { ...base.pigment, provider: "open-km", spectralSamples: 38 },
      providers: ["native-webgpu", "open-km"],
    });
    expect(program.certification).toBe("blocked");
    expect(program.gates.map((entry) => entry.id)).toContain("provider-unwired:open-km");
    expect(program.providers.find((entry) => entry.id === "open-km")?.productKernel).toBe(false);
  });

  it("requires Mixbox distinctiveness approval even before provider wiring", () => {
    const base = createBrushQualityPolicy();
    const program = compileProduct({
      ...base,
      pigment: { ...base.pigment, provider: "mixbox", allowMixboxWhenDistinct: false },
      providers: ["native-webgpu", "mixbox"],
    });
    expect(program.gates.map((entry) => entry.id)).toEqual(expect.arrayContaining([
      "provider-unwired:mixbox",
      "mixbox-distinctness",
    ]));
  });

  it("keeps p5.brush settled-only and blocks it without WebGL2", () => {
    const base = createBrushQualityPolicy();
    const capabilities = createCertifiedBrushRuntimeCapabilities({ webgl2: false });
    const program = compileBrushRuntimeProgram(normalizeBrushQualityPolicy({
      ...base,
      pattern: { ...base.pattern, grammar: "flow-field", motif: "leaf", deterministic: true },
      providers: ["native-webgpu", "p5-brush"],
    }), {
      capabilities,
      benchmark: benchmark(capabilities),
    });
    expect(program.passes.filter((pass) => pass.provider === "p5-brush").every((pass) => pass.phase !== "live")).toBe(true);
    expect(program.gates.map((entry) => entry.id)).toContain("capability:p5-brush:webgl2");
  });

  it("allocates more memory only when the active tile budget grows", () => {
    const capabilities = createCertifiedBrushRuntimeCapabilities();
    const receipt = benchmark(capabilities);
    const base = createBrushQualityPolicy();
    const policy = normalizeBrushQualityPolicy({
      ...base,
      simulation: { ...base.simulation, physics: ["wet-flow", "height-field"] },
      pigment: { ...base.pigment, provider: "inkwash-density" },
      providers: ["native-webgpu", "inkwash"],
    });
    const small = compileBrushRuntimeProgram(policy, { capabilities, benchmark: receipt, activeTileCount: 16 });
    const large = compileBrushRuntimeProgram(policy, { capabilities, benchmark: receipt, activeTileCount: 128 });
    expect(large.budget.estimatedMemoryMb).toBeGreaterThan(small.budget.estimatedMemoryMb);
    expect(large.tilePlan.activeTileCount).toBe(128);
    expect(small.tilePlan.activeTileCount).toBe(16);
  });

  it("derives pass dependencies from field hazards without dangling references", () => {
    const capabilities = createCertifiedBrushRuntimeCapabilities();
    const program = compileBrushRuntimeProgram(createBrushQualityPolicy(), {
      capabilities,
      benchmark: benchmark(capabilities),
    });
    const passIds = new Set(program.passes.map((pass) => pass.id));
    expect(program.passes.flatMap((pass) => pass.dependsOn).every((id) => passIds.has(id))).toBe(true);
    expect(program.gates.map((entry) => entry.id).some((id) => id.startsWith("missing-dependency"))).toBe(false);
    expect(program.gates.map((entry) => entry.id).some((id) => id.startsWith("missing-field"))).toBe(false);
  });

  it("creates explicit WebGPU fusion groups for safe consecutive passes", () => {
    const capabilities = createCertifiedBrushRuntimeCapabilities();
    const program = compileBrushRuntimeProgram(createBrushQualityPolicy(), {
      capabilities,
      benchmark: benchmark(capabilities),
    });
    expect(program.fusedGroups.some((group) => group.passIds.length > 1)).toBe(true);
    expect(program.fusedGroups.flatMap((group) => group.passIds).every((id) => program.passes.some((pass) => pass.id === id))).toBe(true);
  });

  it("records real repository readiness instead of treating every option as implemented", () => {
    expect(brushRuntimeProviderEvidence("native-webgpu").readiness).toBe("wired-product");
    expect(brushRuntimeProviderEvidence("inkwash").readiness).toBe("wired-product");
    expect(brushRuntimeProviderEvidence("hokusai").readiness).toBe("wired-conditional");
    expect(brushRuntimeProviderEvidence("libmypaint").readiness).toBe("bridge-ready");
    expect(brushRuntimeProviderEvidence("spectral").readiness).toBe("descriptor-only");
    expect(brushRuntimeProviderEvidence("pigment-painter").productKernel).toBe(false);
  });
});
