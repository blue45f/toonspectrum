import {
  parseStudioDeterministicJson,
  studioDeterministicContentId,
  studioDeterministicJson,
} from "./studio-deterministic-serialization";

export const STUDIO_ASSET_FAMILY_SCHEMA_VERSION = 1 as const;

export type StudioAssetFamilyKind =
  | "character-reference"
  | "background"
  | "bubble"
  | "brush"
  | "three-d-capture"
  | "export-rendition";

export interface StudioAssetRenditionMetadata {
  readonly crop?: readonly [number, number, number, number];
  readonly width?: number;
  readonly height?: number;
  readonly colorSpace?: string;
  readonly format?: string;
  readonly locale?: string;
  readonly platform?: string;
}

export interface StudioAssetRevision {
  readonly id: string;
  readonly familyId: string;
  readonly contentHash: string;
  readonly metadataHash: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly createdAtMs: number;
  readonly license: string;
  readonly generatorProvenance?: Readonly<Record<string, string | number | boolean>>;
  readonly rendition?: StudioAssetRenditionMetadata;
}

export interface StudioAssetVariant {
  readonly id: string;
  readonly familyId: string;
  readonly name: string;
  readonly revisionId: string;
  readonly rendition?: StudioAssetRenditionMetadata;
}

export interface StudioAssetFamily {
  readonly schemaVersion: typeof STUDIO_ASSET_FAMILY_SCHEMA_VERSION;
  readonly id: string;
  readonly kind: StudioAssetFamilyKind;
  readonly name: string;
  readonly defaultRevisionId: string;
  readonly revisions: readonly StudioAssetRevision[];
  readonly variants: readonly StudioAssetVariant[];
}

export interface StudioExactAssetReference {
  readonly familyId: string;
  readonly revisionId: string;
  readonly variantId?: string;
  readonly contentHash: string;
}

function boundedText(value: string, field: string, max = 240): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new TypeError(`${field} is invalid.`);
  return normalized;
}

function validateRendition(metadata: StudioAssetRenditionMetadata | undefined): void {
  if (!metadata) return;
  if (metadata.width !== undefined && (!Number.isSafeInteger(metadata.width) || metadata.width < 1 || metadata.width > 100_000)) {
    throw new RangeError("rendition width is invalid.");
  }
  if (metadata.height !== undefined && (!Number.isSafeInteger(metadata.height) || metadata.height < 1 || metadata.height > 100_000)) {
    throw new RangeError("rendition height is invalid.");
  }
  if (metadata.crop) {
    if (metadata.crop.length !== 4 || metadata.crop.some((value) => !Number.isFinite(value))) {
      throw new TypeError("rendition crop is invalid.");
    }
  }
}

export function validateStudioAssetFamily(family: StudioAssetFamily): StudioAssetFamily {
  if (family.schemaVersion !== STUDIO_ASSET_FAMILY_SCHEMA_VERSION) throw new TypeError("unsupported asset family version.");
  boundedText(family.id, "family.id");
  boundedText(family.name, "family.name");
  if (family.revisions.length < 1 || family.revisions.length > 10_000) throw new RangeError("asset revision count is invalid.");
  const revisions = new Map<string, StudioAssetRevision>();
  for (const revision of family.revisions) {
    boundedText(revision.id, "revision.id");
    if (revision.familyId !== family.id) throw new TypeError("revision family identity does not match.");
    if (revisions.has(revision.id)) throw new TypeError(`duplicate asset revision: ${revision.id}`);
    if (!revision.contentHash.trim() || !revision.metadataHash.trim()) throw new TypeError("revision hashes are required.");
    if (!Number.isSafeInteger(revision.byteLength) || revision.byteLength < 0) throw new RangeError("revision byte length is invalid.");
    validateRendition(revision.rendition);
    const expectedMetadataHash = studioDeterministicContentId({
      mimeType: revision.mimeType,
      byteLength: revision.byteLength,
      license: revision.license,
      generatorProvenance: revision.generatorProvenance,
      rendition: revision.rendition,
    });
    if (revision.metadataHash !== expectedMetadataHash) throw new TypeError(`revision metadata hash mismatch: ${revision.id}`);
    revisions.set(revision.id, revision);
  }
  if (!revisions.has(family.defaultRevisionId)) throw new TypeError("default revision does not exist.");
  const variantIds = new Set<string>();
  const variantNames = new Set<string>();
  for (const variant of family.variants) {
    boundedText(variant.id, "variant.id");
    const name = boundedText(variant.name, "variant.name").toLocaleLowerCase();
    if (variant.familyId !== family.id) throw new TypeError("variant family identity does not match.");
    if (!revisions.has(variant.revisionId)) throw new TypeError(`variant revision is missing: ${variant.revisionId}`);
    if (variantIds.has(variant.id) || variantNames.has(name)) throw new TypeError("variant ids and names must be unique.");
    validateRendition(variant.rendition);
    variantIds.add(variant.id);
    variantNames.add(name);
  }
  return family;
}

