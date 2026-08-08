import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  buildAbrFile,
  buildComputedAbr,
  buildComputedBody,
  buildSampledBody,
  radialTipAlpha,
} from "../../../../tests/corpus/brushes/abr/synthetic-abr";
import {
  buildInkBasicKpp,
  buildKppFile,
  buildMypaintWashKpp,
  serializeKppPresetXml,
} from "../../../../tests/corpus/brushes/kpp/synthetic-kpp";
import { KppParseError } from "../../../studio-format-gateway/src/kpp";
import { MybParseError } from "../../../studio-format-gateway/src/myb";
import { BrushPreviewError, renderBrushPreview } from "../brush-preview";
import { loadLibMypaint } from "../libmypaint/index";

import type { BrushPreviewEngines, RenderBrushPreviewOptions } from "../brush-preview";
import type { HokusaiModuleLike } from "../raster-compile";

/**
 * Unified brush preview lab — unit gate. Covers the routing table (myb/kpp/
 * abr → libmypaint/hokusai/abr-stamp), explicit refusals (unroutable paintops,
 * missing engines, bad brush indices), the stage-prefixed warnings merge, the
 * shared canvas spec and per-format determinism. The pixel-identity goldens
 * live in tests/visual/brush-preview.test.ts.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..", "..");
const MYB_DIR = join(REPO_ROOT, "tests", "corpus", "brushes", "myb");
const HOKUSAI_PKG_DIR = join(REPO_ROOT, "packages", "studio-hokusai-wasm", "pkg");

type HokusaiModule =
  typeof import("../../../studio-hokusai-wasm/pkg/studio_hokusai_wasm.js");

/** Small shared canvas keeps the unit lane fast; visual goldens use 192×96. */
const OPTIONS_BASE = { width: 96, height: 48, seed: 7, sampleCount: 48 } as const;

let engines: BrushPreviewEngines;
let mybWashBytes: Uint8Array;

