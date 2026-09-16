import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { THEME_SCENE_ASSETS } from "../theme-scene-assets";
import { THEME_IDS } from "../theme-presets";

const publicRoot = join(process.cwd(), "apps/web/public");

function assetFile(src: string): string {
  expect(src.startsWith("/")).toBe(true);
  expect(src.includes("..")).toBe(false);
  return join(publicRoot, src);
}

describe("theme scene assets", () => {
  it("keeps a unique scene, motif strip and motion profile for every selectable theme", () => {
    const assets = THEME_IDS.map((theme) => THEME_SCENE_ASSETS[theme]);

    expect(Object.keys(THEME_SCENE_ASSETS).sort()).toEqual([...THEME_IDS].sort());
    expect(new Set(assets.map((asset) => asset.src)).size).toBe(THEME_IDS.length);
    expect(new Set(assets.map((asset) => asset.motifSrc)).size).toBe(THEME_IDS.length);
    expect(new Set(assets.map((asset) => asset.motion)).size).toBe(THEME_IDS.length);
  });

  it("ships each decorative motif as a local three-panel SVG strip", () => {
    for (const theme of THEME_IDS) {
      const asset = THEME_SCENE_ASSETS[theme];
      const file = assetFile(asset.motifSrc);

      expect(existsSync(file)).toBe(true);
      const svg = readFileSync(file, "utf8");
      expect(svg).toContain('viewBox="0 0 1200 400"');
      expect(svg.match(/data-panel="[123]"/gu)).toHaveLength(3);
      expect(svg).not.toMatch(/<script|<foreignObject|(?:href|src)=["']https?:\/\//iu);
    }
  });
});
