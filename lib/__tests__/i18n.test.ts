import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  FALLBACK_CHAIN,
  GOOGLE_PLAY_LOCALE_LIST,
  getLanguageOptions,
  getLocaleCandidates,
  i18nDict,
  ensureRuntimeLocaleBundle,
  resolveI18nValue,
} from "@/lib/i18n";

function mockTranslationResponseForRequest(url: string): Response {
  const parsed = new URL(url);
  const source = parsed.searchParams.get("q") ?? "";

  return new Response(
    JSON.stringify({
      responseData: {
        translatedText: `${source}-translated`,
      },
      responseStatus: 200,
    }),
    { status: 200 }
  );
}

function makeCachedLocalePayload(locale: string, dict: Record<string, string>) {
  return {
    v: 1,
    locale,
    updatedAt: Date.now(),
    dict,
  };
}

async function withLocalStorage<T>(fn: () => T | Promise<T>): Promise<T> {
  const originalStorage = (globalThis as { localStorage?: Storage | undefined }).localStorage;
  const map = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return map.size;
    },
    clear: () => {
      map.clear();
    },
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    key: () => null,
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: mockStorage,
    configurable: true,
    writable: true,
  });

  try {
    return await fn();
  } finally {
    if (originalStorage === undefined) {
      Object.defineProperty(globalThis, "localStorage", {
        value: undefined,
        configurable: true,
      });
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalStorage,
        configurable: true,
        writable: true,
      });
    }
  }
}

function collectSourceI18nKeys(): Set<string> {
  const roots = ["components", "lib", "src"];
  const visited = new Set<string>();
  const used = new Set<string>();
  const keyRe = /\bt\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

  const walk = (dir: string): void => {
    if (visited.has(dir)) return;
    visited.add(dir);

    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name === ".git" || name === "__tests__") continue;

      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }

      if (![".ts", ".tsx", ".js", ".jsx"].includes(extname(full))) continue;

      const text = readFileSync(full, "utf8");
      for (const match of text.matchAll(keyRe)) {
        used.add(match[1]);
      }
    }
  };

  for (const root of roots) {
    walk(root);
  }

  return used;
}


describe("i18n locale candidates", () => {
  it("prioritizes requested locale and fallback chain", () => {
    const candidates = getLocaleCandidates("en-US");
    expect(candidates[0]).toBe("en-us");
    expect(candidates).toContain("en");
    expect(candidates).toContain(FALLBACK_CHAIN[FALLBACK_CHAIN.length - 1]);
  });

  it("uses hierarchy fallback for script and region codes", () => {
    const candidates = getLocaleCandidates("zh-Hant-TW");

    expect(candidates[0]).toBe("zh-hant-tw");
    expect(candidates).toContain("zh-hant");
    expect(candidates).toContain("zh");
    expect(candidates).toContain("en");
    expect(candidates).toContain("ko");
  });
});

describe("getLanguageOptions", () => {
  it("builds options from known and Google Play locales", () => {
    const options = getLanguageOptions("en");
    const optionCodes = new Set(options.map((item) => item.code));
    const normalizedGooglePlay = new Set(
      GOOGLE_PLAY_LOCALE_LIST.map((code) => code.trim().replace(/_/g, "-").toLowerCase())
    );

    expect(options).toHaveLength(optionCodes.size);
    expect(optionCodes.size).toBe(normalizedGooglePlay.size);

    for (const requiredCode of ["en", "ko", "zh", "zh-hans", "zh-hant", "es-419"]) {
      expect(optionCodes.has(requiredCode)).toBe(true);
    }
  });

  it("preserves labels for english locale", () => {
    const options = getLanguageOptions("en");
    const english = options.find((entry) => entry.code === "en");

    expect(english?.code).toBe("en");
    expect(english?.nativeLabel).toBe("English");
    expect(english?.englishLabel).toBe("English");
    expect(english?.label).toBe("English");
  });

  it("uses locale candidate fallback when resolving missing translations", () => {
    expect(resolveI18nValue("fr-CA", "app.name", ["en"])).toBe(i18nDict.en["app.name"]);
    expect(resolveI18nValue("pt-BR", "search.title")).toBe(i18nDict.en["search.title"]);
    expect(resolveI18nValue("fr-CA", "does-not-exist", [])).toBe("does-not-exist");
    expect(resolveI18nValue("xx-YY", "missing", [])).toBe("missing");
  });
});

