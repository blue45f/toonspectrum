/**
 * Product bridge for the 72 Brush Studio V5 quality designs.
 *
 * The design taxonomy is intentionally not another renderer catalogue. Every design resolves to
 * one shipped, replay-safe product brush and enriches that item with the original design name,
 * id, material group, signature and engine vocabulary. This keeps saved document identities
 * stable while making the complete design language discoverable from the normal brush library.
 */

import {
  STUDIO_BRUSH_QUALITY_DESIGNS,
  type StudioBrushQualityDesign,
} from "./studio-brush-quality-design-catalog";

import type { StudioBrushCatalogItem } from "./studio-brush-catalog-core";

export const STUDIO_BRUSH_QUALITY_DESIGN_COUNT = 72 as const;

export const STUDIO_BRUSH_QUALITY_DESIGN_PRODUCT_TARGETS: Readonly<
  Record<string, string>
> = Object.freeze({
  "clean-ink": "pen",
  "mesh-ink": "perfect-ink",
  "comic-gpen": "gpen",
  "croquis-capsule": "perfect-ink",
  "chisel-calligraphy": "fountain-pen",
  "natural-ink": "ink-brush",
  "dry-sumi": "ink-wash--fiber-feather",
  "rough-comic": "web-rough-ink",
  "flat-marker": "marker",
  "chisel-marker": "perfect-marker",
  "alcohol-bloom": "watercolor--edge-bloom",
  "one-wash": "highlighter",
  "graphite-line": "pencil",
  "side-graphite": "pencil--side-shade",
  "grain-pencil": "pencil-grain",
  "natural-graphite": "pencil",
  "dual-graphite": "pencil-grain",
  "compressed-charcoal": "charcoal--compressed-edge",
  "vine-charcoal": "charcoal--compressed-edge",
  "hairy-charcoal": "charcoal--compressed-edge",
  "wax-crayon": "crayon",
  "powder-chalk": "chalk",
  "velvet-pastel": "pastel",
  "oil-pastel": "oil-pastel",
  "clean-watercolor": "watercolor",
  "granular-watercolor": "watercolor--granular",
  "backrun": "watercolor--edge-bloom",
  "wet-edge-stamp": "watercolor--edge-bloom",
  "living-watercolor": "watercolor",
  "living-ink": "inkwash-pen",
  "water-brush": "inkwash-water-brush",
  "loaded-water": "watercolor",
  "dense-sumi": "ink-wash--sumi-core",
  "fiber-sumi": "ink-wash--fiber-feather",
  "chroma-halo": "ink-wash--chroma-halo",
  "white-gouache": "inkwash-white-ink",
  "dendritic": "web-multi-agent",
  "thin-film-wash": "web-gravity-drip",
  "matte-gouache": "gouache--matte-body",
  "polymer-acrylic": "oil--flat-ribbon",
  "oil-filbert": "oil--filbert-ribbon",
  "natural-oil": "oil--filbert-ribbon",
  "hairy-oil": "oil--filbert-ribbon",
  "dry-fan": "brush",
  "impasto": "oil--impasto-ribbon",
  "tube-extrusion": "paint-tube",
  "palette-knife": "palette-knife-edge",
  "pigment-blender": "web-blend-softener",
  "soft-air": "airbrush",
  "hard-air": "hard-airbrush",
  "grit-air": "airbrush",
  "equal-spray": "spray",
  "burst": "splatter",
  "physics-splatter": "splatter",
  "neon": "neon",
  "glitter": "glitter",
  "dot-tone": "screentone",
  "line-tone": "screentone",
  "gradient-tone": "screentone",
  "cross-hatch": "web-cross-hatch-pen",
  "contour-rake": "web-cross-hatch-pen",
  "radial-burst": "web-radial-burst",
  "fabric": "fabric-texture",
  "brick": "web-grid-ink",
  "foliage": "web-scatter-stamp",
  "fur": "web-fur-strand",
  "stitch": "web-dash-stitch",
  "scatter": "web-scatter-stamp",
  "swarm": "web-multi-agent",
  "kaleido": "web-kaleido-ink",
  "spiro": "web-spiro-orbit",
  "rainbow": "web-rainbow-flow",
});

