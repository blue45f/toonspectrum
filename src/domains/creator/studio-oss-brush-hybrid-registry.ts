/**
 * Hybrid brush-engine registry — which verified OSS stack owns each family.
 *
 * Product rule (hybrid-design.md §4 + quality policy):
 * - One pixel authority per stroke (no dual concurrent engines).
 * - **No cross-engine product fallback** (Hokusai↛libmypaint↛Skia). Fail closed.
 * - Hybrid = family routing (pick the primary stack), not a failure ladder.
 * - Hokusai/libmypaint .myb is natural-media experimental / promotion path.
 * - Live primary routes use the specialist already shipping for that family,
 *   with OSS kernels from studio-oss-brush-kernels for tip/texture structure.
 *
 * Site mapping (observation only for closed products):
 * | Site feel              | Primary engine              | OSS kernel DNA              |
 * |------------------------|-----------------------------|-----------------------------|
 * | Expresii wet bleed     | Living Ink / wet-field      | watercolor tip + wet recipe |
 * | Krita/Photopea dry     | dry-dynamics + anisotropic  | wax scrape / chalk alpha    |
 * | Kleki spray            | spray-dynamics + stamp      | equal-area + spray tip      |
 * | Magma oil blend        | wet-specialist oil ribbon   | oil film + modelling.myb    |
 */

import {
  STUDIO_OSS_BRUSH_KERNELS_VERSION,
  STUDIO_OSS_BRUSH_PROVENANCE,
  type StudioOssBrushProvenanceId,
} from "./studio-oss-brush-kernels";

export const STUDIO_OSS_BRUSH_HYBRID_REGISTRY_VERSION =
  "studio-oss-brush-hybrid-registry-v1" as const;

export type StudioOssBrushFamily =
  | "wet-watercolor"
  | "wet-oil"
  | "dry-scrape"
  | "spray-air"
  | "graphite";

export interface StudioOssBrushHybridRoute {
  readonly family: StudioOssBrushFamily;
  readonly siteReference: string;
  readonly primaryProductPath: string;
  readonly verifiedEngines: readonly string[];
  readonly kernelProvenance: readonly StudioOssBrushProvenanceId[];
  readonly notes: string;
}

export const STUDIO_OSS_BRUSH_HYBRID_ROUTES = Object.freeze({
  "wet-watercolor": Object.freeze({
    family: "wet-watercolor",
    siteReference: "Expresii Web Demo (behaviour reference; CFD proprietary)",
    primaryProductPath: "wet-field / living-ink opt-in + stamp watercolor tip",
    verifiedEngines: Object.freeze([
      "studio-living-ink-field",
      "studio-wet-ink-brush-runtime",
      "studio-oss-brush-kernels watercolor tip",
    ]),
    kernelProvenance: Object.freeze([
      "klecksChalkAlpha",
    ] as StudioOssBrushProvenanceId[]),
    notes:
      "Expresii CFD is closed. Wet mobility uses Living Ink / wet-ink recipes; tip granulation uses OSS multi-octave coverage.",
  }),
  "wet-oil": Object.freeze({
    family: "wet-oil",
    siteReference: "Magma oil blend (closed) + libmypaint modelling/Wet_Paint",
    primaryProductPath:
      "wet-specialist oil ribbon + Hokusai oil carrier + texture v2 paint-film",
    verifiedEngines: Object.freeze([
      "studio-fx-brush planOilBrushDabs",
      "studio-oil-ribbon-carrier",
      "studio-hokusai-wasm oil .myb",
      "studio-oss-brush-kernels oil film",
      "libmypaint modelling.myb DNA",
    ]),
    kernelProvenance: Object.freeze([
      "libmypaintModelling",
      "libmypaintWetPaint",
    ] as StudioOssBrushProvenanceId[]),
    notes:
      "Smudge disabled on transparent layers. Spectral paint_mode retained. Bristle film from OSS multi-scale channels.",
  }),
  "dry-scrape": Object.freeze({
    family: "dry-scrape",
    siteReference: "Krita Web / Photopea dry media (closed UI; Krita desktop OSS)",
    primaryProductPath:
      "dry-dynamics anisotropic grain + Hokusai charcoal carrier + texture v2",
    verifiedEngines: Object.freeze([
      "studio-dry-media-anisotropic-grain-v1",
      "studio-hokusai-wasm charcoal .myb",
      "studio-oss-brush-kernels wax scrape / chalk",
      "libmypaint charcoal.myb DNA",
    ]),
    kernelProvenance: Object.freeze([
      "libmypaintCharcoal",
      "klecksChalkAlpha",
      "klecksChalkRotate",
      "klecksScatter",
    ] as StudioOssBrushProvenanceId[]),
    notes:
      "Direction-aligned wax scrape + Klecks chalk tip rotation. Equal-area scatter for powder edges.",
  }),
  "spray-air": Object.freeze({
    family: "spray-air",
    siteReference: "Kleki / Klecks spray & airbrush",
    primaryProductPath: "spray-dynamics + stamp airbrush tip raster",
    verifiedEngines: Object.freeze([
      "studio-brush-dynamics airbrush",
      "studio-brush-stamp-engine",
      "studio-oss-brush-kernels spray tip + equal-area",
      "Krita spray polar distance (math)",
    ]),
    kernelProvenance: Object.freeze([
      "klecksScatter",
      "kritaPolarDistance",
    ] as StudioOssBrushProvenanceId[]),
    notes:
      "Soft envelope + grit tip baked into stamp cache. Dynamics already use √U scatter.",
  }),
  graphite: Object.freeze({
    family: "graphite",
    siteReference: "Magma pencil + libmypaint pencil / Hokusai pencil",
    primaryProductPath: "dry-specialist pencil + Hokusai pencil texture v2",
    verifiedEngines: Object.freeze([
      "studio-hokusai-wasm pencil .myb",
      "studio-brush-stamp-engine pencil grain",
    ]),
    kernelProvenance: Object.freeze([
      "libmypaintCharcoal",
    ] as StudioOssBrushProvenanceId[]),
    notes: "Graphite fibre/paper tooth remains in texture-v2 pencil profile.",
  }),
} as const satisfies Record<StudioOssBrushFamily, StudioOssBrushHybridRoute>);

