import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");
const effects = readFileSync(new URL("./PublicSiteNavigationEffects.tsx", import.meta.url), "utf8");

describe("public shell integration", () => {
  it("isolates the retained optional chunk without conditionally remounting its owner", () => {
    expect(app).toMatch(/<ErrorBoundary resetKey=\{pathname\}>\s*<Suspense fallback=\{null\}>\s*<StudioBg3dRetainedOwnerHost\s*\/>\s*<\/Suspense>\s*<\/ErrorBoundary>/u);
    expect(app).not.toMatch(/<StudioBg3dRetainedOwnerHost[^>]*\bkey=/u);
  });

  it("does not make footer links wait for a user scroll", () => {
    const footer = app.split("function DeferredFooter() {")[1].split("function DeferredBackToTop")[0];
    expect(footer).toContain("<SiteFooter />");
    expect(footer).not.toContain("useDeferredByScroll");
  });

  it("adds public-only recovery after the existing lifecycle-preserving scroll effect", () => {
    expect(shell).toMatch(/<ScrollToTop\s*\/>\s*<PublicSiteNavigationEffects\s*\/>/u);
    expect(shell).toContain("shouldPreserveStudioRouteLifecycle(previousLocation, currentLocation)");
    expect(effects).toContain("if (isStudioRoutePathname(pathname)) return;");
    expect(effects).toContain('navigationType === "POP"');
  });

  it("does not read or write optional browser storage without a guard", () => {
    expect(app).toContain("hasDismissedBrowserCompatibility()");
    expect(app).toContain("dismissBrowserCompatibility()");
    expect(app).not.toContain("sessionStorage.getItem");
    expect(app).not.toContain("sessionStorage.setItem");
  });
});
