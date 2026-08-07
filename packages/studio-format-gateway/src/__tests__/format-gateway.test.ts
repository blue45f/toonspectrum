import { describe, expect, it } from "vitest";

import { AbrParseError, importAbr } from "../abr";
import { MybParseError, importMybBrush } from "../myb";

describe("myb v3 importer", () => {
  const mybDocument = {
    version: 3,
    group: "test",
    description: "합성 수채",
    settings: {
      radius_logarithmic: {
        base_value: 2.1,
        inputs: { pressure: [[0, -1.2], [1, 0.9]] },
      },
      opaque: { base_value: 0.8, inputs: { pressure: [[0, -0.6], [1, 0.1]] } },
      slow_tracking: { base_value: 4, inputs: {} },
      color_h: { base_value: 0.1, inputs: {} },
      smudge: { base_value: 0.35, inputs: {} },
    },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(mybDocument));

  it("maps radius/opacity/slow-tracking and preserves the full payload", () => {
    const result = importMybBrush(bytes, "myb-test", "합성 수채");
    expect(result.preset.stabilizer.strength).toBeCloseTo(0.4);
    expect(result.preset.sizeDynamics).toHaveLength(1);
    expect(result.preset.flowDynamics).toHaveLength(1);
    // Pressure LUTs are normalized to [0,1] and monotone from the curve.
    const sizeLut = result.preset.sizeDynamics[0]?.curve ?? [];
    expect(sizeLut[0]).toBeLessThan(sizeLut[sizeLut.length - 1] ?? 0);
    expect(result.preset.providerPreference).toEqual(["hokusai-natural-media"]);
    // Zero silent loss: original bytes round-trip, unmapped settings reported.
    expect(
      Buffer.from(result.preset.sourcePayload?.base64 ?? "", "base64").equals(
        Buffer.from(bytes),
      ),
    ).toBe(true);
    expect(result.unmappedSettings).toEqual(["color_h", "smudge"]);
  });

  it("rejects non-v3 documents and invalid JSON explicitly", () => {
    const v2 = new TextEncoder().encode(
      JSON.stringify({ ...mybDocument, version: 2 }),
    );
    expect(() => importMybBrush(v2, "x", "x")).toThrow(MybParseError);
    expect(() => importMybBrush(new Uint8Array([0xff, 0x00]), "x", "x")).toThrow(
      MybParseError,
    );
  });
});

/** Builds a synthetic big-endian ABR v2 file with one computed brush. */
function syntheticAbrV2(name: string): Uint8Array {
  const nameUnits = [...name].map((ch) => ch.charCodeAt(0));
  nameUnits.push(0); // trailing NUL counted in stored length
  const bodySize = 4 + 2 + 4 + nameUnits.length * 2 + 2 + 2 + 2;
  const total = 4 + 6 + bodySize;
  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint16(offset, 2, false); // version
  offset += 2;
  view.setUint16(offset, 1, false); // count
  offset += 2;
  view.setUint16(offset, 1, false); // type: computed
  offset += 2;
  view.setUint32(offset, bodySize, false);
  offset += 4;
  view.setUint32(offset, 0, false); // misc
  offset += 4;
  view.setUint16(offset, 25, false); // spacing %
  offset += 2;
  view.setUint32(offset, nameUnits.length, false);
  offset += 4;
  for (const unit of nameUnits) {
    view.setUint16(offset, unit, false);
    offset += 2;
  }
  view.setInt16(offset, 45, false); // angle
  offset += 2;
  view.setInt16(offset, 80, false); // roundness
  offset += 2;
  view.setUint16(offset, 64, false); // diameter
  return new Uint8Array(buffer);
}

describe("abr importer (legacy v1/v2)", () => {
  it("parses a computed brush with UTF-16 name from a v2 file", () => {
    const result = importAbr(syntheticAbrV2("G-Pen Round"));
    expect(result.version).toBe(2);
    expect(result.brushes).toEqual([
      {
        kind: "computed",
        name: "G-Pen Round",
        diameterPx: 64,
        roundness: 80,
        angleDeg: 45,
        spacingPct: 25,
      },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("gates v6+ files behind an explicit unsupported-version error", () => {
    const v6 = new Uint8Array([0x00, 0x06, 0x00, 0x02]);
    let caught: unknown;
    try {
      importAbr(v6);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AbrParseError);
    expect((caught as AbrParseError).code).toBe("unsupported-version");
  });

  it("reports truncation instead of reading past the buffer", () => {
    const truncated = syntheticAbrV2("Cut").slice(0, 12);
    let caught: unknown;
    try {
      importAbr(truncated);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AbrParseError);
    expect((caught as AbrParseError).code).toBe("truncated");
  });
});
