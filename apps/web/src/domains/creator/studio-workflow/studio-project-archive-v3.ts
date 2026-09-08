import { compareCodeUnitStrings } from "@/shared/lib/compare-code-unit-strings";

import {
  createEmptyStudioIdentityIndex,
  validateStudioIdentityIndex,
  type StudioIdentityIndexV1,
} from "../studio-foundation/studio-semantic-identity";
import {
  validateStudioVersionCoordinates,
  type StudioVersionCoordinates,
} from "../studio-foundation/studio-version-coordinates";

import type {
  StudioProjectPublishPackSnapshot,
  StudioProjectSnapshot,
} from "../studio-project-snapshot";
import { createSha256Portable } from "../studio-sha256";

import {
  migrateStudioCharacterBibleV1ToV2,
  validateStudioCharacterBibleV2,
  type StudioCharacterBibleV2,
} from "./studio-character-bible-v2";
import {
  validateStudioAssetReferenceV2,
  type StudioAssetReferenceV2,
} from "./studio-asset-reference-v2";

export const STUDIO_PROJECT_ARCHIVE_VERSION = 3 as const;

export const STUDIO_PROJECT_ARCHIVE_SECTION_KEYS = [
  "metadata",
  "content",
  "story",
  "bible",
  "identity",
  "provenance",
  "assets",
  "publish-draft",
  "operations",
  "local-drafts",
] as const;

export type StudioProjectArchiveSectionKey =
  (typeof STUDIO_PROJECT_ARCHIVE_SECTION_KEYS)[number];

export interface StudioProjectArchiveMigrationReceiptV1 {
  readonly fromVersion: number;
  readonly toVersion: typeof STUDIO_PROJECT_ARCHIVE_VERSION;
  readonly migratedAt: string;
  readonly migrationId: string;
  readonly warnings: readonly string[];
}

export interface StudioProjectArchiveManifestV3 {
  readonly archiveId: string;
  readonly workScope: string;
  readonly createdAt: string;
  readonly sourceV2SavedAt: string | null;
  readonly sourceCoordinates: StudioVersionCoordinates;
  readonly contentDigest: string;
  readonly sectionDigests: Readonly<Record<StudioProjectArchiveSectionKey, string>>;
  readonly schemaVersions: Readonly<Record<string, number>>;
  readonly migrationReceipts: readonly StudioProjectArchiveMigrationReceiptV1[];
}

export interface StudioProjectArchiveV3 {
  readonly version: typeof STUDIO_PROJECT_ARCHIVE_VERSION;
  readonly manifest: StudioProjectArchiveManifestV3;

  readonly metadata: {
    readonly title: string;
    readonly description: string;
    readonly tagsText: string;
    readonly linkedTitleId: string | null;
    readonly linkedSeriesId: string | null;
    readonly linkedChallengeId: string | null;
  };

  readonly content: {
    readonly pagesList: StudioProjectSnapshot["pagesList"];
    readonly master: StudioProjectSnapshot["master"];
    readonly webtoonTheme: StudioProjectSnapshot["webtoonTheme"];
    readonly panelGutter: number;
  };

  readonly story: {
    readonly writerRoom: StudioProjectSnapshot["writerRoom"];
  };

  readonly bible: {
    readonly characterBible: StudioCharacterBibleV2;
  };

  readonly identity: {
    readonly index: StudioIdentityIndexV1;
  };

  readonly provenance: {
    readonly ai: StudioProjectSnapshot["aiProvenance"];
    readonly imageReferences: StudioProjectSnapshot["aiImageReferences"];
    readonly referenceBoard: StudioProjectSnapshot["referenceBoard"];
  };

  readonly assets: {
    readonly manifestVersion: 1;
    readonly revisions: readonly StudioAssetReferenceV2[];
    /** Existing v2 page elements may still contain embedded legacy source strings. */
    readonly legacyEmbeddedReferencesPresent: boolean;
  };

