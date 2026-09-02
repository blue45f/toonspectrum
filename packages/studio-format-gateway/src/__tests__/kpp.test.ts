import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  buildCompressedTextChunk,
  buildInkBasicKpp,
  buildInternationalTextChunk,
  buildKppFile,
  buildMypaintWashKpp,
  buildPressureCurveKpp,
  serializeKppPresetXml,
} from "../../../../tests/corpus/brushes/kpp/synthetic-kpp";
import { KppParseError, parseKppPreset } from "../kpp";

function corpusBytes(fileName: string): Uint8Array {
  return new Uint8Array(
    readFileSync(
      fileURLToPath(
        new URL(`../../../../tests/corpus/brushes/kpp/${fileName}`, import.meta.url),
      ),
    ),
  );
}

function errorFrom(run: () => unknown): KppParseError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(KppParseError);
  return caught as KppParseError;
}

describe("kpp PNG container walk", () => {
  it("rejects non-PNG bytes with an explicit not-png error", () => {
    const error = errorFrom(() =>
      parseKppPreset(new TextEncoder().encode('{"version":3}')),
    );
    expect(error.code).toBe("not-png");
  });

  it("reports truncation instead of reading past the buffer", () => {
    const truncated = buildInkBasicKpp().slice(0, 40);
    expect(errorFrom(() => parseKppPreset(truncated)).code).toBe("truncated");
  });

  it("rejects a chunk whose stored CRC32 does not match its bytes", () => {
    const corrupted = buildInkBasicKpp();
    // Flip one byte inside the preset XML payload without fixing the CRC.
    const presetOffset = findAscii(corrupted, "paintopid");
    corrupted[presetOffset] ^= 0xff;
    expect(errorFrom(() => parseKppPreset(corrupted)).code).toBe("crc-mismatch");
  });

  it("fails loudly when no preset chunk exists at all", () => {
    const bytes = buildKppFile({ presetXml: "", omitPreset: true });
    expect(errorFrom(() => parseKppPreset(bytes)).code).toBe("missing-preset");
  });
});

describe("kpp text-chunk policy (zero silent loss)", () => {
  const presetXml = serializeKppPresetXml({
    name: "Compressed",
    paintopid: "paintbrush",
    params: [],
  });

  it("refuses a zTXt-compressed preset instead of guessing (no inflate lane)", () => {
    const bytes = buildKppFile({ presetXml, presetChunk: "zTXt" });
    const error = errorFrom(() => parseKppPreset(bytes));
    expect(error.code).toBe("unsupported-compression");
    expect(error.message).toContain("zTXt");
  });

  it("refuses an iTXt-carried preset with the same explicit gate", () => {
    const bytes = buildKppFile({ presetXml, presetChunk: "iTXt" });
    expect(errorFrom(() => parseKppPreset(bytes)).code).toBe(
      "unsupported-compression",
    );
  });

  it("surfaces non-preset zTXt/iTXt chunks in unmapped instead of dropping them", () => {
    const bytes = buildKppFile({
      presetXml,
      extraChunks: [
        buildCompressedTextChunk("krita-notes", "memo"),
        buildInternationalTextChunk("xml:com.krita", "meta"),
      ],
    });
    const result = parseKppPreset(bytes);
    expect(result.unmapped).toContain("chunk:zTXt(krita-notes)");
    expect(result.unmapped).toContain("chunk:iTXt(xml:com.krita)");
    // Krita's ever-present `version` tEXt chunk is inventory too.
    expect(result.unmapped).toContain("chunk:tEXt(version)");
  });
});

describe("kpp paintbrush mapping", () => {
  const result = parseKppPreset(buildInkBasicKpp());

  it("extracts the preset name and derives a deterministic program id", () => {
    expect(result.presetName).toBe("ToonSpectrum Ink Crisp");
    expect(result.program.name).toBe("ToonSpectrum Ink Crisp");
    expect(result.program.id).toBe("kpp:ToonSpectrum Ink Crisp");
  });

  it("maps brush_definition spacing/diameter/fade into tip and size fields", () => {
    expect(result.program.tip.spacingPct).toBeCloseTo(18);
    expect(result.program.tip.hardness).toBeCloseTo(0.8); // mean of 0.85/0.75
    // Base size rides as a constant mapping normalized against Krita's
    // 1000px reference cap: 24px → 0.024.
    const constants = result.program.sizeDynamics.filter(
      (mapping) => mapping.input === "constant",
    );
    expect(constants).toHaveLength(1);
    expect(constants[0]?.curve).toEqual([0.024, 0.024]);
  });

  it("carries OpacityValue and FlowValue as individually traceable flow constants", () => {
    const curves = result.program.flowDynamics
      .filter((mapping) => mapping.input === "constant")
      .map((mapping) => mapping.curve);
    expect(curves).toEqual([
      [0.9, 0.9],
      [0.75, 0.75],
    ]);
  });

  it("surfaces every unmapped param and metadata chunk, sorted deterministically", () => {
    expect(result.unmapped).toEqual(["ColorSource", "chunk:tEXt(version)"]);
    // Averaged hfade/vfade is a documented approximation, surfaced as warning.
    expect(
      result.warnings.some((warning) => warning.includes("hfade/vfade")),
    ).toBe(true);
  });

  it("produces a program that round-trips through brushProgramIRSchema", () => {
    expect(brushProgramIRSchema.parse(result.program)).toEqual(result.program);
    expect(result.program.providerPreference).toEqual(["hokusai-natural-media"]);
  });
});

