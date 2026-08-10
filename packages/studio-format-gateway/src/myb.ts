import { brushProgramIRSchema } from "@toonspectrum/studio-project-model";
import { z } from "zod";

import type {
  BrushProgramIR,
  DynamicMappingIR,
} from "@toonspectrum/studio-project-model";

/**
 * libmypaint `.myb` v3 importer (matrix E11, V11.1 §10.4).
 *
 * `.myb` v3 is JSON: `settings[name] = { base_value, inputs: { pressure:
 * [[x, y], ...], ... } }`. This importer maps the subset the vector brush
 * platform executes today (radius → base size, opaque → flow, pressure input
 * curves → DynamicMappingIR LUTs) and preserves the ENTIRE original document
 * in `sourcePayload` — nothing an unmapped setting carries is lost, which is
 * the zero-silent-data-loss contract (§ absolute rule 9). Unmapped settings
 * are reported as warnings, not dropped silently.
 */

const mybInputCurveSchema = z.array(z.tuple([z.number(), z.number()])).min(2);

const mybSettingSchema = z.object({
  base_value: z.number(),
  inputs: z.record(z.string(), mybInputCurveSchema).default({}),
});

export const mybDocumentSchema = z.object({
  version: z.number().int(),
  group: z.string().optional(),
  comment: z.string().optional(),
  description: z.string().optional(),
  settings: z.record(z.string(), mybSettingSchema),
});
export type MybDocument = z.infer<typeof mybDocumentSchema>;

function bytesToBase64(bytes: Uint8Array): string {
  // Browser-portable (FormatGateway runs in the import UI): chunked to stay
  // under argument-count limits for large payloads.
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return globalThis.btoa(binary);
}

export class MybParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MybParseError";
  }
}

/** Settings the vector lane maps today; everything else → warning + payload. */
const MAPPED_SETTINGS = new Set([
  "radius_logarithmic",
  "opaque",
  "slow_tracking",
]);

export interface MybImportResult {
  preset: BrushProgramIR;
  document: MybDocument;
  unmappedSettings: string[];
}

function pressureCurveToMapping(
  curve: Array<[number, number]>,
  baseValue: number,
  settingScale: number,
): DynamicMappingIR {
  // libmypaint input points are (input, delta); normalize deltas around the
  // base value into a monotone-sampled LUT on [0, 1].
  const samples = 8;
  const lut: number[] = [];
  const sorted = [...curve].sort((a, b) => a[0] - b[0]);
  const first = sorted[0] ?? [0, 0];
  const last = sorted[sorted.length - 1] ?? [1, 0];
  for (let index = 0; index < samples; index += 1) {
    const x = first[0] + ((last[0] - first[0]) * index) / (samples - 1);
    let y = first[1];
    for (let seg = 0; seg < sorted.length - 1; seg += 1) {
      const a = sorted[seg];
      const b = sorted[seg + 1];
      if (!a || !b) continue;
      if (x >= a[0] && x <= b[0]) {
        const t = b[0] === a[0] ? 0 : (x - a[0]) / (b[0] - a[0]);
        y = a[1] + (b[1] - a[1]) * t;
        break;
      }
      if (x > b[0]) y = b[1];
    }
    const value = (baseValue + y) / settingScale;
    lut.push(Math.min(1, Math.max(0, value)));
  }
  return { input: "pressure", curve: lut, min: 0, max: 1 };
}

export function importMybBrush(
  bytes: Uint8Array,
  presetId: string,
  presetName: string,
): MybImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new MybParseError(`not valid UTF-8 JSON: ${(error as Error).message}`);
  }
  const result = mybDocumentSchema.safeParse(parsed);
  if (!result.success) {
    throw new MybParseError(`not a .myb v3 document: ${result.error.message}`);
  }
  const document = result.data;
  if (document.version !== 3) {
    throw new MybParseError(
      `unsupported .myb version ${document.version} (v3 only); refusing a lossy import`,
    );
  }

  const radius = document.settings["radius_logarithmic"];
  const opaque = document.settings["opaque"];
  const slowTracking = document.settings["slow_tracking"];

  const sizeDynamics: DynamicMappingIR[] = [];
  const flowDynamics: DynamicMappingIR[] = [];
  const radiusPressure = radius?.inputs["pressure"];
  if (radius && radiusPressure) {
    sizeDynamics.push(pressureCurveToMapping(radiusPressure, radius.base_value, 6));
  }
  const opaquePressure = opaque?.inputs["pressure"];
  if (opaque && opaquePressure) {
    flowDynamics.push(pressureCurveToMapping(opaquePressure, opaque.base_value, 1));
  }

  const unmappedSettings = Object.keys(document.settings)
    .filter((name) => !MAPPED_SETTINGS.has(name))
    .sort();

  const preset = brushProgramIRSchema.parse({
    id: presetId,
    name: presetName,
    stabilizer: {
      kind: "ema",
      // slow_tracking 0..10 maps onto stabilizer strength 0..1.
      strength: Math.min(1, Math.max(0, (slowTracking?.base_value ?? 0) / 10)),
      predictionMs: 0,
    },
    sizeDynamics,
    flowDynamics,
    providerPreference: ["hokusai-natural-media"],
    sourcePayload: {
      format: "myb-v3",
      base64: bytesToBase64(bytes),
    },
  });

  return { preset, document, unmappedSettings };
}
