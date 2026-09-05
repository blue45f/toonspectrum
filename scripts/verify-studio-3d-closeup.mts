/** Actual UI/compositor evidence. Images require visual review; no aesthetic auto-pass. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "playwright";

const ORIGIN = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "http://127.0.0.1:5173";
const OUTPUT = process.env.STUDIO_CLOSEUP_OUTPUT ?? "/tmp/studio-3d-closeup";
const ROOT = '[data-character-shaper="true"]';
const VIEWPORT = `${ROOT} [data-character-shaper-viewport]`;
const records: Record<string, unknown>[] = [];
const catalog: Record<string, { id: string; availability: string | null; label: string | null }[]> = {};
const errors: string[] = [];
mkdirSync(OUTPUT, { recursive: true });
const safeName = (value: string) => value.replace(/[^a-zA-Z0-9_-]+/g, "-");
const persist = () => writeFileSync(join(OUTPUT, "evidence.json"), JSON.stringify({
  source: process.env.GITHUB_SHA ?? "local", capturedAt: new Date().toISOString(),
  renderer: "Chromium SwiftShader WebGL2", externalFonts: "offline fallback",
  visualApproval: "pending-human-image-review", catalog, records, errors,
}, null, 2));

async function ready(page: Page) {
  // Canvas mount is NOT model readiness. In dev, dependency optimization can also remount the dialog.
  await page.locator(`${ROOT} button[aria-label="확대"]:not(:disabled)`).waitFor({ timeout: 300_000 });
}
async function camera(page: Page, label: string) {
  await page.locator(ROOT).getByRole("group", { name: "카메라 프리셋", exact: true })
    .getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(1000);
}
async function inspection(page: Page, id: string, fallback: string) {
  const select = page.getByRole("combobox", { name: "부위·방향 확대 검사", exact: true });
  if (await select.count()) {
    await select.selectOption(id);
    await page.waitForTimeout(1000);
  } else await camera(page, fallback);
}
async function capture(page: Page, name: string, full = false) {
  const box = await (full ? page.locator(ROOT) : page.locator(`${VIEWPORT} canvas`).first()).boundingBox();
  if (!box || box.width < 10 || box.height < 10) throw new Error(`Missing screenshot surface: ${name}`);
  const session = await page.context().newCDPSession(page);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
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
    persist();
    console.info(`[closeup] ${name}`);
  } finally {
    if (timer) clearTimeout(timer);
    await session.detach();
  }
}
async function slot(page: Page, kind: string) {
  await page.locator(`${ROOT} [data-character-slot="${kind}"]`).click();
  await page.waitForTimeout(300);
  catalog[kind] = await page.locator(`${ROOT} [data-character-slot-card]`).evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute("data-character-slot-card") ?? "", availability: element.getAttribute("data-character-slot-card-availability"), label: element.getAttribute("title"),
  })));
  persist();
}
async function commit(page: Page, id: string): Promise<boolean> {
  const card = page.locator(`${ROOT} [data-character-slot-card="${id}"]`);
  const count = await card.count();
  if (count === 0 || await card.getAttribute("aria-disabled") === "true") {
    records.push({ id, status: "unavailable", reason: count ? await card.getAttribute("title") : "Not present in current catalog" });
    persist();
    return false;
  }
  if (await card.getAttribute("aria-pressed") === "true") return true;
  await card.scrollIntoViewIfNeeded();
  await card.click();
  await page.waitForTimeout(1500);
  await ready(page);
  if (await card.getAttribute("aria-pressed") !== "true") throw new Error(`Card ${id} did not become selected`);
  return true;
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "ko-KR" });
  await context.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  // This visual lane has no Nest server; authentication is an explicit guest boundary, not a visual assertion.
  await context.route("**/api/auth/session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ authenticated: false, user: null }) }));
  await context.addInitScript(() => {
    localStorage.setItem("toonspectrum-studio-quick-start-dismissed", "1");
    localStorage.setItem("toonspectrum-studio-mobile-hint-dismissed", "1");
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  page.on("pageerror", (error) => { errors.push(error.message); persist(); });
  page.on("console", (message) => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) console.info(`[browser] ${message.text().slice(0, 400)}`); });
  try {
    await page.goto(`${ORIGIN}/studio/character`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await ready(page);
    await page.waitForTimeout(2500);
    console.info("[closeup] model controls ready");
    await capture(page, "00-original-ui", true);
    await camera(page, "전신");
    await capture(page, "01-original-full");
    await camera(page, "상반신");
    await capture(page, "02-original-bust");
    for (const kind of ["face-shape", "eyes", "irises", "nose", "mouth", "ears", "hair", "body", "top", "bottom", "shoes", "accessory", "expression", "pose", "hand-pose"]) await slot(page, kind);

    for (const kind of ["top", "bottom", "shoes"] as const) {
      await slot(page, kind);
      const ids = [...new Set(catalog[kind].map((entry) => entry.id))].filter((id) => id !== `${kind}:original`);
      for (const id of ids) {
        try {
          await commit(page, `${kind}:original`);
          if (!await commit(page, id)) continue;
          await camera(page, kind === "top" ? "상반신" : "전신");
          await capture(page, `${id}-front`);
          await camera(page, "사선");
          await capture(page, `${id}-three-quarter`);
          if (await page.getByRole("combobox", { name: "부위·방향 확대 검사", exact: true }).count()) {
            await inspection(page, kind === "top" ? "inspectTorsoBack" : kind === "bottom" ? "inspectLowerBody" : "inspectFeet", "전신");
            await capture(page, `${id}-detail`);
          }
        } catch (error) { records.push({ id, status: "failed", error: String(error) }); persist(); }
      }
      await commit(page, `${kind}:original`);
    }
    await slot(page, "accessory");
    for (const { id } of catalog.accessory) {
      try {
        if (!await commit(page, id)) continue;
        await camera(page, "상반신");
        await capture(page, `${id}-bust`);
        await camera(page, "사선");
        await capture(page, `${id}-three-quarter`);
        await page.locator(`${ROOT} [data-character-slot-card="${id}"]`).click();
        await page.waitForTimeout(600);
      } catch (error) { records.push({ id, status: "failed", error: String(error) }); persist(); }
    }
    await camera(page, "전신");
    await capture(page, "90-desktop-final", true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1500);
    await capture(page, "91-mobile-ui", true);
  } catch (error) {
    records.push({ status: "fatal", error: String(error) });
    await capture(page, "fatal-page", true).catch((captureError) => records.push({ status: "capture-failed", error: String(captureError) }));
  } finally {
    writeFileSync(join(OUTPUT, "page-text.txt"), await page.locator("body").innerText().catch(() => "unavailable"));
    persist();
    await browser.close();
  }
  if (records.some((record) => record.status === "fatal" || record.status === "failed") || errors.length > 0) process.exitCode = 1;
}
await main();
