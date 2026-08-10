import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createServer } from "vite";

import type { TextVerticalProductProbe } from "./text-vertical-quality-browser";
import type { SceneIR } from "@toonspectrum/studio-project-model";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const RESULT_PATH = join(ROOT, "tests/benchmarks/results/text-vertical-quality.json");
const GOLDEN_DIR = join(ROOT, "tests/corpus/text/golden");
const PRODUCT_GOLDEN = join(GOLDEN_DIR, "vertical-quality-product.png");
const VELLO_GOLDEN = join(GOLDEN_DIR, "vertical-quality-engine-vello.png");
const SKIA_GOLDEN = join(GOLDEN_DIR, "vertical-quality-engine-skia.png");
const FONT_PATH = process.env.TOON_CJK_FONT ?? "/System/Library/Fonts/Supplemental/AppleGothic.ttf";
const BROWSER_FONT_PATH =
  process.env.TOON_BROWSER_CJK_FONT
  ?? "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";
const ROBOTO_PATH = join(ROOT, "tests/corpus/text/fonts/Roboto-Regular.ttf");
const HB_SHAPE_PATH = process.env.TOON_HB_SHAPE ?? "/opt/homebrew/bin/hb-shape";
const WASM_WARMUP = 30;
const WASM_SAMPLE_COUNT = 160;
const FUZZY_DELTA = 48;
const FUZZY_GATE_PCT = 0.6;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function round(value: number, places = 6): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function latencyStats(values: readonly number[]) {
  return {
    p50: round(percentile(values, 0.5)),
    p95: round(percentile(values, 0.95)),
    p99: round(percentile(values, 0.99)),
    max: round(Math.max(...values)),
  };
}

async function verifyIntegrity(directory: string): Promise<{ files: number; manifestSha256: string }> {
  const manifestPath = join(directory, "INTEGRITY.sha256");
  const manifest = await readFile(manifestPath, "utf8");
  const lines = manifest.trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const match = /^([0-9a-f]{64})\s+\*?(.+)$/u.exec(line);
    if (!match) throw new Error(`invalid integrity line in ${manifestPath}: ${line}`);
    const [, expected, relative] = match;
    const actual = sha256(new Uint8Array(await readFile(join(directory, relative!))));
    if (actual !== expected) {
      throw new Error(`integrity mismatch before generated artifact import: ${directory}/${relative}`);
    }
  }
  return { files: lines.length, manifestSha256: sha256(manifest) };
}

async function assertGeneratedArtifactsStable() {
  const processes = execFileSync("ps", ["aux"], { encoding: "utf8" });
  if (processes.split("\n").some((line) => /[w]asm-pack/u.test(line))) {
    throw new Error("wasm-pack is still running; refusing to import generated artifacts");
  }
  const [cpu, gpu] = await Promise.all([
    verifyIntegrity(join(ROOT, "crates/studio-engine-vello/pkg")),
    verifyIntegrity(join(ROOT, "crates/studio-engine-vello/pkg-gpu")),
  ]);
  return { cpu, gpu };
}

