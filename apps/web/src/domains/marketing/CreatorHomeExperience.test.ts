import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const EXPERIENCE_SOURCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const EXPERIENCE_STYLES = "apps/web/src/domains/marketing/creator-home-experience.css";
const FLAGSHIP_STYLES = "apps/web/src/domains/marketing/creator-flagship.css";
const THEME_ART_STYLES = "apps/web/src/domains/marketing/creator-theme-gallery.css";
const THEME_ART_SOURCE = "apps/web/src/domains/marketing/creator-theme-art.ts";
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
    expect(source).toContain('data-creator-home="studio-first"');
    expect(source).toContain("getCreatorThemeArt(resolvedTheme)");
    expect(source).toContain("data-theme-art={resolvedTheme}");
    expect(source).toContain("srcSet={artDirection.process.srcSet}");
    expect(source).toContain("<ProductIntentStart />");
    expect(source).toContain('href="/studio/new"');
    expect(source).toContain('href="/studio/projects"');
    expect(source).toContain('href: "/discover"');
    expect(source).toContain('href: "/learn"');
    expect(source).toContain('href: "/community"');
  });

  it("recomposes local brand studies for every design theme without remote artwork", () => {
    const source = readFileSync(THEME_ART_SOURCE, "utf8");
    for (const theme of ["aurora", "blossom", "starlight", "dark", "light", "graphite", "midnight", "sepia", "contrast"]) {
      expect(source).toContain(`${theme}: direction(`);
    }
    expect(source).toContain("atelier-world-640.webp");
    expect(source).toContain("atelier-process-960.webp");
    expect(source).toContain("atelier-materials.webp");
    expect(source).not.toMatch(/https?:\/\//u);
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
    expect(source.match(/<img\b/gu)).toHaveLength(1);
    expect(source).not.toMatch(/from ["'](?:remotion|@remotion|.*StudioPage)/u);
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
    const themeArtStyles = readFileSync(THEME_ART_STYLES, "utf8");
    expect(flagship).toContain('html[data-theme="dark"] .creator-home.creator-experience');
    expect(flagship).toContain(":focus-visible");
    expect(flagship).toContain("@media (max-width: 720px)");
    expect(flagship).toContain("@media (prefers-reduced-motion: reduce)");
    expect(flagship).toContain(".cf-start-grid");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeArtStyles).toContain('data-theme-art="aurora"');
    expect(themeArtStyles).toContain('data-theme-art="blossom"');
    expect(themeArtStyles).toContain('data-theme-art="starlight"');
    expect(themeArtStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeArtStyles).toContain("@media (prefers-contrast: more), (forced-colors: active)");
  });
});