export function createStudioAssetRevision(input: Omit<StudioAssetRevision, "metadataHash">): StudioAssetRevision {
  validateRendition(input.rendition);
  return Object.freeze({
    ...input,
    id: boundedText(input.id, "revision.id"),
    familyId: boundedText(input.familyId, "revision.familyId"),
    contentHash: boundedText(input.contentHash, "revision.contentHash", 128),
    metadataHash: studioDeterministicContentId({
      mimeType: input.mimeType,
      byteLength: input.byteLength,
      license: input.license,
      generatorProvenance: input.generatorProvenance,
      rendition: input.rendition,
    }),
  });
}

export function resolveStudioExactAssetReference(
  family: StudioAssetFamily,
  options: { readonly variantId?: string; readonly revisionId?: string } = {},
): StudioExactAssetReference {
  validateStudioAssetFamily(family);
  const variant = options.variantId
    ? family.variants.find((item) => item.id === options.variantId)
    : undefined;
  if (options.variantId && !variant) throw new TypeError("asset variant does not exist.");
  const revisionId = options.revisionId ?? variant?.revisionId ?? family.defaultRevisionId;
  const revision = family.revisions.find((item) => item.id === revisionId);
  if (!revision) throw new TypeError("asset revision does not exist.");
  return Object.freeze({
    familyId: family.id,
    revisionId: revision.id,
    ...(variant ? { variantId: variant.id } : {}),
    contentHash: revision.contentHash,
  });
}

export function setStudioAssetDefaultRevision(
  family: StudioAssetFamily,
  revisionId: string,
): StudioAssetFamily {
  validateStudioAssetFamily(family);
  if (!family.revisions.some((revision) => revision.id === revisionId)) throw new TypeError("new default revision is missing.");
  const next = Object.freeze({ ...family, defaultRevisionId: revisionId });
  validateStudioAssetFamily(next);
  return next;
}

export function appendStudioAssetRevision(
  family: StudioAssetFamily,
  revision: StudioAssetRevision,
  options: { readonly makeDefault?: boolean; readonly variant?: StudioAssetVariant } = {},
): StudioAssetFamily {
  validateStudioAssetFamily(family);
  const next = Object.freeze({
    ...family,
    revisions: Object.freeze([...family.revisions, revision]),
    variants: Object.freeze(options.variant ? [...family.variants, options.variant] : [...family.variants]),
    defaultRevisionId: options.makeDefault ? revision.id : family.defaultRevisionId,
  });
  validateStudioAssetFamily(next);
  return next;
}

export interface StudioMissingAssetResolution {
  readonly status: "available" | "missing" | "hash-mismatch";
  readonly reference: StudioExactAssetReference;
  readonly candidateRevisionIds: readonly string[];
}

export function resolveStudioMissingAsset(
  family: StudioAssetFamily | undefined,
  reference: StudioExactAssetReference,
): StudioMissingAssetResolution {
  if (!family || family.id !== reference.familyId) {
    return Object.freeze({ status: "missing", reference, candidateRevisionIds: Object.freeze([]) });
  }
  validateStudioAssetFamily(family);
  const exact = family.revisions.find((revision) => revision.id === reference.revisionId);
  if (!exact) {
    return Object.freeze({
      status: "missing",
      reference,
      candidateRevisionIds: Object.freeze(
        family.revisions.filter((revision) => revision.contentHash === reference.contentHash).map((revision) => revision.id),
      ),
    });
  }
  return Object.freeze({
    status: exact.contentHash === reference.contentHash ? "available" : "hash-mismatch",
    reference,
    candidateRevisionIds: Object.freeze([]),
  });
}

export type StudioAssetBatchStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface StudioAssetBatchItem {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly variables: Readonly<Record<string, string>>;
  readonly status: StudioAssetBatchStatus;
  readonly attempts: number;
  readonly outputReference?: StudioExactAssetReference;
  readonly errorCode?: string;
}

export interface StudioAssetBatchQueue {
  readonly id: string;
  readonly concurrency: number;
  readonly items: readonly StudioAssetBatchItem[];
  readonly paused: boolean;
}

