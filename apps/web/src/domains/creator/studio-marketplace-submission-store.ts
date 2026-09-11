import {
  STUDIO_MARKETPLACE_SUBMISSION_STATUSES,
  type StudioMarketplaceSubmission,
  type StudioMarketplaceSubmissionStatus,
} from "./studio-marketplace-submission";

export const STUDIO_MARKETPLACE_SUBMISSION_UPDATED_EVENT =
  "toonspectrum:studio-marketplace-submission-updated";

export interface StudioMarketplaceSubmissionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioMarketplaceSubmissionEventTarget {
  dispatchEvent(event: Event): boolean;
}

const STATUS_SET = new Set<string>(STUDIO_MARKETPLACE_SUBMISSION_STATUSES);

function requireSellerId(sellerId: string): string {
  const value = sellerId.trim();
  if (!value || value === "." || value === ".." || value.includes("\\")) {
    throw new Error("A valid seller id is required.");
  }
  return value;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function studioMarketplaceSubmissionStorageKey(sellerId: string): string {
  return `toonspectrum:studio-marketplace-submission:v1:${encodeURIComponent(requireSellerId(sellerId))}`;
}

export function createStudioMarketplaceSubmissionDraft(
  sellerId: string,
  updatedAt = new Date().toISOString(),
): StudioMarketplaceSubmission {
  const id = requireSellerId(sellerId);
  if (!validTimestamp(updatedAt)) throw new Error("A valid draft timestamp is required.");
  return Object.freeze({
    id: `submission:${id}:${Date.parse(updatedAt)}`,
    sellerId: id,
    title: "",
    description: "",
    assetType: "brush",
    status: "draft",
    version: 1,
    priceMinor: 0,
    currency: "KRW",
    licenseId: "commercial-standard",
    aiClassification: "none",
    aiProviderNames: Object.freeze([]),
    sourceReferencesCleared: false,
    compatibilityTargets: Object.freeze(["web"]),
    qualityScore: 0,
    files: Object.freeze([]),
    moderationNotes: Object.freeze([]),
    updatedAt,
  });
}

function parseSubmission(
  value: unknown,
  sellerId: string,
): StudioMarketplaceSubmission | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<StudioMarketplaceSubmission>;
  if (record.sellerId !== sellerId
    || typeof record.id !== "string"
    || typeof record.title !== "string"
    || typeof record.description !== "string"
    || typeof record.assetType !== "string"
    || typeof record.status !== "string"
    || !STATUS_SET.has(record.status)
    || !Number.isSafeInteger(record.version)
    || !Number.isSafeInteger(record.priceMinor)
    || typeof record.currency !== "string"
    || typeof record.licenseId !== "string"
    || !validTimestamp(record.updatedAt)
    || !Array.isArray(record.files)
    || !Array.isArray(record.compatibilityTargets)
    || !Array.isArray(record.moderationNotes)
    || !Array.isArray(record.aiProviderNames)) {
    return null;
  }
  return Object.freeze({
    ...record,
    status: record.status as StudioMarketplaceSubmissionStatus,
    sellerId,
    version: Number(record.version),
    priceMinor: Number(record.priceMinor),
    qualityScore: Number(record.qualityScore) || 0,
    aiClassification: record.aiClassification === "assisted" || record.aiClassification === "generated"
      ? record.aiClassification
      : "none",
    sourceReferencesCleared: record.sourceReferencesCleared === true,
    compatibilityTargets: Object.freeze(record.compatibilityTargets.filter((item): item is string => typeof item === "string")),
    aiProviderNames: Object.freeze(record.aiProviderNames.filter((item): item is string => typeof item === "string")),
    files: Object.freeze(record.files.flatMap((file) => {
      if (!file || typeof file !== "object" || Array.isArray(file)) return [];
      const item = file as StudioMarketplaceSubmission["files"][number];
      if (typeof item.path !== "string"
        || typeof item.role !== "string"
        || typeof item.format !== "string"
        || !Number.isSafeInteger(item.sizeBytes)
        || typeof item.checksum !== "string") {
        return [];
      }
      return [Object.freeze({ ...item })];
    })),
    moderationNotes: Object.freeze(record.moderationNotes.filter((item): item is string => typeof item === "string")),
    updatedAt: record.updatedAt,
  } as StudioMarketplaceSubmission);
}

export function readStudioMarketplaceSubmissionDraft(
  storage: StudioMarketplaceSubmissionStorage,
  sellerId: string,
): StudioMarketplaceSubmission | null {
  const id = requireSellerId(sellerId);
  const raw = storage.getItem(studioMarketplaceSubmissionStorageKey(id));
  if (!raw) return null;
  try {
    return parseSubmission(JSON.parse(raw) as unknown, id);
  } catch {
    return null;
  }
}

export function writeStudioMarketplaceSubmissionDraft(
  storage: StudioMarketplaceSubmissionStorage,
  submission: StudioMarketplaceSubmission,
  target?: StudioMarketplaceSubmissionEventTarget,
): StudioMarketplaceSubmission {
  const sellerId = requireSellerId(submission.sellerId);
  const next = parseSubmission(submission, sellerId);
  if (!next) throw new Error("A valid marketplace submission draft is required.");
  storage.setItem(studioMarketplaceSubmissionStorageKey(sellerId), JSON.stringify(next));
  target?.dispatchEvent(new CustomEvent(STUDIO_MARKETPLACE_SUBMISSION_UPDATED_EVENT, {
    detail: next,
  }));
  return next;
}
