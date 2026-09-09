import {
  parseStudioDeterministicJson,
  studioDeterministicContentId,
  studioDeterministicJson,
} from "../studio-deterministic-serialization";

export const STUDIO_STRUCTURED_EDIT_PROPOSAL_VERSION = 1 as const;

export type StudioStructuredArtifactKind =
  | "raster-layer"
  | "vector-layer"
  | "mask"
  | "depth-map"
  | "pose"
  | "line-art"
  | "palette"
  | "metadata";

export interface StudioStructuredEditRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly maskHash?: string;
}

export interface StudioStructuredEditReference {
  readonly id: string;
  readonly role: "style" | "structure" | "character" | "palette" | "pose" | "depth" | "line-art";
  readonly sourceHash: string;
  readonly private: boolean;
  readonly externallyTransferred: boolean;
}

export interface StudioStructuredEditArtifact {
  readonly id: string;
  readonly kind: StudioStructuredArtifactKind;
  readonly name: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly width?: number;
  readonly height?: number;
  readonly contentHash: string;
  readonly sourceUri?: string;
  readonly blendMode?: string;
  readonly opacity?: number;
  readonly parentArtifactId?: string;
}

export interface StudioStructuredEditVariant {
  readonly id: string;
  readonly label: string;
  readonly artifacts: readonly StudioStructuredEditArtifact[];
  readonly previewHash: string;
  readonly contentId: string;
}

export interface StudioStructuredEditProvenance {
  readonly provider: string;
  readonly model: string;
  readonly seed: number;
  readonly promptHash: string;
  readonly sourceDocumentHash: string;
  readonly inputReferenceHashes: readonly string[];
  readonly processingRoute: "local" | "byom" | "byok" | "server";
  readonly estimatedCostCategory: string;
  readonly actualCostUnits?: number;
  readonly licenseConfirmed: boolean;
  readonly commercialUseConfirmed: boolean;
  readonly createdAtMs: number;
}

export interface StudioStructuredEditProposal {
  readonly version: typeof STUDIO_STRUCTURED_EDIT_PROPOSAL_VERSION;
  readonly id: string;
  readonly documentId: string;
  readonly documentGeneration: number;
  readonly region: StudioStructuredEditRegion;
  readonly references: readonly StudioStructuredEditReference[];
  readonly variants: readonly StudioStructuredEditVariant[];
  readonly provenance: StudioStructuredEditProvenance;
  readonly expiresAtMs?: number;
}

export interface StudioStructuredEditLimits {
  readonly maxVariants: number;
  readonly maxArtifactsPerVariant: number;
  readonly maxArtifactBytes: number;
  readonly maxTotalBytes: number;
  readonly maxPixelsPerArtifact: number;
}

export const DEFAULT_STUDIO_STRUCTURED_EDIT_LIMITS: StudioStructuredEditLimits = Object.freeze({
  maxVariants: 4,
  maxArtifactsPerVariant: 32,
  maxArtifactBytes: 128 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
  maxPixelsPerArtifact: 16_384 * 16_384,
});

function text(value: unknown, field: string, max = 240): string {
  if (typeof value !== "string") throw new TypeError(`${field} must be a string.`);
  const result = value.trim();
  if (!result || result.length > max) throw new TypeError(`${field} is invalid.`);
  return result;
}

