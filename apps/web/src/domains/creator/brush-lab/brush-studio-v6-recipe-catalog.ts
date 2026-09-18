import { BRUSH_STUDIO_V6_TOPOLOGIES } from "./brush-studio-v6-topology-catalog";
import { BRUSH_STUDIO_V6_CORE_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog-core";
import { BRUSH_STUDIO_V6_MIXBOX_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog-mixbox";
import { BRUSH_STUDIO_V6_SHOWCASE_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog-showcase";
import { BRUSH_STUDIO_V7_MATERIAL_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog-material-v7";
import { BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS } from "./brush-studio-v6-recipe-catalog-material-v7-advanced";
import { defineBrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

export type { BrushStudioV6RecipeSeed } from "./brush-studio-v6-recipe-types";

export const BRUSH_STUDIO_V6_RECIPE_SEEDS = Object.freeze([
  ...BRUSH_STUDIO_V6_CORE_RECIPE_SEEDS,
  ...BRUSH_STUDIO_V6_SHOWCASE_RECIPE_SEEDS,
  ...BRUSH_STUDIO_V7_MATERIAL_RECIPE_SEEDS,
  ...BRUSH_STUDIO_V7_ADVANCED_RECIPE_SEEDS,
  ...BRUSH_STUDIO_V6_MIXBOX_RECIPE_SEEDS,
  ...BRUSH_STUDIO_V6_TOPOLOGIES.map((entry) => defineBrushStudioV6RecipeSeed(
    entry.recipeId,
    entry.label,
    entry.group ?? "획 구조·물리",
    entry.description,
    {
      slots: {
        motion: "motion-direct",
        carrier: entry.id,
        surface: "surface-kent",
        pigment: "pigment-spectral",
      },
      tuning: entry.tuning,
    },
  )),
]);
