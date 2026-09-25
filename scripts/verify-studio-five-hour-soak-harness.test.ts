import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createStudioSoakCheckpoint } from "./lib/studio-five-hour-soak-checkpoint.mjs";
import { isExpectedLocalPreviewRuntimeNoise } from "./lib/studio-five-hour-soak-runtime-noise.mjs";

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
    expect(close).toContain('data-studio-brush-workbench-dock="true"');
    expect(close).toContain('if (docked) continue');
    expect(close).toContain('state: "hidden"');
    expect(close).toContain(".catch(() => false)");
  });

  it("opens the mobile catalogue through the real draw-settings sheet", () => {
    const open = sliceFunction("openMobileBrushLibrary", "selectBrush");
    expect(open).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(open).toContain('name: "브러시 설정 (굵기·색·프리셋)"');
    expect(open).toContain('[data-studio-mobile-workspace-toggle="true"]');
    expect(open).toContain('await workspace.click()');
    expect(open).toContain('page.locator("#studio-mobile-draw-settings")');
    expect(open).toContain(`sheet.locator('[data-studio-open-brush-library="true"]')`);
    expect(open).toContain('[data-studio-brush-library="true"]');
    expect(open).not.toContain(`dock.locator('[data-studio-open-brush-library="true"]')`);
  });

  it("keeps mobile and desktop brush selection on their actual surfaces", () => {
    const select = sliceFunction("selectBrush", "ensurePenReady");
    expect(select).toContain("await openMobileBrushLibrary(page)");
    expect(select).toContain('library.getByRole("searchbox")');
    expect(select).toContain('[data-studio-brush-workbench-dock="true"] [data-studio-brush-library="true"]');
    expect(select).toContain('dockedLibrary.getByRole("searchbox")');
    expect(select).toContain('data-studio-brush-selection-pending');
    expect(select).toContain('if (active && !pending) return true');
    expect(select).toContain('page.keyboard.press("b")');
    expect(select).toContain('[data-studio-brush-active-pill="true"]');
    expect(select).toContain("return closeBrushSurfaces(page)");
  });

  it("uses direct pen controls before the desktop shortcut fallback", () => {
    const pen = sliceFunction("ensurePenReady", "drawEvidenceStroke");
    expect(pen).toContain('[data-studio-mobile-editing-dock="true"]');
    expect(pen).toContain('getByRole("button", { name: /^(?:펜|Pen)$/u })');
    expect(pen).toContain('[data-studio-rail-tool-id="pen"]');
    expect(pen).toContain('[data-studio-current-tool-id="pen"]');
    expect(pen).toContain('getAttribute("aria-pressed")');
    expect(pen).toContain("active.blur()");
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

  it("routes every raster probe through the shared pressure-aware input driver", () => {
    const draw = sliceFunction("drawEvidenceStroke", "spawnPreview");
    expect(draw).toContain("createStudioPointerStrokePoints(box, cycle");
    expect(draw).toContain("[data-studio-canvas-viewport]");
    expect(draw).toContain("Math.max(stageBox.x, viewportBox.x)");
    expect(draw).toContain("Math.min(stageBox.y + stageBox.height, viewportBox.y + viewportBox.height) - y");
    expect(draw).toContain("dispatchStudioPointerStroke({");
    expect(draw).toContain("mode: inputMode");
    expect(draw).toContain("cdp");
    expect(draw).not.toContain("page.mouse.down()");
  });

  it("uses layer commits to distinguish a covered stroke from missing ink", () => {
    expect(source).toContain('[data-studio-layer-available-count]');
    expect(source).toContain("layerCountBefore: evidence.layerCountBefore");
    expect(source).toContain("layerCountAfter: evidence.layerCountAfter");
    expect(source).toContain("const acceptedByLayer = evidence.layerCountBefore !== null");
    expect(source).toContain("evidence.layerCountAfter > evidence.layerCountBefore");
    expect(source).toContain("report.visuallyCoveredStrokes += 1");
    expect(source).toContain("else if (!visuallyChanged)");
  });

  it("keeps document size bounded while repeatedly exercising real undo and redo controls", () => {
    expect(source).toContain("HISTORY_CHURN_INTERVAL = 10");
    expect(source).toContain("clickStudioHistoryAction(");
    expect(source).toContain('[data-studio-primary-action="');
    expect(source).toContain('[data-studio-command-bar-command="');
    expect(source).toContain("N strokes == N layer rows");
    expect(source).toContain('clickStudioHistoryAction(page, "undo")');
    expect(source).toContain('clickStudioHistoryAction(page, "redo")');
    expect(source).toContain("Bounded undo ended at");
    expect(source).toContain("Bounded history churn ended at");
    expect(source).toContain("strokesSinceHistoryChurn = 0");
    expect(source).toContain('kind: "final-history-churn"');
  });

  it("enters the current drawing canvas route before waiting for the editor", () => {
    expect(source).toContain('page.goto(`${preview.origin}/studio/canvas`');
    expect(source).toContain('page.locator(\'[data-studio-editor="true"]\').waitFor');
  });

  it("refuses to downgrade pen or touch soak evidence when CDP is unavailable", () => {
    expect(source).toContain('if (inputMode !== "mouse" && !cdp)');
    expect(source).toContain("refusing a mouse downgrade");
    expect(source).toContain("pointerInputResolved: inputMode");
    expect(source).toContain("physicalDeviceCertified: false");
  });
});

