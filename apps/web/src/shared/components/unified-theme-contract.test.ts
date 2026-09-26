import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

const entrySource = read("../../app/main.tsx");
const routeStageSource = read("../../app/routes/route-stage.tsx");
const appRouterSource = read("../../app/routes/AppRouter.tsx");
const contractCss = read("../../app/styles/unified-theme-contract.css");
const themeSource = read("../../shared/lib/theme-presets.ts");
const editorCss = read("../../domains/creator/studio-shell/studio-visual-identity-v2.css");

const themeIds = [...themeSource.matchAll(/\bid:\s*"([a-z-]+)"/gu)]
  .map((match) => match[1]);

describe("unified theme contract", () => {
  it("loads after the palette and sitewide interaction contracts", () => {
    expect(entrySource).toContain('import "./styles/unified-theme-contract.css"');
    expect(entrySource.indexOf("design-themes.css"))
      .toBeLessThan(entrySource.indexOf("unified-theme-contract.css"));
    expect(entrySource.indexOf("sitewide-visual-ux.css"))
      .toBeLessThan(entrySource.indexOf("unified-theme-contract.css"));
  });

  it("covers every selectable design theme with concrete nested-shell aliases", () => {
    expect(themeIds).toEqual([
      "aurora", "blossom", "starlight", "dark", "light",
      "graphite", "midnight", "sepia", "contrast",
    ]);
    for (const themeId of themeIds) {
      expect(contractCss).toContain(`:root[data-design-theme="${themeId}"]`);
    }
    for (const token of [
      "--unified-canvas", "--unified-panel", "--unified-card",
      "--unified-fg", "--unified-fg-2", "--unified-accent",
      "--unified-on-accent",
    ]) {
      expect(contractCss).toContain(token);
    }
  });

  it("wraps every registered application route in the unified stage", () => {
    expect(appRouterSource).toContain('<RouteStage pathname={pathname} search={search} accessibleTitle={title}>');
    expect(appRouterSource).toContain('appRoutes.map(({ element, id, path }) =>');
    expect(appRouterSource.indexOf("<RouteStage"))
      .toBeLessThan(appRouterSource.indexOf("<Routes>"));
  });

  it("marks every registered route stage with product, purpose and maturity", () => {
    expect(routeStageSource).toContain('data-theme-contract="unified"');
    expect(routeStageSource).toContain("data-route-product={routeMetadata.product}");
    expect(routeStageSource).toContain("data-route-purpose={routeMetadata.purpose}");
    expect(routeStageSource).toContain("data-route-maturity={routeMetadata.maturity}");
    expect(routeStageSource).toContain("resolveSiteRouteMetadata(`${pathname}${search}`)");
  });

  it("restores inherited theme tokens inside workspace and Studio chrome", () => {
    expect(contractCss).toContain(":is(.workspace-shell, .workspace-focused-shell)");
    expect(contractCss).toContain("--color-canvas: var(--unified-canvas)");
    expect(contractCss).toContain("--color-accent: var(--unified-accent)");
    expect(contractCss).toContain(".studio-visual-identity-page");
    expect(contractCss).toContain("--toon-violet: var(--color-accent)");
    expect(contractCss).toContain(".studio-ai-director__prompt > *");
    expect(contractCss).toContain(".text-on-accent\\/80");
    expect(contractCss).toContain(".public-site-next__card");
    expect(contractCss).toContain("--next-accent: var(--color-accent)");
    expect(editorCss).toContain(':root[data-design-theme] [data-studio-editor="true"]');
    expect(editorCss).toContain("--color-canvas: var(--unified-canvas)");
    expect(editorCss).toContain('[data-studio-beta-notice="true"]');
    expect(editorCss).toContain("background: var(--color-accent) !important");
  });

  it("defines explicit and operating-system high-contrast fallbacks", () => {
    expect(contractCss).toContain(':root[data-design-theme="contrast"]');
    expect(contractCss).toContain("@media (prefers-contrast: more)");
    expect(contractCss).toContain("--unified-line-strong: color-mix");
    expect(contractCss).toContain("@media (forced-colors: active)");
    expect(contractCss).toContain("background: Canvas !important");
    expect(contractCss).toContain("color: CanvasText !important");
    expect(contractCss).toContain("--color-canvas: Canvas");
    expect(contractCss).toContain("--color-fg: CanvasText");
    expect(contractCss).toContain("--color-accent: Highlight");
    expect(contractCss).toContain("--color-warning: CanvasText");
    expect(contractCss).toContain('[data-site-chrome="footer"]');
    expect(contractCss).toContain(".studio-ai-director__badge");
    expect(contractCss).toContain("-webkit-text-fill-color: currentColor !important");
    expect(contractCss).toContain("color: LinkText !important");
    expect(contractCss).toContain("forced-color-adjust: none !important");
    expect(contractCss).toContain("background: Highlight !important");
    expect(contractCss).toContain("outline: 3px solid Highlight !important");
  });

  it("keeps reduced-motion handling in the shared contract", () => {
    expect(contractCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(contractCss).toContain("scroll-behavior: auto !important");
  });
});
