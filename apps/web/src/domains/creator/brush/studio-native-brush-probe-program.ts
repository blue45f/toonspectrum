import { getStroke } from "perfect-freehand";

import { NATIVE_BRUSH_PROBE_SURFACE } from "./studio-native-brush-probe-contract";

import type { NativeBrushProbeConfig, NativeBrushProbeSample, NativeBrushSurface } from "./studio-native-brush-probe-contract";
import type { PathIR, SceneIR } from "@toonspectrum/studio-project-model";

function color(colorHex: string) {
  return [1, 3, 5].map((at) => Number.parseInt(colorHex.slice(at, at + 2), 16) / 255);
}
export function nativeBrushProbeMybDocument(value: NativeBrushProbeConfig) {
  const [r, g, b] = color(value.color) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  const hue = delta === 0 ? 0 : ((max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) / 6 + 1) % 1;
  const base = (base_value: number) => ({ base_value, inputs: {} });
  return { settings: {
    radius_logarithmic: { base_value: Math.log(value.size / 2), inputs: { pressure: [[0, -1.5], [1, 0]] as [number, number][] } },
    opaque: base(value.style === "wash" ? 0.2 : 0.85),
    hardness: base(value.style === "ink" ? 0.9 : value.style === "wash" ? 0.2 : 0.55),
    dabs_per_actual_radius: base(2),
    radius_by_random: base(value.style === "chalk" ? 0.25 : 0),
    offset_by_random: base(value.style === "chalk" ? 0.2 : 0),
    color_h: base(hue), color_s: base(max ? delta / max : 0), color_v: base(max),
  } };
}
export function nativeBrushProbeScene(config: NativeBrushProbeConfig, samples: readonly NativeBrushProbeSample[], surface: NativeBrushSurface = NATIVE_BRUSH_PROBE_SURFACE): SceneIR {
  const outline = getStroke(samples.map((s) => [s.x, s.y, s.pressure]), {
    size: config.size, thinning: 0.7, smoothing: 0.5, streamline: 0.1, simulatePressure: false, last: true,
  });
  const [r, g, b] = color(config.color) as [number, number, number];
  const verbs: PathIR["verbs"] =
    outline.map(([x, y], index) => ({ v: index ? "L" : "M", x: x!, y: y! }));
  if (outline.length) verbs.push({ v: "Z" });
  return { version: 11, width: surface.width, height: surface.height, background: { r: 0, g: 0, b: 0, a: 0 },
    nodes: outline.length ? [{ id: "test-outline", kind: "fill-path", path: { verbs }, fillRule: "nonzero",
      opacity: 1, blend: "src-over", paint: { kind: "solid", color: { r, g, b, a: 1 } } }] : [] };
}
