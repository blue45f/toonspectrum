import type { StudioExportPreflightResult } from "./studio-export-preflight";
import type { StudioRightsAuditReport } from "./studio-rights-graph";

export type StudioPublishingPackageFileRole =
  | "content"
  | "thumbnail"
  | "metadata"
  | "captions"
  | "manifest";

export interface StudioPublishingPackageFile {
  readonly path: string;
  readonly role: StudioPublishingPackageFileRole;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly locale: string | null;
}

export interface StudioPublishingLocaleState {
  readonly locale: string;
  readonly status: "complete" | "review" | "blocked";
  readonly blockingIssueCount: number;
  readonly warningIssueCount: number;
}

export interface StudioPublishingMetadata {
  readonly locale: string;
  readonly title: string;
  readonly description: string;
  readonly author: string;
  readonly contentRating: string;
  readonly tags: readonly string[];
}

export interface StudioPublishingPackageInput {
  readonly projectId: string;
  readonly documentId: string;
  readonly targetId: string;
  readonly policyVersion: string;
  readonly preflight: StudioExportPreflightResult;
  readonly rights: StudioRightsAuditReport;
  readonly locales: readonly StudioPublishingLocaleState[];
  readonly metadata: readonly StudioPublishingMetadata[];
  readonly files: readonly StudioPublishingPackageFile[];
  readonly aiDisclosureRequired: boolean;
  readonly aiDisclosureText: string | null;
  readonly additionalAttributionTexts: readonly string[];
  readonly createdAt: string;
}

export interface StudioPublishingPackageManifest {
  readonly schemaVersion: 1;
  readonly packageId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly targetId: string;
  readonly policyVersion: string;
  readonly locales: readonly string[];
  readonly metadata: readonly StudioPublishingMetadata[];
  readonly files: readonly StudioPublishingPackageFile[];
  readonly attributionTexts: readonly string[];
  readonly aiDisclosureText: string | null;
  readonly rightsEntryIds: readonly string[];
  readonly totalSizeBytes: number;
  readonly createdAt: string;
}

export interface StudioPublishingPackagePlan {
  readonly status: "ready" | "review" | "blocked";
  readonly blockingCodes: readonly string[];
  readonly warningCodes: readonly string[];
  readonly manifest: StudioPublishingPackageManifest | null;
}

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/iu;

function safePath(path: string): boolean {
  return path.trim().length > 0
    && !path.startsWith("/")
    && !path.includes("\\")
    && !path.split("/").some((part) => part === "" || part === "." || part === "..");
}

function uniqueNonEmpty(values: readonly string[]): boolean {
  return values.every((value) => value.trim().length > 0)
    && new Set(values).size === values.length;
}

