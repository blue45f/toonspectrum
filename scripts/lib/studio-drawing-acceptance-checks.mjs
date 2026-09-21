import assert from "node:assert/strict";
import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";

export async function auditDrawingControls(page) {
  const results = [];
  await page.getByRole("button", { name: "주 색", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "주 색 선택", exact: true });
  await expect(dialog).toBeVisible();
  for (const tab of ["선택", "배색"]) {
    await dialog.getByRole("tab", { name: tab, exact: true }).click();
    const result = await new AxeBuilder({ page }).include('[data-studio-color-popover]').analyze();
    const severe = result.violations.filter((item) => ["serious", "critical"].includes(item.impact));
    results.push({ surface: `color-${tab}`, severe: severe.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })) });
  }
  await dialog.getByRole("button", { name: "색상 선택 취소", exact: true }).click();
  await page.getByRole("button", { name: "설정 열기", exact: true }).click();
  const result = await new AxeBuilder({ page }).include('[data-studio-toolbar-configurator]').analyze();
  results.push({ surface: "toolbar-configurator", severe: result.violations.filter((item) => ["serious", "critical"].includes(item.impact)).map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) })) });
  await page.getByRole("button", { name: "취소", exact: true }).click();
  assert(results.every((item) => item.severe.length === 0), JSON.stringify(results));
  return results;
}

/** Synthetic input-to-animation-frame measurement, not a pen/display or renderer latency claim. */
export async function measureDrawingColorInteraction(page, url) {
  const target = new URL(url); target.searchParams.set("documentElements", "5000");
  await page.goto(target.href);
  const fixture = page.getByTestId("drawing-fixture");
  await expect(fixture).toHaveAttribute("data-persistence", "saved", { timeout: 45000 });
  await expect(fixture).toHaveAttribute("data-history-persistence", "saved", { timeout: 45000 });
  await expect(fixture).toHaveAttribute("data-document-elements", "5000");
  await page.getByRole("button", { name: "주 색", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "주 색 선택", exact: true });
  await dialog.getByRole("textbox", { name: "헥스 색상 코드" }).fill("#ff0000");
  const before = Number(await fixture.getAttribute("data-history-write-count"));
  const converterUrl = new URL("/src/domains/creator/studio-color-harmony-engine.ts", target).href;
  const result = await page.evaluate(async (moduleUrl) => {
    const { hsvToHex } = await import(moduleUrl);
    const slider = document.querySelector('[aria-label="빠른 색조"]');
    const output = document.querySelector('[aria-label="선택 중인 색상"]');
    if (!(slider instanceof HTMLInputElement) || !output) throw new Error("Missing real color controls");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    const samples = [];
    for (let i = 0; i < 130; i++) {
      const hue = (i * 29 + 1) % 359;
      const expected = hsvToHex(hue, 100, 100).toUpperCase();
      const start = performance.now();
      setValue.call(slider, String(hue)); slider.dispatchEvent(new Event("input", { bubbles: true }));
      for (let frame = 0; frame < 10; frame++) {
        await new Promise(requestAnimationFrame);
        if (output.textContent.toUpperCase() === expected) break;
      }
      if (output.textContent.toUpperCase() !== expected) throw new Error("Last hue input was not rendered");
      if (i >= 10) samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    return { samples: samples.length, p95Ms: samples[Math.ceil(samples.length * 0.95) - 1], maxMs: samples.at(-1), documentElements: 5000, metric: "synthetic input to next matching animation frame" };
  }, converterUrl);
  const after = Number(await fixture.getAttribute("data-history-write-count"));
  assert.equal(after - before, 0, "Preview must never call recent-color persistence");
  assert(result.p95Ms <= 50, `Color preview p95 exceeds 50ms: ${JSON.stringify(result)}`);
  await dialog.getByRole("button", { name: "색상 선택 취소", exact: true }).click();
  await expect(page.getByTestId("undo")).toHaveText("0");
  assert.equal(Number(await fixture.getAttribute("data-history-write-count")), before);
  return { ...result, previewHistoryWrites: after - before };
}
