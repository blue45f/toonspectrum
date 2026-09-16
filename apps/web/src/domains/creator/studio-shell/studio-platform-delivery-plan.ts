import {
  WEBTOON_PLATFORM_SPECS,
  WEBTOON_PLATFORM_SPEC_SNAPSHOT_DATE,
  WebtoonPlatformSpecValidator,
  type ComplianceGrade,
  type SpecAuditField,
  type SpecSourceConfidence,
  type WebtoonImageFormat,
  type WebtoonPlatformId,
} from "../assistant/webtoon-platform-spec-validator";
import type { StudioProjectDocumentEntry } from "../studio-project-document-store";

export const STUDIO_PLATFORM_DELIVERY_IDS = Object.freeze([
  "naver-webtoon",
  "kakao-page",
  "webtoon-canvas",
  "tapas",
  "lezhin-comics",
  "toptoon",
  "postype",
] as const satisfies readonly WebtoonPlatformId[]);

export type StudioPlatformSourceStatus = "official" | "mixed" | "unverified";
export type StudioPlatformDeliveryStatus =
  | "ready"
  | "warning"
  | "blocked"
  | "needs-document-size";

type DeliveryDocument = Pick<
  StudioProjectDocumentEntry,
  "height" | "id" | "kind" | "pageCount" | "title" | "width"
>;

export interface StudioPlatformDeliveryIssue {
  readonly field: SpecAuditField;
  readonly grade: ComplianceGrade;
  readonly message: string;
  readonly recommendation: string;
  readonly confidence: SpecSourceConfidence;
  readonly source: string;
}

export interface StudioPlatformDeliveryChecklist {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly projectId: string;
  readonly document: {
    readonly id: string;
    readonly title: string;
    readonly width: number;
    readonly height: number;
    readonly pageCount: number;
  };
  readonly platform: {
    readonly id: WebtoonPlatformId;
    readonly name: string;
    readonly snapshotDate: typeof WEBTOON_PLATFORM_SPEC_SNAPSHOT_DATE;
    readonly recommendedWidthPx: number;
    readonly allowedWidthsPx: readonly number[];
    readonly recommendedSliceHeightPx: number;
    readonly maxSliceHeightPx: number;
    readonly maxFileSizeBytes: number;
    readonly allowedFormats: readonly WebtoonImageFormat[];
    readonly sourceStatus: StudioPlatformSourceStatus;
    readonly sourceUrls: readonly string[];
  };
  readonly output: {
    readonly format: WebtoonImageFormat;
    readonly recommendedSliceCount: number;
  };
  readonly result: {
    readonly grade: ComplianceGrade;
    readonly compliant: boolean;
    readonly summary: string;
    readonly blockingIssueCount: number;
    readonly warningIssueCount: number;
    readonly sourceNoteCount: number;
  };
  readonly issues: readonly StudioPlatformDeliveryIssue[];
}

export interface StudioPlatformDeliveryPlan {
  readonly status: StudioPlatformDeliveryStatus;
  readonly platformId: WebtoonPlatformId;
  readonly platformName: string;
  readonly format: WebtoonImageFormat;
  readonly sourceStatus: StudioPlatformSourceStatus;
  readonly requiresOfficialRecheck: boolean;
  readonly recommendedSliceCount: number | null;
  readonly grade: ComplianceGrade | null;
  readonly summary: string;
  readonly issues: readonly StudioPlatformDeliveryIssue[];
  readonly checklist: StudioPlatformDeliveryChecklist | null;
}

function sourceStatus(platformId: WebtoonPlatformId): StudioPlatformSourceStatus {
  const spec = WEBTOON_PLATFORM_SPECS[platformId];
  const confidence = new Set(
    Object.values(spec.provenance).map((item) => item.confidence),
  );
  if (confidence.size === 1 && confidence.has("official")) return "official";
  if (confidence.has("unverified")) return "unverified";
  return "mixed";
}

function deliveryStatus(grade: ComplianceGrade): StudioPlatformDeliveryStatus {
  if (grade === "fail") return "blocked";
  if (grade === "warn") return "warning";
  return "ready";
}