function stableHash(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalMetadata(metadata: readonly StudioPublishingMetadata[]): StudioPublishingMetadata[] {
  return [...metadata]
    .map((item) => Object.freeze({ ...item, tags: Object.freeze([...item.tags].sort()) }))
    .sort((left, right) => left.locale.localeCompare(right.locale));
}

export function planStudioPublishingPackage(
  input: StudioPublishingPackageInput,
): StudioPublishingPackagePlan {
  if (
    !input.projectId.trim()
    || !input.documentId.trim()
    || !input.targetId.trim()
    || !input.policyVersion.trim()
    || !Number.isFinite(Date.parse(input.createdAt))
  ) {
    throw new Error("Publishing package identity and timestamp are required.");
  }
  const blockingCodes: string[] = [];
  const warningCodes: string[] = [];
  if (input.preflight.status === "blocked") blockingCodes.push("preflight-blocked");
  if (input.preflight.status === "warning") warningCodes.push("preflight-warning");
  if (input.rights.status === "blocked") blockingCodes.push("rights-blocked");
  if (input.rights.status === "warning") warningCodes.push("rights-warning");
  if (input.locales.length === 0 || !uniqueNonEmpty(input.locales.map((item) => item.locale))) {
    blockingCodes.push("locale-list-invalid");
  }
  for (const locale of input.locales) {
    if (!Number.isSafeInteger(locale.blockingIssueCount) || locale.blockingIssueCount < 0
      || !Number.isSafeInteger(locale.warningIssueCount) || locale.warningIssueCount < 0) {
      throw new Error("Localization issue counts must be non-negative integers.");
    }
    if (locale.status === "blocked" || locale.blockingIssueCount > 0) {
      blockingCodes.push(`locale-blocked:${locale.locale}`);
    } else if (locale.status === "review" || locale.warningIssueCount > 0) {
      warningCodes.push(`locale-review:${locale.locale}`);
    }
  }
  const localeSet = new Set(input.locales.map((item) => item.locale));
  const metadataLocales = input.metadata.map((item) => item.locale);
  if (!uniqueNonEmpty(metadataLocales)) blockingCodes.push("metadata-locale-invalid");
  for (const locale of localeSet) {
    const metadata = input.metadata.find((item) => item.locale === locale);
    if (!metadata
      || !metadata.title.trim()
      || !metadata.description.trim()
      || !metadata.author.trim()
      || !metadata.contentRating.trim()
      || !uniqueNonEmpty(metadata.tags)) {
      blockingCodes.push(`metadata-missing:${locale}`);
    }
  }
  if (input.metadata.some((item) => !localeSet.has(item.locale))) {
    warningCodes.push("metadata-unused-locale");
  }

  const filePaths = input.files.map((file) => file.path);
  if (!uniqueNonEmpty(filePaths)) blockingCodes.push("file-path-duplicate");
  for (const file of input.files) {
    if (
      !safePath(file.path)
      || !Number.isSafeInteger(file.sizeBytes)
      || file.sizeBytes <= 0
      || !CHECKSUM_PATTERN.test(file.checksum)
      || (file.locale !== null && !localeSet.has(file.locale))
    ) {
      blockingCodes.push(`file-invalid:${file.path}`);
    }
  }
  if (!input.files.some((file) => file.role === "content")) blockingCodes.push("content-file-missing");
  if (!input.files.some((file) => file.role === "thumbnail")) warningCodes.push("thumbnail-file-missing");
  if (input.aiDisclosureRequired && !input.aiDisclosureText?.trim()) {
    blockingCodes.push("ai-disclosure-missing");
  }

  const uniqueBlocking = [...new Set(blockingCodes)];
  const uniqueWarnings = [...new Set(warningCodes)];
  if (uniqueBlocking.length > 0) {
    return Object.freeze({
      status: "blocked",
      blockingCodes: Object.freeze(uniqueBlocking),
      warningCodes: Object.freeze(uniqueWarnings),
      manifest: null,
    });
  }

  const files = [...input.files]
    .map((file) => Object.freeze({ ...file }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const metadata = canonicalMetadata(input.metadata.filter((item) => localeSet.has(item.locale)));
  const locales = [...localeSet].sort();
  const attributionTexts = [...new Set([
    ...input.rights.attributionTexts,
    ...input.additionalAttributionTexts.map((value) => value.trim()).filter(Boolean),
  ])].sort();
  const identitySource = JSON.stringify({
    projectId: input.projectId,
    documentId: input.documentId,
    targetId: input.targetId,
    policyVersion: input.policyVersion,
    locales,
    files: files.map((file) => [file.path, file.checksum]),
  });
  const manifest: StudioPublishingPackageManifest = Object.freeze({
    schemaVersion: 1,
    packageId: `publish:${stableHash(identitySource)}`,
    projectId: input.projectId,
    documentId: input.documentId,
    targetId: input.targetId,
    policyVersion: input.policyVersion,
    locales: Object.freeze(locales),
    metadata: Object.freeze(metadata),
    files: Object.freeze(files),
    attributionTexts: Object.freeze(attributionTexts),
    aiDisclosureText: input.aiDisclosureText?.trim() || null,
    rightsEntryIds: Object.freeze(input.rights.entries.map((entry) => entry.id).sort()),
    totalSizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
    createdAt: input.createdAt,
  });
  return Object.freeze({
    status: uniqueWarnings.length > 0 ? "review" : "ready",
    blockingCodes: Object.freeze([]),
    warningCodes: Object.freeze(uniqueWarnings),
    manifest,
  });
}
