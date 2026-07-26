import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { BRUSH_PRESETS } from "./studio-brush";
import { STUDIO_ALL_BRUSH_CATALOG_ITEMS } from "./studio-brush-catalog";

const root = resolve(import.meta.dirname, "../../..");
const harness = readFileSync(resolve(root, "scripts/verify-studio-brushes.mts"), "utf8");

describe("Studio brush browser harness catalogue boundary", () => {
  it("keeps the full product catalogue unique and its core partition identical to BRUSH_PRESETS", () => {
    const presetIds = BRUSH_PRESETS.map((preset) => preset.id);
    const catalogIds = STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id);
    const catalogNames = STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.name);
    const coreIds = STUDIO_ALL_BRUSH_CATALOG_ITEMS
      .filter((item) => item.source === "core")
      .map((item) => item.id);
    const proIds = STUDIO_ALL_BRUSH_CATALOG_ITEMS
      .filter((item) => item.source === "pro")
      .map((item) => item.id);

    expect(BRUSH_PRESETS.length).toBeGreaterThan(0);
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS.length).toBeGreaterThan(0);
    expect(new Set(presetIds).size).toBe(presetIds.length);
    expect(new Set(catalogIds).size).toBe(catalogIds.length);
    expect(new Set(catalogNames).size).toBe(catalogNames.length);
    expect(coreIds).toHaveLength(presetIds.length);
    expect(new Set(coreIds)).toEqual(new Set(presetIds));
    for (const item of STUDIO_ALL_BRUSH_CATALOG_ITEMS.filter(
      (candidate) => candidate.source === "core",
    )) {
      const preset = BRUSH_PRESETS.find((candidate) => candidate.id === item.id);
      expect(preset, `${item.id}: core catalogue item has no renderer preset`).toMatchObject({
        id: item.id,
        name: item.name,
        defaultWidth: item.defaultWidth,
        defaultOpacity: item.defaultOpacity,
      });
    }
    expect(catalogIds).toEqual([...coreIds, ...proIds]);
  });

  it("derives browser expectations from catalogue sources and audits the exact UI selection list", () => {
    expect(harness).toContain("const BUILT_IN_BRUSH_PRESET_COUNT = BRUSH_PRESETS.length;");
    expect(harness).toContain(
      "const PRODUCT_BRUSH_CATALOG_COUNT = STUDIO_ALL_BRUSH_CATALOG_ITEMS.length;",
    );
    expect(harness).toContain("assertProductBrushCatalogContract()");
    expect(harness).toContain("assertUiBrushCatalogMatchesProductCatalog(firstCatalog)");
    expect(harness).toContain(
      'firstCatalog.locator(\'[data-studio-brush-library-close="true"]\')',
    );
    expect(harness).toContain(
      'drawSheet.locator(\'[data-studio-open-brush-library="true"]\')',
    );
    expect(harness).not.toContain('name: "앱 브러시 닫기"');
    expect(harness).not.toContain('name: "기본 프리셋 전체 보기"');
    expect(harness).toContain(
      'JSON.stringify(actualSelections) === JSON.stringify(expectedSelections)',
    );
    expect(harness).toContain(
      "coreCatalogIds.every((id) => presetById.has(id))",
    );
    expect(harness).not.toContain("BRUSH_PRESETS.length === 37");
    expect(harness).not.toContain("evidence.length === 37");
    expect(harness).not.toContain("/37 long strokes");
  });

  it("isolates every sparse long route and makes drawing-only run both short and long matrices", () => {
    expect(harness).toContain(
      "const desktop = shapesOnly ? null : await runDesktopBrushMatrix(browser, studioUrl);",
    );
    expect(harness).toContain(
      "const longBrushes = shapesOnly ? null : await runLongBrushMatrix(browser, studioUrl);",
    );
    expect(harness).toContain(
      "const smartShapes = drawingOnly ? null : await runSmartShapeMatrix(browser, studioUrl);",
    );
    expect(harness).toContain("const y = safeTop + (safeBottom - safeTop) / 2;");
    expect(harness).toContain("waitForPersistedSingleLongStroke(page, preset.id)");
    expect(harness).toContain("persistedPathDistance >= 300");
    expect(harness).toContain('await page.keyboard.press("Meta+z")');
    expect(harness).not.toContain(
      "((safeBottom - safeTop) * (index + 0.5)) / BRUSH_PRESETS.length",
    );
  });

  it("allows only the exact current local-preview Socket.IO shutdown and no obsolete visit ping", () => {
    expect(harness).toContain('previewUrl.hostname !== "127.0.0.1"');
    expect(harness).toContain("previewUrl.port.length === 0");
    expect(harness).toContain(
      "`ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`",
    );
    expect(harness).toContain(
      '"Connection closed before receiving a handshake response"',
    );
    expect(harness).toContain("message === expectedMessage");
    expect(harness).toContain("sourceUrl.origin === previewUrl.origin");
    expect(harness).toContain(
      "/^\\/assets\\/[A-Za-z0-9._-]+\\.js$/u.test(sourceUrl.pathname)",
    );
    expect(harness).not.toContain(
      `message.includes("WebSocket connection to 'ws://127.0.0.1:")`,
    );
    expect(harness).not.toContain("/api/v1/apps/toonspectrum/visits/ping");
  });
});
