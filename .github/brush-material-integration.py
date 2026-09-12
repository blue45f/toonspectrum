from pathlib import Path
root = Path('.')

def replace(path, before, after):
    p = root / path
    text = p.read_text()
    assert text.count(before) == 1, (path, before, text.count(before))
    p.write_text(text.replace(before, after))

brush = 'apps/web/src/domains/creator/brush/'
creator = 'apps/web/src/domains/creator/'
for file, before, after in [
 ('scripts/studio-brush-long-matrix-quality.test.ts', 'source === "pro")).toHaveLength(160)', 'source === "pro")).toHaveLength(192)'),
 ('scripts/audit-studio-brush-quality-portfolio.mts', 'productIds.length !== 48', 'productIds.length !== 80'),
 ('scripts/audit-studio-brush-quality-portfolio.mts', 'expected 48`', 'expected 80`'),
 ('scripts/audit-studio-brush-quality-portfolio.mts', 'COUNTS.paint !== 46', 'COUNTS.paint !== 78'),
 ('scripts/audit-studio-brush-quality-portfolio.mts', 'paint total is not 46', 'paint total is not 78'),
 (brush+'studio-brush-catalog-contract.test.ts', 'one 48-brush product', 'one 80-brush product'),
 (brush+'studio-brush-catalog-contract.test.ts', 'expect(counts.pro).toBe(160)', 'expect(counts.pro).toBe(192)'),
 (brush+'studio-brush-catalog-contract.test.ts', 'expect(productIds.size).toBe(48)', 'expect(productIds.size).toBe(80)'),
 (brush+'studio-brush-library.test.ts', 'expect(selections).toHaveLength(160)', 'expect(selections).toHaveLength(192)'),
 (brush+'studio-brush-library.test.ts', 'selection.catalogId)).size).toBe(160)', 'selection.catalogId)).size).toBe(192)'),
 (brush+'studio-draw-ux.test.ts', 'expect(pro).toHaveLength(160)', 'expect(pro).toHaveLength(192)'),
 (brush+'studio-draw-ux.test.ts', 'toHaveProperty("size", 160)', 'toHaveProperty("size", 192)'),
 (brush+'studio-brush-backend-quality-policy.test.ts', 'all 160 pro brushes', 'all 192 pro brushes'),
 (brush+'studio-brush-backend-quality-policy.test.ts', 'STUDIO_BRUSH_PACK_DESCRIPTORS).toHaveLength(160)', 'STUDIO_BRUSH_PACK_DESCRIPTORS).toHaveLength(192)'),
 (brush+'studio-brush-browser-evidence.test.ts', '48-product catalogue', '80-product catalogue'),
 (brush+'studio-brush-browser-evidence.test.ts', 'STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(48)', 'STUDIO_LISTED_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(80)'),
 (brush+'studio-brush-browser-evidence.test.ts', 'STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS).toHaveLength(46)', 'STUDIO_LISTED_PAINT_BRUSH_CATALOG_ITEMS).toHaveLength(78)'),
 (brush+'studio-brush-semantic-quality.test.ts', 'expect(results).toHaveLength(48)', 'expect(results).toHaveLength(80)'),
 (creator+'studio-sketchpad-specialty.test.ts', 'COUNTS.pro).toBe(160)', 'COUNTS.pro).toBe(192)'),
 (creator+'studio-competitor-specialty-brush-expansion.test.ts', 'COUNTS.pro).toBe(160)', 'COUNTS.pro).toBe(192)'),
 (creator+'live/studio-live-dynamic-brush-overlay.test.ts', 'STUDIO_BRUSH_PACK_DESCRIPTORS).toHaveLength(160)', 'STUDIO_BRUSH_PACK_DESCRIPTORS).toHaveLength(192)'),
 (creator+'live/studio-live-dynamic-brush-overlay.test.ts', 'expect(dryMediaCount).toBe(61)', 'expect(dryMediaCount).toBe(72)'),
 (brush+'studio-dry-media-catalog-classification.test.ts', 'expect(dryDescriptors).toHaveLength(61)', 'expect(dryDescriptors).toHaveLength(72)'),
]: replace(file, before, after)

