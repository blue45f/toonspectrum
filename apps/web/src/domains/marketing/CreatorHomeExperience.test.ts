import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const EXPERIENCE_SOURCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const EXPERIENCE_STYLES = "apps/web/src/domains/marketing/creator-home-experience.css";
const FLAGSHIP_STYLES = "apps/web/src/domains/marketing/creator-flagship.css";
const THEME_ART_SOURCE = "apps/web/src/domains/marketing/creator-theme-art.ts";
const THEME_SCENES_SOURCE = "apps/web/src/shared/lib/theme-scene-assets.ts";
const THEME_ART_STYLES = "apps/web/src/domains/marketing/creator-theme-gallery.css";
const ROOT_HOME_SOURCE = "apps/web/src/domains/creator-resources/CreatorHomePage.tsx";
const APP_SHELL_SOURCE = "apps/web/src/app/AppShell.tsx";
const APP_ENTRY_SOURCE = "apps/web/src/app/main.tsx";

describe("creator home experience contracts", () => {
  it("renders one coherent root experience instead of appending a second homepage", () => {
    const source = readFileSync(ROOT_HOME_SOURCE, "utf8");
    expect(source).toContain("<CreatorHomeExperience />");
    expect(source).not.toContain("CreatorHubEntry");
  });

  it("keeps the public home focused on starting, continuing, and understanding the core workflow", () => {
    const source = readFileSync(EXPERIENCE_SOURCE, "utf8");
    expect(source).toContain('id="creator-start"');
    expect(source).toContain('id="creator-flow"');
    expect(source).toContain('id="creator-toolkit-title"');
    expect(source).toContain('id="creator-process-title"');
    expect(source).toContain('data-creator-home="production-first"');
    expect(source).toContain("<ProductIntentStart />");
    expect(source).toContain('href="/studio/new"');
    expect(source).toContain('href="/studio/projects"');
    expect(source).toContain('href: "/discover"');
    expect(source).toContain('href: "/learn"');
    expect(source).toContain('href: "/collaborate"');
    expect(source).toContain('href="/production"');
    expect(source).toContain('data-creator-experience="production-os-v2"');
    expect(source).toContain('/brand/production-os-hero.svg');
    expect(source).toContain('/brand/production-os-workspace.svg');
    expect(source).toContain('/brand/production-os-journey.svg');
  });

  it("does not make heavyweight demos, readiness diagnostics, or film playback part of first load", () => {
    const source = readFileSync(EXPERIENCE_SOURCE, "utf8");
    for (const heavyweight of [
      "AtelierWorkbenchDemo",
      "CreatorBrandFilm",
      "CreatorLaunchpad",
      "CreatorReferenceSearch",
      "CreatorWorkspaceReadiness",
    ]) {
      expect(source).not.toContain(heavyweight);
    }
    expect(source.match(/<img\b/gu)).toHaveLength(3);
    expect(source).toContain('loading="lazy"');
    expect(source).not.toMatch(/from ["'](?:remotion|@remotion|.*StudioPage)/u);
  });

  it("assigns every design theme a distinct local scene instead of recolouring one hero", () => {
    const source = readFileSync(THEME_ART_SOURCE, "utf8");
    const scenes = readFileSync(THEME_SCENES_SOURCE, "utf8");
    for (const theme of ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast"]) {
      expect(source).toContain(`${theme}: direction("${theme}"`);
    }
    const scenePaths = [...scenes.matchAll(/src: "(\/brand\/theme-scenes\/[^"]+\.svg)"/gu)].map((match) => match[1]);
    expect(scenePaths).toHaveLength(9);
    expect(new Set(scenePaths).size).toBe(9);
    for (const path of scenePaths) expect(existsSync(`apps/web/public${path}`)).toBe(true);
    expect(source).toContain("/brand/atelier-world.webp");
    expect(source).toContain("/brand/atelier-process.webp");
    expect(source).toContain("/brand/atelier-materials.webp");
    expect(`${source}\n${scenes}`).not.toMatch(/https?:\/\//u);
  });

  it("tracks allow-listed destinations and captures installability before render", () => {
    const shell = readFileSync(APP_SHELL_SOURCE, "utf8");
    const entry = readFileSync(APP_ENTRY_SOURCE, "utf8");
    expect(shell).toContain("<CreatorContinuityTracker />");
    expect(shell).toContain("recordCreatorDestination(pathname, search)");
    expect(shell).toContain("<PwaInstallNudge />");
    expect(entry).toContain("initializePwaInstallCapture();");
    expect(entry).toContain("initializeCreatorContinuity();");
    expect(entry.indexOf("initializePwaInstallCapture();")).toBeLessThan(entry.indexOf("createRoot("));
  });

  it("keeps responsive, dark-mode, focus and reduced-motion affordances in the visual system", () => {
    const styles = readFileSync(EXPERIENCE_STYLES, "utf8");
    const flagship = readFileSync(FLAGSHIP_STYLES, "utf8");
    const themeArt = readFileSync(THEME_ART_STYLES, "utf8");
    expect(flagship).toContain('html[data-theme="dark"] .creator-home.creator-experience');
    expect(flagship).toContain(":focus-visible");
    expect(flagship).toContain("@media (max-width: 720px)");
    expect(flagship).toContain("@media (prefers-reduced-motion: reduce)");
    expect(flagship).toContain(".cf-start-grid");
    expect(flagship).toContain(".cf-bridge");
    expect(flagship).toContain(".cf-flow-grid");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeArt).toContain('data-theme-art="aurora"');
    expect(themeArt).toContain('data-theme-art="blossom"');
    expect(themeArt).toContain('data-theme-art="starlight"');
    expect(themeArt).toContain(".cf-theme-scene-image");
    expect(themeArt).toContain("data-theme-layout=\"blossom\"");
    expect(themeArt).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeArt).toContain("@media (prefers-contrast: more), (forced-colors: active)");
  });
});
