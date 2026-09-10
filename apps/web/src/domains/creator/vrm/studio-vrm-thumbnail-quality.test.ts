import { describe, expect, it } from "vitest";

import { isStudioVrmProductionThumbnailUrl } from "./studio-vrm-thumbnail-quality";

describe("VRM production thumbnail URL admission", () => {
  it.each([
    "/assets/3d/characters/thumbnails/lumi.png",
    "/assets/3d/characters/thumbnails/quaternius/ranger.webp",
    "/assets/3d/characters/thumbnails/hero.JPEG",
  ])("accepts a deployment-owned image: %s", (url) => {
    expect(isStudioVrmProductionThumbnailUrl(url)).toBe(true);
  });

  it.each([
    null,
    "",
    "data:image/svg+xml;base64,AAA",
    "blob:https://toonstudio.cloud/example",
    "/vrm/thumbnails/legacy.png",
    "/assets/3d/characters/thumbnails/../models/hero.vrm",
    "/assets/3d/characters/thumbnails/%2e%2e/models/hero.png",
    "/assets/3d/characters/thumbnails/%2E/hero.png",
    "/assets/3d/characters/thumbnails/./hero.png",
    "/assets/3d/characters/thumbnails/folder//hero.png",
    "/assets/3d/characters/thumbnails/hero.svg",
    "/assets/3d/characters/thumbnails/hero.png?cache=1",
    "/assets/3d/characters/thumbnails/hero.png#fragment",
    "/assets/3d/characters/thumbnails/hero%3fquery.png",
    "/assets/3d/characters/thumbnails/hero%23fragment.png",
    "/assets/3d/characters/thumbnails\\hero.png",
    "/assets/3d/characters/thumbnails/hero%5cimage.png",
    "/assets/3d/characters/thumbnails/hero%00.png",
    "/assets/3d/characters/thumbnails/hero%0a.png",
    "/assets/3d/characters/thumbnails/%E0%A4%A.png",
  ])("rejects non-production or unsafe discovery art: %s", (url) => {
    expect(isStudioVrmProductionThumbnailUrl(url)).toBe(false);
  });
});