describe("kpp pressure-sensor curves", () => {
  const result = parseKppPreset(buildPressureCurveKpp());

  it("parses escaped sensor XML into a monotone pressure flow LUT", () => {
    const pressure = result.program.flowDynamics.find(
      (mapping) => mapping.input === "pressure",
    );
    expect(pressure).toBeDefined();
    const lut = pressure?.curve ?? [];
    expect(lut).toHaveLength(8);
    expect(lut[0]).toBeCloseTo(0);
    expect(lut[lut.length - 1] ?? 0).toBeCloseTo(1);
    // Curve 0,0;0.5,0.25;1,1 — the midpoint tap sits on the middle knot.
    expect(lut[Math.floor(lut.length / 2)] ?? 0).toBeGreaterThan(0.2);
    for (let index = 1; index < lut.length; index += 1) {
      expect(lut[index] ?? 0).toBeGreaterThanOrEqual(lut[index - 1] ?? 0);
    }
  });

  it("parses the bare curve-string spelling into a size pressure LUT", () => {
    const pressure = result.program.sizeDynamics.find(
      (mapping) => mapping.input === "pressure",
    );
    expect(pressure).toBeDefined();
    // Curve 0,0.1;1,1 — starts at the pencil-thin floor, ends fully open.
    const lut = pressure?.curve ?? [];
    expect(lut[0]).toBeCloseTo(0.1);
    expect(lut[lut.length - 1] ?? 0).toBeCloseTo(1);
  });

  it("downgrades an unparseable sensor curve to warning + unmapped, not a throw", () => {
    const bytes = buildKppFile({
      presetXml: serializeKppPresetXml({
        name: "Broken Curve",
        paintopid: "paintbrush",
        params: [{ name: "PressureSize", type: "internal", value: "not;a;curve" }],
      }),
    });
    const broken = parseKppPreset(bytes);
    expect(broken.program.sizeDynamics).toEqual([]);
    expect(broken.unmapped).toContain("PressureSize");
    expect(
      broken.warnings.some((warning) => warning.includes("unparseable")),
    ).toBe(true);
  });

  it("leaves non-pressure sensors unmapped until their input lanes are wired", () => {
    const bytes = buildKppFile({
      presetXml: serializeKppPresetXml({
        name: "Fuzzy",
        paintopid: "paintbrush",
        params: [
          {
            name: "PressureOpacity",
            type: "internal",
            value: "<params><curve>0,0;1,1;</curve><sensor_type>fuzzy</sensor_type></params>",
          },
        ],
      }),
    });
    const fuzzy = parseKppPreset(bytes);
    expect(fuzzy.program.flowDynamics).toEqual([]);
    expect(fuzzy.unmapped).toContain("PressureOpacity(fuzzy)");
  });
});