icons = '''
  // Independently authored material morphologies.
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
'''
replace(brush+'studio-brush-icons.ts', '  "focus-ray-streak": "sparkles",\n', '  "focus-ray-streak": "sparkles",\n'+icons)

classification = brush+'studio-dry-media-anisotropic-grain-v1.ts'
replace(classification, 'export const STUDIO_DRY_MEDIA_ANISOTROPIC_GRAIN_VERSION_V1', 'import { STUDIO_MATERIAL_BRUSH_DEFINITIONS } from "./studio-material-brush-catalog";\n\nexport const STUDIO_DRY_MEDIA_ANISOTROPIC_GRAIN_VERSION_V1')
replace(classification, 'export type StudioDryMediaCatalogClassificationV1 =', '''/** These material fields own their R8 footprint; a generic fibre carrier must not replace it. */
export const STUDIO_DRY_MEDIA_AUTHORED_MORPHOLOGY_CATALOG_IDS_V1: readonly string[] = Object.freeze(
  STUDIO_MATERIAL_BRUSH_DEFINITIONS.filter((row) => row.runtime === "dry-media")
    .map((row) => `material-${row.program}`),
);
const AUTHORED_MORPHOLOGY_IDS = new Set(STUDIO_DRY_MEDIA_AUTHORED_MORPHOLOGY_CATALOG_IDS_V1);

export type StudioDryMediaCatalogClassificationV1 =''')
replace(classification, '      readonly kind: "intentional-discrete";\n    }>;', '      readonly kind: "intentional-discrete";\n    }>\n  | Readonly<{ readonly kind: "authored-morphology" }>;')
replace(classification, '  if (typeof catalogId !== "string") return null;\n', '  if (typeof catalogId !== "string") return null;\n  if (AUTHORED_MORPHOLOGY_IDS.has(catalogId)) {\n    return Object.freeze({ kind: "authored-morphology" });\n  }\n')
replace(classification, ' * intentional motif/stamp deposits keep their authored discrete renderer.', ' * intentional motif/stamp deposits or authored morphologies keep their own footprint renderer.')

test = brush+'studio-dry-media-catalog-classification.test.ts'
replace(test, '  STUDIO_DRY_MEDIA_ANISOTROPIC_CATALOG_PRESETS_V1,', '  STUDIO_DRY_MEDIA_ANISOTROPIC_CATALOG_PRESETS_V1,\n  STUDIO_DRY_MEDIA_AUTHORED_MORPHOLOGY_CATALOG_IDS_V1,')
replace(test, 'new Set([...anisotropicIds, ...discreteIds])', 'new Set([...anisotropicIds, ...discreteIds, ...STUDIO_DRY_MEDIA_AUTHORED_MORPHOLOGY_CATALOG_IDS_V1])')
replace(test, '  it("keeps motif/stamp media explicit', '''  it("preserves every new material footprint instead of substituting a generic fibre kernel", () => {
    expect(STUDIO_DRY_MEDIA_AUTHORED_MORPHOLOGY_CATALOG_IDS_V1).toHaveLength(11);
    for (const id of STUDIO_DRY_MEDIA_AUTHORED_MORPHOLOGY_CATALOG_IDS_V1) {
      expect(anisotropicIds.has(id)).toBe(false);
      expect(discreteIds.has(id)).toBe(false);
      expect(classifyStudioDryMediaCatalogIdV1(id)).toEqual({ kind: "authored-morphology" });
      expect(resolveStudioDryMediaAnisotropicPresetIdV1("dry-media", id)).toBeNull();
    }
  });

  it("keeps motif/stamp media explicit''')
print('Applied exact catalogue counts, all 32 icons and explicit non-substitutive material classification.')
