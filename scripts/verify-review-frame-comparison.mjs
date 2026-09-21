import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";

const origin = process.env.STUDIO_QA_BASE_URL || "http://127.0.0.1:4491";
assert(["127.0.0.1", "localhost"].includes(new URL(origin).hostname), "Fixture is local-only");
const output = "artifacts/review-source-cuts";
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
try {
  for (const width of [1440, 820, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ko-KR", reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("toonspectrum-lang", JSON.stringify({ state: { lang: "ko" }, version: 0 })));
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    try {
      await page.goto(`${origin}/tools/browser-harnesses/virtual-studio-review-viewport.html`);
      const panel = page.getByRole("region", { name: "컷 단위 비교", exact: true });
      await expect(panel.getByRole("img")).toHaveCount(0);
      await page.getByRole("button", { name: "컷 단위로 비교", exact: true }).click();
      const select = panel.getByRole("combobox", { name: "비교할 원본 컷", exact: true });
      await select.selectOption("shared-cut");
      await expect(panel.getByRole("img")).toHaveCount(2);
      await expect.poll(() => panel.getByRole("img").evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
      for (const [label, y] of [["기준본 컷 영역", 1040], ["비교본 컷 영역", 3540]]) {
        const region = panel.getByRole("region", { name: label, exact: true });
        const geometry = await region.evaluate((node) => {
          const crop = node.querySelector("[data-review-cut-window]").getBoundingClientRect();
          const image = node.querySelector("img").getBoundingClientRect();
          return { width: crop.width, height: crop.height, left: image.left - crop.left, top: image.top - crop.top, imageWidth: image.width };
        });
        assert(Math.abs(geometry.left + geometry.width * 30 / 740) < 1, "authoring x projection");
        assert(Math.abs(geometry.top + geometry.height * y / 400) < 1, "version-specific authoring y projection");
        assert(Math.abs(geometry.imageWidth - geometry.width * 800 / 740) < 1, "render scale projection");
        await region.focus(); await expect(region).toBeFocused();
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "no horizontal document overflow");
      await panel.screenshot({ path: `${output}/${width}.png` });
      await page.getByRole("button", { name: "미리보기 주소 갱신", exact: true }).click();
      await expect(select).toHaveValue("shared-cut");
      await select.selectOption("left-cut-0");
      await expect(panel.getByRole("img", { name: "비교본 컷 영역", exact: true })).toHaveCount(0);
      await expect(panel.getByText(/삭제 여부는 단정하지 않습니다/u)).toBeVisible();
      await panel.getByRole("combobox", { name: "컷을 고를 검수본", exact: true }).selectOption("right");
      await expect(select).toHaveValue("");
      await select.selectOption("shared-cut");
      await expect(panel.getByRole("img")).toHaveCount(2);
      await panel.getByRole("textbox", { name: "원본 컷 ID 검색", exact: true }).fill("absent");
      await expect(panel.getByRole("img")).toHaveCount(0);
      await page.getByRole("button", { name: "원본 페이지 변경", exact: true }).click();
      await expect(panel.getByRole("button", { name: "컷 단위로 비교", exact: true })).toHaveAttribute("aria-expanded", "false");
      assert.deepEqual(errors, []);
      results.push({ width, status: "passed", scenarios: ["explicit opening", "moved cut crops", "source pixel projection", "keyboard", "no overflow", "lease renewal", "missing counterpart", "reverse selection", "search reset", "source reset"] });
      console.log(`PASS review source cuts ${width}`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ origin, evidence: "actual components with local synthetic images, not production authorization or WAN", results }, null, 2));
}
