import type { DesignTheme } from "@/shared/lib/theme-presets";

export type CreatorArtAssetId = "world" | "process" | "materials";

export interface CreatorArtAsset {
  id: CreatorArtAssetId;
  src: string;
  srcSet: string;
}

export interface CreatorThemeArtDirection {
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
  hero: CreatorArtAssetId,
  companions: readonly [CreatorArtAssetId, CreatorArtAssetId],
  process: CreatorArtAssetId,
  closing: CreatorArtAssetId,
  tools: readonly [CreatorArtAssetId, CreatorArtAssetId, CreatorArtAssetId],
): CreatorThemeArtDirection => ({
  hero: CREATOR_ART_ASSETS[hero],
  companions: [CREATOR_ART_ASSETS[companions[0]], CREATOR_ART_ASSETS[companions[1]]],
  process: CREATOR_ART_ASSETS[process],
  closing: CREATOR_ART_ASSETS[closing],
  tools,
});

/** The same licensed brand studies are recomposed per theme; no remote image request is introduced. */
export const CREATOR_THEME_ART: Readonly<Record<DesignTheme, CreatorThemeArtDirection>> = {
  aurora: direction("world", ["process", "materials"], "process", "world", ["materials", "world", "process"]),
  blossom: direction("process", ["world", "materials"], "world", "process", ["process", "materials", "world"]),
  starlight: direction("world", ["materials", "process"], "materials", "world", ["world", "materials", "process"]),
  dark: direction("world", ["process", "materials"], "process", "world", ["world", "process", "materials"]),
  light: direction("process", ["materials", "world"], "world", "materials", ["process", "world", "materials"]),
  graphite: direction("materials", ["process", "world"], "process", "materials", ["materials", "process", "world"]),
  midnight: direction("world", ["materials", "process"], "materials", "world", ["world", "materials", "process"]),
  sepia: direction("process", ["world", "materials"], "world", "process", ["process", "world", "materials"]),
  contrast: direction("materials", ["world", "process"], "process", "world", ["materials", "world", "process"]),
};

export function getCreatorThemeArt(theme: DesignTheme): CreatorThemeArtDirection {
  return CREATOR_THEME_ART[theme];
}

export function creatorToolAsset(directionForTheme: CreatorThemeArtDirection, index: number): CreatorArtAsset {
  const key = directionForTheme.tools[index % directionForTheme.tools.length] ?? directionForTheme.tools[0];
  return CREATOR_ART_ASSETS[key];
}
