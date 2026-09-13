import type { Page, TestInfo } from "@playwright/test";

/** Capture every document region without allocating a full-page compositor surface.
 * Each tile is a real scrolled viewport; failures still fail the evidence check.
 */
export async function capturePageEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(async () => { await document.fonts.ready; });
  const size = await page.evaluate(() => ({
    width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth)),
    height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)),
    viewportWidth: innerWidth, viewportHeight: innerHeight, originalX: scrollX, originalY: scrollY,
  }));
  if (size.width < 1 || size.width > 8192 || size.height < 1 || size.height > 200_000
    || size.viewportWidth < 1 || size.viewportHeight < 1) {
    throw new Error(`Unexpected screenshot dimensions: ${size.width} x ${size.height}`);
  }
  const tileWidth = Math.min(size.viewportWidth, 2048);
  const tileHeight = Math.min(size.viewportHeight, 2048, Math.floor(4_000_000 / tileWidth));
  const tiles: { file: string; x: number; y: number; width: number; height: number }[] = [];
  try {
    for (let y = 0; y < size.height; y += tileHeight) {
      for (let x = 0; x < size.width; x += tileWidth) {
        const position = await page.evaluate(async ({ x, y }) => {
          scrollTo({ left: x, top: y, behavior: "instant" });
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return { x: scrollX, y: scrollY };
        }, { x, y });
        const region = { x, y, width: Math.min(tileWidth, size.width - x), height: Math.min(tileHeight, size.height - y) };
        // The final scroll is clamped at the document edge. Crop its overlap in
        // viewport coordinates rather than taking a second giant full-page image.
        const clip = { ...region, x: x - position.x, y: y - position.y };
        if (clip.x < 0 || clip.y < 0 || clip.x + clip.width > size.viewportWidth + 1
          || clip.y + clip.height > size.viewportHeight + 1) throw new Error("Evidence tile is outside the visible viewport");
        const file = `${name}-part-${String(tiles.length + 1).padStart(3, "0")}.jpg`;
        await page.screenshot({
          path: testInfo.outputPath(file), type: "jpeg", quality: 85, scale: "css",
          fullPage: false, clip, animations: "disabled", timeout: 30_000,
        });
        tiles.push({ file, ...region });
      }
    }
  } finally {
    await page.evaluate(({ originalX, originalY }) => {
      scrollTo({ left: originalX, top: originalY, behavior: "instant" });
    }, size);
  }
  const coveredPixels = tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0);
  if (coveredPixels !== size.width * size.height) throw new Error("Incomplete document screenshot coverage");
  await testInfo.attach(`${name}-coverage`, {
    body: JSON.stringify({ url: page.url(), ...size, coveredHeight: size.height, coveredPixels, tiles }, null, 2),
    contentType: "application/json",
  });
}
