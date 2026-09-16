import { getThemeSceneAsset, type ThemeSceneAsset } from "@/shared/lib/theme-scene-assets";
import type { DesignTheme } from "@/shared/lib/theme-presets";

export type CreatorArtAssetId = "world" | "process" | "materials";

export interface CreatorArtAsset {
  id: CreatorArtAssetId;
  src: string;
  srcSet: string;
}

export interface CreatorThemeArtDirection {
  scene: ThemeSceneAsset;
  hero: CreatorArtAsset;
  companions: readonly [CreatorArtAsset, CreatorArtAsset];
  process: CreatorArtAsset;
  closing: CreatorArtAsset;
  tools: readonly [CreatorArtAssetId, CreatorArtAssetId, CreatorArtAssetId];
}

export const CREATOR_ART_ASSETS: Readonly<Record<CreatorArtAssetId, CreatorArtAsset>> = {
  world: {
    id: "world",
    src: "/brand/atelier-world.webp",
    srcSet: "/brand/atelier-world-640.webp 640w, /brand/atelier-world-960.webp 960w, /brand/atelier-world.webp 1536w",
  },
  process: {
    id: "process",
    src: "/brand/atelier-process.webp",
    srcSet: "/brand/atelier-process-640.webp 640w, /brand/atelier-process-960.webp 960w, /brand/atelier-process.webp 1536w",
  },
  materials: {
    id: "materials",
    src: "/brand/atelier-materials.webp",
    srcSet: "/brand/atelier-materials-640.webp 640w, /brand/atelier-materials-960.webp 960w, /brand/atelier-materials.webp 1536w",
  },
};

const direction = (
  theme: DesignTheme,
  hero: CreatorArtAssetId,
  companions: readonly [CreatorArtAssetId, CreatorArtAssetId],
  process: CreatorArtAssetId,
  closing: CreatorArtAssetId,
  tools: readonly [CreatorArtAssetId, CreatorArtAssetId, CreatorArtAssetId],
): CreatorThemeArtDirection => ({
  scene: getThemeSceneAsset(theme),
  hero: CREATOR_ART_ASSETS[hero],
  companions: [CREATOR_ART_ASSETS[companions[0]], CREATOR_ART_ASSETS[companions[1]]],
  process: CREATOR_ART_ASSETS[process],
  closing: CREATOR_ART_ASSETS[closing],
  tools,
});

/** Every theme receives a unique scene plus local licensed studies for supporting collage depth. */
export const CREATOR_THEME_ART: Readonly<Record<DesignTheme, CreatorThemeArtDirection>> = {
  aurora: direction("aurora", "world", ["process", "materials"], "process", "world", ["materials", "world", "process"]),
  blossom: direction("blossom", "process", ["world", "materials"], "world", "process", ["process", "materials", "world"]),
  starlight: direction("starlight", "world", ["materials", "process"], "materials", "world", ["world", "materials", "process"]),
  dark: direction("dark", "world", ["process", "materials"], "process", "world", ["world", "process", "materials"]),
  light: direction("light", "process", ["materials", "world"], "world", "materials", ["process", "world", "materials"]),
  graphite: direction("graphite", "materials", ["process", "world"], "process", "materials", ["materials", "process", "world"]),
  midnight: direction("midnight", "world", ["materials", "process"], "materials", "world", ["world", "materials", "process"]),
  sepia: direction("sepia", "process", ["world", "materials"], "world", "process", ["process", "world", "materials"]),
  contrast: direction("contrast", "materials", ["world", "process"], "process", "world", ["materials", "world", "process"]),
};

export function getCreatorThemeArt(theme: DesignTheme): CreatorThemeArtDirection {
  return CREATOR_THEME_ART[theme];
}

export function creatorToolAsset(directionForTheme: CreatorThemeArtDirection, index: number): CreatorArtAsset {
  const key = directionForTheme.tools[index % directionForTheme.tools.length] ?? directionForTheme.tools[0];
  return CREATOR_ART_ASSETS[key];
}
