import type { ProductionManuscriptProcess } from "./production-manuscript-model";

export type ProductionManuscriptAttentionFilter =
  | "all"
  | "required-feedback"
  | "in-review"
  | "missing-final"
  | "approved";

export type ProductionManuscriptSort = "attention" | "process" | "recent";
export type ProductionManuscriptLayout = "cards" | "matrix";

export interface ProductionManuscriptAttention {
  readonly kind: Exclude<ProductionManuscriptAttentionFilter, "all">;
  readonly label: string;
  readonly actionLabel: string;
  readonly recommendedView: "versions" | "feedback";
  readonly level: "danger" | "warning" | "neutral" | "success";
  readonly priority: number;
}

export interface ProductionManuscriptFilterCounts {
  readonly all: number;
  readonly requiredFeedback: number;
  readonly inReview: number;
  readonly missingFinal: number;
  readonly approved: number;
}

export interface ProductionManuscriptQuery {
  readonly query: string;
  readonly filter: ProductionManuscriptAttentionFilter;
  readonly sort: ProductionManuscriptSort;
}

export function productionManuscriptAttention(
  process: ProductionManuscriptProcess,
): ProductionManuscriptAttention {
  if (process.openRequiredFeedbackCount > 0) {
    return Object.freeze({
      kind: "required-feedback",
      label: `필수 수정 ${process.openRequiredFeedbackCount}개`,
      actionLabel: "필수 수정 확인",
      recommendedView: "feedback",
      level: "danger",
      priority: 0,
    });
  }
  if (process.openReviewCount > 0) {
    return Object.freeze({
      kind: "in-review",
      label: `검수 중 ${process.openReviewCount}건`,
      actionLabel: "검수 확인",
      recommendedView: "feedback",
      level: "warning",
      priority: 1,
    });
  }
  if (!process.approvedRevision) {
    return Object.freeze({
      kind: "missing-final",
      label: "최종본 필요",
      actionLabel: "버전 확인",
      recommendedView: "versions",
      level: "neutral",
      priority: 2,
    });
  }
  return Object.freeze({
    kind: "approved",
    label: "최종본 확정",
    actionLabel: "최종본 확인",
    recommendedView: "versions",
    level: "success",
    priority: 3,
  });
}

function normalizedSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ko-KR");
}

export function productionManuscriptMatchesSearch(
  process: ProductionManuscriptProcess,
  rawQuery: string,
): boolean {
  const query = normalizedSearch(rawQuery);
  if (!query) return true;
  const values = [
    process.artifact.title,
    process.label,
    process.processType,
    process.artifact.kind,
    process.artifact.scope.episodeId ?? "프로젝트 공통",
    process.artifact.scope.seasonId ?? "",
    ...process.revisions.flatMap((revision) => [
      revision.id,
      revision.message ?? "",
      revision.kind,
    ]),
    ...process.reviews.flatMap((review) => [
      review.id,
      review.title,
      review.status,
    ]),
  ];
  return values.some((value) => normalizedSearch(value).includes(query));
}

export function productionManuscriptMatchesFilter(
  process: ProductionManuscriptProcess,
  filter: ProductionManuscriptAttentionFilter,
): boolean {
  switch (filter) {
    case "all": return true;
    case "required-feedback": return process.openRequiredFeedbackCount > 0;
    case "in-review": return process.openReviewCount > 0;
    case "missing-final": return process.approvedRevision === null;
    case "approved": return process.approvedRevision !== null;
  }
}

function processOrder(
  left: ProductionManuscriptProcess,
  right: ProductionManuscriptProcess,
): number {
  return (left.artifact.scope.episodeId ?? "").localeCompare(
    right.artifact.scope.episodeId ?? "",
  )
    || left.label.localeCompare(right.label, "ko")
    || left.artifact.title.localeCompare(right.artifact.title, "ko")
    || left.artifact.id.localeCompare(right.artifact.id);
}

export function queryProductionManuscriptProcesses(
  processes: readonly ProductionManuscriptProcess[],
  input: ProductionManuscriptQuery,
): readonly ProductionManuscriptProcess[] {
  const indexed = new Map(processes.map((process, index) => [process.artifact.id, index]));
  const filtered = processes.filter((process) => (
    productionManuscriptMatchesSearch(process, input.query)
    && productionManuscriptMatchesFilter(process, input.filter)
  ));
  filtered.sort((left, right) => {
    if (input.sort === "attention") {
      return productionManuscriptAttention(left).priority
        - productionManuscriptAttention(right).priority
        || right.latestActivityAt.localeCompare(left.latestActivityAt)
        || processOrder(left, right);
    }
    if (input.sort === "recent") {
      return right.latestActivityAt.localeCompare(left.latestActivityAt)
        || processOrder(left, right);
    }
    return processOrder(left, right)
      || (indexed.get(left.artifact.id) ?? 0) - (indexed.get(right.artifact.id) ?? 0);
  });
  return Object.freeze(filtered);
}


export function nextProductionManuscriptProcess(
  processes: readonly ProductionManuscriptProcess[],
  selectedProcessId: string | null,
  direction: -1 | 1,
): ProductionManuscriptProcess | null {
  if (processes.length === 0) return null;
  const currentIndex = selectedProcessId
    ? processes.findIndex((process) => process.artifact.id === selectedProcessId)
    : -1;
  if (currentIndex < 0) {
    return direction === 1 ? processes[0] : processes[processes.length - 1];
  }
  const nextIndex = (currentIndex + direction + processes.length) % processes.length;
  return processes[nextIndex] ?? null;
}

export function productionManuscriptFilterCounts(
  processes: readonly ProductionManuscriptProcess[],
): ProductionManuscriptFilterCounts {
  return Object.freeze({
    all: processes.length,
    requiredFeedback: processes.filter((process) => process.openRequiredFeedbackCount > 0).length,
    inReview: processes.filter((process) => process.openReviewCount > 0).length,
    missingFinal: processes.filter((process) => !process.approvedRevision).length,
    approved: processes.filter((process) => Boolean(process.approvedRevision)).length,
  });
}

export function isProductionManuscriptFilter(
  value: string | null,
): value is ProductionManuscriptAttentionFilter {
  return value === "all"
    || value === "required-feedback"
    || value === "in-review"
    || value === "missing-final"
    || value === "approved";
}

export function isProductionManuscriptSort(
  value: string | null,
): value is ProductionManuscriptSort {
  return value === "attention" || value === "process" || value === "recent";
}

export function isProductionManuscriptLayout(
  value: string | null,
): value is ProductionManuscriptLayout {
  return value === "cards" || value === "matrix";
}
