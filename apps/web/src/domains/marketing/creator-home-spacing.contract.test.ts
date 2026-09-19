import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const homeExperience = readFileSync(new URL("./CreatorHomeExperience.tsx", import.meta.url), "utf8");
const legacyHome = readFileSync(new URL("./CreatorHomePage.tsx", import.meta.url), "utf8");
const spacingCss = readFileSync(new URL("./creator-home-spacing.css", import.meta.url), "utf8");
const installPrompt = readFileSync(
  new URL("../../shared/components/pwa-install-nudge.tsx", import.meta.url),
  "utf8",
);
const installCss = readFileSync(
  new URL("../../shared/components/pwa-install-nudge.css", import.meta.url),
  "utf8",
);

describe("creator home spacing and app install prompt contracts", () => {
  it("renders the product hero before secondary navigation and intent tools", () => {
    expect(homeExperience).not.toContain("<CreatorHomeNavigation");
    expect(homeExperience).toContain('className="cf-shell cf-home-wayfinding"');
    expect(homeExperience.indexOf('className="cf-hero cf-shell"')).toBeLessThan(
      homeExperience.indexOf('className="cf-shell cf-home-wayfinding"'),
    );
    expect(homeExperience).toContain("<ProductIntentStart />");
    expect(homeExperience).toContain('<CreatorSectionLink sectionId="creator-principles">');
  });

  it("loads the final spacing layer after each home implementation's base styles", () => {
    expect(homeExperience).toContain('import "./creator-home-spacing.css"');
    expect(homeExperience.indexOf("creator-all-in-one.css")).toBeLessThan(
      homeExperience.indexOf("creator-home-spacing.css"),
    );
    expect(legacyHome).toContain('import "./creator-home-spacing.css"');
    expect(legacyHome.indexOf("creator-film.css")).toBeLessThan(
      legacyHome.indexOf("creator-home-spacing.css"),
    );
  });

  it("keeps the hero centered with fluid safe-area gutters and a shared section rhythm", () => {
    expect(spacingCss).toContain("--cf-shell-inline-total");
    expect(spacingCss).toContain("--cf-section-space");
    expect(spacingCss).toContain("env(safe-area-inset-left)");
    expect(spacingCss).toContain("env(safe-area-inset-right)");
    expect(spacingCss).toMatch(/\.cf-hero\s*\{[\s\S]*?margin-inline:\s*auto/u);
    expect(spacingCss).toContain("@media (max-width: 720px)");
    expect(spacingCss).toContain(":root[data-design-theme=\"contrast\"]");
  });

  it("keeps the install prompt within dynamic viewport and safe-area bounds", () => {
    expect(installPrompt).toContain('import "./pwa-install-nudge.css"');
    expect(installPrompt).toContain('data-pwa-install-nudge="true"');
    expect(installPrompt).toContain('data-surface={pathname === "/" ? "home" : "route"}');
    expect(installCss).toContain("--site-header-height");
    expect(installCss).toContain("100dvh");
    expect(installCss).toContain("100dvw");
    expect(installCss).toContain("overflow-y: auto");
    expect(installCss).toContain('[data-surface="home"]');
    expect(installCss).toContain("--pwa-install-mobile-nav-offset: 5.5rem");
    expect(installCss).toContain("bottom: calc(var(--pwa-install-mobile-nav-offset) + env(safe-area-inset-bottom))");
  });

  it("preserves contrast, forced-color and reduced-motion behavior", () => {
    expect(installCss).toContain(':root[data-design-theme="contrast"]');
    expect(installCss).toContain("prefers-contrast: more");
    expect(installCss).toContain("forced-colors: active");
    expect(installCss).toContain("prefers-reduced-motion: reduce");
  });
});
