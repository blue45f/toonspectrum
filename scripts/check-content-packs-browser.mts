import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import { chromium } from "playwright";

const base = process.env.CONTENT_PACKS_BASE_URL ?? "http://127.0.0.1:5193";
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_EXECUTABLE_PATH ?? (existsSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome") ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : undefined) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  page.on("pageerror", (error) => { errors.push(error.message); console.error("PAGE ERROR", error.message); });
  page.on("console", (message) => { if (message.type() === "error") console.error("CONSOLE", message.text()); });
  let searches = 0;
  await page.route("**/api/creator-resources/search?**", async (route) => {
    searches += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ provider: "aic", status: "ready", page: 1, hasMore: false, fetchedAt: "2026-09-13T10:00:00Z", message: "Browser fixture: live adapter is checked separately.", items: [{ id: "aic:116363", provider: "aic", title: "Browser test armor", creator: "Test maker", description: "Synthetic UI fixture", sourceUrl: "https://www.artic.edu/artworks/116363", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", credit: "Browser test fixture", fetchedAt: "2026-09-13T10:00:00Z" }] }) });
  });
  await page.goto(`${base}/research/packs`, { waitUntil: "domcontentloaded" });
  console.log("Initial", page.url(), await page.title());
  await page.screenshot({ path: "/private/tmp/toonstudio-free-content-loading.png" });
  await page.getByRole("heading", { name: "오픈 콘텐츠 제작실", exact: true }).waitFor({ timeout: 45000 });
  if (searches !== 0) throw new Error("Unexpected initial resource search");
  await page.getByRole("button", { name: "갑옷 검색", exact: true }).click();
  await page.getByRole("button", { name: "보드에 저장", exact: true }).click();
  await page.getByRole("checkbox", { name: /Browser test armor/u }).check();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "브리프 Markdown 내보내기", exact: true }).click();
  const download = await downloadEvent;
  const output = "/private/tmp/toonstudio-free-content-browser-brief.md";
  await download.saveAs(output);
  const text = await readFile(output, "utf8");
  if (!text.includes("https://www.artic.edu/artworks/116363") || !text.includes("Browser test fixture")) throw new Error("Missing exported provenance");
  await page.screenshot({ path: "/private/tmp/toonstudio-free-content-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "/private/tmp/toonstudio-free-content-mobile.png", fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log(JSON.stringify({ searches, download: download.suggestedFilename(), exportedCredit: true, mobileOverflow: overflow, pageErrors: errors }));
  if (overflow || errors.length) throw new Error("Browser verification failed");
} finally { await browser.close(); }