  readonly publishDraft: {
    readonly settings: StudioProjectPublishPackSnapshot;
  };

  readonly operations: {
    readonly releaseSchedule: StudioProjectSnapshot["releaseSchedule"];
    readonly publicationAnalytics: StudioProjectSnapshot["publicationAnalytics"];
  };

  /** Device-local comments are preserved for recovery but are not server review authority. */
  readonly localDrafts: {
    readonly comments: StudioProjectSnapshot["comments"];
  };

  /** Read-only compatibility payload used only when exporting the archive back to v2. */
  readonly compatibility: {
    readonly characterBibleV1: StudioProjectSnapshot["characterBible"];
  };
}

export interface StudioProjectWorkspaceStateV1 {
  readonly version: 1;
  readonly workScope: string;
  readonly currentPageId: string;
  readonly selectedElementIds: readonly string[];
  readonly primarySelectionId: string | null;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly activeTool: string | null;
  readonly openInspectorSection: string | null;
  readonly updatedAt: string;
}

export interface StudioProjectArchiveMigrationBundleV3 {
  readonly archive: StudioProjectArchiveV3;
  readonly workspace: StudioProjectWorkspaceStateV1;
}

export type StudioProjectArchiveIssueCode =
  | "invalid-archive"
  | "invalid-version"
  | "invalid-id"
  | "invalid-timestamp"
  | "missing-content-digest"
  | "missing-section-digest"
  | "content-digest-mismatch"
  | "section-digest-mismatch"
  | "invalid-version-coordinates"
  | "invalid-character-bible"
  | "invalid-identity-index"
  | "invalid-asset-reference"
  | "invalid-workspace"
  | "workspace-inside-content";

export interface StudioProjectArchiveIssue {
  readonly code: StudioProjectArchiveIssueCode;
  readonly path: string;
  readonly message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,239}$/u;
const SECTION_PROPERTIES = {
  metadata: "metadata",
  content: "content",
  story: "story",
  bible: "bible",
  identity: "identity",
  provenance: "provenance",
  assets: "assets",
  "publish-draft": "publishDraft",
  operations: "operations",
  "local-drafts": "localDrafts",
} as const satisfies Record<StudioProjectArchiveSectionKey, keyof StudioProjectArchiveV3>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize once through JSON so Dates, toJSON, undefined and non-finite values match storage. */
function normalizeArchive(archive: StudioProjectArchiveV3): StudioProjectArchiveV3 {
  const serialized = JSON.stringify(archive);
  if (serialized === undefined) throw new TypeError("Studio archive is not JSON serializable.");
  const normalized: unknown = JSON.parse(serialized);
  if (
    !isRecord(normalized)
    || !isRecord(normalized.manifest)
    || !isRecord(normalized.manifest.sectionDigests)
    || !isRecord(normalized.compatibility)
    || "workspace" in normalized
  ) throw new TypeError("Studio archive structure is invalid.");
  for (const property of Object.values(SECTION_PROPERTIES)) {
    if (!isRecord(normalized[property])) {
      throw new TypeError(`Studio archive section is invalid: ${property}`);
    }
  }
  const result = normalized as unknown as StudioProjectArchiveV3;
  if (
    !Array.isArray(result.content.pagesList)
    || !Array.isArray(result.assets.revisions)
    || result.assets.manifestVersion !== 1
    || typeof result.metadata.title !== "string"
    || typeof result.metadata.description !== "string"
    || typeof result.metadata.tagsText !== "string"
    || typeof result.content.panelGutter !== "number"
    || !Number.isFinite(result.content.panelGutter)
  ) throw new TypeError("Studio archive section fields are invalid.");
  return result;
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (isRecord(value)) {
    return Object.fromEntries(Object.keys(value).sort(compareCodeUnitStrings).map((key) => [
      key,
      canonicalJsonValue(value[key]),
    ]));
  }
  return value;
}

