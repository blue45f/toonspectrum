import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { appRoutes } from "../../../app/routes/groups/app-routes";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface ManifestShortcut {
  name: string;
  short_name?: string;
  url: string;
  icons?: ManifestIcon[];
}

interface ManifestScreenshot {
  src: string;
  sizes: string;
  type: string;
  form_factor: "wide" | "narrow";
  label: string;
}

interface WebManifest {
  id?: string;
  start_url: string;
  scope: string;
  categories?: string[];
  icons: ManifestIcon[];
  shortcuts?: ManifestShortcut[];
  screenshots?: ManifestScreenshot[];
}

const appOrigin = "https://www.toonstudio.cloud";
const manifest = JSON.parse(
  readFileSync(join(process.cwd(), "apps/web/public/manifest.webmanifest"), "utf8")
) as WebManifest;

function publicAssetPath(src: string): string {
  const url = new URL(src, appOrigin);
  expect(url.origin).toBe(appOrigin);
  // Cache revisions belong to the URL, not the filesystem filename.
  return join(process.cwd(), "apps/web/public", url.pathname);
}

describe("PWA manifest", () => {
  it("pins the app identity with an explicit id matching the scope", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe("/studio");
    expect(manifest.scope).toBe("/");
  });

  it("declares any/maskable icon purposes separately (no combined 'any maskable')", () => {
    const purposes = manifest.icons.map((icon) => icon.purpose);
    for (const purpose of purposes) {
      expect(["any", "maskable"]).toContain(purpose);
    }
    expect(purposes).toContain("any");
    expect(purposes).toContain("maskable");
  });

  it("backs maskable entries with safe-zone padded PNGs that exist in public/", () => {
    const maskable = manifest.icons.filter((icon) => icon.purpose === "maskable");
    expect(maskable.map((icon) => icon.sizes).sort()).toEqual(["192x192", "512x512"]);
    for (const icon of maskable) {
      expect(icon.type).toBe("image/png");
      expect(new URL(icon.src, appOrigin).pathname).toMatch(/^\/brand\/spectrum-ribbon-v2\//u);
      expect(existsSync(publicAssetPath(icon.src))).toBe(true);
    }
  });

  it("exposes unique creator shortcuts for the current production journey", () => {
    const shortcuts = manifest.shortcuts ?? [];
    const shortcutUrls = shortcuts.map((shortcut) => shortcut.url);
    const requiredCreatorEntries = [
      "/studio/new",
      "/studio",
      "/studio/bg3d",
      "/studio/publish",
    ];

    expect(shortcutUrls).toHaveLength(requiredCreatorEntries.length);
    expect(new Set(shortcutUrls).size).toBe(shortcutUrls.length);
    expect(shortcutUrls).toEqual(expect.arrayContaining(requiredCreatorEntries));

    // Use the real router, not the legacy navigation-only metadata. Do not
    // allow a missing destination to pass through the global 404 wildcard.
    const registeredRoutes = appRoutes.filter((route) => !["*", "/*"].includes(route.path));
    for (const shortcut of shortcuts) {
      const url = new URL(shortcut.url, appOrigin);
      expect(url.origin).toBe(appOrigin);
      expect(url.pathname.startsWith(manifest.scope)).toBe(true);
      expect(matchRoutes(registeredRoutes, shortcut.url)).not.toBeNull();
      expect(shortcut.icons).toEqual([
        {
          src: "/brand/spectrum-ribbon-v2/icon-192.png",
          sizes: "192x192",
          type: "image/png",
        },
      ]);
      expect(existsSync(publicAssetPath(shortcut.icons?.[0]?.src ?? ""))).toBe(true);
    }
  });

  it("declares creator store categories for richer install surfaces", () => {
    expect(manifest.categories).toEqual(["productivity", "graphics_design", "entertainment"]);
  });

  it("ships wide and narrow install-UI screenshots whose declared sizes match the PNGs", () => {
    const screenshots = manifest.screenshots ?? [];
    expect(screenshots.map((shot) => shot.form_factor).sort()).toEqual(["narrow", "wide"]);

    for (const shot of screenshots) {
      expect(shot.type).toBe("image/png");
      expect(shot.label).not.toBe("");

      const file = publicAssetPath(shot.src);
      expect(existsSync(file)).toBe(true);

      // PNG IHDR: width/height live at byte offsets 16/20, big-endian.
      const png = readFileSync(file);
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(shot.sizes);

      // Chrome's richer install UI rejects screenshots wider/taller than 2.3:1.
      const [width, height] = shot.sizes.split("x").map(Number);
      expect(Math.max(width, height) / Math.min(width, height)).toBeLessThanOrEqual(2.3);
    }
  });

  it("serves a versioned raster apple-touch-icon", () => {
    const html = readFileSync(join(process.cwd(), "apps/web/index.html"), "utf8");
    const href = html.match(/<link rel="apple-touch-icon"[^>]*href="([^"]+)"/)?.[1];
    expect(href).toBeDefined();
    const url = new URL(href ?? "", appOrigin);
    expect(url.origin).toBe(appOrigin);
    expect(url.pathname).toBe("/brand/spectrum-ribbon-v2/apple-touch-icon.png");
    expect(url.search).toBe("");
    expect(existsSync(publicAssetPath(url.href))).toBe(true);
  });
});
