import { BRUSH_QUALITY_CATALOG } from "./brush-studio-v5-quality-catalog";
import {
  BRUSH_STUDIO_V6_RECIPES,
  createBrushStudioV6Program,
  type BrushStudioV6Program,
} from "./brush-studio-v6-engine";
import type { BrushCatalogEntry } from "./brush-studio-v5-quality-types";

export const BRUSH_STUDIO_V6_RECIPE_IDS: readonly string[] = Object.freeze(
  BRUSH_STUDIO_V6_RECIPES.map((recipe) => recipe.id),
);

function has(entry: BrushCatalogEntry, pattern: RegExp): boolean {
  return pattern.test(`${entry.id} ${entry.name} ${entry.signature}`);
}

/** Selects the closest shipped V6 starting point without claiming byte-identical migration. */
export function resolveLegacyBrushV6RecipeId(entry: BrushCatalogEntry): string {
  if (entry.group === "선화·잉크·마커") {
    if (has(entry, /alcohol|알코올/iu)) return "alcohol-bloom";
    if (has(entry, /calligraphy|natural-ink|캘리|자연 잉크/iu)) return "natural-calligraphy";
    if (has(entry, /gpen|g펜/iu)) return "manga-gpen";
    return "clean-ink";
  }
  if (entry.group === "연필·목탄·건식") {
    return has(entry, /charcoal|목탄/iu) ? "eroding-charcoal" : "velvet-graphite";
  }
  if (entry.group === "수채·Inkwash·수묵") {
    if (has(entry, /wax|리지스트/iu)) return "wax-resist";
    if (has(entry, /sumi|ink|수묵|먹/iu)) return "chroma-sumi";
    return "mineral-bloom";
  }
  if (entry.group === "과슈·아크릴·유화") {
    return has(entry, /impasto|knife|tube|나이프|압출|임파스토/iu)
      ? "impasto-knife"
      : "oil-hair-mixer";
  }
  if (entry.group === "에어·입자·FX") {
    if (has(entry, /dendritic|덴드라이트/iu)) return "dendritic-copper";
    if (has(entry, /splatter|particle|스플래터|입자/iu)) return "kaleido-swarm";
    return "dripping-neon";
  }
  if (has(entry, /stitch|스티치/iu)) return "holographic-stitch";
  if (has(entry, /foliage|fabric|brick|fur|폴리지|패브릭|브릭|퍼/iu)) return "moss-flow";
  if (has(entry, /kaleido|swarm|spiro|rainbow|scatter|칼레이도|스웜|스파이로|레인보우|스캐터/iu)) {
    return "kaleido-swarm";
  }
  return "document-halftone";
}

export interface BrushStudioRequestedRecipe {
  readonly recipeId: string;
  readonly legacyBrushId: string | null;
  readonly program: BrushStudioV6Program;
}

export function resolveBrushStudioRequestedRecipe(search: string): BrushStudioRequestedRecipe | null {
  const params = new URLSearchParams(search);
  if (params.get("applyRecipe") !== "1") return null;
  const recipeId = params.get("recipe");
  if (!recipeId || !BRUSH_STUDIO_V6_RECIPE_IDS.includes(recipeId)) return null;
  const legacyBrushId = params.get("legacyBrush");
  if (legacyBrushId && !BRUSH_QUALITY_CATALOG.some((entry) => entry.id === legacyBrushId)) return null;
  return Object.freeze({
    recipeId,
    legacyBrushId,
    program: createBrushStudioV6Program(recipeId),
  });
}

export function brushStudioV6StorageKey(scope: string): string {
  return `toonspectrum.brush-program-v6:${encodeURIComponent(scope)}`;
}

export function auditBrushStudioVersionIntegration(): readonly string[] {
  const recipes = new Set(BRUSH_STUDIO_V6_RECIPE_IDS);
  return Object.freeze(
    BRUSH_QUALITY_CATALOG
      .map((entry) => ({ entry, recipeId: resolveLegacyBrushV6RecipeId(entry) }))
      .filter(({ recipeId }) => !recipes.has(recipeId))
      .map(({ entry, recipeId }) => `${entry.id} maps to missing V6 recipe ${recipeId}`),
  );
}
