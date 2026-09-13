import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "../studio-brush";

import {
  STUDIO_BRUSH_ICON_BY_ID,
  STUDIO_PROCEDURAL_BRUSH_ICON_BY_ID,
  studioBrushIconId,
  type StudioBrushIconId,
} from "./studio-brush-icons";
import { STUDIO_BRUSH_PACK_CATALOG_IDS } from "./studio-brush-pack-id";
import {
  STUDIO_BRUSH_PACK_DESCRIPTORS,
  type StudioBrushPackCategory,
} from "./studio-brush-pack-index";

// Vocabulary includes the new explicitly authored material shapes: branching ink, woven paint,
// layered graphite, mineral facets, seedheads and perforated ornaments. It remains category-bound.
const ICONS_BY_PROCEDURAL_CATEGORY = {
  ink: new Set<StudioBrushIconId>([
    "circle", "pen", "pen-line", "pen-tool", "circle-dot", "circle-ellipsis",
    "brush", "a-large-small", "spline",
  ]),
  sketch: new Set<StudioBrushIconId>([
    "pencil", "pen-line", "feather", "circle-dashed", "layers", "grid-3x3",
  ]),
  chalk: new Set<StudioBrushIconId>(["circle-dashed", "grip", "square-dashed", "blend", "pencil"]),
  flat: new Set<StudioBrushIconId>([
    "layers", "square", "square-dashed", "circle-ellipsis", "rectangle-horizontal",
    "rectangle-vertical", "rows", "direction",
  ]),
  marker: new Set<StudioBrushIconId>([
    "highlighter", "feather", "rectangle-horizontal", "blend", "circle-ellipsis",
  ]),
  texture: new Set<StudioBrushIconId>([
    "grid-3x3", "circle-dashed", "asterisk", "square-dashed", "blend", "grip",
    "layers", "gem", "cloud", "circle-dot", "waves", "circle-ellipsis", "grid-2x2", "stamp",
  ]),
  paint: new Set<StudioBrushIconId>([
    "cloud", "cloud-fog", "circle-dot", "brush", "blend", "droplets", "paintbrush",
    "paint-roller", "spray-can", "wind", "circle-dashed", "grid-3x3",
  ]),
  rake: new Set<StudioBrushIconId>(["rows", "align-justify", "fence", "feather", "waves"]),
  foliage: new Set<StudioBrushIconId>(["trees", "wheat", "leaf", "feather", "flower", "asterisk", "sun"]),
  pattern: new Set<StudioBrushIconId>([
    "spline", "feather", "circle-ellipsis", "circle", "layers", "grid-2x2",
    "rows", "fence", "waves", "circle-dot",
  ]),
  stamp: new Set<StudioBrushIconId>(["stamp", "footprints", "heart", "spline"]),
  pixel: new Set<StudioBrushIconId>(["square", "grid-2x2"]),
  tone: new Set<StudioBrushIconId>(["grid-3x3", "rows", "circle-dot"]),
  effect: new Set<StudioBrushIconId>([
    "sparkles", "spray-can", "star", "cloud", "cloud-fog", "asterisk", "flame",
    "gem", "layers", "wind",
  ]),
} satisfies Readonly<Record<StudioBrushPackCategory, ReadonlySet<StudioBrushIconId>>>;

const MATERIAL_ICON_CONTRACT = {
  "material-capillary-dendrite": "spline",
  "material-cellular-foam": "circle-ellipsis",
  "material-pigment-floc": "circle-dashed",
  "material-lithography-reticulation": "grid-2x2",
  "material-porous-charcoal": "pencil",
  "material-graphite-platelets": "layers",
  "material-felt-fiber-bundle": "highlighter",
  "material-split-reed": "pen-tool",
  "material-engraving-burin": "pen-line",
  "material-silverpoint-crossgrain": "grid-3x3",
  "material-chalk-fracture": "square-dashed",
  "material-wax-resist": "stamp",
  "material-linen-scumble": "grid-3x3",
  "material-gouache-craquelure": "paintbrush",
  "material-stipple-etch": "circle-dot",
  "material-dry-bristle-comb": "fence",
  "material-opal-facet": "gem",
  "material-mica-flakes": "layers",
  "material-diffraction-spike": "star",
  "material-circuit-trace": "grid-2x2",
  "material-contour-isoline": "waves",
  "material-aurora-curtain": "wind",
  "material-coral-polyp": "asterisk",
  "material-fern-frond": "feather",
  "material-ginkgo-fan": "leaf",
  "material-maple-leaf": "leaf",
  "material-rose-rosette": "flower",
  "material-dandelion-seedhead": "sun",
  "material-herringbone-twill": "rows",
  "material-guilloche-rosette": "spline",
  "material-fish-scale": "waves",
  "material-sequin-paillettes": "circle-dot",
} as const;

