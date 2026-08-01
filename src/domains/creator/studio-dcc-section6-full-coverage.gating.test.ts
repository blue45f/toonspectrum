/**
 * Architecture doc §6 full-catalog gating.
 * Every table ID must be in SSOT with apis; every ID must be exerciseable;
 * DRW/PUB/MAT P0–P1 drive real lite kernel APIs (not dispatch-only stubs).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  exerciseAllStudioDccCatalogFeatures,
  exerciseStudioDccCatalogFeature,
} from "./studio-dcc-catalog-feature-dispatch";
import {
  applyStudioToneFilterAdjustment,
  bindStudioReferenceLayer,
  buildStudioAssetLicenseReport,
  buildStudioPublishPackageLite,
  buildStudioPublishVersionManifest,
  createStudioPanelBalloonTextLayout,
  createStudioPerspectiveRuler,
  createStudioPbrMaterialLite,
  createStudioRasterVectorLayerStack,
  createStudioToonHatchToneMaterial,
  fillStudioCloseGapRegion,
  measureStudioBrushLatencyBudget,
  planStudioPressureBrushStroke,
  reportStudioPsdPsbCompatibility,
  resolveStudioColorManagementProfile,
  snapStudioRulerGuide,
  transformStudioLayer,
} from "./studio-dcc-material-publish-draw-lite";
import {
  assertStudioSection6FullCoverage,
  STUDIO_DCC_SECTION6_CATALOG,
  STUDIO_DCC_SECTION6_IDS,
  studioSection6ById,
  studioSection6CoverageStats,
} from "./studio-dcc-section6-full-catalog";
import { getStudioPublishPlatformPreset } from "./studio-publish-package";

const ARCH_DOC = resolve(
  "/Users/hjunkim/Downloads/ToonSpectrum_하이브리드_3D_DCC_엔진_라이브러리_포맷_아키텍처_2026-08-01.md",
);

function extractDocSection6Ids(markdown: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const line of markdown.split(/\r?\n/u)) {
    const m = /^\|\s*([A-Z]{2,5}-\d{3})\s*\|/.exec(line);
    if (!m) continue;
    const id = m[1]!;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

describe("§6 full catalog SSOT", () => {
  it("covers every architecture-doc table ID with apis and valid status", () => {
    const docIds = extractDocSection6Ids(readFileSync(ARCH_DOC, "utf8"));
    expect(docIds.length).toBeGreaterThan(150);
    const set = new Set(STUDIO_DCC_SECTION6_IDS);
    const missingFromSsot = docIds.filter((id) => !set.has(id));
    expect(missingFromSsot).toEqual([]);
    const coverage = assertStudioSection6FullCoverage();
    expect(coverage.missing).toEqual([]);
    expect(coverage.withoutApis).toEqual([]);
    expect(coverage.ok).toBe(true);
    const stats = studioSection6CoverageStats();
    expect(stats.total).toBeGreaterThanOrEqual(docIds.length);
    expect(stats.shipped + stats.partial + stats.bridgeOnly).toBe(stats.total);
    // partials must declare ceilings
    for (const e of STUDIO_DCC_SECTION6_CATALOG) {
      if (e.status === "partial") {
        expect(e.ceilingNote && e.ceilingNote.length > 0).toBe(true);
      }
      expect(e.apis.length).toBeGreaterThan(0);
    }
  });

  it("exercises every catalog ID through real domain/core kernels", async () => {
    const all = await exerciseAllStudioDccCatalogFeatures();
    expect(all.failures).toEqual([]);
    expect(all.ok).toBe(true);
    expect(all.exercised).toBe(STUDIO_DCC_SECTION6_IDS.length);
    const drw = await exerciseStudioDccCatalogFeature("DRW-001");
    expect(drw.evidence.sampleCount).toBeGreaterThan(0);
    expect(drw.evidence.pathLength).toBeGreaterThan(0);
    const pub = await exerciseStudioDccCatalogFeature("PUB-001");
    expect(pub.evidence.fileCount).toBeGreaterThan(0);
    const mod = await exerciseStudioDccCatalogFeature("MOD-018");
    expect(mod.evidence.facesAfter).toBeDefined();
    const cad = await exerciseStudioDccCatalogFeature("CAD-005");
    expect(Number(cad.evidence.extrudeTris)).toBeGreaterThan(0);
  });

  it("rejects unknown IDs instead of inventing hash evidence", async () => {
    await expect(exerciseStudioDccCatalogFeature("ZZZ-999")).rejects.toThrow(/unknown catalog id/);
  });

  it("honesty: no typeof-only stubs; every shipped apis[0] is called; evidence has numbers", async () => {
    const coreSrc = readFileSync(
      resolve(__dirname, "studio-dcc-section6-core-runners.ts"),
      "utf8",
    );
    const domainSrc = readFileSync(
      resolve(__dirname, "studio-dcc-section6-domain-kernels.ts"),
      "utf8",
    );
    const liteSrc = readFileSync(
      resolve(__dirname, "studio-dcc-section6-lite-ops.ts"),
      "utf8",
    );
    const dispatchSrc = readFileSync(
      resolve(__dirname, "studio-dcc-catalog-feature-dispatch.ts"),
      "utf8",
    );
    const combined = `${coreSrc}\n${domainSrc}\n${liteSrc}\n${dispatchSrc}`;
    // Structural ban on presence-only theater
    expect(combined).not.toMatch(/typeof\s+\w+\s*===\s*["']function["']/u);
    const typeofOnlyHits = [...combined.matchAll(/api:\s*typeof\s+/gu)];
    expect(typeofOnlyHits).toEqual([]);

    const missingExportCall: string[] = [];
    const missingNumeric: string[] = [];
    for (const entry of STUDIO_DCC_SECTION6_CATALOG) {
      const primary = entry.apis[0]!;
      // Primary export must appear as a call site in sealed runner sources
      const callRe = new RegExp(`\\b${primary}\\s*\\(`, "u");
      if (!callRe.test(combined) && !liteSrc.includes(`function ${primary}`)) {
        missingExportCall.push(`${entry.id}:${primary}`);
      }
      // Lite-ops definitions count as sealed real APIs when SSOT points at them
      if (entry.module.includes("lite-ops") && !liteSrc.includes(`function ${primary}`)) {
        missingExportCall.push(`${entry.id}:missing-lite-def:${primary}`);
      }
      // Runtime evidence must include a non-constant-looking numeric domain metric
      const r = await exerciseStudioDccCatalogFeature(entry.id);
      const numericKeys = Object.entries(r.evidence).filter(
        ([, v]) => typeof v === "number" && Number.isFinite(v),
      );
      if (numericKeys.length === 0) {
        missingNumeric.push(entry.id);
      }
    }
    expect(missingExportCall).toEqual([]);
    expect(missingNumeric).toEqual([]);
  });
});

describe("§6 P0/P1 DRW/MAT/PUB real lite kernels", () => {
  it("DRW-001 pressure brush latency budget", () => {
    const plan = planStudioPressureBrushStroke(
      [
        { x: 0, y: 0, pressure: 0.2, tMs: 0 },
        { x: 2, y: 1, pressure: 0.8, tMs: 4 },
        { x: 4, y: 2, pressure: 0.5, tMs: 8 },
      ],
      16,
    );
    expect(plan.sampleCount).toBe(3);
    expect(plan.pathLength).toBeGreaterThan(0);
    expect(plan.withinBudget).toBe(true);
    const lat = measureStudioBrushLatencyBudget(1000, 1012, 16);
    expect(lat.latencyMs).toBe(12);
    expect(lat.withinBudget).toBe(true);
    expect(studioSection6ById("DRW-001")?.priority).toBe("P0");
    expect(studioSection6ById("DRW-002")?.priority).toBe("P0");
  });

  it("DRW-002..006 layer/fill/ruler/panel/tone", () => {
    let stack = createStudioRasterVectorLayerStack([
      {
        id: "raster-1",
        kind: "raster",
        name: "Ink",
        visible: true,
        opacity: 1,
        blend: "normal",
        clipToBelow: false,
        maskId: null,
      },
      {
        id: "vec-1",
        kind: "vector",
        name: "Line",
        visible: true,
        opacity: 1,
        blend: "multiply",
        clipToBelow: true,
        maskId: null,
      },
    ]);
    stack = transformStudioLayer(stack, "raster-1", { x: 10, y: 20, scale: 1.5 });
    expect(stack.layers.find((l) => l.id === "raster-1")?.transform.x).toBe(10);

    const fill = fillStudioCloseGapRegion({
      width: 32,
      height: 32,
      seedX: 16,
      seedY: 16,
      gapPx: 3,
    });
    expect(fill.gapClosed).toBe(true);
    expect(fill.filledPixels).toBeGreaterThan(0);
    expect(bindStudioReferenceLayer(stack, "raster-1", "vec-1").ok).toBe(true);

    const ruler = createStudioPerspectiveRuler([{ x: 0, y: 0 }, { x: 100, y: 0 }], 15);
    const snapped = snapStudioRulerGuide(ruler, { x: 0, y: 0 }, { x: 10, y: 3 });
    expect(Number.isFinite(snapped.angleDeg)).toBe(true);

    const layout = createStudioPanelBalloonTextLayout({
      panels: [{ id: "p1", x: 0, y: 0, w: 100, h: 200 }],
      balloons: [{ id: "b1", panelId: "p1", text: "안녕" }],
    });
    expect(layout.panelCount).toBe(1);
    expect(layout.textChars).toBe(2);

    const tone = applyStudioToneFilterAdjustment({
      pixels: new Float32Array([0.1, 0.5, 0.9]),
      toneSteps: 3,
      contrast: 1.2,
    });
    expect(tone.toneSteps).toBe(3);
    expect(tone.pixels.length).toBe(3);

    const psd = reportStudioPsdPsbCompatibility({
      kind: "psd",
      layerCount: 12,
      hasSmartObjects: true,
    });
    expect(psd.grade).toBe("B");
    expect(psd.losses.length).toBeGreaterThan(0);
  });

  it("MAT-010/012 color management and hatch tone", () => {
    const cm = resolveStudioColorManagementProfile({ linear: true, icc: true, exr: true });
    expect(cm.workingSpace).toBe("linear-sRGB");
    expect(cm.exrPass).toBe(true);
    const hatch = createStudioToonHatchToneMaterial("hatch-1", {
      toneBands: 4,
      cameraScaleInvariant: true,
    });
    expect(hatch.model).toBe("toon-hatch-tone");
    expect(hatch.toneBands).toBe(4);
    const pbr = createStudioPbrMaterialLite("mat-1", { metallic: 0.2, roughness: 0.4 });
    expect(pbr.model).toBe("pbr-metallic-roughness");
  });

  it("PUB-001..003 publish package / platform / license report", () => {
    const pkg = buildStudioPublishPackageLite({
      images: ["page-1.png"],
      metadata: { title: "ep1" },
      fonts: ["NotoSans"],
      rights: ["CC-BY"],
      version: "1.2.0",
    });
    expect(pkg.format).toBe("toonspectrum.publish-package-lite");
    expect(pkg.fileCount).toBeGreaterThan(0);
    const preset = getStudioPublishPlatformPreset("webtoon");
    expect(preset).toBeTruthy();
    const report = buildStudioAssetLicenseReport([
      { id: "a1", license: "CC0-1.0", source: "studio" },
      { id: "a2", license: "unknown", source: "import" },
    ]);
    expect(report.assetCount).toBe(2);
    expect(report.unknownLicenseCount).toBe(1);
    const man = buildStudioPublishVersionManifest({
      documentId: "doc-1",
      version: "1.2.0",
      packageHash: "sha256:abc",
    });
    expect(man.kind).toBe("publish-version-manifest");
  });
});

describe("§6 gating catalog P0 includes DRW", () => {
  it("P0 required IDs from doc include DOC + NPR + SHT + DRW", () => {
    const p0 = STUDIO_DCC_SECTION6_CATALOG.filter((e) => e.priority === "P0").map((e) => e.id);
    for (const id of [
      "DOC-001",
      "DOC-002",
      "DOC-003",
      "DOC-004",
      "DOC-005",
      "DOC-006",
      "NPR-001",
      "SHT-001",
      "DRW-001",
      "DRW-002",
    ]) {
      expect(p0).toContain(id);
    }
    const p1 = STUDIO_DCC_SECTION6_CATALOG.filter((e) => e.priority === "P1").map((e) => e.id);
    for (const id of ["DRW-003", "DRW-004", "DRW-005", "DRW-006", "PUB-001", "PUB-002", "PUB-003", "MAT-010", "MAT-012"]) {
      expect(p1).toContain(id);
    }
  });
});
