import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./verify-studio-five-hour-soak.mts", import.meta.url), "utf8");

function sliceFunction(name: string, nextName: string): string {
  const start = source.indexOf(`async function ${name}`);
  const end = source.indexOf(`async function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("Studio five-hour soak browser state isolation", () => {
  it("closes a stale brush catalogue instead of treating it as drawing state", () => {
    const closeCatalog = sliceFunction("closeBrushCatalog", "selectBrush");
    expect(closeCatalog).toContain('page.keyboard.press("Escape")');
    expect(closeCatalog).toContain('state: "hidden"');
    expect(closeCatalog).toContain(".catch(() => false)");
  });

  it("normalizes catalogue state before opening and requires it closed after selection", () => {
    const selectBrush = sliceFunction("selectBrush", "ensurePenReady");
    const normalizeIndex = selectBrush.indexOf("await closeBrushCatalog(page)");
    const openIndex = selectBrush.indexOf("await opener.click()");
    const chooseIndex = selectBrush.indexOf("await option.first().click");
    const verifyClosedIndex = selectBrush.lastIndexOf("closeBrushCatalog(page)");

    expect(normalizeIndex).toBeGreaterThanOrEqual(0);
    expect(normalizeIndex).toBeLessThan(openIndex);
    expect(chooseIndex).toBeGreaterThan(openIndex);
    expect(verifyClosedIndex).toBeGreaterThan(chooseIndex);
    expect(selectBrush).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(selectBrush).toContain('[data-studio-open-brush-library="true"]');
    expect(selectBrush).not.toContain('waitFor({ state: "hidden", timeout: 3_000 }).catch(() => undefined)');
  });

  it("uses the real mobile pen authority and keeps the desktop shortcut as fallback", () => {
    const pen = sliceFunction("ensurePenReady", "drawEvidenceStroke");
    expect(pen).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(pen).toContain('getByRole("button", { name: /^(?:펜|Pen)$/u })');
    expect(pen).toContain('getAttribute("aria-pressed")');
    expect(pen).toContain('page.keyboard.press("b")');
  });

  it("never measures ink while the brush catalogue is covering the canvas", () => {
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    const closeIndex = draw.indexOf("await closeBrushCatalog(page)");
    const beforeShotIndex = draw.indexOf("const before = await page.screenshot");

    expect(closeIndex).toBeGreaterThanOrEqual(0);
    expect(closeIndex).toBeLessThan(beforeShotIndex);
    expect(draw).toContain("brush catalogue stayed open before drawing evidence");
  });

  it("spreads raster probes instead of repainting seven saturated lanes", () => {
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    expect(draw).not.toContain("const lane = cycle % 7");
    expect(draw).toContain("((cycle * 73) % 997) / 996");
    expect(draw).toContain("((cycle * 151) % 991) / 990");
    expect(draw).toContain("((cycle * 193) % 983) / 982");
  });
});
