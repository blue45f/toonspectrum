import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseURL = process.env.BASE_URL || "http://127.0.0.1:43197";
const output = "artifacts/nonstudio-art-direction";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR" });
const page = await context.newPage();
const results = [], failures = [], pageErrors = [];
page.on("pageerror", (error) => pageErrors.push({ url: page.url(), message: error.message }));
const routes = ["/about", "/discover", "/community", "/help", "/research", "/market", "/learn", "/calendar", "/insights/resources", "/showcase", "/make", "/"];
try {
  for (const route of routes) {
    try {
      await page.goto(new URL(route, baseURL).href, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator("h1").first().waitFor({ timeout: 45_000 });
      await page.waitForTimeout(400);
      const result = await page.evaluate(() => ({ title: document.querySelector("h1")?.textContent, width: innerWidth, contentWidth: document.documentElement.scrollWidth, compass: !!document.querySelector(".site-creation-compass"), hero: !!document.querySelector(".public-story-hero") }));
      results.push({ route, ...result });
      if (result.contentWidth > result.width + 1) failures.push(`${route}: horizontal overflow`);
      if (route === "/" && result.compass) failures.push("Home duplicated its creation guide");
      console.log(JSON.stringify(results.at(-1)));
    } catch (error) { failures.push(`${route}: ${error.message}`); }
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    await page.goto(new URL("/about", baseURL).href, { waitUntil: "domcontentloaded" });
    await page.locator(".public-story-hero__views").waitFor();
    await page.locator('.public-story-hero__views button').nth(1).click();
    await page.waitForFunction(() => { const image = document.querySelector(".public-story-hero .site-artwork > img"); return image && getComputedStyle(image).filter === "grayscale(1)"; });
    const values = await page.locator('.public-story-hero .site-artwork > img').evaluate(el => ({ filter: getComputedStyle(el).filter, loaded: el.complete && el.naturalWidth > 0, source: el.currentSrc }));
    if (values.filter !== "grayscale(1)" || !values.loaded) failures.push(`${width}: values study failed`);
    await page.locator('.public-story-hero__views button').nth(2).focus();
    await page.keyboard.press("Enter");
    if (await page.locator('.public-story-hero [data-artwork-view="composition"]').count() !== 1) failures.push(`${width}: keyboard composition failed`);
    await page.locator('.site-creation-compass summary').click();
    if (!await page.locator('.site-creation-compass details').evaluate(el => el.open)) failures.push(`${width}: creation brief failed`);
    await page.locator('.site-creation-compass summary').click();
    await page.screenshot({ path: `${output}/about-${width}.png`, fullPage: false });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) failures.push(`${width}: mobile overflow`);
    results.push({ width, values, keyboardComposition: true });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const transition = await page.locator('.site-artwork > img').first().evaluate(el => getComputedStyle(el).transitionDuration);
  if (transition.split(",").some(duration => Number.parseFloat(duration) > 0.0001)) failures.push("Reduced motion transition was not disabled");
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ baseURL, results, failures, pageErrors }, null, 2));
  await browser.close();
}
console.log(JSON.stringify({ checked: results.length, failures, pageErrors }, null, 2));
if (failures.length || pageErrors.length) process.exitCode = 1;