describe("Studio five-hour soak checkpoint telemetry", () => {
  const MiB = 1024 * 1024;
  type HeapPoint = { atMs: number; usedBytes: number };
  const sample = (atHours: number, usedMiB: number): HeapPoint => ({
    atMs: atHours * 3_600_000,
    usedBytes: usedMiB * MiB,
  });
  const checkpoint = (heapSamples: HeapPoint[]) => createStudioSoakCheckpoint({
    atMs: 7_200_000,
    cycle: 21,
    heap: heapSamples.at(-1) ?? null,
    heapSamples,
    failures: 2,
  });

  it.each<{ name: string; samples: HeapPoint[] }>([
    { name: "empty", samples: [] },
    { name: "one sample", samples: [sample(0, 100)] },
    { name: "non-finite timestamp", samples: [sample(0, 100), { atMs: Number.NaN, usedBytes: 110 * MiB }] },
    { name: "non-finite heap", samples: [sample(0, 100), { atMs: 3_600_000, usedBytes: Number.POSITIVE_INFINITY }] },
    { name: "zero time window", samples: [sample(0, 100), sample(0, 110)] },
  ])("serializes an explicit null until a usable finite sample window exists: $name", ({ samples }) => {
    const report = { checkpoints: [checkpoint(samples)] };
    expect(report.checkpoints[0]?.heapSlopeBytesPerHour).toBeNull();
    expect(JSON.parse(JSON.stringify(report)).checkpoints[0].heapSlopeBytesPerHour).toBeNull();
  });

  it("serializes the shared regression result after enough samples and preserves checkpoint fields", () => {
    const row = checkpoint([sample(0, 100), sample(1, 108), sample(2, 116)]);
    expect(row).toEqual({
      atMs: 7_200_000,
      cycle: 21,
      heapBytes: 116 * MiB,
      heapSlopeBytesPerHour: 8 * MiB,
      domNodes: null,
      eventListeners: null,
      failures: 2,
    });
    const serialized = JSON.parse(JSON.stringify({ checkpoints: [row] }));
    expect(Number.isFinite(serialized.checkpoints[0].heapSlopeBytesPerHour)).toBe(true);
    expect(serialized.checkpoints[0].heapSlopeBytesPerHour).toBe(8 * MiB);
  });

  it("filters invalid telemetry without mutating samples used for policy evaluation", () => {
    const samples = [
      sample(0, 100),
      { atMs: Number.NaN, usedBytes: 0 },
      sample(1, 108),
      { atMs: 3_600_001, usedBytes: Number.NEGATIVE_INFINITY },
    ];
    const original = structuredClone(samples);
    expect(checkpoint(samples).heapSlopeBytesPerHour).toBe(8 * MiB);
    expect(samples).toEqual(original);
  });

  it.each([
    [100, 100, 0],
    [108, 100, -8 * MiB],
  ])("reports finite flat and decreasing slopes (%s to %s MiB)", (first, last, slope) => {
    expect(checkpoint([sample(0, first), sample(1, last)]).heapSlopeBytesPerHour).toBe(slope);
  });

  it("does not expose a non-finite regression result even with finite extreme inputs", () => {
    expect(checkpoint([
      { atMs: 0, usedBytes: Number.MAX_VALUE },
      { atMs: 3_600_000, usedBytes: -Number.MAX_VALUE },
    ]).heapSlopeBytesPerHour).toBeNull();
  });

  it("wires the tested checkpoint builder into the browser harness", () => {
    expect(source).toContain("report.checkpoints.push(createStudioSoakCheckpoint({");
    expect(source).toContain("heapSamples: report.heapSamples");
  });
});


