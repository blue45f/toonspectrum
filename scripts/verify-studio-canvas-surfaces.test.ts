import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  collectStudioCanvasSurfaceContractFailures,
  resolveStudioCanvasSurfaceBudget,
  STUDIO_CANVAS_RECLAIMED_SURFACES,
  STUDIO_CANVAS_SURFACE_DPR_CASES,
  STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO,
} from "./verify-studio-canvas-surfaces.mts";

const verifierSource = readFileSync(
  new URL("./verify-studio-canvas-surfaces.mts", import.meta.url),
  "utf8",
);
const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { scripts?: Record<string, string> };

function reclaimed(width = 1, height = 1) {
  return STUDIO_CANVAS_RECLAIMED_SURFACES.map(({ id }) => ({
    id,
    matches: [{ primaryDataKey: id, width, height, effectivelyHidden: true }],
  }));
}

const BASELINE_NOMINAL_BYTES = 122 * 1_048_576;
const CURSOR_NOMINAL_BYTES = 15 * 1_048_576;
const BASELINE_SIGNATURES = Array.from({ length: 19 }, (_, index) => `surface-${index}`);

function snapshot(input: {
  canvasCount?: number;
  totalNominalRgba8Bytes?: number;
  nonCursorSignatures?: readonly string[];
  cursorCount?: number;
  cursorWidth?: number;
  cursorHeight?: number;
} = {}) {
  const cursorCount = input.cursorCount ?? 0;
  return {
    canvasCount: input.canvasCount ?? 19 + cursorCount,
    totalNominalRgba8Bytes:
      input.totalNominalRgba8Bytes ?? BASELINE_NOMINAL_BYTES + cursorCount * CURSOR_NOMINAL_BYTES,
    nonCursorSignatures: input.nonCursorSignatures ?? BASELINE_SIGNATURES,
    brushCursorCanvases: Array.from({ length: cursorCount }, () => ({
      primaryDataKey: "data-studio-brush-cursor-canvas=true",
      backingWidth: input.cursorWidth ?? 1_632,
      backingHeight: input.cursorHeight ?? 2_448,
      nominalRgba8Bytes: CURSOR_NOMINAL_BYTES,
      insideKonvaContent: true,
    })),
    canonicalDocumentBackingSizes: ["1632x2448"],
  } as const;
}

function transition(label: string, toolId: "pen" | "select") {
  return {
    label,
    toolId,
    selected: true,
    snapshot: snapshot({ cursorCount: toolId === "pen" ? 1 : 0 }),
  } as const;
}

function passingContract() {
  const budget = resolveStudioCanvasSurfaceBudget({
    deviceScaleFactor: 1.5,
    viewportCssWidth: 1_088,
    viewportCssHeight: 723,
    nominalRgba8Bytes: BASELINE_NOMINAL_BYTES,
    maxNominalRgba8MiB: 137,
  });
  const activeBudget = resolveStudioCanvasSurfaceBudget({
    deviceScaleFactor: 1.5,
    viewportCssWidth: 1_088,
    viewportCssHeight: 723,
    nominalRgba8Bytes: BASELINE_NOMINAL_BYTES + CURSOR_NOMINAL_BYTES,
    maxNominalRgba8MiB: 140,
  });
  return {
    label: "dpr-1.5",
    expectedDeviceScaleFactor: 1.5,
    actualDevicePixelRatio: 1.5,
    budget,
    finalBudget: budget,
    transitionBudgets: [activeBudget, budget, activeBudget, budget, activeBudget, budget],
    initialSnapshot: snapshot(),
    finalSnapshot: snapshot(),
    transitions: [
      transition("1:pen", "pen"),
      transition("1:select", "select"),
      transition("2:pen", "pen"),
      transition("2:select", "select"),
      transition("3:pen", "pen"),
      transition("3:select", "select"),
    ],
    mutationAdded: 9,
    mutationRemoved: 9,
    mutationPeakCount: 20,
    initialReclaimed: reclaimed(),
    finalReclaimed: reclaimed(),
    pageCrashCount: 0,
    cdpCrashCount: 0,
    pageErrorCount: 0,
    webglContextLossCount: 0,
    unexpectedGpuDeviceLossCount: 0,
    unhandledLossRejectionCount: 0,
  } as const;
}

