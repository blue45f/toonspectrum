import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const EXPERIENCE_SOURCE = "apps/web/src/domains/marketing/CreatorHomeExperience.tsx";
const EXPERIENCE_STYLES = "apps/web/src/domains/marketing/creator-home-experience.css";
const ALL_IN_ONE_STYLES = "apps/web/src/domains/marketing/creator-all-in-one.css";
const FLAGSHIP_STYLES = "apps/web/src/domains/marketing/creator-flagship.css";
const PRODUCT_IDENTITY_SOURCE = "apps/web/src/shared/lib/product-identity.ts";
const THEME_ART_SOURCE = "apps/web/src/domains/marketing/creator-theme-art.ts";
const THEME_SCENES_SOURCE = "apps/web/src/shared/lib/theme-scene-assets.ts";
const THEME_ART_STYLES = "apps/web/src/domains/marketing/creator-theme-gallery.css";
const ROOT_HOME_SOURCE = "apps/web/src/domains/creator-resources/CreatorHomePage.tsx";
const APP_SHELL_SOURCE = "apps/web/src/app/AppShell.tsx";
const APP_ENTRY_SOURCE = "apps/web/src/app/main.tsx";
const INDEX_SOURCE = "apps/web/index.html";
const MANIFEST_SOURCE = "apps/web/public/manifest.webmanifest";
const RIBBON_MANIFEST_SOURCE = "apps/web/public/brand/spectrum-ribbon-v2/manifest.webmanifest";
const LLMS_SOURCE = "apps/web/public/llms.txt";
const BUSINESS_SOURCE = "packages/core/src/business.ts";
const FOOTER_KO_SOURCE = "apps/web/public/i18n/app/footer/ko.json";

describe("creator home experience contracts", () => {
  it("renders one coherent root experience instead of appending a second homepage", () => {
    const source = readFileSync(ROOT_HOME_SOURCE, "utf8");
    expect(source).toContain("<CreatorHomeExperience />");
    expect(source).not.toContain("CreatorHubEntry");
  });

  it("presents the all-in-one product direction and task-first start points", () => {
    const source = readFileSync(EXPERIENCE_SOURCE, "utf8");
    const identity = readFileSync(PRODUCT_IDENTITY_SOURCE, "utf8");
    expect(source).toContain('id="creator-start"');
    expect(source).toContain('id="creator-flow"');
    expect(source).toContain('id="creator-principles"');
    expect(source).toContain('href="/about/principles"');
    expect(source).toContain("AI는 보조 도구로");
    expect(source).toContain('id="creator-toolkit-title"');
    expect(source).toContain('id="creator-process-title"');
    expect(source).toContain('data-creator-home="production-first"');
    expect(source).toContain('data-creator-experience="all-in-one-studio-v3"');
    expect(source).toContain("data-theme-art={resolvedTheme}");
    expect(source).toContain("useTheme((state) => state.resolvedTheme)");
    expect(source).toContain('import "./creator-theme-gallery.css"');
    expect(source).toContain('data-product-direction="planning-to-publishing"');
    expect(source).toContain("<ProductIntentStart />");
    expect(source).toContain('href="/studio/new"');
    expect(source).toContain('href="/studio/projects"');
    expect(source).toContain('href="/brand-film"');
    expect(source).toContain('href="/production"');
    expect(identity).toContain('href: "/story-lab"');
    expect(identity).toContain('href: "/studio/bg3d"');
    expect(identity).toContain('href: "/studio/assets"');
    expect(identity).toContain('href: "/studio/publish"');
    expect(identity).toContain("기획부터 연재까지");
    expect(identity).toContain("올인원 웹툰 제작 스튜디오");
    expect(`${source}\n${identity}`).not.toContain("그림은 익숙한 도구에서");
    expect(`${source}\n${identity}`).not.toContain("기존 드로잉 도구 그대로");
    expect(`${source}\n${identity}`).not.toContain("Keep your drawing tools");
  });

  it("keeps the first load lightweight and the explanatory artwork bounded", () => {
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
    expect(source).toContain('/brand/production-os-hero.svg');
    expect(source).toContain('/brand/production-os-workspace.svg');
    expect(source).toContain('/brand/production-os-journey.svg');
    expect(source).not.toMatch(/from ["'](?:remotion|@remotion|.*StudioPage)/u);
  });

  it("uses a dedicated anti-clipping, touch and accessibility contract", () => {
    const source = readFileSync(EXPERIENCE_SOURCE, "utf8");
    const styles = readFileSync(ALL_IN_ONE_STYLES, "utf8");
    expect(source).toContain('import "./creator-all-in-one.css"');
    expect(styles).toContain('data-creator-experience="all-in-one-studio-v3"');
    expect(styles).toContain("overflow-x: clip");
    expect(styles).toContain("min-inline-size: 0");
    expect(styles).toContain("max-inline-size: 100%");
    expect(styles).toContain("min-block-size: 2.75rem");
    expect(styles).toContain("@media (max-width: 720px)");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(styles).toContain("@media (prefers-contrast: more), (forced-colors: active)");
    expect(styles).toContain(":focus-visible");
  });

  it("keeps public metadata, install surfaces and the legal service description aligned", () => {
    const index = readFileSync(INDEX_SOURCE, "utf8");
    const manifest = JSON.parse(readFileSync(MANIFEST_SOURCE, "utf8")) as { description: string };
    const ribbonManifest = JSON.parse(readFileSync(RIBBON_MANIFEST_SOURCE, "utf8")) as { description: string };
    const llms = readFileSync(LLMS_SOURCE, "utf8");
    const business = readFileSync(BUSINESS_SOURCE, "utf8");
    const footer = JSON.parse(readFileSync(FOOTER_KO_SOURCE, "utf8")) as Record<string, string>;
    expect(index).toContain("기획부터 연재까지 올인원 웹툰 제작");
    expect(index).toContain("대본·콘티·전문 2D 작화·3D 캐릭터와 배경");
    expect(manifest.description).toContain("기획부터 연재까지");
    expect(ribbonManifest.description).toBe(manifest.description);
    expect(llms).toContain("올인원 웹툰 제작 스튜디오");
    expect(business).toContain("웹툰 기획·제작·협업·연재");
    expect(footer["footer.tagline"]).toContain("기획부터 연재까지");
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
    expect(flagship).toContain(".cf-principles-grid");
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeArt).toContain('data-theme-art="aurora"');
    expect(themeArt).toContain('data-theme-art="blossom"');
    expect(themeArt).toContain('data-theme-art="starlight"');
    expect(themeArt).toContain(".cf-theme-scene-image");
    expect(themeArt).toContain('data-theme-layout="blossom"');
    expect(themeArt).toContain("@media (prefers-reduced-motion: reduce)");
    expect(themeArt).toContain("@media (prefers-contrast: more), (forced-colors: active)");
  });
});
