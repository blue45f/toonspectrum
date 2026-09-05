/** Actual UI/compositor evidence. Captured images require visual review; no aesthetic auto-pass. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const ORIGIN = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "http://127.0.0.1:5173";
const OUTPUT = process.env.STUDIO_CLOSEUP_OUTPUT ?? "/tmp/studio-3d-closeup";
const ROOT = '[data-character-shaper="true"]';
const VIEWPORT = `${ROOT} [data-character-shaper-viewport]`;
const records: Record<string, unknown>[] = [];
const catalog: Record<string, unknown[]> = {};
const errors: string[] = [];
mkdirSync(OUTPUT, { recursive: true });
const safeName = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-");

async function camera(page: Page, label: string) {
  await page.locator(ROOT).getByRole("group", { name: "카메라 프리셋", exact: true })
    .getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(900);
}

async function capture(page: Page, name: string, full = false) {
  const box = await (full ? page.locator(ROOT) : page.locator(VIEWPORT)).boundingBox();
  if (!box || box.width < 10 || box.height < 10) throw new Error(`Missing screenshot surface: ${name}`);
  const session = await page.context().newCDPSession(page);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Page.captureScreenshot reads the composed frame. It does not wait indefinitely on remote
    // web-font promises, and does not modify the scene, materials or renderer for the screenshot.
    const image = await Promise.race([
      session.send("Page.captureScreenshot", {
        format: "png", fromSurface: true, captureBeyondViewport: false,
        clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: box.height, scale: 1 },
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Compositor capture timed out: ${name}`)), 60_000); }),
    ]);
    const file = `${safeName(name)}.png`;
    writeFileSync(join(OUTPUT, file), Buffer.from(image.data, "base64"));
    const canvases = await page.locator(`${VIEWPORT} canvas`).evaluateAll((elements) => elements.map((element) => {
      const canvas = element as HTMLCanvasElement;
      return { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight };
    }));
    records.push({ name, file, status: "captured-awaiting-visual-review", canvases });
    console.info(`[closeup] ${name}`);
  } finally {
    if (timer) clearTimeout(timer);
    await session.detach();
  }
}

async function slot(page: Page, kind: string) {
  await page.locator(`${ROOT} [data-character-slot="${kind}"]`).click();
  await page.waitForTimeout(250);
  catalog[kind] = await page.locator(`${ROOT} [data-character-slot-card]`).evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute("data-character-slot-card"), availability: element.getAttribute("data-character-slot-card-availability"), label: element.getAttribute("title"),
  })));
}

async function commit(page: Page, id: string): Promise<boolean> {
  const card = page.locator(`${ROOT} [data-character-slot-card="${id}"]`);
  const count = await card.count();
  if (count === 0 || await card.getAttribute("aria-disabled") === "true") {
    records.push({ id, status: "unavailable", reason: count ? await card.getAttribute("title") : "Not present in current catalog" });
    return false;
  }
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForTimeout(1_400);
  if (await card.getAttribute("aria-pressed") !== "true") throw new Error(`Card ${id} did not become selected`);
  return true;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "ko-KR" });
  // A static review has no remote font service; keep this limitation in the evidence manifest.
  await context.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  await context.addInitScript(() => {
    localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
    localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
    localStorage.setItem("toonspectrum-auth-session-v1", JSON.stringify({ user: { id: "11111111-2222-4333-8444-555555555555", name: "테스트 크리에이터", email: "creator-test@toonspectrum.dev", image: null, role: "creator" }, expires: new Date(Date.now() + 86_400_000).toISOString() }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) console.info(`[browser] ${message.text().slice(0, 400)}`); });
  try {
    await page.goto(`${ORIGIN}/studio/character`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.locator(ROOT).waitFor({ timeout: 240_000 });
    await page.locator(`${VIEWPORT} canvas`).first().waitFor({ timeout: 120_000 });
    await page.waitForTimeout(12_000);
    await capture(page, "00-original-ui", true);
    await camera(page, "전신");
    await capture(page, "01-original-full");
    await camera(page, "상반신");
    await capture(page, "02-original-bust");
    for (const kind of ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair", "body", "top", "bottom", "shoes", "accessory", "expression", "pose", "hand-pose"]) await slot(page, kind);
    await slot(page, "top");
    for (const item of ["tshirt", "shirt", "sweater", "tank", "hoodie", "blazer", "coat", "sailor", "dress", "scrubs"]) {
      try {
        await commit(page, "top:original");
        if (!await commit(page, `top:${item}`)) continue;
        await camera(page, "상반신");
        await capture(page, `top-${item}-bust`);
        await camera(page, "사선");
        await capture(page, `top-${item}-three-quarter`);
      } catch (error) { records.push({ id: `top:${item}`, status: "failed", error: String(error) }); }
    }
    await commit(page, "top:original");
    for (const [kind, items] of [["bottom", ["jeans", "pants", "wide", "shorts", "pleated", "longskirt"]], ["shoes", ["sneakers", "boots", "longboots", "heels", "sandals"]]] as const) {
      await slot(page, kind);
      for (const item of items) {
        try {
          if (!await commit(page, `${kind}:${item}`)) continue;
          await camera(page, "전신");
          await capture(page, `${kind}-${item}-full`);
        } catch (error) { records.push({ id: `${kind}:${item}`, status: "failed", error: String(error) }); }
      }
      await commit(page, `${kind}:original`);
    }
    await slot(page, "accessory");
    for (const item of ["glasses", "sunglasses", "cap", "headphones", "faceMask", "backpack", "shoulderbag", "scarf", "belt"]) {
      try {
        if (!await commit(page, `accessory:${item}`)) continue;
        await camera(page, "상반신");
        await capture(page, `accessory-${item}-bust`);
        await page.locator(`${ROOT} [data-character-slot-card="accessory:${item}"]`).click();
        await page.waitForTimeout(500);
      } catch (error) { records.push({ id: `accessory:${item}`, status: "failed", error: String(error) }); }
    }
    await camera(page, "전신");
    await capture(page, "90-desktop-final", true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1200);
    await capture(page, "91-mobile-ui", true);
  } catch (error) {
    records.push({ status: "fatal", error: String(error) });
    await capture(page, "fatal-page", true).catch((captureError) => records.push({ status: "capture-failed", error: String(captureError) }));
  } finally {
    writeFileSync(join(OUTPUT, "page-text.txt"), await page.locator("body").innerText().catch(() => "unavailable"));
    writeFileSync(join(OUTPUT, "evidence.json"), JSON.stringify({ source: process.env.GITHUB_SHA ?? "local", capturedAt: new Date().toISOString(), renderer: "Chromium SwiftShader WebGL2", externalFonts: "offline fallback", visualApproval: "pending-human-image-review", catalog, records, errors }, null, 2));
    await browser.close();
  }
  if (records.some((record) => record.status === "fatal" || record.status === "failed") || errors.length > 0) process.exitCode = 1;
}
await main();
