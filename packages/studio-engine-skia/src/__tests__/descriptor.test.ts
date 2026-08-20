import {
  providerDescriptorSchema,
  SKIA_CPU_REFERENCE_EXECUTION,
  SKIA_GPU_EXECUTION,
} from "@toonspectrum/studio-engine-registry";
import { describe, expect, it } from "vitest";

import {
  canvasKitCpuReferenceProviderDescriptor,
  canvasKitGpuProviderDescriptor,
  canvasKitProviderDescriptor,
  skiaExecutionContractByProviderId,
  skiaGraphiteWebgpuProviderDescriptor,
} from "../descriptor";

/**
 * V13 §2.6 / V19 §3.2 role split: the CPU raster lane (render.ts,
 * MakeSurface + readPixels) is reference/export/golden/recovery scope and must
 * never claim interactive primary-surface ownership; the interactive live role
 * is the skia-canvaskit-gpu ImageBitmap island. These tests pin the honesty
 * contract as data — no CanvasKit wasm load required.
 */

const ALL_DESCRIPTORS = [
  canvasKitProviderDescriptor,
  canvasKitGpuProviderDescriptor,
  canvasKitCpuReferenceProviderDescriptor,
  skiaGraphiteWebgpuProviderDescriptor,
] as const;

describe("descriptor id stability", () => {
  it("keeps the ids other modules bind to (asset metadata fallback, vello fallbackProviderId, gpu island)", () => {
    expect(ALL_DESCRIPTORS.map((descriptor) => descriptor.id)).toEqual([
      "skia-canvaskit",
      "skia-canvaskit-gpu",
      "skia-canvaskit-cpu-reference",
      "skia-graphite-webgpu",
    ]);
  });

  it("every descriptor round-trips the registry schema", () => {
    for (const descriptor of ALL_DESCRIPTORS) {
      expect(providerDescriptorSchema.parse(descriptor)).toEqual(descriptor);
    }
  });
});

describe("CPU reference role (skia-canvaskit / skia-canvaskit-cpu-reference)", () => {
  it("the CPU raster lane no longer claims surface.primary or any surface ownership", () => {
    for (const descriptor of [
      canvasKitProviderDescriptor,
      canvasKitCpuReferenceProviderDescriptor,
    ]) {
      const surfaceClaims = descriptor.capabilities.filter((capability) =>
        capability.startsWith("surface."),
      );
      expect(surfaceClaims, `${descriptor.id} surface claims`).toEqual([]);
    }
  });

  it("still declares exactly what render.ts implements (render.* + export.png)", () => {
    expect(canvasKitProviderDescriptor.capabilities).toEqual([
      "render.vector.fill",
      "render.vector.stroke",
      "render.vector.gradient",
      "render.vector.gradient.sweep",
      "render.group.opacity",
      "render.group.clip",
      "render.blend.multiply",
      "render.blend.screen",
      "render.blend.darken",
      "render.blend.lighten",
      "render.text.paragraph",
      "export.png",
    ]);
  });

  it("the cpu-reference alias shares the base capability set at reference maturity/quality", () => {
    expect(canvasKitCpuReferenceProviderDescriptor.capabilities).toEqual(
      canvasKitProviderDescriptor.capabilities,
    );
    expect(canvasKitCpuReferenceProviderDescriptor.maturity).toBe("reference-only");
    expect(canvasKitCpuReferenceProviderDescriptor.previewQuality).toBe("reference");
    expect(canvasKitCpuReferenceProviderDescriptor.finalQuality).toBe("reference");
  });

  it("tolerance determinism forbids the export.deterministic claim (that baseline is vello-cpu)", () => {
    for (const descriptor of [
      canvasKitProviderDescriptor,
      canvasKitCpuReferenceProviderDescriptor,
    ]) {
      expect(descriptor.determinism).toBe("tolerance");
      expect(descriptor.capabilities).not.toContain("export.deterministic");
    }
  });

  it("documents the readPixels reference scope in limitations", () => {
    const limitations = canvasKitProviderDescriptor.limitations.join("\n");
    expect(limitations).toMatch(/readPixels/);
    expect(limitations).toMatch(/never the interactive visible frame/);
  });
});

describe("live role (skia-canvaskit-gpu island)", () => {
  it("the interactive island keeps its island-surface claim and never claims surface.primary", () => {
    expect(canvasKitGpuProviderDescriptor.capabilities).toContain(
      "surface.island.skia-complete",
    );
    expect(canvasKitGpuProviderDescriptor.capabilities).not.toContain("surface.primary");
  });

  it("the island falls back to the CPU reference lane by id", () => {
    expect(canvasKitGpuProviderDescriptor.fallbackProviderId).toBe("skia-canvaskit");
  });

  it("the Graphite challenger stays experimental and falls back to the WebGL island", () => {
    expect(skiaGraphiteWebgpuProviderDescriptor.maturity).toBe("experimental");
    expect(skiaGraphiteWebgpuProviderDescriptor.fallbackProviderId).toBe(
      "skia-canvaskit-gpu",
    );
  });
});

describe("execution contracts (V13 §5.1 registry shape, no parallel schema)", () => {
  it("binds the CPU lanes to the registry's cpu/pixels contract", () => {
    expect(skiaExecutionContractByProviderId["skia-canvaskit"]).toBe(
      SKIA_CPU_REFERENCE_EXECUTION,
    );
    expect(skiaExecutionContractByProviderId["skia-canvaskit-cpu-reference"]).toBe(
      SKIA_CPU_REFERENCE_EXECUTION,
    );
    expect(SKIA_CPU_REFERENCE_EXECUTION).toMatchObject({
      accelerator: "cpu",
      output: "pixels",
      thread: "worker",
    });
  });

  it("binds the live island to the registry's webgl/image-bitmap contract (no pixel readback)", () => {
    expect(skiaExecutionContractByProviderId["skia-canvaskit-gpu"]).toBe(
      SKIA_GPU_EXECUTION,
    );
    expect(SKIA_GPU_EXECUTION.output).toBe("image-bitmap");
    expect(SKIA_GPU_EXECUTION.output).not.toBe("pixels");
  });

  it("declares no contract for the unwired Graphite challenger (no placeholder claims)", () => {
    expect(skiaExecutionContractByProviderId).not.toHaveProperty("skia-graphite-webgpu");
  });

  it("fail-closed honesty rule: a pixels-output contract forbids every surface claim", () => {
    for (const descriptor of ALL_DESCRIPTORS) {
      const contract = skiaExecutionContractByProviderId[descriptor.id];
      if (contract?.output !== "pixels") continue;
      const surfaceClaims = descriptor.capabilities.filter((capability) =>
        capability.startsWith("surface."),
      );
      expect(surfaceClaims, `${descriptor.id} claims a surface with pixels output`).toEqual(
        [],
      );
    }
  });
});
