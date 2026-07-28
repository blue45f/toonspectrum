import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { appRoutes } from "../../src/app/routes/route-manifest";
import { apiPath } from "../../src/infrastructure/api";
import { setRuntimeApiBase } from "../../src/infrastructure/runtime-api-base";

describe("vite migration", () => {
  it("declares the primary product routes in the Vite router manifest", () => {
    expect(appRoutes.map((route) => route.path)).toEqual(
      expect.arrayContaining([
        "/",
        "/ranking",
        "/search",
        "/recommend",
        "/explore",
        "/calendar",
        "/reviews",
        "/community",
        "/library",
        "/compare",
        "/insights",
      ])
    );
  });

  it("keeps API calls rooted at /api by default for the Vite proxy", () => {
    setRuntimeApiBase("");
    expect(apiPath("/ranking?limit=3")).toBe("/api/ranking?limit=3");
    expect(apiPath("search")).toBe("/api/search");
  });

  it("uses an explicitly injected runtime API origin", () => {
    setRuntimeApiBase("https://www.toonstudio.cloud/");

    expect(apiPath("/auth/providers")).toBe("https://www.toonstudio.cloud/api/auth/providers");

    setRuntimeApiBase("");
  });

  it("keeps the static catalog fetch installer out of the initial catalog engine bundle", () => {
    const installer = readFileSync(join(process.cwd(), "src/catalog-static.ts"), "utf8");

    expect(installer).toContain('import("./catalog-static-engine")');
    expect(installer).not.toContain("@/lib/server/catalog-store");
    expect(installer).not.toContain("@/lib/search");
    expect(installer).not.toContain("@/lib/recommend");
    expect(installer).not.toContain("@/lib/server/ranking-service");
  });

  it("loads the command palette implementation lazily from a lightweight app host", () => {
    // 커맨드 팔레트 호스트는 공용 셸(AppShell)에서 마운트한다(App.tsx 는 라우터+크롬만 조립).
    const app = readFileSync(join(process.cwd(), "src/app/App.tsx"), "utf8");
    const shell = readFileSync(join(process.cwd(), "src/app/AppShell.tsx"), "utf8");
    const host = readFileSync(join(process.cwd(), "components/command-palette-host.tsx"), "utf8");

    expect(shell).toContain("@/components/command-palette-host");
    expect(app).not.toMatch(/from\s+["']@\/components\/command-palette["']/);
    expect(shell).not.toMatch(/from\s+["']@\/components\/command-palette["']/);
    expect(host).toContain('lazy(() => import("./command-palette")');
  });

  it("keeps optional Studio asset packs out of the Studio route entry chunk", () => {
    const studio = readFileSync(join(process.cwd(), "src/domains/creator/StudioPage.tsx"), "utf8");
    const optionalAssetModules = [
      "studio-bg-scenes",
      "studio-bg-scenes-extra",
      "studio-fx-assets",
      "studio-creature-stickers",
      "studio-prop-stickers",
    ];

    for (const moduleName of optionalAssetModules) {
      expect(studio).not.toMatch(new RegExp(`from\\s+["']\\./${moduleName}["']`));
      expect(studio).toContain(`import("./${moduleName}")`);
    }
  });

  it("keeps studio-only Google Fonts out of the global render-blocking stylesheet", () => {
    const html = readFileSync(join(process.cwd(), "index.html"), "utf8");
    const studio = readFileSync(join(process.cwd(), "src/domains/creator/StudioPage.tsx"), "utf8");
    const studioOnlyFamilies = [
      "Black+Han+Sans",
      "East+Sea+Dokdo",
      "Gaegu",
      "Gamja+Flower",
      "Jua",
      "Nanum+Pen+Script",
      "Yeon+Sung",
    ];

    expect(html).toContain("family=Space+Grotesk");
    expect(html).toContain("family=Nanum+Myeongjo");
    for (const family of studioOnlyFamilies) {
      expect(html).not.toContain(`family=${family}`);
      expect(studio).toContain(`family=${family}`);
    }
  });
});