function digestJsonValue(value: unknown): string {
  const hasher = createSha256Portable();
  hasher.update(new TextEncoder().encode(JSON.stringify(canonicalJsonValue(value))));
  return `sha256:${hasher.finalizeHex()}`;
}

/** The root binds all persisted payload, including v2 compatibility, but never external workspace. */
function computeArchiveDigests(archive: StudioProjectArchiveV3): Pick<
  StudioProjectArchiveManifestV3, "contentDigest" | "sectionDigests"
> {
  const normalized = normalizeArchive(archive);
  const sectionDigests = Object.fromEntries(STUDIO_PROJECT_ARCHIVE_SECTION_KEYS.map((key) => [
    key,
    digestJsonValue(normalized[SECTION_PROPERTIES[key]]),
  ])) as Record<StudioProjectArchiveSectionKey, string>;
  const manifest: Record<string, unknown> = { ...normalized.manifest };
  delete manifest.contentDigest;
  delete manifest.sectionDigests;
  return {
    sectionDigests,
    contentDigest: digestJsonValue({ ...normalized, manifest }),
  };
}

function validTimestamp(value: string): boolean {
  if (!Number.isFinite(Date.parse(value))) return false;
  try {
    return new Date(value).toISOString() === value;
  } catch {
    return false;
  }
}

function nullableId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}

function validDigest(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[0-9a-f]{64}$/u.test(value);
}

function validateWorkspaceState(
  workspace: StudioProjectWorkspaceStateV1,
): readonly StudioProjectArchiveIssue[] {
  const issues: StudioProjectArchiveIssue[] = [];
  if (
    workspace.version !== 1
    || !SAFE_ID.test(workspace.workScope)
    || !SAFE_ID.test(workspace.currentPageId)
    || !validTimestamp(workspace.updatedAt)
    || !Number.isFinite(workspace.zoom)
    || workspace.zoom <= 0
    || !Number.isFinite(workspace.panX)
    || !Number.isFinite(workspace.panY)
  ) {
    issues.push({
      code: "invalid-workspace",
      path: "workspace",
      message: "Studio workspace state is invalid.",
    });
  }
  return issues;
}

