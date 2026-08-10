import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderBrushPreview } from "@toonspectrum/studio-brush-platform";
import { beforeAll, describe, expect, it } from "vitest";

import { loadLibMypaint } from "../../packages/studio-brush-platform/src/libmypaint/index";
import {
  decodeAbrPreviewBrushes,
  renderAbrStrokePreview,
} from "../../packages/studio-format-gateway/src/abr-preview";
import {
  buildAbrFile,
  buildComputedAbr,
  buildComputedBody,
  buildSampledAbr,
  buildSampledBody,
  radialTipAlpha,
} from "../corpus/brushes/abr/synthetic-abr";

import type {
  BrushPreviewEngines,
  BrushPreviewResult,
  BrushPreviewSource,
  HokusaiModuleLike,
} from "@toonspectrum/studio-brush-platform";

/**
 * Unified brush preview lab — pixel-identity gate. Every corpus fixture
 * (`.myb` ×2, committed `.kpp` ×3, synthetic `.abr` ×2, plus the myb
 * challenger lane) renders through `renderBrushPreview` on the SHARED canvas
 * and its pixel sha256 is committed as a golden: any engine/adapter/routing
 * change that shifts one pixel fails here and must ship with regenerated
 * goldens plus visual review. REGEN_V11_GOLDENS=1 rewrites the manifest.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const HOKUSAI_PKG_DIR = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");
const MYB_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "myb");
const KPP_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "kpp");
const GOLDEN_PATH = join(
  REPO_ROOT,
  "tests",
  "corpus",
  "brushes",
  "brush-preview-goldens.json",
);
const REGEN = process.env.REGEN_V11_GOLDENS === "1";

const WIDTH = 192;
const HEIGHT = 96;
const SEED = 7;
const SAMPLE_COUNT = 96;

type HokusaiModule =
  typeof import("../../packages/studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");

interface PreviewVariant {
  id: string;
  /** True when the lane carries pressure dynamics the ramp gate can measure. */
  pressureDriven: boolean;
  source: () => BrushPreviewSource;
  mybEngine?: "hokusai";
}

const ABR_COMPUTED = (): Uint8Array =>
  buildComputedAbr({
    version: 2,
    name: "Preview Oval",
    spacingPct: 25,
    angleDeg: 30,
    roundness: 60,
    diameterPx: 28,
  });

const ABR_SAMPLED = (): Uint8Array =>
  buildSampledAbr({
    version: 1,
    compress: 1,
    width: 16,
    height: 12,
    alpha: radialTipAlpha(16, 12),
  });

let engines: BrushPreviewEngines;
const fixtureBytes = new Map<string, Uint8Array>();

const VARIANTS: PreviewVariant[] = [
  {
    id: "myb-wash-soft--libmypaint",
    pressureDriven: true,
    source: () => ({ format: "myb", bytes: fixture("myb/wash-soft.myb") }),
  },
  {
    id: "myb-wash-soft--hokusai-challenger",
    pressureDriven: true,
    mybEngine: "hokusai",
    source: () => ({ format: "myb", bytes: fixture("myb/wash-soft.myb") }),
  },
  {
    id: "myb-ink-crisp--libmypaint",
    pressureDriven: true,
    source: () => ({ format: "myb", bytes: fixture("myb/ink-crisp.myb") }),
  },
  {
    id: "kpp-paintbrush-ink-basic--hokusai",
    pressureDriven: false, // flat values only — no sensor curves in the preset
    source: () => ({ format: "kpp", bytes: fixture("kpp/paintbrush-ink-basic.kpp") }),
  },
  {
    id: "kpp-paintbrush-pressure-curve--hokusai",
    pressureDriven: true,
    source: () => ({
      format: "kpp",
      bytes: fixture("kpp/paintbrush-pressure-curve.kpp"),
    }),
  },
  {
    id: "kpp-mypaint-wash-soft--libmypaint",
    pressureDriven: true,
    source: () => ({ format: "kpp", bytes: fixture("kpp/mypaint-wash-soft.kpp") }),
  },
  {
    id: "abr-computed-oval--abr-stamp",
    pressureDriven: true, // smoothstep dab-size ramp along the stroke
    source: () => ({ format: "abr", bytes: ABR_COMPUTED() }),
  },
  {
    id: "abr-sampled-radial--abr-stamp",
    pressureDriven: true,
    source: () => ({ format: "abr", bytes: ABR_SAMPLED() }),
  },
];