export function resolveStudioOssBrushHybridFamily(
  brushId: string | null | undefined,
): StudioOssBrushFamily | null {
  if (!brushId) return null;
  const id = brushId.trim().toLowerCase();
  if (
    id === "watercolor"
    || id === "ink-wash"
    || id.startsWith("inkwash-")
    || id === "sumi"
    || id === "sumi-e"
    || id === "wash-brush"
  ) {
    return "wet-watercolor";
  }
  if (
    id === "oil"
    || id === "acrylic"
    || id === "gouache"
    || id === "paint-tube"
    || id === "brush"
    || id === "flat-brush"
    || id === "oil-filbert"
    || id === "oil-linen-filbert"
    || id === "oil-impasto-heavy"
  ) {
    return "wet-oil";
  }
  if (
    id === "crayon"
    || id === "chalk"
    || id === "charcoal"
    || id === "pastel"
    || id === "oil-pastel"
    || id === "dry-media"
    || id.includes("crayon")
    || id.includes("pastel")
    || id.includes("chalk")
  ) {
    return "dry-scrape";
  }
  if (
    id === "airbrush"
    || id === "hard-airbrush"
    || id === "airbrush-fine"
    || id === "spray"
    || id === "splatter"
    || id === "soft-brush"
    || id.includes("airbrush")
    || id.includes("spray")
  ) {
    return "spray-air";
  }
  if (
    id === "pencil"
    || id.startsWith("pencil-")
    || id === "soft-pencil"
    || id === "colored-pencil"
    || id === "erodible-pencil"
  ) {
    return "graphite";
  }
  return null;
}

export function describeStudioOssBrushHybridStack(
  brushId: string | null | undefined,
): Readonly<{
  version: typeof STUDIO_OSS_BRUSH_HYBRID_REGISTRY_VERSION;
  kernelsVersion: typeof STUDIO_OSS_BRUSH_KERNELS_VERSION;
  family: StudioOssBrushFamily | null;
  route: StudioOssBrushHybridRoute | null;
  provenanceNotes: readonly string[];
  /** Always false — hybrid routing is not a cross-engine failure ladder. */
  crossEngineProductFallbackAllowed: false;
}> {
  const family = resolveStudioOssBrushHybridFamily(brushId);
  const route = family ? STUDIO_OSS_BRUSH_HYBRID_ROUTES[family] : null;
  return Object.freeze({
    version: STUDIO_OSS_BRUSH_HYBRID_REGISTRY_VERSION,
    kernelsVersion: STUDIO_OSS_BRUSH_KERNELS_VERSION,
    family,
    route,
    provenanceNotes: Object.freeze(
      route
        ? route.kernelProvenance.map((id) => STUDIO_OSS_BRUSH_PROVENANCE[id])
        : [],
    ),
    crossEngineProductFallbackAllowed: false,
  });
}
