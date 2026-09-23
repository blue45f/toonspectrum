import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioReviewSummary,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";

export type ProductionManuscriptProcessType = "image" | "text" | "media" | "package";

/**
 * A creator-facing lifecycle projection. It never replaces ProjectGraph review,
 * revision, approval or release authority; it only explains the next safe action.
 */
export type ProductionManuscriptLifecyclePhase =
  | "empty"
  | "editing"
  | "submitted"
  | "in-review"
  | "changes-requested"
  | "approved"
  | "ready-to-deliver"
  | "released";

export interface ProductionManuscriptProcess {
  readonly artifact: StudioArtifactRecord;
  readonly processType: ProductionManuscriptProcessType;
  readonly label: string;
  readonly revisions: readonly StudioRevisionRecord[];
  readonly reviews: readonly StudioReviewSummary[];
  readonly headRevision: StudioRevisionRecord | null;
  readonly submissionRevision: StudioRevisionRecord | null;
  readonly reviewSnapshotRevision: StudioRevisionRecord | null;
  readonly approvedRevision: StudioRevisionRecord | null;
  readonly releaseRevision: StudioRevisionRecord | null;
  readonly latestReview: StudioReviewSummary | null;
  readonly lifecyclePhase: ProductionManuscriptLifecyclePhase;
  readonly hasUnapprovedChanges: boolean;
  readonly readyToDeliver: boolean;
  readonly openReviewCount: number;
  readonly openRequiredFeedbackCount: number;
  readonly latestActivityAt: string;
}

export type ProductionManuscriptActivityKind = "revision" | "review";

export interface ProductionManuscriptActivity {
  readonly id: string;
  readonly kind: ProductionManuscriptActivityKind;
  readonly artifactId: string;
  readonly artifactTitle: string;
  readonly title: string;
  readonly detail: string;
  readonly occurredAt: string;
}

const ARTIFACT_LABELS: Readonly<Record<StudioArtifactRecord["kind"], string>> = Object.freeze({
  story: "대본",
  storyboard: "콘티",
  "canvas-2d": "작화 원고",
  "scene-3d": "3D·배경",
  asset: "제작 에셋",
  audio: "음성·BGM",
  localization: "식자·현지화",
  "review-snapshot": "검수 스냅샷",
  deliverable: "납품본",
  release: "게시본",
});

const REVISION_LABELS: Readonly<Record<StudioRevisionRecord["kind"], string>> = Object.freeze({
  autosave: "자동 저장",
  checkpoint: "체크포인트",
  submission: "검수 제출",
  "review-snapshot": "검수 스냅샷",
  approved: "승인본",
  release: "게시본",
});

const LIFECYCLE_LABELS: Readonly<Record<ProductionManuscriptLifecyclePhase, string>> = Object.freeze({
  empty: "시작 전",
  editing: "작업 중",
  submitted: "제출됨",
  "in-review": "검수 중",
  "changes-requested": "수정 요청",
  approved: "검수 승인",
  "ready-to-deliver": "전달 준비",
  released: "게시·전달 완료",
});

export function productionManuscriptProcessType(
  kind: StudioArtifactRecord["kind"],
): ProductionManuscriptProcessType {
  if (kind === "story" || kind === "localization") return "text";
  if (kind === "audio") return "media";
  if (kind === "deliverable" || kind === "release") return "package";
  return "image";
}

export function productionManuscriptProcessLabel(
  kind: StudioArtifactRecord["kind"],
): string {
  return ARTIFACT_LABELS[kind];
}

export function productionManuscriptRevisionLabel(
  kind: StudioRevisionRecord["kind"],
): string {
  return REVISION_LABELS[kind];
}

export function productionManuscriptLifecycleLabel(
  phase: ProductionManuscriptLifecyclePhase,
): string {
  return LIFECYCLE_LABELS[phase];
}

export function productionArtifactBelongsToEpisode(
  artifact: StudioArtifactRecord,
  episodeId: string | null,
): boolean {
  if (!episodeId) return true;
  return artifact.scope.episodeId === episodeId;
}

function sortedRevisions(
  revisions: readonly StudioRevisionRecord[],
): readonly StudioRevisionRecord[] {
  return Object.freeze([...revisions].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id)));
}

