import type { StudioCoverageSurface } from "@/domains/creator/studio-dynamic-brush-coverage-renderer";

export interface CpuCanvasKit {
  MakeCanvas(width: number, height: number): {
    getContext(kind: "2d"): CanvasRenderingContext2D;
    dispose(): void;
  };
  MakeImage(info: unknown, bytes: Uint8Array, stride: number): { delete(): void } | null;
  AlphaType: { Unpremul: unknown };
  ColorType: { RGBA_8888: unknown };
  ColorSpace: { SRGB: unknown };
}

/** Same pixel-snapshot bridge as studio-live-paint-tube.pixel.test.ts; CPU Skia only. */
export function createCpuSurfaceFactory(kit: CpuCanvasKit) {
  const disposals: (() => void)[] = [];
  const create = (initialWidth: number, initialHeight: number): StudioCoverageSurface => {
    let width = initialWidth;
    let height = initialHeight;
    let canvas = kit.MakeCanvas(width, height);
    let raw = canvas.getContext("2d");
    const resize = () => {
      canvas.dispose();
      canvas = kit.MakeCanvas(width, height);
      raw = canvas.getContext("2d");
    };
    const wrapper = {
      get width() { return width; },
      set width(value: number) { width = value; resize(); },
      get height() { return height; },
      set height(value: number) { height = value; resize(); },
      getContext: () => context,
    };
    // CanvasKit's emulated drawImage accepts SkImage, not another emulated canvas. Convert the
    // current source pixels without changing raster/path/blend operations or inventing a DOM.
    const context = new Proxy(raw, {
      get(_target, property) {
        if (property === "canvas") return wrapper;
        if (property === "drawImage") return (source: StudioCoverageSurface, ...args: number[]) => {
          const sourceContext = source.getContext("2d");
          if (!sourceContext) throw new Error("Missing CPU source context.");
          const pixels = sourceContext.getImageData(0, 0, source.width, source.height);
          const image = kit.MakeImage({
            width: source.width, height: source.height,
            alphaType: kit.AlphaType.Unpremul, colorType: kit.ColorType.RGBA_8888,
            colorSpace: kit.ColorSpace.SRGB,
          }, new Uint8Array(pixels.data), source.width * 4);
          if (!image) throw new Error("CPU image snapshot allocation failed.");
          try { Reflect.apply(raw.drawImage, raw, [image, ...args]); }
          finally { image.delete(); }
        };
        const value = Reflect.get(raw, property, raw) as unknown;
        return typeof value === "function" ? value.bind(raw) : value;
      },
      set: (_target, property, value) => Reflect.set(raw, property, value, raw),
    });
    disposals.push(() => canvas.dispose());
    // This host surface intentionally implements the Canvas operations used by the renderer;
    // it is not a browser DOM element, and drawImage is bridged above at the host boundary.
    return wrapper as unknown as StudioCoverageSurface;
  };
  return { create, dispose: () => { for (const dispose of disposals.splice(0)) dispose(); } };
}
