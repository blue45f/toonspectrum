import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import type { TestInfo } from "@playwright/test";
import { capturePageEvidence } from "../e2e/helpers/capture-page-evidence";

const output = path.resolve("artifacts/main-only-validation/capture-contract");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const reports: unknown[] = [];
try {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const page = await browser.newPage({ viewport });
    await page.setContent(`<style>body{margin:0}main{width:${viewport.width + 123}px;height:3721px;background:linear-gradient(#def,#456)}</style><main>Real viewport capture contract</main>`);
    await page.evaluate(() => scrollTo(7, 123));
    const initial = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    let coverage = "";
    const capture = page.screenshot.bind(page);
    page.screenshot = (options) => {
      assert.equal(options?.fullPage, false, "Do not allocate a full document surface");
      assert(options?.clip && options.clip.width <= viewport.width && options.clip.height <= viewport.height);
      return capture(options);
    };
    const info = {
      outputPath: (file: string) => path.join(output, file),
      attach: async (_name: string, attachment: { body: string | Buffer }) => { coverage = attachment.body.toString(); },
    } as unknown as TestInfo;
    await capturePageEvidence(page, info, `viewport-${viewport.width}`);
    const report = JSON.parse(coverage) as { width: number; height: number; coveredPixels: number; tiles: { file: string; width: number; height: number }[] };
    assert.equal(report.coveredPixels, report.width * report.height);
    assert(report.tiles.length > 1);
    assert.deepEqual(await page.evaluate(() => ({ x: scrollX, y: scrollY })), initial);
    for (const tile of report.tiles) {
      const encoded = (await readFile(path.join(output, tile.file))).toString("base64");
      const decoded = await page.evaluate(async (encoded) => {
        const image = new Image(); image.src = `data:image/jpeg;base64,${encoded}`; await image.decode();
        return { width: image.naturalWidth, height: image.naturalHeight };
      }, encoded);
      assert.deepEqual(decoded, { width: tile.width, height: tile.height });
    }
    reports.push(report);
    await page.close();
  }
  await writeFile(path.join(output, "report.json"), JSON.stringify(reports, null, 2));
  console.log("Real mobile/desktop tiled captures, complete coverage and scroll restoration passed.");
} finally { await browser.close(); }
