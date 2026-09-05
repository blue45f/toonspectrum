/** Real UI recovery/scene frames; software-GPU/in-app emulation is not native-device approval. */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chromium, type Locator, type Page } from "playwright";

const output = process.env.STUDIO_CLOSEUP_OUTPUT ?? "/tmp/studio-3d-background-review";
const origin = process.env.TOONSPECTRUM_VERIFY_ORIGIN ?? "http://127.0.0.1:5173";
const source = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const records: Record<string, unknown>[] = [];
const errors: string[] = [];
mkdirSync(output, { recursive: true });
function persist() {
  writeFileSync(join(output, "evidence.json"), JSON.stringify({ source, renderer: "Chromium SwiftShader WebGL2", profile: "KakaoTalk Android user-agent emulation; desktop and narrow viewport", visualApproval: "pending-image-review", records, errors }, null, 2));
}
function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
async function capture(page: Page, target: Locator, name: string, requirePaint = false) {
  const box = await target.boundingBox();
  assert(Boolean(box), `Missing surface ${name}`);
  const session = await page.context().newCDPSession(page);
  try {
    const image = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false, clip: { ...box!, scale: 1 } });
    writeFileSync(join(output, `${name}.png`), Buffer.from(image.data, "base64"));
    const signal = await page.evaluate(async (encoded) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
      const canvas = new OffscreenCanvas(160, 120);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0, 160, 120);
      bitmap.close();
      const pixels = context.getImageData(0, 0, 160, 120).data;
      const colors = new Map<number, number>();
      for (let i = 0; i < pixels.length; i += 4) {
        const key = (pixels[i] >> 3) * 1024 + (pixels[i + 1] >> 3) * 32 + (pixels[i + 2] >> 3);
        colors.set(key, (colors.get(key) ?? 0) + 1);
      }
      return { colors: colors.size, dominantShare: Math.max(...colors.values()) / (160 * 120) };
    }, image.data);
    records.push({ name, file: `${name}.png`, signal, status: "captured-awaiting-visual-review" });
    persist();
    if (requirePaint) assert(signal.colors > 24 && signal.dominantShare < 0.97, `${name}: blank canvas`);
  } finally { await session.detach(); }
}
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const [id, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]] as const) {
    const context = await browser.newContext({ viewport: { width, height }, locale: "ko-KR", userAgent: "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK 10.4.3" });
    await context.route("**/api/auth/session", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ authenticated: false, user: null }) }));
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);
    page.on("pageerror", (error) => errors.push(error.message));
    const root = page.locator('[data-testid="studio-bg3d-dialog"]');
    try {
      await page.goto(`${origin}/studio/bg3d`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      const gate = root.getByTestId("studio-bg3d-engine-unavailable");
      await gate.waitFor({ timeout: 120_000 });
      assert(await root.getByTestId("studio-bg3d-empty-scene-guide").count() === 0, "Tutorial covers unavailable engine");
      await capture(page, root, `${id}-engine-choice`);
      const button = gate.getByRole("button", { name: "WebGL2로 열기", exact: true });
      const buttonBox = await button.boundingBox();
      assert(Boolean(buttonBox && buttonBox.height >= 44), "Recovery action is not a 44px target");
      await button.click();
      await gate.waitFor({ state: "detached", timeout: 90_000 });
      const canvas = root.locator('[data-testid="studio-bg3d-viewport"] canvas').first();
      await canvas.waitFor({ timeout: 90_000 });
      await page.waitForTimeout(1500);
      await capture(page, root, `${id}-recovered-ui`);
      if (id === "desktop") {
        await root.getByRole("tab", { name: "템플릿", exact: true }).click();
        for (const name of ["교실", "카페", "침실"]) {
          await root.getByRole("button", { name: new RegExp(`^${name}오브젝트|^${name} 오브젝트`) }).first().click();
          await page.waitForTimeout(2000);
          await capture(page, canvas, `${id}-${name === "교실" ? "classroom" : name === "카페" ? "cafe" : "bedroom"}`, true);
        }
      }
      records.push({ id, status: "explicit-recovery-verified", overflowPx: await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth)) });
    } catch (error) {
      records.push({ id, status: "failed", error: String(error) });
      await capture(page, root, `${id}-failure`).catch(() => undefined);
    } finally {
      writeFileSync(join(output, `${id}-page.txt`), await page.locator("body").innerText().catch(() => "unavailable"));
      persist();
      await context.close();
    }
  }
} finally { await browser.close(); }
if (errors.length || records.some((record) => record.status === "failed")) process.exitCode = 1;
