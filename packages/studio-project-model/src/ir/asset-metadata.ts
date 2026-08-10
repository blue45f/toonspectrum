import { z } from "zod";

import { blendModeIRSchema } from "./color";
import { canonicalJson, fnv1a64Hex } from "./digest";

/**
 * AssetMetadataIR (V12 §15) — the engine-compatibility card every material
 * (brush program, SVG decoration, Lottie effect, tone, tip …) carries inside
 * an AssetPackage. The metadata answers, without opening the payload:
 *
 * - what the material IS (kind / sourceFormat / version)
 * - what the current engine set MUST provide to render it faithfully
 *   (`engineRequirements` — the same capability-token vocabulary the
 *   EngineCapabilityRegistry descriptors and scene-features inventory use)
 * - where it CAME from (`provenance`, including the importer's loud-loss
 *   ledger — unmapped/warning entries are recorded, never dropped; absolute
 *   rule 9, zero silent data loss)
 * - whether the payload is INTACT (`contentDigest`, deterministic FNV-1a 64)
 * - whether it is legally usable (`license.spdx` — the same SPDX-ish tokens
 *   the provider license gate audits)
 */

export const assetKindIRSchema = z.enum([
  "brush-program",
  "brush-stamp-fragment",
  "svg-decoration",
  "lottie-effect",
  "gradient-material",
  "image-material",
  "text-style",
  "balloon-layout",
  "geometry-recipe",
  "screen-tone",
  "brush-tip",
]);
export type AssetKindIR = z.infer<typeof assetKindIRSchema>;

export const assetSourceFormatIRSchema = z.enum([
  "myb",
  "kpp",
  "abr",
  "svg",
  "lottie",
  "native",
]);
export type AssetSourceFormatIR = z.infer<typeof assetSourceFormatIRSchema>;

/**
 * Same namespacing contract as the provider descriptor `capabilitySchema`
 * (studio-engine-registry): tokens are dotted lowercase paths so ad-hoc
 * booleans cannot leak in. The IR layer validates FORM here; membership in
 * the actual engine vocabulary is validated by
 * `assertAssetCapabilitiesKnown` against a caller-supplied vocabulary.
 */
export const assetCapabilityTokenSchema = z
  .string()
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, "capability must be namespaced (a.b.c)");
export type AssetCapabilityToken = z.infer<typeof assetCapabilityTokenSchema>;

/** `fnv1a64:` + 16 lowercase hex chars — see computeAssetContentDigest. */
export const assetContentDigestSchema = z
  .string()
  .regex(/^fnv1a64:[0-9a-f]{16}$/, "digest must be fnv1a64:<16 hex chars>");
export type AssetContentDigest = z.infer<typeof assetContentDigestSchema>;

/** semver core with optional prerelease/build (marketplace dependency math). */
export const assetVersionIRSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    "version must be semver (MAJOR.MINOR.PATCH[-pre][+build])",
  );

export const assetLicenseIRSchema = z.object({
  /** SPDX-ish token, e.g. "MIT", "CC0-1.0" — audited by the license gate. */
  spdx: z.string().min(1),
  attribution: z.string().optional(),
});
export type AssetLicenseIR = z.infer<typeof assetLicenseIRSchema>;

export const assetProvenanceIRSchema = z.object({
  /** Importer identity, e.g. "studio-format-gateway/importMybBrush". */
  importer: z.string().min(1),
  /** Original file name when the import came from a file; null otherwise. */
  sourceFileName: z.string().nullable().default(null),
  /** Import wall-clock (epoch ms). */
  importedAt: z.number().int().nonnegative(),
  /** Importer warnings, verbatim — the loud half of zero-silent-loss. */
  warnings: z.array(z.string()).default([]),
  /** Source entries the importer could not map into IR — surfaced, kept. */
  unmapped: z.array(z.string()).default([]),
});
export type AssetProvenanceIR = z.infer<typeof assetProvenanceIRSchema>;