async function runBrowserProductProbe(fontBytes: Uint8Array): Promise<TextVerticalProductProbe> {
  const server = await createServer({
    root: ROOT,
    logLevel: "error",
    plugins: [
      {
        name: "toon-text-vertical-quality-system-font",
        configureServer(viteServer) {
          viteServer.middlewares.use(
            "/__toon_text_vertical_quality_cjk.ttf",
            (_request, response) => {
              response.statusCode = 200;
              response.setHeader("Content-Type", "font/ttf");
              response.setHeader("Cache-Control", "no-store");
              response.end(Buffer.from(fontBytes));
            },
          );
        },
      },
    ],
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await server.listen();
  const origin = server.resolvedUrls?.local[0];
  if (!origin) throw new Error("Vite did not expose a local URL for the browser probe");
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    const context = await browser.newContext({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (entry) => {
      if (entry.type() === "error") errors.push(entry.text());
    });
    await page.goto(`${origin}tests/benchmarks/harness/text-vertical-quality.html`, {
      waitUntil: "networkidle",
    });
    const fontResponse = await page.request.get(
      `${origin}__toon_text_vertical_quality_cjk.ttf`,
    );
    if (!fontResponse.ok()) {
      throw new Error(
        `system font route failed: ${fontResponse.status()} ${fontResponse.statusText()}`,
      );
    }
    const servedFont = await fontResponse.body();
    if (sha256(servedFont) !== sha256(fontBytes)) {
      throw new Error("system font route changed the CJK visual font bytes");
    }
    await page.waitForFunction(() => document.documentElement.dataset.textVerticalQualityReady === "true");
    const result = await page.evaluate(async () => {
      const probe = window.__TOON_TEXT_VERTICAL_QUALITY_PROBE__;
      if (!probe) throw new Error("vertical quality browser probe did not install");
      return probe();
    });
    if (errors.length > 0) throw new Error(`browser errors: ${JSON.stringify(errors)}`);
    return result;
  } finally {
    await browser.close();
    await server.close();
  }
}

function pathBounds(path: { verbs: readonly Record<string, unknown>[] }) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const verb of path.verbs) {
    for (const [xKey, yKey] of [["x", "y"], ["cx", "cy"], ["c1x", "c1y"], ["c2x", "c2y"]] as const) {
      const x = verb[xKey];
      const y = verb[yKey];
      if (typeof x !== "number" || typeof y !== "number") continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

function directionalMismatches(
  from: Uint8Array,
  to: Uint8Array,
  width: number,
  height: number,
): number {
  let mismatches = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * 4;
      let matched = false;
      for (let dy = -1; dy <= 1 && !matched; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1 && !matched; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const other = (ny * width + nx) * 4;
          let channelMax = 0;
          for (let channel = 0; channel < 4; channel += 1) {
            channelMax = Math.max(
              channelMax,
              Math.abs((from[base + channel] ?? 0) - (to[other + channel] ?? 0)),
            );
          }
          if (channelMax <= FUZZY_DELTA) matched = true;
        }
      }
      if (!matched) mismatches += 1;
    }
  }
  return mismatches;
}

function fuzzyMismatchPct(a: Uint8Array, b: Uint8Array, width: number, height: number): number {
  const worst = Math.max(
    directionalMismatches(a, b, width, height),
    directionalMismatches(b, a, width, height),
  );
  return round((worst / (width * height)) * 100);
}

function inkMetrics(pixels: Uint8Array, width: number, height: number) {
  let ink = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if ((pixels[index] ?? 255) >= 245 && (pixels[index + 1] ?? 255) >= 245 && (pixels[index + 2] ?? 255) >= 245) continue;
      ink += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { inkPixels: ink, bounds: { minX, minY, maxX, maxY } };
}

function glyphIdsFromHbShape(output: string): number[] {
  return [...output.matchAll(/gid(\d+)/gu)].map((match) => Number(match[1]));
}

function runHarfBuzzVerticalReference(fontPath: string, text: string) {
  const version = execFileSync(HB_SHAPE_PATH, ["--version"], { encoding: "utf8" }).trim();
  const shape = (direction: "ltr" | "ttb") => {
    const args = [
      fontPath,
      text,
      "--features=vert=1,vrt2=1",
      `--direction=${direction}`,
    ];
    const output = execFileSync(HB_SHAPE_PATH, args, { encoding: "utf8" }).trim();
    return { direction, args, output, glyphIds: glyphIdsFromHbShape(output) };
  };
  const ltr = shape("ltr");
  const ttb = shape("ttb");
  if (ltr.glyphIds.length !== [...text].length || ttb.glyphIds.length !== [...text].length) {
    throw new Error(`hb-shape dropped or merged vertical evidence glyphs: ${JSON.stringify({ text, ltr, ttb })}`);
  }
  const changedGlyphIndices = ltr.glyphIds.flatMap((glyphId, index) =>
    glyphId === ttb.glyphIds[index] ? [] : [index]);
  return {
    executable: HB_SHAPE_PATH,
    version,
    fontPath,
    fontBytesCopied: false,
    text,
    requestedFeatures: ["vert", "vrt2"] as const,
    ltr,
    ttb,
    changedGlyphIndices,
    directionDependent: changedGlyphIndices.length > 0,
    note: "The installed font is read in place. Explicit vert/vrt2 under LTR is compared with TTB shaping; no font bytes are copied or redistributed.",
  };
}

