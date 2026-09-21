import { expect, test } from "@playwright/test";

const WIDTHS = [320, 390, 768, 1024, 1440, 1920] as const;
const PROJECT = `project-${"long-material-library-".repeat(4)}`;

for (const language of ["ko", "en"] as const) {
  test(`asset guide and navigation remain contained and readable (${language})`, async ({ page }, testInfo) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript((lang) => {
      localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang }, version: 0 }));
      sessionStorage.setItem("toonspectrum-compat-dismissed", "true");
    }, language);
    await page.route("**/api/**", async (route) => {
      const session = new URL(route.request().url()).pathname.endsWith("/auth/session");
      await route.fulfill({ status: session ? 200 : 503,
        json: session ? { authenticated: false, user: null } : { message: "Layout test: offline service" } });
    });
    await page.goto(`/studio/assets?project=${PROJECT}`, { waitUntil: "domcontentloaded" });
    const hub = page.locator("[data-studio-asset-hub]");
    await expect(hub).toBeVisible();
    const guide = hub.locator("details");
    await expect(guide).not.toHaveAttribute("open", "");
    await guide.locator("summary").click();
    const intro = page.locator(".studio-asset-visual-intro");
    const hero = intro.locator(".studio-asset-visual-intro__hero");
    const scenes = intro.locator(".studio-asset-visual-intro__scenes");
    await expect(hero).toHaveCSS("display", "grid");
    await expect(scenes).toHaveCSS("display", "grid");
    for (const image of await intro.locator("img").all()) {
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement ? element.naturalWidth : 0)).toBeGreaterThan(0);
    }
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      const layout = await intro.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const cards = [...element.querySelectorAll<HTMLElement>(".studio-asset-visual-intro__scene-copy")];
        const controls = [...element.querySelectorAll<HTMLElement>(".studio-asset-visual-intro__actions a")];
        const heading = element.querySelector<HTMLElement>("h2")!;
        return { left: rect.left, right: rect.right,
          cards: cards.map((card) => ({ width: card.clientWidth, scroll: card.scrollWidth })),
          controls: controls.map((control) => ({ height: control.clientHeight, width: control.clientWidth, scroll: control.scrollWidth })),
          heading: { width: heading.clientWidth, scroll: heading.scrollWidth } };
      });
      expect(layout.left, `guide left at ${width}px`).toBeGreaterThanOrEqual(0);
      expect(layout.right, `guide right at ${width}px`).toBeLessThanOrEqual(width);
      for (const card of layout.cards) {
        expect(card.width, `readable card copy at ${width}px`).toBeGreaterThanOrEqual(96);
        expect(card.scroll).toBeLessThanOrEqual(card.width + 1);
      }
      for (const control of layout.controls) {
        expect(control.height).toBeGreaterThanOrEqual(42);
        expect(control.scroll).toBeLessThanOrEqual(control.width + 1);
      }
      expect(layout.heading.scroll).toBeLessThanOrEqual(layout.heading.width + 1);
      if (width === 390 || width === 1440) {
        await testInfo.attach(`asset-guide-${language}-${width}`, { body: await intro.screenshot(), contentType: "image/png" });
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const lastView = hub.locator("nav a").last();
    await lastView.focus();
    await expect(lastView).toBeFocused();
    const tab = await lastView.boundingBox();
    expect(tab).not.toBeNull();
    expect(tab!.x).toBeGreaterThanOrEqual(0);
    expect(tab!.x + tab!.width).toBeLessThanOrEqual(390);
    await guide.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(guide).not.toHaveAttribute("open", "");
    expect(pageErrors).toEqual([]);
  });
}