function fixture(relativePath: string): Uint8Array {
  const bytes = fixtureBytes.get(relativePath);
  if (!bytes) throw new Error(`corpus fixture ${relativePath} not loaded`);
  return bytes;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function renderVariant(variant: PreviewVariant): BrushPreviewResult {
  return renderBrushPreview(variant.source(), {
    width: WIDTH,
    height: HEIGHT,
    seed: SEED,
    sampleCount: SAMPLE_COUNT,
    engines,
    ...(variant.mybEngine ? { mybEngine: variant.mybEngine } : {}),
  });
}

/** Pixels whose RGB differs from the white background by more than 8/255. */
function inkedPixels(pixels: Uint8Array): number {
  let ink = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (
      Math.abs((pixels[index] ?? 255) - 255) > 8 ||
      Math.abs((pixels[index + 1] ?? 255) - 255) > 8 ||
      Math.abs((pixels[index + 2] ?? 255) - 255) > 8
    ) {
      ink += 1;
    }
  }
  return ink;
}

/** Ink mass per canvas half along the stroke direction (pressure ramps L→R). */
function halfInk(pixels: Uint8Array): { low: number; high: number } {
  let low = 0;
  let high = 0;
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const base = (y * WIDTH + x) * 4;
      const darkness =
        3 * 255 -
        ((pixels[base] ?? 255) + (pixels[base + 1] ?? 255) + (pixels[base + 2] ?? 255));
      if (x < WIDTH / 2) {
        low += darkness;
      } else {
        high += darkness;
      }
    }
  }
  return { low, high };
}

beforeAll(async () => {
  const libmypaint = await loadLibMypaint();
  const hokusaiModule = (await import(
    join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm.js")
  )) as HokusaiModule;
  const wasmBytes = await readFile(
    join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm_bg.wasm"),
  );
  await hokusaiModule.default({ module_or_path: wasmBytes });
  engines = {
    libmypaint,
    hokusai: hokusaiModule as unknown as HokusaiModuleLike,
  };
  for (const name of ["wash-soft.myb", "ink-crisp.myb"]) {
    fixtureBytes.set(`myb/${name}`, new Uint8Array(await readFile(join(MYB_DIR, name))));
  }
  for (const name of [
    "paintbrush-ink-basic.kpp",
    "paintbrush-pressure-curve.kpp",
    "mypaint-wash-soft.kpp",
  ]) {
    fixtureBytes.set(`kpp/${name}`, new Uint8Array(await readFile(join(KPP_DIR, name))));
  }
}, 120_000);