describe("Studio canvas surface production-preview gate", () => {
  it("keeps explicit sequential DPR and normalized allocation-pressure thresholds", () => {
    expect(STUDIO_CANVAS_SURFACE_DPR_CASES).toEqual([
      {
        label: "dpr-1",
        deviceScaleFactor: 1,
        maxNominalRgba8MiB: 62,
        maxActiveNominalRgba8MiB: 62,
      },
      {
        label: "dpr-1.5",
        deviceScaleFactor: 1.5,
        maxNominalRgba8MiB: 137,
        maxActiveNominalRgba8MiB: 140,
      },
      {
        label: "dpr-2",
        deviceScaleFactor: 2,
        maxNominalRgba8MiB: 240,
        maxActiveNominalRgba8MiB: 240,
      },
    ]);
    expect(STUDIO_CANVAS_SURFACE_MAX_BACKING_PIXEL_RATIO).toBe(20.5);
    expect(resolveStudioCanvasSurfaceBudget({
      deviceScaleFactor: 1.5,
      viewportCssWidth: 1_088,
      viewportCssHeight: 723,
      nominalRgba8Bytes: 137.337 * 1_048_576,
      maxNominalRgba8MiB: 140,
    })).toMatchObject({
      withinAbsoluteLimit: true,
      withinNormalizedLimit: true,
    });
  });

  it("fails independently for count growth, unparked surfaces, pressure, and loss evidence", () => {
    expect(collectStudioCanvasSurfaceContractFailures(passingContract())).toEqual([]);

    const failures = collectStudioCanvasSurfaceContractFailures({
      ...passingContract(),
      budget: resolveStudioCanvasSurfaceBudget({
        deviceScaleFactor: 1.5,
        viewportCssWidth: 1_088,
        viewportCssHeight: 723,
        nominalRgba8Bytes: 160 * 1_048_576,
        maxNominalRgba8MiB: 137,
      }),
      finalBudget: resolveStudioCanvasSurfaceBudget({
        deviceScaleFactor: 1.5,
        viewportCssWidth: 1_088,
        viewportCssHeight: 723,
        nominalRgba8Bytes: 170 * 1_048_576,
        maxNominalRgba8MiB: 137,
      }),
      transitionBudgets: [resolveStudioCanvasSurfaceBudget({
        deviceScaleFactor: 1.5,
        viewportCssWidth: 1_088,
        viewportCssHeight: 723,
        nominalRgba8Bytes: 150 * 1_048_576,
        maxNominalRgba8MiB: 140,
      })],
      finalSnapshot: snapshot({
        canvasCount: 20,
        totalNominalRgba8Bytes: 170 * 1_048_576,
        nonCursorSignatures: [...BASELINE_SIGNATURES, "retained-surface"],
      }),
      transitions: [{
        label: "1:pen",
        toolId: "pen",
        selected: false,
        snapshot: snapshot({
          canvasCount: 22,
          totalNominalRgba8Bytes: 150 * 1_048_576,
          nonCursorSignatures: [...BASELINE_SIGNATURES, "unexpected-surface"],
          cursorCount: 2,
          cursorWidth: 999,
          cursorHeight: 999,
        }),
      }],
      mutationAdded: 2,
      mutationRemoved: 1,
      mutationPeakCount: 22,
      initialReclaimed: reclaimed(1_632, 1_085),
      pageCrashCount: 1,
      cdpCrashCount: 1,
      pageErrorCount: 1,
      webglContextLossCount: 1,
      unexpectedGpuDeviceLossCount: 1,
      unhandledLossRejectionCount: 1,
    });

    expect(failures.some((failure) => failure.includes("nominal RGBA8"))).toBe(true);
    expect(failures.some((failure) => failure.includes("tool transition 1 nominal RGBA8"))).toBe(true);
    expect(failures.some((failure) => failure.includes("final nominal RGBA8"))).toBe(true);
    expect(failures.some((failure) => failure.includes("did not return to initial"))).toBe(true);
    expect(failures.some((failure) => failure.includes("expected bounded"))).toBe(true);
    expect(failures.some((failure) => failure.includes("tagged brush cursor"))).toBe(true);
    expect(failures.some((failure) => failure.includes("changed the non-cursor"))).toBe(true);
    expect(failures.some((failure) => failure.includes("did not return"))).toBe(true);
    expect(failures.some((failure) => failure.includes("one-cursor allowance"))).toBe(true);
    expect(failures.some((failure) => failure.includes("mutations were unbalanced"))).toBe(true);
    expect(failures.filter((failure) => failure.includes("expected 1x1"))).toHaveLength(3);
    expect(failures.some((failure) => failure.includes("page crash"))).toBe(true);
    expect(failures.some((failure) => failure.includes("CDP target crash"))).toBe(true);
    expect(failures.some((failure) => failure.includes("uncaught page errors"))).toBe(true);
    expect(failures.some((failure) => failure.includes("WebGL context-loss"))).toBe(true);
    expect(failures.some((failure) => failure.includes("GPU device-loss"))).toBe(true);
    expect(failures.some((failure) => failure.includes("unhandled device/context-loss"))).toBe(true);
  });

  it("keeps crash/loss instrumentation and every reclaimed selector in the real browser path", () => {
    expect(packageJson.scripts?.["verify:studio-canvas-surfaces"]).toBe(
      "tsx scripts/verify-studio-canvas-surfaces.mts",
    );
    expect(verifierSource).toContain('page.on("crash"');
    expect(verifierSource).toContain('cdp.on("Inspector.targetCrashed"');
    expect(verifierSource).toContain('globalThis.addEventListener("webglcontextlost"');
    expect(verifierSource).toContain("void device.lost.then");
    expect(verifierSource).toContain("globalThis.__name = globalThis.__name");
    expect(verifierSource).toContain("not actual GPU or browser resident memory");
    expect(verifierSource).toContain("totalNominalRgba8Bytes: inventory.totalNominalRgba8Bytes");
    expect(verifierSource).toContain('data-studio-brush-cursor-canvas=true');
    expect(verifierSource).toContain("transitionBudgets");
    expect(verifierSource).toContain("finalBudget");
    for (const target of STUDIO_CANVAS_RECLAIMED_SURFACES) {
      expect(verifierSource).toContain(target.attribute);
      expect(verifierSource).toContain(target.value);
    }
  });
});
