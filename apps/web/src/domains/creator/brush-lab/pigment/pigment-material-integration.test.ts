import { describe, expect, it, vi } from "vitest";

import { EXTERNAL_PIGMENT_PROVIDERS } from "./external-pigments";
import { createBrushStudioV6Program, replaceBrushStudioV6Slot } from "../brush-studio-v6-engine";
import { createBrushStudioV6ProductBrush } from "../brush-studio-v6-product-bridge";
import { createBrushStudioV6MaterialStroke, normalizeBrushStudioV6MaterialConfig } from "../brush-studio-v6-material-engine";
import { BrushStudioV6MaterialPaletteCache } from "../brush-studio-v6-material-palette-cache";
import { createBrushStudioV6PigmentPalette } from "../brush-studio-v6-pigment-provider";

vi.mock("../../studio-page-editor-runtime-loaders", () => ({}));

const samples = Array.from({ length: 64 }, (_, i) => ({ x: 10 + i * 3, y: 40 + 8 * Math.sin(i / 8), pressure: 0.4 + i / 150 }));

describe("actual material-brush pigment integration", () => {
  for (const provider of EXTERNAL_PIGMENT_PROVIDERS) {
    it(`${provider.id}: persists native provider identity and replays identical contact colors`, () => {
      const program = replaceBrushStudioV6Slot(createBrushStudioV6Program("oil-hair-mixer"), "pigment", provider.nodeId);
      const brush = createBrushStudioV6ProductBrush(program);
      const material = brush.enginePrograms!.material!;
      expect(material.slots.pigment).toBe(provider.nodeId);
      expect(material.runtime?.bindings).toContainEqual(expect.objectContaining({
        providerId: provider.id, version: provider.version, execution: "native", nodeIds: [provider.nodeId],
      }));
      const replay = normalizeBrushStudioV6MaterialConfig(JSON.parse(JSON.stringify(material)));
      expect(replay).not.toBeNull();
      const live = createBrushStudioV6MaterialStroke(material), restored = createBrushStudioV6MaterialStroke(replay!);
      const marks = samples.flatMap((point) => live.push(point));
      expect(marks.length).toBeGreaterThan(0);
      expect(samples.flatMap((point) => restored.push(point))).toEqual(marks);
      expect(new Set(marks.map((mark) => mark.color)).size).toBeGreaterThan(1);
    });
  }
  it("computes each external palette only once while the bounded cache retains it", () => {
    const compute = vi.fn(createBrushStudioV6PigmentPalette);
    const cache = new BrushStudioV6MaterialPaletteCache(compute);
    for (const provider of EXTERNAL_PIGMENT_PROVIDERS) {
      const first = cache.get("#002185", "#fcd200", provider.id);
      for (let i = 0; i < 32; i += 1) expect(cache.get("#002185", "#fcd200", provider.id)).toBe(first);
    }
    expect(compute).toHaveBeenCalledTimes(3);
  });
});