export function migrateStudioProjectSnapshotV2ToArchiveV3(input: {
  readonly snapshot: StudioProjectSnapshot;
  readonly archiveId: string;
  readonly workScope: string;
  readonly createdAt: string;
  readonly sourceCoordinates: StudioVersionCoordinates;
  readonly contentDigest?: string;
  readonly sectionDigests?: Readonly<Record<StudioProjectArchiveSectionKey, string>>;
  readonly identityIndex?: StudioIdentityIndexV1;
  readonly assetRevisions?: readonly StudioAssetReferenceV2[];
  readonly selectedElementIds?: readonly string[];
  readonly primarySelectionId?: string | null;
  readonly zoom?: number;
  readonly panX?: number;
  readonly panY?: number;
  readonly activeTool?: string | null;
  readonly openInspectorSection?: string | null;
}): StudioProjectArchiveMigrationBundleV3 {
  if (
    input.snapshot.version !== 2
    || !SAFE_ID.test(input.archiveId)
    || !SAFE_ID.test(input.workScope)
    || !validTimestamp(input.createdAt)
    || (input.contentDigest !== undefined && !validDigest(input.contentDigest))
  ) {
    throw new Error("Studio archive v3 migration requires valid, pinned source metadata.");
  }
  const identityIndex = input.identityIndex
    ?? createEmptyStudioIdentityIndex(input.workScope);
  if (identityIndex.workScope !== input.workScope) {
    throw new Error("Studio archive identity index belongs to another work scope.");
  }
  const sectionDigests = Object.fromEntries(
    STUDIO_PROJECT_ARCHIVE_SECTION_KEYS.map((key) => [key, ""]),
  ) as Record<StudioProjectArchiveSectionKey, string>;
  for (const key of STUDIO_PROJECT_ARCHIVE_SECTION_KEYS) {
    if (input.sectionDigests !== undefined && !validDigest(input.sectionDigests[key])) {
      throw new Error(`Studio archive section digest is missing: ${key}`);
    }
  }
  const assetRevisions = [...(input.assetRevisions ?? [])];
  const characterBible = migrateStudioCharacterBibleV1ToV2(
    input.snapshot.characterBible,
    {
      createdAt: input.createdAt,
      changeReason: "StudioProjectSnapshot v2에서 Archive v3로 승격",
    },
  );
  const selectedElementIds = [...new Set(input.selectedElementIds ?? [])];
  const primarySelectionId = input.primarySelectionId ?? null;
  if (primarySelectionId !== null && !selectedElementIds.includes(primarySelectionId)) {
    throw new Error("Primary selection must belong to the workspace selection set.");
  }

  const unsealedArchive: StudioProjectArchiveV3 = {
    version: STUDIO_PROJECT_ARCHIVE_VERSION,
    manifest: {
      archiveId: input.archiveId,
      workScope: input.workScope,
      createdAt: input.createdAt,
      sourceV2SavedAt: validTimestamp(input.snapshot.savedAt)
        ? input.snapshot.savedAt
        : null,
      sourceCoordinates: input.sourceCoordinates,
      contentDigest: "",
      sectionDigests,
      schemaVersions: {
        archive: STUDIO_PROJECT_ARCHIVE_VERSION,
        characterBible: characterBible.version,
        identityIndex: identityIndex.version,
        assetManifest: 1,
        workspace: 1,
      },
      migrationReceipts: [{
        fromVersion: 2,
        toVersion: STUDIO_PROJECT_ARCHIVE_VERSION,
        migratedAt: input.createdAt,
        migrationId: "studio-project-snapshot-v2-to-archive-v3",
        warnings: assetRevisions.length === 0
          ? ["v2 요소의 기존 바이너리 참조는 추후 AssetRef v2 스캐너가 승격해야 합니다."]
          : [],
      }],
    },
    metadata: {
      title: input.snapshot.title,
      description: input.snapshot.description,
      tagsText: input.snapshot.tagsText,
      linkedTitleId: nullableId(input.snapshot.linkedTitleId),
      linkedSeriesId: nullableId(input.snapshot.linkedSeriesId),
      linkedChallengeId: nullableId(input.snapshot.linkedChallengeId),
    },
    content: {
      pagesList: input.snapshot.pagesList,
      master: input.snapshot.master,
      webtoonTheme: input.snapshot.webtoonTheme,
      panelGutter: input.snapshot.panelGutter,
    },
    story: { writerRoom: input.snapshot.writerRoom },
    bible: { characterBible },
    identity: { index: identityIndex },
    provenance: {
      ai: input.snapshot.aiProvenance,
      imageReferences: input.snapshot.aiImageReferences,
      referenceBoard: input.snapshot.referenceBoard,
    },
    assets: {
      manifestVersion: 1,
      revisions: assetRevisions,
      legacyEmbeddedReferencesPresent: assetRevisions.length === 0,
    },
    publishDraft: { settings: input.snapshot.publishPack },
    operations: {
      releaseSchedule: input.snapshot.releaseSchedule,
      publicationAnalytics: input.snapshot.publicationAnalytics,
    },
    localDrafts: { comments: input.snapshot.comments },
    compatibility: { characterBibleV1: input.snapshot.characterBible },
  };

  const computedDigests = computeArchiveDigests(unsealedArchive);
  if (input.contentDigest !== undefined && input.contentDigest !== computedDigests.contentDigest) {
    throw new Error("Studio archive content digest does not match its payload.");
  }
  for (const key of STUDIO_PROJECT_ARCHIVE_SECTION_KEYS) {
    if (input.sectionDigests !== undefined && input.sectionDigests[key] !== computedDigests.sectionDigests[key]) {
      throw new Error(`Studio archive section digest does not match its payload: ${key}`);
    }
  }
  const archive: StudioProjectArchiveV3 = {
    ...unsealedArchive,
    manifest: { ...unsealedArchive.manifest, ...computedDigests },
  };

  const workspace: StudioProjectWorkspaceStateV1 = {
    version: 1,
    workScope: input.workScope,
    currentPageId: input.snapshot.currentPageId,
    selectedElementIds,
    primarySelectionId,
    zoom: input.zoom ?? 1,
    panX: input.panX ?? 0,
    panY: input.panY ?? 0,
    activeTool: input.activeTool ?? null,
    openInspectorSection: input.openInspectorSection ?? null,
    updatedAt: input.createdAt,
  };

  const issues = [
    ...validateStudioProjectArchiveV3(archive),
    ...validateWorkspaceState(workspace),
  ];
  if (issues.length > 0) {
    throw new Error(`Studio archive v3 migration failed: ${issues[0].message}`);
  }
  return { archive, workspace };
}

