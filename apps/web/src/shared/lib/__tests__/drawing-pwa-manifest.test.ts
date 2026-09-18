import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface DrawingManifest {
  id: string;
  start_url: string;
  scope: string;
  display: string;
  categories?: string[];
  icons: ManifestIcon[];
}

const root = process.cwd();
const publicRoot = join(root, "apps/web/public");
const drawingAppRoot = join(publicRoot, "draw-app");
const emergencyRoot = join(publicRoot, "offline-draw");
const appOrigin = "https://www.toonstudio.cloud";
const manifest = JSON.parse(
  readFileSync(join(drawingAppRoot, "manifest.webmanifest"), "utf8"),
) as DrawingManifest;

function publicAssetPath(src: string): string {
  const url = new URL(src, appOrigin);
  expect(url.origin).toBe(appOrigin);
  return join(publicRoot, url.pathname);
}

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("ToonStudio Draw PWA", () => {
  it("has a distinct identity while starting the canonical Studio runtime", () => {
    expect(manifest.id).toBe("/draw-app");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");

    const start = new URL(manifest.start_url, appOrigin);
    expect(start.pathname).toBe("/studio");
    expect(start.searchParams.get("drawingShell")).toBe("app");
    expect(start.searchParams.get("uiMode")).toBe("focus");
    expect(start.searchParams.get("startTool")).toBe("draw");
    expect(start.searchParams.get("source")).toBe("pwa");
  });

  it("ships same-origin any and maskable icons", () => {
    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    for (const icon of manifest.icons) {
      expect(existsSync(publicAssetPath(icon.src))).toBe(true);
    }
  });

  it("uses the root Studio service worker instead of creating a second drawing engine shell", () => {
    const installer = readFileSync(join(drawingAppRoot, "install.html"), "utf8");
    const installerScript = readFileSync(join(drawingAppRoot, "install.js"), "utf8");
    expect(installer).toContain('rel="manifest" href="/draw-app/manifest.webmanifest"');
    expect(installer).toContain('id="install-app"');
    expect(installer).toContain("같은 Studio 문서·브러시·레이어·저장 엔진");
    expect(installerScript).toContain("register('/sw.js', { scope: '/' })");
    expect(installerScript).not.toContain("/offline-draw/sw.js");
    expect(installerScript).toContain("drawingShell=app");
  });

  it("exposes the shared-engine drawing installer next to the full-app install flow", () => {
    const launchpad = source("apps/web/src/domains/marketing/CreatorLaunchpad.tsx");
    expect(launchpad).toContain("/draw-app/install.html?source=site");
    expect(launchpad).toContain("순수 드로잉 앱 설치");
    expect(launchpad).toContain("동일한 문서·브러시·레이어·저장 엔진");
    expect(launchpad).not.toContain("/offline-draw/install.html?source=site");
  });

  it("keeps emergency drawing explicitly separate from the product drawing presentation", () => {
    const emergency = readFileSync(join(emergencyRoot, "index.html"), "utf8");
    const emergencyCache = readFileSync(join(emergencyRoot, "cache.js"), "utf8");
    expect(emergency).toContain("EMERGENCY DRAW");
    expect(emergency).toContain("긴급 복구 도구");
    expect(emergency).not.toContain("/draw-app/manifest.webmanifest");
    expect(emergencyCache).not.toContain("/draw-app/");
    expect(existsSync(join(emergencyRoot, "manifest.webmanifest"))).toBe(false);
    expect(existsSync(join(emergencyRoot, "install.html"))).toBe(false);
  });

  it("projects one editor runtime through integrated and app chrome", () => {
    const view = source("apps/web/src/domains/creator/studio-cuttoon-editor/StudioCuttoonEditorView.tsx");
    const presentation = source("apps/web/src/domains/creator/studio-drawing-presentation.ts");
    const switcher = source("apps/web/src/domains/creator/studio-shell/StudioDocumentWorkspaceSwitcher.tsx");
    const appBar = source("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingAppBar.tsx");
    const gestures = source("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingGestureBridge.tsx");

    expect(view).toContain("useStudioDrawingPresentation");
    expect(view).toContain("<StudioDrawingAppBar session={s} />");
    expect(view).toContain("<StudioCuttoonEditorWorkspace {...s} />");
    expect(view).toContain("<StudioCuttoonEditorChrome {...s} />");
    expect(presentation).toContain('export type StudioDrawingPresentation = "integrated" | "app"');
    expect(switcher).toContain("withStudioDrawingPresentation");
    expect(appBar).toContain('studioBrushCatalogHandlers?.toggle?.("desktop-dock"');
    expect(appBar).toContain("setQuickAccessPaletteOpen");
    expect(gestures).toContain("candidate.count === 2");
    expect(gestures).toContain("candidate.count === 3");
    expect(gestures).toContain("setCanvasOnlyMode");
  });
});
