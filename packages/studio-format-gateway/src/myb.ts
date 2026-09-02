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
 * [[x, y], ...], ... } }`. The ENTIRE original document is preserved verbatim
 * in `sourcePayload` — the zero-silent-data-loss contract (§ absolute rule 9).
 *
 * Disposition contract (the source of truth for "what happened to setting X"):
 * a single `unmapped` bucket conflated four different fates and produced false
 * warnings (a setting the Hokusai provider renders natively read as "lost").
 * {@link MybSettingReport} names the fate per setting instead:
 *
 * - `mapped-exact`     — the common IR carries the exact value (hardness).
 * - `mapped-summary`   — the common IR carries a LOSSY summary: pressure LUTs
 *                        for radius/opaque, `slow_tracking` → stabilizer,
 *                        `dabs_per_basic_radius` + `dabs_per_actual_radius` →
 *                        `tip.spacingPct`, `smudge` → `mixing`.
 * - `provider-native`  — absent from the common IR, but the default provider
 *                        (hokusai-natural-media) re-reads it authoritatively
 *                        from `sourcePayload`; see raster-compile.ts.
 * - `parsed-inert`     — parsed and preserved, but neither the common IR nor
 *                        the default provider interprets it.
 * - `unsupported`      — recognised as not representable (legacy aliases).
 *
 * `unmappedSettings` is kept for backward compatibility and is now DERIVED:
 * every setting whose disposition is not `mapped-*`. Input curves the common
 * IR cannot carry (anything but `pressure` on radius/opaque, and every curve
 * on a scalar-summarised setting) are named in `preservedInputs` rather than
 * dropped from the ledger.
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

/** What the import pipeline did with one libmypaint setting. */
export type MybSettingDisposition =
  | "mapped-exact"
  | "mapped-summary"
  | "provider-native"
  | "parsed-inert"
  | "unsupported";

export interface MybSettingReport {
  setting: string;
  disposition: MybSettingDisposition;
  note?: string;
  /** Input axes whose curve the common IR actually carries. */
  mappedInputs?: string[];
  /** Input axes preserved in `sourcePayload` only (common IR drops them). */
  preservedInputs?: string[];
}

export interface MybSettingClassification {
  disposition: MybSettingDisposition;
  note?: string;
}

const PROVIDER_NATIVE_NOTE =
  "hokusai-natural-media reads it from sourcePayload; absent from the common IR";

/**
 * Settings the Hokusai raster compiler consumes natively and the common IR
 * does not carry. Mirrors `HOKUSAI_EVALUATED_SETTINGS` in
 * studio-brush-platform/src/raster-compile.ts MINUS the `mapped-*` entries
 * below (those reach both the common IR and the provider). The drift guard in
 * studio-brush-platform/src/__tests__/myb-provider-native-drift.test.ts keeps
 * the two lists honest — format-gateway must not import brush-platform, which
 * already depends on this module.
 */
const PROVIDER_NATIVE_SETTINGS: readonly string[] = [
  "anti_aliasing",
  "change_color_h",
  "change_color_hsl_s",
  "change_color_hsv_s",
  "change_color_l",
  "change_color_v",
  "color_h",
  "color_s",
  "color_v",
  "colorize",
  "custom_input",
  "custom_input_slowness",
  "dabs_per_second",
  "direction_filter",
  "elliptical_dab_angle",
  "elliptical_dab_ratio",
  "eraser",
  "gridmap_scale",
  "gridmap_scale_x",
  "gridmap_scale_y",
  "lock_alpha",
  "offset_angle",
  "offset_angle_2",
  "offset_angle_2_asc",
  "offset_angle_2_view",
  "offset_angle_adj",
  "offset_angle_asc",
  "offset_angle_view",
  "offset_by_random",
  "offset_by_speed",
  "offset_by_speed_slowness",
  "offset_multiplier",
  "offset_x",
  "offset_y",
  "opaque_linearize",
  "opaque_multiply",
  "paint_mode",
  "posterize",
  "posterize_num",
  "pressure_gain_log",
  "radius_by_random",
  "slow_tracking_per_dab",
  "smudge_length",
  "smudge_length_log",
  "smudge_radius_log",
  "smudge_transparency",
  "snap_to_pixel",
  "speed1_gamma",
  "speed1_slowness",
  "speed2_gamma",
  "speed2_slowness",
  "stroke_duration_logarithmic",
  "stroke_holdtime",
  "stroke_threshold",
  "tracking_noise",
];

const NON_PROVIDER_NATIVE_CLASSIFICATIONS: Readonly<
  Record<string, MybSettingClassification>
> = {
  hardness: {
    disposition: "mapped-exact",
    note: "tip.hardness, clamped to 0..1",
  },
  radius_logarithmic: {
    disposition: "mapped-summary",
    note: "pressure curve → sizeDynamics LUT (8 monotone samples)",
  },
  opaque: {
    disposition: "mapped-summary",
    note: "pressure curve → flowDynamics LUT (8 monotone samples)",
  },
  slow_tracking: {
    disposition: "mapped-summary",
    note: "base_value 0..10 → stabilizer.strength 0..1",
  },
  dabs_per_basic_radius: {
    disposition: "mapped-summary",
    note: "summed with dabs_per_actual_radius → tip.spacingPct = 100 / (2 × sum)",
  },
  dabs_per_actual_radius: {
    disposition: "mapped-summary",
    note: "summed with dabs_per_basic_radius → tip.spacingPct = 100 / (2 × sum)",
  },
  smudge: {
    disposition: "mapped-summary",
    note: "base_value → mixing.kind/mixing.strength",
  },
  restore_color: {
    disposition: "parsed-inert",
    note: "hokusai-core 0.3.0 parses it but the stroke engine never reads it",
  },
  smudge_bucket: {
    disposition: "parsed-inert",
    note: "libmypaint 2.x multi-bucket smudge; hokusai-core 0.3.0 does not parse it",
  },
  pigment: {
    disposition: "parsed-inert",
    note: "libmypaint 2.x spectral blending; hokusai-core 0.3.0 does not parse it",
  },
  dabs_per_radius: {
    disposition: "unsupported",
    note:
      "legacy alias dabs_per_radius; real keys are dabs_per_basic_radius/dabs_per_actual_radius",
  },
};

/**
 * The full libmypaint v3 setting vocabulary this importer recognises, with the
 * fate of each. A name outside this table is classified `parsed-inert` with an
 * "unknown setting name" note — never silently accepted as mapped.
 */
export const MYB_SETTING_TABLE: Readonly<
  Record<string, MybSettingClassification>
> = Object.freeze(
  ((): Record<string, MybSettingClassification> => {
    const table: Record<string, MybSettingClassification> = {};
    for (const setting of PROVIDER_NATIVE_SETTINGS) {
      table[setting] = { disposition: "provider-native", note: PROVIDER_NATIVE_NOTE };
    }
    for (const [setting, classification] of Object.entries(
      NON_PROVIDER_NATIVE_CLASSIFICATIONS,
    )) {
      table[setting] = classification;
    }
    return table;
  })(),
);

function settingsWithDisposition(
  ...dispositions: readonly MybSettingDisposition[]
): ReadonlySet<string> {
  const wanted = new Set<MybSettingDisposition>(dispositions);
  return new Set(
    Object.entries(MYB_SETTING_TABLE)
      .filter(([, classification]) => wanted.has(classification.disposition))
      .map(([setting]) => setting)
      .sort(),
  );
}

/** Settings the common IR carries (exactly or as a lossy summary). */
export const MYB_MAPPED_SETTINGS: ReadonlySet<string> = settingsWithDisposition(
  "mapped-exact",
  "mapped-summary",
);

/** Settings only the default provider (hokusai-natural-media) consumes. */
export const MYB_PROVIDER_NATIVE_SETTINGS: ReadonlySet<string> =
  settingsWithDisposition("provider-native");

/** Settings nothing downstream interprets, though they survive the payload. */
export const MYB_PARSED_INERT_SETTINGS: ReadonlySet<string> =
  settingsWithDisposition("parsed-inert");

/** Input axes whose curve the common IR lowers into a DynamicMappingIR LUT. */
const IR_MAPPED_INPUT = "pressure";
const SETTINGS_WITH_MAPPED_PRESSURE_CURVE: ReadonlySet<string> = new Set([
  "radius_logarithmic",
  "opaque",
]);

export interface MybImportResult {
  preset: BrushProgramIR;
  document: MybDocument;
  /** Per-setting disposition, sorted by setting name (deterministic). */
  settingReports: MybSettingReport[];
  /** Backward-compatible view: every setting whose disposition is not mapped-*. */
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

function joinNote(...parts: ReadonlyArray<string | undefined>): string | undefined {
  const kept = parts.filter((part): part is string => part !== undefined && part.length > 0);
  return kept.length > 0 ? kept.join("; ") : undefined;
}

/**
 * Classify every setting present in the document. Deterministic: the result is
 * sorted by setting name and depends on nothing but the document.
 */
function buildSettingReports(document: MybDocument): MybSettingReport[] {
  return Object.keys(document.settings)
    .sort()
    .map((setting) => {
      const value = document.settings[setting];
      const inputNames = Object.keys(value?.inputs ?? {}).sort();
      const classification = MYB_SETTING_TABLE[setting] ?? {
        disposition: "parsed-inert" as const,
        note: "unknown setting name",
      };

      if (
        classification.disposition !== "mapped-exact" &&
        classification.disposition !== "mapped-summary"
      ) {
        // Non-mapped settings keep their inputs wherever they are read from
        // (sourcePayload); listing them as "preserved" would imply the common
        // IR dropped something it was ever asked to carry.
        return classification.note === undefined
          ? { setting, disposition: classification.disposition }
          : {
              setting,
              disposition: classification.disposition,
              note: classification.note,
            };
      }

      const mappedInputs: string[] = SETTINGS_WITH_MAPPED_PRESSURE_CURVE.has(setting)
        ? inputNames.filter((input) => input === IR_MAPPED_INPUT)
        : [];
      const preservedInputs = inputNames.filter(
        (input) => !mappedInputs.includes(input),
      );
      // A scalar summary of a curve is lossy even when the setting itself maps
      // exactly, so any preserved curve demotes mapped-exact → mapped-summary.
      const disposition: MybSettingDisposition =
        preservedInputs.length > 0 ? "mapped-summary" : classification.disposition;
      const note = joinNote(
        classification.note,
        preservedInputs.length > 0
          ? `input curve(s) ${preservedInputs.join(", ")} preserved in sourcePayload only`
          : undefined,
      );

      const report: MybSettingReport = { setting, disposition };
      if (note !== undefined) report.note = note;
      if (mappedInputs.length > 0) report.mappedInputs = mappedInputs;
      if (preservedInputs.length > 0) report.preservedInputs = preservedInputs;
      return report;
    });
}

/**
 * libmypaint accumulates dab distance as
 * `dabs_per_basic_radius * dist/base_radius + dabs_per_actual_radius *
 * dist/actual_radius + dabs_per_second * dt`. The common IR has one scalar
 * spacing, so the two distance walkers are summed (matching the repo's
 * CC0 preset convention) and the time walker stays provider-native.
 */
function deriveSpacingPct(document: MybDocument): number {
  const basic = document.settings["dabs_per_basic_radius"];
  const actual = document.settings["dabs_per_actual_radius"];
  const legacyAlias = document.settings["dabs_per_radius"];

  let dabsPerRadius: number | undefined;
  if (basic !== undefined || actual !== undefined) {
    dabsPerRadius = (basic?.base_value ?? 0) + (actual?.base_value ?? 0);
  } else if (legacyAlias !== undefined) {
    // Not a libmypaint key (see MYB_SETTING_TABLE) — read only as a last
    // resort so hand-written documents keep their intent instead of silently
    // collapsing to the 10% default.
    dabsPerRadius = legacyAlias.base_value;
  }

  if (dabsPerRadius === undefined || dabsPerRadius <= 0) return 10;
  return Math.min(
    1000,
    Math.max(1, Math.round(100 / (2 * Math.max(0.05, dabsPerRadius)))),
  );
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
  const hardness = document.settings["hardness"];
  const smudge = document.settings["smudge"];

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

  const tipHardness = hardness !== undefined
    ? Math.min(1, Math.max(0, hardness.base_value))
    : 1;

  const tipSpacingPct = deriveSpacingPct(document);

  const mixingKind = smudge && smudge.base_value > 0.05 ? "smudge" : "none";
  const mixingStrength = smudge ? Math.min(1, Math.max(0, smudge.base_value)) : 0;

  const settingReports = buildSettingReports(document);
  const unmappedSettings = settingReports
    .filter((report) => !report.disposition.startsWith("mapped-"))
    .map((report) => report.setting);

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
    tip: {
      kind: "round",
      hardness: tipHardness,
      spacingPct: tipSpacingPct,
      angleJitterDeg: 0,
    },
    mixing: {
      kind: mixingKind,
      strength: mixingStrength,
    },
    providerPreference: ["hokusai-natural-media"],
    sourcePayload: {
      format: "myb-v3",
      base64: bytesToBase64(bytes),
    },
  });

  return { preset, document, settingReports, unmappedSettings };
}
