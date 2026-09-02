import { describe, expect, it } from "vitest";

import { AbrParseError, importAbr } from "../abr";
import {
  MYB_SETTING_TABLE,
  MybParseError,
  importMybBrush,
} from "../myb";

import type { MybSettingReport } from "../myb";

/** Encodes a synthetic `.myb` v3 document with the given settings. */
function mybBytes(settings: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({ version: 3, group: "test", settings }),
  );
}

function reportFor(
  reports: readonly MybSettingReport[],
  setting: string,
): MybSettingReport {
  const found = reports.find((report) => report.setting === setting);
  expect(found, `no report for ${setting}`).toBeDefined();
  return found as MybSettingReport;
}

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
    // Zero silent loss: original bytes round-trip.
    expect(
      Buffer.from(result.preset.sourcePayload?.base64 ?? "", "base64").equals(
        Buffer.from(bytes),
      ),
    ).toBe(true);
    // smudge IS applied (mixing.kind/strength), so it is no longer "unmapped";
    // color_h is provider-native (Hokusai reads it from sourcePayload).
    expect(result.preset.mixing).toEqual({ kind: "smudge", strength: 0.35 });
    expect(result.unmappedSettings).toEqual(["color_h"]);
  });

  it("reports one disposition per setting, sorted and free of mapped/unmapped overlap", () => {
    const { settingReports, unmappedSettings } = importMybBrush(
      bytes,
      "myb-test",
      "합성 수채",
    );
    expect(settingReports.map((report) => report.setting)).toEqual(
      Object.keys(mybDocument.settings).sort(),
    );
    expect(reportFor(settingReports, "smudge").disposition).toBe("mapped-summary");
    expect(reportFor(settingReports, "color_h").disposition).toBe("provider-native");
    expect(reportFor(settingReports, "radius_logarithmic")).toMatchObject({
      disposition: "mapped-summary",
      mappedInputs: ["pressure"],
    });
    // The legacy bucket is now derived from the dispositions, never the reverse.
    const mapped = settingReports
      .filter((report) => report.disposition.startsWith("mapped-"))
      .map((report) => report.setting);
    expect(unmappedSettings.filter((name) => mapped.includes(name))).toEqual([]);
  });

  it("classifies an unknown setting name as parsed-inert instead of guessing", () => {
    const { settingReports, unmappedSettings } = importMybBrush(
      mybBytes({ totally_made_up: { base_value: 1, inputs: {} } }),
      "x",
      "x",
    );
    expect(reportFor(settingReports, "totally_made_up")).toEqual({
      setting: "totally_made_up",
      disposition: "parsed-inert",
      note: "unknown setting name",
    });
    expect(unmappedSettings).toEqual(["totally_made_up"]);
  });

  it("derives spacing from dabs_per_actual_radius (the real libmypaint key)", () => {
    const result = importMybBrush(
      mybBytes({ dabs_per_actual_radius: { base_value: 3.4, inputs: {} } }),
      "x",
      "x",
    );
    // 100 / (2 × 3.4) = 14.7 → 15, not the 10% default.
    expect(result.preset.tip.spacingPct).toBe(15);
    expect(reportFor(result.settingReports, "dabs_per_actual_radius").disposition)
      .toBe("mapped-summary");
  });

  it("sums both distance walkers when a brush carries basic AND actual radius", () => {
    const result = importMybBrush(
      mybBytes({
        dabs_per_basic_radius: { base_value: 6, inputs: {} },
        dabs_per_actual_radius: { base_value: 6, inputs: {} },
        dabs_per_second: { base_value: 40, inputs: {} },
      }),
      "x",
      "x",
    );
    // 100 / (2 × 12) = 4.17 → 4. dabs_per_second is time-based: preserved for
    // the provider, never folded into distance spacing.
    expect(result.preset.tip.spacingPct).toBe(4);
    expect(reportFor(result.settingReports, "dabs_per_second").disposition).toBe(
      "provider-native",
    );
    expect(result.unmappedSettings).toEqual(["dabs_per_second"]);
  });

  it("reads the legacy dabs_per_radius alias only as a fallback, and says so", () => {
    const legacyOnly = importMybBrush(
      mybBytes({ dabs_per_radius: { base_value: 5, inputs: {} } }),
      "x",
      "x",
    );
    expect(legacyOnly.preset.tip.spacingPct).toBe(10);
    expect(reportFor(legacyOnly.settingReports, "dabs_per_radius")).toMatchObject({
      disposition: "unsupported",
    });
    expect(reportFor(legacyOnly.settingReports, "dabs_per_radius").note).toContain(
      "dabs_per_basic_radius/dabs_per_actual_radius",
    );

    // A real key always wins over the alias.
    const withRealKey = importMybBrush(
      mybBytes({
        dabs_per_radius: { base_value: 5, inputs: {} },
        dabs_per_actual_radius: { base_value: 3.4, inputs: {} },
      }),
      "x",
      "x",
    );
    expect(withRealKey.preset.tip.spacingPct).toBe(15);
  });

  it("keeps non-pressure curves on a mapped setting in preservedInputs", () => {
    const result = importMybBrush(
      mybBytes({
        radius_logarithmic: {
          base_value: 1.1,
          inputs: {
            pressure: [[0, -1], [1, 0.5]],
            speed1: [[0, 0], [1, 0.3]],
          },
        },
        hardness: { base_value: 0.5, inputs: { pressure: [[0, 0], [1, 0.2]] } },
      }),
      "x",
      "x",
    );
    expect(reportFor(result.settingReports, "radius_logarithmic")).toMatchObject({
      disposition: "mapped-summary",
      mappedInputs: ["pressure"],
      preservedInputs: ["speed1"],
    });
    // hardness maps exactly as a scalar, so a curve on it demotes the report.
    expect(reportFor(result.settingReports, "hardness")).toMatchObject({
      disposition: "mapped-summary",
      preservedInputs: ["pressure"],
    });
    expect(result.unmappedSettings).toEqual([]);
  });

  it("classifies hardness exactly when it carries no curve", () => {
    const result = importMybBrush(
      mybBytes({ hardness: { base_value: 0.92, inputs: {} } }),
      "x",
      "x",
    );
    expect(reportFor(result.settingReports, "hardness").disposition).toBe(
      "mapped-exact",
    );
    expect(result.preset.tip.hardness).toBeCloseTo(0.92);
  });

  it("exposes a static table covering the libmypaint v3 vocabulary", () => {
    for (const key of ["dabs_per_actual_radius", "smudge", "restore_color", "pigment"]) {
      expect(MYB_SETTING_TABLE[key], key).toBeDefined();
    }
    expect(MYB_SETTING_TABLE["restore_color"]?.disposition).toBe("parsed-inert");
    expect(MYB_SETTING_TABLE["dabs_per_radius"]?.disposition).toBe("unsupported");
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