function integer(value: unknown, field: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${field} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${field} must be finite.`);
  return value;
}

function normalizeRegion(value: unknown): StudioStructuredEditRegion {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("region must be an object.");
  const raw = value as Record<string, unknown>;
  const x = finite(raw.x, "region.x");
  const y = finite(raw.y, "region.y");
  const width = finite(raw.width, "region.width");
  const height = finite(raw.height, "region.height");
  if (width <= 0 || height <= 0 || width > 1_000_000 || height > 1_000_000) {
    throw new RangeError("structured edit region has invalid dimensions.");
  }
  return Object.freeze({
    x,
    y,
    width,
    height,
    ...(raw.maskHash !== undefined ? { maskHash: text(raw.maskHash, "region.maskHash", 128) } : {}),
  });
}

function normalizeArtifact(
  value: unknown,
  limits: StudioStructuredEditLimits,
): StudioStructuredEditArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("artifact must be an object.");
  const raw = value as Record<string, unknown>;
  const allowedKinds = new Set<StudioStructuredArtifactKind>([
    "raster-layer",
    "vector-layer",
    "mask",
    "depth-map",
    "pose",
    "line-art",
    "palette",
    "metadata",
  ]);
  if (typeof raw.kind !== "string" || !allowedKinds.has(raw.kind as StudioStructuredArtifactKind)) {
    throw new TypeError("artifact kind is unsupported.");
  }
  const byteLength = integer(raw.byteLength, "artifact.byteLength", 0, limits.maxArtifactBytes);
  const width = raw.width === undefined ? undefined : integer(raw.width, "artifact.width", 1, 100_000);
  const height = raw.height === undefined ? undefined : integer(raw.height, "artifact.height", 1, 100_000);
  if ((width === undefined) !== (height === undefined)) throw new TypeError("artifact width and height must be paired.");
  if (width !== undefined && height !== undefined && width * height > limits.maxPixelsPerArtifact) {
    throw new RangeError("artifact pixel budget exceeded.");
  }
  const mimeType = text(raw.mimeType, "artifact.mimeType", 120).toLowerCase();
  const kind = raw.kind as StudioStructuredArtifactKind;
  if ((kind === "raster-layer" || kind === "mask" || kind === "depth-map" || kind === "line-art") && !mimeType.startsWith("image/")) {
    throw new TypeError(`${kind} artifact must use an image MIME type.`);
  }
  const opacity = raw.opacity === undefined ? undefined : finite(raw.opacity, "artifact.opacity");
  if (opacity !== undefined && (opacity < 0 || opacity > 1)) throw new RangeError("artifact opacity must be 0-1.");
  return Object.freeze({
    id: text(raw.id, "artifact.id"),
    kind,
    name: text(raw.name, "artifact.name", 200),
    mimeType,
    byteLength,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    contentHash: text(raw.contentHash, "artifact.contentHash", 128),
    ...(raw.sourceUri !== undefined ? { sourceUri: text(raw.sourceUri, "artifact.sourceUri", 2_048) } : {}),
    ...(raw.blendMode !== undefined ? { blendMode: text(raw.blendMode, "artifact.blendMode", 80) } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(raw.parentArtifactId !== undefined ? { parentArtifactId: text(raw.parentArtifactId, "artifact.parentArtifactId") } : {}),
  });
}

function normalizeReference(value: unknown): StudioStructuredEditReference {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("reference must be an object.");
  const raw = value as Record<string, unknown>;
  const roles = new Set(["style", "structure", "character", "palette", "pose", "depth", "line-art"]);
  if (typeof raw.role !== "string" || !roles.has(raw.role)) throw new TypeError("reference role is unsupported.");
  if (typeof raw.private !== "boolean" || typeof raw.externallyTransferred !== "boolean") {
    throw new TypeError("reference privacy flags are required.");
  }
  if (raw.private && raw.externallyTransferred && raw.consent !== true) {
    throw new Error("private references require explicit external-transfer consent.");
  }
  return Object.freeze({
    id: text(raw.id, "reference.id"),
    role: raw.role as StudioStructuredEditReference["role"],
    sourceHash: text(raw.sourceHash, "reference.sourceHash", 128),
    private: raw.private,
    externallyTransferred: raw.externallyTransferred,
  });
}

function normalizeProvenance(value: unknown): StudioStructuredEditProvenance {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("provenance must be an object.");
  const raw = value as Record<string, unknown>;
  const route = raw.processingRoute;
  if (route !== "local" && route !== "byom" && route !== "byok" && route !== "server") {
    throw new TypeError("processing route is unsupported.");
  }
  const hashes = Array.isArray(raw.inputReferenceHashes)
    ? raw.inputReferenceHashes.map((hash) => text(hash, "inputReferenceHash", 128))
    : [];
  return Object.freeze({
    provider: text(raw.provider, "provenance.provider"),
    model: text(raw.model, "provenance.model"),
    seed: integer(raw.seed, "provenance.seed", 0, 2_147_483_647),
    promptHash: text(raw.promptHash, "provenance.promptHash", 128),
    sourceDocumentHash: text(raw.sourceDocumentHash, "provenance.sourceDocumentHash", 128),
    inputReferenceHashes: Object.freeze(hashes),
    processingRoute: route,
    estimatedCostCategory: text(raw.estimatedCostCategory, "provenance.estimatedCostCategory", 80),
    ...(raw.actualCostUnits !== undefined
      ? { actualCostUnits: finite(raw.actualCostUnits, "provenance.actualCostUnits") }
      : {}),
    licenseConfirmed: raw.licenseConfirmed === true,
    commercialUseConfirmed: raw.commercialUseConfirmed === true,
    createdAtMs: integer(raw.createdAtMs, "provenance.createdAtMs"),
  });
}

export function validateStudioStructuredEditProposal(
  value: unknown,
  limits: StudioStructuredEditLimits = DEFAULT_STUDIO_STRUCTURED_EDIT_LIMITS,
): StudioStructuredEditProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("proposal must be an object.");
  const raw = value as Record<string, unknown>;
  if (raw.version !== STUDIO_STRUCTURED_EDIT_PROPOSAL_VERSION) throw new TypeError("unsupported structured edit proposal version.");
  if (!Array.isArray(raw.references)) throw new TypeError("proposal references must be an array.");
  if (!Array.isArray(raw.variants) || raw.variants.length < 1 || raw.variants.length > limits.maxVariants) {
    throw new RangeError("proposal variant count is invalid.");
  }
  const references = raw.references.map(normalizeReference);
  const referenceIds = new Set<string>();
  for (const reference of references) {
    if (referenceIds.has(reference.id)) throw new TypeError(`duplicate reference: ${reference.id}`);
    referenceIds.add(reference.id);
  }
  let totalBytes = 0;
  const variantIds = new Set<string>();
  const contentIds = new Set<string>();
  const variants = raw.variants.map((variantValue, variantIndex) => {
    if (!variantValue || typeof variantValue !== "object" || Array.isArray(variantValue)) throw new TypeError("variant must be an object.");
    const variant = variantValue as Record<string, unknown>;
    if (!Array.isArray(variant.artifacts) || variant.artifacts.length < 1 || variant.artifacts.length > limits.maxArtifactsPerVariant) {
      throw new RangeError("variant artifact count is invalid.");
    }
    const artifacts = variant.artifacts.map((artifact) => normalizeArtifact(artifact, limits));
    totalBytes += artifacts.reduce((sum, artifact) => sum + artifact.byteLength, 0);
    if (totalBytes > limits.maxTotalBytes) throw new RangeError("proposal total byte budget exceeded.");
    const artifactIds = new Set<string>();
    for (const artifact of artifacts) {
      if (artifactIds.has(artifact.id)) throw new TypeError(`duplicate artifact: ${artifact.id}`);
      artifactIds.add(artifact.id);
    }
    for (const artifact of artifacts) {
      if (artifact.parentArtifactId && !artifactIds.has(artifact.parentArtifactId)) {
        throw new TypeError(`artifact parent is missing: ${artifact.parentArtifactId}`);
      }
    }
    const id = text(variant.id, `variant ${variantIndex}.id`);
    if (variantIds.has(id)) throw new TypeError(`duplicate variant: ${id}`);
    variantIds.add(id);
    const contentId = studioDeterministicContentId(artifacts);
    if (contentIds.has(contentId)) throw new TypeError("duplicate variant content is not allowed.");
    contentIds.add(contentId);
    return Object.freeze({
      id,
      label: text(variant.label ?? `Variant ${variantIndex + 1}`, "variant.label", 120),
      artifacts: Object.freeze(artifacts),
      previewHash: text(variant.previewHash, "variant.previewHash", 128),
      contentId,
    });
  });
  const expiresAtMs = raw.expiresAtMs === undefined ? undefined : integer(raw.expiresAtMs, "expiresAtMs");
  return Object.freeze({
    version: STUDIO_STRUCTURED_EDIT_PROPOSAL_VERSION,
    id: text(raw.id, "proposal.id"),
    documentId: text(raw.documentId, "proposal.documentId"),
    documentGeneration: integer(raw.documentGeneration, "proposal.documentGeneration"),
    region: normalizeRegion(raw.region),
    references: Object.freeze(references),
    variants: Object.freeze(variants),
    provenance: normalizeProvenance(raw.provenance),
    ...(expiresAtMs !== undefined ? { expiresAtMs } : {}),
  });
}

export interface StudioStructuredEditReview {
  readonly proposal: StudioStructuredEditProposal;
  readonly variantId: string;
  readonly selectedArtifactIds: ReadonlySet<string>;
  readonly status: "reviewing" | "applied" | "rejected";
}

export function createStudioStructuredEditReview(
  proposal: StudioStructuredEditProposal,
  variantId = proposal.variants[0]?.id,
): StudioStructuredEditReview {
  const variant = proposal.variants.find((item) => item.id === variantId);
  if (!variant) throw new TypeError("selected structured edit variant is missing.");
  return Object.freeze({
    proposal,
    variantId: variant.id,
    selectedArtifactIds: new Set(variant.artifacts.map((artifact) => artifact.id)),
    status: "reviewing",
  });
}

export function selectStudioStructuredEditArtifacts(
  review: StudioStructuredEditReview,
  artifactIds: readonly string[],
): StudioStructuredEditReview {
  if (review.status !== "reviewing") return review;
  const variant = review.proposal.variants.find((item) => item.id === review.variantId);
  if (!variant) throw new TypeError("selected structured edit variant is missing.");
  const known = new Set(variant.artifacts.map((artifact) => artifact.id));
  const selected = new Set(artifactIds.filter((id) => known.has(id)));
  for (const artifact of variant.artifacts) {
    if (selected.has(artifact.id) && artifact.parentArtifactId) selected.add(artifact.parentArtifactId);
  }
  return Object.freeze({ ...review, selectedArtifactIds: selected });
}

export interface StudioStructuredEditTransaction {
  readonly id: string;
  readonly documentId: string;
  readonly baseGeneration: number;
  readonly proposalId: string;
  readonly variantId: string;
  readonly artifacts: readonly StudioStructuredEditArtifact[];
  readonly provenance: StudioStructuredEditProvenance;
  readonly contentId: string;
}

export function applyStudioStructuredEditReview(
  review: StudioStructuredEditReview,
  options: {
    readonly transactionId: string;
    readonly documentId: string;
    readonly documentGeneration: number;
    readonly activeMutation: boolean;
    readonly nowMs: number;
  },
): { readonly review: StudioStructuredEditReview; readonly transaction: StudioStructuredEditTransaction } {
  if (review.status !== "reviewing") throw new Error("structured edit is no longer reviewable.");
  if (options.activeMutation) throw new Error("structured AI edits cannot apply during an active document mutation.");
  if (options.documentId !== review.proposal.documentId || options.documentGeneration !== review.proposal.documentGeneration) {
    throw new Error("structured edit proposal is stale for the current document.");
  }
  if (review.proposal.expiresAtMs !== undefined && options.nowMs >= review.proposal.expiresAtMs) {
    throw new Error("structured edit proposal expired.");
  }
  const variant = review.proposal.variants.find((item) => item.id === review.variantId);
  if (!variant) throw new TypeError("selected structured edit variant is missing.");
  const artifacts = variant.artifacts.filter((artifact) => review.selectedArtifactIds.has(artifact.id));
  if (artifacts.length < 1) throw new Error("select at least one structured edit artifact.");
  const transaction = Object.freeze({
    id: text(options.transactionId, "transactionId"),
    documentId: options.documentId,
    baseGeneration: options.documentGeneration,
    proposalId: review.proposal.id,
    variantId: variant.id,
    artifacts: Object.freeze(artifacts),
    provenance: review.proposal.provenance,
    contentId: studioDeterministicContentId({ artifacts, provenance: review.proposal.provenance }),
  });
  return Object.freeze({
    review: Object.freeze({ ...review, status: "applied" as const }),
    transaction,
  });
}

export function rejectStudioStructuredEditReview(
  review: StudioStructuredEditReview,
): StudioStructuredEditReview {
  return review.status === "reviewing"
    ? Object.freeze({ ...review, status: "rejected" as const })
    : review;
}

export function serializeStudioStructuredEditProposal(proposal: StudioStructuredEditProposal): string {
  validateStudioStructuredEditProposal(proposal);
  return studioDeterministicJson(proposal);
}

export function restoreStudioStructuredEditProposal(serialized: string): StudioStructuredEditProposal {
  return validateStudioStructuredEditProposal(
    parseStudioDeterministicJson<unknown>(serialized, 4_000_000),
  );
}