function options(extra: Partial<RenderBrushPreviewOptions> = {}): RenderBrushPreviewOptions {
  return { ...OPTIONS_BASE, engines, ...extra };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function buildColorsmudgeKpp(): Uint8Array {
  return buildKppFile({
    presetXml: serializeKppPresetXml({
      name: "ToonSpectrum Smudge Probe",
      paintopid: "colorsmudge",
      params: [{ name: "SmudgeRate", type: "internal", value: "0.5" }],
    }),
  });
}

/** Two-record ABR: computed oval (index 0) + sampled radial tip (index 1). */
function buildTwoBrushAbr(): Uint8Array {
  return buildAbrFile(2, [
    {
      typeCode: 1,
      body: buildComputedBody({
        version: 2,
        name: "preview-oval",
        spacingPct: 25,
        angleDeg: 30,
        roundness: 60,
        diameterPx: 20,
      }),
    },
    {
      typeCode: 2,
      body: buildSampledBody({
        version: 2,
        name: "preview-radial",
        spacingPct: 30,
        width: 12,
        height: 10,
        alpha: radialTipAlpha(12, 10),
      }),
    },
  ]);
}

beforeAll(async () => {
  const libmypaint = await loadLibMypaint();
  const hokusaiModule = (await import(
    join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm.js")
  )) as HokusaiModule;
  const wasmBytes = readFileSync(
    join(HOKUSAI_PKG_DIR, "studio_hokusai_wasm_bg.wasm"),
  );
  await hokusaiModule.default({ module_or_path: wasmBytes });
  engines = {
    libmypaint,
    hokusai: hokusaiModule as unknown as HokusaiModuleLike,
  };
  mybWashBytes = new Uint8Array(readFileSync(join(MYB_DIR, "wash-soft.myb")));
}, 120_000);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("engine routing table", () => {
  it("routes myb to the libmypaint reference lane by default", () => {
    const preview = renderBrushPreview(
      { format: "myb", bytes: mybWashBytes },
      options(),
    );
    expect(preview.engine).toBe("libmypaint");
    expect(preview.routing).toEqual({
      format: "myb",
      engine: "libmypaint",
      reason: expect.stringContaining("reference lane"),
    });
  });

  it("routes myb to hokusai when the challenger lane is requested", () => {
    const preview = renderBrushPreview(
      { format: "myb", bytes: mybWashBytes },
      options({ mybEngine: "hokusai" }),
    );
    expect(preview.engine).toBe("hokusai");
    expect(preview.routing.reason).toContain("challenger");
  });

  it("routes kpp mypaintbrush presets to libmypaint via the embedded mypaint_json", () => {
    const preview = renderBrushPreview(
      { format: "kpp", bytes: buildMypaintWashKpp() },
      options(),
    );
    expect(preview.engine).toBe("libmypaint");
    expect(preview.routing.format).toBe("kpp");
    expect(preview.routing.reason).toContain("mypaint_json");
  });

  it("routes kpp paintbrush presets to hokusai through compileRasterBrush", () => {
    const preview = renderBrushPreview(
      { format: "kpp", bytes: buildInkBasicKpp() },
      options(),
    );
    expect(preview.engine).toBe("hokusai");
    expect(preview.routing.reason).toContain("compileRasterBrush");
  });

  it("refuses unroutable kpp paintops with the reason and the routable lanes", () => {
    let thrown: unknown;
    try {
      renderBrushPreview({ format: "kpp", bytes: buildColorsmudgeKpp() }, options());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BrushPreviewError);
    const error = thrown as BrushPreviewError;
    expect(error.code).toBe("unroutable-paintop");
    expect(error.message).toContain('"colorsmudge"');
    expect(error.message).toContain("paintbrush → hokusai");
    expect(error.message).toContain("mypaintbrush → libmypaint");
  });

  it("routes abr files to the gateway dab-stamping lane", () => {
    const preview = renderBrushPreview(
      { format: "abr", bytes: buildTwoBrushAbr() },
      options(),
    );
    expect(preview.engine).toBe("abr-stamp");
    expect(preview.routing.reason).toContain("dab-stamping");
  });
});

describe("engine injection contract", () => {
  it("names the missing libmypaint engine instead of a silent fallback", () => {
    let thrown: unknown;
    try {
      renderBrushPreview(
        { format: "myb", bytes: mybWashBytes },
        { ...OPTIONS_BASE, engines: {} },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BrushPreviewError);
    const error = thrown as BrushPreviewError;
    expect(error.code).toBe("missing-engine");
    expect(error.message).toContain("loadLibMypaint");
  });

  it("names the missing hokusai engine for the kpp paintbrush lane", () => {
    let thrown: unknown;
    try {
      renderBrushPreview(
        { format: "kpp", bytes: buildInkBasicKpp() },
        { ...OPTIONS_BASE, engines: {} },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BrushPreviewError);
    const error = thrown as BrushPreviewError;
    expect(error.code).toBe("missing-engine");
    expect(error.message).toContain("engines.hokusai");
  });
});

describe("abr brush selection", () => {
  it("brushIndex selects distinct tips out of a multi-brush file", () => {
    const bytes = buildTwoBrushAbr();
    const first = renderBrushPreview(
      { format: "abr", bytes, brushIndex: 0 },
      options(),
    );
    const second = renderBrushPreview(
      { format: "abr", bytes, brushIndex: 1 },
      options(),
    );
    expect(first.engine).toBe("abr-stamp");
    expect(second.engine).toBe("abr-stamp");
    expect(sha256(second.pixels)).not.toBe(sha256(first.pixels));
  });

  it("rejects an out-of-range brushIndex with the valid range", () => {
    let thrown: unknown;
    try {
      renderBrushPreview(
        { format: "abr", bytes: buildTwoBrushAbr(), brushIndex: 2 },
        options(),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BrushPreviewError);
    const error = thrown as BrushPreviewError;
    expect(error.code).toBe("abr-brush-index");
    expect(error.message).toContain("valid: 0..1");
  });

  it("errors loudly when no record has a preview lane", () => {
    const bytes = buildAbrFile(1, [
      { typeCode: 5, body: Uint8Array.from([0, 0, 0, 0]) },
    ]);
    let thrown: unknown;
    try {
      renderBrushPreview({ format: "abr", bytes }, options());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(BrushPreviewError);
    const error = thrown as BrushPreviewError;
    expect(error.code).toBe("abr-no-brushes");
    expect(error.message).toContain("type 5");
  });
});

describe("warnings merge policy", () => {
  it("surfaces libmypaint injection unknowns, stage-prefixed", () => {
    const exotic = new TextEncoder().encode(
      JSON.stringify({
        version: 3,
        settings: {
          radius_logarithmic: {
            base_value: 2,
            inputs: {
              made_up_axis: [
                [0, 0],
                [1, 1],
              ],
            },
          },
          made_up_setting: { base_value: 1, inputs: {} },
        },
      }),
    );
    const preview = renderBrushPreview({ format: "myb", bytes: exotic }, options());
    expect(preview.warnings).toEqual([
      "inject[libmypaint] unknown setting: made_up_setting",
      "inject[libmypaint] unknown input: radius_logarithmic.inputs.made_up_axis",
    ]);
  });

  it("merges the kpp parse trail with the hokusai compile trail in stage order", () => {
    const preview = renderBrushPreview(
      { format: "kpp", bytes: buildInkBasicKpp() },
      options(),
    );
    expect(preview.warnings).toContain("parse[kpp] unmapped: ColorSource");
    expect(
      preview.warnings.some((warning) =>
        warning.startsWith("compile[hokusai]: sourcePayload.format=krita-kpp"),
      ),
      "IR-graph compile path surfaced",
    ).toBe(true);
    expect(preview.warnings).toContain(
      "compile[hokusai] unmapped: sizeDynamics[0].input=constant",
    );
    const lastParse = preview.warnings.reduce(
      (last, warning, index) => (warning.startsWith("parse[") ? index : last),
      -1,
    );
    const firstCompile = preview.warnings.findIndex((warning) =>
      warning.startsWith("compile["),
    );
    expect(lastParse, "parse stage precedes compile stage").toBeLessThan(
      firstCompile,
    );
  });

  it("propagates abr decode warnings alongside a successful render", () => {
    const bytes = buildAbrFile(2, [
      {
        typeCode: 1,
        body: buildComputedBody({ version: 2, name: "ok", diameterPx: 16 }),
      },
      { typeCode: 7, body: Uint8Array.from([1, 2, 3, 4]) },
    ]);
    const preview = renderBrushPreview({ format: "abr", bytes }, options());
    expect(preview.engine).toBe("abr-stamp");
    expect(preview.warnings).toEqual([
      "parse[abr]: brush 1: type 7 has no preview lane; retained as raw payload",
    ]);
  });
});

describe("gateway error propagation", () => {
  it("propagates MybParseError for non-myb bytes untouched", () => {
    expect(() =>
      renderBrushPreview(
        { format: "myb", bytes: Uint8Array.from([0xff, 0x00, 0x01]) },
        options(),
      ),
    ).toThrow(MybParseError);
  });

  it("propagates KppParseError for non-PNG bytes untouched", () => {
    let thrown: unknown;
    try {
      renderBrushPreview(
        { format: "kpp", bytes: new TextEncoder().encode("not a png") },
        options(),
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(KppParseError);
    expect((thrown as KppParseError).code).toBe("not-png");
  });
});

describe("shared preview spec", () => {
  const sources = () =>
    [
      { name: "myb", source: { format: "myb", bytes: mybWashBytes } },
      { name: "kpp", source: { format: "kpp", bytes: buildInkBasicKpp() } },
      {
        name: "abr",
        source: {
          format: "abr",
          bytes: buildComputedAbr({ version: 2, name: "spec", diameterPx: 16 }),
        },
      },
    ] as const;

  it("renders every format onto the requested canvas as opaque RGBA8888", () => {
    for (const { name, source } of sources()) {
      const preview = renderBrushPreview(source, options({ width: 128, height: 64 }));
      expect(preview.width, `${name} width`).toBe(128);
      expect(preview.height, `${name} height`).toBe(64);
      expect(preview.pixels.length, `${name} buffer`).toBe(128 * 64 * 4);
      for (let at = 3; at < preview.pixels.length; at += 4) {
        if (preview.pixels[at] !== 255) {
          throw new Error(`${name}: non-opaque alpha at byte ${at}`);
        }
      }
    }
  });

  it("is deterministic per format: same source + options → identical pixels", () => {
    for (const { name, source } of sources()) {
      const first = renderBrushPreview(source, options());
      const second = renderBrushPreview(source, options());
      expect(sha256(second.pixels), `${name} determinism`).toBe(
        sha256(first.pixels),
      );
    }
  });

  it("keeps the three formats distinct on the shared canvas, without console noise", () => {
    const warn = vi.spyOn(console, "warn");
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const hashes = new Set(
      sources().map(({ source }) =>
        sha256(renderBrushPreview(source, options()).pixels),
      ),
    );
    expect(hashes.size).toBe(3);
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
