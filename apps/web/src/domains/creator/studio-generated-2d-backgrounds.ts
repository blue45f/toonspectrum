/** Aggregated generated 2D backgrounds. */

import { STUDIO_GENERATED_CITY_BG_SCENES } from "./studio-generated-2d-backgrounds-city";
import { STUDIO_GENERATED_GENRE_BG_SCENES } from "./studio-generated-2d-backgrounds-genre";
import { STUDIO_GENERATED_INTERIOR_BG_SCENES } from "./studio-generated-2d-backgrounds-interiors";

import type { BgScene } from "./studio-bg-scenes";

export const STUDIO_GENERATED_BG_SCENES: readonly BgScene[] = Object.freeze([
  ...STUDIO_GENERATED_CITY_BG_SCENES,
  ...STUDIO_GENERATED_GENRE_BG_SCENES,
  ...STUDIO_GENERATED_INTERIOR_BG_SCENES,
]);
