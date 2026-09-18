import { describe, expect, it } from "vitest";

import {
  SITE_ROUTE_VISUAL_KINDS,
  resolveSiteRouteVisual,
  resolveSiteRouteVisualKind,
} from "./site-route-visual";

const EXPECTED = [
  ["/", "workflow"],
  ["/discover", "discover"],
  ["/studio/new", "create"],
  ["/story-lab", "planning"],
  ["/studio/bg3d", "spatial"],
  ["/market/browse", "assets"],
  ["/production/projects/demo/schedule", "production"],
  ["/production/projects/demo/review", "review"],
  ["/studio/p/demo/story", "planning"],
  ["/studio/p/demo/production", "production"],
  ["/studio/p/demo/assets", "assets"],
  ["/studio/p/demo/review", "review"],
  ["/studio/p/demo/export", "publish"],
  ["/studio/publish", "publish"],
  ["/studio/manual/getting-started", "learn"],
  ["/learn/studio", "learn"],
  ["/community/cafes", "connect"],
  ["/settings", "manage"],
  ["/accessibility", "trust"],
  ["/fortune", "play"],
] as const;

describe("site route visual grammar", () => {
  it.each(EXPECTED)("maps %s to %s", (path, kind) => {
    expect(resolveSiteRouteVisualKind(path)).toBe(kind);
    expect(resolveSiteRouteVisual(path).kind).toBe(kind);
  });

  it("gives every visual kind a complete image and three-step story", () => {
    const profiles = SITE_ROUTE_VISUAL_KINDS.map((kind) => resolveSiteRouteVisual(
      EXPECTED.find(([, expected]) => expected === kind)?.[0] ?? "/discover",
    ));
    expect(new Set(profiles.map((profile) => profile.kind))).toEqual(new Set(SITE_ROUTE_VISUAL_KINDS));
    for (const profile of profiles) {
      expect(profile.image).toMatch(/^\//u);
      expect(profile.layers).toHaveLength(3);
      expect(profile.layers.every((layer) => layer.length > 0)).toBe(true);
    }
  });

  it("uses Remotion-rendered chapter loops only as progressive enhancement with a poster image", () => {
    for (const path of ["/studio/new", "/story-lab", "/read/spatial", "/production", "/reviews", "/showcase", "/play"]) {
      const profile = resolveSiteRouteVisual(path);
      expect(profile.video?.src).toMatch(/\.mp4$/u);
      expect(profile.video?.src).toBe("/brand/toonstudio-route-header.mp4");
      expect(profile.video?.poster).toMatch(/^\/brand\/toonstudio-route-header-(?:0|6|12|18)\.jpg$/u);
      expect(profile.video?.endSeconds).toBeGreaterThan(profile.video?.startSeconds ?? 24);
      expect(profile.video?.endSeconds).toBeLessThanOrEqual(24);
      expect(profile.image).toBeTruthy();
    }
  });
});