describe("unified brush preview corpus (myb + kpp + abr)", () => {
  it("every variant paints the shared canvas deterministically", () => {
    for (const variant of VARIANTS) {
      const first = renderVariant(variant);
      const second = renderVariant(variant);
      expect(sha256(second.pixels), `${variant.id} determinism`).toBe(
        sha256(first.pixels),
      );
      expect(first.width, `${variant.id} canvas width`).toBe(WIDTH);
      expect(first.height, `${variant.id} canvas height`).toBe(HEIGHT);
      expect(inkedPixels(first.pixels), `${variant.id} ink coverage`).toBeGreaterThan(
        200,
      );
    }
  });

  it("formats, engines and fixtures all produce distinct pixel identities", () => {
    const hashes = new Set(
      VARIANTS.map((variant) => sha256(renderVariant(variant).pixels)),
    );
    expect(hashes.size).toBe(VARIANTS.length);
  });

  it("pressure-driven lanes deposit more ink in the high-pressure half", () => {
    for (const variant of VARIANTS.filter((entry) => entry.pressureDriven)) {
      const { low, high } = halfInk(renderVariant(variant).pixels);
      expect(high, `${variant.id} 필압 램프 방향`).toBeGreaterThan(low);
    }
  });

  it("abr previews pass through the gateway stamp lane byte-for-byte", () => {
    const bytes = ABR_SAMPLED();
    const preview = renderBrushPreview(
      { format: "abr", bytes },
      { width: WIDTH, height: HEIGHT, engines },
    );
    const decoded = decodeAbrPreviewBrushes(bytes);
    const direct = renderAbrStrokePreview(decoded.brushes[0]!, {
      width: WIDTH,
      height: HEIGHT,
    });
    expect(Buffer.from(preview.pixels).equals(Buffer.from(direct.pixels))).toBe(true);
  });

  it("abr brushIndex exposes each tip of a multi-brush file on the shared canvas", () => {
    // One v2 file carrying both corpus tips: computed oval, then sampled.
    const merged = buildAbrFile(2, [
      {
        typeCode: 1,
        body: buildComputedBody({
          version: 2,
          name: "Preview Oval",
          spacingPct: 25,
          angleDeg: 30,
          roundness: 60,
          diameterPx: 28,
        }),
      },
      {
        typeCode: 2,
        body: buildSampledBody({
          version: 2,
          name: "Preview Radial",
          compress: 1,
          width: 16,
          height: 12,
          alpha: radialTipAlpha(16, 12),
        }),
      },
    ]);
    const first = renderBrushPreview(
      { format: "abr", bytes: merged, brushIndex: 0 },
      { width: WIDTH, height: HEIGHT, engines },
    );
    const second = renderBrushPreview(
      { format: "abr", bytes: merged, brushIndex: 1 },
      { width: WIDTH, height: HEIGHT, engines },
    );
    expect(first.width).toBe(WIDTH);
    expect(second.width).toBe(WIDTH);
    expect(sha256(second.pixels)).not.toBe(sha256(first.pixels));
  });

  it("matches the committed golden manifest (regen with REGEN_V11_GOLDENS=1)", async () => {
    const current = VARIANTS.map((variant) => {
      const preview = renderVariant(variant);
      return {
        id: variant.id,
        engine: preview.engine,
        routingReason: preview.routing.reason,
        sha256: sha256(preview.pixels),
        inkedPixels: inkedPixels(preview.pixels),
        warnings: preview.warnings,
      };
    });

    if (REGEN) {
      await mkdir(join(REPO_ROOT, "tests", "corpus", "brushes"), { recursive: true });
      await writeFile(
        GOLDEN_PATH,
        `${JSON.stringify(
          {
            harness: "tests/visual/brush-preview.test.ts",
            api: "renderBrushPreview (packages/studio-brush-platform/src/brush-preview.ts)",
            engines:
              "libmypaint 1.6.1 pinned wasm | hokusai 0.3.0 via studio-hokusai-wasm | gateway abr dab-stamp",
            canvas: { width: WIDTH, height: HEIGHT, seed: SEED, samples: SAMPLE_COUNT },
            path: "standardZigzagStrokeSamples (stroke lanes) / gateway S-curve (abr lane)",
            variants: current,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const golden = JSON.parse(await readFile(GOLDEN_PATH, "utf8")) as {
      variants: Array<{
        id: string;
        engine: string;
        sha256: string;
        inkedPixels: number;
        warnings: string[];
      }>;
    };
    expect(golden.variants).toHaveLength(current.length);
    for (const [index, variant] of current.entries()) {
      expect(variant.engine, `${variant.id} engine routing`).toBe(
        golden.variants[index]?.engine,
      );
      expect(variant.sha256, `${variant.id} golden hash`).toBe(
        golden.variants[index]?.sha256,
      );
      expect(variant.inkedPixels, `${variant.id} golden coverage`).toBe(
        golden.variants[index]?.inkedPixels,
      );
      expect(variant.warnings, `${variant.id} golden warnings`).toEqual(
        golden.variants[index]?.warnings,
      );
    }
  });
});