function sortedReviews(
  reviews: readonly StudioReviewSummary[],
): readonly StudioReviewSummary[] {
  return Object.freeze([...reviews].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id)));
}

function latestTimestamp(
  artifact: StudioArtifactRecord,
  revisions: readonly StudioRevisionRecord[],
  reviews: readonly StudioReviewSummary[],
): string {
  return [artifact.updatedAt, ...revisions.map((entry) => entry.createdAt), ...reviews.map((entry) => entry.updatedAt)]
    .sort((left, right) => right.localeCompare(left))[0] ?? artifact.updatedAt;
}

function latestRevision(
  revisions: readonly StudioRevisionRecord[],
  kind: StudioRevisionRecord["kind"],
): StudioRevisionRecord | null {
  return revisions.find((revision) => revision.kind === kind) ?? null;
}

function newerThan(
  candidate: { readonly createdAt: string } | null,
  baseline: { readonly createdAt: string } | null,
): boolean {
  return Boolean(candidate && (!baseline || candidate.createdAt > baseline.createdAt));
}

function lifecyclePhase(input: {
  readonly headRevision: StudioRevisionRecord | null;
  readonly submissionRevision: StudioRevisionRecord | null;
  readonly reviewSnapshotRevision: StudioRevisionRecord | null;
  readonly approvedRevision: StudioRevisionRecord | null;
  readonly releaseRevision: StudioRevisionRecord | null;
  readonly latestReview: StudioReviewSummary | null;
  readonly hasUnapprovedChanges: boolean;
  readonly readyToDeliver: boolean;
}): ProductionManuscriptLifecyclePhase {
  if (!input.headRevision && !input.submissionRevision && !input.reviewSnapshotRevision
    && !input.approvedRevision && !input.releaseRevision) return "empty";

  // An active review always explains the immediate next action, even when an
  // older approved or released revision remains available for delivery.
  if (input.latestReview?.status === "changes-requested") return "changes-requested";
  if (input.latestReview?.status === "open") return "in-review";

  const releaseIsCurrent = Boolean(input.releaseRevision
    && (!input.headRevision || input.headRevision.id === input.releaseRevision.id
      || input.releaseRevision.createdAt >= input.headRevision.createdAt));
  if (releaseIsCurrent && !input.hasUnapprovedChanges) return "released";
  if (input.readyToDeliver) return "ready-to-deliver";

  const reviewApprovalIsCurrent = input.latestReview?.status === "approved"
    && (!input.headRevision || input.latestReview.updatedAt >= input.headRevision.createdAt);
  if (reviewApprovalIsCurrent) return "approved";

  const latestSubmission = newerThan(input.reviewSnapshotRevision, input.submissionRevision)
    ? input.reviewSnapshotRevision
    : input.submissionRevision;
  if (newerThan(latestSubmission, input.approvedRevision)) return "submitted";
  return "editing";
}

