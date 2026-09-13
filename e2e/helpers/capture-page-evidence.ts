import type { Page, TestInfo } from "@playwright/test";

/** Capture all vertical content in bounded document-coordinate clips.
 * Failed clips fail the test; layout, zoom, fonts and decorations are preserved.
 */
export async function capturePageEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(async () => { await document.fonts.ready; });
  const size = await page.evaluate(() => ({
    width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth)),
    height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)),
  }));
  if (size.width < 1 || size.width > 8192 || size.height < 1 || size.height > 200_000) {
    throw new Error(`Unexpected screenshot dimensions: ${size.width} x ${size.height}`);
  }
  const tileHeight = Math.min(2048, Math.floor(4_000_000 / size.width));
  const tiles: { file: string; x: number; y: number; width: number; height: number }[] = [];
  for (let y = 0; y < size.height; y += tileHeight) {
    const clip = { x: 0, y, width: size.width, height: Math.min(tileHeight, size.height - y) };
    const file = `${name}-part-${String(tiles.length + 1).padStart(3, "0")}.jpg`;
    await page.screenshot({
      path: testInfo.outputPath(file), type: "jpeg", quality: 85, scale: "css",
      fullPage: true, clip, animations: "disabled", timeout: 30_000,
    });
    tiles.push({ file, ...clip });
  }
  await testInfo.attach(`${name}-coverage`, {
    body: JSON.stringify({ url: page.url(), ...size, coveredHeight: tiles.reduce((sum, tile) => sum + tile.height, 0), tiles }, null, 2),
    contentType: "application/json",
  });
}
