import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  loadStudioI18nDictionaries,
  parseStudioI18nDictionary,
  STUDIO_I18N_ASSET_LOCALES,
  studioI18nAssetUrl,
} from "./studio-i18n-loader";

import {
  resolveI18nValue,
} from "@/lib/i18n";

function readAsset(locale: string): string {
  return readFileSync(
    path.resolve(
      process.cwd(),
      "public",
      "i18n",
      "studio",
      `${locale}.json`,
    ),
    "utf8",
  );
}

describe("Studio lazy i18n assets", () => {
  it("keeps complete, validated Korean and English dictionaries", () => {
    for (const locale of STUDIO_I18N_ASSET_LOCALES) {
      const dictionary = parseStudioI18nDictionary(readAsset(locale));
      expect(dictionary).not.toBeNull();
      expect(Object.keys(dictionary ?? {})).toHaveLength(1_297);
    }
    // The mobile dock used to hardcode Korean labels; every pack must now carry the keys that
    // replaced them, so an `en` viewport cannot fall back to Korean chrome.
    for (const key of [
      "studio.mobileDock.label",
      "studio.mobileDock.tool.pixel",
      "studio.mobileDock.tool.shape",
      "studio.mobileDock.tool.undo",
      "studio.mobileDock.tool.redo",
      "studio.mobileDock.brushSettings",
      "studio.creativeModes.title",
    ]) {
      for (const locale of STUDIO_I18N_ASSET_LOCALES) {
        expect(parseStudioI18nDictionary(readAsset(locale))?.[key]).toBeTruthy();
      }
      expect(resolveI18nValue("ko", key)).not.toBe(key);
    }
    expect(resolveI18nValue("en", "studio.mobileDock.tool.shape")).toBe("Shape");
    expect(resolveI18nValue("ko", "studio.mobileDock.tool.shape")).toBe("도형");
    // The filter menu generates a row per pack kind, but 28 kinds (the advanced blurs, the
    // clean-up filters and the whole union wave) had no locale keys, so an `en` menubar showed
    // "렌즈 블러" between English rows. Every pack now carries the keys — untranslated locales
    // deliberately hold the English catalogue label, the same pending-translation convention the
    // mobile-dock keys established, because a French reader is better served by "Lens blur"
    // than by Hangul.
    for (const key of [
      "studio.mainMenu.item.filter.lens-blur",
      "studio.mainMenu.item.filter.tilt-shift-blur",
      "studio.mainMenu.item.filter.screentone-removal",
      "studio.mainMenu.item.filter.god-rays",
      "studio.mainMenu.item.filter.wave-warp",
    ]) {
      for (const locale of STUDIO_I18N_ASSET_LOCALES) {
        expect(parseStudioI18nDictionary(readAsset(locale))?.[key]).toBeTruthy();
      }
    }
    expect(resolveI18nValue("en", "studio.mainMenu.item.filter.lens-blur")).toBe("Lens blur");
    expect(resolveI18nValue("ko", "studio.mainMenu.item.filter.lens-blur")).toBe("렌즈 블러");
    expect(resolveI18nValue("ko", "studio.mainMenu.item.filter.god-rays")).toBe("볼류메트릭 광선");
    expect(resolveI18nValue("ko", "studio.canvas.wheelMode.zoom")).toBe(
      "휠: 캔버스 확대·축소",
    );
    expect(resolveI18nValue("en", "studio.canvas.wheelMode.zoom")).toBe(
      "Wheel: zoom canvas",
    );
    expect(resolveI18nValue("ko", "studio.settings.state.hide")).toBe("숨김");
  });

  it("loads both assets in parallel before either Studio route commits", async () => {
    const assets = {
      ko: readAsset("ko"),
      en: readAsset("en"),
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const locale = String(input).endsWith("/ko.json") ? "ko" : "en";
      return new Response(assets[locale]);
    });

    await loadStudioI18nDictionaries({
      fetchImpl: fetchMock as typeof fetch,
      baseUrl: "/preview/",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      "/preview/i18n/studio/en.json",
      "/preview/i18n/studio/ko.json",
    ]);
    expect(studioI18nAssetUrl("ko", "/preview")).toBe(
      "/preview/i18n/studio/ko.json",
    );
  });

  it("rejects malformed, foreign-namespace and oversized dictionaries", () => {
    expect(parseStudioI18nDictionary("{")).toBeNull();
    expect(parseStudioI18nDictionary('{"common.close":"Close"}')).toBeNull();
    expect(parseStudioI18nDictionary("{}")).toBeNull();
    expect(
      parseStudioI18nDictionary(
        JSON.stringify({ "studio.invalid": "x".repeat(4_001) }),
      ),
    ).toBeNull();
  });

  it("keeps Studio strings out of the eagerly loaded global dictionary source", () => {
    const i18nSource = readFileSync(
      path.resolve(process.cwd(), "lib", "i18n.ts"),
      "utf8",
    );
    const studioPageSource = readFileSync(
      path.resolve(
        process.cwd(),
        "src",
        "domains",
        "creator",
        "StudioPage.tsx",
      ),
      "utf8",
    );
    const companionSource = readFileSync(
      path.resolve(
        process.cwd(),
        "src",
        "domains",
        "creator",
        "StudioToolsCompanionPage.tsx",
      ),
      "utf8",
    );
    const routerSource = readFileSync(
      path.resolve(
        process.cwd(),
        "src",
        "app",
        "routes",
        "AppRouter.tsx",
      ),
      "utf8",
    );

    expect(i18nSource).not.toMatch(/^\s+"studio\.[^"]+":/mu);
    expect(studioPageSource).not.toContain("studio-i18n");
    expect(companionSource).not.toContain("studio-i18n");
    expect(routerSource).toContain("loadStudioI18nDictionaries()");
  });
});