export function createStudioAssetBatchQueue(input: {
  readonly id: string;
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly concurrency?: number;
}): StudioAssetBatchQueue {
  if (input.rows.length < 1 || input.rows.length > 1_000) throw new RangeError("asset batch supports 1-1000 rows.");
  const concurrency = Math.max(1, Math.min(8, Math.floor(input.concurrency ?? 3)));
  const seen = new Set<string>();
  const items = input.rows.map((variables, index) => {
    const idempotencyKey = studioDeterministicContentId({ queue: input.id, variables });
    if (seen.has(idempotencyKey)) throw new TypeError(`duplicate asset batch row: ${index}`);
    seen.add(idempotencyKey);
    return Object.freeze({
      id: `${input.id}:${index + 1}`,
      idempotencyKey,
      variables: Object.freeze({ ...variables }),
      status: "queued" as const,
      attempts: 0,
    });
  });
  return Object.freeze({ id: boundedText(input.id, "queue.id"), concurrency, items: Object.freeze(items), paused: false });
}

export function claimStudioAssetBatchItems(
  queue: StudioAssetBatchQueue,
): { readonly queue: StudioAssetBatchQueue; readonly claimed: readonly StudioAssetBatchItem[] } {
  if (queue.paused) return Object.freeze({ queue, claimed: Object.freeze([]) });
  const running = queue.items.filter((item) => item.status === "running").length;
  const capacity = Math.max(0, queue.concurrency - running);
  const ids = new Set(queue.items.filter((item) => item.status === "queued").slice(0, capacity).map((item) => item.id));
  const claimed: StudioAssetBatchItem[] = [];
  const items = queue.items.map((item) => {
    if (!ids.has(item.id)) return item;
    const next = Object.freeze({ ...item, status: "running" as const, attempts: item.attempts + 1 });
    claimed.push(next);
    return next;
  });
  return Object.freeze({ queue: Object.freeze({ ...queue, items: Object.freeze(items) }), claimed: Object.freeze(claimed) });
}

export function settleStudioAssetBatchItem(
  queue: StudioAssetBatchQueue,
  itemId: string,
  outcome:
    | { readonly status: "completed"; readonly outputReference: StudioExactAssetReference }
    | { readonly status: "failed"; readonly errorCode: string; readonly retryable: boolean },
): StudioAssetBatchQueue {
  const items = queue.items.map((item) => {
    if (item.id !== itemId) return item;
    if (item.status !== "running") throw new Error("only running batch items can settle.");
    if (outcome.status === "completed") return Object.freeze({ ...item, status: "completed" as const, outputReference: outcome.outputReference });
    return Object.freeze({
      ...item,
      status: outcome.retryable && item.attempts < 3 ? ("queued" as const) : ("failed" as const),
      errorCode: boundedText(outcome.errorCode, "errorCode", 120),
    });
  });
  return Object.freeze({ ...queue, items: Object.freeze(items) });
}

export function cancelStudioAssetBatchQueue(queue: StudioAssetBatchQueue): StudioAssetBatchQueue {
  return Object.freeze({
    ...queue,
    paused: true,
    items: Object.freeze(
      queue.items.map((item) =>
        item.status === "queued" || item.status === "running"
          ? Object.freeze({ ...item, status: "cancelled" as const })
          : item,
      ),
    ),
  });
}

export function planStudioAssetVirtualWindow(input: {
  readonly itemCount: number;
  readonly scrollTop: number;
  readonly viewportHeight: number;
  readonly rowHeight: number;
  readonly columnCount: number;
  readonly overscanRows?: number;
}): readonly [number, number] {
  if (input.rowHeight <= 0 || input.columnCount < 1) throw new RangeError("asset virtual grid dimensions are invalid.");
  const rows = Math.ceil(input.itemCount / input.columnCount);
  const overscan = Math.max(0, Math.floor(input.overscanRows ?? 3));
  const startRow = Math.max(0, Math.floor(input.scrollTop / input.rowHeight) - overscan);
  const endRow = Math.min(rows, Math.ceil((input.scrollTop + input.viewportHeight) / input.rowHeight) + overscan);
  return Object.freeze([startRow * input.columnCount, Math.min(input.itemCount, endRow * input.columnCount)]);
}

export function serializeStudioAssetFamily(family: StudioAssetFamily): string {
  validateStudioAssetFamily(family);
  return studioDeterministicJson(family);
}

export function restoreStudioAssetFamily(serialized: string): StudioAssetFamily {
  const family = parseStudioDeterministicJson<StudioAssetFamily>(serialized, 4_000_000);
  return validateStudioAssetFamily(family);
}