describe("studio-brush-icons", () => {
  it("maps every built-in brush preset to a non-default icon key when listed", () => {
    for (const preset of BRUSH_PRESETS) {
      const key = studioBrushIconId(preset.id);
      expect(key.length).toBeGreaterThan(0);
      expect(STUDIO_BRUSH_ICON_BY_ID[preset.id]).toBeDefined();
      expect(key).not.toBe("default");
    }
  });

  it("falls back for unknown ids", () => {
    expect(studioBrushIconId("unknown-brush")).toBe("default");
    expect(studioBrushIconId(null)).toBe("default");
  });

  it("uses distinctive icons for fx and paint families", () => {
    expect(studioBrushIconId("glitter")).toBe("star");
    expect(studioBrushIconId("glow")).toBe("sparkles");
    expect(studioBrushIconId("watercolor")).toBe("droplets");
    expect(studioBrushIconId("spray")).toBe("spray-can");
    expect(studioBrushIconId("screentone")).toBe("grid-3x3");
  });

  it("maps every procedural catalogue id explicitly without collapsing to the renderer icon", () => {
    expect(Object.keys(STUDIO_PROCEDURAL_BRUSH_ICON_BY_ID)).toEqual(STUDIO_BRUSH_PACK_CATALOG_IDS);
    const mappedIcons = STUDIO_BRUSH_PACK_CATALOG_IDS.map((brushId) => studioBrushIconId(brushId));
    expect(mappedIcons).not.toContain("default");
    expect(new Set(mappedIcons).size).toBeGreaterThanOrEqual(24);
  });

  it("uses an icon vocabulary that matches every procedural brush's semantic category", () => {
    for (const descriptor of STUDIO_BRUSH_PACK_DESCRIPTORS) {
      const iconId = studioBrushIconId(descriptor.catalogId);
      expect(
        ICONS_BY_PROCEDURAL_CATEGORY[descriptor.category].has(iconId),
        `${descriptor.catalogId} (${descriptor.category}) should not use ${iconId}`
      ).toBe(true);
    }
  });

  it("pins the deliberately authored symbol for all 32 new material identities", () => {
    expect(Object.keys(MATERIAL_ICON_CONTRACT)).toHaveLength(32);
    for (const [id, expected] of Object.entries(MATERIAL_ICON_CONTRACT)) {
      expect(studioBrushIconId(id), id).toBe(expected);
    }
  });

  it("gives unmistakable motifs their own recognisable symbols", () => {
    expect(studioBrushIconId("heart-stamp")).toBe("heart");
    expect(studioBrushIconId("footstep-stamp")).toBe("footprints");
    expect(studioBrushIconId("checker-grid")).toBe("grid-2x2");
    expect(studioBrushIconId("paint-roller")).toBe("paint-roller");
    expect(studioBrushIconId("fresh-leaf")).toBe("leaf");
    expect(studioBrushIconId("loose-grass")).toBe("wheat");
    expect(studioBrushIconId("hair-fiber")).toBe("feather");
    expect(studioBrushIconId("cloud-soft")).toBe("cloud");
    expect(studioBrushIconId("mist-soft")).toBe("cloud-fog");
    expect(studioBrushIconId("pixel-square")).toBe("square");
    expect(studioBrushIconId("cross-hatch")).toBe("grid-3x3");
    expect(studioBrushIconId("bokeh-scatter")).toBe("sparkles");
    expect(studioBrushIconId("pine-needle-cluster")).toBe("trees");
  });
});
