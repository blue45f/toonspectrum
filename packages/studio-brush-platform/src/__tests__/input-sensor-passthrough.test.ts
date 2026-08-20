import {
  deviceCalibrationIRSchema,
  modeledSampleIRSchema,
  strokeIRSchema,
} from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import { modelRawInput } from "../input";
import { applyStabilizer } from "../stabilizer";

import type {
  ModeledSampleIR,
  RawInputSampleIR,
} from "@toonspectrum/studio-project-model";

/**
 * V19 §2.2/§5 — sensor channels must survive the modeled sample stream.
 * Modeling is 1:1, so passthrough is verbatim copy + provenance; absent
 * channels stay absent (fail closed, no neutral-value injection).
 */

const calibration = deviceCalibrationIRSchema.parse({
  deviceId: "test-pen",
  pressureCurve: [0, 1],
});

function rawSample(overrides: Partial<RawInputSampleIR>): RawInputSampleIR {
  return {
    x: 0,
    y: 0,
    tMs: 0,
    pressure: 0.5,
    tiltXDeg: 0,
    tiltYDeg: 0,
    twistDeg: 0,
    pointerType: "pen",
    phase: "move",
    source: "raw",
    ...overrides,
  };
}

const SENSOR_CHANNELS = [
  "twistDeg",
  "tangentialPressure",
  "contactWidth",
  "contactHeight",
  "buttons",
] as const;

describe("input modeling sensor passthrough", () => {
  it("carries every optional sensor channel and provenance verbatim", () => {
    const modeled = modelRawInput(
      [
        rawSample({
          tMs: 0,
          phase: "down",
          twistDeg: 45,
          tangentialPressure: -0.25,
          contactWidth: 3.5,
          contactHeight: 2.5,
          buttons: 1,
        }),
        rawSample({
          x: 4,
          tMs: 8,
          source: "coalesced",
          twistDeg: 90,
          tangentialPressure: 0.5,
          contactWidth: 4,
          contactHeight: 3,
          buttons: 3,
        }),
      ],
      calibration,
    );
    expect(modeled).toHaveLength(2);
    expect(modeled[0]).toMatchObject({
      twistDeg: 45,
      tangentialPressure: -0.25,
      contactWidth: 3.5,
      contactHeight: 2.5,
      buttons: 1,
      source: "raw",
      sourceSampleIndex: 0,
    });
    expect(modeled[1]).toMatchObject({
      twistDeg: 90,
      tangentialPressure: 0.5,
      contactWidth: 4,
      contactHeight: 3,
      buttons: 3,
      source: "coalesced",
      sourceSampleIndex: 1,
    });
  });

  it("keeps sourceSampleIndex anchored to the original raw array across dropped predicted samples", () => {
    const modeled = modelRawInput(
      [
        rawSample({ tMs: 0, phase: "down" }),
        rawSample({ x: 4, tMs: 8, source: "predicted" }),
        rawSample({ x: 6, tMs: 16, source: "coalesced" }),
        rawSample({ x: 8, tMs: 24, phase: "up" }),
      ],
      calibration,
    );
    expect(modeled.map((sample) => sample.sourceSampleIndex)).toEqual([0, 2, 3]);
    expect(modeled.map((sample) => sample.source)).toEqual([
      "raw",
      "coalesced",
      "raw",
    ]);
  });

  it("leaves channels the hardware never reported absent — no default injection", () => {
    // Cast: legacy adapters can hand over samples without twistDeg at runtime.
    const bareSample = {
      x: 1,
      y: 2,
      tMs: 4,
      pressure: 0.5,
      tiltXDeg: 0,
      tiltYDeg: 0,
      pointerType: "pen",
      phase: "move",
      source: "raw",
    } as RawInputSampleIR;
    const modeled = modelRawInput([bareSample], calibration);
    const sample = modeled[0];
    expect(sample).toBeDefined();
    for (const channel of SENSOR_CHANNELS) {
      expect(sample && channel in sample).toBe(false);
    }
    // Provenance is computed by the modeler itself, so it is always present.
    expect(sample?.source).toBe("raw");
    expect(sample?.sourceSampleIndex).toBe(0);
  });
});

