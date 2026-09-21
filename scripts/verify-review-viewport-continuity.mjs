import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const origin = process.env.STUDIO_QA_BASE_URL || "http://127.0.0.1:4456";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "This fixture is local-only");
const output = "artifacts/review-viewport-continuity";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
const ratios = (pane) => pane.evaluate((node) => ({
  x: node.scrollLeft / Math.max(1, node.scrollWidth - node.clientWidth),
  y: node.scrollTop / Math.max(1, node.scrollHeight - node.clientHeight),
}));
async function ready(page, side) {
  const pane = page.locator(`[data-review-compare-pane="${side}"]`);
  await expect(pane).toBeVisible();
  await expect.poll(() => pane.locator("img").evaluateAll((images) => images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  return pane;
}
async function scroll(pane, y, x = 0) {
  await pane.hover();
  const delta = await pane.evaluate((node, position) => ({
    x: (node.scrollWidth - node.clientWidth) * position.x - node.scrollLeft,
    y: (node.scrollHeight - node.clientHeight) * position.y - node.scrollTop,
  }), { x, y });
  await pane.page().mouse.wheel(delta.x, delta.y);
  await expect.poll(async () => Math.abs((await ratios(pane)).y - y)).toBeLessThan(0.015);
}
async function retains(pane, y) {
  await expect.poll(async () => Math.abs((await ratios(pane)).y - y)).toBeLessThan(0.015);
}
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 })));
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/tools/browser-harnesses/virtual-studio-review-viewport.html`);
      const layout = page.locator("[data-review-compare-layout]");
      await expect(layout).toHaveAttribute("data-review-compare-layout", width < 768 ? "single" : "side-by-side");
      const left = await ready(page, "left"); await scroll(left, 0.25);
      if (width >= 768) { const right = await ready(page, "right"); await scroll(right, 0.7); }
      await page.getByRole("button", { name: "A/B 전환", exact: true }).click();
      await retains(await ready(page, "left"), 0.25);
      await page.getByRole("button", { name: "B · 비교본", exact: true }).click();
      const right = await ready(page, "right");
      if (width >= 768) await retains(right, 0.7);
      await page.getByRole("combobox", { name: "확대", exact: true }).selectOption("200");
      if (width >= 768) await retains(right, 0.7);
      await scroll(right, 0.65, 0.4);
      await page.getByRole("button", { name: "미리보기 주소 갱신", exact: true }).click();
      await retains(right, 0.65);
      await page.getByRole("button", { name: "겹쳐 보기", exact: true }).click();
      const overlay = await ready(page, "overlay"); await retains(overlay, 0.65);
      await page.getByRole("combobox", { name: "원고 배경", exact: true }).selectOption("light");
      await expect(overlay).toHaveCSS("background-color", "rgb(247, 247, 247)");
      await page.setViewportSize({ width: width === 1440 ? 820 : 320, height: 900 });
      await retains(overlay, 0.65);
      await overlay.focus(); await expect(overlay).toBeFocused();
      await page.getByRole("button", { name: "보기 위치 초기화", exact: true }).click();
      await retains(overlay, 0);
      await expect(page.getByRole("combobox", { name: "확대", exact: true })).toHaveValue("100");
      await page.getByRole("button", { name: "원본 페이지 변경", exact: true }).click();
      await expect(page.getByRole("button", { name: "겹쳐 보기", exact: true })).toBeDisabled();
      await retains(await ready(page, "left"), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal page overflow");
      await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      results.push({ width, status: "passed", scenarios: ["responsive default", "independent A/B", "zoom", "lease renewal", "overlay", "background", "resize", "keyboard", "reset", "source change"] });
      console.log(`PASS review viewport ${width}`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, evidence: "actual component, local synthetic images; not server ACL or WAN verification", results }, null, 2));
}