export interface StudioBrushQualityDesignProjection {
  readonly design: StudioBrushQualityDesign;
  readonly productCatalogId: string;
}

export function studioBrushQualityDesignProductId(
  designId: unknown,
): string | null {
  return typeof designId === "string"
    ? STUDIO_BRUSH_QUALITY_DESIGN_PRODUCT_TARGETS[designId] ?? null
    : null;
}

export function projectStudioBrushQualityDesigns(
  catalogItems: readonly StudioBrushCatalogItem[],
): readonly StudioBrushQualityDesignProjection[] {
  const productIds = new Set(catalogItems.map((item) => item.id));
  return Object.freeze(
    STUDIO_BRUSH_QUALITY_DESIGNS.flatMap((design) => {
      const productCatalogId = studioBrushQualityDesignProductId(design.id);
      return productCatalogId && productIds.has(productCatalogId)
        ? [Object.freeze({ design, productCatalogId })]
        : [];
    }),
  );
}

export function auditStudioBrushQualityDesignBridge(
  catalogItems: readonly StudioBrushCatalogItem[],
): readonly string[] {
  const issues: string[] = [];
  const designsById = new Map(
    STUDIO_BRUSH_QUALITY_DESIGNS.map((design) => [design.id, design]),
  );
  const productsById = new Map(catalogItems.map((item) => [item.id, item]));

  if (STUDIO_BRUSH_QUALITY_DESIGNS.length !== STUDIO_BRUSH_QUALITY_DESIGN_COUNT) {
    issues.push(
      `expected ${STUDIO_BRUSH_QUALITY_DESIGN_COUNT} quality designs, found ${STUDIO_BRUSH_QUALITY_DESIGNS.length}`,
    );
  }
  if (designsById.size !== STUDIO_BRUSH_QUALITY_DESIGNS.length) {
    issues.push("quality design ids must be unique");
  }

  for (const design of STUDIO_BRUSH_QUALITY_DESIGNS) {
    const productCatalogId = studioBrushQualityDesignProductId(design.id);
    if (!productCatalogId) {
      issues.push(`${design.id} has no product brush target`);
      continue;
    }
    const target = productsById.get(productCatalogId);
    if (!target) {
      issues.push(`${design.id} targets missing product brush ${productCatalogId}`);
      continue;
    }
    if (target.operation !== "paint") {
      issues.push(`${design.id} targets non-paint product brush ${productCatalogId}`);
    }
  }

  for (const designId of Object.keys(STUDIO_BRUSH_QUALITY_DESIGN_PRODUCT_TARGETS)) {
    if (!designsById.has(designId)) {
      issues.push(`stale quality design target mapping: ${designId}`);
    }
  }

  return Object.freeze(issues);
}

function designAliases(design: StudioBrushQualityDesign): readonly string[] {
  return Object.freeze([
    design.id,
    design.name,
    design.group,
    design.signature,
    design.engine,
    `V5 ${design.name}`,
    `Brush Studio ${design.name}`,
  ]);
}

export function attachStudioBrushQualityDesignAliases(
  catalogItems: readonly StudioBrushCatalogItem[],
): readonly StudioBrushCatalogItem[] {
  const issues = auditStudioBrushQualityDesignBridge(catalogItems);
  if (issues.length > 0) {
    throw new Error(`Invalid Studio brush quality design bridge: ${issues.join("; ")}`);
  }

  const aliasesByProductId = new Map<string, string[]>();
  for (const { design, productCatalogId } of projectStudioBrushQualityDesigns(catalogItems)) {
    const aliases = aliasesByProductId.get(productCatalogId) ?? [];
    aliases.push(...designAliases(design));
    aliasesByProductId.set(productCatalogId, aliases);
  }

  return Object.freeze(
    catalogItems.map((item) => {
      const designSearchAliases = aliasesByProductId.get(item.id);
      if (!designSearchAliases) return item;
      const searchAliases = Object.freeze(
        [...new Set([...(item.searchAliases ?? []), ...designSearchAliases])].filter(
          (value) => value.trim().length > 0,
        ),
      );
      return Object.freeze({ ...item, searchAliases });
    }),
  );
}
