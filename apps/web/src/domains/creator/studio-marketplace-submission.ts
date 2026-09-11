export const STUDIO_MARKETPLACE_SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "changes-requested",
  "approved",
  "published",
  "rejected",
  "withdrawn",
] as const;

export type StudioMarketplaceSubmissionStatus =
  (typeof STUDIO_MARKETPLACE_SUBMISSION_STATUSES)[number];
export type StudioMarketplaceFileRole =
  | "primary"
  | "preview"
  | "thumbnail"
  | "documentation"
  | "license";
export type StudioMarketplaceAiClassification = "none" | "assisted" | "generated";

export interface StudioMarketplaceSubmissionFile {
  readonly path: string;
  readonly role: StudioMarketplaceFileRole;
  readonly format: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface StudioMarketplaceSubmission {
  readonly id: string;
  readonly sellerId: string;
  readonly title: string;
  readonly description: string;
  readonly assetType: string;
  readonly status: StudioMarketplaceSubmissionStatus;
  readonly version: number;
  readonly priceMinor: number;
  readonly currency: string;
  readonly licenseId: string;
  readonly aiClassification: StudioMarketplaceAiClassification;
  readonly aiProviderNames: readonly string[];
  readonly sourceReferencesCleared: boolean;
  readonly compatibilityTargets: readonly string[];
  readonly qualityScore: number;
  readonly files: readonly StudioMarketplaceSubmissionFile[];
  readonly moderationNotes: readonly string[];
  readonly updatedAt: string;
}

export interface StudioMarketplaceSubmissionFinding {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioMarketplaceSubmissionReadiness {
  readonly status: "ready" | "review" | "blocked";
  readonly findings: readonly StudioMarketplaceSubmissionFinding[];
}

export type StudioMarketplaceSubmissionEvent =
  | { readonly type: "submit"; readonly at: string }
  | { readonly type: "request-changes"; readonly at: string; readonly note: string }
  | { readonly type: "approve"; readonly at: string }
  | { readonly type: "publish"; readonly at: string }
  | { readonly type: "reject"; readonly at: string; readonly note: string }
  | { readonly type: "withdraw"; readonly at: string };

const CHECKSUM_PATTERN = /^sha256:[0-9a-f]{64}$/iu;

function finding(
  code: string,
  severity: StudioMarketplaceSubmissionFinding["severity"],
  messageKo: string,
  messageEn: string,
): StudioMarketplaceSubmissionFinding {
  return Object.freeze({ code, severity, messageKo, messageEn });
}

function validTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function evaluateStudioMarketplaceSubmission(
  submission: StudioMarketplaceSubmission,
): StudioMarketplaceSubmissionReadiness {
  const findings: StudioMarketplaceSubmissionFinding[] = [];
  if (
    !submission.id.trim()
    || !submission.sellerId.trim()
    || !submission.title.trim()
    || !submission.description.trim()
    || !submission.assetType.trim()
    || !submission.currency.trim()
    || !submission.licenseId.trim()
    || !validTimestamp(submission.updatedAt)
  ) {
    findings.push(finding("submission-required", "error", "등록 정보가 완성되지 않았습니다.", "Submission metadata is incomplete."));
  }
  if (!Number.isSafeInteger(submission.version) || submission.version < 1) {
    findings.push(finding("version", "error", "에셋 버전이 올바르지 않습니다.", "Asset version is invalid."));
  }
  if (!Number.isSafeInteger(submission.priceMinor) || submission.priceMinor < 0) {
    findings.push(finding("price", "error", "가격이 올바르지 않습니다.", "Price is invalid."));
  }
  if (!Number.isFinite(submission.qualityScore)
    || submission.qualityScore < 0
    || submission.qualityScore > 100) {
    findings.push(finding("quality-score", "error", "품질 점수가 올바르지 않습니다.", "Quality score is invalid."));
  } else if (submission.qualityScore < 70) {
    findings.push(finding("quality-threshold", "error", "기술 품질 기준을 충족하지 못했습니다.", "The asset does not meet the technical quality threshold."));
  } else if (submission.qualityScore < 85) {
    findings.push(finding("quality-review", "warning", "일부 품질 항목을 확인하세요.", "Review the remaining quality recommendations."));
  }
  if (submission.compatibilityTargets.length === 0) {
    findings.push(finding("compatibility", "error", "지원 환경을 하나 이상 선택하세요.", "Select at least one compatibility target."));
  }
  if (new Set(submission.compatibilityTargets).size !== submission.compatibilityTargets.length) {
    findings.push(finding("compatibility-duplicate", "warning", "지원 환경이 중복되었습니다.", "Compatibility targets contain duplicates."));
  }
  const paths = submission.files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) {
    findings.push(finding("file-path-duplicate", "error", "같은 파일 경로가 두 번 포함되었습니다.", "A file path is included more than once."));
  }
  for (const file of submission.files) {
    if (
      !file.path.trim()
      || !file.format.trim()
      || !Number.isSafeInteger(file.sizeBytes)
      || file.sizeBytes <= 0
      || !CHECKSUM_PATTERN.test(file.checksum)
    ) {
      findings.push(finding("file-invalid", "error", "에셋 파일 정보가 올바르지 않습니다.", "An asset file is invalid."));
      break;
    }
  }
  if (!submission.files.some((file) => file.role === "primary")) {
    findings.push(finding("primary-file", "error", "실제 사용할 에셋 파일이 필요합니다.", "A primary asset file is required."));
  }
  if (!submission.files.some((file) => file.role === "preview" || file.role === "thumbnail")) {
    findings.push(finding("preview-file", "error", "사용 전 확인할 미리보기가 필요합니다.", "A preview or thumbnail is required."));
  }
  if (submission.aiClassification !== "none" && submission.aiProviderNames.length === 0) {
    findings.push(finding("ai-provider", "error", "AI 사용 도구 또는 모델을 표시하세요.", "Declare the AI provider or model used."));
  }
  if (!submission.sourceReferencesCleared) {
    findings.push(finding("source-rights", "error", "참조 원본의 사용 권리를 확인해야 합니다.", "Source-reference rights must be cleared."));
  }
  if (submission.moderationNotes.some((note) => !note.trim())) {
    findings.push(finding("moderation-note", "warning", "비어 있는 심사 메모가 있습니다.", "A moderation note is empty."));
  }
  const blocked = findings.some((item) => item.severity === "error");
  const warning = findings.some((item) => item.severity === "warning");
  return Object.freeze({
    status: blocked ? "blocked" : warning ? "review" : "ready",
    findings: Object.freeze(findings),
  });
}

function requireTransition(
  status: StudioMarketplaceSubmissionStatus,
  allowed: readonly StudioMarketplaceSubmissionStatus[],
  event: string,
): void {
  if (!allowed.includes(status)) {
    throw new Error(`Marketplace event ${event} is not allowed from ${status}.`);
  }
}

export function transitionStudioMarketplaceSubmission(
  submission: StudioMarketplaceSubmission,
  event: StudioMarketplaceSubmissionEvent,
): StudioMarketplaceSubmission {
  if (!validTimestamp(event.at)) throw new Error("Marketplace transitions require a valid timestamp.");
  switch (event.type) {
    case "submit": {
      requireTransition(submission.status, ["draft", "changes-requested"], event.type);
      if (evaluateStudioMarketplaceSubmission(submission).status === "blocked") {
        throw new Error("Resolve blocking submission findings before review.");
      }
      return Object.freeze({ ...submission, status: "submitted", updatedAt: event.at });
    }
    case "request-changes": {
      requireTransition(submission.status, ["submitted"], event.type);
      if (!event.note.trim()) throw new Error("A change request requires a note.");
      return Object.freeze({
        ...submission,
        status: "changes-requested",
        moderationNotes: Object.freeze([...submission.moderationNotes, event.note.trim()]),
        updatedAt: event.at,
      });
    }
    case "approve": {
      requireTransition(submission.status, ["submitted"], event.type);
      if (evaluateStudioMarketplaceSubmission(submission).status !== "ready") {
        throw new Error("Only a fully ready submission can be approved.");
      }
      return Object.freeze({ ...submission, status: "approved", updatedAt: event.at });
    }
    case "publish": {
      requireTransition(submission.status, ["approved"], event.type);
      return Object.freeze({ ...submission, status: "published", updatedAt: event.at });
    }
    case "reject": {
      requireTransition(submission.status, ["submitted"], event.type);
      if (!event.note.trim()) throw new Error("A rejection requires a note.");
      return Object.freeze({
        ...submission,
        status: "rejected",
        moderationNotes: Object.freeze([...submission.moderationNotes, event.note.trim()]),
        updatedAt: event.at,
      });
    }
    case "withdraw": {
      requireTransition(submission.status, ["draft", "submitted", "changes-requested", "approved"], event.type);
      return Object.freeze({ ...submission, status: "withdrawn", updatedAt: event.at });
    }
  }
}
