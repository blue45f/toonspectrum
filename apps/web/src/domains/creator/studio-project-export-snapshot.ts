import {
  STUDIO_EXPORT_TARGET_PROFILES,
  type StudioExportDocumentSnapshot,
  type StudioExportTargetId,
} from "./studio-export-preflight";
import type { StudioProjectWorkspaceState } from "./studio-project-workspace-store";

export interface StudioExportDraftInput {
  readonly documentId: string;
  readonly target: StudioExportTargetId;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly estimatedFileSizeBytes: number;
  readonly dpi: number | null;
  readonly colorSpace: string;
  readonly minimumTextPx: number | null;
  readonly missingFontIds: readonly string[];
  readonly missingAssetIds: readonly string[];
  readonly aiGeneratedObjectIds: readonly string[];
  readonly aiDisclosurePrepared: boolean;
  readonly readingOrderComplete: boolean;
  readonly altTextCoverage: number;
  readonly captionsComplete: boolean;
  readonly editableStructurePreserved: boolean;
}

function splitHeight(height: number, maximum: number | undefined): readonly number[] {
  if (!maximum || !Number.isFinite(height) || height <= maximum) return Object.freeze([height]);
  const segments: number[] = [];
  let remaining = height;
  while (remaining > 0) {
    const segment = Math.min(maximum, remaining);
    segments.push(segment);
    remaining -= segment;
  }
  return Object.freeze(segments);
}

/** Produce useful defaults from the selected destination without asking users for technical policy values. */
export function recommendedStudioExportDraft(
  projectId: string,
  target: StudioExportTargetId,
): StudioExportDraftInput {
  const profile = STUDIO_EXPORT_TARGET_PROFILES[target];
  const defaults: Record<StudioExportTargetId, Omit<StudioExportDraftInput, "target" | "documentId">> = {
    "webtoon-platform": {
      format: "png",
      width: profile.exactWidth ?? 800,
      height: 38_400,
      estimatedFileSizeBytes: 18 * 1024 * 1024,
      dpi: null,
      colorSpace: "srgb",
      minimumTextPx: 20,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: false,
    },
    social: {
      format: "png",
      width: 1080,
      height: 1350,
      estimatedFileSizeBytes: 4 * 1024 * 1024,
      dpi: null,
      colorSpace: "srgb",
      minimumTextPx: 20,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 1,
      captionsComplete: true,
      editableStructurePreserved: false,
    },
    print: {
      format: "pdf",
      width: 2480,
      height: 3508,
      estimatedFileSizeBytes: 80 * 1024 * 1024,
      dpi: 300,
      colorSpace: "cmyk",
      minimumTextPx: 14,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: false,
    },
    "image-pdf": {
      format: "png",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 12 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 16,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: false,
    },
    editable: {
      format: "psd",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 180 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 16,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: true,
    },
    ebook: {
      format: "epub",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 48 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 18,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 1,
      captionsComplete: true,
      editableStructurePreserved: false,
    },
    video: {
      format: "mp4",
      width: 1080,
      height: 1920,
      estimatedFileSizeBytes: 120 * 1024 * 1024,
      dpi: null,
      colorSpace: "rec709",
      minimumTextPx: 24,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: true,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: true,
      editableStructurePreserved: false,
    },
    archive: {
      format: "toonstudio",
      width: 1600,
      height: 2400,
      estimatedFileSizeBytes: 400 * 1024 * 1024,
      dpi: 144,
      colorSpace: "srgb",
      minimumTextPx: 16,
      missingFontIds: [],
      missingAssetIds: [],
      aiGeneratedObjectIds: [],
      aiDisclosurePrepared: false,
      readingOrderComplete: true,
      altTextCoverage: 0,
      captionsComplete: false,
      editableStructurePreserved: true,
    },
  };
  return Object.freeze({
    documentId: `project:${projectId}`,
    target,
    ...defaults[target],
  });
}

/** Merge user-entered document facts with project-level review, localization and rights truth. */
export function createStudioProjectExportSnapshot(
  state: StudioProjectWorkspaceState,
  input: StudioExportDraftInput,
): StudioExportDocumentSnapshot {
  const profile = STUDIO_EXPORT_TARGET_PROFILES[input.target];
  const unresolvedComments = state.reviewSession.threads.filter((thread) => thread.status === "open").length;
  const localizationBlockingIssues = state.localization.reduce(
    (total, item) => total + item.blockingIssueCount,
    0,
  );
  return Object.freeze({
    documentId: input.documentId.trim(),
    format: input.format.trim().toLowerCase(),
    width: input.width,
    height: input.height,
    segmentHeights: splitHeight(input.height, profile.maxSegmentHeight),
    estimatedFileSizeBytes: input.estimatedFileSizeBytes,
    dpi: input.dpi,
    colorSpace: input.colorSpace.trim().toLowerCase(),
    minimumTextPx: input.minimumTextPx,
    missingFontIds: Object.freeze([...new Set(input.missingFontIds.map((id) => id.trim()).filter(Boolean))]),
    missingAssetIds: Object.freeze([...new Set(input.missingAssetIds.map((id) => id.trim()).filter(Boolean))]),
    rightsBlockedAssetIds: Object.freeze(state.assets.filter((asset) => asset.status === "blocked").map((asset) => asset.id)),
    rightsWarningAssetIds: Object.freeze(state.assets.filter((asset) => asset.status === "warning").map((asset) => asset.id)),
    aiGeneratedObjectIds: Object.freeze([...new Set(input.aiGeneratedObjectIds.map((id) => id.trim()).filter(Boolean))]),
    aiDisclosurePrepared: input.aiDisclosurePrepared,
    readingOrderComplete: input.readingOrderComplete,
    altTextCoverage: input.altTextCoverage,
    captionsComplete: input.captionsComplete,
    editableStructurePreserved: input.editableStructurePreserved,
    localizationBlockingIssues,
    unresolvedComments,
  });
}