describe("ModeledSampleIR schema passthrough contract", () => {
  const minimal = {
    x: 1,
    y: 2,
    tMs: 3,
    pressure: 0.5,
    velocity: 0.25,
    altitudeDeg: 60,
    azimuthDeg: 120,
  };

  it("round-trips declared passthrough channels", () => {
    const full = {
      ...minimal,
      twistDeg: 30,
      tangentialPressure: 0.75,
      contactWidth: 5,
      contactHeight: 4,
      buttons: 2,
      source: "coalesced" as const,
      sourceSampleIndex: 7,
    };
    expect(modeledSampleIRSchema.parse(full)).toEqual(full);
  });

  it("does not inject passthrough channels on a minimal sample", () => {
    const parsed = modeledSampleIRSchema.parse(minimal);
    for (const channel of SENSOR_CHANNELS) {
      expect(channel in parsed).toBe(false);
    }
    expect("source" in parsed).toBe(false);
    expect("sourceSampleIndex" in parsed).toBe(false);
  });

  it('rejects source "predicted" — predicted samples never enter the modeled stream', () => {
    expect(() =>
      modeledSampleIRSchema.parse({ ...minimal, source: "predicted" }),
    ).toThrow();
  });

  it("round-trips passthrough channels through the committed StrokeIR", () => {
    const stroke = {
      id: "stroke-1",
      brushPresetId: "g-pen",
      seed: 7,
      color: { r: 0, g: 0, b: 0, a: 1 },
      baseSizePx: 4,
      samples: [
        {
          ...minimal,
          twistDeg: 15,
          tangentialPressure: -1,
          contactWidth: 2,
          contactHeight: 2,
          buttons: 32,
          source: "raw" as const,
          sourceSampleIndex: 0,
        },
      ],
    };
    expect(strokeIRSchema.parse(stroke)).toEqual(stroke);
  });
});

describe("stabilizer keeps sensor passthrough channels", () => {
  function channelRichLine(count: number): ModeledSampleIR[] {
    const samples: ModeledSampleIR[] = [];
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1);
      samples.push({
        x: t * 100,
        y: t * 100 + (index % 2 === 0 ? 1.5 : -1.5),
        tMs: index * 8,
        pressure: 0.6,
        velocity: 1,
        altitudeDeg: 90,
        azimuthDeg: 0,
        twistDeg: (index * 7) % 360,
        tangentialPressure: index / count,
        contactWidth: 3 + index * 0.1,
        contactHeight: 2 + index * 0.1,
        buttons: index % 2 === 0 ? 1 : 3,
        source: index % 3 === 0 ? "coalesced" : "raw",
        sourceSampleIndex: index,
      });
    }
    return samples;
  }

  it.each(["ema", "spring"] as const)(
    "%s smoothing rewrites positions but never strips sensor channels",
    (kind) => {
      const input = channelRichLine(24);
      const stabilized = applyStabilizer(input, {
        kind,
        strength: 0.7,
        predictionMs: 0,
      });
      expect(stabilized).toHaveLength(input.length);
      stabilized.forEach((sample, index) => {
        const original = input[index];
        expect(sample.twistDeg).toBe(original?.twistDeg);
        expect(sample.tangentialPressure).toBe(original?.tangentialPressure);
        expect(sample.contactWidth).toBe(original?.contactWidth);
        expect(sample.contactHeight).toBe(original?.contactHeight);
        expect(sample.buttons).toBe(original?.buttons);
        expect(sample.source).toBe(original?.source);
        expect(sample.sourceSampleIndex).toBe(original?.sourceSampleIndex);
      });
    },
  );
});
