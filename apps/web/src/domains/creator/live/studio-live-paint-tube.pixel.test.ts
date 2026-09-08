import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { studioCoreBrushCatalogSelection } from "../brush/studio-brush-selection";
import { BRUSH_PRESETS } from "../studio-brush";
import { planStudioDynamicBrushCoverageAndLegacyMarks, renderStudioDynamicBrushCoverageMark } from "../studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "../studio-dynamic-brush-render-plan";

import { StudioLiveDynamicBrushOverlayRenderer } from "./studio-live-dynamic-brush-overlay";
import { drawElement, SURFACE } from "./studio-live-dynamic-brush-overlay.fixture";

interface SkiaCanvas {
  getContext(kind: "2d"): CanvasRenderingContext2D;
  dispose(): void;
}
interface Skia {
  MakeCanvas(width: number, height: number): SkiaCanvas;
  MakeImage(info: unknown, bytes: Uint8Array, stride: number): { delete(): void };
  AlphaType: { Unpremul: unknown };
  ColorType: { RGBA_8888: unknown };
  ColorSpace: { SRGB: unknown };
}
let skia: Skia;
const disposals: (() => void)[] = [];

beforeAll(async () => {
  const specifier = "@toonspectrum/studio-engine-skia/node";
  const loader = await import(/* @vite-ignore */ specifier) as { loadCanvasKitNode(): Promise<Skia> };
  skia = await loader.loadCanvasKitNode();
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const dispose of disposals.splice(0)) dispose();
});

function surface(width: number, height: number) {
  const canvas = skia.MakeCanvas(width, height);
  const raw = canvas.getContext("2d");
  disposals.push(() => canvas.dispose());
  const wrapper = { width, height, style: {}, raw, getContext: () => context };
  // CanvasKit's HTML emulation accepts SkImage, while the browser accepts another canvas.
  // Snapshot those exact source bytes; every raster/path/clip operation remains real Skia.
  const context = new Proxy(raw, {
    get(target, property) {
      if (property === "drawImage") return (source: typeof wrapper, ...args: number[]) => {
        const pixels = source.raw.getImageData(0, 0, source.width, source.height);
        const image = skia.MakeImage({
          width: source.width, height: source.height,
          alphaType: skia.AlphaType.Unpremul, colorType: skia.ColorType.RGBA_8888,
          colorSpace: skia.ColorSpace.SRGB,
        }, new Uint8Array(pixels.data), source.width * 4);
        try {
          Reflect.apply(target.drawImage, target, [image, ...args]);
        } finally {
          image.delete();
        }
      };
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
    set: (target, property, value) => Reflect.set(target, property, value, target),
  });
  return wrapper;
}

describe("paint-tube live and committed pixels", () => {
  it.each([[1, false], [2, false], [1.5, true]] as const)(
    "matches the canonical prefix through crossings, retraces and replay at DPR %s / flipped %s",
    (dpr, flipX) => {
      vi.stubGlobal("devicePixelRatio", dpr);
      const width = SURFACE.width * dpr;
      const height = SURFACE.height * dpr;
      const active = surface(width, height);
      const presentation = surface(width, height);
      const settled = surface(width, height);
      const expected = surface(width, height);
      const renderer = new StudioLiveDynamicBrushOverlayRenderer();
      renderer.attach({
        activeCanvas: active as unknown as HTMLCanvasElement,
        presentationCanvas: presentation as unknown as HTMLCanvasElement,
        settledCanvas: settled as unknown as HTMLCanvasElement,
      });
      renderer.setSurface({ ...SURFACE, flipX });
      const preset = BRUSH_PRESETS.find((item) => item.id === "paint-tube")!;
      const selected = studioCoreBrushCatalogSelection(preset);
      const brushDynamics = selected.brushDynamics;
      if (!brushDynamics) throw new Error("paint-tube dynamics missing");
      const points = [24, 28, 90, 90, 160, 35, 90, 28, 30, 100, 160, 100, 90, 28, 24, 28];
      const elementAt = (count: number) => drawElement("paint-tube-parity", points.slice(0, count * 2), {
        brush: selected.runtimeBrushId, brushCatalogId: selected.catalogId,
        brushDynamics, strokeWidth: 18,
      });
      expect(renderer.begin(elementAt(1)).status).toBe("started");
      for (let count = 2; count <= points.length / 2; count += 1) {
        const element = elementAt(count);
        expect(renderer.appendFrom(element).status).toBe("appended");
        const plan = planStudioDynamicBrushRender(element, selected.runtimeBrushId, false);
        if (plan.status !== "ready") throw new Error("canonical plan unavailable");
        const result = planStudioDynamicBrushCoverageAndLegacyMarks({
          dabVariations: plan.plan.dabVariations, dynamics: plan.plan.dynamics,
          materialIdentity: plan.plan.materialIdentity, dynamicSeed: plan.plan.seed,
          stroke: element.stroke, stampGrid: plan.plan.renderBudget.stampGrid,
          markBudget: plan.plan.markBudget,
        }).coveragePlan;
        if (!result.ok) throw new Error(result.reason);
        const ctx = expected.raw;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.setTransform(flipX ? -dpr : dpr, 0, 0, dpr, flipX ? width : 0, 0);
        for (const mark of result.marks) renderStudioDynamicBrushCoverageMark(ctx, mark);
        const actual = active.raw.getImageData(0, 0, width, height).data;
        const reference = ctx.getImageData(0, 0, width, height).data;
        let mismatched = 0;
        let maxDelta = 0;
        const firstDifferences: unknown[] = [];
        for (let offset = 0; offset < actual.length; offset += 1) {
          if (actual[offset] !== reference[offset]) {
            mismatched += 1;
            maxDelta = Math.max(maxDelta, Math.abs(actual[offset]! - reference[offset]!));
            if (firstDifferences.length < 4) firstDifferences.push({ x: Math.floor(offset / 4) % width, y: Math.floor(offset / 4 / width), actual: actual[offset], reference: reference[offset] });
          }
        }
        expect(mismatched, `prefix ${count}, maxDelta=${maxDelta}, first=${JSON.stringify(firstDifferences)}`).toBe(0);
        if (count === 4) renderer.setSurface({ ...SURFACE, flipX });
      }
      expect(renderer.end(elementAt(points.length / 2)).status).toBe("settled");
      renderer.attach(null);
    },
  );
});
