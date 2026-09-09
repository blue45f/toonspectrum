/**
 * Studio page organizer — pure search, filtering, range selection, and keyboard navigation.
 *
 * The page strip owns authored state elsewhere. This module only derives a bounded search index
 * and deterministic selection/navigation results so the sidebar, grid, and future page manager
 * can share one interaction contract without importing React or canvas runtimes.
 */

export const STUDIO_PAGE_SEARCH_ELEMENT_LIMIT = 500;
export const STUDIO_PAGE_SEARCH_CHAR_LIMIT = 24_000;
export const STUDIO_PAGE_KEYBOARD_PAGE_STEP = 6;

export type StudioPageOrganizerFilter =
  | "all"
  | "content"
  | "empty"
  | "annotated"
  | "review";

export type StudioPageNavigationKey =
  | "ArrowUp"
  | "ArrowDown"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown";

export interface StudioPageOrganizerElementLike {
  type?: unknown;
  name?: unknown;
  text?: unknown;
  label?: unknown;
  alt?: unknown;
  speaker?: unknown;
}

export interface StudioPageOrganizerReviewLike {
  status?: unknown;
  locked?: unknown;
  assignee?: unknown;
  note?: unknown;
}

export interface StudioPageOrganizerPageLike {
  id: string;
  name?: unknown;
  note?: unknown;
  shotType?: unknown;
  cameraAngle?: unknown;
  elements?: readonly StudioPageOrganizerElementLike[];
  review?: StudioPageOrganizerReviewLike | unknown;
}

export interface StudioPageOrganizerEntry<P extends StudioPageOrganizerPageLike> {
  readonly page: P;
  readonly id: string;
  readonly index: number;
  readonly searchText: string;
  readonly hasContent: boolean;
  readonly hasAnnotation: boolean;
  readonly hasReview: boolean;
}

const REVIEW_STATUS_SEARCH_LABELS: Readonly<Record<string, string>> = {
  draft: "작업 중 draft",
  "needs-review": "검토 요청 needs review",
  "changes-requested": "수정 요청 changes requested",
  approved: "승인 approved",
};

