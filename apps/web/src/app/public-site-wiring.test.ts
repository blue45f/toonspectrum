import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");
const effects = readFileSync(new URL("./RouteScrollRestoration.tsx", import.meta.url), "utf8");

describe("public shell integration", () => {
  it("isolates the retained optional chunk without conditionally remounting its owner", () => {
    expect(app).toMatch(/<ErrorBoundary resetKey=\{pathname\}>\s*<Suspense fallback=\{null\}>\s*<StudioBg3dRetainedOwnerHost\s*\/>\s*<\/Suspense>\s*<\/ErrorBoundary>/u);
    expect(app).not.toMatch(/<StudioBg3dRetainedOwnerHost[^>]*\bkey=/u);
  });

  it("keeps the soundtrack controller mounted while hiding and suspending it on isolated routes", () => {
    expect(app).toContain("const SiteBackgroundMusicPlayer = lazy(");
    expect(app).not.toContain('import { SiteBackgroundMusicPlayer }');
    expect(app).toContain("<SiteBackgroundMusicPlayer suspended={isolatedChrome} />");
    expect(app.indexOf("<SiteBackgroundMusicPlayer suspended={isolatedChrome} />")).toBeLessThan(app.indexOf("{!isolatedChrome ? ("));
  });

  it("does not make footer links wait for a user scroll", () => {
    const footer = app.split("function DeferredFooter(")[1].split("function DeferredBackToTop")[0];
    expect(footer).toContain("<SiteFooter />");
    expect(footer).toContain("if (!ready && !immediate) return null;");
    expect(app).toContain("<DeferredFooter immediate={publicExperience} />");
  });

  it("retains a single lifecycle-preserving owner for history and late fragments", () => {
    expect(shell.match(/<RouteScrollRestoration\s*\/>/gu)).toHaveLength(1);
    expect(shell).not.toContain("<PublicSiteNavigationEffects");
    expect(shell).not.toContain("<ScrollToTop");
    expect(effects).toContain("shouldPreserveStudioRouteLifecycle(previous, current)");
    expect(effects.indexOf("if (isStudioRoutePathname(pathname))")).toBeLessThan(effects.indexOf("new MutationObserver"));
    expect(effects).toContain('navigation === "POP"');
    expect(effects).toContain('anchor.focus({ preventScroll: true })');
    expect(effects).toContain('mutation?.disconnect()');
  });

  it("does not read or write optional browser storage without a guard", () => {
    expect(app).toContain("hasDismissedBrowserCompatibility()");
    expect(app).toContain("dismissBrowserCompatibility()");
    expect(app).not.toContain("sessionStorage.getItem");
    expect(app).not.toContain("sessionStorage.setItem");
  });

  it("loads global tooltip guidance as an immediate non-blocking chunk", () => {
    expect(shell).toContain("const AccessibleTooltipLayer = lazy(");
    expect(shell).not.toContain('import { AccessibleTooltipLayer }');
    expect(shell).toContain("<Suspense fallback={null}><AccessibleTooltipLayer /></Suspense>");
  });

  it("keeps the alternate onward chapter out of the initial application bundle", () => {
    expect(shell).toContain("const SiteNextSteps = lazy(");
    expect(shell).not.toContain('from "@/shared/components/site-experience/site-experience-model"');
    expect(shell).not.toContain('import { SiteNextSteps }');
    expect(shell).toContain("enhancedSite && !publicCreativeRoute");
    expect(shell).toMatch(/<ErrorBoundary resetKey=\{pathname\}>\s*<Suspense fallback=\{null\}><SiteNextSteps \/><\/Suspense>/u);
  });

  it("loads onward artwork UI only on eligible public pages, behind its own failure boundary", () => {
    expect(shell).toContain("const PublicSiteNextSteps = lazy(");
    expect(shell).not.toContain('import { PublicSiteNextSteps }');
    expect(shell).toContain("const PublicSiteWayfinder = lazy(");
    expect(shell).not.toContain('import { PublicSiteWayfinder }');
    expect(shell).toContain('publicCreativeRoute && pathname !== "/"');
    expect(shell).toMatch(/<ErrorBoundary resetKey=\{pathname\}>\s*<Suspense fallback=\{<Suspense fallback=\{null\}><PublicSiteWayfinder \/><\/Suspense>\}>\s*<PublicSiteNextSteps pathname=\{pathname\}\s*\/>/u);
  });
});