async function runWasmProbe(
  fontBytes: Uint8Array,
  verticalFeatureFontBytes: Uint8Array,
  robotoBytes: Uint8Array,
) {
  const memoryBefore = process.memoryUsage();
  const [velloNode, verticalModule, velloRender, skiaNode, skiaRender, model] = await Promise.all([
    import("../../../packages/studio-engine-vello/src/node/index"),
    import("../../../packages/studio-engine-vello/src/text-vertical"),
    import("../../../packages/studio-engine-vello/src/render"),
    import("../../../packages/studio-engine-skia/src/node/index"),
    import("../../../packages/studio-engine-skia/src/render"),
    import("../../../packages/studio-project-model/src/index"),
  ]);
  const [canvasKit] = await Promise.all([skiaNode.loadCanvasKitNode(), velloNode.loadVelloNode()]);
  const workloads = [
    { id: "applegothic-cjk-tcy", text: "세로쓰기2026。한글", bytes: fontBytes, maxHeightPx: 104 },
    { id: "roboto-tcy-1", text: "1", bytes: robotoBytes, maxHeightPx: 300 },
    { id: "roboto-tcy-2", text: "12", bytes: robotoBytes, maxHeightPx: 300 },
    { id: "roboto-tcy-3", text: "123", bytes: robotoBytes, maxHeightPx: 300 },
    { id: "roboto-tcy-4", text: "2026", bytes: robotoBytes, maxHeightPx: 300 },
    { id: "roboto-five-digit-fallback", text: "12345", bytes: robotoBytes, maxHeightPx: 300 },
  ] as const;
  const options = { fontSizePx: 32 } as const;
  for (let index = 0; index < WASM_WARMUP; index += 1) {
    for (const workload of workloads) {
      verticalModule.shapeTextVerticalToGlyphPaths(workload.text, workload.bytes, {
        ...options,
        maxHeightPx: workload.maxHeightPx,
      });
    }
  }

  const rawSamplesMs: number[] = [];
  for (let sample = 0; sample < WASM_SAMPLE_COUNT; sample += 1) {
    const started = performance.now();
    for (const workload of workloads) {
      verticalModule.shapeTextVerticalToGlyphPaths(workload.text, workload.bytes, {
        ...options,
        maxHeightPx: workload.maxHeightPx,
      });
    }
    rawSamplesMs.push(performance.now() - started);
  }

  const cases = workloads.map((workload) => {
    const first = verticalModule.shapeTextVerticalToGlyphPaths(workload.text, workload.bytes, {
      ...options,
      maxHeightPx: workload.maxHeightPx,
    });
    const second = verticalModule.shapeTextVerticalToGlyphPaths(workload.text, workload.bytes, {
      ...options,
      maxHeightPx: workload.maxHeightPx,
    });
    const isShortDigits = /^[0-9]{1,4}$/u.test(workload.text);
    const isFiveDigits = workload.text === "12345";
    const tcyBounds = first.glyphs.filter((glyph) => glyph.tateChuYoko).map((glyph) => pathBounds(glyph.path));
    return {
      id: workload.id,
      sourceCodePoints: [...workload.text].length,
      glyphs: first.glyphs.length,
      columns: first.columnCount,
      verticalMetricsSource: first.verticalMetricsSource,
      warnings: first.warnings,
      tateChuYokoGlyphs: first.glyphs.filter((glyph) => glyph.tateChuYoko).length,
      rotatedGlyphs: first.glyphs.filter((glyph) => glyph.rotated).length,
      noGlyphDrop: first.glyphs.length >= [...workload.text].filter((char) => !/\s/u.test(char)).length,
      deterministic: JSON.stringify(first) === JSON.stringify(second),
      tateChuYokoWithinOneCell:
        !isShortDigits
        || tcyBounds.every(
          (bounds) =>
            bounds.minX >= -0.001
            && bounds.minY >= -0.001
            && bounds.maxX <= 32.001
            && bounds.maxY <= 32.001,
        ),
      expectedOrientation:
        (!isShortDigits || first.glyphs.every((glyph) => glyph.tateChuYoko && !glyph.rotated))
        && (!isFiveDigits || first.glyphs.every((glyph) => !glyph.tateChuYoko && glyph.rotated)),
      shapeSha256: sha256(JSON.stringify(first)),
    };
  });

  const verticalFeatureText = "「」、。！？";
  const featureFirst = verticalModule.shapeTextVerticalToGlyphPaths(
    verticalFeatureText,
    verticalFeatureFontBytes,
    { fontSizePx: 32, maxHeightPx: 300 },
  );
  const featureSecond = verticalModule.shapeTextVerticalToGlyphPaths(
    verticalFeatureText,
    verticalFeatureFontBytes,
    { fontSizePx: 32, maxHeightPx: 300 },
  );
  const harfBuzzReference = runHarfBuzzVerticalReference(BROWSER_FONT_PATH, verticalFeatureText);
  const verticalFeatureEvidence = {
    text: verticalFeatureText,
    sourceCodePoints: [...verticalFeatureText].length,
    glyphs: featureFirst.glyphs.length,
    noGlyphDrop: featureFirst.glyphs.length === [...verticalFeatureText].length,
    deterministic: JSON.stringify(featureFirst) === JSON.stringify(featureSecond),
    shapeSha256: sha256(JSON.stringify(featureFirst)),
    verticalFeatures: featureFirst.verticalFeatures,
    glyphEvidence: featureFirst.glyphs.map((glyph, index) => ({
      source: [...verticalFeatureText][index],
      glyphId: glyph.id,
      verticalAlternate: glyph.verticalAlternate,
      verticalFallback: glyph.verticalFallback,
      rotated: glyph.rotated,
    })),
    warnings: featureFirst.warnings,
    manualPresentationFormSubstitutionClaimed: featureFirst.warnings.some((warning) => /U\+FE/u.test(warning)),
    harfBuzzReference,
    apiFinding: {
      skrifa: "Raw GSUB feature records expose vert/vrt2 availability without implementing substitutions.",
      parley: "StyleProperty::FontFeatures reaches HarfRust, but Parley 0.11 fixes horizontal layout direction and exposes no vertical-direction builder API.",
      selectedApproach: "direct pinned HarfRust Direction::TopToBottom shaping with explicit vert/vrt2; Skrifa outlines selected glyph ids; per-role geometry remains only for characters without a font alternate",
    },
  };

  const visualText = "「세로쓰기2026、품질。」\n한글12345";
  const shaped = verticalModule.shapeTextVerticalToGlyphPaths(visualText, fontBytes, {
    fontSizePx: 36,
    maxHeightPx: 180,
  });
  const width = Math.max(160, Math.ceil(shaped.width + 24));
  const height = 204;
  const scene = model.sceneIRSchema.parse({
    version: 11,
    width,
    height,
    background: { r: 1, g: 1, b: 1, a: 1 },
    nodes: shaped.glyphs.filter((glyph) => glyph.path.verbs.length > 0).map((glyph, index) => ({
      id: `vertical-glyph-${index}`,
      kind: "fill-path" as const,
      path: glyph.path,
      paint: model.solidPaint(0.07, 0.06, 0.04),
      opacity: 1,
      blend: "src-over" as const,
      fillRule: "nonzero" as const,
    })),
  }) as SceneIR;
  const firstVello = velloRender.renderSceneToPixels(scene);
  const secondVello = velloRender.renderSceneToPixels(scene);
  const firstSkia = skiaRender.renderSceneToPixels(canvasKit, scene);
  const secondSkia = skiaRender.renderSceneToPixels(canvasKit, scene);
  const velloByteExact = Buffer.from(firstVello).equals(Buffer.from(secondVello));
  const skiaByteExact = Buffer.from(firstSkia).equals(Buffer.from(secondSkia));
  const mismatch = fuzzyMismatchPct(firstVello, firstSkia, width, height);
  const velloInk = inkMetrics(firstVello, width, height);
  const skiaInk = inkMetrics(firstSkia, width, height);
  const velloPng = skiaRender.encodeRgbaToPng(canvasKit, firstVello, width, height);
  const skiaPng = skiaRender.encodeRgbaToPng(canvasKit, firstSkia, width, height);
  const memoryAfter = process.memoryUsage();
  const expectedWarningPatterns = [
    /font has no vhea\/vmtx/u,
    /OpenType vert\/vrt2 produced no glyph alternate/u,
  ];
  const unexpectedWarnings = cases.flatMap((entry) =>
    entry.warnings.filter((warning) => !expectedWarningPatterns.some((pattern) => pattern.test(warning)))
      .map((warning) => `${entry.id}: ${warning}`),
  );
  const gates = {
    noGlyphDrop: cases.every((entry) => entry.noGlyphDrop),
    deterministicGeometry: cases.every((entry) => entry.deterministic),
    tateChuYokoWithinOneCell: cases.every((entry) => entry.tateChuYokoWithinOneCell),
    expectedTateChuYokoAndFallbackOrientation: cases.every((entry) => entry.expectedOrientation),
    noUnexpectedWarnings: unexpectedWarnings.length === 0,
    rendererDeterministic: velloByteExact && skiaByteExact,
    crossRendererFuzzyWithinGate: mismatch <= FUZZY_GATE_PCT,
    visibleInk: velloInk.inkPixels > 250 && skiaInk.inkPixels > 250,
    verticalFeatureJsonDeterministic: verticalFeatureEvidence.deterministic,
    verticalFeatureNoGlyphDrop: verticalFeatureEvidence.noGlyphDrop,
    systemFontAdvertisesVerticalFeatures:
      verticalFeatureEvidence.verticalFeatures.fontHasVert
      || verticalFeatureEvidence.verticalFeatures.fontHasVrt2,
    harfrustTopToBottomApplied:
      verticalFeatureEvidence.verticalFeatures.application === "applied"
      && verticalFeatureEvidence.verticalFeatures.appliedGlyphs > 0,
    alternateOrFallbackComplete:
      verticalFeatureEvidence.verticalFeatures.appliedGlyphs
        + verticalFeatureEvidence.verticalFeatures.geometricFallbackGlyphs
      === verticalFeatureEvidence.sourceCodePoints
      && verticalFeatureEvidence.glyphEvidence.every(
        (glyph) => glyph.verticalAlternate || glyph.verticalFallback !== null,
      ),
    noManualGlyphSubstitution: !verticalFeatureEvidence.manualPresentationFormSubstitutionClaimed,
    harfBuzzReferenceProvesDirectionDependency:
      verticalFeatureEvidence.harfBuzzReference.directionDependent
      && verticalFeatureEvidence.harfBuzzReference.changedGlyphIndices.length > 0,
  };
  if (Object.entries(gates).some(([, passed]) => !passed)) {
    throw new Error(`WASM vertical quality gate failed: ${JSON.stringify({ gates, unexpectedWarnings, mismatch })}`);
  }
  return {
    workload: {
      warmupRounds: WASM_WARMUP,
      sampleCount: WASM_SAMPLE_COUNT,
      casesPerSample: workloads.length,
      fontSizePx: options.fontSizePx,
    },
    latencyPerSixCaseBatchMs: {
      ...latencyStats(rawSamplesMs),
      rawSamplesMs: rawSamplesMs.map((value) => round(value)),
    },
    cases,
    verticalFeatureEvidence,
    memory: {
      before: memoryBefore,
      after: memoryAfter,
      observedRssDeltaBytes: memoryAfter.rss - memoryBefore.rss,
      observedHeapUsedDeltaBytes: memoryAfter.heapUsed - memoryBefore.heapUsed,
      peakCpuBytes: null,
      peakGpuBytes: null,
      note: "RSS/heap are process-level observations; per-provider peak CPU/GPU allocation is not observable in this harness.",
    },
    rendererPixelEvidence: {
      scene: { text: visualText, width, height, glyphs: shaped.glyphs.length, columns: shaped.columnCount },
      warnings: shaped.warnings,
      fuzzy: { delta: FUZZY_DELTA, mismatchPct: mismatch, gatePct: FUZZY_GATE_PCT },
      vello: { ...velloInk, pixelSha256: sha256(firstVello), pngSha256: sha256(velloPng), byteExactRepeat: velloByteExact },
      canvaskit: { ...skiaInk, pixelSha256: sha256(firstSkia), pngSha256: sha256(skiaPng), byteExactRepeat: skiaByteExact },
      inkCoverageDifferencePct: round(
        (Math.abs(velloInk.inkPixels - skiaInk.inkPixels) / Math.max(1, velloInk.inkPixels)) * 100,
      ),
      separation: "PathIR pixel evidence covers Rust HarfRust-TTB/Skrifa vertical shaping; vertical ruby remains product-geometry plus Chromium Canvas evidence because it is currently a Konva text overlay, not PathIR.",
    },
    pngs: { vello: velloPng, skia: skiaPng },
    gates,
  };
}

