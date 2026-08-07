import { z } from "zod";

/**
 * ProviderDescriptor — the self-declaration every engine adapter must ship
 * (V11 §2.2). The registry refuses anonymous capability claims: a provider is
 * exactly as capable as its descriptor says, and the descriptor is what the
 * benchmark harness and the license gate audit.
 */

export const providerKindSchema = z.enum([
  "input",
  "brush-dynamics",
  "stroke-geometry",
  "raster-brush",
  "natural-media",
  "vector-renderer",
  "text-layout",
  "filter",
  "image-pipeline",
  "animation",
  "three-d",
  "format",
  "storage",
  "collaboration",
]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const providerRuntimeSchema = z.enum([
  "js",
  "wasm",
  "wasm-worker",
  "webgpu",
  "webgl",
  "native-bridge",
]);
export type ProviderRuntime = z.infer<typeof providerRuntimeSchema>;

export const determinismLevelSchema = z.enum([
  "bit-exact",
  "tolerance",
  "nondeterministic",
]);
export type DeterminismLevel = z.infer<typeof determinismLevelSchema>;

export const qualityTierSchema = z.enum(["preview", "production", "reference"]);
export type QualityTier = z.infer<typeof qualityTierSchema>;

export const maturitySchema = z.enum([
  "production-baseline",
  "conditional",
  "candidate",
  "experimental",
  "reference-only",
]);
export type Maturity = z.infer<typeof maturitySchema>;

/**
 * Capability tokens are namespaced strings, e.g. "render.vector.fill",
 * "render.text.paragraph", "stroke.geometry.pressure-outline". Namespacing is
 * enforced so ad-hoc booleans cannot leak in.
 */
export const capabilitySchema = z
  .string()
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, "capability must be namespaced (a.b.c)");
export type Capability = z.infer<typeof capabilitySchema>;

export const providerDescriptorSchema = z.object({
  id: z.string().min(1),
  kind: providerKindSchema,
  displayName: z.string().min(1),
  version: z.string().min(1),
  commit: z.string().optional(),
  license: z.string().min(1),
  attribution: z.string().default(""),
  maturity: maturitySchema,
  runtime: providerRuntimeSchema,
  capabilities: z.array(capabilitySchema).min(1),
  limitations: z.array(z.string()).default([]),
  previewQuality: qualityTierSchema,
  finalQuality: qualityTierSchema,
  determinism: determinismLevelSchema,
  /** Rough steady-state footprint used by the residency manager. */
  memoryEstimateMb: z.number().nonnegative(),
  /** Provider id used when this one fails or is unavailable on a device. */
  fallbackProviderId: z.string().nullable().default(null),
  knownIssues: z.array(z.string()).default([]),
});
export type ProviderDescriptor = z.infer<typeof providerDescriptorSchema>;

/** License policy hard gate (V11 §3.1) — evaluated before any quality score. */
export interface LicensePolicy {
  /** SPDX-ish tokens acceptable for direct browser/worker bundling. */
  bundleAllowed: string[];
  /** Tokens acceptable only behind an isolated provider/bridge boundary. */
  isolatedAllowed: string[];
}

export const DEFAULT_LICENSE_POLICY: LicensePolicy = {
  bundleAllowed: [
    "MIT",
    "Apache-2.0",
    "MIT / Apache-2.0",
    "BSD-3-Clause",
    "BSD",
    "ISC",
    "Unicode-3.0",
    "public-domain",
    "internal",
  ],
  isolatedAllowed: ["LGPL-2.1-or-later", "LGPL-3.0", "CeCILL-2.1", "MPL-2.0"],
};

export type LicenseGateResult =
  | { mode: "bundle" }
  | { mode: "isolated" }
  | { mode: "rejected"; reason: string };

export function evaluateLicenseGate(
  license: string,
  policy: LicensePolicy = DEFAULT_LICENSE_POLICY,
): LicenseGateResult {
  if (policy.bundleAllowed.includes(license)) return { mode: "bundle" };
  if (policy.isolatedAllowed.includes(license)) return { mode: "isolated" };
  return {
    mode: "rejected",
    reason: `license "${license}" is neither bundle-allowed nor isolation-allowed`,
  };
}

/** Quality/performance score weights (V11 §3.2) — totals 100. */
export const SCORE_WEIGHTS = {
  visualQuality: 30,
  inputLatency: 15,
  interactiveThroughput: 15,
  largeDocumentThroughput: 10,
  memoryResidency: 8,
  correctnessDeterminism: 8,
  extensibility: 8,
  maturityMaintenance: 6,
} as const;
export type ScoreAxis = keyof typeof SCORE_WEIGHTS;

/** Axis scores in [0,1], typically produced by the benchmark harness. */
export type AxisScores = Record<ScoreAxis, number>;

export function computeProviderScore(axes: AxisScores): number {
  let total = 0;
  for (const axis of Object.keys(SCORE_WEIGHTS) as ScoreAxis[]) {
    const value = axes[axis];
    if (value < 0 || value > 1 || Number.isNaN(value)) {
      throw new RangeError(`axis ${axis} must be in [0,1], got ${value}`);
    }
    total += SCORE_WEIGHTS[axis] * value;
  }
  return total;
}
