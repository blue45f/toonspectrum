/**
 * Lightweight product metadata for Brush Studio V6 recipes.
 * Runtime construction and provider receipts stay in a separately loaded chunk.
 */
import { BRUSH_STUDIO_V6_RECIPE_SEEDS } from "../brush-lab/brush-studio-v6-recipe-catalog";

import { studioBrushDefaultStartWidth } from "./studio-brush-default-size-policy";
import { studioV6BrushCatalogId } from "./studio-brush-v6-id";

import type { BrushStudioV6RecipeSeed } from "../brush-lab/brush-studio-v6-recipe-catalog";
import type { StudioBrushCatalogItem } from "./studio-brush-catalog-core";
import type {
  StudioBrushMaterialGroup,
  StudioBrushPreviewStyle,
} from "./studio-brush-visual";

function slotStrings(seed: BrushStudioV6RecipeSeed): readonly string[] {
  const slots = seed.delta.slots;
  if (!slots) return Object.freeze([]);
  const values: string[] = [];
  for (const value of Object.values(slots)) {
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") values.push(entry);
      }
    }
  }
  return Object.freeze(values);
}

function hasAny(source: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => source.includes(pattern));
}

export function studioV6BrushMaterialGroup(
  seed: BrushStudioV6RecipeSeed,
): StudioBrushMaterialGroup {
  const signature = `${seed.id} ${seed.group} ${slotStrings(seed).join(" ")}`
    .toLocaleLowerCase("ko-KR");
  if (hasAny(signature, [
    "halftone", "dot-tone", "cross-hatch", "crosshatch", "해칭", "만화",
  ])) return "tone";
  if (hasAny(signature, [
    "neon", "kaleido", "reaction", "dendritic", "light", "holographic", "fx",
  ])) return "fx";
  if (hasAny(signature, [
    "spray", "particle-stream", "pigment-spray",
  ])) return "airbrush";
  if (hasAny(signature, [
    "foliage", "stitch", "weave", "brick", "motif", "의상", "장식", "배경", "자연",
  ])) return "texture";
  if (hasAny(signature, [
    "deposit-wet", "inkwash", "watercolor", "water-brush", "bloom", "습식", "wash",
  ])) return "watercolor";
  if (hasAny(signature, [
    "deposit-oil", "impasto", "palette-knife", "bristle", "height", "oil-",
  ])) return "oil";
  if (hasAny(signature, ["marker", "gouache"])) return "marker";
  if (hasAny(signature, [
    "charcoal", "pastel", "chalk", "wax", "dry-contact",
  ])) return "pastel";
  if (hasAny(signature, ["graphite", "pencil", "건식"])) return "pencil";
  if (hasAny(signature, ["pattern-", "프로시저럴"])) return "texture";
  return "ink";
}

function previewStyleFor(
  group: StudioBrushMaterialGroup,
  signature: string,
): StudioBrushPreviewStyle {
  if (signature.includes("neon")) return "neon";
  if (signature.includes("holographic") || signature.includes("glitter")) {
    return "glitter";
  }
  if (signature.includes("stitch")) return "dashed";
  if (group === "tone") return "tone";
  if (group === "oil") return "oil";
  if (group === "watercolor" || group === "airbrush") return "soft";
  if (group === "texture" || group === "pastel" || group === "pencil") {
    return "texture";
  }
  if (group === "fx") return "glow";
  if (signature.includes("calligraphy") || signature.includes("ribbon")) {
    return "calligraphy";
  }
  return "wavy";
}

function shortName(label: string): string {
  const compact = label.replace(/^Mixbox\s*/u, "").replace(/\s+/gu, "");
  return compact.slice(0, 7) || label.slice(0, 7);
}

export const STUDIO_V6_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze(
    BRUSH_STUDIO_V6_RECIPE_SEEDS.map((seed) => {
      const slots = slotStrings(seed);
      const mediaGroup = studioV6BrushMaterialGroup(seed);
      const authoredWidth = seed.delta.tuning?.size ?? 18;
      const width = studioBrushDefaultStartWidth(mediaGroup, authoredWidth);
      const opacity = seed.delta.tuning?.opacity ?? 0.95;
      const defaultColor = seed.delta.tuning?.primaryColor ?? "#111827";
      const signature = `${seed.id} ${seed.group} ${slots.join(" ")}`
        .toLocaleLowerCase("ko-KR");
      return Object.freeze({
        id: studioV6BrushCatalogId(seed.id),
        runtimeBrushId: "brush",
        name: seed.label,
        shortName: shortName(seed.label),
        hint: seed.description,
        searchAliases: Object.freeze(Array.from(new Set([
          seed.group,
          "차세대",
          "차세대 브러시",
          "V6",
          "material engine",
          "무폴백",
          seed.delta.qualityGoal ?? "",
          seed.delta.deviceProfile ?? "",
          ...slots,
        ].filter(Boolean)))),
        defaultWidth: width,
        defaultOpacity: opacity,
        defaultColor,
        operation: "paint" as const,
        category: "expressive" as const,
        mediaGroup,
        previewWeight: Math.min(1, Math.max(0.22, width / 72)),
        previewStyle: previewStyleFor(mediaGroup, signature),
        source: "pro" as const,
      });
    }),
  );

export const STUDIO_V6_BRUSH_CATALOG_COUNT = STUDIO_V6_BRUSH_CATALOG_ITEMS.length;

const STUDIO_V6_BRUSH_CATALOG_BY_ID = new Map(
  STUDIO_V6_BRUSH_CATALOG_ITEMS.map((item) => [item.id, item]),
);

export function studioV6BrushCatalogItemById(
  catalogId: unknown,
): StudioBrushCatalogItem | null {
  return typeof catalogId === "string"
    ? STUDIO_V6_BRUSH_CATALOG_BY_ID.get(catalogId) ?? null
    : null;
}
