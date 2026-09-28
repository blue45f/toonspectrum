import type { SiteRouteVisualKind } from "@/shared/lib/site-route-visual";

export const ILLUSTRATED_ARTWORKS = [
  "hero", "canvas-noir", "luna", "character-pink", "character-blue",
  "background-city", "project-romance", "project-crimson",
] as const;

export type IllustratedArtwork = (typeof ILLUSTRATED_ARTWORKS)[number];

/** 기존 페이지 시각 권위의 분류를 그대로 사용하며 경로를 다시 판정하지 않는다. */
export const ILLUSTRATED_VISUAL_ART: Readonly<Record<SiteRouteVisualKind, IllustratedArtwork>> = {
  workflow: "hero",
  discover: "project-crimson",
  create: "character-pink",
  planning: "canvas-noir",
  spatial: "background-city",
  assets: "character-blue",
  production: "canvas-noir",
  review: "canvas-noir",
  publish: "project-romance",
  learn: "background-city",
  connect: "project-romance",
  manage: "character-blue",
  trust: "hero",
  play: "luna",
};

export function illustratedArtworkSource(artwork: IllustratedArtwork): string {
  return `/brand/illustrated-20260928/${artwork}.webp`;
}
