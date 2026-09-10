import { describe, expect, it } from "vitest";

import { isStudioVrmProductionThumbnailUrl } from "./studio-vrm-thumbnail-quality";

describe("VRM thumbnail path security", () => {
  it.each([
    "/assets/3d/characters/thumbnails/%2E%2E/model.png",
    "/assets/3d/characters/thumbnails/%2e/hero.png",
    "/assets/3d/characters/thumbnails/folder//hero.png",
    "/assets/3d/characters/thumbnails/hero%00.png",
    "/assets/3d/characters/thumbnails/hero%0a.png",
    "/assets/3d/characters/thumbnails/%E0%A4%A.png",
  ])("rejects traversal, control characters and malformed encoding: %s", (url) => {
    expect(isStudioVrmProductionThumbnailUrl(url)).toBe(false);
  });
});
