import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioReviewSummary,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";

export type ProductionManuscriptProcessType = "image" | "text" | "media" | "package";

export interface ProductionManuscriptProcess {
  readonly artifact: StudioArtifactRecord;
  readonly processType: ProductionManuscriptProcessType;
  readonly label: string;
  readonly revisions: readonly StudioRevisionRecord[];
  readonly reviews: readonly StudioReviewSummary[];
  readonly headRevision: StudioRevisionRecord | null;
  readonly approvedRevision: StudioRevisionRecord | null;
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
      const approvedRevision = artifact.approvedRevisionId
        ? revisions.find((revision) => revision.id === artifact.approvedRevisionId) ?? null
        : revisions.find((revision) => revision.kind === "approved" || revision.kind === "release") ?? null;
      return Object.freeze({
        artifact,
        processType: productionManuscriptProcessType(artifact.kind),
        label: productionManuscriptProcessLabel(artifact.kind),
        revisions,
        reviews,
        headRevision: revisions.find((revision) => revision.id === artifact.headRevisionId) ?? revisions[0] ?? null,
        approvedRevision,
        openReviewCount: reviews.filter((review) => review.status === "open" || review.status === "changes-requested").length,
        openRequiredFeedbackCount: reviews.reduce((sum, review) => sum + review.openRequiredCommentCount, 0),
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
    openReviewCount: processes.reduce((sum, process) => sum + process.openReviewCount, 0),
    openRequiredFeedbackCount: processes.reduce((sum, process) => sum + process.openRequiredFeedbackCount, 0),
  });
}
