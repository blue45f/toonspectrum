export const PAGE_REVIEW_STATUSES = ["draft", "needs-review", "changes-requested", "approved"] as const;

export type PageReviewStatus = (typeof PAGE_REVIEW_STATUSES)[number];

export const PAGE_REVIEW_STATUS_LABELS: Record<PageReviewStatus, string> = {
  draft: "작업 중",
  "needs-review": "검토 요청",
  "changes-requested": "수정 요청",
  approved: "승인",
};

export const PAGE_REVIEW_ASSIGNEE_MAX_LENGTH = 80;
export const PAGE_REVIEW_NOTE_MAX_LENGTH = 2_000;

export interface PageReviewState {
  status: PageReviewStatus;
  locked: boolean;
  assignee?: string;
  note?: string;
  updatedAt?: string;
}

export type PageReviewPatch = Partial<Omit<PageReviewState, "updatedAt">>;

export type PageReviewBulkOperation =
  | { type: "status"; status: PageReviewStatus }
  | { type: "assignee"; assignee: string }
  | { type: "lock"; locked: boolean };

export interface PageReviewBulkPatchPlanItem {
  pageId: string;
  patch: PageReviewPatch;
}

export const DEFAULT_PAGE_REVIEW_STATE: PageReviewState = { status: "draft", locked: false };

export function normalizePageReviewState(value: unknown): PageReviewState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_PAGE_REVIEW_STATE };
  const record = value as Record<string, unknown>;
  const status = PAGE_REVIEW_STATUSES.includes(record.status as PageReviewStatus)
    ? (record.status as PageReviewStatus)
    : "draft";
  const assignee = typeof record.assignee === "string"
    ? record.assignee.trim().slice(0, PAGE_REVIEW_ASSIGNEE_MAX_LENGTH)
    : "";
  const note = typeof record.note === "string"
    ? record.note.trim().slice(0, PAGE_REVIEW_NOTE_MAX_LENGTH)
    : "";
  const updatedAt =
    typeof record.updatedAt === "string" && Number.isFinite(Date.parse(record.updatedAt))
      ? record.updatedAt
      : undefined;
  return {
    status,
    locked: record.locked === true,
    ...(assignee ? { assignee } : {}),
    ...(note ? { note } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
}

export function patchPageReviewState(
  value: unknown,
  patch: PageReviewPatch,
  now = new Date()
): PageReviewState {
  return normalizePageReviewState({
    ...normalizePageReviewState(value),
    ...patch,
    updatedAt: now.toISOString(),
  });
}

/**
 * Builds a deterministic, minimal patch plan for multi-page review operations.
 *
 * - Page order follows the document, never the selection interaction order.
 * - Stale or duplicate selection IDs are ignored.
 * - Approving a page also locks it, matching the single-page review control.
 * - Existing values are skipped so batch operations do not create empty history entries.
 */
export function buildPageReviewBulkPatchPlan<T extends { id: string; review?: unknown }>(
  pages: readonly T[],
  selectedPageIds: Iterable<string>,
  operation: PageReviewBulkOperation
): PageReviewBulkPatchPlanItem[] {
  const selectedIds = new Set(selectedPageIds);
  const plan: PageReviewBulkPatchPlanItem[] = [];

  for (const page of pages) {
    if (!selectedIds.has(page.id)) continue;
    const review = normalizePageReviewState(page.review);

    if (operation.type === "status") {
      const patch: PageReviewPatch = {};
      if (review.status !== operation.status) patch.status = operation.status;
      if (operation.status === "approved" && !review.locked) patch.locked = true;
      if (Object.keys(patch).length > 0) plan.push({ pageId: page.id, patch });
      continue;
    }

    if (operation.type === "assignee") {
      const assignee = operation.assignee
        .trim()
        .slice(0, PAGE_REVIEW_ASSIGNEE_MAX_LENGTH);
      if ((review.assignee ?? "") !== assignee) {
        plan.push({ pageId: page.id, patch: { assignee } });
      }
      continue;
    }

    if (review.locked !== operation.locked) {
      plan.push({ pageId: page.id, patch: { locked: operation.locked } });
    }
  }

  return plan;
}

export function pageReviewStateIncludesPatch(
  value: unknown,
  patch: PageReviewPatch
): boolean {
  const current = normalizePageReviewState(value);
  const expected = normalizePageReviewState({ ...current, ...patch });
  const has = (key: keyof PageReviewPatch) => Object.prototype.hasOwnProperty.call(patch, key);

  if (has("status") && current.status !== expected.status) return false;
  if (has("locked") && current.locked !== expected.locked) return false;
  if (has("assignee") && (current.assignee ?? "") !== (expected.assignee ?? "")) return false;
  if (has("note") && (current.note ?? "") !== (expected.note ?? "")) return false;
  return true;
}

export function isPageReviewLocked(value: unknown): boolean {
  return normalizePageReviewState(value).locked;
}

/**
 * Finds the first locked page whose object was replaced or removed by a proposed page-list
 * transition. Studio page commands preserve the object identity of untouched pages, so this
 * catches content/meta deletion and replacement while still allowing harmless list reordering
 * and insertion beside a locked page.
 */
export function findChangedLockedPageId<T extends { id: string; review?: unknown }>(
  currentPages: readonly T[],
  nextPages: readonly T[]
): string | null {
  const nextById = new Map(nextPages.map((page) => [page.id, page]));
  return currentPages.find(
    (page) => isPageReviewLocked(page.review) && nextById.get(page.id) !== page
  )?.id ?? null;
}
