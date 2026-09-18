import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { resolveSiteRouteVisual } from "@/shared/lib/site-route-visual";

const component = readFileSync(new URL("./RoutePurposeScene.tsx", import.meta.url), "utf8");
const routeCss = readFileSync(new URL("./route-purpose-scene.css", import.meta.url), "utf8");
const systemCss = readFileSync(new URL("../../styles/sitewide-visual-ux.css", import.meta.url), "utf8");
const experienceCss = readFileSync(new URL("./site-experience/site-experience.css", import.meta.url), "utf8");
const choreographyCss = readFileSync(new URL("./site-experience/site-theme-choreography.css", import.meta.url), "utf8");
const entry = readFileSync(new URL("../../app/main.tsx", import.meta.url), "utf8");

const REPRESENTATIVE_PATHS = [
  "/", "/discover", "/studio/new", "/story-lab", "/studio/bg3d",
  "/market", "/production", "/reviews", "/showcase", "/learn",
  "/community", "/settings", "/accessibility", "/play",
] as const;

describe("site-wide visual UX contracts", () => {
  it("loads layout and contrast hardening after the theme tokens", () => {
    expect(entry).toContain('import "../styles/sitewide-visual-ux.css"');
    expect(entry.indexOf("design-themes.css")).toBeLessThan(entry.indexOf("sitewide-visual-ux.css"));
    expect(systemCss).toContain("--site-page-gutter");
    expect(systemCss).toContain("overflow-x: clip");
  });

  it("keeps every visual asset local and available", () => {
    for (const pathname of REPRESENTATIVE_PATHS) {
      const profile = resolveSiteRouteVisual(pathname);
      const image = fileURLToPath(new URL(`../../../public${profile.image}`, import.meta.url));
      expect(existsSync(image), `${profile.kind}: ${profile.image}`).toBe(true);
      if (profile.video) {
        const landscape = fileURLToPath(new URL(`../../../public${profile.video.src}`, import.meta.url));
        const portrait = fileURLToPath(new URL(`../../../public${profile.video.portraitSrc}`, import.meta.url));
        expect(existsSync(landscape)).toBe(true);
        expect(existsSync(portrait)).toBe(true);
      }
    }
  });

  it("treats video and 3D motion as accessible progressive enhancement", () => {
    expect(component).toContain("useAtelierMotion");
    expect(component).toContain("videoFailed");
    expect(component).toContain('data-ready={videoReady ? "true" : "false"}');
    expect(routeCss).toContain('video[data-ready="true"]');
    expect(component).toContain("aria-label={paused");
    expect(component).not.toMatch(/from ["'](?:remotion|@remotion)/u);
    expect(routeCss).toContain("perspective: 1050px");
    expect(routeCss).toContain("prefers-reduced-motion: reduce");
    expect(routeCss).toContain("forced-colors: active");
  });

  it("gives the explicit contrast theme the same clarity as OS contrast modes", () => {
    expect(routeCss).toContain(':root[data-design-theme="contrast"] .route-purpose-scene');
    expect(systemCss).toContain(':root[data-design-theme="contrast"] :focus-visible');
    expect(systemCss).toContain("prefers-contrast: more");
    expect(systemCss).toContain("forced-colors: active");
    expect(systemCss).toContain('[data-auth-modal="true"]');
    expect(experienceCss).toContain(':root[data-design-theme="contrast"] [data-site-experience]');
    expect(choreographyCss).toContain(':root[data-design-theme="contrast"] [data-site-experience] .site-theme-mosaic');
  });

  it("keeps public visuals out of editor routes through the shared policy", () => {
    expect(component).not.toContain("StudioPage");
    expect(component).not.toContain("three");
    expect(component).not.toContain("@react-three");
  });
});
