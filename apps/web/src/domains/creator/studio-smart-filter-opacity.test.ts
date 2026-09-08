import { describe, expect, it } from "vitest";

import { StudioWorkAssetSmartFiltersSchema } from "./contracts/studio-work-asset-contract";
import { imageFilterCacheKey, hasActiveImageFilters } from "./render/studio-konva-filter-fields";
import { applyImageFilters, buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "./render/studio-konva-filters";
import { createStudioAdjustmentLayerDocument, serializeStudioAdjustmentLayerDocument } from "./studio-adjustment-layer-plan";
import { normalizeStudioAdjustmentStack, serializeStudioAdjustmentStack, studioAdjustmentStackSerializedByteLength, studioAdjustmentStackToFilterFields, type StudioAdjustmentEntry } from "./studio-adjustment-stack";

function stack(opacity?: number, engine: StudioAdjustmentEntry["engine"] = "invert", params: StudioAdjustmentEntry["params"] = {}) {
  return { version: 1 as const, entries: [{ id: "effect", engine, enabled: true, params, ...(opacity === undefined ? {} : { opacity }) }] };
}

function render(rgba: number[], value: ReturnType<typeof stack>) {
  const registry: KonvaLike = { Filters: {} };
  registerStudioKonvaFilters(registry);
  const image = { width: rgba.length / 4, height: 1, data: new Uint8ClampedArray(rgba) };
  const build = buildImageFilters({ smartFilters: value }, registry);
  applyImageFilters(image, build.filters, build.attrs);
  return Array.from(image.data);
}

describe("smart-filter opacity through the document and pixel program", () => {
  it("keeps old documents byte-identical and round-trips fractional and zero opacity", () => {
    const legacy = stack();
    expect(serializeStudioAdjustmentStack(normalizeStudioAdjustmentStack(legacy)))
      .toBe('{"entries":[{"enabled":true,"engine":"invert","id":"effect","params":{}}],"version":1}');
    for (const opacity of [0, 0.25, 0.875]) {
      const normalized = normalizeStudioAdjustmentStack(stack(opacity));
      expect(normalized.entries[0]).toMatchObject({ opacity });
      const serialized = serializeStudioAdjustmentStack(normalized);
      expect(normalizeStudioAdjustmentStack(JSON.parse(serialized))).toEqual(normalized);
      expect(studioAdjustmentStackSerializedByteLength(normalized)).toBe(new TextEncoder().encode(serialized).byteLength);
    }
    expect(normalizeStudioAdjustmentStack(stack(1))).toEqual(legacy);
    expect(normalizeStudioAdjustmentStack(stack(Number.NaN))).toEqual(legacy);
    expect(normalizeStudioAdjustmentStack(stack(4))).toEqual(legacy);
    expect(normalizeStudioAdjustmentStack(stack(-1)).entries[0]).toMatchObject({ opacity: 0 });
  });

  it("invalidates the lightweight image cache and skips a zero-strength operation", () => {
    expect(imageFilterCacheKey({ smartFilters: stack(0.25) })).not.toBe(imageFilterCacheKey({ smartFilters: stack(0.5) }));
    expect(imageFilterCacheKey({ smartFilters: stack() })).toBe(imageFilterCacheKey({ smartFilters: stack(1) }));
    expect(hasActiveImageFilters({ smartFilters: stack(0) })).toBe(false);
    expect(studioAdjustmentStackToFilterFields(stack(0))).toEqual({});
    expect(render([40, 80, 120, 255], stack(0))).toEqual([40, 80, 120, 255]);
  });

  it("mixes a complete multi-kernel operation once against its own input", () => {
    const rgba = [40, 80, 120, 255];
    const full = render(rgba, stack(undefined, "brightness-contrast", { brightness: 0.2, contrast: 30 }));
    const expected = Array.from(new Uint8ClampedArray(rgba.map((channel, i) => (channel + full[i]!) / 2)));
    expect(render(rgba, stack(0.5, "brightness-contrast", { brightness: 0.2, contrast: 30 }))).toEqual(expected);
    expect(render(rgba, stack(0.25))).toEqual([84, 104, 124, 255]);
  });

  it("mixes straight RGBA using premultiplied color weights when a filter removes alpha", () => {
    // Removing white changes alpha to zero. Half strength must keep white at half alpha,
    // rather than blend the hidden RGB of the fully transparent filtered result into gray.
    expect(render([255, 255, 255, 255], stack(0.5, "color-to-alpha", { keyColor: "#ffffff", strength: 100 })))
      .toEqual([255, 255, 255, 128]);
    expect(render([255, 255, 255, 128], stack(0.5, "color-to-alpha", { keyColor: "#ffffff", strength: 100 })))
      .toEqual([255, 255, 255, 64]);
  });

  it("copies browser ImageData dimensions even when they are non-enumerable accessors", () => {
    const rgba = [255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 0, 0, 255];
    const image = Object.create({ get width() { return 4; }, get height() { return 1; } }, {
      data: { value: new Uint8ClampedArray(rgba) },
    });
    const registry: KonvaLike = { Filters: {} };
    registerStudioKonvaFilters(registry);
    const operation = stack(0.5, "blur", { radius: 1 });
    const build = buildImageFilters({ smartFilters: operation }, registry);
    applyImageFilters(image, build.filters, build.attrs);
    const expected = render(rgba, operation);
    expect(Array.from(image.data)).toEqual(expected);
    expect(expected).not.toEqual(rgba);
  });

  it("retains the complete accepted input when a partial-strength kernel fails", () => {
    const registry: KonvaLike = { Filters: {} };
    registerStudioKonvaFilters(registry);
    registry.Filters.Invert = (image) => { image.data[0] = 0; throw new Error("kernel failed"); };
    const image = { width: 1, height: 1, data: new Uint8ClampedArray([40, 80, 120, 255]) };
    const build = buildImageFilters({ smartFilters: stack(0.5) }, registry);
    expect(() => applyImageFilters(image, build.filters, build.attrs)).toThrow("kernel failed");
    expect(Array.from(image.data)).toEqual([40, 80, 120, 255]);
  });

  it("preserves opacity across the strict work-asset and adjustment-layer envelopes", () => {
    const original = stack(0.375);
    expect(StudioWorkAssetSmartFiltersSchema.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
    expect(StudioWorkAssetSmartFiltersSchema.safeParse(stack(-0.1)).success).toBe(false);
    const document = createStudioAdjustmentLayerDocument({ version: 1, groups: [], layers: [{
      id: "adjustment", kind: "adjustment", parentGroupId: null, paintOrder: 1, visible: true,
      scope: "composite-below", opacity: 1, blendMode: "normal", stack: original,
    }] });
    const restored = createStudioAdjustmentLayerDocument(JSON.parse(serializeStudioAdjustmentLayerDocument(document)));
    expect(restored).toEqual(document);
    expect(restored.layers[0]).toMatchObject({ stack: original });
  });
});