describe("Studio five-hour soak local-preview runtime noise", () => {
  const ticket502 = {
    channel: "console",
    text: "Failed to load resource: the server responded with a status of 502 (Bad Gateway) @ http://127.0.0.1:4173/api/studio-realtime/tickets:0",
  };

  it("classifies only the absent local-preview ticket proxy as environment noise", () => {
    expect(isExpectedLocalPreviewRuntimeNoise(ticket502, {
      origin: "http://127.0.0.1:4173",
      spawnedPreview: true,
    })).toBe(true);
  });

  it.each(["401 (Unauthorized)", "403 (Forbidden)"])(
    "classifies local-preview ticket auth rejection %s as environment noise",
    (status) => {
      expect(isExpectedLocalPreviewRuntimeNoise({
        ...ticket502,
        text: ticket502.text.replace("502 (Bad Gateway)", status),
      }, {
        origin: "http://127.0.0.1:4173",
        spawnedPreview: true,
      })).toBe(true);
    },
  );

  it.each([
    ["external origin", ticket502, { origin: "https://studio.example.com", spawnedPreview: true }],
    ["existing preview", ticket502, { origin: "http://127.0.0.1:4173", spawnedPreview: false }],
    ["page exception", { ...ticket502, channel: "pageerror" }, { origin: "http://127.0.0.1:4173", spawnedPreview: true }],
    ["different status", {
      ...ticket502,
      text: ticket502.text.replace("502 (Bad Gateway)", "500 (Internal Server Error)"),
    }, { origin: "http://127.0.0.1:4173", spawnedPreview: true }],
    ["different endpoint", {
      ...ticket502,
      text: ticket502.text.replace("studio-realtime/tickets", "projects"),
    }, { origin: "http://127.0.0.1:4173", spawnedPreview: true }],
  ])("never suppresses %s", (_name, error, options) => {
    expect(isExpectedLocalPreviewRuntimeNoise(error, options)).toBe(false);
  });

  it("wires the classification before runtime failures are recorded", () => {
    const classification = source.indexOf("isExpectedLocalPreviewRuntimeNoise(error");
    const failure = source.indexOf("kind: `runtime-${error.channel}`");
    expect(classification).toBeGreaterThanOrEqual(0);
    expect(classification).toBeLessThan(failure);
    expect(source).toContain("report.environmentNoise.push(error)");
  });
});

describe("Studio five-hour soak beta notice admission", () => {
  it("acknowledges the visible product notice through its action before drawing", () => {
    expect(source).toContain("acknowledgeStudioBetaNoticeIfPresent(page)");
    expect(source).toContain("data-studio-beta-notice");
    expect(source).toContain('[data-studio-beta-notice-acknowledge="true"]');
    expect(source).toContain('notice.waitFor({ state: "hidden"');

    const navigation = source.indexOf("page.goto(`${preview.origin}/studio/canvas`");
    const acknowledgement = source.lastIndexOf("await acknowledgeStudioBetaNoticeIfPresent(page)");
    const editorWait = source.indexOf('page.locator(\'[data-studio-editor="true"]\')');
    expect(navigation).toBeGreaterThanOrEqual(0);
    expect(acknowledgement).toBeGreaterThan(navigation);
    expect(editorWait).toBeGreaterThan(acknowledgement);
  });
});
