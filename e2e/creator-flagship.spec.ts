import { expect, test } from "@playwright/test";

import { capturePageEvidence } from "./helpers/capture-page-evidence";

const THEME_STORAGE_KEY = "toonspectrum-theme";
const THEME_SCENES = {
  aurora: { mode: "light", scene: "aurora", src: "/brand/theme-scenes/aurora-studio.svg" },
  blossom: { mode: "light", scene: "blossom", src: "/brand/theme-scenes/blossom-studio.svg" },
  starlight: { mode: "dark", scene: "starlight", src: "/brand/theme-scenes/starlight-studio.svg" },
  dark: { mode: "dark", scene: "ink", src: "/brand/theme-scenes/ink-studio.svg" },
  light: { mode: "light", scene: "paper", src: "/brand/theme-scenes/paper-studio.svg" },
  graphite: { mode: "dark", scene: "graphite", src: "/brand/theme-scenes/graphite-studio.svg" },
  midnight: { mode: "dark", scene: "midnight", src: "/brand/theme-scenes/midnight-studio.svg" },
  sepia: { mode: "light", scene: "sepia", src: "/brand/theme-scenes/sepia-studio.svg" },
  contrast: { mode: "dark", scene: "contrast", src: "/brand/theme-scenes/contrast-studio.svg" },
} as const;

type ThemePreference = keyof typeof THEME_SCENES;

function themeEnvelope(preference: ThemePreference) {
  return JSON.stringify({
    state: { preference, studioPreference: "inherit", theme: THEME_SCENES[preference].mode },
    version: 0,
  });
}

async function applyTheme(page: import("@playwright/test").Page, preference: ThemePreference) {
  const serialized = themeEnvelope(preference);
  await page.evaluate(({ key, value }) => {
    localStorage.setItem(key, value);
    window.dispatchEvent(new StorageEvent("storage", {
      key,
      newValue: value,
      storageArea: localStorage,
    }));
  }, { key: THEME_STORAGE_KEY, value: serialized });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(({ language, themeKey, theme }) => {
    localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: language }, version: 0 }));
    localStorage.setItem(themeKey, theme);
    sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
  }, { language: "ko", themeKey: THEME_STORAGE_KEY, theme: themeEnvelope("light") });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (/\/auth\/session$/u.test(pathname)) {
      await route.fulfill({ status: 200, json: { authenticated: false, user: null } });
      return;
    }
    await route.fulfill({ status: 503, json: { message: "Deliberate offline fixture" } });
  });
});

for (const width of [320, 390, 820, 1440]) {
  test(`clarity home layout and keyboard navigation at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const home = page.locator('[data-creator-experience="clarity-v1"]');
    const heroArt = home.locator(".cf-home-preview .cf-theme-scene-image");
    const collageArt = home.locator(".cf-theme-collage img");
    const startCards = home.locator(".cf-start-card");

    await expect(home).toBeVisible();
    await expect(home).toHaveAttribute("data-theme-art", "light");
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(heroArt).toBeVisible();
    await expect(heroArt).toHaveAttribute("data-art-asset", "paper");
    await expect(heroArt).toHaveAttribute("src", THEME_SCENES.light.src);
    await expect(collageArt).toHaveCount(2);
    await expect(collageArt.first()).toHaveAttribute("srcset", /640w/u);
    await expect(startCards).toHaveCount(4);
    await startCards.first().focus();
    await expect(startCards.first()).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await heroArt.evaluate((image) => getComputedStyle(image).animationName)).toBe("none");

    const faq = home.locator(".cf-faq details").first();
    const summary = faq.locator("summary");
    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(faq).toHaveAttribute("open", "");

    await capturePageEvidence(page, testInfo, `clarity-${width}`);
    await applyTheme(page, "dark");
    await expect(home).toHaveAttribute("data-theme-art", "dark");
    await expect(heroArt).toHaveAttribute("data-art-asset", "ink");
    await expect(heroArt).toHaveAttribute("src", THEME_SCENES.dark.src);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await capturePageEvidence(page, testInfo, `clarity-dark-${width}`);
    expect(pageErrors).toEqual([]);
  });
}

test("Korean home search opens the global command palette without losing the query", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "작품·도구·소재·도움말 검색" }).click();
  const search = page.getByPlaceholder(/작품 제목, 작가, 기능 명령/u);
  await expect(search).toBeVisible();
  await search.fill("중세 갑옷");
  await expect(search).toHaveValue("중세 갑옷");
});

test("professional webtoon entry leads with creation and project continuity", async ({ page }) => {
  await page.goto("/");
  const home = page.locator('[data-creator-experience="clarity-v1"]');
  await expect(home.locator('.cf-hero a.cf-primary[href="/studio/new"]')).toBeVisible();
  await expect(home.locator('.cf-hero a.cf-secondary[href="/studio/projects"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/new?kind=webtoon&template=webtoon-vertical"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/new?kind=webtoon&template=webtoon-four-cut"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/new?kind=illustration&template=illustration-portrait"]')).toBeVisible();
  await expect(home.locator('.cf-start-card[href="/studio/assets/characters/new"]')).toBeVisible();
  await expect(home.locator('.cf-intent nav a')).toHaveCount(7);
});

test("all theme worlds swap imagery and reduced motion remains static", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const home = page.locator('[data-creator-experience="clarity-v1"]');
  const visual = home.locator(".cf-hero-visual");
  const art = home.locator(".cf-home-preview .cf-theme-scene-image");

  for (const [theme, expected] of Object.entries(THEME_SCENES) as [ThemePreference, (typeof THEME_SCENES)[ThemePreference]][]) {
    await applyTheme(page, theme);
    await expect(home).toHaveAttribute("data-theme-art", theme);
    await expect(visual).toHaveAttribute("data-theme-layout", expected.scene);
    await expect(art).toHaveAttribute("data-art-asset", expected.scene);
    await expect(art).toHaveAttribute("src", expected.src);
    expect(await art.evaluate((image) => getComputedStyle(image).animationName)).toBe("none");
  }
});