export function projectStudioArchiveV3ToV2Snapshot(input: {
  readonly archive: StudioProjectArchiveV3;
  readonly workspace: StudioProjectWorkspaceStateV1;
  readonly savedAt?: string;
}): StudioProjectSnapshot {
  const archive = normalizeArchive(input.archive);
  const issues = [
    ...validateStudioProjectArchiveV3(archive),
    ...validateWorkspaceState(input.workspace),
  ];
  if (issues.length > 0) {
    throw new Error(`Cannot project an invalid Studio archive: ${issues[0].message}`);
  }
  if (input.workspace.workScope !== archive.manifest.workScope) {
    throw new Error("Studio archive and workspace scopes differ.");
  }
  const savedAt = input.savedAt
    ?? archive.manifest.sourceV2SavedAt
    ?? archive.manifest.createdAt;
  if (!validTimestamp(savedAt)) {
    throw new Error("Studio v2 projection requires a canonical savedAt timestamp.");
  }
  return {
    version: 2,
    savedAt,
    title: archive.metadata.title,
    description: archive.metadata.description,
    tagsText: archive.metadata.tagsText,
    linkedTitleId: archive.metadata.linkedTitleId,
    linkedSeriesId: archive.metadata.linkedSeriesId,
    linkedChallengeId: archive.metadata.linkedChallengeId,
    pagesList: [...archive.content.pagesList],
    master: archive.content.master,
    characterBible: archive.compatibility.characterBibleV1,
    writerRoom: archive.story.writerRoom,
    aiProvenance: archive.provenance.ai,
    comments: archive.localDrafts.comments,
    releaseSchedule: archive.operations.releaseSchedule,
    publicationAnalytics: archive.operations.publicationAnalytics,
    referenceBoard: archive.provenance.referenceBoard,
    aiImageReferences: archive.provenance.imageReferences,
    currentPageId: input.workspace.currentPageId,
    webtoonTheme: archive.content.webtoonTheme,
    panelGutter: archive.content.panelGutter,
    publishPack: archive.publishDraft.settings,
  };
}

export function validateStudioProjectArchiveV3(
  archive: StudioProjectArchiveV3,
): readonly StudioProjectArchiveIssue[] {
  try {
    return validateNormalizedArchive(normalizeArchive(archive));
  } catch {
    return [{
      code: "invalid-archive",
      path: "archive",
      message: "Studio archive is malformed or cannot be serialized as JSON.",
    }];
  }
}