function normalizedSearchText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeStudioPageSearchQuery(value: unknown): string {
  return normalizedSearchText(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function appendBoundedSearchValue(
  parts: string[],
  value: unknown,
  remaining: number,
): number {
  if (remaining <= 0) return 0;
  const normalized = normalizedSearchText(value);
  if (!normalized) return remaining;
  const bounded = normalized.slice(0, remaining);
  parts.push(bounded);
  return Math.max(0, remaining - bounded.length - 1);
}

function reviewSearchValues(value: unknown): {
  readonly values: readonly unknown[];
  readonly hasReview: boolean;
} {
  if (!isRecord(value)) return { values: [], hasReview: false };
  const status = typeof value.status === "string" ? value.status : "";
  const assignee = typeof value.assignee === "string" ? value.assignee.trim() : "";
  const note = typeof value.note === "string" ? value.note.trim() : "";
  const locked = value.locked === true;
  const hasReview = status !== "" || assignee !== "" || note !== "" || locked;
  return {
    values: [status, REVIEW_STATUS_SEARCH_LABELS[status], assignee, note, locked ? "잠금 locked" : ""],
    hasReview,
  };
}

export function buildStudioPageOrganizerEntries<P extends StudioPageOrganizerPageLike>(
  pages: readonly P[],
): StudioPageOrganizerEntry<P>[] {
  return pages.map((page, index) => {
    const number = index + 1;
    const elements = Array.isArray(page.elements) ? page.elements : [];
    const note = normalizedSearchText(page.note);
    const shotType = normalizedSearchText(page.shotType);
    const cameraAngle = normalizedSearchText(page.cameraAngle);
    const review = reviewSearchValues(page.review);
    const parts: string[] = [];
    let remaining = STUDIO_PAGE_SEARCH_CHAR_LIMIT;

    remaining = appendBoundedSearchValue(
      parts,
      `${number}페이지 ${number} 페이지 page ${number} p${number} ${number}장면 ${number}컷`,
      remaining,
    );
    for (const value of [page.name, page.note, page.shotType, page.cameraAngle, ...review.values]) {
      remaining = appendBoundedSearchValue(parts, value, remaining);
    }

    const limit = Math.min(elements.length, STUDIO_PAGE_SEARCH_ELEMENT_LIMIT);
    for (let elementIndex = 0; elementIndex < limit && remaining > 0; elementIndex += 1) {
      const element = elements[elementIndex];
      if (!element || typeof element !== "object") continue;
      for (const value of [
        element.type,
        element.name,
        element.text,
        element.label,
        element.alt,
        element.speaker,
      ]) {
        remaining = appendBoundedSearchValue(parts, value, remaining);
        if (remaining <= 0) break;
      }
    }

    return {
      page,
      id: page.id,
      index,
      searchText: parts.join(" "),
      hasContent: elements.length > 0,
      hasAnnotation: note !== "" || shotType !== "" || cameraAngle !== "",
      hasReview: review.hasReview,
    };
  });
}

export function filterStudioPageOrganizerEntries<P extends StudioPageOrganizerPageLike>(
  entries: readonly StudioPageOrganizerEntry<P>[],
  query: unknown,
  filter: StudioPageOrganizerFilter,
): StudioPageOrganizerEntry<P>[] {
  const tokens = normalizeStudioPageSearchQuery(query).split(" ").filter(Boolean);
  return entries.filter((entry) => {
    const filterMatches = (() => {
      switch (filter) {
        case "content":
          return entry.hasContent;
        case "empty":
          return !entry.hasContent;
        case "annotated":
          return entry.hasAnnotation;
        case "review":
          return entry.hasReview;
        case "all":
        default:
          return true;
      }
    })();
    return filterMatches && tokens.every((token) => entry.searchText.includes(token));
  });
}

function uniqueOrderedPageIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

export function resolveStudioPageRangeSelection(
  orderedPageIds: readonly string[],
  anchorPageId: string | null | undefined,
  targetPageId: string,
  options: {
    readonly additive?: boolean;
    readonly currentSelection?: readonly string[];
  } = {},
): string[] {
  const ordered = uniqueOrderedPageIds(orderedPageIds);
  const targetIndex = ordered.indexOf(targetPageId);
  if (targetIndex < 0) return [];
  const anchorIndex = Math.max(0, ordered.indexOf(anchorPageId ?? targetPageId));
  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  const selected = new Set(options.additive ? options.currentSelection ?? [] : []);
  for (let index = start; index <= end; index += 1) selected.add(ordered[index]!);
  return ordered.filter((id) => selected.has(id));
}

export function isStudioPageNavigationKey(value: string): value is StudioPageNavigationKey {
  return (
    value === "ArrowUp"
    || value === "ArrowDown"
    || value === "Home"
    || value === "End"
    || value === "PageUp"
    || value === "PageDown"
  );
}

export function resolveStudioPageKeyboardTarget(
  orderedPageIds: readonly string[],
  currentPageId: string | null | undefined,
  key: StudioPageNavigationKey,
  pageStep = STUDIO_PAGE_KEYBOARD_PAGE_STEP,
): string | null {
  const ordered = uniqueOrderedPageIds(orderedPageIds);
  if (ordered.length === 0) return null;
  const safeStep = Number.isFinite(pageStep) ? Math.max(1, Math.trunc(pageStep)) : 1;
  let index = ordered.indexOf(currentPageId ?? "");
  if (index < 0) {
    index = key === "End" || key === "ArrowUp" || key === "PageUp"
      ? ordered.length - 1
      : 0;
  }
  switch (key) {
    case "ArrowUp":
      index -= 1;
      break;
    case "ArrowDown":
      index += 1;
      break;
    case "Home":
      index = 0;
      break;
    case "End":
      index = ordered.length - 1;
      break;
    case "PageUp":
      index -= safeStep;
      break;
    case "PageDown":
      index += safeStep;
      break;
  }
  return ordered[Math.max(0, Math.min(ordered.length - 1, index))] ?? null;
}