export function buildProductionManuscriptProcesses(params: {
  readonly project: StudioProjectRecord;
  readonly revisionsByArtifact: Readonly<Record<string, readonly StudioRevisionRecord[]>>;
  readonly reviewsByArtifact: Readonly<Record<string, readonly StudioReviewSummary[]>>;
  readonly episodeId: string | null;
}): readonly ProductionManuscriptProcess[] {
  const processes = params.project.artifacts
    .filter((artifact) => productionArtifactBelongsToEpisode(artifact, params.episodeId))
    .map((artifact): ProductionManuscriptProcess => {
      const revisions = sortedRevisions(params.revisionsByArtifact[artifact.id] ?? []);
      const reviews = sortedReviews(params.reviewsByArtifact[artifact.id] ?? []);
      const headRevision = revisions.find((revision) => revision.id === artifact.headRevisionId)
        ?? revisions[0]
        ?? null;
      const submissionRevision = latestRevision(revisions, "submission");
      const reviewSnapshotRevision = latestRevision(revisions, "review-snapshot");
      const approvedRevision = artifact.approvedRevisionId
        ? revisions.find((revision) => revision.id === artifact.approvedRevisionId) ?? null
        : latestRevision(revisions, "approved");
      const releaseRevision = latestRevision(revisions, "release");
      const latestReview = reviews[0] ?? null;
      const openReviewCount = reviews.filter((review) => review.status === "open" || review.status === "changes-requested").length;
      const openRequiredFeedbackCount = reviews.reduce((sum, review) => sum + review.openRequiredCommentCount, 0);
      const hasUnapprovedChanges = Boolean(headRevision && approvedRevision
        && headRevision.id !== approvedRevision.id
        && headRevision.kind !== "approved"
        && headRevision.kind !== "release"
        && headRevision.createdAt > approvedRevision.createdAt);
      const readyToDeliver = Boolean(approvedRevision
        && !hasUnapprovedChanges
        && openReviewCount === 0
        && openRequiredFeedbackCount === 0
        && !releaseRevision);
      const phase = lifecyclePhase({
        headRevision,
        submissionRevision,
        reviewSnapshotRevision,
        approvedRevision,
        releaseRevision,
        latestReview,
        hasUnapprovedChanges,
        readyToDeliver,
      });
      return Object.freeze({
        artifact,
        processType: productionManuscriptProcessType(artifact.kind),
        label: productionManuscriptProcessLabel(artifact.kind),
        revisions,
        reviews,
        headRevision,
        submissionRevision,
        reviewSnapshotRevision,
        approvedRevision,
        releaseRevision,
        latestReview,
        lifecyclePhase: phase,
        hasUnapprovedChanges,
        readyToDeliver,
        openReviewCount,
        openRequiredFeedbackCount,
        latestActivityAt: latestTimestamp(artifact, revisions, reviews),
      });
    })
    .sort((left, right) =>
      left.artifact.scope.episodeId?.localeCompare(right.artifact.scope.episodeId ?? "")
      || left.label.localeCompare(right.label, "ko")
      || left.artifact.title.localeCompare(right.artifact.title, "ko")
      || left.artifact.id.localeCompare(right.artifact.id));
  return Object.freeze(processes);
}

export function buildProductionManuscriptActivity(
  processes: readonly ProductionManuscriptProcess[],
  limit = 40,
): readonly ProductionManuscriptActivity[] {
  const activities = processes.flatMap((process): ProductionManuscriptActivity[] => [
    ...process.revisions.map((revision) => ({
      id: `revision:${revision.id}`,
      kind: "revision" as const,
      artifactId: process.artifact.id,
      artifactTitle: process.artifact.title,
      title: productionManuscriptRevisionLabel(revision.kind),
      detail: revision.message ?? `원고 해시 ${revision.rootGraphHash.slice(0, 12)}…`,
      occurredAt: revision.createdAt,
    })),
    ...process.reviews.map((review) => ({
      id: `review:${review.id}`,
      kind: "review" as const,
      artifactId: process.artifact.id,
      artifactTitle: process.artifact.title,
      title: review.title,
      detail: review.status === "approved"
        ? "승인 완료"
        : review.status === "changes-requested"
          ? `수정 요청 · 필수 피드백 ${review.openRequiredCommentCount}개`
          : review.status === "open"
            ? `검수 진행 중 · 필수 피드백 ${review.openRequiredCommentCount}개`
            : review.status,
      occurredAt: review.updatedAt,
    })),
  ]);
  return Object.freeze(activities
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || left.id.localeCompare(right.id))
    .slice(0, Math.max(0, limit)));
}

export function productionManuscriptMetrics(processes: readonly ProductionManuscriptProcess[]) {
  return Object.freeze({
    processCount: processes.length,
    textProcessCount: processes.filter((process) => process.processType === "text").length,
    versionCount: processes.reduce((sum, process) => sum + process.revisions.length, 0),
    approvedProcessCount: processes.filter((process) => process.approvedRevision !== null).length,
    readyToDeliverProcessCount: processes.filter((process) => process.readyToDeliver).length,
    releasedProcessCount: processes.filter((process) => process.lifecyclePhase === "released").length,
    unapprovedChangeCount: processes.filter((process) => process.hasUnapprovedChanges).length,
    openReviewCount: processes.reduce((sum, process) => sum + process.openReviewCount, 0),
    openRequiredFeedbackCount: processes.reduce((sum, process) => sum + process.openRequiredFeedbackCount, 0),
  });
}
