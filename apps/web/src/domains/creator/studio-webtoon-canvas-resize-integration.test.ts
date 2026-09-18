import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const hostSource = readFileSync(
  new URL("./StudioCuttoonEditorHost.tsx", import.meta.url),
  "utf8",
);
const menuSource = readFileSync(
  new URL("./studio-main-menu-items-authoring.ts", import.meta.url),
  "utf8",
);

function functionBody(name: string, nextName: string): string {
  const start = hostSource.indexOf(`function ${name}`);
  const end = hostSource.indexOf(`function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return hostSource.slice(start, end);
}

describe("webtoon platform canvas resize integration", () => {
  it("routes Canvas menu platform rows to the current document instead of new-work navigation", () => {
    expect(menuSource).toContain("ui.applyWebtoonCanvasPreset(preset.id)");
    expect(menuSource).not.toContain("ui.openQuickStart(preset.id)");
    expect(menuSource).toContain("현재 캔버스 · ${preset.labelKo}");
  });

  it("uses the existing element reflow and one atomic canvas-height commit", () => {
    const resize = functionBody("applyMagicResizePreset", "disarmAllPixelTools");

    expect(hostSource).toContain(
      "applyWebtoonCanvasPreset: (presetId) => applyMagicResizePreset",
    );
    expect(hostSource).toContain(
      "studioWebtoonCanvasMagicResizePresetForId(presetId)",
    );
    expect(resize).toContain(
      "computeMagicResize(elements, from, to, magicResizeStrategy)",
    );
    expect(resize).toContain(
      "commit(nextElements as El[], { canvasH: to.height })",
    );
  });
});