function canonicalFormat(
  platformId: WebtoonPlatformId,
  requested: WebtoonImageFormat | undefined,
): WebtoonImageFormat {
  const allowed = WEBTOON_PLATFORM_SPECS[platformId].allowedFormats;
  return requested && allowed.includes(requested) ? requested : allowed[0] ?? "png";
}

function issueProjection(
  issues: ReturnType<WebtoonPlatformSpecValidator["audit"]>["issues"],
): readonly StudioPlatformDeliveryIssue[] {
  return Object.freeze(issues.map((issue) => Object.freeze({
    field: issue.field,
    grade: issue.grade,
    message: issue.message,
    recommendation: issue.recommendation,
    confidence: issue.provenance.confidence,
    source: issue.provenance.source,
  })));
}

export function createStudioPlatformDeliveryPlan({
  projectId,
  document,
  platformId,
  format,
  generatedAt = new Date().toISOString(),
}: {
  readonly projectId: string;
  readonly document: DeliveryDocument | null;
  readonly platformId: WebtoonPlatformId;
  readonly format?: WebtoonImageFormat;
  readonly generatedAt?: string;
}): StudioPlatformDeliveryPlan {
  if (!projectId.trim()) throw new Error("A project id is required.");
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error("A valid checklist timestamp is required.");
  }

  const spec = WEBTOON_PLATFORM_SPECS[platformId];
  const selectedFormat = canonicalFormat(platformId, format);
  const provenance = sourceStatus(platformId);
  const requiresOfficialRecheck = provenance !== "official" || spec.conflicts.length > 0;

  if (!document || document.width === null || document.height === null) {
    return Object.freeze({
      status: "needs-document-size",
      platformId,
      platformName: spec.name,
      format: selectedFormat,
      sourceStatus: provenance,
      requiresOfficialRecheck,
      recommendedSliceCount: null,
      grade: null,
      summary: "Document dimensions are required before platform validation.",
      issues: Object.freeze([]),
      checklist: null,
    });
  }

  const audit = new WebtoonPlatformSpecValidator().audit(platformId, {
    width: document.width,
    height: document.height,
    format: selectedFormat,
  });
  const issues = issueProjection(audit.issues);
  const sourceNoteCount = issues.filter((issue) => issue.field === "provenance").length;
  const checklist: StudioPlatformDeliveryChecklist = Object.freeze({
    schemaVersion: 1,
    generatedAt,
    projectId,
    document: Object.freeze({
      id: document.id,
      title: document.title,
      width: document.width,
      height: document.height,
      pageCount: document.pageCount,
    }),
    platform: Object.freeze({
      id: platformId,
      name: spec.name,
      snapshotDate: WEBTOON_PLATFORM_SPEC_SNAPSHOT_DATE,
      recommendedWidthPx: spec.recommendedWidthPx,
      allowedWidthsPx: Object.freeze([...spec.allowedWidthsPx]),
      recommendedSliceHeightPx: spec.recommendedSliceHeightPx,
      maxSliceHeightPx: spec.maxSliceHeightPx,
      maxFileSizeBytes: spec.maxFileSizeBytes,
      allowedFormats: Object.freeze([...spec.allowedFormats]),
      sourceStatus: provenance,
      sourceUrls: Object.freeze([...spec.sourceUrls]),
    }),
    output: Object.freeze({
      format: selectedFormat,
      recommendedSliceCount: audit.recommendedSliceCount,
    }),
    result: Object.freeze({
      grade: audit.overallGrade,
      compliant: audit.isCompliant,
      summary: audit.summary,
      blockingIssueCount: issues.filter((issue) => issue.grade === "fail").length,
      warningIssueCount: issues.filter((issue) => (
        issue.grade === "warn" && issue.field !== "provenance"
      )).length,
      sourceNoteCount,
    }),
    issues,
  });

  return Object.freeze({
    status: deliveryStatus(audit.overallGrade),
    platformId,
    platformName: spec.name,
    format: selectedFormat,
    sourceStatus: provenance,
    requiresOfficialRecheck,
    recommendedSliceCount: audit.recommendedSliceCount,
    grade: audit.overallGrade,
    summary: audit.summary,
    issues,
    checklist,
  });
}