const integrity = await assertGeneratedArtifactsStable();
const [fontBuffer, browserFontBuffer, robotoBuffer] = await Promise.all([
  readFile(FONT_PATH),
  readFile(BROWSER_FONT_PATH),
  readFile(ROBOTO_PATH),
]);
const fontBytes = new Uint8Array(fontBuffer);
const browserFontBytes = new Uint8Array(browserFontBuffer);
const robotoBytes = new Uint8Array(robotoBuffer);
const [product, wasm] = await Promise.all([
  runBrowserProductProbe(browserFontBytes),
  runWasmProbe(fontBytes, browserFontBytes, robotoBytes),
]);

await mkdir(GOLDEN_DIR, { recursive: true });
const productPng = Uint8Array.from(Buffer.from(product.visual.pngBase64, "base64"));
await Promise.all([
  writeFile(PRODUCT_GOLDEN, productPng),
  writeFile(VELLO_GOLDEN, wasm.pngs.vello),
  writeFile(SKIA_GOLDEN, wasm.pngs.skia),
]);

const report = {
  schema: "toon-text-vertical-quality-v1",
  generatedAtUtc: new Date().toISOString(),
  runtime: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown",
    execution: "real product TypeScript in Vite Chromium plus committed Parley/Skrifa Vello WASM; no mock",
  },
  integrity,
  fonts: {
    wasmShaping: {
      family: "AppleGothic",
      path: FONT_PATH,
      sha256: sha256(fontBytes),
      bytes: fontBytes.byteLength,
      redistribution: "not committed; OS-provided benchmark input; Apple system-font redistribution rights are not asserted",
    },
    browserVisual: {
      family: "Arial Unicode",
      path: BROWSER_FONT_PATH,
      sha256: sha256(browserFontBytes),
      bytes: browserFontBytes.byteLength,
      redistribution: "not committed; OS-provided benchmark input; Microsoft/Apple system-font redistribution rights are not asserted",
      reason: "AppleGothic is accepted by Skrifa but rejected as a network FontFace by Chromium OTS; this installed CJK-capable TTF is used only for the product Canvas reference.",
    },
  },
  product: {
    ...product,
    visual: {
      ...product.visual,
      pngBase64: undefined,
      file: "tests/corpus/text/golden/vertical-quality-product.png",
      sha256: sha256(productPng),
    },
  },
  wasm: {
    ...wasm,
    pngs: undefined,
    rendererPixelEvidence: {
      ...wasm.rendererPixelEvidence,
      vello: { ...wasm.rendererPixelEvidence.vello, file: "tests/corpus/text/golden/vertical-quality-engine-vello.png" },
      canvaskit: { ...wasm.rendererPixelEvidence.canvaskit, file: "tests/corpus/text/golden/vertical-quality-engine-skia.png" },
    },
  },
  limitations: [
    "This is not a CSP blind comparison and makes no CSP non-inferiority claim.",
    "Product ruby pixels are Chromium Canvas/Konva-compatible geometry evidence, not a shared PathIR cross-renderer comparison.",
    "AppleGothic and Arial Unicode are OS-provided local inputs and are not copied into the repository; other OS versions must rerun and record their own font hashes.",
    "The product vertical core uses Canvas measureText plus deterministic Unicode-role placement; OpenType ruby optical metrics remain outside that product geometry path.",
    "Kinsoku uses a deterministic nearest-valid-break search bounded to 32 cells; when no legal break exists inside that bound, the item is explicitly hung with overflow rather than dropped.",
    "Parley 0.11 still exposes no vertical paragraph builder, so the bounded single-style lane invokes the same pinned HarfRust 0.10 directly with Direction::TopToBottom and explicit vert/vrt2. Skrifa outlines the returned glyph ids; only characters without a font alternate use explicit geometric punctuation fallback.",
    "Process RSS/heap are observable; provider-specific peak CPU/GPU allocations are not and remain null.",
  ],
};
await writeFile(RESULT_PATH, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
