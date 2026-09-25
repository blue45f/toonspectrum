import { describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_PLACES,
  studioVirtualPlacesForMode,
} from "./studio-virtual-space-place-catalog";

describe("Virtual Studio place catalog", () => {
  it("binds every place to a bundled ImageGen 2.5 preview and existing room", () => {
    expect(STUDIO_VIRTUAL_PLACES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(STUDIO_VIRTUAL_PLACES.map((item) => item.id)).size).toBe(STUDIO_VIRTUAL_PLACES.length);
    for (const place of STUDIO_VIRTUAL_PLACES) {
      expect(place.previewUrl).toMatch(/^\/assets\/virtual-studio\/imagegen25-v7\/places\/[a-z0-9-]+\.webp$/u);
      expect(place.roomId.length).toBeGreaterThan(0);
    }
  });

  it("removes project-only rooms from personal mode", () => {
    expect(studioVirtualPlacesForMode(true).some((item) => item.projectOnly)).toBe(false);
    expect(studioVirtualPlacesForMode(false).some((item) => item.projectOnly)).toBe(true);
  });
});
