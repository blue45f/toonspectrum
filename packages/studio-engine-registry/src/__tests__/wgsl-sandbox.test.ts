import { describe, expect, it } from "vitest";

import {
  WgslVariantAdmissionError,
  assertWgslVariantAdmitted,
  evaluateWgslVariantAdmission,
} from "../wgsl-sandbox";
import { composeWgslVariant } from "../wgsl-variants";

import type { WgslVariantAdmissionRequest } from "../wgsl-sandbox";
import type { ComposedWgslVariant } from "../wgsl-variants";

const identityLut = Object.freeze({
  r: Uint8Array.from({ length: 256 }, (_, index) => index),
  g: Uint8Array.from({ length: 256 }, (_, index) => index),
  b: Uint8Array.from({ length: 256 }, (_, index) => index),
});

const baseline = (): WgslVariantAdmissionRequest => ({
  width: 4096,
  height: 4096,
  mode: "preview",
  workingSetBudgetBytes: 256 * 1024 * 1024,
  residentVariantCount: 4,
  maxResidentVariantCount: 64,
  limits: {
    maxBufferSize: 256 * 1024 * 1024,
    maxStorageBufferBindingSize: 128 * 1024 * 1024,
    maxComputeWorkgroupSizeX: 256,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupsPerDimension: 65_535,
    maxBindingsPerBindGroup: 8,
    maxStorageBuffersPerShaderStage: 8,
  },
});

function codes(variant: ComposedWgslVariant, request = baseline()): string[] {
  return evaluateWgslVariantAdmission(variant, request).issues.map((entry) => entry.code);
}

describe("WGSL shader sandbox and device budget", () => {
  const simple = composeWgslVariant([{ op: "brightness-contrast", brightness: 0.1 }]);
  const withLut = composeWgslVariant([
    { op: "levels", lut: identityLut },
    { op: "hsl", hue: 15 },
  ]);

  it("admits a generated shader and returns an exact dispatch/memory plan", () => {
    const result = evaluateWgslVariantAdmission(withLut, baseline());
    expect(result).toMatchObject({ admitted: true, issues: [] });
    expect(result.plan).toEqual({
      pixelCount: 16_777_216,
      srcBufferBytes: 67_108_864,
      dstBufferBytes: 67_108_864,
      fixedBytes: withLut.manifest.memoryEstimate.fixedBytes,
      workingSetBytes:
        withLut.manifest.memoryEstimate.fixedBytes + 16_777_216 * 8,
      workgroupsX: 256,
      workgroupsY: 1024,
      bindingCount: 4,
      storageBufferCount: 3,
    });
  });

  it("accepts both preview and final only when the manifest points at this variant", () => {
    expect(evaluateWgslVariantAdmission(simple, baseline()).admitted).toBe(true);
    expect(evaluateWgslVariantAdmission(simple, { ...baseline(), mode: "final" }).admitted)
      .toBe(true);
    const mutated = structuredClone(simple) as unknown as {
      manifest: { variants: { preview: string } };
    };
    mutated.manifest.variants.preview = "another-variant";
    expect(codes(mutated as unknown as ComposedWgslVariant)).toContain(
      "variant-contract-mismatch",
    );
  });

  it.each([
    ["zero width", { width: 0 }],
    ["fractional height", { height: 1.5 }],
    ["negative resident count", { residentVariantCount: -1 }],
    ["zero memory budget", { workingSetBudgetBytes: 0 }],
  ])("rejects invalid request input: %s", (_label, override) => {
    expect(codes(simple, { ...baseline(), ...override })).toContain("request-invalid");
  });

  it("rejects invented or malformed device limits", () => {
    const request = baseline();
    expect(codes(simple, {
      ...request,
      limits: { ...request.limits, maxBufferSize: Number.NaN },
    })).toContain("device-limit-invalid");
  });

  it("rejects dimensions that overflow the shader's u32 pixel guard", () => {
    expect(codes(simple, { ...baseline(), width: 65_536, height: 65_536 })).toContain(
      "pixel-count-overflow",
    );
  });

  it("enforces storage binding and total working-set budgets separately", () => {
    const request = baseline();
    expect(codes(simple, {
      ...request,
      limits: { ...request.limits, maxStorageBufferBindingSize: 1024 },
    })).toContain("buffer-limit-exceeded");
    expect(codes(simple, { ...request, workingSetBudgetBytes: 1024 })).toContain(
      "working-set-budget-exceeded",
    );
  });

  it("enforces workgroup, dispatch, binding and resident-variant limits", () => {
    const request = baseline();
    expect(codes(simple, {
      ...request,
      limits: { ...request.limits, maxComputeWorkgroupSizeX: 32 },
    })).toContain("workgroup-limit-exceeded");
    expect(codes(simple, {
      ...request,
      limits: { ...request.limits, maxComputeWorkgroupsPerDimension: 4 },
    })).toContain("dispatch-limit-exceeded");
    expect(codes(withLut, {
      ...request,
      limits: { ...request.limits, maxStorageBuffersPerShaderStage: 2 },
    })).toContain("binding-limit-exceeded");
    expect(codes(simple, {
      ...request,
      residentVariantCount: request.maxResidentVariantCount,
    })).toContain("variant-budget-exceeded");
  });

  it.each(["loop", "while", "for", "textureLoad", "atomicAdd", "workgroupBarrier"])(
    "rejects forbidden plugin-style control token %s",
    (token) => {
      const mutated = { ...simple, wgsl: `${simple.wgsl}\n${token};` };
      expect(codes(mutated)).toContain("control-flow-policy-violation");
    },
  );

  it("rejects arbitrary bind groups, missing guards and extra storage writes", () => {
    expect(codes({
      ...simple,
      wgsl: `${simple.wgsl}\n@group(1) @binding(7) var<storage> rogue : array<u32>;`,
    })).toContain("bind-group-policy-violation");
    expect(codes({
      ...simple,
      wgsl: simple.wgsl.replace("if (i >= params.pixel_count) { return; }", ""),
    })).toContain("bounds-guard-missing");
    expect(codes({
      ...simple,
      wgsl: simple.wgsl.replace(
        "dst[i] = studio_repack(r, g, b, a);",
        "dst[i] = studio_repack(r, g, b, a); dst[i] = 0u;",
      ),
    })).toContain("storage-write-policy-violation");
  });

  it("fails closed with all structured reasons", () => {
    expect(() => assertWgslVariantAdmitted(simple, {
      ...baseline(),
      workingSetBudgetBytes: 1,
    })).toThrow(WgslVariantAdmissionError);
    try {
      assertWgslVariantAdmitted(simple, { ...baseline(), workingSetBudgetBytes: 1 });
    } catch (error) {
      expect((error as WgslVariantAdmissionError).issues.map((entry) => entry.code)).toContain(
        "working-set-budget-exceeded",
      );
    }
  });
});
