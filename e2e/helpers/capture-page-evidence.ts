import type { Page, TestInfo } from "@playwright/test";

interface DocumentBounds { width: number; height: number }

async function readDocumentBounds(page: Page): Promise<DocumentBounds> {
  return page.evaluate(() => ({
    width: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth)),
    height: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)),
  }));
}

async function waitForStableDocumentBounds(
  page: Page,
  quietMs = 500,
  timeoutMs = 5_000,
): Promise<DocumentBounds> {
  let latest = await readDocumentBounds(page);
  let stableSince = Date.now();
  const deadline = stableSince + timeoutMs;
  while (Date.now() < deadline) {
    await page.waitForTimeout(100);
    const next = await readDocumentBounds(page);
    if (next.width === latest.width && next.height === latest.height) {
      if (Date.now() - stableSince >= quietMs) return next;
    } else {
      latest = next;
      stableSince = Date.now();
    }
  }
  return latest;
}

/** Capture the complete page at its real viewport size, with overlapping scroll tiles.
 * Never enlarge the compositor surface, hide decorations, or silently omit failed tiles.
 */
export async function capturePageEvidence(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.evaluate(async () => { await document.fonts.ready; });
  await waitForStableDocumentBounds(page);
  const original = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
  const tiles: { file: string; x: number; y: number; width: number; height: number }[] = [];
  let coveredHeight = 0;
  let documentHeight = 0;
  let documentWidth = 0;
  let targetY = 0;
  let gapRewinds = 0;
  try {
    for (let index = 0; index < 500; index += 1) {
      const frame = await page.evaluate(async (top) => {
        scrollTo({ left: 0, top, behavior: "instant" });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        return { x: scrollX, y: scrollY, width: innerWidth, height: innerHeight,
          documentWidth: Math.ceil(Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth)),
          documentHeight: Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight)) };
      }, targetY);
      documentHeight = frame.documentHeight;
      documentWidth = frame.documentWidth;
      if (documentWidth < 1 || documentWidth > 8192 || documentHeight < 1 || documentHeight > 200_000) {
        throw new Error(`Unexpected screenshot dimensions: ${documentWidth} x ${documentHeight}`);
      }
      if (frame.x > 1 || frame.width < documentWidth - 2) {
        throw new Error(`Screenshot horizontal overflow: ${documentWidth}px document in ${frame.width}px viewport at ${frame.x}, ${frame.y}`);
      }
      if (frame.y > coveredHeight + 1) {
        if (gapRewinds >= 8) throw new Error(`Screenshot coverage gap at ${frame.x}, ${frame.y}`);
        const overlap = Math.min(160, Math.floor(frame.height / 3));
        targetY = Math.max(0, coveredHeight - overlap);
        gapRewinds += 1;
        await page.waitForTimeout(50);
        continue;
      }
      gapRewinds = 0;
      const file = `${name}-part-${String(tiles.length + 1).padStart(3, "0")}.jpg`;
      await page.screenshot({
        path: testInfo.outputPath(file), type: "jpeg", quality: 85, scale: "css",
        fullPage: false, animations: "disabled", timeout: 30_000,
      });
      tiles.push({ file, x: frame.x, y: frame.y, width: frame.width, height: frame.height });
      coveredHeight = Math.max(coveredHeight, Math.min(documentHeight, frame.y + frame.height));
      const overlap = Math.min(160, Math.floor(frame.height / 3));
      if (coveredHeight >= documentHeight) {
        const settled = await waitForStableDocumentBounds(page, 300, 2_000);
        documentHeight = settled.height;
        documentWidth = settled.width;
        if (frame.width < documentWidth - 2) {
          throw new Error(`Screenshot horizontal overflow: ${documentWidth}px document in ${frame.width}px viewport at ${frame.x}, ${frame.y}`);
        }
        if (coveredHeight >= documentHeight) break;
        targetY = Math.max(0, coveredHeight - overlap);
        continue;
      }
      const next = Math.max(0, coveredHeight - overlap);
      if (next <= frame.y) throw new Error("Screenshot scroll made no forward progress");
      targetY = next;
    }
    if (coveredHeight < documentHeight) throw new Error("Screenshot coverage limit reached before the document end");
    await testInfo.attach(`${name}-coverage`, {
      body: JSON.stringify({ url: page.url(), width: documentWidth, height: documentHeight, coveredHeight, tiles }, null, 2),
      contentType: "application/json",
    });
  } finally {
    await page.evaluate(({ x, y }) => scrollTo({ left: x, top: y, behavior: "instant" }), original);
  }
}