export const assetMetadataIRSchema = z.object({
  id: z.string().min(1),
  kind: assetKindIRSchema,
  name: z.string().min(1),
  version: assetVersionIRSchema,
  /**
   * Capability tokens the current engine set must collectively provide for
   * this material to render faithfully. Empty = engine-neutral material.
   */
  engineRequirements: z.array(assetCapabilityTokenSchema).default([]),
  sourceFormat: assetSourceFormatIRSchema,
  license: assetLicenseIRSchema,
  contentDigest: assetContentDigestSchema,
  createdAt: z.number().int().nonnegative(),
  provenance: assetProvenanceIRSchema,
});
export type AssetMetadataIR = z.infer<typeof assetMetadataIRSchema>;

// ---------------------------------------------------------------------------
// Content digest (deterministic, dependency-free, byte-exact)
// ---------------------------------------------------------------------------

const ASSET_DIGEST_PREFIX = "fnv1a64:";

function fnv1a64HexOfBytes(bytes: Uint8Array): string {
  // BigInt() calls (not literals) keep this file compilable under the root
  // app program's ES2017 target — same trick as ir/digest.ts.
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/**
 * Deterministic digest of the ORIGINAL payload (bytes for binary formats,
 * source text for textual ones). Same bytes always produce the same digest;
 * a UTF-8 string digests identically to its encoded bytes.
 */
export function computeAssetContentDigest(content: Uint8Array | string): string {
  const bytes =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  return ASSET_DIGEST_PREFIX + fnv1a64HexOfBytes(bytes);
}

/** Digest of a structured (JSON-serializable) value via canonicalJson. */
export function computeAssetStructuredDigest(value: unknown): string {
  return ASSET_DIGEST_PREFIX + fnv1a64Hex(canonicalJson(value));
}

// ---------------------------------------------------------------------------
// Capability vocabulary validation (reject unknown tokens loudly)
// ---------------------------------------------------------------------------

export class UnknownAssetCapabilityError extends Error {
  constructor(
    readonly assetId: string,
    readonly unknownTokens: readonly string[],
  ) {
    super(
      `asset ${assetId} requires capability token(s) outside the engine ` +
        `vocabulary: ${unknownTokens.join(", ")} — refusing to register a ` +
        "material no engine can ever be matched against",
    );
    this.name = "UnknownAssetCapabilityError";
  }
}

/**
 * Rejects metadata whose engineRequirements contain tokens the engine
 * vocabulary does not know. Unknown tokens are unmatchable forever (as
 * opposed to KNOWN tokens no currently-registered provider declares, which
 * are a renderability verdict, not a registration error).
 */
export function assertAssetCapabilitiesKnown(
  metadata: AssetMetadataIR,
  vocabulary: Iterable<string>,
): void {
  const known = vocabulary instanceof Set ? vocabulary : new Set(vocabulary);
  const unknown = metadata.engineRequirements.filter((token) => !known.has(token));
  if (unknown.length > 0) {
    throw new UnknownAssetCapabilityError(metadata.id, [...new Set(unknown)].sort());
  }
}

/** Schema parse + (optional) vocabulary membership check in one step. */
export function parseAssetMetadata(
  value: unknown,
  vocabulary?: Iterable<string>,
): AssetMetadataIR {
  const metadata = assetMetadataIRSchema.parse(value);
  if (vocabulary !== undefined) assertAssetCapabilitiesKnown(metadata, vocabulary);
  return metadata;
}

/**
 * The scene-feature half of the asset capability vocabulary: every token
 * `collectSceneFeatures` (ir/scene-features.ts) can emit. Kept in lockstep
 * with the SceneFeature type — blend tokens are derived from the blend enum
 * so a new blend mode automatically joins the vocabulary.
 */
export function sceneFeatureCapabilityVocabulary(): string[] {
  const blends = blendModeIRSchema.options
    .filter((mode) => mode !== "src-over")
    .map((mode) => `render.blend.${mode}`);
  return [
    "render.vector.fill",
    "render.vector.stroke",
    "render.vector.gradient",
    "render.vector.gradient.sweep",
    "render.text.paragraph",
    "render.group.opacity",
    "render.group.clip",
    ...blends,
  ].sort();
}
