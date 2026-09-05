import { svgToDataUrl } from "./studio-characters";

import type { Studio2dScene } from "./studio-2d-asset-quality";

import { resolveAssetUrl } from "@/src/catalog-static";

export function studio2dImageSource(scene: Studio2dScene): string {
  return resolveAssetUrl(scene.imgSrc || svgToDataUrl(scene.svg || ""));
}
