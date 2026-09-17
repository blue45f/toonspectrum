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
const drawingRoot = join(publicRoot, "offline-draw");
const appOrigin = "https://www.toonstudio.cloud";
const manifest = JSON.parse(
  readFileSync(join(drawingRoot, "manifest.webmanifest"), "utf8"),
) as DrawingManifest;

function publicAssetPath(src: string): string {
  const url = new URL(src, appOrigin);
  expect(url.origin).toBe(appOrigin);
  return join(publicRoot, url.pathname);
}

describe("drawing-only PWA", () => {
  it("uses a distinct app identity and a bounded drawing-only scope", () => {
    expect(manifest.id).toBe("/offline-draw/");
    expect(manifest.scope).toBe("/offline-draw/");
    expect(manifest.display).toBe("standalone");

    const start = new URL(manifest.start_url, appOrigin);
    expect(start.pathname).toBe("/offline-draw/");
    expect(start.searchParams.get("source")).toBe("pwa");
    expect(start.pathname.startsWith(manifest.scope)).toBe(true);
  });

  it("ships same-origin any and maskable icons", () => {
    const purposes = manifest.icons.map((icon) => icon.purpose);
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
    for (const icon of manifest.icons) {
      expect(existsSync(publicAssetPath(icon.src))).toBe(true);
    }
  });

  it("links both the drawing surface and installer to the dedicated manifest", () => {
    const installer = readFileSync(join(drawingRoot, "install.html"), "utf8");
    const drawing = readFileSync(join(drawingRoot, "index.html"), "utf8");
    const manifestLink = 'rel="manifest" href="/offline-draw/manifest.webmanifest"';

    expect(installer).toContain(manifestLink);
    expect(installer).toContain('id="install-app"');
    expect(drawing).toContain(manifestLink);
  });

  it("exposes the drawing-only installer next to the full-app install flow", () => {
    const launchpad = readFileSync(
      join(root, "apps/web/src/domains/marketing/CreatorLaunchpad.tsx"),
      "utf8",
    );
    expect(launchpad).toContain("/offline-draw/install.html?source=site");
    expect(launchpad).toContain("순수 드로잉 앱 설치");
  });

  it("keeps install assets in the drawing shell cache", () => {
    const cacheSource = readFileSync(join(drawingRoot, "cache.js"), "utf8");
    for (const file of [
      "/offline-draw/install.html",
      "/offline-draw/install.css",
      "/offline-draw/install.js",
      "/offline-draw/manifest.webmanifest",
    ]) {
      expect(cacheSource).toContain(file);
    }
  });
});
