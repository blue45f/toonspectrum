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
  it("closes every brush surface that can cover mobile or desktop drawing", () => {
    const close = sliceFunction("closeBrushSurfaces", "openMobileBrushLibrary");
    expect(close).toContain('[data-studio-brush-catalog-session="true"]');
    expect(close).toContain('[data-studio-brush-library="true"]');
    expect(close).toContain('[data-studio-mobile-sheet="draw"]');
    expect(close).toContain('page.keyboard.press("Escape")');
    expect(close).toContain('state: "hidden"');
    expect(close).toContain(".catch(() => false)");
  });

  it("opens the mobile catalogue through the real draw-settings sheet", () => {
    const open = sliceFunction("openMobileBrushLibrary", "selectBrush");
    expect(open).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(open).toContain('name: "브러시 설정 (굵기·색·프리셋)"');
    expect(open).toContain('page.locator("#studio-mobile-draw-settings")');
    expect(open).toContain('sheet.locator('[data-studio-open-brush-library="true"]')');
    expect(open).toContain('[data-studio-brush-library="true"]');
    expect(open).not.toContain('dock.locator('[data-studio-open-brush-library="true"]')');
  });

  it("keeps mobile and desktop brush selection on their actual surfaces", () => {
    const select = sliceFunction("selectBrush", "ensurePenReady");
    expect(select).toContain("await openMobileBrushLibrary(page)");
    expect(select).toContain('library.getByRole("searchbox")');
    expect(select).toContain('page.keyboard.press("b")');
    expect(select).toContain('[data-studio-brush-active-pill="true"]');
    expect(select).toContain("return closeBrushSurfaces(page)");
  });

  it("uses the real mobile pen authority and keeps the desktop shortcut fallback", () => {
    const pen = sliceFunction("ensurePenReady", "drawEvidenceStroke");
    expect(pen).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(pen).toContain('getByRole("button", { name: /^(?:펜|Pen)$/u })');
    expect(pen).toContain('getAttribute("aria-pressed")');
    expect(pen).toContain('page.keyboard.press("b")');
  });

  it("never measures ink while a brush surface is covering the canvas", () => {
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    const closeIndex = draw.indexOf("await closeBrushSurfaces(page)");
    const beforeShotIndex = draw.indexOf("const before = await page.screenshot");
    expect(closeIndex).toBeGreaterThanOrEqual(0);
    expect(closeIndex).toBeLessThan(beforeShotIndex);
    expect(draw).toContain("brush surfaces stayed open before drawing evidence");
  });

  it("spreads raster probes instead of repainting seven saturated lanes", () => {
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    expect(draw).not.toContain("const lane = cycle % 7");
    expect(draw).toContain("((cycle * 73) % 997) / 996");
    expect(draw).toContain("((cycle * 151) % 991) / 990");
    expect(draw).toContain("((cycle * 193) % 983) / 982");
  });
});