describe("kpp mypaintbrush delegation", () => {
  const bytes = buildMypaintWashKpp();
  const result = parseKppPreset(bytes);

  it("routes mypaint_json through the existing myb lane (no duplicate mapping)", () => {
    // slow_tracking 4 → stabilizer strength 0.4: the myb lane's own formula.
    expect(result.program.stabilizer.strength).toBeCloseTo(0.4);
    expect(result.program.sizeDynamics).toHaveLength(1);
    expect(result.program.flowDynamics).toHaveLength(1);
    expect(result.program.providerPreference).toEqual(["hokusai-natural-media"]);
    expect(result.program.name).toBe("ToonSpectrum MyPaint Wash");
  });

  it("preserves the FULL kpp container and reports no loss for a fully mapped brush", () => {
    // Every setting in the wash fixture (radius_logarithmic / opaque /
    // slow_tracking / smudge) reaches the common IR, so the delegated ledger
    // is empty. smudge in particular IS applied — to mixing.kind/strength —
    // and must not be reported as an unmapped mypaint setting.
    expect(result.program.mixing).toEqual({ kind: "smudge", strength: 0.3 });
    expect(result.unmapped).not.toContain("mypaint:smudge");
    expect(result.unmapped.filter((entry) => entry.startsWith("mypaint:"))).toEqual([]);
    expect(result.program.sourcePayload?.format).toBe("krita-kpp");
    expect(
      Buffer.from(result.program.sourcePayload?.base64 ?? "", "base64").equals(
        Buffer.from(bytes),
      ),
    ).toBe(true);
  });

  it("prefixes delegated settings the common IR does not carry", () => {
    const withProviderNative = buildKppFile({
      presetXml: serializeKppPresetXml({
        name: "Provider Native",
        paintopid: "mypaintbrush",
        params: [
          {
            name: "mypaint_json",
            type: "string",
            value: JSON.stringify({
              version: 3,
              settings: {
                radius_logarithmic: { base_value: 1.2, inputs: {} },
                // Hokusai renders both from sourcePayload; the common IR has
                // no slot for either, so both stay in the delegated ledger.
                color_h: { base_value: 0.4, inputs: {} },
                eraser: { base_value: 1, inputs: {} },
              },
            }),
          },
        ],
      }),
    });
    const delegated = parseKppPreset(withProviderNative);
    expect(delegated.unmapped).toContain("mypaint:color_h");
    expect(delegated.unmapped).toContain("mypaint:eraser");
    expect(delegated.unmapped).not.toContain("mypaint:radius_logarithmic");
  });

  it("refuses a mypaintbrush preset without mypaint_json instead of a lossy default", () => {
    const empty = buildKppFile({
      presetXml: serializeKppPresetXml({
        name: "Hollow",
        paintopid: "mypaintbrush",
        params: [{ name: "EraserMode", type: "internal", value: "false" }],
      }),
    });
    expect(errorFrom(() => parseKppPreset(empty)).code).toBe("malformed-preset");
  });
});

describe("kpp foreign paintop engines", () => {
  it("surfaces every colorsmudge parameter as unmapped with the smudge-lane warning", () => {
    const bytes = buildKppFile({
      presetXml: serializeKppPresetXml({
        name: "Smudgy",
        paintopid: "colorsmudge",
        params: [
          { name: "SmudgeRate", type: "internal", value: "0.6" },
          { name: "ColorRate", type: "internal", value: "0.3" },
        ],
      }),
    });
    const result = parseKppPreset(bytes);
    expect(result.unmapped).toEqual([
      "ColorRate",
      "SmudgeRate",
      "chunk:tEXt(version)",
    ]);
    expect(
      result.warnings.some((warning) => warning.includes("smudge lane")),
    ).toBe(true);
    expect(brushProgramIRSchema.parse(result.program)).toEqual(result.program);
    expect(result.program.providerPreference).toEqual([]);
  });

  it("names unknown paintopids in a generic surfaced-as-unmapped warning", () => {
    const bytes = buildKppFile({
      presetXml: serializeKppPresetXml({
        name: "Sketchy",
        paintopid: "sketch",
        params: [{ name: "offset_scale", type: "internal", value: "0.05" }],
      }),
    });
    const result = parseKppPreset(bytes);
    expect(result.unmapped).toContain("offset_scale");
    expect(
      result.warnings.some((warning) => warning.includes('paintop "sketch"')),
    ).toBe(true);
  });
});

describe("kpp determinism and committed corpus", () => {
  it("is deterministic: identical bytes produce identical results", () => {
    const bytes = buildPressureCurveKpp();
    const first = parseKppPreset(bytes);
    const second = parseKppPreset(bytes);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("keeps the committed corpus fixtures byte-identical to their builders", () => {
    expect(corpusBytes("paintbrush-ink-basic.kpp")).toEqual(buildInkBasicKpp());
    expect(corpusBytes("paintbrush-pressure-curve.kpp")).toEqual(
      buildPressureCurveKpp(),
    );
    expect(corpusBytes("mypaint-wash-soft.kpp")).toEqual(buildMypaintWashKpp());
  });

  it("parses the committed fixtures from disk exactly like in-memory builds", () => {
    const fromDisk = parseKppPreset(corpusBytes("paintbrush-ink-basic.kpp"));
    expect(fromDisk).toEqual(parseKppPreset(buildInkBasicKpp()));
    expect(fromDisk.presetName).toBe("ToonSpectrum Ink Crisp");
  });
});

/** Byte offset of the first occurrence of an ASCII needle. */
function findAscii(haystack: Uint8Array, needle: string): number {
  const target = [...needle].map((ch) => ch.charCodeAt(0));
  for (let index = 0; index + target.length <= haystack.length; index += 1) {
    let matches = true;
    for (let cursor = 0; cursor < target.length; cursor += 1) {
      if (haystack[index + cursor] !== target[cursor]) {
        matches = false;
        break;
      }
    }
    if (matches) return index;
  }
  throw new Error(`ASCII needle "${needle}" not found in fixture bytes`);
}
