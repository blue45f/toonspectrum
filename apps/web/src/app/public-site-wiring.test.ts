import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const compatibilityBridge = readFileSync(new URL("./BrowserCompatibilityBridge.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("./AppShell.tsx", import.meta.url), "utf8");
// 몰입 예외 목록의 단일 기준은 shell-chrome-policy — AppShell은 위임만 한다.
const shellPolicy = readFileSync(new URL("./shell-chrome-policy.ts", import.meta.url), "utf8");
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
    // Virtual home suppresses chromeOverlay: the soundtrack must not live inside it.
    expect(app.indexOf("<SiteBackgroundMusicPlayer suspended={isolatedChrome} />")).toBeLessThan(app.indexOf("<AppShell"));
    expect(app.match(/<SiteBackgroundMusicPlayer suspended=/gu)).toHaveLength(1);
    expect(app.indexOf("<SiteBackgroundMusicPlayer suspended={isolatedChrome} />")).toBeLessThan(app.indexOf("{!isolatedChrome ? ("));
  });

  it("does not make footer links wait for a user scroll", () => {
    const footer = app.split("function DeferredFooter(")[1].split("function DeferredBackToTop")[0];
    expect(footer).toContain("<SiteFooter />");
    expect(footer).toContain("if (!ready && !immediate) return null;");
    expect(app).toContain("<DeferredFooter immediate={publicExperience} />");
  });

  it("오프라인 작업실 홈에서는 상태 안내를 흐름에 배치해 작업 버튼을 가리지 않는다", () => {
    expect(shell).toMatch(
      /<ServiceDegradedBanner immersive=\{\s*isStudioWorkspaceRoutePathname\(pathname\)\s*\|\|\s*\(immersiveVirtualExperience && normalizedPath !== "\/home"\)\s*\} \/>/u
    );
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

  it("keeps optional browser diagnostics and guarded storage out of the initial app bundle", () => {
    expect(app).toContain("const BrowserCompatibilityBridge = lazy(");
    expect(app).not.toContain('import { checkBrowserCompatibility');
    expect(compatibilityBridge).toContain("hasDismissedBrowserCompatibility()");
    expect(compatibilityBridge).toContain("dismissBrowserCompatibility()");
    expect(app).not.toContain("sessionStorage.getItem");
    expect(app).not.toContain("sessionStorage.setItem");
    expect(compatibilityBridge).not.toContain("sessionStorage.getItem");
    expect(compatibilityBridge).not.toContain("sessionStorage.setItem");
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
    expect(shell).toContain('publicCreativeRoute && !immersiveVirtualExperience');
    expect(shell).toContain('publicCreativeRoute && !immersiveVirtualExperience && supportsPublicSiteOnwardJourney(pathname)');
    expect(shell).toContain('{immersiveVirtualExperience ? null : header}');
    expect(shell).toContain('{immersiveVirtualExperience ? null : footer}');
    expect(shell.match(/<SpatialCampusFrame binding=/gu)).toHaveLength(1);
    const campus = readFileSync(new URL("./spatial-campus/SpatialCampusFrame.tsx", import.meta.url), "utf8");
    expect(campus.match(/<WorkspaceTaskFrame route=/gu)).toHaveLength(1);
    expect(shell).toContain('immersiveVirtualExperience ? null : chromeOverlay');
    // 몰입 예외 목록은 정책 모듈 한곳에만 존재하고 AppShell은 그 판정을 위임받는다.
    expect(shell).toContain("resolveShellChrome({");
    expect(shell).not.toContain("IMMERSIVE_VIRTUAL_HOME_PATHS");
    const normalizedPolicy = shellPolicy.replace(/\s+/gu, " ");
    const immersiveHomeRoutes = shellPolicy.match(
      /IMMERSIVE_VIRTUAL_HOME_PATHS[^=]*=\s*(\[[\s\S]*?\])/u,
    )?.[1];
    expect(immersiveHomeRoutes).toBeDefined();
    expect([...((immersiveHomeRoutes ?? "").matchAll(/"([^"]+)"/gu))].map((match) => match[1]))
      .toEqual(["/home", "/hub", "/studio", "/studio/space", "/onboarding/character"]);
    expect(normalizedPolicy).toContain('normalizedPath === "/team" || normalizedPath.startsWith("/team/")');
    expect(normalizedPolicy).toContain('const immersiveVirtualExperience = immersiveVirtualHome || immersiveVirtualProject || input.hasTaskRoute || input.protectedCampus;');
    expect(shell).toMatch(/<ErrorBoundary resetKey=\{pathname\}>\s*<Suspense fallback=\{<Suspense fallback=\{null\}><PublicSiteWayfinder \/><\/Suspense>\}>\s*<PublicSiteNextSteps pathname=\{pathname\}\s*\/>/u);
  });
});
