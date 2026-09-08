import { describe, expect, it } from "vitest";

import { applyImageFilters, buildImageFilters, registerStudioKonvaFilters, type KonvaLike } from "../render/studio-konva-filters";
import { blendFilterMaskedPixels, wrapKonvaFiltersWithFilterMask } from "./studio-filter-mask";

describe("alpha-changing smart filters through the actual mask kernels", () => {
  const registry: KonvaLike = { Filters: {} };
  registerStudioKonvaFilters(registry);
  const build = () => buildImageFilters({ smartFilters: { version: 1, entries: [{
    id: "remove-white", engine: "color-to-alpha", enabled: true,
    params: { keyColor: "#ffffff", strength: 100 },
  }] } }, registry);
  const source = () => ({ width: 1, height: 1, data: new Uint8ClampedArray([128, 128, 128, 255]) });

  it.each([false, true])("preserves the color of a partially removed white backdrop (transformed=%s)", (transformed) => {
    const original = source();
    const filtered = source();
    const chain = build();
    applyImageFilters(filtered, chain.filters, chain.attrs);
    expect(Array.from(filtered.data)).toEqual([0, 0, 0, 127]);
    const result = blendFilterMaskedPixels({
      filtered: filtered.data, original: original.data, width: 1, height: 1,
      coverage: { width: 1, height: 1, data: new Uint8ClampedArray([128]) },
      ...(transformed ? { transform: { flipX: true } } : {}),
    });
    // Half the original gray pixel plus half the transparent black foreground:
    // premultiplied coverage gives gray 85 at alpha 191, not dark gray 64.
    expect(Array.from(result)).toEqual([85, 85, 85, 191]);
    expect(Array.from(original.data)).toEqual([128, 128, 128, 255]);
    expect(Array.from(filtered.data)).toEqual([0, 0, 0, 127]);
  });

  it("uses the same premultiplied result in the Konva fallback wrapper", () => {
    const image = source();
    const chain = build();
    const filters = wrapKonvaFiltersWithFilterMask(chain.filters, {
      width: 1, height: 1, data: new Uint8ClampedArray([128]),
    });
    applyImageFilters(image, filters, chain.attrs);
    expect(Array.from(image.data)).toEqual([85, 85, 85, 191]);
  });
});
