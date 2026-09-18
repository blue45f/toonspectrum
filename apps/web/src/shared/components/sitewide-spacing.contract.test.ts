import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { supportsRoutePurposeScene } from "./site-experience/site-experience-policy";

const pwaComponent = readFileSync(new URL("./pwa-install-nudge.tsx", import.meta.url), "utf8");
const pwaCss = readFileSync(new URL("./pwa-install-nudge.css", import.meta.url), "utf8");
const homePage = readFileSync(new URL("../../domains/marketing/CreatorHomePage.tsx", import.meta.url), "utf8");
const homeExperience = readFileSync(new URL("../../domains/marketing/CreatorHomeExperience.tsx", import.meta.url), "utf8");
const homeSpacingCss = readFileSync(new URL("../../domains/marketing/creator-home-spacing.css", import.meta.url), "utf8");

describe("install prompt and creator home spacing contracts", () => {
  it("keeps the install prompt inside dynamic viewport and safe-area bounds", () => {
    expect(pwaComponent).toContain('data-pwa-install-nudge="true"');
    expect(pwaComponent).toContain('data-surface={pathname === "/" ? "home" : "route"}');
    expect(pwaComponent).toContain('import "./pwa-install-nudge.css"');
    expect(pwaCss).toContain("--site-header-height");
    expect(pwaCss).toContain("100dvh");
    expect(pwaCss).toContain("100dvw");
    expect(pwaCss).toContain("env(safe-area-inset-top)");
    expect(pwaCss).toContain("env(safe-area-inset-bottom)");
    expect(pwaCss).toContain('[data-surface="home"]');
    expect(pwaCss).toContain("--pwa-install-mobile-nav-offset: 5.5rem");
    expect(pwaCss).toContain("bottom: calc(var(--pwa-install-mobile-nav-offset) + env(safe-area-inset-bottom))");
    expect(pwaCss).toContain("overflow-y: auto");
    expect(pwaCss).toContain("@media (max-width: 360px)");
    expect(pwaCss).toContain("@media (max-width: 640px) and (max-height: 420px)");
    expect(pwaCss).toContain("grid-template-columns: minmax(0, 1fr) auto auto");
  });

  it("preserves contrast, forced-color and reduced-motion behavior", () => {
    expect(pwaCss).toContain(':root[data-design-theme="contrast"]');
    expect(pwaCss).toContain("prefers-contrast: more");
    expect(pwaCss).toContain("forced-colors: active");
    expect(pwaCss).toContain("prefers-reduced-motion: reduce");
  });

  it("uses one responsive spacing rhythm for both creator-home implementations", () => {
    expect(homePage).toContain('import "./creator-home-spacing.css"');
    expect(homePage.indexOf("creator-film.css")).toBeLessThan(homePage.indexOf("creator-home-spacing.css"));
    expect(homeExperience).toContain('import "./creator-home-spacing.css"');
    expect(homeExperience.indexOf('className="cf-hero cf-shell"')).toBeLessThan(
      homeExperience.indexOf('className="cf-shell cf-home-wayfinding"'),
    );
    expect(homeExperience).not.toContain("<CreatorHomeNavigation");
    expect(homeSpacingCss).toContain("--ch-page-gutter");
    expect(homeSpacingCss).toContain("--cf-shell-inline-total");
    expect(homeSpacingCss).toContain(".cf-hero {");
    expect(homeSpacingCss).toContain("margin-inline: auto");
    expect(homeSpacingCss).toContain("env(safe-area-inset-left)");
    expect(homeSpacingCss).toContain("@media (max-width: 390px)");
  });

  it("does not stack a generic route card above the visual home hero", () => {
    expect(supportsRoutePurposeScene("/")).toBe(false);
    expect(supportsRoutePurposeScene("/discover")).toBe(true);
    expect(supportsRoutePurposeScene("/studio/new")).toBe(true);
    expect(supportsRoutePurposeScene("/studio/canvas")).toBe(false);
  });
});