function validateNormalizedArchive(
  archive: StudioProjectArchiveV3,
): readonly StudioProjectArchiveIssue[] {
  const issues: StudioProjectArchiveIssue[] = [];
  if (archive.version !== STUDIO_PROJECT_ARCHIVE_VERSION) {
    issues.push({
      code: "invalid-version",
      path: "version",
      message: "Studio project archive version is invalid.",
    });
  }
  if (!SAFE_ID.test(archive.manifest.archiveId) || !SAFE_ID.test(archive.manifest.workScope)) {
    issues.push({
      code: "invalid-id",
      path: "manifest",
      message: "Studio archive or work-scope identifier is invalid.",
    });
  }
  if (!validTimestamp(archive.manifest.createdAt)) {
    issues.push({
      code: "invalid-timestamp",
      path: "manifest.createdAt",
      message: "Studio archive timestamp is invalid.",
    });
  }
  if (!validDigest(archive.manifest.contentDigest)) {
    issues.push({
      code: "missing-content-digest",
      path: "manifest.contentDigest",
      message: "Studio archive content digest is missing.",
    });
  }
  for (const key of STUDIO_PROJECT_ARCHIVE_SECTION_KEYS) {
    if (!validDigest(archive.manifest.sectionDigests[key])) {
      issues.push({
        code: "missing-section-digest",
        path: `manifest.sectionDigests.${key}`,
        message: `Studio archive section digest is missing: ${key}`,
      });
    }
  }
  const computedDigests = computeArchiveDigests(archive);
  if (validDigest(archive.manifest.contentDigest) && archive.manifest.contentDigest !== computedDigests.contentDigest) {
    issues.push({
      code: "content-digest-mismatch",
      path: "manifest.contentDigest",
      message: "Studio archive content digest does not match its payload.",
    });
  }
  for (const key of STUDIO_PROJECT_ARCHIVE_SECTION_KEYS) {
    if (
      validDigest(archive.manifest.sectionDigests[key])
      && archive.manifest.sectionDigests[key] !== computedDigests.sectionDigests[key]
    ) {
      issues.push({
        code: "section-digest-mismatch",
        path: `manifest.sectionDigests.${key}`,
        message: `Studio archive section digest does not match its payload: ${key}`,
      });
    }
  }
  for (const issue of validateStudioVersionCoordinates(archive.manifest.sourceCoordinates)) {
    issues.push({
      code: "invalid-version-coordinates",
      path: "manifest.sourceCoordinates",
      message: issue.message,
    });
  }
  for (const issue of validateStudioCharacterBibleV2(archive.bible.characterBible)) {
    issues.push({
      code: "invalid-character-bible",
      path: `bible.characterBible.${issue.characterId}`,
      message: issue.message,
    });
  }
  for (const issue of validateStudioIdentityIndex(archive.identity.index)) {
    issues.push({
      code: "invalid-identity-index",
      path: `identity.index.${issue.semanticId ?? "root"}`,
      message: issue.message,
    });
  }
  if (archive.identity.index.workScope !== archive.manifest.workScope) {
    issues.push({
      code: "invalid-identity-index",
      path: "identity.index.workScope",
      message: "Studio archive identity index belongs to another work scope.",
    });
  }
  archive.assets.revisions.forEach((reference, index) => {
    for (const issue of validateStudioAssetReferenceV2(reference)) {
      issues.push({
        code: "invalid-asset-reference",
        path: `assets.revisions[${index}]`,
        message: issue.message,
      });
    }
  });
  const contentRecord = archive.content as unknown as Record<string, unknown>;
  if (
    "currentPageId" in contentRecord
    || "selectedElementIds" in contentRecord
    || "activeTool" in contentRecord
    || "reviewCycles" in contentRecord
    || "approvals" in contentRecord
  ) {
    issues.push({
      code: "workspace-inside-content",
      path: "content",
      message: "Workspace or server workflow state cannot become archive content authority.",
    });
  }
  return issues;
}

export function serializeStudioProjectArchiveV3(
  archive: StudioProjectArchiveV3,
): string {
  const normalized = normalizeArchive(archive);
  const issues = validateStudioProjectArchiveV3(normalized);
  if (issues.length > 0) {
    throw new Error(`Cannot serialize invalid Studio archive: ${issues[0].message}`);
  }
  return JSON.stringify(normalized);
}