describe("runtime translation bundles", () => {
  it("builds locale runtime translation bundle using external translator", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) => Promise.resolve(mockTranslationResponseForRequest(url.toString())));

    await ensureRuntimeLocaleBundle("fr");

    expect(fetchSpy).toHaveBeenCalled();
    expect(resolveI18nValue("fr", "app.name")).toBe("ToonSpectrum-translated");

    fetchSpy.mockRestore();
  });

  it("skips translation when locale is already covered by base dictionary root", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("should not be called"));
    await ensureRuntimeLocaleBundle("en-US");
    await ensureRuntimeLocaleBundle("ko-KR");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(resolveI18nValue("en-US", "app.name")).toBe(i18nDict.en["app.name"]);
    expect(resolveI18nValue("ko-KR", "app.name")).toBe(i18nDict.ko["app.name"]);

    fetchSpy.mockRestore();
  });

  it("builds runtime translation bundle for locale outside Google Play locale list", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) => Promise.resolve(mockTranslationResponseForRequest(url.toString())));

    await ensureRuntimeLocaleBundle("tlh");

    expect(fetchSpy).toHaveBeenCalled();
    expect(resolveI18nValue("tlh", "app.name")).toBe("ToonSpectrum-translated");

    fetchSpy.mockRestore();
  });

  it("can translate Google Play script/region variants", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation((url) => Promise.resolve(mockTranslationResponseForRequest(url.toString())));

    await ensureRuntimeLocaleBundle("zh-Hant-TW");

    expect(fetchSpy).toHaveBeenCalled();
    expect(resolveI18nValue("zh-Hant-TW", "search.title")).toBe(
      `${i18nDict.en["search.title"]}-translated`
    );

    fetchSpy.mockRestore();
  });

    it("falls back to language root when locale-specific translation variant is unavailable", async () => {
      const calls: string[] = [];
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const parsed = new URL(url.toString());
        const langpair = parsed.searchParams.get("langpair") ?? "";
        const target = langpair.split("|")[1] ?? "";
        calls.push(langpair);

        if (target !== "de-XX") {
          const source = parsed.searchParams.get("q") ?? "";
          return Promise.resolve(
            new Response(
              JSON.stringify({
                responseData: {
                translatedText: `${source}-base-lang`,
              },
              responseStatus: 200,
            }),
            { status: 200 }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            responseData: {
              translatedText: `${parsed.searchParams.get("q")}-bad-locale`,
            },
            responseStatus: 503,
          }),
          { status: 200 }
          )
      );
    });

    await ensureRuntimeLocaleBundle("de-XX");

    expect(calls.some((value) => value.includes("|de-XX"))).toBe(true);
    expect(calls.some((value) => value.includes("|de"))).toBe(true);
    expect(resolveI18nValue("de-XX", "app.name")).toBe("ToonSpectrum-base-lang");

    fetchSpy.mockRestore();
  });

  it("uses cached runtime translation bundle without calling translator", async () => {
    return withLocalStorage(async () => {
      const cacheKey = "toonspectrum-i18n-runtime:v1:es";
      localStorage.setItem(
        cacheKey,
        JSON.stringify(
          makeCachedLocalePayload("es", {
            "app.name": "ToonSpectrum Cached",
            "common.loading": "Cargando cached",
          })
        )
      );

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(
          '{"responseStatus":200,"responseData":{"translatedText":"x"}}',
          {
            status: 200,
          }
        )
      );

      await ensureRuntimeLocaleBundle("es");

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(resolveI18nValue("es", "app.name")).toBe("ToonSpectrum Cached");
      expect(resolveI18nValue("es", "common.loading")).toBe("Cargando cached");

      fetchSpy.mockRestore();
    });
  });

  it("falls back when translator returns non-success status", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ responseData: { translatedText: "Not used" }, responseStatus: 503 }),
          { status: 200 }
        )
      );

    await ensureRuntimeLocaleBundle("de");

    expect(resolveI18nValue("de", "app.name", ["en", "ko"])).toBe(i18nDict.en["app.name"]);

    fetchSpy.mockRestore();
  });
});

describe("translation dictionary completeness", () => {
  it("keeps every t() key covered by base dictionaries", () => {
    const usedKeys = collectSourceI18nKeys();
    const sourceKeys = new Set([...Object.keys(i18nDict.ko), ...Object.keys(i18nDict.en)]);
    const missing = [...usedKeys].filter((key) => !sourceKeys.has(key)).sort();

    expect(missing).toEqual([]);
  });
});
